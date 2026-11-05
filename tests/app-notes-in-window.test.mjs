// Notes for an app, read inside its own window (Miguel, 5 Nov 2026: "On my Second Hand app I see two notifications in
// the badge, but it's not clear to me how to read whatever it's trying to notify me of or mark it as done").
// Notifications items tagged `app:<id>` are carried to that app's badge (app set to Badge). core/app-notes.js shows
// them over that app's window: "2 notes · Show", a list with Mark read / Mark all read, through WosBell.mark (the one
// write path), and the badge drops at once. Back / Esc closes the list first. Core never names an app.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { core, settle, read } from './fixtures/notification-levels.mjs';

const NOTES = [
  { id: 'h1', time: 50, title: 'Aree replied', message: 'Is the chair still available?', priority: 3, tags: ['app:second-hand'] },
  { id: 'h2', time: 40, title: 'Price drop watched', message: 'Lamp now 300 THB', priority: 2, tags: ['app:second-hand'] },
  { id: 'hn', time: 45, title: 'Sale needs your OK', message: 'Confirm pickup', priority: 4, tags: ['app:second-hand'] },
  { id: 'o1', time: 30, title: 'Release review', message: 'Nothing new', priority: 2, tags: ['cron'] },
];
const INSTALLED = ['notifications', 'second-hand'];

// A tiny element: enough DOM for the notice (innerHTML, classes, one click listener).
function el(tag) {
  const e = { tag, innerHTML: '', dataset: {}, attrs: {}, parentElement: null, children: [], handlers: {}, cls: new Set(),
    classList: { add: c => e.cls.add(c), toggle: (c, on) => (on ? e.cls.add(c) : e.cls.delete(c)), contains: c => e.cls.has(c) },
    setAttribute: (k, v) => { e.attrs[k] = String(v); }, addEventListener: (t, fn) => { e.handlers[t] = fn; },
    appendChild: c => { if (c.parentElement) c.remove(); c.parentElement = e; e.children.push(c); return c; },
    remove: () => { const p = e.parentElement; if (p) p.children = p.children.filter(x => x !== e); e.parentElement = null; } };
  return e;
}
// Tap a button in the notice by its attribute (and value).
function tap(notice, attr, value) {
  const re = new RegExp(`<button[^>]*${attr}${value ? `="${value}"` : ''}`);
  assert.match(notice.innerHTML, re, `no ${attr} button`);
  const b = { hasAttribute: a => a === attr, getAttribute: a => a === attr ? (value || '') : null };
  notice.handlers.click({ target: { closest: s => s === 'button' ? b : null }, preventDefault() {}, stopPropagation() {} });
}

function boot({ routes: saved = { notifications: 'chats', 'second-hand': 'badge' }, visible = true } = {}) {
  let routes = { ...saved };
  const readIds = new Set(), storage = new Map(), calls = [];
  const json = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body });
  const fetch = async (url, opts = {}) => {
    calls.push([opts.method || 'GET', url, opts.body || '']);
    if (url.startsWith('/notifications/api/count')) return json({ unread: NOTES.filter(i => !readIds.has(i.id)).length, needs: 1 });
    if (url.startsWith('/notifications/api/items')) return json({ items: NOTES.map(i => ({ ...i, read: readIds.has(i.id) })) });
    if (url.startsWith('/notifications/api/mark')) { for (const id of JSON.parse(opts.body).ids) readIds.add(id); return json({ ok: true }); }
    if (url.startsWith('/notifications/api/routes')) return json({ routes, saved: true });
    if (url.startsWith('/notifications/api/marks')) return json({ marks: {} });
    return json({ error: 'not found' }, 404);
  };
  const host = el('div'), frame = el('iframe'); host.appendChild(frame);
  const w = core({
    WosSkinHost: { inboxList: true }, CSS: { escape: s => s },
    localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) },
    WizCanOpen: id => INSTALLED.includes(id),
    WizCore: { apps: () => ({ APPS: [] }), backendApps: () => INSTALLED.map(id => ({ id, url: `/${id}/`, name: id })), appMetadata: () => null },
    WizAppServices: { update: { frames: () => [{ frame, appId: 'second-hand', visible }] } },
    getComputedStyle: () => ({ position: 'static' }),
    document: { querySelectorAll: () => [], addEventListener() {}, hidden: false, createElement: el },
    location: { origin: 'https://wizard.test' },
    addEventListener() {}, dispatchEvent: () => true, CustomEvent: class { constructor(type, o = {}) { this.type = type; this.detail = o.detail; } },
    setTimeout: () => 0, setInterval: () => 0, fetch, calls,
  });
  vm.runInContext(read('web/core/app-notes.js'), w);
  return { w, host, calls, readIds };
}
async function ready(b) { await b.w.WosBell.refresh(true); await settle(); await b.w.WosBell.refresh(true); await settle(); b.w.WosAppNotes.scan(); return b; }
const notice = host => host.children.find(c => c.className === 'app-notes');

test('an app on Badge with carried unread items shows "2 notes · Show" over its window', async () => {
  const b = await ready(boot()), n = notice(b.host);
  assert.equal(b.w.WizCore.workspaceNav.counts['second-hand'], 2, 'the badge counts the two carried items');
  assert.ok(n, 'the shell draws the notice inside the app window');
  assert.match(n.innerHTML, />2 notes</); assert.match(n.innerHTML, />Show</);
  assert.doesNotMatch(n.innerHTML, /Aree replied/, 'the list stays closed until Show');
  assert.ok(b.host.cls.has('app-upd-host'), 'a static host gets positioned for the notice');
});

test('Show lists title, message and time with Mark read each and Mark all read; needs-you is not carried', async () => {
  const b = await ready(boot()), n = notice(b.host);
  tap(n, 'data-notes-toggle');
  assert.match(n.innerHTML, /Aree replied/); assert.match(n.innerHTML, /Is the chair still available\?/);
  assert.match(n.innerHTML, /Price drop watched/); assert.match(n.innerHTML, /<time>/);
  assert.equal((n.innerHTML.match(/data-notes-read=/g) || []).length, 2);
  assert.match(n.innerHTML, /Mark all read/); assert.match(n.innerHTML, />Hide</);
  assert.doesNotMatch(n.innerHTML, /Sale needs your OK/, 'needs-you keeps following Notifications\' own route');
  assert.doesNotMatch(n.innerHTML, /Release review/, 'the agent\'s own item is not this app\'s');
});

test('Mark read goes through Notifications /api/mark and drops the badge at once', async () => {
  const b = await ready(boot()), n = notice(b.host), N = b.w.WizCore.workspaceNav;
  tap(n, 'data-notes-toggle');
  tap(n, 'data-notes-read', 'h1');
  assert.equal(N.counts['second-hand'], 1, 'badge drops before the server answers');
  assert.match(n.innerHTML, />1 note</); assert.doesNotMatch(n.innerHTML, /Aree replied/);
  const posts = b.calls.filter(c => c[0] === 'POST');
  assert.deepEqual(posts.map(c => c[1]), ['/notifications/api/mark']);
  assert.deepEqual(JSON.parse(posts[0][2]), { ids: ['h1'], read: true });
  await settle(); b.w.WosAppNotes.scan();
  assert.equal(N.counts['second-hand'], 1, 'stays down after the reload');
});

test('Mark all read clears the badge and the notice', async () => {
  const b = await ready(boot()), N = b.w.WizCore.workspaceNav;
  tap(notice(b.host), 'data-notes-toggle'); tap(notice(b.host), 'data-notes-all');
  assert.equal(N.counts['second-hand'] || 0, 0);
  assert.equal(notice(b.host), undefined, 'nothing left: the notice goes');
  assert.deepEqual(JSON.parse(b.calls.find(c => c[0] === 'POST')[2]).ids.sort(), ['h1', 'h2']);
});

test('Back closes the open list first, then does nothing', async () => {
  const b = await ready(boot()), n = notice(b.host);
  assert.equal(b.w.WosAppNotes.back(), false, 'closed list: Back is not taken');
  tap(n, 'data-notes-toggle'); assert.match(n.innerHTML, /Aree replied/);
  assert.equal(b.w.WosAppNotes.back(), true);
  assert.doesNotMatch(n.innerHTML, /Aree replied/); assert.match(n.innerHTML, />Show</);
  assert.equal(b.w.WosAppNotes.back(), false);
});

test('no notice when the app is in Chats, or its window is not on screen', async () => {
  const c = await ready(boot({ routes: { notifications: 'chats', 'second-hand': 'chats' } }));
  assert.equal(notice(c.host), undefined, 'set to Chats: they wait in Chats, not here');
  const h = await ready(boot({ visible: false }));
  assert.equal(notice(h.host), undefined, 'off screen: nothing drawn');
});

test('both shells give Back/Esc to the list; core names no app; both entrypoints load it', () => {
  const src = read('web/core/app-notes.js');
  assert.doesNotMatch(src, /second-hand|money|wizard-mail|messenger|card-benefits/, 'core never tests specific app ids');
  assert.match(src, /WosBell\.mark\(/, 'reuses the one write path');
  assert.doesNotMatch(src, /fetch\(/, 'no new network path');
  assert.match(read('web/app.js'), /WosAppNotes\?\.back\(\)\) return 'app-notes'/);
  assert.match(read('web/desktop/desktop.js'), /WosAppNotes\?\.back\(\)\) return 'app-notes'/);
  for (const f of ['web/index.html', 'web/desktop.html']) {
    const s = read(f);
    assert.ok(s.indexOf('core/notif-bell.js') < s.indexOf('core/app-notes.js'), f);
    assert.match(s, /core\/app-notes\.css/, f);
  }
});
