// 소리: 파일 없이 브라우저가 직접 만드는 8비트 효과음과 배경음악 (Web Audio)
// MM.Sound.play('hit') / MM.Sound.music('town'|'battle'|'boss'|null) / MM.Sound.set(효과음, 음악)
(function () {
  var MM = window.MM = window.MM || {};
  var ctx = null, master, sfxBus, musicBus, noiseBuf;
  var sfxOn = true, musicOn = true, want = null, track = null, step = 0, nextAt = 0, timer = null;

  function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function init() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  // 첫 터치에서 소리를 깨움 (폰 브라우저는 사용자가 누르기 전에는 소리를 막음)
  function unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume().then(syncMusic); else syncMusic();
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlock, { passive: true }); });
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') ctx.suspend(); else ctx.resume().then(syncMusic);
  });

  function tone(bus, f, t, dur, type, vol, f2) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(bus, t, dur, vol, cut) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = cut || 2000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
  }
  function arp(notes, t, gap, dur, type, vol) { notes.forEach(function (n, i) { tone(sfxBus, hz(n), t + i * gap, dur, type, vol); }); }

  var SFX = {
    tap: function (t) { tone(sfxBus, 900, t, 0.04, 'square', 0.025); },
    hit: function (t) { noise(sfxBus, t, 0.07, 0.10, 1600); tone(sfxBus, 240, t, 0.07, 'square', 0.04, 110); },
    crit: function (t) { noise(sfxBus, t, 0.12, 0.16, 3000); tone(sfxBus, 700, t, 0.14, 'square', 0.06, 200); },
    coin: function (t) { tone(sfxBus, hz(83), t, 0.05, 'square', 0.04); tone(sfxBus, hz(88), t + 0.05, 0.14, 'square', 0.04); },
    win: function (t) { arp([72, 76, 79, 84], t, 0.09, 0.12, 'square', 0.05); [72, 76, 79, 84].forEach(function (n) { tone(sfxBus, hz(n), t + 0.38, 0.5, 'triangle', 0.05); }); },
    lose: function (t) { arp([67, 65, 62, 60], t, 0.16, 0.22, 'triangle', 0.07); },
    chime: function (t) { tone(sfxBus, hz(81), t, 0.18, 'triangle', 0.07); tone(sfxBus, hz(88), t + 0.1, 0.35, 'triangle', 0.07); },
    soul: function (t) { arp([76, 80, 83, 88], t, 0.06, 0.18, 'triangle', 0.07); tone(sfxBus, hz(95), t + 0.26, 0.3, 'sine', 0.04); },
    rare: function (t) {
      tone(sfxBus, 200, t, 0.35, 'sawtooth', 0.03, 1200);
      arp([72, 76, 79, 84, 88, 91, 96], t + 0.3, 0.06, 0.2, 'square', 0.045);
      [84, 88, 91].forEach(function (n) { tone(sfxBus, hz(n), t + 0.75, 0.9, 'triangle', 0.06); });
    },
    summon: function (t) { arp([79, 83, 86, 91, 95], t, 0.05, 0.16, 'triangle', 0.06); [79, 83, 86].forEach(function (n) { tone(sfxBus, hz(n), t + 0.3, 0.6, 'triangle', 0.045); }); },
    // 합성: 두 마리가 모이는 동안 차오르는 소리 → 0.9초쯤 빛이 터질 때 팡파르 (화면 연출 시간에 맞춤)
    fuse: function (t) {
      tone(sfxBus, 160, t, 0.85, 'sawtooth', 0.025, 900);
      tone(sfxBus, 320, t + 0.3, 0.55, 'square', 0.015, 1400);
      noise(sfxBus, t + 0.88, 0.25, 0.12, 5000);
      SFX.rare(t + 0.6);
    },
    fail: function (t) { tone(sfxBus, 160, t, 0.85, 'sawtooth', 0.025, 700); noise(sfxBus, t + 0.85, 0.4, 0.08, 900); tone(sfxBus, 300, t + 0.85, 0.4, 'triangle', 0.06, 110); }
  };

  // ===== 배경음악: 8분음표 한 칸씩, 4마디 반복 (멜로디·베이스·북) =====
  var TRACKS = {
    town: { bpm: 96, lead: 'triangle', bass: 'square', vol: [0.05, 0.022], drum: false,
      mel: [76, 79, 84, 79, 76, 79, 74, 76, 72, 76, 81, 76, 72, 76, 71, 72, 69, 72, 77, 72, 69, 72, 76, 77, 79, 77, 76, 74, 71, 74, 67, null],
      root: [48, 45, 41, 43] },
    battle: { bpm: 148, lead: 'square', bass: 'triangle', vol: [0.03, 0.07], drum: true,
      mel: [69, 72, 76, 81, 79, 76, 72, 76, 65, 69, 72, 77, 76, 72, 69, 72, 67, 71, 74, 79, 77, 74, 71, 74, 76, 80, 83, 88, 86, 83, 80, 76],
      root: [45, 41, 43, 40] },
    boss: { bpm: 164, lead: 'square', bass: 'sawtooth', vol: [0.032, 0.03], drum: true,
      mel: [74, 74, 77, 74, 81, 79, 77, 76, 74, 74, 77, 74, 82, 81, 79, 77, 76, 76, 79, 76, 84, 82, 81, 79, 81, 79, 77, 76, 73, 76, 69, null],
      root: [38, 34, 36, 33] }
  };
  function playStep(tr, i, t) {
    var len = 60 / tr.bpm / 2, n = tr.mel[i];
    if (n != null) tone(musicBus, hz(n), t, len * 0.9, tr.lead, tr.vol[0]);
    var r = tr.root[Math.floor(i / 8)], b = tr.drum ? (i % 2 ? r + 12 : r) : (i % 4 === 0 ? r : i % 4 === 2 ? r + 7 : null);
    if (b != null) tone(musicBus, hz(b), t, len * (tr.drum ? 0.8 : 1.8), tr.bass, tr.vol[1]);
    if (tr.drum) {
      if (i % 4 === 0) tone(musicBus, 150, t, 0.12, 'sine', 0.22, 45);
      if (i % 4 === 2) noise(musicBus, t, 0.09, 0.09, 4000);
    }
  }
  function pump() {
    if (!track) return;
    var tr = TRACKS[track];
    while (nextAt < ctx.currentTime + 0.2) {
      playStep(tr, step, nextAt);
      nextAt += 60 / tr.bpm / 2;
      step = (step + 1) % tr.mel.length;
    }
  }
  function syncMusic() {
    if (!ctx || ctx.state !== 'running') return;
    var next = musicOn ? want : null;
    if (next === track) return;
    track = next; step = 0; nextAt = ctx.currentTime + 0.12;
    clearInterval(timer); timer = null;
    if (track) timer = setInterval(pump, 50);
  }

  MM.Sound = {
    play: function (name) {
      if (!sfxOn || !ctx || ctx.state !== 'running' || !SFX[name]) return;
      SFX[name](ctx.currentTime + 0.01);
    },
    music: function (name) { want = name || null; syncMusic(); },
    set: function (sfx, music) { sfxOn = sfx !== false; musicOn = music !== false; syncMusic(); }
  };
})();
