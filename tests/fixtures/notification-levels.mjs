// Notification levels as a tweak: boots the real core (workspace-navigation.js + notif-bell.js) in a vm and switches the
// miguel/notification-levels package on through an api.notify that does what skin-host's `notify` capability does.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
export const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
export const ID = 'miguel/notification-levels';

export function core(ctx) {
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('web/core/workspace-navigation.js'), ctx);
  vm.runInContext(read('web/core/notif-bell.js'), ctx);
  return ctx;
}
// The package's setup(api), evaluated in the same context (it is an ES module with one default export).
export function setupOf(ctx) {
  const src = read(`web/tweaks/${ID}/tweak.js`).replace('export default function setup', 'function setup');
  return vm.runInContext(`(() => { ${src}\n; return setup; })()`, ctx);
}
// Switch the tweak on; returns { off } (teardown = the part goes back to stock).
export function wear(ctx) {
  let release = null;
  const api = { notify: {
    routing(impl, o = {}) { const r = ctx.WosBell.routing.replace(impl, { owner: ID, version: o.version }); if (typeof r === 'function') { release = r; return true; } return false; },
    routes: {
      async get() { const r = await ctx.fetch('/notifications/api/routes', { cache: 'no-store' }); return r.ok ? r.json() : null; },
      async save(routes) { const r = await ctx.fetch('/notifications/api/routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routes }) }); return r.ok; },
    },
  } };
  const teardown = setupOf(ctx)(api);
  return { off() { teardown?.(); release?.(); } };
}
export const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
