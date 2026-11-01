// Settings › Look › Shell view (Miguel, 1 Nov 2026): the Desks | Orb | Apps choice left the desktop bar and the top of
// phone Home for one segmented row in Settings › Look, between the skin grid and the tweaks, on both shells. Runs the
// real web/core/experience.js and web/core/settings.js together: three options, mutually exclusive, per device (the
// tweak mix in wos.skin-tweaks.v1, so it survives a reload), each choice wears the right layout, Desks = stock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import vm from 'node:vm';
import { read, fixture } from './fixtures/tweaks.mjs';

const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const VIEWS = ['miguel/orb-shell', 'miguel/apps-home'];

function box({ shell = 'desktop', storage = new Map() } = {}) {
  let active = [];
  const loads = [];
  const s = { console, Map, Set, Date, String, URL, Event, AbortSignal, CSS: { escape: String }, setTimeout, clearTimeout, setInterval, clearInterval, JSON,
    document: { activeElement: null, baseURI: 'https://box.test/wizard-os-home/', addEventListener() {}, querySelector: () => null },
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
  // a tap on one option, as the click handler passes it to the Look feature
  const tap = id => view.dispatch({ classList: { contains: () => false }, closest: sel => sel === '[data-settings-feature]' ? { dataset: { settingsFeature: 'look' } }
    : sel === '[data-shellview]' ? { dataset: { shellview: id }, getAttribute: () => String((s.WosExperience.view || '') === id) } : null });
  return { s, root, view, tap, storage, active: () => [...active], loads, E: s.WosExperience };
}
const options = html => [...(html.match(/<div class="st-seg sv-seg" role="radiogroup" aria-labelledby="sv-label">([^]*?)<\/div>/)?.[1] || '').matchAll(/data-shellview="([^"]*)" role="radio" aria-checked="(true|false)"[^>]*>([^<]+)</g)].map(m => [m[1], m[3], m[2] === 'true']);

for (const shell of ['desktop', 'phone']) test(`${shell}: Settings › Look shows Shell view, Desks | Orb | Apps, between the skin grid and the tweaks`, async () => {
  const b = box({ shell }); await b.E.refresh(); b.view.focus('look'); await tick();
  const html = b.root.innerHTML;
  assert.match(html, /<h4 id="sv-label">Shell view<\/h4>/);
  assert.deepEqual(options(html), [['', 'Desks', true], ['miguel/orb-shell', 'Orb', false], ['miguel/apps-home', 'Apps', false]], 'Desks is stock and lit on a fresh device');
  const at = k => html.indexOf(k);
  assert.ok(at('class="skp-all') < at('Shell view') && at('Shell view') < at('<h4>Tweaks</h4>'), 'its own row: after the skins, before the tweaks');
  // the views are not also tweak switches (one place to choose), and no switch tweak is left
  assert.doesNotMatch(html, /data-tweak-toggle="miguel\/(orb-shell|apps-home|orb-switch)"/);
  assert.ok(!b.active().some(id => VIEWS.includes(id)), 'Desks = no view tweak loads');
});

test('choosing each option wears that view alone, per device (the tweak mix), and survives a reload', async () => {
  const storage = new Map();
  const b = box({ storage }); await b.E.refresh();
  b.tap('miguel/orb-shell'); await tick();
  assert.deepEqual(b.active().filter(id => VIEWS.includes(id)), ['miguel/orb-shell']);
  b.view.focus('look'); assert.deepEqual(options(b.root.innerHTML).map(o => o[2]), [false, true, false], 'Orb lit');
  const n = b.loads.length; b.tap('miguel/apps-home'); await tick();
  assert.deepEqual(b.active().filter(id => VIEWS.includes(id)), ['miguel/apps-home'], 'Orb off and Apps on together');
  assert.equal(b.loads.length, n + 1, 'one reload of the tweaks per choice');
  // a reload on the same device keeps Apps
  const again = box({ storage }); await again.E.refresh();
  assert.deepEqual(again.active().filter(id => VIEWS.includes(id)), ['miguel/apps-home']);
  again.view.focus('look'); assert.deepEqual(options(again.root.innerHTML).map(o => o[2]), [false, false, true]);
  again.tap(''); await tick();
  assert.ok(!again.active().some(id => VIEWS.includes(id)), 'Desks turns every view off');
  // switching one view on as a tweak elsewhere (api.settings.toggleTweak) still keeps them exclusive
  await again.E.toggle('miguel/orb-shell'); await again.E.toggle('miguel/apps-home');
  assert.deepEqual(again.active().filter(id => VIEWS.includes(id)), ['miguel/apps-home']);
  // the per-author quick button never turns the views on together
  await again.E.chooseView(''); await again.E.chooseAuthor('miguel');
  assert.ok(!again.active().some(id => VIEWS.includes(id)), 'All of Miguel’s leaves the shell view alone');
});

for (const shell of ['desktop', 'phone']) test(`${shell}: each choice wears the right layout; Desks is the stock shell`, async () => {
  for (const [id, layout] of [['', 'classic'], ['miguel/orb-shell', 'orb'], ['miguel/apps-home', 'apps']]) {
    const b = box({ shell }); await b.E.refresh(); if (id) { b.tap(id); await tick(); }
    const f = fixture({ shell });
    await f.host.loadTweaks(b.active().filter(t => VIEWS.includes(t)), f.slots, { teamAuthors: ['miguel'] });
    await new Promise(r => setTimeout(r, 20));
    // the Orb tweak wears the orb layout on both shells (the phone hands it to phone.js)
    assert.equal(f.host.layout, layout, `${shell} ${id || 'Desks'}`);
    await f.clear();
  }
});

test('the desktop bar and the top of phone Home no longer carry the switch; the bar centre is the clock again', () => {
  assert.ok(!existsSync(new URL('../web/tweaks/miguel/orb-switch', import.meta.url)), 'the switch tweak is gone');
  const cat = JSON.parse(read('web/tweaks/catalog.json')), me = JSON.parse(read('web/tweaks/miguel/profile.json'));
  assert.ok(!cat.tweaks.includes('miguel/orb-switch') && !me.tweaks.includes('miguel/orb-switch'));
  for (const f of ['web/layouts/orb/layout.js', 'web/layouts/orb/phone.js', 'web/layouts/apps/layout.js', 'web/layouts/apps/desktop.js', 'web/layouts/orb/layout.css', 'web/layouts/apps/layout.css', 'web/layouts/apps/chrome.css'])
    assert.doesNotMatch(read(f), /os-switch|os-side/, f);
  // the clock steps aside only while bar-center holds something; nothing ships into it now
  assert.match(read('web/desktop/desktop.css'), /\.bar-center:not\(:empty\) ~ #clock/);
  // Settings stays reachable in every view: neither view hides the gear
  for (const f of ['web/layouts/orb/layout.css', 'web/layouts/apps/layout.css', 'web/layouts/apps/chrome.css', 'web/layouts/orb/phone.css', 'web/tweaks/miguel/orb-shell/tweak.css', 'web/tweaks/miguel/apps-home/tweak.css'])
    assert.doesNotMatch(read(f).replace(/\/\*[\s\S]*?\*\//g, ''), /#settingsBtn[^{]*\{[^}]*display:\s*none|\.gear[^{]*\{[^}]*display:\s*none/, f);
  // the setting is generic: core names no Miguel view, a tweak declares `view` in its manifest
  for (const f of ['web/core/settings.js', 'web/core/experience.js']) assert.doesNotMatch(read(f), /orb-shell|apps-home/, f);
});
