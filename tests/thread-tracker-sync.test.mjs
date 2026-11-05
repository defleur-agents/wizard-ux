// Thread tracker: a count poll is the newer truth unless a Seen tap is still unconfirmed; a refused Seen write rolls back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function boot(box) {
  const listeners = {};
  const doc = {
    documentElement: { dataset: { tweaks: 'wizard/thread-tracker' }, },
    querySelectorAll: () => [], addEventListener() {}, hidden: false,
  };
  const win = { addEventListener(t, f) { listeners[t] = f; }, dispatchEvent() { return true; } };
  const fetchImpl = async (path, init = {}) => box(path, init);
  const ctx = vm.createContext({ window: win, document: doc, fetch: fetchImpl, setInterval() {}, setTimeout, CustomEvent: class { constructor(t) { this.type = t; } }, MutationObserver: class { observe() {} }, Date, JSON, Math, Set, Map, Object, String, Promise, console });
  vm.runInContext(readFileSync(new URL('../web/core/thread-tracker.js', import.meta.url), 'utf8'), ctx);
  return win.WosThreadTracker;
}
const reply = body => ({ ok: true, status: 200, json: async () => body });
const item = (id, state, extra = {}) => ({ id, title: id, state, updated_at: 10, seen: false, ...extra });
const tick = () => new Promise(r => setTimeout(r, 15));

test('a fresh count poll replaces the tally of a thread already opened', async () => {
  let items = [item('a', 'running')], threads = { 'hermes/t': { running: 1, total: 1 } };
  const T = boot(path => reply(path.includes('/counts') ? { threads } : { items }));
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
  const T = boot((path, init) => {
    if (init.method === 'POST') return fail ? { ok: false, status: 503, json: async () => ({}) } : reply({ items: [item('d', 'done', { seen: true })] });
    return reply(path.includes('/counts') ? { threads: {} } : { items: fin });
  });
  await T.load('t');
  assert.match(T.dots('t') + T.stripHtml('t'), /Mark seen/);
  T.click({ target: { closest: s => (s.includes('data-tt-strip') ? { dataset: { ttStrip: 't', ttAgent: '' } } : s.includes('data-tt-seen') ? {} : s.includes('data-tt-row') ? { dataset: { ttRow: 'd' } } : null) } });
  await tick(); await tick();
  assert.match(T.stripHtml('t'), /Mark seen/, 'still unseen: this device does not hide what the box never took');
});
