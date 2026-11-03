// AI apps view (Miguel, 2 Nov 2026): the ChatGPT / Claude / Perplexity phone layout as a third shell view beside Orb
// and Apps (miguel/ai-apps, off by default; the views are mutually exclusive; all off = Desks). Guards:
//   - packaging: an ordinary Miguel tweak named 'Different shell view - AI apps', manifest view, never a default, off in
//     his profile; phone wears layout 'ai-apps'; the desktop wears nothing (stock desktop until its layout comes);
//   - the layout: a top bar (☰ · the Wizard's name · workspaces), a drawer (open apps, All apps = the shared three-level
//     sheet, Recents = Working then Ready, View all, Settings, New chat), a long-press row menu mapped to Chats' own
//     actions, Home and the bare list become the chat; round 4: Home = a New chat with no greeting (the skin's
//     background, the composer, the orb), reached from anywhere by the name in the top bar, the orb's swipe up and the
//     drawer's +; the composer has no voice button (the dock orb stays under it), Send only with words;
//   - the core hooks it needs: the phone adapter's sessionList / sessionAct / showChats / newChat, the layout API's
//     sessions.act actions, sessions.chats / newChat, workspaces, desk.settings;
//   - Desks / Orb / Apps untouched: every rule is scoped to the worn layout, no literal colours, no timers of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fixture } from './fixtures/tweaks.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const settle = () => new Promise(r => setTimeout(r, 15));
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ---------- a small DOM, enough for the layout ---------- */
const parseSel = sel => sel.trim().split(/\s+/).map(part => {
  const tag = (part.match(/^[a-z]+/i) || [''])[0].toUpperCase(), cls = [...part.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
  const attrs = [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map(m => [m[1], m[2]]), id = (part.match(/^[a-z]*#([\w-]+)/i) || [])[1];
  return n => (!tag || n.tagName === tag) && (!id || n.id === id) && cls.every(c => n.classList.contains(c)) && attrs.every(([k, v]) => { const a = n.getAttribute(k); return v === undefined ? a !== null : a === v; });
});
const matchesSel = (n, sel) => sel.split(',').some(one => {
  const parts = parseSel(one); let i = parts.length - 1;
  if (!parts[i](n)) return false;
  for (let p = n.parentNode; p && i > 0; p = p.parentNode) if (p.tagName && parts[i - 1](p)) i--;
  return i === 0;
});
class El {
  constructor(tag, ns) {
    this.tagName = String(tag).toUpperCase(); this.ns = ns || null; this.children = []; this.parentNode = null; this.attrs = {}; this.hidden = false; this.listeners = {}; this._text = '';
    const st = {}; this.style = Object.assign(st, { setProperty(k, v) { st[k] = v; }, getPropertyValue: k => st[k] || '', removeProperty(k) { delete st[k]; } });
    const self = this;
    this.classList = { add(...c) { const s = new Set(self.cls()); c.forEach(x => s.add(x)); self.className = [...s].join(' '); }, remove(...c) { self.className = self.cls().filter(x => !c.includes(x)).join(' '); },
      toggle(c, on) { const has = self.cls().includes(c), want = on === undefined ? !has : !!on; if (want) this.add(c); else this.remove(c); return want; }, contains: c => self.cls().includes(c) };
    this.dataset = new Proxy({}, { get: (_, k) => self.attrs['data-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())], set: (_, k, v) => { self.attrs['data-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())] = String(v); return true; },
      deleteProperty: (_, k) => { delete self.attrs['data-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())]; return true; } });
  }
  cls() { return String(this.attrs.class || '').split(/\s+/).filter(Boolean); }
  get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = String(v); }
  get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = String(v); }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); } set textContent(v) { this.children = []; this._text = String(v); }
  get title() { return this.attrs.title || ''; } set title(v) { this.attrs.title = String(v); }
  get value() { return this.attrs.value || ''; } set value(v) { this.attrs.value = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } removeAttribute(k) { delete this.attrs[k]; }
  append(...n) { for (const c of n) { if (c == null) continue; if (typeof c === 'string') { this._text += c; continue; } c.remove(); c.parentNode = this; this.children.push(c); } }
  replaceChildren(...n) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = ''; this.append(...n); }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  get childElementCount() { return this.children.length; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.tagName === 'HTML'; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  querySelectorAll(sel) { sel = sel.replace(/\s*>\s*/g, ' '); return this.all().filter(n => matchesSel(n, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { for (let n = this; n && n.tagName; n = n.parentNode) if (matchesSel(n, sel)) return n; return null; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 300, height: 44, right: 300, bottom: 44 }; }
  focus() {} decode() { return Promise.resolve(); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); } removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
  dispatchEvent(e) { e.target ||= this; for (let n = this; n; n = n.parentNode) for (const fn of [...(n.listeners?.[e.type] || [])]) fn(e); return true; }
}
class FakePointerEvent { constructor(type, init = {}) { Object.assign(this, init, { type }); } preventDefault() { this.defaultPrevented = true; } stopPropagation() {} }

function world({ shell = 'phone', route = { home: false, view: 'thread', thread: '__new__', desk: 1, app: 'chats' } } = {}) {
  const html = new El('html'), body = new El('body'), device = new El('div'), dock = new El('div'), orbWrap = new El('div');
  html.append(body); body.append(device); device.append(dock); dock.append(orbWrap);
  const docListeners = {};
  const doc = { documentElement: html, body, createElement: t => new El(t), createElementNS: (ns, t) => new El(t, ns), __listeners: docListeners,
    addEventListener: (t, fn) => (docListeners[t] ||= []).push(fn), removeEventListener() {}, querySelectorAll: s => html.querySelectorAll(s), querySelector: s => html.querySelector(s) };
  globalThis.document = doc; globalThis.PointerEvent = FakePointerEvent; globalThis.performance ||= { now: () => Date.now() };
  const st = { route: { ...route }, on: {}, acts: [], opened: [], gone: [], lists: [], chats: 0, newChats: 0, settings: [], backs: [], timers: [], orbDown: [], sheet: 0, swipes: null, inset: null, store: {},
    sessions: { working: [{ id: 'w1', title: 'Busy one', kind: 'working', unread: false, pinned: false, actions: ['pin', 'rename'] }],
      ready: [{ id: 'r1', title: 'Ready one', kind: 'ready', unread: true, pinned: true, actions: ['pin', 'rename', 'snooze', 'done'] }, { id: 'r2', title: 'Seen one', kind: 'ready', unread: false, pinned: false, actions: ['pin', 'rename', 'unread', 'snooze', 'done'] }],
      archive: [{ id: 'a1', title: 'Old money talk', kind: 'archive', unread: false, pinned: false, actions: ['pin', 'rename', 'restore', 'snooze'] }] },
    desks: [{ desk: 1, id: 'wizard', name: 'Chats' }, ...['mail', 'music', 'money', 'notes', 'maps'].map((id, i) => ({ desk: i + 2, id, name: id[0].toUpperCase() + id.slice(1) }))] };
  const apps = ['mail', 'music', 'money', 'notes', 'maps', 'movies'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
  const api = {
    env: { shell, edgeInset: 24 }, route: () => ({ ...st.route }), on: (t, fn) => { (st.on[t] ||= []).push(fn); return () => {}; },
    listen: (t, type, fn) => { if (t === doc) doc.addEventListener(type, fn); else if (t?.addEventListener) t.addEventListener(type, fn); return () => {}; },
    mount: n => { device.append(n); return () => n.remove(); },
    after: (ms, fn) => { const h = { ms, fn, dead: false }; st.timers.push(h); return () => { h.dead = true; }; },
    frame: fn => { fn(0); return () => {}; },
    back: { push: fn => { st.backs.push(fn); return () => { const i = st.backs.indexOf(fn); if (i >= 0) st.backs.splice(i, 1); }; } },
    gesture: { intent: dx => dx > 60, claim: id => { (st.claims ||= []).push(id); return true; } },
    agents: { list: () => [{ id: 'hermes', label: 'Oscar', main: true }] },
    workspaces: { list: () => [{ id: 'this', name: 'Miguel', current: true, owner: 'Miguel Collins' }, { id: 'g1', name: 'Carlos', org: 'Acme', current: false }], refresh() {} },
    apps: { list: () => apps.map(a => ({ ...a })), badges: () => ({ wizard: 2, money: 3 }), logo: () => Promise.resolve(null), openDesk: id => st.opened.push(id), open: id => st.opened.push('open:' + id), store: () => Promise.resolve([]), inset: px => { st.inset = px; return () => { st.inset = null; }; } },
    sessions: { list: () => JSON.parse(JSON.stringify(st.sessions)), open: id => st.opened.push('thread:' + id), act: (id, a) => { st.acts.push([id, a]); return true; }, openList: k => st.lists.push(k), chats: () => { st.chats++; return true; }, newChat: () => { st.newChats++; return true; } },
    nav: { goDesk: i => st.gone.push(i) },
    desks: { list: () => st.desks.map(d => ({ ...d })) },
    desk: { settings: p => st.settings.push(p ?? '') },
    voice: { tap: () => st.orbDown.push('tap') },
    phone: { orb: () => orbWrap, mark: () => null, desks: () => st.desks, swipes: m => { st.swipes = m; return () => { st.swipes = null; }; } },
    storage: { get: k => k in st.store ? JSON.parse(JSON.stringify(st.store[k])) : null, set: (k, v) => { st.store[k] = JSON.parse(JSON.stringify(v)); } },
  };
  orbWrap.addEventListener('pointerdown', e => st.orbDown.push(e.pointerId));
  const fire = (type, target, extra = {}) => { const e = new FakePointerEvent(type, { target, isPrimary: true, pointerId: 7, clientX: 100, clientY: 400, button: 0, ...extra }); for (const fn of docListeners[type] || []) fn(e); if (!e.stopped) target?.dispatchEvent?.(e); return e; };
  const emit = (t, v) => { for (const fn of st.on[t] || []) fn(v); };
  const run = () => { const t = st.timers.splice(0); for (const h of t) if (!h.dead) h.fn(); };
  const q = s => html.querySelector(s), qa = s => html.querySelectorAll(s);
  return { api, st, html, device, orbWrap, fire, emit, run, q, qa, doc };
}
const layout = () => import(new URL('web/layouts/ai-apps/layout.js', root).href);

test('packaging: an ordinary Miguel view tweak, off by default; the phone and the desktop wear AI apps', async () => {
  const man = JSON.parse(read('web/tweaks/miguel/ai-apps/manifest.json'));
  assert.equal(man.name, 'Different shell view - AI apps'); assert.equal(man.view, 'AI apps'); assert.deepEqual(man.capabilities, ['layout']);
  const cat = JSON.parse(read('web/tweaks/catalog.json')), prof = JSON.parse(read('web/tweaks/miguel/profile.json'));
  assert.ok(cat.tweaks.includes('miguel/ai-apps') && !cat.defaults.includes('miguel/ai-apps'), 'listed, never a default');
  assert.ok(prof.tweaks.includes('miguel/ai-apps') && prof.off.includes('miguel/ai-apps'), 'off in his profile until he turns it on');
  assert.ok(!/ai-apps/.test(read('web/core/experience.js')), 'no migration turns it on');
  const p = fixture({ shell: 'phone' });
  await p.mount('miguel/ai-apps'); await settle();
  assert.equal(p.host.layout, 'ai-apps'); assert.equal(p.doc.documentElement.dataset.layout, 'ai-apps');
  assert.ok(p.doc.head.children.some(l => /layouts\/ai-apps\/layout\.css/.test(l.href || '')));
  await p.clear(); assert.equal(p.host.layout, 'classic'); assert.ok(!p.doc.head.children.some(l => /layouts\//.test(l.href || '')));
  const d = fixture({ shell: 'desktop' });
  await d.mount('miguel/ai-apps'); await settle();
  assert.equal(d.host.layout, 'ai-apps', 'the desktop wears it too (desktop.js)'); assert.equal(d.doc.documentElement.dataset.layout, 'ai-apps');
  await d.clear(); assert.equal(d.host.layout, 'classic'); assert.ok(!d.doc.head.children.some(l => /layouts\//.test(l.href || '')));
  const host = read('web/core/skin-host.js');
  assert.match(host, /Object\.freeze\(\{ id: 'ai-apps', name: 'AI apps',/);
  assert.match(host, /const VIEW_LAYOUTS = new Set\(\['orb', 'apps', 'ai-apps'\]\);/);
  assert.match(host, /if \(VIEW_LAYOUTS\.has\(layoutId\) && !\(layoutHolder && tweaks\.has\(layoutHolder\)\)\) setLayout\('classic'\);/, 'a stale stored AI apps layout goes back to Desks');
});

test('scoped and quiet: every rule needs the worn layout on the phone; skin tokens only; no timers or storage of its own', () => {
  const css = read('web/layouts/ai-apps/layout.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\("[^"]*"\)/g, 'url()');
  const body = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@media[^{]*\{/g, '');
  for (const sel of [...body.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean)) for (const part of sel.split(/,(?![^(]*\))/))
    assert.ok(/^html\[data-shell="phone"\]\[data-layout="ai-apps"\]/.test(part.trim()), `unscoped: ${part.trim()}`);
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(css), 'colours are skin tokens');
  assert.ok(!/font(-size)?\s*:[^;}]*\b\d+px/.test(css), 'type in rem');
  const tw = read('web/tweaks/miguel/ai-apps/tweak.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const sel of [...tw.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim())) assert.ok(/^html\[data-shell="phone"\]\[data-layout="ai-apps"\]/.test(sel), `tweak.css reaches past the view: ${sel}`);
  const js = noComments(read('web/layouts/ai-apps/layout.js'));
  assert.ok(!/Math\.random|innerHTML|localStorage|setTimeout|setInterval|fetch\(/.test(js), 'no timers, markup strings, storage or fetches of its own');
  assert.match(js, /import \{ viewChrome, openApps, realApps, matches, CHATS \} from '\.\.\/apps\/chrome\.js';/, 'the Orb and Apps views\' own chrome: one + sheet, one app list');
});

test('desktop: a sidebar (open apps, All apps, the Archive / Working / Ready sections, + New chat, cog) that folds to a rail; the top row; the orb', async () => {
  const w = world({ shell: 'desktop' });
  const store = {}, keys = [];
  Object.assign(w.api, { asset: n => '/wizard-os-home/layouts/ai-apps/' + n, storage: { get: k => k in store ? store[k] : null, set: (k, v) => { store[k] = v; } },
    keys: { on: h => { keys.push(h); return () => {}; }, guide: g => { (w.st.guides ||= []).push(g); return () => {}; } }, orb: { ready: () => new Promise(() => {}), onLevel: () => () => {} }, voice: { state: () => ({ state: 'idle' }), talk: () => w.st.orbDown.push('talk'), command: () => w.st.orbDown.push('command') },
    desk: { settings: p => w.st.settings.push(p ?? ''), home: () => {} } });
  w.api.apps.inset = (px, orb) => { w.st.inset = px; w.st.insetOrb = orb; return () => { w.st.inset = null; }; };
  const off = (await layout()).default(w.api);
  assert.equal(w.html.dataset.aiApps, 'desktop'); assert.equal(w.html.dataset.viewChrome, 'desktop', 'the shared view chrome (the three-level sheet)');
  assert.equal(w.st.inset, 84, 'hosted apps keep room for the floating orb'); assert.equal(typeof w.st.insetOrb, 'function', 'and the orb says where it is (the orb bar)');
  assert.ok(w.q('link').getAttribute('href').endsWith('/desktop.css'), 'its own stylesheet, desktop-scoped');
  assert.equal(w.html.dataset.aadSide, 'open', 'open from 900 px up');
  assert.ok(w.html.attrs['data-settings-over'] === '', 'Settings opens over the page (a centred panel), never beside the chat');
  // the sidebar: wordmark · 🔍 · ◫; Apps grid (badged first, All apps last); the sections (round 5: Ready open)
  assert.deepEqual(w.q('.aad-sh').children.filter(c => !c.hidden).map(c => c.className.split(' ').pop()), ['aad-ws', 'aad-find', 'aad-tog'], 'round 7: the workspace switcher in place of the name; round 16: no ⌂ (Home = ✕, Esc, ⌥`)');
  assert.equal(w.q('.aad-homeb'), null, 'round 16: the left sidebar is the chats only'); assert.equal(w.q('.aad-pins'), null, 'round 16: no pinned row on the left');
  assert.equal(w.q('.aad-sh .aad-wsn').textContent, 'Miguel');
  assert.equal(w.q('.aad-sh .aad-wsd'), null, 'round 8: the name is text only (and a small chevron), no disc');
  assert.equal(w.q('.aad-grid'), null, 'the sidebar is the chat list only: no app grid');
  // round 10: no apps sidebar on the right; Home's grid (open first, badged first; installed; Get more), paged
  assert.equal(w.q('.aad-apps'), null, 'round 10: the right apps sidebar is gone'); assert.equal(w.html.dataset.aadApps, undefined);
  assert.equal(w.html.dataset.aadHome, '', 'Home');
  // round 15: Home is clean (no grid, no tab strip); round 16 item 7: the column's + is the picker (no All apps grid)
  assert.equal(w.q('.aad-hg'), null, 'round 16: no All apps grid');
  assert.equal(w.q('.aad-strip'), null, 'round 15: no tab strip'); assert.equal(w.q('.aad-tplus'), null, 'no New tab +');
  w.q('.aad-vall').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.html.dataset.vcSheet, 'open', 'the picker'); assert.ok(w.q('.vc-sheet.vc-pick')); assert.equal(w.st.newChats, 0, 'no new chat for it');
  assert.deepEqual(w.qa('.vc-pick .vc-app[data-app]').map(b => b.dataset.app), ['movies'], 'only installed apps neither pinned (Music, Mail, Money) nor open (Notes, Maps)');
  assert.equal(w.q('.vc-pick .vc-fold'), null, 'no Already open row');
  assert.ok(w.q('.vc-pick .vc-more'), '+ Get more last');
  assert.deepEqual(w.qa('.aad-sec').map(h => `${h.dataset.sec}:${h.getAttribute('aria-expanded')}`), ['archive:false', 'working:false', 'snoozed:false', 'ready:true']);
  assert.deepEqual(w.qa('.aad-rw').map(r => `${r.dataset.sid}:${r.dataset.kind}`), ['r1:ready', 'r2:ready']);
  assert.equal(w.q('.aad-viewall'), null, 'no View all: the sidebar is the chat list');
  w.q('.aad-sec[data-sec="working"]').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aad-rw').map(r => r.dataset.sid), ['w1', 'r1', 'r2'], 'Working opens above Ready');
  assert.deepEqual(store.sections, { archive: false, working: true, snoozed: false, ready: true }, 'kept on this device');
  w.q('.aad-sec[data-sec="working"]').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.q('.aad-tog .aad-count').textContent, '2', 'the Ready count on ◫');
  assert.deepEqual(w.q('.aad-foot').children.map(b => [b.className, b.getAttribute('aria-label'), b.textContent]), [['aad-set', 'Settings', ''], ['aad-fuel', null, ''], ['aad-new', 'New chat', '']], 'round 7: cog left, the fuel gauge between, + right');
  w.q('.aad-new').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.newChats, 1);
  w.q('.aad-set').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.settings, ['']);
  assert.equal(w.html.dataset.vcSheet, undefined, 'New chat closed the picker'); w.q('.aad-vall').dispatchEvent(new FakePointerEvent('click'));
  w.q('.vc-pick .vc-app[data-app="movies"]').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.opened.at(-1), 'movies', 'a pick opens it');
  assert.equal(w.html.dataset.vcSheet, undefined, 'a pick closes the picker');
  w.q('.aad-vall').dispatchEvent(new FakePointerEvent('click'));
  w.q('.vc-pick .vc-more').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.opened.at(-1), 'app-store', 'Get more = the App Store as it is');
  assert.equal(keys[2].down({ altKey: true, shiftKey: true, code: 'Backslash' }), false, 'round 10: ⌥⇧\\ is free again (no apps sidebar)');
  // ⋯ on a row: the same menu as the phone's long press, through Chats' own actions
  w.q('.aad-rw[data-sid="r2"] .aad-more').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aad-pop-i').map(b => b.textContent), ['Pin', 'Rename', 'Mark unread', 'Snooze', 'Archive']);
  w.q('.aad-pop-i[data-act="done"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.acts, [['r2', 'done']]); assert.equal(w.q('.aad-pop'), null);
  w.q('.aad-rw[data-sid="r1"] .aad-row').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.opened.at(-1), 'thread:r1');
  // fold to the rail with ◫ or Ctrl / ⌘ + Shift + S; kept on this device
  w.q('.aad-tog').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.q('.aad-rtog .aad-count'), null, 'round 16: no count on the rail\'s ◫ (Ready is right under it)'); assert.equal(w.q('.aad-rtog').getAttribute('aria-label'), 'Open sidebar');
  assert.equal(w.html.dataset.aadSide, 'rail'); assert.equal(store.folded, true);
  assert.equal(w.q('.aad-rail .aad-rapps'), null, 'the rail: no apps either');
  // round 12: the rail is words with counts (plain Ready chats count in Ready only, no status rows for them); no icons
  assert.deepEqual(w.q('.aad-rlist').children.map(n => n.dataset.k + ':' + n.textContent), ['ready:2Ready'], 'round 16: Snoozed and Ready only (no Archive, no Working), a count over its word');
  assert.equal(w.q('.aad-rail .aad-pins'), null, 'round 16: no pinned apps on the rail');
  assert.equal(w.q('.aad-rlist .aad-sti'), null, 'round 12: no status icons'); assert.equal(w.q('.aad-rc'), null); assert.equal(w.q('.aad-rg'), null, 'no coloured dots');
  assert.equal(keys.length, 3, 'Ctrl/⌘+Shift+S, Esc for the app panel / chat column (round 7), the view\'s ⌥ keys');
  assert.equal(w.st.guides.length, 2, 'two hold-⌥ hint guides: the view\'s targets and Home\'s app letters');
  const chips = w.st.guides[0]();
  assert.ok(Array.isArray(chips), 'the guide lists chips');
  w.q('.aad-vall').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(keys[1].down({ key: 'Escape' }), true, 'Esc closes the picker'); assert.equal(w.html.dataset.vcSheet, undefined);
  assert.equal(keys[1].down({ key: 'Escape' }), false, 'Esc with nothing open: not the layout\'s');
  assert.equal(keys[0].down({ ctrlKey: true, shiftKey: true, code: 'KeyS', key: 'S' }), true); assert.equal(w.html.dataset.aadSide, 'open');
  assert.equal(keys[0].down({ metaKey: true, shiftKey: true, code: 'KeyS', key: 's' }), true); assert.equal(w.html.dataset.aadSide, 'rail');
  assert.equal(keys[0].down({ altKey: true, code: 'KeyS', key: 's' }), false, 'the ⌥ keys stay the shell\'s');
  // round 15: the top row holds a docked chat's title + ✕ and the app panel's header (no tab strip)
  assert.deepEqual(w.q('.aad-top').children.map(c => c.className), ['aad-ctop', 'aad-ptop']);
  assert.equal(w.q('.aad-top .aad-ws'), null, 'the switcher lives in the sidebar header');
  assert.equal(w.q('.aad-wsn').textContent, 'Miguel'); assert.match(w.q('.aad-ws').getAttribute('aria-label'), /Workspace: Miguel/);
  w.q('.aad-ws').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aad-wr b').map(b => b.textContent), ['Miguel', 'Carlos']); assert.ok(w.q('.aad-wm'));
  w.q('.aad-wm').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.settings.at(-1), 'network');
  w.st.route = { home: false, view: 'desk', thread: null, desk: 4 }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aiFront, 'app'); assert.equal(w.q('.aad-vtab.is-on').dataset.app, 'money', 'its tab on the right in front');
  w.st.route = { home: false, view: 'thread', thread: 'r1', desk: 1 }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aiFront, 'chat'); assert.equal(w.html.dataset.aadChat, undefined, 'round 15: no Chats desk on the stage here, nothing to dock (the docking: below)');
  // Home = the empty new chat: + goes there (round 7: no name button, no home button in the top row)
  const before = w.st.newChats;
  assert.equal(w.q('.aad-home'), null); assert.equal(w.q('.aad-word'), null);
  w.q('.aad-rnew').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.st.newChats, before + 1, 'Home = a new chat, from anywhere');
  // no voice button in the composer: its Send is the stock one; the orb is the one way to talk (click talks, hold commands)
  const form = new El('form'); form.className = 'ch-compose'; const row2 = new El('div'); row2.className = 'ch-row2'; const send = new El('button'); send.className = 'ch-send';
  form.append(row2); row2.append(send); w.device.append(form);
  const e = w.fire('pointerdown', send, { pointerId: 21 }); assert.ok(!e.defaultPrevented, 'the composer\'s button is only Send');
  const orb = w.q('.aad-orbbtn');
  orb.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 22, button: 0, clientX: 10, clientY: 10 })); orb.dispatchEvent(new FakePointerEvent('pointerup', {}));
  assert.deepEqual(w.st.orbDown, ['talk'], 'a click on the orb talks');
  orb.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 23, button: 0, clientX: 10, clientY: 10 })); w.st.timers.filter(t => t.ms === 300).at(-1).fn();
  assert.deepEqual(w.st.orbDown, ['talk', 'command'], 'a hold gives a command');
  // Home becomes the empty new chat
  const nc = w.st.newChats; w.st.route = { home: true, view: 'desk', thread: null, desk: 0 }; w.emit('route', w.st.route); w.run(); assert.ok(w.st.newChats > nc, 'Home → a new chat');
  off();
  assert.equal(w.q('.aad'), null); assert.equal(w.html.dataset.aiApps, undefined); assert.equal(w.html.dataset.viewChrome, undefined); assert.equal(w.html.attrs['data-settings-over'], undefined);
});

test('desktop scoped and quiet: every rule needs the worn layout on the desktop; skin tokens only; measured sizes', () => {
  const css = read('web/layouts/ai-apps/desktop.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\("[^"]*"\)/g, 'url()');
  const body = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@media[^{]*\{/g, '');
  for (const sel of [...body.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean)) for (const part of sel.split(/,(?![^(]*\))/))
    assert.ok(/^html\[data-shell="desktop"\]\[data-layout="ai-apps"\]/.test(part.trim()), `unscoped: ${part.trim()}`);
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(css.replace(/#(bar|logo|wsList|clock|searchBtn|micBtn|status|settingsBtn|keysBtn|generalVoice|commandBtn|dictateBtn|stage|desktopHome)\b/g, '')), 'colours are skin tokens');
  assert.ok(!/font(-size)?\s*:[^;}]*\b\d+px/.test(css), 'type in rem');
  const P = 'html\\[data-shell="desktop"\\]\\[data-layout="ai-apps"\\]';
  assert.match(css, new RegExp(P + ' \\{\\s*--aad-side: 288px;'), 'a 288 px sidebar (Claude; ChatGPT\'s panel)');
  assert.match(css, new RegExp(P + '\\[data-aad-side="rail"\\],\\s*' + P + '\\[data-aad-side="over"\\] \\{ --aad-side: 52px; \\}'), 'round 16: a 52 px rail (ChatGPT\'s collapsed rail)');
  assert.match(css, /\.ch-compose \{\s*width: min\(768px, calc\(100% - 48px\)\); box-sizing: border-box; margin: 0 auto 24px;/, 'a 768 px column, the composer docked 24 px from the bottom (round 6: the orb is inside it)');
  assert.match(css, /\.ch-compose:not\(\.has-text\) \.ch-row2 > \.ch-send \{ display: none !important; \}/, 'Send only with words; no voice button of its own');
  assert.match(css, /:is\(\.ch-newchat, \.nc-classic\) \{ display: none !important; \}/, 'Home has no greeting');
  assert.match(css, /\.ch-row2 \{\s*display: grid !important;[^}]*min-height: 52px;[^}]*border-radius: 26px;/, 'a 52 px pill composer (r 26)');
  const js = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.ok(!/Math\.random|innerHTML|localStorage|setTimeout|setInterval|fetch\(/.test(js), 'no timers, markup strings, storage or fetches of its own');
  assert.match(js, /import \{ viewChrome, openApps, realApps, matches, CHATS, MIC \} from '\.\.\/apps\/chrome\.js';/, 'the shared sheet and app list');
  assert.match(js, /export const SIDE = 288, RAIL = 52, DOCKED_FROM = 900;/);
});

test('desktop core hooks: the adapter lists chats with Chats\' own actions, shows the Chats desk, a New chat in it; Settings over the page', () => {
  const dj = read('web/desktop/desktop.js');
  const fn = dj.match(/sessionList: (\(\) => \{[\s\S]*?\n    \}),\n    \/\/ The thread's own actions/)[1];
  const s = (id, extra = {}) => ({ id, title: id.toUpperCase(), status: 'completed', ...extra });
  const LIVE = { ok: true, workGroups: () => ({ working: [s('w')], ready: [s('r'), s('n')], archive: [s('a')] }), isNew: x => x.id === 'n', cardAt: () => '' };
  const CHATS = { threadActions: x => x.id === 'w' ? [] : x.id === 'a' ? ['restore', 'snooze'] : ['snooze', 'stop_watch', 'done'] };
  const out = vm.runInNewContext(`(${fn})()`, { LIVE, CHATS, window: { WosChatPins: { has: id => id === 'r' } } });
  assert.deepEqual(JSON.parse(JSON.stringify(out.working[0].actions)), ['pin', 'rename']);
  assert.deepEqual(JSON.parse(JSON.stringify(out.ready.map(r => [r.id, r.pinned, r.unread, r.actions]))), [['r', true, false, ['pin', 'rename', 'unread', 'snooze', 'done']], ['n', false, true, ['pin', 'rename', 'snooze', 'done']]]);
  assert.deepEqual(JSON.parse(JSON.stringify(out.archive[0].actions)), ['pin', 'rename', 'restore', 'snooze']);
  assert.match(dj, /showChats: \(\) => !!skinShowChats\(\),\n    newChat: \(\) => \{ const w = skinShowChats\(\); if \(!w\) return false; newChat\(\); return true; \},/);
  assert.match(dj, /const settingsOver = \(\) => document\.documentElement\.hasAttribute\('data-settings-over'\);/); assert.match(dj, /if \(homeOpen \|\| settingsOver\(\)\) \{  \/\/ from Home/, 'a layout may keep Settings over the page');
  assert.match(read('web/layouts/apps/chrome.js'), /const rawSpot = orb \|\| \(shell === 'phone' \? orbSpot : null\);/, 'a view drawing its own orb says where it is');
});

test('top bar: ☰ (the Ready count) · Home · the workspace switcher (Home only); the drawer: open apps, All apps, Archive / Working / Ready, Settings, New chat', async () => {
  const w = world();
  const off = (await layout()).default(w.api);
  assert.equal(w.html.dataset.aiApps, 'on'); assert.equal(w.html.dataset.viewChrome, 'phone', 'the shared view chrome (dock without its switcher)');
  assert.deepEqual(w.st.swipes, { up: 'new', side: null, down: null }, 'round 5: a swipe up on the orb = a New chat to type in (tap = talk)');
  assert.equal(w.st.inset, 96, 'hosted apps keep room for the floating orb');
  const top = w.q('.aa-top'); assert.ok(top);
  assert.deepEqual(top.children.map(c => c.className), ['aa-tb aa-menu', 'aa-tb aa-home'], 'round 7: the switcher moved to the drawer header');
  assert.equal(w.q('.aa-name'), null, 'round 5: no name in the middle, a home button');
  assert.equal(w.q('.aa-home').getAttribute('aria-label'), 'Home'); assert.equal(w.q('.aa-home').tagName, 'BUTTON');
  assert.equal(w.q('.aa-ws-i').textContent, 'M'); assert.match(w.q('.aa-dws').getAttribute('aria-label'), /Workspace: Miguel/);
  assert.equal(w.q('.aa-dws .aa-word').textContent, 'Miguel', 'the drawer header names this Wizard');
  assert.match(w.q('.aa-menu').getAttribute('aria-label'), /2 ready/);
  assert.equal(w.q('.aa-menu .aa-count').textContent, '2', 'the Ready count on ☰, a number (no bare dot)'); assert.equal(w.q('.aa-dot'), null);
  // open the drawer
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.html.dataset.aaDrawer, 'open'); assert.equal(w.st.backs.length, 1, 'Back closes it');
  const rows = w.q('.aa-scroll').children.map(n => n.className.split(' ').find(c => /^aa-(grid|app|more|all|div|sec|sec-b|chat|viewall|empty)$/.test(c)));
  assert.deepEqual(rows, ['aa-sec', 'aa-sec-b', 'aa-sec', 'aa-sec-b', 'aa-sec', 'aa-sec-b', 'aa-sec', 'aa-sec-b'], 'the drawer = the chat list only (Miguel: apps live on Home), no Recents, no View all');
  assert.equal(w.q('.aa-scroll .aa-grid'), null, 'no app grid and no All apps in the drawer');
  assert.deepEqual(w.qa('.aa-chat').map(b => `${b.dataset.sid}:${b.dataset.kind}`), ['r1:ready', 'r2:ready'], 'Ready open; Working and Archive folded at first');
  assert.ok(w.q('.aa-chat[data-sid="r1"] .aa-st').classList.contains('is-new') && w.q('.aa-chat[data-sid="r1"] .aa-pin'), 'new dot, pin mark');
  assert.equal(w.q('.aa-chat[data-sid="r2"] .aa-st'), null, 'a seen chat is a plain title (no state ring)');
  assert.deepEqual(w.q('.aa-chat[data-sid="r1"]').children.map(c => c.className.split(' ').pop()), ['aa-row-t', 'aa-pin', 'is-new'], 'title first, the state at the end');
  // Home: the apps above the composer, open first (badged first), then the rest installed, then Get more
  w.q('.aa-scrim').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.q('.ah-grid').children.map(b => b.dataset.app ? (b.classList.contains('is-open-first') ? '|' : '') + b.dataset.app : '+'), ['music', 'mail', 'money', '|notes', 'maps', '+'], 'round 16 item 7: Pinned (his pins), Open (not pinned) in the same flow (round 17: the first marked, no divider), +');
  assert.equal(w.q('.ah-app[data-app="money"] .ah-badge').textContent, '3', 'the shell\'s own count, on the icon');
  assert.equal(w.q('.ah-app[data-app="money"] .ah-name').textContent, 'Money');
  assert.equal(w.q('.ah-app[data-app="money"]').getAttribute('aria-label'), 'Money, 3 new');
  w.q('.ah-app[data-app="money"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.gone, [4], 'an app goes to its desk (full screen on the phone)');
  w.q('.ah-plus').dispatchEvent(new FakePointerEvent('click')); assert.ok(w.q('.vc-sheet.vc-pick'), '+ = the picker');
  w.q('.vc-pick .vc-app[data-app="movies"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.opened.at(-1), 'movies', 'an installed app opens on a desk of its own');
  w.q('.ah-plus').dispatchEvent(new FakePointerEvent('click')); w.q('.vc-pick .vc-more').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.opened.at(-1), 'app-store', 'Get more = the App Store');
  // round 7 (Miguel, familiarity first): Home is the grid only, no Grid | Orb switch, no orb scene
  assert.equal(w.q('.ah-sw'), null); assert.equal(w.q('.ah-scene'), null); assert.deepEqual(w.q('.ah').children.map(c => c.className), ['ah-grid']);
  // footer
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  // round 2: icons only — a big round + (New chat) where ChatGPT's compose button sits, then a cog (Settings); no words,
  // no avatar letter; their accessible names say what they do
  assert.deepEqual(w.q('.aa-foot').children.map(b => [b.className, b.getAttribute('aria-label'), b.textContent]), [['aa-set', 'Settings', ''], ['aa-fuel', null, ''], ['aa-new', 'New chat', '']], 'round 7: cog left, gauge between, + right');
  assert.equal(w.q('.aa-av'), null); assert.equal(w.q('.aa-acct'), null);
  w.q('.aa-new').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.newChats, 1);
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  w.q('.aa-set').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.settings, ['']);
  assert.equal(w.q('.aa-viewall'), null, 'no View all'); assert.deepEqual(w.st.lists, []);
  off();
  assert.equal(w.q('.aa-top'), null); assert.equal(w.html.dataset.aiApps, undefined); assert.equal(w.html.dataset.viewChrome, undefined);
});

test('search covers chats (archive too) and apps; a chat row opens its thread; a long press opens its menu, mapped to Chats\' own actions', async () => {
  const w = world();
  (await layout()).default(w.api);
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  w.q('.aa-find').dispatchEvent(new FakePointerEvent('click'));
  const f = w.q('.aa-q'); f.value = 'mo'; f.dispatchEvent(new FakePointerEvent('input'));
  assert.deepEqual(w.qa('.aa-scroll .aa-gi, .aa-scroll .aa-row').map(b => b.dataset.app || b.dataset.sid), ['money', 'movies', 'a1']);
  w.q('.aa-cancel').dispatchEvent(new FakePointerEvent('click'));
  // tap
  w.q('.aa-chat[data-sid="r2"]').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.st.opened, ['thread:r2']); assert.equal(w.html.dataset.aaDrawer, undefined);
  // long press → menu
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  const row = w.q('.aa-chat[data-sid="r2"]');
  row.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 3, clientX: 50, clientY: 300, button: 0 }));
  const lp = w.st.timers.find(t => t.ms === 450); assert.ok(lp, 'a 450 ms still press'); lp.fn();
  assert.deepEqual(w.qa('.aa-pop-i').map(b => b.textContent), ['Pin', 'Rename', 'Mark unread', 'Snooze', 'Archive'], 'their order, Wizard\'s actions, filing last');
  assert.ok(row.classList.contains('is-held'));
  // the lift right after the press never closes it or picks an item
  w.q('.aa-menu-scrim').dispatchEvent(new FakePointerEvent('click')); assert.ok(w.q('.aa-pop'), 'still open after the lift');
  row.dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.opened, ['thread:r2'], 'the lift does not open the chat');
  const realNow = Date.now; Date.now = () => realNow() + 2000;
  try {
    w.q('.aa-pop-i[data-act="snooze"]').dispatchEvent(new FakePointerEvent('click'));
    assert.deepEqual(w.st.acts, [['r2', 'snooze']]); assert.equal(w.q('.aa-pop'), null);
    // a pinned row says Unpin; Rename closes the drawer first (Chats' rename sheet opens over the chat)
    const r1 = w.q('.aa-chat[data-sid="r1"]');
    r1.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 4, button: 0 })); w.st.timers.filter(t => t.ms === 450).at(-1).fn();
    assert.equal(w.q('.aa-pop-i[data-act="pin"]').textContent, 'Unpin');
    Date.now = () => realNow() + 4000;
    w.q('.aa-pop-i[data-act="rename"]').dispatchEvent(new FakePointerEvent('click'));
  } finally { Date.now = realNow; }
  assert.deepEqual(w.st.acts.at(-1), ['r1', 'rename']); assert.equal(w.html.dataset.aaDrawer, undefined);
  // a working thread offers only what Chats allows on it
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  w.q('.aa-sec[data-sec="working"]').dispatchEvent(new FakePointerEvent('click'));
  w.q('.aa-chat[data-sid="w1"]').dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 5, button: 0 })); w.st.timers.filter(t => t.ms === 450).at(-1).fn();
  assert.deepEqual(w.qa('.aa-pop-i').map(b => b.dataset.act), ['pin', 'rename']);
});

test('main screen: Home and the bare list become the chat; a thread left for the list opens the drawer; an app is "app"', async () => {
  const w = world({ route: { home: true, view: 'desk', thread: null, desk: 0, app: null } });
  (await layout()).default(w.api);
  w.run(); assert.equal(w.st.newChats, 1, 'Home → a New chat (round 4: Home and New chat are one screen)'); assert.equal(w.st.chats, 0);
  w.st.route = { home: false, view: 'thread', thread: 't9', desk: 1, app: 'chats' }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aiFront, 'chat');
  w.st.route = { home: false, view: 'list', thread: null, desk: 1, app: 'chats' }; w.emit('route', w.st.route); w.run();
  assert.equal(w.st.newChats, 2, 'the bare list becomes a New chat'); assert.equal(w.html.dataset.aaDrawer, 'open', 'and the drawer (the list lives there)');
  w.q('.aa-scrim').dispatchEvent(new FakePointerEvent('click'));
  w.st.route = { home: false, view: 'desk', thread: null, desk: 4, app: 'money' }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aiFront, 'app');
});

/* Round 4 (Miguel, 2 Nov 2026): Home is the empty New chat with no greeting; the Wizard's name in the top bar goes Home
 * from anywhere (an app included), as do the orb's swipe up and the drawer's +; the composer's own voice button is
 * gone (the dock orb under the composer talks), the mic stays, Send shows only with words. */
test('round 4: Home has no greeting: only the skin background, the composer and the orb', async () => {
  const w = world({ route: { home: true, view: 'desk', thread: null, desk: 0, app: null } });
  (await layout()).default(w.api);
  w.run(); assert.equal(w.st.newChats, 1, 'Home = a New chat'); assert.equal(w.html.dataset.aiNew, 'on', 'flagged as Home');
  w.emit('home'); w.run(); assert.equal(w.st.newChats, 2, "the shell's Home lands on a New chat too");
  w.st.route = { home: false, view: 'thread', thread: 't9', desk: 1, app: 'chats' }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aiNew, undefined, 'a thread is not Home');
  w.st.route = { home: false, view: 'thread', thread: '__new__', desk: 1, app: 'chats' }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aiNew, 'on', 'a New chat is Home');
  const css = read('web/layouts/ai-apps/layout.css'), P = 'html[data-shell="phone"][data-layout="ai-apps"]';
  assert.ok(css.includes(P + ' .win.app-chats :is(.ch-newchat, .nc-classic) { display: none !important; }'), 'no greeting, no mark, no boxed hint');
  assert.ok(!/\.nc-hi \{|\.nc-sub \{|\.nc-mark \{/.test(css), 'no greeting styles left');
  assert.match(css, /\[data-ai-new\] \.aa-top \{ background: transparent !important;/, "Home lets the skin's background through");
  assert.ok(!/:not\(\[data-ai-front="app"\]\) #device[^{]*#dock \{ opacity: 0/.test(css), 'the dock orb is no longer hidden over the chat');
  assert.ok(!/--aa-orb-room/.test(css + read('web/layouts/ai-apps/layout.js')), "round 6: no row of its own for the orb under the composer (it sits inside it)");
});

test("round 4 + 5: the home button (in place of the name) goes Home from an app (and from a thread); so does the drawer's +", async () => {
  const w = world({ route: { home: false, view: 'desk', thread: null, desk: 3, app: 'music' } });
  (await layout()).default(w.api);
  assert.equal(w.html.dataset.aiFront, 'app');
  const mid = w.q('.aa-home');
  assert.equal(mid.tagName, 'BUTTON'); assert.equal(mid.getAttribute('type'), 'button'); assert.equal(mid.getAttribute('aria-label'), 'Home');
  mid.dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.st.newChats, 1, 'Home (a New chat) from inside Music');
  w.st.route = { home: false, view: 'thread', thread: 't9', desk: 1, app: 'chats' }; w.emit('route', w.st.route);
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.html.dataset.aaDrawer, 'open');
  mid.dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.st.newChats, 2, 'from a thread too'); assert.equal(w.html.dataset.aaDrawer, undefined, 'the drawer closes');
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click')); w.q('.aa-new').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.st.newChats, 3, "the drawer's round + is the same Home");
  assert.deepEqual(w.st.swipes, { up: 'new', side: null, down: null }, 'round 5: a swipe up on the orb = a New chat with the keyboard up');
});

test('round 4: the composer: no voice button of its own (the orb talks), the mic stays, Send only with words', async () => {
  const w = world();
  (await layout()).default(w.api);
  const form = new El('form'); form.className = 'ch-compose'; const row2 = new El('div'); row2.className = 'ch-row2'; const send = new El('button'); send.className = 'ch-send';
  form.append(row2); row2.append(send); w.device.append(form);
  const e = w.fire('pointerdown', send, { pointerId: 11 });
  assert.ok(!e.defaultPrevented); assert.deepEqual(w.st.orbDown, [], 'an empty composer never hands a press to the orb');
  const c = w.fire('click', send, { detail: 1 }); assert.ok(!c.defaultPrevented);
  const js = noComments(read('web/layouts/ai-apps/layout.js'));
  assert.ok(!/new PointerEvent|api\.voice\.tap|Talk to /.test(js), 'no forwarding to the orb, no voice label on Send');
  const css = read('web/layouts/ai-apps/layout.css'), P = 'html[data-shell="phone"][data-layout="ai-apps"]';
  assert.ok(css.includes(P + ' .win.app-chats .ch-compose:not(.has-text) .ch-row2 > .ch-send { display: none !important; }'), 'the round Send is hidden with no words');
  assert.ok(!/:not\(\.has-text\) \.ch-row2 > \.ch-send::before/.test(css), 'no voice-wave mark on an empty Send');
  // round 6 (Miguel): the orb replaces the microphone: the composer's mic gives way and the orb takes its slot; the orb
  // no longer steps aside while typing (it stays in the composer, Send to its right, like ChatGPT's mic + send)
  assert.ok(css.includes(P + ' .win.app-chats .ch-row2 > .ch-mic { display: none !important; }'), 'the mic gives way to the orb');
  assert.ok(!/textarea:focus\) #device[^{]*#dock \{ opacity: 0/.test(css), 'the orb stays while typing');
});

test('core hooks: the phone adapter lists chats with Chats\' own actions and acts through Chats; the layout API passes only known actions', () => {
  const app = read('web/app.js'), host = read('web/core/skin-host.js');
  const fn = app.match(/sessionList: (\(\) => \{[\s\S]*?\n    \}),\n    sessionAct/)[1];
  const s = (id, extra = {}) => ({ id, title: id.toUpperCase(), status: 'completed', ...extra });
  const LIVE = { ok: true, workGroups: () => ({ working: [s('w')], ready: [s('r'), s('n')], archive: [s('a')] }), isNew: x => x.id === 'n', cardAt: () => '' };
  const CHATS = { threadActions: x => x.id === 'w' ? [] : x.id === 'a' ? ['restore', 'snooze'] : ['snooze', 'stop_watch', 'done'] };
  const out = vm.runInNewContext(`(${fn})()`, { LIVE, CHATS, window: { WosChatPins: { has: id => id === 'r' } } });
  assert.deepEqual(JSON.parse(JSON.stringify(out.working[0].actions)), ['pin', 'rename']);
  assert.deepEqual(JSON.parse(JSON.stringify(out.ready.map(r => [r.id, r.pinned, r.unread, r.actions]))), [['r', true, false, ['pin', 'rename', 'unread', 'snooze', 'done']], ['n', false, true, ['pin', 'rename', 'snooze', 'done']]]);
  assert.deepEqual(JSON.parse(JSON.stringify(out.archive[0].actions)), ['pin', 'rename', 'restore', 'snooze']);
  const act = app.match(/sessionAct: (\(sid, act\) => \{[\s\S]*?\n    \}),\n    showChats/)[1];
  const calls = [], ctx = { window: { WosChatPins: { toggle: () => true } }, toast: (...a) => calls.push(['toast', a[1]]), showChats: () => ({ id: 'c1' }),
    CHATS: { openRenameSheet: (w, id) => calls.push(['rename', w, id]), threadAct: (w, id, a) => calls.push(['act', w, id, a]) } };
  const run = vm.runInNewContext(`(${act})`, ctx);
  run('s1', 'pin'); run('s1', 'rename'); run('s1', 'done'); run('s1', 'unread');
  assert.deepEqual(calls, [['toast', 'Pinned'], ['rename', 'c1', 's1'], ['act', 'c1', 's1', 'done'], ['act', 'c1', 's1', 'unread']]);
  assert.match(app, /showChats: \(\) => !!showChats\(\),\n    newChat: \(\) => \{ const w = showChats\(\); if \(!w\) return false; CHATS\.openChat\(w\.id, '__new__'\); return true; \},/);
  assert.match(host, /const SESSION_ACTS = Object\.freeze\(\['snooze', 'done', 'unread', 'restore', 'pin', 'rename'\]\);/);
  assert.match(host, /: SESSION_ACTS\.includes\(action\) \? !!shell\.sessionAct\?\.\(id, action\) : false,/);
  assert.match(host, /chats: \(\) => live\(\) \? !!shell\.showChats\?\.\(\) : false,\n        newChat: \(\) => live\(\) \? !!shell\.newChat\?\.\(\) : false,/);
  assert.match(host, /settings: page => \{ if \(live\(\)\) shell\.openSettings\?\.\(typeof page === 'string' && \/\^\[a-z-\]\{1,24\}\$\/\.test\(page\) \? page : undefined\); \},/);
  // workspaces: this Wizard first, then the managed ones from the devices registry
  const ws = host.match(/list: \(\) => \{\n          if \(!live\(\) \|\| !isDoc\) return \[\];([\s\S]*?)\n        \},\n        refresh/)[1];
  const list = vm.runInNewContext(`(() => {${ws}})()`, { window: { WosResources: { state: { devices: { this: { wizard: 'Miguel' }, managed: [{ id: 'g', name: 'Carlos', org: 'Acme' }, null] } } }, WizConfig: { agent: () => 'Oscar', owner: () => 'Miguel' } } });
  assert.deepEqual(JSON.parse(JSON.stringify(list)), [{ id: 'this', name: 'Miguel', org: '', current: true, owner: 'Miguel' }, { id: 'g', name: 'Carlos', org: 'Acme', current: false }]);
});

test('round 2 shapes: rounded like the native apps (measured), icon-only drawer foot, an icon grid for the open apps', () => {
  const css = read('web/layouts/ai-apps/layout.css'), P = 'html\\[data-shell="phone"\\]\\[data-layout="ai-apps"\\] ';
  const rule = sel => (css.match(new RegExp(P + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}')) || [])[1] || '';
  assert.match(rule('.aa-tb::before'), /border-radius: 50%;/, 'top-bar buttons are round discs (ChatGPT)');
  assert.match(rule('.aa-drawer'), /border-radius: 0 16px 16px 0;/, 'the drawer\'s end corners (Claude, 16 dp)');
  assert.match(rule('.aa-row'), /border-radius: 12px;/, 'row and selection pills (Claude, 11 dp)');
  assert.match(rule('.aa-pop'), /border-radius: 18px;/, 'menus (ChatGPT long-press menu, 16–18 dp)');
  assert.match(rule('.aa-sh-card'), /border-radius: 28px 28px 0 0;/, 'sheets');
  assert.match(rule('.aa-search'), /height: 44px;[^}]*border-radius: 22px;/, 'search is a full pill');
  assert.match(rule('.aa-new'), /width: 56px; height: 56px;[^}]*border-radius: 50%;/, 'New chat = a big round +');
  assert.match(rule('.aa-set'), /width: 48px; height: 48px;[^}]*border-radius: 50%;/, 'Settings = a round cog');
  assert.match(rule('.aa-tile'), /width: 64px; height: 64px;[^}]*border-radius: 15px;/, 'round 6: big app icons, rounded squares (≈ 23 %, the iPhone\'s)');
  assert.match(rule('.aa-grid'), /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/, 'round 6: four a row, like the iPhone home screen');
  assert.match(rule('.aa-gt'), /width: 64px; height: 64px;/, 'cells stay >= 44 px targets');
  assert.ok(!/\.aa-acct|\.aa-av\b|aa-more/.test(css + read('web/layouts/ai-apps/layout.js')), 'the avatar letter, the Settings word and "N more open" are gone');
  const chrome = read('web/layouts/apps/chrome.css');
  assert.match(chrome, /max-height: 88%; border-radius: 28px 28px 0 0;/, 'the shared app sheet matches');
});

/* A swipe from the left of a chat is the drawer's alone (Miguel, 2 Nov 2026): it used to also run the thread swipe-back
 * (core/thread-swipe-back.js, touch events on the chat), which left the chat for a New chat under the drawer. Runs the
 * REAL swipe-back built-in beside the layout and feeds both the browser's event order: pointer, then touch; the
 * layout's listeners are on the document (capture), the swipe-back's on the chat, so a stopped touch never gets there. */
test('a swipe from the left of a chat opens the drawer and keeps the chat: the thread swipe-back never also runs', async () => {
  let sbSetup = null;
  globalThis.window = { ...(globalThis.window || {}), WosSkinHost: { builtin: (_n, fn) => { sbSetup = fn; } }, getSelection: () => '' };
  await import(new URL('web/core/thread-swipe-back.js', root).href);
  assert.equal(typeof sbSetup, 'function');
  for (const x0 of [30, 60, 150, 6, 20]) {
    const w = world({ route: { home: false, view: 'thread', thread: 't1', desk: 1, app: 'chats' } });
    const chats = new El('div'), thread = new El('div'), msgs = new El('div');
    thread.setAttribute('data-part', 'thread'); msgs.className = 'ch-msgs'; chats.append(thread); thread.append(msgs); w.device.append(chats);
    (await layout()).default(w.api);
    let backs = 0;
    sbSetup({ part: n => (n === 'thread' ? chats : null), route: () => ({ ...w.st.route }), env: { edgeInset: 24 },
      listen: (el, type, fn) => { el.addEventListener(type, fn); return () => {}; }, frame: fn => fn(0), on() {}, nav: { back: () => { backs++; return true; } } });
    assert.equal(w.html.dataset.aiFront, 'chat');
    const send = (type, x, y) => {
      const pt = { clientX: x, clientY: y, identifier: 0 };
      if (type.startsWith('pointer')) return w.fire(type, msgs, { pointerType: 'touch', pointerId: 31, clientX: x, clientY: y });
      const e = { type, target: msgs, cancelable: true, touches: type === 'touchend' ? [] : [pt], changedTouches: [pt], stopped: false,
        stopPropagation() { this.stopped = true; }, preventDefault() { this.defaultPrevented = true; } };
      for (const fn of w.doc.__listeners?.[type] || []) fn(e);
      if (!e.stopped) msgs.dispatchEvent(e);
      return e;
    };
    const y = 400; let now = 0; const realNow = performance.now; performance.now = () => now;
    send('pointerdown', x0, y); send('touchstart', x0, y);
    for (let i = 1; i <= 10; i++) { now = i * 30; send('pointermove', x0 + 18 * i, y + i); send('touchmove', x0 + 18 * i, y + i); }
    send('pointerup', x0 + 180, y + 10); send('touchend', x0 + 180, y + 10);
    performance.now = realNow;
    assert.equal(backs, 0, `from x=${x0}: the thread swipe-back did not run (no step back to the list, no New chat)`);
    assert.equal(w.st.newChats, 0, `from x=${x0}: the chat stays`);
    assert.equal(w.html.dataset.aaDrawer, 'open', `from x=${x0}: the drawer opened`);
    assert.deepEqual(w.st.claims, [31], `from x=${x0}: the drawer claimed the finger (the dock swipe and row long-press stand down)`);
  }
  // still the swipe-back's own elsewhere: a vertical scroll is not the drawer's, and code keeps its sideways gesture
  const w = world({ route: { home: false, view: 'thread', thread: 't1', desk: 1, app: 'chats' } });
  (await layout()).default(w.api);
  const pre = new El('pre'); w.device.append(pre);
  const ev = (type, x, y, target) => { const pt = { clientX: x, clientY: y }; const e = { type, target, cancelable: true, touches: [pt], changedTouches: [pt], stopPropagation() { this.stopped = true; }, preventDefault() {} }; for (const fn of w.doc.__listeners?.[type] || []) fn(e); return e; };
  ev('touchstart', 150, 400, pre); assert.equal(ev('touchmove', 250, 402, pre).stopped, undefined, 'a code block keeps its sideways scroll');
  ev('touchstart', 150, 400, w.device); assert.equal(ev('touchmove', 152, 480, w.device).stopped, undefined, 'a vertical scroll is not the drawer\'s');
  assert.equal(w.html.dataset.aaDrawer, undefined);
});

/* Round 5 (Miguel, 2 Nov 2026): Wizard's own sections in place of Recents + View all (the drawer / sidebar IS the chat
 * list; Archive, Working, Ready in the stock Chats order, Ready open, Working and Archive folded, kept per device); a
 * home button in the top bar's middle; the workspace switcher only on Home; the Ready count on ☰ (none on the orb, no
 * moons); a swipe up on the orb = a New chat with the keyboard up. */
test('round 5: the drawer IS the chat list: Archive, Working, Ready sections that fold, kept on this device', async () => {
  const w = world();
  (await layout()).default(w.api);
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  const heads = () => w.qa('.aa-sec').map(h => `${h.textContent}:${h.getAttribute('aria-expanded')}`);
  assert.deepEqual(heads(), ['Archive:false', 'Working:false', 'Snoozed:false', 'Ready:true'], 'the stock Chats order (Archive on top), round 13: Snoozed above Ready, Ready open at first');
  assert.ok(w.qa('.aa-sec').every(h => h.tagName === 'BUTTON' && h.classList.contains('aa-lab')), 'the Recents label\'s look, a button');
  assert.equal(w.qa('.aa-lab').filter(h => h.textContent === 'Recents').length, 0, 'no Recents');
  // Archive opens: its rows come from the real archive list (the trusted session hook), with Restore in their menu
  w.q('.aa-sec[data-sec="archive"]').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(heads(), ['Archive:true', 'Working:false', 'Snoozed:false', 'Ready:true']);
  assert.deepEqual(w.qa('.aa-chat').map(b => `${b.dataset.sid}:${b.dataset.kind}`), ['a1:archive', 'r1:ready', 'r2:ready']);
  assert.deepEqual(w.st.store.sections, { archive: true, working: false, snoozed: false, ready: true }, 'remembered on this device (api.storage)');
  w.q('.aa-sec[data-sec="ready"]').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aa-chat').map(b => b.dataset.sid), ['a1'], 'Ready folds too');
  const a1 = w.q('.aa-chat[data-sid="a1"]');
  a1.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 9, button: 0 })); w.st.timers.filter(t => t.ms === 450).at(-1).fn();
  assert.deepEqual(w.qa('.aa-pop-i').map(b => b.dataset.act), ['pin', 'rename', 'snooze', 'restore'], 'the same row menu, Restore for an archived chat');
  // a fresh layout on this device reads the stored choice
  const w2 = world(); w2.st.store.sections = { archive: true, working: true, ready: false };
  (await layout()).default(w2.api); w2.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w2.qa('.aa-sec').map(h => h.getAttribute('aria-expanded')), ['true', 'true', 'false', 'false']);
  assert.deepEqual(w2.qa('.aa-chat').map(b => b.dataset.sid), ['a1', 'w1']);
  const { SECTIONS, sectionsOpen } = await import(new URL('web/layouts/ai-apps/parts.js', root).href);
  assert.deepEqual(SECTIONS.map(x => x[0]), ['archive', 'working', 'snoozed', 'ready']);
  assert.deepEqual(sectionsOpen(null), { archive: false, working: false, snoozed: false, ready: true }, 'Snoozed folded at first');
  assert.deepEqual(sectionsOpen({ ready: 'x', archive: true }), { archive: true, working: false, snoozed: false, ready: true }, 'only booleans are taken');
});

test('round 5: home button in the middle, the switcher on Home only, the Ready count on ☰ (none on the orb), swipe up types', async () => {
  const w = world({ route: { home: false, view: 'thread', thread: 't9', desk: 1, app: 'chats' } });
  (await layout()).default(w.api);
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  w.q('.aa-dws').dispatchEvent(new FakePointerEvent('click')); assert.ok(w.q('.aa-sheet'), 'the drawer header opens the switcher sheet');
  assert.equal(w.html.dataset.aaDrawer, undefined, 'over the page, the drawer closed');
  w.st.route = { home: false, view: 'desk', thread: null, desk: 3, app: 'music' }; w.emit('route', w.st.route);
  assert.equal(w.q('.aa-sheet'), null, 'an app: its sheet closes');
  w.q('.aa-home').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.newChats, 1, 'the home button: Home');
  const css = read('web/layouts/ai-apps/layout.css'), P = 'html[data-shell="phone"][data-layout="ai-apps"]';
  assert.ok(css.includes(P + ' #dock :is(#orbBadge, #moons) { display: none !important; }'), 'no count and no moons on the orb');
  assert.match(css, /\.aa-tb \{\s*position: relative; width: 48px; height: 48px;/, 'the home button is a 48 px target (>= 44)');
  assert.match(css, /\.aa-count \{[^}]*background: var\(--amber, var\(--aa-ink\)\);/, 'the Ready count in Chats\' amber');
  assert.ok(!/\.aa-viewall|\.aa-dot \{|\.aa-mid \{/.test(css), 'View all, the bare dot and the name are gone');
  // the dock orb's swipe up: a New chat with the cursor in its composer, focused within the swipe (the keyboard comes up)
  const app = read('web/app.js'), host = read('web/core/skin-host.js');
  const fn = app.match(/function orbSwipeNew\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(fn, /const w = showChats\(\); if \(!w\) return;\n    CHATS\.openChat\(w\.id, '__new__'\);/);
  assert.match(fn, /winEl\(w\.id\)\?\.querySelector\('\.ch-compose textarea'\)/); assert.match(fn, /ta\.focus\(\{ preventScroll: true \}\)/);
  assert.match(host, /const ORB_SWIPE_ACTS = \{ up: \['home', 'new'\], side: \[\], down: \[\] \};/);
  const calls = []; const focused = []; const ta = { value: 'hi', focus: o => focused.push(o), setSelectionRange: (a, b) => calls.push([a, b]) };
  const w0 = { id: 'c1' }; const ctx = { sheet: null, closeSheets() {}, pillOvOpen: () => false, closeOverview() {}, showChats: () => w0, CHATS: { openChat: (id, t) => calls.push([id, t]) }, winEl: id => ({ querySelector: () => (id === 'c1' ? ta : null) }) };
  vm.runInNewContext(fn + '; orbSwipeNew();', ctx);
  assert.deepEqual(calls, [['c1', '__new__'], [2, 2]]); assert.equal(JSON.stringify(focused), '[{"preventScroll":true}]');
});

test('round 5 + 7 desktop: no home button in the top row (round 7), the switcher on Home only, the sections, the count on ◫', () => {
  const css = read('web/layouts/ai-apps/desktop.css'), js = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.ok(!/\.aad-home\b|\btHome\b/.test(css + js), 'round 7: the top row has no home button (Home = its tab, +, ⌥1)');
  assert.ok(!/aad-tname|aad-viewall/.test(css + js), 'the name in the top row and View all are gone');
  assert.match(js, /top\.append\(cTop, pTop\);/, 'round 15: no tab strip; the docked chat\'s title and the app panel\'s header');
  assert.match(js, /head\.append\(wsBtn, findBtn, searchBox, cancelBtn, togBtn\);/, 'round 7: the switcher is the sidebar header; round 16: no ⌂');
  assert.match(js, /drag up for a new chat to type in/);
});
test('round 5: notifications in the list: Chats\' own items as plain rows with a small bell, their actions kept', async () => {
  // the layout: a notification row = the same row shape, a bell before the title, no card; its menu = the inbox's actions
  const w = world();
  w.st.sessions.ready.unshift({ id: 'notif:n1', title: 'Card payment due', kind: 'ready', note: true, app: 'money', unread: true, snoozed: false, pinned: false, actions: ['snooze', 'done'] });
  w.st.sessions.ready.push({ id: 'notif:n2', title: 'Backup finished', kind: 'ready', note: true, app: '', unread: false, snoozed: true, pinned: false, actions: ['restore', 'done'] });
  (await layout()).default(w.api);
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  const n1 = w.q('.aa-chat[data-sid="notif:n1"]');
  assert.ok(n1 && n1.classList.contains('aa-row'), 'the same row as a chat');
  assert.deepEqual(n1.children.map(c => c.className.split(' ').pop()), ['aa-bell', 'aa-row-t', 'is-new'], 'a bell before the title, the new dot at the end');
  assert.match(n1.getAttribute('aria-label'), /^Notification: Card payment due, ready, new$/);
  assert.deepEqual(w.qa('.aa-chat').map(b => b.dataset.sid), ['notif:n1', 'r1', 'r2', 'notif:n2'], 'in Ready, Chats\' order (snoozed last)');
  n1.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 12, button: 0 })); w.st.timers.filter(t => t.ms === 450).at(-1).fn();
  assert.deepEqual(w.qa('.aa-pop-i').map(b => b.textContent), ['Snooze', 'Archive']);
  const realNow = Date.now; Date.now = () => realNow() + 2000;
  try {
    w.q('.aa-pop-i[data-act="done"]').dispatchEvent(new FakePointerEvent('click'));
    assert.deepEqual(w.st.acts.at(-1), ['notif:n1', 'done']);
    w.q('.aa-chat[data-sid="notif:n2"]').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.opened.at(-1), 'thread:notif:n2', 'a tap opens it');
  } finally { Date.now = realNow; }
  const css = read('web/layouts/ai-apps/layout.css') + read('web/layouts/ai-apps/desktop.css');
  assert.match(css, /\.aa-bell \{[^}]*color: var\(--aa-ink-2\);/); assert.match(css, /\.aad-bell \{[^}]*color: var\(--aad-ink-2\);/);
  assert.ok(!/\.aad?-bell[^{]*\{[^}]*(amber|yellow|background)/.test(css), 'no yellow, no card');
  // the shell side: sessions.list() adds the inbox's items (while a package lists them), open / act go to its handler
  const host = read('web/core/skin-host.js');
  const src = host.match(/  const NOTE_ID = [\s\S]*?\n  function inboxAct\(action, id\) \{[^\n]*\n/)[0];
  const calls = [], items = [{ id: 'a', title: '**Pay** card', time: 300, read: false, app: 'money', priority: 4 }, { id: 'b', message: 'Backup done\nok', time: 100, read: true }, { id: 'c', title: 'old', time: 50, archived: true }];
  const ctx = { isDoc: true, window: { WosBell: { items: () => items } }, inboxThreads: new Map([['wizard/unified-inbox', { list: true, act: (a, i) => calls.push([a, i]) }]]) };
  vm.runInNewContext(src + ';globalThis.withNoteRows = withNoteRows; globalThis.inboxAct = inboxAct;', ctx);
  const rows = JSON.parse(JSON.stringify(ctx.withNoteRows([{ id: 'r9', at: new Date(200000).toISOString() }])));
  assert.deepEqual(rows.map(r => r.id), ['notif:a', 'r9', 'notif:b'], 'new ones among the chats by time, snoozed last, archived left out');
  assert.deepEqual([rows[0].title, rows[0].note, rows[0].unread, rows[0].actions, rows[2].title, rows[2].actions], ['Pay card', true, true, ['snooze', 'done'], 'Backup done', ['restore', 'done']]);
  ctx.inboxAct('open', 'a'); assert.deepEqual(calls, [['open', 'a']]);
  assert.match(host, /open: id => \{ if \(!live\(\) \|\| typeof id !== 'string' \|\| !id\) return; if \(id\.startsWith\(NOTE_ID\)\) inboxAct\(NOTE_ID_OPEN, id\.slice\(NOTE_ID\.length\)\); else shell\.openThread\(id\); \},/);
  assert.match(host, /: id\.startsWith\(NOTE_ID\) \? NOTE_ACTS\.includes\(action\) && inboxAct\(action, id\.slice\(NOTE_ID\.length\)\)/);
  ctx.inboxThreads.get('wizard/unified-inbox').list = false;
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.withNoteRows([]))), [], 'none while no package lists the inbox in Chats');
});

/* Round 6 (Miguel, 2 Nov 2026): big icons for real apps only; the orb IS the microphone (inside the composer in the
 * mic's slot, a small mic on it everywhere); a compact spot for the orb in an app's own bottom row; a tidy composer
 * (the model chip a control on the right, never a centred label on its own row; Snooze / Archive never half-hidden). */
test('round 6: the drawer grid lists real apps only (the sheet\'s Apps), never agent apps, connectors, system or in-development apps', async () => {
  const w = world();
  w.api.apps.kinds = () => ({ apps: [{ id: 'mail', name: 'Mail' }, { id: 'money', name: 'Money' }, { id: 'movies', name: 'Movies' }, { id: 'maps', name: 'Maps', system: true }], wiz: [{ id: 'notes', name: 'Notes' }], agents: [], conns: [], dev: [{ id: 'music', name: 'Music' }] });
  (await layout()).default(w.api);
  assert.deepEqual(w.q('.ah-grid').children.map(b => b.dataset.app ? (b.classList.contains('is-open-first') ? '|' : '') + b.dataset.app : '+'), ['music', 'mail', 'money', '|notes', 'maps', '+'], 'round 16 item 7: his pins, then (round 17: no divider) the open apps not pinned (any kind: they are open), then +');
  const { homeApps } = await import(new URL('web/layouts/ai-apps/home.js', root).href);
  assert.deepEqual(homeApps([{ id: 'mail', name: 'Mail' }, { id: 'money', name: 'Money' }, { id: 'notes', name: 'Notes' }, { id: 'music', name: 'Music' }], [{ desk: 1, id: 'wizard', name: 'Chats' }, { desk: 2, id: 'mail', name: 'Mail' }], w.api.apps.kinds(), () => false).rest.map(a => a.id),
    ['money', 'movies'], 'not open: Notes (agent app), Music (in development) and Maps (system) stay out');
  const { realApps } = await import(new URL('web/layouts/apps/chrome.js', root).href);
  assert.deepEqual(realApps([{ id: 'a' }, { id: 'b', connector: true }, { id: 'c', dev: true }, { id: 'd', system: true }], null).map(a => a.id), ['a'], 'without kinds: the flags');
  const dj = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.match(dj, /chrome\.open\(\{ exclude: \(\) => refreshPins\(\), people: 'For people' \}\);/, 'round 16 item 7: the + is the shared picker (no All apps grid)');
  const css = read('web/layouts/ai-apps/layout.css'), dcss = read('web/layouts/ai-apps/desktop.css');
  assert.match(css, /\.aa-tile\.is-logo \{ background: none; box-shadow: 0 1px 3px/, 'a logo fills its tile: no plate');
  assert.match(css, /\.aa-logo \{ width: 100%; height: 100%; object-fit: cover;/);
  assert.match(dcss, /\.aad-tile \{\s*--c:[^}]*width: 52px; height: 52px;/, 'desktop: 52 px icons four a row');
  assert.match(dcss, /\.aad-tile\.is-logo \{ background: none;/);
});

test('round 6: the orb moves to the spot it is given (an app\'s row) and back; its own spot reads through the move', async () => {
  const w = world();
  let place = null, home = null;
  w.api.apps.inset = (px, orb, pl) => { home = orb; place = pl; return () => {}; };
  // the real browser: the orb's box includes the move (translate), its size does not (offsetWidth)
  const st = w.html.style;
  w.orbWrap.getBoundingClientRect = () => { const dx = parseFloat(st.getPropertyValue('--vc-orb-dx')) || 0, dy = parseFloat(st.getPropertyValue('--vc-orb-dy')) || 0; return { left: 162 + dx, top: 773 + dy, width: 66, height: 66, x: 162 + dx, y: 773 + dy, right: 228 + dx, bottom: 839 + dy }; };
  w.orbWrap.offsetWidth = 66;
  (await layout()).default(w.api);
  assert.equal(typeof place, 'function', 'the view hears where the app in front wants the orb');
  assert.ok(w.orbWrap.children.some(c => c.className === 'vc-mic'), 'the orb wears a small microphone');
  place({ x: 356, y: 790, d: 44 });
  assert.equal(w.html.dataset.vcOrb, 'row');
  assert.equal(st.getPropertyValue('--vc-orb-dx'), '161px'); assert.equal(st.getPropertyValue('--vc-orb-dy'), '-16px'); assert.equal(st.getPropertyValue('--vc-orb-k'), '0.667');
  assert.deepEqual(home(), { x: 195, y: 806, d: 66 }, 'the bars still go around its own spot');
  place(null);
  assert.equal(w.html.dataset.vcOrb, undefined); assert.equal(st.getPropertyValue('--vc-orb-dx'), '', 'back to its own spot');
  const css = read('web/layouts/apps/chrome.css');
  assert.match(css, /html\[data-view-chrome="phone"\]\[data-vc-orb\] #dock > #orbWrap \{ translate: var\(--vc-orb-dx, 0px\) var\(--vc-orb-dy, 0px\); scale: var\(--vc-orb-k, 1\); \}/);
  assert.match(css, /#orbWrap\[data-mode\]:not\(\[data-mode="idle"\]\) > \.vc-mic \{ opacity: 0; \}/, 'a take shows the orb\'s own state');
  assert.match(read('web/layouts/ai-apps/desktop.css'), /\[data-vc-orb\] \.aad-orb \{ translate: var\(--vc-orb-dx, 0px\) var\(--vc-orb-dy, 0px\); scale: var\(--vc-orb-k, 1\); \}/, 'the desktop orb moves the same way');
});

test('round 6: the composer\'s orb slot is read from the grid\'s real tracks (one line, or words over the controls)', async () => {
  const { gridSlot } = await import(new URL('web/layouts/ai-apps/parts.js', root).href);
  const row = (cols, rows) => ({ ownerDocument: { defaultView: { getComputedStyle: () => ({ gridTemplateColumns: cols, gridTemplateRows: rows, columnGap: '0px', rowGap: 'normal', paddingLeft: '4px', paddingTop: '4px', borderLeftWidth: '0px', borderTopWidth: '0px' }) } },
    getBoundingClientRect: () => ({ left: 12, top: 780, width: 366, height: 52 }) });
  assert.deepEqual(gridSlot(row('44px 203px 67px 44px 0px 0px', '44px'), 3), { x: 12 + 4 + 44 + 203 + 67 + 22, y: 780 + 4 + 22, d: 44 }, 'one line: right of the model chip');
  assert.deepEqual(gridSlot(row('44px 170px 56px 44px 0px 44px', '40px 44px'), 3), { x: 12 + 4 + 44 + 170 + 56 + 22, y: 780 + 4 + 40 + 22, d: 44 }, 'two lines: on the controls\' line, Send to its right');
  assert.equal(gridSlot(row('none', 'none'), 3), null, 'not a grid: no slot');
  const js = noComments(read('web/layouts/ai-apps/layout.js'));
  assert.match(js, /return gridSlot\(row, 3\);/); assert.match(js, /chrome\.orbIn\(orbSlot\(\)\)/);
  assert.match(js, /if \(\(api\.voice\?\.state\?\.\(\)\?\.state \|\| 'idle'\) !== 'idle'\) return null;/, 'a take: the orb back in its own spot, among the stock voice controls');
  assert.match(js, /micGlyph: true/);
});

test('round 6: a tidy composer: the model chip is a control on the right (never a centred label), the orb in the mic\'s slot, Snooze / Archive never clipped', () => {
  for (const [file, P, slot] of [['web/layouts/ai-apps/layout.css', 'html[data-shell="phone"][data-layout="ai-apps"] .win.app-chats', '44px'], ['web/layouts/ai-apps/desktop.css', 'html[data-shell="desktop"][data-layout="ai-apps"] .win .dchats .pane-main', '40px']]) {
    const css = read(file);
    const rule = sel => { const i = css.indexOf(P + ' ' + sel + ' {'); assert.ok(i >= 0, `${file}: ${sel}`); return css.slice(i, css.indexOf('}', i)); };
    assert.match(rule('.ch-row2'), new RegExp(`display: grid !important; grid-template-columns: auto minmax\\(0, 1fr\\) auto ${slot} auto auto; grid-template-areas: "att field chip orb stop send";`), `${file}: one line: + · words · chip · orb`);
    assert.match(rule('.ch-compose.has-text .ch-row2'), /grid-template-areas: "field field field field field field" "att \. chip orb stop send";/, `${file}: with words: the words on top, the controls under them, chip · orb · Send on the right`);
    assert.match(rule('.ch-row2 > .ch-field'), /display: contents !important;/, `${file}: the field's box steps aside, so the chip is a control of the row`);
    assert.match(rule('.ch-field .ch-mlabel'), /grid-area: chip; position: static !important; justify-self: end;/, `${file}: the chip in its column on the right`);
    assert.match(rule('.ch-row2::after'), /grid-area: orb;/, `${file}: the orb's slot`);
    assert.ok(css.includes(P + ' .ch-row2 > .ch-mic { display: none !important; }'), `${file}: the orb replaces the mic`);
    assert.match(rule('.ch-msgs > .ch-tacts'), /position: sticky; bottom: 0;/, `${file}: Snooze / Archive: a row right above the composer, never half under it`);
    assert.match(rule('.ch-thread > .ch-latest'), /position: relative !important; inset: auto !important;[^}]*margin: -46px/, `${file}: ↓ Latest just above the composer, never on it`);
  }
});

/* Round 7 (Miguel, 2 Nov 2026, desktop): an app opens as a panel on the RIGHT (about a third) with the chat in the
 * middle (the Orb desktop's thirds), a thread slides in from the left, calm slide + fade, the open app lit in the grid,
 * Esc / ✕ close it; the AI fuel gauge at the top of the sidebar; no home button in the top row. */
test('round 7 + 15 desktop: the app panel and the docked chat are back (Arc), calm transitions, the fuel gauge in the sidebar, the orb in the middle of the main area', () => {
  const css = read('web/layouts/ai-apps/desktop.css'), js = noComments(read('web/layouts/ai-apps/desktop.js'));
  for (const k of ['data-aad-split', 'data-aad-wide', 'data-aad-chat', 'aad-in-right', 'aad-pload', 'aad-ptop', 'aad-ctop', '--aad-app-w', '--aad-chat-w']) assert.ok(css.includes(k), `round 15: ${k}`);
  for (const k of ['hidePanel', 'setWide', 'closeChat', 'docked']) assert.ok(js.includes(k), `round 15: ${k}`);
  assert.ok(!/aad-tplus|aad-strip|aadNtp|openNtp/.test(css + js), 'round 15: no tab strip, no New tab page');
  assert.match(css, /#stage > \.wsp\[data-aad-anim="thread"\] \.win \.dchats \.pane-main \.ch-thread \{ animation: aad-in-left 220ms/, 'a thread from the left');
  assert.ok(css.includes('html[data-shell="desktop"][data-layout="ai-apps"] #bar .mh-gauge { display: none !important; }'), 'round 8: one fuel gauge, the sidebar foot\'s');
  assert.match(css, /\.aad-orb \{ left: calc\(var\(--aad-side\) \+ var\(--aad-chat-w, 0px\) \+ \(100vw - var\(--aad-side\) - var\(--aad-chat-w, 0px\) - var\(--aad-app-w, 0px\) - var\(--aad-rs\)\) \/ 2 - 30px\); \}/, 'the orb stays in the middle of the room left between the panels');
});
/* Miguel, 2 Nov 2026: apps live on Home (Grid or the Orb scene); every desktop ⌥ key keeps working, with hold-⌥ hints. */
test('Home apps: open first (badged first), then the rest installed, real apps only; app letters avoid the desktop\'s own ⌥ keys', async () => {
  const home = await import('../web/layouts/ai-apps/home.js'), { homeApps, appKeys, APP_LETTERS } = home;
  const apps = [{ id: 'chats', name: 'Chats' }, { id: 'mail', name: 'Mail' }, { id: 'money', name: 'Money' }, { id: 'notes', name: 'Notes' }, { id: 'movies', name: 'Movies' }, { id: 'maps', name: 'Maps', system: true }];
  const kinds = { apps: apps.filter(a => ['mail', 'money', 'movies', 'maps'].includes(a.id)), wiz: [apps[3]], dev: [] };
  const desks = [{ id: 'chats', desk: 0 }, { id: 'mail', desk: 1 }, { id: 'money', desk: 2 }, { id: 'notes', desk: 3 }];
  const { open, rest } = homeApps(apps, desks, kinds, id => id === 'money');
  assert.deepEqual(open.map(a => a.id), ['money', 'chats', 'mail', 'notes'], 'round 12: every desk'); assert.deepEqual(rest.map(a => a.id), ['movies']);
  for (const k of 'CDFGHILNOPRSTVWXZ') assert.ok(!APP_LETTERS.includes(k), `⌥${k} keeps its meaning`);
  const ks = appKeys([{ id: 'mail', name: 'Mail' }, { id: 'money', name: 'Money' }, { id: 'movies', name: 'Movies' }]);
  assert.deepEqual(ks, { mail: 'M', money: 'E', movies: 'A' }, 'the first free letter of the name, else the first free one');
  assert.deepEqual(appKeys([{ id: 'money', name: 'Money' }, { id: 'mail', name: 'Mail' }], { mail: 'M' }), { mail: 'M', money: 'E' }, 'stable: a kept letter stays');
  assert.equal(home.homeStyle, undefined, 'round 7: no Home style any more'); assert.equal(home.HOME_STYLES, undefined);
  const src = read('web/layouts/ai-apps/home.js');
  assert.ok(!/paintSky|starsFor|palettes|homeStyle|ah-scene|ah-sw/.test(src), 'no orb Home scene left in home.js');
});
test('desktop ⌥ keys in the AI apps view: ⌥\\ sidebar, round 15 ⌥T All apps, ⌥W closes what is in front, ⌥F wider, ⌥` Home, ⌥ + letter an app; hints on their targets', () => {
  const js = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.match(js, /if \(e\.code === 'Backslash' && !e\.shiftKey\) \{ if \(!e\.repeat\) toggleSide\(\); return true; \}/);
  assert.match(js, /if \(e\.code === 'KeyT' && !e\.shiftKey\) \{ if \(!e\.repeat\) \(allOpenNow\(\) \? closeAll : openAll\)\(\); return true; \}/, '⌥T: the picker (round 16)');
  assert.match(js, /if \(e\.code === 'KeyW' && !e\.shiftKey && pane\) \{ if \(!e\.repeat\) \{ const d = desks\(\)\.find\(x => x\.desk === pane\.desk\); if \(d && !pins\.includes\(d\.id\)\) closeDesk\(d\); else hidePanel\(\); \} return true; \}/, '⌥W closes the panel\'s app (a pinned one hides)');
  assert.match(js, /if \(e\.code === 'KeyW' && !e\.shiftKey && docked\) \{ if \(!e\.repeat\) closeChat\(\); return true; \}/, '⌥W: the docked chat back to Home');
  assert.ok(!/KeyH|toggleStyle|Grid ⇄ Orb/.test(js), 'no ⌥H');
  assert.match(js, /id = k && !e\.shiftKey && appFor\(k\);/);
  assert.ok(!/isAppsKey|toggleApps/.test(js), 'round 10: no apps sidebar key');
  assert.ok(!/hold: true/.test(js), 'the shell\'s own hold-⌥ overlay draws the hints (not a layout overlay)');
  for (const [k, w] of [['\\\\', 'Sidebar'], ['N', 'New chat'], [',', 'Settings'], ['␣', 'Search'], ['S', 'Talk'], ['C', 'Command'], ['T', 'Add an app']]) assert.ok(js.includes(`'${k}', '${w}'`) || js.includes(`'${k}', open ? 'Close sidebar' : '${w}'`), `hint ${k} ${w}`);
  assert.match(js, /for \(const b of vtList\.querySelectorAll\('\.aad-vtab\[data-app\]'\)\)/, 'round 16: the app letters on the right column\'s rows (pins and open apps)');
  assert.match(js, /api\.keys\.guide\(\(\) => appChips\(\)\);/);
});

test('the Settings cog carries the System count (WosBell.attention through api.desk.attention), phone and desktop, like the stock gear / cog', async () => {
  for (const shell of ['phone', 'desktop']) {
    const w = world({ shell });
    let watch = null, at = { n: 3, label: 'new from Wizard' };
    const desk = { settings: p => w.st.settings.push(p ?? ''), home: () => {}, attention: fn => { watch = fn; return at; } };
    if (shell === 'desktop') Object.assign(w.api, { asset: n => '/wizard-os-home/layouts/ai-apps/' + n, storage: { get: () => null, set() {} }, keys: { on: () => () => {}, guide: () => () => {} },
      orb: { ready: () => new Promise(() => {}), onLevel: () => () => {} }, voice: { state: () => ({ state: 'idle' }), talk() {}, command() {}, on: () => () => {} } });
    w.api.desk = desk; w.api.apps.inset = () => () => {};
    const off = (await layout()).default(w.api);
    const cogs = w.qa(shell === 'phone' ? '.aa-set' : '.aad-set, .aad-rset');
    assert.ok(cogs.length >= 1, shell + ': a cog');
    for (const c of cogs) {
      const n = c.querySelector('.' + (shell === 'phone' ? 'aa' : 'aad') + '-setn');
      assert.ok(n && !n.hidden && n.textContent === '3', shell + ': the count on the cog');
      assert.equal(c.getAttribute('aria-label'), 'Settings, 3 new from Wizard');
    }
    assert.equal(typeof watch, 'function', shell + ': it follows changes');
    watch(null);
    for (const c of cogs) { const n = c.querySelector('.' + (shell === 'phone' ? 'aa' : 'aad') + '-setn'); assert.ok(n.hidden && n.textContent === '', shell + ': none, no number'); assert.equal(c.getAttribute('aria-label'), 'Settings'); }
    if (typeof off === 'function') off();
  }
  const host = read('web/core/skin-host.js');
  assert.match(host, /attention\(watch\) \{[\s\S]*?window\.WosBell\?\.attention\?\.\(\)[\s\S]*?'wizard:notify-attention'/, 'the layout API reads WosBell.attention and its change event');
});

/* Round 7 (Miguel, 2 Nov 2026): the switcher is the sidebar / drawer header; the fuel gauge between cog (left) and +
 * (right); Archive quieter; folded tallies; a useful rail (Ready chats with their stock status); a chat docked beside the
 * list (✕ / Esc back to Home); the app panel wider and back (⌥F) with a loading placeholder; a notification opens as a
 * chat; Home is the app grid only (the Grid | Orb choice is gone). */
const deskWorld = () => {
  const w = world({ shell: 'desktop' });
  const store = {}, keys = [];
  Object.assign(w.api, { asset: n => '/wizard-os-home/layouts/ai-apps/' + n, storage: { get: k => k in store ? store[k] : null, set: (k, v) => { store[k] = v; } },
    keys: { on: h => { keys.push(h); return () => {}; }, guide: () => () => {} }, orb: { ready: () => new Promise(() => {}), onLevel: () => () => {} }, voice: { state: () => ({ state: 'idle' }), talk() {}, command() {} },
    desk: { settings: p => w.st.settings.push(p ?? ''), home: () => {} } });
  w.api.apps.inset = () => () => {};
  return { w, store, keys };
};
test('round 7 + 15 desktop: a chat docks beside the sidebar (✕, Esc and ⌥W back Home); tallies; the rail by status in the expanded order', async () => {
  const { w, keys } = deskWorld();
  const stage = new El('div'); stage.id = 'stage'; const chatDesk = new El('div'); chatDesk.className = 'wsp'; const dchats = new El('div'); dchats.className = 'dchats';
  chatDesk.append(dchats); stage.append(chatDesk); w.html.children[0].append(stage);
  w.st.sessions.ready[0].state = 'needs'; w.st.sessions.ready[1].state = 'done';
  (await layout()).default(w.api);
  // folded tallies: Working 1 (a spinner), Archive none (quieter, no tally)
  assert.equal(w.q('.aad-sec[data-sec="working"] .aad-tally').getAttribute('data-n'), '1');
  assert.equal(w.q('.aad-sec[data-sec="archive"] .aad-tally'), null);
  assert.equal(w.q('.aad-sec[data-sec="ready"] .aad-tally'), null, 'an open section shows its rows, no tally');
  // a thread: round 15 (round 7's column) docked beside the sidebar, its title and ✕ over it; Esc / ⌥W / ✕ back Home
  w.st.route = { home: false, view: 'thread', thread: 'r1', desk: 1 }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aadChat, 'on', 'the docked column'); assert.equal(w.q('.aad-cx').hidden, false);
  assert.equal(w.q('.aad-tt').textContent, 'Ready one'); assert.equal(chatDesk.dataset.aadRole, 'chat');
  const n0 = w.st.newChats;
  assert.equal(keys[1].down({ key: 'Escape' }), true, 'Esc closes the column'); assert.equal(w.st.newChats, n0 + 1, 'Home = a new chat');
  w.st.route = { home: false, view: 'thread', thread: '__new__', desk: 1 }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aadChat, undefined, 'Home: no column');
  w.st.route = { home: false, view: 'thread', thread: 'r1', desk: 1 }; w.emit('route', w.st.route);
  assert.equal(keys[2].down({ altKey: true, code: 'KeyW' }), true, '⌥W too'); assert.equal(w.st.newChats, n0 + 2);
  w.st.route = { home: false, view: 'thread', thread: 'r1', desk: 1 }; w.emit('route', w.st.route);
  w.q('.aad-cx').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.newChats, n0 + 3, 'and its ✕');
  // the rail (round 12; round 13: the expanded list's order, Archive, Working, Snoozed, Ready and its statuses)
  w.q('.aad-tog').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.q('.aad-rlist').children.map(n => (n.className.includes('is-sub') ? '  ' : '') + n.querySelector('.aad-rk-w').textContent + ' ' + n.querySelector('.aad-rk-n').textContent),
    ['Ready 2', '  Needs 1', '  Done 1'], 'round 16: Ready and its statuses, short words (no Archive, no Working)');
  assert.match(w.q('.aad-rk[data-k="needs"]').getAttribute('aria-label'), /^1 Needs you: show them in Ready$/);
  // a status: one click opens the sidebar on Ready showing only that status, a chip shows all again
  w.q('.aad-rk[data-k="needs"]').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.html.dataset.aadSide, 'open'); assert.equal(w.q('.aad-sec[data-sec="ready"]').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(w.qa('.aad-rw[data-kind="ready"]').map(n => n.dataset.sid), ['r1'], 'only Needs you');
  assert.equal(w.q('.aad-only .aad-only-w').textContent, 'Needs you · 1 of 2');
  w.q('.aad-only').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aad-rw[data-kind="ready"]').map(n => n.dataset.sid), ['r1', 'r2'], 'Show all'); assert.equal(w.q('.aad-only'), null);
  w.q('.aad-tog').dispatchEvent(new FakePointerEvent('click')); w.q('.aad-rk[data-k="done"]').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aad-rw[data-kind="ready"]').map(n => n.dataset.sid), ['r2']);
  w.q('.aad-tog').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.html.dataset.aadSide, 'rail');
  w.q('.aad-rk[data-k="ready"]').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.html.dataset.aadSide, 'open'); assert.equal(w.q('.aad-sec[data-sec="ready"]').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(w.qa('.aad-rw[data-kind="ready"]').map(n => n.dataset.sid), ['r1', 'r2'], 'the filter went with the fold');
  const css = read('web/layouts/ai-apps/desktop.css'), P = 'html[data-shell="desktop"][data-layout="ai-apps"]';
  assert.ok(css.includes(P + ' .aad-sec[data-sec="archive"] > :is(span, .aad-sec-c) { opacity: .85; }'), 'Archive a step quieter');
  assert.match(css, /\.aad-tally::after \{ content: attr\(data-n\);/);
});
test('round 7: a notification opens as a chat (never Home), its route choice in the action row, a bell on its message', async () => {
  const { w } = deskWorld();
  const stage = new El('div'); stage.id = 'stage'; const chatDesk = new El('div'); chatDesk.className = 'wsp';
  const win = new El('div'); win.className = 'win'; const dchats = new El('div'); dchats.className = 'dchats'; const pm = new El('div'); pm.className = 'pane-main';
  const th = new El('div'); th.className = 'ch-thread ch-notif-thread'; const head = new El('div'); head.className = 'ch-head'; const ti = new El('div'); ti.className = 'ti'; const b = new El('b'); b.textContent = 'Card payment due';
  ti.append(b); head.append(ti); th.append(head); pm.append(th); dchats.append(pm); win.append(dchats); chatDesk.append(win); stage.append(chatDesk); w.html.children[0].append(stage);
  (await layout()).default(w.api);
  w.st.route = { home: false, view: 'thread', thread: '__new__', desk: 1 }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aiFront, 'chat', 'a chat'); assert.equal(w.html.dataset.aadNew, 'false', 'not Home (no see-through)');
  assert.equal(w.html.dataset.aadChat, 'on', 'round 15: docked like a chat'); assert.equal(w.q('.aad-tt').textContent, 'Card payment due', 'its title over the column');
  // phone: the same thread is a chat, not Home
  const p = world({ route: { home: false, view: 'thread', thread: '__new__', desk: 1, app: 'chats' } });
  const pw = new El('div'); pw.className = 'win app-chats'; const pt = new El('div'); pt.className = 'ch-thread ch-notif-thread'; pw.append(pt); p.device.append(pw);
  (await layout()).default(p.api);
  assert.equal(p.html.dataset.aiNew, undefined, 'phone: a notification is not the see-through Home');
  assert.equal(p.q('.ah').hidden, true, 'no Home apps over it');
  // its Badge | Chats choice moves into the thread's own sticky action row, first
  const route = new El('div'); route.className = 'ch-notif-route'; const msgs = new El('div'); msgs.className = 'ch-msgs'; const tacts = new El('div'); tacts.className = 'ch-tacts'; const btn = new El('button');
  tacts.append(btn); msgs.append(route, tacts); th.append(msgs);
  tacts.insertBefore = (n, ref) => { n.remove(); n.parentNode = tacts; tacts.children.splice(tacts.children.indexOf(ref), 0, n); };
  w.emit('render');
  assert.equal(route.parentNode, tacts); assert.equal(tacts.children[0], route, 'first in the action row');
  for (const [file, scope] of [['web/layouts/ai-apps/desktop.css', '.win .dchats .pane-main'], ['web/layouts/ai-apps/layout.css', '.win.app-chats']]) {
    const css = read(file);
    assert.ok(css.includes(`${scope} .ch-notif-thread .ch-tacts > .ch-notif-route { flex: 1 0 100%;`), `${file}: Badge | Chats on the action row's first line`);
    assert.ok(css.includes(`${scope} .ch-notif-thread .msg.a.ch-notif::before {`), `${file}: a bell on that message only`);
  }
});
test('round 7 phone: the drawer header is the switcher, cog · gauge · +, tallies; parts: statuses, the gauge copy; core: stiKind on rows', async () => {
  const w = world();
  w.st.sessions.working.push({ id: 'w2', title: 'Two', kind: 'working', actions: [] });
  (await layout()).default(w.api);
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.q('.aa-dh').children[0].className, 'aa-dws', 'the switcher where the name was');
  assert.equal(w.q('.aa-sec[data-sec="working"] .aa-tally').getAttribute('data-n'), '2');
  assert.equal(w.q('.aa-sec[data-sec="working"]').textContent, 'Working', 'the tally is drawn, not read out twice');
  const css = read('web/layouts/ai-apps/layout.css'), P = 'html[data-shell="phone"][data-layout="ai-apps"]';
  assert.ok(css.includes(P + ' .aa-sec[data-sec="archive"] > :is(span, .aa-sec-c) { opacity: .85; }'));
  const { stateOf, stateGroups, gaugeInto } = await import(new URL('web/layouts/ai-apps/parts.js', root).href);
  assert.equal(stateOf({ state: 'check' }), 'check'); assert.equal(stateOf({ needs: true }), 'needs'); assert.equal(stateOf({ note: true }), 'fyi'); assert.equal(stateOf({ state: 'odd' }), 'none');
  assert.deepEqual(stateGroups([{ id: 'a', state: 'done' }, { id: 'b', state: 'needs' }, { id: 'c' }]).map(g => g.state + ':' + g.rows.map(r => r.id)), ['needs:b', 'done:a', 'none:c']);
  // the gauge copy follows the live one and opens Settings › AI
  const src = new El('button'); src.className = 'mh-gauge'; src.setAttribute('data-s', 'ok'); src.setAttribute('aria-label', 'AI fuel: 60% left'); src.setAttribute('data-go', 'ai');
  src.cloneNode = () => { const c = new El('button'); c.className = src.className; c.attrs = { ...src.attrs }; return c; };
  w.device.append(src);
  const box = new El('div'); box.setAttribute('data-fuel-copy', ''); w.device.append(box); let opened = 0;
  const sig = gaugeInto(w.doc, box, '', () => opened++);
  assert.ok(sig && !box.hidden && box.children[0].classList.contains('vw-gauge') && box.children[0].getAttribute('data-go') === null);
  box.children[0].dispatchEvent(new FakePointerEvent('click')); assert.equal(opened, 1);
  assert.equal(gaugeInto(w.doc, box, sig, () => {}), sig, 'unchanged: no repaint');
  assert.match(read('web/core/chats.js'), /KIT, threadAct, threadActions, stiKind, notifOpen:/);
  for (const f of ['web/desktop/desktop.js', 'web/app.js']) assert.match(read(f), /needs: s\.status === 'waiting_for_approval' \|\| s\.attention\?\.state === 'needs_you', state: CHATS\.stiKind\?\.\(s\) \|\| '',/);
});
test('round 7: a hold (phone) or a right click (desktop) on a Home app icon offers it for the home screen through the stock Desks sheet', async () => {
  {
    // round 10: a right click on a Home icon opens its quick actions; Add to Home Screen is one of them (when offered)
    const w = deskWorld().w, offered = [], stored = [], closed = [];
    w.api.apps.homeScreen = { can: id => id !== 'maps', offer: id => { offered.push(id); return true; } };
    w.api.apps.get = id => { stored.push(id); return true; }; w.api.apps.close = id => { closed.push(id); return true; };
    (await layout()).default(w.api);
    // round 16: the right column's rows (the All apps grid is gone)
    const e = new FakePointerEvent('contextmenu', { clientX: 400, clientY: 300 }); w.q('.aad-vtab[data-app="mail"]').dispatchEvent(e);
    assert.ok(e.defaultPrevented);
    assert.deepEqual(w.qa('.aad-appmenu .aad-pop-i').map(b => b.dataset.act + ':' + b.textContent), ['unpin:Unpin', 'up:Move up', 'down:Move down', 'open:Open', 'home:Add to Home Screen', 'store:App Store page', 'close:Close'], 'desktop: the quick actions of an open, pinned app');
    assert.equal(w.q('.aad-appmenu .aad-pop-h').textContent, 'Mail');
    w.q('.aad-appmenu .aad-pop-i[data-act="home"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(offered, ['mail'], 'the Desks\' own sheet'); assert.equal(w.q('.aad-appmenu'), null);
    w.q('.aad-vtab[data-app="maps"]').dispatchEvent(new FakePointerEvent('contextmenu', { clientX: 10, clientY: 10 }));
    assert.deepEqual(w.qa('.aad-appmenu .aad-pop-i').map(b => b.dataset.act), ['pin', 'up', 'open', 'store', 'close'], 'an app the stock sheet would not offer: no Add to Home Screen; the last open row: Move up only');
    w.q('.aad-appmenu .aad-pop-i[data-act="store"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(stored, ['maps'], 'its App Store page');
    w.q('.aad-vtab[data-app="maps"]').dispatchEvent(new FakePointerEvent('contextmenu', { clientX: 10, clientY: 10 }));
    w.q('.aad-appmenu .aad-pop-i[data-act="open"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.gone.at(-1), 6, 'Open = its desk');
  }
  {
    // the phone (round 16 item 7): a hold lifts a pinned icon; let go without moving = its menu (Pin / Unpin, Move, Add to Home Screen, Open, Close)
    const w = world(), offered = [];
    w.api.apps.homeScreen = { can: id => id !== 'maps', offer: id => { offered.push(id); return true; } };
    (await layout()).default(w.api);
    w.st.route = { home: true, view: 'desk', thread: null, desk: 0 }; w.emit('route', w.st.route);
    const money = w.q('.ah-app[data-app="money"]');
    money.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 41, button: 0, clientX: 10, clientY: 10, pointerType: 'touch' }));
    const h = w.st.timers.filter(t => t.ms === 450).at(-1); assert.ok(h, 'the stock 450 ms hold'); h.fn();
    assert.ok(money.classList.contains('is-lift'), 'a pinned icon lifts');
    for (const f of w.doc.__listeners.pointerup || []) f(new FakePointerEvent('pointerup', { pointerId: 41 }));
    if (/function appMenu/.test(read('web/layouts/apps/chrome.js'))) {
      assert.deepEqual(w.qa('.vc-menu .vc-menu-i').map(b => b.textContent), ['Unpin', 'Move up', 'Add to Home Screen', 'Open', 'Close · stays installed'], 'let go without moving: its menu');
      w.qa('.vc-menu .vc-menu-i').find(b => b.textContent === 'Add to Home Screen').dispatchEvent(new FakePointerEvent('click'));
    }
    assert.deepEqual(offered, ['money'], 'the stock sheet (from its menu; a build without the shared menu offers it at once)');
    const go = w.st.gone.length; money.dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.gone.length, go, 'the hold does not also open it');
  }
  const host = read('web/core/skin-host.js');
  assert.match(host, /offer: id => \{ const x = live\(\) \? homeScreenApp\(id\) : null; return x \? !!window\.WizHomeScreenApps\.offer\(x\) : false; \},/, 'the stock sheet, not a copy');
  assert.match(host, /if \(x && !x\.system && H\.canOffer\(x\)\) return x;/, 'the Desks\' own checks (no system apps)');
  const dh = read('web/desktop.html');
  assert.ok(dh.includes('<script src="core/home-screen-apps.js"></script>') && dh.includes('<script src="core/home-screen-policy.js"></script>') && dh.includes('href="core/home-screen-apps.css"'), 'the desktop loads the same sheet');
});

test('desktop app panel: an app\'s title-bar tools (Morning Report\'s ‹ date › PDF) show in the panel\'s header; its own title bar stays laid out (titlebar.shown is true), out of sight', () => {
  const css = read('web/layouts/ai-apps/desktop.css'), js = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.ok(!/> \.wbar \{ display: none; \}/.test(css), 'never display: none (an app would think its tools are gone, or never see them)');
  assert.match(css, /> \.wbar \{ display: flex; position: absolute;[^}]*visibility: hidden; pointer-events: none; \}/);
  assert.match(js, /pTop\.append\(pIcon, pName, pTools, pW, pX\);/, 'round 15: the tools in the app panel\'s header');
  assert.match(js, /querySelector\(':scope > \.win:not\(\.gone\) > \.wbar > \.wtools'\)/, 'mirrored from the window\'s own tools');
  assert.match(js, /srcTool\(n\)\?\.click\(\)/, 'a tap goes to the window\'s own tool (the app\'s channel)');
  assert.match(js, /o\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/, 'a pick too');
  assert.match(js, /toolsMo\?\.disconnect\(\);\n\s*for \(const k of \['aiApps'/, 'released on teardown');
});

test('round 9 desktop: no veil over the skin\'s background (Home, beside a panel); only panels and the composer have surfaces', () => {
  const css = read('web/layouts/ai-apps/desktop.css'), P = 'html[data-shell="desktop"][data-layout="ai-apps"]';
  const win = P + ':not([data-ai-front="list"]) #stage > .wsp > .win:not(.gone):has(.dchats .ch-newchat)';
  assert.ok(css.includes(win + ' {\n  background: none !important; box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important;\n}'), 'the new chat\'s window (Home, or the middle beside an app panel) paints nothing');
  assert.ok(css.includes(win + ' :is(.wbody, .dchats, .pane-main, .ch-thread, .ch-msgs) { background: none !important; }'), 'nor anything inside it');
  // round 15: no tab strip; the top row paints nothing on Home (only a docked chat's title and the panel's header have surfaces)
  const last = sel => { const i = css.lastIndexOf(P + ' ' + sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
  assert.match(last('.aad-top'), /background: none;/, 'the top row: no surface of its own');
  assert.equal(css.includes('.aad-back'), false, 'no room beside a docked chat any more');
});

test('round 9 desktop: the sidebar resizable by drag (round 13: the only panel; no chat column, no app panel), keyboard too, kept per device, within limits', async () => {
  const { w, store } = deskWorld();
  (await layout()).default(w.api);
  const g = id => w.q(`.aad-grip[data-grip="${id}"]`), st = w.html.style;
  assert.equal(g('apps'), null, 'round 10: no apps sidebar, no grip for it');
  assert.equal(g('chat'), null, 'the docked chat keeps its width'); assert.ok(g('app') && g('tabs'), 'round 15: the app panel and the open-apps column resize too');
  for (const id of ['side', 'tabs', 'app']) {
    assert.ok(g(id), id); assert.equal(g(id).getAttribute('role'), 'separator'); assert.equal(g(id).getAttribute('aria-orientation'), 'vertical');
    assert.equal(g(id).getAttribute('tabindex'), '0', 'keyboard-reachable'); assert.match(g(id).title, /double-click: back to default/);
  }
  assert.equal(st.getPropertyValue('--aad-side-w'), '288px', 'the defaults'); assert.equal(st.getPropertyValue('--aad-rs-w'), '');
  // a drag: the sidebar grows to the right
  g('side').dispatchEvent(new FakePointerEvent('pointerdown', { clientX: 288, pointerId: 1 })); assert.equal(w.html.dataset.aadResizing, 'side');
  g('side').dispatchEvent(new FakePointerEvent('pointermove', { clientX: 340 })); assert.equal(st.getPropertyValue('--aad-side-w'), '340px', 'follows the pointer');
  g('side').dispatchEvent(new FakePointerEvent('pointerup', {})); assert.equal(w.html.dataset.aadResizing, undefined);
  assert.equal(store.widths.side, 340, 'kept on this device');
  g('side').dispatchEvent(new FakePointerEvent('keydown', { key: 'ArrowLeft' })); assert.equal(store.widths.side, 324, '← narrows it');
  g('side').dispatchEvent(new FakePointerEvent('keydown', { key: 'ArrowLeft', shiftKey: true })); assert.equal(store.widths.side, 260, '⇧ bigger steps');
  // limits: never past them, whatever the drag
  g('side').dispatchEvent(new FakePointerEvent('pointerdown', { clientX: 340, pointerId: 1 }));
  g('side').dispatchEvent(new FakePointerEvent('pointermove', { clientX: 1300 })); g('side').dispatchEvent(new FakePointerEvent('pointerup', {}));
  assert.equal(st.getPropertyValue('--aad-side-w'), '440px', 'at most 440'); assert.equal(g('side').getAttribute('aria-valuenow'), '440'); assert.equal(g('side').getAttribute('aria-valuemax'), '440');
  for (let i = 0; i < 20; i++) g('side').dispatchEvent(new FakePointerEvent('keydown', { key: 'ArrowLeft' }));
  assert.equal(store.widths.side, 220, 'at least 220');
  // a double click (or Enter) goes back to the default
  g('side').dispatchEvent(new FakePointerEvent('dblclick')); assert.equal(st.getPropertyValue('--aad-side-w'), '288px'); assert.equal('side' in store.widths, false);
  g('side').dispatchEvent(new FakePointerEvent('keydown', { key: 'ArrowLeft' })); g('side').dispatchEvent(new FakePointerEvent('keydown', { key: 'Enter' })); assert.equal('side' in store.widths, false, 'Enter: back to the default');
  const css = read('web/layouts/ai-apps/desktop.css'), P = 'html[data-shell="desktop"][data-layout="ai-apps"]';
  assert.ok(css.includes(P + '[data-aad-side="open"] { --aad-side: var(--aad-side-w, 288px); }'), 'the rail keeps its own width');
  assert.ok(!css.includes('data-aad-apps') && !css.includes('.aad-apps'), 'round 10: no apps sidebar styles left');
  assert.match(css, /\[data-aad-tabs="rail"\] \{ --aad-rs: 52px; \}/, 'round 15: the open apps on the right');
  assert.match(css, /\.aad-grip \{\s*position: fixed;[^}]*cursor: col-resize;/, 'col-resize');
  assert.match(css, /\.aad-grip:is\(:hover, \.is-drag\)::after \{ opacity: \.55; \}/, 'a hairline on hover');
  assert.match(css, /\[data-aad-resizing\] iframe \{ pointer-events: none !important; \}/, 'apps never swallow the drag');
  const js = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.match(js, /export const SIZE_LIMITS = \{ side: \[220, 440\], tabs: \[160, 320\], app: \[360, 1400\] \};/);
});

test('round 10 desktop: a drag is smooth (one write a frame, no page resize, no storage until the release; windows follow by CSS)', async () => {
  const { w, store } = deskWorld();
  const frames = []; w.api.frame = fn => { frames.push(fn); return () => { const i = frames.indexOf(fn); if (i >= 0) frames.splice(i, 1); }; };
  const flush = () => { while (frames.length) frames.shift()(16 * (frames.length + 1)); };
  (await layout()).default(w.api); flush();
  let resizes = 0; const had = globalThis.dispatchEvent; globalThis.dispatchEvent = e => { if (e.type === 'resize') resizes++; return true; };
  try {
    const g = w.q('.aad-grip[data-grip="side"]'), st = w.html.style;
    g.dispatchEvent(new FakePointerEvent('pointerdown', { clientX: 288, pointerId: 1 }));
    g.dispatchEvent(new FakePointerEvent('pointermove', { clientX: 300 })); g.dispatchEvent(new FakePointerEvent('pointermove', { clientX: 330 }));
    assert.equal(st.getPropertyValue('--aad-side-w'), '288px', 'nothing written between frames');
    assert.equal(frames.length, 1, 'several moves, one frame');
    flush(); assert.equal(st.getPropertyValue('--aad-side-w'), '330px', 'the latest x, once a frame');
    assert.equal(resizes, 0, 'no page resize while held'); assert.equal('widths' in store, false, 'no storage write while held');
    g.dispatchEvent(new FakePointerEvent('pointermove', { clientX: 352 }));
    g.dispatchEvent(new FakePointerEvent('pointerup', {}));
    assert.equal(st.getPropertyValue('--aad-side-w'), '352px', 'the release applies the last move');
    assert.equal(resizes, 1, 'one resize, on release'); assert.equal(store.widths.side, 352, 'kept on release');
    assert.equal(w.html.dataset.aadResizing, undefined);
  } finally { globalThis.dispatchEvent = had; }
  const css = read('web/layouts/ai-apps/desktop.css'), P = 'html[data-shell="desktop"][data-layout="ai-apps"][data-aad-resizing]';
  assert.ok(css.includes('html[data-shell="desktop"][data-layout="ai-apps"] #stage > .wsp:not([hidden]):not(:has(> .win:not(.gone) ~ .win:not(.gone))) > .win:not(.gone) {\n  left: 8px !important;'), 'a shown lone window follows its desk by CSS (round 11: always, not only while held)');
  assert.match(css, /\[data-aad-resizing\] :is\([^)]*#stage > \.wsp > \.win\) \{ transition: none !important;/, 'windows never animate under the pointer');
  assert.match(css, /\[data-aad-resizing\] :is\(\.aad-side, \.aad-top[^{]*\{ -webkit-backdrop-filter: none !important; backdrop-filter: none !important; \}/, 'no blur re-sampled per frame');
  const js = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.match(js, /const FRAME_FIT_MS = 120;/, 'app frames refitted a few times a second');
  assert.match(js, /if \(roAsked \|\| root\.dataset\.aadResizing\) return;/, 'the orb waits for the release');
});

test('round 10 phone: on light skins the Home icons are full colour (the app colour plate, a white glyph) with readable names; dark skins untouched', () => {
  const css = read('web/layouts/ai-apps/layout.css'), L = 'html[data-shell="phone"][data-layout="ai-apps"]:is([data-skin$="-light"], [data-skin="sepia"])';
  assert.ok(css.includes(L + ' :is(.ah-tile, .aa-tile):not(.is-logo):not(.is-plain) {\n  background: linear-gradient(165deg, color-mix(in oklab, var(--c) 82%, white), var(--c) 55%, color-mix(in oklab, var(--c) 82%, black));'), 'full-colour plate');
  assert.ok(css.includes(L + ' :is(.ah-tile, .aa-tile):not(.is-logo):not(.is-plain) > .sgi:not(.sgb) {\n  background: white !important;'), 'white glyph, past the skin\'s grey dimmer');
  assert.match(css, /:is\(\[data-skin\$="-light"\], \[data-skin="sepia"\]\) \.ah-name \{ text-shadow:/, 'names keep a light halo on photos');
  // the dark look is the stock rule, unchanged
  assert.ok(css.includes('background: linear-gradient(165deg, color-mix(in oklab, var(--c) 30%, var(--wz-panel, var(--wz-base, var(--bg)))), color-mix(in oklab, var(--c) 12%, var(--wz-panel, var(--wz-base, var(--bg)))));'));
});

test('round 11: Home order = the desks\' order (badged first), no arrangement kept; pages that fit (never one row)', async () => {
  const H = await import('../web/layouts/ai-apps/home.js');
  assert.equal(H.OLD_ORDER_KEY, 'appOrder');
  for (const k of ['orderApps', 'moveTo', 'ORDER_KEY', 'DRAG_FROM', 'EDGE_MS']) assert.equal(k in H, false, `${k} is gone (no rearranging)`);
  const apps = ['mail', 'money', 'music', 'movies', 'news'].map(id => ({ id, name: id }));
  const desks = [{ desk: 0, id: 'wizard' }, { desk: 1, id: 'music' }, { desk: 2, id: 'mail' }, { desk: 3, id: 'money' }];
  const { open, rest } = H.homeApps(apps, desks, null, id => id === 'money');
  assert.deepEqual(open.map(a => a.id), ['money', 'wizard', 'music', 'mail'], 'the desks in their order, the badged one first');
  assert.deepEqual(rest.map(a => a.id), ['movies', 'news'], 'then the apps not open yet');
  assert.deepEqual(H.homeApps(apps, desks, null, () => false).open.map(a => a.id), ['wizard', 'music', 'mail', 'money'], 'exactly the desk order');
  // round 12 (Miguel: "all"): one icon per desk, the Desks view one to one: a second Chats desk, Files, the App Store,
  // Claude (system / connector apps with a desk) with the stock desk names; keyed per desk, so a click opens THAT desk
  const all = [{ id: 'files', name: 'Files', system: true }, { id: 'app-store', name: 'App Store', system: true }, { id: 'claude', name: 'Claude', connector: true }, ...apps];
  const ds = [{ desk: 0, id: 'wizard', name: 'Chats' }, { desk: 1, id: 'files', name: 'Files' }, { desk: 2, id: 'mail', name: 'Mail' }, { desk: 3, id: 'wizard', name: 'Chats' }, { desk: 4, id: 'app-store', name: 'App Store' }, { desk: 5, id: 'claude', name: 'Claude' }];
  const r12 = H.homeApps(all, ds, null, () => false);
  assert.deepEqual(r12.open.map(a => `${a.desk}:${a.name}`), ['0:Chats', '1:Files', '2:Mail', '3:Chats', '4:App Store', '5:Claude'], 'every desk in desk order, the stock names');
  assert.deepEqual(r12.open.map(a => a.key), ['desk:0', 'desk:1', 'desk:2', 'desk:3', 'desk:4', 'desk:5'], 'one cell per desk');
  assert.deepEqual(r12.rest.map(a => a.id), ['money', 'movies', 'music', 'news'], 'then installed apps not open yet');
  // round 14: Chats' count is one inbox: only the first Chats desk carries it (a second is `dupe`: no badge, not first)
  const lit14 = H.homeApps(all, ds, null, id => id === 'wizard').open;
  assert.deepEqual(lit14.map(a => a.desk), [0, 1, 2, 3, 4, 5], 'the first Chats desk badged (already first), the second keeps its desk place');
  assert.deepEqual(lit14.filter(a => a.dupe).map(a => a.desk), [3], 'the second Chats desk is the duplicate');
  assert.deepEqual(H.pageFit(1104, 520, 124, 128), { cols: 7, rows: 4, per: 28 }, '1440 wide: 7 × 4');
  assert.deepEqual(H.pageFit(944, 300, 124, 128), { cols: 7, rows: 2, per: 14 });
  assert.equal(H.pageFit(900, 90, 124, 128).rows, 2, 'never a single row');
  const js = noComments(read('web/layouts/ai-apps/home.js'));
  assert.ok(!/startDrag|moveDrag|is-arranging|appOrder', \[/.test(js), 'no drag code, no order written');
});

/* Round 16 item 7 (Miguel, 3 Nov 2026): one app model on both shells: Pinned, Open, + (the picker). Supersedes round 10's
 * All apps grid and round 11's "no rearranging" on the phone Home. */
test('round 16 item 7: layer membership (pinned / open / picker disjoint; a pinned open app once, in Pinned); the picker excludes open and pinned and groups For people / For agents', async () => {
  const { appLayers, shownIds } = await import('../web/layouts/ai-apps/parts.js');
  const desks = [{ desk: 0, id: 'wizard', name: 'Chats' }, { desk: 1, id: 'mail', name: 'Mail' }, { desk: 2, id: 'maps', name: 'Maps' }, { desk: 3, id: 'money', name: 'Money' }, { desk: 4, id: 'wizard', name: 'Chats' }, { desk: 5, id: 'mail', name: 'Mail' }];
  const L = appLayers(desks, ['music', 'mail'], { main: 0, lit: id => id === 'money', names: { music: 'Music' } });
  assert.deepEqual(L.pinned.map(p => `${p.id}:${p.desk}`), ['music:null', 'mail:1'], 'every pin once, open or not (its first desk)');
  assert.deepEqual(L.open.map(d => `${d.id}:${d.desk}`), ['money:3', 'maps:2', 'wizard:4'], 'the open apps not pinned (never a pinned app again, never Home\'s Chats desk), badged first');
  assert.deepEqual(appLayers(desks, ['music', 'mail'], { main: 0, lit: id => id === 'money', manual: true }).open.map(d => d.id), ['maps', 'money', 'wizard'], 'ordered by hand: the desks\' order');
  const pinIds = new Set(L.pinned.map(p => p.id)), openIds = new Set(L.open.map(d => d.id));
  assert.ok([...pinIds].every(id => !openIds.has(id)), 'Pinned and Open are disjoint');
  assert.deepEqual([...shownIds(L)].sort(), ['mail', 'maps', 'money', 'music', 'wizard'], 'what the picker never repeats');
  // the picker (shared sheet, kinds): For people open, For agents folded (Agent apps, Agents, Connectors), no Already open, + Get more
  // (the kinds grouping lives in the shared sheet where this build carries it; without it: one For people list)
  const grouped = /AGENT_KINDS/.test(read('web/layouts/apps/chrome.js'));
  const { w } = deskWorld();
  w.api.apps.kinds = () => ({ apps: [{ id: 'mail', name: 'Mail' }, { id: 'money', name: 'Money' }, { id: 'movies', name: 'Movies' }, { id: 'maps', name: 'Maps' }, { id: 'music', name: 'Music' }], dev: [{ id: 'paper', name: 'Paper' }], wiz: [{ id: 'notes', name: 'Notes' }, { id: 'bot', name: 'Bot' }], agents: [{ id: 'helper', name: 'Helper' }], conns: [{ id: 'bank', name: 'Bank' }] });
  w.api.apps.openAny = id => { w.st.opened.push('any:' + id); return true; };
  (await layout()).default(w.api);
  w.q('.aad-vall').dispatchEvent(new FakePointerEvent('click'));
  if (!grouped) {
    assert.deepEqual(w.qa('.vc-pick .vc-sec-h > span').map(n => n.textContent), ['For people']); assert.equal(w.q('.vc-pick .vc-fold'), null, 'no Already open row');
    assert.ok(w.q('.vc-pick .vc-list-more .vc-more'), '+ Get more, last'); return;
  }
  assert.deepEqual(w.qa('.vc-pick .vc-fold').map(b => b.className), ['vc-fold vc-fold-agents'], 'no Already open row');
  assert.deepEqual(w.qa('.vc-pick .vc-sec-h > span').map(n => n.textContent), ['For people'], 'one For people section, open');
  assert.deepEqual(w.qa('.vc-pick .vc-list[data-kind="apps"] .vc-app').map(b => b.dataset.app), ['movies', 'paper'], 'installed apps neither open (Mail, Music, Money, Notes, Maps) nor pinned');
  const fold = w.q('.vc-pick .vc-fold-agents'); assert.equal(fold.getAttribute('aria-expanded'), 'false', 'For agents folded'); assert.equal(fold.querySelector('.vc-count').textContent, '3', 'Bot, Helper, Bank (Notes is open)');
  fold.dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.vc-pick .vc-sub-h > span').map(n => n.textContent), ['Agent apps', 'Agents', 'Connectors']);
  assert.ok(w.q('.vc-pick .vc-list-more .vc-more'), '+ Get more, last'); assert.equal(w.q('.vc-pick .vc-store'), null, 'no store text button');
  const css = read('web/layouts/apps/chrome.css'), cj = read('web/layouts/apps/chrome.js');
  assert.match(css, /\.vc-tile\.vc-tile-plus \{/);
  assert.match(cj, /if \(open\.length && !pick\) \{/, 'the Orb / Apps sheet keeps its Already open row (opt-in picker only)');
});
test('round 16 item 7 phone: Home = Pinned (hold and drag to rearrange), Open (not pinned) in the same flow, +; the picker from +', async () => {
  const w = world();
  w.api.apps.homeScreen = { can: () => true, offer: () => true };
  (await layout()).default(w.api);
  w.st.route = { home: true, view: 'desk', thread: null, desk: 0 }; w.emit('route', w.st.route);
  const kids = () => w.q('.ah-grid').children.map(b => b.dataset.app ? (b.dataset.group === 'pin' ? '^' : '') + (b.classList.contains('is-open-first') ? '|' : '') + b.dataset.app : '+');
  assert.deepEqual(kids(), ['^music', '^mail', '^money', '|notes', 'maps', '+']);
  assert.equal(w.q('.ah-div'), null, 'round 17 (Miguel): no divider element, no full-width line');
  assert.equal(w.qa('.ah-app.is-open-first').length, 1, 'only the first open app is marked');
  assert.ok(w.q('.ah-app[data-app="notes"]').classList.contains('is-opensec'), 'Open: the smaller icons');
  // drag Money to the front: hold, move over Music, let go
  const cells = w.qa('.ah-app[data-group="pin"]');
  cells.forEach((c, i) => { c.getBoundingClientRect = () => ({ left: i * 90, top: 100, width: 80, height: 90, right: i * 90 + 80, bottom: 190 }); });
  const doc = n => (...a) => { for (const f of w.doc.__listeners[n] || []) f(...a); };
  const money = w.q('.ah-app[data-app="money"]');
  money.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 9, button: 0, clientX: 220, clientY: 140, pointerType: 'touch' }));
  w.st.timers.filter(t => t.ms === 450).at(-1).fn();
  doc('pointermove')(new FakePointerEvent('pointermove', { pointerId: 9, clientX: 40, clientY: 140 }));
  assert.ok(money.classList.contains('is-lift') && w.q('.ah-app[data-app="music"]').classList.contains('is-drop'), 'it follows the finger; the spot is marked');
  doc('pointerup')(new FakePointerEvent('pointerup', { pointerId: 9 }));
  assert.deepEqual(w.st.store.pins, ['money', 'music', 'mail'], 'his pin order, kept (the same key as the desktop)');
  assert.deepEqual(kids().slice(0, 3), ['^money', '^music', '^mail']);
  // + = the picker: installed apps neither pinned nor open (a tap right after a drag is swallowed, so later)
  const realNow = Date.now; Date.now = () => realNow() + 2000;
  try { w.q('.ah-plus').dispatchEvent(new FakePointerEvent('click')); } finally { Date.now = realNow; }
  assert.deepEqual(w.qa('.vc-pick .vc-app[data-app]').map(b => b.dataset.app), ['movies']);
  const css = read('web/layouts/ai-apps/layout.css');
  assert.doesNotMatch(css, /\.ah-div\b/, 'round 17: no divider rule');
  assert.match(css, /\.ah-app\.is-open-first::before \{\s*content: "Open"; position: absolute;/, 'a tiny Open caption chip over the first open app, out of the grid flow');
});

test('round 15: pins (defaults if installed, the owner\'s order, pin / unpin), auto-tidy on a fake clock, 1:1 with the desks', async () => {
  const parts = await import('../web/layouts/ai-apps/parts.js');
  const { pinsFrom, togglePin, tidyPlan, seedUsed, tidyWords, TIDY } = parts;
  assert.deepEqual(pinsFrom(null, ['money', 'wizard-mail', 'wizard-music', 'notes']), ['wizard-music', 'wizard-mail', 'money'], 'defaults: Music, Mail, Messenger, Calendar, Money when installed (wizard- ids too)');
  assert.deepEqual(pinsFrom(['notes', 'gone', 'notes', 'money'], ['money', 'notes']), ['notes', 'money'], 'the owner\'s order; unknown and repeated dropped');
  assert.deepEqual(pinsFrom([], ['money']), [], 'an emptied row stays empty');
  assert.deepEqual(togglePin(['a', 'b'], 'c'), ['a', 'b', 'c'], 'pin appends'); assert.deepEqual(togglePin(['a', 'b'], 'a'), ['b'], 'unpin');
  const H = 3600e3, now = 100 * H;
  const desks = [{ desk: 1, id: 'wizard' }, { desk: 2, id: 'maps' }, { desk: 3, id: 'money' }, { desk: 4, id: 'notes' }, { desk: 5, id: 'movies' }];
  const used = { wizard: 0, maps: now - 30 * H, money: now - 30 * H, notes: now - 2 * H, movies: now - 25 * H };
  const plan = o => tidyPlan(desks, { pins: ['money'], used, now, limit: TIDY['24h'], ...o }).map(d => d.desk);
  assert.deepEqual(plan(), [5, 2], 'unused for 24 h, highest desk first; never pinned (Money), never Chats, never a recent one');
  assert.deepEqual(plan({ keep: [5] }), [2], 'never the one on screen');
  assert.deepEqual(plan({ limit: TIDY['12h'] }), [5, 2]); assert.deepEqual(plan({ limit: TIDY.week }), []); assert.deepEqual(plan({ limit: TIDY.off }), [], 'Off');
  assert.deepEqual(seedUsed({ maps: 5, gone: 1 }, desks.slice(0, 3), now), { wizard: now, maps: 5, money: now }, 'never-seen apps count from now; closed ones forgotten');
  assert.equal(tidyWords(6, '24h'), 'Closed 6 apps you hadn\'t used today'); assert.equal(tidyWords(1, 'week'), 'Closed 1 app you hadn\'t used this week');
  // the view: the pinned row (sidebar and rail), a right click Pin / Unpin kept per device; ⌥T All apps; the tidy closes + toast + Undo
  const { w, store, keys } = deskWorld();
  w.st.desks = null; const closed = [];
  let list = [{ desk: 1, id: 'wizard', name: 'Chats' }, { desk: 2, id: 'maps', name: 'Maps' }, { desk: 4, id: 'money', name: 'Money' }, { desk: 5, id: 'movies', name: 'Movies' }];
  w.api.desks.list = () => list; w.api.desks.close = d => { closed.push(d); list = list.filter(x => x.desk !== d); return true; };
  store.used = { maps: Date.now() - 30 * H, movies: Date.now() - 2 * H, money: Date.now() - 40 * H };
  (await layout()).default(w.api);
  const pinsNow = () => w.qa('.aad-vtab.is-pinned').map(b => b.dataset.app);
  assert.ok(pinsNow().includes('money') && pinsNow().includes('mail'), 'the installed defaults pinned (round 16: on top of the right column, open or not)');
  assert.equal(w.q('.aad-vtab.is-pinned[data-app="mail"]').dataset.desk, undefined, 'a pin not open is listed all the same');
  assert.ok(w.q('.aad-vtab.is-pinned[data-app="mail"]').classList.contains('is-closed'));
  const o0 = w.st.opened.length; w.q('.aad-vtab.is-pinned[data-app="mail"]').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.st.opened.at(-1), 'mail', 'a click on a pin not open opens it'); assert.ok(w.st.opened.length > o0);
  assert.ok(w.q('.aad-vtf .aad-vall'), 'All apps: the column\'s last row');
  assert.ok(!pinsNow().includes('maps'), 'Maps is not pinned');
  w.q('.aad-vtab[data-desk="2"]').dispatchEvent(new FakePointerEvent('contextmenu', { clientX: 10, clientY: 10 }));
  w.q('.aad-appmenu .aad-pop-i[data-act="pin"]').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(pinsNow().at(-1), 'maps', 'Pin: at the row\'s end'); assert.equal(store.pins.at(-1), 'maps', 'kept on this device');
  assert.ok(w.q('.aad-vtab[data-desk="2"]').classList.contains('is-pinned'), 'its open tab moves up with the pins');
  w.q('.aad-vtab.is-pinned[data-app="maps"]').dispatchEvent(new FakePointerEvent('contextmenu', { clientX: 10, clientY: 10 }));
  w.q('.aad-appmenu .aad-pop-i[data-act="unpin"]').dispatchEvent(new FakePointerEvent('click'));
  assert.ok(!pinsNow().includes('maps'), 'Unpin');
  assert.equal(keys[2].down({ altKey: true, code: 'KeyT' }), true); assert.equal(w.html.dataset.vcSheet, 'open', '⌥T the picker');
  keys[1].down({ key: 'Escape' });
  // the tidy (6 s after load): Maps (30 h) closes, Money is pinned, Movies is recent
  for (const tm of w.st.timers.filter(x => x.ms === 6000)) tm.fn();
  assert.deepEqual(closed, [2], 'only the stale unpinned one');
  assert.equal(w.q('.aad-toast').hidden, false); assert.equal(w.q('.aad-toast-w').textContent, 'Closed 1 app you hadn\'t used today');
  const opened = w.st.opened.length; w.q('.aad-toast-u').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.st.opened.at(-1), 'maps', 'Undo opens it again'); assert.ok(w.st.opened.length > opened); assert.equal(w.q('.aad-toast').hidden, true);
  // the setting: Off stops it
  w.q('.aad-tidy').dispatchEvent(new FakePointerEvent('click'));
  w.q('.aad-tidypop [data-tidy="off"]').dispatchEvent(new FakePointerEvent('click')); assert.equal(store.tidy, 'off');
  assert.match(w.q('.aad-tidy-w').textContent, /Tidy: Off/);
});

test('round 15 desktop: the open apps as vertical tabs on the right (1:1 with the desks), the app panel docked left of them; ✕ = the stock close', async () => {
  const { w, store } = deskWorld();
  w.st.desks = null;
  const closed = [];
  w.api.desks.list = () => [{ desk: 1, id: 'wizard', name: 'Chats' }, { desk: 2, id: 'maps', name: 'Maps' }, { desk: 3, id: 'wizard', name: 'Chats' }, { desk: 4, id: 'money', name: 'Money' }, { desk: 5, id: 'mail', name: 'Mail' }, { desk: 6, id: 'notes', name: 'Notes' }];
  w.api.desks.close = d => { closed.push(d); return true; };
  (await layout()).default(w.api);
  // pins (defaults installed here: music, mail, money): the open ones first in pin order, no ✕; then badged first, then desk order
  const tabs = () => w.qa('.aad-vtab').map(b => (b.classList.contains('is-pinned') ? '^' : '') + b.dataset.desk + ':' + b.dataset.app);
  assert.deepEqual(tabs(), ['^undefined:music', '^5:mail', '^4:money', '2:maps', '3:wizard', '6:notes'], 'round 16: every pin on top in pin order, open or not (Music is not open); then one tab per desk (Home\'s Chats desk aside); a second Chats desk carries no count');
  assert.ok(w.q('.aad-vtab[data-app="music"]').classList.contains('is-closed') && !w.q('.aad-vtab[data-app="music"]').classList.contains('is-run'), 'a pin not open: no running dot');
  assert.ok(w.q('.aad-vtab[data-desk="5"]').classList.contains('is-run'), 'an open pin: its dot');
  assert.ok(w.q('.aad-vtsep'), 'a hairline between the pinned and the others');
  assert.equal(w.q('.aad-vtab[data-desk="5"] .aad-vtx'), null, 'pinned: no ✕ (never closed for you)');
  assert.equal(w.q('.aad-vtab[data-desk="4"] .aad-vtb').textContent, '3', 'the badge on its tab');
  assert.equal(w.q('.aad-vtt').textContent, 'Apps');
  w.q('.aad-vtab[data-desk="2"]').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.gone.at(-1), 2, 'a tab opens its desk (the panel)');
  w.st.route = { home: false, view: 'desk', thread: null, desk: 2 }; w.emit('route', w.st.route);
  assert.equal(w.q('.aad-vtab.is-on').dataset.desk, '2');
  const g0 = w.st.newChats; w.q('.aad-vtab[data-desk="2"]').dispatchEvent(new FakePointerEvent('click'));
  assert.ok(w.st.newChats > g0 || w.st.gone.at(-1) === 1, 'the tab in front again: hidden, back Home');
  w.q('.aad-vtab[data-desk="6"] .aad-vtx').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(closed, [6], '✕ = the stock close of that desk');
  w.q('.aad-vtab[data-desk="3"]').dispatchEvent(new FakePointerEvent('auxclick', { button: 1 })); assert.deepEqual(closed, [6, 3], 'a middle click too');
  // folds to a 52 px icon column, kept on this device
  w.q('.aad-vtog').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.html.dataset.aadTabs, 'rail'); assert.equal(store.tabsFolded, true);
  w.q('.aad-vtog').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.html.dataset.aadTabs, 'open');
  const css = read('web/layouts/ai-apps/desktop.css'), P = 'html[data-shell="desktop"][data-layout="ai-apps"]';
  assert.ok(css.includes(`${P}[data-aad-tabs="open"] { --aad-rs: var(--aad-tabs-px, 200px); }`) && css.includes(`${P}[data-aad-tabs="rail"] { --aad-rs: 52px; }`), '200 px, 52 px folded');
  assert.ok(css.includes(`${P}[data-aad-split] #stage > .wsp[data-aad-role="app"] { z-index: 3; inset: 0 var(--aad-rs) 0 calc(100% - var(--aad-app-w) - var(--aad-rs)) !important;`), 'the panel docked left of the column');
  assert.ok(!/transition:[^;]*\b(width|left|right|flex)\b/.test(css), 'no layout animation (transforms / colours only)');
  const js = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.match(js, /if \(!\(api\.desks\.close\?\.\(d\.desk\)\)\) api\.apps\.close\?\.\(d\.id\);/, '✕: the stock close of that desk');
  assert.match(js, /if \(pane && !chatOn && chat && !chat\.querySelector\('\.pane-main \.ch-compose'\) && !fixingBehind\) \{/, 'the Chats desk behind the panel never shows its bare list');
  assert.ok(css.includes(`${P}[data-aad-split][data-aad-chat] { --aad-chat-w: clamp(360px, 30vw, 480px); --aad-app-w: min(var(--aad-app-px, 560px), calc(100vw - var(--aad-side) - var(--aad-chat-w) - var(--aad-rs))); }`), 'a docked chat and the panel never overlap');
  assert.ok(css.includes(`${P}[data-vc-sheet] .aad-orb { opacity: 0; visibility: hidden; }`), 'the orb steps aside under the picker');
  const host = read('web/core/skin-host.js'), dj = read('web/desktop/desktop.js');
  assert.match(host, /close: desk => live\(\) && Number\.isInteger\(desk\) && desk >= 0 \? !!shell\.closeDesk\?\.\(desk\) : false,/);
  assert.match(dj, /closeDesk: i => Number\.isInteger\(i\) && i >= 0 && i < ws\.length \? closeDesktop\(i\) : false,/, 'the desktop\'s own closeDesktop (its ✕)');
});

/* Round 13 item 4 (Miguel): a Snoozed section, Archive · Working · Snoozed · Ready, from the stock snooze state whether or
 * not the snooze-someday tweak files snoozed chats under Ready; folded at first, its count shown; the rail the same. */
test('round 13: Snoozed from the stock snooze state, with and without the snooze-someday tweak; order; the rail matches', async () => {
  for (const f of ['web/desktop/desktop.js', 'web/app.js']) {
    const src = read(f);
    const fn = src.match(/sessionList: (\(\) => \{[\s\S]*?\n    \}),\n/)[1];
    const s = (id, extra = {}) => ({ id, title: id.toUpperCase(), status: 'completed', ...extra });
    const z = s('z', { deferred: true, deferredAt: '2026-11-02T10:00:00Z', lastUserAt: '2026-11-02T09:00:00Z' });
    const za = s('za', { deferred: true, deferredAt: '2026-11-02T10:00:00Z', status: 'waiting_for_approval' });
    const woke = s('wk', { deferred: true, deferredAt: '2026-11-02T08:00:00Z', lastUserAt: '2026-11-02T09:00:00Z' });
    const run = G => vm.runInNewContext(`(${fn})()`, { LIVE: { ok: true, workGroups: () => G, isNew: () => false, cardAt: () => '' }, CHATS: { threadActions: () => ['snooze', 'done'] }, window: { WosChatPins: { has: () => false } }, Date });
    // stock: the snoozed chats in their own group (G.deferred)
    const stock = run({ working: [s('w')], ready: [s('r'), za], deferred: [z], archive: [s('a')] });
    assert.equal(JSON.stringify(stock.snoozed.map(x => x.id + ':' + x.kind)), '["z:snoozed"]', `${f}: stock`); assert.equal(JSON.stringify(stock.ready.map(x => x.id)), '["r","za"]', `${f}: a snoozed chat that needs an approval stays in Ready`);
    // the tweak on: snoozed rows filed at Ready's bottom: still Snoozed here, never lost
    const tweak = run({ working: [s('w')], ready: [s('r'), woke, z], archive: [s('a')] });
    assert.equal(JSON.stringify(tweak.snoozed.map(x => x.id)), '["z"]', `${f}: the tweak's Ready rows`); assert.equal(JSON.stringify(tweak.ready.map(x => x.id)), '["r","wk"]', `${f}: a chat woken by a reply is Ready`);
  }
  assert.ok(read('web/tweaks/miguel/snooze-someday/tweak.js').length, 'the tweak exists (the view does not depend on it)');
  const { w, store } = deskWorld();
  w.st.sessions.snoozed = [{ id: 'z1', title: 'Later one', kind: 'snoozed', unread: false, pinned: false, actions: ['restore', 'done'] }, { id: 'z2', title: 'Later two', kind: 'snoozed', unread: false, pinned: false, actions: ['restore'] }];
  (await layout()).default(w.api);
  assert.deepEqual(w.qa('.aad-sec').map(h => `${h.dataset.sec}:${h.getAttribute('aria-expanded')}`), ['archive:false', 'working:false', 'snoozed:false', 'ready:true'], 'Archive, Working, Snoozed, Ready; Snoozed folded');
  assert.equal(w.q('.aad-sec[data-sec="snoozed"] > span').textContent, 'Snoozed');
  assert.equal(w.q('.aad-sec[data-sec="snoozed"] .aad-tally').getAttribute('data-n'), '2', 'its count when folded');
  w.q('.aad-sec[data-sec="snoozed"]').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aad-rw[data-kind="snoozed"]').map(r => r.dataset.sid), ['z1', 'z2']); assert.equal(store.sections.snoozed, true);
  w.q('.aad-tog').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.q('.aad-rlist').children.map(n => n.dataset.k + ':' + n.textContent), ['snoozed:2Snoozed', 'ready:2Ready'], 'the rail (round 16): Snoozed, then Ready');
  // the phone's drawer: the same sections
  const p = world(); p.st.sessions.snoozed = w.st.sessions.snoozed;
  (await layout()).default(p.api); p.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(p.qa('.aa-sec').map(h => h.dataset.sec), ['archive', 'working', 'snoozed', 'ready']);
});

/* Round 14 (Miguel, 3 Nov 2026: "perfect"): phone, sidebar and skin fixes (the desktop tab strip is on hold for a new
 * design). Each guard failed on round 13's build. */
test('round 14: the phone Home grid shows Chats\' count once (on the first Chats desk); its cells are kept, not rebuilt, on a repaint', async () => {
  const w = world();
  w.st.desks = [{ desk: 1, id: 'wizard', name: 'Chats' }, { desk: 2, id: 'mail', name: 'Mail' }, { desk: 3, id: 'wizard', name: 'Chats' }];
  (await layout()).default(w.api);
  w.st.route = { home: true, view: 'desk', thread: null, desk: 0 }; w.emit('route', w.st.route);
  // (round 16 item 7: Home's own Chats desk is not an app on the grid; a second one is an open app, with no count)
  const chats = w.qa('.ah-grid .ah-app[data-app="wizard"]');
  assert.equal(chats.length, 1, 'the second Chats desk only'); assert.equal(chats[0].querySelector('.ah-badge').hidden, true, 'no second count');
  const before = w.qa('.ah-grid .ah-app');
  w.emit('render'); w.emit('route', w.st.route);
  const after = w.qa('.ah-grid .ah-app');
  assert.ok(before.length === after.length && before.every((n, i) => n === after[i]), 'the same cells (no logo re-decoded, no sigil-to-logo flash)');
});
test('round 14: the sidebar marks the chat in front without rebuilding; a fold never re-tiles every desk; the hidden desks keep their geometry', async () => {
  const { w } = deskWorld();
  (await layout()).default(w.api);
  const rows = w.qa('.aad-rw');
  w.st.route = { home: false, view: 'thread', thread: 'r1', desk: 1 }; w.emit('route', w.st.route);
  const rows2 = w.qa('.aad-rw');
  assert.ok(rows.length === rows2.length && rows.every((n, i) => n === rows2[i]), 'the same rows');
  assert.ok(w.q('.aad-rw[data-sid="r1"]').classList.contains('is-cur')); assert.equal(w.q('.aad-rw[data-sid="r1"] .aad-row').getAttribute('aria-current'), 'page');
  w.st.route = { home: false, view: 'thread', thread: 'r2', desk: 1 }; w.emit('route', w.st.route);
  assert.equal(w.q('.aad-rw[data-sid="r1"]').classList.contains('is-cur'), false); assert.ok(w.q('.aad-rw[data-sid="r2"]').classList.contains('is-cur'));
  const js = noComments(read('web/layouts/ai-apps/desktop.js')), css = read('web/layouts/ai-apps/desktop.css');
  assert.match(js, /if \(needsTile\(\)\) globalThis\.dispatchEvent\?\.\(new Event\('resize'\)\);/, 'the shell re-tiles only when a desk tiles several windows');
  const P = 'html\\[data-shell="desktop"\\]\\[data-layout="ai-apps"\\]';
  assert.match(css, new RegExp(P + ' #stage > \\.wsp\\[hidden\\]:not\\(\\[data-aad-role\\]\\) \\{ left: var\\(--aad-side-w, 288px\\); \\}'), 'desks out of sight keep their geometry when the sidebar folds');
  assert.match(css, new RegExp(P + ' \\.aad-scroll \\{ -webkit-mask-image: linear-gradient\\(to bottom, transparent 0, black 10px'), 'a long list fades under the header and above the foot');
});
test('round 14: Archive stays quieter but readable on the light skins (sidebar, rail, phone drawer)', () => {
  const d = read('web/layouts/ai-apps/desktop.css'), p = read('web/layouts/ai-apps/layout.css');
  assert.match(d, /\.aad-sec\[data-sec="archive"\] > :is\(span, \.aad-sec-c\) \{ opacity: \.85; \}/);
  assert.match(p, /\.aa-sec\[data-sec="archive"\] > :is\(span, \.aa-sec-c\) \{ opacity: \.85; \}/);
});
test('round 14: a full-width footer along an app\'s bottom is lifted clear of the orb even when its body covers the probe point (Wisdom\'s page count)', () => {
  const host = read('web/core/skin-host.js');
  assert.match(host, /querySelectorAll\('nav, footer, \[role="navigation"\], \[role="tablist"\]'\)\]\.find\(n => \{ const r = n\.getBoundingClientRect\(\); return r\.width >= vw \* \.8 && r\.height > 0 && r\.height < 160 && r\.bottom >= vh - 2 && r\.bottom <= vh \+ 2 && shownIn\(d, n\); \}\)/);
  const i = host.indexOf("querySelectorAll('nav, footer"), j = host.indexOf('bar = bottomBar(d, vw, vh)');
  assert.ok(i > 0 && i < j, 'looked for before the controls-block fallback (a footer of plain text has no controls)');
});

/* Round 16 item 6 (Miguel, 3 Nov 2026): drag to rearrange the right column. */
test('round 16: the moves are pure: vtMove (within / between Pinned and the open apps) and relMoves (the fewest stock desk moves)', async () => {
  const { vtMove, relMoves } = await import('../web/layouts/ai-apps/parts.js');
  assert.deepEqual(vtMove(['a', 'b', 'c'], [5, 6], { id: 'c', desk: 4 }, { group: 'pin', index: 0 }), { pins: ['c', 'a', 'b'], open: [5, 6] }, 'within Pinned');
  assert.deepEqual(vtMove(['a'], [5, 6, 7], { id: 'x', desk: 7 }, { group: 'open', index: 0 }), { pins: ['a'], open: [7, 5, 6] }, 'within the open apps');
  assert.deepEqual(vtMove(['a'], [5, 6], { id: 'x', desk: 6 }, { group: 'pin', index: 1 }), { pins: ['a', 'x'], open: [5] }, 'open → Pinned pins it there');
  assert.deepEqual(vtMove(['a', 'b'], [5], { id: 'a', desk: 2 }, { group: 'open', index: 1 }), { pins: ['b'], open: [5, 2] }, 'Pinned → open unpins it into the list there');
  assert.deepEqual(vtMove(['a', 'b'], [5], { id: 'a', desk: null }, { group: 'open', index: 0 }), { pins: ['b'], open: [5] }, 'a pin not open: unpinned');
  assert.deepEqual(relMoves([0, 1, 2, 3, 4], [3, 1]), { moves: [[1, 3]], order: [0, 2, 3, 1, 4] });
  assert.deepEqual(relMoves([0, 1, 2, 3], [1, 2, 3]).moves, [], 'already in order: nothing moves');
  assert.deepEqual(relMoves([0, 1, 2, 3, 4, 5], [4, 2, 5]), { moves: [[2, 4]], order: [0, 1, 3, 4, 2, 5] }, 'only ever later (never ahead of Home\'s Chats desk)');
});
test('round 16: drag to rearrange the right column: within Pinned, within the open apps (the desks move), open → Pinned, Pinned → open, Esc cancels; Move up / down; his order beats badged first', async () => {
  const { w, store, keys } = deskWorld();
  const ws = ['wizard', 'maps', 'money', 'notes', 'movies', 'mail'], moves = [];
  w.st.desks = null;
  w.api.desks.list = () => ws.map((id, i) => ({ desk: i, id, name: id === 'wizard' ? 'Chats' : id[0].toUpperCase() + id.slice(1) }));
  w.api.desks.move = (f, t) => { ws.splice(t, 0, ws.splice(f, 1)[0]); moves.push([f, t]); return true; };
  w.st.route = { home: false, view: 'thread', thread: '__new__', desk: 0 };
  (await layout()).default(w.api);
  const P = () => w.qa('.aad-vtab').filter(r => r.dataset.group === 'pin').length;
  const T = i => 60 + i * 38 + (i >= P() ? 13 : 0);
  const rects = () => {
    w.qa('.aad-vtab').forEach((r, i) => { r.getBoundingClientRect = () => ({ top: T(i), bottom: T(i) + 36, height: 36, left: 0, right: 180, width: 180 }); });
    const sep = w.q('.aad-vtsep'); if (sep) sep.getBoundingClientRect = () => ({ top: T(P()) - 7, bottom: T(P()) - 6, height: 1, left: 0, right: 180, width: 180 });
  };
  const list = w.q('.aad-vtl');
  const row = app => w.qa('.aad-vtab').find(r => r.dataset.app === app);
  const order = () => w.qa('.aad-vtab').map(r => (r.dataset.group === 'pin' ? '^' : '') + r.dataset.app);
  const drag = (app, y, { esc = false } = {}) => {
    rects(); const r = row(app), b = r.getBoundingClientRect();
    r.dispatchEvent(new FakePointerEvent('pointerdown', { button: 0, pointerId: 1, clientX: 20, clientY: b.top + 18 }));
    list.dispatchEvent(new FakePointerEvent('pointermove', { pointerId: 1, clientX: 20, clientY: y }));
    assert.ok(r.classList.contains('is-drag') && list.dataset.drag === '', 'it floats');
    assert.equal(w.q('.aad-vtdrop').hidden, false, 'the drop line shows');
    if (esc) assert.equal(keys[1].down({ key: 'Escape' }), true, 'Esc cancels');
    else list.dispatchEvent(new FakePointerEvent('pointerup', { pointerId: 1 }));
    w.run(); rects();
  };
  assert.deepEqual(order(), ['^music', '^mail', '^money', 'maps', 'notes', 'movies'], 'the pins (Music not open), then the open apps');
  // within Pinned
  drag('money', 65);
  assert.deepEqual(store.pins, ['money', 'music', 'mail'], 'within Pinned: the pin order'); assert.deepEqual(moves, [], 'no desk moves');
  // within the open apps: Notes to the top of the list = its desk moves (the stock arrange), his order kept
  drag('notes', 190);
  assert.deepEqual(moves, [[1, 3]], 'one stock desk move'); assert.deepEqual(ws, ['wizard', 'money', 'notes', 'maps', 'movies', 'mail']);
  assert.equal(store.vtManual, true, 'ordered by hand');
  assert.deepEqual(order(), ['^money', '^music', '^mail', 'notes', 'maps', 'movies']);
  // open → Pinned: Movies pinned between Money and Music
  drag('movies', 100);
  assert.deepEqual(store.pins, ['money', 'movies', 'music', 'mail'], 'open → Pinned pins it there');
  assert.deepEqual(order(), ['^money', '^movies', '^music', '^mail', 'notes', 'maps']);
  // Pinned → open: Mail (open) to the end of the open apps: unpinned
  drag('mail', 900);
  assert.deepEqual(store.pins, ['money', 'movies', 'music'], 'Pinned → open unpins it'); assert.deepEqual(order(), ['^money', '^movies', '^music', 'notes', 'maps', 'mail']);
  // Esc cancels: nothing changes, nothing left translated
  const pins0 = [...store.pins], ws0 = [...ws];
  drag('money', 900, { esc: true });
  assert.deepEqual(store.pins, pins0); assert.deepEqual(ws, ws0); assert.ok(w.qa('.aad-vtab').every(r => !r.style.translate), 'every row back in place');
  assert.equal(w.q('.aad-vtdrop').hidden, true);
  // a click right after a drag does not open the row
  // Move up / Move down (right click) within its group
  row('maps').dispatchEvent(new FakePointerEvent('contextmenu', { clientX: 10, clientY: 10 }));
  assert.deepEqual(w.qa('.aad-appmenu .aad-pop-i').map(b => b.dataset.act).slice(0, 3), ['pin', 'up', 'down'], 'Pin, Move up, Move down');
  w.q('.aad-appmenu .aad-pop-i[data-act="up"]').dispatchEvent(new FakePointerEvent('click')); w.run();
  assert.deepEqual(order().slice(3), ['maps', 'notes', 'mail'], 'Move up');
  row('movies').dispatchEvent(new FakePointerEvent('contextmenu', { clientX: 10, clientY: 10 }));
  w.q('.aad-appmenu .aad-pop-i[data-act="down"]').dispatchEvent(new FakePointerEvent('click')); w.run();
  assert.deepEqual(store.pins, ['money', 'music', 'movies'], 'Move down in Pinned');
  // badged first only until he orders: a fresh device with no pins shows Money (badged) first; ordered, desk order
  for (const [manualOn, want] of [[false, ['money', 'maps', 'notes']], [true, ['maps', 'money', 'notes']]]) {
    const x = deskWorld(); x.store.pins = []; if (manualOn) x.store.vtManual = true;
    x.w.st.desks = [{ desk: 0, id: 'wizard', name: 'Chats' }, { desk: 1, id: 'maps', name: 'Maps' }, { desk: 2, id: 'money', name: 'Money' }, { desk: 3, id: 'notes', name: 'Notes' }];
    x.w.st.route = { home: false, view: 'thread', thread: '__new__', desk: 0 };
    (await layout()).default(x.w.api);
    assert.deepEqual(x.w.qa('.aad-vtab').map(r => r.dataset.app), want, manualOn ? 'his order (the badge stays on its row)' : 'badged first by default');
  }
  const host = read('web/core/skin-host.js'), dj = read('web/desktop/desktop.js');
  assert.match(host, /move: \(from, to\) => live\(\) && Number\.isInteger\(from\) && Number\.isInteger\(to\) && from >= 0 && to >= 0 \? !!shell\.moveDesk\?\.\(from, to\) : false,/, 'the layout hook');
  assert.match(dj, /moveDesk: \(from, to\) => Number\.isInteger\(from\) && Number\.isInteger\(to\) \? moveDesk\(from, to\) : false,/, 'the stock arrange (desk drag on the bar, ⌥⇧[ ])');
  const css = read('web/layouts/ai-apps/desktop.css');
  assert.ok(css.includes('.aad-vtl[data-drag] :is(.aad-vtab:not(.is-drag), .aad-vtsep) { transition: translate 150ms'), 'the others slide (translate only)');
});

