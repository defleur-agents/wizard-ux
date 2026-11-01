// Skins are colours only; layout is a tweak (James and Miguel, 1 Nov 2026). Picking Dark, Light or Landscapes must never
// change the Chats list, dock, Home or launcher on its own: Miguel's layout is the miguel/layout tweak, which any skin
// can switch on and which his devices keep once through a one-time migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SHELL = ['web/app.js', 'web/live.js', 'web/core/chats.js', 'web/core/chat-models.js', 'web/core/resources.js', 'web/desktop/desktop.js'];
const GATE = ':where([data-tweaks~="miguel/layout"])';

test('no shell file picks a layout from the worn skin', () => {
  for (const f of SHELL) assert.doesNotMatch(read(f), /'obsidian'|'landscapes'|"obsidian"|"landscapes"/, f);
  for (const f of ['web/app.js', 'web/live.js', 'web/core/chats.js', 'web/desktop/desktop.js']) assert.match(read(f), /includes\('miguel\/layout'\)/, f);
});

test("Miguel's skin stylesheets gate their layout on the tweak (chat list order, hidden clock, edge-to-edge phone apps)", () => {
  for (const [d, p] of [['obsidian', 'html[data-skin^="obsidian"]'], ['landscapes', 'html[data-skin^="landscapes"]']]) {
    const css = read(`web/skins/${d}/skin.css`);
    assert.ok(css.includes(`${p}${GATE}:not([data-shell="desktop"]) .ch-list .ch-scroll { display: flex; flex-direction: column-reverse; }`), `${d}: phone list order`);
    assert.ok(css.includes(`${p}${GATE} :is(.home-date, .home-time) { display: none; }`), `${d}: Home clock`);
    assert.ok(css.includes(`${p}${GATE}[data-shell="phone"] .win .wb[data-wact="full"] { display: none; }`), `${d}: full button`);
    // Nothing ungated still reorders the chat list or hides stock Home parts.
    // Markup only a tweak renders (model switch, Home dots and dials, symmetric dock, For agents row) keeps its own rules.
    const TWEAK_ONLY = /\.(ms-[\w-]+|nc-vis|nc-ic|nc-zero|forag|fa-[\w-]+|ov-pill|ov-badge|sym\b|mz-[\w-]+|dslot|dnew|rs-[\w-]+)/;
    const ungated = css.split('\n').filter(l => l.startsWith(p) && !l.includes(GATE) && !l.slice(0, l.indexOf('{')).replace(/\([^()]*\)/g, '').replace(/\([^()]*\)/g, '').split(',').every(s => TWEAK_ONLY.test(s)));
    for (const l of ungated) assert.doesNotMatch(l, /\{[^}]*\b(display|order|flex-direction|position)\s*:/, `${d}: ungated layout: ${l.slice(0, 140)}`);
  }
});

test('the tweak is Miguel\'s, listed for everyone, never a default', () => {
  const cat = JSON.parse(read('web/tweaks/catalog.json')), prof = JSON.parse(read('web/tweaks/miguel/profile.json'));
  assert.ok(cat.tweaks.includes('miguel/layout')); assert.ok(!cat.defaults.includes('miguel/layout'));
  assert.ok(prof.tweaks.includes('miguel/layout'));
  assert.equal(JSON.parse(read('web/tweaks/miguel/layout/manifest.json')).author, 'miguel');
});

async function boot(skin, saved) {
  const storage = new Map([['wos.skin', skin], ['wos.skin-tweaks.v1', JSON.stringify({ version: 1, off: {}, preset: 'none', defaultsMigrated: true, machinesHomeMoved: true, ...saved })]]);
  let active = [];
  const window = { WosSkin: { current: skin, families: [], familyOf: () => '' }, WosSkinHost: { personalState: { ready: false }, get tweakState() { return active; }, loadTweaks: async ids => { active = ids; } }, addEventListener() {}, dispatchEvent() {} };
  vm.runInNewContext(read('web/core/experience.js'), { window, setTimeout, document: { baseURI: 'https://wizard.test/wizard-os-home/', addEventListener() {}, documentElement: { dataset: { skin } } }, Event, URL, AbortSignal, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, fetch: async url => ({ ok: true, json: async () => JSON.parse(read('web/' + url.pathname.split('/wizard-os-home/')[1])) }) });
  await window.WosExperience.refresh();
  return { active, mix: JSON.parse(storage.get('wos.skin-tweaks.v1')).mix || {} };
}

test("Miguel's device keeps his layout once; Dark alone brings none; an explicit off stays off", async () => {
  const his = await boot('obsidian-light', { mix: { 'miguel/model-pills': true } });
  assert.ok(his.active.includes('miguel/layout'), 'his device keeps the layout');
  const dark = await boot('obsidian', { mix: {} });
  assert.ok(!dark.active.includes('miguel/layout'), 'picking Dark with no Miguel tweaks changes no layout');
  const other = await boot('nebula', { mix: { 'miguel/model-pills': true } });
  assert.ok(!other.active.includes('miguel/layout'), 'a James skin is not migrated');
  const off = await boot('landscapes', { mix: { 'miguel/model-pills': true, 'miguel/layout': false } });
  assert.ok(!off.active.includes('miguel/layout'), 'explicit off wins');
  const done = await boot('landscapes', { mix: { 'miguel/model-pills': true }, miguelLayoutMoved: true });
  assert.ok(!done.active.includes('miguel/layout'), 'migration runs once');
});
