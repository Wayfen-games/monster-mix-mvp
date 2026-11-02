// 폰 크기 가상 브라우저(Playwright)로 화면을 눌러 보는 점검 스크립트. 사용: NODE_PATH=$(npm root -g) OUT=스크린샷폴더 node tools/ui/raid-flow.js
// 끝에 'errors []'면 화면 오류 없음.
const { chromium } = require('playwright');
const MM = require(require('path').join(__dirname, '..', 'load'));
const OUT = process.env.OUT || '/tmp/shardlings-shots'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const s = MM.newState(Date.now()); s.levelScale = 4; s.boundV = 1;
  MM.tutorialPickStarters(s, ['fire', 'water', 'grass']); MM.tutorialBattleReward(s);
  MM.tutorialPickFourth(s, MM.tutorialFourthOptions(s)[0]); MM.finishTutorial(s);
  MM.RING.forEach(el => MM.addMonster(s, el, 5, 62)); MM.addRaidTickets(s, 1, 2); MM.addItem(s, 'rainbowSoul', 4); MM.addItem(s, 'feather', 2);
  const e = { id: s.nextId++, el: 'rainbow', tier: 5, plus: 3, stack: 0 }; s.equips.push(e); s.equipped.rainbow = e.id;
  MM.addTickets(s, 2, 5); s.dungeon.ticketCleared = { 2: true }; s.dungeon.ticketEls = ['fire', 'water', 'grass']; MM.addBossTickets(s, 3, 2);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  p.on('dialog', d => d.accept());
  await p.addInitScript(st => { if (!sessionStorage.getItem('x')) { localStorage.setItem('monster-mix-mvp-v1', st); sessionStorage.setItem('x', 1); } }, JSON.stringify(s));
  await p.goto('file://' + require('path').join(__dirname, '..', '..', 'index.html')); await p.waitForTimeout(700);
  const c = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.click(); }, sel);
  const shot = async n => { await p.waitForTimeout(350); await p.screenshot({ path: OUT + '/' + n + '.png', fullPage: n.endsWith('F') }); };
  const winPhase = async () => { await p.evaluate(() => { const bt = MM._view().battle.bt; bt.units.filter(u => u.side === 'e').forEach(u => { u.hp = 1; u.def = 0; }); bt.units.filter(u => u.side === 'p').forEach(u => { u.hp = u.maxHp = 1e6; }); });
    for (let i = 0; i < 60; i++) { const st = await p.evaluate(() => { const v = MM._view(); if (!v.battle) return 'done'; const b = document.querySelector('[data-act="bossAct"][data-a="attack"]:not([disabled])'); if (b) b.click(); return 'go'; }); if (st === 'done') break; await p.waitForTimeout(250); }
    await p.waitForTimeout(800); };
  await c('#tabs [data-tab="bag"]'); await shot('1bag');
  await c('[data-act="bagSeg"][data-v="equip"]'); await shot('2equipF');
  await c('[data-act="equipEnhSheet"][data-id="' + e.id + '"]'); await shot('3rbenh');
  await p.evaluate(() => document.getElementById('sheet').click());
  await c('#tabs [data-tab="stages"]'); await c('[data-act="stageSeg"][data-v="ticket"]'); await shot('4ticketF');
  await c('[data-act="sweepTicket"][data-tier="2"][data-n="5"]'); await shot('5sweep');
  await c('#tabs [data-tab="stages"]'); await c('[data-act="stageSeg"][data-v="raid"]'); await shot('6raidF');
  await c('[data-act="startRaid"][data-tier="1"]'); await shot('7raidbattle');
  // 페이즈 강제 승리
  await winPhase(); await shot('8phase1');
  await c('[data-act="startRaid"][data-tier="1"]'); await p.waitForTimeout(400);
  await winPhase();
  await c('[data-act="startRaid"][data-tier="1"]'); await p.waitForTimeout(400); await shot('9phase3');
  await winPhase(); await p.waitForTimeout(800); await shot('10raidclearF');
  console.log('errors', errs, await p.evaluate(() => JSON.stringify(MM._state().raid)));
  await b.close();
})();
