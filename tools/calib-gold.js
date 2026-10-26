// 합성 골드 단계별 자동 조정: 첫 n단계 목표 시점에 맞춤. 사용: N=14 G0='[...]' node tools/calib-gold.js [드랍 비율=0.3] [반복=5]
// 합성 골드를 단계별로 조정해 첫 n단계 목표 시점에 맞춤
const { execFileSync } = require('child_process');
const R = +process.argv[2] || 0.16, ITER = +process.argv[3] || 5, N = process.env.N || '10';
const target = { 3: 0.5, 4: 1.5, 5: 4, 6: 7, 7: 11, 8: 17, 9: 25, 10: 35 };
let gold = process.env.G0 ? JSON.parse(process.env.G0) : [100, 1300, 4200, 14000, 21000, 37000, 72000, 125000, 200000, 390000];
const drops = []; { let v = 0.5; for (let i = 0; i < 10; i++) { drops.push(v); v *= R; } }
function run(g) {
  const ovr = JSON.stringify({ SOUL_DROP_AVG: drops, FUSION_GOLD: g });
  const out = execFileSync('node', ['tools/month-sim.js', N, '60'], { cwd: '/home/claude/monster-mix-mvp', env: Object.assign({}, process.env, { OFFLINE_CLAIMS: '2', OVR: ovr }), maxBuffer: 1e8 }).toString();
  const res = {}, ratio = {};
  out.split('\n').forEach(l => { const m = l.match(/^ (\d+)단계: (\S+) .*\|  (\S+).*\|  (\S+)/); if (m) { res[+m[1]] = m[2] === '-' ? 99 : +m[2]; ratio[+m[1]] = m[4]; } });
  return { res, ratio, out };
}
for (let it = 0; it < ITER; it++) {
  const { res, ratio, out } = run(gold);
  console.log('iter', it, 'gold', JSON.stringify(gold.map(Math.round)));
  console.log('  first', JSON.stringify(res), 'ratio', JSON.stringify(ratio));
  if (it === ITER - 1) { console.log(out.split('\n').slice(10, 16).join('\n')); break; }
  for (let n = 3; n <= 10; n++) {
    const sim = Math.min(res[n] || 99, 70), t = target[n];
    let f = Math.pow(t / Math.max(sim, 0.05), +(process.env.DAMP || 0.4));
    f = Math.max(0.4, Math.min(3, f));
    gold[n - 2] = Math.round(gold[n - 2] * f / 100) * 100;
  }
  // 단조 증가 유지
  for (let k = 1; k < gold.length; k++) if (gold[k] < gold[k - 1] * 1.1) gold[k] = Math.round(gold[k - 1] * 1.1 / 100) * 100;
}
