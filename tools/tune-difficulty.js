// 스테이지·던전 적 능력치 보정(STAGE_ENEMY_MULT, DUNGEON_ENEMY_MULT)을 목표 승률에 맞춘다.
// 목표: n단계 스테이지 = n단계 3마리(서로 다른 속성, 파티 보너스 포함) 합성 조건 레벨에서 60%
//       던전 n단계 = n단계 3마리 합성 조건 레벨에서 40% [10-26: 스테이지보다 어렵게] (맨 위 단계는 소환~만렙 중간 레벨)
// 사용: node tools/tune-difficulty.js
const MM = require('./load');
const B = MM.BALANCE, T = B.MAX_TIER;
const N = +(process.env.N || 800), DT = +(process.env.DT || 0.4);
const topRef = () => MM.fuseLevelReq(T); // [10-27] 맨 위 단계도 같은 규칙 (10단계 스테이지 = 11단계 보스 + 10단계 쫄)
function trio(t, lv, j) { const els = [MM.RING[j % 5], MM.RING[(j + 1) % 5], MM.RING[(j + 3) % 5]]; return els.map(el => ({ el, tier: t, level: lv })); }
function stageRate(st, t, lv, seed, n) { const rng = MM.seededRng(seed); let w = 0;
  for (let j = 0; j < n; j++) if (MM.simulateBattle(trio(t, lv, j), MM.stageEnemies(MM.RING[j % 5], st, rng), rng).result === 'win') w++; return w / n; }
function dungeonRate(dt, t, lv, seed, n) { const rng = MM.seededRng(seed); let w = 0;
  for (let j = 0; j < n; j++) if (MM.simulateBattle(trio(t, lv, j), MM.dungeonEnemies([MM.RING[j % 5]], dt), rng).result === 'win') w++; return w / n; }
function search(get, set, rateFn, target) {
  let lo = 0.2, hi = 3;
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; set(mid); if (rateFn() > target) lo = mid; else hi = mid; }
  set(+((lo + hi) / 2).toFixed(3));
}
const sm = [], dm = [];
if (!process.env.DUNGEON_ONLY) B.STAGE_ENEMY_MULT = Array(T).fill(1); B.DUNGEON_ENEMY_MULT = Array(T).fill(1);
for (let st = 1; st <= T; st++) {
  const lv = MM.fuseLevelReq(st);
  if (!process.env.DUNGEON_ONLY) search(null, v => B.STAGE_ENEMY_MULT[st - 1] = v, () => stageRate(st, st, lv, 11 * st, N), 0.6);
  sm.push(B.STAGE_ENEMY_MULT[st - 1]);
  search(null, v => B.DUNGEON_ENEMY_MULT[st - 1] = v, () => dungeonRate(st, st, lv, 17 * st, N), DT);
  dm.push(B.DUNGEON_ENEMY_MULT[st - 1]);
}
console.log('STAGE_ENEMY_MULT', JSON.stringify(sm));
console.log('DUNGEON_ENEMY_MULT', JSON.stringify(dm));
console.log('\n확인 (3000판씩)');
for (let st = 1; st <= T; st++) {
  const r = [];
  r.push(st + '단계 3마리 소환Lv' + MM.summonLevel(st) + ' ' + Math.round(stageRate(st, st, MM.summonLevel(st), 900 + st, 3000) * 100) + '%');
  if (st < T) r.push('조건Lv' + MM.fuseLevelReq(st) + ' ' + Math.round(stageRate(st, st, MM.fuseLevelReq(st), 910 + st, 3000) * 100) + '%');
  r.push('만렙' + MM.maxLevel(st) + ' ' + Math.round(stageRate(st, st, MM.maxLevel(st), 920 + st, 3000) * 100) + '%');
  if (st > 1) r.push((st - 1) + '단계 만렙 ' + Math.round(stageRate(st, st - 1, MM.maxLevel(st - 1), 930 + st, 3000) * 100) + '%');
  if (st < T) r.push((st + 1) + '단계 소환Lv ' + Math.round(stageRate(st, st + 1, MM.summonLevel(st + 1), 940 + st, 3000) * 100) + '%');
  console.log('스테이지 ' + st + ': ' + r.join(' · '));
  console.log('  던전 ' + st + ': ' + st + '단계 소환Lv ' + Math.round(dungeonRate(st, st, MM.summonLevel(st), 950 + st, 3000) * 100) + '% · 조건Lv ' + Math.round(dungeonRate(st, st, st < T ? MM.fuseLevelReq(st) : topRef(), 955 + st, 3000) * 100) + '% · Lv30 ' + Math.round(dungeonRate(st, st, MM.maxLevel(st), 960 + st, 3000) * 100) + '%');
}
