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
      dungeon: { cleared: {}, day: '', used: 0, tickets: {} },
      autoRepeat: { day: '', bank: null },
      offline: { stage: null, lastSeen: now, pendingMs: 0, carry: 0, bag: { souls: {}, gold: 0, exp: 0, runs: 0 }, team: [] },
      tutorial: { step: 0, done: false },
      records: [],
      equips: [], equipped: {}, altar: {},
      settings: { autoBattle: true, recordOn: true, fastTest: false },
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
    if (s.offline && s.offline.team) s.offline.team = s.offline.team.filter(function (pid) { return pid !== id; });
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
    return { key: key, soul: r.added, set: MM.checkDexSet(s, tier) };
  };
  // 도감 세트: 그 단계 5종을 모두 등록하면 1번만 보상 (입장권 + 보스 입장권)
  MM.checkDexSet = function (s, tier) {
    s.dexSets = s.dexSets || {};
    if (s.dexSets[tier] || !MM.RING.every(function (el) { return s.dex[MM.speciesKey(el, tier)]; })) return null;
    s.dexSets[tier] = true;
    var b = B();
    if (s.dungeon) { MM.addTickets(s, tier, b.DEX_SET_TICKETS); MM.addBossTickets(s, tier, b.DEX_SET_BOSS_TICKETS); }
    MM.addRecord(s, { type: 'dexset', el: 'rainbow', tier: tier });
    return { tier: tier, tickets: b.DEX_SET_TICKETS, boss: b.DEX_SET_BOSS_TICKETS };
  };
  MM.checkAllDexSets = function (s) { var got = []; for (var t = 1; t <= B().MAX_TIER; t++) { var r = MM.checkDexSet(s, t); if (r) got.push(r); } return got; };

  MM.addMonster = function (s, el, tier, level) {
    var m = { id: s.nextId++, el: el, tier: tier, level: Math.min(level || 1, MM.maxLevel(tier)), exp: 0, stack: 0 };
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
    if (MM.inOfflineTeam(s, m.id)) return '방치 보상에 있는 몬스터는 분해할 수 없어요';
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

  // ================= 소울 먹이기 =================
  // 같은 속성 몬스터에게 소울을 먹여 경험치를 준다. 최대 레벨이 되면 거기서 멈추고 남은 소울은 안 씀.
  // [10-26] 소울 1개 = 그 소울 1개를 그 단계 스테이지에서 얻는 동안(쫄 2마리 기준) 버는 경험치 × SOUL_FEED_WINS → 귀한 소울일수록 많이
  MM.soulExp = function (tier) { return Math.max(1, Math.round(B().SOUL_FEED_WINS * MM.winExp(tier) / (2 * MM.soulDropAvg(tier)))); };
  MM.canFeed = function (s, m, el, tier) {
    if (!m) return '몬스터가 없어요';
    if (m.el !== el) return '같은 속성 소울만 먹일 수 있어요';
    if (m.level >= MM.maxLevel(m.tier)) return '이미 최대 레벨이에요';
    if ((s.souls[MM.speciesKey(el, tier)] || 0) < 1) return '소울이 부족해요';
    return null;
  };
  // 미리보기: count개를 먹이면 (실제로 쓰는 개수, 결과 레벨, 경험치)
  MM.feedPreview = function (m, tier, count) {
    var c = { level: m.level, exp: m.exp, tier: m.tier }, used = 0, per = MM.soulExp(tier);
    while (used < count && c.level < MM.maxLevel(m.tier)) { used++; MM.giveExp(c, per); }
    return { used: used, level: c.level, exp: c.exp, gained: used * per };
  };
  MM.feedSouls = function (s, monId, tier, count) {
    var m = MM.getMonster(s, monId);
    var why = MM.canFeed(s, m, m && m.el, tier);
    if (why) return { error: why };
    var key = MM.speciesKey(m.el, tier), have = s.souls[key] || 0;
    count = Math.min(count || 1, have);
    var before = m.level, used = 0, per = MM.soulExp(tier);
    while (used < count && m.level < MM.maxLevel(m.tier)) { used++; MM.giveExp(m, per); }
    s.souls[key] -= used;
    s.stats.soulsFed = (s.stats.soulsFed || 0) + used;
    return { used: used, exp: used * per, before: before, level: m.level, ups: m.level - before };
  };

  // ================= 장비 =================
  function eqs(s) { if (!s.equips) s.equips = []; if (!s.equipped) s.equipped = {}; return s.equips; }
  MM.getEquip = function (s, id) { return eqs(s).filter(function (e) { return e.id === id; })[0] || null; };
  MM.equipBonus = function (e) { return e ? B().EQUIP_BASE_PER_TIER * e.tier + B().EQUIP_PER_PLUS * e.plus : 0; };
  MM.equippedOf = function (s, el) { eqs(s); return MM.getEquip(s, s.equipped[el]); };
  MM.craftEquip = function (s, el, tier) {
    var key = MM.speciesKey(el, tier), need = B().EQUIP_CRAFT_SOULS;
    if ((s.souls[key] || 0) < need) return { error: MM.josa(MM.soulName(el, tier) + '', '이', '가') + ' ' + need + '개 필요해요' };
    s.souls[key] -= need;
    var e = { id: s.nextId++, el: el, tier: tier, plus: 0, stack: 0 };
    eqs(s).push(e);
    if (!MM.equippedOf(s, el) || MM.equippedOf(s, el).tier < tier) s.equipped[el] = e.id; // 빈 칸이거나 더 높은 단계면 바로 장착
    return { equip: e };
  };
  MM.equip = function (s, id) { var e = MM.getEquip(s, id); if (!e) return false; s.equipped[e.el] = e.id; return true; };
  MM.unequip = function (s, el) { eqs(s); delete s.equipped[el]; };
  MM.isEquipped = function (s, e) { return !!e && eqs(s) && s.equipped[e.el] === e.id; };
  // 강화
  MM.equipCeil = function (n) { var h = B().EQUIP_HARD_PLUS; return n < h ? n + 2 : 20 * Math.pow(2, n - h); };
  MM.equipBaseRate = function (n) { return B().EQUIP_ENH_BASE * Math.pow(B().EQUIP_ENH_DECAY, n); };
  MM.equipRate = function (n, stack) {
    var p0 = MM.equipBaseRate(n), c = MM.equipCeil(n);
    if (stack >= c - 1) return 1;
    return Math.min(1, p0 + (1 - p0) / (c - 1) * stack);
  };
  MM.equipEnhCost = function (e) {
    var b = B(), n = e.plus;
    return { souls: n, gold: Math.round(tv(b.EQUIP_ENH_GOLD, e.tier) * Math.pow(b.EQUIP_ENH_GOLD_GROWTH, n) / 10) * 10, key: MM.speciesKey(e.el, e.tier), feather: n >= (b.FEATHER_FROM_PLUS || 999) ? 1 : 0 };
  };
  // n → n+1 시도 횟수 기댓값 (천장 포함)
  MM.equipExpectedTries = function (n) {
    var surv = 1, ex = 0, c = MM.equipCeil(n);
    for (var k = 0; k < c; k++) { var p = MM.equipRate(n, k); ex += surv; surv *= (1 - p); if (surv < 1e-9) break; }
    return ex;
  };
  // +0 → +plus 까지 드는 소울·골드 기댓값
  MM.equipExpectedSpend = function (tier, plus) {
    var souls = 0, gold = 0;
    for (var n = 0; n < plus; n++) {
      var c = MM.equipEnhCost({ el: 'fire', tier: tier, plus: n }), ex = MM.equipExpectedTries(n);
      souls += c.souls * ex; gold += c.gold * ex;
    }
    return { souls: souls, gold: gold };
  };
  MM.enhanceEquip = function (s, id, rng) {
    var e = MM.getEquip(s, id);
    if (!e) return { error: '장비가 없어요' };
    if (e.plus >= B().EQUIP_MAX_PLUS) return { error: '최대 강화예요' };
    var c = MM.equipEnhCost(e);
    if ((s.souls[c.key] || 0) < c.souls) return { error: MM.josa(MM.soulName(e.el, e.tier) + '', '이', '가') + ' ' + c.souls + '개 필요해요' };
    if (s.gold < c.gold) return { error: MM.josa('골드', '이', '가') + ' 부족해요' };
    if (c.feather && MM.featherCount(s) < c.feather) return { error: '+' + B().FEATHER_FROM_PLUS + ' 이상 강화에는 무지개 깃털이 필요해요' };
    s.souls[c.key] -= c.souls; s.gold -= c.gold;
    if (c.feather) s.items.feather -= c.feather;
    var rate = MM.equipRate(e.plus, e.stack);
    if (R(rng)() < rate) {
      e.plus++; e.stack = 0;
      if (e.plus >= 5) MM.addRecord(s, { type: 'equip', el: e.el, tier: e.tier, plus: e.plus, rate: rate });
      return { success: true, rate: rate, equip: e, cost: c };
    }
    e.stack++;
    return { success: false, rate: rate, equip: e, cost: c, nextRate: MM.equipRate(e.plus, e.stack) };
  };
  MM.equipDecompValue = function (e) {
    var b = B(), ex = MM.equipExpectedSpend(e.tier, e.plus);
    return { souls: b.EQUIP_DECOMP_SOULS + Math.floor(ex.souls * b.EQUIP_DECOMP_RATE), gold: Math.floor(ex.gold * b.EQUIP_DECOMP_RATE / 10) * 10, key: MM.speciesKey(e.el, e.tier) };
  };
  MM.decomposeEquip = function (s, id) {
    var e = MM.getEquip(s, id);
    if (!e) return { error: '장비가 없어요' };
    if (MM.isEquipped(s, e)) return { error: '장착 중인 장비는 분해할 수 없어요 (먼저 해제)' };
    var v = MM.equipDecompValue(e);
    s.equips = s.equips.filter(function (x) { return x.id !== id; });
    var r = MM.addSouls(s, v.key, v.souls);
    s.gold += v.gold;
    return { souls: r.added, wasted: r.wasted, gold: v.gold, key: v.key };
  };

  // ================= 몬스터 강화 =================
  MM.monEnhRate = function (m) { var b = B(), p = m.plus || 0; return Math.min(1, b.MON_ENH_BASE[p] + b.MON_ENH_STACK_UP * (m.enhStack || 0)); };
  MM.monEnhCost = function (m) { var b = B(), p = m.plus || 0; return { souls: b.MON_ENH_SOULS, key: MM.speciesKey(m.el, m.tier), gold: Math.round(tv(b.MON_ENH_GOLD, m.tier) * (p + 1)) }; };
  MM.monEnhBonus = function (m) { var p = m.plus || 0; return p ? B().MON_ENH_BONUS[p - 1] : 0; };
  MM.enhanceMonster = function (s, id, rng) {
    var m = MM.getMonster(s, id);
    if (!m) return { error: '몬스터가 없어요' };
    if ((m.plus || 0) >= B().MON_ENH_BONUS.length) return { error: '이미 최대 강화예요' };
    var c = MM.monEnhCost(m);
    if ((s.souls[c.key] || 0) < c.souls) return { error: MM.josa(MM.soulName(m.el, m.tier) + '', '이', '가') + ' 필요해요' };
    if (s.gold < c.gold) return { error: MM.josa('골드', '이', '가') + ' 부족해요' };
    s.souls[c.key] -= c.souls; s.gold -= c.gold;
    var rate = MM.monEnhRate(m);
    if (R(rng)() < rate) { m.plus = (m.plus || 0) + 1; m.enhStack = 0; return { success: true, rate: rate, monster: m, cost: c }; }
    m.enhStack = (m.enhStack || 0) + 1;
    return { success: false, rate: rate, monster: m, cost: c, nextRate: MM.monEnhRate(m) };
  };

  // ================= 소울 제단 =================
  function alt(s, el) { if (!s.altar) s.altar = {}; if (!s.altar[el]) s.altar[el] = { level: 0, pts: 0 }; return s.altar[el]; }
  MM.altarOf = function (s, el) { return alt(s, el); };
  // [10-26] n단계 소울 1개 점수 = 1단계 소울보다 귀한 정도(드랍률 비)
  MM.altarSoulPoints = function (tier) { return Math.max(1, Math.round(MM.soulDropAvg(1) / MM.soulDropAvg(tier))); };
  MM.altarNeed = function (level) { return Math.round(B().ALTAR_A * Math.pow(B().ALTAR_R, level)); };
  MM.altarExpBonus = function (s, el) { return alt(s, el).level * B().ALTAR_EXP_PER_LV; };
  MM.altarStatBonus = function (s, el) { return alt(s, el).level * B().ALTAR_STAT_PER_LV; };
  MM.offerSouls = function (s, el, tier, count) {
    var key = MM.speciesKey(el, tier), have = s.souls[key] || 0;
    count = Math.min(count || 1, have);
    if (count <= 0) return { error: '소울이 없어요' };
    s.souls[key] -= count;
    var a = alt(s, el), before = a.level;
    a.pts += count * MM.altarSoulPoints(tier);
    while (a.pts >= MM.altarNeed(a.level)) { a.pts -= MM.altarNeed(a.level); a.level++; }
    s.stats.soulsOffered = (s.stats.soulsOffered || 0) + count;
    return { used: count, points: count * MM.altarSoulPoints(tier), before: before, level: a.level, ups: a.level - before };
  };
  MM.offerPreview = function (s, el, tier, count) {
    var a = alt(s, el), c = { level: a.level, pts: a.pts + count * MM.altarSoulPoints(tier) };
    while (c.pts >= MM.altarNeed(c.level)) { c.pts -= MM.altarNeed(c.level); c.level++; }
    return c;
  };

  // ================= 소울 뽑기 =================
  MM.gachaPull = function (s, el, tier, rng) {
    var b = B(), key = MM.speciesKey(el, tier);
    if ((s.souls[key] || 0) < b.GACHA_COST) return { error: MM.josa(MM.soulName(el, tier) + '', '이', '가') + ' ' + b.GACHA_COST + '개 필요해요' };
    s.souls[key] -= b.GACHA_COST;
    var r = R(rng)(), acc = 0, row = b.GACHA_TABLE[0];
    for (var i = 0; i < b.GACHA_TABLE.length; i++) { acc += b.GACHA_TABLE[i].p; if (r < acc) { row = b.GACHA_TABLE[i]; break; } }
    var out = { kind: row.kind, n: row.n, big: !!row.big, souls: {}, tickets: 0 }, top = tier >= b.MAX_TIER;
    if (row.kind === 'souls') out.souls[MM.speciesKey(MM.RING[Math.floor(R(rng)() * MM.RING.length)], tier)] = row.n;
    else if (row.kind === 'ticket') out.tickets = row.n;
    else if (row.kind === 'boss') { out.bossTickets = row.n; MM.addBossTickets(s, tier, row.n); }
    else if (row.kind === 'up') out.souls[MM.speciesKey(el, top ? tier : tier + 1)] = row.n * (top ? 5 : 1);
    out.drops = MM.applyDrops(s, out.souls);
    if (out.tickets) MM.addTickets(s, tier, out.tickets);
    s.stats.gachaPulls = (s.stats.gachaPulls || 0) + 1;
    if (row.big) MM.addRecord(s, { type: 'gacha', el: el, tier: tier, kind: row.kind, n: row.n });
    out.tier = tier; out.el = el;
    return out;
  };

  // 전투에 들어갈 내 몬스터: 장비(그 속성)·몬스터 강화 배율을 붙인 복사본
  MM.playerMult = function (s, m) { return (1 + MM.equipBonus(MM.equippedOf(s, m.el))) * (1 + MM.monEnhBonus(m)) * (1 + MM.altarStatBonus(s, m.el)); };
  MM.battleParty = function (s, mons) {
    return mons.map(function (m) { var c = {}; for (var k in m) c[k] = m[k]; c.mult = (m.mult || 1) * MM.playerMult(s, m); return c; });
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
      spd: Math.round(base.spd * (1 + 0.03 * (tier - 1) + (B().SPD_PER_LEVEL || 0.005) * (level - 1)) * mod.spd * 10) / 10,
      crit: b.CRIT_BASE + b.CRIT_PER_TIER * tier
    };
  };

  MM.expToNext = function (level) {
    var b = B(), x = b.EXP_A * Math.pow(b.EXP_R, level - 1);
    if (b.EXP_BAND_FROM) { var bm = 1; for (var i = 0; i < b.EXP_BAND_FROM.length; i++) if (level >= b.EXP_BAND_FROM[i]) bm = b.EXP_BAND_MULT[i]; x *= bm; }
    if (b.EXP_HIGH1 && level > b.EXP_HIGH1_FROM) x *= Math.pow(b.EXP_HIGH1, Math.min(level, b.EXP_HIGH1_TO || 999) - b.EXP_HIGH1_FROM);
    if (b.EXP_HIGH2 && level > b.EXP_HIGH2_FROM) x *= Math.pow(b.EXP_HIGH2, level - b.EXP_HIGH2_FROM);
    return Math.round(x);
  };
  MM.winExp = function (stageTier) { return Math.round(B().EXP_WIN * Math.pow(B().EXP_WIN_GROWTH, stageTier - 1) * tv(B().EXP_EARLY_MULT || [1], stageTier)); };

  MM.maxLevel = function (tier) { return tier ? Math.min(B().MAX_LEVEL, Math.round(tv(B().TIER_MAX_LEVEL, tier))) : B().MAX_LEVEL; };
  // 세이브 변환. v2: 만렙 30 → 100 (3.25배). v3 [10-26 대정리]: 만렙 300 표로 (단계별 소환·조건·만렙을 기준점으로 구간 변환), 소울 ×3 (소환 10 → 30개)
  MM.LEVEL_SCALE_VERSION = 3;
  var V2 = { summon: [1, 17, 30, 43, 56], fuse: [14, 30, 43, 56, 78], max: [40, 55, 70, 85, 100] };
  MM.convertLevelV2 = function (tier, lv) {
    var t = Math.min(tier, 5) - 1;
    var from = [1, V2.summon[t], V2.fuse[t], V2.max[t]], to = [1, MM.summonLevel(tier), tier < B().MAX_TIER ? MM.fuseLevelReq(tier) : Math.round((MM.summonLevel(tier) + MM.maxLevel(tier)) / 2), MM.maxLevel(tier)];
    for (var i = 1; i < from.length; i++) {
      if (lv <= from[i] || i === from.length - 1) {
        var a = from[i - 1], b2 = from[i], k = b2 > a ? (Math.min(lv, b2) - a) / (b2 - a) : 1;
        return Math.max(1, Math.min(MM.maxLevel(tier), Math.round(to[i - 1] + k * (to[i] - to[i - 1]))));
      }
    }
    return lv;
  };
  MM.migrateLevels = function (s) {
    if (s.levelScale === MM.LEVEL_SCALE_VERSION) return 0;
    var n = 0;
    if (s.levelScale !== 2) s.monsters.forEach(function (m) { m.level = Math.round(1 + (m.level - 1) * 3.25); });
    s.monsters.forEach(function (m) { m.level = MM.convertLevelV2(m.tier, m.level); m.exp = 0; n++; });
    Object.keys(s.souls || {}).forEach(function (k) { s.souls[k] = Math.min(B().SOUL_CAP, s.souls[k] * 3); });
    s.levelScale = MM.LEVEL_SCALE_VERSION;
    return n;
  };
  // 예전 세이브: 단계 만렙을 넘는 몬스터는 만렙으로 맞춤
  MM.clampLevels = function (s) { var n = 0; s.monsters.forEach(function (m) { var mx = MM.maxLevel(m.tier); if (m.level > mx) { m.level = mx; m.exp = 0; n++; } else if (m.level === mx) m.exp = 0; }); return n; };
  MM.giveExp = function (m, amount) {
    var ups = 0, max = m.tier ? MM.maxLevel(m.tier) : B().MAX_LEVEL;
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
  // 합성 결과 레벨 = 두 재료의 평균 (올림, 확정)
  // 결과 레벨 = 평균(올림) + 보너스(1~3 랜덤), 최대 레벨 이하
  MM.fusionResultBase = function (main, sub) { return Math.ceil((main.level + sub.level) / 2); };
  // 결과 레벨 상한: 새 단계 만렙, 그리고 두 재료 중 높은 레벨 (합성으로 고레벨을 공짜로 건너뛰지 않게) [10-25]
  function resultCap(main, sub) { var mx = MM.maxLevel(main.tier + 1); return B().FUSION_CAP_BY_MATERIAL === false ? mx : Math.min(mx, Math.max(main.level, sub.level, MM.fusionResultBase(main, sub))); }
  MM.fusionResultRange = function (main, sub) {
    var b = MM.fusionResultBase(main, sub), bo = MM.BALANCE.FUSION_LEVEL_BONUS, mx = resultCap(main, sub);
    return [Math.min(mx, b + bo[0]), Math.min(mx, b + bo[1])];
  };
  MM.fusionResultLevel = function (main, sub, rng) {
    var b = MM.fusionResultBase(main, sub), bo = MM.BALANCE.FUSION_LEVEL_BONUS;
    var bonus = bo[0] + Math.floor(R(rng)() * (bo[1] - bo[0] + 1));
    return Math.min(resultCap(main, sub), b + bonus);
  };
  MM.fusionRangeText = function (main, sub) {
    var r = MM.fusionResultRange(main, sub);
    return r[0] === r[1] ? String(r[0]) : r[0] + '~' + r[1];
  };
  MM.subTierFor = function (mainTier) { return mainTier === 1 ? 1 : mainTier - 1; };
  MM.fuseLevelReq = function (tier) { return Math.round(tv(B().FUSE_LEVEL_REQ, tier)); };
  MM.subLevelReq = function (tier) { return MM.summonLevel(tier); }; // 부재료는 소환 레벨이면 바로 가능
  MM.canBeMain = function (m) { return m.tier < B().MAX_TIER; };
  MM.elementCompatible = function (mainEl, subEl) { return MM.partnersOf(mainEl).indexOf(subEl) >= 0; };

  // 짝이 맞는지 (레벨·개수 조건 제외)
  MM.isPair = function (main, sub) {
    if (!main || !sub || main.id === sub.id) return false;
    if (!MM.canBeMain(main)) return false;
    if (sub.tier !== MM.subTierFor(main.tier)) return false;
    return MM.elementCompatible(main.el, sub.el);
  };

  MM.fusionCost = function (main, sub, souls) {
    var b = B();
    var gold = tv(b.FUSION_GOLD, main.tier) * (1 + b.FUSION_GOLD_STACK_UP * main.stack);
    if (main.tier === 1) return { gold: Math.round(gold / 10) * 10, soulTier: null, soulOptions: [], souls: 0 };
    var n = (b.FUSION_SOUL_MAX_TIER && main.tier > b.FUSION_SOUL_MAX_TIER) ? 1 : Math.max(1, Math.min(b.FUSION_SOUL_MAX || 1, Math.round(souls || 1)));
    gold *= Math.max(0, 1 - (b.FUSION_SOUL_GOLD_CUT || 0) * n); // [사용자 확정 10-26] 소울 1개당 -1%, 100개면 공짜
    var opts = [main.el];
    if (sub && sub.el !== main.el) opts.push(sub.el);
    return { gold: Math.round(gold / 10) * 10, soulTier: main.tier - 1, soulOptions: opts, souls: n };
  };

  // 합성 가능 여부와 막힌 이유들
  MM.fusionCheck = function (s, main, sub, soulEl, souls) {
    var reasons = [];
    if (!MM.isPair(main, sub)) return { ok: false, reasons: ['이 두 몬스터는 합성할 수 없어요'] };
    if (s.monsters.length < B().MIN_MONSTERS_TO_FUSE) reasons.push('몬스터가 4마리 이상일 때 합성할 수 있어요');
    // 방치 보상 몬스터로 직접 지정한 몬스터는 빼야 합성 재료로 쓸 수 있음 [사용자 확정]
    [main, sub].forEach(function (m) { if (MM.inOfflineTeam(s, m.id)) reasons.push(MM.josa(MM.speciesName(m.el, m.tier), '은', '는') + ' 방치 보상에 있어요 (빼야 합성 가능)'); });
    // 주재료 = 합성 조건 레벨, 부재료 = 그 단계 소환 레벨 (확정)
    var req = MM.fuseLevelReq(main.tier), subReq = MM.subLevelReq(sub.tier);
    if (main.level < req) reasons.push(MM.speciesName(main.el, main.tier) + ' Lv ' + req + ' 필요 (현재 ' + main.level + ')');
    if (sub.level < subReq) reasons.push(MM.speciesName(sub.el, sub.tier) + ' Lv ' + subReq + ' 필요 (현재 ' + sub.level + ')');
    var cost = MM.fusionCost(main, sub, souls);
    if (s.gold < cost.gold) reasons.push(MM.josa('골드', '이', '가') + ' 부족해요');
    if (cost.soulTier) {
      var el = cost.soulOptions.indexOf(soulEl) >= 0 ? soulEl : cost.soulOptions[0];
      var key = MM.speciesKey(el, cost.soulTier);
      if ((s.souls[key] || 0) < cost.souls) reasons.push(MM.josa(MM.soulName(el, cost.soulTier) + '', '이', '가') + ' ' + cost.souls + '개 필요해요');
    }
    return { ok: reasons.length === 0, reasons: reasons, cost: cost, req: req, subReq: subReq };
  };

  // 합성 시도. opts.force = 튜토리얼 확정 성공
  MM.attemptFusion = function (s, mainId, subId, soulEl, rng, opts) {
    opts = opts || {};
    var main = MM.getMonster(s, mainId), sub = MM.getMonster(s, subId);
    var chk = MM.fusionCheck(s, main, sub, soulEl, opts.souls);
    if (!chk.ok) return { error: chk.reasons[0], reasons: chk.reasons };
    var cost = chk.cost;
    s.gold -= cost.gold;
    var soulKey = null;
    if (cost.soulTier) {
      if (cost.soulOptions.indexOf(soulEl) < 0) soulEl = cost.soulOptions[0];
      soulKey = MM.speciesKey(soulEl, cost.soulTier);
      s.souls[soulKey] -= cost.souls;
    }
    s.stats.fusionTries++;
    var rate = MM.successRate(main.tier, main.stack);
    var success = opts.force || R(rng)() < rate;
    if (success) {
      var el = main.el, tier = main.tier + 1;
      var level = MM.fusionResultLevel(main, sub, rng);
      var slot = s.party.indexOf(main.id) >= 0 ? s.party.indexOf(main.id) : s.party.indexOf(sub.id);
      var oteam = (s.offline.team || []), oslot = oteam.indexOf(main.id) >= 0 ? oteam.indexOf(main.id) : oteam.indexOf(sub.id);
      var spent = main.stack;
      MM.removeMonster(s, main.id);
      MM.removeMonster(s, sub.id);
      var made = MM.addMonster(s, el, tier, level);
      var dex = made._dex; delete made._dex;
      if (slot >= 0) s.party.splice(Math.min(slot, s.party.length), 0, made.id);
      s.party = s.party.slice(0, 3);
      if (oslot >= 0) { s.offline.team = (s.offline.team || []).filter(function (id) { return id !== main.id && id !== sub.id; }); s.offline.team.splice(Math.min(oslot, s.offline.team.length), 0, made.id); }
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
    var lv = MM.summonLevel(tier), mult = tv(b.STAGE_ENEMY_MULT, tier);
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
    var lv = MM.dungeonLevel(tier), mult = tv(b.DUNGEON_ENEMY_MULT, tier);
    var list = els.length === 1 ? [els[0], els[0], els[0]] : els.slice(0, 3);
    return list.map(function (e, i) { return { el: e, tier: tier, level: lv, mult: mult, boss: i === 1, guaranteeT1: true }; });
  };

  MM.dungeonLevel = function (tier) { return tier < B().MAX_TIER ? MM.fuseLevelReq(tier) : MM.maxLevel(tier); };
  MM.dungeonElementFor = function (ms) { return B().DUNGEON_DAY_ELEMENT[MM.weekday(ms)]; };
  MM.dungeonUnlocked = function (s, tier) { return tier === 1 || !!s.dungeon.cleared[tier - 1]; };
  // 하루 기준 초기화. 자동 반복은 하루 AUTO_REPEAT_DAILY판씩 쌓이고 못 쓴 판은 AUTO_REPEAT_MAX까지 이월 (확정)
  MM.refreshDaily = function (s, now) {
    var b = B(), d = MM.dayKey(now || Date.now());
    if (s.dungeon.day !== d) { s.dungeon.day = d; s.dungeon.used = 0; }
    var ar = s.autoRepeat;
    if (ar.bank == null) { ar.bank = Math.max(0, Math.min(b.AUTO_REPEAT_MAX, b.AUTO_REPEAT_DAILY - (ar.day === d ? (ar.used || 0) : 0))); ar.day = d; }
    if (ar.day !== d) {
      var days = ar.day ? Math.max(1, Math.round((Date.parse(d) - Date.parse(ar.day)) / 86400000)) : 1;
      ar.bank = Math.min(b.AUTO_REPEAT_MAX, ar.bank + b.AUTO_REPEAT_DAILY * days);
      ar.day = d;
    }
  };
  MM.dungeonLeft = function (s, now) { MM.refreshDaily(s, now); return Math.max(0, B().DUNGEON_DAILY - s.dungeon.used); };
  MM.autoLeft = function (s, now) { MM.refreshDaily(s, now); return Math.max(0, s.autoRepeat.bank); };
  MM.useAutoRun = function (s, now) { if (MM.autoLeft(s, now) <= 0) return false; s.autoRepeat.bank--; return true; };

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
        var p = MM.soulDropAvg(k) / mean * mult * (e.dropMult || 1) * (e.boss ? (B().BOSS_DROP_MULT || 1) : 1);
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

  function teamExp(s, ids, amount) {
    var ups = [];
    if (!(amount > 0)) return ups;
    ids.forEach(function (id) {
      var m = MM.getMonster(s, id);
      if (!m) return;
      var n = MM.giveExp(m, amount);
      if (n) ups.push({ id: m.id, name: MM.speciesName(m.el, m.tier), level: m.level });
    });
    return ups;
  }
  function partyExp(s, amount) {
    var ups = [];
    s.party.forEach(function (id) {
      var m = MM.getMonster(s, id);
      if (!m) return;
      var n = MM.giveExp(m, Math.round(amount * (1 + MM.altarExpBonus(s, m.el))));
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
    // 스테이지 첫 클리어 보상: 보스 소울 확정
    var firstClear = null;
    if (!s.cleared[key]) {
      var boss = enemies.filter(function (e) { return e.boss; })[0] || enemies[1];
      var bt = Math.min(boss.tier, b.MAX_TIER), n = Math.round(tv(b.FIRST_CLEAR_SOULS || [0], tier));
      if (n > 0) {
        var fc = MM.applyDrops(s, (function () { var o = {}; o[MM.speciesKey(boss.el, bt)] = n; return o; })());
        firstClear = fc[0];
      }
    }
    // 그 단계 스테이지를 (어느 속성이든) 처음 깨면 오프라인 보상 스테이지로 자동 지정 (더 높은 단계로만)
    var autoOffline = null;
    var firstOfTier = !MM.RING.some(function (e) { return s.cleared[MM.speciesKey(e, tier)]; });
    var cur = s.offline.stage;
    var offlinePaid = null;
    if (firstOfTier && (!cur || !MM.offlineStageValid(s) || cur.tier < tier)) { offlinePaid = MM.setOfflineStage(s, el, tier).paid; autoOffline = s.offline.stage; }
    var ticket = null;
    if (b.TICKET_DROP > 0 && R(rng)() < b.TICKET_DROP) { MM.addTickets(s, tier, 1); ticket = tier; }
    s.cleared[key] = (s.cleared[key] || 0) + 1;
    s.stats.battlesWon++;
    return { ticket: ticket, drops: drops, gold: gold, exp: exp, levelUps: ups, firstClear: firstClear, autoOffline: autoOffline, offlinePaid: offlinePaid };
  };

  // 던전 승리 보상 (소탕도 같은 보상). 맨 위 단계 던전은 1~5단계 소울 조금 더 (덤).
  MM.grantDungeonWin = function (s, tier, enemies, rng, opts) {
    opts = opts || {};
    var b = B(), mult = b.DUNGEON_DROP_MULT * (s.settings.fastTest ? b.FAST_TEST_DROP_MULT : 1);
    if (tier >= b.MAX_TIER && !opts.noTopBonus) mult *= b.DUNGEON_TOP_BONUS;
    var drops = MM.applyDrops(s, MM.rollDrops(enemies, rng, mult));
    var gold = Math.round(tv(b.CLEAR_GOLD, tier) * b.DUNGEON_GOLD_MULT);
    s.gold += gold;
    var exp = MM.winExp(tier) * (b.DUNGEON_EXP_MULT || 1);
    var ups = partyExp(s, exp);
    if (!opts.ticket) s.dungeon.cleared[tier] = true; // 입장권 던전은 요일 던전 진행에 영향 없음
    var bossTicket = null;
    if (b.BOSS_TICKET_DROP > 0 && !opts.noBossTicket && R(rng)() < b.BOSS_TICKET_DROP) { MM.addBossTickets(s, tier, 1); bossTicket = tier; }
    s.stats.battlesWon++;
    return { drops: drops, gold: gold, exp: exp, levelUps: ups, bossTicket: bossTicket };
  };

  // 입장권 던전
  MM.ticketCount = function (s, tier) { return ((s.dungeon.tickets || {})[tier]) || 0; };
  MM.ticketTotal = function (s) { var tk = s.dungeon.tickets || {}; return Object.keys(tk).reduce(function (a, k) { return a + (tk[k] || 0); }, 0); };
  MM.useTicket = function (s, tier) {
    if (MM.ticketCount(s, tier) <= 0) return false;
    s.dungeon.tickets[tier]--;
    return true;
  };
  MM.addTickets = function (s, tier, n) { s.dungeon.tickets = s.dungeon.tickets || {}; s.dungeon.tickets[tier] = (s.dungeon.tickets[tier] || 0) + n; };
  // 요일 던전 횟수 사용 (전투 시작 또는 소탕 시)
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
  // 방치 보상(코드 이름 offline): 접속 중이든 아니든 흐른 시간만큼 지정 스테이지를 효율 OFFLINE_RATE로 돌린 보상을
  // 그때그때 굴려서 bag에 쌓아 둔다 (최대 12시간분). 받기를 누르면 bag을 한 번에 지급.
  // 경험치는 방치 보상 몬스터(최대 3마리, 파티와 별개로 지정, 비면 파티)에게.
  // 스테이지·몬스터를 바꾸면 그 전에 쌓인 bag을 먼저 지급 (악용 방지).
  function emptyBag() { return { souls: {}, gold: 0, exp: 0, runs: 0 }; }
  function offl(s) {
    var o = s.offline;
    if (!o.bag) o.bag = emptyBag();
    if (o.pendingMs == null) o.pendingMs = 0;
    if (o.carry == null) o.carry = 0;
    if (!o.team) o.team = [];
    return o;
  }
  MM.inOfflineTeam = function (s, id) { return !!(s.offline && s.offline.team && s.offline.team.indexOf(id) >= 0); };
  MM.offlineTeam = function (s) {
    var o = offl(s);
    o.team = o.team.filter(function (id) { return MM.getMonster(s, id); });
    return (o.team.length ? o.team : s.party).slice(0, 3);
  };
  MM.accrueOffline = function (s, now, rng) {
    var b = B(), o = offl(s), cap = b.OFFLINE_MAX_HOURS * 3600 * 1000, last = o.lastSeen || now;
    o.lastSeen = now;
    if (!(now > last) || !MM.offlineStageValid(s)) return o.pendingMs;
    var dt = Math.min(now - last, cap - o.pendingMs);
    if (dt <= 0) return o.pendingMs;
    o.pendingMs += dt;
    var st = o.stage, runsEq = dt / 1000 / b.AVG_RUN_SEC * b.OFFLINE_RATE + o.carry;
    var runs = Math.floor(runsEq);
    o.carry = runsEq - runs;
    for (var i = 0; i < runs; i++) {
      var d = MM.rollDrops(MM.stageEnemies(st.el, st.tier, rng), rng, 1);
      Object.keys(d).forEach(function (k) { o.bag.souls[k] = (o.bag.souls[k] || 0) + d[k]; });
      o.bag.gold += Math.round(tv(b.CLEAR_GOLD, st.tier));
      if (b.TICKET_DROP > 0 && R(rng)() < b.TICKET_DROP) o.bag.tickets = (o.bag.tickets || 0) + 1;
    }
    o.bag.runs += runs;
    o.bag.exp = MM.winExp(st.tier) * o.bag.runs; // 표시용 최대치 (스테이지 단계 이하 몬스터는 자기 단계 기준)
    return o.pendingMs;
  };
  // 방치 보상 1판 경험치: 몬스터 단계가 스테이지보다 낮으면 자기 단계 스테이지 경험치까지만 [사용자 확정]
  MM.offlineExpFor = function (m, stageTier) { return MM.winExp(stageTier); }; // [10-25 변경] 단계 상관없이 스테이지 경험치 그대로 (대신 단계별 만렙)
  MM.offlinePendingMs = function (s) { return offl(s).pendingMs; };
  MM.offlineBag = function (s) { return offl(s).bag; };
  MM.offlineReady = function (s) { var o = offl(s); return o.bag.runs > 0 || o.bag.gold > 0; };
  MM.offlineFull = function (s) { return offl(s).pendingMs >= B().OFFLINE_MAX_HOURS * 3600 * 1000; };
  MM.claimOffline = function (s, now, rng) {
    MM.accrueOffline(s, now, rng);
    return MM.payOffline(s);
  };
  // 쌓인 bag을 지금 지급하고 비움 (시간 계산 없이). 받을 게 없으면 시간만 0으로.
  MM.payOffline = function (s) {
    var o = offl(s);
    var hours = o.pendingMs / 3600000, capped = MM.offlineFull(s);
    if (!MM.offlineReady(s)) { o.pendingMs = 0; return null; }
    var bag = o.bag, st = o.stage, team = MM.offlineTeam(s);
    o.bag = emptyBag(); o.pendingMs = 0;
    var drops = MM.applyDrops(s, bag.souls);
    s.gold += bag.gold;
    if (bag.tickets) MM.addTickets(s, st.tier, bag.tickets);
    var ups = [], expBy = {};
    team.forEach(function (id) {
      var m = MM.getMonster(s, id); if (!m) return;
      var amount = Math.round(MM.offlineExpFor(m, st.tier) * bag.runs * (1 + MM.altarExpBonus(s, m.el)));
      expBy[id] = amount;
      if (MM.giveExp(m, amount)) ups.push({ id: m.id, name: MM.speciesName(m.el, m.tier), level: m.level });
    });
    return { hours: hours, capped: capped, runs: bag.runs, drops: drops, gold: bag.gold, tickets: bag.tickets || 0, exp: bag.exp, expBy: expBy, levelUps: ups, team: team.slice(), stage: st ? { el: st.el, tier: st.tier } : null };
  };
  MM.setOfflineStage = function (s, el, tier) {
    var cur = s.offline.stage;
    if (cur && cur.el === el && cur.tier === tier) return { paid: null, changed: false };
    var paid = MM.payOffline(s);
    s.offline.stage = { el: el, tier: tier };
    return { paid: paid, changed: true };
  };
  MM.setOfflineTeam = function (s, ids) {
    ids = ids.filter(function (id, i) { return MM.getMonster(s, id) && ids.indexOf(id) === i; }).slice(0, 3);
    var cur = MM.offlineTeam(s);
    if (cur.length === ids.length && cur.every(function (id, i) { return id === ids[i]; }) && offl(s).team.length) return { paid: null, changed: false };
    var paid = MM.payOffline(s);
    offl(s).team = ids;
    return { paid: paid, changed: true };
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
    if (bt.round > (bt.maxRounds || B().MAX_ROUNDS)) { bt.result = 'lose'; return; }
    if (bt.round > 1) bt.units.forEach(function (u) { if (u.sealed > 0) u.sealed--; if (u.shield > 0) u.shield--; });
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
    if (atkEl === 'rainbow' || defEl === 'rainbow') return 1;
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

  function hurt(bt, target, dmg) {
    if (target.guard) dmg = Math.max(1, Math.round(dmg * B().BOSS_GUARD_CUT));
    if (target.shield > 0 && target.shieldCut) dmg = Math.max(1, Math.round(dmg * (1 - target.shieldCut)));
    target.hp = Math.max(0, target.hp - dmg);
    var ev = null;
    if (target.skills) target.skills.forEach(function (sk) {
      if (sk.type === 'enrage' && !target.enraged && target.hp > 0 && target.hp <= target.maxHp * sk.at) { target.enraged = true; target.atk = Math.round(target.atk * sk.mult); ev = 'enrage'; }
    });
    return { dmg: dmg, enrage: ev };
  }
  function endCheck(bt) {
    if (!MM.alive(bt, 'e').length) bt.result = 'win';
    else if (!MM.alive(bt, 'p').length) bt.result = 'lose';
  }
  // 보스: 다음 행동을 미리 정해 두고(예고) 보스 차례에 실행. 스킬은 보스 차례 횟수가 every의 배수일 때 목록 앞쪽부터 하나
  function pickAlly(bt, rng, filter) {
    var al = MM.alive(bt, 'p').filter(filter || function () { return true; });
    return al.length ? al[Math.floor(R(rng)() * al.length)] : null;
  }
  MM.planBoss = function (bt, boss, rng) {
    var n = (boss.turns || 0) + 1;
    var sk = (boss.skills || []).filter(function (x) { return x.every && n % x.every === 0; })[0];
    if (boss.charged) sk = boss.charged; // 힘을 모았으면 다음 차례는 무조건 대폭발
    var plan = { type: sk ? (boss.charged ? 'blast' : sk.type) : 'attack', sk: sk || null };
    if (plan.type === 'attack' || plan.type === 'smash' || plan.type === 'drain') { var tg = pickAlly(bt, rng); plan.target = tg ? tg.uid : null; }
    boss.plan = plan;
    return plan;
  };
  function bossTurn(bt, boss, rng) {
    if (!boss.plan) MM.planBoss(bt, boss, rng);
    var plan = boss.plan, sk = plan.sk, ev = { actor: boss.uid, skill: plan.type, hits: [] };
    boss.turns = (boss.turns || 0) + 1;
    if (plan.type === 'attack' || plan.type === 'smash' || plan.type === 'drain') {
      var tg = plan.target != null && bt.units[plan.target].hp > 0 ? bt.units[plan.target] : pickAlly(bt, rng);
      if (tg) {
        var d = MM.calcDamage(boss, tg, rng), h = hurt(bt, tg, Math.max(1, Math.round(d.dmg * (plan.type === 'attack' ? 1 : sk.mult))));
        ev.target = tg.uid; ev.dmg = h.dmg; ev.crit = d.crit; ev.ko = tg.hp === 0; ev.mult = 1; ev.guarded = !!tg.guard;
        if (plan.type === 'drain') { var dr = Math.min(boss.maxHp - boss.hp, Math.round(h.dmg * sk.pct)); boss.hp += dr; ev.heal = dr; }
        if (plan.type === 'attack') ev.skill = null;
      }
    } else if (plan.type === 'charge') {
      boss.charged = sk; // 다음 차례 대폭발 (예고에 표시)
    } else if (plan.type === 'blast') {
      boss.charged = null;
      MM.alive(bt, 'p').forEach(function (u) { var d = MM.calcDamage(boss, u, rng), h = hurt(bt, u, Math.max(1, Math.round(d.dmg * sk.mult))); ev.hits.push({ target: u.uid, dmg: h.dmg, ko: u.hp === 0, guarded: !!u.guard }); });
    } else if (plan.type === 'seal') {
      var free = pickAlly(bt, rng, function (u) { return !(u.sealed > 0); });
      if (free) { free.sealed = sk.turns + 1; ev.target = free.uid; ev.turns = sk.turns; } // 이번 라운드 끝에 1 줄어서 다음 2라운드 동안 못 움직임
    } else if (plan.type === 'sweep') {
      MM.alive(bt, 'p').forEach(function (u) { var d = MM.calcDamage(boss, u, rng), h = hurt(bt, u, Math.max(1, Math.round(d.dmg * sk.mult))); ev.hits.push({ target: u.uid, dmg: h.dmg, ko: u.hp === 0, guarded: !!u.guard }); });
    } else if (plan.type === 'shield') {
      boss.shield = sk.turns + 1; boss.shieldCut = sk.cut; ev.turns = sk.turns;
    } else if (plan.type === 'heal') {
      var amt = Math.round(boss.maxHp * sk.pct); boss.hp = Math.min(boss.maxHp, boss.hp + amt); ev.heal = amt;
    }
    bt.log.push(ev); bt.queue.shift(); endCheck(bt);
    if (!bt.result) MM.planBoss(bt, boss, rng);
    return ev;
  }
  // 보스전 아군 행동: attack(기본) / defend(다음 내 차례까지 받는 피해 절반) / focus(이번 턴 쉬고 다음 공격 2배)
  MM.BOSS_ACTIONS = ['attack', 'defend', 'focus', 'heal', 'revive'];
  // 시뮬레이션용 판단: naive = 공격만, smart = 예고를 보고 대응
  MM.bossAI = function (bt, actor, policy) {
    if (policy !== 'smart') return 'attack';
    var boss = MM.alive(bt, 'e')[0]; if (!boss) return 'attack';
    var p = boss.plan || {};
    var hit = boss.atk * boss.atk / (boss.atk + actor.def) * 1.05; // 예상 피해(넉넉히)
    var inc = (p.type === 'sweep' || p.type === 'blast') ? hit * p.sk.mult : ((p.type === 'smash' || p.type === 'drain') && p.target === actor.uid) ? hit * p.sk.mult : (p.type === 'attack' && p.target === actor.uid) ? hit : 0;
    if (inc >= actor.hp * 0.8) return 'defend';      // 맞으면 쓰러지거나 위험하면 방어
    if (bt.revivesLeft > 0 && bt.units.some(function (u) { return u.side === 'p' && u.hp <= 0; })) return 'revive';
    if (bt.healsLeft > 0 && MM.alive(bt, 'p').some(function (u) { return u.hp < u.maxHp * 0.35; })) return 'heal';
    if (boss.shield > 1) return actor.focus ? 'attack' : 'focus'; // 보호막 동안은 힘 모으기
    return 'attack';
  };

  MM.act = function (bt, targetUid, rng, opts) {
    var actor = MM.currentActor(bt, rng);
    if (!actor) return null;
    if (actor.side === 'p') actor.guard = false; // 방어는 다음 내 차례까지
    if (actor.sealed > 0) { // 봉인: 차례를 건너뜀
      var sev = { actor: actor.uid, skip: true };
      bt.log.push(sev); bt.queue.shift(); return sev;
    }
    if (actor.raid) return bossTurn(bt, actor, rng);
    if (bt.raid && actor.side === 'p') {
      var action = opts && opts.action || (bt.policy ? MM.bossAI(bt, actor, bt.policy) : 'attack');
      if (action === 'heal' || action === 'revive') {
        var cand = action === 'heal' ? (bt.healsLeft > 0 ? MM.alive(bt, 'p') : []) : (bt.revivesLeft > 0 ? bt.units.filter(function (u) { return u.side === 'p' && u.hp <= 0; }) : []);
        var tgt = opts && opts.target != null ? bt.units[opts.target] : null;
        if (!tgt || cand.indexOf(tgt) < 0) tgt = cand.sort(function (a, b) { return action === 'heal' ? a.hp / a.maxHp - b.hp / b.maxHp : b.atk - a.atk; })[0];
        if (tgt) {
          var amt;
          if (action === 'heal') { amt = Math.min(tgt.maxHp - tgt.hp, Math.round(tgt.maxHp * B().BOSS_HEAL_PCT)); tgt.hp += amt; bt.healsLeft--; }
          else { tgt.hp = amt = Math.round(tgt.maxHp * B().BOSS_REVIVE_PCT); tgt.sealed = 0; tgt.guard = false; tgt.focus = false; bt.revivesLeft--; }
          var hev = { actor: actor.uid, action: action, target: tgt.uid, amount: amt };
          bt.log.push(hev); bt.queue.shift(); return hev;
        }
        action = 'attack';
      }
      if (action === 'defend' || action === 'focus') {
        if (action === 'defend') actor.guard = true; else actor.focus = true;
        var aev = { actor: actor.uid, action: action };
        bt.log.push(aev); bt.queue.shift(); return aev;
      }
    }
    var target = targetUid == null ? MM.autoTarget(bt, actor, rng) : bt.units[targetUid];
    if (!target || target.hp <= 0 || target.side === actor.side) target = MM.autoTarget(bt, actor, rng);
    var d = MM.calcDamage(actor, target, rng), focused = !!actor.focus;
    if (focused) { d.dmg = Math.round(d.dmg * B().BOSS_FOCUS_MULT); actor.focus = false; }
    var h = hurt(bt, target, d.dmg);
    var ev = { actor: actor.uid, target: target.uid, dmg: h.dmg, crit: d.crit, ko: target.hp === 0, mult: MM.elementMult(actor.el, target.el), enrage: h.enrage, shielded: target.shield > 0, focused: focused };
    bt.log.push(ev);
    bt.queue.shift();
    endCheck(bt);
    return ev;
  };

  // ================= 보스 =================
  MM.bossSrc = function (tier) {
    var b = B();
    return { el: 'rainbow', tier: tier, level: MM.summonLevel(tier), boss: true, raid: true };
  };
  MM.createBossBattle = function (partyMonsters, tier, rng) {
    var b = B(), bt = MM.createBattle(partyMonsters, [MM.bossSrc(tier)], rng);
    var u = bt.units.filter(function (x) { return x.side === 'e'; })[0];
    u.maxHp = u.hp = Math.round(u.maxHp * tv(b.BOSS_HP_MULT, tier));
    u.atk = Math.round(u.atk * tv(b.BOSS_ATK_MULT, tier));
    u.spd = Math.round(u.spd * b.BOSS_SPD_MULT * 10) / 10;
    u.skills = b.BOSS_SKILLS[tier] || b.BOSS_SKILLS[Object.keys(b.BOSS_SKILLS).length] || [];
    u.raid = true; u.name = MM.bossName(tier);
    bt.maxRounds = b.BOSS_MAX_ROUNDS; bt.raid = tier; bt.healsLeft = b.BOSS_HEALS; bt.revivesLeft = b.BOSS_REVIVES;
    MM.newRound(bt, rng); bt.round = 1; // 보스 속도 반영해서 첫 라운드 순서 다시
    MM.planBoss(bt, u, rng);
    return bt;
  };
  MM.simulateBossBattle = function (partyMonsters, tier, rng, policy) {
    var bt = MM.createBossBattle(partyMonsters, tier, rng);
    bt.policy = policy || 'smart';
    while (!bt.result) MM.act(bt, null, rng);
    return bt;
  };
  MM.bossTicketCount = function (s, tier) { return ((s.dungeon.bossTickets || {})[tier]) || 0; };
  MM.bossTicketTotal = function (s) { var tk = s.dungeon.bossTickets || {}; return Object.keys(tk).reduce(function (a, k) { return a + (tk[k] || 0); }, 0); };
  MM.addBossTickets = function (s, tier, n) { s.dungeon.bossTickets = s.dungeon.bossTickets || {}; s.dungeon.bossTickets[tier] = (s.dungeon.bossTickets[tier] || 0) + n; };
  MM.useBossTicket = function (s, tier) { if (MM.bossTicketCount(s, tier) <= 0) return false; s.dungeon.bossTickets[tier]--; return true; };
  MM.bossLeftToday = function (s, now) {
    var d = MM.dayKey(now || Date.now());
    if (!s.bossDaily || s.bossDaily.day !== d) s.bossDaily = { day: d, used: 0 };
    return Math.max(0, B().BOSS_DAILY_REWARDS - s.bossDaily.used);
  };
  MM.featherCount = function (s) { return (s.items && s.items.feather) || 0; };
  MM.grantBossWin = function (s, tier, rng, now) {
    MM.bossLeftToday(s, now); s.bossDaily.used++;
    var feather = 0;
    if (R(rng)() < B().FEATHER_DROP_PER_TIER * tier) { s.items = s.items || {}; s.items.feather = (s.items.feather || 0) + 1; feather = 1; MM.addRecord(s, { type: 'feather', el: 'rainbow', tier: tier }); }
    var b = B(), st = Math.min(tier + 1, b.MAX_TIER);
    var en = MM.stageEnemies(MM.RING[Math.floor(R(rng)() * MM.RING.length)], st, rng);
    var raw = MM.rollDrops(en, rng, b.BOSS_DROP_MULT_STAGE * (s.settings.fastTest ? b.FAST_TEST_DROP_MULT : 1));
    var drops = MM.applyDrops(s, raw);
    var gold = Math.round(tv(b.CLEAR_GOLD, st) * (b.BOSS_GOLD_MULT || 0));
    s.gold += gold;
    var exp = MM.winExp(st) * b.BOSS_EXP_MULT;
    var ups = partyExp(s, exp);
    s.stats.battlesWon++;
    s.stats.bossWins = (s.stats.bossWins || 0) + 1;
    MM.addRecord(s, { type: 'boss', el: 'rainbow', tier: tier });
    return { drops: drops, gold: gold, exp: exp, levelUps: ups, feather: feather };
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
