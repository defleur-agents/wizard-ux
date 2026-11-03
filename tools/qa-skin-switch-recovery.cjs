'use strict';
// Actual shell + shared Settings. Every API is synthetic; no real API, login or agent runs.
// QA_TREE=<checkout> QA_OUT=<evidence> QA_PLAYWRIGHT=<module> node tools/qa-skin-switch-recovery.cjs
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { chromium } = require('./qa-playwright.cjs');
const { observeAppearanceTaps } = require('./qa-skin-switch-fixture.cjs');
const { ownerRead } = require('./qa-desktop-frame-fixture.cjs');
const TREE = process.env.QA_TREE || path.resolve(__dirname, '..');
const OUT = process.env.QA_OUT || path.resolve('qa-skin-switch-evidence');
const rows = [], errors = [], writes = [], taps = []; let browser, currentPage, currentKey;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const copy = v => JSON.parse(JSON.stringify(v));
const result = () => fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ tree: TREE, cases: rows, errors, writes, taps, agentRuns: writes.filter(w => /(?:runs|send|chat\/stream)/.test(w.path)).length }, null, 2));
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const shell of ['phone', 'desktop']) for (const skin of ['nebula', 'obsidian-light']) for (const own of [true, false]) {
    const id = `${shell}-${skin}-${own ? 'own' : 'none'}`, pageErrors = [];
    const box = { active: own ? 'My skin' : null, skins: [{ id: 'My skin', name: 'My skin', base: 'nebula', legacy: true, has_recipe: false, empty: false, bytes: 22, tweaks: {} }, ...['My skin 2', 'My skin 3'].map(id => ({ id, name: 'My skin', base: 'nebula', has_recipe: false, empty: true, bytes: 0, tweaks: {} }))] };
    let backend = null, injecting = false;
    const ctx = await browser.newContext({ viewport: shell === 'phone' ? { width: 412, height: 915 } : { width: 1440, height: 1000 }, isMobile: shell === 'phone', hasTouch: shell === 'phone', serviceWorkers: 'block', ...(shell === 'phone' ? { userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.0.0 Mobile Safari/537.36 WizardOS/0.10.23' } : {}) });
    await ctx.route('**/*', async r => {
      const q = r.request(), u = new URL(q.url()), method = q.method();
      const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
      if (u.hostname !== 'wizard.test') return r.abort();
      if (!['GET', 'HEAD'].includes(method)) { writes.push({ id, path: u.pathname, method }); return json({ error: 'QA forbids all real writes' }, 403); }
      if (u.pathname === '/wizard/v1/skins') return json(box);
      if (u.pathname === '/wizard/v1/my-skin') return u.searchParams.has('format') ? json({ script: { exists: false } }) : r.fulfill({ contentType: 'text/css', body: own ? ':root{--qa-owner-layer:1}' : '' });
      if (u.pathname.startsWith('/wizard/v1/user-files/content')) return json({ error: 'not_found' }, 404);
      if (u.pathname.startsWith('/wizard-os-home/')) {
        const rel = decodeURIComponent(u.pathname.slice('/wizard-os-home/'.length)) || 'index.html', f = path.resolve(TREE, 'web', rel);
        if (!f.startsWith(path.resolve(TREE, 'web') + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return r.fulfill({ status: 404, body: '' });
        if (/\/profile\.json$/.test(u.pathname)) {
          if (injecting) { await sleep(300); return r.fulfill({ status: 503, body: '{}' }).catch(() => {}); }
          if (backend) {
            const op = backend; backend = null; op.requestSeen = Date.now();
            await sleep(op.mode === 'timeout' ? 7200 : 5000);
            if (op.mode === 'failure') return json({ error: 'fixture failure' }, 503);
          }
        }
        const ext = path.extname(f), contentType = ({ '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[ext] || 'application/octet-stream';
        return r.fulfill({ contentType, body: fs.readFileSync(f) }).catch(() => {});
      }
      if (/\/events(?:\/|$)/.test(u.pathname)) return r.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      if (/\/apps$/.test(u.pathname)) return json({ apps: [], slots: {} });
      if (/\/sessions$/.test(u.pathname)) return json({ data: [], has_more: false });
      const establishedOwner = ownerRead(u.pathname);
      if (Object.keys(establishedOwner).length) return json(establishedOwner);
      return json({ agents: [], items: [], data: [], sessions: [], ready: false, configured: false });
    });
    await ctx.addInitScript(({ shell, skin }) => {
      if (!sessionStorage.qaSeeded) {
        for (const [k, v] of Object.entries({ 'wux.shell': shell, 'wos.skin': skin, 'wos.coached': 'true', 'wos.tour.v1': 'true', 'wos.tour.done': '1', 'wos.welcome.v1': 'done', 'wos.voiceTipSeen': 'true' })) localStorage.setItem(k, v);
        sessionStorage.qaSeeded = '1';
      }
      navigator.sendBeacon = () => false;
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = ms => timeout(window.__qaInject && ms === 6000 ? 100 : ms);
    }, { shell, skin });
    await ctx.addInitScript(observeAppearanceTaps);
    const p = await ctx.newPage(); p.on('pageerror', e => pageErrors.push(String(e)));
    currentPage = p; currentKey = id;
    const url = 'https://wizard.test/wizard-os-home/' + (shell === 'phone' ? '?shell=phone&view=settings' : 'desktop.html?view=settings');
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForFunction(({ skin, own }) => window.WosExperience && !WosExperience.state.busy && window.WosSkin?.current === skin && (window.WosMySkin?.active?.id || null) === (own ? 'My skin' : null), { skin, own }, { timeout: 30000 });
    assert.equal(await p.evaluate(() => document.documentElement.dataset.shell), shell, 'actual requested shell');
    const settledWelcome = async () => {
      await p.waitForFunction(() => window.WosWelcome?.log.some(s => s === 'deeplink' || s.startsWith('boot:true:done:false')));
      assert.equal(await p.evaluate(() => WosWelcome.active), false, 'established owner Welcome settled, not hidden');
      await p.waitForFunction(() => !document.querySelector('.mz-intro'));
    };
    await settledWelcome();
    assert.equal(await p.evaluate(() => WosExperience.state.error), '');
    const open = async () => {
      await p.evaluate(shell => { if (shell === 'desktop') __wux.openSettings('appearance'); else __wos.openSheet('settings'); }, shell);
      if (shell === 'phone') { await p.locator('#settingsBody').getByText('Appearance', { exact: true }).first().click(); }
      await p.locator('[data-skinfamily]:visible').first().waitFor();
    };
    await open();
    await p.screenshot({ path: path.join(OUT, `${id}-before.png`) });
    for (const kind of ['colour', 'family']) for (const mode of ['success', 'failure', 'timeout']) {
      const key = `${id}-${kind}-${mode}`;
      currentKey = key;
      const previous = await p.evaluate(() => ({ palette: WosSkin.current, own: WosMySkin.active?.id || null, family: WosSkin.familyOf(WosSkin.current) }));
      // Real fetch timeout after owner/profile reconciliation. Old chooseSkin treats this as settled.
      injecting = true;
      await p.evaluate(async () => { window.__qaInject = true; await WosExperience.refresh(); window.__qaInject = false; });
      injecting = false;
      const stale = await p.evaluate(() => WosExperience.state); assert.ok(/timed out/i.test(stale.error), `${key}: real fetch timeout reproduced`);
      const selector = kind === 'family' ? `[data-skinfamily="${previous.family === 'wizard' ? 'mizel' : 'wizard'}"]` : '[data-skinpick]:not([aria-pressed="true"])';
      const tile = p.locator(selector + ':visible').first();
      const picked = await tile.getAttribute(kind === 'family' ? 'data-skinfamily' : 'data-skinpick');
      const op = backend = { mode, requestSeen: 0 }; const started = Date.now();
      if (shell === 'phone') await tile.tap(); else await tile.click();
      const frame = await p.evaluate(() => window.__tapFrames.at(-1));
      const phases = await p.evaluate(() => window.__tapPhases.slice(-2));
      taps.push({ key, frame, phases }); result(); // Preserve the actual oracle before an assertion can fail.
      assert.equal(frame.trusted, true); assert.equal(frame.pending, true); assert.equal(frame.busy, 'true'); assert.equal(frame.disabled, true);
      assert.equal(frame.animation, 'st-busy-spin'); assert.equal(frame.opacity, '1'); assert.ok(parseFloat(frame.width) > 0);
      await p.waitForTimeout(500);
      assert.ok(op.requestSeen, `${key}: requested backend reconcile rather than returning stale error`);
      assert.equal(await p.locator('.st-pending[aria-busy="true"]:visible').count(), 1);
      await p.screenshot({ path: path.join(OUT, `${key}-pending.png`) });
      await p.waitForFunction(() => !document.querySelector('.st-pending'), null, { timeout: 30000 });
      const after = await p.evaluate(() => ({ palette: WosSkin.current, own: WosMySkin.active?.id || null, family: WosSkin.familyOf(WosSkin.current), error: document.querySelector('[data-look-error]')?.textContent || '' }));
      assert.equal(after.own, previous.own, `${key}: owner layer is separate from family/colour`);
      await p.waitForFunction(() => !document.querySelector('.mz-intro'));
      if (mode === 'success') {
        assert.equal(kind === 'family' ? after.family : after.palette, picked);
        if (kind === 'colour') assert.equal(after.family, previous.family);
        assert.ok(Date.now() - started >= 4900);
      } else {
        assert.equal(after.palette, previous.palette, `${key}: failed/timed-out reconcile rolls palette back`);
        assert.ok((await p.locator('[role="alert"]:visible').count()) > 0, `${key}: error is visible`);
      }
      await p.screenshot({ path: path.join(OUT, `${key}-after.png`) });
      rows.push({ key, previous, picked, staleError: stale.error, frame, phases, backendDelay: mode === 'timeout' ? 7200 : 5000, elapsed: Date.now() - started, after, passed: true }); result();
    }
    const saved = await p.evaluate(() => ({ palette: WosSkin.current, own: WosMySkin.active?.id || null }));
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(saved => window.WosSkin?.current === saved.palette && (window.WosMySkin?.active?.id || null) === saved.own && window.WosExperience && !WosExperience.state.busy, saved, { timeout: 30000 });
    await settledWelcome();
    rows.push({ key: `${id}-persistence`, saved, passed: true });
    errors.push(...pageErrors.map(error => ({ id, error }))); result(); await ctx.close();

  }
  assert.equal(writes.filter(w => w.path.startsWith('/wizard/v1/skins')).length, 0, 'family/palette changes never create, PATCH, delete or activate personal skins');
  assert.equal(writes.filter(w => /(?:runs|send|chat\/stream)/.test(w.path)).length, 0, 'zero agent runs');
  assert.equal(errors.length, 0, 'no page errors');
  assert.equal(rows.length, 56, '8 contexts, 6 controls/outcomes plus persistence each');
  console.log(JSON.stringify({ passed: rows.length, output: OUT, errors: errors.length, writes: writes.length }));
})().catch(async e => {
  errors.push({ key: currentKey, fatal: String(e.stack || e) }); result();
  if (currentPage && !currentPage.isClosed()) {
    const state = await currentPage.evaluate(() => ({ shell: document.documentElement.dataset.shell, palette: window.WosSkin?.current, experience: window.WosExperience?.state, frames: window.__tapFrames, phases: window.__tapPhases, pending: [...document.querySelectorAll('.st-pending')].map(el => el.outerHTML), welcome: window.WosWelcome?.active })).catch(() => null);
    fs.writeFileSync(path.join(OUT, 'failure-state.json'), JSON.stringify({ key: currentKey, state }, null, 2));
    await currentPage.screenshot({ path: path.join(OUT, 'failure.png'), timeout: 10000 }).catch(() => {});
  }
  console.error(e); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
