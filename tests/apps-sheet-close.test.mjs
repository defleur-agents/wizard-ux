import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('phone Apps sheet exposes its visible grip as the shared close action', () => {
  const html = read('web/index.html');
  const css = read('web/styles.css');
  const js = read('web/app.js');

  assert.match(html, /<button[^>]*class="sheet-grip"[^>]*data-launcher-close[^>]*aria-label="Close Apps"/);
  assert.match(css, /#launcher > \.sheet-grip \{[^}]*padding: 20px 48px;[^}]*background-clip: content-box;[^}]*touch-action: manipulation;/);
  assert.match(js, /launcher\.addEventListener\('click',[\s\S]*?closest\('\[data-launcher-close\]'\)[\s\S]*?closeSheets\(\)/);
});
