// 게임 규칙 (화면과 분리). 브라우저와 Node 양쪽에서 돈다.
(function (MM) {
  var B = function () { return MM.BALANCE; };

  // ---------------- 상태 ----------------
  MM.newState = function () {
    var s = {
      version: 1, gold: B().START_GOLD, nextId: 1,
      monsters: [], souls: {}, party: [], dex: {}, cleared: {},
      settings: { fastTest: false, autoBattle: false },
      stats: { fusionTries: 0, fusionSuccess: 0, battlesWon: 0, battlesLost: 0 }
    };
    B().START_MONSTERS.forEach(function (p) {
      var m = MM.addMonster(s, p[0], p[1]);
      s.party.push(m.id);
    });
    return s;
  };

  MM.addMonster = function (s, el, tier) {
    var m = { id: s.nextId++, el: el, tier: tier, level: 1, exp: 0, stack: 0 };
    s.monsters.push(m);
    s.dex[MM.speciesKey(el, tier)] = true;
    return m;
  };

  MM.getMonster = function (s, id) {
    for (var i = 0; i < s.monsters.length; i++) if (s.monsters[i].id === id) return s.monsters[i];
    return null;
  };

  MM.removeMonster = function (s, id) {
    s.monsters = s.monsters.filter(function (m) { return m.id !== id; });
    s.party = s.party.filter(function (pid) { return pid !== id; });
  };

  // ---------------- 능력치 ----------------
  MM.calcStats = function (el, tier, level) {
    var b = B(), base = b.BASE_STATS, mod = b.ELEMENT_STAT_MOD[el];
    var mult = b.TIER_MULT[tier - 1] * (1 + b.LEVEL_GROWTH * (level - 1));
    return {
      hp: Math.round(base.hp * mult * mod.hp),
      atk: Math.round(base.atk * mult * mod.atk),
      def: Math.round(base.def * mult * mod.def),
      spd: Math.round(base.spd * (1 + 0.03 * (tier - 1) + 0.01 * (level - 1)) * mod.spd * 10) / 10
    };
  };

  MM.expToNext = function (level) { return level * B().EXP_PER_LEVEL; };

  MM.giveExp = function (m, amount) {
    var ups = 0;
    if (m.level >= B().MAX_LEVEL) return 0;
    m.exp += amount;
    while (m.level < B().MAX_LEVEL && m.exp >= MM.expToNext(m.level)) {
      m.exp -= MM.expToNext(m.level);
      m.level++; ups++;
    }
    if (m.level >= B().MAX_LEVEL) m.exp = 0;
    return ups;
  };

  // ---------------- 합성 ----------------
  // 실패 k번 누적 보너스: 5, 7, 9, 11 ... %p 를 더한 값
  MM.stackBonus = function (k) {
    var b = B();
    return k * b.STACK_FIRST_BONUS + b.STACK_BONUS_GROWTH * k * (k - 1) / 2;
  };

  MM.successRate = function (mainTier, stack) {
    var b = B();
    if (stack >= b.STACK_GUARANTEE) return 1;
    var r = b.BASE_SUCCESS[mainTier - 1] + MM.stackBonus(stack);
    return Math.min(1, Math.round(r * 1000) / 1000);
  };

  // 이 몬스터를 주재료로 쓸 때 부재료가 될 수 있는 단계
  MM.subTierFor = function (mainTier) { return mainTier === 1 ? 1 : mainTier - 1; };

  MM.canBeMain = function (m) { return m.tier < B().MAX_TIER; };

  MM.elementCompatible = function (mainEl, subEl) {
    return mainEl === subEl || MM.partnersOf(mainEl).indexOf(subEl) >= 0;
  };

  MM.canFuse = function (main, sub) {
    if (!main || !sub || main.id === sub.id) return false;
    if (!MM.canBeMain(main)) return false;
    if (sub.tier !== MM.subTierFor(main.tier)) return false;
    return MM.elementCompatible(main.el, sub.el);
  };

  MM.fusionCost = function (main, sub) {
    var gold = B().FUSION_GOLD[main.tier - 1];
    if (main.tier === 1) return { gold: gold, soulTier: null, soulOptions: [] };
    var opts = [main.el];
    if (sub && sub.el !== main.el) opts.push(sub.el);
    return { gold: gold, soulTier: main.tier - 1, soulOptions: opts };
  };

  // 합성 시도. 실패 이유가 있으면 { error } 를 돌려준다.
  MM.attemptFusion = function (s, mainId, subId, soulEl, rng) {
    rng = rng || Math.random;
    var main = MM.getMonster(s, mainId), sub = MM.getMonster(s, subId);
    if (!MM.canFuse(main, sub)) return { error: '이 두 몬스터는 합성할 수 없어요' };
    var cost = MM.fusionCost(main, sub);
    if (s.gold < cost.gold) return { error: '골드가 부족해요' };
    var soulKey = null;
    if (cost.soulTier) {
      if (cost.soulOptions.indexOf(soulEl) < 0) soulEl = cost.soulOptions[0];
      soulKey = MM.speciesKey(soulEl, cost.soulTier);
      if ((s.souls[soulKey] || 0) < 1) return { error: MM.speciesName(soulEl, cost.soulTier) + ' 소울이 필요해요' };
    }
    // 비용 지불
    s.gold -= cost.gold;
    if (soulKey) s.souls[soulKey]--;
    s.stats.fusionTries++;

    var rate = MM.successRate(main.tier, main.stack);
    var success = rng() < rate;
    if (success) {
      var el = main.el, tier = main.tier + 1;
      var wasNew = !s.dex[MM.speciesKey(el, tier)];
      var wasInParty = s.party.indexOf(main.id) >= 0 || s.party.indexOf(sub.id) >= 0;
      MM.removeMonster(s, main.id);
      MM.removeMonster(s, sub.id);
      var made = MM.addMonster(s, el, tier);
      if (wasInParty && s.party.length < 3) s.party.push(made.id);
      s.stats.fusionSuccess++;
      return { success: true, rate: rate, monster: made, isNewSpecies: wasNew, spentStack: main.stack };
    }
    main.stack++;
    return { success: false, rate: rate, stack: main.stack, nextRate: MM.successRate(main.tier, main.stack) };
  };

  // ---------------- 소울 ----------------
  MM.canSummon = function (s, key) { return (s.souls[key] || 0) >= B().SOULS_PER_SUMMON; };

  MM.summon = function (s, el, tier) {
    var key = MM.speciesKey(el, tier);
    if (!MM.canSummon(s, key)) return null;
    s.souls[key] -= B().SOULS_PER_SUMMON;
    var wasNew = !s.dex[key];
    var m = MM.addMonster(s, el, tier);
    return { monster: m, isNewSpecies: wasNew };
  };

  // ---------------- 스테이지 ----------------
  // n단계 스테이지: 대표 n단계 1마리 + 부재료 짝 속성 (n-1)단계 2마리. 1단계는 1단계 3마리.
  MM.stageEnemies = function (el, tier) {
    var p = MM.partnersOf(el), low = Math.max(1, tier - 1);
    return [
      { el: el, tier: tier, level: B().ENEMY_LEVEL[tier - 1] },
      { el: p[0], tier: low, level: B().ENEMY_LEVEL[tier - 1] },
      { el: p[1], tier: low, level: B().ENEMY_LEVEL[tier - 1] }
    ];
  };

  MM.rollDrops = function (enemies, rng, mult) {
    rng = rng || Math.random; mult = mult || 1;
    var rates = B().DROP_RATES, got = {};
    enemies.forEach(function (e) {
      for (var k = 1; k <= e.tier; k++) {
        if (rng() < Math.min(1, rates[k - 1] * mult)) {
          var key = MM.speciesKey(e.el, k);
          got[key] = (got[key] || 0) + 1;
        }
      }
    });
    return got;
  };

  // 승리 보상 지급. 결과 요약을 돌려준다.
  MM.grantWin = function (s, stageEl, stageTier, rng) {
    var b = B(), enemies = MM.stageEnemies(stageEl, stageTier);
    var mult = s.settings.fastTest ? b.FAST_TEST_DROP_MULT : 1;
    var drops = MM.rollDrops(enemies, rng, mult);
    Object.keys(drops).forEach(function (k) { s.souls[k] = (s.souls[k] || 0) + drops[k]; });
    var gold = b.CLEAR_GOLD[stageTier - 1];
    s.gold += gold;
    var exp = stageTier * b.EXP_PER_STAGE_TIER, levelUps = [];
    s.party.forEach(function (id) {
      var m = MM.getMonster(s, id);
      if (!m) return;
      var ups = MM.giveExp(m, exp);
      if (ups) levelUps.push({ id: m.id, name: MM.speciesName(m.el, m.tier), level: m.level });
    });
    var key = MM.speciesKey(stageEl, stageTier);
    s.cleared[key] = (s.cleared[key] || 0) + 1;
    s.stats.battlesWon++;
    return { drops: drops, gold: gold, exp: exp, levelUps: levelUps };
  };

  // ---------------- 전투 ----------------
  MM.makeUnit = function (src, side, uid) {
    var st = MM.calcStats(src.el, src.tier, src.level);
    return {
      uid: uid, side: side, el: src.el, tier: src.tier, level: src.level,
      name: MM.speciesName(src.el, src.tier), monsterId: src.id || null,
      maxHp: st.hp, hp: st.hp, atk: st.atk, def: st.def, spd: st.spd
    };
  };

  MM.createBattle = function (partyMonsters, enemies, rng) {
    var units = [], uid = 0;
    partyMonsters.forEach(function (m) { units.push(MM.makeUnit(m, 'p', uid++)); });
    enemies.forEach(function (e) { units.push(MM.makeUnit(e, 'e', uid++)); });
    var bt = { units: units, round: 0, queue: [], log: [], result: null };
    MM.newRound(bt, rng);
    return bt;
  };

  MM.alive = function (bt, side) {
    return bt.units.filter(function (u) { return u.hp > 0 && (!side || u.side === side); });
  };

  MM.newRound = function (bt, rng) {
    rng = rng || Math.random;
    bt.round++;
    if (bt.round > B().MAX_ROUNDS) { bt.result = 'lose'; return; }
    bt.queue = MM.alive(bt).map(function (u) { return { uid: u.uid, r: u.spd + rng() * 0.01 }; })
      .sort(function (a, b) { return b.r - a.r; })
      .map(function (x) { return x.uid; });
  };

  // 지금 행동할 유닛 (죽은 유닛은 건너뜀)
  MM.currentActor = function (bt, rng) {
    while (!bt.result) {
      while (bt.queue.length && bt.units[bt.queue[0]].hp <= 0) bt.queue.shift();
      if (bt.queue.length) return bt.units[bt.queue[0]];
      MM.newRound(bt, rng);
    }
    return null;
  };

  MM.elementMult = function (atkEl, defEl) {
    var b = B();
    if (!b.ELEMENT_ADV_ENABLED) return 1;
    if (MM.beats(atkEl, defEl)) return b.ELEMENT_ADV_MULT;
    if (MM.beats(defEl, atkEl)) return b.ELEMENT_DISADV_MULT;
    return 1;
  };

  MM.calcDamage = function (att, def, rng) {
    rng = rng || Math.random;
    var raw = att.atk * att.atk / (att.atk + def.def);
    var spread = 1 + (rng() * 2 - 1) * B().DAMAGE_RANDOM;
    return Math.max(1, Math.round(raw * MM.elementMult(att.el, def.el) * spread));
  };

  MM.autoTarget = function (bt, actor, rng) {
    rng = rng || Math.random;
    if (actor.side === 'p') {
      // 플레이어 자동: 남은 체력이 가장 적은 적
      return MM.alive(bt, 'e').sort(function (a, b) { return a.hp - b.hp; })[0];
    }
    var ps = MM.alive(bt, 'p');
    return ps[Math.floor(rng() * ps.length)];
  };

  // 현재 행동자가 target 을 공격. 행동 결과를 돌려준다.
  MM.act = function (bt, targetUid, rng) {
    var actor = MM.currentActor(bt, rng);
    if (!actor) return null;
    var target = targetUid == null ? MM.autoTarget(bt, actor, rng) : bt.units[targetUid];
    if (!target || target.hp <= 0 || target.side === actor.side) target = MM.autoTarget(bt, actor, rng);
    var dmg = MM.calcDamage(actor, target, rng);
    target.hp = Math.max(0, target.hp - dmg);
    var mult = MM.elementMult(actor.el, target.el);
    var ev = { actor: actor.uid, target: target.uid, dmg: dmg, ko: target.hp === 0, mult: mult };
    bt.log.push(ev);
    bt.queue.shift();
    if (!MM.alive(bt, 'e').length) bt.result = 'win';
    else if (!MM.alive(bt, 'p').length) bt.result = 'lose';
    return ev;
  };

  // 끝까지 자동으로 돌린다 (시뮬레이션·테스트용)
  MM.simulateBattle = function (partyMonsters, enemies, rng) {
    var bt = MM.createBattle(partyMonsters, enemies, rng);
    while (!bt.result) MM.act(bt, null, rng);
    return bt;
  };

  // 재현 가능한 난수 (테스트용)
  MM.seededRng = function (seed) {
    var x = seed >>> 0 || 1;
    return function () {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  };
})((typeof globalThis !== 'undefined' ? globalThis : window).MM);
