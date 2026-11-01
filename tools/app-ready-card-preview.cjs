// Private read-only Wizard shell preview origin.
// Shell (/wizard-os-home/*) comes from PREVIEW_WEB (a committed worktree); EVERY other path (hosted apps,
// /wizard/ reads, /api/) is forwarded read-only to the live Wizard upstream through a loopback TLS tunnel, so app
// windows load the real app instead of a nested shell. No write forwarding, cookies, WebSocket upgrade or
// foreign redirects. Bind loopback behind the staging router.
// Env: PORT, PREVIEW_WEB, PREVIEW_GENERATED (fallback for untracked data.js/summaries.js), PREVIEW_SHA,
//      PREVIEW_UPSTREAM (https://<live wizard host>), PREVIEW_UPSTREAM_PORT (loopback tunnel to its :443)
const http = require('node:http'), https = require('node:https'), fs = require('node:fs'), path = require('node:path');
const web = path.resolve(process.env.PREVIEW_WEB || ''), port = Number(process.env.PORT);
const upstream = new URL(process.env.PREVIEW_UPSTREAM), connectPort = Number(process.env.PREVIEW_UPSTREAM_PORT);
if (!process.env.PREVIEW_WEB || !port || upstream.protocol !== 'https:' || !connectPort) throw Error('Configure PREVIEW_WEB, PORT, PREVIEW_UPSTREAM and PREVIEW_UPSTREAM_PORT');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
let refused = 0;
const entry = JSON.parse(fs.readFileSync(process.env.PREVIEW_APP_ENTRY, 'utf8'));
const decl = entry.ready_card, sample = {day:'sample-day',done:0,total:4,next_label:String(decl.subtitle || '').split(' · ')[0],hidden:false};
const json = (res, value, code=200) => { res.writeHead(code, {'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value)); };
const registry = import(require('node:url').pathToFileURL(process.env.PREVIEW_SETTINGS_MODULE).href);

// Sandbox for skin switching only: the wearing choice (/wizard/v1/skins/active) is kept in memory in this preview,
// never sent to the live Wizard. Everything else that writes stays refused. A restart forgets it.
let sandboxActive; // undefined = follow live
function skinsFromLive(cb) {
  const q = https.request({ hostname: '127.0.0.1', port: connectPort, servername: upstream.hostname, method: 'GET', path: '/wizard/v1/skins', headers: { host: upstream.host, accept: 'application/json' } }, r => {
    let b = ''; r.on('data', c => b += c); r.on('end', () => { try { const d = JSON.parse(b); if (sandboxActive !== undefined) d.active = sandboxActive; cb(null, d); } catch (e) { cb(e); } });
  }); q.setTimeout(15000, () => q.destroy(new Error('timeout'))); q.on('error', cb); q.end();
}
http.createServer((req, res) => {
  const sp = req.url.split('?')[0];
  if (sp === '/wizard/v1/apps' && req.method === 'GET') return registry.then(({readApps})=>json(res, readApps({appsJsonPath:process.env.PREVIEW_APPS_JSON,launcherPath:process.env.PREVIEW_LAUNCHER}))).catch(()=>json(res,{error:'Candidate registry unavailable'},502));
  // This one app-card status is a labelled disposable sample; no writes ever reach its owner API.
  if (sp === entry.url + decl.status && req.method === 'GET') return json(res,sample);
  if (sp === entry.url + decl.dismiss && req.method === 'POST') {
    let b='';req.on('data',c=>{if(b.length<2048)b+=c});return req.on('end',()=>{let d;try{d=JSON.parse(b)}catch{};if(d?.hidden!==true)return json(res,{error:'Sample hide only'},400);sample.hidden=true;return json(res,sample);});
  }
  if (sp === '/__preview/reset' && req.method === 'GET') {sample.hidden=false;return json(res,{sample:true,liveWrites:false});}
  if (sp === entry.url + 'app.js' && req.method === 'GET') {res.writeHead(200,{'content-type':'application/javascript','cache-control':'no-store'});return fs.createReadStream(process.env.PREVIEW_APP_JS).pipe(res);}

  if (sp === '/wizard/v1/skins' && req.method === 'GET') return skinsFromLive((e, d) => { if (e) { res.writeHead(502); return res.end(); } res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(d)); });
  if (sp === '/wizard/v1/skins/active' && req.method === 'PUT') {
    let b = ''; req.on('data', c => { if (b.length < 2000) b += c; });
    return req.on('end', () => { let id = null; try { id = JSON.parse(b || '{}').id ?? null; } catch (e) {} sandboxActive = typeof id === 'string' ? id : null;
      skinsFromLive((e, d) => { if (e) { res.writeHead(502); return res.end(); } res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(d)); }); });
  }
  if (!['GET', 'HEAD'].includes(req.method)) { refused++; res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"error":"Read-only preview: writes are disabled"}'); }
  const u = new URL(req.url, 'http://preview');
  if (u.pathname === '/__preview/receipt') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ sha: process.env.PREVIEW_SHA, readOnly: true, sampleCard:entry.id, sampleHidden:sample.hidden, liveWrites:false, refused })); }
  if (u.pathname === '/') { res.writeHead(302, { location: '/wizard-os-home/?view=chats&section=ready' }); return res.end(); }
  if (u.pathname.startsWith('/wizard-os-home/')) {
    let rel; try { rel = decodeURIComponent(u.pathname.slice('/wizard-os-home/'.length)) || 'index.html'; } catch { res.writeHead(400); return res.end(); }
    if (rel.split('/').some(s => s === '..' || s.startsWith('.'))) { res.writeHead(404); return res.end(); }
    let file = path.resolve(web, rel);
    if (!file.startsWith(web + path.sep)) { res.writeHead(404); return res.end(); }
    if (!fs.existsSync(file) && ['data.js', 'summaries.js'].includes(rel) && process.env.PREVIEW_GENERATED) file = path.join(process.env.PREVIEW_GENERATED, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', 'content-security-policy': csp, 'permissions-policy': 'microphone=()' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }
  const p = https.request({ hostname: '127.0.0.1', port: connectPort, servername: upstream.hostname, method: req.method, path: req.url,
    headers: { host: upstream.host, accept: req.headers.accept || '*/*', ...(req.headers.range ? { range: req.headers.range } : {}) } }, r => {
      const headers = { ...r.headers }; delete headers['set-cookie']; headers['cache-control'] = 'no-store';
      if (headers.location) { const target = new URL(headers.location, upstream); if (target.origin !== upstream.origin) { r.resume(); res.writeHead(502); return res.end('External redirect disabled in preview'); } headers.location = target.pathname + target.search + target.hash; }
      res.writeHead(r.statusCode, headers); r.pipe(res);
    });
  p.setTimeout(20000, () => p.destroy(new Error('upstream timeout')));
  p.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Preview read upstream unavailable'); });
  p.end();
}).listen(port, '127.0.0.1', () => console.log(`Read-only shell preview ${process.env.PREVIEW_SHA} on ${port}`));
