// Pins are a choice (Miguel, 1 Nov 2026): Filter › View › Pins turns off the Pinned section, the menu's Pin and the
// row pin, per device; saved pins stay. Replaces the miguel/hidden-pin tweak (a device that wore it starts with Pins off).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = read('web/core/chats.js');

test('Pins switch sits beside Compact in the Filter sheet and is saved on the device', () => {
  assert.match(src, /data-chpins>Pins\$\{pinsOn\(\) \? '<b>✓<\/b>' : ''\}<\/button>/);
  assert.match(src, /const PINS_KEY = 'wos\.chats\.pins\.v1';/);
  assert.match(src, /localStorage\.setItem\(PINS_KEY, on \? '1' : '0'\)/);
});

test('with Pins off nothing pin-shaped renders, and saved pins are kept', () => {
  assert.match(src, /has: id => pinsOn\(\) && PIN0\.has\(id\)/);
  assert.match(src, /partition: \(rows, keep\) => pinsOn\(\) \? PIN0\.partition\(rows, keep\) : \{ pinned: \[\], rest: rows \}/);
  assert.ok(src.includes('${PIN.on?.() !== false ? `<button type="button" data-part="pin-action" data-rspin>'), 'menu Pin');
  assert.ok(src.includes('${PIN.on?.() !== false ? `<button type="button" data-part="pin-button" class="ch-pin-toggle"'), 'row pin');
  assert.doesNotMatch(src, /PIN0\.(clear|remove)/, 'turning Pins off never deletes pins');
});

test('the hidden-pin tweak is retired into the setting', () => {
  assert.ok(!JSON.parse(read('web/tweaks/catalog.json')).tweaks.includes('miguel/hidden-pin'));
  assert.match(src, /mix\?\.\['miguel\/hidden-pin'\] === true\) localStorage\.setItem\(PINS_KEY, '0'\)/);
});
