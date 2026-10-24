// 규칙 테스트. 브라우저(test.html)와 Node(node js/tests.js) 둘 다에서 돈다.
(function () {
  var G = typeof globalThis !== 'undefined' ? globalThis : window;
  if (typeof require !== 'undefined' && !G.MM) {
    require('./balance.js'); require('./data.js'); require('./logic.js');
  }
  var MM = G.MM, results = [];
  function check(name, cond, detail) { results.push({ name: name, ok: !!cond, detail: detail || '' }); }
  function close(a, b) { return Math.abs(a - b) < 1e-9; }

  // ---- 부재료 짝 (원형 배치) ----
  var expectPartners = { fire: ['dark', 'grass'], grass: ['fire', 'water'], water: ['grass', 'light'], light: ['water', 'dark'], dark: ['light', 'fire'] };
  Object.keys(expectPartners).forEach(function (el) {
    var got = MM.partnersOf(el).slice().sort().join(','), want = expectPartners[el].slice().sort().join(',');
    check('부재료 짝: ' + el, got === want, got);
  });

  // ---- 성공률과 스택 ----
  check('기본 성공률 1단계 80%', MM.successRate(1, 0) === 0.8);
  check('기본 성공률 4단계 25%', MM.successRate(4, 0) === 0.25);
  check('스택 1: +5%p', close(MM.stackBonus(1), 0.05));
  check('스택 2: +12%p (5+7)', close(MM.stackBonus(2), 0.12));
  check('스택 3: +21%p (5+7+9)', close(MM.stackBonus(3), 0.21));
  check('2단계 주재료 스택 2 → 72%', MM.successRate(2, 2) === 0.72, MM.successRate(2, 2));
  check('8스택이면 4단계도 100%', MM.successRate(4, 8) === 1);
  for (var t = 1; t <= 4; t++) for (var k = 0; k < 8; k++) {
    if (MM.successRate(t, k + 1) < MM.successRate(t, k)) check('스택이 늘면 성공률이 줄지 않음', false, t + '/' + k);
  }
  check('스택이 늘면 성공률이 줄지 않음 (전 단계)', true);

  // ---- 합성 조건 ----
  var s = MM.newState();
  var f1 = MM.addMonster(s, 'fire', 1), g1 = MM.addMonster(s, 'grass', 1), w1 = MM.addMonster(s, 'water', 1);
  check('불1+풀1 가능 (짝)', MM.canFuse(f1, g1));
  check('불1+물1 불가 (짝 아님)', !MM.canFuse(f1, w1));
  var f2 = MM.addMonster(s, 'fire', 2), f3 = MM.addMonster(s, 'fire', 3), f5 = MM.addMonster(s, 'fire', 5), d4 = MM.addMonster(s, 'dark', 4);
  check('불2+불1 가능', MM.canFuse(f2, f1));
  check('불2+불2 불가 (부재료는 한 단계 아래)', !MM.canFuse(f2, MM.addMonster(s, 'fire', 2)));
  check('불3+불1 불가', !MM.canFuse(f3, f1));
  check('5단계는 주재료 불가', !MM.canFuse(f5, d4));
  check('불5 부재료로 불가 (단계 불일치)', !MM.canFuse(d4, f5));
  check('1단계끼리 비용은 골드만', MM.fusionCost(f1, g1).soulTier === null);
  var c = MM.fusionCost(f3, MM.addMonster(s, 'dark', 2));
  check('3단계 주재료 비용: 2단계 소울, 불/어둠 중 선택', c.soulTier === 2 && c.soulOptions.join() === 'fire,dark', JSON.stringify(c));

  // ---- 합성 실행: 실패 ----
  s = MM.newState(); s.gold = 10000;
  var a = MM.addMonster(s, 'water', 2), b = MM.addMonster(s, 'light', 1);
  var noSoul = MM.attemptFusion(s, a.id, b.id, 'water', function () { return 0.99; });
  check('소울 없으면 합성 거절', !!noSoul.error, noSoul.error);
  s.souls.water1 = 3;
  var goldBefore = s.gold;
  var r = MM.attemptFusion(s, a.id, b.id, 'water', function () { return 0.99; });
  check('실패: 재료 둘 다 남음', !r.success && MM.getMonster(s, a.id) && MM.getMonster(s, b.id));
  check('실패: 주재료 스택 +1', MM.getMonster(s, a.id).stack === 1);
  check('실패: 다음 성공률 65%', r.nextRate === 0.65, r.nextRate);
  check('실패해도 비용 지불 (골드·소울)', s.gold === goldBefore - MM.BALANCE.FUSION_GOLD[1] && s.souls.water1 === 2);

  // ---- 합성 실행: 성공 ----
  s.souls.light1 = 1;
  r = MM.attemptFusion(s, a.id, b.id, 'light', function () { return 0; });
  check('성공: 결과는 주재료 속성, 한 단계 위', r.success && r.monster.el === 'water' && r.monster.tier === 3);
  check('성공: 재료 소멸', !MM.getMonster(s, a.id) && !MM.getMonster(s, b.id));
  check('성공: 도감 등록', s.dex.water3 === true);
  check('부재료 속성(빛) 소울을 고르면 빛 소울이 빠짐', s.souls.light1 === 0 && s.souls.water1 === 2);

  // ---- 소울 소환 ----
  s = MM.newState(); s.souls.fire2 = 9;
  check('소울 9개로는 소환 불가', MM.summon(s, 'fire', 2) === null);
  s.souls.fire2 = 10;
  var sm = MM.summon(s, 'fire', 2);
  check('소울 10개 = 1마리', sm && sm.monster.tier === 2 && s.souls.fire2 === 0);

  // ---- 스테이지와 드랍 ----
  var en = MM.stageEnemies('fire', 3);
  check('3단계 스테이지: 불3 + 짝 속성 2단계 2마리', en[0].el === 'fire' && en[0].tier === 3 && en[1].tier === 2 && en[2].tier === 2 && MM.partnersOf('fire').indexOf(en[1].el) >= 0 && MM.partnersOf('fire').indexOf(en[2].el) >= 0);
  var e1 = MM.stageEnemies('water', 1);
  check('1단계 스테이지: 1단계 3마리', e1.every(function (e) { return e.tier === 1; }));
  var allDrop = MM.rollDrops([{ el: 'light', tier: 4 }], function () { return 0; });
  check('4단계 적은 1~4단계 소울을 각각 굴림', Object.keys(allDrop).sort().join() === 'light1,light2,light3,light4');
  var none = MM.rollDrops([{ el: 'light', tier: 4 }], function () { return 0.999; });
  check('운 없으면 드랍 없음', Object.keys(none).length === 0);
  // 드랍률 통계 확인
  var rng = MM.seededRng(7), cnt = 0, N = 50000;
  for (var i = 0; i < N; i++) if (MM.rollDrops([{ el: 'fire', tier: 1 }], rng).fire1) cnt++;
  check('1단계 소울 드랍률 약 16%', Math.abs(cnt / N - 0.16) < 0.01, (cnt / N * 100).toFixed(1) + '%');

  // ---- 난이도 시뮬레이션: n단계 스테이지는 (n-1)단계 3마리가 있어야 ----
  function winRate(stageTier, partyTier, level, n) {
    var rr = MM.seededRng(stageTier * 100 + partyTier * 10 + level), w = 0;
    for (var j = 0; j < n; j++) {
      var party = [0, 1, 2].map(function () { return { el: MM.RING[Math.floor(rr() * 5)], tier: partyTier, level: level }; });
      if (MM.simulateBattle(party, MM.stageEnemies(MM.RING[j % 5], stageTier), rr).result === 'win') w++;
    }
    return w / n;
  }
  var table = [];
  check('시작 파티(1단계 Lv1)로 1단계 스테이지를 깸', winRate(1, 1, 1, 300) > 0.9);
  for (var st = 2; st <= 5; st++) {
    var low = winRate(st, st - 1, 1, 300), mid = winRate(st, st - 1, 7, 300), high = winRate(st, st - 1, 10, 300);
    var under = st >= 3 ? winRate(st, st - 2, 10, 300) : 0;
    table.push(st + '단계 스테이지: ' + (st - 1) + '단계 3마리 Lv1 ' + Math.round(low * 100) + '% / Lv7 ' + Math.round(mid * 100) + '% / Lv10 ' + Math.round(high * 100) + '%' + (st >= 3 ? ' · ' + (st - 2) + '단계 만렙 ' + Math.round(under * 100) + '%' : ''));
    check(st + '단계 스테이지: 아래 단계 Lv1로는 거의 못 깸', low < 0.1, Math.round(low * 100) + '%');
    check(st + '단계 스테이지: 아래 단계 만렙이면 깸', high > 0.85, Math.round(high * 100) + '%');
    if (st >= 3) check(st + '단계 스테이지: 두 단계 아래로는 못 깸', under < 0.05, Math.round(under * 100) + '%');
  }

  // ---- 출력 ----
  var pass = results.filter(function (x) { return x.ok; }).length;
  var summary = '통과 ' + pass + ' / ' + results.length;
  if (typeof document !== 'undefined' && document.getElementById('out')) {
    var out = document.getElementById('out');
    out.innerHTML = '<h2>' + summary + '</h2>' + results.map(function (x) {
      return '<div class="' + (x.ok ? 'ok' : 'bad') + '">' + (x.ok ? '✓ ' : '✗ ') + x.name + (x.detail ? ' <small>(' + x.detail + ')</small>' : '') + '</div>';
    }).join('') + '<h3>난이도 시뮬레이션</h3>' + table.map(function (t) { return '<div>' + t + '</div>'; }).join('');
  } else {
    results.forEach(function (x) { console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? ' (' + x.detail + ')' : '')); });
    table.forEach(function (t) { console.log(t); });
    console.log(summary);
    if (typeof process !== 'undefined' && pass !== results.length) process.exitCode = 1;
  }
})();
