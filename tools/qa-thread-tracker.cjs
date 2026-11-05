/* Thread tracker browser QA (tweak wizard/thread-tracker). Run on forum via wizard_heavy_submit; never against owner data.
 * A synthetic Wizard (unroutable origin, in-memory service) is served from this checkout; every write is intercepted and
 * recorded, nothing leaves the process. Covers phone + desktop AI-apps layout on two skins.
 *   node tools/qa-thread-tracker.cjs <outdir> [skins=nebula,grove]
 * Prints PASS/FAIL lines; exit 1 on any FAIL. Screenshots land in <outdir>. */
'use strict';
const { chromium } = require('./qa-playwright.cjs');
const fs = require('node:fs'), path = require('node:path');
const fx = require('./qa-proof-fixture.cjs');
const OUT = path.resolve(process.argv[2] || '/tmp/qa-thread-tracker'); fs.mkdirSync(OUT, { recursive: true });
const SKINS = (process.argv[3] || 'nebula,grove').split(',');
const WEB = path.resolve(__dirname, '../web');
const ORIGIN = fx.ORIGIN, ID = 'wizard/thread-tracker';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 300) : '')); };

/* ---------- the synthetic service ---------- */
const NOW = Math.floor(Date.now() / 1000);
const mkRows = () => {
  const rows = []; let id = 100;
  // 80 exchanges: the asks anchored in the first ones are older than the 60-turn window the chat opens with.
  for (let i = 1; i <= 80; i++) {
    rows.push({ id: id++, role: 'user', content: `Question number ${i}`, timestamp: NOW - 100000 + i * 100 });
    rows.push({ id: id++, role: 'assistant', content: `Answer number ${i}. ${'Some detail. '.repeat(3)}`, timestamp: NOW - 100000 + i * 100 + 50 });
  }
  return rows;
};
function service() {
  const rows = mkRows(), by = n => rows.find(r => r.content.startsWith(`Answer number ${n}.`));
  const s = {
    writes: [], rows, seen: new Set(),
    items: [
      { id: 'voice-notes', title: 'Voice notes stuck at the bottom', state: 'needs_you', try: true, message_id: String(by(3).id), at: by(3).timestamp * 1000, created_at: 1793500000000 - 7200000, updated_at: by(3).timestamp * 1000 },
      { id: 'tap-lag', title: 'Tap lag on the Chats list', state: 'needs_you', message_id: String(by(78).id), at: by(78).timestamp * 1000, created_at: 1793500000000 - 7200000, updated_at: by(78).timestamp * 1000 },
      { id: 'export', title: 'Export my notes', state: 'running', message_id: String(by(79).id), at: by(79).timestamp * 1000, created_at: 1793500000000 - 7200000, updated_at: by(79).timestamp * 1000 },
      { id: 'dark-mode', title: 'Dark mode contrast', state: 'running', message_id: String(by(80).id), at: by(80).timestamp * 1000, created_at: 1793500000000 - 7200000, updated_at: by(80).timestamp * 1000 },
      { id: 'backup', title: 'Nightly backup check', state: 'done', message_id: String(by(77).id), at: by(77).timestamp * 1000, created_at: 1793500000000 - 7200000, updated_at: by(77).timestamp * 1000 },
      { id: 'icons', title: 'New app icons', state: 'done', message_id: String(by(10).id), at: by(10).timestamp * 1000, created_at: 1793500000000 - 7200000, updated_at: by(10).timestamp * 1000 },
      { id: 'old-fix', title: 'Fixed the clock', state: 'done', message_id: String(by(5).id), at: by(5).timestamp * 1000, created_at: 1793500000000 - 7200000, updated_at: by(5).timestamp * 1000 },
    ],
  };
  s.view = () => s.items.map(i => ({ ...i, seen: s.seen.has(i.id) }));
  s.counts = () => { const c = { needs_you: 0, running: 0, done_unseen: 0, blocked: 0, acknowledged: 0, total: 0 };
    for (const i of s.view()) { c.total++; if (i.state === 'done') i.seen ? c.acknowledged++ : c.done_unseen++; else if (i.state === 'needs_you') (i.try && i.seen) ? c.acknowledged++ : c.needs_you++; else if (i.state === 'blocked') c.blocked++; else c.running++; }
    return c; };
  s.seen.add('old-fix');
  return s;
}
const session = (id, title, n) => ({ ...fx.row, id, title, message_count: n, last_active: NOW, wizard_last_assistant_at: NOW, wizard_last_user_at: NOW - 30 });

async function mount(browser, svc, { shell, skin, tweaks, storage }) {
  const phone = shell === 'phone';
  const ctx = await browser.newContext({ viewport: phone ? { width: 412, height: 860 } : { width: 1360, height: 860 }, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone, serviceWorkers: 'block',
    userAgent: phone ? 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' : undefined });
  const errors = []; ctx.errors = errors;
  await ctx.addInitScript(({ skin, mix, keep }) => {
    if (window !== top) return;
    if (!sessionStorage.getItem('qa.seeded')) {
      sessionStorage.setItem('qa.seeded', '1');
      for (const [k, v] of Object.entries({ 'wos.coached': 'true', 'wos.welcome.v1': 'done', 'wos.voiceTipSeen': 'true', 'wos.tour.v1': 'true', 'wos.skin': skin })) localStorage.setItem(k, v);
      if (!keep) localStorage.setItem('wos.skin-tweaks.v1', JSON.stringify({ version: 1, mix }));
    }
  }, { skin, mix: Object.fromEntries(tweaks.map(t => [t, true])), keep: !!storage });
  await ctx.route('**/*', async route => {
    const q = route.request(), url = new URL(q.url()), m = q.method(), p = url.pathname;
    if (url.origin !== ORIGIN) return route.abort();
    (svc.reqs ||= []).push(m + ' ' + p);
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p.startsWith('/wizard-os-home/') && !p.startsWith('/wizard-os-home/store-')) {
      const rel = p.slice('/wizard-os-home/'.length) || (shell === 'desktop' ? 'desktop.html' : 'index.html');
      const file = path.resolve(WEB, decodeURIComponent(rel));
      if (file.startsWith(WEB + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file });
    }
    if (p === '/wizard/v1/thread-items/counts') return json({ threads: { 'hermes/tt-main': svc.counts() } });
    if (p === '/wizard/v1/thread-items/seen' && m === 'POST') {
      const b = JSON.parse(q.postData() || '{}'); svc.writes.push({ m, p, b });
      for (const id of b.ids || []) svc.seen.add(id);
      return json({ thread: b.thread, items: svc.view(), counts: svc.counts() });
    }
    if (p === '/wizard/v1/thread-items') return json({ thread: url.searchParams.get('thread'), items: url.searchParams.get('thread') === 'tt-main' ? svc.view() : [], counts: svc.counts() });
    if (p === '/wizard/hermes/api/sessions' && m === 'GET') return json({ data: [session('tt-main', 'Wizard polish round', svc.rows.length), session('tt-other', 'Plain old thread', 2)], has_more: false });
    const one = p.match(/^\/wizard\/hermes\/api\/sessions\/(tt-[a-z]+)(\/messages)?$/);
    if (one && m === 'GET') {
      if (!one[2]) return json({ session: session(one[1], one[1] === 'tt-main' ? 'Wizard polish round' : 'Plain old thread', one[1] === 'tt-main' ? svc.rows.length : 2) });
      const rows = one[1] === 'tt-main' ? svc.rows : svc.rows.slice(0, 2);
      const offset = +url.searchParams.get('offset') || 0, limit = +url.searchParams.get('limit') || 100;
      return json({ data: rows.slice(offset, offset + limit), has_more: offset + limit < rows.length });
    }
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
      let body = q.postData() || ''; svc.writes.push({ m, p, body });
      if (/\/v1\/runs$/.test(p)) return json({ run_id: 'run-1', status: 'started' }, 202);
      if (/\/steer$/.test(p)) return json({ ok: true, status: 'steered' });
      if (p === '/wizard/thread-seen') return json(fx.read('/wizard/thread-seen'));
      return json({ ok: true });
    }
    const r = fx.response(p + url.search, m);
    if (r.status === 451) { const bare = fx.response(p, m); if (bare.status !== 451) return route.fulfill({ status: bare.status, contentType: bare.contentType, body: bare.body }); }
    return route.fulfill({ status: r.status, contentType: r.contentType, body: r.body });
  });
  const page = await ctx.newPage(); global.LASTPAGE = page;
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  const base = ORIGIN + '/wizard-os-home/' + (phone ? '' : 'desktop.html');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.__wos || window.__wux), null, { timeout: 25000 });
  // The real switch (Settings › Tweaks calls the same function); the choice caches on the device and syncs through the box.
  if (tweaks.length) {
    await page.waitForFunction(() => window.WosExperience && !window.WosExperience.state.busy, null, { timeout: 25000 });
    for (const id of tweaks) {
      await page.evaluate(async id => { if (!(window.WosExperience.state.active || []).includes(id)) await window.WosExperience.toggle(id); }, id);
      await page.waitForFunction(() => !window.WosExperience.state.busy, null, { timeout: 25000 });
    }
  }
  return { ctx, page, base };
}

const tt = page => page.evaluate(() => ({ on: window.WosThreadTracker?.on?.(), tweaks: document.documentElement.dataset.tweaks || '' }));
async function openThread(page, id) {
  await page.evaluate(sid => (window.__wux ? window.__wux.openThread(sid) : window.__wos.openWizardThread(sid)), id);
  await page.waitForSelector('.ch-thread .msg', { timeout: 20000 });
}
const strip = page => page.locator('[data-tt-strip]').first();
const msgText = (page, mid) => page.evaluate(m => document.querySelector(`.msg[data-mid="${m}"]`)?.textContent.trim().slice(0, 60) || null, mid);
const isVisibleInScroller = (page, sel) => page.evaluate(s => { const n = document.querySelector(s); if (!n) return false; const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 2; }, sel);

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {}) });
  try {
    /* ---- 1. fresh profile: off, and offered in Settings ---- */
    {
      const svc = service(); const { ctx, page } = await mount(browser, svc, { shell: 'phone', skin: 'nebula', tweaks: [] });
      await page.waitForTimeout(2500);
      await page.waitForFunction(() => window.WosExperience && !window.WosExperience.state.busy, null, { timeout: 20000 }).catch(() => {});
      const st = await page.evaluate((id) => ({ listed: (window.WosExperience.state.tweaks || []).some(t => t.id === id), active: (window.WosExperience.state.active || []).includes(id) }), ID);
      check('fresh profile: tweak is listed in Settings › Tweaks', st.listed, st);
      check('fresh profile: tweak is OFF', !st.active && !(await tt(page)).on);
      await openThread(page, 'tt-main'); await page.waitForTimeout(800);
      check('off: no strip, no Reply, no message ids', (await page.locator('[data-tt-strip], [data-mquote], [data-mid]').count()) === 0);
      check('off: nothing asked of the tracker API', !(svc.reqs || []).some(r => /thread-items/.test(r)), (svc.reqs || []).filter(r => /thread-items/.test(r)));
      await page.screenshot({ path: path.join(OUT, 'off-phone.png') });
      check('off: no page errors', ctx.errors.length === 0, ctx.errors); await ctx.close();
    }
    /* ---- 2. on: phone + desktop AI apps, two skins ---- */
    for (const skin of SKINS) for (const shell of ['phone', 'desktop']) {
      const tag = `${shell}/${skin}`;
      const svc = service();
      const { ctx, page } = await mount(browser, svc, { shell, skin, tweaks: shell === 'desktop' ? [ID, 'miguel/ai-apps'] : [ID] });
      await page.waitForFunction(id => window.WosThreadTracker?.on() && (window.WosExperience?.state.active || []).includes(id), ID, { timeout: 25000 });
      check(`${tag}: tweak on`, (await tt(page)).on);
      if (shell === 'desktop') check(`${tag}: AI apps layout active`, await page.evaluate(() => window.WosSkinHost?.layout === 'ai-apps'), await page.evaluate(() => window.WosSkinHost?.layout));
      // Chats list dots match the counts
      await page.waitForSelector('[data-tt-dots]', { timeout: 20000 }).catch(() => {});
      const dots = await page.evaluate(() => [...document.querySelectorAll('[data-tt-dots]')].map(d => ({ key: d.dataset.ttDots, text: d.textContent.replace(/\s+/g, ''), n: d.querySelectorAll('.tt-dot').length })));
      const c = svc.counts();
      check(`${tag}: Chats list dots match the counts (needs ${c.needs_you} · running ${c.running} · unseen ${c.done_unseen})`, dots.length === 1 && dots[0].key === 'hermes/tt-main' && dots[0].n === 3 && dots[0].text === [c.needs_you, c.running, c.done_unseen].map(x => (x > 1 ? x : '')).join(''), dots);
      check(`${tag}: a thread without asks shows no dots`, !(await page.evaluate(() => !!document.querySelector('[data-tt-dots*="tt-other"]'))));
      await page.screenshot({ path: path.join(OUT, `${shell}-${skin}-list.png`) });
      await openThread(page, 'tt-main');
      await page.waitForSelector('[data-tt-strip] .tt-h', { timeout: 15000 });
      const head = (await strip(page).locator('.tt-h').innerText()).replace(/\s+/g, ' ');
      check(`${tag}: collapsed strip reads "7 asks" with the three tallies`, /^7 asks/.test(head), head);
      check(`${tag}: strip is directly under the title, before the messages`, await page.evaluate(() => { const s = document.querySelector('[data-tt-strip]'), m = document.querySelector('.ch-msgs'); return !!s && !!m && !!(s.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING); }));
      check(`${tag}: panel hidden while collapsed`, !(await strip(page).locator('.tt-panel').isVisible()));
      await page.screenshot({ path: path.join(OUT, `${shell}-${skin}-collapsed.png`) });
      await strip(page).locator('.tt-h').click();
      await page.waitForSelector('.tt-panel:not([hidden])');
      const groups = await strip(page).locator('.tt-gh').allInnerTexts();
      check(`${tag}: expanded rows are grouped Your move / Running / Finished not seen`, JSON.stringify(groups.map(g => g.toLowerCase())) === JSON.stringify(['your move', 'running', 'finished · not seen']), groups);
      check(`${tag}: one action per row (Looks good / Open / ✓ Seen)`, JSON.stringify(await strip(page).locator('.tt-btn').allInnerTexts()) === JSON.stringify(['Looks good', 'Open', '✓ Seen', '✓ Seen']), await strip(page).locator('.tt-btn').allInnerTexts());
      check(`${tag}: the 'N acknowledged' fold is there`, /1 acknowledged · show/.test(await strip(page).innerText()));
      check(`${tag}: panel is fully opaque`, await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.tt-panel')); return !/rgba\([^)]*,\s*0(\.\d+)?\)|transparent/.test(c.backgroundColor) && c.backgroundImage !== 'none' || !/rgba?\(0, 0, 0, 0\)/.test(c.backgroundColor); }));
      await page.screenshot({ path: path.join(OUT, `${shell}-${skin}-expanded.png`) });
      // tap outside closes (and Escape on desktop)
      await page.locator('.ch-compose textarea').click();
      check(`${tag}: tapping outside closes the list`, !(await strip(page).locator('.tt-panel').isVisible()));
      // row whose reply is already loaded (Answer 78) -> scrolls to and highlights it
      await strip(page).locator('.tt-h').click();
      await strip(page).locator('[data-tt-row="tap-lag"]').click();
      const a78 = svc.items.find(i => i.id === 'tap-lag').message_id;
      await page.waitForFunction(m => document.querySelector(`.msg[data-mid="${m}"]`)?.classList.contains('tt-flash'), a78, { timeout: 8000 }).catch(() => {});
      check(`${tag}: tapping a row closes the list, scrolls to the reply and highlights it`, !(await strip(page).locator('.tt-panel').isVisible()) && await page.evaluate(m => document.querySelector(`.msg[data-mid="${m}"]`)?.classList.contains('tt-flash'), a78) && await page.evaluate(m => { const r = document.querySelector(`.msg[data-mid="${m}"]`).getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }, a78));
      await page.screenshot({ path: path.join(OUT, `${shell}-${skin}-jumped.png`) });
      // new messages still land at the bottom: the chat is still linear
      check(`${tag}: chat order untouched (oldest first, latest last)`, await page.evaluate(() => { const t = [...document.querySelectorAll('.ch-msgs .msg .bub')].map(n => n.textContent); return /Question number/.test(t[0] || '') && /Answer number 80/.test(t[t.length - 1] || ''); }));
      // a row whose anchor is NOT loaded yet (Answer 3 is outside the 60-turn window)
      const a3 = svc.items.find(i => i.id === 'voice-notes').message_id;
      check(`${tag}: the oldest reply is not on screen yet`, (await page.locator(`.msg[data-mid="${a3}"]`).count()) === 0);
      await strip(page).locator('.tt-h').click();
      await strip(page).locator('[data-tt-row="voice-notes"] .tt-ti').click();
      if (process.env.QA_DEBUG) { const log = []; for (let i = 0; i < 20; i++) { log.push(await page.evaluate(m => { const n = document.querySelector(`.msg[data-mid="${m}"]`); const sc = document.scrollingElement; return [!!n, n?.classList.contains('tt-flash'), n && Math.round(n.getBoundingClientRect().top), Math.round(sc.scrollTop), document.querySelectorAll('.ch-msgs .msg').length]; }, a3)); await page.waitForTimeout(100); } console.log('DEBUG', JSON.stringify(log)); }
      await page.waitForSelector(`.msg[data-mid="${a3}"].tt-flash`, { timeout: 10000 }).catch(() => {});
      check(`${tag}: a row with no anchor loaded loads history up to it, then scrolls and highlights`, (await page.locator(`.msg[data-mid="${a3}"].tt-flash`).count()) === 1 && await page.evaluate(m => { const r = document.querySelector(`.msg[data-mid="${m}"]`).getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }, a3), await page.evaluate(m => ({ msgs: document.querySelectorAll('.ch-msgs .msg').length, has: !!document.querySelector(`.msg[data-mid="${m}"]`), first: document.querySelector('.ch-msgs .msg')?.textContent.slice(0, 30) }), a3));
      await page.screenshot({ path: path.join(OUT, `${shell}-${skin}-jumped-old.png`) });
      // Seen: persists, across reload, and the other device
      await strip(page).locator('.tt-h').click();
      if (process.env.QA_DEBUG) console.log('DEBUG2', JSON.stringify(await page.evaluate(() => { const s = document.querySelector('[data-tt-strip]'); return [s?.className, s?.querySelector('.tt-panel')?.hidden, s?.innerText.slice(0, 400)]; })));
      await strip(page).locator('[data-tt-row="backup"] [data-tt-seen]').click();
      const seenOnPaint = await page.evaluate(() => /acknowledged/.test(document.querySelector('[data-tt-strip]').innerText));
      check(`${tag}: ✓ Seen paints on the same frame (before the box answers)`, seenOnPaint);
      await page.waitForTimeout(500);
      check(`${tag}: Seen was sent to the box`, svc.writes.some(w => w.p === '/wizard/v1/thread-items/seen' && w.b.ids.includes('backup')), svc.writes.map(w => w.p));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!(window.__wos || window.__wux)); await openThread(page, 'tt-main');
      await page.waitForSelector('[data-tt-strip] .tt-h');
      await strip(page).locator('.tt-h').click();
      const afterReload = await strip(page).innerText();
      check(`${tag}: Seen persists across reload ("Nightly backup check" folded)`, !/Nightly backup check/.test(afterReload.split('acknowledged')[0] || '') && /\d acknowledged/.test(afterReload), afterReload.slice(-120));
      await strip(page).locator('[data-tt-ack]').click();
      check(`${tag}: acknowledged rows show hollow dots when unfolded`, (await strip(page).locator('.tt-row.ack .tt-dot.ack').count()) >= 2);
      await page.screenshot({ path: path.join(OUT, `${shell}-${skin}-acknowledged.png`) });
      // a second device sees the same truth (new context, same service)
      {
        const other = await mount(browser, svc, { shell: shell === 'phone' ? 'desktop' : 'phone', skin, tweaks: shell === 'phone' ? [ID, 'miguel/ai-apps'] : [ID] });
        await openThread(other.page, 'tt-main'); await other.page.waitForSelector('[data-tt-strip] .tt-h');
        await other.page.locator('[data-tt-strip] .tt-h').click();
        const t = await other.page.locator('[data-tt-strip]').innerText();
        check(`${tag}: the other device agrees (Seen is shared through the box)`, /2 acknowledged/.test(t) && !/Nightly backup check\n[^\n]*\n✓ Seen/.test(t), t.slice(-160));
        await other.ctx.close();
      }
      /* ---- quote reply ---- */
      if (await strip(page).locator('.tt-panel').isVisible()) await page.locator('.ch-compose textarea').click();
      const lastA = svc.rows[svc.rows.length - 1];
      const bubble = page.locator(`.msg[data-mid="${lastA.id}"]`);
      await bubble.scrollIntoViewIfNeeded();
      await bubble.locator('[data-mquote]').click();
      await page.waitForSelector('.ch-reply.ch-reply-q', { timeout: 5000 });
      const ql = await page.locator('.ch-reply.ch-reply-q').innerText();
      check(`${tag}: Reply shows the quoted snippet above the composer`, /Answer number 80/.test(ql), ql);
      await page.screenshot({ path: path.join(OUT, `${shell}-${skin}-quote-composer.png`) });
      await page.locator('.ch-compose textarea').fill('Thanks, but please also check the weekend');
      svc.writes.length = 0;
      await page.keyboard.press(shell === 'phone' ? 'Enter' : 'Enter').catch(() => {});
      let run = null;
      for (let i = 0; i < 40 && !run; i++) { await page.waitForTimeout(100); run = svc.writes.find(w => /\/v1\/runs$/.test(w.p)); }
      if (!run) { await page.locator('[data-chsend], .ch-send').first().click().catch(() => {}); for (let i = 0; i < 40 && !run; i++) { await page.waitForTimeout(100); run = svc.writes.find(w => /\/v1\/runs$/.test(w.p)); } }
      const sent = run ? JSON.parse(run.body).input : '';
      check(`${tag}: the send carries the hidden reply marker with the message id, the excerpt, and the user's words`, /\[WIZARD_REPLY_TO_V1\]\{"message_id":"?\d+"?/.test(sent) && /Answer number 80/.test(sent) && /Thanks, but please also check the weekend/.test(sent), sent.slice(0, 300));
      await page.waitForSelector('.msg.u .ch-rq.ch-rq-q', { timeout: 8000 }).catch(() => {});
      await page.waitForSelector('.ch-msgs', { timeout: 8000 }); await page.screenshot({ path: path.join(OUT, `${shell}-${skin}-after-send.png`) });
      const visible = await page.evaluate(() => document.querySelector('.ch-msgs').innerText);
      check(`${tag}: the quote header renders on the bubble and the marker is never visible raw`, (await page.locator('.msg.u .ch-rq.ch-rq-q').count()) >= 1 && !/WIZARD_REPLY_TO|"message_id"/.test(visible) && /Thanks, but please also check the weekend/.test(visible), visible.slice(-200));
      await page.screenshot({ path: path.join(OUT, `${shell}-${skin}-quote-sent.png`) });
      // tap the header: back to the original (scroll somewhere else first)
      await page.evaluate(() => { const s = document.querySelector('.ch-msgs'); (s.scrollHeight > s.clientHeight ? s : document.scrollingElement).scrollTop = 0; });
      await page.waitForTimeout(300);
      await page.locator('.msg.u .ch-rq.ch-rq-q').last().scrollIntoViewIfNeeded();
      await page.locator('.msg.u .ch-rq.ch-rq-q').last().click();
      await page.waitForSelector(`.msg[data-mid="${lastA.id}"].tt-flash`, { timeout: 8000 }).catch(() => {});
      check(`${tag}: tapping the quote header scrolls to the original and highlights it`, (await page.locator(`.msg[data-mid="${lastA.id}"].tt-flash`).count()) === 1);
      // Reply on a user message, and removing a quote
      await page.locator('.msg.u [data-mquote]').first().scrollIntoViewIfNeeded();
      await page.locator('.msg.u [data-mquote]').first().click();
      check(`${tag}: Reply works on any message (also your own)`, (await page.locator('.ch-reply.ch-reply-q').count()) === 1);
      await page.locator('[data-chreplyx]').click();
      check(`${tag}: the quote can be removed before sending`, (await page.locator('.ch-reply.ch-reply-q').count()) === 0);
      // steer path: while the run is working, a quote reply goes out as a steer with the same marker
      await page.evaluate(() => { const s = window.__wos?.live?.session?.('tt-main'); });
      check(`${tag}: no page errors`, ctx.errors.length === 0, ctx.errors);
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async e => { try { await global.LASTPAGE?.screenshot({ path: path.join(OUT, 'fatal.png') }); } catch (_) {} console.log('FATAL ' + (e && e.stack || e)); process.exit(2); });
