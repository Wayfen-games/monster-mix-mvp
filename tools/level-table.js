// 레벨 표 만들기 [사용자 확정 10-26]: 그 단계 스테이지에서 소환 레벨 → 합성 조건 레벨 판수 = 10 × 1.5^(단계-1)
// 경험치 통 = EXP_A × EXP_R^(레벨-1), 승리 경험치 = EXP_WIN × EXP_WIN_GROWTH^(단계-1). 합성 조건 = 다음 단계 소환 레벨.
// 단계 만렙 = (n+2)단계 소환 레벨 (최대 MAX_LEVEL). 사용: node tools/level-table.js → balance.js에 붙여 넣기
const A = 5.5, R = 1.074, W = 10, WG = 1.3, RUN0 = 10, RUNG = 1.5, TIERS = 30, MAXL = 300;
const bar = L => Math.round(A * Math.pow(R, L - 1));
const S = [1];
for (let n = 1; n <= TIERS + 1; n++) {
  const need = RUN0 * Math.pow(RUNG, n - 1) * Math.round(W * Math.pow(WG, n - 1));
  let L = S[n - 1], acc = 0; while (acc < need) { acc += bar(L); L++; } S.push(L);
}
const summon = S.slice(0, TIERS).map(x => Math.min(MAXL, x));
const fuse = S.slice(1, TIERS).map(x => Math.min(MAXL, x));
const max = summon.map((x, i) => Math.min(MAXL, S[i + 2]));
max[TIERS - 1] = MAXL; max[TIERS - 2] = Math.max(max[TIERS - 2], Math.min(MAXL, S[TIERS]));
console.log('SUMMON_LEVEL: ' + JSON.stringify(summon) + ',');
console.log('FUSE_LEVEL_REQ: ' + JSON.stringify(fuse) + ',');
console.log('TIER_MAX_LEVEL: ' + JSON.stringify(max) + ',');
if (require.main === module && process.argv[2] === 'check') {
  for (let n = 1; n < TIERS; n++) { let e = 0; for (let L = summon[n - 1]; L < fuse[n - 1]; L++) e += bar(L); console.log(n, (e / Math.round(W * Math.pow(WG, n - 1))).toFixed(1), Math.round(RUN0 * Math.pow(RUNG, n - 1))); }
}
