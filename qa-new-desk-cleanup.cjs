// QA: New desk keeps its first screen quiet: no redundant helper, no visible Apps heading.
// Usage: QA_BASE=http://127.0.0.1:<port> QA_PLAYWRIGHT=<module> QA_CHROME=<executable> node qa-new-desk-cleanup.cjs
const { chromium } = require('./tools/qa-playwright.cjs');
const BASE = process.env.QA_BASE || 'http://127.0.0.1:9371';
const SHOTS = process.env.QA_SHOTS || '';
const fails = [];
const ok = (condition, message) => {
  console.log((condition ? 'ok   ' : 'FAIL ') + message);
  if (!condition) fails.push(message);
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
  for (const skin of ['nebula', 'grove', 'signal', 'obsidian', 'obsidian-light']) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 412, height: 892 }, isMobile: true, hasTouch: true });
    await context.addInitScript(selected => {
      if (window !== top) return;
      try {
        localStorage.setItem('wos.skin', selected);
        localStorage.setItem('wos.tour.done', '1');
        localStorage.setItem('wos.coached', 'true');
        localStorage.setItem('wos.rvCoached', 'true');
      } catch (_) {}
    }, skin);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(BASE + '/wizard-os-home/?myskin=off');
    await page.waitForSelector('#orbWrap');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__wos.openOverview());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-ovadd]')?.click());
    await page.waitForTimeout(700);
    const state = await page.evaluate(() => {
      const desk = [...document.querySelectorAll('.new-desk')].find(node => {
        const box = node.getBoundingClientRect();
        return box.left >= 0 && box.left < innerWidth;
      });
      if (!desk) return null;
      const appsHeading = desk.querySelector('.kg-apps > h4');
      return {
        headText: desk.querySelector('.nd-head')?.innerText.trim(),
        helperCount: desk.querySelectorAll('.nd-head span').length,
        appsHeading: appsHeading?.textContent,
        appsHeadingDisplay: appsHeading ? getComputedStyle(appsHeading).display : null,
        searchVisible: getComputedStyle(document.querySelector('.nd-search')).display !== 'none'
      };
    });
    ok(state && state.headText === 'New desk' && state.helperCount === 0, `${skin}: only the New desk title remains (${JSON.stringify(state)})`);
    ok(state && state.appsHeading === 'Apps' && state.appsHeadingDisplay === 'none', `${skin}: redundant Apps heading is visually hidden`);
    ok(state && state.searchVisible, `${skin}: app search remains visible`);
    ok(!errors.length, `${skin}: no page errors ${errors.join(' | ').slice(0, 200)}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/new-desk-${skin}.png`, fullPage: false });
    await context.close();
  }
  await browser.close();
  console.log(fails.length ? `${fails.length} failed` : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
