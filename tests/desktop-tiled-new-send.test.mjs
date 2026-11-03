import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Execute the shipped capture handler and the actual composer-mic handoff branch.
// This is a browser-free branch regression, not proof of James's client geometry.
const root = process.env.QA_POLICY_TREE || path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/desktop/desktop.js'), 'utf8');
function fixture({ viewport = 1920, count = 2, mono = false, sid = '__new__', narrow = false } = {}) {
  const timers = [], w = { id: 'qa', app: 'chats', thread: sid }, desk = { wins: count === 2 ? ['qa', 'other'] : ['qa'], mono };
  const width = narrow ? 580 : count === 2 && !mono ? Math.min(1200, (viewport - 24) / 2) : Math.min(1200, viewport - 16);
  let submit, attr = sid;
  const el = { dataset: { win: 'qa' }, contains: () => true, querySelector: () => ({ getBoundingClientRect: () => ({ width }) }) };
  const ta = { value: 'Synthetic retained words' }, form = { querySelector: () => ta, closest: () => el };
  const context = vm.createContext({
    W: { qa: w }, ws: [desk], wsOf: () => 0, winEl: () => el,
    stage: { addEventListener: (_name, fn) => { submit = fn; } },
    mainChats: x => x?.app === 'chats', focused: () => w, hud: null, homeOpen: false,
    document: { activeElement: null }, setTimeout: (fn, ms) => timers.push({ fn, ms }),
    CHATS: { openNewDraft: () => { w.thread = '__new__'; }, sendVoiceTo: () => { w.thread = null; } },
    syncChatsPane() { attr = w.thread || ''; }, focusInside() {}, log() {}, toast() {},
    rp: { wid: 'qa', sid }, r: { blob: {} }, extraFiles: [], sealed: false,
    modelRoute: {}, stagedId: null, transcript: '',
  });
  const start = source.indexOf('  function keepNewSendList(') >= 0 ? source.indexOf('  function keepNewSendList(') : source.indexOf('  function toNewChat(');
  vm.runInContext(source.slice(start, source.indexOf('  function stepThread(', start)), context);
  return { w, desk, width, get attr() { return attr; },
    text() { submit({ target: { closest: () => form } }); w.thread = null; attr = ''; },
    voice() {
      const line = source.split('\n').find(x => x.includes('if (rp) { CHATS.sendVoiceTo(') || x.includes('if (rp) { const stayOnList'));
      assert.ok(line, 'actual composer-mic handoff branch found');
      vm.runInContext(`(function () { ${line} })()`, context);
    },
    drain() { for (let n = 0; n < timers.length; n++) timers[n].fn(); },
  };
}
for (const viewport of [1280, 1920, 2560]) for (const mode of ['text', 'voice']) {
  test(`half-width desktop ${viewport}: new ${mode} keeps list past the shell timer`, () => {
    const f = fixture({ viewport }); f[mode](); f.drain();
    assert.equal(f.w.thread, null, `half-width ${f.width}px is layout ownership, not a 620px breakpoint`);
    assert.equal(f.attr, '', 'desktop pane projection also leaves New chat');
  });
}
test('new text leaves a later visit and failed-save recovery untouched', () => {
  for (const destination of ['qa_other', '__new__']) {
    const f = fixture(); f.text(); f.w.thread = destination; f.drain(); assert.equal(f.w.thread, destination);
  }
});
for (const mode of ['text', 'voice']) test(`single full-width desktop ${mode} shortcut is unchanged`, () => {
  const f = fixture({ count: 1 }); f[mode](); f.drain(); assert.equal(f.w.thread, '__new__');
});
test('fullscreen of a two-window desk retains wide behavior', () => {
  const f = fixture({ mono: true }); f.text(); f.drain(); assert.equal(f.w.thread, '__new__');
});
test('existing tiled reply keeps the established shell shortcut', () => {
  const f = fixture({ sid: 'qa_existing' }); f.text(); f.drain(); assert.equal(f.w.thread, '__new__');
});
test('pre-existing narrow new-text guard is retained', () => {
  const f = fixture({ narrow: true }); f.text(); f.drain(); assert.equal(f.w.thread, null);
});
