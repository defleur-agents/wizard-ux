// A follow-up typed while a thread shows Working, when Hermes answers 409 run_not_accepting_steer although the run
// still reads running (claude-sonnet-5-5, 7 Nov 2026): the message must become a queued same-thread follow-up
// ("Sent"), never "Not sent · Run is not currently accepting steer input". Phone + desktop, two skins each.
// Synthetic data, every write intercepted; nothing reaches a real Wizard.
// Usage: QA_TREE=<repo> QA_PLAYWRIGHT=<playwright> QA_OUT=<dir> node qa-steer-rejected-running.cjs
const fs = require('fs'), path = require('path');
const { chromium } = require('./tools/qa-playwright.cjs');
const TREE = process.env.QA_TREE || __dirname;
const OUT = process.env.QA_OUT || path.join(require('os').tmpdir(), 'wizard-steer-rejected-running');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d === '' ? '' : ' ' + JSON.stringify(d)}`); };
const now = Date.now() / 1000;
const RUN = 'wizardq_' + 'a'.repeat(32), SID = 'qa_steer_running';
let rid = 1;
const row = (role, content, ts, extra = {}) => ({ id: rid++, session_id: SID, role, content, timestamp: ts, ...extra });
const rows = [row('user', 'Please audit the reader top bar', now - 120), row('assistant', '', now - 110, { tool_calls: [{ id: 'c1', function: { name: 'terminal' } }] }), row('tool', 'ok', now - 100, { tool_call_id: 'c1' })];
const sess = () => { const last = rows[rows.length - 1], lastU = [...rows].reverse().find(r => r.role === 'user' && !r.display_kind); return { id: SID, source: 'wizard-mobile', title: 'QA · Working thread', status: 'running', archived: false, hidden: false, message_count: rows.length, started_at: now - 600, last_active: last.timestamp, wizard_last_user_at: lastU.timestamp, wizard_activity_at: last.timestamp, wizard_run_id: RUN, model: 'claude-sonnet-5-5', provider: 'anthropic', latest_message: { role: last.role, content: String(last.content || '').slice(0, 200), timestamp: last.timestamp }, last_user_message: { role: 'user', content: lastU.content, timestamp: lastU.timestamp } }; };
const writes = [], errors = [];
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const handler = async route => {
  const req = route.request(), u = new URL(req.url()), m = req.method();
  if (u.hostname !== 'wizard.test') return route.abort();
  const rel = u.pathname.match(/^\/wizard-os-home\/(.*)$/);
  if (rel && ['GET', 'HEAD'].includes(m)) {
    const f = (rel[1] || 'index.html').split('?')[0], file = path.join(TREE, 'web', f);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    const ct = f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : f.endsWith('.json') ? 'application/json' : f.endsWith('.png') ? 'image/png' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/javascript';
    return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(file) });
  }
  if (!['GET', 'HEAD'].includes(m)) {
    const body = req.postData() || ''; writes.push({ m, p: u.pathname, body });
    if (/\/v1\/runs\/[^/]+\/steer$/.test(u.pathname)) return json(route, 409, { error: { code: 'run_not_accepting_steer', message: `Run is not currently accepting steer input: ${RUN}` } });
    if (/\/v1\/runs$/.test(u.pathname)) return json(route, 202, { run_id: 'wizardq_' + 'b'.repeat(32), status: 'queued' });
    return json(route, 200, { ok: true, record: {} });
  }
  if (u.pathname === '/wizard/v1/agents') return json(route, 200, { agents: [{ id: 'hermes', is_default: true, label: 'Hermes', harness: 'hermes', privacy: 'standard', status: 'running' }] });
  if (u.pathname === '/wizard/hermes/api/sessions') return json(route, 200, { object: 'list', data: (u.searchParams.get('offset') || '0') === '0' ? [sess()] : [], has_more: false, limit: 100, offset: 0, snapshot: 'qa' });
  if (u.pathname === `/wizard/hermes/api/sessions/${SID}/messages`) return json(route, 200, { data: rows, messages: rows, total: rows.length });
  if (u.pathname === `/wizard/hermes/api/sessions/${SID}`) return json(route, 200, { session: sess() });
  if (u.pathname === `/wizard/hermes/v1/runs/${RUN}`) return json(route, 200, { run_id: RUN, session_id: SID, status: 'running', last_event: 'run.started' });
  if (u.pathname === '/wizard/thread-seen') return json(route, 200, { state: { initializedAt: 1, threads: {} } });
  if (u.pathname === '/wizard/v1/boomerangs') return json(route, 200, { reminders: [] });
  if (u.pathname.startsWith('/wizard/')) return json(route, 200, {});
  return route.fulfill({ status: 404, body: '' });
};
const settle = page => page.waitForFunction(() => window.WosExperience && !WosExperience.state.busy, null, { timeout: 15000 }).then(() => sleep(250)).then(() => page.evaluate(() => document.getElementById('wosWelcome')?.remove()));
const setSkin = async (page, id) => {
  await page.evaluate(id => WosSkin.set(id), id); await sleep(150);
  if (await page.$('.nv-boot')) { await page.locator('.nv-boot').click({ position: { x: 10, y: 10 } }).catch(() => {}); await page.waitForSelector('.nv-boot', { state: 'detached', timeout: 3000 }).catch(() => {}); }
  await settle(page); await sleep(500);
};
const state = (page, text) => page.evaluate(text => ({
  pending: [...document.querySelectorAll('.msg.u.pending')].filter(e => e.textContent.includes(text)).map(e => ({ cls: e.className, meta: e.querySelector('.pmeta')?.textContent.trim() })),
  bubbles: [...document.querySelectorAll('.msg.u')].filter(e => e.textContent.includes(text)).length,
  items: (window.WosOutbox ? WosOutbox.forThread('qa_steer_running') : []).map(i => ({ state: i.state, error: i.error, steered: i.steered })),
}), text);
const waitFor = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(250); } return false; };

async function run(browser, kind, skins) {
  const phone = kind === 'phone';
  const ctx = await browser.newContext(phone ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.route('**/*', handler);
  await ctx.addInitScript(() => { try { localStorage.setItem('wos.coached', 'true'); localStorage.setItem('wos.tour.v1', 'true'); localStorage.setItem('wos.tour.done', '1'); } catch (_) {} });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(`${kind}: ${e}`));
  await page.goto('https://wizard.test/wizard-os-home/', { waitUntil: 'load' });
  await page.waitForFunction(k => k === 'phone' ? window.__wos && window.WizLive : document.documentElement.dataset.shell === 'desktop' && window.__wux && window.WizLive, kind, { timeout: 30000 });
  await settle(page);
  for (const skin of skins) {
    await setSkin(page, skin);
    // Fresh message per skin so each pass shows its own queued follow-up.
    const text = `Also check the tablet layout (${kind}/${skin})`;
    const A = await page.evaluate(() => !!window.__wos);
    await page.evaluate(({ A, sid }) => A ? __wos.openWizardThread(sid) : __wux.openThread(sid), { A, sid: SID });
    await page.waitForSelector('.ch-compose textarea', { timeout: 20000 }); await sleep(600);
    const placeholder = await page.evaluate(() => document.querySelector('.ch-compose textarea')?.placeholder || '');
    ok(/^Steer/.test(placeholder), `${kind}/${skin}: a working thread composes a steer`, placeholder);
    const before = writes.length;
    await page.fill('.ch-compose textarea', text);
    await page.click('.ch-compose button[type=submit]');
    ok(await waitFor(async () => (await state(page, text)).items.some(i => i.state === 'sent'), 15000), `${kind}/${skin}: outbox item ends sent`, await state(page, text));
    await sleep(600);
    const s = await state(page, text);
    const mine = writes.slice(before);
    const steers = mine.filter(w => /\/steer$/.test(w.p)), runs = mine.filter(w => /\/v1\/runs$/.test(w.p));
    ok(steers.length === 1, `${kind}/${skin}: exactly one steer attempt`, steers.length);
    ok(runs.length === 1 && JSON.parse(runs[0].body).session_id === SID && JSON.parse(runs[0].body).input === text, `${kind}/${skin}: exactly one same-thread new-turn POST with the words`, runs.map(r => r.body));
    ok(s.bubbles === 1, `${kind}/${skin}: one bubble, no duplicate`, s);
    ok(s.pending.length === 1 && !/Not sent|not currently accepting/i.test(s.pending[0].meta) && /^Sent/.test(s.pending[0].meta), `${kind}/${skin}: shows Sent, not Not sent`, s.pending);
    ok(!/Run is not currently accepting steer/.test(await page.evaluate(() => document.body.innerText)), `${kind}/${skin}: no steer-rejection text anywhere`);
    await page.screenshot({ path: path.join(OUT, `${kind}-${skin}-queued-followup.png`) });
    // The service launches the held turn when the working run ends: its user row lands in history.
    rows.push(row('user', text, Date.now() / 1000), row('assistant', 'Checked the tablet layout.', Date.now() / 1000 + 1));
    await page.evaluate(() => WizLive.refresh());
    const gone = await waitFor(async () => { const st = await state(page, text); return st.pending.length === 0 && st.bubbles === 1; }, 20000);
    ok(gone, `${kind}/${skin}: once history has the turn there is a single bubble and no pending row`, await state(page, text));
    await page.screenshot({ path: path.join(OUT, `${kind}-${skin}-landed.png`) });
    ok(!(await state(page, text)).items.some(i => i.state === 'failed'), `${kind}/${skin}: nothing failed`);
  }
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await run(browser, 'phone', ['nebula', 'sepia']);
  await run(browser, 'desktop', ['grove', 'landscapes']);
  ok(errors.length === 0, 'no page errors', errors);
  console.log(`${pass}/${pass + fail} passed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
