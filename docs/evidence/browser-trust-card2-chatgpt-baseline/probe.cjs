// Baseline: the REAL ChatGPT connection page (oscarhenrycollins/chatgpt-connection static/ at origin/main) inside the
// boundary's opaque frame attributes, against a stub of its own api/ that records every request. Synthetic only.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.QA_PLAYWRIGHT);
const dir = __dirname, out = path.join(dir, 'out'); fs.mkdirSync(out, { recursive: true });
const seen = [];
const accounts = { accounts: [{ name: 'ChatGPT', detail: 'Synthetic subscription', status: 'connected', account: 'synthetic@example.invalid', in_use: false, model: 'gpt-synthetic' }] };
const srv = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  seen.push({ method: req.method, path: p, origin: req.headers.origin ?? '', site: req.headers['sec-fetch-site'] || '' });
  if (p === '/host') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><body style="margin:0;background:#111"><iframe id="f" sandbox="allow-scripts allow-forms allow-downloads" referrerpolicy="no-referrer" src="/chatgpt/" style="width:900px;height:640px;border:0"></iframe>'); }
  if (p === '/chatgpt/' || p.startsWith('/chatgpt/app.')) { const f = p.endsWith('/') ? 'index.html' : p.split('/').pop(); res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); return res.end(fs.readFileSync(path.join(dir, 'static', f))); }
  if (p === '/chatgpt/api/accounts') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(accounts)); }   // the app sends no CORS headers
  if (p.startsWith('/chatgpt/api/chatgpt/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"message":"done","login_id":"x","url":"https://example.invalid/device","code":"SYN-THETIC"}'); }
  res.writeHead(404); res.end();
});
srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port, result = {};
  const browser = await chromium.launch({ headless: true, ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 }, colorScheme: 'dark' });
  const page = await ctx.newPage(); const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
  // Same-origin control first (today's behaviour): the page lists the account.
  await page.goto(`http://127.0.0.1:${port}/chatgpt/`); await page.waitForTimeout(800);
  result.sameOriginRows = await page.locator('#accounts li').count();
  await page.screenshot({ path: path.join(out, 'chatgpt-same-origin-dark.png') });
  // Opaque frame (boundary on).
  const before = seen.length;
  await page.goto(`http://127.0.0.1:${port}/host`); await page.waitForTimeout(1500);
  const f = page.frames().find(x => x.url().endsWith('/chatgpt/'));
  result.opaqueOrigin = await f.evaluate(() => self.origin);
  result.opaqueRows = await f.locator('#accounts li').count();
  result.apiFromFrame = seen.slice(before).filter(r => r.path.includes('/api/'));
  result.confirm = await f.evaluate(() => { try { return String(confirm('x')); } catch (e) { return 'threw ' + e.name; } });
  result.popup = await f.evaluate(() => { const w = window.open('https://example.invalid/', '_blank'); return w === null ? 'blocked' : 'opened'; });
  result.consoleSandbox = logs.filter(l => /sandbox|CORS|Access-Control/i.test(l)).slice(0, 6);
  await page.screenshot({ path: path.join(out, 'chatgpt-opaque-frame-baseline.png') });
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close(); srv.close();
});
