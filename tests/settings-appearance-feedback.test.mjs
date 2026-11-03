import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
// Dependency-free DOM port: drive the actual delegated click handler and renderer,
// controlling animation frames and backend promises independently.
function fixture(attribute, value) {
  const frames = [], handlers = {}, notices = [], calls = [];
  let release, reject, node, html = '';
  const waiting = new Promise((ok, no) => { release = ok; reject = no; });
  const make = () => ({ dataset: { [attribute.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]: value }, attrs: {}, disabled: false,
    classList: { add(k) { this[k] = true; }, contains(k) { return !!this[k]; } },
    hasAttribute: k => k === attribute, getAttribute: k => k === attribute ? value : node.attrs[k],
    setAttribute(k, v) { this.attrs[k] = v; },
    closest(sel) { return sel === '[data-settings-feature]' ? { dataset: { settingsFeature: 'look' } } : sel === '[' + attribute + ']' ? this : null; }
  });
  node = make();
  const root = { dataset: {}, classList: { add() {} }, scrollTop: 0, contains: () => false,
    get innerHTML() { return html; }, set innerHTML(v) { html = v; node = make(); },
    querySelector: s => s.startsWith('[' + attribute + '=') ? node : null,
    querySelectorAll: s => s.includes('[data-skinfamily]') ? [node] : [],
    addEventListener: (name, fn) => { handlers[name] = fn; }, removeEventListener() {} };
  const s = { console, CSS: { escape: String }, document: { activeElement: null }, navigator: { userAgent: 'Desktop' },
    requestAnimationFrame: fn => frames.push(fn), setTimeout,
    WosSkin: { current: 'nebula', list: [{ id: 'nebula', name: 'Nebula' }, { id: 'obsidian', name: 'Dark' }], families: [{ id: 'wizard', tweaks: 'wizard', name: 'Wizard', palettes: ['nebula'] }, { id: 'mizel', tweaks: 'miguel', name: 'Mizel', palettes: ['obsidian'] }], familyOf: id => id === 'nebula' ? 'wizard' : 'mizel', set(id) { this.current = id; }, setFamily(id) { this.current = id === 'mizel' ? 'obsidian' : 'nebula'; } },
    WizCore: {},
    WosMySkin: { on() {}, recipes: [{ id: 'quiet', name: 'Quiet', base: 'nebula' }], state: { script: {} },
      wear: () => { calls.push('wear'); return waiting; }, leave: () => { throw Error('must not leave an unworn recipe'); } },
    WosExperience: { state: { owner: 'wizard', tweaks: [{ id: 'wizard/pin-buttons', name: 'Show pin buttons', on: false }] },
      installed: async () => [], defaults: () => { calls.push('defaults'); return waiting; },
      chooseSkin: () => { calls.push('skin'); return waiting; }, toggle: () => { calls.push('toggle'); return waiting; }, chooseAuthor: () => { calls.push('all'); return waiting; } }
  };
  s.window = s; vm.runInNewContext(read('web/core/settings.js'), s);
  const view = s.WosSettings.mount(root, { shell: 'desktop', toast: (...args) => notices.push(args) });
  return { s, root, view, notices, calls, release, reject, node: () => node,
    click: () => handlers.click({ target: node }), frame: () => frames.splice(0).forEach(fn => fn()) };
}
for (const [attribute, value] of [['data-skinfamily', 'mizel'], ['data-skinpick', 'obsidian'], ['data-ownskin', 'quiet'], ['data-newskin', ''], ['data-tweak-toggle', 'wizard/pin-buttons'], ['data-tweakauthor', 'wizard']]) {
  test(`${attribute}: busy is synchronous in click task, before work; one receipt survives refresh and clears on success`, async () => {
    const f = fixture(attribute, value); f.click();
    assert.equal(f.node().attrs['aria-busy'], 'true'); assert.equal(f.node().disabled, true);
    assert.ok(f.node().classList.contains('st-pending')); assert.equal(f.calls.length, 0, 'no I/O before paint');
    f.click(); f.view.render(); assert.equal(f.node().attrs['aria-busy'], 'true', 'poll cannot erase pending');
    f.view.context.render(); assert.equal(f.node().attrs['aria-busy'], 'true', 'explicit render reattaches receipt');
    f.frame(); assert.equal(f.calls.length, 0, 'one real frame paints before work');
    f.frame(); await tick(); assert.equal(f.calls.length, 1, 'double tap does not duplicate work');
    f.release({}); await tick(); await tick();
    assert.equal(f.view.context.lookPending, null); assert.equal(f.node().attrs['aria-busy'], undefined);
    assert.equal(f.node().disabled, false); assert.equal(f.notices.length, 0);
  });
}
for (const attribute of ['data-skinfamily', 'data-skinpick', 'data-ownskin', 'data-tweak-toggle', 'data-tweakauthor']) {
  test(`${attribute}: failed change clears receipt, retains/restores selection and exposes error`, async () => {
    const f = fixture(attribute, attribute === 'data-skinfamily' ? 'mizel' : 'obsidian');
    f.click(); f.frame(); f.frame(); await tick(); f.reject(Error('Owner connection needed')); await tick(); await tick();
    assert.equal(f.s.WosSkin.current, 'nebula'); assert.equal(f.view.context.lookPending, null);
    assert.equal(f.node().attrs['aria-busy'], undefined); assert.equal(f.node().disabled, false);
    assert.match(f.root.innerHTML, /role="alert">Owner connection needed/); assert.match(f.notices.at(-1)[1], /^Owner connection needed/);
  });
}
test('tweak groups use only the worn set owner, including carried shared tweaks; house never says James', async () => {
  const f = fixture('data-tweakauthor', 'wizard');
  for (const [owner, palette, name, alien] of [['wizard', 'nebula', 'Wizard', 'Miguel'], ['miguel', 'obsidian', 'Miguel', 'Wizard']]) {
    f.s.WosSkin.current = palette;
    f.s.WosExperience.state = { owner, tweaks: [
      { id: owner + '/one', author: owner, name: 'An idea', on: true },
      { id: 'wizard/pin-buttons', author: 'wizard', name: 'Show pin buttons', on: false },
      { id: 'wizard/unified-inbox', author: 'wizard', name: 'Unified inbox', builtin: true, on: true }
    ] };
    f.view.context.render();
    assert.match(f.root.innerHTML, new RegExp(`aria-label="${name}’s tweaks"`));
    assert.match(f.root.innerHTML, /1 of 2 on/); assert.match(f.root.innerHTML, /Built-in choices/);
    assert.doesNotMatch(f.root.innerHTML, new RegExp(`${alien}’s tweaks|James[’']s`));
    assert.equal((f.root.innerHTML.match(/data-tweakauthor=/g) || []).length, 1);
  }
});
test('stale experience state never flashes another skin owner’s group during reconciliation', () => {
  const f = fixture('data-skinfamily', 'mizel'); f.s.WosSkin.current = 'obsidian'; f.view.context.render();
  assert.match(f.root.innerHTML, /Loading this skin’s tweaks/);
  assert.doesNotMatch(f.root.innerHTML, /Wizard’s tweaks|data-tweakauthor=/);
});
test('pending tiles retain rounded preview art and a visible label, never a button-sized slab', () => {
  const css = read('web/core/settings.css');
  assert.doesNotMatch(css, /\.st-pending::(?:before|after)/, 'no full-button overlay or spinner');
  assert.match(css, /\.st-pending \.skp-mini::before[^}]*inset: 0[^}]*border-radius: inherit[^}]*background: color-mix\(in srgb, var\(--wz-base\) 45%, transparent\)/);
  assert.match(css, /\.skp-card\.st-pending[^}]*outline: none/);
  assert.match(css, /\.skp-card\.st-pending \.skp-nm[^}]*color: var\(--wz-text\)[^}]*visibility: visible/);
  assert.match(css, /\.st-pending:disabled[^}]*opacity: 1/);
  assert.match(css, /\.st-pending \.skp-mini \{[^}]*box-shadow:[^}]*var\(--wz-accent\)[^}]*animation: st-busy-ring/);
  assert.match(css, /\.st-pending \.skp-mini::after[^}]*width: 22px; height: 22px[^}]*border: 2px solid[^}]*border-top-color: var\(--wz-accent\)/);
});
test('competing Appearance choices dim without layout changes; switch progress stays at the switch', () => {
  const css = read('web/core/settings.css');
  assert.match(css, /:is\(\[data-skinfamily\], \[data-skinpick\], \[data-ownskin\], \[data-newskin\], \[data-tweak-toggle\], \[data-tweakauthor\]\):disabled:not\(\.st-pending\) \{ opacity: .6; \}/);
  assert.match(css, /\.st-pending \.sw i \{ opacity: 0; \}/);
  assert.match(css, /\.st-pending \.sw::after \{ width: 18px; height: 18px/);
  assert.doesNotMatch(css, /\.st-pending \.sw::before|\.st-pending[^}]*outline: 2px/);
});
test('legacy owner overlay rollback restores only the palette, never PATCHes personal skin metadata', async () => {
  const f = fixture('data-skinpick', 'obsidian');
  f.s.WosMySkin.active = { id: 'My skin', name: 'My skin', base: 'nebula', tweaks: {} };
  f.s.WosMySkin.overlay = true;
  let writes = 0, picks = 0;
  f.s.WosMySkin.update = async () => { writes++; throw Error('palette rollback must not edit owner metadata'); };
  f.s.WosExperience.chooseSkin = () => ++picks === 1 ? new Promise((_, no) => { f.failPick = no; }) : Promise.resolve();
  f.s.WosExperience.refresh = async () => {};
  f.click(); assert.equal(f.node().attrs['aria-busy'], 'true'); f.frame(); f.frame(); await tick();
  assert.equal(f.s.WosSkin.current, 'obsidian');
  f.failPick(new DOMException('signal timed out', 'TimeoutError')); await tick(); await tick();
  assert.equal(f.s.WosSkin.current, 'nebula'); assert.equal(f.s.WosMySkin.active.id, 'My skin');
  assert.equal(writes, 0); assert.equal(f.view.context.lookPending, null);
  assert.equal(f.view.context.lookError, 'signal timed out');
});

test('reduced motion removes both the pulse and spin, leaving static partial rings', () => {
  const css = read('web/core/settings.css');
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.st-root \.st-pending \.skp-mini, \.st-root \.st-pending \.skp-mini::after, \.st-root \.st-pending \.sw::after \{ animation: none; \}/);
});
