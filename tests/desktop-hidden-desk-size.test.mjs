// Windows on desks out of sight are tiled at the size they will show at, so their apps load at a real size.
// File Browser (Files) loaded at 0×0 on a background desk and showed an empty folder when its desk came forward.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const js = readFileSync(new URL('../web/desktop/desktop.js', import.meta.url), 'utf8');
const layout = js.match(/function layout\(\) \{([\s\S]*?)\n  \}\n  function tile\(/)?.[1] || '';
const tile = js.match(/function tile\(d, W_, H_, full, maxWidth, front\) \{([\s\S]*?)\n  \}\n/)?.[1] || '';

test('every desk with windows is tiled, not only the one in front', () => {
  assert.ok(layout && tile, 'layout() hands geometry to tile()');
  assert.match(layout, /const sizes = ws\.map\(\(dk, i\) => dk\.wins\.length \? \[wsEl\(i\)\.clientWidth, wsEl\(i\)\.clientHeight\] : null\)/,
    'all desks are measured before any window is moved (one reflow)');
  assert.match(layout, /ws\.forEach\(\(dk, i\) => \{ if \(sizes\[i\]\) tile\(/);
  assert.doesNotMatch(layout, /if \(!n \|\| homeOpen\) return/, 'Home showing no longer leaves windows unsized');
});

test('only the desk in front gets the full-screen chrome', () => {
  assert.match(layout, /document\.body\.classList\.toggle\('desktop-fullscreen', full\)/);
  assert.match(layout, /i === cur && !homeOpen \? full : !!dk\.mono, maxWidth, i === cur && !homeOpen\)/);
  assert.match(tile, /if \(front\) el\.classList\.toggle\('full', full && id === d\.focus\)/);
  assert.match(tile, /Object\.assign\(el\.style, \{ left: r\[0\] \+ 'px', top: r\[1\] \+ 'px', width: r\[2\] \+ 'px', height: r\[3\] \+ 'px' \}\)/);
});
