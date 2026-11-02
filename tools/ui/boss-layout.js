// 폰 크기 가상 브라우저(Playwright)로 화면을 눌러 보는 점검 스크립트. 사용: NODE_PATH=$(npm root -g) OUT=스크린샷폴더 node tools/ui/boss-layout.js
// 끝에 'errors []'면 화면 오류 없음.
const { chromium } = require('playwright');
const MM = require(require('path').join(__dirname, '..', 'load'));
const OUT = process.env.OUT || '/tmp/shardlings-shots'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const s = MM.newState(Date.now()); s.levelScale = 3;
  MM.tutorialPickStarters(s, ['fire', 'water', 'grass']); MM.tutorialBattleReward(s);
  MM.tutorialPickFourth(s, MM.tutorialFourthOptions(s)[0]); MM.finishTutorial(s);
  const ps = ['fire', 'water', 'grass'].map(e => MM.addMonster(s, e, 6, 72)); s.party = ps.map(m => m.id);
  [1, 2, 3, 6].forEach(t => MM.addBossTickets(s, t, 1)); s.levelScale = 4; s.boundV = 1;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(st => { if (!sessionStorage.getItem('x')) { localStorage.setItem('monster-mix-mvp-v1', st); sessionStorage.setItem('x', 1); } }, JSON.stringify(s));
  await p.goto('file://' + require('path').join(__dirname, '..', '..', 'index.html')); await p.waitForTimeout(700);
  const c = sel => p.evaluate(s => document.querySelector(s).click(), sel);
  const shot = async n => { await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/' + n + '.png' }); };
  await c('#tabs [data-tab="stages"]'); await c('[data-act="stageSeg"][data-v="boss"]'); await shot('list');
  await c('[data-act="startBoss"][data-tier="3"]'); await p.waitForTimeout(500); await shot('b6start');
  await shot('boss');
  await c('[data-act="flee"]'); await p.waitForTimeout(400);
  await p.evaluate(() => { const st = MM._state(); MM.RING.forEach(el => MM.addMonster(st, el, 5, 62)); MM.addRaidTickets(st, 1, 1); st.raid.progress = { 1: 1 }; });
  await c('#tabs [data-tab="stages"]'); await c('[data-act="stageSeg"][data-v="raid"]'); await c('[data-act="startRaid"][data-tier="1"]'); await p.waitForTimeout(500); await shot('raid');
  console.log('errors', errs, await p.evaluate(() => [document.getElementById('screen').scrollHeight, document.getElementById('screen').clientHeight])); await b.close();
})();
