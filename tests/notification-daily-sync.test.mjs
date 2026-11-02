// Daily and the box-wide save (Miguel, 2 Nov 2026): Chats · Badge · Daily · Off, one place per source; Daily only for
// Notifications and System (greyed out for an app like Mail); every device shows the same choice (Notifications
// /api/routes), this device's copy covering a cold start, and a box with nothing saved takes this device's choices once.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const src = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function boot({ storage = new Map(), server = { routes: {}, saved: false }, up = true } = {}) {
  const calls = [], listeners = {};
  const json = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body });
  const fetch = async (url, opts = {}) => {
    calls.push([opts.method || 'GET', url, opts.body]);
    if (url === '/notifications/api/routes') {
      if (!up) return json({ error: 'down' }, 502);
      if (opts.method === 'POST') { Object.assign(server.routes, JSON.parse(opts.body).routes); server.saved = true; return json({ ok: true, ...server }); }
      return json({ routes: { ...server.routes }, saved: server.saved, defaults: {} });
    }
    if (url.startsWith('/notifications/api/count')) return json({ unread: 0, needs: 0 });
    if (url.startsWith('/notifications/api/items')) return json({ items: [] });
    if (url === '/mail/api/inbox') return json({ inbox: 1, items: [] });
    return json({ error: 'not found' }, 404);
  };
  const ctx = {
    WosSkinHost: { inboxList: true }, CSS: { escape: s => s },
    localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) },
    WizCanOpen: id => id === 'notifications' || id === 'mail',
    WizCore: { apps: () => ({ APPS: [{ id: 'mail', kind: 'wizard', source: 'apps.json', url: '/mail/', name: 'Mail' }] }), backendApps: () => [{ id: 'notifications', url: '/notifications/' }], appMetadata: id => ({ mail: { name: 'Mail' }, notifications: { name: 'Notifications' } })[id] },
    document: { querySelectorAll: () => [], addEventListener() {}, hidden: false },
    location: { origin: 'https://wizard.test' },
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    dispatchEvent: e => { for (const fn of listeners[e.type] || []) fn(e); return true; },
    CustomEvent: class { constructor(type, o = {}) { this.type = type; this.detail = o.detail; } },
    setTimeout: () => 0, setInterval: () => 0, fetch, calls, storage, server,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src('web/core/workspace-navigation.js'), ctx);
  vm.runInContext(src('web/core/notif-bell.js'), ctx);
  return ctx;
}
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };

test('Daily is greyed out for an app like Mail and refused if asked; Notifications and System can take it', () => {
  const B = boot().WosBell;
  assert.match(B.picker('mail'), /data-notify-to="daily" aria-checked="false" disabled title="Mail would lose its point waiting a day"/);
  assert.doesNotMatch(B.picker('notifications'), /data-notify-to="daily"[^>]*disabled/);
  assert.equal(B.setRoute('mail', 'daily'), false);
  assert.equal(B.setRoute('notifications', 'daily'), true);
  assert.equal(B.route('notifications'), 'daily');
  assert.equal(B.isOff('notifications'), true, 'Daily shows no badge and nothing in Chats');
});

test('a choice is saved on the box, so another device gets it', async () => {
  const server = { routes: {}, saved: true };
  const a = boot({ server }); await settle();
  a.WosBell.setRoute('mail', 'chats'); await settle();
  assert.deepEqual(server.routes, { mail: 'chats' });
  const b = boot({ server }); await b.WosBell.syncRoutes(true); await settle();
  assert.equal(b.WosBell.route('mail'), 'chats', 'a second device shows the same choice');
});

test('a box with nothing saved takes this device\'s choices once; then the box wins', async () => {
  const storage = new Map([['wos.notify.route.v1', JSON.stringify({ messenger: 'chats', notifications: 'badge' })]]);
  const server = { routes: {}, saved: false };
  const w = boot({ storage, server }); await w.WosBell.syncRoutes(true); await settle();
  assert.deepEqual(server.routes, { messenger: 'chats', notifications: 'badge' });
  server.routes.messenger = 'off';
  await w.WosBell.syncRoutes(true); await settle();
  assert.equal(w.WosBell.route('messenger'), 'off');
});

test('offline: the choice holds on this device and is sent once Notifications answers', async () => {
  const server = { routes: {}, saved: true };
  const w = boot({ server, up: false }); await settle();
  w.WosBell.setRoute('system:app-updates', 'off'); await settle();
  assert.equal(w.WosBell.route('system:app-updates'), 'off');
  assert.deepEqual(server.routes, {});
  w.calls.length = 0;
  // Back up: same box, the next sync sends it.
  const vmFetch = w.fetch; w.fetch = async (url, o) => { if (url === '/notifications/api/routes') { if (o?.method === 'POST') { Object.assign(server.routes, JSON.parse(o.body).routes); return { ok: true, json: async () => ({}) }; } return { ok: true, json: async () => ({ routes: { ...server.routes }, saved: true }) }; } return vmFetch(url, o); };
  await w.WosBell.syncRoutes(true); await settle();
  assert.deepEqual(server.routes, { 'system:app-updates': 'off' });
});
