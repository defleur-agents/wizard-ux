// Archive sits on top of the Chats list in both layouts (By status and By day), on desktop and phone (James, 31 Oct 2026).
// Renders the real core/chats.css (+ obsidian skin on phone) against a minimal By-status DOM; no network, no writes.
const { chromium } = require('./tools/qa-playwright.cjs');
const fs = require('fs'), path = require('path');
const WEB = process.env.QA_WEB_DIR ? path.join(process.env.QA_WEB_DIR, 'web') : path.join(__dirname, 'web');
const css = fs.readFileSync(path.join(WEB, 'core/chats.css'), 'utf8');
const obsidian = fs.readFileSync(path.join(WEB, 'skins/obsidian/skin.css'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? (pass++, console.log('PASS', n)) : (fail++, console.log('FAIL', n, x)); };
const LAYOUT = { status: ['errors', 'working', 'ready', 'deferred', 'archive'], day: ['errors', 'working', 'ready', 'yesterday', 'pastWeek', 'deferred', 'archive'] };
const page = (shell, skin, extra = '', lay = 'status', secs = LAYOUT[lay]) => `<!doctype html><html data-shell="${shell}"${skin ? ` data-skin="${skin}"` : ''}><style>:root{--ink:#fff;--bg:#000;--line:#333}body{margin:0}.ch-list{height:800px;display:flex;flex-direction:column}${css}${extra}</style><body><div class="ch-list${lay === 'status' ? ' by-status' : ''}"><div class="ch-scroll">${secs.map(k => `<section class="ch-sec" data-sec="${k}"><div class="ch-sec-h" style="height:40px">${k}</div><div class="ch-sec-b" style="height:60px"></div></section>`).join('')}</div></div></body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
  for (const lay of ['status', 'day']) for (const [label0, vp, shell, skin, extra] of [['desktop', { width: 1200, height: 900 }, 'desktop', '', ''], ['phone', { width: 412, height: 892 }, '', '', ''], ['phone, obsidian skin', { width: 412, height: 892 }, '', 'obsidian', obsidian]]) {
    const label = `By ${lay}, ${label0}`;
    const p = await (await b.newContext({ viewport: vp })).newPage();
    await p.setContent(page(shell, skin, extra, lay));
    const ys = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.ch-sec')].map(e => [e.dataset.sec, e.getBoundingClientRect().top])));
    const order = Object.keys(ys).sort((a, c) => ys[a] - ys[c]);
    ok(order[0] === 'archive' || (skin && order[0] === 'errors' && order[1] === 'archive') || (skin && order.indexOf('archive') < order.indexOf('ready')), `${label}: Archive above Ready`, order.join('>'));
    if (!skin && lay === 'status') ok(order.indexOf('ready') > order.indexOf('working') && order.indexOf('working') > order.indexOf('archive'), `${label}: Archive > Working > Ready`, order.join('>'));
    if (!skin && lay === 'day') ok(order.join('>') === 'archive>errors>working>ready>yesterday>pastWeek>deferred', `${label}: Archive first, day order kept below`, order.join('>'));
  }
  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
