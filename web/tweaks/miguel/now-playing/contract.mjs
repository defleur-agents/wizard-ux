import assert from 'node:assert/strict';
// Nothing shows while nothing plays; the pill comes with the first playing item, sits at the top of the AI apps
// column when that view renders it (else the bar / dock), pauses the newest item, and leaves with the last one.
export default async function check(f) {
  assert.ok(f.doc.head.children.some(n => n.href?.endsWith('now-playing/tweak.css')));
  const top = f.doc.body.querySelector('[data-slot="apps-top"]'), dock = f.doc.body.querySelector('[data-slot="dock-end"]');
  assert.equal(top.children.length + dock.children.length, 0, 'no media watcher in this shell: nothing drawn');
  const subs = new Set(), paused = [];
  let items = [];
  const push = l => { items = l; for (const fn of [...subs]) fn(items); };
  f.ctx.window.WosMedia = { watch(fn) { subs.add(fn); fn(items); return () => subs.delete(fn); }, list: () => items, pause: k => { paused.push(k); return true; }, play: () => true, pauseAll: () => true, toggle: () => true };
  await f.mount('miguel/now-playing');
  assert.equal(subs.size, 1, 'watching while on'); assert.equal(top.children.length + dock.children.length, 0, 'idle: nothing in the page');
  push([{ key: 'm:1', appId: 'music', kind: 'audio', playing: true, at: 2, title: 'Song', artist: '' }]);
  assert.equal(top.children.length, 1, 'playing: the pill tops the apps column'); assert.equal(dock.children.length, 0);
  const pill = top.children[0], [, tog] = pill.children;
  tog.fire('click', {}); assert.deepEqual(paused, ['m:1'], 'its button pauses the newest item');
  top.remove(); push([...items]);
  assert.equal(dock.children[0], pill, 'no apps column: the bar / dock instead');
  push([]); assert.equal(pill.parentNode, null, 'nothing playing: gone again');
  await f.clear(); assert.equal(subs.size, 0, 'teardown stops watching'); assert.equal(f.doc.head.children.length, 0);
  // the phone: not yet (no spot that never covers an app's own bottom bar)
  f.doc.documentElement.dataset.shell = 'phone'; await f.mount('miguel/now-playing');
  assert.equal(subs.size, 0, 'phone: nothing watched, nothing drawn');
  await f.clear(); f.doc.documentElement.dataset.shell = 'desktop';
  delete f.ctx.window.WosMedia;
}
