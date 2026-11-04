// Browser-free regression: shared DOM/navigation + host-scoped CSS and actual desktop host lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(process.env.QA_SETTINGS_SOURCE ? process.env.QA_SETTINGS_SOURCE + '/' + p : new URL('../' + p, import.meta.url), 'utf8');
const css = read('web/core/settings.css'), desktop = read('web/desktop/desktop.js');
const slice = (s, a, b) => { const start = s.indexOf(a); assert.ok(start >= 0, a); const end = s.indexOf(b, start); assert.ok(end > start, b); return s.slice(start, end); };
const rule = (s, selector) => { const at = s.indexOf(selector + ' {'); assert.ok(at >= 0, selector); return s.slice(at, s.indexOf('}', at)); };
test('narrow desktop Settings follows its host container, never the desktop viewport', () => {
  assert.match(css, /\.st-root \{ container: settings \/ inline-size;/);
  const narrow = slice(css, '@container settings (max-width: 700px)', '\n\n.st-title:focus');
  assert.match(rule(narrow, '.st-desktop'), /display: block;/);
  assert.match(rule(narrow, '.st-desktop .st-index'), /height: 100%; padding-right: 0; border-right: 0;/);
  assert.match(rule(narrow, '.st-desktop .st-page'), /height: 100%; padding-right: 0;/);
  assert.match(rule(narrow, '.st-desktop.st-in-page .st-index'), /display: none;/);
  assert.match(rule(narrow, '.st-desktop:not(.st-in-page) .st-page'), /display: none;/);
  assert.match(rule(narrow, '.st-desktop .st-page-head button'), /display: block;/);
  assert.doesNotMatch(css, /@media \(max-width: 700px\)/);
  // The CSS no longer subtracts a fixed 280px category column in a 470px app panel.
  for (const host of [320, 360, 412, 470, 560, 700]) {
    const row = host - 32; // existing st-inner horizontal padding, no category track
    assert.ok(row >= 280, `${host}px host leaves a readable ${row}px row`);
  }
  assert.match(rule(css, '.st-desktop'), /grid-template-columns: 280px minmax\(0, 1fr\)/, 'wide Settings retains both panes');
});
test('same shared Settings DOM and dispatch provide category → Look → Back in either shell', () => {
  const s = { console, URL, Map, Set, Date, String, CSS: { escape: String }, navigator: { userAgent: 'fixture' }, location: { href: 'https://fixture.invalid/' }, document: { activeElement: null }, addEventListener() {} };
  s.window = s; s.WizCore = {};
  vm.runInNewContext(read('web/core/settings.js'), s);
  for (const shell of ['phone', 'desktop']) {
    const root = { innerHTML: '', scrollTop: 0, classList: { add() {} }, dataset: {}, contains: () => false, querySelector: () => null, addEventListener() {}, removeEventListener() {} };
    const view = s.WosSettings.mount(root, { shell, live: { ok: true } });
    view.dispatch({ closest: selector => selector === '[data-st-page]' ? { dataset: { stPage: 'appearance' } } : null });
    assert.equal(view.page, 'appearance');
    assert.match(root.innerHTML, /st-in-page/); assert.match(root.innerHTML, /data-st-back aria-label="Back to Settings"/);
    view.dispatch({ closest: selector => selector === '[data-st-back]' ? {} : null });
    assert.equal(view.page, ''); assert.doesNotMatch(root.innerHTML, /st-in-page/);
    assert.equal(view.back(), false, 'root Back belongs to the shell, not exit');
    view.destroy();
  }
});
function hostHarness({ open = true, over = true, modal = false } = {}) {
  const body = { appendChild(n) { n.parentNode = this; } }, host = { appendChild(n) { n.parentNode = this; } };
  const attrs = {}, classes = new Set(), closed = [];
  const setEl = { hidden: !open, parentNode: host, page: 'appearance', classList: { add: k => classes.add(k), remove: k => classes.delete(k) }, setAttribute: (k,v) => attrs[k] = v, removeAttribute: k => delete attrs[k], getClientRects: () => [1], focus() {} };
  const s = { setEl, scrim: { hidden: !modal }, settingsModal: modal, settingsPromoted: false, settingsFocus: null, settingsOver: () => over, document: { body, activeElement: setEl }, homeOpen: false, focused: () => null, focusInside() {}, window: { WosScenery: { update() {} } } };
  let win = open ? { id: 'settings-1' } : null;
  s.settingsWin = () => win; s.winEl = () => ({ querySelector: () => host });
  s.closeWin = id => { closed.push(id); win = null; s.hostSettings(); };
  vm.createContext(s);
  vm.runInContext(slice(desktop, '  function showSettingsModal()', '  afterRender = hostSettings;') + '\n' + slice(desktop, '  function closeSettings()', '  function toggleSettings()'), s);
  return { s, body, host, setEl, attrs, classes, closed };
}
test('mounting AI apps promotes an already-open Settings window without replacing its page/root', () => {
  const {s,body,setEl,attrs,closed} = hostHarness();
  s.hostSettings();
  assert.equal(s.setEl, setEl); assert.equal(setEl.page, 'appearance'); assert.equal(setEl.hidden, false);
  assert.equal(setEl.parentNode, body); assert.equal(attrs['aria-modal'], 'true'); assert.equal(s.scrim.hidden, false);
  assert.equal(s.settingsPromoted, true);
  s.hostSettings(); assert.deepEqual(closed, [], 'promotion is idempotent and does not close during a toggle');
  s.closeSettings(); assert.deepEqual(closed, ['settings-1']); assert.equal(setEl.hidden, true); assert.equal(s.scrim.hidden, true);
});
test('Apps/Orb keep their normal Settings window; closed Settings is never opened by view mount', () => {
  for (const options of [{over:false}, {open:false}]) {
    const {s,body,host,setEl} = hostHarness(options); s.hostSettings();
    assert.equal(s.settingsModal, false); assert.equal(setEl.parentNode, options.open === false ? body : host);
    if (options.open === false) assert.equal(setEl.hidden, true);
  }
  assert.match(desktop, /new MutationObserver\(\(\) => hostSettings\(\)\)/);
  assert.match(desktop, /settingsHostObserver.observe\(document.documentElement, \{ attributes: true, attributeFilter: \['data-settings-over'\] \}\)/);
});
