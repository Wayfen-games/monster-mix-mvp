// 속성·종 데이터 (규칙 고정값)
(function (MM) {
  // 원형 배치 순서 (확정): 불 - 풀 - 물 - 빛 - 어둠 - (다시 불)
  MM.RING = ['fire', 'grass', 'water', 'light', 'dark'];

  MM.ELEMENTS = {
    fire:  { name: '불',   color: '#e4572e' },
    grass: { name: '풀',   color: '#3fae49' },
    water: { name: '물',   color: '#2e86de' },
    light: { name: '빛',   color: '#e8b500' },
    dark:  { name: '어둠', color: '#6c4ab6' }
  };

  // 부재료 짝: 원형에서 양옆 두 속성
  MM.partnersOf = function (el) {
    var i = MM.RING.indexOf(el), n = MM.RING.length;
    return [MM.RING[(i + n - 1) % n], MM.RING[(i + 1) % n]];
  };

  // 상성: 원형에서 바로 다음 속성에 강하다 (불>풀>물>빛>어둠>불)
  MM.beats = function (a, b) {
    var i = MM.RING.indexOf(a);
    return MM.RING[(i + 1) % MM.RING.length] === b;
  };

  MM.TIER_SHAPE = ['원', '삼각형', '사각형', '오각형', '별'];

  MM.speciesKey = function (el, tier) { return el + tier; };
  MM.speciesName = function (el, tier) { return MM.ELEMENTS[el].name + tier; };

  MM.ALL_SPECIES = [];
  MM.RING.forEach(function (el) {
    for (var t = 1; t <= 5; t++) MM.ALL_SPECIES.push({ el: el, tier: t, key: MM.speciesKey(el, t) });
  });
})((typeof globalThis !== 'undefined' ? globalThis : window).MM);
