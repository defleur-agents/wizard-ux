// James: Archive the open thread → next in this list; nothing else changes navigation.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const src = process.env.QA_REF ? execFileSync('git', ['show', process.env.QA_REF + ':web/core/chats.js'], { encoding: 'utf8' }) : readFileSync(new URL('../web/core/chats.js', import.meta.url), 'utf8');
const slice = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return src.slice(i, j); };
function fixture({ ids = ['a', 'b', 'c'], open = 'b', keep = false, after = 'stay', layout = null, pending = false, success = true } = {}) {
  const w = { id: 'qa', thread: open }, c = { trail: ['summary'], archiveOrder: ids }, toasts = [], calls = [], saved = [];
  const rows = new Map([...ids, 'outside-space', 'summary'].map(id => [id, { id, title: id }]));
  const section = {}, other = {};
  const dom = [...ids.map(id => ({ dataset: { chopen: id }, closest: () => section })), { dataset: { chopen: 'outside-space' }, closest: () => other }];
  let resolve;
  const promise = pending ? new Promise(r => { resolve = r; }) : Promise.resolve(success);
  const no = () => {};
  const ctx = vm.createContext({
    W: { qa: w }, CH: { qa: c }, ch: () => c, H: { keepThreadOpen: keep, threadShown: no }, INC: null, PW: null,
    window: { WizCore: {}, WizConfig: { chatAfterAction: () => after }, WosSkinHost: { chatArchiveOrder: () => layout, action: () => false } },
    rowOf: (_, id) => rows.get(id), owner: x => x, vib: no, ACT: { done: {}, file: {}, restore: {}, snooze: {}, unread: {} },
    followUpActive: s => !!s.followUp?.active, toast: (...x) => toasts.push(x), renderChats: no,
    LIVE: { archive: (id, opts) => { calls.push({ id, opts, painted: w.thread }); rows.get(id).archived = true; return promise.then(ok => { if (!ok) rows.get(id).archived = false; return ok; }); }, restore: id => { calls.push({ restore: id }); return Promise.resolve(true); }, markSeen: no, session: id => rows.get(id) },
    BOOM: () => ({ open: x => calls.push({ snooze: x.sessionId }), nextFor: no }),
    elOf: id => id.endsWith('::list') ? null : ({ querySelectorAll: () => dom }),
    saveDraft: () => saved.push(w.thread), closeRowSheet: no, clearTimeout: no,
    save: no, loadDraft: no, listPlace: () => null, applyLayout: no, deskOf: x => x, closeHosted: () => false,
  });
  // The phone "After actions" setting (#1068) is read through the live keepThreadOpen() helper.
  if (src.includes('  const keepThreadOpen =')) vm.runInContext(slice('  const keepThreadOpen =', "  window.addEventListener('wos:boomerang-set'"), ctx);
  if (src.includes('  function archiveListOrder(')) vm.runInContext(slice('  function archiveListOrder(', '  async function threadAct('), ctx);
  vm.runInContext(slice('  async function threadAct(', '  /* Threads and alerts share') + slice('  function openChat(', '  /* Unified Chats:') + slice('  function chatsBack(', '  const PHONE = ()'), ctx);
  return { w, c, rows, toasts, calls, saved, act: (id = open, a = 'done') => ctx.threadAct('qa', id, a), back: () => ctx.threadBack(w), finish: ok => resolve(ok) };
}
// keep = desktop host; after = the phone "After actions" setting. Archive advances under every combination.
for (const keep of [false, true]) for (const after of ['stay', 'list']) {
  const label = `keepThreadOpen=${keep}, after=${after}`, stays = keep || after === 'stay';
  test(`middle → row below, Back → list (${label})`, async () => {
    const f = fixture({ keep, after }); await f.act(); assert.equal(f.w.thread, 'c');
    assert.equal(f.calls[0].painted, 'c', 'paint precedes archive request');
    assert.deepEqual(f.saved, ['b']); assert.equal(f.toasts[0][1], 'Archived');
    f.back(); assert.equal(f.w.thread, null);
  });
  test(`last → row above; only → list (${label})`, async () => {
    const last = fixture({ open: 'c', keep, after }); await last.act(); assert.equal(last.w.thread, 'b');
    const one = fixture({ ids: ['b'], keep, after }); await one.act(); assert.equal(one.w.thread, null); assert.equal(one.c.trail.length, 0);
  });
  test(`non-open Archive, Restore, Snooze and File retain their previous navigation (${label})`, async () => {
    const non = fixture({ keep, after }); await non.act('a'); assert.equal(non.w.thread, 'b');
    for (const action of ['restore', 'snooze', 'file']) {
      const f = fixture({ keep, after }); await f.act('b', action);
      assert.equal(f.w.thread, action === 'file' && !stays ? 'summary' : 'b', action);
    }
  });
}
test('held request paints immediately; late refusal restores row + toast, not navigation', async () => {
  const f = fixture({ keep: true, pending: true }); const work = f.act();
  assert.equal(f.w.thread, 'c'); assert.equal(f.rows.get('b').archived, true);
  // Backend is still unresolved here; no timers or polls are needed to observe the change.
  f.finish(false); await work;
  assert.equal(f.w.thread, 'c'); assert.equal(f.rows.get('b').archived, false);
  assert.equal(f.toasts.at(-1)[1], 'Couldn’t archive · thread restored');
});
test('visible section / filter / Space Focus bounds the candidate order', async () => {
  const f = fixture({ ids: ['b'], keep: true }); await f.act();
  assert.equal(f.w.thread, null, 'outside-space DOM row is never selected');
});
test('layout order wins over canonical order; filtered missing row does not open an unrelated thread', async () => {
  const f = fixture({ layout: ['c', 'b', 'a'], keep: true }); await f.act(); assert.equal(f.w.thread, 'a');
  const hidden = fixture({ layout: ['a', 'c'], keep: true }); await hidden.act(); assert.equal(hidden.w.thread, null);
});
test('repeated advance skips already archived rows; still-watching toast is unchanged', async () => {
  const f = fixture({ open: 'a', keep: true }); f.rows.get('a').followUp = { active: true };
  await f.act('a'); assert.equal(f.w.thread, 'b'); assert.equal(f.toasts[0][1], 'Archived · still watching');
  await f.act('b'); assert.equal(f.w.thread, 'c');
  await f.act('c'); assert.equal(f.w.thread, null);
});
