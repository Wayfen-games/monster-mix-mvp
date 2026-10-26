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
  check('레벨당 +0.5% (Lv100 = 1.495배)', Math.abs(MM.levelMult(100) - 1.495) < 1e-9);
  check('단계 만렙 n단계 < 소환 레벨 n+1단계 (모든 단계)', MM.tiers().slice(0, -1).every(function (t) { return MM.tierMult(t) * MM.levelMult(MM.maxLevel(t)) < MM.tierMult(t + 1) * MM.levelMult(MM.summonLevel(t + 1)); }));
  check('만렙 아래 단계 < 다음 단계 Lv1', MM.tierMult(1) * MM.levelMult(MM.maxLevel(1)) < MM.tierMult(2) * MM.levelMult(1));
  check('크리티컬 1단계 4%, 5단계 8%', close(MM.calcStats('fire', 1, 1).crit, 0.04) && close(MM.calcStats('fire', 5, 1).crit, 0.08));
  check('파티 보너스: 서로 다른 3속성', MM.partyHasBonus([{ el: 'fire' }, { el: 'grass' }, { el: 'dark' }]) && !MM.partyHasBonus([{ el: 'fire' }, { el: 'fire' }, { el: 'dark' }]));

  // ---- 경험치 ----
  var inc = true;
  for (var L = 1; L < B.MAX_LEVEL - 1; L++) if (MM.expToNext(L + 1) < MM.expToNext(L)) inc = false;
  check('필요 경험치는 레벨이 오를수록 줄지 않음', inc && MM.expToNext(50) > MM.expToNext(1));
  var m = { level: 1, exp: 0, tier: 3 }; MM.giveExp(m, 1e30);
  check('단계 만렙에서 멈춤 (전체 만렙 개념 없음)', m.level === MM.maxLevel(3) && m.exp === 0 && MM.maxLevel(30) > 300);
  check('경험치 통 = 5.5 × 1.074^(레벨-1)', MM.expToNext(1) === 6 && MM.expToNext(100) === Math.round(5.5 * Math.pow(1.074, 99)));
  (function () { var runs = function (t2) { var L = MM.summonLevel(t2), e = 0, n = 0, W = MM.winExp(t2); while (L < MM.fuseLevelReq(t2)) { e += W; n++; while (L < MM.fuseLevelReq(t2) && e >= MM.expToNext(L)) { e -= MM.expToNext(L); L++; } } return n; };
    var r = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(runs), okr = r.every(function (x, i) { var want = 10 * Math.pow(1.7, i); return x >= want * 0.85 && x <= want * 1.25; });
    check('소환 → 합성 조건 판수: 1단계 10판, 단계마다 ×1.7', okr, r.join('/')); })();
  check('단계 만렙 = (n+2)단계 소환 레벨', [1, 2, 3, 8].every(function (t) { return MM.maxLevel(t) === MM.summonLevel(t + 2); }) && MM.maxLevel(30) === 347);

  // ---- 합성 ----
  check('스택 2 → +12%p', close(MM.stackBonus(2), 0.12));
  check('8스택이면 100%', MM.successRate(4, 8) === 1);
  var s = MM.newState(); s.gold = 1e6;
  var FR = MM.fuseLevelReq(1), a = MM.addMonster(s, 'fire', 1, FR), b = MM.addMonster(s, 'grass', 1, FR), c = MM.addMonster(s, 'dark', 1, FR);
  var chk = MM.fusionCheck(s, a, b);
  check('3마리면 합성 불가', !chk.ok && /4마리/.test(chk.reasons.join()), chk.reasons.join(' / '));
  var d = MM.addMonster(s, 'water', 1, 2);
  check('4마리 + 조건 레벨 짝이면 1+1 합성 가능', MM.fusionCheck(s, a, b).ok, MM.fusionCheck(s, a, b).reasons.join());
  var lowChk = MM.fusionCheck(s, d, b);
  check('주재료 레벨 미달이면 불가 (이유 표시)', !lowChk.ok && new RegExp('Lv ' + FR + ' 필요').test(lowChk.reasons.join()), lowChk.reasons.join(' / '));
  var s3 = MM.newState(); s3.gold = 1e6; s3.souls.fire2 = 1;
  var m3 = MM.addMonster(s3, 'fire', 3, MM.fuseLevelReq(3)), sub2 = MM.addMonster(s3, 'grass', 2, MM.summonLevel(2)); MM.addMonster(s3, 'water', 1); MM.addMonster(s3, 'dark', 1);
  check('부재료는 소환 레벨이면 바로 합성 가능', MM.fusionCheck(s3, m3, sub2, 'fire').ok, MM.fusionCheck(s3, m3, sub2, 'fire').reasons.join());
  sub2.level = MM.summonLevel(2) - 1;
  check('부재료가 소환 레벨보다 낮으면 불가', !MM.fusionCheck(s3, m3, sub2, 'fire').ok);
  check('1+1 비용은 골드만', MM.fusionCost(a, b).soulTier === null);
  (function () {
    var mm = { el: 'fire', tier: 3, stack: 0 }, base = MM.fusionCost(mm, null, 1), ten = MM.fusionCost(mm, null, 50), full = MM.fusionCost(mm, null, 100), over = MM.fusionCost(mm, null, 999);
    check('합성 소울 1~100개: 1개당 골드 -1%, 100개면 공짜', base.souls === 1 && Math.abs(base.gold / B.FUSION_GOLD[2] - 0.99) < 0.01 && Math.abs(ten.gold / B.FUSION_GOLD[2] - 0.5) < 0.01 && full.gold === 0 && over.souls === 100);
    var s9 = MM.newState(); s9.gold = 1e6; s9.souls.fire2 = 5;
    var m9 = MM.addMonster(s9, 'fire', 3, MM.fuseLevelReq(3)), sb = MM.addMonster(s9, 'grass', 2, MM.summonLevel(2)); MM.addMonster(s9, 'water', 1); MM.addMonster(s9, 'dark', 1);
    check('소울이 모자라면 그 개수로는 불가', !MM.fusionCheck(s9, m9, sb, 'fire', 6).ok && MM.fusionCheck(s9, m9, sb, 'fire', 5).ok);
    var g9 = s9.gold, r9 = MM.attemptFusion(s9, m9.id, sb.id, 'fire', function () { return 0.99; }, { souls: 5 });
    check('고른 개수만큼 소울 쓰고 골드는 깎인 만큼만', s9.souls.fire2 === 0 && g9 - s9.gold === MM.fusionCost({ el: 'fire', tier: 3, stack: 0 }, null, 5).gold);
  })();
  a.stack = 2;
  check('스택마다 골드 +20%', MM.fusionCost(a, b).gold === Math.round(B.FUSION_GOLD[0] * 1.4 / 10) * 10, MM.fusionCost(a, b).gold);
  a.stack = 0; a.level = 20; b.level = 14;
  var fr = MM.attemptFusion(s, a.id, b.id, null, ALWAYS);
  check('성공: 결과 레벨 = 평균 올림 17 + 1~3 → 18~20', fr.success && fr.monster.level >= 18 && fr.monster.level <= 20 && fr.monster.tier === 2 && fr.monster.el === 'fire', fr.monster && fr.monster.level);
  (function () {
    var seen = {}, mm = { level: 30 }, ss = { level: 10 };
    for (var i = 0; i < 300; i++) seen[MM.fusionResultLevel(mm, ss)] = 1;
    check('결과 레벨 보너스 1~3 모두 나옴 (30+10 → 21~23)', Object.keys(seen).length === 3 && seen[21] && seen[23], Object.keys(seen).join());
    check('10렙 + 10렙 → 11~13 (재료 레벨 상한 없음)', MM.fusionResultLevel({ level: 10 }, { level: 10 }, function () { return 0.99; }) === 13);
    check('결과 레벨은 새 단계 만렙을 넘지 않음', MM.fusionResultLevel({ tier: 1, level: 34 }, { level: 34 }, function () { return 0.99; }) === MM.maxLevel(2));
    check('범위 표시 21~23', MM.fusionRangeText(mm, ss) === '21~23');
  })();
  check('성공: 도감 첫 등록 소울 1개', fr.dex && s.souls.fire2 === 1);
  // 실패
  s = MM.newState(); s.gold = 1e6;
  var w2 = MM.addMonster(s, 'water', 2, MM.fuseLevelReq(2)), g1 = MM.addMonster(s, 'grass', 1, 10);
  check('합성 성공률: 80/60/40/25% 뒤 20% 고정', [1, 2, 3, 4, 5, 6, 9, 20].map(function (t) { return MM.successRate(t, 0); }).join() === '0.8,0.6,0.4,0.25,0.2,0.2,0.2,0.2'); MM.addMonster(s, 'fire', 1); MM.addMonster(s, 'dark', 1);
  s.souls.grass1 = 2;
  var gold0 = s.gold, f2 = MM.attemptFusion(s, w2.id, g1.id, 'grass', NEVER);
  check('실패: 재료 유지, 스택 +1', !f2.success && MM.getMonster(s, w2.id) && MM.getMonster(s, g1.id) && w2.stack === 1);
  check('실패해도 비용 지불', s.gold === gold0 - MM.fusionCost({ el: 'water', tier: 2, stack: 0 }, null, 1).gold && s.souls.grass1 === 1);
  check('튜토리얼 확정 성공', MM.attemptFusion(s, w2.id, g1.id, 'grass', NEVER, { force: true }).success);

  // ---- 소울: 상한·분해·소환 ----
  s = MM.newState();
  var r = MM.addSouls(s, 'fire1', 1030);
  check('소울 상한 999, 넘치면 버려짐', s.souls.fire1 === 999 && r.wasted === 31);
  s.souls.fire3 = 1;
  var ds = MM.decomposeSoul(s, 'fire', 3);
  check('소울 분해: 3단계 1개 → 2단계 2개', s.souls.fire3 === 0 && s.souls.fire2 === 2, JSON.stringify(ds));
  check('1단계 소울은 분해 불가', !!MM.decomposeSoul(s, 'fire', 1).error);
  [1, 2, 3, 4].forEach(function () { MM.addMonster(s, 'water', 2); });
  s.party = [s.monsters[0].id];
  check('파티 몬스터 분해 불가', !!MM.decomposeMonster(s, s.monsters[0].id).error);
  var dm = MM.decomposeMonster(s, s.monsters[1].id);
  check('몬스터 분해 → 같은 단계 소울 9개', !dm.error && dm.added === 9);
  while (s.monsters.length > 3) s.monsters.pop();
  check('3마리 이하면 몬스터 분해 불가', !!MM.decomposeMonster(s, s.monsters[2].id).error);
  check('분해는 손해: 몬스터→소울 9개 < 소환 30개', B.DECOMPOSE_MONSTER_SOULS < B.SOULS_PER_SUMMON && B.SOULS_PER_SUMMON === 30);
  s.souls.light3 = 30;
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
  for (i = 0; i < N; i++) { dd = MM.rollDrops([{ el: 'fire', tier: 1 }], rng, 30); total += dd.fire1 || 0; }
  check('던전 30배도 평균 유지', Math.abs(total / N / 30 - MM.soulDropAvg(1)) < 0.01, (total / N).toFixed(2));
  check('1단계 소울 50%, 단계마다 ×0.3', close(MM.soulDropAvg(1), 0.5) && Math.abs(MM.soulDropAvg(4) / MM.soulDropAvg(3) - 0.3) < 1e-9);
  var over = MM.rollDrops([{ el: 'fire', tier: B.MAX_TIER + 1 }], ALWAYS, 1);
  check('맨 위 단계보다 높은 적은 그 단계 소울을 주지 않음', !over['fire' + (B.MAX_TIER + 1)] && over['fire' + B.MAX_TIER] > 0);

  // ---- 스테이지·던전 구성 ----
  var ok = true;
  for (i = 0; i < 300; i++) {
    var en = MM.stageEnemies('water', 2, rng), els = en.map(function (e) { return e.el; });
    if (!(en[1].boss && en[1].el === 'water' && en[1].tier === 3 && en[0].tier === 2 && en[2].tier === 2 && new Set(els).size === 3)) ok = false;
  }
  check('스테이지: 가운데 보스 (n+1)단계 + 쫄 n단계 2, 셋 다 다른 속성', ok);
  var top = MM.stageEnemies('fire', B.MAX_TIER, rng);
  check('맨 위 스테이지는 맨 위 단계 3마리', top.every(function (e) { return e.tier === B.MAX_TIER; }));
  check('n단계 던전 = n단계 3마리, 적 레벨 = 합성 조건 레벨 (스테이지보다 높음)', MM.dungeonEnemies(['dark'], 5).every(function (e) { return e.tier === 5 && e.el === 'dark' && e.level === MM.fuseLevelReq(5); }) && MM.stageEnemies('dark', 5, rng)[0].level === MM.summonLevel(5));
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
  check('방치 보상: 최대 12시간, 효율 10%', off && off.capped && Math.abs(off.runs - expRuns) <= 1 && B.OFFLINE_RATE === 0.1, off && off.runs);
  (function () {
    var s = MM.newState(t0); s.offline.stage = { el: 'fire', tier: 1 }; s.cleared.fire1 = 1;
    MM.accrueOffline(s, t0 + 2 * 3600000);
    MM.accrueOffline(s, t0 + 4 * 3600000);
    check('방치 보상: 흐른 시간이 계속 쌓임 (4h)', MM.offlinePendingMs(s) === 4 * 3600000, MM.offlinePendingMs(s));
    MM.accrueOffline(s, t0 + 40 * 3600000);
    check('오프라인: 쌓이는 건 최대 12시간', MM.offlinePendingMs(s) === 12 * 3600000 && MM.offlineFull(s));
    var r = MM.claimOffline(s, t0 + 40 * 3600000, rng);
    check('받기: 쌓인 보상 전부 받고 0으로', r && Math.abs(r.hours - 12) < 1e-9 && MM.offlinePendingMs(s) === 0);
    check('받은 직후 다시 받기는 없음', MM.claimOffline(s, t0 + 40 * 3600000, rng) === null);
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
    var hi = winRate(function (rr, j) { return MM.simulateBattle(trio(st, MM.maxLevel(st), j), MM.stageEnemies(MM.RING[j % 5], st, rr), rr); }, 300);
    var under = st > 1 ? winRate(function (rr, j) { return MM.simulateBattle(trio(st - 1, MM.maxLevel(st - 1), j), MM.stageEnemies(MM.RING[j % 5], st, rr), rr); }, 300) : 0;
    table.push(st + '단계 스테이지: ' + st + '단계 3마리 소환Lv' + MM.summonLevel(st) + ' ' + Math.round(lo * 100) + '% / 만렙 Lv' + MM.maxLevel(st) + ' ' + Math.round(hi * 100) + '%' + (st > 1 ? ' · ' + (st - 1) + '단계 만렙 ' + Math.round(under * 100) + '%' : ''));
    check(st + '단계 스테이지: 같은 단계 만렙이면 대부분 깸', hi > 0.7, Math.round(hi * 100) + '%');
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

  // ---- 방치 보상 스테이지 변경 시 정산 ----
  (function () {
    var s = MM.newState(t0); s.tutorial.done = true; s.cleared.fire1 = 1; s.cleared.water1 = 1; s.offline.stage = { el: 'fire', tier: 1 };
    MM.accrueOffline(s, t0 + 6 * 3600000);
    var g0 = s.gold, r = MM.setOfflineStage(s, 'water', 1, rng);
    check('스테이지 바꾸면 쌓인 보상을 바꾸기 전 스테이지로 먼저 받음', r.paid && r.paid.stage.el === 'fire' && Math.abs(r.paid.hours - 6) < 1e-9 && s.gold > g0 && MM.offlinePendingMs(s) === 0 && s.offline.stage.el === 'water');
    check('같은 스테이지로 바꾸기는 정산 안 함', !MM.setOfflineStage(s, 'water', 1, rng).changed);
    MM.accrueOffline(s, t0 + 9 * 3600000);
    var w = MM.grantStageWin(s, 'grass', 2, MM.stageEnemies('grass', 2), rng);
    check('첫 클리어 자동 변경 때도 쌓인 보상 정산', w.autoOffline && w.offlinePaid && w.offlinePaid.stage.el === 'water' && MM.offlinePendingMs(s) === 0);
    s.offline.lastSeen = t0; MM.accrueOffline(s, t0 + 60000);
    check('접속 중에도 시간이 쌓임 (1분)', MM.offlinePendingMs(s) === 60000);
  })();

  // ---- 방치 보상: 쌓인 보상 미리보기 + 몬스터 지정 ----
  (function () {
    var s = MM.newState(t0); s.cleared.fire1 = 1; s.offline.stage = { el: 'fire', tier: 1 };
    var a = MM.addMonster(s, 'fire', 1, 1), b2 = MM.addMonster(s, 'water', 1, 1), c = MM.addMonster(s, 'grass', 1, 1), d = MM.addMonster(s, 'dark', 1, 1);
    s.party = [a.id, b2.id, c.id];
    MM.accrueOffline(s, t0 + 6 * 3600000, rng);
    var bag = MM.offlineBag(s);
    check('쌓이는 동안 판수·골드·경험치가 미리 보임', bag.runs > 0 && bag.gold === bag.runs * B.CLEAR_GOLD[0] && bag.exp === bag.runs * MM.winExp(1));
    check('방치 보상 몬스터를 안 정하면 파티', MM.offlineTeam(s).join() === s.party.join());
    var g0 = s.gold, r = MM.setOfflineTeam(s, [d.id, a.id]);
    check('몬스터 바꾸면 쌓인 보상 즉시 지급 (경험치는 바꾸기 전 = 파티에게)', r.paid && s.gold > g0 && b2.level > 1 && d.level === 1 && MM.offlineBag(s).runs === 0);
    MM.accrueOffline(s, t0 + 12 * 3600000, rng);
    var r2 = MM.claimOffline(s, t0 + 12 * 3600000, rng);
    check('받기: 지정 몬스터(파티 밖 포함)만 경험치', r2 && d.level > 1 && r2.team.join() === [d.id, a.id].join());
    check('즉시 받기: 몇 분만 쌓여도 받을 수 있음', (MM.accrueOffline(s, t0 + 12 * 3600000 + 10 * 60000, rng), MM.claimOffline(s, t0 + 12 * 3600000 + 10 * 60000, rng) !== null));
    s.gold = 1e6; s.souls.fire1 = 50;
    var e = MM.addMonster(s, 'fire', 1, MM.fuseLevelReq(1)); MM.setOfflineTeam(s, [e.id, b2.id]);
    check('방치 보상에 지정한 몬스터는 합성 재료로 못 씀', !MM.fusionCheck(s, e, d).ok && MM.fusionCheck(s, e, d).reasons.some(function (r) { return /방치 보상/.test(r); }));
    check('방치 보상에 지정한 몬스터는 분해 못 함', !!MM.canDecomposeMonster(s, e));
    MM.setOfflineTeam(s, [b2.id]);
    check('빼면 합성 가능', MM.fusionCheck(s, e, d).ok);
    check('지정 안 했을 때(파티가 받음)는 파티 몬스터도 합성 가능', (function () { s.offline.team = []; return MM.fusionCheck(s, e, d).ok; })());
    // 입장권
    var s2 = MM.newState(t0), before = MM.ticketCount(s2, 2);
    B.TICKET_DROP = 1; var tw = MM.grantStageWin(s2, 'fire', 2, MM.stageEnemies('fire', 2)); B.TICKET_DROP = 0.01;
    check('스테이지 승리 시 같은 단계 입장권', tw.ticket === 2 && MM.ticketCount(s2, 2) === before + 1);
    var dw = MM.grantDungeonWin(s2, 2, MM.dungeonEnemies(['fire', 'water', 'grass'], 2), null, { ticket: true });
    check('입장권 던전은 요일 던전 진행(클리어)에 영향 없음', !s2.dungeon.cleared[2] && dw.drops.length > 0);
    check('입장권 사용', MM.useTicket(s2, 2) && MM.ticketCount(s2, 2) === before && !MM.useTicket(s2, 2));
  })();

  (function () {
    var s = MM.newState(t0); s.cleared.fire3 = 1; s.offline.stage = { el: 'fire', tier: 3 };
    var lo = MM.addMonster(s, 'water', 1, 1), hi = MM.addMonster(s, 'grass', 3, 10); s.party = [lo.id, hi.id];
    MM.accrueOffline(s, t0 + 3 * 3600000, rng);
    var r = MM.claimOffline(s, t0 + 3 * 3600000, rng);
    check('방치 경험치: 단계 상관없이 스테이지 경험치 그대로', r.expBy[lo.id] === MM.winExp(3) * r.runs && r.expBy[hi.id] === MM.winExp(3) * r.runs);
    check('단계별 만렙은 넘지 않음 (1단계 Lv ' + MM.maxLevel(1) + ')', lo.level > 1 && lo.level <= MM.maxLevel(1));
  })();

  // ---- 장비 ----
  (function () {
    var s = MM.newState(t0); s.gold = 1e9; s.souls.light1 = 150;
    var m = MM.addMonster(s, 'light', 1, 5);
    var had = s.souls.light1, r = MM.craftEquip(s, 'light', 1);
    check('장비 제작: 소울 100개 → 빛의 조각, 빈 칸이면 바로 장착', r.equip && s.souls.light1 === had - 100 && MM.isEquipped(s, r.equip) && MM.equipName('light', 1) === '빛의 조각');
    check('장비 효과: 그 속성 몬스터만 단계×2% + 강화×1%', Math.abs(MM.playerMult(s, m) - 1.02) < 1e-9 && MM.playerMult(s, MM.addMonster(s, 'fire', 1)) === 1);
    var bp = MM.battleParty(s, [m]);
    check('전투에 장비 배율 반영 (원본은 그대로)', Math.abs(bp[0].mult - 1.02) < 1e-9 && !m.mult);
    check('강화 비용: 0→1은 골드만, n→n+1은 소울 n개', MM.equipEnhCost({ el: 'light', tier: 1, plus: 0 }).souls === 0 && MM.equipEnhCost({ el: 'light', tier: 1, plus: 7 }).souls === 7);
    check('강화 성공률: 높을수록 낮게 시작, 천장에서 100%', MM.equipRate(0, 0) > MM.equipRate(5, 0) && MM.equipRate(5, MM.equipCeil(5) - 1) === 1 && MM.equipRate(15, 0) < 0.02);
    var e = r.equip, tries = 0;
    while (e.plus < 3 && tries < 50) { MM.enhanceEquip(s, e.id); tries++; }
    check('강화: 천장 덕분에 +3까지 최대 2+3+4번', e.plus === 3 && tries <= 9, tries);
    check('강화 1당 +1%', Math.abs(MM.equipBonus(e) - 0.05) < 1e-9);
    check('장착 중이면 분해 불가', !!MM.decomposeEquip(s, e.id).error);
    s.souls.light1 = 190; var e0 = MM.craftEquip(s, 'light', 1).equip, before = s.souls.light1;
    var d0 = MM.decomposeEquip(s, e0.id);
    check('+0 분해: 소울 5개', d0.souls === 5 && s.souls.light1 === before + 5 && d0.gold === 0);
    MM.unequip(s, 'light'); var v = MM.equipDecompValue(e), ex = MM.equipExpectedSpend(1, 3);
    check('+3 분해: 소울 5 + 기댓값 70%', v.souls === 5 + Math.floor(ex.souls * 0.7) && v.gold === Math.floor(ex.gold * 0.7 / 10) * 10);
  })();
  // ---- 몬스터 강화 ----
  (function () {
    var s = MM.newState(t0); s.gold = 1e9; s.souls.fire1 = 50;
    var m = MM.addMonster(s, 'fire', 1, MM.fuseLevelReq(1)), n = 0;
    while ((m.plus || 0) < 3 && n < 50) { MM.enhanceMonster(s, m.id); n++; }
    check('몬스터 강화 +3까지 (천장: 실패마다 +15%p)', m.plus === 3 && !!MM.enhanceMonster(s, m.id).error, n);
    check('몬스터 강화 +3 = 15%', Math.abs(MM.playerMult(s, m) - 1.15) < 1e-9);
    MM.addMonster(s, 'grass', 1, 1); MM.addMonster(s, 'water', 1); MM.addMonster(s, 'dark', 1);
    var g = s.monsters.filter(function (x) { return x.el === 'grass'; })[0];
    var fr = MM.attemptFusion(s, m.id, g.id, null, function () { return 0; });
    check('합성하면 강화 사라짐', fr.success && !fr.monster.plus);
  })();

  // ---- 소울 제단·뽑기 ----
  (function () {
    var s = MM.newState(t0); s.souls.fire1 = 100; s.souls.fire3 = 5;
    var m = MM.addMonster(s, 'fire', 1, 1);
    var r = MM.offerSouls(s, 'fire', 1, 20);
    check('제단: 1단계 소울 20개(20점) → Lv 1', r.level === 1 && MM.altarOf(s, 'fire').pts === 0);
    MM.offerSouls(s, 'fire', 3, 1);
    check('제단: 3단계 소울 1개 = 드랍률 비 11점', MM.altarSoulPoints(3) === 11 && MM.altarOf(s, 'fire').level >= 1, MM.altarSoulPoints(3));
    check('제단 보너스: 그 속성만 능력치·경험치', MM.playerMult(s, m) > 1 && MM.altarExpBonus(s, 'water') === 0);
    var s2 = MM.newState(t0), seen = {}, acc = 0;
    B.GACHA_TABLE.forEach(function (row) { var x = acc + row.p / 2; acc += row.p; s2.souls.water2 = 100; var g = MM.gachaPull(s2, 'water', 2, function () { return x; }); seen[g.kind + g.n] = g; });
    check('뽑기: 소울 50개로 1번, 11가지 당첨 품목이 다 나옴 (보스 입장권 포함)', B.GACHA_COST === 50 && Object.keys(seen).length === 11 && seen.souls15 && seen.ticket5 && seen.up3 && seen.boss1 && MM.bossTicketCount(s2, 2) === 1);
    check('뽑기 입장권은 같은 단계 (1+2+3+5장)', MM.ticketCount(s2, 2) === 11);
    check('뽑기 위 단계 소울 (1+2+3개, 같은 속성)', (s2.souls.water3 || 0) === 6, s2.souls.water3);
    check('뽑기 확률 합 100%', Math.abs(B.GACHA_TABLE.reduce(function (a, r) { return a + r.p; }, 0) - 1) < 1e-9);
    check('소울 부족하면 못 뽑음', !!MM.gachaPull(MM.newState(t0), 'fire', 1).error);
  })();

  check('단계별 만렙 25/36/48/59/70', [1, 2, 3, 4, 5].map(MM.maxLevel).join() === '25,36,48,59,70', [1, 2, 3, 4, 5].map(MM.maxLevel).join());
  check('합성 주재료 조건 레벨 ≤ 그 단계 만렙', MM.tiers().slice(0, -1).every(function (t2) { return MM.fuseLevelReq(t2) <= MM.maxLevel(t2); }));
  (function () { var s = MM.newState(t0); var m = MM.addMonster(s, 'fire', 1, 1); m.level = 50; check('예전 세이브: 만렙 넘으면 맞춤', MM.clampLevels(s) === 1 && m.level === 25);
  (function () { var s = MM.newState(t0); s.levelScale = 2; var m = MM.addMonster(s, 'fire', 3, 1); m.level = 43; var m2 = MM.addMonster(s, 'water', 4, 1); m2.level = 43; s.souls.fire2 = 7; MM.migrateLevels(s);
    check('세이브 변환 v2→: 예전 3단계 조건 Lv43 → 새 조건, 4단계 소환 Lv43 → 새 소환, 소울 ×3', m.level === MM.fuseLevelReq(3) && m2.level === MM.summonLevel(4) && s.souls.fire2 === 21 && s.levelScale === MM.LEVEL_SCALE_VERSION && MM.migrateLevels(s) === 0, m.level + '/' + m2.level);
    var s3 = MM.newState(t0); s3.levelScale = 3; var a3 = MM.addMonster(s3, 'fire', 3, 1); a3.level = 34; var b3 = MM.addMonster(s3, 'fire', 5, 1); b3.level = 63; s3.souls.fire2 = 7; MM.migrateLevels(s3);
    check('세이브 변환 v3→v4: 3단계 조건 Lv34 → 새 조건, 5단계 만렙 → 새 만렙, 소울 그대로', a3.level === MM.fuseLevelReq(3) && b3.level === MM.maxLevel(5) && s3.souls.fire2 === 7, a3.level + '/' + b3.level); })(); })();
  // ---- 보스 ----
  (function () {
    var rr = MM.seededRng(5);
    check('무지개 보스는 상성 없음', MM.elementMult('fire', 'rainbow') === 1 && MM.elementMult('rainbow', 'grass') === 1);
    for (var bt = 1; bt <= B.MAX_TIER; bt++) {
      var w = 0, wn = 0, rounds = [], lv = MM.summonLevel(bt), trios = [['fire', 'water', 'grass'], ['light', 'dark', 'fire'], ['water', 'grass', 'light'], ['dark', 'fire', 'water'], ['grass', 'light', 'dark']];
      for (var i = 0; i < 300; i++) {
        var pt = trios[i % 5].map(function (e, k) { return { id: k + 1, el: e, tier: bt, level: lv }; });
        var b = MM.simulateBossBattle(pt, bt, rr, 'smart'); if (b.result === 'win') { w++; rounds.push(b.round); }
        if (MM.simulateBossBattle(pt, bt, rr, 'naive').result === 'win') wn++;
      }
      rounds.sort(function (a, c) { return a - c; });
      var med = rounds[Math.floor(rounds.length / 2)];
      check(bt + '단계 보스: 공격만 하면 어렵고(<50%) 예고에 대응하면 깸(>55%), 20라운드쯤', wn / 300 < 0.5 && w / 300 > 0.55 && med >= 15 && med <= 26, '공격만 ' + Math.round(wn / 3) + '% · 대응 ' + Math.round(w / 3) + '% · ' + med + '라운드');
    }
    var b1 = MM.createBossBattle([{ id: 1, el: 'fire', tier: 1, level: 10 }, { id: 2, el: 'water', tier: 1, level: 10 }], 1, rr), sealed = false, skipped = false, smashed = false;
    while (!b1.result) { var ev = MM.act(b1, null, rr); if (ev && ev.skill === 'seal') sealed = true; if (ev && ev.skip) skipped = true; if (ev && ev.skill === 'smash') smashed = true; }
    check('1단계 보스 스킬: 강타 + 봉인 → 차례 건너뜀', sealed && skipped && smashed);
    var b6 = MM.createBossBattle([{ id: 1, el: 'fire', tier: 6, level: 70 }, { id: 2, el: 'water', tier: 6, level: 70 }, { id: 3, el: 'grass', tier: 6, level: 70 }], 6, rr), seq = [];
    b6.units.forEach(function (u) { if (u.side === 'p') u.hp = u.maxHp = 1e7; });
    for (var g6 = 0; g6 < 400 && !b6.result; g6++) { var e6 = MM.act(b6, null, rr); if (e6 && e6.skill) seq.push(e6.skill); }
    var ci = seq.indexOf('charge');
    check('충전 다음 보스 차례는 대폭발 (6단계)', ci >= 0 && seq[ci + 1] === 'blast', seq.slice(0, 12).join(','));
    var b7 = MM.createBossBattle([{ id: 1, el: 'fire', tier: 7, level: 70 }], 7, rr), boss7 = b7.units[1], drained = null;
    b7.units[0].hp = b7.units[0].maxHp = 1e7; boss7.hp = Math.round(boss7.maxHp / 2);
    for (var g7 = 0; g7 < 200 && !drained; g7++) { var e7 = MM.act(b7, null, rr); if (e7 && e7.skill === 'drain') drained = e7; }
    check('흡수: 1마리 공격 + 준 피해의 50% 회복 (7단계)', drained && drained.heal === Math.round(drained.dmg * 0.5), drained && drained.dmg + '/' + drained.heal);
    var b2 = MM.createBossBattle([{ id: 1, el: 'fire', tier: 2, level: 6 }], 2, rr);
    check('보스는 다음 행동을 예고함', !!b2.units[1].plan && !!b2.units[1].plan.type);
    var me = b2.units[0], boss2 = b2.units[1];
    for (var g2 = 0; g2 < 50 && !b2.result && MM.currentActor(b2, rr) !== me; g2++) MM.act(b2, null, rr);
    MM.act(b2, null, rr, { action: 'defend' });
    check('방어: 다음 내 차례까지 받는 피해 30%', me.guard === true);
    for (var g4 = 0; g4 < 50 && !b2.result && MM.currentActor(b2, rr) !== me; g4++) MM.act(b2, null, rr);
    if (!b2.result) { MM.act(b2, null, rr, { action: 'focus' }); check('집중: 다음 공격 2배', me.focus === true && !me.guard); }
    var b3 = MM.createBossBattle([{ id: 1, el: 'fire', tier: 2, level: 6 }, { id: 2, el: 'water', tier: 2, level: 6 }], 2, rr), m0 = b3.units[0], m1 = b3.units[1];
    m1.hp = 0; m0.hp = m0.maxHp = 99999;
    for (var g3 = 0; g3 < 50 && !b3.result && MM.currentActor(b3, rr) !== m0; g3++) MM.act(b3, null, rr, { action: 'defend' });
    var rv = MM.act(b3, null, rr, { action: 'revive', target: m1.uid });
    check('부활: 쓰러진 아군 체력 30%, 1판 1번', rv.action === 'revive' && m1.hp === Math.round(m1.maxHp * 0.3) && b3.revivesLeft === 0);
    check('회복: 1판 ' + B.BOSS_HEALS + '번', b3.healsLeft === B.BOSS_HEALS);
    var s = MM.newState(t0); MM.addBossTickets(s, 3, 1);
    var g = MM.grantBossWin(s, 3, rr);
    check('보스 보상: 한 단계 위 스테이지의 소울·골드 ×100, 경험치는 1판분', g.gold === Math.round(B.CLEAR_GOLD[3] * 100) && g.exp === MM.winExp(4) && g.drops.length > 0 && g.drops.some(function (d) { return d.tier >= 2; }));
    var dg = MM.grantDungeonWin(MM.newState(t0), 3, MM.dungeonEnemies(['fire'], 3), rr);
    check('던전 보상: 골드 스테이지의 30배, 경험치는 스테이지와 같음', dg.exp === MM.winExp(3) && dg.gold === Math.round(B.CLEAR_GOLD[2] * 30));
    check('보스 입장권 사용', MM.useBossTicket(s, 3) && !MM.useBossTicket(s, 3));
    var sd = MM.newState(t0); B.BOSS_TICKET_DROP = 1; var dw = MM.grantDungeonWin(sd, 2, MM.dungeonEnemies(['fire'], 2)); B.BOSS_TICKET_DROP = 0.02;
    check('던전 승리 시 같은 단계 보스 입장권', dw.bossTicket === 2 && MM.bossTicketCount(sd, 2) === 1);
  })();

  (function () {
    var s = MM.newState(t0), last = null;
    ['fire', 'grass', 'water', 'light'].forEach(function (el) { MM.addMonster(s, el, 2, 17); });
    check('도감 세트: 4종이면 보상 없음', !(s.dexSets || {})[2] && MM.ticketCount(s, 2) === 0);
    var m = MM.addMonster(s, 'dark', 2, 17);
    check('도감 세트: 2단계 5종 완성 → 2단계 입장권 3장 + 보스 입장권 1장 (한 번만)', MM.ticketCount(s, 2) === 3 && MM.bossTicketCount(s, 2) === 1 && !MM.checkDexSet(s, 2));
  })();

  (function () {
    var s = MM.newState(t0), rr = MM.seededRng(9);
    for (var i = 0; i < 10; i++) MM.grantBossWin(s, 1, rr, t0);
    check('보스 보상 하루 10번', MM.bossLeftToday(s, t0) === 0 && MM.bossLeftToday(s, t0 + 86400000) === 10);
    var s2 = MM.newState(t0), n5 = 0, n1 = 0;
    for (var j = 0; j < 20000; j++) { if (MM.grantBossWin(s2, 5, rr, t0 + j * 86400000).feather) n5++; if (MM.grantBossWin(s2, 1, rr, t0 + j * 86400000 + 1).feather) n1++; }
    check('무지개 깃털: 1단계 0.1%, 5단계 0.5%', n1 > 5 && n1 < 40 && n5 > 70 && n5 < 130, n1 + '/' + n5);
    var s3 = MM.newState(t0); s3.gold = 1e12; s3.souls.fire2 = 200; var e = MM.craftEquip(s3, 'fire', 2).equip; e.plus = 10;
    check('+10 이상 강화는 깃털 없으면 불가', !!MM.enhanceEquip(s3, e.id).error);
    s3.items = { feather: 1 }; s3.souls.fire2 = 100; var r3 = MM.enhanceEquip(s3, e.id);
    check('깃털 1개 소모', !r3.error && MM.featherCount(s3) === 0);
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
    var mx = MM.addMonster(s, 'fire', 1, MM.maxLevel(1) - 1); mx.exp = MM.expToNext(MM.maxLevel(1) - 1) - 1; s.souls.fire5 = 50;
    var r3 = MM.feedSouls(s, mx.id, 5, 50);
    check('최대 레벨이 되면 멈추고 남은 소울은 안 씀', mx.level === MM.maxLevel(1) && r3.used === 1 && s.souls.fire5 === 49);
    check('최대 레벨이면 먹일 수 없음', !!MM.feedSouls(s, mx.id, 5, 1).error);
    var have1 = s.souls.fire1, r4 = MM.feedSouls(s, m.id, 1, 99);
    check('가진 것보다 많이 요청하면 가진 만큼만', r4.used === have1 && s.souls.fire1 === 0, JSON.stringify(r4));
  })();

  // ---- 화면 코드가 없는 밸런스 값을 쓰지 않는지 (Node에서만) [10-26 스테이지 안 들어가지던 버그] ----
  if (typeof require !== 'undefined') {
    var uiSrc = require('fs').readFileSync(require('path').join(__dirname, 'ui.js'), 'utf8'), keys = {}, mk;
    var re = /BAL\(\)\.([A-Z][A-Z0-9_]*)/g; while ((mk = re.exec(uiSrc))) keys[mk[1]] = 1;
    var missing = Object.keys(keys).filter(function (k) { return B[k] === undefined; });
    check('화면(ui.js)이 쓰는 밸런스 값이 모두 있음', missing.length === 0, missing.join(','));
  }

  // ---- 입장권 교환 가능/불가 [사용자 확정 10-26] ----
  (function () {
    var s = MM.newState(t0);
    MM.addTickets(s, 2, 2); ['fire', 'grass', 'water', 'light', 'dark'].forEach(function (el) { MM.addMonster(s, el, 2, 13); });
    check('도감 세트 입장권·보스 입장권은 교환 불가', MM.ticketCount(s, 2) === 5 && MM.ticketBound(s, 2) === 3 && MM.bossTicketCount(s, 2) === 1 && MM.bossTicketBound(s, 2) === 1);
    MM.useTicket(s, 2); MM.useBossTicket(s, 2);
    check('쓸 때는 교환 불가부터', MM.ticketCount(s, 2) === 4 && MM.ticketBound(s, 2) === 2 && MM.bossTicketBound(s, 2) === 0);
    MM.useTicket(s, 2); MM.useTicket(s, 2); MM.useTicket(s, 2);
    check('교환 불가를 다 쓰면 교환 가능을 씀', MM.ticketCount(s, 2) === 1 && MM.ticketBound(s, 2) === 0);
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
