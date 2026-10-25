// 화면 (v2). 규칙은 logic.js, 숫자는 balance.js. 여기서는 그리기와 입력만.
(function (MM) {
  var SAVE_KEY = 'monster-mix-mvp-v1';
  var BACKUP_KEY = 'monster-mix-mvp-v1-backup';
  var S = null;
  var view = {
    tab: 'home', stageSeg: 'stage', monSeg: 'list', dexSeg: 'dex',
    fusion: { mainId: null, subId: null, soulEl: null },
    stage: null, dungeonEls: [], battle: null, reward: null,
    tut: { picks: [] }, migrated: false
  };
  var $ = function (id) { return document.getElementById(id); };
  var BAL = function () { return MM.BALANCE; };
  var T = function () { return MM.BALANCE.MAX_TIER; };

  // ================= 저장 =================
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    try { S = raw ? JSON.parse(raw) : null; } catch (e) { S = null; }
    if (S && S.version !== MM.SAVE_VERSION) {
      try { localStorage.setItem(BACKUP_KEY, raw); } catch (e) {}
      S = null; view.migrated = true;
    }
    if (!S) S = MM.newState(Date.now());
    var d = MM.newState(Date.now());
    Object.keys(d).forEach(function (k) { if (S[k] === undefined) S[k] = d[k]; });
    Object.keys(d.settings).forEach(function (k) { if (S.settings[k] === undefined) S.settings[k] = d.settings[k]; });
  }
  function save() {
    if (S.tutorial && S.tutorial.done) MM.accrueOffline(S, Date.now()); else S.offline.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  }

  // ================= 공용 그리기 =================
  function polyPoints(n, cx, cy, r, rot, inner) {
    var pts = [], total = inner ? n * 2 : n;
    for (var i = 0; i < total; i++) {
      var rr = inner && i % 2 ? inner : r;
      var a = rot + i * Math.PI * 2 / total;
      pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }
  function shapeFor(tier) {
    if (tier === 1) return '<circle cx="50" cy="54" r="38"/>';
    if (tier === 2) return '<polygon points="50,8 95,90 5,90" stroke-linejoin="round"/>';
    if (tier === 3) return '<rect x="12" y="14" width="76" height="76" rx="12"/>';
    if (tier === 4) return '<polygon points="' + polyPoints(5, 50, 54, 44, -Math.PI / 2) + '" stroke-linejoin="round"/>';
    if (tier === 5) return '<polygon points="' + polyPoints(5, 50, 54, 48, -Math.PI / 2, 22) + '" stroke-linejoin="round"/>';
    if (tier === 6) return '<polygon points="' + polyPoints(6, 50, 54, 46, -Math.PI / 2) + '" stroke-linejoin="round"/><polygon points="' + polyPoints(6, 50, 54, 30, -Math.PI / 2) + '" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3"/>';
    return '<polygon points="' + polyPoints(tier - 1, 50, 54, 48, -Math.PI / 2, 26) + '" stroke-linejoin="round"/>';
  }
  var EYE_Y = { 1: 52, 2: 66, 3: 50, 4: 54, 5: 56, 6: 54 };
  function monInner(el, tier, sil) {
    var color = sil ? '#3a355f' : MM.ELEMENTS[el].color;
    var ey = EYE_Y[tier] || 56;
    var eyes = sil ? '' :
      '<circle cx="40" cy="' + ey + '" r="7" fill="#fff"/><circle cx="60" cy="' + ey + '" r="7" fill="#fff"/>' +
      '<circle cx="41.5" cy="' + (ey + 1) + '" r="3.5" fill="#1b1830"/><circle cx="61.5" cy="' + (ey + 1) + '" r="3.5" fill="#1b1830"/>';
    var defs = el === 'rainbow' && !sil ? '<defs><linearGradient id="rbw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a5a"/><stop offset=".25" stop-color="#ffc83d"/><stop offset=".5" stop-color="#4cd964"/><stop offset=".75" stop-color="#3fa3ff"/><stop offset="1" stop-color="#b45cff"/></linearGradient></defs>' : '';
    return defs + '<g fill="' + color + '" stroke="rgba(0,0,0,.28)" stroke-width="4">' + shapeFor(tier) + '</g>' + eyes;
  }
  function monSvg(el, tier, size, sil) {
    return '<span class="mon"><svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100">' + monInner(el, tier, sil) + '</svg></span>';
  }
  function unknownSvg(size) {
    return '<span class="mon"><svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100"><circle cx="50" cy="54" r="38" fill="#3a355f"/><text x="50" y="68" text-anchor="middle" font-size="40" font-weight="900" fill="#a9a2cc">?</text></svg></span>';
  }
  function elName(el) { return '<span style="color:' + MM.ELEMENTS[el].color + '">' + MM.ELEMENTS[el].name + '</span>'; }
  function name(m) { return MM.speciesName(m.el, m.tier); }
  function pct(x) { return Math.round(x * 1000) / 10 + '%'; }
  function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2400);
  }
  function sortMons(list) {
    return list.slice().sort(function (a, b) {
      return b.tier - a.tier || MM.RING.indexOf(a.el) - MM.RING.indexOf(b.el) || b.level - a.level;
    });
  }
  function partyMons() { return S.party.map(function (id) { return MM.getMonster(S, id); }).filter(Boolean); }
  function maxPartyTier() { return Math.max.apply(null, partyMons().map(function (m) { return m.tier; }).concat([1])); }
  function gridCols() { return 'grid-template-columns:44px repeat(' + T() + ', minmax(52px, 1fr))'; }
  function elChart() {
    return '<div class="elchart">' + elName('grass') + '<span class="arrow">▶</span>' + elName('water') + '<span class="arrow">▶</span>' + elName('fire') + '<span class="arrow">▶</span>' + elName('grass') +
      '<span class="arrow" style="margin:0 6px">·</span>' + elName('dark') + '<span class="arrow">⇄</span>' + elName('light') + '</div>' +
      '<div class="muted small" style="margin-top:4px">유리하면 피해 ×' + BAL().ELEMENT_ADV_MULT + ', 불리하면 ×' + BAL().ELEMENT_DISADV_MULT + ' (어둠과 빛은 서로에게 강해요)</div>';
  }
  function weakText(el) {
    var w = MM.weaknessesOf(el);
    return w.length ? '<div class="weak">약점: ' + w.map(function (x) { return MM.ELEMENTS[x].name; }).join('·') + '</div>' : '';
  }
  function timeText(t) {
    var d = new Date(t);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ================= 화면 전환 =================
  function stopBattleTimers() { if (view.battle && view.battle.timer) clearTimeout(view.battle.timer); }
  function go(tab) {
    stopBattleTimers();
    if (tab !== 'battle') view.battle = null;
    view.tab = tab;
    closeSheet();
    render();
    $('screen').scrollTop = 0;
  }

  function render() {
    MM.refreshDaily(S, Date.now());
    $('gold').textContent = fmt(S.gold) + ' G';
    document.body.classList.toggle('in-battle', view.tab === 'battle');
    var tabFor = { stageDetail: 'stages', reward: 'stages', settings: 'home', battle: 'stages', altar: 'home', gacha: 'home' };
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.classList.toggle('on', b.dataset.tab === (tabFor[view.tab] || view.tab));
    });
    var fn = SCREENS[view.tab] || SCREENS.home;
    $('screen').innerHTML = fn();
    var dock = DOCKS[view.tab] ? DOCKS[view.tab]() : '';
    $('dock').innerHTML = dock; $('dock').hidden = !dock;
    $('screen').classList.toggle('has-dock', !!dock);
  }

  var SCREENS = {}, DOCKS = {};

  // ================= 마을 =================
  SCREENS.altar = function () {
    var html = '<button class="btn sm" data-act="tab" data-tab="home">← 마을</button><h2>🔥 소울 제단</h2>' +
      '<div class="muted small lh" style="margin-bottom:10px">속성마다 제단이 있어요. 그 속성 소울을 바치면 제단 레벨이 오르고, 그 속성 몬스터 전체가 영구히 강해져요.<br>레벨당 경험치 +' + Math.round(BAL().ALTAR_EXP_PER_LV * 100) + '% · 체력·공격·방어 +' + (BAL().ALTAR_STAT_PER_LV * 100) + '% · 높은 단계 소울일수록 많이 차요 (n단계 = ' + BAL().ALTAR_SOUL_POINTS_GROWTH + '^(n-1)점)</div>';
    MM.RING.forEach(function (el) {
      var a = MM.altarOf(S, el), need = MM.altarNeed(a.level);
      html += '<div class="card"><div class="row between"><div class="row" style="gap:8px">' + monSvg(el, 3, 32) + '<b>' + MM.ELEMENTS[el].name + ' 제단 Lv ' + a.level + '</b></div><button class="btn sm primary" data-act="offerSheet" data-el="' + el + '">바치기</button></div>' +
        '<div class="expbar" style="margin-top:8px"><i style="width:' + (a.pts / need * 100) + '%"></i></div>' +
        '<div class="row between small muted" style="margin-top:4px"><span>' + fmt(a.pts) + ' / ' + fmt(need) + '점</span><span>경험치 +' + Math.round(MM.altarExpBonus(S, el) * 100) + '% · 능력치 +' + (Math.round(MM.altarStatBonus(S, el) * 1000) / 10) + '%</span></div></div>';
    });
    return html;
  };
  function offerSheet(el) {
    var a = MM.altarOf(S, el), html = '<b>' + MM.ELEMENTS[el].name + ' 제단에 바치기</b> <span class="muted small">Lv ' + a.level + '</span><div class="pick-list" style="margin-top:10px">', any = false;
    MM.tiers().forEach(function (t) {
      var n = S.souls[MM.speciesKey(el, t)] || 0; if (!n) return; any = true;
      var opts = [1, 10, n].filter(function (c, i, arr) { return c <= n && arr.indexOf(c) === i; });
      html += '<div class="pick" style="display:block"><div class="row between"><b>' + MM.speciesName(el, t) + ' 소울 ' + n + '개</b><span class="muted small">1개 ' + fmt(MM.altarSoulPoints(t)) + '점</span></div><div class="row wrap" style="gap:6px;margin-top:8px">' +
        opts.map(function (c) { var p = MM.offerPreview(S, el, t, c); return '<button class="btn sm" data-act="offer" data-el="' + el + '" data-tier="' + t + '" data-n="' + c + '">' + (c === n && c > 10 ? '전부' : c + '개') + (p.level > a.level ? ' → Lv ' + p.level : '') + '</button>'; }).join('') + '</div></div>';
    });
    if (!any) html += '<div class="muted small">' + MM.ELEMENTS[el].name + ' 소울이 없어요</div>';
    openSheet(html + '</div><div class="muted small" style="margin-top:10px">바친 소울은 돌아오지 않아요. 소환·합성에 쓸 소울은 남겨 두세요.</div>');
  }
  SCREENS.gacha = function () {
    var c = BAL().GACHA_COST;
    var html = '<button class="btn sm" data-act="tab" data-tab="home">← 마을</button><h2>🎁 소울 뽑기</h2>' +
      '<div class="muted small lh" style="margin-bottom:10px">같은 소울 ' + c + '개로 한 번 뽑아요. 꽝 없음! 같은 단계 소울 10·20·30개, 입장권 1·2·3·5장, 한 단계 위 소울 1·2·3개 중 하나 · 아주 가끔 보스 입장권!</div>' +
      '<div class="hscroll"><div class="tgrid" style="' + gridCols() + '"><div></div>' + MM.tiers().map(function (t) { return '<div class="head">' + t + '단계</div>'; }).join('');
    MM.RING.forEach(function (el) {
      html += '<div class="el">' + elName(el) + '</div>';
      MM.tiers().forEach(function (t) {
        var n = S.souls[MM.speciesKey(el, t)] || 0, k = Math.floor(n / c);
        html += '<button class="soul-cell' + (k ? ' ready' : '') + '" data-act="gachaSheet" data-el="' + el + '" data-tier="' + t + '"' + (k ? '' : ' disabled') + '><b>' + n + '개</b>' + (k ? k + '번' : '') + '</button>';
      });
    });
    return html + '</div></div><div class="muted small" style="margin-top:10px">총 ' + fmt(S.stats.gachaPulls || 0) + '번 뽑았어요</div>';
  };
  function gachaSheet(el, tier) {
    var n = S.souls[MM.speciesKey(el, tier)] || 0, c = BAL().GACHA_COST, k = Math.floor(n / c);
    openSheet('<div class="row" style="gap:12px">' + monSvg(el, tier, 52) + '<div><b>' + MM.speciesName(el, tier) + ' 소울 뽑기</b><div class="muted small">보유 ' + n + '개 · 1번에 ' + c + '개</div></div></div>' +
      '<div class="grid2" style="margin-top:14px"><button class="btn primary" data-act="gacha" data-el="' + el + '" data-tier="' + tier + '" data-n="1"' + (k >= 1 ? '' : ' disabled') + '>1번 뽑기</button>' +
      '<button class="btn" data-act="gacha" data-el="' + el + '" data-tier="' + tier + '" data-n="' + k + '"' + (k >= 2 ? '' : ' disabled') + '>' + (k >= 2 ? '전부 ' + k + '번' : '전부 뽑기') + '</button></div>');
  }
  function gachaRank(r) { return r.kind === 'boss' ? 1000 : r.kind === 'up' ? 100 + r.n : r.kind === 'ticket' ? 10 + r.n : r.n / 10; }
  function gachaLabel(r) { return r.kind === 'boss' ? '보스 입장권!!!' : r.kind === 'up' ? '위 단계 소울 ' + r.n + '개' + (r.n >= 3 ? '!!' : '!') : r.kind === 'ticket' ? '입장권 ' + r.n + '장' + (r.n >= 5 ? '!!' : r.n >= 2 ? '!' : '') : '소울 ' + r.n + '개'; }
  function doGacha(el, tier, times) {
    var res = [];
    for (var i = 0; i < times; i++) { var r = MM.gachaPull(S, el, tier); if (r.error) { if (!res.length) { toast(r.error); return; } break; } res.push(r); }
    save(); closeSheet(); render();
    var best = res.slice().sort(function (a, b) { return gachaRank(b) - gachaRank(a); })[0];
    var drops = {}, tickets = 0;
    var bossT = 0; res.forEach(function (r) { bossT += r.bossTickets || 0; }); res.forEach(function (r) { r.drops.forEach(function (d) { var x = drops[d.key] || (drops[d.key] = { key: d.key, el: d.el, tier: d.tier, count: 0, added: 0, wasted: 0, first: false }); x.count += d.count; x.added += d.added; x.wasted += d.wasted; x.first = x.first || d.first; }); tickets += r.tickets; });
    var list = Object.keys(drops).map(function (k) { return drops[k]; }).sort(function (a, b) { return b.tier - a.tier; });
    var big = best.big || best.kind === 'up' || (best.kind === 'ticket' && best.n >= 3);
    var icon = best.kind === 'boss' ? '🌈' : best.kind === 'up' ? (best.n >= 3 ? '💎' : '✨') : best.kind === 'ticket' ? '🎟' : '🎁';
    var tally = {}; res.forEach(function (r) { var k = gachaLabel(r).replace(/!/g, ''); tally[k] = (tally[k] || 0) + 1; });
    showOverlay('<div class="result ok"><div class="stage-anim"><div class="' + (big ? raysClass(best.big ? 5 : 4) : 'rays reveal now') + '"></div><div class="pop now" style="font-size:96px;line-height:130px">' + icon + '</div></div>' +
      '<div class="reveal now"><div class="big ok">' + gachaLabel(best) + '</div><div class="sub">' + MM.speciesName(el, tier) + ' 소울 뽑기 ' + res.length + '번' + '</div>' +
      (res.length > 1 ? '<div class="muted small" style="margin-top:6px">' + Object.keys(tally).map(function (k) { return k + ' ×' + tally[k]; }).join(' · ') + '</div>' : '') +
      '<div class="card" style="margin-top:14px;text-align:left"><div class="soul-list">' + (list.length ? dropsHtml(list) : '') + (tickets ? '<div class="soul-item rare">🎟 ' + tier + '단계 입장권 ×' + tickets + '</div>' : '') + (bossT ? '<div class="soul-item rare">🌈 ' + tier + '단계 보스 입장권 ×' + bossT + '</div>' : '') + '</div></div>' +
      '<div class="acts"><button class="btn primary block" data-act="closeOverlay">확인</button></div></div></div>');
    var rare = rareOf(list); if (rare.length) rare.forEach(showBanner);
  }
  function goalCount() {
    return MM.RING.filter(function (el) { return S.dex[MM.speciesKey(el, T())]; }).length;
  }
  function readyPairs(limit) {
    var out = [];
    S.monsters.forEach(function (a) {
      S.monsters.forEach(function (b) {
        if (out.length >= (limit || 99)) return;
        if (!MM.isPair(a, b)) return;
        var c = MM.fusionCheck(S, a, b);
        if (c.ok) out.push({ main: a, sub: b });
      });
    });
    out.sort(function (x, y) { return y.main.tier - x.main.tier; });
    return out;
  }
  function hint() {
    var r = readyPairs(1);
    if (r.length) return '지금 합성할 수 있어요: ' + name(r[0].main) + ' + ' + name(r[0].sub);
    var ready = MM.allSpecies().filter(function (sp) { return MM.canSummon(S, sp.key); });
    if (ready.length) return '소환할 수 있는 소울이 있어요 (몬스터 → 소울)';
    var mt = maxPartyTier();
    return mt + '단계 스테이지에서 소울과 경험치를 모으세요. 합성하려면 주재료가 Lv ' + MM.fuseLevelReq(Math.min(mt, T() - 1)) + ' 이상이어야 해요.';
  }

  SCREENS.home = function () {
    var g = goalCount(), now = Date.now();
    var stars = MM.RING.map(function (el) {
      var have = !!S.dex[MM.speciesKey(el, T())];
      return '<div>' + monSvg(el, T(), 40, !have) + '<div>' + MM.speciesName(el, T()) + '</div></div>';
    }).join('');
    var pm = partyMons();
    var slots = [0, 1, 2].map(function (i) {
      var m = pm[i];
      if (!m) return '<button class="slot empty" data-act="tab" data-tab="monsters">+ 비어 있음</button>';
      return '<button class="slot" data-act="tab" data-tab="monsters">' + monSvg(m.el, m.tier, 44) + '<div>' + name(m) + '</div><div class="muted small">Lv ' + m.level + '</div></button>';
    }).join('');
    var dEl = MM.dungeonElementFor(now), off = S.offline.stage;
    return '<div class="card"><div class="row between"><b>1차 목표: ' + T() + '단계 5종 모으기</b><span class="chip">' + g + ' / 5</span></div><div class="goal-stars">' + stars + '</div></div>' +
      offlineCard() +
      '<div class="card"><b>오늘</b><div class="today" style="margin-top:10px">' +
      '<div>요일 던전<b>' + (dEl ? MM.ELEMENTS[dEl].name : '주말 선택') + ' ' + MM.dungeonLeft(S, now) + '/' + BAL().DUNGEON_DAILY + '</b></div>' +
      '<div>자동 반복<b>' + MM.autoLeft(S, now) + '판</b><span class="small">하루 +' + BAL().AUTO_REPEAT_DAILY + ' · 최대 ' + fmt(BAL().AUTO_REPEAT_MAX) + '</span></div>' +
      '</div></div>' +
      '<div class="card"><b>다음 할 일</b><div class="muted" style="margin-top:6px">' + hint() + '</div></div>' +
      '<div class="grid2" style="margin-bottom:12px"><button class="card tap-card" data-act="tab" data-tab="altar"><b>🔥 소울 제단</b><div class="muted small">남는 소울로 속성 영구 강화</div></button><button class="card tap-card" data-act="tab" data-tab="gacha"><b>🎁 소울 뽑기</b><div class="muted small">소울 ' + BAL().GACHA_COST + '개로 한 번</div></button></div>' +
      '<h3>파티 ' + (MM.partyHasBonus(pm) ? '<span class="chip adv">속성 조화 +' + Math.round(BAL().PARTY_BONUS * 100) + '%</span>' : '<span class="muted small">서로 다른 속성 3마리면 +' + Math.round(BAL().PARTY_BONUS * 100) + '%</span>') + '</h3><div class="party-slots">' + slots + '</div>' +
      '<div class="grid2" style="margin-top:14px"><button class="btn primary" data-act="tab" data-tab="stages">⚔ 전투</button><button class="btn primary" data-act="tab" data-tab="fusion">✦ 합성</button></div>' +
      '<h3>기록</h3><div class="card muted small lh">합성 ' + S.stats.fusionTries + '회 시도 · ' + S.stats.fusionSuccess + '회 성공<br>전투 ' + S.stats.battlesWon + '승 ' + S.stats.battlesLost + '패 · 몬스터 ' + S.monsters.length + '마리' +
      (S.records.length ? '<br><button class="btn sm" style="margin-top:8px" data-act="records">희귀 획득 기록 ' + S.records.length + '개 보기</button>' : '') + '</div>' +
      '<button class="btn block" data-act="tab" data-tab="settings">⚙ 설정</button>';
  };

  // ================= 전투 탭: 스테이지 / 요일 던전 =================
  SCREENS.stages = function () {
    var html = '<div class="seg"><button class="' + (view.stageSeg === 'stage' ? 'on' : '') + '" data-act="stageSeg" data-v="stage">스테이지</button>' +
      '<button class="' + (view.stageSeg === 'dungeon' ? 'on' : '') + '" data-act="stageSeg" data-v="dungeon">요일 던전 ' + MM.dungeonLeft(S, Date.now()) + '/' + BAL().DUNGEON_DAILY + '</button>' +
      '<button class="' + (view.stageSeg === 'ticket' ? 'on' : '') + '" data-act="stageSeg" data-v="ticket">입장권 ' + MM.ticketTotal(S) + '</button>' +
      '<button class="' + (view.stageSeg === 'boss' ? 'on' : '') + '" data-act="stageSeg" data-v="boss">보스 ' + MM.bossTicketTotal(S) + '</button></div>';
    return html + (view.stageSeg === 'dungeon' ? dungeonHtml() : view.stageSeg === 'ticket' ? ticketHtml() : view.stageSeg === 'boss' ? bossHtml() : stageListHtml());
  };

  function stageListHtml() {
    var mt = maxPartyTier();
    var html = '<div class="card">' + elChart() + '</div>' +
      '<div class="muted small" style="margin-bottom:10px">n단계 스테이지 = (n+1)단계 보스 + n단계 쫄 2마리. 노란 테두리 = 지금 파티 단계</div>';
    html += '<div class="hscroll"><div class="tgrid" style="' + gridCols() + '"><div></div>' + MM.tiers().map(function (t) { return '<div class="head">' + t + '단계</div>'; }).join('');
    MM.RING.forEach(function (el) {
      html += '<div class="el">' + elName(el) + '</div>';
      MM.tiers().forEach(function (t) {
        var c = S.cleared[MM.speciesKey(el, t)] || 0, bossT = t < T() ? t + 1 : t;
        html += '<button class="stage-cell' + (c ? ' clear' : '') + (t === mt ? ' rec' : '') + '" data-act="stage" data-el="' + el + '" data-tier="' + t + '">' +
          monSvg(el, bossT, 24) + '<span>' + (c ? '✓' + c : '') + '</span></button>';
      });
    });
    return html + '</div></div>';
  }

  function possibleSouls(el, tier) {
    var bossT = Math.min(tier < T() ? tier + 1 : tier, T());
    var list = [];
    for (var k = bossT; k >= 1; k--) list.push(monSvg(el, k, 18) + MM.speciesName(el, k));
    return '<div class="row wrap" style="gap:6px;margin-top:8px">' + list.map(function (x) { return '<span class="chip">' + x + '</span>'; }).join('') + '</div>' +
      '<div class="muted small" style="margin-top:6px">+ 쫄 속성 1~' + tier + '단계 소울 (랜덤)</div>';
  }

  function partyAdvRow(targetEls) {
    var pm = partyMons();
    if (!pm.length) return '<span class="muted">파티가 비어 있어요</span>';
    return pm.map(function (m) {
      var adv = targetEls.some(function (e) { return MM.beats(m.el, e); }), dis = targetEls.some(function (e) { return MM.beats(e, m.el); });
      return '<div style="text-align:center;position:relative">' + monSvg(m.el, m.tier, 40) + (adv || dis ? '<span class="adv-mark">' + (adv ? '▲' : '') + (dis ? '<span class="dis-mark">▼</span>' : '') + '</span>' : '') + '<div class="small">' + name(m) + ' Lv' + m.level + '</div></div>';
    }).join('');
  }

  SCREENS.stageDetail = function () {
    var st = view.stage, cleared = !!S.cleared[MM.speciesKey(st.el, st.tier)];
    var bossT = st.tier < T() ? st.tier + 1 : st.tier, now = Date.now();
    var off = S.offline.stage, isOff = off && off.el === st.el && off.tier === st.tier;
    var pm = partyMons();
    var html = '<button class="btn sm" data-act="tab" data-tab="stages">← 스테이지 목록</button>' +
      '<h2 style="margin-top:12px">' + elName(st.el) + ' ' + st.tier + '단계 스테이지</h2>' +
      '<div class="card"><div class="muted small">등장하는 적 (보스 Lv ' + Math.round(MM.tierVal(BAL().STAGE_ENEMY_LEVEL, st.tier)) + ')</div><div class="enemy-row">' +
      '<div>' + unknownSvg(46) + '<div>' + st.tier + '단계 쫄</div><div class="muted small">랜덤</div></div>' +
      '<div class="boss">' + monSvg(st.el, bossT, 66) + '<div>보스 ' + MM.speciesName(st.el, bossT) + '</div>' + weakText(st.el) + '</div>' +
      '<div>' + unknownSvg(46) + '<div>' + st.tier + '단계 쫄</div><div class="muted small">랜덤</div></div>' +
      '</div><div class="muted small">쫄 2마리는 매 판 바뀌어요 (서로 다르고 보스와도 다른 속성)</div></div>';
    html += '<div class="card">' + elChart() + '</div>';
    html += '<div class="card"><div class="row between"><span class="muted small">출전 파티 (▲ 보스에게 유리 · <span style="color:var(--bad)">▼</span> 불리)</span>' + (MM.partyHasBonus(pm) ? '<span class="chip adv">속성 조화 +' + Math.round(BAL().PARTY_BONUS * 100) + '%</span>' : '') + '</div>' +
      '<div class="row" style="justify-content:space-around;margin-top:8px">' + partyAdvRow([st.el]) + '</div>' +
      '<div class="muted small" style="margin-top:8px">권장: ' + st.tier + '단계 3마리</div></div>';
    if (!cleared) { var fcN = Math.round(MM.tierVal(BAL().FIRST_CLEAR_SOULS, st.tier)); if (fcN) html += '<div class="card" style="border-color:var(--accent)"><b style="color:var(--accent)">첫 클리어 보상</b><div class="row" style="gap:8px;margin-top:8px">' + monSvg(st.el, Math.min(bossT, T()), 28) + MM.speciesName(st.el, Math.min(bossT, T())) + ' 소울 ' + fcN + '개 확정</div></div>'; }
    html += '<div class="card"><b>나올 수 있는 소울</b>' + possibleSouls(st.el, st.tier) + '</div>';
    html += '<button class="btn primary block" data-act="startStage"' + (pm.length ? '' : ' disabled') + '>도전</button>';
    if (cleared) {
      var left = MM.autoLeft(S, now);
      html += '<button class="btn good block" style="margin-top:10px" data-act="startRepeat"' + (left && pm.length ? '' : ' disabled') + '>자동 반복 시작 · ' + left + '판 남음</button>' +
        '<button class="btn block" style="margin-top:10px" data-act="setOffline"' + (isOff ? ' disabled' : '') + '>' + (isOff ? '✓ 방치 보상 스테이지' : '방치 보상 스테이지로 지정') + '</button>' +
        '<div class="muted small" style="margin-top:6px;text-align:center">게임을 안 하는 동안 최대 ' + BAL().OFFLINE_MAX_HOURS + '시간, 효율 ' + Math.round(BAL().OFFLINE_RATE * 100) + '%로 보상이 쌓여요</div>';
    } else {
      html += '<div class="muted small" style="margin-top:8px;text-align:center">한 번 클리어하면 자동 반복과 방치 보상을 쓸 수 있어요</div>';
    }
    return html;
  };

  function dungeonHtml() {
    var now = Date.now(), dEl = MM.dungeonElementFor(now), wd = MM.weekday(now), left = MM.dungeonLeft(S, now);
    var els = dEl ? [dEl] : view.dungeonEls;
    var html = '<div class="card"><div class="row between"><b>' + MM.WEEKDAY_NAMES[wd] + '요일 던전</b><span class="chip gold">오늘 ' + left + '/' + BAL().DUNGEON_DAILY + '판</span></div>' +
      '<div class="muted small lh" style="margin-top:6px">하루 ' + BAL().DUNGEON_DAILY + '번 클리어 (지면 횟수 그대로, 다시 도전 가능) · 소울이 스테이지보다 훨씬 잘 나와요 · 한 번 깬 단계는 소탕 가능 · 앞 단계를 깨야 다음 단계가 열려요<br>월 빛 · 화 불 · 수 물 · 목 풀 · 금 어둠 · 주말은 속성 3개 선택</div></div>';
    if (!dEl) {
      html += '<div class="card"><b>주말: 서로 다른 속성 3개 고르기 (' + view.dungeonEls.length + '/3)</b><div class="el-pick" style="margin:10px 0 0">' + MM.RING.map(function (el) {
        var on = view.dungeonEls.indexOf(el) >= 0;
        return '<button class="' + (on ? 'on' : '') + '" data-act="dEl" data-el="' + el + '">' + monSvg(el, 2, 28) + '<div>' + MM.ELEMENTS[el].name + '</div></button>';
      }).join('') + '</div></div>';
    }
    var ready = dEl ? true : els.length === 3; // 주말은 서로 다른 3속성을 다 골라야 함
    MM.tiers().forEach(function (t) {
      var unlocked = MM.dungeonUnlocked(S, t), cleared = !!S.dungeon.cleared[t];
      var icons = ready ? (els.length === 1 ? [els[0], els[0], els[0]] : els).map(function (e) { return monSvg(e, t, 34); }).join('') : unknownSvg(34) + unknownSvg(34) + unknownSvg(34);
      html += '<div class="card" style="' + (unlocked ? '' : 'opacity:.5') + '"><div class="row between"><div><b>' + t + '단계 던전</b> <span class="muted small">' + t + '단계 3마리 · 1단계 소울 확정' + '</span></div>' +
        (cleared ? '<span class="chip party">클리어</span>' : unlocked ? '' : '<span class="chip">잠김</span>') + '</div>' +
        '<div class="row" style="margin:10px 0;justify-content:center;gap:12px">' + icons + '</div>' +
        (unlocked ? '<div class="grid2"><button class="btn primary sm" data-act="startDungeon" data-tier="' + t + '"' + (left && ready && S.party.length ? '' : ' disabled') + '>도전</button>' +
          '<button class="btn sm" data-act="sweepDungeon" data-tier="' + t + '"' + (left && ready && cleared ? '' : ' disabled') + '>소탕</button></div>' :
          '<div class="muted small" style="text-align:center">' + (t - 1) + '단계 던전을 먼저 깨야 해요</div>') + '</div>';
    });
    return html;
  }

  var SKILL_TEXT = {
    seal: function (k) { return k.every + '턴마다 아군 1마리 ' + k.turns + '턴 봉인'; },
    sweep: function (k) { return k.every + '턴마다 아군 전체 공격'; },
    smash: function (k) { return k.every + '턴마다 1마리 강타 (×' + k.mult + ')'; },
    enrage: function (k) { return '체력 ' + Math.round(k.at * 100) + '% 이하가 되면 분노 (공격 ×' + k.mult + ')'; },
    shield: function (k) { return k.every + '턴마다 ' + k.turns + '턴 보호막 (받는 피해 절반)'; },
    heal: function (k) { return k.every + '턴마다 체력 ' + Math.round(k.pct * 100) + '% 회복'; }
  };
  function bossHtml() {
    var html = '<div class="card"><div class="row between"><b>🌈 무지개 보스</b><span class="chip gold">입장권 ' + MM.bossTicketTotal(S) + '장</span></div>' +
      '<div class="muted small lh" style="margin-top:6px">보스 입장권으로만 들어가요 · 상성 없음 · 자동 전투 불가 · 이기면 입장권 1장 사용 (지면 그대로)<br>보상: 한 단계 위 스테이지 소울을 100배로 (위 단계 소울도 나와요) · 입장권은 던전에서 가끔, 소울 뽑기에서 아주 가끔 나와요</div></div>';
    MM.tiers().forEach(function (t) {
      var n = MM.bossTicketCount(S, t), sk = BAL().BOSS_SKILLS[t] || [];
      html += '<div class="card" style="' + (n ? 'border-color:var(--accent)' : 'opacity:.6') + '"><div class="row between"><b>' + t + '단계 무지개 보스</b><span class="chip' + (n ? ' gold' : '') + '">🌈 ' + n + '장</span></div>' +
        '<div class="row" style="gap:12px;margin:10px 0">' + monSvg('rainbow', t, 64) + '<div class="muted small lh">' + sk.map(function (k) { return '· ' + SKILL_TEXT[k.type](k); }).join('<br>') + '<br>· 추천: ' + t + '단계 Lv ' + MM.summonLevel(t) + ' 이상 3마리</div></div>' +
        '<button class="btn primary sm block" data-act="startBoss" data-tier="' + t + '"' + (n && S.party.length ? '' : ' disabled') + '>' + (n ? '도전 (이기면 입장권 1장 사용)' : t + '단계 던전에서 입장권을 모아 보세요') + '</button></div>';
    });
    return html;
  }
  function ticketHtml() {
    var els = view.ticketEls, ready = els.length === 3;
    var html = '<div class="card"><div class="row between"><b>🎟 입장권 던전</b><span class="chip gold">입장권 ' + MM.ticketTotal(S) + '장</span></div>' +
      '<div class="muted small lh" style="margin-top:6px">입장권으로만 들어가는 던전이에요. 요일 던전 하루 ' + BAL().DUNGEON_DAILY + '번과 별개 · 요일 상관없이 속성 3개 선택 · 보상은 요일 던전과 같아요<br>입장권은 스테이지(자동 반복 포함)와 방치 보상에서 가끔 나와요 · 유효기간 없음 · 이겨서 보상을 받을 때만 1장 써요</div></div>' +
      '<div class="card"><b>서로 다른 속성 3개 고르기 (' + els.length + '/3)</b><div class="el-pick" style="margin:10px 0 0">' + MM.RING.map(function (el) {
        return '<button class="' + (els.indexOf(el) >= 0 ? 'on' : '') + '" data-act="tEl" data-el="' + el + '">' + monSvg(el, 2, 28) + '<div>' + MM.ELEMENTS[el].name + '</div></button>';
      }).join('') + '</div></div>';
    MM.tiers().forEach(function (t) {
      var n = MM.ticketCount(S, t);
      var icons = ready ? els.map(function (e) { return monSvg(e, t, 34); }).join('') : unknownSvg(34) + unknownSvg(34) + unknownSvg(34);
      html += '<div class="card" style="' + (n ? '' : 'opacity:.55') + '"><div class="row between"><div><b>' + t + '단계 입장권 던전</b> <span class="muted small">' + t + '단계 3마리 · 1단계 소울 확정</span></div><span class="chip' + (n ? ' gold' : '') + '">🎟 ' + n + '장</span></div>' +
        '<div class="row" style="margin:10px 0;justify-content:center;gap:12px">' + icons + '</div>' +
        '<button class="btn primary sm block" data-act="startTicket" data-tier="' + t + '"' + (n && ready && S.party.length ? '' : ' disabled') + '>' + (n ? '도전 (이기면 입장권 1장 사용)' : t + '단계 스테이지에서 입장권을 모아 보세요') + '</button></div>';
    });
    return html;
  }

  // ================= 전투 =================
  function newSession() { return { runs: 0, wins: 0, losses: 0, gold: 0, exp: 0, drops: {}, firsts: {}, wasted: 0, levelUps: {} }; }

  function startBattle(kind, opts) {
    var party = partyMons();
    if (!party.length) { toast('파티에 몬스터를 넣어 주세요'); return; }
    var enemies;
    if (kind === 'stage') enemies = MM.stageEnemies(opts.el, opts.tier);
    else if (kind === 'dungeon' || kind === 'ticket') enemies = MM.dungeonEnemies(opts.els, opts.tier);
    else if (kind === 'boss') enemies = null;
    else enemies = MM.tutorialEnemies(S.tutorial.starters);
    var prev = view.battle;
    var repeat = !!opts.repeat;
    if (repeat) {
      if (!MM.useAutoRun(S, Date.now())) { toast('자동 반복 판수를 다 썼어요'); endRepeat(); return; }
    }
    view.battle = {
      kind: kind, el: opts.el, tier: opts.tier, els: opts.els, enemies: enemies,
      bt: kind === 'boss' ? MM.createBossBattle(MM.battleParty(S, party), opts.tier) : MM.createBattle(MM.battleParty(S, party), enemies),
      auto: kind === 'boss' ? false : repeat || (kind !== 'tutorial' && !!S.settings.autoBattle),
      repeat: repeat, stopAfter: prev && prev.repeat ? prev.stopAfter : false,
      session: repeat && prev && prev.repeat ? prev.session : (repeat ? (function () { var ns = newSession(); var r0 = readyNow(); ns.readySig = r0.summon.join() + '|' + (r0.pair ? r0.pair.main.id + '-' + r0.pair.sub.id : ''); return ns; })() : null),
      timer: null, busy: false, last: null, between: false
    };
    view.tab = 'battle';
    save();
    render();
    battleTick();
  }

  function bossPlanHtml(bt) {
    var boss = bt.units.filter(function (u) { return u.raid; })[0]; if (!boss || !boss.plan) return '';
    var p = boss.plan, tg = p.target != null ? bt.units[p.target] : null;
    var txt = p.type === 'attack' ? '공격 → ' + (tg ? tg.name : '?') : p.type === 'smash' ? '<b style="color:var(--bad)">강타 ×' + p.sk.mult + '</b> → ' + (tg ? tg.name : '?') :
      p.type === 'sweep' ? '<b style="color:var(--bad)">휩쓸기</b> (아군 전체)' : p.type === 'seal' ? '<b style="color:var(--bad)">봉인</b> (무작위 1마리)' : p.type === 'shield' ? '보호막 (' + p.sk.turns + '턴 피해 ' + Math.round((1 - p.sk.cut) * 100) + '%만)' : p.type === 'heal' ? '회복 (체력 ' + Math.round(p.sk.pct * 100) + '%)' : p.type;
    return '<div class="boss-plan">⚠ 보스 다음 행동: ' + txt + '</div>';
  }
  function unitHtml(u, bt, actor, pickable) {
    var r = u.hp / u.maxHp;
    var allyPick = pickable === 'heal' ? u.hp > 0 : pickable === 'revive' ? u.hp <= 0 : false;
    if (pickable === 'heal' || pickable === 'revive') pickable = false;
    var cls = 'unit ' + (u.side === 'e' ? 'enemy' : 'ally') + (u.boss ? ' bossu' : '') + (u.hp <= 0 ? ' dead' : '') + (actor && actor.uid === u.uid ? ' turn' : '') + (pickable && u.hp > 0 || allyPick ? ' pickable' : '');
    var adv = '';
    if (u.side === 'e' && actor && actor.side === 'p') {
      var up = MM.beats(actor.el, u.el), down = MM.beats(u.el, actor.el);
      if (up || down) adv = '<span class="adv-mark">' + (up ? '▲' : '') + (down ? '<span class="dis-mark">▼</span>' : '') + '</span>';
    }
    return '<div class="' + cls + '" id="u' + u.uid + '"' + (allyPick ? ' data-act="allyPick" data-uid="' + u.uid + '"' : pickable && u.hp > 0 ? ' data-act="hit" data-uid="' + u.uid + '"' : '') + '>' + adv +
      monSvg(u.el, u.tier, u.raid ? 84 : u.boss ? 60 : 50) + '<div class="nm">' + (u.boss && !u.raid ? '보스 ' : '') + u.name + '</div><div class="lv">Lv ' + u.level + '</div>' +
      (u.raid ? '<div class="weak">상성 없음</div>' : u.side === 'e' ? weakText(u.el) : '') +
      (u.sealed > 0 ? '<div class="status bad">🔒 봉인</div>' : '') + (u.shield > 0 ? '<div class="status">🛡 보호막</div>' : '') + (u.enraged ? '<div class="status bad">💢 분노</div>' : '') + (u.guard ? '<div class="status">🛡 방어</div>' : '') + (u.focus ? '<div class="status">✊ 집중</div>' : '') +
      '<div class="hpbar"><i style="width:' + Math.max(0, r * 100) + '%"' + (r < 0.3 ? ' class="low"' : '') + '></i></div>' +
      '<div class="hpnum">' + u.hp + ' / ' + u.maxHp + '</div>' + expHtml(u) + '</div>';
  }
  // 아군 카드 아래 경험치 바와 퍼센트 (전투 중에도 실제 몬스터 경험치를 보여줌)
  function expHtml(u) {
    if (u.side !== 'p' || !u.monsterId) return '';
    var m = MM.getMonster(S, u.monsterId); if (!m) return '';
    var maxed = m.level >= MM.maxLevel(m.tier), r = maxed ? 1 : Math.min(0.999, m.exp / MM.expToNext(m.level));
    return '<div class="expbar" style="margin-top:5px"><i style="width:' + (r * 100).toFixed(1) + '%"></i></div>' +
      '<div class="hpnum">' + (maxed ? '최대 레벨' : 'EXP ' + (Math.floor(r * 1000) / 10).toFixed(1) + '%') + '</div>';
  }

  // 자동 반복 중: 소환·합성 가능 알림
  function readyNow() {
    var sum = MM.allSpecies().filter(function (sp) { return MM.canSummon(S, sp.key); }).map(function (sp) { return MM.speciesName(sp.el, sp.tier); });
    var pairs = readyPairs(1);
    return { summon: sum, pair: pairs[0] || null };
  }
  function readyNotice() {
    var r = readyNow(), out = '';
    if (r.summon.length) out += '<div class="row between" style="margin-top:8px"><span class="chip gold">★ 소환 가능: ' + r.summon.slice(0, 3).join(', ') + (r.summon.length > 3 ? ' 외 ' + (r.summon.length - 3) : '') + '</span><button class="btn sm" data-act="stopGo" data-to="souls">멈추고 소환</button></div>';
    if (r.pair) out += '<div class="row between" style="margin-top:8px"><span class="chip adv">✦ 합성 가능: ' + name(r.pair.main) + ' + ' + name(r.pair.sub) + '</span><button class="btn sm" data-act="stopGo" data-to="fusion">멈추고 합성</button></div>';
    return out;
  }
  function checkReadyBanner(Bt) {
    var r = readyNow(), sig = r.summon.join() + '|' + (r.pair ? r.pair.main.id + '-' + r.pair.sub.id : '');
    var prev = Bt.session.readySig || '';
    Bt.session.readySig = sig;
    var newSummon = r.summon.filter(function (x) { return prev.split('|')[0].split(',').indexOf(x) < 0; });
    var newPair = r.pair && prev.split('|')[1] !== (r.pair.main.id + '-' + r.pair.sub.id);
    if (newSummon.length) showNotice('★ 소환 가능!', newSummon.join(', ') + ' 소울이 ' + BAL().SOULS_PER_SUMMON + '개 모였어요');
    if (newPair) showNotice('✦ 합성 가능!', name(r.pair.main) + ' + ' + name(r.pair.sub));
  }
  function showNotice(title, sub) { bannerQueue.push({ notice: true, title: title, sub: sub }); if (bannerQueue.length === 1) nextBanner(); }

  function sessionTally(ss) {
    var keys = Object.keys(ss.drops).sort(function (a, b) { return MM.parseKey(b).tier - MM.parseKey(a).tier; });
    var tk = ss.tickets ? '<span class="chip gold">🎟 ' + (ss.ticketTier || '') + '단계 입장권 ×' + ss.tickets + '</span>' : '';
    return '<div class="tally">' + tk + (keys.length ? keys.slice(0, 8).map(function (k) { var p = MM.parseKey(k); return '<span class="chip' + (p.tier >= BAL().RECORD_MIN_SOUL_TIER ? ' gold' : '') + '">' + monSvg(p.el, p.tier, 14) + MM.speciesName(p.el, p.tier) + ' ×' + ss.drops[k] + '</span>'; }).join('') : (tk ? '' : '<span class="muted small">아직 얻은 소울이 없어요</span>')) + '</div>';
  }

  SCREENS.battle = function () {
    var Bt = view.battle; if (!Bt) return SCREENS.stages();
    var bt = Bt.bt, actor = bt.result ? null : MM.currentActor(bt);
    var myTurn = actor && actor.side === 'p' && !Bt.auto && !Bt.busy;
    var msg = '', sub = '';
    if (bt.result === 'win') msg = '승리!';
    else if (bt.result === 'lose') msg = '패배…';
    else if (myTurn) { msg = actor.name + '의 차례'; sub = Bt.kind === 'boss' ? '아래에서 행동을 고르세요 (보스를 눌러도 공격)' : '공격할 적을 누르세요 (▲ 유리 · ▼ 불리)'; }
    else if (actor) msg = (actor.side === 'e' ? '적 ' : '') + actor.name + '의 공격';
    if (Bt.last && !bt.result && (Bt.last.skip || Bt.last.skill || Bt.last.action)) {
      var L = Bt.last, la = bt.units[L.actor];
      sub = L.action === 'heal' ? la.name + '의 회복! ' + bt.units[L.target].name + ' +' + L.amount : L.action === 'revive' ? la.name + '의 부활! ' + bt.units[L.target].name + '이(가) 체력 ' + L.amount + '으로 일어났어요' : L.action === 'defend' ? la.name + ' 방어 자세 (다음 차례까지 받는 피해 ' + Math.round(BAL().BOSS_GUARD_CUT * 100) + '%)' : L.action === 'focus' ? la.name + ' 힘을 모았어요 (다음 공격 ×' + BAL().BOSS_FOCUS_MULT + ')' : L.skill === 'smash' ? '강타! ' + bt.units[L.target].name + ' -' + L.dmg + (L.guarded ? ' (방어)' : '') + (L.ko ? ' · 쓰러짐' : '') : L.skip ? la.name + '은(는) 봉인되어 움직이지 못했어요' : L.skill === 'seal' ? '봉인! ' + bt.units[L.target].name + ' ' + L.turns + '턴 동안 못 움직여요' :
        L.skill === 'sweep' ? '휩쓸기! 아군 전체 ' + L.hits.map(function (h) { return '-' + h.dmg; }).join(' ') : L.skill === 'shield' ? '보호막! ' + L.turns + '턴 동안 받는 피해 절반' : L.skill === 'heal' ? '회복! 체력 +' + L.heal : '';
    } else if (Bt.last && !myTurn && !bt.result) {
      var a = bt.units[Bt.last.actor], t = bt.units[Bt.last.target];
      sub = a.name + ' → ' + t.name + ' ' + Bt.last.dmg + ' 피해' + (Bt.last.crit ? ' · 크리티컬!' : '') + (Bt.last.mult > 1 ? ' · 효과가 좋다!' : Bt.last.mult < 1 ? ' · 효과가 별로…' : '') + (Bt.last.ko ? ' · 쓰러뜨림' : '') + (Bt.last.enrage ? ' · 보스가 분노했어요!' : '') + (Bt.last.shielded ? ' · 보호막' : '') + (Bt.last.focused ? ' · 집중 ×' + BAL().BOSS_FOCUS_MULT + '!' : '') + (Bt.last.guarded ? ' · 방어' : '');
    }
    var title = Bt.kind === 'boss' ? Bt.tier + '단계 무지개 보스' : Bt.kind === 'tutorial' ? '튜토리얼 전투' : Bt.kind === 'dungeon' ? Bt.tier + '단계 요일 던전' : Bt.kind === 'ticket' ? Bt.tier + '단계 입장권 던전' : elName(Bt.el) + ' ' + Bt.tier + '단계';
    var en = bt.units.filter(function (u) { return u.side === 'e'; });
    var html = '<div class="battle">' +
      '<div class="row between"><span class="muted small">' + title + ' · ' + bt.round + '라운드' + (bt.partyBonus ? ' · <span style="color:var(--good)">속성 조화 +' + Math.round(BAL().PARTY_BONUS * 100) + '%</span>' : '') + '</span>' +
      (Bt.repeat || Bt.kind === 'tutorial' ? '' : '<button class="btn sm" data-act="flee">나가기</button>') + '</div>' +
      '<div class="side enemies">' + en.map(function (u) { return unitHtml(u, bt, actor, myTurn); }).join('') + '</div>' +
      (bt.raid && !bt.result ? bossPlanHtml(bt) : '') +
      '<div class="battle-mid"><div class="msg">' + msg + '</div><div class="muted small">' + sub + '</div></div>' +
      '<div class="side">' + bt.units.filter(function (u) { return u.side === 'p'; }).map(function (u) { return unitHtml(u, bt, actor, myTurn && Bt.pending ? Bt.pending : false); }).join('') + '</div>';
    if (Bt.repeat) {
      var ss = Bt.session;
      html += '<div class="repeat-box"><div class="row between"><b>자동 반복 ' + (ss.runs + (bt.result ? 0 : 1)) + '판째</b><span class="muted small">오늘 남은 ' + MM.autoLeft(S, Date.now()) + '판</span></div>' +
        '<div class="muted small">승 ' + ss.wins + ' · 패 ' + ss.losses + ' · 골드 +' + fmt(ss.gold) + '</div>' + sessionTally(ss) + readyNotice() + '</div>' +
        '<div class="battle-bar"><button class="btn' + (Bt.stopAfter ? ' toggle on' : '') + '" data-act="stopAfter">' + (Bt.stopAfter ? '이번 판 후 멈춤 ✓' : '이번 판 후 멈추기') + '</button><button class="btn danger" data-act="stopNow">지금 멈추기</button></div>';
    } else if (Bt.kind === 'boss') {
      var dead = bt.units.some(function (u) { return u.side === 'p' && u.hp <= 0; }), dis = function (ok) { return myTurn && ok ? '' : ' disabled'; };
      if (Bt.pending && myTurn) html += '<div class="boss-plan" style="border-color:var(--good)">' + (Bt.pending === 'heal' ? '💚 회복할 아군을 누르세요' : '✨ 살릴 아군을 누르세요') + ' <button class="btn sm" data-act="bossCancel">취소</button></div>';
      html += '<div class="battle-bar boss-acts"><button class="btn primary" data-act="bossAct" data-a="attack"' + dis(true) + '>⚔ 공격</button><button class="btn" data-act="bossAct" data-a="defend"' + dis(true) + '>🛡 방어</button><button class="btn" data-act="bossAct" data-a="focus"' + dis(true) + '>✊ 집중</button></div>' +
        '<div class="battle-bar boss-acts two" style="margin-top:8px"><button class="btn good" data-act="bossAct" data-a="heal"' + dis(bt.healsLeft > 0) + '>💚 회복 ' + bt.healsLeft + '</button><button class="btn good" data-act="bossAct" data-a="revive"' + dis(bt.revivesLeft > 0 && dead) + '>✨ 부활 ' + bt.revivesLeft + '</button></div>' +
        '<div class="muted small lh" style="text-align:center;margin-top:6px">방어: 다음 내 차례까지 받는 피해 ' + Math.round(BAL().BOSS_GUARD_CUT * 100) + '% · 집중: 쉬고 다음 공격 ×' + BAL().BOSS_FOCUS_MULT + '<br>회복: 아군 1마리 체력 ' + Math.round(BAL().BOSS_HEAL_PCT * 100) + '% (1판 ' + BAL().BOSS_HEALS + '번) · 부활: 쓰러진 아군 체력 ' + Math.round(BAL().BOSS_REVIVE_PCT * 100) + '%로 (1판 ' + BAL().BOSS_REVIVES + '번)<br>보스전은 자동 전투가 안 돼요 · 지면 입장권은 그대로</div>';
    } else if (Bt.kind !== 'tutorial') {
      html += '<div class="battle-bar"><button class="btn toggle' + (Bt.auto ? ' on' : '') + '" data-act="auto">자동 ' + (Bt.auto ? 'ON' : 'OFF') + '</button></div>';
    }
    return html + '</div>';
  };

  function battleTick() {
    var Bt = view.battle; if (!Bt || view.tab !== 'battle') return;
    var bt = Bt.bt;
    if (!bt.result) MM.currentActor(bt);
    if (bt.result) { render(); Bt.timer = setTimeout(finishBattle, Bt.repeat ? 500 : 700); return; }
    var actor = MM.currentActor(bt);
    if (actor.side === 'e' || Bt.auto) {
      Bt.busy = true; render();
      Bt.timer = setTimeout(function () { doAct(null); }, Bt.auto ? BAL().AUTO_ACTION_MS : BAL().MANUAL_ENEMY_MS);
    } else {
      Bt.busy = false; render();
    }
  }

  function doAct(targetUid) {
    var Bt = view.battle; if (!Bt) return;
    var ev = MM.act(Bt.bt, targetUid);
    Bt.last = ev; Bt.busy = true;
    render();
    if (ev && ev.hits && ev.hits.length) ev.hits.forEach(function (h) { var n2 = $('u' + h.target); if (n2) { n2.classList.add('hit'); var d2 = document.createElement('div'); d2.className = 'dmg'; d2.textContent = '-' + h.dmg; n2.appendChild(d2); } });
    if (ev && ev.target != null && ev.dmg != null) {
      var node = $('u' + ev.target);
      if (node) {
        node.classList.add('hit');
        var d = document.createElement('div');
        d.className = 'dmg' + (ev.crit ? ' crit' : ev.mult > 1 ? ' adv' : ev.mult < 1 ? ' dis' : '');
        d.textContent = '-' + ev.dmg;
        node.appendChild(d);
      }
    }
    Bt.timer = setTimeout(battleTick, Bt.auto ? Math.round(BAL().AUTO_ACTION_MS * 0.6) : 380);
  }

  function rareOf(drops) { return drops.filter(function (d) { return d.tier >= BAL().RECORD_MIN_SOUL_TIER && d.added > 0; }); }

  function finishBattle() {
    var Bt = view.battle; if (!Bt) return;
    var win = Bt.bt.result === 'win', r = null;
    if (Bt.kind === 'tutorial') {
      if (!win) { startBattle('tutorial', {}); return; }
      MM.tutorialBattleReward(S); save();
      view.battle = null; view.tab = 'home'; render();
      showTutorial();
      return;
    }
    if (win) {
      if (Bt.kind === 'dungeon') { MM.useDungeonEntry(S, Date.now()); r = MM.grantDungeonWin(S, Bt.tier, Bt.enemies); }
      else if (Bt.kind === 'ticket') { MM.useTicket(S, Bt.tier); r = MM.grantDungeonWin(S, Bt.tier, Bt.enemies, null, { ticket: true }); }
      else if (Bt.kind === 'boss') { MM.useBossTicket(S, Bt.tier); r = MM.grantBossWin(S, Bt.tier); }
      else { MM.accrueOffline(S, Date.now()); r = MM.grantStageWin(S, Bt.el, Bt.tier, Bt.enemies); }
      if (r && r.bossTicket) showNotice('🌈 보스 입장권!!', r.bossTicket + '단계 무지개 보스 입장권 1장');
      if (r && r.ticket && !Bt.repeat) showNotice('🎟 입장권 획득!', r.ticket + '단계 입장권 던전 입장권 1장');
      if (r && r.autoOffline) { showNotice('방치 보상 스테이지 변경', MM.speciesName(r.autoOffline.el, r.autoOffline.tier) + ' 스테이지로 자동 지정' + (r.offlinePaid ? ' · 쌓인 보상은 받았어요' : '')); }
    } else {
      S.stats.battlesLost++;
    }
    save();
    if (Bt.repeat) {
      var ss = Bt.session;
      ss.runs++; if (win) ss.wins++; else ss.losses++;
      if (r) {
        ss.gold += r.gold; ss.exp += r.exp;
        r.drops.forEach(function (d) { ss.drops[d.key] = (ss.drops[d.key] || 0) + d.added; ss.wasted += d.wasted; if (d.first) ss.firsts[d.key] = true; });
        r.levelUps.forEach(function (u) { ss.levelUps[u.id] = u; });
        rareOf(r.drops).forEach(showBanner);
        if (r.ticket) { ss.tickets = (ss.tickets || 0) + 1; ss.ticketTier = r.ticket; showNotice('🎟 입장권 획득!', r.ticket + '단계 입장권 던전 입장권 1장 (이번 반복 ' + ss.tickets + '장)'); }
      }
      checkReadyBanner(Bt);
      if (Bt.stopAfter || MM.autoLeft(S, Date.now()) <= 0) {
        if (MM.autoLeft(S, Date.now()) <= 0) toast('자동 반복 판수를 다 썼어요');
        endRepeat(); return;
      }
      render();
      Bt.timer = setTimeout(function () { if (view.battle === Bt) startBattle('stage', { el: Bt.el, tier: Bt.tier, repeat: true }); }, BAL().REWARD_PAUSE_MS);
      return;
    }
    view.reward = { win: win, kind: Bt.kind, el: Bt.el, tier: Bt.tier, els: Bt.els, r: r };
    view.battle = null; view.tab = 'reward';
    render();
    if (r) { var rare = rareOf(r.drops.concat(r.firstClear ? [r.firstClear] : [])); if (rare.length) showRareDrops(rare); }
  }

  function endRepeat() {
    var Bt = view.battle;
    stopBattleTimers();
    if (!Bt || !Bt.session) { go('stages'); return; }
    view.reward = { repeat: true, el: Bt.el, tier: Bt.tier, session: Bt.session };
    view.battle = null; view.tab = 'reward';
    save(); render();
  }

  // ================= 보상 =================
  function dropsHtml(list) {
    if (!list.length) return '<span class="muted">이번에는 소울이 나오지 않았어요</span>';
    return list.map(function (d) {
      return '<div class="soul-item' + (d.tier >= BAL().RECORD_MIN_SOUL_TIER ? ' rare' : '') + '">' + monSvg(d.el, d.tier, 24) + MM.speciesName(d.el, d.tier) + ' ×' + d.count +
        (d.first ? ' <span class="first">첫 획득!</span>' : '') + (d.wasted ? ' <span class="lack small">가득 차서 ' + d.wasted + '개 버려짐</span>' : '') + '</div>';
    }).join('');
  }

  SCREENS.reward = function () {
    var R = view.reward; if (!R) return SCREENS.stages();
    var html = '', again = '';
    if (R.repeat) {
      var ss = R.session;
      var list = Object.keys(ss.drops).map(function (k) { var p = MM.parseKey(k); return { key: k, el: p.el, tier: p.tier, count: ss.drops[k], added: ss.drops[k], wasted: 0, first: !!ss.firsts[k] }; })
        .sort(function (a, b) { return b.tier - a.tier || b.count - a.count; });
      html = '<div class="reward-title win">자동 반복 끝</div><div class="muted" style="text-align:center;margin-bottom:14px">' + elName(R.el) + ' ' + R.tier + '단계 · ' + ss.runs + '판 (승 ' + ss.wins + ' · 패 ' + ss.losses + ')</div>' +
        '<div class="card"><b>얻은 소울</b><div class="soul-list" style="margin-top:10px">' + dropsHtml(list) + '</div>' + (ss.wasted ? '<div class="lack small" style="margin-top:8px">소울이 가득 차서 ' + ss.wasted + '개가 버려졌어요 (종별 최대 ' + BAL().SOUL_CAP + '개)</div>' : '') + '</div>' +
        '<div class="card"><div class="cost-line"><span>골드</span><span>+' + fmt(ss.gold) + ' G</span></div><div class="cost-line"><span>경험치 (파티 전원)</span><span>+' + fmt(ss.exp) + '</span></div>' + (ss.tickets ? '<div class="cost-line"><span>🎟 입장권</span><span>+' + ss.tickets + '장</span></div>' : '') +
        Object.keys(ss.levelUps).map(function (id) { var u = ss.levelUps[id]; return '<div class="cost-line"><span>레벨 업!</span><span>' + u.name + ' → Lv ' + u.level + '</span></div>'; }).join('') + '</div>';
      again = '<button class="btn good block" data-act="againRepeat"' + (MM.autoLeft(S, Date.now()) ? '' : ' disabled') + '>자동 반복 다시 · ' + MM.autoLeft(S, Date.now()) + '판 남음</button>';
    } else {
      var label = R.kind === 'boss' ? R.tier + '단계 무지개 보스' : R.kind === 'dungeon' ? R.tier + '단계 요일 던전' : R.kind === 'ticket' ? R.tier + '단계 입장권 던전' : elName(R.el) + ' ' + R.tier + '단계 스테이지';
      html = '<div class="reward-title ' + (R.win ? 'win' : 'lose') + '">' + (R.win ? '클리어!' : '패배…') + '</div><div class="muted" style="text-align:center;margin-bottom:14px">' + label + '</div>';
      if (R.win) {
        if (R.r.bossTicket) html += '<div class="card" style="border-color:var(--accent)"><b style="color:var(--accent)">🌈 보스 입장권 획득!!</b> <span class="muted small">' + R.r.bossTicket + '단계 무지개 보스 · 보유 ' + MM.bossTicketCount(S, R.r.bossTicket) + '장</span></div>';
        if (R.r.ticket) html += '<div class="card" style="border-color:var(--accent)"><b style="color:var(--accent)">🎟 입장권 획득!</b> <span class="muted small">' + R.r.ticket + '단계 입장권 던전 · 보유 ' + MM.ticketCount(S, R.r.ticket) + '장</span></div>';
        if (R.r.firstClear) html += '<div class="card" style="border-color:var(--accent)"><b style="color:var(--accent)">첫 클리어 보상!</b><div class="soul-list" style="margin-top:10px">' + dropsHtml([R.r.firstClear]) + '</div></div>';
        if (R.r.offlinePaid) { var P = R.r.offlinePaid; html += '<div class="card"><b>방치 보상 정산</b><div class="muted small" style="margin:4px 0 8px">방치 보상 스테이지가 ' + MM.speciesName(R.r.autoOffline.el, R.r.autoOffline.tier) + ' 스테이지로 바뀌어서, 지금까지 쌓인 ' + hoursText(P.hours) + ' 보상은 ' + MM.speciesName(P.stage.el, P.stage.tier) + ' 스테이지 기준으로 받았어요</div><div class="soul-list">' + (P.drops.length ? dropsHtml(P.drops) : '<span class="muted small">소울 없음</span>') + '</div><div class="cost-line" style="margin-top:8px"><span>골드</span><span>+' + fmt(P.gold) + ' G</span></div></div>'; }
        html += '<div class="card"><b>얻은 소울</b><div class="soul-list" style="margin-top:10px">' + dropsHtml(R.r.drops) + '</div></div>' +
          '<div class="card"><div class="cost-line"><span>골드</span><span>+' + fmt(R.r.gold) + ' G</span></div><div class="cost-line"><span>경험치 (파티 전원)</span><span>+' + fmt(R.r.exp) + '</span></div>' +
          R.r.levelUps.map(function (u) { return '<div class="cost-line"><span>레벨 업!</span><span>' + u.name + ' → Lv ' + u.level + '</span></div>'; }).join('') + '</div>';
      } else {
        html += '<div class="card muted">잃은 것은 없어요. 레벨을 올리거나 상성이 유리한 몬스터로 파티를 바꿔 보세요.</div>';
      }
      if (R.kind === 'boss') again = '<button class="btn primary block" data-act="tab" data-tab="stages" data-seg="boss">' + (R.win ? '보스 목록으로' : '보스 목록으로 (입장권 그대로, 다시 도전 가능)') + '</button>';
      else if (R.kind === 'ticket') again = '<button class="btn primary block" data-act="tab" data-tab="stages" data-seg="ticket">' + (R.win ? '입장권 던전으로' : '입장권 던전으로 (입장권 그대로)') + '</button>';
      else if (R.kind === 'dungeon') again = '<button class="btn primary block" data-act="tab" data-tab="stages" data-seg="dungeon">' + (R.win ? '던전으로' : '던전으로 (횟수 그대로, 다시 도전 가능)') + '</button>';
      else again = '<button class="btn primary block" data-act="again">다시 도전</button>' +
        (S.cleared[MM.speciesKey(R.el, R.tier)] ? '<button class="btn good block" style="margin-top:10px" data-act="againRepeat"' + (MM.autoLeft(S, Date.now()) ? '' : ' disabled') + '>자동 반복 시작 · ' + MM.autoLeft(S, Date.now()) + '판 남음</button>' : '');
    }
    var ready = MM.allSpecies().filter(function (sp) { return MM.canSummon(S, sp.key); });
    if (ready.length) html += '<button class="btn block" style="margin-bottom:10px;border-color:var(--accent)" data-act="tab" data-tab="monsters" data-mon="souls">★ 소환할 수 있는 소울이 있어요</button>';
    return html + again + '<div class="grid2" style="margin-top:10px"><button class="btn" data-act="tab" data-tab="stages">전투 목록</button><button class="btn" data-act="tab" data-tab="fusion">합성하러</button></div>';
  };

  // ================= 희귀 드랍 연출 =================
  function sparks(n, now) {
    var cols = ['#ffcf4a', '#ff8a5c', '#8f7cff', '#5fd38d', '#fff', '#ff5c8a'], s = '';
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 110;
      s += '<i class="spark" style="background:' + cols[i % cols.length] + ';--dx:' + Math.round(Math.cos(a) * d) + 'px;--dy:' + Math.round(Math.sin(a) * d) + 'px;animation-delay:' + ((now ? 0.05 : 0.9) + Math.random() * 0.15).toFixed(2) + 's"></i>';
    }
    return s;
  }
  function raysClass(tier) { return 'rays reveal now' + (tier >= 5 ? ' t5' : tier >= 4 ? ' t4' : ''); }

  function showRareDrops(list) {
    var d = list[0];
    showOverlay('<div class="result ok"><div class="stage-anim"><div class="' + raysClass(d.tier) + '"></div><div class="flash now"></div>' + sparks(10 + d.tier * 4 + d.count * 4, true) +
      '<div class="pop now" style="position:relative">' + monSvg(d.el, d.tier, 110 + d.tier * 6) + (d.count > 1 ? '<span class="count-badge">×' + d.count + '</span>' : '') + '</div></div>' +
      '<div class="reveal now"><div class="big ok">' + d.tier + '단계 소울!</div><div class="sub">' + MM.speciesName(d.el, d.tier) + ' 소울 ×' + d.count + '</div>' + (d.first ? '<div class="new">첫 획득!</div>' : '') +
      (list.length > 1 ? '<div class="sub">+ ' + list.slice(1).map(function (x) { return MM.speciesName(x.el, x.tier) + ' ×' + x.count; }).join(', ') + '</div>' : '') +
      '<div class="acts"><button class="btn primary block" data-act="closeOverlay">확인</button></div></div></div>');
  }

  var bannerQueue = [];
  function showBanner(d) {
    bannerQueue.push(d);
    if (bannerQueue.length === 1) nextBanner();
  }
  function nextBanner() {
    var d = bannerQueue[0], el = $('banner');
    if (!d) { el.hidden = true; return; }
    if (d.notice) {
      el.className = 'notice';
      el.innerHTML = '<div><b>' + d.title + '</b><div class="small">' + d.sub + '</div></div>';
    } else {
      el.className = d.tier >= 5 ? 't5' : '';
      el.innerHTML = monSvg(d.el, d.tier, 36) + '<div><b>' + d.tier + '단계 소울' + (d.first ? ' 첫 획득!' : '!') + '</b><div class="small">' + MM.speciesName(d.el, d.tier) + ' 소울 ×' + d.count + '</div></div>';
    }
    el.hidden = false;
    setTimeout(function () { bannerQueue.shift(); el.hidden = true; setTimeout(nextBanner, 150); }, d.notice ? 2200 : 1800 + d.tier * 250);
  }

  // ================= 몬스터 / 소울 =================
  SCREENS.monsters = function () {
    var html = '<div class="seg"><button class="' + (view.monSeg === 'list' ? 'on' : '') + '" data-act="monSeg" data-v="list">몬스터 ' + S.monsters.length + '</button>' +
      '<button class="' + (view.monSeg === 'souls' ? 'on' : '') + '" data-act="monSeg" data-v="souls">소울</button>' +
      '<button class="' + (view.monSeg === 'equip' ? 'on' : '') + '" data-act="monSeg" data-v="equip">장비 ' + (S.equips || []).length + '</button></div>';
    if (view.monSeg === 'equip') return html + equipHtml();
    if (view.monSeg === 'list') {
      var pm = partyMons();
      html += '<div class="row between" style="margin-bottom:10px"><span class="muted small">파티 ' + S.party.length + '/3</span>' + (MM.partyHasBonus(pm) ? '<span class="chip adv">속성 조화 +' + Math.round(BAL().PARTY_BONUS * 100) + '%</span>' : '<span class="muted small">서로 다른 속성 3마리면 +' + Math.round(BAL().PARTY_BONUS * 100) + '%</span>') + '</div>';
      html += sortMons(S.monsters).map(function (m) {
        var inParty = S.party.indexOf(m.id) >= 0, maxed = m.level >= MM.maxLevel(m.tier);
        var st = MM.calcStats(m.el, m.tier, m.level, MM.playerMult(S, m));
        var req = m.tier < T() ? MM.fuseLevelReq(m.tier) : null;
        return '<div class="mon-row">' + monSvg(m.el, m.tier, 44) + '<div class="info"><div class="row wrap" style="gap:6px"><span class="nm">' + name(m) + (m.plus ? ' <span class="plus">+' + m.plus + '</span>' : '') + '</span><span class="muted small">Lv ' + m.level + '/' + MM.maxLevel(m.tier) + (maxed ? ' (최대)' : '') + '</span>' +
          (inParty ? '<span class="chip party">파티</span>' : '') + (MM.inOfflineTeam(S, m.id) ? '<span class="chip">방치</span>' : '') + (m.stack ? '<span class="chip stack">스택 ' + m.stack + '</span>' : '') +
          (req ? '<span class="chip' + (m.level >= req ? ' adv' : '') + '">주재료 Lv' + req + (m.level >= req ? ' ✓' : '') + '</span>' : '') + '</div>' +
          '<div class="muted small">체력 ' + st.hp + ' · 공격 ' + st.atk + ' · 방어 ' + st.def + ' · 크리 ' + Math.round(st.crit * 100) + '%</div>' +
          '<div class="expbar"><i style="width:' + (maxed ? 100 : m.exp / MM.expToNext(m.level) * 100) + '%"></i></div></div>' +
          '<div class="acts"><button class="btn sm" data-act="party" data-id="' + m.id + '">' + (inParty ? '빼기' : '넣기') + '</button>' +
          (maxed ? '' : '<button class="btn sm" data-act="feedSheet" data-id="' + m.id + '">먹이기</button>') +
          ((m.plus || 0) < BAL().MON_ENH_BONUS.length ? '<button class="btn sm" data-act="monEnhSheet" data-id="' + m.id + '">강화</button>' : '') +
          (inParty || MM.inOfflineTeam(S, m.id) ? '' : '<button class="btn sm danger" data-act="decompMon" data-id="' + m.id + '">분해</button>') + '</div></div>';
      }).join('');
    } else {
      html += '<div class="muted small" style="margin-bottom:10px">같은 종 소울 ' + BAL().SOULS_PER_SUMMON + '개 = 몬스터 1마리 · 종별 최대 ' + BAL().SOUL_CAP + '개 (' + BAL().SOUL_WARN + '개부터 주의) · 칸을 누르면 소환·분해</div>';
      html += '<div class="hscroll"><div class="tgrid" style="' + gridCols() + '"><div></div>' + MM.tiers().map(function (t) { return '<div class="head">' + t + '단계</div>'; }).join('');
      MM.RING.forEach(function (el) {
        html += '<div class="el">' + elName(el) + '</div>';
        MM.tiers().forEach(function (t) {
          var key = MM.speciesKey(el, t), n = S.souls[key] || 0, k = Math.floor(n / BAL().SOULS_PER_SUMMON);
          var warn = n >= BAL().SOUL_WARN;
          html += '<button class="soul-cell' + (k ? ' ready' : '') + (warn ? ' warn' : '') + '" data-act="soulCell" data-el="' + el + '" data-tier="' + t + '"><b>' + n + '개</b>' +
            (warn ? '가득 주의' : k ? '소환 ' + k + '회' : (BAL().SOULS_PER_SUMMON - n) + '개 더') + '</button>';
        });
      });
      html += '</div></div>';
    }
    return html;
  };

  // ================= 장비 =================
  function equipSvg(el, tier, size) {
    var c = MM.ELEMENTS[el].color, pts = [[50, 6], [88, 38], [50, 94], [12, 38]];
    var shape = tier >= 3 ? '<circle cx="50" cy="50" r="38" fill="' + c + '" stroke="#0006" stroke-width="4"/>' : '<polygon points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '" fill="' + c + '" stroke="#0006" stroke-width="4"/>';
    if (tier >= 4) shape += '<polygon points="50,22 74,50 50,78 26,50" fill="#fff5"/>';
    if (tier >= 5) shape += '<circle cx="50" cy="50" r="46" fill="none" stroke="' + c + '" stroke-width="3" stroke-dasharray="6 6"/>';
    return '<span class="mon"><svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100">' + shape + '<text x="50" y="58" text-anchor="middle" font-size="26" font-weight="800" fill="#fff">' + tier + '</text></svg></span>';
  }
  function eqName(e) { return MM.equipName(e.el, e.tier) + (e.plus ? ' +' + e.plus : ''); }
  function pctBonus(x) { return '+' + Math.round(x * 100) + '%'; }
  function equipHtml() {
    var html = '<div class="card"><b>장착 중</b> <span class="muted small">속성마다 1개 · 그 속성 몬스터 체력·공격·방어 상승</span><div class="pick-list" style="margin-top:10px">';
    MM.RING.forEach(function (el) {
      var e = MM.equippedOf(S, el);
      html += '<button class="pick" data-act="equipSlot" data-el="' + el + '">' + (e ? equipSvg(el, e.tier, 30) : '<span class="mon" style="width:30px;height:30px;opacity:.3">' + monSvg(el, 1, 30) + '</span>') +
        '<div style="flex:1"><b>' + MM.ELEMENTS[el].name + '</b> <span class="muted small">' + (e ? eqName(e) : '비어 있음') + '</span></div>' + (e ? '<span class="chip adv">' + pctBonus(MM.equipBonus(e)) + '</span>' : '') + '</button>';
    });
    html += '</div></div>';
    // 만들기
    html += '<div class="card"><b>만들기</b> <span class="muted small">같은 소울 ' + BAL().EQUIP_CRAFT_SOULS + '개 → 그 단계·속성 장비</span><div class="hscroll"><div class="tgrid" style="' + gridCols() + '"><div></div>' + MM.tiers().map(function (t) { return '<div class="head">' + MM.EQUIP_NAMES[t - 1] + '</div>'; }).join('');
    MM.RING.forEach(function (el) {
      html += '<div class="el">' + elName(el) + '</div>';
      MM.tiers().forEach(function (t) {
        var n = S.souls[MM.speciesKey(el, t)] || 0, ok = n >= BAL().EQUIP_CRAFT_SOULS;
        html += '<button class="soul-cell' + (ok ? ' ready' : '') + '" data-act="craftEquip" data-el="' + el + '" data-tier="' + t + '"' + (ok ? '' : ' disabled') + '><b>' + n + '/' + BAL().EQUIP_CRAFT_SOULS + '</b>' + (ok ? '만들기' : '') + '</button>';
      });
    });
    html += '</div></div></div>';
    // 보유
    var list = (S.equips || []).slice().sort(function (a, b) { return b.tier - a.tier || b.plus - a.plus || MM.RING.indexOf(a.el) - MM.RING.indexOf(b.el); });
    html += '<div class="card"><b>보유 장비 ' + list.length + '</b>' + (list.length ? '' : '<div class="muted small" style="margin-top:6px">아직 없어요. 남는 소울로 만들어 보세요.</div>') + '</div>';
    html += list.map(function (e) {
      var on = MM.isEquipped(S, e);
      return '<div class="mon-row">' + equipSvg(e.el, e.tier, 40) + '<div class="info"><div class="row wrap" style="gap:6px"><span class="nm">' + eqName(e) + '</span>' + (on ? '<span class="chip party">장착</span>' : '') + (e.stack ? '<span class="chip stack">스택 ' + e.stack + '</span>' : '') + '</div>' +
        '<div class="muted small">' + MM.ELEMENTS[e.el].name + ' 몬스터 ' + pctBonus(MM.equipBonus(e)) + '</div></div>' +
        '<div class="acts"><button class="btn sm" data-act="' + (on ? 'unequip' : 'equipIt') + '" data-id="' + e.id + '" data-el="' + e.el + '">' + (on ? '해제' : '장착') + '</button>' +
        (e.plus < BAL().EQUIP_MAX_PLUS ? '<button class="btn sm" data-act="equipEnhSheet" data-id="' + e.id + '">강화</button>' : '') +
        (on ? '' : '<button class="btn sm danger" data-act="decompEquip" data-id="' + e.id + '">분해</button>') + '</div></div>';
    }).join('');
    return html;
  }
  function equipSlotSheet(el) {
    var list = (S.equips || []).filter(function (e) { return e.el === el; }).sort(function (a, b) { return MM.equipBonus(b) - MM.equipBonus(a); });
    var cur = MM.equippedOf(S, el);
    openSheet('<b>' + MM.ELEMENTS[el].name + ' 장비 고르기</b><div class="pick-list" style="margin-top:10px">' + (list.length ? list.map(function (e) {
      return '<button class="pick' + (cur && cur.id === e.id ? ' sel' : '') + '" data-act="equipIt" data-id="' + e.id + '">' + equipSvg(e.el, e.tier, 30) + '<div style="flex:1"><b>' + eqName(e) + '</b></div><span class="chip adv">' + pctBonus(MM.equipBonus(e)) + '</span></button>';
    }).join('') + (cur ? '<button class="pick" data-act="unequip" data-el="' + el + '"><div style="flex:1"><b>해제</b></div></button>' : '') : '<div class="muted small">' + MM.ELEMENTS[el].name + ' 장비가 없어요</div>') + '</div>');
  }
  function equipEnhSheet(id) {
    var e = MM.getEquip(S, id); if (!e) { closeSheet(); return; }
    var c = MM.equipEnhCost(e), rate = MM.equipRate(e.plus, e.stack), ceil = MM.equipCeil(e.plus), left = Math.max(1, ceil - e.stack);
    var have = S.souls[c.key] || 0, ok = have >= c.souls && S.gold >= c.gold;
    openSheet('<div class="row" style="gap:12px">' + equipSvg(e.el, e.tier, 52) + '<div><b>' + eqName(e) + ' → +' + (e.plus + 1) + '</b><div class="muted small">' + pctBonus(MM.equipBonus(e)) + ' → ' + pctBonus(MM.equipBonus(e) + BAL().EQUIP_PER_PLUS) + '</div></div></div>' +
      '<div class="rate-box" style="margin-top:12px"><div class="rate">' + pct(rate) + '</div><div class="muted small">성공률 · 실패 스택 ' + e.stack + ' · ' + (rate >= 1 ? '이번엔 확정!' : '천장까지 최대 ' + fmt(left) + '번') + '</div></div>' +
      '<div class="cost-line" style="margin-top:10px"><span>' + (c.souls ? MM.speciesName(e.el, e.tier) + ' 소울 ' + c.souls + '개' : '소울 필요 없음') + '</span><span class="' + (have >= c.souls ? 'okc' : 'lack') + '">' + (c.souls ? '보유 ' + have : '✓') + '</span></div>' +
      '<div class="cost-line"><span>골드 ' + fmt(c.gold) + ' G</span><span class="' + (S.gold >= c.gold ? 'okc' : 'lack') + '">' + (S.gold >= c.gold ? '✓' : '부족') + '</span></div>' +
      '<div class="muted small" style="margin:6px 0">실패해도 장비는 그대로, 비용만 들어요 · 강화 수치는 다른 장비로 옮길 수 없어요</div>' +
      '<button class="btn primary block" data-act="equipEnh" data-id="' + e.id + '"' + (ok ? '' : ' disabled') + '>강화 · ' + pct(rate) + '</button>');
  }
  function monEnhSheet(id) {
    var m = MM.getMonster(S, id); if (!m) { closeSheet(); return; }
    var p = m.plus || 0, mx = BAL().MON_ENH_BONUS.length;
    if (p >= mx) { closeSheet(); return; }
    var c = MM.monEnhCost(m), rate = MM.monEnhRate(m), have = S.souls[c.key] || 0, ok = have >= c.souls && S.gold >= c.gold;
    openSheet('<div class="row" style="gap:12px">' + monSvg(m.el, m.tier, 52) + '<div><b>' + name(m) + (p ? ' +' + p : '') + ' → +' + (p + 1) + '</b><div class="muted small">체력·공격·방어 ' + pctBonus(MM.monEnhBonus(m)) + ' → ' + pctBonus(BAL().MON_ENH_BONUS[p]) + ' · 최대 +' + mx + '</div></div></div>' +
      '<div class="rate-box" style="margin-top:12px"><div class="rate">' + pct(rate) + '</div><div class="muted small">성공률 · 실패할 때마다 +' + Math.round(BAL().MON_ENH_STACK_UP * 100) + '%p</div></div>' +
      '<div class="cost-line" style="margin-top:10px"><span>' + name(m) + ' 소울 ' + c.souls + '개</span><span class="' + (have >= c.souls ? 'okc' : 'lack') + '">보유 ' + have + '</span></div>' +
      '<div class="cost-line"><span>골드 ' + fmt(c.gold) + ' G</span><span class="' + (S.gold >= c.gold ? 'okc' : 'lack') + '">' + (S.gold >= c.gold ? '✓' : '부족') + '</span></div>' +
      '<div class="small" style="margin:6px 0;color:var(--bad)">합성 재료로 쓰면 강화는 사라져요</div>' +
      '<button class="btn primary block" data-act="monEnh" data-id="' + m.id + '"' + (ok ? '' : ' disabled') + '>강화 · ' + pct(rate) + '</button>');
  }

  function feedSheet(id) {
    var m = MM.getMonster(S, id); if (!m) return;
    var html = '<div class="row" style="gap:12px">' + monSvg(m.el, m.tier, 52) + '<div><b>' + name(m) + '에게 소울 먹이기</b><div class="muted small">Lv ' + m.level + ' / ' + MM.maxLevel(m.tier) + ' · ' + elName(m.el) + ' 소울만 먹일 수 있어요</div></div></div>' +
      '<div class="expbar" style="margin:10px 0 4px"><i style="width:' + (m.exp / MM.expToNext(m.level) * 100) + '%"></i></div>' +
      '<div class="muted small" style="margin-bottom:10px">다음 레벨까지 EXP ' + fmt(MM.expToNext(m.level) - m.exp) + '</div><div class="pick-list">';
    var any = false;
    MM.tiers().forEach(function (t) {
      var n = S.souls[MM.speciesKey(m.el, t)] || 0;
      if (!n) return;
      any = true;
      var opts = [1, 10, n].filter(function (c, i, a) { return c <= n && a.indexOf(c) === i; });
      html += '<div class="pick" style="display:block"><div class="row between"><b>' + MM.speciesName(m.el, t) + ' 소울 ' + n + '개</b><span class="muted small">1개 EXP ' + fmt(MM.soulExp(t)) + '</span></div><div class="row wrap" style="gap:6px;margin-top:8px">' +
        opts.map(function (c) {
          var p = MM.feedPreview(m, t, c);
          return '<button class="btn sm" data-act="feed" data-id="' + m.id + '" data-tier="' + t + '" data-n="' + c + '">' + (c === n && c > 10 ? '전부' : c + '개') + ' → Lv ' + p.level + (p.used < c ? ' (' + p.used + '개만)' : '') + '</button>';
        }).join('') + '</div></div>';
    });
    if (!any) html += '<div class="muted small">' + elName(m.el) + ' 소울이 없어요</div>';
    html += '</div><div class="muted small" style="margin-top:10px">높은 단계 소울일수록 경험치가 많아요. 최대 레벨이 되면 남은 소울은 쓰지 않아요.</div>';
    openSheet(html);
  }

  function offlineSheet() {
    var off = MM.offlineStageValid(S) ? S.offline.stage : null, html = '<b>방치 보상 스테이지</b><div class="muted small" style="margin:4px 0 10px">게임을 하든 안 하든 이 스테이지를 효율 ' + Math.round(BAL().OFFLINE_RATE * 100) + '%로 돌아요 (최대 ' + BAL().OFFLINE_MAX_HOURS + '시간 쌓임) · 클리어한 스테이지만<br>바꾸면 지금까지 쌓인 보상은 바꾸기 전 스테이지로 받아요</div><div class="pick-list">';
    var any = false;
    MM.tiers().slice().reverse().forEach(function (t) {
      var els = MM.RING.filter(function (e) { return S.cleared[MM.speciesKey(e, t)]; });
      if (!els.length) return;
      any = true;
      html += '<div class="muted small" style="margin-top:4px">' + t + '단계 스테이지</div><div class="row wrap" style="gap:6px">' + els.map(function (e) {
        var on = off && off.el === e && off.tier === t;
        return '<button class="btn sm' + (on ? ' primary' : '') + '" data-act="pickOffline" data-el="' + e + '" data-tier="' + t + '">' + (on ? '✓ ' : '') + MM.speciesName(e, t) + '</button>';
      }).join('') + '</div>';
    });
    if (!any) html += '<div class="muted small">아직 클리어한 스테이지가 없어요</div>';
    openSheet(html + '</div>');
  }

  function soulSheet(el, tier) {
    var key = MM.speciesKey(el, tier), n = S.souls[key] || 0, per = BAL().SOULS_PER_SUMMON;
    var html = '<div class="row" style="gap:12px">' + monSvg(el, tier, 52) + '<div><b>' + MM.speciesName(el, tier) + ' 소울</b><div class="muted small">보유 ' + n + '개 / 최대 ' + BAL().SOUL_CAP + '개</div></div></div>' +
      '<div class="pick-list" style="margin-top:14px">' +
      '<button class="pick" data-act="summon" data-el="' + el + '" data-tier="' + tier + '"' + (n >= per ? '' : ' disabled') + '><b>소환</b><span class="muted small">소울 ' + per + '개 → ' + MM.speciesName(el, tier) + ' Lv ' + MM.summonLevel(tier) + '</span></button>';
    if (tier > 1) {
      var low = MM.speciesName(el, tier - 1);
      html += '<button class="pick" data-act="decompSoul" data-el="' + el + '" data-tier="' + tier + '" data-n="1"' + (n >= 1 ? '' : ' disabled') + '><b>분해 1개</b><span class="muted small">→ ' + low + ' 소울 ' + BAL().DECOMPOSE_SOUL_SOULS + '개</span></button>' +
        '<button class="pick" data-act="decompSoul" data-el="' + el + '" data-tier="' + tier + '" data-n="5"' + (n >= 5 ? '' : ' disabled') + '><b>분해 5개</b><span class="muted small">→ ' + low + ' 소울 ' + BAL().DECOMPOSE_SOUL_SOULS * 5 + '개</span></button>';
    } else {
      html += '<div class="muted small">1단계 소울은 분해할 수 없어요</div>';
    }
    html += '</div><div class="muted small" style="margin-top:10px">분해는 손해를 보는 교환이에요. 합성 비용 소울이 급할 때 쓰세요.<br>남는 소울은 몬스터 목록의 "먹이기"로 같은 속성 몬스터에게 경험치로 줄 수 있어요 (1개 EXP ' + fmt(MM.soulExp(tier)) + ').</div>';
    openSheet(html);
  }

  // ================= 합성 =================
  function fusionSel() {
    var f = view.fusion;
    var main = f.mainId && MM.getMonster(S, f.mainId), sub = f.subId && MM.getMonster(S, f.subId);
    if (!main) { f.mainId = null; main = null; }
    if (sub && (!main || !MM.isPair(main, sub))) { f.subId = null; sub = null; }
    return { main: main, sub: sub };
  }
  function slotHtml(m, label, act) {
    if (!m) return '<div class="fuse-slot empty tap" data-act="' + act + '">' + label + '<span class="swap">눌러서 고르기</span></div>';
    var req = view.fusion.mainId === m.id ? MM.fuseLevelReq(m.tier) : MM.subLevelReq(m.tier);
    return '<div class="fuse-slot tap" data-act="' + act + '">' + monSvg(m.el, m.tier, 46) + '<div>' + name(m) + '</div>' +
      '<span class="small ' + (m.level >= req ? 'okc' : 'lack') + '">Lv ' + m.level + '</span>' + (m.stack ? '<span class="chip stack">스택 ' + m.stack + '</span>' : '') + '<span class="swap">눌러서 바꾸기</span></div>';
  }

  SCREENS.fusion = function () {
    var sel = fusionSel(), main = sel.main, sub = sel.sub, f = view.fusion;
    var res = main ? '<div class="fuse-slot">' + monSvg(main.el, main.tier + 1, 46, !S.dex[MM.speciesKey(main.el, main.tier + 1)]) + '<div>' + MM.speciesName(main.el, main.tier + 1) + '</div>' +
      (sub ? '<span class="small" style="color:var(--accent)">Lv ' + MM.fusionRangeText(main, sub) + '</span>' : '') +
      (!S.dex[MM.speciesKey(main.el, main.tier + 1)] ? '<span class="chip">미발견</span>' : '') + '</div>' : '<div class="fuse-slot empty">결과</div>';
    var html = '<h2>합성</h2><div class="fuse-box">' + slotHtml(main, '주재료', 'pickMainSheet') + '<div class="fuse-op">+</div>' + slotHtml(sub, '부재료', 'pickSubSheet') + '<div class="fuse-op">=</div>' + res + '</div>';

    if (main && sub) {
      var chk = MM.fusionCheck(S, main, sub, f.soulEl, f.soulN), cost = chk.cost;
      if (cost.soulTier && cost.soulOptions.indexOf(f.soulEl) < 0) {
        f.soulEl = cost.soulOptions.slice().sort(function (a, b) { return (S.souls[MM.speciesKey(b, cost.soulTier)] || 0) - (S.souls[MM.speciesKey(a, cost.soulTier)] || 0); })[0];
        chk = MM.fusionCheck(S, main, sub, f.soulEl, f.soulN);
      }
      var rate = MM.successRate(main.tier, main.stack), next = MM.successRate(main.tier, main.stack + 1);
      var meter = '';
      for (var i = 1; i <= BAL().STACK_GUARANTEE; i++) meter += '<i class="' + (i <= main.stack ? 'on' : '') + '"></i>';
      var nextGold = MM.fusionCost({ el: main.el, tier: main.tier, stack: main.stack + 1 }, sub, f.soulN).gold;
      html += '<div class="card" style="margin-top:14px"><div class="rate-big">' + pct(rate) + '</div>' +
        '<div class="rate-sub">성공률' + (main.stack ? ' (기본 ' + pct(MM.tierVal(BAL().BASE_SUCCESS, main.tier)) + ' + 실패 스택 ' + main.stack + ')' : '') + '</div><div class="stack-meter">' + meter + '</div>' +
        '<div class="rate-sub">' + (rate >= 1 ? '이번엔 반드시 성공해요' : '실패해도 재료는 그대로 · 실패하면 다음 시도 <b style="color:var(--text)">' + pct(next) + '</b> (골드 ' + fmt(nextGold) + ')') + '</div></div>';
      var req = chk.req;
      html += '<div class="card"><b>조건</b>' +
        '<div class="cost-line" style="margin-top:6px"><span>' + name(main) + ' (주재료) Lv ' + req + ' 이상</span><span class="' + (main.level >= req ? 'okc' : 'lack') + '">' + (main.level >= req ? '✓' : 'Lv ' + main.level) + '</span></div>' +
        '<div class="cost-line"><span>' + name(sub) + ' (부재료) Lv ' + chk.subReq + ' 이상</span><span class="' + (sub.level >= chk.subReq ? 'okc' : 'lack') + '">' + (sub.level >= chk.subReq ? '✓' : 'Lv ' + sub.level) + '</span></div>' +
        '<div class="cost-line"><span>몬스터 4마리 이상</span><span class="' + (S.monsters.length >= BAL().MIN_MONSTERS_TO_FUSE ? 'okc' : 'lack') + '">' + S.monsters.length + '마리</span></div></div>';
      html += '<div class="card"><b>비용</b><div class="cost-line" style="margin-top:6px"><span>골드' + (main.stack ? ' (스택 +' + Math.round(BAL().FUSION_GOLD_STACK_UP * main.stack * 100) + '%)' : '') + '</span><span class="' + (S.gold >= cost.gold ? '' : 'lack') + '">' + fmt(cost.gold) + ' G</span></div>';
      if (cost.soulTier) {
        var have = S.souls[MM.speciesKey(f.soulEl, cost.soulTier)] || 0;
        html += '<div class="cost-line"><span>' + cost.soulTier + '단계 소울 ' + cost.souls + '개</span><span class="' + (have >= cost.souls ? '' : 'lack') + '">보유 ' + have + '</span></div>';
        html += '<div class="soul-n"><button class="btn sm" data-act="soulN" data-d="-1"' + (cost.souls > 1 ? '' : ' disabled') + '>−</button><div><b>소울 ' + cost.souls + '개</b><div class="muted small">' + (cost.souls > 1 ? '골드 -' + Math.round(BAL().FUSION_SOUL_GOLD_CUT * (cost.souls - 1) * 100) + '%' : '소울을 더 쓰면 골드가 줄어요') + '</div></div><button class="btn sm" data-act="soulN" data-d="1"' + (cost.souls < BAL().FUSION_SOUL_MAX ? '' : ' disabled') + '>+</button></div>';
        if (cost.soulOptions.length > 1) html += '<div class="soul-choice">' + cost.soulOptions.map(function (el) {
          return '<button class="' + (el === f.soulEl ? 'on' : '') + '" data-act="soulEl" data-el="' + el + '">' + MM.speciesName(el, cost.soulTier) + ' (' + (S.souls[MM.speciesKey(el, cost.soulTier)] || 0) + ')</button>';
        }).join('') + '</div>';
      }
      html += '</div>';
    } else {
      var ready = readyPairs(6);
      if (ready.length) {
        html += '<h3>지금 합성할 수 있는 조합</h3><div class="pick-list">' + ready.map(function (p) {
          return '<button class="pick" data-act="quickPair" data-main="' + p.main.id + '" data-sub="' + p.sub.id + '">' + monSvg(p.main.el, p.main.tier, 30) + '<b>' + name(p.main) + '</b> + ' + monSvg(p.sub.el, p.sub.tier, 26) + name(p.sub) +
            '<span class="muted small" style="margin-left:auto">' + pct(MM.successRate(p.main.tier, p.main.stack)) + '</span></button>';
        }).join('') + '</div>';
      }
    }
    html += '<div class="card muted small lh" style="margin-top:12px">규칙: 1단계+1단계 = 2단계 · n단계 + (n-1)단계 = (n+1)단계 · 결과 속성은 주재료<br>부재료는 원형 이웃 속성만 (불-풀-물-빛-어둠-불) · 같은 속성은 안 돼요<br>주재료는 합성 조건 레벨, 부재료는 소환 레벨 이상 · 결과 레벨은 두 재료의 평균(올림) + 1~3<br>실패해도 재료는 남고 성공률이 올라요 (' + BAL().STACK_GUARANTEE + '스택이면 100%)</div>';
    return html;
  };
  DOCKS.fusion = function () {
    var sel = fusionSel();
    if (!sel.main || !sel.sub) return '';
    var chk = MM.fusionCheck(S, sel.main, sel.sub, view.fusion.soulEl, view.fusion.soulN);
    return '<button class="btn primary block" data-act="fuse"' + (chk.ok ? '' : ' disabled') + '>' + (chk.ok ? '합성 시도 · ' + pct(MM.successRate(sel.main.tier, sel.main.stack)) : chk.reasons[0]) + '</button>';
  };

  function mainSheet() {
    var cands = sortMons(S.monsters.filter(MM.canBeMain));
    openSheet('<b>주재료 고르기</b><div class="muted small" style="margin:4px 0 10px">결과 속성은 주재료를 따라요</div><div class="pick-list">' + (cands.length ? cands.map(function (m) {
      var subs = S.monsters.filter(function (x) { return MM.isPair(m, x); }).length, req = MM.fuseLevelReq(m.tier);
      return '<button class="pick' + (view.fusion.mainId === m.id ? ' sel' : '') + (subs ? '' : ' dim') + '" data-act="pickMain" data-id="' + m.id + '">' + monSvg(m.el, m.tier, 34) + '<div style="flex:1"><b>' + name(m) + '</b> <span class="small ' + (m.level >= req ? 'okc' : 'lack') + '">Lv ' + m.level + '/' + req + '</span>' + (m.stack ? ' <span class="chip stack">스택 ' + m.stack + '</span>' : '') +
        '<div class="muted small">부재료 후보 ' + subs + '마리 · 성공률 ' + pct(MM.successRate(m.tier, m.stack)) + '</div></div></button>';
    }).join('') : '<div class="muted">합성할 몬스터가 없어요</div>') + '</div>');
  }
  function subSheet() {
    var main = MM.getMonster(S, view.fusion.mainId);
    if (!main) { mainSheet(); return; }
    var subs = sortMons(S.monsters.filter(function (x) { return MM.isPair(main, x); })), req = MM.subLevelReq(MM.subTierFor(main.tier));
    var p = MM.partnersOf(main.el).map(function (e) { return MM.ELEMENTS[e].name; }).join('·');
    openSheet('<b>부재료 고르기</b><div class="muted small" style="margin:4px 0 10px">' + MM.subTierFor(main.tier) + '단계 ' + p + ' · Lv ' + req + ' 이상</div><div class="pick-list">' + (subs.length ? subs.map(function (m) {
      return '<button class="pick' + (view.fusion.subId === m.id ? ' sel' : '') + '" data-act="pickSub" data-id="' + m.id + '">' + monSvg(m.el, m.tier, 34) + '<div style="flex:1"><b>' + name(m) + '</b> <span class="small ' + (m.level >= req ? 'okc' : 'lack') + '">Lv ' + m.level + '/' + req + '</span>' + (S.party.indexOf(m.id) >= 0 ? ' <span class="chip party">파티</span>' : '') + (MM.inOfflineTeam(S, m.id) ? ' <span class="chip">방치</span>' : '') + '</div></button>';
    }).join('') : '<div class="muted">맞는 부재료가 없어요. ' + MM.subTierFor(main.tier) + '단계 ' + p + ' 몬스터가 필요해요.</div>') + '</div>');
  }

  function showOverlay(html) { var o = $('overlay'); o.innerHTML = html; o.hidden = false; }
  function hideOverlay() { $('overlay').hidden = true; $('overlay').innerHTML = ''; }
  function openSheet(html) { var s = $('sheet'); s.innerHTML = '<div class="sheet-body">' + html + '</div>'; s.hidden = false; }
  function closeSheet() { $('sheet').hidden = true; $('sheet').innerHTML = ''; }
  // 게임 안 확인 창: 예/아니오
  var pendingYes = null;
  function askConfirm(title, body, yesLabel, onYes) {
    pendingYes = onYes;
    openSheet('<b style="font-size:17px">' + title + '</b><div class="muted lh" style="margin:10px 0 16px">' + body + '</div>' +
      '<div class="grid2"><button class="btn" data-act="confirmNo">아니오</button><button class="btn primary" data-act="confirmYes">' + (yesLabel || '예') + '</button></div>');
  }

  function successOverlay(m, line, dex, acts, mainSnap, subSnap) {
    var charge = mainSnap ? '<div class="charge">' + monSvg(mainSnap.el, mainSnap.tier, 64) + monSvg(subSnap.el, subSnap.tier, 64) + '</div>' : '';
    showOverlay('<div class="result ok"><div class="stage-anim">' + charge + '<div class="' + (mainSnap ? 'rays reveal' : raysClass(m.tier)) + (m.tier >= 5 ? ' t5' : m.tier >= 4 ? ' t4' : '') + '"></div><div class="flash' + (mainSnap ? '' : ' now') + '"></div>' + sparks(18 + m.tier * 2, !mainSnap) +
      '<div class="pop' + (mainSnap ? '' : ' now') + '">' + monSvg(m.el, m.tier, 130) + '</div></div>' +
      '<div class="reveal' + (mainSnap ? '' : ' now') + '"><div class="big ok">' + line.title + '</div><div class="sub">' + line.sub + '</div>' +
      (dex ? '<div class="new">도감 새 등록! 보상: ' + MM.speciesName(m.el, m.tier) + ' 소울 ' + dex.soul + '개</div>' : '') +
      '<div class="acts">' + acts + '</div></div></div>');
  }

  function confirmFuse() {
    var sel = fusionSel(); if (!sel.main || !sel.sub) return;
    var chk = MM.fusionCheck(S, sel.main, sel.sub, view.fusion.soulEl, view.fusion.soulN);
    if (!chk.ok) { toast(chk.reasons[0]); return; }
    var c = chk.cost, rate = MM.successRate(sel.main.tier, sel.main.stack);
    var costText = fmt(c.gold) + ' G' + (c.soulTier ? ' + ' + MM.speciesName(view.fusion.soulEl || c.soulOptions[0], c.soulTier) + ' 소울 ' + c.souls + '개' : '');
    askConfirm('정말 합성할까요?', '<div class="row" style="gap:8px;justify-content:center;margin-bottom:8px">' + monSvg(sel.main.el, sel.main.tier, 40) + '<b>+</b>' + monSvg(sel.sub.el, sel.sub.tier, 34) + '<b>→</b>' + monSvg(sel.main.el, sel.main.tier + 1, 40, !S.dex[MM.speciesKey(sel.main.el, sel.main.tier + 1)]) + '</div>' +
      name(sel.main) + ' Lv ' + sel.main.level + ' + ' + name(sel.sub) + ' Lv ' + sel.sub.level + ' → <b>' + MM.speciesName(sel.main.el, sel.main.tier + 1) + ' Lv ' + MM.fusionRangeText(sel.main, sel.sub) + '</b> <span class="small">(평균 올림 +1~3)</span><br>성공률 <b style="color:var(--accent)">' + pct(rate) + '</b> · 비용 ' + costText + '<br><span class="small">실패해도 재료는 남아요</span>' + ([sel.main, sel.sub].some(function (m) { return m.plus; }) ? '<br><span class="small" style="color:var(--bad)">강화한 몬스터가 있어요. 성공하면 강화(' + [sel.main, sel.sub].filter(function (m) { return m.plus; }).map(function (m) { return name(m) + ' +' + m.plus; }).join(', ') + ')는 사라져요</span>' : ''), '합성', doFuse);
  }

  function doFuse() {
    var sel = fusionSel(); if (!sel.main || !sel.sub) return;
    var mainSnap = { el: sel.main.el, tier: sel.main.tier }, subSnap = { el: sel.sub.el, tier: sel.sub.tier };
    var res = MM.attemptFusion(S, sel.main.id, sel.sub.id, view.fusion.soulEl, null, { souls: view.fusion.soulN });
    if (res.error) { toast(res.error); render(); return; }
    save();
    if (res.success) {
      var m = res.monster;
      view.fusion = { mainId: null, subId: null, soulEl: null };
      successOverlay(m, { title: '합성 성공!', sub: name(m) + ' 탄생 · Lv ' + m.level + ' · 성공률 ' + pct(res.rate) + (res.spentStack ? ' · 실패 ' + res.spentStack + '번 끝에' : '') }, res.dex,
        '<button class="btn primary block" data-act="closeOverlay" data-tab="fusion">계속 합성</button><button class="btn block" data-act="closeOverlay" data-tab="monsters">몬스터 보기</button>', mainSnap, subSnap);
    } else {
      var main = MM.getMonster(S, view.fusion.mainId), sub = MM.getMonster(S, view.fusion.subId);
      var chk = MM.fusionCheck(S, main, sub, view.fusion.soulEl, view.fusion.soulN);
      showOverlay('<div class="result fail"><div class="stage-anim"><div class="charge">' + monSvg(mainSnap.el, mainSnap.tier, 64) + monSvg(subSnap.el, subSnap.tier, 64) + '</div><div class="fizzle">💨</div><div class="reveal">' + monSvg(mainSnap.el, mainSnap.tier, 90) + '</div></div>' +
        '<div class="reveal"><div class="big no">실패…</div><div class="sub">재료는 그대로 남았어요</div>' +
        '<div class="sub">실패 스택 ' + res.stack + ' → 다음 성공률 <b style="color:var(--accent);font-size:20px">' + pct(res.nextRate) + '</b></div>' +
        '<div class="acts">' + (chk.ok ? '<button class="btn primary block" data-act="retryFuse">한 번 더 (' + fmt(chk.cost.gold) + ' G' + (chk.cost.soulTier ? ' + 소울 1' : '') + ')</button>' : '<div class="muted small">' + chk.reasons[0] + '</div>') +
        '<button class="btn block" data-act="closeOverlay" data-tab="fusion">그만하기</button></div></div></div>');
    }
    render();
  }

  // ================= 도감 / 기록 =================
  SCREENS.dex = function () {
    var html = '<div class="seg"><button class="' + (view.dexSeg === 'dex' ? 'on' : '') + '" data-act="dexSeg" data-v="dex">도감</button><button class="' + (view.dexSeg === 'rec' ? 'on' : '') + '" data-act="dexSeg" data-v="rec">희귀 획득 기록 ' + S.records.length + '</button></div>';
    if (view.dexSeg === 'rec') return html + recordsHtml();
    var all = MM.allSpecies(), have = all.filter(function (sp) { return S.dex[sp.key]; }).length, g = goalCount();
    html += '<div class="card"><div class="row between"><b>수집률</b><span>' + have + ' / ' + all.length + '</span></div><div class="progress"><i style="width:' + have / all.length * 100 + '%"></i></div>' +
      '<div class="row between" style="margin-top:12px"><b>1차 목표 · ' + T() + '단계 5종</b><span style="color:var(--accent)">' + g + ' / 5</span></div><div class="progress"><i style="width:' + g / 5 * 100 + '%"></i></div></div>';
    html += '<div class="hscroll"><div class="tgrid" style="' + gridCols() + '"><div></div>' + MM.tiers().map(function (t) { return '<div class="head">' + t + '단계' + (t === T() ? ' ★' : '') + '</div>'; }).join('');
    MM.RING.forEach(function (el) {
      html += '<div class="el">' + elName(el) + '</div>';
      MM.tiers().forEach(function (t) {
        var got = !!S.dex[MM.speciesKey(el, t)];
        html += '<div class="dex-cell' + (t === T() ? ' goal' : '') + (t === T() && got ? ' have' : '') + '">' + monSvg(el, t, 34, !got) + '</div>';
      });
    });
    return html + '</div></div><div class="muted small" style="margin-top:12px">처음 등록하면 그 몬스터 소울 ' + BAL().FIRST_DEX_SOUL + '개를 받아요. 한 번이라도 가졌던 종은 도감에 남아요.</div>';
  };

  function recLine(r) {
    if (r.type === 'boss') return { title: r.tier + '단계 무지개 보스 격파!', sub: '보스 입장권 1장 사용' };
    if (r.type === 'equip') return { title: '장비 강화 +' + r.plus + '!', sub: MM.equipName(r.el, r.tier) + ' +' + r.plus + (r.rate ? ' · 성공률 ' + pct(r.rate) : '') };
    if (r.type === 'gacha') return { title: '소울 뽑기 대박!', sub: MM.speciesName(r.el, r.tier) + ' 소울 뽑기 · ' + (r.kind === 'boss' ? '보스 입장권' : r.kind === 'ticket' ? '입장권 ' + r.n + '장' : '위 단계 소울 ' + r.n + '개') };
    if (r.type === 'soul') return { title: r.tier + '단계 소울' + (r.first ? ' 첫 획득!' : ''), sub: MM.speciesName(r.el, r.tier) + ' 소울 ×' + r.count };
    return { title: '합성 성공!', sub: MM.speciesName(r.el, r.tier) + ' 탄생' + (r.rate ? ' · 성공률 ' + pct(r.rate) : '') + (r.spent ? ' · 실패 ' + r.spent + '번 끝에' : '') + (r.first ? ' · 도감 첫 등록' : '') };
  }
  function recordsHtml() {
    if (S.settings.recordOn === false) return '<div class="card muted">기록이 꺼져 있어요. 설정에서 켤 수 있어요.</div>';
    if (!S.records.length) return '<div class="card muted">아직 기록이 없어요. ' + BAL().RECORD_MIN_SOUL_TIER + '단계 이상 소울, 도감 첫 등록 합성, ' + BAL().RECORD_MIN_SOUL_TIER + '단계 이상 합성이 자동으로 남아요.</div>';
    return S.records.map(function (r, i) {
      var l = recLine(r);
      return '<button class="rec-row" data-act="recOpen" data-i="' + i + '">' + monSvg(r.el, r.tier, 38) + '<div style="flex:1"><b>' + l.title + '</b><div class="muted small">' + l.sub + '</div></div><span class="when">' + timeText(r.t) + '</span></button>';
    }).join('');
  }
  function recordOverlay(i) {
    var r = S.records[i]; if (!r) return;
    var l = recLine(r);
    showOverlay('<div class="result ok"><div class="stage-anim"><div class="' + raysClass(r.tier) + '"></div><div class="flash now"></div>' + sparks(16 + r.tier * 3, true) +
      '<div class="pop now" style="position:relative">' + monSvg(r.el, r.tier, 120) + (r.count > 1 ? '<span class="count-badge">×' + r.count + '</span>' : '') + '</div></div>' +
      '<div class="reveal now"><div class="big ok">' + l.title + '</div><div class="sub">' + l.sub + '</div><div class="sub">' + new Date(r.t).toLocaleString('ko-KR') + '</div>' +
      '<div class="acts"><button class="btn primary block" data-act="recImage" data-i="' + i + '">이미지로 저장</button><button class="btn block" data-act="closeOverlay">닫기</button></div></div></div>');
  }

  // 기록 카드를 PNG로 저장
  function saveRecordImage(i) {
    var r = S.records[i]; if (!r) return;
    var l = recLine(r), W = 1080, H = 1350, color = r.el === 'rainbow' ? '#b45cff' : MM.ELEMENTS[r.el].color;
    var rays = '';
    for (var k = 0; k < 18; k++) {
      var a = k * Math.PI / 9;
      rays += '<polygon points="540,620 ' + (540 + Math.cos(a - 0.08) * 700).toFixed(0) + ',' + (620 + Math.sin(a - 0.08) * 700).toFixed(0) + ' ' + (540 + Math.cos(a + 0.08) * 700).toFixed(0) + ',' + (620 + Math.sin(a + 0.08) * 700).toFixed(0) + '" fill="rgba(255,207,74,0.13)"/>';
    }
    var esc = function (t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<defs><radialGradient id="g" cx="50%" cy="46%" r="65%"><stop offset="0" stop-color="#3a2f5e"/><stop offset="1" stop-color="#14112a"/></radialGradient></defs>' +
      '<rect width="100%" height="100%" fill="url(#g)"/>' + rays +
      '<circle cx="540" cy="620" r="300" fill="' + color + '" opacity="0.12"/>' +
      '<g transform="translate(340,420) scale(4)">' + monInner(r.el, r.tier, false) + '</g>' +
      (r.count > 1 ? '<rect x="760" y="380" rx="40" width="170" height="90" fill="#ffcf4a"/><text x="845" y="445" text-anchor="middle" font-size="56" font-weight="900" fill="#2a2000" font-family="sans-serif">×' + r.count + '</text>' : '') +
      '<text x="540" y="1010" text-anchor="middle" font-size="84" font-weight="900" fill="#ffcf4a" font-family="sans-serif">' + esc(l.title) + '</text>' +
      '<text x="540" y="1090" text-anchor="middle" font-size="44" fill="#e9e4ff" font-family="sans-serif">' + esc(l.sub) + '</text>' +
      '<text x="540" y="1160" text-anchor="middle" font-size="34" fill="#a9a2cc" font-family="sans-serif">' + esc(new Date(r.t).toLocaleString('ko-KR')) + '</text>' +
      '<text x="540" y="1280" text-anchor="middle" font-size="34" font-weight="800" fill="#6f679e" font-family="sans-serif">몬스터 믹스</text></svg>';
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob(function (blob) {
        if (!blob) { toast('이미지를 만들지 못했어요'); return; }
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'monster-mix-' + MM.speciesName(r.el, r.tier) + '-' + r.t + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        toast('이미지를 저장했어요');
      }, 'image/png');
    };
    img.onerror = function () { toast('이미지를 만들지 못했어요'); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ================= 설정 =================
  SCREENS.settings = function () {
    var off = S.offline.stage;
    function sw(k, title, desc) { return '<div class="card"><div class="switch-row"><div><b>' + title + '</b><div class="muted small">' + desc + '</div></div><button class="switch' + (S.settings[k] ? ' on' : '') + '" data-act="setting" data-k="' + k + '"></button></div></div>'; }
    return '<button class="btn sm" data-act="tab" data-tab="home">← 마을</button><h2 style="margin-top:12px">설정</h2>' +
      sw('autoBattle', '전투 자동', '한 번 켜면 다음 전투에도 계속 자동이에요. 전투 화면의 자동 버튼과 같아요.') +
      sw('recordOn', '희귀 획득 기록', BAL().RECORD_MIN_SOUL_TIER + '단계 이상 소울, 도감 첫 등록 등을 자동으로 남겨요.') +
      sw('fastTest', '빠른 테스트', '소울이 ' + BAL().FAST_TEST_DROP_MULT + '배 잘 나와요. 실제 템포를 보려면 꺼 두세요.') +
      '<div class="card"><b>방치 보상</b><div class="muted small lh" style="margin-top:6px">' + (off && MM.offlineStageValid(S) ? '지정: ' + MM.speciesName(off.el, off.tier) + ' 스테이지' : '지정한 스테이지가 없어요. 마을의 방치 보상 카드에서 지정하세요.') + '<br>게임을 하든 안 하든 최대 ' + BAL().OFFLINE_MAX_HOURS + '시간, 효율 ' + Math.round(BAL().OFFLINE_RATE * 100) + '%</div></div>' +
      '<div class="card"><b>데이터</b><div class="muted small" style="margin:6px 0 10px">진행 상황은 이 브라우저에 자동 저장돼요.</div><button class="btn block danger" data-act="reset">데이터 초기화</button></div>' +
      '<div class="muted small" style="text-align:center">몬스터 믹스 시제품 v2</div>';
  };

  // ================= 오프라인 보상 =================
  function hoursText(h) { return h >= 1 ? Math.floor(h) + '시간 ' + Math.floor((h % 1) * 60) + '분' : Math.floor(h * 60) + '분'; }
  function bagList(bag) {
    return sortSoulKeys(Object.keys(bag.souls)).map(function (k) { var p = MM.parseKey(k); return { key: k, el: p.el, tier: p.tier, count: bag.souls[k] }; });
  }
  function sortSoulKeys(keys) { return keys.sort(function (a, b) { var A = MM.parseKey(a), Bk = MM.parseKey(b); return Bk.tier - A.tier || MM.RING.indexOf(A.el) - MM.RING.indexOf(Bk.el); }); }
  function offlineCard() {
    if (!S.tutorial.done) return '';
    var ms = MM.offlinePendingMs(S), h = ms / 3600000, full = MM.offlineFull(S), valid = MM.offlineStageValid(S), st = S.offline.stage;
    var pct = Math.min(100, ms / (BAL().OFFLINE_MAX_HOURS * 3600000) * 100), bag = MM.offlineBag(S), ready = MM.offlineReady(S);
    var right = !valid ? '<button class="btn sm" data-act="offlineSheet">지정하기</button>' :
      '<button class="btn sm' + (ready ? ' primary' : '') + '" data-act="claimOffline"' + (ready ? '' : ' disabled') + '>즉시 받기</button>';
    var team = MM.offlineTeam(S).map(function (id) { return MM.getMonster(S, id); }).filter(Boolean);
    var items = valid ? '<div class="off-items">' + bagList(bag).map(function (d) {
        return '<span class="soul-item' + (d.tier >= BAL().RECORD_MIN_SOUL_TIER ? ' rare' : '') + '">' + monSvg(d.el, d.tier, 18) + MM.speciesName(d.el, d.tier) + ' ×' + d.count + '</span>';
      }).join('') + (bag.tickets ? '<span class="soul-item rare">🎟 ' + st.tier + '단계 입장권 ×' + bag.tickets + '</span>' : '') + '<span class="soul-item">' + fmt(bag.gold) + ' G</span><span class="soul-item">EXP ' + fmt(bag.exp) + '</span></div>' : '';
    var teamLine = '<button class="linkish small off-team" data-act="offlineTeamSheet">경험치: ' + (team.length ? team.map(function (m) { return monSvg(m.el, m.tier, 18) + name(m); }).join(' ') : '없음') + (S.offline.team && S.offline.team.length ? '' : ' <span class="muted">(파티)</span>') + ' · 바꾸기 ›</button>';
    return '<div class="card offline-card' + (full ? ' full' : '') + '"><div class="row between"><div><b>방치 보상</b> <span class="small ' + (full ? 'lack' : 'muted') + '">' + hoursText(h) + ' / ' + BAL().OFFLINE_MAX_HOURS + '시간' + (full ? ' · 가득 참' : '') + '</span>' +
      '<button class="linkish small" data-act="offlineSheet">' + (valid ? MM.speciesName(st.el, st.tier) + ' 스테이지 · 바꾸기 ›' : '스테이지를 지정하면 쌓이기 시작해요 ›') + '</button></div>' + right + '</div>' +
      '<div class="expbar" style="margin-top:8px"><i style="width:' + pct + '%"></i></div>' + items + (valid ? teamLine : '') + '</div>';
  }
  function offlineTeamSheet() {
    if (!view.teamSel) view.teamSel = MM.offlineTeam(S).slice();
    var sel = view.teamSel;
    var html = '<b>방치 보상 경험치 몬스터</b><div class="muted small" style="margin:4px 0 10px">최대 3마리 · 파티에 있는 몬스터도 돼요 · 부재료 키우기용으로 좋아요<br>스테이지보다 낮은 단계 몬스터는 자기 단계 스테이지만큼 경험치를 받아요<br>바꾸면 지금까지 쌓인 보상은 바꾸기 전 몬스터가 받아요 · 여기 넣은 몬스터는 빼야 합성·분해할 수 있어요</div><div class="pick-list">' +
      sortMons(S.monsters).map(function (m) {
        var i = sel.indexOf(m.id);
        return '<button class="pick' + (i >= 0 ? ' sel' : '') + '" data-act="teamPick" data-id="' + m.id + '">' + monSvg(m.el, m.tier, 30) + '<div style="flex:1"><b>' + name(m) + '</b> <span class="muted small">Lv ' + m.level + (m.level >= MM.maxLevel(m.tier) ? ' (최대)' : '') + '</span>' + (S.party.indexOf(m.id) >= 0 ? ' <span class="chip party">파티</span>' : '') + (MM.inOfflineTeam(S, m.id) ? ' <span class="chip">방치</span>' : '') + '</div>' + (i >= 0 ? '<span class="chip adv">' + (i + 1) + '</span>' : '') + '</button>';
      }).join('') + '</div><button class="btn primary block" style="margin-top:12px" data-act="teamSave"' + (sel.length ? '' : ' disabled') + '>' + sel.length + '마리로 지정</button>';
    openSheet(html);
  }
  function claimOfflineNow() {
    var res = MM.claimOffline(S, Date.now());
    save();
    if (!res) { toast('아직 받을 보상이 없어요'); render(); return; }
    showPaid(res);
  }
  function changeOfflineTeam(ids) {
    MM.accrueOffline(S, Date.now());
    var r = MM.setOfflineTeam(S, ids);
    view.teamSel = null;
    save(); closeSheet();
    if (r.changed) toast('방치 보상 몬스터를 바꿨어요');
    if (r.paid) showPaid(r.paid, '몬스터를 바꿔서 지금까지 쌓인 보상을 받았어요');
    render();
  }
  function changeOfflineStage(el, tier) {
    MM.accrueOffline(S, Date.now());
    var r = MM.setOfflineStage(S, el, tier);
    save(); closeSheet();
    toast(MM.speciesName(el, tier) + ' 스테이지로 지정했어요');
    if (r.paid) showPaid(r.paid, '스테이지를 바꿔서 지금까지 쌓인 보상을 받았어요');
    render();
  }
  function showPaid(res, note) {
    showOverlay('<div class="result"><div class="big ok">방치 보상</div>' + (note ? '<div class="muted small" style="margin-top:4px">' + note + '</div>' : '') + '<div class="sub">' + MM.speciesName(res.stage.el, res.stage.tier) + ' 스테이지 · ' + hoursText(res.hours) + (res.capped ? ' (최대 ' + BAL().OFFLINE_MAX_HOURS + '시간)' : '') + ' · ' + fmt(res.runs) + '판 분량</div>' +
      '<div class="card" style="margin-top:16px;text-align:left"><b>소울</b><div class="soul-list" style="margin-top:10px">' + (res.drops.length ? dropsHtml(res.drops) : '<span class="muted small">이번에는 소울이 없어요</span>') + '</div></div>' +
      '<div class="card" style="text-align:left"><div class="cost-line"><span>골드</span><span>+' + fmt(res.gold) + ' G</span></div>' + (res.tickets ? '<div class="cost-line"><span>🎟 입장권</span><span>' + res.stage.tier + '단계 +' + res.tickets + '장</span></div>' : '') +
      res.team.map(function (id) { var m = MM.getMonster(S, id); return m ? '<div class="cost-line"><span>' + name(m) + '</span><span>EXP +' + fmt(res.expBy[id] || 0) + '</span></div>' : ''; }).join('') +
      res.levelUps.map(function (u) { return '<div class="cost-line"><span>레벨 업!</span><span>' + u.name + ' → Lv ' + u.level + '</span></div>'; }).join('') + '</div>' +
      '<div class="acts"><button class="btn primary block" data-act="closeOverlay">확인</button></div></div>');
    var rare = rareOf(res.drops); if (rare.length) rare.forEach(showBanner);
  }

  // ================= 튜토리얼 =================
  function showTutorial() {
    var st = S.tutorial.step;
    document.body.classList.add('in-tutorial');
    if (st === 0) {
      var picks = view.tut.picks;
      showOverlay('<div class="tut"><h2>몬스터 믹스에 온 걸 환영해요</h2>' +
        '<p>소울을 모아 몬스터를 소환하고,<br>두 몬스터를 <b style="color:var(--accent)">합성</b>해 더 높은 단계로 키우는 게임이에요.</p>' +
        '<p>먼저 함께할 <b>1단계 몬스터 3마리</b>를 골라 주세요.<br><span class="small">서로 다른 속성으로 3개</span></p>' +
        '<div class="el-pick">' + MM.RING.map(function (el) {
          var on = picks.indexOf(el) >= 0;
          return '<button class="' + (on ? 'on' : '') + '" data-act="tutPick" data-el="' + el + '"' + (!on && picks.length >= 3 ? ' disabled' : '') + '>' + monSvg(el, 1, 40) + '<div>' + MM.ELEMENTS[el].name + '</div></button>';
        }).join('') + '</div>' + elChart() +
        '<div class="acts" style="margin-top:18px"><button class="btn primary block" data-act="tutStart"' + (picks.length === 3 ? '' : ' disabled') + '>이 3마리로 시작 (' + picks.length + '/3)</button></div></div>');
    } else if (st === 1) {
      showOverlay('<div class="tut"><h2>첫 전투</h2><p>전투는 턴제예요. 내 차례에 <b>공격할 적을 누르면</b> 공격해요.<br><b style="color:var(--good)">▲</b> 표시는 상성이 유리한 적이에요.</p>' +
        '<p>이기면 <b>소울</b>, 골드, 경험치를 얻어요.</p><div class="acts"><button class="btn primary block" data-act="tutBattle">전투 시작</button></div></div>');
    } else if (st === 2) {
      showOverlay('<div class="tut"><h2>잘했어요!</h2><p>파티가 <b>Lv ' + BAL().TUTORIAL_LEVEL + '</b>가 됐어요.</p>' +
        '<p><b>소울</b>: 같은 몬스터 소울 ' + BAL().SOULS_PER_SUMMON + '개를 모으면 그 몬스터를 소환해요. 도감에 처음 등록할 때도 소울 1개를 받아요.</p>' +
        '<p><b>합성</b>: 주재료는 합성 조건 레벨, 부재료는 소환 레벨 이상이면 돼요. 결과 몬스터는 두 재료의 평균 레벨로 태어나요.</p>' +
        '<div class="acts"><button class="btn primary block" data-act="tutNext">다음</button></div></div>');
    } else if (st === 3) {
      var opts = MM.tutorialFourthOptions(S);
      showOverlay('<div class="tut"><h2>선물: 한 마리 더</h2><p>합성은 몬스터가 <b>4마리 이상</b>일 때 할 수 있어요 (합성하면 2마리가 1마리가 되니까요).<br>남은 속성 중 한 마리를 골라 주세요.</p>' +
        '<div class="row" style="justify-content:center;gap:12px;margin:16px 0">' + opts.map(function (el) {
          return '<button class="btn" style="flex-direction:column;padding:14px 22px" data-act="tutFourth" data-el="' + el + '">' + monSvg(el, 1, 54) + '<div>' + MM.ELEMENTS[el].name + '1 · Lv ' + BAL().TUTORIAL_LEVEL + '</div></button>';
        }).join('') + '</div></div>');
    } else if (st === 4) {
      var pair = null;
      S.monsters.forEach(function (a) { S.monsters.forEach(function (b) { if (!pair && MM.fusionCheck(S, a, b).ok) pair = { main: a, sub: b }; }); });
      if (!pair) { MM.finishTutorial(S); save(); hideOverlay(); document.body.classList.remove('in-tutorial'); render(); return; }
      view.tut.pair = pair;
      showOverlay('<div class="tut"><h2>첫 합성</h2><p><b>주재료</b> + <b>부재료</b> = 한 단계 위 몬스터. 결과 속성은 주재료를 따라요.<br>부재료는 원형에서 <b>이웃한 속성</b>만 쓸 수 있어요.</p>' +
        '<div class="fuse-box" style="margin:14px 0"><div class="fuse-slot">' + monSvg(pair.main.el, 1, 46) + '<div>' + name(pair.main) + '</div></div><div class="fuse-op">+</div><div class="fuse-slot">' + monSvg(pair.sub.el, 1, 46) + '<div>' + name(pair.sub) + '</div></div><div class="fuse-op">=</div><div class="fuse-slot">' + monSvg(pair.main.el, 2, 46, true) + '<div>' + MM.speciesName(pair.main.el, 2) + '</div></div></div>' +
        '<p class="small">원형: 불 - 풀 - 물 - 빛 - 어둠 - (다시 불)<br>보통은 실패할 수도 있지만, 실패해도 재료는 남고 다음 성공률이 올라요.<br>이번 첫 합성은 반드시 성공해요!</p>' +
        '<div class="acts"><button class="btn primary block" data-act="tutFuse">합성!</button></div></div>');
    }
  }

  // ================= 입력 =================
  var ACTIONS = {
    tab: function (d) { if (d.mon) view.monSeg = d.mon; if (d.seg) view.stageSeg = d.seg; go(d.tab); },
    stageSeg: function (d) { view.stageSeg = d.v; render(); },
    monSeg: function (d) { view.monSeg = d.v; render(); },
    dexSeg: function (d) { view.dexSeg = d.v; render(); },
    records: function () { view.dexSeg = 'rec'; go('dex'); },
    stage: function (d) { view.stage = { el: d.el, tier: +d.tier }; go('stageDetail'); },
    startStage: function () { startBattle('stage', { el: view.stage.el, tier: view.stage.tier }); },
    startRepeat: function () { if (view.battle) view.battle = null; startBattle('stage', { el: view.stage.el, tier: view.stage.tier, repeat: true }); },
    setOffline: function () { changeOfflineStage(view.stage.el, view.stage.tier); },
    again: function () { var R = view.reward; if (R) { view.stage = { el: R.el, tier: R.tier }; startBattle('stage', { el: R.el, tier: R.tier }); } },
    againRepeat: function () { var R = view.reward; if (R) { view.stage = { el: R.el, tier: R.tier }; view.battle = null; startBattle('stage', { el: R.el, tier: R.tier, repeat: true }); } },
    dEl: function (d) {
      var i = view.dungeonEls.indexOf(d.el);
      if (i >= 0) view.dungeonEls.splice(i, 1); else if (view.dungeonEls.length < 3) view.dungeonEls.push(d.el);
      S.dungeon.weekendEls = view.dungeonEls.slice(); save();
      render();
    },
    tEl: function (d) {
      var i = view.ticketEls.indexOf(d.el);
      if (i >= 0) view.ticketEls.splice(i, 1); else if (view.ticketEls.length < 3) view.ticketEls.push(d.el);
      S.dungeon.ticketEls = view.ticketEls.slice(); save(); render();
    },
    bossAct: function (d) {
      var Bt = view.battle; if (!Bt || Bt.busy || Bt.kind !== 'boss') return;
      var actor = MM.currentActor(Bt.bt); if (!actor || actor.side !== 'p') return;
      Bt.busy = true;
      if (d.a === 'heal' || d.a === 'revive') { Bt.busy = false; Bt.pending = d.a; render(); return; }
      Bt.pending = null;
      if (d.a === 'attack') { doAct(null); return; }
      var ev = MM.act(Bt.bt, null, null, { action: d.a }); Bt.last = ev; render();
      Bt.timer = setTimeout(battleTick, 380);
    },
    bossCancel: function () { if (view.battle) { view.battle.pending = null; render(); } },
    allyPick: function (d) {
      var Bt = view.battle; if (!Bt || !Bt.pending || Bt.busy) return;
      var action = Bt.pending; Bt.pending = null; Bt.busy = true;
      var ev = MM.act(Bt.bt, null, null, { action: action, target: +d.uid }); Bt.last = ev; render();
      var node = $('u' + d.uid); if (node && ev && ev.amount) { var dd = document.createElement('div'); dd.className = 'dmg heal'; dd.textContent = '+' + ev.amount; node.appendChild(dd); }
      Bt.timer = setTimeout(battleTick, 450);
    },
    startBoss: function (d) { var tier = +d.tier; if (MM.bossTicketCount(S, tier) <= 0) { toast('보스 입장권이 없어요'); return; } startBattle('boss', { tier: tier }); },
    startTicket: function (d) {
      var tier = +d.tier;
      if (view.ticketEls.length !== 3) { toast('속성 3개를 골라 주세요'); return; }
      if (MM.ticketCount(S, tier) <= 0) { toast('입장권이 없어요'); return; }
      startBattle('ticket', { tier: tier, els: view.ticketEls.slice() });
    },
    startDungeon: function (d) {
      var now = Date.now(), dEl = MM.dungeonElementFor(now), els = dEl ? [dEl] : view.dungeonEls.slice();
      if (!dEl && els.length !== 3) { toast('주말에는 속성 3개를 골라 주세요'); return; }
      if (MM.dungeonLeft(S, now) <= 0) { toast('오늘 던전 횟수를 다 썼어요'); return; }
      startBattle('dungeon', { tier: +d.tier, els: els }); // 횟수는 이겨서 보상을 받을 때 차감
    },
    sweepDungeon: function (d) {
      var now = Date.now(), dEl = MM.dungeonElementFor(now), els = dEl ? [dEl] : view.dungeonEls.slice(), tier = +d.tier;
      if (!dEl && els.length !== 3) { toast('주말에는 속성 3개를 골라 주세요'); return; }
      if (!S.dungeon.cleared[tier]) return;
      if (!MM.useDungeonEntry(S, now)) { toast('오늘 던전 횟수를 다 썼어요'); return; }
      var en = MM.dungeonEnemies(els, tier), r = MM.grantDungeonWin(S, tier, en);
      save();
      view.reward = { win: true, kind: 'dungeon', tier: tier, els: els, r: r };
      view.tab = 'reward'; render();
      var rare = rareOf(r.drops); if (rare.length) showRareDrops(rare);
    },
    hit: function (d) {
      var Bt = view.battle; if (!Bt || Bt.busy) return;
      var actor = MM.currentActor(Bt.bt);
      if (!actor || actor.side !== 'p') return;
      Bt.pending = null; Bt.busy = true; doAct(+d.uid);
    },
    auto: function () {
      var Bt = view.battle; if (!Bt) return;
      Bt.auto = !Bt.auto; S.settings.autoBattle = Bt.auto; save();
      clearTimeout(Bt.timer); Bt.busy = false; battleTick();
    },
    stopAfter: function () { if (view.battle) { view.battle.stopAfter = !view.battle.stopAfter; render(); } },
    stopNow: function () { endRepeat(); },
    stopGo: function (d) {
      stopBattleTimers(); view.battle = null;
      if (d.to === 'souls') { view.monSeg = 'souls'; go('monsters'); }
      else { var r = readyNow(); if (r.pair) view.fusion = { mainId: r.pair.main.id, subId: r.pair.sub.id, soulEl: null }; go('fusion'); }
    },
    flee: function () { if (confirm('나가면 이번 판 보상은 없어요. 나갈까요?')) go(view.battle && (view.battle.kind === 'dungeon' || view.battle.kind === 'ticket' || view.battle.kind === 'boss') ? 'stages' : 'stageDetail'); },
    party: function (d) {
      var id = +d.id, i = S.party.indexOf(id);
      if (i >= 0) S.party.splice(i, 1);
      else if (S.party.length >= 3) { toast('파티는 최대 3마리예요. 먼저 한 마리를 빼 주세요'); return; }
      else S.party.push(id);
      save(); render();
    },
    decompMon: function (d) {
      var m = MM.getMonster(S, +d.id), why = MM.canDecomposeMonster(S, m);
      if (why) { toast(why); return; }
      askConfirm('정말 분해할까요?', '<div style="text-align:center;margin-bottom:8px">' + monSvg(m.el, m.tier, 48) + '</div>' + MM.josa(name(m), '을', '를') + ' (Lv ' + m.level + ') 분해하면<br>' + name(m) + ' 소울 <b>' + BAL().DECOMPOSE_MONSTER_SOULS + '개</b>를 받아요 (소환에는 ' + BAL().SOULS_PER_SUMMON + '개 필요)<br><span class="small" style="color:var(--bad)">되돌릴 수 없어요</span>', '분해', function () {
        var r = MM.decomposeMonster(S, m.id);
        save(); toast(r.error || ('소울 ' + r.added + '개를 받았어요' + (r.wasted ? ' (' + r.wasted + '개는 가득 차서 버려짐)' : ''))); render();
      });
    },
    soulCell: function (d) { soulSheet(d.el, +d.tier); },
    offlineSheet: function () { offlineSheet(); },
    claimOffline: function () { claimOfflineNow(); },
    offlineTeamSheet: function () { view.teamSel = null; offlineTeamSheet(); },
    teamPick: function (d) { var id = +d.id, i = view.teamSel.indexOf(id); if (i >= 0) view.teamSel.splice(i, 1); else if (view.teamSel.length < 3) view.teamSel.push(id); else { toast('최대 3마리예요'); return; } offlineTeamSheet(); },
    teamSave: function () { changeOfflineTeam(view.teamSel || []); },
    pickOffline: function (d) { changeOfflineStage(d.el, +d.tier); },
    feedSheet: function (d) { feedSheet(+d.id); },
    offerSheet: function (d) { offerSheet(d.el); },
    offer: function (d) {
      var r = MM.offerSouls(S, d.el, +d.tier, +d.n);
      if (r.error) { toast(r.error); return; }
      save(); render();
      if (r.ups) showNotice('🔥 ' + MM.ELEMENTS[d.el].name + ' 제단 Lv ' + r.level + '!', MM.ELEMENTS[d.el].name + ' 몬스터 경험치 +' + Math.round(MM.altarExpBonus(S, d.el) * 100) + '% · 능력치 +' + (Math.round(MM.altarStatBonus(S, d.el) * 1000) / 10) + '%');
      else toast('+' + fmt(r.points) + '점');
      offerSheet(d.el);
    },
    gachaSheet: function (d) { gachaSheet(d.el, +d.tier); },
    gacha: function (d) { doGacha(d.el, +d.tier, +d.n); },
    equipSlot: function (d) { equipSlotSheet(d.el); },
    equipIt: function (d) { MM.equip(S, +d.id); save(); closeSheet(); render(); },
    unequip: function (d) { MM.unequip(S, d.el); save(); closeSheet(); render(); },
    craftEquip: function (d) {
      var t2 = +d.tier;
      askConfirm('장비를 만들까요?', '<div style="text-align:center;margin-bottom:8px">' + equipSvg(d.el, t2, 48) + '</div>' + MM.speciesName(d.el, t2) + ' 소울 <b>' + BAL().EQUIP_CRAFT_SOULS + '개</b> → <b>' + MM.equipName(d.el, t2) + '</b><br><span class="small">' + MM.ELEMENTS[d.el].name + ' 몬스터 체력·공격·방어 ' + pctBonus(BAL().EQUIP_BASE_PER_TIER * t2) + '</span>', '만들기', function () {
        var r = MM.craftEquip(S, d.el, t2);
        if (r.error) { toast(r.error); return; }
        save(); toast(MM.josa(MM.equipName(d.el, t2), '을', '를') + ' 만들었어요' + (MM.isEquipped(S, r.equip) ? ' · 장착했어요' : '')); render();
      });
    },
    equipEnhSheet: function (d) { equipEnhSheet(+d.id); },
    equipEnh: function (d) {
      var r = MM.enhanceEquip(S, +d.id);
      if (r.error) { toast(r.error); return; }
      save();
      if (r.success) { if (r.equip.plus >= 5) showNotice('✦ 강화 성공!', eqName(r.equip)); else toast('강화 성공! ' + eqName(r.equip)); }
      else toast('실패… 다음 성공률 ' + pct(r.nextRate));
      render(); equipEnhSheet(+d.id);
    },
    decompEquip: function (d) {
      var e = MM.getEquip(S, +d.id); if (!e) return;
      var v = MM.equipDecompValue(e);
      askConfirm('정말 분해할까요?', '<div style="text-align:center;margin-bottom:8px">' + equipSvg(e.el, e.tier, 48) + '</div><b>' + eqName(e) + '</b> 분해하면<br>' + MM.speciesName(e.el, e.tier) + ' 소울 <b>' + v.souls + '개</b>' + (v.gold ? ' + <b>' + fmt(v.gold) + ' G</b>' : '') + '를 받아요<br><span class="small" style="color:var(--bad)">되돌릴 수 없어요</span>', '분해', function () {
        var r = MM.decomposeEquip(S, e.id);
        save(); toast(r.error || ('소울 ' + r.souls + '개' + (r.gold ? ' + ' + fmt(r.gold) + ' G' : '') + '를 받았어요' + (r.wasted ? ' (' + r.wasted + '개 버려짐)' : ''))); render();
      });
    },
    monEnhSheet: function (d) { monEnhSheet(+d.id); },
    monEnh: function (d) {
      var r = MM.enhanceMonster(S, +d.id);
      if (r.error) { toast(r.error); return; }
      save();
      if (r.success) showNotice('✦ 몬스터 강화 성공!', name(r.monster) + ' +' + r.monster.plus);
      else toast('실패… 다음 성공률 ' + pct(r.nextRate));
      render(); monEnhSheet(+d.id);
    },
    feed: function (d) {
      var r = MM.feedSouls(S, +d.id, +d.tier, +d.n);
      if (r.error) { toast(r.error); return; }
      save();
      toast('소울 ' + r.used + '개 · EXP +' + fmt(r.exp) + (r.ups ? ' · Lv ' + r.before + ' → ' + r.level : ''));
      render();
      var m = MM.getMonster(S, +d.id);
      if (m && m.level < MM.maxLevel(m.tier)) feedSheet(m.id); else closeSheet();
    },
    summon: function (d) {
      closeSheet();
      var r = MM.summon(S, d.el, +d.tier); if (!r) return;
      if (S.party.length < 3) S.party.push(r.monster.id);
      save();
      var m = r.monster;
      successOverlay(m, { title: '소환!', sub: name(m) + ' Lv ' + m.level + (S.party.indexOf(m.id) >= 0 ? ' · 파티에 들어갔어요' : '') }, r.dex, '<button class="btn primary block" data-act="closeOverlay">확인</button>');
      render();
    },
    decompSoul: function (d) {
      var t = +d.tier, n = +d.n;
      askConfirm('정말 분해할까요?', MM.speciesName(d.el, t) + ' 소울 <b>' + n + '개</b> → ' + MM.speciesName(d.el, t - 1) + ' 소울 <b>' + n * BAL().DECOMPOSE_SOUL_SOULS + '개</b><br><span class="small" style="color:var(--bad)">되돌릴 수 없어요</span>', '분해', function () {
        var r = MM.decomposeSoul(S, d.el, t, n);
        save();
        toast(r.error || (MM.speciesName(d.el, t - 1) + ' 소울 ' + r.added + '개를 받았어요' + (r.wasted ? ' (' + r.wasted + '개 버려짐)' : '')));
        render();
      });
    },
    pickMainSheet: mainSheet,
    pickSubSheet: function () { if (!view.fusion.mainId) mainSheet(); else subSheet(); },
    pickMain: function (d) {
      var f = view.fusion; f.mainId = +d.id;
      var main = MM.getMonster(S, f.mainId), sub = f.subId && MM.getMonster(S, f.subId);
      if (!sub || !MM.isPair(main, sub)) f.subId = null;
      f.soulEl = null; closeSheet(); render();
      if (!f.subId) subSheet();
    },
    pickSub: function (d) { view.fusion.subId = +d.id; view.fusion.soulEl = null; closeSheet(); render(); },
    quickPair: function (d) { view.fusion = { mainId: +d.main, subId: +d.sub, soulEl: null }; render(); },
    soulEl: function (d) { view.fusion.soulEl = d.el; render(); },
    soulN: function (d) { var f = view.fusion; f.soulN = Math.max(1, Math.min(BAL().FUSION_SOUL_MAX, (f.soulN || 1) + +d.d)); render(); },
    fuse: function () { confirmFuse(); },
    retryFuse: function () { hideOverlay(); confirmFuse(); },
    confirmYes: function () { var f = pendingYes; pendingYes = null; closeSheet(); if (f) f(); },
    confirmNo: function () { pendingYes = null; closeSheet(); },
    closeOverlay: function (d) { hideOverlay(); if (d.tab) go(d.tab); else render(); },
    recOpen: function (d) { recordOverlay(+d.i); },
    recImage: function (d) { saveRecordImage(+d.i); },
    setting: function (d) { S.settings[d.k] = !S.settings[d.k]; save(); render(); },
    reset: function () {
      if (!confirm('모든 진행 상황을 지우고 처음부터 시작할까요?')) return;
      S = MM.newState(Date.now()); save();
      view.fusion = { mainId: null, subId: null, soulEl: null }; view.tut = { picks: [] };
      go('home'); showTutorial();
    },
    // 튜토리얼
    tutPick: function (d) { var p = view.tut.picks, i = p.indexOf(d.el); if (i >= 0) p.splice(i, 1); else if (p.length < 3) p.push(d.el); showTutorial(); },
    tutStart: function () { if (MM.tutorialPickStarters(S, view.tut.picks)) { save(); render(); showTutorial(); } },
    tutBattle: function () { hideOverlay(); startBattle('tutorial', {}); },
    tutNext: function () { S.tutorial.step = 3; save(); showTutorial(); },
    tutFourth: function (d) { MM.tutorialPickFourth(S, d.el); save(); render(); showTutorial(); },
    tutFuse: function () {
      var p = view.tut.pair; if (!p) return;
      var ms = { el: p.main.el, tier: 1 }, ss = { el: p.sub.el, tier: 1 };
      var r = MM.attemptFusion(S, p.main.id, p.sub.id, null, null, { force: true });
      MM.finishTutorial(S);
      if (S.party.length < 3) S.monsters.forEach(function (m) { if (S.party.length < 3 && S.party.indexOf(m.id) < 0) S.party.push(m.id); });
      save();
      document.body.classList.remove('in-tutorial');
      successOverlay(r.monster, { title: '합성 성공!', sub: name(r.monster) + ' 탄생 · Lv ' + r.monster.level }, r.dex,
        '<div class="muted small lh">이제 전투 탭에서 스테이지를 깨고 소울을 모아 보세요.<br>한 번 깬 스테이지는 자동 반복할 수 있어요.</div><button class="btn primary block" data-act="closeOverlay" data-tab="home">시작하기</button>', ms, ss);
      render();
    }
  };

  document.addEventListener('click', function (e) {
    var tabBtn = e.target.closest('#tabs button');
    if (tabBtn) { go(tabBtn.dataset.tab); return; }
    if (e.target.id === 'sheet') { closeSheet(); return; }
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var fn = ACTIONS[el.dataset.act];
    if (fn) fn(el.dataset);
  });
  document.addEventListener('visibilitychange', function () {
    save();
    if (document.visibilityState !== 'hidden' && view.tab === 'home' && $('sheet').hidden && $('overlay').hidden) render();
  });

  load();
  if (MM.migrateLevels(S) && S.tutorial.done) view.rescaled = true;
  if (MM.clampLevels(S)) view.clamped = true;
  if (S.tutorial.done) MM.accrueOffline(S, Date.now());
  // 테스트용: 주소 뒤 ?dev=refund-dungeon → 오늘 던전 횟수 1회 돌려주기 (시제품 전용)
  (function devHooks() {
    var q = new URLSearchParams(location.search).get('dev');
    if (!q) return;
    if (q === 'refund-dungeon') {
      MM.refreshDaily(S, Date.now());
      if (S.dungeon.used > 0) { S.dungeon.used--; save(); setTimeout(function () { toast('요일 던전 횟수를 1회 돌려드렸어요'); }, 300); }
      else setTimeout(function () { toast('돌려드릴 던전 횟수가 없어요'); }, 300);
    }
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  })();
  view.dungeonEls = S.dungeon.weekendEls || [];
  view.ticketEls = S.dungeon.ticketEls || [];
  render();
  if (!S.tutorial.done) showTutorial();
  else save();
  if (view.rescaled) setTimeout(function () { toast('레벨 개편: 최고 레벨 100, 모든 몬스터 레벨을 새 기준으로 바꿨어요'); }, 300);
  else if (view.clamped) setTimeout(function () { toast('단계별 최고 레벨이 생겨서 넘는 몬스터는 최고 레벨로 맞췄어요'); }, 400);
  if (view.migrated) toast('새 버전이라 처음부터 시작해요. 이전 기록은 따로 보관했어요');
  setInterval(function () { if (!S.tutorial.done) return; MM.accrueOffline(S, Date.now()); if (view.tab === 'home' && $('sheet').hidden && $('overlay').hidden && document.visibilityState !== 'hidden') render(); }, 30000);
  MM._state = function () { return S; };
  MM._view = function () { return view; };
})((typeof globalThis !== 'undefined' ? globalThis : window).MM);
