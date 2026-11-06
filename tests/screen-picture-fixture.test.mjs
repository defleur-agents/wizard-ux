// Tiny bridge-only regression. This does not launch a browser or claim product acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const text = fs.readFileSync(new URL('../tools/qa-screen-picture-translate.cjs', import.meta.url), 'utf8');
const start = text.indexOf('await page.addInitScript(') + 'await page.addInitScript('.length;
const end = text.indexOf('\n        }, {jpeg:', start) + '\n        }'.length;
const install = text.slice(start, end);
function bridge() {
  const replies = [], context = {window: {}, S: {translated: (id, value) => replies.push(value)}, setTimeout: fn => fn()};
  const setup = vm.runInNewContext('(' + install + ')', context);
  setup({jpeg: '', read: {lines: []}, mapping: {'ข้าจะไปออกรบ': "I'm heading to battle"}, chromeLabels: ['Copy translation','Select text','Ask Wizard']});
  return {translate: context.window.ScreenNative.translate, replies};
}
test('verdict matchers accept the real multiline pill and reject unrelated verdicts', () => {
  const patterns = [...text.matchAll(/\/(Already[^/]+)\//g)].map(m => new RegExp(m[1]));
  assert.equal(patterns.length, 1, 'only the installed87 baseline is expected to give the false verdict');
  for (const pattern of patterns) {
    assert.ok(pattern.test('Already in\nEnglish\n▾'));
    assert.ok(pattern.test('Already in English'));
    assert.ok(!pattern.test('Thai → English'));
  }
});
test('synthetic English chrome returns identity, without inventing inference', () => {
  const h = bridge(); h.translate('1', JSON.stringify(['Copy translation','Select text','Ask Wizard']), 'English');
  assert.equal(JSON.stringify(h.replies[0].items), JSON.stringify(['Copy translation','Select text','Ask Wizard']));
});
test('recorded Thai mapping is preserved', () => {
  const h = bridge(); h.translate('1', JSON.stringify(['ข้าจะไปออกรบ']), 'English');
  assert.equal(h.replies[0].items[0], "I'm heading to battle");
});
test('unrecorded input and different target still refuse', () => {
  const h = bridge();
  assert.throws(() => h.translate('1', '["unrecorded"]', 'English'), /No recorded inference/);
  assert.throws(() => h.translate('1', '["Copy translation"]', 'French'), /No recorded inference/);
});
test('capture waits for a stable, fully onscreen sheet after its transform finishes', () => {
  const start = text.indexOf('function sheetCaptureReady()');
  const end = text.indexOf('\n}',start) + 2;
  let bounds = {left:8,top:585,right:352,bottom:950,width:344,height:365}, transform = 'matrix(1, 0, 0, 1, 0, 200)';
  const context = {window:{},innerWidth:360,innerHeight:780,
    document:{querySelector:()=>({getBoundingClientRect:()=>bounds,classList:{contains:()=>true}})},
    getComputedStyle:()=>({transform})};
  const ready = vm.runInNewContext('(' + text.slice(start,end) + ')',context);
  for(let i=0;i<5;i++) assert.equal(ready(),false,'transitional clipped frame must fail');
  transform = 'none';
  assert.equal(ready(),false,'stable but offscreen sheet must fail');
  bounds = {...bounds,top:383,bottom:748};
  assert.equal(ready(),false,'first final frame is insufficient');
  assert.equal(ready(),false);
  assert.equal(ready(),false);
  assert.equal(ready(),true,'three unchanged frame intervals after settling');
  bounds = {...bounds,top:382,bottom:747};
  assert.equal(ready(),false,'movement resets stability');
});
test('historical bridge rejects the exact synthetic English control', () => {
  const old = install.replace(' && !chromeLabels.includes(t)', '').replace('mapping[t] ?? t', 'mapping[t]');
  const context = {window: {}, setTimeout() {}};
  vm.runInNewContext('(' + old + ')', context)({jpeg:'',read:{lines:[]},mapping:{},chromeLabels:['Copy translation']});
  assert.throws(() => context.window.ScreenNative.translate('1','["Copy translation"]','English'), /No recorded inference/);
});
test('replay contract is the overlay: no panel expectation, geometry required, no invented place', () => {
  assert.doesNotMatch(text, /trans\?\.text|state\.pic\.some|scrollTop = sel\.scrollHeight/, 'the old panel contract is gone');
  assert.match(text, /hasGeometry = Array\.isArray\(live\.read\.boxes\)/);
  assert.match(text, /\{boxes: _drop, \.\.\.linesOnly\} = live\.read/, 'lines-only phase replays the same recording without boxes');
  assert.match(text, /geometry recording present \(overlay acceptance requires it\)', false/);
  assert.match(text, /no place invented/);
  assert.match(text, /'--wz-text'/); assert.doesNotMatch(text, /--wz-ink/);
});
