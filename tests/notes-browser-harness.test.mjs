import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('Notes browser entry matches the production Alt+KeyO apps shortcut', () => {
  const desktop = read('../web/desktop/desktop.js');
  const harness = read('./qa-notes-sigil.cjs');
  assert.match(desktop, /if \(alt && !shift && code === 'KeyO'\).*palToggle\('apps'\)/);
  assert.match(harness, /page\.keyboard\.press\('Alt\+o'\)/);
  assert.doesNotMatch(harness, /keyboard\.press\('(?:Control|Meta)\+o'\)/);
  assert.match(harness, /locator\('#palette:not\(\[hidden\]\)'\)\.waitFor/);
  assert.match(harness, /has:page\.locator\('\.[n]m',\{hasText:\/\^Notes\$\//);
  assert.match(harness, /\['candidate','baseline'\]/);
  assert.match(harness, /report\.cases\.length,BASELINE\?12:6/);
});
