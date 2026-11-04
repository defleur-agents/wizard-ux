// Wizard OS backgrounds (Miguel, 4 Nov 2026): Landscapes can show the official hat instead of the photos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const skins = read('web/core/skins.js'), settings = read('web/core/settings.js');

test('the backgrounds use the supplied designer hat, never a redraw', () => {
  assert.match(skins, /SRC: '\/wizard-os-home\/brand\/wizard-mark-purple\.png'/);
  assert.ok(existsSync(new URL('../web/brand/wizard-mark-purple.png', import.meta.url)));
});

test('Landscapes stays the default and every Wizard OS option is listed', () => {
  for (const id of ['landscapes', 'wizard', 'wizard-rise', 'wizard-pattern']) assert.match(skins, new RegExp(`id: '${id}'`));
  assert.match(skins, /: 'landscapes'; \} catch \(_\) \{ return 'landscapes'; \}/);
  assert.match(skins, /if \(wall !== 'landscapes'\) \{ c\.drawImage\(WIZ\.get\(wall, this\.LIGHT, W, H\)/);
  assert.match(skins, /setWallpaper\(id\) \{/);
});

test('the Background picker sits in Look, only on the Landscapes palettes', () => {
  assert.match(settings, /wallpaper: 'appearance'/);
  assert.match(settings, /register\(\{ id: 'wallpaper'/);
  assert.match(settings, /if \(!S\.wallpaperable\) return '';/);
  assert.match(skins, /get wallpaperable\(\) \{ return \/\^landscapes\/\.test/);
});
