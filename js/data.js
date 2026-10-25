// 속성·종 데이터와 공용 도우미
(function (MM) {
  // 부재료 짝용 원형 배치 (확정): 불 - 풀 - 물 - 빛 - 어둠 - (다시 불)
  MM.RING = ['fire', 'grass', 'water', 'light', 'dark'];

  // 장비 이름 (단계별). 6단계 이후는 정식 출시(10단계) 대비 구상 [사용자: 1~5 확정]
  MM.EQUIP_NAMES = ['조각', '돌', '구슬', '결정', '심장', '문장', '왕관', '성배', '별', '근원'];
  MM.equipName = function (el, tier) { return MM.ELEMENTS[el].name + '의 ' + MM.EQUIP_NAMES[tier - 1]; };

  MM.ELEMENTS = {
    fire:  { name: '불',   color: '#e4572e' },
    grass: { name: '풀',   color: '#3fae49' },
    water: { name: '물',   color: '#2e86de' },
    light: { name: '빛',   color: '#e8b500' },
    dark:  { name: '어둠', color: '#6c4ab6' },
    rainbow: { name: '무지개', color: 'url(#rbw)' } // 보스 전용 (상성 없음, RING에는 없음)
  };

  // 부재료 짝: 원형에서 양옆 두 속성만 (같은 속성은 안 됨)
  MM.partnersOf = function (el) {
    var i = MM.RING.indexOf(el), n = MM.RING.length;
    return [MM.RING[(i + n - 1) % n], MM.RING[(i + 1) % n]];
  };

  // 상성 (확정): 풀 > 물 > 불 > 풀, 어둠 ↔ 빛 (서로에게 강함)
  var BEATS = { grass: ['water'], water: ['fire'], fire: ['grass'], dark: ['light'], light: ['dark'] };
  MM.beats = function (a, b) { return (BEATS[a] || []).indexOf(b) >= 0; };
  MM.weaknessesOf = function (el) {
    return MM.RING.filter(function (x) { return MM.beats(x, el); });
  };

  MM.speciesKey = function (el, tier) { return el + tier; };
  MM.parseKey = function (key) { return { el: key.replace(/\d+$/, ''), tier: +key.match(/\d+$/)[0] }; };
  // [사용자 확정 19:17] 몬스터 이름 (이름만 표시). 1단계는 모두 슬라임, 2단계부터 동물 계열
  MM.MON_NAMES = {
    fire:  ['플레임 슬라임', '이그닛', '살라그', '살라만', '살라만더'],
    water: ['아쿠아 슬라임', '마린', '셀키', '셀키온', '마리너'],
    grass: ['리프 슬라임', '스프라우트', '폰', '실바', '실바누스'],
    light: ['스타 슬라임', '루미', '글린트', '래디언', '솔라리스'],
    dark:  ['문 슬라임', '녹스', '녹스배트', '이클립스', '녹투르나']
  };
  MM.speciesName = function (el, tier) { var n = MM.MON_NAMES[el] && MM.MON_NAMES[el][tier - 1]; return n || (MM.ELEMENTS[el].name + tier); };
  // [사용자 확정 17:34] 소울 이름: '1단계 불의 소울'
  MM.soulName = function (el, tier) { return tier + '단계 ' + MM.ELEMENTS[el].name + '의 소울'; };
  // [사용자 확정] 보스 이름
  MM.BOSS_NAMES = ['프리즘', '스펙트라', '오로라', '크로마', '레인보 엠퍼러'];
  MM.bossName = function (tier) { return MM.BOSS_NAMES[tier - 1] || (tier + '단계 무지개 보스'); };

  MM.maxTier = function () { return MM.BALANCE.MAX_TIER; };
  MM.tiers = function () { var a = []; for (var t = 1; t <= MM.maxTier(); t++) a.push(t); return a; };
  MM.allSpecies = function () {
    var out = [];
    MM.RING.forEach(function (el) { MM.tiers().forEach(function (t) { out.push({ el: el, tier: t, key: MM.speciesKey(el, t) }); }); });
    return out;
  };

  // 단계별 목록에서 t단계 값 (1부터). 목록이 짧으면 마지막 두 값의 비율로 연장한다.
  MM.tierVal = function (arr, t) {
    if (t <= arr.length) return arr[t - 1];
    var n = arr.length;
    if (n < 2) return arr[n - 1];
    var a = arr[n - 2], b = arr[n - 1];
    var ratio = a ? b / a : 1;
    var v = b;
    for (var i = n; i < t; i++) v = ratio > 0 && ratio !== 1 ? v * ratio : v + (b - a);
    return v;
  };

  // 한국 시간 기준 날짜·요일
  MM.KST_OFFSET = 9 * 3600 * 1000;
  MM.dayKey = function (ms) { return new Date(ms + MM.KST_OFFSET).toISOString().slice(0, 10); };
  MM.weekday = function (ms) { return new Date(ms + MM.KST_OFFSET).getUTCDay(); };
  MM.WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

  // 조사: 받침 있으면 a, 없으면 b
  MM.josa = function (word, a, b) {
    var ch = word.charCodeAt(word.length - 1);
    if (ch >= 0xac00 && ch <= 0xd7a3) return word + ((ch - 0xac00) % 28 ? a : b);
    if (/[0-9]$/.test(word)) return word + ('013678'.indexOf(word.slice(-1)) >= 0 ? a : b);
    return word + a;
  };
})((typeof globalThis !== 'undefined' ? globalThis : window).MM);
