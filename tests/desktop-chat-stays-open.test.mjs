import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const desktop = read('web/desktop/desktop.js'), core = read('web/core/chats.js');
const cut = (source, from, to) => {
  const a = source.indexOf(from), b = source.indexOf(to, a);
  assert.ok(a >= 0 && b > a, from); return source.slice(a, b);
};
function fixture(desktopHost = true) {
  const w = { id: 'chat', app: 'chats', thread: 'same' }, state = { trail: [], readNav: 0 };
  const row = { id: 'same', status: 'ready', title: 'Synthetic conversation' }, listeners = {}, backs = [];
  const H = { keepThreadOpen: desktopHost, changed() {} };
  const context = { H, W: { chat: w }, CH: { chat: state }, CHATS: { isHosted: () => false, markVisibleThreadsSeen() {}, holdList: () => false, renderChatList() {}, loadThread() {} },
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    LIVE: { onChange: fn => { listeners.live = fn; }, markUnread: async () => true, archive: async () => true, restore: async () => true },
    PHONE: () => !desktopHost, hosted: new Map(), ch: () => state, owner: id => id, rowOf: () => row,
    ACT: { done: {}, file: {}, restore: {}, unread: {} }, vib() {}, closeRowSheet() {}, followUpActive: () => false,
    toast() {}, snoozeLast: () => false, renderChats() {}, save() {}, applyLayout() {}, deskOf: () => 0,
    threadBack: x => { backs.push(x.thread); x.thread = null; },
    paintBar() {}, syncChatsPane() {}, winEl: () => ({ querySelector: () => null }),
    ws: [{ wins: ['chat'] }], cur: 0, homeOpen: false, hudPaint() {}, document: { activeElement: null },
  };
  vm.createContext(context);
  vm.runInContext(cut(core, '  function leaveAfterSend(', '\n  function ',), context);
  vm.runInContext(cut(core, '  async function threadAct(', '\n  /* Threads and alerts'), context);
  vm.runInContext(cut(core, "  window.addEventListener('wos:boomerang-set'", '  // A scheduled Snooze'), context);
  vm.runInContext(cut(desktop, '  if (LIVE) LIVE.onChange(', '\n  OUTBOX?.onChange('), context);
  return { context, w, row, listeners, backs };
}
test('Classic desktop keeps the same open thread through Ready → Working → Ready, even after send', () => {
  const f = fixture();
  assert.match(desktop, /keepThreadOpen: true/);
  assert.doesNotMatch(desktop, /toNewChat|send:new-chat/);
  assert.equal(f.context.leaveAfterSend('chat', 'same', false), false);
  for (const status of ['running', 'ready', 'done', 'seen']) {
    f.row.status = status; f.listeners.live(); assert.equal(f.w.thread, 'same', status);
  }
});
for (const a of ['done', 'file', 'unread', 'restore']) test(`desktop ${a} changes state without leaving the thread; phone retains its behaviour`, async () => {
  for (const desktopHost of [true, false]) {
    const f = fixture(desktopHost); await f.context.threadAct('chat', 'same', a);
    assert.equal(f.w.thread, desktopHost || a === 'restore' ? 'same' : null);
  }
});
for (const name of ['wos:boomerang-set', 'wos:snooze-someday']) test(`${name} leaves desktop open but still closes phone`, () => {
  for (const desktopHost of [true, false]) {
    const f = fixture(desktopHost); f.listeners[name]({ detail: { session: 'same', label: 'Later' } });
    assert.equal(f.w.thread, desktopHost ? 'same' : null);
  }
});
test('phone reply still returns to the list and desktop hosted reply stays in place', () => {
  const phone = fixture(false); phone.context.leaveAfterSend('chat', 'same', false);
  assert.equal(phone.w.thread, null);
  const desktop = fixture(); desktop.context.hosted.set('chat', {});
  assert.equal(desktop.context.leaveAfterSend('chat', 'same', false), false);
  assert.equal(desktop.w.thread, 'same'); assert.equal(desktop.context.hosted.has('chat'), true);
});
