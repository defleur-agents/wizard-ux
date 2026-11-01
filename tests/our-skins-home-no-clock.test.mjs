import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Miguel's layout rules sit behind his miguel/layout tweak (a zero-specificity :where gate); read them ungated.
const ungate = s => s.replaceAll(':where([data-tweaks~="miguel/layout"])', '');
const read = f => ungate(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));

test('our skins hide the Home date and clock', () => {
  assert.match(read('../web/skins/obsidian/skin.css'), /html\[data-skin\^="obsidian"\] :is\(\.home-date, \.home-time\) \{ display: none; \}/);
  assert.match(read('../web/skins/landscapes/skin.css'), /html\[data-skin\^="landscapes"\] :is\(\.home-date, \.home-time\) \{ display: none; \}/);
});

test('James skins and core CSS keep the Home date and clock', () => {
  for (const f of ['../web/styles.css', '../web/core/skins.css', '../web/desktop/desktop.css']) assert.doesNotMatch(read(f), /\.home-(date|time)[^{]*\{[^}]*display:\s*none/, f);
});
