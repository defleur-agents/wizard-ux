// For everyone keeps feature switches off; For testers turns them on in the Wizard OS Tracker app (Miguel, 7 Nov 2026).
// The channel comes from the App Manager (core/os-updates.js → wos:channel), kept per device in wos.channel.v1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 0));
const MIX = { 'miguel/send-and-go': true, 'wizard/app-borders': true };

function box(channel) {
  const storage = new Map([['wos.skin', 'obsidian'], ['wos.skin-tweaks.v1', JSON.stringify({ version: 1, off: {}, preset: 'none', mix: MIX, machinesHomeMoved: true, miguelLayoutMoved: true })]]);
  if (channel) storage.set('wos.channel.v1', channel);
  const listeners = {}; let active = [];
  const window = { WosSkin: { current: 'obsidian', families: [], familyOf: () => 'mizel' }, WosSkinHost: { personalState: { ready: false }, get tweakState() { return active; }, loadTweaks: async ids => { active = ids; } },
    addEventListener: (k, f) => { (listeners[k] ||= []).push(f); }, dispatchEvent() {} };
  vm.runInNewContext(read('web/core/experience.js'), { window, setTimeout, document: { baseURI: 'https://wizard.test/wizard-os-home/', addEventListener() {} }, Event, URL, AbortSignal,
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    fetch: async url => ({ ok: true, json: async () => JSON.parse(read('web/' + url.pathname.split('/wizard-os-home/')[1])) }) });
  const emit = (k, detail) => Promise.all((listeners[k] || []).map(f => f({ detail })));
  return { E: window.WosExperience, storage, emit, active: () => Array.from(active) };
}
const defaults = JSON.parse(read('web/tweaks/catalog.json')).defaults || [];

test('For everyone (stable): experimental switches load off, are marked locked and cannot be switched; built-ins stay', async () => {
  const b = box('stable'); await b.E.refresh();
  assert.deepEqual(b.active().filter(id => !defaults.includes(id)), [], 'no experimental tweak runs');
  for (const id of defaults) assert.ok(b.active().includes(id), id + ' (built in) still runs');
  const s = b.E.state;
  assert.equal(s.locked, true);
  for (const t of s.tweaks.filter(t => !t.builtin && !t.view)) { assert.equal(t.on, false, t.id); assert.equal(t.locked, true, t.id); }
  for (const t of s.tweaks.filter(t => t.view)) assert.notEqual(t.locked, true, t.id + ': views are not feature switches');
  await assert.rejects(() => b.E.toggle('miguel/send-and-go'), /for testers/i);
  assert.deepEqual(JSON.parse(b.storage.get('wos.skin-tweaks.v1')).mix, MIX, 'the owner\'s choices are kept for For testers');
});

test('For testers (latest) and an unknown channel run the saved switches as before', async () => {
  for (const ch of ['latest', undefined]) {
    const b = box(ch); await b.E.refresh();
    assert.deepEqual(b.active().filter(id => !defaults.includes(id)).sort(), Object.keys(MIX).sort(), String(ch));
    assert.equal(b.E.state.locked, false);
  }
});

test('the channel event re-applies: switching to For everyone turns them off, back to For testers brings them back', async () => {
  const b = box('latest'); await b.E.refresh();
  await b.emit('wos:channel', { channel: 'stable' }); await b.E.whenReady(); await tick();
  assert.equal(b.storage.get('wos.channel.v1'), 'stable');
  assert.deepEqual(b.active().filter(id => !defaults.includes(id)), []);
  await b.emit('wos:channel', { channel: 'latest' }); await b.E.whenReady(); await tick();
  assert.deepEqual(b.active().filter(id => !defaults.includes(id)).sort(), Object.keys(MIX).sort());
  await b.emit('wos:channel', { channel: 'nightly' });
  assert.equal(b.storage.get('wos.channel.v1'), 'latest', 'an unknown channel is ignored');
});

test('os-updates tells the shell the box channel after every verified read and channel change', () => {
  const src = read('web/core/os-updates.js');
  assert.match(src, /if \(\['stable', 'latest'\]\.includes\(d\.channel\)\) try \{ window\.dispatchEvent\(new CustomEvent\('wos:channel', \{ detail: \{ channel: d\.channel \} \}\)\); \} catch \(_\) \{\}/);
  assert.match(src, /window\.dispatchEvent\(new CustomEvent\('wos:channel', \{ detail: \{ channel: st\.channel \|\| chan \} \}\)\)/);
});

test('Settings has no feature switches any more: it points to the Wizard OS Tracker app (and says For testers on For everyone)', () => {
  const s = read('web/core/settings.js'), rows = s.slice(s.indexOf('  function tweakRows('), s.indexOf('  let authorList = null;'));
  assert.match(rows, /\[\.\.\.shown\]\.filter\(t => t\.view\)/, 'only views keep a switch in Settings');
  assert.match(rows, /Turn new features on or off in the Wizard OS Tracker app\./);
  assert.match(rows, /New features are for testers: choose For testers in About &amp; updates, then turn them on in the Wizard OS Tracker app\./);
  assert.doesNotMatch(rows, /<h4>Tweaks<\/h4>/);
  assert.match(s, /'data-chat-tweak', s\.busy \|\| !here \|\| !!t\.locked, name\)/, 'a chat tweak card cannot flip a locked switch');
});
