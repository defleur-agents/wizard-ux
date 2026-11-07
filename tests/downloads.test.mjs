// In-app Downloads (web/core/downloads.js): banner + sheet driven by the Android bridge; inert without it.
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

function load({ bridge = true, items = [], failOpen = null } = {}) {
  const calls = [], toasts = [], timers = [], registered = [];
  const body = el('body'), store = new Map();
  const native = bridge ? {
    downloadsList: () => JSON.stringify({ v: 1, items }),
    downloadsOpen: id => { calls.push(['open', id]); return failOpen || 'ok'; },
    downloadsCancel: id => { calls.push(['cancel', id]); return 'ok'; },
    downloadsRemove: id => { calls.push(['remove', id]); return 'ok'; },
  } : undefined;
  const window = { WizardOSNative: native, __wos: { toast: (i, t) => toasts.push(t) }, requestAnimationFrame: f => f(), innerHeight: 800,
    WosSettings: { register: f => registered.push(f) }, WizCore: {} };
  const ctx = { window, document: { createElement: el, body, documentElement: { dataset: { shell: 'phone' } }, querySelectorAll: () => [] },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, Date, JSON, Number, String, Set, Map, Math };
  vm.runInNewContext(src, ctx);
  return { W: window.WosDownloads, window, body, calls, toasts, timers, registered, store };
}
const pdf = (over = {}) => ({ id: '12', name: 'Plan.pdf', mime: 'application/pdf', size: 4_700_000, got: 4_700_000, status: 'done', started: Date.now() - 5000, finished: Date.now(), ...over });

test('without the Android bridge the module does nothing at all (desktop, older app)', () => {
  const { W, window, body, registered } = load({ bridge: false });
  assert.equal(W.available(), false);
  assert.equal(W.show(), false);
  assert.equal(window.__wosDownloads({ type: 'done', item: pdf() }), true);
  assert.equal(body.children.length, 0);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].available(), false);
  assert.equal(W.open('12'), 'missing');
});

test('a finished download shows the banner with name and size, then dismisses itself after ~6 s', () => {
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

test('Open on the banner calls the native open once, with the digits id, and closes the banner', () => {
  const { window, body, calls, timers, W } = load({ items: [pdf()] });
  window.__wosDownloads({ type: 'done', item: pdf() });
  const b = body.children[0], open = { classList: el().classList, textContent: 'Open', disabled: false, closest: () => open };
  open.classList.add('wdl-open'); open.closest = s => (s === 'button' ? open : null);
  b.listeners.click[0]({ target: open });
  assert.equal(open.textContent, 'Opening…', 'paints on the tap, before the native call');
  assert.deepEqual(calls, []);
  timers.filter(t => t.ms === 0).forEach(t => t.f());
  assert.deepEqual(calls, [['open', '12']]);
  assert.equal(W.bannerOpen(), false);
});

test('missing / no-app answers tell James in plain words', () => {
  let r = load({ items: [pdf()], failOpen: 'none' });
  assert.equal(r.W.open('12'), 'none');
  assert.deepEqual(r.toasts, ['No app can open this file']);
  r = load({ items: [pdf()], failOpen: 'missing' });
  r.W.open('12');
  assert.deepEqual(r.toasts, ['That file is no longer on this phone']);
});

test('ids that are not plain digits never reach the native side', () => {
  const { W, calls } = load({ items: [pdf()] });
  for (const bad of ['', '../1', '1;2', '12 ', 'x', '1234567890123456789']) assert.equal(W.open(bad), 'missing');
  assert.deepEqual(calls, []);
});

test('a failed download is a short toast, not a banner; a running one never banners', () => {
  const { window, body, toasts } = load({ items: [] });
  window.__wosDownloads({ type: 'done', item: pdf({ status: 'running', got: 10 }) });
  assert.equal(body.children.length, 0);
  window.__wosDownloads({ type: 'failed', item: pdf({ status: 'failed', name: 'Big.zip' }) });
  assert.deepEqual(toasts, ['Couldn’t download Big.zip']);
  assert.equal(body.children.length, 0);
});

test('sync on resume announces one recent unseen finish, once', () => {
  const { window, body, W } = load({ items: [pdf()] });
  window.__wosDownloads({ type: 'sync' });
  assert.equal(body.children.length, 1);
  W.hideBanner();
  window.__wosDownloads({ type: 'sync' });
  assert.equal(body.children.length, 1, 'already announced; not again');
  const old = load({ items: [pdf({ finished: Date.now() - 3_600_000 })] });
  old.window.__wosDownloads({ type: 'sync' });
  assert.equal(old.body.children.length, 0, 'an hour-old finish is not news');
});

test('the sheet lists finished rows with Open and running rows with progress; Back closes it one layer', () => {
  const items = [pdf(), pdf({ id: '13', name: 'Video.mp4', status: 'running', size: 1000, got: 250, finished: 0 }), pdf({ id: '14', name: 'Bad.zip', status: 'failed' })];
  const { W, body } = load({ items });
  assert.equal(W.show(), true);
  assert.equal(W.isOpen(), true);
  const s = body.children[0];
  assert.match(s.className, /wdl-sheet/);
  assert.match(s.innerHTML, /<h2 class="wdl-title">Downloads<\/h2>/);
  assert.match(s.list.innerHTML, /Plan\.pdf/);
  assert.equal(W.back(), 'downloads');
  assert.equal(W.isOpen(), false);
  assert.equal(W.back(), null, 'nothing open: Back falls through to the next owner');
});

test('rows: Open for done, progress % for running, Cancel for running, Remove for failed', () => {
  const items = [pdf(), pdf({ id: '13', name: 'Video.mp4', status: 'running', size: 1000, got: 250, finished: 0 }), pdf({ id: '14', name: 'Bad.zip', status: 'failed' })];
  const { W, body } = load({ items });
  W.show();
  const list = body.children[0].list;
  assert.match(list.innerHTML, /data-wdl="open">Open</);
  assert.match(list.innerHTML, /Downloading… 25%/);
  assert.match(list.innerHTML, /data-wdl="cancel">Cancel</);
  assert.match(list.innerHTML, /data-wdl="remove">Remove</);
  assert.match(list.innerHTML, /aria-valuenow="25"/);
});

test('names from the phone are escaped in the page', () => {
  const { W, body } = load({ items: [pdf({ name: '<img src=x onerror=1>.pdf' })] });
  W.show();
  const list = body.children[0].list;
  assert.ok(!list.innerHTML.includes('<img'));
  assert.match(list.innerHTML, /&lt;img/);
});

test('Settings gets a Downloads row only where the bridge exists', () => {
  const on = load({ items: [pdf()] });
  assert.equal(on.registered[0].id, 'downloads');
  assert.equal(on.registered[0].available(), true);
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
