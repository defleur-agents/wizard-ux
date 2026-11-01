import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createSkinFixture } from '../tools/qa-legacy-skin-fixture.cjs';
const source = readFileSync(new URL('../web/core/my-skin.js', import.meta.url), 'utf8');
const copy = x => JSON.parse(JSON.stringify(x));
function box() {
  const data = { active: null, skins: [{ id: 'My skin', name: 'My skin', base: 'nebula', empty: true, has_recipe: false, tweaks: {} }] }, calls = [], trash = new Map();
  let fail = 0;
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET', input = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, input, init });
    const reply = (value, status = 200, type = 'application/json') => ({ ok: status === 200, status, headers: { get: () => type }, json: async () => copy(value), text: async () => value });
    if (!url.startsWith('/wizard/v1/skins')) return url.includes('format=json') ? reply({ script: { exists: false } }) : reply(data.active ? 'body{opacity:.9}' : '', 200, 'text/css');
    if (fail) return reply({ error: fail === 404 ? 'not_found' : 'denied' }, fail);
    const path = url.slice('/wizard/v1/skins'.length);
    if (!path && method === 'GET') return reply(data);
    if (!path && method === 'POST') { const existing = input.migration_key && data.skins.find(s => s.migration_key === input.migration_key); if (existing) { if (input.activate) data.active = existing.id; return reply({ id: existing.id }); } const skin = { ...input, id: input.name, has_recipe: true, empty: true }; data.skins.push(skin); if (input.activate) data.active = skin.id; return reply({ id: skin.id }); }
    if (path === '/active') { data.active = input.id; return reply(data); }
    if (path === '/restore') {
      const skin = trash.get(input.trash); if (!skin) return reply({ error: 'trash_not_found' }, 404);
      trash.delete(input.trash); data.skins.push(skin); return reply({ id: skin.id, list: data });
    }
    const id = decodeURIComponent(path.slice(1)), skin = data.skins.find(s => s.id === id);
    if (method === 'PATCH') { Object.assign(skin, { ...input, ...(input.tweaks ? { tweaks: { ...skin.tweaks, ...input.tweaks } } : {}) }); return reply(data); }
    if (method === 'DELETE') { const token = 'token-' + id; trash.set(token, skin); data.skins = data.skins.filter(s => s.id !== id); if (data.active === id) data.active = null; return reply({ trash: token, list: data }); }
    throw new Error(method + ' ' + path);
  };
  return { data, calls, fetch, set fail(n) { fail = n; }, trash };
}
async function boot(server, store = new Map(), current = 'nebula') {
  const listeners = {};
  const ctx = { fetch: server.fetch, crypto: webcrypto, Event, URLSearchParams, location: { search: '' },
    localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    dispatchEvent: e => { for (const fn of listeners[e.type] || []) fn(e); },
    WosSkin: { current, list: [{ id: 'nebula' }, { id: 'grove' }, { id: 'obsidian-light' }], set(id) { this.current = id; ctx.dispatchEvent(new Event('wos:skin')); } },
  };
  ctx.window = ctx; vm.runInNewContext(source, ctx); await ctx.WosMySkin.refresh();
  return { M: ctx.WosMySkin, ctx, store };
}
test('box owns recipe CRUD, active selection, reload, remove and Undo; empty default is hidden', async () => {
  const server = box(), { M, store, ctx } = await boot(server);
  assert.equal(M.storage, 'box'); assert.equal(M.recipes.length, 0);
  const made = await M.create({ name: 'Quiet morning', base: 'obsidian-light', tweaks: { 'wizard/app-borders': false } });
  assert.equal(made.id, 'Quiet morning'); assert.equal(M.active.name, 'Quiet morning'); assert.equal(ctx.WosSkin.current, 'obsidian-light');
  assert.equal(M.FILE, 'Skins/Quiet morning/skin.css'); assert.equal(store.has('wos.own-skins.v1'), false);
  const create = server.calls.find(c => c.method === 'POST');
  assert.deepEqual(create.input, { name: 'Quiet morning', base: 'obsidian-light', tweaks: { 'wizard/app-borders': false }, activate: true });
  for (const c of server.calls) { assert.equal(c.init.credentials, 'same-origin'); if (c.method !== 'GET') { assert.equal(c.init.headers['X-Requested-With'], 'wizard'); assert.equal(c.init.headers['Content-Type'], 'application/json'); } }
  await M.update({ name: 'Morning', base: 'nebula', tweaks: { 'wizard/model-pills': true } });
  assert.deepEqual(copy(M.active.tweaks), { 'wizard/app-borders': false, 'wizard/model-pills': true });
  assert.equal(server.calls.find(c => c.method === 'PATCH').url, '/wizard/v1/skins/Quiet%20morning');
  const second = await boot(server); assert.equal(second.M.active.name, 'Morning', 'a different device reads the box, not localStorage');
  const removed = await second.M.remove(made.id); assert.equal(second.M.active, null); assert.equal(second.M.recipes.length, 0);
  assert.ok(server.calls.some(c => c.method === 'DELETE'));
  await second.M.restore(removed); assert.equal(second.M.active.id, made.id);
  assert.ok(server.calls.some(c => c.url.endsWith('/restore') && c.method === 'POST'));
  await second.M.leave(); assert.equal(server.data.active, null);
  await second.M.wear(made.id); assert.equal(server.data.active, made.id);
  assert.equal(second.M.active.name, 'Morning');
});
test('preview recipes upload once, keep the worn choice and clear legacy storage', async () => {
  const server = box(), store = new Map([['wos.own-skins.v1', JSON.stringify({ version: 1, active: 'skin-two', migrated: true, skins: [
    { id: 'skin-one', name: 'First', base: 'nebula', tweaks: {} }, { id: 'skin-two', name: 'Second', base: 'obsidian-light', tweaks: { 'wizard/app-borders': false } },
  ] })]]);
  const b = await boot(server, store);
  assert.equal(b.M.active.id, 'Second'); assert.equal(store.has('wos.own-skins.v1'), false);
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 2);
  await boot(server, store); assert.equal(server.calls.filter(c => c.method === 'POST').length, 2);
});
test('two clients patch only changed tweak keys, preserving independent edits', async () => {
  const server = box(), a = await boot(server);
  await a.M.create({ name: 'Shared', base: 'nebula', tweaks: { 'wizard/a': true } });
  const b = await boot(server);
  await Promise.all([a.M.update({ tweaks: { 'wizard/b': false } }), b.M.update({ tweaks: { 'wizard/c': true } })]);
  assert.deepEqual(server.data.skins.find(s => s.id === 'Shared').tweaks, { 'wizard/a': true, 'wizard/b': false, 'wizard/c': true });
  assert.ok(server.calls.filter(c => c.method === 'PATCH').every(c => Object.keys(c.input.tweaks).length === 1));
});
test('two preview tabs use the same migration key and make only one box folder', async () => {
  const server = box(), saved = JSON.stringify({ version: 1, active: 'skin-stable', migrated: true, skins: [{ id: 'skin-stable', name: 'Imported', base: 'nebula', tweaks: {} }] });
  const tabs = await Promise.all([boot(server, new Map([['wos.own-skins.v1', saved]])), boot(server, new Map([['wos.own-skins.v1', saved]]))]);
  assert.equal(server.data.skins.filter(s => s.name === 'Imported').length, 1);
  assert.ok(server.calls.filter(c => c.method === 'POST').every(c => c.input.migration_key === 'skin-stable'));
  assert.ok(tabs.every(t => t.M.active.id === 'Imported' && !t.store.has('wos.own-skins.v1')));
});
test('only empty uncustomized My skin is hidden; explicit names and existing CSS/script remain', async () => {
  for (const values of [{ has_recipe: true }, { empty: false }, { has_script: true }]) {
    const server = box(); Object.assign(server.data.skins[0], values); server.data.active = 'My skin';
    const b = await boot(server); assert.equal(b.M.recipes.length, 1); assert.equal(b.M.active.name, 'My skin');
  }
});
test('404/405 old boxes use local fallback quietly; denied/offline writes never claim success', async () => {
  for (const status of [404, 405]) {
    const server = box(); server.fail = status; const b = await boot(server);
    const made = b.M.create({ name: 'Old box', base: 'nebula', tweaks: {} }); assert.equal(made.name, 'Old box'); assert.equal(b.M.storage, 'local');
  }
  const server = box(), b = await boot(server); server.fail = 403;
  await assert.rejects(b.M.create({ name: 'Denied', base: 'nebula', tweaks: {} }));
  assert.equal(b.M.recipes.length, 0); assert.equal(b.store.has('wos.own-skins.v1'), false);
  server.fail = 0;
  const made = await b.M.create({ name: 'Cached', base: 'nebula', tweaks: {} });
  const snapshot = await b.M.remove(made.id); server.trash.clear();
  await assert.rejects(b.M.restore(snapshot), /trash_not_found/); assert.equal(b.M.storage, 'box'); assert.equal(b.M.recipes.length, 0);
  await b.M.create({ name: 'Cached', base: 'nebula', tweaks: {} });
  const offline = { fetch: async () => { throw new Error('offline'); } }, cached = await boot(offline, b.store);
  assert.equal(cached.M.active.name, 'Cached'); await assert.rejects(cached.M.create({ name: 'Offline', base: 'nebula', tweaks: {} }));
  assert.equal(cached.M.recipes.length, 1);
});

test("James's legacy Miguel selector overlay survives palette switches, refresh and fresh-client reload", async () => {
  const server = box(); server.data.active = 'My skin';
  Object.assign(server.data.skins[0], { empty: false, bytes: 9646, has_recipe: false });
  const b = await boot(server, new Map(), 'grove');
  assert.equal(b.M.overlay, true);
  assert.equal(b.ctx.WosSkin.current, 'grove', 'default nebula metadata is not an owner-selected base');
  for (const palette of ['nebula', 'grove', 'obsidian-light']) {
    b.ctx.WosSkin.set(palette); await b.M.refresh();
    assert.equal(server.data.active, 'My skin'); assert.equal(b.M.active.id, 'My skin');
    assert.equal(b.ctx.WosSkin.current, palette);
  }
  assert.ok(server.calls.every(c => c.method === 'GET'), 'palette changes must never clear the box active pointer');
  const again = await boot(server, new Map(), 'grove');
  assert.equal(again.M.active.id, 'My skin'); assert.equal(again.ctx.WosSkin.current, 'grove');
  await again.M.leave(); assert.equal(server.data.active, null);
  const off = await boot(server); assert.equal(off.M.active, null, 'explicit opt-out never resurrects the overlay');
});

test('cached CSS with cleared recipe caches migrates without reactivating the already-active box skin', async () => {
  const server = box(); server.data.active = 'My skin'; server.data.skins[0].empty = false;
  const store = new Map([['wos.myskin.v1', ':root{--wos-orb-swipe-up:pill}']]);
  const fetch = server.fetch, journal = [];
  server.fetch = async (url, init = {}) => {
    journal.push({ url, method: init.method || 'GET', stack: new Error('request initiator').stack,
      legacy: store.has('wos.own-skins.v1') ? JSON.parse(store.get('wos.own-skins.v1')) : null });
    return fetch(url, init);
  };
  const b = await boot(server, store, 'grove');
  assert.ok(journal.some(c => c.legacy?.skins[0]?.legacy), 'first-paint cached CSS really traversed migrate -> persist');
  assert.equal(b.M.active.id, 'My skin'); assert.equal(b.M.overlay, true);
  assert.equal(store.has('wos.own-skins.v1'), false, 'migration checkpoint still completes');
  console.log('CACHED_CSS_REQUESTS', JSON.stringify(journal));
  assert.deepEqual(server.calls.filter(c => c.method !== 'GET').map(c => ({ method: c.method, input: c.input })), [], 'reload is not an explicit activation');
  for (let i = 0; i < 2; i++) {
    store.delete('wos.own-skins.cache.v1'); store.delete('wos.own-skins.v1');
    await boot(server, store, 'grove');
  }
  assert.equal(server.calls.filter(c => c.method !== 'GET').length, 0, 'repeated cache-free reload performs zero active writes');
  await b.M.leave(); const off = await boot(server, store);
  assert.equal(off.M.active, null, 'explicit leave stays off on the same device');
  assert.ok(!store.get('wos.myskin.v1'), 'leave clears CSS cache instead of resurrecting migration');
  await off.M.wear('My skin'); assert.equal(server.data.active, 'My skin', 'a different explicit activation still writes');
  assert.deepEqual(server.calls.filter(c => c.method === 'PUT').map(c => c.input), [{ id: null }, { id: 'My skin' }]);
});
test('migration still activates a different matched preview recipe', async () => {
  const server = box(); server.data.active = 'My skin';
  server.data.skins.push({ id: 'Imported', name: 'Imported', base: 'grove', tweaks: {}, has_recipe: true });
  const store = new Map([['wos.own-skins.v1', JSON.stringify({ version: 1, active: 'local-import', skins: [{ id: 'local-import', name: 'Imported', base: 'grove', tweaks: {} }] })]]);
  const b = await boot(server, store, 'grove');
  assert.equal(b.M.active.id, 'Imported');
  assert.deepEqual(server.calls.filter(c => c.method === 'PUT').map(c => c.input), [{ id: 'Imported' }]);
  assert.equal(store.has('wos.own-skins.v1'), false);
});

test('old boxes resolve legacy recipe presence through Files, never infer it from a name or missing field', async () => {
  for (const [status, present] of [[404, false], [200, true], [403, undefined]]) {
    const server = box(); server.data.active = 'My skin';
    Object.assign(server.data.skins[0], { empty: false }); delete server.data.skins[0].has_recipe;
    const fetch = server.fetch; server.fetch = async (url, init) => {
      if (url.startsWith('/wizard/v1/user-files/content')) {
        assert.equal(url, '/wizard/v1/user-files/content?path=Skins%2FMy%20skin%2Fskin.json');
        assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store');
        return { ok: status === 200, status, json: async () => ({ error: status === 404 ? 'not_found' : 'denied' }) };
      }
      return fetch(url, init);
    };
    const b = await boot(server, new Map(), 'grove');
    assert.equal(b.M.overlay, present === false);
    assert.equal(b.ctx.WosSkin.current, present === true ? 'nebula' : 'grove');
    b.ctx.WosSkin.set('obsidian-light'); await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(server.data.active, present === true ? null : 'My skin');
  }
});

test('restricted selector fixture models real tweak-only PATCH metadata and rejects unrelated writes', () => {
  const f = createSkinFixture({ active: 'My skin', skins: [{ id: 'My skin', base: 'nebula', empty: false }] });
  assert.equal(f.recipe().status, 404);
  const path = '/wizard/v1/skins/My%20skin';
  assert.equal(f.handle(path, 'PATCH', { tweaks: { 'wizard/two-orbs': true } }).status, 200);
  assert.equal(f.data.skins[0].has_recipe, true, 'real PATCH creates a recipe even without a base');
  assert.deepEqual(f.recipe().body, { name: 'My skin', tweaks: { 'wizard/two-orbs': true } });
  assert.equal(Object.hasOwn(f.recipe().body, 'base'), false, 'list default must not become explicit base');
  f.handle(path, 'PATCH', { base: 'grove' });
  f.handle(path, 'PATCH', { tweaks: { 'wizard/two-orbs': false } });
  assert.deepEqual(f.recipe().body, { name: 'My skin', base: 'grove', tweaks: { 'wizard/two-orbs': false } });
  for (const [p, m, v] of [[path, 'DELETE', {}], ['/wizard/v1/skins', 'POST', {}], ['/wizard/v1/skins/Other', 'PATCH', { base: 'grove' }], [path, 'PATCH', { has_recipe: false }], [path, 'PATCH', { base: 'unknown' }], [path, 'PATCH', { tweaks: { 'wizard/unknown': true } }], [path, 'PATCH', { tweaks: { 'wizard/two-orbs': 1 } }], ['/wizard/v1/skins/active', 'PUT', { id: 'Other' }]]) {
    assert.equal(f.handle(p, m, v).status, 403);
  }
  assert.equal(f.activeWrites.length, 0); assert.equal(f.recipeWrites.length, 3); assert.equal(f.data.active, 'My skin');
});
test('restored-profile radial opt-in uses the same real recipe PATCH contract as two-orbs', () => {
  const f = createSkinFixture({ active: 'My skin', skins: [{ id: 'My skin', name: 'My skin', base: 'nebula', empty: false, has_recipe: false }] });
  const result = f.handle('/wizard/v1/skins/My%20skin', 'PATCH', { tweaks: { 'wizard/orb-radial': true } });
  assert.equal(result.status, 200, 'ready() clicks Appearance radial while a box recipe is active');
  assert.equal(f.data.active, 'My skin');
  assert.deepEqual(f.activeWrites, []);
  assert.deepEqual(f.recipe().body, { name: 'My skin', tweaks: { 'wizard/orb-radial': true } });
  f.handle('/wizard/v1/skins/My%20skin', 'PATCH', { tweaks: { 'wizard/two-orbs': true } });
  assert.deepEqual(f.recipe().body.tweaks, { 'wizard/orb-radial': true, 'wizard/two-orbs': true });
});
function strictBox(id = 'My skin', metadata = null) {
  const f = createSkinFixture({ active: id, skins: [{ id, name: id, base: metadata?.base || 'nebula', empty: false, has_recipe: metadata !== null, tweaks: metadata?.tweaks || {} }] }, { id, metadata });
  f.fetch = async (url, init = {}) => {
    let r;
    if (url.startsWith('/wizard/v1/skins')) r = f.handle(url, init.method || 'GET', init.body ? JSON.parse(init.body) : undefined);
    else if (url.startsWith('/wizard/v1/user-files/content')) r = f.recipe();
    else if (url.includes('format=json')) r = { status: 200, body: { script: { exists: false } } };
    else return { ok: true, status: 200, headers: { get: () => 'text/css' }, text: async () => f.data.active ? ':root{--wos-orb-swipe-up:pill}' : '' };
    return { ok: r.status === 200, status: r.status, headers: { get: () => 'application/json' }, json: async () => copy(r.body) };
  };
  return f;
}
test('tweak-only Files recipe preserves legacy overlay through PATCH, palettes and cache-free reload', async () => {
  const server = strictBox(), b = await boot(server, new Map(), 'grove');
  assert.equal(b.M.overlay, true);
  await b.M.update({ tweaks: { 'wizard/two-orbs': true } });
  assert.equal(server.data.skins[0].has_recipe, true);
  assert.equal(b.M.overlay, true, 'saving tweaks must not convert an owner layer into a palette-bound skin');
  assert.equal(b.ctx.WosSkin.current, 'grove');
  for (const palette of ['nebula', 'grove']) { b.ctx.WosSkin.set(palette); await b.M.refresh(); assert.equal(server.data.active, 'My skin'); }
  const fresh = await boot(server, new Map(), 'grove');
  assert.equal(fresh.M.overlay, true); assert.equal(fresh.ctx.WosSkin.current, 'grove');
  assert.equal(fresh.M.active.tweaks['wizard/two-orbs'], true);
  assert.deepEqual(server.activeWrites, []); assert.deepEqual(server.recipeWrites, [{ tweaks: { 'wizard/two-orbs': true } }]);
  await fresh.M.leave(); const off = await boot(server); assert.equal(off.M.active, null);
});
test('tweak-only overlay metadata is id-independent, while explicit bases remain authoritative', async () => {
  for (const id of ['My skin', 'Renamed owner layer']) {
    const server = strictBox(id, { name: id, tweaks: { 'wizard/two-orbs': true } });
    const b = await boot(server, new Map(), 'grove');
    assert.equal(b.M.overlay, true); assert.equal(b.ctx.WosSkin.current, 'grove');
    await b.M.update({ base: 'nebula' });
    assert.equal(b.M.overlay, false); assert.equal(b.ctx.WosSkin.current, 'nebula');
    b.ctx.WosSkin.set('grove'); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(server.data.active, null);
  }
});

test('a named My skin recipe still selects its base and leaves on an outside built-in change', async () => {
  const server = box(); server.data.active = 'My skin';
  Object.assign(server.data.skins[0], { empty: false, has_recipe: true });
  const b = await boot(server, new Map(), 'grove');
  assert.equal(b.M.overlay, false); assert.equal(b.ctx.WosSkin.current, 'nebula');
  b.ctx.WosSkin.set('grove'); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(server.data.active, null);
});
