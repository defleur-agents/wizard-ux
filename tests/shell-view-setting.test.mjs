// Shell views as two ordinary tweaks (Miguel, 1 Nov 2026, "maximum simplicity"): no Shell view row in Settings any
// more; Miguel's Tweaks list carries "Different shell view - Orb" and "Different shell view - Apps", each a normal
// switch, mutually exclusive (on turns the other off), both off = Desks, the stock shell. Runs the real
// web/core/experience.js and web/core/settings.js together, per device (the tweak mix in wos.skin-tweaks.v1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import vm from 'node:vm';
import { read, fixture } from './fixtures/tweaks.mjs';

const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const VIEWS = ['miguel/orb-shell', 'miguel/apps-home'];
const KEY = 'wos.skin-tweaks.v1';

function box({ shell = 'desktop', storage = new Map() } = {}) {
  let active = [];
  const loads = [];
  const s = { console, Map, Set, Date, String, URL, Event, AbortSignal, CSS: { escape: String }, setTimeout, clearTimeout, setInterval, clearInterval, JSON,
    document: { activeElement: null, documentElement: { dataset: { shell } }, baseURI: 'https://box.test/wizard-os-home/', addEventListener() {}, querySelector: () => null },
    navigator: { userAgent: 'Desktop' }, location: { host: 'box.test', href: 'https://box.test/wizard-os-home/index.html', origin: 'https://box.test' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) } };
  s.window = s;
  s.addEventListener = () => {}; s.dispatchEvent = () => {};
  s.WizCore = { refreshApps: async () => {} };
  s.WizChatsHost = { defaultId: () => 'wizard-chats', installed: () => [] };
  s.WosSkin = { current: 'obsidian-light', list: ['obsidian', 'obsidian-light'], families: [], familyOf: () => null };
  s.WosSkinHost = { personalState: { ready: false }, get tweakState() { return active; }, layout: 'classic', setLayout() {}, loadTweaks: async ids => { active = [...ids]; loads.push([...ids]); } };
  s.fetch = async url => {
    const path = String(url.pathname || url).split('/wizard-os-home/')[1] || '';
    if (/^tweaks\/|^core\/slots\.json/.test(path)) return { ok: true, status: 200, json: async () => JSON.parse(read('web/' + path.replace(/\?.*$/, ''))) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  vm.runInNewContext(read('web/core/experience.js'), s);
  vm.runInNewContext(read('web/core/settings.js'), s);
  const root = { innerHTML: '', scrollTop: 0, dataset: {}, classList: { add() {} }, contains: () => false, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  const view = s.WosSettings.mount(root, { shell, live: { ok: true, onChange: () => () => {} } });
  // a tap on a Look row, as the click handler passes it to the Look feature
  const on = (attr, dataset) => view.dispatch({ classList: { contains: () => false }, closest: sel => sel === '[data-settings-feature]' ? { dataset: { settingsFeature: 'look' } } : sel === attr ? { dataset } : null });
  const tap = id => on('[data-tweak-toggle]', { tweakToggle: id });
  const views = () => active.filter(id => VIEWS.includes(id));
  return { s, root, view, tap, storage, views, active: () => [...active], loads, E: s.WosExperience };
}
// the switches as rendered: [id, name, on]
const switches = html => [...html.matchAll(/data-tweak-toggle="([^"]+)" role="switch" aria-checked="(true|false)"[^>]*><span class="st-tx"><b>([^<]+)<\/b>/g)].map(m => [m[1], m[3], m[2] === 'true']);
// in VIEWS order (Orb, Apps) whatever the list's order (one flat A-to-Z list since main's #820)
const viewSwitches = html => VIEWS.map(v => switches(html).find(([id]) => id === v)).filter(Boolean);
const look = async b => { b.view.focus('look'); await tick(); return b.root.innerHTML; };

for (const shell of ['desktop', 'phone']) test(`${shell}: no Shell view row; Miguel's Tweaks list has both shell views as plain switches, off`, async () => {
  const b = box({ shell }); await b.E.refresh();
  const html = await look(b);
  assert.doesNotMatch(html, /Shell view|data-shellview|sv-seg|sv-group/, 'the Settings row is gone');
  assert.deepEqual(viewSwitches(html), [['miguel/orb-shell', 'Different shell view - Orb', false], ['miguel/apps-home', 'Different shell view - Apps', false]]);
  // one flat list (Miguel, 1 Nov 2026): no author sections, each row says who made it
  assert.doesNotMatch(html, /tw-author|data-tweakauthor|All of /, 'no per-author quick buttons');
  for (const id of VIEWS) assert.match(html, new RegExp(`data-tweak-toggle="${id}"[^]*?class="tw-by">${shell === 'desktop' ? 'Desktop' : 'Phone'} view · by (Miguel|miguel)<`), id + ' labelled by Miguel, for this device type');
