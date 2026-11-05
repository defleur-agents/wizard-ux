// Thread tracker: a count poll is the newer truth unless a Seen tap is still unconfirmed; a refused Seen write rolls back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function boot(box, { enabled = true, windows, renders = [] } = {}) {
  const listeners = {};
  let mutation;
  const doc = {
    documentElement: { dataset: { tweaks: enabled ? 'wizard/thread-tracker' : '' }, },
    querySelectorAll: () => [], addEventListener() {}, hidden: false,
  };
  const win = { addEventListener(t, f) { (listeners[t] ||= []).push(f); }, dispatchEvent(e) { for (const f of listeners[e.type] || []) f(e); return true; } };
  const fetchImpl = async (path, init = {}) => box(path, init);
  const ctx = vm.createContext({ window: win, document: doc, fetch: fetchImpl, setInterval() {}, setTimeout, CustomEvent: class { constructor(t, init) { this.type = t; this.detail = init?.detail; } }, MutationObserver: class { constructor(f) { mutation = f; } observe() {} }, Date, JSON, Math, Set, Map, Object, String, Promise, console });
  vm.runInContext(readFileSync(new URL('../web/core/thread-tracker.js', import.meta.url), 'utf8'), ctx);
  if (windows) {
    // Exercise the actual shared Chats subscriber, not a test copy of the activation behavior.
    Object.assign(ctx, { CH: windows, W: new Proxy({}, { get: (_, id) => windows[id] }), WosThreadTracker: win.WosThreadTracker,
      elOf: () => ({ querySelector: () => null }), LIVE: { agentOf: sid => sid === 'private-thread' ? 'synthetic-agent' : '' },
      holdList: () => false, renderThreadLive: w => renders.push(w.id), renderChatList: w => renders.push(w.id) });
    const source = readFileSync(new URL('../web/core/chats.js', import.meta.url), 'utf8');
    vm.runInContext(source.slice(source.indexOf("  window.addEventListener('wos:thread-tracker'"), source.indexOf('  // Changed elsewhere (Settings')), ctx);
  }
  return { T: win.WosThreadTracker, change(value) { doc.documentElement.dataset.tweaks = value; mutation(); },
    choice(value) { win.dispatchEvent(new ctx.CustomEvent('wos:tweak-choice', { detail: { id: 'wizard/thread-tracker', on: value } })); } };
}
const reply = body => ({ ok: true, status: 200, json: async () => body });
const item = (id, state, extra = {}) => ({ id, title: id, state, updated_at: 10, seen: false, ...extra });
const tick = () => new Promise(r => setTimeout(r, 15));

test('late Look activation hydrates every open thread and counts without reopening', async () => {
  const calls = [], renders = [];
  const windows = { a: { id: 'a', thread: 't' }, b: { id: 'b', thread: 'private-thread' }, list: { id: 'list' }, fresh: { id: 'fresh', thread: '__new__' } };
  const { T, change, choice } = boot(path => {
    calls.push(path);
    return reply(path.includes('/counts') ? { threads: { 'hermes/t': { running: 1, total: 1 } } } : { items: [item('a', 'running')] });
  }, { enabled: false, windows, renders });
  assert.equal(T.stripHtml('t'), '');
  // The choice event may precede the host's mounted package; it must not read early or swallow the later edge.
  choice(true);
  assert.deepEqual(calls, []);
  change('unrelated/tweak wizard/thread-tracker');
  await tick();
  assert.ok(calls.includes('/wizard/v1/thread-items?thread=t'), 'loads the already-open main-agent thread');
  assert.ok(calls.includes('/wizard/v1/thread-items?thread=private-thread&agent=synthetic-agent'), 'preserves the open thread agent');
  assert.equal(calls.filter(p => p.endsWith('/counts')).length, 1);
  assert.match(T.stripHtml('t'), /1 ask/);
  assert.match(T.dots('t'), /1 running/);
  assert.ok(renders.includes('a') && renders.includes('fresh'), 'also updates Reply in existing and new threads');
  const count = calls.length;
  change('unrelated/other wizard/thread-tracker'); choice(true); await tick();
  assert.equal(calls.length, count, 'unrelated package mutations and duplicate choice events do not reload');
  renders.length = 0;
  change('unrelated/other');
  assert.equal(T.stripHtml('t') + T.dots('t'), '');
  assert.ok(renders.includes('a') && renders.includes('fresh'), 'disabling repaints Reply even when there is no strip');
  assert.equal(calls.length, count, 'disabling does not read the service');
});

test('a fresh count poll replaces the tally of a thread already opened', async () => {
  let items = [item('a', 'running')], threads = { 'hermes/t': { running: 1, total: 1 } };
  const { T } = boot(path => reply(path.includes('/counts') ? { threads } : { items }));
  await T.load('t'); await T.loadCounts(true);
  assert.match(T.dots('t'), /1 running/);
  items = [item('a', 'running'), item('b', 'needs_you')];
  threads = { 'hermes/t': { needs_you: 1, running: 1, done_unseen: 0, blocked: 0, acknowledged: 0, total: 2 } };
  await T.loadCounts(true); await tick();
  assert.match(T.dots('t'), /1 need you/, 'the new ask shows on the row without reopening the thread');
  assert.match(T.stripHtml('t'), /2 asks/, 'and the open thread re-reads its list');
});

test('a Seen write the box refuses is rolled back and the thread re-read', async () => {
  let fail = true;
  const fin = [item('d', 'done')];
  const { T } = boot((path, init) => {
    if (init.method === 'POST') return fail ? { ok: false, status: 503, json: async () => ({}) } : reply({ items: [item('d', 'done', { seen: true })] });
    return reply(path.includes('/counts') ? { threads: {} } : { items: fin });
  });
  await T.load('t');
  assert.match(T.dots('t') + T.stripHtml('t'), /Mark seen/);
  T.click({ target: { closest: s => (s.includes('data-tt-strip') ? { dataset: { ttStrip: 't', ttAgent: '' } } : s.includes('data-tt-seen') ? {} : s.includes('data-tt-row') ? { dataset: { ttRow: 'd' } } : null) } });
  await tick(); await tick();
  assert.match(T.stripHtml('t'), /Mark seen/, 'still unseen: this device does not hide what the box never took');
});
