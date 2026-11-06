// Execute the shipped Screen page, with a model-free DOM/native bridge double.
// Browser/native gates remain separate; no personal screenshot is committed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const page = fs.readFileSync(process.env.SCREEN_PAGE_SOURCE || new URL('../android/app/src/main/assets/assist/screen.html', import.meta.url), 'utf8');
const scriptStart = page.indexOf('<script>') + '<script>'.length;
const scriptEnd = page.indexOf('</script>', scriptStart);
assert.ok(scriptStart >= '<script>'.length && scriptEnd > scriptStart, 'expected the shipped inline script');
const source = page.slice(scriptStart, scriptEnd);
const THAI = ['ข้าจะไปออกรบ', 'โอเค แล้วที่นั่น', 'มีสาวๆ ไหม?'];
const EN = ["I'm heading to battle", 'Okay, and over there', 'Are there any girls?'];
function harness(texts = ['Menu', 'today at 17:57'], shot = true) {
  const nodes = new Map(), calls = [];
  function element() {
    const classes = new Set(), listeners = {};
    return { style: {setProperty() {}}, dataset: {}, children: [], hidden: false, textContent: '',
      classList: {add(x) { classes.add(x); }, remove(x) { classes.delete(x); }, contains: x => classes.has(x), toggle(x, on) { if (on === undefined) on = !classes.has(x); on ? classes.add(x) : classes.delete(x); }},
      addEventListener(t, fn) { listeners[t] = fn; }, fire(t, e = {}) { listeners[t]?.(e); },
      getContext() { return {measureText: t => ({width: t.length * 8})}; },
      set innerHTML(v) { this.html = v; this.children = []; }, get innerHTML() { return this.html || ''; },
      appendChild(e) { this.children.push(e); }, querySelectorAll() { return []; },
      getBoundingClientRect() { return {left: 0, top: 0, width: 30, height: 20}; },
      clientWidth: 30, clientHeight: 20, scrollWidth: 30, scrollHeight: 20 };
  }
  const node = s => { if (!nodes.has(s)) nodes.set(s, element()); return nodes.get(s); };
  const context = { document: {querySelector: node, querySelectorAll: () => [], createElement: element, body: element(), documentElement: element(), addEventListener() {}},
    localStorage: {getItem() {return null;}, setItem() {}}, setTimeout: () => 1, clearTimeout() {}, innerWidth: 411, innerHeight: 914, getSelection: () => '',
    ScreenNative: { translate: (id, items, to) => calls.push({kind: 'translate', id, items: JSON.parse(items), to}), picture: id => calls.push({kind: 'picture', id}), copy: text => calls.push({kind: 'copy', text}), ask: text => calls.push({kind: 'ask', text}), log() {} } };
  context.window = context;
  vm.runInNewContext(source.replace('  N.log(\'screen page ready\');', "  window.__test = { st, translateScreen };"), context);
  const {st, translateScreen} = context.__test;
  st.o = {shot, mode: 'translate', dpr: 1}; st.mode = 'translate';
  st.words = texts.map((t, i) => ({t, i, sp: '', b: i, x: 10, y: 100 + i * 30, w: 150, h: 20}));
  st.blocks = texts.map((t, i) => ({t, i, wi: [i]}));
  const next = kind => calls.filter(c => c.kind === kind).at(-1);
  const translated = (r, c = next('translate')) => context.S.translated(c.id, r);
  const nativeEnglish = () => { const c = next('translate'); translated({items: c.items, foreign: c.items.map(() => false), from: ''}, c); };
  const pictured = r => context.S.pictured(next('picture').id, r);
  translateScreen();
  return {st, context, calls, node, next, translated, nativeEnglish, pictured, retry: () => node('#pill').fire('click')};
}
test('English chrome cannot finish before picture coverage; missing Thai is translated and retained', () => {
  const h = harness(); h.nativeEnglish();
  assert.ok(h.next('picture'), 'image coverage must be requested even with English native chrome');
  assert.match(h.node('#pill').innerHTML, /Reading picture/);
  h.pictured({lines: ['Menu', ...THAI]});
  assert.deepEqual(h.next('translate').items, THAI);
  assert.match(h.node('#pill').innerHTML, /Translating picture/);
  h.translated({items: EN, foreign: [true, true, true], from: 'Thai'});
  assert.equal(h.st.pictureTranslation.count, 3);
  assert.equal(h.st.pic.join('\n'), THAI.join('\n')); // originals are not overwritten
  assert.equal(h.st.trans.text, EN.join('\n'));
  assert.match(h.node('#pill').innerHTML, /Thai/);
  h.node('#tCopy').fire('click'); assert.equal(h.next('copy').text, EN.join('\n'));
  h.node('#tAsk').fire('click'); assert.match(h.next('ask').text, /ข้าจะไปออกรบ/);
});
test('known French does not prevent checking Thai image; original overlay is retained', () => {
  const h = harness(['Bonjour']); h.translated({items: ['Hello'], foreign: [true], from: 'French'});
  assert.ok(h.next('picture')); assert.equal(h.st.tr[0], 'Hello');
  h.pictured({lines: ['Bonjour', THAI[0]]}); h.translated({items: [EN[0]], from: 'Thai'});
  assert.equal(h.st.tr[0], 'Hello'); assert.equal(h.st.pictureTranslation.count, 1);
});
test('all-English image and native lines stay unchanged, without duplicated translation', () => {
  const h = harness(); h.nativeEnglish(); h.pictured({lines: ['Menu', 'today at 17:57']});
  assert.equal(h.calls.filter(c => c.kind === 'translate').length, 1);
  assert.equal(h.st.pictureState, 'done'); assert.equal(Object.keys(h.st.tr).length, 0);
  assert.match(h.node('#pill').innerHTML, /No other language found/);
});
test('picture read errors are explicit/retryable, never an English verdict', () => {
  const h = harness(); h.nativeEnglish(); h.pictured({error: 'Vision unavailable'});
  assert.equal(h.st.pictureState, 'error'); assert.match(h.node('#pill').innerHTML, /retry/);
  assert.doesNotMatch(h.node('#pill').innerHTML, /Already|No other/);
  h.retry(); h.nativeEnglish(); assert.equal(h.calls.filter(c => c.kind === 'picture').length, 2);
});
test('malformed vision/translation responses cannot become successful English detection', () => {
  for (const reply of [{}, {lines: 'bad'}, {lines: [42]}]) {
    const h = harness(); h.nativeEnglish(); h.pictured(reply); assert.equal(h.st.pictureState, 'error');
  }
  for (const reply of [{error: 'Provider unavailable'}, {items: []}, {items: ['']}, {items: EN, foreign: []}, {items: THAI, foreign: [false,false,false]}]) {
    const h = harness(); h.nativeEnglish(); h.pictured({lines: THAI}); h.translated(reply);
    assert.equal(h.st.pictureState, 'error'); assert.match(h.node('#pill').innerHTML, /retry/);
  }
});
test('retry reuses successfully read pixels; old callbacks cannot overwrite a later run', () => {
  const h = harness(); const stale = h.next('translate');
  h.nativeEnglish(); h.pictured({lines: THAI}); const oldPictureTranslation = h.next('translate');
  h.translated({error: 'timeout'}); h.retry(); h.nativeEnglish();
  assert.equal(h.calls.filter(c => c.kind === 'picture').length, 1);
  h.translated({items: ['WRONG'], from: 'Thai'}, oldPictureTranslation);
  h.translated({items: ['WRONG'], from: 'Thai'}, stale);
  assert.equal(h.st.pictureState, 'translating'); assert.equal(h.st.pictureTranslation, null);
  h.translated({items: EN, from: 'Thai'}); assert.equal(h.st.pictureTranslation.count, 3);
});
test('no screenshot uses qualified readable-text verdict without sending any pixels', () => {
  const h = harness(['Hello'], false); h.nativeEnglish();
  assert.equal(h.next('picture'), undefined); assert.match(h.node('#pill').innerHTML, /Readable text is in English/);
});
test('image-only and numeric chrome still use picture route', () => {
  for (const texts of [[], ['17:57']]) { const h = harness(texts); assert.ok(h.next('picture')); h.pictured({lines: THAI}); h.translated({items: EN, from: 'Thai'}); assert.equal(h.st.pictureTranslation.count, 3); }
});
test('an older language response cannot overwrite a new target', () => {
  const h = harness(); h.nativeEnglish(); const c = h.next('picture');
  h.st.to = 'French'; h.context.S.pictured(c.id, {lines: THAI});
  assert.equal(h.st.pic, null); assert.equal(h.calls.filter(c=>c.kind==='translate').length,1);
});
test('an outside pointer tap dismisses automatic picture translation and retains Copy', () => {
  const h = harness(); h.nativeEnglish(); h.pictured({lines: THAI}); h.translated({items: EN, from: 'Thai'});
  assert.equal(h.node('#sheet').classList.contains('show'), true);
  const layer = h.node('#layer'); layer.setPointerCapture = () => {};
  layer.fire('pointerdown', {clientX: 345, clientY: 100, pointerId: 1});
  layer.fire('pointerup', {clientX: 345, clientY: 100, pointerId: 1});
  assert.equal(h.node('#sheet').classList.contains('show'), false);
  assert.equal(h.st.panel, 'sel');
  assert.equal(h.st.pictureTranslation.text, EN.join('\n'));
  h.node('#tCopy').fire('click');
  assert.equal(h.next('copy').text, EN.join('\n'));
});
