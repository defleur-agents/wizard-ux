// Interface copy describes Wizard, not its developers. Package IDs/authors remain storage/trust contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const forbidden = /\b(?:miguel|oscar|jan|novaire(?:cito)?|nolan|robert|james|archimedes)\b|\b(?:designed|developed|built|made|created)\s+by\b|\b(?:credits?|contributors?|authors?)\b|\bthe boss[’']s\b/i;
const clean = (text, label) => assert.doesNotMatch(String(text ?? ''), forbidden, label);
const between = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `source anchors: ${start} → ${end}`);
  return source.slice(a, b);
};
const copyFields = (items, fields, label) => {
  assert.ok(items.length > 0, `${label} inventory is nonempty`);
  for (const item of items) for (const field of fields) clean(item[field], `${label} ${item.id}.${field}`);
};

// Evaluate the real declarations, not a line-shaped regex; multiline fields and escaped strings are covered.
test('skin/family names and descriptions never credit a contributor', () => {
  const source = read('web/core/skins.js');
  const families = vm.runInNewContext(between(source, '  const FAMILIES =', '  const LAST =') + '; FAMILIES');
  const skins = vm.runInNewContext('const T = o => o;\n' + between(source, '  const SKINS =', '  const FACES =') + '; SKINS');
  copyFields(families, ['name', 'who', 'description', 'credit', 'author'], 'family');
  copyFields(skins, ['name', 'who', 'description', 'credit', 'author'], 'skin');
  // Explicitly preserve opaque identifiers; never globally strip names out of source or persisted state.
  assert.ok(families.some(f => f.id === 'novairecito'));
  assert.ok(families.some(f => f.tweaks === 'miguel'));
});

test('layout entries expose functional descriptions, not developer credits', () => {
  const layouts = vm.runInNewContext(between(read('web/core/skin-host.js'), '  const LAYOUTS =', '  const VIEW_LAYOUTS =') + '; LAYOUTS');
  copyFields(layouts, ['name', 'desc', 'credit', 'author'], 'layout');
  for (const layout of layouts) assert.ok(!Object.hasOwn(layout, 'credit'), `${layout.id}: no credit channel`);
  const desktopViews = between(read('web/core/experience.js'), '    get desktopViews()', '    chooseDesktopView(');
  assert.doesNotMatch(desktopViews, /\bcredit\b|\bauthor\b/);
  assert.match(desktopViews, /desc: l\?\.desc/);
});

const manifests = (dir = 'web/tweaks') => readdirSync(new URL(dir + '/', root), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? manifests(`${dir}/${e.name}`) : e.name === 'manifest.json' ? [`${dir}/${e.name}`] : []);
test('all tweak manifest display names and descriptions are credit-free (internal author/id allowed)', () => {
  const files = manifests();
  assert.ok(files.length > 0);
  for (const file of files) {
    const manifest = JSON.parse(read(file));
    for (const field of ['name', 'description', 'view']) clean(manifest[field], `${file}.${field}`);
    assert.equal(manifest.author, manifest.id.split('/')[0], `${file}: trust identity unchanged`);
  }
});

test('real Settings renderers ignore contributor metadata on both shells, retaining descriptions and device hints', () => {
  const source = read('web/core/settings.js');
  const renderer = between(source, '  const tweakSwitches =', '  const tweakOpts =');
  assert.doesNotMatch(renderer, /\b(?:authorList|tw-by)\b|\.authors\b|\.author\b|\.credit\b/, 'no contributor rendering or author-profile fetch');
  for (const shell of ['phone', 'desktop']) {
    const E = {
      state: { shell, tweaks: [{ id: 'miguel/example', name: 'A useful switch', description: 'A functional description', author: 'Miguel', view: 'Example', shells: [shell], on: true }] },
      desktopViews: shell === 'desktop' ? [{ id: 'ai-apps', name: 'AI apps', desc: 'Chats beside your apps', credit: 'designed by Miguel', author: 'Oscar' }] : [],
      desktopView: 'ai-apps',
      authors() { throw new Error('Settings must not request developer profiles'); },
    };
    const html = vm.runInNewContext(renderer + '\n tweakRows({});', {
      window: { WosExperience: E }, tweakOpts: new Map(), esc: s => String(s),
    });
    // IDs are legitimate attributes, not rendered text. Inspect visible text independently.
    const textNodes = Array.from(html.matchAll(/>([^<>]*)</g), match => match[1]);
    assert.ok(textNodes.length > 0, 'visible text was inspected');
    for (const text of textNodes) clean(text, `${shell} visible Settings copy`);
    assert.match(html, /data-tweak-toggle="miguel\/example"/);
    assert.match(html, /A functional description/);
    assert.match(html, new RegExp(`<small>${shell === 'phone' ? 'Phone' : 'Desktop'} view</small>`));
    if (shell === 'desktop') assert.match(html, /Chats beside your apps/);
  }
});

test('Noir startup branding and accessibility copy name Wizard OS', () => {
  const source = read('web/skins/novairecito/skin.js');
  const label = /setAttribute\('aria-label',\s*('(?:\\.|[^'\\])*')\)/.exec(source);
  const mark = /mark\.append\(\s*('(?:\\.|[^'\\])*')/.exec(source);
  assert.ok(label && mark, 'startup label and mark are covered');
  clean(vm.runInNewContext(label[1]), 'startup accessibility label');
  clean(vm.runInNewContext(mark[1]), 'startup wordmark');
  assert.match(source, /Wizard OS is waking up/);
});

test('copy guard rejects credits but allows plain functional descriptions', () => {
  for (const text of ['Miguel’s skin', 'by Oscar', 'Jan designed it', 'Novaire’s skin', 'NOVAIRECITO OS', 'designed by someone', 'Developer credits', 'The boss’s deck']) {
    assert.throws(() => clean(text, 'mutation'), assert.AssertionError, text);
  }
  for (const text of ['Chats beside your apps', 'Black and white, with the violet orb.', 'Phone view']) clean(text, 'plain copy');
});
