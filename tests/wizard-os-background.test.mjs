// Wizard OS backgrounds (Miguel, 4 Nov 2026): Landscapes can show the official hat instead of the photos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const skins = read('web/core/skins.js'), settings = read('web/core/settings.js');

test('every scene ships baked for night and day, desktop and phone', () => {
  assert.match(skins, /\/wizard-os-home\/core\/skins\/wizard\/\$\{file\}\.webp/);
  for (const id of ['lake', 'valley', 'moonrise', 'sea', 'clouds', 'glass']) for (const tone of ['', '-light']) for (const shape of ['wide', 'tall', 'thumb'])
    assert.ok(existsSync(new URL(`../web/core/skins/wizard/${id}${tone}-${shape}.webp`, import.meta.url)), `${id}${tone}-${shape}`);
  assert.ok(existsSync(new URL('../tools/brand/wallpapers.html', import.meta.url)), 'generator kept for provenance');
});

test('Landscapes stays the default and every Wizard OS option is listed', () => {
  for (const id of ['landscapes', 'lake', 'valley', 'moonrise', 'sea', 'clouds', 'glass']) assert.match(skins, new RegExp(`id: '${id}'`));
  assert.match(skins, /: 'landscapes'; \} catch \(_\) \{ return 'landscapes'; \}/);
  assert.match(skins, /if \(wall !== 'landscapes'\) \{ const w = WIZ\.get\(wall, this\.LIGHT, W, H\)/);
  assert.match(skins, /setWallpaper\(id\) \{/);
});

test('the Background picker sits in Look, only on the Landscapes palettes', () => {
  assert.match(settings, /wallpaper: 'appearance'/);
  assert.match(settings, /register\(\{ id: 'wallpaper'/);
  assert.match(settings, /if \(!S\.wallpaperable\) return '';/);
  assert.match(skins, /get wallpaperable\(\) \{ return \/\^landscapes\/\.test/);
});

test('wallpaper generator dispatches only explicit scenes, never query-selected methods', () => {
 const page=read('tools/brand/wallpapers.html');
 const callback=page.slice(page.indexOf('hat.onload ='),page.indexOf('</script>'));
 for(const C of ['summit','lake','constellation','silk','glass','constructor','toString','__proto__','hasOwnProperty','bogus']){
  const calls=[],R={};for(const scene of ['summit','lake','constellation','silk','glass'])R[scene]=light=>calls.push([scene,light]);
  const context={hat:{},Q:new URLSearchParams('light=1'),C,R,document:{title:''}};
  vm.runInNewContext(callback+';hat.onload()',context);
  if(['summit','lake','constellation','silk','glass'].includes(C)){assert.deepEqual(calls,[[C,true]]);assert.equal(context.document.title,'done')}
  else {assert.deepEqual(calls,[]);assert.equal(context.document.title,'Invalid scene')}
 }
});
