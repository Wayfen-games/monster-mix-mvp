// 화면. 규칙은 logic.js 에 있고, 여기서는 그리기와 입력만 다룬다.
(function (MM) {
  var SAVE_KEY = 'monster-mix-mvp-v1';
  var S = null;
  var view = {
    tab: 'home', monTab: 'list',
    fusion: { mainId: null, subId: null, soulEl: null },
    stage: null, battle: null, reward: null
  };
  var $ = function (id) { return document.getElementById(id); };

  // ---------------- 저장 ----------------
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) S = JSON.parse(raw);
    } catch (e) { S = null; }
    if (!S || S.version !== 1) S = MM.newState();
    S.settings = S.settings || { fastTest: false, autoBattle: false };
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }

  // ---------------- 공용 그리기 ----------------
  function polyPoints(n, cx, cy, r, rot, inner) {
    var pts = [], total = inner ? n * 2 : n;
    for (var i = 0; i < total; i++) {
      var rr = inner && i % 2 ? inner : r;
      var a = rot + i * Math.PI * 2 / total;
      pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }
  var SHAPES = {
    1: '<circle cx="50" cy="54" r="38"/>',
    2: '<polygon points="50,8 95,90 5,90" stroke-linejoin="round"/>',
    3: '<rect x="12" y="14" width="76" height="76" rx="12"/>',
    4: '<polygon points="' + polyPoints(5, 50, 54, 44, -Math.PI / 2) + '" stroke-linejoin="round"/>',
    5: '<polygon points="' + polyPoints(5, 50, 54, 48, -Math.PI / 2, 22) + '" stroke-linejoin="round"/>'
  };
  var EYE_Y = { 1: 52, 2: 66, 3: 50, 4: 54, 5: 56 };
  function monSvg(el, tier, size, sil) {
    var color = sil ? '#3a355f' : MM.ELEMENTS[el].color;
    var ey = EYE_Y[tier], eyes = sil ? '' :
      '<circle cx="40" cy="' + ey + '" r="7" fill="#fff"/><circle cx="60" cy="' + ey + '" r="7" fill="#fff"/>' +
      '<circle cx="41.5" cy="' + (ey + 1) + '" r="3.5" fill="#1b1830"/><circle cx="61.5" cy="' + (ey + 1) + '" r="3.5" fill="#1b1830"/>';
    return '<span class="mon"><svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100">' +
      '<g fill="' + color + '" stroke="rgba(0,0,0,.28)" stroke-width="4">' + SHAPES[tier] + '</g>' + eyes + '</svg></span>';
  }
  function elName(el) { return '<span style="color:' + MM.ELEMENTS[el].color + '">' + MM.ELEMENTS[el].name + '</span>'; }
  function name(m) { return MM.speciesName(m.el, m.tier); }
  function pct(x) { return Math.round(x * 1000) / 10 + '%'; }
  function fmt(n) { return n.toLocaleString('ko-KR'); }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function sortMons(list) {
    return list.slice().sort(function (a, b) {
      return b.tier - a.tier || MM.RING.indexOf(a.el) - MM.RING.indexOf(b.el) || b.level - a.level;
    });
  }
  function partyMons() { return S.party.map(function (id) { return MM.getMonster(S, id); }).filter(Boolean); }

  // ---------------- 탭 전환 ----------------
  function go(tab) {
    if (view.battle && view.battle.timer) clearTimeout(view.battle.timer);
    if (tab !== 'battle') view.battle = null;
    view.tab = tab;
    render();
    $('screen').scrollTop = 0;
  }

  function render() {
    $('gold').textContent = fmt(S.gold) + ' G';
    document.body.classList.toggle('in-battle', view.tab === 'battle');
    var tabFor = { stageDetail: 'stages', reward: 'stages', settings: 'home' };
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.classList.toggle('on', b.dataset.tab === (tabFor[view.tab] || view.tab));
    });
    var fn = SCREENS[view.tab] || SCREENS.home;
    $('screen').innerHTML = fn();
  }

  // ---------------- 마을 ----------------
  function goalCount() {
    return MM.RING.filter(function (el) { return S.dex[MM.speciesKey(el, 5)]; }).length;
  }
  function hint() {
    var mons = S.monsters;
    for (var i = 0; i < mons.length; i++) for (var j = 0; j < mons.length; j++) {
      if (MM.canFuse(mons[i], mons[j])) {
        var c = MM.fusionCost(mons[i], mons[j]);
        var soulOk = !c.soulTier || c.soulOptions.some(function (el) { return (S.souls[MM.speciesKey(el, c.soulTier)] || 0) > 0; });
        if (soulOk && S.gold >= c.gold) return '지금 합성할 수 있는 조합이 있어요: ' + name(mons[i]) + ' + ' + name(mons[j]);
      }
    }
    var ready = MM.ALL_SPECIES.filter(function (sp) { return MM.canSummon(S, sp.key); });
    if (ready.length) return '소환할 수 있는 소울이 있어요 (몬스터 → 소울)';
    var maxT = Math.max.apply(null, partyMons().map(function (m) { return m.tier; }).concat([1]));
    return maxT + '단계 스테이지에서 소울과 경험치를 모으세요. 레벨을 올리면 ' + Math.min(5, maxT + 1) + '단계 스테이지에 도전할 수 있어요.';
  }

  var SCREENS = {};
  SCREENS.home = function () {
    var g = goalCount();
    var stars = MM.RING.map(function (el) {
      var have = !!S.dex[MM.speciesKey(el, 5)];
      return '<div>' + monSvg(el, 5, 40, !have) + '<div>' + MM.ELEMENTS[el].name + '5</div></div>';
    }).join('');
    var slots = [0, 1, 2].map(function (i) {
      var m = MM.getMonster(S, S.party[i]);
      if (!m) return '<button class="slot empty" data-act="tab" data-tab="monsters">+ 비어 있음</button>';
      return '<button class="slot" data-act="tab" data-tab="monsters">' + monSvg(m.el, m.tier, 44) + '<div>' + name(m) + '</div><div class="muted small">Lv ' + m.level + '</div></button>';
    }).join('');
    var first = S.stats.fusionTries === 0 && S.stats.battlesWon === 0;
    return '<div class="card"><div class="row between"><b>1차 목표: 5단계 5종 모으기</b><span class="chip">' + g + ' / 5</span></div>' +
      '<div class="goal-stars">' + stars + '</div></div>' +
      (first ? '<div class="card"><b>처음이라면</b><div class="muted" style="margin-top:6px;line-height:1.6">① 합성 탭에서 불1 + 풀1을 합성해 보세요 (성공률 80%)<br>② 스테이지 탭 → 1단계에서 소울을 모으세요<br>③ 소울 10개면 몬스터 1마리를 소환할 수 있어요</div></div>' :
        '<div class="card"><b>다음 할 일</b><div class="muted" style="margin-top:6px">' + hint() + '</div></div>') +
      '<h3>파티 (최대 3마리)</h3><div class="party-slots">' + slots + '</div>' +
      '<div class="grid2" style="margin-top:14px"><button class="btn primary" data-act="tab" data-tab="stages">⚔ 스테이지</button><button class="btn primary" data-act="tab" data-tab="fusion">✦ 합성</button></div>' +
      '<h3>기록</h3><div class="card muted small" style="line-height:1.8">합성 ' + S.stats.fusionTries + '회 시도 · ' + S.stats.fusionSuccess + '회 성공<br>전투 ' + S.stats.battlesWon + '승 ' + S.stats.battlesLost + '패 · 몬스터 ' + S.monsters.length + '마리</div>' +
      '<button class="btn block" data-act="tab" data-tab="settings">⚙ 설정</button>';
  };

  // ---------------- 스테이지 ----------------
  SCREENS.stages = function () {
    var maxT = Math.max.apply(null, partyMons().map(function (m) { return m.tier; }).concat([1]));
    var challenge = Math.min(5, maxT + 1);
    var html = '<h2>스테이지</h2><div class="muted" style="margin-bottom:12px">n단계 스테이지는 (n-1)단계 3마리 파티로 깰 수 있는 난이도예요. 노란 테두리 = 지금 파티의 도전 단계</div>';
    html += '<div class="stage-grid"><div></div>' + [1, 2, 3, 4, 5].map(function (t) { return '<div class="head">' + t + '단계</div>'; }).join('');
    MM.RING.forEach(function (el) {
      html += '<div class="el">' + elName(el) + '</div>';
      for (var t = 1; t <= 5; t++) {
        var c = S.cleared[MM.speciesKey(el, t)] || 0;
        html += '<button class="stage-cell' + (c ? ' clear' : '') + (t === challenge ? ' rec' : '') + '" data-act="stage" data-el="' + el + '" data-tier="' + t + '">' +
          monSvg(el, t, 24) + '<span>' + (c ? '✓' + c : '') + '</span></button>';
      }
    });
    return html + '</div>';
  };

  function soulChances(el, tier) {
    var enemies = MM.stageEnemies(el, tier), b = MM.BALANCE;
    var mult = S.settings.fastTest ? b.FAST_TEST_DROP_MULT : 1, rolls = {};
    enemies.forEach(function (e) { for (var k = 1; k <= e.tier; k++) { var key = e.el + '|' + k; rolls[key] = (rolls[key] || 0) + 1; } });
    return Object.keys(rolls).map(function (key) {
      var p = key.split('|'), k = +p[1], rate = Math.min(1, b.DROP_RATES[k - 1] * mult);
      return { el: p[0], tier: k, chance: 1 - Math.pow(1 - rate, rolls[key]) };
    }).sort(function (a, b2) { return b2.tier - a.tier || b2.chance - a.chance; });
  }

  SCREENS.stageDetail = function () {
    var st = view.stage, enemies = MM.stageEnemies(st.el, st.tier);
    var party = partyMons();
    var html = '<button class="btn sm" data-act="tab" data-tab="stages">← 스테이지 목록</button>' +
      '<h2 style="margin-top:12px">' + elName(st.el) + ' ' + st.tier + '단계 스테이지</h2>' +
      '<div class="card"><div class="muted small">등장하는 적</div><div class="enemy-row">' +
      enemies.map(function (e) { return '<div>' + monSvg(e.el, e.tier, 52) + '<div>' + MM.speciesName(e.el, e.tier) + '</div><div class="muted small">Lv ' + e.level + '</div></div>'; }).join('') +
      '</div><div class="muted small">권장 파티: ' + (st.tier === 1 ? '1단계' : (st.tier - 1) + '단계') + ' 3마리' + (st.tier > 1 ? ', 레벨 7 이상' : '') + '</div></div>';
    html += '<div class="card"><div class="row between"><b>1판당 소울 드랍 확률</b>' + (S.settings.fastTest ? '<span class="chip">빠른 테스트 ×' + MM.BALANCE.FAST_TEST_DROP_MULT + '</span>' : '') + '</div>' +
      soulChances(st.el, st.tier).map(function (c) {
        return '<div class="cost-line"><span class="row">' + monSvg(c.el, c.tier, 20) + MM.speciesName(c.el, c.tier) + ' 소울</span><span>' + pct(c.chance) + '</span></div>';
      }).join('') + '<div class="cost-line"><span>골드</span><span>+' + MM.BALANCE.CLEAR_GOLD[st.tier - 1] + ' G</span></div></div>';
    html += '<div class="card"><div class="muted small" style="margin-bottom:8px">출전 파티</div><div class="row" style="justify-content:space-around">' +
      (party.length ? party.map(function (m) { return '<div style="text-align:center">' + monSvg(m.el, m.tier, 40) + '<div class="small">' + name(m) + ' Lv' + m.level + '</div></div>'; }).join('') : '<span class="muted">파티가 비어 있어요</span>') +
      '</div></div>';
    html += '<button class="btn primary block" data-act="startBattle"' + (party.length ? '' : ' disabled') + '>출전</button>';
    return html;
  };

  // ---------------- 전투 ----------------
  function startBattle() {
    var party = partyMons();
    if (!party.length) { toast('파티에 몬스터를 넣어 주세요'); return; }
    var bt = MM.createBattle(party, MM.stageEnemies(view.stage.el, view.stage.tier));
    view.battle = { bt: bt, el: view.stage.el, tier: view.stage.tier, auto: !!S.settings.autoBattle, timer: null, last: null, busy: false };
    view.tab = 'battle';
    render();
    battleTick();
  }

  function unitHtml(u, bt, actor, pickable) {
    var r = u.hp / u.maxHp;
    var cls = 'unit ' + (u.side === 'e' ? 'enemy' : 'ally') + (u.hp <= 0 ? ' dead' : '') + (actor && actor.uid === u.uid ? ' turn' : '') + (pickable && u.hp > 0 ? ' pickable' : '');
    return '<div class="' + cls + '" id="u' + u.uid + '"' + (pickable && u.hp > 0 ? ' data-act="hit" data-uid="' + u.uid + '"' : '') + '>' +
      monSvg(u.el, u.tier, 50) + '<div class="nm">' + u.name + '</div><div class="lv">Lv ' + u.level + '</div>' +
      '<div class="hpbar"><i style="width:' + Math.max(0, r * 100) + '%"' + (r < 0.3 ? ' class="low"' : '') + '></i></div>' +
      '<div class="hpnum">' + u.hp + ' / ' + u.maxHp + '</div></div>';
  }

  SCREENS.battle = function () {
    var B = view.battle; if (!B) return SCREENS.stages();
    var bt = B.bt, actor = bt.result ? null : MM.currentActor(bt);
    var myTurn = actor && actor.side === 'p' && !B.auto && !B.busy;
    var msg = '', sub = '';
    if (bt.result === 'win') msg = '승리!';
    else if (bt.result === 'lose') msg = '패배…';
    else if (myTurn) { msg = actor.name + '의 차례'; sub = '공격할 적을 누르세요'; }
    else if (actor) msg = (actor.side === 'e' ? '적 ' : '') + actor.name + '의 공격';
    if (B.last && !myTurn) {
      var a = bt.units[B.last.actor], t = bt.units[B.last.target];
      sub = a.name + ' → ' + t.name + ' ' + B.last.dmg + ' 피해' + (B.last.mult > 1 ? ' · 효과가 좋다!' : B.last.mult < 1 ? ' · 효과가 별로…' : '') + (B.last.ko ? ' · 쓰러뜨림' : '');
    }
    return '<div class="battle">' +
      '<div class="row between"><span class="muted small">' + elName(B.el) + ' ' + B.tier + '단계 · ' + bt.round + '라운드</span><button class="btn sm" data-act="flee">나가기</button></div>' +
      '<div class="side">' + bt.units.filter(function (u) { return u.side === 'e'; }).map(function (u) { return unitHtml(u, bt, actor, myTurn); }).join('') + '</div>' +
      '<div class="battle-mid"><div class="msg">' + msg + '</div><div class="muted small">' + sub + '</div></div>' +
      '<div class="side">' + bt.units.filter(function (u) { return u.side === 'p'; }).map(function (u) { return unitHtml(u, bt, actor, false); }).join('') + '</div>' +
      '<div class="battle-bar"><button class="btn toggle' + (B.auto ? ' on' : '') + '" data-act="auto">자동 ' + (B.auto ? 'ON' : 'OFF') + '</button></div>' +
      '</div>';
  };

  function battleTick() {
    var B = view.battle; if (!B || view.tab !== 'battle') return;
    var bt = B.bt;
    if (bt.result) { B.timer = setTimeout(finishBattle, 700); return; }
    var actor = MM.currentActor(bt);
    if (bt.result) { render(); B.timer = setTimeout(finishBattle, 700); return; }
    if (actor.side === 'e' || B.auto) {
      B.busy = true; render();
      B.timer = setTimeout(function () { doAct(null); }, B.auto ? 260 : 520);
    } else {
      B.busy = false; render();
    }
  }

  function doAct(targetUid) {
    var B = view.battle; if (!B) return;
    var ev = MM.act(B.bt, targetUid);
    B.last = ev; B.busy = true; // 다음 틱 전까지 입력 막기
    render();
    if (ev) {
      var node = $('u' + ev.target);
      if (node) {
        node.classList.add('hit');
        var d = document.createElement('div');
        d.className = 'dmg' + (ev.mult > 1 ? ' adv' : ev.mult < 1 ? ' dis' : '');
        d.textContent = '-' + ev.dmg;
        node.appendChild(d);
      }
    }
    B.timer = setTimeout(battleTick, B.auto ? 220 : 380);
  }

  function finishBattle() {
    var B = view.battle; if (!B) return;
    if (B.bt.result === 'win') {
      var rw = MM.grantWin(S, B.el, B.tier);
      view.reward = { win: true, el: B.el, tier: B.tier, r: rw };
    } else {
      S.stats.battlesLost++;
      view.reward = { win: false, el: B.el, tier: B.tier };
    }
    save();
    view.battle = null; view.tab = 'reward';
    render();
  }

  // ---------------- 보상 ----------------
  SCREENS.reward = function () {
    var R = view.reward; if (!R) return SCREENS.stages();
    var html = '<div class="reward-title ' + (R.win ? 'win' : 'lose') + '">' + (R.win ? '클리어!' : '패배…') + '</div>' +
      '<div class="muted" style="text-align:center;margin-bottom:14px">' + elName(R.el) + ' ' + R.tier + '단계 스테이지</div>';
    if (R.win) {
      var keys = Object.keys(R.r.drops);
      html += '<div class="card"><b>얻은 소울</b><div class="soul-list" style="margin-top:10px">' +
        (keys.length ? keys.map(function (k) {
          var el = k.replace(/\d/, ''), t = +k.slice(-1);
          return '<div class="soul-item' + (t >= 2 ? ' rare' : '') + '">' + monSvg(el, t, 24) + MM.speciesName(el, t) + ' ×' + R.r.drops[k] +
            ' <span class="muted small">(' + (S.souls[k] || 0) + '/10)</span></div>';
        }).join('') : '<span class="muted">이번에는 소울이 나오지 않았어요</span>') + '</div></div>';
      html += '<div class="card"><div class="cost-line" style="border:0"><span>골드</span><span>+' + R.r.gold + ' G</span></div>' +
        '<div class="cost-line"><span>경험치 (파티 전원)</span><span>+' + R.r.exp + '</span></div>' +
        R.r.levelUps.map(function (u) { return '<div class="cost-line"><span>레벨 업!</span><span>' + u.name + ' → Lv ' + u.level + '</span></div>'; }).join('') + '</div>';
      var ready = MM.ALL_SPECIES.filter(function (sp) { return MM.canSummon(S, sp.key); });
      if (ready.length) html += '<button class="btn block" style="margin-bottom:10px;border-color:var(--accent)" data-act="tab" data-tab="monsters" data-mon="souls">★ 소환할 수 있는 소울이 있어요</button>';
    } else {
      html += '<div class="card muted">잃은 것은 없어요. 레벨을 올리거나 한 단계 낮은 스테이지에서 파티를 키워 보세요.</div>';
    }
    html += '<button class="btn primary block" data-act="again">다시 도전</button>' +
      '<div class="grid2" style="margin-top:10px"><button class="btn" data-act="tab" data-tab="stages">스테이지 목록</button><button class="btn" data-act="tab" data-tab="fusion">합성하러</button></div>';
    return html;
  };

  // ---------------- 몬스터 ----------------
  SCREENS.monsters = function () {
    var html = '<div class="seg"><button class="' + (view.monTab === 'list' ? 'on' : '') + '" data-act="montab" data-v="list">몬스터 ' + S.monsters.length + '</button>' +
      '<button class="' + (view.monTab === 'souls' ? 'on' : '') + '" data-act="montab" data-v="souls">소울</button></div>';
    if (view.monTab === 'list') {
      html += '<div class="muted small" style="margin-bottom:10px">파티 ' + S.party.length + '/3 · 버튼으로 파티에 넣고 빼요</div>';
      html += sortMons(S.monsters).map(function (m) {
        var inParty = S.party.indexOf(m.id) >= 0, maxed = m.level >= MM.BALANCE.MAX_LEVEL;
        var st = MM.calcStats(m.el, m.tier, m.level);
        return '<div class="mon-row">' + monSvg(m.el, m.tier, 44) + '<div class="info"><div class="row" style="gap:6px"><span class="nm">' + name(m) + '</span><span class="muted small">Lv ' + m.level + (maxed ? ' (최대)' : '') + '</span>' +
          (inParty ? '<span class="chip party">파티</span>' : '') + (m.stack ? '<span class="chip stack">스택 ' + m.stack + '</span>' : '') + '</div>' +
          '<div class="muted small">체력 ' + st.hp + ' · 공격 ' + st.atk + ' · 방어 ' + st.def + '</div>' +
          '<div class="expbar"><i style="width:' + (maxed ? 100 : m.exp / MM.expToNext(m.level) * 100) + '%"></i></div></div>' +
          '<button class="btn sm" data-act="party" data-id="' + m.id + '">' + (inParty ? '빼기' : '넣기') + '</button></div>';
      }).join('');
    } else {
      html += '<div class="muted small" style="margin-bottom:10px">같은 종 소울 ' + MM.BALANCE.SOULS_PER_SUMMON + '개 = 몬스터 1마리. 노란 칸을 누르면 소환해요.</div>';
      html += '<div class="soul-grid"><div></div>' + [1, 2, 3, 4, 5].map(function (t) { return '<div class="muted small" style="text-align:center">' + t + '단계</div>'; }).join('');
      MM.RING.forEach(function (el) {
        html += '<div class="el" style="font-weight:700;font-size:13px">' + elName(el) + '</div>';
        for (var t = 1; t <= 5; t++) {
          var key = MM.speciesKey(el, t), n = S.souls[key] || 0, ready = MM.canSummon(S, key);
          html += '<div class="soul-cell' + (ready ? ' ready' : '') + '"' + (ready ? ' data-act="summon" data-el="' + el + '" data-tier="' + t + '"' : '') + '><b>' + n + '</b>' + (ready ? '소환!' : '/' + MM.BALANCE.SOULS_PER_SUMMON) + '</div>';
        }
      });
      html += '</div>';
    }
    return html;
  };

  // ---------------- 합성 ----------------
  function fusionSel() {
    var f = view.fusion;
    var main = f.mainId && MM.getMonster(S, f.mainId), sub = f.subId && MM.getMonster(S, f.subId);
    if (!main) { f.mainId = null; f.subId = null; main = null; sub = null; }
    if (sub && !MM.canFuse(main, sub)) { f.subId = null; sub = null; }
    return { main: main, sub: sub };
  }
  function subsFor(main) { return sortMons(S.monsters.filter(function (m) { return MM.canFuse(main, m); })); }

  function fuseSlot(m, label) {
    if (!m) return '<div class="fuse-slot empty">' + label + '</div>';
    return '<div class="fuse-slot">' + monSvg(m.el, m.tier, 46) + '<div>' + name(m) + '</div>' + (m.stack ? '<span class="chip stack">스택 ' + m.stack + '</span>' : '<span class="muted small">Lv ' + m.level + '</span>') + '</div>';
  }

  SCREENS.fusion = function () {
    var sel = fusionSel(), main = sel.main, sub = sel.sub, f = view.fusion;
    var resultSlot = main ? '<div class="fuse-slot">' + monSvg(main.el, main.tier + 1, 46, !S.dex[MM.speciesKey(main.el, main.tier + 1)]) + '<div>' + MM.speciesName(main.el, main.tier + 1) + '</div>' +
      (!S.dex[MM.speciesKey(main.el, main.tier + 1)] ? '<span class="chip">미발견</span>' : '') + '</div>' : '<div class="fuse-slot empty">결과</div>';
    var html = '<h2>합성</h2><div class="fuse-box">' + fuseSlot(main, '주재료') + '<div class="fuse-op">+</div>' + fuseSlot(sub, '부재료') + '<div class="fuse-op">=</div>' + resultSlot + '</div>';

    if (!main) {
      var cands = sortMons(S.monsters.filter(MM.canBeMain));
      html += '<h3>주재료 고르기 · 결과 속성은 주재료를 따라요</h3><div class="pick-list">' + (cands.length ? cands.map(function (m) {
        var n = subsFor(m).length;
        return '<button class="pick" data-act="pickMain" data-id="' + m.id + '">' + monSvg(m.el, m.tier, 36) + '<div style="flex:1"><b>' + name(m) + '</b> <span class="muted small">Lv ' + m.level + '</span>' + (m.stack ? ' <span class="chip stack">스택 ' + m.stack + '</span>' : '') +
          '<div class="muted small">부재료 가능 ' + n + '마리 · 기본 성공률 ' + pct(MM.successRate(m.tier, m.stack)) + '</div></div></button>';
      }).join('') : '<div class="muted">합성할 몬스터가 없어요</div>') + '</div>';
      html += '<div class="card muted small" style="margin-top:12px;line-height:1.7">규칙: 1단계+1단계 = 2단계 · n단계 + (n-1)단계 = (n+1)단계<br>부재료는 같은 속성이거나 원형 이웃 속성 (불-풀-물-빛-어둠-불)<br>실패해도 재료는 남고, 주재료의 성공률이 점점 올라가요.</div>';
      return html;
    }

    var p = MM.partnersOf(main.el), subTier = MM.subTierFor(main.tier);
    if (!sub) {
      var subs = subsFor(main);
      html += '<h3>부재료 고르기 · ' + subTier + '단계 ' + [main.el].concat(p).map(function (e) { return MM.ELEMENTS[e].name; }).join('/') + '</h3>';
      html += subs.length ? '<div class="pick-list">' + subs.map(function (m) {
        return '<button class="pick" data-act="pickSub" data-id="' + m.id + '">' + monSvg(m.el, m.tier, 36) + '<div style="flex:1"><b>' + name(m) + '</b> <span class="muted small">Lv ' + m.level + '</span>' + (S.party.indexOf(m.id) >= 0 ? ' <span class="chip party">파티</span>' : '') + '</div></button>';
      }).join('') + '</div>' : '<div class="card muted">부재료로 쓸 수 있는 몬스터가 없어요.<br>' + subTier + '단계 ' + [main.el].concat(p).map(function (e) { return MM.ELEMENTS[e].name; }).join('·') + ' 몬스터가 필요해요. 스테이지에서 소울을 모아 소환해 보세요.</div>';
      html += '<button class="btn block" style="margin-top:12px" data-act="resetFusion">주재료 다시 고르기</button>';
      return html;
    }

    var cost = MM.fusionCost(main, sub);
    if (cost.soulTier && cost.soulOptions.indexOf(f.soulEl) < 0) {
      // 가진 소울이 많은 쪽을 기본 선택
      f.soulEl = cost.soulOptions.slice().sort(function (a, b) { return (S.souls[MM.speciesKey(b, cost.soulTier)] || 0) - (S.souls[MM.speciesKey(a, cost.soulTier)] || 0); })[0];
    }
    var rate = MM.successRate(main.tier, main.stack), next = MM.successRate(main.tier, main.stack + 1);
    var goldOk = S.gold >= cost.gold, soulKey = cost.soulTier ? MM.speciesKey(f.soulEl, cost.soulTier) : null;
    var soulHave = soulKey ? (S.souls[soulKey] || 0) : 0, soulOk = !soulKey || soulHave > 0;
    var meter = '';
    for (var i = 1; i <= MM.BALANCE.STACK_GUARANTEE; i++) meter += '<i class="' + (i <= main.stack ? 'on' : '') + '"></i>';
    html += '<div class="card" style="margin-top:14px"><div class="rate-big">' + pct(rate) + '</div>' +
      '<div class="rate-sub">성공률' + (main.stack ? ' (기본 ' + pct(MM.BALANCE.BASE_SUCCESS[main.tier - 1]) + ' + 실패 스택 ' + main.stack + ')' : '') + '</div>' +
      '<div class="stack-meter">' + meter + '</div>' +
      '<div class="rate-sub">' + (rate >= 1 ? '이번엔 반드시 성공해요' : '실패해도 재료는 그대로 · 실패하면 다음 시도 <b style="color:var(--text)">' + pct(next) + '</b>') + '</div></div>';
    html += '<div class="card"><b>비용</b><div class="cost-line" style="border:0;margin-top:6px"><span>골드</span><span class="' + (goldOk ? '' : 'lack') + '">' + fmt(cost.gold) + ' G (보유 ' + fmt(S.gold) + ')</span></div>';
    if (cost.soulTier) {
      html += '<div class="cost-line"><span>' + cost.soulTier + '단계 소울 1개</span><span class="' + (soulOk ? '' : 'lack') + '">보유 ' + soulHave + '</span></div>';
      if (cost.soulOptions.length > 1) html += '<div class="soul-choice">' + cost.soulOptions.map(function (el) {
        return '<button class="' + (el === f.soulEl ? 'on' : '') + '" data-act="soulEl" data-el="' + el + '">' + MM.speciesName(el, cost.soulTier) + ' 소울 (' + (S.souls[MM.speciesKey(el, cost.soulTier)] || 0) + ')</button>';
      }).join('') + '</div>';
    }
    html += '</div>';
    var why = !goldOk ? '골드가 부족해요' : !soulOk ? MM.speciesName(f.soulEl, cost.soulTier) + ' 소울이 필요해요' : '';
    html += '<button class="btn primary block" data-act="fuse"' + (why ? ' disabled' : '') + '>' + (why || '합성 시도') + '</button>' +
      '<div class="grid2" style="margin-top:10px"><button class="btn" data-act="clearSub">부재료 바꾸기</button><button class="btn" data-act="resetFusion">처음부터</button></div>';
    return html;
  };

  function sparks(n) {
    var cols = ['#ffcf4a', '#ff8a5c', '#8f7cff', '#5fd38d', '#fff'], s = '';
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 90;
      s += '<i class="spark" style="background:' + cols[i % cols.length] + ';--dx:' + Math.round(Math.cos(a) * d) + 'px;--dy:' + Math.round(Math.sin(a) * d) + 'px;animation-delay:' + (0.9 + Math.random() * 0.15).toFixed(2) + 's"></i>';
    }
    return s;
  }

  function showOverlay(html) { var o = $('overlay'); o.innerHTML = html; o.hidden = false; }
  function hideOverlay() { $('overlay').hidden = true; $('overlay').innerHTML = ''; }

  function doFuse() {
    var sel = fusionSel(); if (!sel.main || !sel.sub) return;
    var mainSnap = { el: sel.main.el, tier: sel.main.tier }, subSnap = { el: sel.sub.el, tier: sel.sub.tier };
    var res = MM.attemptFusion(S, sel.main.id, sel.sub.id, view.fusion.soulEl);
    if (res.error) { toast(res.error); render(); return; }
    save();
    var charge = '<div class="charge">' + monSvg(mainSnap.el, mainSnap.tier, 64) + monSvg(subSnap.el, subSnap.tier, 64) + '</div>';
    if (res.success) {
      var m = res.monster;
      view.fusion = { mainId: null, subId: null, soulEl: null };
      showOverlay('<div class="result ok"><div class="stage-anim">' + charge + '<div class="rays reveal"></div><div class="flash"></div>' + sparks(18) +
        '<div class="pop">' + monSvg(m.el, m.tier, 130) + '</div></div>' +
        '<div class="reveal"><div class="big ok">합성 성공!</div><div class="sub">' + name(m) + ' 탄생 · 성공률 ' + pct(res.rate) + (res.spentStack ? ' · 실패 ' + res.spentStack + '번 끝에' : '') + '</div>' +
        (res.isNewSpecies ? '<div class="new">도감 새 등록!</div>' : '') +
        '<div class="acts"><button class="btn primary block" data-act="closeOverlay" data-tab="fusion">계속 합성</button><button class="btn block" data-act="closeOverlay" data-tab="monsters">몬스터 보기</button></div></div></div>');
    } else {
      var main = MM.getMonster(S, view.fusion.mainId), sub = MM.getMonster(S, view.fusion.subId);
      var cost = MM.fusionCost(main, sub), soulKey = cost.soulTier ? MM.speciesKey(view.fusion.soulEl, cost.soulTier) : null;
      var canRetry = S.gold >= cost.gold && (!soulKey || (S.souls[soulKey] || 0) > 0);
      showOverlay('<div class="result fail"><div class="stage-anim">' + charge + '<div class="fizzle">💨</div><div class="reveal">' + monSvg(mainSnap.el, mainSnap.tier, 90) + '</div></div>' +
        '<div class="reveal"><div class="big no">실패…</div><div class="sub">재료는 그대로 남았어요</div>' +
        '<div class="sub">실패 스택 ' + res.stack + ' → 다음 성공률 <b style="color:var(--accent);font-size:20px">' + pct(res.nextRate) + '</b></div>' +
        '<div class="acts">' + (canRetry ? '<button class="btn primary block" data-act="retryFuse">한 번 더 (' + fmt(cost.gold) + ' G' + (soulKey ? ' + 소울 1' : '') + ')</button>' : '<div class="muted small">다시 하려면 ' + (S.gold < cost.gold ? '골드' : '소울') + '가 더 필요해요</div>') +
        '<button class="btn block" data-act="closeOverlay" data-tab="fusion">그만하기</button></div></div></div>');
    }
    render();
  }

  // ---------------- 도감 ----------------
  SCREENS.dex = function () {
    var have = MM.ALL_SPECIES.filter(function (sp) { return S.dex[sp.key]; }).length, g = goalCount();
    var html = '<h2>도감</h2><div class="card"><div class="row between"><b>수집률</b><span>' + have + ' / 25</span></div><div class="progress"><i style="width:' + have / 25 * 100 + '%"></i></div>' +
      '<div class="row between" style="margin-top:12px"><b>1차 목표 · 5단계 5종</b><span style="color:var(--accent)">' + g + ' / 5</span></div><div class="progress"><i style="width:' + g / 5 * 100 + '%"></i></div></div>';
    html += '<div class="dex-grid"><div></div>' + [1, 2, 3, 4, 5].map(function (t) { return '<div class="muted small" style="text-align:center">' + t + '단계' + (t === 5 ? ' ★' : '') + '</div>'; }).join('');
    MM.RING.forEach(function (el) {
      html += '<div style="font-weight:700;font-size:13px">' + elName(el) + '</div>';
      for (var t = 1; t <= 5; t++) {
        var got = !!S.dex[MM.speciesKey(el, t)];
        html += '<div class="dex-cell' + (t === 5 ? ' goal' : '') + (t === 5 && got ? ' have' : '') + '">' + monSvg(el, t, 34, !got) + '</div>';
      }
    });
    return html + '</div><div class="muted small" style="margin-top:12px">한 번이라도 가졌던 종은 도감에 남아요.</div>';
  };

  // ---------------- 설정 ----------------
  SCREENS.settings = function () {
    return '<button class="btn sm" data-act="tab" data-tab="home">← 마을</button><h2 style="margin-top:12px">설정</h2>' +
      '<div class="card"><div class="switch-row"><div><b>빠른 테스트</b><div class="muted small">소울 드랍률 ×' + MM.BALANCE.FAST_TEST_DROP_MULT + '. 10분 체험용이에요. 실제 템포를 보려면 꺼 두세요.</div></div><button class="switch' + (S.settings.fastTest ? ' on' : '') + '" data-act="setting" data-k="fastTest"></button></div></div>' +
      '<div class="card"><div class="switch-row"><div><b>전투 시작 시 자동</b><div class="muted small">켜 두면 전투가 처음부터 자동으로 진행돼요.</div></div><button class="switch' + (S.settings.autoBattle ? ' on' : '') + '" data-act="setting" data-k="autoBattle"></button></div></div>' +
      '<div class="card"><b>데이터</b><div class="muted small" style="margin:6px 0 10px">진행 상황은 이 브라우저에 자동 저장돼요.</div><button class="btn block" style="color:var(--bad)" data-act="reset">데이터 초기화</button></div>' +
      '<a class="btn block" href="test.html" style="text-decoration:none">규칙 테스트 결과 보기</a>';
  };

  // ---------------- 입력 ----------------
  var ACTIONS = {
    tab: function (d) { if (d.mon) view.monTab = d.mon; go(d.tab); },
    stage: function (d) { view.stage = { el: d.el, tier: +d.tier }; go('stageDetail'); },
    startBattle: startBattle,
    again: function () { if (view.reward) { view.stage = { el: view.reward.el, tier: view.reward.tier }; startBattle(); } },
    hit: function (d) {
      var B = view.battle; if (!B || B.busy) return;
      var actor = MM.currentActor(B.bt);
      if (!actor || actor.side !== 'p') return;
      B.busy = true; doAct(+d.uid);
    },
    auto: function () {
      var B = view.battle; if (!B) return;
      B.auto = !B.auto;
      clearTimeout(B.timer); B.busy = false; battleTick();
    },
    flee: function () { if (confirm('나가면 이번 판 보상은 없어요. 나갈까요?')) go('stageDetail'); },
    montab: function (d) { view.monTab = d.v; render(); },
    party: function (d) {
      var id = +d.id, i = S.party.indexOf(id);
      if (i >= 0) S.party.splice(i, 1);
      else if (S.party.length >= 3) { toast('파티는 최대 3마리예요. 먼저 한 마리를 빼 주세요'); return; }
      else S.party.push(id);
      save(); render();
    },
    summon: function (d) {
      var r = MM.summon(S, d.el, +d.tier); if (!r) return;
      if (S.party.length < 3) S.party.push(r.monster.id);
      save();
      var m = r.monster;
      showOverlay('<div class="result ok"><div class="stage-anim"><div class="rays"></div>' + sparks(12).replace(/animation-delay:[^"]+/g, 'animation-delay:0s') +
        '<div class="pop" style="animation-delay:0s">' + monSvg(m.el, m.tier, 120) + '</div></div><div class="big ok">소환!</div><div class="sub">' + name(m) + (S.party.indexOf(m.id) >= 0 ? ' · 파티에 들어갔어요' : '') + '</div>' +
        (r.isNewSpecies ? '<div class="new">도감 새 등록!</div>' : '') + '<div class="acts"><button class="btn primary block" data-act="closeOverlay">확인</button></div></div>');
      render();
    },
    pickMain: function (d) { view.fusion = { mainId: +d.id, subId: null, soulEl: null }; render(); },
    pickSub: function (d) { view.fusion.subId = +d.id; view.fusion.soulEl = null; render(); },
    clearSub: function () { view.fusion.subId = null; render(); },
    resetFusion: function () { view.fusion = { mainId: null, subId: null, soulEl: null }; render(); },
    soulEl: function (d) { view.fusion.soulEl = d.el; render(); },
    fuse: doFuse,
    retryFuse: function () { hideOverlay(); doFuse(); },
    closeOverlay: function (d) { hideOverlay(); if (d.tab) go(d.tab); else render(); },
    setting: function (d) { S.settings[d.k] = !S.settings[d.k]; save(); render(); },
    reset: function () {
      if (!confirm('모든 진행 상황을 지우고 처음부터 시작할까요?')) return;
      S = MM.newState(); save();
      view.fusion = { mainId: null, subId: null, soulEl: null };
      toast('초기화했어요'); go('home');
    }
  };

  document.addEventListener('click', function (e) {
    var tabBtn = e.target.closest('#tabs button');
    if (tabBtn) { go(tabBtn.dataset.tab); return; }
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = ACTIONS[el.dataset.act];
    if (fn) fn(el.dataset);
  });

  load();
  render();
  // 콘솔에서 확인할 수 있게 (디버그)
  MM._state = function () { return S; };
})((typeof globalThis !== 'undefined' ? globalThis : window).MM);
