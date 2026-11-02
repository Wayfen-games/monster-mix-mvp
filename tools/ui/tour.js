// 폰 크기 가상 브라우저(Playwright)로 화면을 눌러 보는 점검 스크립트. 사용: NODE_PATH=$(npm root -g) OUT=스크린샷폴더 node tools/ui/tour.js
// 끝에 'errors []'면 화면 오류 없음.
const { chromium } = require('playwright');
const MM = require(require('path').join(__dirname, '..', 'load'));
(async () => {
  const s = MM.newState(Date.now()); s.levelScale = 3;
  MM.tutorialPickStarters(s, ['fire', 'water', 'grass']); MM.tutorialBattleReward(s);
  MM.tutorialPickFourth(s, MM.tutorialFourthOptions(s)[0]); MM.finishTutorial(s);
  s.cleared.fire1 = 1; s.souls.fire1 = 120; s.souls.water2 = 60; MM.addTickets(s, 1, 2); MM.addBossTickets(s, 1, 1); s.gold = 1e6;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  p.on('dialog', d => d.accept());
  await p.addInitScript(st => { if (!sessionStorage.getItem('x')) { localStorage.setItem('monster-mix-mvp-v1', st); sessionStorage.setItem('x', 1); } }, JSON.stringify(s));
  await p.goto('file://' + require('path').join(__dirname, '..', '..', 'index.html')); await p.waitForTimeout(600);
  const steps = [
    '#tabs [data-tab="home"]', '[data-tab="altar"]', '#tabs [data-tab="home"]', '[data-tab="gacha"]', '#tabs [data-tab="home"]', '[data-tab="settings"]',
    '#tabs [data-tab="stages"]', '[data-act="stage"][data-el="fire"][data-tier="1"]', '[data-act="startStage"]', '[data-act="auto"]', '[data-act="flee"]', '#tabs [data-tab="stages"]',
    '[data-act="stageSeg"][data-v="dungeon"]', '[data-act="stageSeg"][data-v="ticket"]', '[data-act="stageSeg"][data-v="boss"]', '[data-act="startBoss"][data-tier="1"]',
    '#tabs [data-tab="monsters"]', '[data-act="monSeg"][data-v="souls"]', '#tabs [data-tab="fusion"]', '#tabs [data-tab="dex"]', '[data-act="dexSeg"][data-v="rec"]', '#tabs [data-tab="home"]'];
  for (const sel of steps) { const ok = await p.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel); await p.waitForTimeout(250); if (!ok) console.log('missing', sel); }
  console.log('errors', errs); await b.close();
})();
