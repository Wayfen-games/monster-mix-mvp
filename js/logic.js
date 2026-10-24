// 게임 규칙 (화면과 분리, v2). 브라우저와 Node 양쪽에서 돈다.
(function (MM) {
  var B = function () { return MM.BALANCE; };
  var tv = function (arr, t) { return MM.tierVal(arr, t); };
  var R = function (rng) { return rng || Math.random; };

  // ================= 상태 =================
  MM.SAVE_VERSION = 2;

  MM.newState = function (now) {
    now = now || Date.now();
    return {
      version: MM.SAVE_VERSION, gold: B().START_GOLD, nextId: 1,
      monsters: [], souls: {}, soulSeen: {}, party: [], dex: {}, cleared: {},
      dungeon: { cleared: {}, day: '', used: 0 },
      autoRepeat: { day: '', used: 0 },
      offline: { stage: null, lastSeen: now },
      tutorial: { step: 0, done: false },
      records: [],
      settings: { autoBattle: false, recordOn: true, fastTest: false },
      stats: { fusionTries: 0, fusionSuccess: 0, battlesWon: 0, battlesLost: 0, startedAt: now }
    };
  };

  MM.getMonster = function (s, id) {
    for (var i = 0; i < s.monsters.length; i++) if (s.monsters[i].id === id) return s.monsters[i];
    return null;
  };
  MM.removeMonster = function (s, id) {
    s.monsters = s.monsters.filter(function (m) { return m.id !== id; });
    s.party = s.party.filter(function (pid) { return pid !== id; });
  };

  // ================= 소울 =================
  // 소울 추가 (상한 적용). 버려진 개수를 돌려준다.
  MM.addSouls = function (s, key, n) {
    var have = s.souls[key] || 0, cap = B().SOUL_CAP;
    var added = Math.max(0, Math.min(n, cap - have));
    s.souls[key] = have + added;
    var first = added > 0 && !s.soulSeen[key];
    if (added > 0) s.soulSeen[key] = true;
    return { added: added, wasted: n - added, first: first };
  };

  // 도감 등록. 처음이면 그 몬스터 소울 1개 보상.
  MM.registerDex = function (s, el, tier) {
    if (tier > B().MAX_TIER) return null;
    var key = MM.speciesKey(el, tier);
    if (s.dex[key]) return null;
    s.dex[key] = true;
    var r = MM.addSouls(s, key, B().FIRST_DEX_SOUL);
    return { key: key, soul: r.added };
  };

  MM.addMonster = function (s, el, tier, level) {
    var m = { id: s.nextId++, el: el, tier: tier, level: level || 1, exp: 0, stack: 0 };
    s.monsters.push(m);
    m._dex = MM.registerDex(s, el, tier);
    return m;
  };

  MM.canSummon = function (s, key) { return (s.souls[key] || 0) >= B().SOULS_PER_SUMMON; };
  MM.summonLevel = function (tier) { return Math.round(tv(B().SUMMON_LEVEL, tier)); };

  MM.summon = function (s, el, tier) {
    var key = MM.speciesKey(el, tier);
    if (!MM.canSummon(s, key)) return null;
    s.souls[key] -= B().SOULS_PER_SUMMON;
    var m = MM.addMonster(s, el, tier, Math.min(B().MAX_LEVEL, MM.summonLevel(tier)));
    var dex = m._dex; delete m._dex;
    return { monster: m, dex: dex };
  };

  // ================= 분해 =================
  MM.canDecomposeMonster = function (s, m) {
    if (!m) return '몬스터가 없어요';
    if (s.party.indexOf(m.id) >= 0) return '파티에 있는 몬스터는 분해할 수 없어요';
    if (s.monsters.length <= 3) return '몬스터가 3마리 이하일 때는 분해할 수 없어요';
    return null;
  };
  MM.decomposeMonster = function (s, id) {
    var m = MM.getMonster(s, id), why = MM.canDecomposeMonster(s, m);
    if (why) return { error: why };
    MM.removeMonster(s, id);
    var key = MM.speciesKey(m.el, m.tier);
    var r = MM.addSouls(s, key, B().DECOMPOSE_MONSTER_SOULS);
    return { key: key, added: r.added, wasted: r.wasted };
  };
  MM.decomposeSoul = function (s, el, tier, count) {
    count = count || 1;
    var key = MM.speciesKey(el, tier);
    if (tier <= 1) return { error: '1단계 소울은 분해할 수 없어요' };
    if ((s.souls[key] || 0) < count) return { error: '소울이 부족해요' };
    s.souls[key] -= count;
    var low = MM.speciesKey(el, tier - 1);
    var r = MM.addSouls(s, low, B().DECOMPOSE_SOUL_SOULS * count);
    return { key: low, added: r.added, wasted: r.wasted };
  };

  // ================= 능력치 =================
  MM.tierMult = function (tier) { return Math.pow(B().TIER_GROWTH, tier - 1); };
  MM.levelMult = function (level) { return 1 + B().LEVEL_GROWTH * (level - 1); };

  MM.calcStats = function (el, tier, level, extraMult) {
    var b = B(), base = b.BASE_STATS, mod = b.ELEMENT_STAT_MOD[el];
    var mult = MM.tierMult(tier) * MM.levelMult(level) * (extraMult || 1);
    return {
      hp: Math.round(base.hp * mult * mod.hp),
      atk: Math.round(base.atk * mult * mod.atk),
      def: Math.round(base.def * mult * mod.def),
      spd: Math.round(base.spd * (1 + 0.03 * (tier - 1) + 0.005 * (level - 1)) * mod.spd * 10) / 10,
      crit: b.CRIT_BASE + b.CRIT_PER_TIER * tier
    };
  };

  MM.expToNext = function (level) { return Math.round(B().EXP_A * Math.pow(B().EXP_R, level - 1)); };
  MM.winExp = function (stageTier) { return Math.round(B().EXP_WIN * Math.pow(B().EXP_WIN_GROWTH, stageTier - 1)); };

  MM.giveExp = function (m, amount) {
    var ups = 0, max = B().MAX_LEVEL;
    if (m.level >= max) return 0;
    m.exp += amount;
    while (m.level < max && m.exp >= MM.expToNext(m.level)) {
      m.exp -= MM.expToNext(m.level);
      m.level++; ups++;
    }
    if (m.level >= max) m.exp = 0;
    return ups;
  };

  // 서로 다른 속성 3마리면 파티 보너스
  MM.partyHasBonus = function (mons) {
    if (mons.length < 3) return false;
    var els = {};
    mons.forEach(function (m) { els[m.el] = true; });
    return Object.keys(els).length === mons.length;
  };

  // ================= 합성 =================
  MM.stackBonus = function (k) {
    var b = B();
    return k * b.STACK_FIRST_BONUS + b.STACK_BONUS_GROWTH * k * (k - 1) / 2;
  };
  MM.successRate = function (mainTier, stack) {
    var b = B();
    if (stack >= b.STACK_GUARANTEE) return 1;
    var r = tv(b.BASE_SUCCESS, mainTier) + MM.stackBonus(stack);
    return Math.min(1, Math.round(r * 1000) / 1000);
  };
  MM.subTierFor = function (mainTier) { return mainTier === 1 ? 1 : mainTier - 1; };
  MM.fuseLevelReq = function (tier) { return Math.round(tv(B().FUSE_LEVEL_REQ, tier)); };
  MM.canBeMain = function (m) { return m.tier < B().MAX_TIER; };
  MM.elementCompatible = function (mainEl, subEl) { return MM.partnersOf(mainEl).indexOf(subEl) >= 0; };

  // 짝이 맞는지 (레벨·개수 조건 제외)
  MM.isPair = function (main, sub) {
    if (!main || !sub || main.id === sub.id) return false;
    if (!MM.canBeMain(main)) return false;
    if (sub.tier !== MM.subTierFor(main.tier)) return false;
    return MM.elementCompatible(main.el, sub.el);
  };

  MM.fusionCost = function (main, sub) {
    var b = B();
    var gold = Math.round(tv(b.FUSION_GOLD, main.tier) * (1 + b.FUSION_GOLD_STACK_UP * main.stack) / 10) * 10;
    if (main.tier === 1) return { gold: gold, soulTier: null, soulOptions: [] };
    var opts = [main.el];
    if (sub && sub.el !== main.el) opts.push(sub.el);
    return { gold: gold, soulTier: main.tier - 1, soulOptions: opts };
  };

  // 합성 가능 여부와 막힌 이유들
  MM.fusionCheck = function (s, main, sub, soulEl) {
    var reasons = [];
    if (!MM.isPair(main, sub)) return { ok: false, reasons: ['이 두 몬스터는 합성할 수 없어요'] };
    if (s.monsters.length < B().MIN_MONSTERS_TO_FUSE) reasons.push('몬스터가 4마리 이상일 때 합성할 수 있어요');
    var req = MM.fuseLevelReq(main.tier);
    if (main.level < req) reasons.push(MM.speciesName(main.el, main.tier) + ' Lv ' + req + ' 필요 (현재 ' + main.level + ')');
    if (sub.level < req) reasons.push(MM.speciesName(sub.el, sub.tier) + ' Lv ' + req + ' 필요 (현재 ' + sub.level + ')');
    var cost = MM.fusionCost(main, sub);
    if (s.gold < cost.gold) reasons.push(MM.josa('골드', '이', '가') + ' 부족해요');
    if (cost.soulTier) {
      var el = cost.soulOptions.indexOf(soulEl) >= 0 ? soulEl : cost.soulOptions[0];
      var key = MM.speciesKey(el, cost.soulTier);
      if ((s.souls[key] || 0) < 1) reasons.push(MM.josa(MM.speciesName(el, cost.soulTier) + ' 소울', '이', '가') + ' 필요해요');
    }
    return { ok: reasons.length === 0, reasons: reasons, cost: cost, req: req };
  };

  // 합성 시도. opts.force = 튜토리얼 확정 성공
  MM.attemptFusion = function (s, mainId, subId, soulEl, rng, opts) {
    opts = opts || {};
    var main = MM.getMonster(s, mainId), sub = MM.getMonster(s, subId);
    var chk = MM.fusionCheck(s, main, sub, soulEl);
    if (!chk.ok) return { error: chk.reasons[0], reasons: chk.reasons };
    var cost = chk.cost;
    s.gold -= cost.gold;
    var soulKey = null;
    if (cost.soulTier) {
      if (cost.soulOptions.indexOf(soulEl) < 0) soulEl = cost.soulOptions[0];
      soulKey = MM.speciesKey(soulEl, cost.soulTier);
      s.souls[soulKey]--;
    }
    s.stats.fusionTries++;
    var rate = MM.successRate(main.tier, main.stack);
    var success = opts.force || R(rng)() < rate;
    if (success) {
      var el = main.el, tier = main.tier + 1;
      var level = Math.floor((main.level + sub.level) / 2);
      var slot = s.party.indexOf(main.id) >= 0 ? s.party.indexOf(main.id) : s.party.indexOf(sub.id);
      var spent = main.stack;
      MM.removeMonster(s, main.id);
      MM.removeMonster(s, sub.id);
      var made = MM.addMonster(s, el, tier, level);
      var dex = made._dex; delete made._dex;
      if (slot >= 0) s.party.splice(Math.min(slot, s.party.length), 0, made.id);
      s.party = s.party.slice(0, 3);
      s.stats.fusionSuccess++;
      MM.addRecord(s, { type: 'fusion', el: el, tier: tier, rate: rate, spent: spent, first: !!dex });
      return { success: true, rate: rate, monster: made, dex: dex, spentStack: spent, cost: cost };
    }
    main.stack++;
    return { success: false, rate: rate, stack: main.stack, nextRate: MM.successRate(main.tier, main.stack), cost: cost };
  };

  // ================= 스테이지·던전 구성 =================
  function pickOthers(exclude, n, rng) {
    var pool = MM.RING.filter(function (e) { return exclude.indexOf(e) < 0; });
    var out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(R(rng)() * pool.length), 1)[0]);
    return out;
  }

  // 스테이지: n단계 = (n+1)단계 보스 + n단계 쫄 2 (쫄은 매 판 랜덤, 서로 다르고 보스와도 다른 속성)
  // 맨 위 단계는 같은 단계 3마리. 보스는 가운데.
  MM.stageEnemies = function (el, tier, rng) {
    var b = B(), top = tier >= b.MAX_TIER;
    var bossTier = top ? tier : tier + 1;
    var lv = Math.round(tv(b.STAGE_ENEMY_LEVEL, tier)), mult = tv(b.STAGE_ENEMY_MULT, tier);
    var mins = pickOthers([el], 2, rng);
    return [
      { el: mins[0], tier: tier, level: lv, mult: mult },
      { el: el, tier: bossTier, level: lv, mult: mult, boss: true },
      { el: mins[1], tier: tier, level: lv, mult: mult }
    ];
  };

  // 던전: n단계 = n단계 3마리 (확정). els = [속성] (평일) 또는 서로 다른 3속성 (주말)
  // 적마다 1단계 소울은 반드시 1번 떨어짐 (개수는 1~3개 분포)
  MM.dungeonEnemies = function (els, tier) {
    var b = B();
    var lv = Math.round(tv(b.DUNGEON_ENEMY_LEVEL, tier)), mult = tv(b.DUNGEON_ENEMY_MULT, tier);
    var list = els.length === 1 ? [els[0], els[0], els[0]] : els.slice(0, 3);
    return list.map(function (e, i) { return { el: e, tier: tier, level: lv, mult: mult, boss: i === 1, guaranteeT1: true }; });
  };

  MM.dungeonElementFor = function (ms) { return B().DUNGEON_DAY_ELEMENT[MM.weekday(ms)]; };
  MM.dungeonUnlocked = function (s, tier) { return tier === 1 || !!s.dungeon.cleared[tier - 1]; };
  MM.refreshDaily = function (s, now) {
    var d = MM.dayKey(now || Date.now());
    if (s.dungeon.day !== d) { s.dungeon.day = d; s.dungeon.used = 0; }
    if (s.autoRepeat.day !== d) { s.autoRepeat.day = d; s.autoRepeat.used = 0; }
  };
  MM.dungeonLeft = function (s, now) { MM.refreshDaily(s, now); return Math.max(0, B().DUNGEON_DAILY - s.dungeon.used); };
  MM.autoLeft = function (s, now) { MM.refreshDaily(s, now); return Math.max(0, B().AUTO_REPEAT_DAILY - s.autoRepeat.used); };

  // ================= 드랍 =================
  MM.rollSoulCount = function (rng) {
    var d = B().SOUL_COUNT_DIST, r = R(rng)(), acc = 0;
    for (var i = 0; i < d.length; i++) { acc += d[i]; if (r < acc) return i + 1; }
    return d.length;
  };
  MM.meanSoulCount = function () {
    return B().SOUL_COUNT_DIST.reduce(function (a, p, i) { return a + p * (i + 1); }, 0);
  };
  // k단계 소울의 적 1마리당 평균 개수
  MM.soulDropAvg = function (k) { return tv(B().SOUL_DROP_AVG, k); };

  // 적 목록에서 소울 굴리기. mult = 배수(던전 10배, 빠른 테스트 등). 평균이 유지되게 굴림 횟수를 늘린다.
  MM.rollDrops = function (enemies, rng, mult) {
    mult = mult || 1;
    var got = {}, mean = MM.meanSoulCount(), max = B().MAX_TIER;
    enemies.forEach(function (e) {
      var top = Math.min(e.tier, max);
      for (var k = 1; k <= top; k++) {
        if (k === 1 && e.guaranteeT1) {
          var k1 = MM.speciesKey(e.el, 1);
          got[k1] = (got[k1] || 0) + MM.rollSoulCount(rng);
          continue;
        }
        var p = MM.soulDropAvg(k) / mean * mult * (e.dropMult || 1);
        var rolls = Math.max(1, Math.ceil(p));
        var pp = p / rolls;
        for (var r = 0; r < rolls; r++) {
          if (R(rng)() < pp) {
            var key = MM.speciesKey(e.el, k);
            got[key] = (got[key] || 0) + MM.rollSoulCount(rng);
          }
        }
      }
    });
    return got;
  };

  // 드랍을 상태에 넣고 요약을 돌려준다
  MM.applyDrops = function (s, drops) {
    var list = [];
    Object.keys(drops).forEach(function (key) {
      var r = MM.addSouls(s, key, drops[key]), p = MM.parseKey(key);
      list.push({ key: key, el: p.el, tier: p.tier, count: drops[key], added: r.added, wasted: r.wasted, first: r.first });
      if (p.tier >= B().RECORD_MIN_SOUL_TIER && r.added > 0) {
        MM.addRecord(s, { type: 'soul', el: p.el, tier: p.tier, count: r.added, first: r.first });
      }
    });
    list.sort(function (a, b) { return b.tier - a.tier || b.count - a.count; });
    return list;
  };

  function partyExp(s, amount) {
    var ups = [];
    s.party.forEach(function (id) {
      var m = MM.getMonster(s, id);
      if (!m) return;
      var n = MM.giveExp(m, amount);
      if (n) ups.push({ id: m.id, name: MM.speciesName(m.el, m.tier), level: m.level });
    });
    return ups;
  }

  // 스테이지 승리 보상
  MM.grantStageWin = function (s, el, tier, enemies, rng) {
    var b = B(), mult = s.settings.fastTest ? b.FAST_TEST_DROP_MULT : 1;
    var drops = MM.applyDrops(s, MM.rollDrops(enemies, rng, mult));
    var gold = Math.round(tv(b.CLEAR_GOLD, tier));
    s.gold += gold;
    var exp = MM.winExp(tier);
    var ups = partyExp(s, exp);
    var key = MM.speciesKey(el, tier);
    s.cleared[key] = (s.cleared[key] || 0) + 1;
    s.stats.battlesWon++;
    return { drops: drops, gold: gold, exp: exp, levelUps: ups };
  };

  // 던전 승리 보상 (소탕도 같은 보상). 맨 위 단계 던전은 1~5단계 소울 조금 더 (덤).
  MM.grantDungeonWin = function (s, tier, enemies, rng, opts) {
    opts = opts || {};
    var b = B(), mult = b.DUNGEON_DROP_MULT * (s.settings.fastTest ? b.FAST_TEST_DROP_MULT : 1);
    if (tier >= b.MAX_TIER && !opts.noTopBonus) mult *= b.DUNGEON_TOP_BONUS;
    var drops = MM.applyDrops(s, MM.rollDrops(enemies, rng, mult));
    var gold = Math.round(tv(b.CLEAR_GOLD, tier) * b.DUNGEON_GOLD_MULT);
    s.gold += gold;
    var exp = MM.winExp(tier);
    var ups = partyExp(s, exp);
    s.dungeon.cleared[tier] = true;
    s.stats.battlesWon++;
    return { drops: drops, gold: gold, exp: exp, levelUps: ups };
  };

  // 던전 입장권 사용 (전투 시작 또는 소탕 시)
  MM.useDungeonEntry = function (s, now) {
    if (MM.dungeonLeft(s, now) <= 0) return false;
    s.dungeon.used++;
    return true;
  };

  // ================= 오프라인 보상 =================
  MM.offlineStageValid = function (s) {
    var st = s.offline.stage;
    return !!(st && s.cleared[MM.speciesKey(st.el, st.tier)]);
  };
  // 마지막 접속 이후 쌓인 보상 계산·지급. 짧으면 null.
  MM.claimOffline = function (s, now, rng) {
    var b = B(), last = s.offline.lastSeen || now;
    s.offline.lastSeen = now;
    var elapsed = Math.min(now - last, b.OFFLINE_MAX_HOURS * 3600 * 1000);
    if (elapsed < b.OFFLINE_MIN_MINUTES * 60 * 1000 || !MM.offlineStageValid(s)) return null;
    var st = s.offline.stage;
    var runsEq = elapsed / 1000 / b.AVG_RUN_SEC * b.OFFLINE_RATE;
    var runs = Math.floor(runsEq) + (R(rng)() < runsEq % 1 ? 1 : 0);
    var all = {}, gold = 0;
    for (var i = 0; i < runs; i++) {
      var d = MM.rollDrops(MM.stageEnemies(st.el, st.tier, rng), rng, 1);
      Object.keys(d).forEach(function (k) { all[k] = (all[k] || 0) + d[k]; });
      gold += Math.round(tv(b.CLEAR_GOLD, st.tier));
    }
    var drops = MM.applyDrops(s, all);
    s.gold += gold;
    var ups = partyExp(s, MM.winExp(st.tier) * runs);
    return { hours: elapsed / 3600000, capped: now - last > b.OFFLINE_MAX_HOURS * 3600 * 1000, runs: runs, drops: drops, gold: gold, levelUps: ups, stage: st };
  };

  // ================= 기록 =================
  MM.addRecord = function (s, rec) {
    if (!s.settings || s.settings.recordOn === false) return;
    if (rec.type === 'fusion' && rec.tier < B().RECORD_MIN_SOUL_TIER && !rec.first) return;
    rec.t = Date.now();
    s.records.unshift(rec);
    if (s.records.length > B().RECORD_MAX) s.records.length = B().RECORD_MAX;
  };

  // ================= 전투 =================
  MM.makeUnit = function (src, side, uid, bonus) {
    var st = MM.calcStats(src.el, src.tier, src.level, (src.mult || 1) * (bonus ? 1 + B().PARTY_BONUS : 1));
    return {
      uid: uid, side: side, el: src.el, tier: src.tier, level: src.level, boss: !!src.boss,
      name: MM.speciesName(src.el, src.tier), monsterId: src.id || null,
      maxHp: st.hp, hp: st.hp, atk: st.atk, def: st.def, spd: st.spd, crit: st.crit
    };
  };

  MM.createBattle = function (partyMonsters, enemies, rng) {
    var units = [], uid = 0, bonus = MM.partyHasBonus(partyMonsters);
    partyMonsters.forEach(function (m) { units.push(MM.makeUnit(m, 'p', uid++, bonus)); });
    enemies.forEach(function (e) { units.push(MM.makeUnit(e, 'e', uid++, false)); });
    var bt = { units: units, round: 0, queue: [], log: [], result: null, partyBonus: bonus };
    MM.newRound(bt, rng);
    return bt;
  };

  MM.alive = function (bt, side) {
    return bt.units.filter(function (u) { return u.hp > 0 && (!side || u.side === side); });
  };

  MM.newRound = function (bt, rng) {
    bt.round++;
    if (bt.round > B().MAX_ROUNDS) { bt.result = 'lose'; return; }
    bt.queue = MM.alive(bt).map(function (u) { return { uid: u.uid, r: u.spd + R(rng)() * 0.01 }; })
      .sort(function (a, b) { return b.r - a.r; })
      .map(function (x) { return x.uid; });
  };

  MM.currentActor = function (bt, rng) {
    while (!bt.result) {
      while (bt.queue.length && bt.units[bt.queue[0]].hp <= 0) bt.queue.shift();
      if (bt.queue.length) return bt.units[bt.queue[0]];
      MM.newRound(bt, rng);
    }
    return null;
  };

  MM.elementMult = function (atkEl, defEl) {
    if (MM.beats(atkEl, defEl)) return B().ELEMENT_ADV_MULT;
    if (MM.beats(defEl, atkEl) && !MM.beats(atkEl, defEl)) return B().ELEMENT_DISADV_MULT;
    return 1;
  };
  // 어둠↔빛은 서로 유리 (위에서 beats가 먼저 걸려 1.3)

  MM.calcDamage = function (att, def, rng) {
    var raw = att.atk * att.atk / (att.atk + def.def);
    var spread = 1 + (R(rng)() * 2 - 1) * B().DAMAGE_RANDOM;
    var crit = R(rng)() < att.crit;
    var dmg = Math.max(1, Math.round(raw * MM.elementMult(att.el, def.el) * spread * (crit ? B().CRIT_MULT : 1)));
    return { dmg: dmg, crit: crit };
  };

  MM.autoTarget = function (bt, actor, rng) {
    if (actor.side === 'p') {
      // 유리한 상성 우선, 그다음 남은 체력이 적은 적
      return MM.alive(bt, 'e').sort(function (a, b) {
        return MM.elementMult(actor.el, b.el) - MM.elementMult(actor.el, a.el) || a.hp - b.hp;
      })[0];
    }
    var ps = MM.alive(bt, 'p');
    return ps[Math.floor(R(rng)() * ps.length)];
  };

  MM.act = function (bt, targetUid, rng) {
    var actor = MM.currentActor(bt, rng);
    if (!actor) return null;
    var target = targetUid == null ? MM.autoTarget(bt, actor, rng) : bt.units[targetUid];
    if (!target || target.hp <= 0 || target.side === actor.side) target = MM.autoTarget(bt, actor, rng);
    var d = MM.calcDamage(actor, target, rng);
    target.hp = Math.max(0, target.hp - d.dmg);
    var ev = { actor: actor.uid, target: target.uid, dmg: d.dmg, crit: d.crit, ko: target.hp === 0, mult: MM.elementMult(actor.el, target.el) };
    bt.log.push(ev);
    bt.queue.shift();
    if (!MM.alive(bt, 'e').length) bt.result = 'win';
    else if (!MM.alive(bt, 'p').length) bt.result = 'lose';
    return ev;
  };

  MM.simulateBattle = function (partyMonsters, enemies, rng) {
    var bt = MM.createBattle(partyMonsters, enemies, rng);
    while (!bt.result) MM.act(bt, null, rng);
    return bt;
  };

  // 재현 가능한 난수 (테스트·시뮬레이션용)
  MM.seededRng = function (seed) {
    var x = seed >>> 0 || 1;
    return function () {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  };

  // ================= 튜토리얼 =================
  // 1) 서로 다른 속성 3마리 선택 → 지급
  MM.tutorialPickStarters = function (s, els) {
    if (els.length !== 3 || new Set(els).size !== 3) return false;
    els.forEach(function (el) {
      var m = MM.addMonster(s, el, 1, 1);
      delete m._dex;
      s.party.push(m.id);
    });
    s.tutorial.starters = els.slice();
    s.tutorial.step = 1;
    return true;
  };
  // 튜토리얼 전투 상대 (아주 쉬움)
  MM.tutorialEnemies = function (els) {
    return [{ el: els[0], tier: 1, level: 1, mult: 0.5 }, { el: els[1], tier: 1, level: 1, mult: 0.5, boss: true }, { el: els[2], tier: 1, level: 1, mult: 0.5 }];
  };
  // 튜토리얼 전투 보상: 파티를 튜토리얼 레벨로, 소울 조금
  MM.tutorialBattleReward = function (s) {
    var lv = B().TUTORIAL_LEVEL;
    s.party.forEach(function (id) { var m = MM.getMonster(s, id); if (m && m.level < lv) { m.level = lv; m.exp = 0; } });
    s.stats.battlesWon++;
    s.tutorial.step = 2;
  };
  // 3) 남은 2속성 중 1마리 받기
  MM.tutorialFourthOptions = function (s) {
    return MM.RING.filter(function (el) { return s.tutorial.starters.indexOf(el) < 0; });
  };
  MM.tutorialPickFourth = function (s, el) {
    if (MM.tutorialFourthOptions(s).indexOf(el) < 0) return null;
    var m = MM.addMonster(s, el, 1, B().TUTORIAL_LEVEL);
    delete m._dex;
    s.tutorial.step = 4;
    return m;
  };
  MM.finishTutorial = function (s) { s.tutorial.done = true; s.tutorial.step = 99; };
})((typeof globalThis !== 'undefined' ? globalThis : window).MM);
