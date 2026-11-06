import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../web/core/thread-tracker.js', import.meta.url), 'utf8');
function harness(states = ['done', 'done']) {
  let now = 100, active = true, focus = true, open = false, hit = true, inView = true, io, check;
  let items = states.map((state, id) => ({ id: String(id), state, message_id: 'm', title: String(id), updated_at: 1, seen: false }));
  const writes = [], events = {};
  const strip = { getClientRects: () => [1], getBoundingClientRect: () => ({ bottom: 160 }), classList: { contains: () => open } };
  const node = { dataset: { mid: 'm' }, isConnected: true, getBoundingClientRect: () => ({ top: 176, bottom: 676, height: 500, left: 0, width: 400 }), contains: n => n === node };
  const nb = { isConnected: true, closest: () => ({ querySelector: () => strip }), querySelectorAll: () => [node], getBoundingClientRect: () => ({ top: 100, bottom: 800, left: 0, width: 400 }) };
  const doc = { documentElement: { dataset: { tweaks: 'wizard/thread-tracker' } }, visibilityState: 'visible', hasFocus: () => focus,
    querySelectorAll: () => [], addEventListener: (t, f) => { events[t] = f; }, elementFromPoint: () => hit ? node : null };
  const win = { addEventListener: (t, f) => { events[t] = f; }, dispatchEvent() {} };
  const ctx = vm.createContext({ window: win, document: doc, innerHeight: 860, clearTimeout, setTimeout,
    setInterval(f, ms) { if (ms === 200) check = f; }, CustomEvent: class {}, Date: class extends Date { static now() { return now; } },
    MutationObserver: class { observe() {} }, IntersectionObserver: class {
      constructor(f) { io = f; } observe() { io([{ target: node, isIntersecting: inView }]); } unobserve() {} disconnect() {}
    }, fetch: async (p, init = {}) => {
      if (init.method === 'POST') { writes.push(JSON.parse(init.body)); return new Promise(() => {}); }
      return { ok: true, json: async () => ({ items }) };
    } });
  vm.runInContext(source, ctx);
  const T = win.WosThreadTracker;
  return { T, doc, nb, node, writes,
    async start() { await T.load('t'); T.watch(nb, { sid: 't', active: () => active }); },
    step(ms = 200) { now += ms; check(); },
    active(v) { active = v; }, focus(v) { focus = v; events[v ? 'focus' : 'blur']?.(); }, open(v) { open = v; }, hit(v) { hit = v; },
    visibility(v) { doc.visibilityState = v; events.visibilitychange(); },
    intersect(v) { inView = v; io([{ target: node, isIntersecting: v }]); },
    async update() { items = items.map(i => ({ ...i, updated_at: 2 })); now += 3000; await T.load('t'); T.watch(nb, { sid: 't', active: () => active }); }
  };
}
test('green reply group auto-Seen after continuous visible dwell; paints all ids before I/O', async () => {
  const h = harness(); await h.start(); h.step(); h.step(999); assert.equal(h.writes.length, 0);
  h.step(1); assert.deepEqual(h.writes[0].ids, ['0', '1']); assert.equal(h.T.dots('t'), '');
  await h.update(); h.step(); h.step(1000); assert.equal(h.writes.length, 2, 'a later unseen update re-arms the anchor');
});
for (const state of ['needs_you', 'blocked', 'running']) test(`${state}, including a mixed green group, is never auto-cleared`, async () => {
  const h = harness(['done', state]); await h.start(); h.step(); h.step(2000); assert.equal(h.writes.length, 0);
});
for (const mode of ['visibility', 'active', 'focus', 'open', 'hit', 'intersect']) test(`no auto-Seen for ${mode}; requires a fresh uninterrupted dwell`, async () => {
  const h = harness(); await h.start(); h.step(); h.step(600);
  const off = mode === 'visibility' ? 'hidden' : ['open'].includes(mode) ? true : false;
  h[mode](off); h.step(2000); assert.equal(h.writes.length, 0);
  h[mode](mode === 'visibility' ? 'visible' : mode === 'open' ? false : true);
  h.step(); h.step(999); assert.equal(h.writes.length, 0); h.step(1); assert.equal(h.writes.length, 1);
});
test('tracker geometry uses measured strip bottom and preserves tweak-off position exactly', async () => {
  const h = harness(); await h.start(); assert.equal(h.T.viewportTop(h.nb, 100), 168);
  assert.equal(h.T.viewportTop(h.nb, 200), 200);
  h.doc.documentElement.dataset.tweaks = ''; assert.equal(h.T.viewportTop(h.nb, 100), 100);
});
test('opening a green tracker row without viewing its reply does not mark it seen', async () => {
  const h = harness(); await h.start();
  h.T.click({ target: { closest: s => s.includes('data-tt-strip') ? { dataset: { ttStrip: 't' } } : s.includes('data-tt-row') ? { dataset: { ttRow: '0' } } : null } }, { jump() {} });
  assert.equal(h.writes.length, 0);
});
test('shared reading-position rule uses tracker eye-line; jumps retain unchanged off path', () => {
  const power = readFileSync(new URL('../web/core/chat-power.js', import.meta.url), 'utf8');
  const start = power.indexOf('  const relTop ='), end = power.indexOf('  const bottomGap', start);
  const nb = { getBoundingClientRect: () => ({ top: 100 }) }, el = { getBoundingClientRect: () => ({ top: 208 }) };
  const relTop = vm.runInNewContext(power.slice(start, end) + '\nrelTop', { scrollBox: n => n, A: { threadViewportTop: () => 200 } });
  assert.equal(relTop(nb, el), 8, 'latest reply top is 8px below the actual tracker eye-line');
  const chats = readFileSync(new URL('../web/core/chats.js', import.meta.url), 'utf8');
  assert.match(chats, /H\.front\(\) === w\.id/);
  assert.match(chats, /else node\.scrollIntoView\(\{ block: 'center'/);
  assert.match(chats, /node\.getBoundingClientRect\(\)\.top - threadViewportTop\(nb, base\) - 8/);
});
test('expanded header and opaque panel have a continuous seam', () => {
  const css = readFileSync(new URL('../web/core/thread-tracker.css', import.meta.url), 'utf8');
  assert.match(css, /top: calc\(100% - 1px\)/); assert.match(css, /border-radius: 0 0 14px 14px/);
});
