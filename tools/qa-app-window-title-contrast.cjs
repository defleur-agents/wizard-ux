#!/usr/bin/env node
// App window titles stay readable on every skin. Landscapes Light gave an app window a dark title over a dark app:
// the light skin's ink on the glass the app frame shows through. The real desktop shell from this checkout opens a
// synthetic app that paints its own dark page (most third-party apps ignore the skin) and one that paints a light
// page, on each skin; per window it measures the title's contrast against the pixels actually behind it.
// Desktop opens both side by side; the phone opens each in turn (there the shell measures the app's top colour).
// Usage: OUT=<dir> QA_SKINS=landscapes-light,nebula [QA_SHELLS=desktop,phone] node tools/qa-app-window-title-contrast.cjs
// APIs answer empty; no network.
const fs = require('fs'), path = require('path');
const { chromium } = require('./qa-playwright.cjs');
const root = path.resolve(__dirname, '..'), web = path.join(root, 'web');
const out = process.env.OUT || path.join(root, 'tmp', 'app-window-title-contrast');
fs.mkdirSync(out, { recursive: true });
const ORIGIN = 'http://title-contrast.test';
const TYPES = { '.css': 'text/css', '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const SKINS = (process.env.QA_SKINS || 'landscapes-light,nebula,landscapes,grove').split(',');
const SHELLS = (process.env.QA_SHELLS || 'desktop,phone').split(',');
const MIN = Number(process.env.QA_MIN_CONTRAST || 3);
const APP = bg => `<!doctype html><meta charset=utf-8><title>Synthetic</title><body style="margin:0;background:${bg};color:${bg === '#05060f' ? '#e8e8f0' : '#111'};font:15px sans-serif;height:100vh"><p style="padding:40px">Synthetic app page (${bg})</p>`;
const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-lcd-text', '--disable-gpu'], ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {}) });
  const rows = [];
  for (const shell of SHELLS) for (const skin of SKINS) for (const only of shell === 'phone' ? ['synthetic-dark', 'synthetic-light'] : ['']) {
    const ctx = await browser.newContext(shell === 'phone'
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' }
      : { viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await ctx.route('**/*', r => {
      const req = r.request(), u = new URL(req.url());
      if (u.origin !== ORIGIN) return r.abort();
      if (u.pathname.startsWith('/synthetic-dark/')) return r.fulfill({ status: 200, contentType: 'text/html', body: APP('#05060f') });
      if (u.pathname.startsWith('/synthetic-light/')) return r.fulfill({ status: 200, contentType: 'text/html', body: APP('#fafafa') });
      const rel = decodeURIComponent(u.pathname.replace(/^\/wizard-os-home\//, '')) || 'index.html';
      const f = path.resolve(web, rel);
      if (req.method() === 'GET' && f.startsWith(web + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile())
        return r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
      if (req.method() !== 'GET') return r.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/\/sessions$/.test(u.pathname) ? { data: [], has_more: false } : {}) });
    });
    await ctx.addInitScript(([skin, shell]) => {
      try { localStorage.setItem('wos.coached', 'true'); localStorage.setItem('wos.tour', 'done'); localStorage.setItem('wos.tour.done', '1');
        localStorage.setItem('wos.tour.v1', 'true'); localStorage.setItem('wux.shell', shell); localStorage.setItem('wos.skin', skin);
        localStorage.setItem('wos.wsync.off', 'true'); } catch (_) {}
    }, [skin, shell]);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/wizard-os-home/${shell === 'phone' ? '?shell=phone' : 'desktop.html'}`, { waitUntil: 'load' });
    await page.waitForFunction(([sk, g]) => document.documentElement.dataset.skin === sk && window[g], [skin, shell === 'phone' ? '__wos' : '__wux'], { timeout: 30000 });
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByText('Skip', { exact: true }).click({ timeout: 800 }).catch(() => {});
    for (const app of only ? [only] : ['synthetic-dark', 'synthetic-light']) {
      const title = app === 'synthetic-dark' ? 'Dark app' : 'Light app';
      if (shell === 'phone') await page.evaluate(([id, name]) => window.__wos.openWin({ app: 'frame', appId: id, url: `/${id}/`, title: name }), [app, title]);
      else await page.evaluate(([id, name]) => window.__wux.newWin({ app: 'frame', appId: id, url: `/${id}/`, title: name }), [app, title]);
    }
    await page.waitForTimeout(2500); // package CSS, photo background and frames settle
    const file = path.join(out, `${shell}-${skin}${only ? '-' + only : ''}.png`);
    await page.screenshot({ path: file });
    const titles = await page.evaluate(() => [...document.querySelectorAll('.win')].filter(w => w.querySelector('iframe') && w.getClientRects().length && getComputedStyle(w).visibility !== 'hidden').map(w => {
      const t = w.querySelector('.wbar .t, .wbar .wt'); const b = t.getBoundingClientRect();
      // Text colour from the computed style; background sampled from the screenshot under the title box.
      return { app: w.querySelector('iframe').getAttribute('src'), text: getComputedStyle(t).color, focus: w.classList.contains('focus'),
        box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, label: t.textContent.trim().slice(0, 40) };
    }));
    for (const t of titles) {
      // Behind the title: hide its text for one frame, then take the median pixel of the title box.
      const clip = { x: t.box.x, y: t.box.y, width: Math.max(4, t.box.w), height: Math.max(4, t.box.h) };
      await page.evaluate(src => { const w = [...document.querySelectorAll('.win')].find(w => w.querySelector('iframe')?.getAttribute('src') === src); w.querySelector('.wbar .t, .wbar .wt').style.visibility = 'hidden'; }, t.app);
      const bgShot = await page.screenshot({ clip });
      await page.evaluate(src => { const w = [...document.querySelectorAll('.win')].find(w => w.querySelector('iframe')?.getAttribute('src') === src); w.querySelector('.wbar .t, .wbar .wt').style.visibility = ''; }, t.app);
      const bg = await page.evaluate(async b64 => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data; const px = [];
        for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
        px.sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2])); return px[Math.floor(px.length / 2)];
      }, bgShot.toString('base64'));
      const text = t.text.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      rows.push({ shell, skin, app: t.app, edgeLight: await page.evaluate(src => !![...document.querySelectorAll('.win.edge-light iframe')].find(f => f.getAttribute('src') === src), t.app), label: t.label, focus: t.focus, text: t.text, behind: `rgb(${bg.join(', ')})`, contrast: +ratio(text, bg).toFixed(2) });
    }
    await ctx.close();
  }
  await browser.close();
  const bad = rows.filter(r => r.contrast < MIN);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ min: MIN, rows, bad }, null, 2));
  for (const r of rows) console.log(`${r.shell.padEnd(8)}${r.skin.padEnd(17)} ${r.app.padEnd(19)} title ${r.text.padEnd(22)} behind ${r.behind.padEnd(20)} contrast ${r.contrast}${r.contrast < MIN ? '  << unreadable' : ''}`);
  console.log(bad.length ? `FAIL ${bad.length} title(s) under ${MIN}:1` : 'PASS');
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
