// 한 달 시뮬레이터: 실제 게임 규칙(js/logic.js)으로 플레이어 한 명의 30~60일을 통째로 돌린다.
// 기준(사용자 확정): 하루 = 자동 반복 한도(AUTO_REPEAT_DAILY판) + 요일 던전 2판 + 오프라인 보상 1회(12시간).
// 직접 전투 0. 5단계 던전 추가 보너스는 제외.
// 사용: node tools/month-sim.js [플레이어 수=12] [최대 일수=60]
// OPT=1 → 최적화 유저 [11-06 사용자: 실제 유저는 효율을 다 계산함]: 방치 3시간마다 받기(하루 24시간어치), 장비 제작·강화와 샤들링 강화를
//   '능력치 1%당 골드'가 싼 것부터(다음 합성 골드는 남김), 남는 소울은 지금 단계면 뽑기·낮은 단계면 제단, 레이드 도전,
//   장비·강화를 넣은 전투력으로 이길 수 있는 가장 높은 스테이지(파티 단계 +3까지)
const MM = require('./load');
const B = MM.BALANCE;
// MAXT=30 → 아직 없는 높은 단계까지 시험: 단계별 난이도 목록은 지금 값들의 평균으로 늘리고, 레이드는 마지막 단계 값을 반복
if (process.env.MAXT) {
  const n = +process.env.MAXT, pad = (a, v) => { while (a.length < n) a.push(v); };
  const mean = a => a.reduce((p, q) => p + q, 0) / a.length;
  ['STAGE_ENEMY_MULT', 'DUNGEON_ENEMY_MULT', 'BOSS_HP_MULT', 'BOSS_ATK_MULT'].forEach(k => pad(B[k], mean(B[k])));
  ['RAID_HP_MULT', 'RAID_ATK_MULT'].forEach(k => { while (B[k].length < Math.floor(n / B.RAID_TIER_STEP)) B[k].push(B[k][B[k].length - 1].slice()); });
  B.MAX_TIER = n;
}
const T = B.MAX_TIER;
// NOFUSESOUL=1 → 실험용: 합성에 소울이 안 든다고 가정 (골드만)
if (process.env.NOFUSESOUL) { const fc = MM.fusionCost; MM.fusionCost = function () { const c = fc.apply(this, arguments); c.soulTier = null; c.soulOptions = []; c.souls = 0; return c; }; }
// GOAL=15 → 샤들링 1마리가 15단계가 되면 그 플레이어는 끝 / NOSTOP=1 → 목표와 상관없이 MAX_DAYS까지 / ONLY=번호 → 그 플레이어만 / JSON=1 → 플레이어별 첫 n단계 일수를 JSON으로
const GOAL = +(process.env.GOAL || 0);
const PLAYERS = +process.argv[2] || 12, MAX_DAYS = +process.argv[3] || 60;
const FEED_KEEP = +(process.env.FEED_KEEP || (B.SOULS_PER_SUMMON + 10));
const STOP_FIRST = process.env.STOP !== 'all'; // 기본: 첫 맨 위 단계(10단계)를 만들면 그 플레이어는 끝
// STYLE=user → 사용자 방식 [11-06 피드백 180번]: 3마리가 같은 단계가 되면 하나씩 다음 단계로, 주재료는 파티·부재료는 방치 팀으로 키움,
//   남는 소울은 전부 뽑기(제단 안 씀). STYLE=mix → 합성 순서는 OPT 방식, 방치 팀으로 부재료 키우기는 사용자 방식, 남는 소울은 뽑기 반·제단 반
const STYLE = process.env.STYLE || '';
const OPT = !!process.env.OPT || !!STYLE;
const OFFLINE_CLAIMS_PER_DAY = +(process.env.OFFLINE_CLAIMS || 1);
const OFFLINE_HOURS = OPT ? Array(8).fill(3) : Array(OFFLINE_CLAIMS_PER_DAY).fill(12); // 최적화 유저는 3시간마다 받음 (하루 24시간어치)
// 실험용 덮어쓰기: DROP=드랍 배율, EXPA, EXPP, EXPW=승리 경험치 배율, OVR='{"키":값}'
if (process.env.DROP) B.SOUL_DROP_AVG = B.SOUL_DROP_AVG.map(v => v * +process.env.DROP);
if (process.env.EXPA) B.EXP_A = +process.env.EXPA;
if (process.env.EXPR) B.EXP_R = +process.env.EXPR;
if (process.env.EXPW) B.EXP_WIN = B.EXP_WIN * +process.env.EXPW;
if (process.env.OVR) Object.assign(B, JSON.parse(process.env.OVR));
// 실험용: PMULT=1.1 → 내 몬스터 전원 체력·공격·방어 ×1.1 (장비·강화 효과 어림)
if (process.env.PMULT) { const add = MM.addMonster; MM.addMonster = function () { const m = add.apply(this, arguments); m.mult = +process.env.PMULT; return m; }; }

function makeCache() { return new Map(); }

function winRateEst(party, mk, rng, cache, key, n) {
  if (cache.has(key)) return cache.get(key);
  let w = 0;
  for (let i = 0; i < n; i++) if (MM.simulateBattle(party, mk(), rng).result === 'win') w++;
  const r = w / n; cache.set(key, r); return r;
}
const sig = ms => ms.map(m => m.el + m.tier + ':' + m.level + 'x' + (m.mult || 1).toFixed(2)).sort().join(',');

function simulatePlayer(seed) {
  const rng = MM.seededRng(seed);
  const t0 = Date.UTC(2026, 10, 2, 0); // 2026-11-02 월요일 09시 KST
  const s = MM.newState(t0);
  const cache = makeCache();
  const log = { t3Day: null, t2Day: null, e5Day: {}, goalDay: null, fusions: 0, fails: 0, goldBlocked: 0, soulBlocked: 0, levelBlocked: 0,
    first: {}, cum: {}, cum30: {}, actions: 0, battles: 0, wasted: 0, decomposed: 0, summons: 0, losses: 0, maxGold: 0, levelAtGoal: null, dungeonTop: 0, fed: 0, tickets: 0, bosses: 0, soulSwap: 0,
    crafted: 0, eqTries: 0, monTries: 0, eqGold: 0, monGold: 0, gacha: 0, offered: 0, raids: 0, raidTries: 0 };
  const P = ms => OPT ? MM.battleParty(s, ms) : ms; // 최적화 유저만 장비·강화·제단 능력치를 전투에 반영
  // 첫 n단계: 날짜와 그때까지 쌓인 최고 단계 막힘 횟수(구간별 막힘은 앞 단계와의 차이)
  const markFirst = (tr, now) => { if (log.first[tr] != null) return; log.first[tr] = (now - t0) / 86400000; (log.hiAt = log.hiAt || {})[tr] = Object.assign({}, log.hi || {}); };

  // ---- 튜토리얼 ----
  const applyOrig = MM.applyDrops;
  const now0 = { t: t0 };
  MM.applyDrops = function (st, drops) { if (st === s) Object.keys(drops).forEach(k => { log.cum[k] = (log.cum[k] || 0) + drops[k]; const tr = MM.parseKey(k).tier; if (log.cum[k] >= B.SOULS_PER_SUMMON && log.cum30[tr] == null) log.cum30[tr] = (now0.t - t0) / 86400000; }); return applyOrig.apply(this, arguments); };
  const shuffled = MM.RING.slice().sort(() => rng() - 0.5);
  MM.tutorialPickStarters(s, shuffled.slice(0, 3));
  MM.tutorialBattleReward(s);
  MM.tutorialPickFourth(s, MM.tutorialFourthOptions(s)[0]);
  outer: for (const a of s.monsters) for (const b of s.monsters) if (MM.fusionCheck(s, a, b).ok) { MM.attemptFusion(s, a.id, b.id, null, rng, { force: true }); break outer; }
  MM.finishTutorial(s);

  const need = el => { // 그 속성이 5단계까지 얼마나 남았나 (작을수록 진행됨)
    if (s.dex[MM.speciesKey(el, T)] && s.monsters.some(m => m.el === el && m.tier === T)) return 0;
    const best = Math.max(0, ...s.monsters.filter(m => m.el === el).map(m => m.tier));
    return T - best;
  };
  const goalDone = () => process.env.NOSTOP ? false : GOAL ? s.monsters.some(m => m.tier >= GOAL) : STOP_FIRST ? s.monsters.some(m => m.tier === T) : MM.RING.every(el => s.monsters.some(m => m.el === el && m.tier === T));

  // 키울 샤들링: 막힌 합성의 주재료 + 부재료. 최적화 유저는 부재료가 레벨이 모자랄 때만 넣고 나머지는 가장 센 샤들링
  const focusOf = c => {
    if (c && STYLE) { MM.setOfflineTeam(s, [c.sub.id]); return [c.main.id]; } // 부재료는 방치로
    return !c ? [] : !OPT ? [c.main.id, c.sub.id] : c.sub.level < MM.summonLevel(c.sub.tier) ? [c.main.id, c.sub.id] : [c.main.id];
  };
  function pickParty(focusIds) {
    const pool = s.monsters.slice();
    const chosen = [];
    focusIds.forEach(id => { const m = MM.getMonster(s, id); if (m && chosen.length < 3 && !chosen.includes(m)) chosen.push(m); });
    const rest = pool.filter(m => !chosen.includes(m)).sort((a, b) => b.tier - a.tier || b.level - a.level);
    // 서로 다른 속성 우선 (파티 보너스)
    for (const m of rest) { if (chosen.length >= 3) break; if (!chosen.some(c => c.el === m.el)) chosen.push(m); }
    for (const m of rest) { if (chosen.length >= 3) break; if (!chosen.includes(m)) chosen.push(m); }
    s.party = chosen.map(m => m.id);
  }

  // 다음 목표 합성 후보: 짝은 맞는데 레벨 등으로 막힌 것 중 가장 가치 있는 것
  const core = () => { const out = []; s.monsters.slice().sort((a, b) => b.tier - a.tier || b.level - a.level).forEach(m => { if (out.length < 3 && !out.some(c => c.el === m.el)) out.push(m); }); return out; };
  // ---- 목표를 거꾸로 따라가는 계획 (OPT·STYLE) [11-06 사용자: 낮은 단계 합성을 굳이 할 이유가 없음] ----
  // 목표 하나(최적화·반반형: 최고 단계 샤들링을 한 단계 위로 / 사용자형: 핵심 3마리 중 가장 낮은 단계를 한 단계 위로)를 정하고,
  // 거기에 필요한 주재료·부재료를 가진 샤들링으로 채우고, 없는 것만 거꾸로 '만들 것' 목록에 넣는다. 목록에 있는 합성만 한다.
  // 부재료 속성은 짝 중 이미 더 높이 키운 속성을 고른다.
  function planWanted() {
    const avail = new Map(), key = (el, t) => el + '|' + t, wanted = new Set();
    s.monsters.forEach(m => avail.set(key(m.el, m.tier), (avail.get(key(m.el, m.tier)) || 0) + 1));
    const bestTier = el => Math.max(0, ...s.monsters.filter(m => m.el === el).map(m => m.tier));
    const take = (el, t) => { const k = key(el, t), n = avail.get(k) || 0; if (n > 0) { avail.set(k, n - 1); return true; } return false; };
    const need = (el, t, depth) => {
      if (take(el, t) || t <= 1 || depth > 20) return; // 1단계는 소환으로
      wanted.add(key(el, t));
      need(el, t - 1, depth + 1);
      const nb = MM.partnersOf(el).slice().sort((p, q) => bestTier(q) - bestTier(p))[0];
      need(nb, MM.subTierFor(t - 1), depth + 1);
    };
    let goal;
    if (STYLE === 'user') goal = core().sort((p, q) => p.tier - q.tier || q.level - p.level)[0];
    else goal = s.monsters.slice().sort((p, q) => q.tier - p.tier || q.level - p.level)[0];
    if (goal && goal.tier < T) need(goal.el, goal.tier + 1, 0);
    return wanted;
  }
  function bestCandidate() {
    let best = null;
    if (OPT) {
      const wanted = planWanted();
      for (const main of s.monsters) {
        if (!MM.canBeMain(main) || !wanted.has(main.el + '|' + (main.tier + 1))) continue;
        for (const sub of s.monsters) {
          if (!MM.isPair(main, sub)) continue;
          const score = main.tier * 10 + main.level / 1000 + main.stack - sub.level / 1e6;
          if (!best || score > best.score) best = { main, sub, score };
        }
      }
      return best;
    }
    const cs = null, coreMin = 0;
    for (const main of s.monsters) {
      if (!MM.canBeMain(main)) continue;
      if (cs) { const inCore = cs.includes(main); if (inCore ? main.tier !== coreMin : main.tier + 1 > Math.max(1, coreMin - 1)) continue; }
      if (main.tier + 1 === T && s.monsters.some(m => m.el === main.el && m.tier === T)) continue; // 이미 5단계 있음
      for (const sub of s.monsters) {
        if (!MM.isPair(main, sub)) continue;
        // 부재료가 그 속성의 유일한 최고 단계 몬스터면 아끼기 (5단계 경로 보호)
        const score = main.tier * 10 + (need(main.el) > 0 ? 5 : 0) - sub.tier * 0.1 + main.stack + (cs && cs.includes(main) ? 1000 : 0);
        if (!best || score > best.score) best = { main, sub, score };
      }
    }
    return best;
  }

  function manage(now) {
    now0.t = now;
    // 1) 소환 (합성 비용용 1개는 남김)
    for (const sp of MM.allSpecies()) {
      while ((s.souls[sp.key] || 0) >= B.SOULS_PER_SUMMON + 1) {
        if (sp.tier === T && s.monsters.some(m => m.el === sp.el && m.tier === T)) break;
        if (s.monsters.filter(m => m.el === sp.el && m.tier === sp.tier).length >= 3) break; // 같은 종 3마리까지만
        MM.summon(s, sp.el, sp.tier); log.summons++;
        for (let tr = 2; tr <= sp.tier; tr++) markFirst(tr, now);
      }
    }
    // 1.5) 소울 먹이기: 소환용으로 FEED_KEEP개는 남기고, 나머지를 같은 속성 중 합성 조건 레벨이 모자란 몬스터에게
    if (!process.env.NOFEED) for (const sp of MM.allSpecies()) {
      let extra = (s.souls[sp.key] || 0) - FEED_KEEP;
      if (extra <= 0) continue;
      const targets = s.monsters.filter(m => m.el === sp.el && m.level < MM.maxLevel(m.tier) && m.tier <= sp.tier + 1)
        .map(m => ({ m, req: m.tier < T ? Math.max(MM.fuseLevelReq(m.tier), 0) : B.MAX_LEVEL }))
        .filter(x => x.m.level < x.req).sort((a, b) => b.m.tier - a.m.tier);
      for (const x of targets) {
        while (extra > 0 && x.m.level < x.req) { const r = MM.feedSouls(s, x.m.id, sp.tier, 1); if (r.error) break; extra -= r.used; log.fed += r.used; }
        if (extra <= 0) break;
      }
    }
    // 2) 합성 반복
    for (let guard = 0; guard < 60; guard++) {
      const c = bestCandidate();
      if (!c) break;
      // 합성하려면 방치 팀에서 빼야 함: 합성할 수 있을 때만 빼고, 막히면 그대로 둠 (부재료가 계속 방치 경험치를 받게)
      const savedTeam = (s.offline.team || []).slice();
      if (STYLE) s.offline.team = savedTeam.filter(id => id !== c.main.id && id !== c.sub.id);
      const cost = MM.fusionCost(c.main, c.sub);
      let soulEl = cost.soulOptions.slice().sort((a, b) => (s.souls[MM.speciesKey(b, cost.soulTier)] || 0) - (s.souls[MM.speciesKey(a, cost.soulTier)] || 0))[0];
      let chk = MM.fusionCheck(s, c.main, c.sub, soulEl);
      if (!chk.ok && cost.soulTier && chk.reasons.some(r => /소울/.test(r))) {
        // 소울 분해로 보충 (한 단계 위 같은 속성 소울)
        for (const el of cost.soulOptions) {
          const up = MM.speciesKey(el, cost.soulTier + 1);
          if ((s.souls[up] || 0) >= 1 && cost.soulTier + 1 <= T) { MM.decomposeSoul(s, el, cost.soulTier + 1); log.decomposed++; soulEl = el; break; }
        }
        chk = MM.fusionCheck(s, c.main, c.sub, soulEl);
      }
      let nSouls = 1;
      // 소울이 넉넉하면(소환용 FEED_KEEP개 남기고) 남는 만큼 넣어 골드를 아낌, 골드가 모자라면 더 넣어 봄 (SOULN=0이면 안 씀)
      if (cost.soulTier && process.env.SOULN !== '0') {
        const have = s.souls[MM.speciesKey(soulEl, cost.soulTier)] || 0;
        const spare = Math.max(1, Math.min(B.FUSION_SOUL_MAX || 1, have - FEED_KEEP));
        if (spare > 1) { const c2 = MM.fusionCheck(s, c.main, c.sub, soulEl, spare); if (c2.ok || !chk.ok) { chk = c2; nSouls = spare; log.soulSwap += spare - 1; } }
        if (!chk.ok && chk.reasons.some(r => /골드/.test(r))) {
          for (let n = nSouls + 1; n <= Math.min(B.FUSION_SOUL_MAX || 1, have); n++) { const c2 = MM.fusionCheck(s, c.main, c.sub, soulEl, n); if (c2.ok) { chk = c2; log.soulSwap += n - nSouls; nSouls = n; break; } }
        }
      }
      if (!chk.ok) {
        if (STYLE) s.offline.team = savedTeam;
        // 최고 단계 진행이 무엇 때문에 막혔나 (최고 단계 -1 이상 주재료만): 레벨(주재료/부재료)·골드·소울
        if (c.main.tier >= Math.max(...s.monsters.map(m => m.tier)) - 1) { const why = chk.reasons.some(r => /골드/.test(r)) ? 'gold' : chk.reasons.some(r => /소울/.test(r)) ? 'soul' : chk.reasons.some(r => r.indexOf(MM.speciesName(c.sub.el, c.sub.tier) + ' Lv') === 0) ? 'subLv' : chk.reasons.some(r => /Lv/.test(r)) ? 'mainLv' : 'other'; log.hi = log.hi || {}; log.hi[why] = (log.hi[why] || 0) + 1; }
        if (OPT && cost.soulTier && chk.reasons.some(r => /소울/.test(r))) c.needSoul = { el: soulEl || cost.soulOptions[0], tier: cost.soulTier }; // 합성에 쓸 소울이 없으면 그 속성 스테이지를 돎
        if (chk.reasons.some(r => /골드/.test(r))) log.goldBlocked++;
        else if (chk.reasons.some(r => /소울/.test(r))) log.soulBlocked++;
        else if (chk.reasons.some(r => /Lv/.test(r))) log.levelBlocked++;
        return c; // 막힌 후보 → 파티로 키우기
      }
      const r = MM.attemptFusion(s, c.main.id, c.sub.id, soulEl, rng, { souls: nSouls });
      if (r.success) for (let tr = 2; tr <= r.monster.tier; tr++) markFirst(tr, now);
      if (r.success) { log.fusions++; if (r.monster.tier === T && log.e5Day[r.monster.el] == null) log.e5Day[r.monster.el] = (now - t0) / 86400000; }
      else log.fails++;
    }
    // 막힌 후보도 없음: 최고 단계 샤들링에게 짝(이웃 속성 한 단계 아래)이 없음
    { const top = Math.max(...s.monsters.map(m => m.tier)); if (top < T && !s.monsters.some(a => a.tier >= top - 1 && MM.canBeMain(a) && s.monsters.some(b => MM.isPair(a, b)))) { log.hi = log.hi || {}; log.hi.noPair = (log.hi.noPair || 0) + 1; } }
    return null;
  }

  // ---- 최적화 유저의 소울·골드 투자 ----
  const topTier = () => Math.max(1, ...s.monsters.map(m => m.tier));
  function invest(stageTier) {
    if (!OPT) return;
    const top = topTier(), keep = FEED_KEEP;
    const roster = new Set(s.monsters.map(m => m.el));
    // 1) 장비 제작: 가진 속성마다, 지금 장비보다 높은 단계 소울이 소환용을 빼고 100개 넘게 남으면
    for (const el of roster) for (let t = Math.min(top, T); t >= 1; t--) {
      const cur = MM.equippedOf(s, el);
      if (cur && cur.tier >= t) break;
      if ((s.equips || []).some(e => e.el === el && e.tier >= t)) break; // 이미 가진 장비가 있으면 안 만듦
      if ((s.souls[MM.speciesKey(el, t)] || 0) >= B.EQUIP_CRAFT_SOULS + keep) { MM.craftEquip(s, el, t); log.crafted++; break; }
    }
    // 1.5) 칸마다 낄 수 있는 가장 좋은 장비로 바꾸고, 지금 장비보다 못한 남는 장비는 분해 (거래가 없으니 분해)
    for (const el of MM.RING.concat(['rainbow'])) {
      const mine = (s.equips || []).filter(e => e.el === el);
      const bestE = mine.filter(e => MM.canEquip(s, e)).sort((a, b) => b.tier - a.tier || b.plus - a.plus)[0]; // 낄 수 있는 가장 높은 단계 (같으면 강화 높은 것)
      if (bestE && !MM.isEquipped(s, bestE)) MM.equip(s, bestE.id);
      const cur = MM.equippedOf(s, el);
      mine.forEach(e => { if (cur && e !== cur && e.tier <= cur.tier) { const d = MM.decomposeEquip(s, e.id); if (!d.error) { log.decomp = (log.decomp || 0) + 1; if (el === 'rainbow') log.rbFromDecomp = (log.rbFromDecomp || 0) + (d.souls || 0); } } });
    }
    // 2) 남는 소울: 지금 도는 단계 이상이면 뽑기(입장권·위 단계 소울), 최고 단계보다 2단계 이상 낮으면 제단
    for (const sp of MM.allSpecies()) {
      const have = () => s.souls[sp.key] || 0;
      if (STYLE === 'user' || (STYLE === 'mix' && sp.tier % 2 === 0)) { while (have() >= keep + (sp.tier >= top - 1 ? B.EQUIP_CRAFT_SOULS : 0) + B.GACHA_COST) { const g = MM.gachaPull(s, sp.el, sp.tier, rng); if (g.error) break; log.gacha++; } continue; }
      if (sp.tier >= stageTier) { while (have() >= keep + B.GACHA_COST) { const g = MM.gachaPull(s, sp.el, sp.tier, rng); if (g.error) break; log.gacha++; } }
      else if (sp.tier <= top - 2) {
        const eq = MM.equippedOf(s, sp.el), save = keep + (!eq || sp.tier > eq.tier ? B.EQUIP_CRAFT_SOULS : sp.tier === eq.tier ? 60 : 0); // 장비 제작(100개)·강화용 소울은 남김
        if (have() <= save) continue;
        const o = MM.offerSouls(s, sp.el, sp.tier, have() - save); if (!o.error) log.offered += o.used; }
    }
    // 3) 골드: 다음 합성 골드(실패 스택 반영)는 남기고, 능력치 1%당 골드가 가장 싼 강화부터
    const c = bestCandidate();
    const reserve = c ? MM.fusionCost(c.main, c.sub).gold * (1 + (B.FUSION_GOLD_STACK_UP || 0) * (c.main.stack || 0)) : 0;
    const party = s.party.map(id => MM.getMonster(s, id)).filter(Boolean);
    for (let guard = 0; guard < 200; guard++) {
      let best = null;
      for (const m of party) {
        const e = MM.equippedOf(s, m.el);
        if (e && e.plus < B.EQUIP_MAX_PLUS) {
          const ec = MM.equipEnhCost(e), tries = MM.equipExpectedTries(e.plus);
          const ok = (!ec.feather || MM.featherCount(s) >= ec.feather) && !ec.rainbow && (s.souls[ec.key] || 0) >= ec.souls + keep; // 소환용 소울은 남김
          const gain = B.EQUIP_PER_PLUS / (1 + MM.equipBonus(e)), cost = ec.gold * tries;
          if (ok && (!best || gain / cost > best.v)) best = { v: gain / cost, kind: 'eq', id: e.id, gold: ec.gold };
        }
        if ((m.plus || 0) < B.MON_ENH_BONUS.length) {
          const mc = MM.monEnhCost(m), rate = MM.monEnhRate(m);
          // 합성 재료로 곧 쓸 샤들링(합성 조건 레벨 미만인 하위 단계)은 강화가 사라지니 가치 절반
          const life = m.tier >= top || m.level >= MM.fuseLevelReq(m.tier) ? 1 : 0.5;
          const prev = m.plus ? B.MON_ENH_BONUS[m.plus - 1] : 0, gain = (B.MON_ENH_BONUS[m.plus || 0] - prev) / (1 + prev) * life;
          if ((s.souls[mc.key] || 0) > keep && (!best || gain / (mc.gold / rate) > best.v)) best = { v: gain / (mc.gold / rate), kind: 'mon', id: m.id, gold: mc.gold };
        }
      }
      // 무지개 장비 강화: 레인보우 소울 + 골드, 파티 전원에게 효과라 가치 3배
      { const re = MM.equippedOf(s, 'rainbow');
        if (re && re.plus < B.EQUIP_MAX_PLUS) { const rc = MM.equipEnhCost(re), tries = MM.equipExpectedTries(re.plus);
          const ok = (!rc.feather || MM.featherCount(s) >= rc.feather) && MM.rainbowSoulCount(s) >= rc.souls;
          const v = 3 * B.EQUIP_PER_PLUS / (1 + MM.equipBonus(re)) / Math.max(1, rc.gold * tries);
          if (ok && (!best || v > best.v)) best = { v, kind: 'eq', id: re.id, gold: rc.gold, rb: rc.souls }; } }
      if (!best || s.gold - best.gold < reserve) break;
      if (best.kind === 'eq') { const ce = MM.equipEnhCost(MM.getEquip(s, best.id)); if (ce.feather) log.featherUsed = (log.featherUsed || 0) + ce.feather; if (ce.rainbow) log.rbUsed = (log.rbUsed || 0) + ce.souls; }
      if (best.kind === 'eq') { const r = MM.enhanceEquip(s, best.id, rng); if (r.error) break; log.eqTries++; log.eqGold += best.gold; }
      else { const r = MM.enhanceMonster(s, best.id, rng); if (r.error) break; log.monTries++; log.monGold += best.gold; }
    }
  }
  // ---- 최적화 유저의 레이드: 입장권이 있고 속성별 5마리가 있으면 대응 전투로 도전 (하루 페이즈당 5번까지) ----
  function doRaids() {
    if (!OPT) return;
    for (const k of MM.raidTiers()) {
      const rp = MM.raidParty(s);
      if (!rp || MM.raidTicketCount(s, k) <= 0) continue;
      for (let guard = 0; guard < 10 && MM.raidTicketCount(s, k) > 0; guard++) {
        const ph = MM.raidPhase(s, k);
        const bt = MM.simulateRaidPhase(P(rp), k, ph, rng, 'smart'); log.raidTries++; log.battles++; log.actions += bt.log.length;
        if (bt.result !== 'win') continue;
        const w = MM.winRaidPhase(s, k, rng, (bt.units.filter(u => u.raid)[0] || {}).el);
        if (w.done) { log.raids++; w.reward.drops.forEach(d => log.wasted += d.wasted); }
      }
    }
  }

  function chooseStage(party, blocked) {
    // 깰 수 있는(추정 승률 55% 이상) 가장 높은 단계, 속성은 진행이 가장 늦은 속성
    const maxT = Math.max(...party.map(m => m.tier));
    let tier = 1;
    const fp = P(party);
    for (let st = Math.min(T, maxT + (OPT ? 3 : 0)); st >= 1; st--) {
      const key = sig(fp) + '|' + st;
      const r = winRateEst(fp, () => MM.stageEnemies(MM.RING[Math.floor(rng() * 5)], st, rng), rng, cache, key, 40);
      if (r >= 0.55) { tier = st; break; }
    }
    const els = MM.RING.slice().sort((a, b) => need(b) - need(a) || rng() - 0.5);
    if (blocked && blocked.needSoul && tier >= blocked.needSoul.tier) return { el: blocked.needSoul.el, tier };
    return { el: els[0], tier };
  }

  let day = 0;
  for (day = 0; day < MAX_DAYS && !goalDone(); day++) {
    const dayStart = t0 + day * 86400000;
    // 오프라인 보상 (전날 지정 스테이지)
    for (const h of OFFLINE_HOURS) {
      s.offline.lastSeen = dayStart - h * 3600000;
      const off = MM.claimOffline(s, dayStart, rng);
      if (off) off.drops.forEach(d => log.wasted += d.wasted);
    }
    // 던전 2판
    MM.refreshDaily(s, dayStart);
    let blocked = manage(dayStart);
    pickParty(focusOf(blocked));
    const dEl = MM.dungeonElementFor(dayStart);
    for (let k = 0; k < B.DUNGEON_DAILY; k++) {
      const party = P(s.party.map(id => MM.getMonster(s, id)));
      const els = dEl ? [dEl] : MM.RING.slice().sort((a, b) => need(b) - need(a)).slice(0, 3);
      let tier = 0;
      for (let dt = T; dt >= 1; dt--) {
        if (!MM.dungeonUnlocked(s, dt)) continue;
        const r = winRateEst(party, () => MM.dungeonEnemies(els, dt), rng, cache, sig(party) + '|D' + dt + els.join(), 30);
        if (r >= 0.15) { tier = dt; break; }
        if (s.dungeon.cleared[dt]) { tier = -dt; break; } // 소탕
      }
      if (!tier) continue;
      const dt = Math.abs(tier), en = MM.dungeonEnemies(els, dt);
      let win = tier < 0;
      for (let tries = 0; tier > 0 && !win && tries < 20; tries++) { const bt = MM.simulateBattle(party, en, rng); log.actions += bt.log.length; log.battles++; win = bt.result === 'win'; }
      if (!win) continue;
      MM.useDungeonEntry(s, dayStart);
      { const r = MM.grantDungeonWin(s, dt, en, rng, { noTopBonus: true }); r.drops.forEach(d => log.wasted += d.wasted); log.dungeonTop = Math.max(log.dungeonTop, dt); }
    }
    // 입장권 던전 (TICKET_DROP > 0일 때): 이길 만하면 바로 사용 (자동 반복 전·후 2번 처리)
    const useTickets = () => {
      const tk = s.dungeon.tickets || {};
      for (let dt = T; dt >= 1; dt--) {
        while ((tk[dt] || 0) > 0) {
          const party = P(s.party.map(id => MM.getMonster(s, id)));
          const els = MM.RING.slice().sort((a, b) => need(b) - need(a)).slice(0, 3); // 입장권 던전: 요일 상관없이 3속성
          const r = winRateEst(party, () => MM.dungeonEnemies(els, dt), rng, cache, sig(party) + '|D' + dt + els.join(), 30);
          if (r < 0.15) break;
          const en = MM.dungeonEnemies(els, dt);
          let win = false;
          for (let tries = 0; !win && tries < 20; tries++) { const bt = MM.simulateBattle(party, en, rng); log.actions += bt.log.length; log.battles++; win = bt.result === 'win'; }
          if (!win) break;
          tk[dt]--; log.tickets++;
          const g = MM.grantDungeonWin(s, dt, en, rng, { noTopBonus: true, ticket: true }); g.drops.forEach(d => log.wasted += d.wasted);
        }
      }
    };
    // 보스 (입장권 있으면, 이길 만하면 바로)
    const useBoss = () => {
      const bk = s.dungeon.bossTickets || {};
      for (let bt = T; bt >= 1; bt--) {
        while ((bk[bt] || 0) > 0) {
          const party = MM.battleParty(s, s.party.map(id => MM.getMonster(s, id)));
          let win = false;
          for (let tries = 0; !win && tries < 10; tries++) { const b = MM.simulateBossBattle(party, bt, rng); log.bossTries = (log.bossTries || 0) + 1; log.actions += b.log.length; log.battles++; win = b.result === 'win'; }
          if (!win) break;
          bk[bt]--; log.bosses++;
          const g = MM.grantBossWin(s, bt, rng); g.drops.forEach(d => log.wasted += d.wasted);
        }
      }
    };
    useTickets(); useBoss(); doRaids();
    // 자동 반복
    blocked = manage(dayStart);
    pickParty(focusOf(blocked));
    let party = s.party.map(id => MM.getMonster(s, id));
    let stage = chooseStage(party, blocked);
    invest(stage.tier);
    let fight = P(party);
    for (let run = 0; run < B.AUTO_REPEAT_DAILY; run++) {
      if (run % (OPT ? 100 : 20) === (OPT ? 99 : 19)) {
        blocked = manage(dayStart + run / B.AUTO_REPEAT_DAILY * 86400000 * 0.999);
        pickParty(focusOf(blocked));
        party = s.party.map(id => MM.getMonster(s, id));
        stage = chooseStage(party, blocked);
        invest(stage.tier); fight = P(party);
        if (goalDone()) break;
      }
      now0.t = dayStart + run / B.AUTO_REPEAT_DAILY * 86400000 * 0.999;
      const en = MM.stageEnemies(stage.el, stage.tier, rng);
      const bt = MM.simulateBattle(fight, en, rng);
      log.actions += bt.log.length; log.battles++;
      if (bt.result === 'win') { log.stageSum = (log.stageSum || 0) + stage.tier - Math.max(...party.map(m => m.tier)); log.stageWins = (log.stageWins || 0) + 1; const r = MM.grantStageWin(s, stage.el, stage.tier, en, rng); r.drops.forEach(d => log.wasted += d.wasted); }
      else { log.losses++; s.stats.battlesLost++; }
    }
    useTickets(); useBoss(); doRaids();
    if (process.env.DEBUG && day % +process.env.DEBUG === 0) { const top = s.monsters.slice().sort((a, b) => b.tier - a.tier || b.level - a.level).slice(0, 4); process.stderr.write(day + "일 스테이지 " + stage.tier + " 파티 " + party.map(m => m.el + m.tier + "Lv" + m.level).join(",") + " 상위 " + top.map(m => m.el + m.tier + "Lv" + m.level + "/" + (m.tier < T ? MM.fuseLevelReq(m.tier) : "-")).join(",") + " 막힘 " + (blocked ? blocked.main.el + blocked.main.tier + "Lv" + blocked.main.level + "+" + blocked.sub.el + blocked.sub.tier + "Lv" + blocked.sub.level + " 이유: " + MM.fusionCheck(s, blocked.main, blocked.sub).reasons.join("/") : "-") + " 골드 " + s.gold + " 방치팀 " + MM.offlineTeam(s).map(id => { const m = MM.getMonster(s, id); return m ? m.el + m.tier + "Lv" + m.level : "?"; }).join(",") + "\n"); }
    // 기록: 최고 단계 샤들링이 만렙인 날 수, 단계별 첫 만렙 날, 30일마다 보유 골드
    { const topM = s.monsters.reduce((a, b) => (b.tier > a.tier || (b.tier === a.tier && b.level > a.level) ? b : a));
      log.days = (log.days || 0) + 1; if (topM.level >= MM.maxLevel(topM.tier)) log.topMaxDays = (log.topMaxDays || 0) + 1;
      log.maxFirst = log.maxFirst || {}; s.monsters.forEach(m => { if (m.level >= MM.maxLevel(m.tier) && log.maxFirst[m.tier] == null) log.maxFirst[m.tier] = day; });
      if (day % 30 === 0) (log.goldSeries = log.goldSeries || []).push(s.gold);
      if (day % 90 === 0) { const tt = topM.tier, sum = t => MM.RING.reduce((a, el) => a + (s.souls[MM.speciesKey(el, t)] || 0), 0);
        (log.snaps = log.snaps || []).push({ day, top: tt, gold: s.gold, feather: MM.featherCount(s), rainbow: MM.rainbowSoulCount(s), souls: [tt - 2, tt - 1, tt, tt + 1].map(t => t >= 1 ? sum(t) : 0),
          eq: MM.RING.concat(['rainbow']).map(el => { const e = MM.equippedOf(s, el); return e ? e.tier + '+' + e.plus : '-'; }).join(' '), tickets: Object.values(s.dungeon.tickets || {}).reduce((a, b) => a + b, 0), bossTk: Object.values(s.dungeon.bossTickets || {}).reduce((a, b) => a + b, 0) }); } }
    s.offline.stage = { el: stage.el, tier: stage.tier };
    s.cleared[MM.speciesKey(stage.el, stage.tier)] = s.cleared[MM.speciesKey(stage.el, stage.tier)] || 1;
    log.maxGold = Math.max(log.maxGold, s.gold);
    manage(dayStart + 86000000);
  }
  log.goalDay = goalDone() ? day : null;
  log.levels = s.monsters.map(m => m.tier + '단' + m.level).join(' ');
  log.maxLv = Math.max(...s.monsters.map(m => m.level)); log.top5 = s.monsters.filter(m => m.tier === T).map(m => m.level).sort((a, b) => b - a).slice(0, 3).join('/');
  log.gold = s.gold;
  log.eqPlus = (s.equips || []).filter(e => MM.isEquipped(s, e)).map(e => e.tier + '단+' + e.plus).join(' ');
  log.altar = MM.RING.map(el => MM.altarOf(s, el).level).join('/');
  log.maxPlus = Math.max(0, ...(s.equips || []).map(e => e.plus)); log.feathers = MM.featherCount(s);
  log.rainbowEq = (s.equips || []).filter(e => e.el === 'rainbow').map(e => e.tier + '단+' + e.plus).join(' ');
  return log;
}

const res = [];
for (let p = 0; p < PLAYERS; p++) {
  if (process.env.ONLY && +process.env.ONLY !== p) continue;
  const r = simulatePlayer(1000 + p * 77); r.idx = p; res.push(r);
  if (process.env.JSON) process.stderr.write('플레이어 ' + p + ' 끝: ' + (r.goalDay == null ? '목표 못 감' : r.goalDay + '일') + '\n');
}
if (process.env.JSON) { require('fs').writeFileSync(process.env.JSON, JSON.stringify(res.map(r => ({ idx: r.idx, goalDay: r.goalDay, first: r.first, maxFirst: r.maxFirst, topMaxDays: r.topMaxDays, days: r.days, goldSeries: r.goldSeries, maxGold: r.maxGold, hi: r.hi, goldBlocked: r.goldBlocked, maxPlus: r.maxPlus, eqPlus: r.eqPlus, feathers: r.feathers, eqGold: r.eqGold, raids: r.raids, raidTries: r.raidTries, rainbowEq: r.rainbowEq, hiAt: r.hiAt, snaps: r.snaps, bosses: r.bosses, bossTries: r.bossTries, wasted: r.wasted, eqTries: r.eqTries, monTries: r.monTries, monGold: r.monGold, gacha: r.gacha, offered: r.offered, decomp: r.decomp, rbFromDecomp: r.rbFromDecomp, featherUsed: r.featherUsed, rbUsed: r.rbUsed, crafted: r.crafted, tickets: r.tickets, levelBlocked: r.levelBlocked, soulBlocked: r.soulBlocked })))); }
const med = a => { const x = a.slice().sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
const avg = (f) => (res.reduce((a, r) => a + f(r), 0) / res.length);
const fmt = d => d >= 90 ? '-' : d < 1 ? d.toFixed(2) : d.toFixed(1);
console.log('첫 n단계 (일, 중앙값 [최소~최대])  |  같은 종 소울 ' + B.SOULS_PER_SUMMON + '개 첫 누적 (소환 가능, 중앙값)  |  배수');
for (let tr = 2; tr <= T; tr++) {
  const f = res.map(r => r.first[tr] == null ? 99 : r.first[tr]), c = res.map(r => r.cum30[tr] == null ? 99 : r.cum30[tr]);
  const fm = med(f), cm = med(c);
  console.log(' ' + tr + '단계: ' + fmt(fm) + ' [' + fmt(Math.min(...f)) + '~' + fmt(Math.max(...f)) + ']  |  ' + (cm >= 90 ? '60일 안에 없음' : fmt(cm)) + '  |  ' + (fm < 90 && cm < 90 ? (cm / Math.max(fm, 0.01)).toFixed(1) + '배' : '-'));
}
console.log('판당 평균 행동 수:', avg(r => r.actions / Math.max(1, r.battles)).toFixed(1), '| 패배율', (avg(r => r.losses / Math.max(1, r.battles)) * 100).toFixed(1) + '%');
console.log('합성 성공', avg(r => r.fusions).toFixed(1), '실패', avg(r => r.fails).toFixed(1), '| 소환', avg(r => r.summons).toFixed(1), '| 소울 분해', avg(r => r.decomposed).toFixed(1), '| 버려진 소울', avg(r => r.wasted).toFixed(1), '| 먹인 소울', avg(r => r.fed).toFixed(1), '| 입장권 사용', avg(r => r.tickets).toFixed(1), '| 보스', avg(r => r.bosses).toFixed(1), '| 골드 대신 쓴 소울', avg(r => r.soulSwap).toFixed(1));
console.log('막힘(관리 시점 횟수): 골드', avg(r => r.goldBlocked).toFixed(1), '소울', avg(r => r.soulBlocked).toFixed(1), '레벨', avg(r => r.levelBlocked).toFixed(1));
console.log('최대 보유 골드', avg(r => r.maxGold).toFixed(0), '| 마지막 골드', avg(r => r.gold).toFixed(0), '| 최고 던전', avg(r => r.dungeonTop).toFixed(1));
console.log('끝날 때 최고 레벨(플레이어별):', res.map(r => r.maxLv).join(', '));
console.log('예시 마지막 몬스터:', res[0].levels);
if (OPT) {
  console.log('[최고 단계 막힘, 관리 시점 횟수] 주재료 레벨', avg(r => (r.hi || {}).mainLv || 0).toFixed(0), '| 부재료 레벨', avg(r => (r.hi || {}).subLv || 0).toFixed(0), '| 골드', avg(r => (r.hi || {}).gold || 0).toFixed(0), '| 소울', avg(r => (r.hi || {}).soul || 0).toFixed(0), '| 짝 없음', avg(r => (r.hi || {}).noPair || 0).toFixed(0), '| 기타', avg(r => (r.hi || {}).other || 0).toFixed(0));
  console.log('[최적화] 스테이지 = 파티 최고 단계 + 평균', avg(r => (r.stageSum || 0) / Math.max(1, r.stageWins || 0)).toFixed(2), '| 장비 제작', avg(r => r.crafted).toFixed(1), '| 장비 강화 시도', avg(r => r.eqTries).toFixed(0), '(골드 ' + avg(r => r.eqGold).toFixed(0) + ')', '| 샤들링 강화 시도', avg(r => r.monTries).toFixed(0), '(골드 ' + avg(r => r.monGold).toFixed(0) + ')');
  console.log('[최적화] 뽑기', avg(r => r.gacha).toFixed(0), '| 제단에 바친 소울', avg(r => r.offered).toFixed(0), '| 레이드 클리어', avg(r => r.raids).toFixed(1), '(페이즈 시도 ' + avg(r => r.raidTries).toFixed(0) + ')');
  console.log('[최적화] 예시 장착 장비:', res[0].eqPlus, '| 제단 레벨(불/물/풀/빛/어둠 순서 아님, RING 순):', res[0].altar);
}
