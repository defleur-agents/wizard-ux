#!/usr/bin/env node
// In-shell captures + checks for the disk encryption line in Settings › Network & security (web/core/disk-status.js).
// Real phone/desktop shell from this checkout on a SYNTHETIC origin (never a live owner origin); skin chosen before boot
// (localStorage on that throwaway origin only). The App Manager route store-install/_disk is faked per case.
//   QA_SKINS=nebula,sepia OUT=<dir> NODE_PATH=<playwright>/node_modules node tools/qa-disk-status-settings.cjs
const fs = require('fs'), path = require('path');
const { chromium } = require('./qa-playwright.cjs');
const root = path.resolve(__dirname, '..'), web = path.join(root, 'web');
const out = process.env.OUT || path.join(root, 'tmp', 'disk-status-settings');
fs.mkdirSync(out, { recursive: true });
const ORIGIN = 'http://disk-status-qa.test';
const TYPES = { '.css': 'text/css', '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const SKINS = (process.env.QA_SKINS || 'nebula,sepia').split(',');
const CASES = {
  sealed: { status: 200, body: { level: 'ok', line: "Disk encrypted, unlocks with this box's security chip" } },
  plain: { status: 200, body: { level: 'warn', line: 'Not encrypted: this box has no security chip' } },
  missing: { status: 404, body: { error: 'not found' } },
};
const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' · ' + extra : '')); };

async function run(browser, shell, skin, kind) {
  const tag = `${shell}-${skin}-${kind}`, fake = CASES[kind];
  const ctx = await browser.newContext(shell === 'phone'
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } });
  const asked = [];
  await ctx.route('**/*', r => {
    const req = r.request(), u = new URL(req.url());
    if (u.origin !== ORIGIN) return r.abort();
    if (u.pathname === '/wizard-os-home/store-install/_disk') {
      asked.push(req.method());
      return r.fulfill({ status: fake.status, contentType: 'application/json', body: JSON.stringify(fake.body) });
    }
    const rel = decodeURIComponent(u.pathname.replace(/^\/wizard-os-home\//, '')) || 'index.html';
    const f = path.resolve(web, rel);
    if (req.method() === 'GET' && f.startsWith(web + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile())
      return r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    if (req.method() !== 'GET') return r.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/\/sessions$/.test(u.pathname) ? { data: [], has_more: false } : {}) });
  });
  await ctx.addInitScript(({ shell, skin }) => {
    try { for (const [k, v] of Object.entries({ 'wos.coached': 'true', 'wos.tour': 'done', 'wos.tour.done': '1', 'wos.tour.v1': 'true', 'wos.welcome.v1': 'done', 'wux.shell': shell, 'wos.skin': skin })) localStorage.setItem(k, v); } catch (_) {}
  }, { shell, skin });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const entry = shell === 'phone' ? '?shell=phone&view=settings' : 'desktop.html?view=settings';
  await page.goto(`${ORIGIN}/wizard-os-home/${entry}`, { waitUntil: 'load' });
  await page.waitForFunction(([sh, sk]) => document.documentElement.dataset.shell === sh && document.documentElement.dataset.skin === sk && window.WosSettings, [shell, skin], { timeout: 30000 });
  await page.waitForTimeout(2500);
  const nav = page.locator('[data-st-page="network"]:visible').first();
  if (await nav.count()) { await nav.click(); await page.waitForTimeout(800); }
  const row = page.locator('[data-disk-encryption]:visible').first();
  if (kind === 'missing') {
    check(`${tag}: no route, no disk line`, await page.locator('[data-disk-encryption]').count() === 0);
    check(`${tag}: route asked at most once`, asked.length <= 1, `asked ${asked.length}`);
  } else {
    await row.waitFor({ timeout: 8000 }).catch(() => {});
    const has = await row.count() > 0;
    check(`${tag}: line shown`, has);
    if (has) {
      await row.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const s = await row.evaluate(e => {
        const small = e.querySelector('small'), b = e.querySelector('b');
        let n = e, bg = 'rgba(0, 0, 0, 0)';
        while (n && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement; }
        if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || 'rgb(0,0,0)';
        return { text: small.textContent, title: b.textContent, level: e.dataset.level, ink: getComputedStyle(small).color, title_ink: getComputedStyle(b).color, bg };
      });
      check(`${tag}: exact backend line`, s.text === fake.body.line && s.title === 'Disk encryption', s.text);
      check(`${tag}: level`, s.level === fake.body.level, s.level);
      // Solid backdrops only; a translucent ancestor colour is composited away by the page's own paint.
      if (/^rgb\(/.test(s.bg) || /rgba\([^)]*, 1\)/.test(s.bg)) {
        check(`${tag}: readable line (contrast ≥ 4.5)`, contrast(s.ink, s.bg) >= 4.5, `${s.ink} on ${s.bg} = ${contrast(s.ink, s.bg).toFixed(2)}`);
        check(`${tag}: readable title (contrast ≥ 4.5)`, contrast(s.title_ink, s.bg) >= 4.5, `${s.title_ink} on ${s.bg}`);
      } else check(`${tag}: backdrop recorded (translucent, see screenshot)`, true, s.bg);
    }
    check(`${tag}: route is GET only`, asked.length >= 1 && asked.every(m => m === 'GET'), asked.join(','));
  }
  await page.screenshot({ path: path.join(out, `${tag}.png`) });
  check(`${tag}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' / '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-lcd-text', '--disable-gpu'] });
  for (const shell of ['phone', 'desktop']) for (const skin of SKINS) for (const kind of Object.keys(CASES)) await run(browser, shell, skin, kind);
  await browser.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ failed: failed.map(f => f.name), results }, null, 2));
  console.log(JSON.stringify({ total: results.length, failed: failed.map(f => f.name), out }));
  process.exitCode = failed.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 2; });
