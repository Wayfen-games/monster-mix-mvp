// 보스 난이도 맞추기: n단계 소환 레벨 3마리(서로 다른 속성)로 승률 약 70%, 이긴 판 중앙 약 20라운드
// 사용: node tools/tune-boss.js  → 맞춘 BOSS_HP_MULT / BOSS_ATK_MULT 출력
const MM = require('./load');
const B = MM.BALANCE, N = +process.argv[2] || 400;
const TARGET_WIN = +(process.env.WIN || 0.7), TARGET_ROUNDS = +(process.env.ROUNDS || 20);
const trios = [['fire', 'water', 'grass'], ['light', 'dark', 'fire'], ['water', 'grass', 'light'], ['dark', 'fire', 'water'], ['grass', 'light', 'dark']];
function measure(tier) {
  const rng = MM.seededRng(77 + tier);
  let w = 0; const rounds = [];
  for (let i = 0; i < N; i++) {
    const els = trios[i % trios.length], lv = MM.summonLevel(tier);
    const party = els.map((el, k) => ({ id: k + 1, el, tier, level: lv }));
    const bt = MM.simulateBossBattle(party, tier, rng);
    if (bt.result === 'win') { w++; rounds.push(bt.round); }
  }
  rounds.sort((a, b) => a - b);
  return { win: w / N, rounds: rounds.length ? rounds[Math.floor(rounds.length / 2)] : 99 };
}
for (let tier = 1; tier <= B.MAX_TIER; tier++) {
  // 2차원 격자 탐색 (체력 × 공격): 목표와의 차이가 가장 작은 조합
  let best = null;
  const score = m => Math.abs(m.win - TARGET_WIN) * 10 + Math.abs(m.rounds - TARGET_ROUNDS) / 2;
  const search = (hs, as) => { for (const h of hs) for (const a of as) { B.BOSS_HP_MULT[tier - 1] = h; B.BOSS_ATK_MULT[tier - 1] = a; const m = measure(tier), sc = score(m); if (!best || sc < best.sc) best = { h, a, m, sc }; } };
  const range = (c, step, n) => Array.from({ length: 2 * n + 1 }, (_, i) => +(c + (i - n) * step).toFixed(3)).filter(x => x > 0);
  search(range(8, 2, 3), range(1, 0.25, 3));
  search(range(best.h, 0.5, 3), range(best.a, 0.06, 3));
  search(range(best.h, 0.15, 2), range(best.a, 0.02, 2));
  B.BOSS_HP_MULT[tier - 1] = best.h; B.BOSS_ATK_MULT[tier - 1] = best.a;
  console.log(tier + '단계 보스: 체력 ×' + best.h + ' 공격 ×' + best.a + ' → 승률 ' + Math.round(best.m.win * 100) + '%, 이긴 판 중앙 ' + best.m.rounds + '라운드');
}
console.log('BOSS_HP_MULT: [' + B.BOSS_HP_MULT.map(x => +x.toFixed(2)).join(', ') + ']');
console.log('BOSS_ATK_MULT: [' + B.BOSS_ATK_MULT.map(x => +x.toFixed(2)).join(', ') + ']');
