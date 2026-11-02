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
  querySelectorAll(sel) { return this.all().filter(n => matchesSel(n, sel)); }
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
  assert.deepEqual(w.q('.aad-sh').children.filter(c => !c.hidden).map(c => c.className.split(' ').pop()), ['aad-word', 'aad-find', 'aad-tog']);
  assert.equal(w.q('.aad-word').textContent, 'Oscar');
  assert.equal(w.q('.aad-grid'), null, 'the sidebar is the chat list only: no app grid (the apps live on Home)');
  assert.deepEqual(w.q('.ah-grid').children.map(b => b.dataset.app || 'more'), ['money', 'mail', 'music', 'notes', 'maps', 'movies', 'more'], 'Home: open apps (badged first), installed, Get more');
  assert.equal(w.q('.ah-app[data-app="money"] .ah-badge').textContent, '3');
  assert.deepEqual(w.qa('.aad-sec').map(h => `${h.dataset.sec}:${h.getAttribute('aria-expanded')}`), ['archive:false', 'working:false', 'ready:true']);
  assert.deepEqual(w.qa('.aad-rw').map(r => `${r.dataset.sid}:${r.dataset.kind}`), ['r1:ready', 'r2:ready']);
  assert.equal(w.q('.aad-viewall'), null, 'no View all: the sidebar is the chat list');
  w.q('.aad-sec[data-sec="working"]').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aad-rw').map(r => r.dataset.sid), ['w1', 'r1', 'r2'], 'Working opens above Ready');
  assert.deepEqual(store.sections, { archive: false, working: true, ready: true }, 'kept on this device');
  w.q('.aad-sec[data-sec="working"]').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.q('.aad-tog .aad-count').textContent, '2', 'the Ready count on ◫');
  assert.deepEqual(w.q('.aad-foot').children.map(b => [b.className, b.getAttribute('aria-label'), b.textContent]), [['aad-new', 'New chat', ''], ['aad-set', 'Settings', '']], 'icons only, as on the phone');
  w.q('.aad-new').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.newChats, 1);
  w.q('.aad-set').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.settings, ['']);
  w.q('.ah-app[data-app="money"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.gone, [4], 'an app goes to its desk (the right panel)');
  // ⋯ on a row: the same menu as the phone's long press, through Chats' own actions
  w.q('.aad-rw[data-sid="r2"] .aad-more').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aad-pop-i').map(b => b.textContent), ['Pin', 'Rename', 'Mark unread', 'Snooze', 'Archive']);
  w.q('.aad-pop-i[data-act="done"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.acts, [['r2', 'done']]); assert.equal(w.q('.aad-pop'), null);
  w.q('.aad-rw[data-sid="r1"] .aad-row').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.opened.at(-1), 'thread:r1');
  // fold to the rail with ◫ or Ctrl / ⌘ + Shift + S; kept on this device
  w.q('.aad-tog').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.q('.aad-rtog .aad-count').textContent, '2', 'the rail\'s ◫ carries it too'); assert.match(w.q('.aad-rtog').getAttribute('aria-label'), /2 ready/);
  assert.equal(w.html.dataset.aadSide, 'rail'); assert.equal(store.folded, true);
  assert.equal(w.q('.aad-rail .aad-rapps'), null, 'the rail: no apps either');
  assert.equal(keys.length, 3, 'Ctrl/⌘+Shift+S, Esc for the app panel (round 7), the view\'s ⌥ keys');
  assert.equal(w.st.guides.length, 2, 'two hold-⌥ hint guides: the view\'s targets and Home\'s app letters');
  const chips = w.st.guides[0]();
  assert.ok(Array.isArray(chips), 'the guide lists chips');
  assert.equal(keys[1].down({ key: 'Escape' }), false, 'Esc with no app panel: not the layout\'s');
  assert.equal(keys[0].down({ ctrlKey: true, shiftKey: true, code: 'KeyS', key: 'S' }), true); assert.equal(w.html.dataset.aadSide, 'open');
  assert.equal(keys[0].down({ metaKey: true, shiftKey: true, code: 'KeyS', key: 's' }), true); assert.equal(w.html.dataset.aadSide, 'rail');
  assert.equal(keys[0].down({ altKey: true, code: 'KeyS', key: 's' }), false, 'the ⌥ keys stay the shell\'s');
  // the top row: what is in front · the workspace switcher (Home only) · the app panel's title (round 7: no home button)
  assert.deepEqual(w.q('.aad-top').children.map(c => c.className), ['aad-tt', 'aad-ws', 'aad-ptop']);
  assert.equal(w.q('.aad-ptop').hidden, true, 'no app panel yet');
  assert.equal(w.q('.aad-ws').hidden, false, 'on Home (the new chat) the switcher shows');
  assert.equal(w.q('.aad-wsn').textContent, 'Miguel'); assert.match(w.q('.aad-ws').getAttribute('aria-label'), /Workspace: Miguel/);
  w.q('.aad-ws').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aad-wr b').map(b => b.textContent), ['Miguel', 'Carlos']); assert.ok(w.q('.aad-wm'));
  w.q('.aad-wm').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.settings.at(-1), 'network');
  w.st.route = { home: false, view: 'desk', thread: null, desk: 4 }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aiFront, 'app'); assert.equal(w.q('.aad-tt').textContent, 'Money', 'the top row names the app');
  assert.equal(w.q('.aad-ws').hidden, true, 'no switcher over an app');
  w.st.route = { home: false, view: 'thread', thread: 'r1', desk: 1 }; w.emit('route', w.st.route);
  assert.equal(w.html.dataset.aiFront, 'chat'); assert.equal(w.q('.aad-tt').textContent, 'Ready one');
  assert.equal(w.q('.aad-ws').hidden, true, 'nor over a chat');
  // Home = the empty new chat: the name in the sidebar header goes there (round 7: no home button in the top row)
  const before = w.st.newChats;
  assert.equal(w.q('.aad-home'), null);
  w.q('.aad-word').dispatchEvent(new FakePointerEvent('click'));
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
  assert.match(css, new RegExp(P + '\\[data-aad-side="rail"\\],\\s*' + P + '\\[data-aad-side="over"\\] \\{ --aad-side: 52px; \\}'), 'a 52 px rail (ChatGPT)');
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
  assert.deepEqual(top.children.map(c => c.className), ['aa-tb aa-menu', 'aa-tb aa-home', 'aa-tb aa-ws']);
  assert.equal(w.q('.aa-name'), null, 'round 5: no name in the middle, a home button');
  assert.equal(w.q('.aa-home').getAttribute('aria-label'), 'Home'); assert.equal(w.q('.aa-home').tagName, 'BUTTON');
  assert.equal(w.q('.aa-ws-i').textContent, 'M'); assert.match(w.q('.aa-ws').getAttribute('aria-label'), /Workspace: Miguel/);
  assert.equal(w.q('.aa-ws').hidden, false, 'Home (a New chat): the switcher shows');
  assert.match(w.q('.aa-menu').getAttribute('aria-label'), /2 ready/);
  assert.equal(w.q('.aa-menu .aa-count').textContent, '2', 'the Ready count on ☰, a number (no bare dot)'); assert.equal(w.q('.aa-dot'), null);
  // open the drawer
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.html.dataset.aaDrawer, 'open'); assert.equal(w.st.backs.length, 1, 'Back closes it');
  const rows = w.q('.aa-scroll').children.map(n => n.className.split(' ').find(c => /^aa-(grid|app|more|all|div|sec|sec-b|chat|viewall|empty)$/.test(c)));
  assert.deepEqual(rows, ['aa-sec', 'aa-sec-b', 'aa-sec', 'aa-sec-b', 'aa-sec', 'aa-sec-b'], 'the drawer = the chat list only (Miguel: apps live on Home), no Recents, no View all');
  assert.equal(w.q('.aa-scroll .aa-grid'), null, 'no app grid and no All apps in the drawer');
  assert.deepEqual(w.qa('.aa-chat').map(b => `${b.dataset.sid}:${b.dataset.kind}`), ['r1:ready', 'r2:ready'], 'Ready open; Working and Archive folded at first');
  assert.ok(w.q('.aa-chat[data-sid="r1"] .aa-st').classList.contains('is-new') && w.q('.aa-chat[data-sid="r1"] .aa-pin'), 'new dot, pin mark');
  assert.equal(w.q('.aa-chat[data-sid="r2"] .aa-st'), null, 'a seen chat is a plain title (no state ring)');
  assert.deepEqual(w.q('.aa-chat[data-sid="r1"]').children.map(c => c.className.split(' ').pop()), ['aa-row-t', 'aa-pin', 'is-new'], 'title first, the state at the end');
  // Home: the apps above the composer, open first (badged first), then the rest installed, then Get more
  w.q('.aa-scrim').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.q('.ah-grid').children.map(b => b.dataset.app || 'more'), ['money', 'mail', 'music', 'notes', 'maps', 'movies', 'more'], 'open apps (badged first, desk order), then installed, then Get more');
  assert.equal(w.q('.ah-app[data-app="money"] .ah-badge').textContent, '3', 'the shell\'s own count, on the icon');
  assert.equal(w.q('.ah-app[data-app="money"] .ah-name').textContent, 'Money');
  assert.equal(w.q('.ah-app[data-app="money"]').getAttribute('aria-label'), 'Money, 3 new');
  w.q('.ah-app[data-app="money"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.gone, [4], 'an app goes to its desk (full screen on the phone)');
  w.q('.ah-app[data-app="movies"]').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.opened.at(-1), 'movies', 'an installed app opens on a desk of its own');
  w.q('.ah-more').dispatchEvent(new FakePointerEvent('click')); assert.deepEqual(w.st.opened.at(-1), 'app-store', 'Get more = the App Store');
  // the Home style: Grid (default) or Orb, kept on this device
  assert.equal(w.q('.ah').dataset.style, 'grid');
  w.q('.ah-swo[data-style="orb"]').dispatchEvent(new FakePointerEvent('click'));
  assert.equal(w.q('.ah').dataset.style, 'orb'); assert.equal(w.st.store.homeStyle, 'orb');
  assert.deepEqual(w.q('.ah-ring').children.map(b => b.dataset.app), ['money', 'mail', 'music', 'notes', 'maps'], 'the open apps around the orb');
  // footer
  w.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  // round 2: icons only — a big round + (New chat) where ChatGPT's compose button sits, then a cog (Settings); no words,
  // no avatar letter; their accessible names say what they do
  assert.deepEqual(w.q('.aa-foot').children.map(b => [b.className, b.getAttribute('aria-label'), b.textContent]), [['aa-new', 'New chat', ''], ['aa-set', 'Settings', '']]);
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
  assert.equal(w.html.dataset.aiFront, 'app'); assert.equal(w.q('.aa-ws').hidden, true, 'no workspace switcher over an app');
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
  assert.deepEqual(heads(), ['Archive:false', 'Working:false', 'Ready:true'], 'the stock Chats order (Archive on top), Ready open at first');
  assert.ok(w.qa('.aa-sec').every(h => h.tagName === 'BUTTON' && h.classList.contains('aa-lab')), 'the Recents label\'s look, a button');
  assert.equal(w.qa('.aa-lab').filter(h => h.textContent === 'Recents').length, 0, 'no Recents');
  // Archive opens: its rows come from the real archive list (the trusted session hook), with Restore in their menu
  w.q('.aa-sec[data-sec="archive"]').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(heads(), ['Archive:true', 'Working:false', 'Ready:true']);
  assert.deepEqual(w.qa('.aa-chat').map(b => `${b.dataset.sid}:${b.dataset.kind}`), ['a1:archive', 'r1:ready', 'r2:ready']);
  assert.deepEqual(w.st.store.sections, { archive: true, working: false, ready: true }, 'remembered on this device (api.storage)');
  w.q('.aa-sec[data-sec="ready"]').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w.qa('.aa-chat').map(b => b.dataset.sid), ['a1'], 'Ready folds too');
  const a1 = w.q('.aa-chat[data-sid="a1"]');
  a1.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: 9, button: 0 })); w.st.timers.filter(t => t.ms === 450).at(-1).fn();
  assert.deepEqual(w.qa('.aa-pop-i').map(b => b.dataset.act), ['pin', 'rename', 'snooze', 'restore'], 'the same row menu, Restore for an archived chat');
  // a fresh layout on this device reads the stored choice
  const w2 = world(); w2.st.store.sections = { archive: true, working: true, ready: false };
  (await layout()).default(w2.api); w2.q('.aa-menu').dispatchEvent(new FakePointerEvent('click'));
  assert.deepEqual(w2.qa('.aa-sec').map(h => h.getAttribute('aria-expanded')), ['true', 'true', 'false']);
  assert.deepEqual(w2.qa('.aa-chat').map(b => b.dataset.sid), ['a1', 'w1']);
  const { SECTIONS, sectionsOpen } = await import(new URL('web/layouts/ai-apps/parts.js', root).href);
  assert.deepEqual(SECTIONS.map(x => x[0]), ['archive', 'working', 'ready']);
  assert.deepEqual(sectionsOpen(null), { archive: false, working: false, ready: true });
  assert.deepEqual(sectionsOpen({ ready: 'x', archive: true }), { archive: true, working: false, ready: true }, 'only booleans are taken');
});

test('round 5: home button in the middle, the switcher on Home only, the Ready count on ☰ (none on the orb), swipe up types', async () => {
  const w = world({ route: { home: false, view: 'thread', thread: 't9', desk: 1, app: 'chats' } });
  (await layout()).default(w.api);
  assert.equal(w.q('.aa-ws').hidden, true, 'a chat: no switcher');
  w.st.route = { home: false, view: 'thread', thread: '__new__', desk: 1, app: 'chats' }; w.emit('route', w.st.route);
  assert.equal(w.q('.aa-ws').hidden, false, 'Home: the switcher');
  w.q('.aa-ws').dispatchEvent(new FakePointerEvent('click')); assert.ok(w.q('.aa-sheet'));
  w.st.route = { home: false, view: 'desk', thread: null, desk: 3, app: 'music' }; w.emit('route', w.st.route);
  assert.equal(w.q('.aa-ws').hidden, true, 'an app: no switcher'); assert.equal(w.q('.aa-sheet'), null, 'its sheet closes');
  w.q('.aa-home').dispatchEvent(new FakePointerEvent('click')); assert.equal(w.st.newChats, 1, 'the home button: Home');
  const css = read('web/layouts/ai-apps/layout.css'), P = 'html[data-shell="phone"][data-layout="ai-apps"]';
  assert.ok(css.includes(P + ' #dock :is(#orbBadge, #moons) { display: none !important; }'), 'no count and no moons on the orb');
  assert.ok(css.includes(P + ' .aa-top .aa-ws[hidden] { display: none !important; }'));
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
  const css = read('web/layouts/ai-apps/desktop.css'), js = noComments(read('web/layouts/ai-apps/desktop.js')), P = 'html[data-shell="desktop"][data-layout="ai-apps"]';
  assert.ok(!/\.aad-home\b|\btHome\b/.test(css + js), 'round 7: the top row has no home button (Home = the name, +, ⌥`)');
  assert.ok(css.includes(P + ' .aad-ws[hidden] { display: none !important; }'));
  assert.ok(!/aad-tname|aad-viewall/.test(css + js), 'the name in the top row and View all are gone');
  assert.match(js, /top\.append\(tt, wsBtn, pTop\);/, 'the title stays on the left');
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
  assert.deepEqual(w.q('.ah-grid').children.map(b => b.dataset.app || 'more'), ['money', 'mail', 'movies', 'more'], 'Home: Notes (agent app), Music (in development), Maps (system) are left out');
  const { realApps } = await import(new URL('web/layouts/apps/chrome.js', root).href);
  assert.deepEqual(realApps([{ id: 'a' }, { id: 'b', connector: true }, { id: 'c', dev: true }, { id: 'd', system: true }], null).map(a => a.id), ['a'], 'without kinds: the flags');
  const dj = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.match(dj, /homeView\(api, \{ goApp: id => goApp\(id\)/, 'the desktop Home: the same grid');
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
test('round 7 desktop: the app panel on the right, the chat in the middle, calm transitions, Esc / ✕, the fuel gauge in the sidebar', () => {
  const css = read('web/layouts/ai-apps/desktop.css'), js = noComments(read('web/layouts/ai-apps/desktop.js')), P = 'html[data-shell="desktop"][data-layout="ai-apps"]';
  assert.ok(css.includes(P + '[data-aad-split] { --aad-app-w: clamp(380px, 33.333vw, 600px); }'), 'about a third of the screen');
  assert.ok(css.includes(P + '[data-aad-split] #stage > .wsp[data-aad-role="chat"] { inset: 0 var(--aad-app-w) 0 var(--aad-side) !important;'), 'the chat between the sidebar and the panel');
  assert.ok(css.includes(P + '[data-aad-split] #stage > .wsp[data-aad-role="app"] { inset: 0 0 0 calc(100% - var(--aad-app-w)) !important;'), 'the app on the right');
  assert.match(css, /\[data-aad-anim="app"\] #stage > \.wsp\[data-aad-role="app"\] \{ animation: aad-in-right 240ms/, 'the panel slides in from the right');
  assert.match(css, /\[data-aad-anim="thread"\] \.win \.dchats \.pane-main \.ch-thread \{ animation: aad-in-left 220ms/, 'a thread from the left');
  assert.match(css, /prefers-reduced-motion[\s\S]*\[data-aad-anim\] :is\(#stage > \.wsp, \.aad-ptop, \.ch-thread\) \{ animation: none !important; \}/);

  assert.match(css, /\[data-aad-side="open"\] #bar \{\s*left: 0; right: auto; top: 50px; width: var\(--aad-side\);/, 'the fuel gauge at the top of the sidebar');
  assert.match(css, /left: calc\(var\(--aad-side\) \+ \(100vw - var\(--aad-side\) - var\(--aad-app-w, 0px\)\) \/ 2 - 30px\)/, 'the orb stays with the chat');
  assert.match(js, /if \(e\.key !== 'Escape' \|\| e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey \|\| !pane \|\| menu \|\| wsPop \|\| q\) return false; closeSide\(\); return true;/, 'Esc closes the panel (a menu or a search first)');
  assert.match(js, /api\.listen\(pX, 'click', closeSide\);/, '✕ too');
  assert.match(js, /if \(here\(\)\.app === was\.id\) api\.sessions\.chats\(\);/, 'closing it gives the chat the room back; the app keeps running on its desk');
  assert.match(read('web/core/skin-host.js'), /if \(o && r\.width && \(o\.x < r\.left \|\| o\.x > r\.right\)\) fi = 0;/, 'no room kept for an orb that is not over the panel');
});

/* Miguel, 2 Nov 2026: apps live on Home (Grid or the Orb scene); every desktop ⌥ key keeps working, with hold-⌥ hints. */
test('Home apps: open first (badged first), then the rest installed, real apps only; app letters avoid the desktop\'s own ⌥ keys', async () => {
  const { homeApps, appKeys, APP_LETTERS, homeStyle } = await import('../web/layouts/ai-apps/home.js');
  const apps = [{ id: 'chats', name: 'Chats' }, { id: 'mail', name: 'Mail' }, { id: 'money', name: 'Money' }, { id: 'notes', name: 'Notes' }, { id: 'movies', name: 'Movies' }, { id: 'maps', name: 'Maps', system: true }];
  const kinds = { apps: apps.filter(a => ['mail', 'money', 'movies', 'maps'].includes(a.id)), wiz: [apps[3]], dev: [] };
  const desks = [{ id: 'chats', desk: 0 }, { id: 'mail', desk: 1 }, { id: 'money', desk: 2 }, { id: 'notes', desk: 3 }];
  const { open, rest } = homeApps(apps, desks, kinds, id => id === 'money');
  assert.deepEqual(open.map(a => a.id), ['money', 'mail']); assert.deepEqual(rest.map(a => a.id), ['movies']);
  for (const k of 'CDFGHILNOPRSTVWXZ') assert.ok(!APP_LETTERS.includes(k), `⌥${k} keeps its meaning`);
  const ks = appKeys([{ id: 'mail', name: 'Mail' }, { id: 'money', name: 'Money' }, { id: 'movies', name: 'Movies' }]);
  assert.deepEqual(ks, { mail: 'M', money: 'E', movies: 'A' }, 'the first free letter of the name, else the first free one');
  assert.deepEqual(appKeys([{ id: 'money', name: 'Money' }, { id: 'mail', name: 'Mail' }], { mail: 'M' }), { mail: 'M', money: 'E' }, 'stable: a kept letter stays');
  assert.equal(homeStyle('orb'), 'orb'); assert.equal(homeStyle('x'), 'grid');
});
test('desktop ⌥ keys in the AI apps view: ⌥\\ sidebar, ⌥W closes the panel, ⌥H Grid ⇄ Orb, ⌥ + letter an app; hints on their targets', () => {
  const js = noComments(read('web/layouts/ai-apps/desktop.js'));
  assert.match(js, /if \(e\.code === 'Backslash' && !e\.shiftKey\) \{ if \(!e\.repeat\) toggleSide\(\); return true; \}/);
  assert.match(js, /if \(e\.code === 'KeyW' && !e\.shiftKey && pane\) \{ if \(!e\.repeat\) closeSide\(\); return true; \}/, '⌥W closes the panel only when there is one (else the desktop\'s ⌥W)');
  assert.match(js, /if \(e\.code === 'KeyH' && !e\.shiftKey && root\.dataset\.aadHome != null\)/);
  assert.match(js, /id = k && !e\.shiftKey && homeEl\.appFor\(k\);/);
  assert.ok(!/hold: true/.test(js), 'the shell\'s own hold-⌥ overlay draws the hints (not a layout overlay)');
  for (const [k, w] of [['`', 'Home'], ['\\\\', 'Sidebar'], ['N', 'New chat'], [',', 'Settings'], ['␣', 'Search'], ['S', 'Talk'], ['C', 'Command'], ['W', 'Close · Esc'], ['H', 'Grid ⇄ Orb']]) assert.ok(js.includes(`'${k}', '${w}'`) || js.includes(`'${k}', open ? 'Close sidebar' : '${w}'`), `hint ${k} ${w}`);
  assert.match(js, /api\.keys\.guide\(\(\) => homeEl\.chips\(\)\);/, 'the app letters on Home\'s icons');
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
