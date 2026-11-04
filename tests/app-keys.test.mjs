// App keys (Miguel, 4 Nov 2026: drive every app from the keyboard). The contract app authors follow
// (docs/ai-apps-view.md › App keys): a control marked data-wz-key="<key>" is clicked by that plain key; the behaviour
// lives in the app SDK (core/app-client.js), framed and standalone, and WizardApp.keys.list() hands the shell the live
// targets it marks while left ⌥ is held. Pinned here with a small fake page.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const client = read('web/core/app-client.js');

/* ---------- a tiny page: just what the key matcher reads ---------- */
const one = (n, s) => {
  s = s.trim();
  const not = /^(.*):not\((.*)\)$/.exec(s); if (not) return one(n, not[1]) && !one(n, not[2]);
  const m = /^([a-z]*)((?:\[[^\]]+\])*)$/i.exec(s); if (!m) throw new Error('selector ' + s);
  if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
  return [...m[2].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, k, v]) => v === undefined ? n.attrs[k] !== undefined : n.attrs[k] === v);
};
const matches = (n, sel) => sel.split(',').some(s => one(n, s));
class Node0 {
  constructor(tag, attrs = {}, kids = []) {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.attrs = { ...attrs }; this.children = []; this.parentNode = null; this.clicks = 0; this.box = true;
    for (const k of kids) { k.parentNode = this; this.children.push(k); }
  }
  get disabled() { return this.attrs.disabled !== undefined; }
  get isContentEditable() { for (let n = this; n; n = n.parentNode) if (n.attrs && n.attrs.contenteditable !== undefined) return n.attrs.contenteditable !== 'false'; return false; }
  get title() { return this.attrs.title || ''; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  querySelectorAll(sel) { return this.all().filter(n => matches(n, sel)); }
  closest(sel) { for (let n = this; n && n.tagName; n = n.parentNode) if (matches(n, sel)) return n; return null; }
  getClientRects() { return this.box ? [{}] : []; }
  getBoundingClientRect() { return { width: this.box ? 40 : 0, height: 20 }; }
  click() { this.clicks++; }
  appendChild(n) { n.parentNode = this; this.children.push(n); return n; }
  addEventListener() {}
}
const el = (tag, attrs, ...kids) => new Node0(tag, attrs, kids);

function load({ framed = false } = {}) {
  const listeners = {}, head = el('head'), body = el('body');
  const document = { head, body, documentElement: el('html', {}, head, body), activeElement: body, dataset: {}, hidden: false,
    createElement: t => el(t), querySelectorAll: s => body.querySelectorAll(s), querySelector: s => body.querySelectorAll(s)[0] || null, getElementById: () => null, addEventListener() {} };
  const ctx = { document, location: new URL('https://box.example/music/'), history: { state: null, pushState() {}, replaceState() {}, back() {} },
    navigator: {}, URL, setTimeout, clearTimeout, console, CustomEvent: class {}, Event: class {}, matchMedia: () => ({ matches: false }),
    addEventListener: (t, fn) => (listeners[t] ||= []).push(fn), removeEventListener() {}, dispatchEvent() {}, postMessage() {} };
  ctx.window = ctx;
  ctx.parent = framed ? { postMessage() {}, WizHomeScreenPolicy: null } : ctx;
  vm.runInNewContext(client, ctx);
  const press = (key, o = {}) => {
    const e = { type: 'keydown', key, code: o.code || '', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false,
      target: body, ...o, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of listeners.keydown || []) fn(e);
    return e;
  };
  return { ctx, document, body, press, WizardApp: ctx.WizardApp };
}

test('a plain key clicks the first live control marked with it, normalised (Space, letters lower-cased), and is used up', () => {
  const p = load();
  const play = el('button', { 'data-wz-key': 'Space', 'data-wz-key-label': 'Play / pause' });
  const nextA = el('button', { 'data-wz-key': 'j' }), nextB = el('button', { 'data-wz-key': 'j' });
  const down = el('button', { 'data-wz-key': 'ArrowDown' }), search = el('button', { 'data-wz-key': '/' }), ask = el('button', { 'data-wz-key': '?' });
  p.body.children.push(...[play, nextA, nextB, down, search, ask].map(n => (n.parentNode = p.body, n)));
  let e = p.press(' ', { code: 'Space' }); assert.equal(play.clicks, 1); assert.equal(e.defaultPrevented, true, 'the page does not scroll');
  p.press('j'); assert.deepEqual([nextA.clicks, nextB.clicks], [1, 0], 'first in page order wins');
  p.press('J', { capsLock: true }); assert.equal(nextA.clicks, 2, 'Caps Lock: the same key');
  p.press('ArrowDown'); p.press('/'); p.press('?', { shiftKey: true });
  assert.deepEqual([down.clicks, search.clicks, ask.clicks], [1, 1, 1], '⇧ is fine where the character needs it (?)');
  e = p.press('x'); assert.equal(e.defaultPrevented, false, 'an unmarked key is left alone');
  const find = el('input', { 'data-wz-key': 's' }); let focus = 0; find.focus = () => { focus++; }; find.parentNode = p.body; p.body.children.push(find);
  e = p.press('s'); assert.deepEqual([find.clicks, focus, e.defaultPrevented], [1, 1, true], 'a field as the target takes the typing (no s typed into it)');
  p.body.children.pop();
  assert.deepEqual([...p.WizardApp.keys.list()].map(k => [k.key, k.label]), [['Space', 'Play / pause'], ['j', ''], ['j', ''], ['ArrowDown', ''], ['/', ''], ['?', '']]);
});

test('never with ⌥ / Ctrl / ⌘ (the shell\'s), ⇧ as a variant, while typing, composing, or once the app handled the key; Escape is never an app key', () => {
  const p = load();
  const j = el('button', { 'data-wz-key': 'j' }), sp = el('button', { 'data-wz-key': 'Space' }), esc = el('button', { 'data-wz-key': 'Escape' });
  const field = el('input'), area = el('textarea'), sel = el('select'), rich = el('div', { contenteditable: '' }, el('span'));
  p.body.children.push(...[j, sp, esc, field, area, sel, rich].map(n => (n.parentNode = p.body, n)));
  for (const o of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }, { defaultPrevented: true }, { target: field }, { target: area }, { target: sel }, { target: rich.children[0] }]) {
    const e = p.press('j', o); assert.equal(j.clicks, 0, JSON.stringify(Object.keys(o))); if (!o.defaultPrevented) assert.equal(e.defaultPrevented, false);
  }
  p.press('J', { shiftKey: true }); p.press(' ', { shiftKey: true }); assert.deepEqual([j.clicks, sp.clicks], [0, 0], '⇧J, ⇧Space: not the plain key');
  p.press('Escape'); assert.equal(esc.clicks, 0, 'Escape stays Back');
  assert.ok(!p.WizardApp.keys.list().some(k => k.el === esc), 'and is never listed');
});

test('only visible, enabled controls count; an open modal keeps the keys to itself; held keys repeat only for arrows', () => {
  const p = load();
  const hid = el('button', { 'data-wz-key': 'n', hidden: '' }), inHidden = el('div', { hidden: '' }, el('button', { 'data-wz-key': 'n' }));
  const inert = el('div', { inert: '' }, el('button', { 'data-wz-key': 'n' })), aria = el('div', { 'aria-hidden': 'true' }, el('button', { 'data-wz-key': 'n' }));
  const off = el('button', { 'data-wz-key': 'n', disabled: '' }), ariaOff = el('button', { 'data-wz-key': 'n', 'aria-disabled': 'true' });
  const noBox = el('button', { 'data-wz-key': 'n' }); noBox.box = false;
  const live = el('button', { 'data-wz-key': 'n' }), right = el('button', { 'data-wz-key': 'ArrowRight' });
  p.body.children.push(...[hid, inHidden, inert, aria, off, ariaOff, noBox, live, right].map(n => (n.parentNode = p.body, n)));
  p.press('n'); assert.equal(live.clicks, 1, 'the one that can be seen and used');
  assert.deepEqual([...p.WizardApp.keys.list()].map(k => k.el), [live, right]);
  // a modal: only its own targets (the topmost); the page behind is out of reach
  const sheetBtn = el('button', { 'data-wz-key': 's' }), sheet = el('div', { role: 'dialog' }, sheetBtn);
  const dlgBtn = el('button', { 'data-wz-key': 'Enter' }), dlg = el('dialog', { open: '' }, dlgBtn);
  p.body.children.push(sheet, dlg); sheet.parentNode = dlg.parentNode = p.body;
  p.press('n'); assert.equal(live.clicks, 1, 'behind the modal: nothing');
  p.press('Enter'); assert.equal(dlgBtn.clicks, 1, 'the topmost modal\'s own key');
  p.press('s'); assert.equal(sheetBtn.clicks, 0, 'a lower modal is behind the top one');
  assert.deepEqual([...p.WizardApp.keys.list()].map(k => k.el), [dlgBtn]);
  dlg.attrs = {}; dlg.box = false; sheet.attrs.hidden = ''; sheet.box = false;
  // held down: arrows repeat, other keys are used up once
  let e = p.press('n', { repeat: true }); assert.equal(live.clicks, 1); assert.equal(e.defaultPrevented, true, 'still not typed into the page');
  p.press('ArrowRight', { repeat: true }); p.press('ArrowRight', { repeat: true }); assert.equal(right.clicks, 2);
});

test('framed apps get the same keys (the shell passes plain keys on), and the SDK exposes keys.list for the shell', () => {
  const p = load({ framed: true });
  const b = el('button', { 'data-wz-key': 'k' }); b.parentNode = p.body; p.body.children.push(b);
  p.press('k'); assert.equal(b.clicks, 1);
  assert.equal(typeof p.WizardApp.keys.list, 'function'); assert.equal(p.WizardApp.keys.list()[0].el, b);
  assert.ok(Object.isFrozen(p.WizardApp.keys));
});

test('the shell: keycaps on a frame\'s targets are offset by the frame and hit-tested in its own page, drawn outlined; plain keys from a frame are never the shell\'s', () => {
  const desk = read('web/desktop/desktop.js');
  assert.match(desk, /const ox = fr \? fr\.left \+ \(f\.clientLeft \|\| 0\) : 0, oy = fr \? fr\.top \+ \(f\.clientTop \|\| 0\) : 0;/);
  assert.match(desk, /if \(f\) \{ const inner = n\.ownerDocument\.elementFromPoint\(hx - ox, hy - oy\);/);
  assert.match(desk, /c\.className = 'kh-chip' \+ \(word \? ' kh-lab' : ''\) \+ \(opt\?\.app \? ' kh-app' : ''\);/);
  assert.match(desk, /opt\?\.app \? `\$\{label\}: \$\{opt\.name \|\| label\}` : `\$\{ALT\} /, 'an app key reads without ⌥');
  // ⌥ inside an app frame still reaches the shell (keys + the hold-⌥ release)
  assert.match(desk, /(doc|frameWindow)\.addEventListener\('keydown', e => onKey\(e, true\), true\);\s*(doc|frameWindow)\.addEventListener\('keyup', e => \{ keyHints\.up\(e\);/);
  // past the layout's keys, a plain key from a frame stops at the ⌥ gate (Escape excepted: Back)
  assert.match(desk, /if \(f\?\.app === 'chats' && !keyHints\.pinned\(\) && plain && !fromFrame\)/);
  assert.match(desk, /if \(!e\.altKey \|\| e\.metaKey \|\| e\.ctrlKey\) \{\n\s+return;\n\s+\}/);
  const host = read('web/core/skin-host.js');
  assert.match(host, /c\.frame\?\.tagName === 'IFRAME' \? \{ frame: c\.frame \} : \{\}/, 'the frame passes through keyChips');
  assert.match(host, /c\.app === true \? \{ app: true, name:/);
});

test('docs: the App keys section app authors follow', () => {
  const doc = read('docs/ai-apps-view.md');
  const sec = doc.slice(doc.indexOf('## App keys'));
  assert.ok(doc.includes('## App keys'), 'a section of its own');
  for (const w of ['data-wz-key', 'data-wz-key-label', 'WizardApp.keys.list()', 'Escape', 'aria-modal', 'OUTLINED', 'ArrowUp', 'contenteditable']) assert.ok(sec.includes(w), w);
});
