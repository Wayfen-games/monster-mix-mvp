// 규칙 테스트 (v2). 브라우저(test.html)와 Node(node js/tests.js) 둘 다에서 돈다.
(function () {
  var G = typeof globalThis !== 'undefined' ? globalThis : window;
  if (typeof require !== 'undefined' && !G.MM) {
    require('./balance.js'); require('./data.js'); require('./logic.js');
  }
  var MM = G.MM, B = MM.BALANCE, results = [];
  function check(name, cond, detail) { results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) }); }
  function close(a, b) { return Math.abs(a - b) < 1e-9; }
  var ALWAYS = function () { return 0; }, NEVER = function () { return 0.999999; };

  // ---- 부재료 짝: 양옆만, 같은 속성 불가 ----
  check('불의 짝 = 풀·어둠', MM.partnersOf('fire').slice().sort().join() === 'dark,grass');
  check('같은 속성은 부재료 불가', !MM.elementCompatible('fire', 'fire'));
  check('불 주재료에 물 부재료 불가', !MM.elementCompatible('fire', 'water'));

  // ---- 상성 ----
  check('풀 → 물 1.3배', MM.elementMult('grass', 'water') === 1.3);
  check('물 → 불 1.3배', MM.elementMult('water', 'fire') === 1.3);
  check('불 → 풀 1.3배', MM.elementMult('fire', 'grass') === 1.3);
  check('물 → 풀 0.8배', MM.elementMult('water', 'grass') === 0.8);
  check('어둠 → 빛 1.3배', MM.elementMult('dark', 'light') === 1.3);
  check('빛 → 어둠 1.3배 (서로 강함)', MM.elementMult('light', 'dark') === 1.3);
  check('불 → 빛 보통', MM.elementMult('fire', 'light') === 1);

  // ---- 능력치 ----
  var s1 = MM.calcStats('fire', 1, 1), s2 = MM.calcStats('fire', 2, 1), s30 = MM.calcStats('fire', 1, 30);
  check('단계당 ×1.5', Math.abs(s2.hp / s1.hp - 1.5) < 0.05, (s2.hp / s1.hp).toFixed(2));
  check('레벨당 +1% (Lv30 = 1.29배)', Math.abs(MM.levelMult(30) - 1.29) < 1e-9);
  check('만렙 아래 단계 < 다음 단계 Lv1', MM.tierMult(1) * MM.levelMult(30) < MM.tierMult(2) * MM.levelMult(1));
  check('크리티컬 1단계 4%, 5단계 8%', close(MM.calcStats('fire', 1, 1).crit, 0.04) && close(MM.calcStats('fire', 5, 1).crit, 0.08));
  check('파티 보너스: 서로 다른 3속성', MM.partyHasBonus([{ el: 'fire' }, { el: 'grass' }, { el: 'dark' }]) && !MM.partyHasBonus([{ el: 'fire' }, { el: 'fire' }, { el: 'dark' }]));

  // ---- 경험치 ----
  var inc = true;
  for (var L = 1; L < B.MAX_LEVEL - 1; L++) if (MM.expToNext(L + 1) <= MM.expToNext(L)) inc = false;
  check('필요 경험치는 레벨마다 증가', inc);
  var m = { level: 1, exp: 0 }; MM.giveExp(m, 1e9);
  check('만렙 30에서 멈춤', m.level === 30 && m.exp === 0);

  // ---- 합성 ----
  check('스택 2 → +12%p', close(MM.stackBonus(2), 0.12));
  check('8스택이면 100%', MM.successRate(4, 8) === 1);
  var s = MM.newState(); s.gold = 1e6;
  var a = MM.addMonster(s, 'fire', 1, 5), b = MM.addMonster(s, 'grass', 1, 5), c = MM.addMonster(s, 'dark', 1, 5);
  var chk = MM.fusionCheck(s, a, b);
  check('3마리면 합성 불가', !chk.ok && /4마리/.test(chk.reasons.join()), chk.reasons.join(' / '));
  var d = MM.addMonster(s, 'water', 1, 2);
  check('4마리 + Lv5 짝이면 1+1 합성 가능', MM.fusionCheck(s, a, b).ok, MM.fusionCheck(s, a, b).reasons.join());
  var lowChk = MM.fusionCheck(s, d, b);
  check('주재료 레벨 미달이면 불가 (이유 표시)', !lowChk.ok && /Lv 5 필요/.test(lowChk.reasons.join()), lowChk.reasons.join(' / '));
  var s3 = MM.newState(); s3.gold = 1e6; s3.souls.fire2 = 1;
  var m3 = MM.addMonster(s3, 'fire', 3, MM.fuseLevelReq(3)), sub2 = MM.addMonster(s3, 'grass', 2, MM.summonLevel(2)); MM.addMonster(s3, 'water', 1); MM.addMonster(s3, 'dark', 1);
  check('부재료는 소환 레벨이면 바로 합성 가능', MM.fusionCheck(s3, m3, sub2, 'fire').ok, MM.fusionCheck(s3, m3, sub2, 'fire').reasons.join());
  sub2.level = MM.summonLevel(2) - 1;
  check('부재료가 소환 레벨보다 낮으면 불가', !MM.fusionCheck(s3, m3, sub2, 'fire').ok);
  check('1+1 비용은 골드만', MM.fusionCost(a, b).soulTier === null);
  a.stack = 2;
  check('스택마다 골드 +20%', MM.fusionCost(a, b).gold === Math.round(B.FUSION_GOLD[0] * 1.4 / 10) * 10, MM.fusionCost(a, b).gold);
  a.stack = 0; a.level = 20; b.level = 7;
  var fr = MM.attemptFusion(s, a.id, b.id, null, ALWAYS);
  check('성공: 결과 레벨 = 평균 올림 14 + 1~3 → 15~17', fr.success && fr.monster.level >= 15 && fr.monster.level <= 17 && fr.monster.tier === 2 && fr.monster.el === 'fire', fr.monster && fr.monster.level);
  (function () {
    var seen = {}, mm = { level: 5 }, ss = { level: 1 };
    for (var i = 0; i < 300; i++) seen[MM.fusionResultLevel(mm, ss)] = 1;
    check('결과 레벨 보너스 1~3 모두 나옴 (5+1 → 4,5,6)', Object.keys(seen).sort().join() === '4,5,6', Object.keys(seen).join());
    check('결과 레벨은 최대 레벨을 넘지 않음', MM.fusionResultLevel({ level: 30 }, { level: 30 }, function () { return 0.99; }) === B.MAX_LEVEL);
    check('범위 표시 4~6', MM.fusionRangeText(mm, ss) === '4~6');
  })();
  check('성공: 도감 첫 등록 소울 1개', fr.dex && s.souls.fire2 === 1);
  // 실패
  s = MM.newState(); s.gold = 1e6;
  var w2 = MM.addMonster(s, 'water', 2, 10), g1 = MM.addMonster(s, 'grass', 1, 10); MM.addMonster(s, 'fire', 1); MM.addMonster(s, 'dark', 1);
  s.souls.grass1 = 2;
  var gold0 = s.gold, f2 = MM.attemptFusion(s, w2.id, g1.id, 'grass', NEVER);
  check('실패: 재료 유지, 스택 +1', !f2.success && MM.getMonster(s, w2.id) && MM.getMonster(s, g1.id) && w2.stack === 1);
  check('실패해도 비용 지불', s.gold === gold0 - B.FUSION_GOLD[1] && s.souls.grass1 === 1);
  check('튜토리얼 확정 성공', MM.attemptFusion(s, w2.id, g1.id, 'grass', NEVER, { force: true }).success);

  // ---- 소울: 상한·분해·소환 ----
  s = MM.newState();
  var r = MM.addSouls(s, 'fire1', 130);
  check('소울 상한 100, 넘치면 버려짐', s.souls.fire1 === 100 && r.wasted === 30);
  s.souls.fire3 = 1;
  var ds = MM.decomposeSoul(s, 'fire', 3);
  check('소울 분해: 3단계 1개 → 2단계 2개', s.souls.fire3 === 0 && s.souls.fire2 === 2, JSON.stringify(ds));
  check('1단계 소울은 분해 불가', !!MM.decomposeSoul(s, 'fire', 1).error);
  [1, 2, 3, 4].forEach(function () { MM.addMonster(s, 'water', 2); });
  s.party = [s.monsters[0].id];
  check('파티 몬스터 분해 불가', !!MM.decomposeMonster(s, s.monsters[0].id).error);
  var dm = MM.decomposeMonster(s, s.monsters[1].id);
  check('몬스터 분해 → 같은 단계 소울 3개', !dm.error && dm.added === 3);
  while (s.monsters.length > 3) s.monsters.pop();
  check('3마리 이하면 몬스터 분해 불가', !!MM.decomposeMonster(s, s.monsters[2].id).error);
  check('분해는 손해: 몬스터→소울 3개 < 소환 10개', B.DECOMPOSE_MONSTER_SOULS < B.SOULS_PER_SUMMON);
  s.souls.light3 = 10;
  var sm = MM.summon(s, 'light', 3);
  check('소환 레벨은 단계별 고정, 합성 조건보다 낮음', sm.monster.level === MM.summonLevel(3) && MM.summonLevel(3) < MM.fuseLevelReq(3));

  // ---- 드랍 ----
  var mono = true;
  for (var k = 1; k < B.MAX_TIER; k++) if (MM.soulDropAvg(k + 1) >= MM.soulDropAvg(k)) mono = false;
  check('높은 단계 소울일수록 드랍률이 낮음', mono);
  check('개수 분포 평균 1.38', Math.abs(MM.meanSoulCount() - 1.38) < 1e-9);
  var rng = MM.seededRng(7), total = 0, N = 40000;
  for (var i = 0; i < N; i++) { var dd = MM.rollDrops([{ el: 'fire', tier: 1 }], rng); total += dd.fire1 || 0; }
  check('1단계 소울 평균 개수 유지', Math.abs(total / N - MM.soulDropAvg(1)) < 0.01, (total / N).toFixed(3));
  total = 0;
  for (i = 0; i < N; i++) { dd = MM.rollDrops([{ el: 'fire', tier: 1 }], rng, 10); total += dd.fire1 || 0; }
  check('던전 10배도 평균 유지', Math.abs(total / N / 10 - MM.soulDropAvg(1)) < 0.01, (total / N).toFixed(2));
  var six = MM.rollDrops([{ el: 'fire', tier: 6 }], ALWAYS, 1);
  check('6단계 적은 6단계 소울을 주지 않음', !six.fire6 && six.fire5 > 0);

  // ---- 스테이지·던전 구성 ----
  var ok = true;
  for (i = 0; i < 300; i++) {
    var en = MM.stageEnemies('water', 2, rng), els = en.map(function (e) { return e.el; });
    if (!(en[1].boss && en[1].el === 'water' && en[1].tier === 3 && en[0].tier === 2 && en[2].tier === 2 && new Set(els).size === 3)) ok = false;
  }
  check('스테이지: 가운데 보스 (n+1)단계 + 쫄 n단계 2, 셋 다 다른 속성', ok);
  var top = MM.stageEnemies('fire', 5, rng);
  check('맨 위 스테이지는 5단계 3마리', top.every(function (e) { return e.tier === 5; }));
  check('n단계 던전 = n단계 3마리 (6단계 없음)', MM.dungeonEnemies(['dark'], 5).every(function (e) { return e.tier === 5 && e.el === 'dark'; }));
  var guaranteedOk = true;
  for (i = 0; i < 500; i++) { var gd = MM.rollDrops(MM.dungeonEnemies(['fire', 'grass', 'dark'], 3), rng, 10); if (!(gd.fire1 >= 1 && gd.grass1 >= 1 && gd.dark1 >= 1)) guaranteedOk = false; }
  check('던전은 적마다 1단계 소울 확정 (한 판 최소 3개)', guaranteedOk);
  s = MM.newState();
  check('던전 해금: 1단계만 처음 열림', MM.dungeonUnlocked(s, 1) && !MM.dungeonUnlocked(s, 2));
  var t0 = Date.UTC(2026, 9, 26, 3); // 2026-10-26 월요일 12시 KST
  check('월요일 던전 = 빛', MM.dungeonElementFor(t0) === 'light');
  check('토요일은 직접 선택', MM.dungeonElementFor(t0 + 5 * 86400000) === null);
  check('던전 하루 2판', MM.useDungeonEntry(s, t0) && MM.useDungeonEntry(s, t0) && !MM.useDungeonEntry(s, t0));
  check('다음 날 초기화 (이월 없음)', MM.dungeonLeft(s, t0 + 86400000) === 2);
  var sa = MM.newState(t0);
  check('자동 반복 첫날 500판', MM.autoLeft(sa, t0) === 500);
  for (i = 0; i < 100; i++) MM.useAutoRun(sa, t0);
  check('자동 반복 이월: 400 + 500 = 900', MM.autoLeft(sa, t0 + 86400000) === 900);
  check('자동 반복 최대 3,000판', MM.autoLeft(sa, t0 + 30 * 86400000) === 3000);

  // ---- 오프라인 ----
  s = MM.newState(t0); s.offline.stage = { el: 'fire', tier: 1 };
  check('클리어 안 한 스테이지는 오프라인 보상 없음', MM.claimOffline(s, t0 + 3600000, rng) === null);
  s.cleared.fire1 = 1; s.offline.lastSeen = t0;
  var off = MM.claimOffline(s, t0 + 24 * 3600000, rng);
  var expRuns = 12 * 3600 / B.AVG_RUN_SEC * B.OFFLINE_RATE;
  check('오프라인: 최대 12시간, 효율 5%', off && off.capped && Math.abs(off.runs - expRuns) <= 1, off && off.runs);
  (function () {
    var s = MM.newState(t0); s.offline.stage = { el: 'fire', tier: 1 }; s.cleared.fire1 = 1;
    MM.accrueOffline(s, t0 + 2 * 3600000);
    s.offline.lastSeen = t0 + 3 * 3600000; // 1시간 게임 중 (안 쌓임)
    MM.accrueOffline(s, t0 + 4 * 3600000);
    check('오프라인: 게임 밖 시간만 쌓임 (2h + 1h = 3h)', MM.offlinePendingMs(s) === 3 * 3600000, MM.offlinePendingMs(s));
    MM.accrueOffline(s, t0 + 40 * 3600000);
    check('오프라인: 쌓이는 건 최대 12시간', MM.offlinePendingMs(s) === 12 * 3600000 && MM.offlineFull(s));
    var r = MM.claimOffline(s, t0 + 40 * 3600000, rng);
    check('받기: 쌓인 보상 전부 받고 0으로', r && Math.abs(r.hours - 12) < 1e-9 && MM.offlinePendingMs(s) === 0);
    check('받은 직후 다시 받기는 없음', MM.claimOffline(s, t0 + 40 * 3600000 + 60000, rng) === null);
  })();

  // ---- 조사 ----
  check('조사: 소울이 / 골드가', MM.josa('소울', '이', '가') === '소울이' && MM.josa('골드', '이', '가') === '골드가');

  // ---- 튜토리얼 ----
  s = MM.newState();
  check('튜토리얼: 같은 속성 선택 불가', !MM.tutorialPickStarters(s, ['fire', 'fire', 'dark']));
  var allOk = true;
  var combos = [];
  for (var x = 0; x < 5; x++) for (var y = x + 1; y < 5; y++) for (var z = y + 1; z < 5; z++) combos.push([MM.RING[x], MM.RING[y], MM.RING[z]]);
  combos.forEach(function (els) {
    var st = MM.newState(); st.gold = 1000;
    MM.tutorialPickStarters(st, els); MM.tutorialBattleReward(st);
    MM.tutorialFourthOptions(st).forEach(function (el4) {
      var st2 = JSON.parse(JSON.stringify(st)); MM.tutorialPickFourth(st2, el4);
      var found = false;
      st2.monsters.forEach(function (p) { st2.monsters.forEach(function (q) { if (MM.fusionCheck(st2, p, q).ok) found = true; }); });
      if (!found) allOk = false;
    });
  });
  check('튜토리얼: 어떤 3속성+4번째를 골라도 첫 합성 가능 (20가지 모두)', allOk);

  // ---- 난이도 ----
  function winRate(fn, n) { var w = 0, rr = MM.seededRng(n * 7 + 3); for (var j = 0; j < n; j++) if (fn(rr, j).result === 'win') w++; return w / n; }
  function trio(tier, level, j) { var e = [MM.RING[j % 5], MM.RING[(j + 1) % 5], MM.RING[(j + 3) % 5]]; return e.map(function (el) { return { el: el, tier: tier, level: level }; }); }
  var table = [];
  check('튜토리얼 전투는 쉬움', winRate(function (rr) { return MM.simulateBattle(trio(1, 1, 0), MM.tutorialEnemies(['fire', 'water', 'light']), rr); }, 200) > 0.95);
  for (var st = 1; st <= B.MAX_TIER; st++) {
    var req = st < B.MAX_TIER ? MM.fuseLevelReq(st) : 20;
    var lo = winRate(function (rr, j) { return MM.simulateBattle(trio(st, MM.summonLevel(st), j), MM.stageEnemies(MM.RING[j % 5], st, rr), rr); }, 300);
    var hi = winRate(function (rr, j) { return MM.simulateBattle(trio(st, B.MAX_LEVEL, j), MM.stageEnemies(MM.RING[j % 5], st, rr), rr); }, 300);
    var under = st > 1 ? winRate(function (rr, j) { return MM.simulateBattle(trio(st - 1, B.MAX_LEVEL, j), MM.stageEnemies(MM.RING[j % 5], st, rr), rr); }, 300) : 0;
    table.push(st + '단계 스테이지: ' + st + '단계 3마리 소환Lv' + MM.summonLevel(st) + ' ' + Math.round(lo * 100) + '% / Lv30 ' + Math.round(hi * 100) + '%' + (st > 1 ? ' · ' + (st - 1) + '단계 Lv30 ' + Math.round(under * 100) + '%' : ''));
    check(st + '단계 스테이지: 같은 단계 만렙이면 깸', hi > 0.9, Math.round(hi * 100) + '%');
    if (st > 1) check(st + '단계 스테이지: 아래 단계 만렙으로는 어려움', under < 0.35, Math.round(under * 100) + '%');
  }

  // ---- 오프라인 자동 지정 ----
  (function () {
    var s = MM.newState(), en = MM.stageEnemies('fire', 1);
    var r1 = MM.grantStageWin(s, 'fire', 1, en);
    check('첫 1단계 스테이지 클리어 → 오프라인 자동 지정', r1.autoOffline && s.offline.stage.el === 'fire' && s.offline.stage.tier === 1);
    var r2 = MM.grantStageWin(s, 'water', 1, MM.stageEnemies('water', 1));
    check('같은 단계 다른 속성 첫 클리어는 안 바꿈', !r2.autoOffline && s.offline.stage.el === 'fire');
    var r3 = MM.grantStageWin(s, 'grass', 2, MM.stageEnemies('grass', 2));
    check('더 높은 단계 첫 클리어 → 그 스테이지로 바꿈', r3.autoOffline && s.offline.stage.el === 'grass' && s.offline.stage.tier === 2);
    s.offline.stage = { el: 'fire', tier: 1 }; s.cleared.dark2 = 0;
    check('직접 고른 지정은 같은 단계 재클리어로 안 바뀜', !MM.grantStageWin(s, 'grass', 2, MM.stageEnemies('grass', 2)).autoOffline);
  })();

  // ---- 소울 먹이기 ----
  (function () {
    var s = MM.newState(), m = MM.addMonster(s, 'fire', 2, 6);
    s.souls.fire1 = 5; s.souls.fire2 = 3; s.souls.water2 = 3;
    check('소울 경험치: 높은 단계일수록 많음', MM.soulExp(1) < MM.soulExp(2) && MM.soulExp(2) < MM.soulExp(3));
    check('다른 속성 소울은 못 먹임', !!MM.canFeed(s, m, 'water', 2));
    var before = m.exp, r = MM.feedSouls(s, m.id, 1, 2);
    check('같은 속성 소울 2개 먹이면 2개 소모 + 경험치', r.used === 2 && s.souls.fire1 === 3 && r.exp === MM.soulExp(1) * 2);
    var p = MM.feedPreview(m, 2, 3), r2 = MM.feedSouls(s, m.id, 2, 3);
    check('미리보기와 실제 결과가 같음', p.level === r2.level && p.used === r2.used);
    var mx = MM.addMonster(s, 'fire', 1, B.MAX_LEVEL - 1); mx.exp = MM.expToNext(B.MAX_LEVEL - 1) - 1; s.souls.fire5 = 50;
    var r3 = MM.feedSouls(s, mx.id, 5, 50);
    check('최대 레벨이 되면 멈추고 남은 소울은 안 씀', mx.level === B.MAX_LEVEL && r3.used === 1 && s.souls.fire5 === 49);
    check('최대 레벨이면 먹일 수 없음', !!MM.feedSouls(s, mx.id, 5, 1).error);
    var have1 = s.souls.fire1, r4 = MM.feedSouls(s, m.id, 1, 99);
    check('가진 것보다 많이 요청하면 가진 만큼만', r4.used === have1 && s.souls.fire1 === 0, JSON.stringify(r4));
  })();

  // ---- 출력 ----
  var pass = results.filter(function (x) { return x.ok; }).length;
  var summary = '통과 ' + pass + ' / ' + results.length;
  if (typeof document !== 'undefined' && document.getElementById('out')) {
    document.getElementById('out').innerHTML = '<h2>' + summary + '</h2>' + results.map(function (x) {
      return '<div class="' + (x.ok ? 'ok' : 'bad') + '">' + (x.ok ? '✓ ' : '✗ ') + x.name + (x.detail ? ' <small>(' + x.detail + ')</small>' : '') + '</div>';
    }).join('') + '<h3>난이도</h3>' + table.map(function (t) { return '<div>' + t + '</div>'; }).join('');
  } else {
    results.forEach(function (x) { if (!x.ok || (typeof process !== 'undefined' && process.env.VERBOSE)) console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? ' (' + x.detail + ')' : '')); });
    table.forEach(function (t) { console.log(t); });
    console.log(summary);
    if (typeof process !== 'undefined' && pass !== results.length) process.exitCode = 1;
  }
})();
