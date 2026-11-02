// Execute the shipped layout/tile/wsEl/splitOf functions. This synthetic DOM is not browser QA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const js = readFileSync(process.env.DESKTOP_LAYOUT_SOURCE || new URL('../web/desktop/desktop.js', import.meta.url), 'utf8');
const css = readFileSync(process.env.DESKTOP_LAYOUT_CSS || new URL('../web/desktop/desktop.css', import.meta.url), 'utf8');
function section(start, end) {
  const a = js.indexOf(start), b = js.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `production section ${start}`);
  return js.slice(a, b);
}
const production = section('  function layout() {', '  /* ---- heads-up chat') +
  section('  function wsEl(i) {', '  function winHtml(') +
  js.split('\n').find(line => line.startsWith('  function splitOf('));

// Only the simple class/attribute/descendant rules needed for workspace insets/chrome.
// Rules and values come from the same production CSS revision as the JS under test.
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .flatMap(([, selectors, text]) => selectors.split(',').map(selector => ({
    selector: selector.trim(), declarations: Object.fromEntries(text.split(';').filter(s => s.includes(':'))
      .map(s => { const i = s.indexOf(':'); return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; })),
  }))).filter(r => /^(?:\.[\w-]+(?:\[hidden\])?\s*)+$/.test(r.selector));
function matches(el, compound) {
  return [...compound.matchAll(/\.([\w-]+)|\[hidden\]/g)]
    .every(m => m[1] ? el.classList.contains(m[1]) : el.hidden);
}
function styleFor(el) {
  const result = {};
  for (const { selector, declarations } of rules) {
    const parts = selector.split(/\s+/); let node = el;
    if (!matches(node, parts.pop())) continue;
    let ok = true;
    while (parts.length) {
      const part = parts.pop(); node = node.parentNode;
      while (node && !matches(node, part)) node = node.parentNode;
      if (!node) { ok = false; break; }
    }
    if (ok) Object.assign(result, declarations);
  }
  return result;
}
function harness(desks, { width = 1440, height = 900, home = false, maxWidth = 1200 } = {}) {
  const events = [], hosts = [], windows = {}, buttons = [];
  function node(classes = '', kind = '') {
    const names = new Set(classes.split(/\s+/).filter(Boolean));
    return { dataset: {}, hidden: false, parentNode: null,
      get isConnected() { return this === body || !!this.parentNode?.isConnected; },
      get className() { return [...names].join(' '); },
      set className(value) { names.clear(); value.split(/\s+/).filter(Boolean).forEach(n => names.add(n)); },
      classList: { contains: n => names.has(n), add: n => names.add(n), remove: n => names.delete(n),
        toggle(n, on) { on ??= !names.has(n); if (on) names.add(n); else names.delete(n); events.push(`class:${kind}:${n}:${on}`); return on; } },
      style: new Proxy({}, { set(target, key, value) { events.push(`write:${kind}:${key}`); target[key] = value; return true; } }),
      setAttribute() {}, addEventListener(type, fn) { this[type] = fn; },
    };
  }
  const body = node('', 'body'), stage = node('stage', 'stage'); stage.parentNode = body;
  stage.querySelector = selector => hosts.find(h => h.parentNode === stage && h.dataset.desk === selector.match(/data-desk="([^"]+)"/)?.[1]) || null;
  stage.appendChild = host => { host.parentNode = stage; if (!hosts.includes(host)) hosts.push(host); return host; };
  const barHeight = Number(css.match(/--bar-h:\s*([\d.]+)px/)?.[1] || 34);
  Object.defineProperties(stage, { clientWidth: { get: () => width }, clientHeight: { get: () => height - (body.classList.contains('desktop-fullscreen') ? 0 : barHeight) } });
  function hostNode() {
    const h = node('wsp', 'host');
    Object.defineProperties(h, {
      clientWidth: { get() { events.push('read:width'); return width; } },
      clientHeight: { get() {
        events.push('read:height'); const s = styleFor(h);
        return s.position === 'fixed' ? height - (s.inset?.startsWith('var(--bar-h)') ? barHeight : 0) : stage.clientHeight;
      } },
    }); return h;
  }
  desks = desks.map((d, i) => ({ id: `d${i}`, wins: [], focus: null, mono: false, ...d }));
  const W = {};
  for (const d of desks) for (const id of d.wins) { W[id] = { id }; windows[id] = node('win', id); }
  const ctx = { ws: desks, cur: 0, homeOpen: home, W, stage, MOD: 'Alt+', SPLIT: [0.25, 0.75],
    winEl: id => windows[id] || null,
    document: { documentElement: {}, body, getElementById: () => buttons[0] || null,
      createElement: tag => tag === 'div' ? hostNode() : node('', 'exit') },
    getComputedStyle: () => ({ getPropertyValue: key => key === '--desktop-window-max-width' ? String(maxWidth) : '' }),
    toggleMono: () => { desks[ctx.cur].mono = !desks[ctx.cur].mono; },
  };
  body.appendChild = el => { el.parentNode = body; buttons.push(el); };
  vm.createContext(ctx); vm.runInContext(production, ctx);
  function syncHosts() {
    desks.forEach((d, i) => { const host = ctx.wsEl(i); host.hidden = ctx.homeOpen || i !== ctx.cur; d.wins.forEach(id => { if (windows[id]) windows[id].parentNode = host; }); });
  }
  syncHosts();
  return { ctx, desks, hosts, windows, body, stage, events, buttons, syncHosts,
    layout() { ctx.layout(); },
    show(index, homeOpen = false) { ctx.cur = index; ctx.homeOpen = homeOpen; syncHosts(); ctx.layout(); },
    rect(id) { const s = windows[id].style; return ['left', 'top', 'width', 'height'].map(k => parseFloat(s[k])); },
    appHeight(id) { const w = windows[id], full = styleFor({ classList: { contains: x => x === 'wbar' }, parentNode: w }).display === 'none'; return parseFloat(w.style.height) - (full ? 0 : 32); },
  };
}
const desk = (wins, mono = false) => ({ wins, focus: wins[0] || null, mono });
function nonzero(h, id) { const r = h.rect(id); assert.ok(r.every(Number.isFinite), `${id} has geometry`); assert.ok(r[2] > 0 && r[3] > 0, `${id} has positive size`); }

test('restored background and Home desks are sized before first foreground switch', () => {
  for (const home of [false, true]) {
    const h = harness([desk(['front']), desk(['files']), desk([])], { home }); h.layout();
    nonzero(h, 'front'); nonzero(h, 'files');
    assert.deepEqual(h.rect('files'), [120, 8, 1200, 850]);
    assert.equal(h.body.classList.contains('desktop-fullscreen'), false);
    assert.equal(h.buttons[0].hidden, true);
  }
});

test('mixed normal/fullscreen desks get eventual heights and app chrome without changing the front', () => {
  for (const currentMono of [false, true]) {
    const h = harness([desk(['a'], currentMono), desk(['b'], !currentMono)]); h.layout();
    assert.deepEqual(h.rect('a'), currentMono ? [0, 0, 1440, 900] : [120, 8, 1200, 850]);
    assert.deepEqual(h.rect('b'), currentMono ? [120, 8, 1200, 850] : [0, 0, 1440, 900]);
    const initialAppHeight = h.appHeight('b'), rect = h.rect('b');
    assert.equal(initialAppHeight, currentMono ? 818 : 900);
    assert.equal(h.body.classList.contains('desktop-fullscreen'), currentMono);
    assert.equal(h.buttons[0].hidden, !currentMono);
    const bodyToggles = h.events.filter(e => e.startsWith('class:body:'));
    assert.deepEqual(bodyToggles, [`class:body:desktop-fullscreen:${currentMono}`]);
    h.show(1); assert.deepEqual(h.rect('b'), rect, 'switch does not correct an initial wrong size');
    assert.equal(h.appHeight('b'), initialAppHeight, 'iframe body keeps its eventual height');
  }
});

test('Home and repeated fullscreen exit/enter preserve size, visibility and foreground chrome', () => {
  const h = harness([desk(['a', 'other'], true), desk(['b'])]); h.layout();
  assert.equal(h.windows.other.classList.contains('gone'), true);
  assert.equal(h.windows.a.classList.contains('full'), true);
  h.show(0, true); assert.equal(h.body.classList.contains('desktop-fullscreen'), false);
  assert.deepEqual(h.rect('a'), [0, 0, 1440, 900]); assert.equal(h.appHeight('a'), 900);
  h.show(0); h.buttons[0].click(); h.layout();
  assert.equal(h.body.classList.contains('desktop-fullscreen'), false);
  assert.equal(h.windows.a.classList.contains('full'), false);
  assert.equal(h.windows.other.classList.contains('gone'), false); nonzero(h, 'other');
  h.ctx.toggleMono(); h.layout(); assert.deepEqual(h.rect('a'), [0, 0, 1440, 900]);
  assert.equal(h.buttons.length, 1);
});

test('empty current desk still sizes background; absent window and null host do not abort other desks', () => {
  const h = harness([desk([]), desk(['missingWindow']), desk(['files']), desk(['last'])]);
  delete h.windows.missingWindow;
  const realWsEl = h.ctx.wsEl;
  h.ctx.wsEl = i => i === 2 ? null : realWsEl(i);
  assert.doesNotThrow(() => h.layout()); nonzero(h, 'last');
  assert.equal(h.windows.files.style.width, undefined, 'missing host is deferred, not assigned invented geometry');
  h.ctx.wsEl = realWsEl; h.layout(); nonzero(h, 'files');
});

test('production wsEl recreates a detached stale host and returns null for an absent desk', () => {
  const h = harness([desk(['a']), desk(['b'])]), old = h.ctx.wsEl(1);
  old.parentNode = null; assert.equal(h.ctx.wsEl(99), null);
  h.syncHosts(); assert.notEqual(h.ctx.wsEl(1), old); h.layout(); nonzero(h, 'b');
  assert.equal(h.ctx.wsEl(1).isConnected, true);
});

test('split, shared columns, master/stack and max-width fallback use the same production tiler on every desk', () => {
  const h = harness([desk([]), desk(['a', 'b']), desk(['c', 'd', 'e']), desk(['f', 'g']), desk(['single'])], { width: 1000, height: 800, maxWidth: 0 });
  h.ctx.W.f.share = 0.3; h.layout();
  for (const id of Object.keys(h.windows)) nonzero(h, id);
  assert.deepEqual(h.rect('a'), [8, 8, 488, 750]); assert.deepEqual(h.rect('b'), [504, 8, 488, 750]);
  assert.deepEqual(h.rect('c'), [8, 8, 547, 750]);
  assert.deepEqual(h.rect('d'), [563, 8, 429, 371]); assert.deepEqual(h.rect('e'), [563, 387, 429, 371]);
  assert.deepEqual(h.rect('f'), [8, 8, 293, 750]); assert.deepEqual(h.rect('g'), [309, 8, 683, 750]);
  assert.deepEqual(h.rect('single'), [8, 8, 984, 750]);
  const before = h.rect('f'); h.show(3); assert.deepEqual(h.rect('f'), before);
});

test('zero-size hosts preserve prior geometry and resume when measurable', () => {
  const h = harness([desk(['a']), desk(['b'])]); h.layout();
  const before = h.rect('b'), original = h.ctx.wsEl;
  h.ctx.wsEl = i => i === 1 ? { classList: { toggle() {} }, clientWidth: 0, clientHeight: 0 } : original(i);
  h.layout(); assert.deepEqual(h.rect('b'), before);
  h.ctx.wsEl = original; h.layout(); assert.deepEqual(h.rect('b'), before);
});

test('a stale current index cannot prevent sizing the remaining live desks', () => {
  const h = harness([desk(['a'])]); h.ctx.cur = 99;
  assert.doesNotThrow(() => h.layout()); nonzero(h, 'a');
  assert.equal(h.body.classList.contains('desktop-fullscreen'), false);
});

test('all workspace dimensions are read before window geometry writes', () => {
  const h = harness([desk(['a']), desk(['b']), desk(['c'])]); h.events.length = 0; h.layout();
  const reads = h.events.map((e, i) => e.startsWith('read:') ? i : -1).filter(i => i >= 0);
  const firstWrite = h.events.findIndex(e => e.startsWith('write:'));
  assert.ok(reads.length >= 6); assert.ok(Math.max(...reads) < firstWrite);
});
