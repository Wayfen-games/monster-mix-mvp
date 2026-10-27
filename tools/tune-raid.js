// 레이드 난이도 맞추기 [10-27]: k단계 레이드 = (5k)단계 샤들링 5마리(속성별 1마리, 합성 조건 레벨, 맨 위 단계는 소환~만렙 중간) + (5k)단계 장비 +10 [사용자 10-27 12:25]
// 페이즈마다: 예고에 대응하면 약 85% (3페이즈 다 합쳐 약 60%, 지면 그 페이즈부터 다시), 이긴 판 중앙 라운드 약 10 / 15 / 25 (합계 약 10분)
// 사용: node tools/tune-raid.js [판수=200]
const MM = require('./load');
const B = MM.BALANCE, N = +process.argv[2] || 200, TARGET = [10, 15, 25], WIN = 0.85, NAIVE = 0.3;
function party(k) { const t = MM.raidRefTier(k), lv = t < B.MAX_TIER ? MM.fuseLevelReq(t) : Math.round((MM.summonLevel(t) + MM.maxLevel(t)) / 2); const eq = 1 + B.EQUIP_BASE_PER_TIER * t + B.EQUIP_PER_PLUS * 10; return MM.RING.map((el, i) => ({ id: i + 1, el, tier: t, level: lv, mult: eq })); }
function measure(k, ph) {
  const out = {};
  for (const pol of ['naive', 'smart']) { const rng = MM.seededRng(91 + k * 7 + ph); let w = 0; const rs = [];
    for (let i = 0; i < N; i++) { const bt = MM.simulateRaidPhase(party(k), k, ph, rng, pol); if (bt.result === 'win') { w++; rs.push(bt.round); } }
    rs.sort((a, b) => a - b); out[pol] = { win: w / N, rounds: rs.length ? rs[Math.floor(rs.length / 2)] : 99 }; }
  return out;
}
for (const k of MM.raidTiers()) for (let ph = 0; ph < 3; ph++) {
  let best = null;
  const score = m => Math.max(0, m.naive.win - NAIVE) * 10 + Math.abs(m.smart.win - WIN) * 10 + Math.abs(m.smart.rounds - TARGET[ph]) / (TARGET[ph] / 10);
  const search = (hs, as) => { for (const h of hs) for (const a of as) { B.RAID_HP_MULT[k - 1][ph] = h; B.RAID_ATK_MULT[k - 1][ph] = a; const m = measure(k, ph), sc = score(m); if (!best || sc < best.sc) best = { h, a, m, sc }; } };
  const range = (c, step, n) => Array.from({ length: 2 * n + 1 }, (_, i) => +(c + (i - n) * step).toFixed(3)).filter(x => x > 0);
  search(range([5, 10, 12][ph], [1.5, 1.5, 2][ph], 3), range([2.5, 0.9, 0.7][ph], [0.4, 0.15, 0.1][ph], 3));
  search(range(best.h, [0.3, 0.5, 0.8][ph], 2), range(best.a, 0.08, 2));
  B.RAID_HP_MULT[k - 1][ph] = best.h; B.RAID_ATK_MULT[k - 1][ph] = best.a;
  console.log(k + '단계 레이드 ' + (ph + 1) + '페이즈: 체력 ×' + best.h + ' 공격 ×' + best.a + ' → 공격만 ' + Math.round(best.m.naive.win * 100) + '% · 대응 ' + Math.round(best.m.smart.win * 100) + '% (이긴 판 중앙 ' + best.m.smart.rounds + '라운드)');
}
console.log('RAID_HP_MULT: ' + JSON.stringify(B.RAID_HP_MULT));
console.log('RAID_ATK_MULT: ' + JSON.stringify(B.RAID_ATK_MULT));
