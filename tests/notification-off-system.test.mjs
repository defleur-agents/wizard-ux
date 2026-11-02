// Off and System (Miguel, 2 Nov 2026): a third choice, Off (no badge, nothing in Chats, kept in Notifications' own
// history), and System rows for notices about Wizard itself (app updates, app connections, Wizard updates), default Off,
// that count on the Settings cog when set to Badge. A System notice that needs the owner is never silenced.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const src = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const NOTES = [
  { id: 'u1', time: 30, title: '1 app updated', message: 'Updated Notifications (2.29.0).', priority: 3, tags: [] },
  { id: 'u2', time: 29, title: 'App updates need a look', message: 'Could not update Money: disk full.', priority: 4, tags: [] },
  { id: 'c1', time: 28, title: 'App connection added', message: 'Money can read SimpleFIN.', priority: 2, tags: ['link', 'wizard-system', 'connections'] },
  { id: 'n1', time: 20, title: 'Backup failed', message: 'Disk full', priority: 3, tags: ['cron'] },
];
function boot({ storage = new Map() } = {}) {
  const calls = [], listeners = {}, events = [], read = new Set();
  const json = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body });
  const fetch = async (url, opts = {}) => {
    calls.push([opts.method || 'GET', url, opts.body]);
    if (url.startsWith('/notifications/api/count')) return json({ unread: 4, needs: 1 });
    if (url.startsWith('/notifications/api/items')) return json({ items: NOTES.map(i => ({ ...i, read: read.has(i.id) })) });
    if (url.startsWith('/notifications/api/marks')) return json({ marks: {} });
    if (url.startsWith('/notifications/api/mark')) { for (const id of JSON.parse(opts.body).ids) read.add(id); return json({ ok: true }); }
    return json({ error: 'not found' }, 404);
  };
  const ctx = {
    WosSkinHost: { inboxList: true }, CSS: { escape: s => s },
    localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) },
    WizCanOpen: id => id === 'notifications',
    WizCore: { apps: () => ({ APPS: [] }), backendApps: () => [{ id: 'notifications', url: '/notifications/', name: 'Notifications' }], appMetadata: id => ({ notifications: { name: 'Notifications' } })[id] },
    document: { querySelectorAll: () => [], addEventListener() {}, hidden: false },
    location: { origin: 'https://wizard.test' },
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    dispatchEvent: e => { events.push(e.type); for (const fn of listeners[e.type] || []) fn(e); return true; },
    CustomEvent: class { constructor(type, o = {}) { this.type = type; this.detail = o.detail; } },
    setTimeout: () => 0, setInterval: () => 0, fetch, calls, listeners, storage, events,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src('web/core/workspace-navigation.js'), ctx);
  vm.runInContext(src('web/core/notif-bell.js'), ctx);
  return ctx;
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const ids = B => [...B.items()].map(i => i.id);

test('the picker has three choices, Badge · Chats · Off, everywhere it is drawn', () => {
  const w = boot(), h = w.WosBell.picker('notifications');
  assert.deepEqual([...h.matchAll(/data-notify-to="(\w+)"/g)].map(m => m[1]), ['badge', 'chats', 'off']);
  assert.match(w.WosBell.picker('system:app-updates'), /data-notify-route="system:app-updates" data-notify-to="off" aria-checked="true"/, 'System rows default to Off');
});

test('System notices are classified by tags or known titles; needs-you ones route as Notifications', () => {
  const B = boot().WosBell;
  assert.equal(B.routeIdOf(NOTES[0]), 'system:app-updates');
  assert.equal(B.routeIdOf(NOTES[1]), 'notifications', 'a failed update is never silenced');
  assert.equal(B.routeIdOf(NOTES[2]), 'system:connections', 'tagged by its sender');
  assert.equal(B.routeIdOf(NOTES[3]), 'notifications', 'an agent job is not System');
  assert.equal(B.routeIdOf({ title: 'Connection needs your OK', priority: 4 }), 'notifications');
});

test('default: routine System notices leave Chats and the Notifications badge; the problem stays in Chats', async () => {
  const w = boot(), B = w.WosBell;
  B.watch(() => {}); await B.refresh(true); await settle();
  assert.deepEqual(ids(B), ['u2', 'n1']);
  assert.equal(B.systemCount, 0, 'Off: nothing on the Settings cog');
  B.setRoute('notifications', 'badge'); await settle();
  assert.equal(w.WizCore.workspaceNav.counts.notifications, 2, 'Notifications badge counts only its own (4 unread − 2 System)');
});

test('Off for an app or Notifications: no badge and nothing in Chats', async () => {
  const w = boot(), B = w.WosBell, N = w.WizCore.workspaceNav;
  B.watch(() => {}); await B.refresh(true); await settle();
  assert.equal(B.setRoute('notifications', 'off'), true); await settle();
  assert.equal(B.route('notifications'), 'off');
  assert.deepEqual(ids(B), [], 'gone from Chats');
  assert.equal(N.counts.notifications || 0, 0, 'no badge');
  assert.match(B.html(), /data-chbell hidden/, 'no bell');
  assert.equal(B.isOff('notifications'), true);
});

test('System row on Badge counts on the Settings cog; seeing it in Settings marks it read', async () => {
  const w = boot(), B = w.WosBell;
  await B.refresh(true); await settle();
  B.setRoute('system:app-updates', 'badge'); B.setRoute('system:connections', 'badge'); await settle();
  assert.equal(B.systemCount, 2);
  assert.ok(w.events.includes('wizard:system-notices'));
  assert.deepEqual(B.systemItems().map(i => i.id), ['u1', 'u2', 'c1'], 'Settings lists recent ones, the problem included');
  await B.seenSystem(); await settle();
  const post = w.calls.find(([m, u]) => m === 'POST' && u === '/notifications/api/mark');
  assert.deepEqual(JSON.parse(post[2]).ids.sort(), ['c1', 'u1']);
  assert.equal(B.systemCount, 0);
});

test('System row on Chats lists those notices in Chats', async () => {
  const w = boot(), B = w.WosBell;
  B.watch(() => {}); await B.refresh(true); await settle();
  B.setRoute('system:app-updates', 'chats'); await settle();
  assert.deepEqual(ids(B), ['u1', 'u2', 'n1']);
  assert.equal(B.nameOf('system:app-updates'), 'App updates');
});

test('Settings has the System group, the cog counts it, and a notification asks "<row> go to"', () => {
  const st = src('web/core/settings.js'), ch = src('web/core/chats.js'), app = src('web/app.js'), desk = src('web/desktop/desktop.js');
  assert.match(st, /<h4>System<\/h4>/);
  assert.match(st, /new from Wizard`, feature: 'notification-routing'/);
  assert.match(ch, /`\$\{name\} go to`/, 'no more "Notifications notifications go to"');
  assert.match(app, /window\.WosBell\?\.systemCount/);
  assert.match(desk, /function paintCog\(\)/);
});

test('unknown routes and ids are refused', () => {
  const B = boot().WosBell;
  assert.equal(B.setRoute('system:nope', 'off'), false);
  assert.equal(B.setRoute('messenger', 'mute'), false);
  assert.equal(B.setRoute('messenger', 'off'), true);
  assert.equal(B.route('messenger'), 'off');
});
