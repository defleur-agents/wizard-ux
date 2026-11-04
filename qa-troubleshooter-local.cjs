/* Real HTTP-delivered shell/CSP + synthetic network faults. No owner service traffic or writes.
 * Run on forum through the durable queue. QA_TS_DIR is the real Troubleshooter web source.
 * Public probe fulfillment is synthetic positive Internet evidence, NOT a real Internet outage/device proof. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('./tools/qa-playwright.cjs');
const { MODEL_OPTIONS, seedOwner } = require('./tools/qa-desktop-frame-fixture.cjs');
const out = process.env.QA_OUT || '/srv/work/troubleshooter-evidence', root = path.join(__dirname, 'web');
const tsRoot = process.env.QA_TS_DIR;
assert.ok(tsRoot && fs.existsSync(path.join(tsRoot, 'index.html')), 'stage real Troubleshooter source');
const policy = fs.readFileSync(path.join(__dirname, 'packaging/static.conf'), 'utf8').match(/Content-Security-Policy "([^"]+)"/)[1];
const publicUrl = 'https://derp1.tailscale.com/generate_204';
const results = [], receipts = [];
fs.mkdirSync(out, { recursive: true });
const ok = (name, detail = {}) => { results.push({ name, pass: true, ...detail }); console.log('PASS', name); };
const json = (res, value) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://fixture');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); return res.end(); }
  if (u.pathname === '/recovery-fallback/') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': policy });
    return res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>Dark fallback</title><link rel="stylesheet" href="/wizard-os-home/kit/wizard-tokens.css"><link rel="stylesheet" href="/wizard-os-home/kit/controls.css"><link rel="stylesheet" href="/wizard-os-home/core/polish.css"><script src="/wizard-os-home/core/reach.js"></script><body>');
  }
  let file;
  if (u.pathname.startsWith('/wizard-os-home/')) file = path.join(root, u.pathname.slice('/wizard-os-home/'.length) || 'index.html');
  else if (u.pathname.startsWith('/troubleshoot/') && !u.pathname.startsWith('/troubleshoot/api/')) file = path.join(tsRoot, u.pathname.slice('/troubleshoot/'.length) || 'index.html');
  if (file && fs.existsSync(file) && fs.statSync(file).isFile() && [root, tsRoot].some(r => file.startsWith(r + '/'))) {
    const type = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': u.searchParams.has('blockedProbe') ? policy.replace(' https://derp1.tailscale.com/generate_204', '') : policy });
    return res.end(req.method === 'HEAD' ? '' : fs.readFileSync(file));
  }
  if (u.pathname.endsWith('/bootstrap')) return json(res, { bootstrap: 1, display: { agent_name: 'Wizard', owner_name: 'Synthetic QA' }, capabilities: {} });
  if (u.pathname.endsWith('/api/model/options')) return json(res, MODEL_OPTIONS);
  if (u.pathname.endsWith('/setup')) return json(res, { first_run: false, complete: true, seen: true });
  if (u.pathname.endsWith('/api/sessions')) return json(res, { sessions: [] });
  if (u.pathname.endsWith('/v1/runs')) return json(res, { runs: [] });
  if (u.pathname.endsWith('/agents')) return json(res, { agents: [{ id: 'hermes', label: 'Wizard', is_default: true, status: 'running' }] });
  if (u.pathname.endsWith('/api/jobs')) return json(res, { jobs: [] });
  return json(res, {});
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, host = `http://wizard.fixture.ts.net:${port}`;
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined, args: ['--no-proxy-server', '--host-resolver-rules=MAP wizard.fixture.ts.net 127.0.0.1'] });
  try {
    for (const desktop of [false, true]) {
      const label = desktop ? 'desktop' : 'phone';
      const ctx = await browser.newContext({ viewport: desktop ? { width: 1440, height: 1000 } : { width: 412, height: 892 }, isMobile: !desktop, hasTouch: !desktop, serviceWorkers: 'block' });
      let mode = 'down', privateDown = false, probeRequests = 0, diagnosticRequests = 0, escaped = [], writes = [], errors = [];
      await ctx.route('**/*', async route => {
        const q = route.request(), u = new URL(q.url());
        if (q.url() === publicUrl) { probeRequests++; return route.fulfill({ status: 204, body: '' }); }
        if (u.hostname !== 'wizard.fixture.ts.net') { escaped.push(q.url()); return route.abort(); }
        if (!['GET', 'HEAD'].includes(q.method())) { writes.push(q.url()); return route.abort(); }
        if (u.pathname.startsWith('/troubleshoot/api/')) {
          diagnosticRequests++;
          if (mode === 'down') return route.abort('connectionrefused');
          if (mode === 'slow') { await new Promise(r => setTimeout(r, 5000)); if (!route.request().isNavigationRequest()) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ overall: 'ok', checks: [] }) }).catch(() => {}); }
          return route.fulfill({ status: mode === '502' ? 502 : 200, contentType: 'application/json', body: JSON.stringify({ overall: 'ok', checks: [] }) });
        }
        if (mode === '502' && u.pathname.startsWith('/troubleshoot/')) return route.fulfill({ status: 502, body: 'Synthetic gateway failure' });
        if (privateDown && !u.pathname.startsWith('/wizard-os-home/') && !u.pathname.startsWith('/troubleshoot/')) return route.abort('connectionrefused');
        return route.continue();
      });
      await ctx.addInitScript(seedOwner, { phone: true });
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        for (const [k, v] of Object.entries({ 'wos.coached': 'true', 'wos.voiceTipSeen': 'true', 'wos.tour.v1': 'true', 'wos.tour.done': '1' })) localStorage.setItem(k, v);
      });
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e)));
      const response = await p.goto(`${host}/wizard-os-home/${desktop ? 'desktop.html' : 'index.html'}`);
      assert.equal(response.headers()['content-security-policy'], policy); receipts.push({ label, csp: response.headers()['content-security-policy'] });
      await p.waitForFunction(() => (window.__wos || window.__wux)?.chats && window.WosOutbox?.recoveryComplete && window.WizOpenApp, null, { timeout: 25000 });
      // In-shell real entry control, not a surrogate button. Status checks retain outside/Back semantics.
      privateDown = true;
      await p.evaluate(() => { const A = window.__wos || window.__wux; A.openWin?.({ app: 'chats' }); WizLive.refresh(); });
      await p.locator('[data-wxoffopen]').waitFor({ timeout: 15000 });
      await p.locator('[data-wxoffopen]').click();
      await p.locator('[data-wxoffhelp]').click();
      await p.locator('[data-recovery]').waitFor();
      const first = await p.evaluate(() => {
        const A = window.__wos || window.__wux, w = Object.values(A.wins).find(w => w.appId === 'troubleshooter');
        return { id: w?.id, app: w?.app, text: document.querySelector('[data-recovery]')?.textContent, popup: !!document.querySelector('#wxOffline:not([hidden])'), route: location.pathname };
      });
      assert.ok(first.id); assert.equal(first.app, 'frame'); assert.equal(first.popup, false); assert.match(first.text, /Connection help/);
      ok(`${label}: real Troubleshooter window opens with local help, false onLine and private route down`, first);
      await p.waitForFunction(() => /Internet works/.test(document.querySelector('[data-recovery-message]')?.textContent || ''));
      assert.match(await p.locator('[data-recovery-row="internet"]').innerText(), /Working/);
      assert.match(await p.locator('[data-recovery-message]').innerText(), /Tailscale app/);
      assert.doesNotMatch(await p.locator('[data-recovery]').innerText(), /device.*offline|You’re offline|No connection/i);
      assert.ok(probeRequests > 0); ok(`${label}: James regression: Internet Working, private route unconfirmed, Tailscale guidance`);
      const identity = first.id;
      for (const skin of ['nebula', 'signal']) {
        const current = await p.evaluate(s => WosSkin.set(s), skin); assert.equal(current, skin);
        await p.waitForTimeout(600);
        const same = await p.evaluate(id => Object.values((window.__wos || window.__wux).wins).some(w => w.id === id && w.appId === 'troubleshooter'), identity); assert.ok(same);
        const bg = await p.locator('[data-recovery]').evaluate(el => getComputedStyle(el).backgroundColor); assert.ok(!/rgba\([^)]*, 0(?:\.\d+)?\)/.test(bg), bg);
        await p.screenshot({ path: path.join(out, `${label}-${skin}-local.png`) });
        ok(`${label}: ${skin} live skin switch preserves window and opaque local help`, { bg });
      }
      mode = 'slow';
      const start = Date.now();
      const sync = await p.evaluate(() => { const t = performance.now(); const opened = WizReach.open(); return { opened, ms: performance.now() - t, local: !!document.querySelector('[data-recovery]') }; });
      assert.equal(sync.opened, true); assert.ok(sync.local); assert.ok(sync.ms < 100); ok(`${label}: explicit opening never waits for a five-second health check`, sync);
      mode = '502'; await p.locator('[data-recovery-check]').click();
      await p.waitForFunction(() => /502/.test(document.querySelector('[data-recovery-message]')?.textContent || ''));
      assert.equal(await p.locator('[data-recovery] iframe').isVisible(), false); ok(`${label}: HTTP 502 proves reachability, not healthy service or loaded repair page`);
      mode = 'up'; privateDown = false; await p.locator('[data-recovery-check]').click();
      await p.waitForFunction(() => !!document.querySelector('[data-recovery].repair-ready'));
      const frame = p.frames().find(f => /\/troubleshoot\/$/.test(f.url())); assert.ok(frame); await frame.locator('header h1').waitFor();
      ok(`${label}: restoring connection attaches the existing repair home without reloading shell`);
      await p.screenshot({ path: path.join(out, `${label}-restored.png`) });
      // Delivered policy deliberately excludes the probe; real browser CSP must prevent a network request.
      await ctx.close();
      const blocked = await browser.newContext(); let hit = 0;
      await blocked.route(publicUrl, r => { hit++; return r.fulfill({ status: 204 }); });
      await blocked.route('**/troubleshoot/api/ping', r => r.abort());
      const bp = await blocked.newPage(); await bp.goto(`${host}/wizard-os-home/index.html?blockedProbe=1`);
      await bp.waitForFunction(() => !!window.WizReach);
      const c = await bp.evaluate(() => WizReach.checks()); assert.equal(c.internet.state, 'skip'); assert.equal(hit, 0); assert.match(c.help, /Tailscale/);
      ok(`${label}: delivered restrictive CSP blocks public probe and produces unknown, never offline`);
      await blocked.close();
      assert.deepEqual(escaped, []); assert.deepEqual(writes, []); assert.deepEqual(errors, []);
      ok(`${label}: zero escaped traffic, owner writes or browser errors`, { diagnosticRequests, probeRequests });
    }
    // No skin/kit host: the shell-local recovery content has a readable dark fallback.
    const p = await browser.newPage({ viewport: { width: 412, height: 892 } });
    await p.goto(`${host}/recovery-fallback/`);
    await p.waitForFunction(() => !!window.WizReach);
    await p.evaluate(() => { document.body.innerHTML = WizReach.recoveryHtml(); });
    const fallback = await p.locator('[data-recovery]').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
    assert.equal(fallback.bg, 'rgb(5, 3, 12)'); assert.notEqual(fallback.bg, fallback.fg);
    await p.screenshot({ path: path.join(out, 'phone-dark-fallback.png') }); ok('standalone dark fallback remains opaque and readable', fallback);
  } finally { await browser.close(); await new Promise(r => server.close(r)); fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify({ results, receipts }, null, 2)); }
})().catch(e => { console.error(e); fs.writeFileSync(path.join(out, 'failure.txt'), String(e.stack || e)); process.exitCode = 1; server.close(); });
