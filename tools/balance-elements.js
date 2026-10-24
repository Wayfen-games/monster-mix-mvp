// 속성별 스탯 균형 맞추기 (실제 게임 조건: 상성 켜짐, 적도 속성 성격을 가짐).
// 같은 속성 3마리 파티의 스테이지 승률이 속성마다 비슷해지게, 속성별 전체 배율을 작은 걸음으로 반복 조정.
// 속성 성격(어느 스탯이 높은지)은 유지. 사용: node tools/balance-elements.js
const MM = require('./load');
const B = MM.BALANCE;
const base = JSON.parse(JSON.stringify(B.ELEMENT_STAT_MOD));
const g = {}; MM.RING.forEach(e => g[e] = 1);
function apply() { MM.RING.forEach(e => B.ELEMENT_STAT_MOD[e] = { hp: base[e].hp * g[e], atk: base[e].atk * g[e], def: base[e].def * g[e], spd: base[e].spd }); }
function rate(e, seed, n) {
  const rng = MM.seededRng(seed); let w = 0;
  for (let i = 0; i < n; i++) { const t = 2 + (i % 3); const p = [0, 1, 2].map(() => ({ el: e, tier: t, level: 14 }));
    if (MM.simulateBattle(p, MM.stageEnemies(MM.RING[i % 5], t, rng), rng).result === 'win') w++; }
  return w / n;
}
let best = null;
for (let it = 0; it < 40; it++) {
  apply();
  const n = it < 25 ? 2500 : 6000;
  const r = {}; MM.RING.forEach((e, i) => r[e] = rate(e, 1000 + it * 13 + i, n));
  const mean = MM.RING.reduce((a, e) => a + r[e], 0) / 5;
  const spread = Math.max(...MM.RING.map(e => r[e])) - Math.min(...MM.RING.map(e => r[e]));
  if (!best || spread < best.spread) best = { spread, g: { ...g }, r: { ...r } };
  if (it % 5 === 0 || spread < 0.03) console.log('반복', it, MM.RING.map(e => e + ' ' + (r[e] * 100).toFixed(1)).join(' / '), '차이', (spread * 100).toFixed(1) + '%p');
  if (spread < 0.025 && n === 6000) break;
  const k = it < 25 ? 0.10 : 0.05;
  MM.RING.forEach(e => { g[e] *= Math.exp(-k * (r[e] - mean)); });
  const geo = Math.exp(MM.RING.reduce((a, e) => a + Math.log(g[e]), 0) / 5); MM.RING.forEach(e => g[e] /= geo);
}
const out = {};
MM.RING.forEach(e => out[e] = { hp: +(base[e].hp * best.g[e]).toFixed(3), atk: +(base[e].atk * best.g[e]).toFixed(3), def: +(base[e].def * best.g[e]).toFixed(3), spd: base[e].spd });
console.log('최선', MM.RING.map(e => e + ' ' + (best.r[e] * 100).toFixed(1) + '%').join(' / '), '차이', (best.spread * 100).toFixed(1) + '%p');
console.log(JSON.stringify(out));
