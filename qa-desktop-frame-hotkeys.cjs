'use strict';
// Sealed synthetic browser QA; run only through the forum heavy queue.
// No live API, owner app, history, message, provider, microphone or native bridge access.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, devices } = require('./tools/qa-playwright.cjs');
const TREE = process.env.QA_TREE || __dirname, OUT = process.env.QA_OUT;
assert(OUT, 'QA_OUT is mandatory'); fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = 'https://wizard.test', PREFIX = '/wizard-os-home/';
const report = { passed: [], failedCase: null, requests: [], writesRefused: [], errors: [], source: process.env.QA_SOURCE_SHA || 'unbound' };
let active = 'setup', browser, page;
const check = async (name, fn) => { active = name; await fn(); report.passed.push(name); console.log('PASS', name); };
const appHTML = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic app</title>
<style>html{color-scheme:dark}body{background:var(--wz-base,#101018);color:var(--wz-ink,#f1f1fa);font:18px system-ui;padding:24px}input{display:block;background:var(--wz-panel,#20202c);color:inherit;padding:12px;width:80%;border:1px solid #777}</style>
<h1>Synthetic app — no private data</h1><input id="field" value="unsent fixture"><button id="appButton">App control</button>
<script>window.fixtureEvents=[]; for(const type of ['keydown','keyup']) window.addEventListener(type,e=>{ fixtureEvents.push({type,key:e.key,code:e.code,repeat:e.repeat}); e.stopPropagation(); },true);<\/script>`;
function staticFile(p) {
  if (!p.startsWith(PREFIX)) return null;
  const root = path.resolve(TREE, 'web'), file = path.resolve(root, decodeURIComponent(p.slice(PREFIX.length) || 'index.html'));
  return file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}
async function route(r) {
  const q = r.request(), u = new URL(q.url()); report.requests.push({ method: q.method(), url: q.url() });
  if (!['GET', 'HEAD'].includes(q.method())) { report.writesRefused.push({ method: q.method(), path: u.pathname }); return r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"isolated QA refuses every write"}' }); }
  if (u.origin !== ORIGIN) return r.abort('blockedbyclient');
  if (u.pathname === '/qa-desktop-frame/') return r.fulfill({ contentType: 'text/html', body: appHTML });
  // All dynamic reads are synthetic, including aliases under the static prefix.
  if (/^\/wizard\//.test(u.pathname) || /^\/wizard-os-home\/(installed-apps|app-logos|api|store\/api)/.test(u.pathname)) {
    let body = {};
    if (u.pathname === '/wizard/hermes/api/sessions') body = { object: 'list', data: [], has_more: false, limit: 100, offset: 0, snapshot: 'hotkeys-static' };
    if (u.pathname === '/wizard/thread-seen') body = { state: { initializedAt: 1, threads: {} } };
    if (u.pathname === '/wizard/v1/boomerangs') body = { reminders: [] };
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  }
  const file = staticFile(u.pathname);
  return file ? r.fulfill({ path: file }) : r.fulfill({ status: 404, body: '' });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function settle(p) {
  await p.waitForFunction(() => !window.WosExperience?.state?.busy);
  await p.evaluate(() => document.getElementById('wosWelcome')?.remove());
  await wait(500);
}
async function context(phone = false) {
  const c = await browser.newContext({ ...(phone ? devices['Pixel 7'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block', colorScheme: 'dark' });
  await c.route('**/*', route);
  await c.addInitScript(({ phone }) => {
    if (window !== window.top) return;
    localStorage.setItem('wos.coached', 'true'); localStorage.setItem('wos.tour.v1', 'true'); localStorage.setItem('wos.tour.done', '1'); localStorage.setItem('wos.skin', 'nebula');
    if (!phone) {
      const ws = [], wins = {};
      for (let i = 0; i < 3; i++) { const id = 'fixture' + i; wins[id] = { id, app: 'frame', url: '/qa-desktop-frame/', title: 'Synthetic app ' + i }; ws.push({ id: 'desk' + i, wins: [id], focus: id, mono: false }); }
      localStorage.setItem('wux.desk.wins', JSON.stringify(wins)); localStorage.setItem('wux.desk.ws', JSON.stringify(ws)); localStorage.setItem('wux.desk.cur', '0'); localStorage.setItem('wux.desk.homeOpen', 'false');
    }
  }, { phone });
  return c;
}
const field = (p, i) => p.frameLocator(`.win[data-win="fixture${i}"] iframe`).locator('#field');
const cur = p => p.evaluate(() => __wux.cur);
async function picker(p, chord, i = 0) {
  await field(p, i).focus(); await p.keyboard.press(chord);
  assert.equal(await p.evaluate(() => __wux.palMode), 'apps');
  await p.keyboard.press('Escape'); assert.equal(await p.evaluate(() => __wux.palMode), '');
}
(async () => {
  try {
    browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking'] });
    const c = await context(); page = await c.newPage(); page.on('pageerror', e => report.errors.push(String(e)));
    await page.goto(ORIGIN + PREFIX + 'desktop.html');
    await page.waitForFunction(() => window.__wux && document.documentElement.dataset.shell === 'desktop'); await settle(page);
    await field(page, 0).waitFor();
    await check('REGRESSION: frame window capture cannot strand desktop switching', async () => {
      await field(page, 0).focus(); await page.keyboard.press('Alt+2'); assert.equal(await cur(page), 1, 'Alt+2 from focused app input must switch without a desktop click');
    });
    // Baseline must reach this exact oracle and fail there, not merely fail startup.
    if (process.env.QA_NEGATIVE_CONTROL === '1') throw Error('Original code unexpectedly passed the regression');
    await check('same event reaches shell once; app window state and unsent text persist', async () => {
      await field(page, 1).fill('keep my unsent text'); await field(page, 1).press('Control+Tab'); assert.equal(await cur(page), 2, 'duplicate relative dispatch would wrap to desktop 0');
      await page.keyboard.press('Alt+2'); assert.equal(await field(page, 1).inputValue(), 'keep my unsent text');
    });
    await check('open-app chords work in app input, without clicking desktop', async () => {
      for (const chord of ['Alt+o', 'Control+o', 'Meta+o']) await picker(page, chord, 1);
    });
    await check('app typing, select-all and ordinary arrows retain app ownership', async () => {
      await field(page, 1).focus(); await page.keyboard.press('Control+a'); await page.keyboard.type('still typing'); await page.keyboard.press('ArrowLeft');
      assert.equal(await field(page, 1).inputValue(), 'still typing'); assert.equal(await cur(page), 1); assert.equal(await page.evaluate(() => __wux.palMode), '');
    });
    await check('repeated desk switches and picker navigation never need a desk click', async () => {
      for (let i = 0; i < 8; i++) {
        const from = await cur(page); await field(page, from).focus(); await page.keyboard.press('Control+Tab'); assert.equal(await cur(page), (from + 1) % 3);
        await picker(page, 'Alt+o', (from + 1) % 3);
      }
    });
    await check('keydown, keyup and frame blur clear held modifiers and key hints', async () => {
      const i = await cur(page); await field(page, i).focus(); await page.keyboard.down('Alt'); await wait(400);
      assert.equal(await page.locator('#keyHints').isVisible(), true); await page.keyboard.up('Alt'); assert.equal(await page.locator('#keyHints').isVisible(), false);
      await page.keyboard.down('Alt'); await wait(400); assert.equal(await page.locator('#keyHints').isVisible(), true);
      await page.locator('#searchBtn').focus(); assert.equal(await page.locator('#keyHints').isVisible(), false); await page.keyboard.up('Alt');
      await field(page, i).focus(); await page.keyboard.type('x'); assert.equal(await cur(page), i);
    });
    await check('autorepeat cannot toggle the app picker twice or create extra desktops', async () => {
      const i = await cur(page); await field(page, i).focus(); await page.keyboard.down('Alt'); await page.keyboard.down('o');
      assert.equal(await page.evaluate(() => __wux.palMode), 'apps'); await page.keyboard.down('o'); assert.equal(await page.evaluate(() => __wux.palMode), 'apps');
      await page.keyboard.up('o'); await page.keyboard.up('Alt'); await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => __wux.ws.length), 3);
    });
    await check('frame reload installs one fresh bridge', async () => {
      const i = await cur(page), f = page.locator(`.win[data-win="fixture${i}"] iframe`);
      await f.evaluate(f => { f.src = '/qa-desktop-frame/?reloaded=1'; }); await field(page, i).waitFor(); await field(page, i).focus();
      await page.keyboard.press('Control+Tab'); assert.equal(await cur(page), (i + 1) % 3);
    });
    await check('opaque/nested frames remain outside the shortcut bridge and cannot message-dispatch a chord', async () => {
      const before = await cur(page);
      await page.evaluate(() => { window.postMessage({ type: 'wizard:keydown', key: '3', altKey: true }, '*'); }); await wait(50); assert.equal(await cur(page), before);
      // A nested sandboxed document is not a shell-owned app frame. Its keys
      // must not gain shell authority, even though the QA driver can target it.
      const i = await cur(page), outer = page.locator(`.win[data-win="fixture${i}"] iframe`);
      await outer.evaluate(f => { const n = f.contentDocument.createElement('iframe'); n.id = 'nested'; n.setAttribute('sandbox', 'allow-scripts'); n.srcdoc = '<input id="nestedField" value="opaque synthetic text">'; f.contentDocument.body.append(n); });
      const nested = page.frameLocator(`.win[data-win="fixture${i}"] iframe`).frameLocator('#nested').locator('#nestedField');
      await nested.focus(); await page.keyboard.press(before === 0 ? 'Alt+2' : 'Alt+1'); assert.equal(await cur(page), before);
      assert.equal(await outer.evaluate(f => f.contentDocument.querySelector('#nested').contentDocument), null);
      await outer.evaluate(f => f.contentDocument.querySelector('#nested').remove());
      const code = fs.readFileSync(path.join(TREE, 'web/desktop/desktop.js'), 'utf8');
      const hook = code.slice(code.indexOf('  function watchFrame(f, el)'), code.indexOf('\n  function render()'));
      assert(!hook.includes('postMessage')); assert(!hook.includes('querySelectorAll'));
    });
    for (const skin of ['nebula', 'landscapes']) await check('in-shell skin proof and opaque picker: ' + skin, async () => {
      await page.evaluate(skin => WosSkin.set(skin), skin); await settle(page); const i = await cur(page); await field(page, i).focus(); await page.keyboard.press('Alt+o');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.skin), skin);
      await page.screenshot({ path: path.join(OUT, 'desktop-' + skin + '.png'), animations: 'disabled', caret: 'hide' });
      const card = page.locator('.pal-card'); const box = await card.boundingBox(); assert(box);
      const clip = { x: Math.ceil(box.x + 16), y: Math.ceil(box.y + 16), width: Math.floor(box.width - 32), height: Math.floor(box.height - 32) };
      const before = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
      await page.evaluate(() => { const n = document.createElement('div'); n.id = 'qa-noise'; n.textContent = 'LOUD BACKGROUND TEXT '.repeat(2000); n.style.cssText = 'position:fixed;inset:0;z-index:1;background:red;color:lime;font:40px monospace;pointer-events:none'; document.body.append(n); });
      const noisy = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }); fs.writeFileSync(path.join(OUT, skin + '-panel-clear.png'), before); fs.writeFileSync(path.join(OUT, skin + '-panel-noisy.png'), noisy);
      await page.evaluate(() => document.getElementById('qa-noise').remove()); assert(before.equals(noisy), 'picker text panel must paint identically over loud text'); await page.keyboard.press('Escape');
    });
    await check('phone shell boots with the same exact candidate sources', async () => {
      const pc = await context(true), p = await pc.newPage(); p.on('pageerror', e => report.errors.push('phone: ' + String(e)));
      await p.goto(ORIGIN + PREFIX); await p.waitForFunction(() => window.__wos && document.documentElement.dataset.shell !== 'desktop'); await settle(p);
      await p.screenshot({ path: path.join(OUT, 'phone-boot.png'), animations: 'disabled' }); await pc.close();
    });
    await check('standalone synthetic app fallback is dark and still editable', async () => {
      const p = await c.newPage(); await p.goto(ORIGIN + '/qa-desktop-frame/'); await p.locator('#field').fill('standalone unsent text');
      assert.equal(await p.locator('body').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(16, 16, 24)');
      await p.screenshot({ path: path.join(OUT, 'fixture-standalone-dark.png') }); await p.close();
    });
    await check('zero uncaught page exceptions', async () => assert.deepEqual(report.errors, []));
  } catch (e) {
    report.failedCase = active; report.failure = String(e.stack || e); console.error('FAIL', active, e);
    if (page) await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(report, null, 2)); if (browser) await browser.close();
  }
})();
