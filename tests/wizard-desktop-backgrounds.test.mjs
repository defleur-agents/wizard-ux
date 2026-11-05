import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const KEY = 'wos.skin.wallpaper.wizard.desktop';
function boot(saved = {}, shell = 'desktop') {
  const storage = new Map(Object.entries(saved)), props = new Map();
  const root = { dataset: { shell }, style: { setProperty: (k,v) => props.set(k,v), removeProperty: k => props.delete(k) } };
  const ctx = { document: { documentElement: root, readyState: 'loading', addEventListener() {}, querySelector: () => null, createElement: () => ({}) }, localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }, addEventListener() {}, dispatchEvent() {}, CustomEvent: class {}, requestAnimationFrame() {}, matchMedia: () => ({ matches: false }) };
  ctx.window = ctx; vm.runInNewContext(read('web/core/skins.js'), ctx);
  return { S: ctx.WosSkin, storage, root, props };
}

test('fresh and existing Wizard desktops retain living canvas, regardless of Mizel wallpaper', () => {
  for (const skin of ['nebula','grove','tide','ember','signal']) {
    const b = boot({ 'wos.skin': skin, 'wos.skin.wallpaper': 'lake' });
    assert.equal(b.S.wizardBackgrounds, true); assert.equal(b.S.wallpaper, 'living');
    assert.equal(b.root.dataset.imageBackground, undefined); assert.equal(b.storage.has(KEY), false);
  }
});

test('Wizard uses the shared catalogue and keeps color, reload persistence, family isolation and reset', () => {
  const b = boot({ 'wos.skin': 'nebula' });
  assert.deepEqual(Array.from(b.S.wallpapers, w=>w.id), ['landscapes','lake','valley','moonrise','sea','clouds','glass']);
  b.S.setWallpaper('lake'); assert.equal(b.S.current,'nebula'); assert.equal(b.storage.get(KEY),'lake');
  assert.equal(b.root.dataset.imageBackground,''); assert.equal(b.props.get('--sk-space'),'0.000');
  b.S.set('grove'); assert.equal(b.S.wallpaper,'lake');
  b.S.set('landscapes'); assert.equal(b.S.wallpaper,'landscapes'); b.S.setWallpaper('sea');
  b.S.set('tide'); assert.equal(b.S.wallpaper,'lake');
  const again=boot(Object.fromEntries(b.storage)); assert.equal(again.S.wallpaper,'lake');
  again.S.setWallpaper('living'); assert.equal(again.storage.has(KEY),false); assert.equal(again.root.dataset.imageBackground,undefined);
  assert.throws(()=>again.S.setWallpaper('not-a-scene'),/Unknown background/);
});

test('phone Wizard ignores a saved desktop image and has no new background picker; Mizel still works', () => {
  const b=boot({ 'wos.skin':'nebula', [KEY]:'lake' },'phone');
  assert.equal(b.S.wizardBackgrounds,false); assert.equal(b.S.wallpaperable,false);
  assert.equal(b.root.dataset.imageBackground,undefined); assert.equal(b.props.get('--sk-space'),'1.000');
  b.S.set('landscapes-light'); assert.equal(b.S.wallpaperable,true); b.S.setWallpaper('clouds'); assert.equal(b.S.wallpaper,'clouds');
  assert.equal(b.storage.get(KEY),'lake');
});

test('invalid saved desktop images fall back without changing Mizel; renderer and picker are shared', () => {
  assert.equal(boot({[KEY]:'bogus'}).S.wallpaper,'living');
  const s=read('web/core/settings.js'), r=read('web/core/skins.js');
  assert.match(s,/S\.wizardBackgrounds \|\| twinned\(S, family\)/);
  assert.match(s,/wizard \? card\('living', 'Living canvas', lk\)/);
  assert.match(r,/image \? 'landscapes' : SKINS\[i\]\.id/);
  assert.match(r,/image \? wizardWall : wall/);
  const css=read('web/core/skins.css');
  assert.match(css,/html\[data-shell="desktop"\]\[data-image-background\] :is\(\.win/);
  assert.match(css,/background: var\(--wz-panel, var\(--wz-base, var\(--bg/);
  assert.match(read('web/layouts/ai-apps/desktop.css'),/\[data-image-background\] \{\s*--aad-main: var\(--wz-panel, var\(--aad-canvas\)\)/);
});
