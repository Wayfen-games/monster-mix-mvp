// 한 달 시뮬레이터: 실제 게임 규칙(js/logic.js)으로 플레이어 한 명의 30~60일을 통째로 돌린다.
// 기준(사용자 확정): 하루 = 자동 반복 한도(AUTO_REPEAT_DAILY판) + 요일 던전 2판 + 오프라인 보상 1회(12시간).
// 직접 전투 0. 5단계 던전 추가 보너스는 제외.
// 사용: node tools/month-sim.js [플레이어 수=12] [최대 일수=60]
const MM = require('./load');
const B = MM.BALANCE, T = B.MAX_TIER;
const PLAYERS = +process.argv[2] || 12, MAX_DAYS = +process.argv[3] || 60;
const OFFLINE_CLAIMS_PER_DAY = +(process.env.OFFLINE_CLAIMS || 1);
// 실험용 덮어쓰기: DROP=드랍 배율, EXPA, EXPP, EXPW=승리 경험치 배율, OVR='{"키":값}'
if (process.env.DROP) B.SOUL_DROP_AVG = B.SOUL_DROP_AVG.map(v => v * +process.env.DROP);
if (process.env.EXPA) B.EXP_A = +process.env.EXPA;
if (process.env.EXPR) B.EXP_R = +process.env.EXPR;
if (process.env.EXPW) B.EXP_WIN = B.EXP_WIN * +process.env.EXPW;
if (process.env.OVR) Object.assign(B, JSON.parse(process.env.OVR));

function makeCache() { return new Map(); }

function winRateEst(party, mk, rng, cache, key, n) {
  if (cache.has(key)) return cache.get(key);
  let w = 0;
  for (let i = 0; i < n; i++) if (MM.simulateBattle(party, mk(), rng).result === 'win') w++;
  const r = w / n; cache.set(key, r); return r;
}
const sig = ms => ms.map(m => m.el + m.tier + ':' + m.level).sort().join(',');

function simulatePlayer(seed) {
  const rng = MM.seededRng(seed);
  const t0 = Date.UTC(2026, 10, 2, 0); // 2026-11-02 월요일 09시 KST
  const s = MM.newState(t0);
  const cache = makeCache();
  const log = { e5Day: {}, goalDay: null, fusions: 0, fails: 0, goldBlocked: 0, soulBlocked: 0, levelBlocked: 0,
    actions: 0, battles: 0, wasted: 0, decomposed: 0, summons: 0, losses: 0, maxGold: 0, levelAtGoal: null, dungeonTop: 0 };

  // ---- 튜토리얼 ----
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
  const goalDone = () => MM.RING.every(el => s.monsters.some(m => m.el === el && m.tier === T));

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
  function bestCandidate() {
    let best = null;
    for (const main of s.monsters) {
      if (!MM.canBeMain(main)) continue;
      if (main.tier + 1 === T && s.monsters.some(m => m.el === main.el && m.tier === T)) continue; // 이미 5단계 있음
      for (const sub of s.monsters) {
        if (!MM.isPair(main, sub)) continue;
        // 부재료가 그 속성의 유일한 최고 단계 몬스터면 아끼기 (5단계 경로 보호)
        const score = main.tier * 10 + (need(main.el) > 0 ? 5 : 0) - sub.tier * 0.1 + main.stack;
        if (!best || score > best.score) best = { main, sub, score };
      }
    }
    return best;
  }

  function manage(now) {
    // 1) 소환 (합성 비용용 1개는 남김)
    for (const sp of MM.allSpecies()) {
      while ((s.souls[sp.key] || 0) >= B.SOULS_PER_SUMMON + 1) {
        if (sp.tier === T && s.monsters.some(m => m.el === sp.el && m.tier === T)) break;
        if (s.monsters.filter(m => m.el === sp.el && m.tier === sp.tier).length >= 3) break; // 같은 종 3마리까지만
        MM.summon(s, sp.el, sp.tier); log.summons++;
      }
    }
    // 2) 합성 반복
    for (let guard = 0; guard < 60; guard++) {
      const c = bestCandidate();
      if (!c) break;
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
      if (!chk.ok) {
        if (chk.reasons.some(r => /골드/.test(r))) log.goldBlocked++;
        else if (chk.reasons.some(r => /소울/.test(r))) log.soulBlocked++;
        else if (chk.reasons.some(r => /Lv/.test(r))) log.levelBlocked++;
        return c; // 막힌 후보 → 파티로 키우기
      }
      const r = MM.attemptFusion(s, c.main.id, c.sub.id, soulEl, rng);
      if (r.success) { log.fusions++; if (r.monster.tier === T && log.e5Day[r.monster.el] == null) log.e5Day[r.monster.el] = (now - t0) / 86400000; }
      else log.fails++;
    }
    return null;
  }

  function chooseStage(party) {
    // 깰 수 있는(추정 승률 55% 이상) 가장 높은 단계, 속성은 진행이 가장 늦은 속성
    const maxT = Math.max(...party.map(m => m.tier));
    let tier = 1;
    for (let st = Math.min(T, maxT); st >= 1; st--) {
      const key = sig(party) + '|' + st;
      const r = winRateEst(party, () => MM.stageEnemies(MM.RING[Math.floor(rng() * 5)], st, rng), rng, cache, key, 40);
      if (r >= 0.55) { tier = st; break; }
    }
    const els = MM.RING.slice().sort((a, b) => need(b) - need(a) || rng() - 0.5);
    return { el: els[0], tier };
  }

  let day = 0;
  for (day = 0; day < MAX_DAYS && !goalDone(); day++) {
    const dayStart = t0 + day * 86400000;
    // 오프라인 보상 (전날 지정 스테이지)
    for (let c = 0; c < OFFLINE_CLAIMS_PER_DAY; c++) {
      s.offline.lastSeen = dayStart - 12 * 3600000;
      const off = MM.claimOffline(s, dayStart, rng);
      if (off) off.drops.forEach(d => log.wasted += d.wasted);
    }
    // 던전 2판
    MM.refreshDaily(s, dayStart);
    let blocked = manage(dayStart);
    pickParty(blocked ? [blocked.main.id, blocked.sub.id] : []);
    const dEl = MM.dungeonElementFor(dayStart);
    for (let k = 0; k < B.DUNGEON_DAILY; k++) {
      const party = MM.RING.length && s.party.map(id => MM.getMonster(s, id));
      const els = dEl ? [dEl] : MM.RING.slice().sort((a, b) => need(b) - need(a)).slice(0, 3);
      let tier = 0;
      for (let dt = T; dt >= 1; dt--) {
        if (!MM.dungeonUnlocked(s, dt)) continue;
        const r = winRateEst(party, () => MM.dungeonEnemies(els, dt), rng, cache, sig(party) + '|D' + dt + els.join(), 30);
        if (r >= 0.5) { tier = dt; break; }
        if (s.dungeon.cleared[dt]) { tier = -dt; break; } // 소탕
      }
      if (!tier) continue;
      MM.useDungeonEntry(s, dayStart);
      const dt = Math.abs(tier), en = MM.dungeonEnemies(els, dt);
      let win = true;
      if (tier > 0) { const bt = MM.simulateBattle(party, en, rng); log.actions += bt.log.length; log.battles++; win = bt.result === 'win'; }
      if (win) { const r = MM.grantDungeonWin(s, dt, en, rng, { noTopBonus: true }); r.drops.forEach(d => log.wasted += d.wasted); log.dungeonTop = Math.max(log.dungeonTop, dt); }
    }
    // 자동 반복
    blocked = manage(dayStart);
    pickParty(blocked ? [blocked.main.id, blocked.sub.id] : []);
    let party = s.party.map(id => MM.getMonster(s, id));
    let stage = chooseStage(party);
    for (let run = 0; run < B.AUTO_REPEAT_DAILY; run++) {
      if (run % 20 === 19) {
        blocked = manage(dayStart + run * 30000);
        pickParty(blocked ? [blocked.main.id, blocked.sub.id] : []);
        party = s.party.map(id => MM.getMonster(s, id));
        stage = chooseStage(party);
        if (goalDone()) break;
      }
      const en = MM.stageEnemies(stage.el, stage.tier, rng);
      const bt = MM.simulateBattle(party, en, rng);
      log.actions += bt.log.length; log.battles++;
      if (bt.result === 'win') { const r = MM.grantStageWin(s, stage.el, stage.tier, en, rng); r.drops.forEach(d => log.wasted += d.wasted); }
      else { log.losses++; s.stats.battlesLost++; }
    }
    s.offline.stage = { el: stage.el, tier: stage.tier };
    s.cleared[MM.speciesKey(stage.el, stage.tier)] = s.cleared[MM.speciesKey(stage.el, stage.tier)] || 1;
    log.maxGold = Math.max(log.maxGold, s.gold);
    manage(dayStart + 86000000);
  }
  log.goalDay = goalDone() ? day : null;
  log.levels = s.monsters.map(m => m.tier + '단' + m.level).join(' ');
  log.gold = s.gold;
  return log;
}

const res = [];
for (let p = 0; p < PLAYERS; p++) res.push(simulatePlayer(1000 + p * 77));
const days = res.map(r => r.goalDay == null ? MAX_DAYS + 1 : r.goalDay).sort((a, b) => a - b);
const med = days[Math.floor(days.length / 2)];
const avg = (f) => (res.reduce((a, r) => a + f(r), 0) / res.length);
console.log('5단계 5종 완성일:', days.map(d => d > MAX_DAYS ? '미완' : d).join(', '), '| 중앙값', med > MAX_DAYS ? '미완' : med + '일');
console.log('5단계 속성별 첫 완성일(평균):', MM.RING.map(e => e + ' ' + avg(r => r.e5Day[e] == null ? MAX_DAYS : r.e5Day[e]).toFixed(1)).join(' / '));
console.log('판당 평균 행동 수:', avg(r => r.actions / Math.max(1, r.battles)).toFixed(1), '| 패배율', (avg(r => r.losses / Math.max(1, r.battles)) * 100).toFixed(1) + '%');
console.log('합성 성공', avg(r => r.fusions).toFixed(1), '실패', avg(r => r.fails).toFixed(1), '| 소환', avg(r => r.summons).toFixed(1), '| 소울 분해', avg(r => r.decomposed).toFixed(1), '| 버려진 소울', avg(r => r.wasted).toFixed(1));
console.log('막힘(관리 시점 횟수): 골드', avg(r => r.goldBlocked).toFixed(1), '소울', avg(r => r.soulBlocked).toFixed(1), '레벨', avg(r => r.levelBlocked).toFixed(1));
console.log('최대 보유 골드', avg(r => r.maxGold).toFixed(0), '| 마지막 골드', avg(r => r.gold).toFixed(0), '| 최고 던전', avg(r => r.dungeonTop).toFixed(1));
console.log('예시 마지막 몬스터:', res[0].levels);
