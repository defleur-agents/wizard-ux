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
test('historical bridge rejects the exact synthetic English control', () => {
  const old = install.replace(' && !chromeLabels.includes(t)', '').replace('mapping[t] ?? t', 'mapping[t]');
  const context = {window: {}, setTimeout() {}};
  vm.runInNewContext('(' + old + ')', context)({jpeg:'',read:{lines:[]},mapping:{},chromeLabels:['Copy translation']});
  assert.throws(() => context.window.ScreenNative.translate('1','["Copy translation"]','English'), /No recorded inference/);
});
