// In-app Downloads (web/core/downloads.js): banner + sheet driven by the Android shell message port
// (window.wizardDownloadsPort, v1); inert without it. These are FAKE-port web tests: they do not certify native
// frame isolation (see DownloadsCallerPolicyTest and the device check).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../web/core/downloads.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/core/downloads.css', import.meta.url), 'utf8');

function el(tag = 'div') {
  const e = { tag, children: [], listeners: {}, dataset: {}, attrs: {}, _cls: new Set(), style: { setProperty() {}, cssText: '' }, isConnected: true, innerHTML: '', textContent: '', className: '',
    appendChild(c) { this.children.push(c); c.parent = this; return c; }, remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, setAttribute(k, v) { this.attrs[k] = v; },
    querySelector(sel) { return sel === '.wdl-list' ? (this.list ||= { innerHTML: '' }) : null; }, closest() { return null; } };
  e.classList = { add: c => e._cls.add(c), remove: c => e._cls.delete(c), contains: c => e._cls.has(c) };
  return e;
}

function load({ bridge = true, items = [], failOpen = null, legacy = false } = {}) {
  const calls = [], sent = [], toasts = [], timers = [], registered = [];
  const body = el('body'), store = new Map();
  // The Android app hands the SHELL main frame one message port (window.wizardDownloadsPort, protocol v1);
  // this fake stands in for it. It certifies the web side only: native frame isolation is the Java policy tests
  // plus a device check, never a fake bridge.
  const answer = m => {
    if (m.method === 'list') return { ok: true, result: { v: 1, items } };
    if (m.method === 'open') { calls.push(['open', m.params.id]); return { ok: true, result: failOpen || 'ok' }; }
    if (m.method === 'cancel') { calls.push(['cancel', m.params.id]); return { ok: true, result: 'ok' }; }
    if (m.method === 'remove') { calls.push(['remove', m.params.id]); return { ok: true, result: 'ok' }; }
    return { ok: false, error: 'unknown method' };
  };
  const port = bridge ? { handlers: [], postMessage(text) {
    const m = JSON.parse(text); sent.push(m);
    const r = answer(m);
    Promise.resolve().then(() => { const ev = { data: JSON.stringify({ v: 1, id: m.id, ...r }) }; this.handlers.forEach(f => f(ev)); });
  }, addEventListener(type, f) { if (type === 'message') this.handlers.push(f); } } : undefined;
  // The frame-blind Bridge of older/other builds: must never be consulted.
  const oldBridge = legacy ? { downloadsList: () => { calls.push(['legacy-list']); return '{"v":1,"items":[]}'; }, downloadsOpen: () => { calls.push(['legacy-open']); return 'ok'; } } : undefined;
  const window = { wizardDownloadsPort: port, WizardOSNative: oldBridge, __wos: { toast: (i, t) => toasts.push(t) }, requestAnimationFrame: f => f(), innerHeight: 800,
    WosSettings: { register: f => registered.push(f) }, WizCore: {} };
  const ctx = { window, document: { createElement: el, body, documentElement: { dataset: { shell: 'phone' } }, querySelectorAll: () => [] },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, Date, JSON, Number, String, Set, Map, Math, Promise };
  vm.runInNewContext(src, ctx);
  return { W: window.WosDownloads, window, body, calls, sent, toasts, timers, registered, store, port };
}
const flush = () => new Promise(r => setImmediate(r));
const pdf = (over = {}) => ({ id: '12', name: 'Plan.pdf', mime: 'application/pdf', size: 4_700_000, got: 4_700_000, status: 'done', started: Date.now() - 5000, finished: Date.now(), ...over });
const sentCalls = r => r.sent.map(m => [m.method, m.params]);

test('without the shell message port the module does nothing at all (desktop, older app)', async () => {
  const { W, window, body, registered, sent } = load({ bridge: false });
  assert.equal(W.available(), false);
  assert.equal(W.show(), false);
  assert.equal(window.__wosDownloads({ type: 'done', item: pdf() }), true);
  assert.equal(body.children.length, 0);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].available(), false);
  assert.equal(await W.open('12'), 'missing');
  assert.deepEqual(sent, []);
});

test('the old frame-blind WizardOSNative.downloads* bridge is never consulted, even if present', async () => {
  const { W, window, body, calls, registered } = load({ bridge: false, legacy: true });
  assert.equal(W.available(), false);
  assert.equal(W.show(), false);
  window.__wosDownloads({ type: 'sync' });
  assert.equal(await W.open('12'), 'missing');
  await flush();
  assert.equal(body.children.length, 0);
  assert.equal(registered[0].available(), false);
  assert.deepEqual(calls, []);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /WizardOSNative/, 'the consumer must not reference the old Bridge at all');
});

test('a finished download shows the banner with name and size, then dismisses itself after ~6 s', async () => {
  const { W, window, body, timers } = load({ items: [pdf()] });
  window.__wosDownloads({ type: 'done', item: pdf() });
  assert.equal(body.children.length, 1);
  const b = body.children[0];
  assert.match(b.className, /wdl-banner/);
  assert.match(b.innerHTML, /Plan\.pdf · 4\.5 MB/);
  assert.match(b.innerHTML, /class="wdl-open">Open</);
  assert.equal(W.bannerOpen(), true);
  const t = timers.find(x => x.ms === 6000);
  assert.ok(t, 'auto-dismiss timer of 6 s');
  t.f();
  assert.equal(W.bannerOpen(), false);
});

test('Open on the banner posts one open request over the port, with the digits id, and closes the banner', async () => {
  const r = load({ items: [pdf()] });
  const { window, body, calls, timers, W } = r;
  window.__wosDownloads({ type: 'done', item: pdf() });
  await flush();
  r.sent.length = 0;
  const b = body.children[0], open = { classList: el().classList, textContent: 'Open', disabled: false, closest: () => open };
  open.classList.add('wdl-open'); open.closest = s => (s === 'button' ? open : null);
  b.listeners.click[0]({ target: open });
  assert.equal(open.textContent, 'Opening…', 'paints on the tap, before the native call');
  assert.deepEqual(calls, []);
  timers.filter(t => t.ms === 0).forEach(t => t.f());
  await flush();
  assert.deepEqual(calls, [['open', '12']]);
  assert.deepEqual(sentCalls(r), [['open', { id: '12' }]]);
  assert.equal(r.sent[0].v, 1);
  assert.match(r.sent[0].id, /^dl\d+$/);
  assert.equal(W.bannerOpen(), false);
});

test('missing / no-app answers tell James in plain words', async () => {
  let r = load({ items: [pdf()], failOpen: 'none' });
  assert.equal(await r.W.open('12'), 'none');
  assert.deepEqual(r.toasts, ['No app can open this file']);
  r = load({ items: [pdf()], failOpen: 'missing' });
  await r.W.open('12');
  assert.deepEqual(r.toasts, ['That file is no longer on this phone']);
});

test('ids that are not plain digits never reach the native side', async () => {
  const r = load({ items: [pdf()] });
  for (const bad of ['', '../1', '1;2', '12 ', 'x', '1234567890123456789']) assert.equal(await r.W.open(bad), 'missing');
  assert.deepEqual(r.calls, []);
  assert.deepEqual(r.sent, []);
});

test('only list / open / cancel / remove are ever requested, each a v1 envelope with a fresh id', async () => {
  const r = load({ items: [pdf(), pdf({ id: '13', status: 'running', finished: 0 }), pdf({ id: '14', status: 'failed' })] });
  r.W.show();
  await flush();
  const sheet = r.body.children[0];
  const tap = (act, id) => {
    const row = { dataset: { id }, remove() {} };
    const b = { dataset: { wdl: act }, classList: el().classList, textContent: act, disabled: false, closest: s => (s === '.wdl-row' ? row : null) };
    sheet.listeners.click[0]({ target: { closest: s => (s === '[data-wdl]' ? b : null) }, detail: 1 });
  };
  tap('cancel', '13'); tap('remove', '14'); tap('open', '12');
  r.timers.filter(t => t.ms === 0).forEach(t => t.f());
  await flush();
  for (const m of new Set(r.sent.map(m => m.method))) assert.ok(['list', 'open', 'cancel', 'remove'].includes(m), m);
  assert.deepEqual(r.calls.map(c => c[0]).sort(), ['cancel', 'open', 'remove']);
  assert.ok(r.sent.every(m => m.v === 1 && typeof m.id === 'string' && m.id.length <= 64));
  assert.equal(new Set(r.sent.map(m => m.id)).size, r.sent.length, 'ids are unique');
});

test('a reply with the wrong version or an unknown id is ignored; a silent native side times out without throwing', async () => {
  const r = load({ items: [pdf()] });
  const p = r.W.open('12');
  const real = r.sent[0].id;
  r.port.handlers.forEach(f => f({ data: JSON.stringify({ v: 2, id: real, ok: true, result: 'ok' }) }));
  r.port.handlers.forEach(f => f({ data: 'not json' }));
  r.port.handlers.forEach(f => f({ data: JSON.stringify({ v: 1, id: 'dl999', ok: true, result: 'ok' }) }));
  assert.equal(await p, 'ok', 'the genuine reply still resolves it');
  const quiet = load({ items: [] });
  quiet.port.postMessage = () => {};
  const q = quiet.W.open('12');
  const t = quiet.timers.find(x => x.ms >= 3000 && x.ms !== 6000);
  assert.ok(t, 'a request timeout exists');
  t.f();
  assert.equal(await q, 'missing');
});

test('if the port disappears mid-session the module degrades to nothing', async () => {
  const r = load({ items: [pdf()] });
  assert.equal(r.W.available(), true);
  delete r.window.wizardDownloadsPort;
  assert.equal(r.W.available(), false);
  assert.equal(await r.W.open('12'), 'missing');
});

test('a failed download is a short toast, not a banner; a running one never banners', async () => {
  const { window, body, toasts } = load({ items: [] });
  window.__wosDownloads({ type: 'done', item: pdf({ status: 'running', got: 10 }) });
  assert.equal(body.children.length, 0);
  window.__wosDownloads({ type: 'failed', item: pdf({ status: 'failed', name: 'Big.zip' }) });
  assert.deepEqual(toasts, ['Couldn’t download Big.zip']);
  assert.equal(body.children.length, 0);
});

test('sync on resume announces one recent unseen finish, once', async () => {
  const { window, body, W } = load({ items: [pdf()] });
  window.__wosDownloads({ type: 'sync' });
  await flush();
  assert.equal(body.children.length, 1);
  W.hideBanner();
  window.__wosDownloads({ type: 'sync' });
  await flush();
  assert.equal(body.children.length, 1, 'already announced; not again');
  const old = load({ items: [pdf({ finished: Date.now() - 3_600_000 })] });
  old.window.__wosDownloads({ type: 'sync' });
  await flush();
  assert.equal(old.body.children.length, 0, 'an hour-old finish is not news');
});

test('the sheet lists finished rows with Open and running rows with progress; Back closes it one layer', async () => {
  const items = [pdf(), pdf({ id: '13', name: 'Video.mp4', status: 'running', size: 1000, got: 250, finished: 0 }), pdf({ id: '14', name: 'Bad.zip', status: 'failed' })];
  const { W, body } = load({ items });
  assert.equal(W.show(), true);
  assert.equal(W.isOpen(), true);
  await flush();
  const s = body.children[0];
  assert.match(s.className, /wdl-sheet/);
  assert.match(s.innerHTML, /<h2 class="wdl-title">Downloads<\/h2>/);
  assert.match(s.list.innerHTML, /Plan\.pdf/);
  assert.equal(W.back(), 'downloads');
  assert.equal(W.isOpen(), false);
  assert.equal(W.back(), null, 'nothing open: Back falls through to the next owner');
});

test('rows: Open for done, progress % for running, Cancel for running, Remove for failed', async () => {
  const items = [pdf(), pdf({ id: '13', name: 'Video.mp4', status: 'running', size: 1000, got: 250, finished: 0 }), pdf({ id: '14', name: 'Bad.zip', status: 'failed' })];
  const { W, body } = load({ items });
  W.show();
  await flush();
  const list = body.children[0].list;
  assert.match(list.innerHTML, /data-wdl="open">Open</);
  assert.match(list.innerHTML, /Downloading… 25%/);
  assert.match(list.innerHTML, /data-wdl="cancel">Cancel</);
  assert.match(list.innerHTML, /data-wdl="remove">Remove</);
  assert.match(list.innerHTML, /aria-valuenow="25"/);
});

test('names from the phone are escaped in the page', async () => {
  const { W, body } = load({ items: [pdf({ name: '<img src=x onerror=1>.pdf' })] });
  W.show();
  await flush();
  const list = body.children[0].list;
  assert.ok(!list.innerHTML.includes('<img'));
  assert.match(list.innerHTML, /&lt;img/);
});

test('Settings gets a Downloads row only where the port exists', async () => {
  const on = load({ items: [pdf()] });
  assert.equal(on.registered[0].id, 'downloads');
  assert.equal(on.registered[0].available(), true);
  on.registered[0].html();           // asks for a fresh list; the row text follows the cached one
  await flush();
  assert.match(on.registered[0].html(), /data-st="downloads"/);
  assert.match(on.registered[0].html(), /1 recent/);
});

test('size labels read like a person would say them', () => {
  const { W } = load();
  assert.equal(W._fmtSize(900), '900 B');
  assert.equal(W._fmtSize(2048), '2 KB');
  assert.equal(W._fmtSize(4_700_000), '4.5 MB');
  assert.equal(W._fmtSize(52_000_000), '50 MB');
  assert.equal(W._fmtSize(0), '');
});

test('skin: the CSS uses only --wz-* roles (with shell fallbacks) and opaque panels, never a literal text colour or blur', () => {
  assert.doesNotMatch(css, /backdrop-filter|filter:\s*blur/);
  const decl = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // no hex/rgb colour as a text or panel colour outside of var() fallbacks, shadows and the scrim fallback
  const bad = [...decl.matchAll(/(?:^|[;{\s])(color|background|background-color|border-color)\s*:\s*([^;}]+)/g)]
    .map(m => m[2].trim()).filter(v => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(v.replace(/var\([^)]*\)/g, '')));
  assert.deepEqual(bad, []);
  assert.match(css, /--wdl-raised: var\(--wz-panel-raised/);
  assert.match(css, /\.wdl-banner \{[^}]*background: var\(--wdl-raised\)/);
  assert.match(css, /\.wdl-panel \{[^}]*background: var\(--wdl-raised\)/);
  assert.match(css, /\.wdl-open, \.wdl-act \{[^}]*background: var\(--wdl-accent\); color: var\(--wdl-on-accent\)/);
});
