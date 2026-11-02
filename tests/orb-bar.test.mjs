// The orb bar (Miguel, 2 Nov 2026): the Wizard standard for a full-screen app under a shell view's orb (AI apps, Apps,
// and the Orb view's phone apps, which share layouts/apps/chrome.js). The orb has ONE fixed spot, bottom centre, and an
// app's own bottom tab bar is laid out around it: its tabs split evenly left and right of the orb, on the orb's row,
// never under it. Feature-detected in the shell (skin-host's inset), so any app with a bottom nav / footer / tablist
// works on any Wizard without an app change; without an orb over the frame (desktop) the bar is lifted, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const host = read('web/core/skin-host.js');

/* a tiny DOM: enough for orbTabs (tags, a few attribute selectors, rects, closest, contains) */
class N {
  constructor(tag, attrs = {}, rect = null, kids = []) {
    this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.rect = rect; this.children = []; this.parentElement = null;
    for (const k of kids) { k.parentElement = this; this.children.push(k); }
  }
  hasAttribute(k) { return k in this.attrs; } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); } removeAttribute(k) { delete this.attrs[k]; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  is(sel) {
    return sel.split(',').some(s => {
      s = s.trim(); const m = /^([a-z]*)((?:\[[^\]]+\])*)$/.exec(s); if (!m) throw new Error('selector ' + s);
      if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
      return [...m[2].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, k, v]) => v === undefined ? this.hasAttribute(k) : this.getAttribute(k) === v);
    });
  }
  querySelectorAll(sel) { return this.all().filter(n => n.is(sel)); }
  closest(sel) { for (let n = this; n; n = n.parentElement) if (n.is(sel)) return n; return null; }
  contains(n) { for (; n; n = n.parentElement) if (n === this) return true; return false; }
  getClientRects() { return this.rect ? [this.rect] : []; }
  getBoundingClientRect() { const r = this.rect || { left: 0, top: 0, width: 0, height: 0 }; return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height }; }
}
const R = (left, top, width, height) => ({ left, top, width, height });
const docOf = body => ({ querySelectorAll: s => body.querySelectorAll(s), defaultView: { getComputedStyle: () => ({ visibility: 'visible' }) } });
// orbTabs and its setAttr helper, run on their own (the rest of skin-host is the shell's)
const src = host.match(/  const setAttr = [^\n]+\n/)[0] + host.match(/  function orbTabs\(d, bar, vw\) \{[\s\S]*?\n  \}\n/)[0];
const ctx = {}; vm.runInNewContext(src + ';globalThis.orbTabs = orbTabs;', ctx);
const tabsOf = row => row.all().filter(n => n.hasAttribute('data-wos-tab')).map(n => (n.attrs['aria-label'] || '') + ':' + n.attrs['data-wos-tab']);

test('a bar of four tabs (Money): the bar itself is the row, two tabs left of the orb, two right', () => {
  const tabs = ['Review', 'Spending', 'Net worth', 'Accounts'].map((t, i) => new N('button', { role: 'tab', 'aria-label': t }, R(8 + i * 94, 740, 94, 44)));
  const bar = new N('nav', { role: 'tablist' }, R(0, 735, 390, 53), tabs), body = new N('body', {}, R(0, 0, 390, 788), [bar]);
  assert.equal(ctx.orbTabs(docOf(body), bar, 390), true);
  assert.equal(bar.attrs['data-wos-tabs'], 'bar'); assert.equal(bar.attrs['data-wos-nl'], '2'); assert.equal(bar.attrs['data-wos-nr'], '2');
  assert.deepEqual(tabsOf(bar), ['Review:l', 'Spending:l', 'Net worth:r', 'Accounts:r']);
});

test('tabs grouped by the app (Podcasts: a pair + Filters): the group flattens, the tabs themselves are split', () => {
  const feed = new N('button', { 'aria-label': 'My feed' }, R(4, 736, 127, 48)), disc = new N('button', { 'aria-label': 'Discover' }, R(131, 736, 127, 48));
  const pair = new N('div', { role: 'group' }, null, [feed, disc]), filt = new N('button', { 'aria-label': 'Filters' }, R(259, 736, 127, 48));
  const bar = new N('nav', {}, R(0, 731, 390, 57), [pair, filt]), body = new N('body', {}, R(0, 0, 390, 788), [bar]);
  assert.equal(ctx.orbTabs(docOf(body), bar, 390), true);
  assert.equal(bar.attrs['data-wos-tabs'], 'bar'); assert.equal(pair.attrs['data-wos-flat'], '', 'the wrapper steps aside (display: contents)');
  assert.deepEqual(tabsOf(bar), ['My feed:l', 'Discover:l', 'Filters:r']); assert.equal(bar.attrs['data-wos-nl'], '2'); assert.equal(bar.attrs['data-wos-nr'], '1');
});

test('a segmented control inside the bar (Health): the control is the row (its pill steps aside), one choice each side', () => {
  const a = new N('button', { role: 'radio', 'aria-label': 'Activity' }, R(16, 732, 178, 44)), b = new N('button', { role: 'radio', 'aria-label': 'Recovery' }, R(196, 732, 178, 44));
  const seg = new N('div', { role: 'radiogroup' }, R(12, 728, 366, 52), [a, b]), bar = new N('nav', {}, R(0, 719, 390, 69), [seg]);
  const body = new N('body', {}, R(0, 0, 390, 788), [bar]);
  assert.equal(ctx.orbTabs(docOf(body), bar, 390), true);
  assert.equal(seg.attrs['data-wos-tabs'], 'inner'); assert.equal(bar.attrs['data-wos-tabs'], undefined);
  assert.deepEqual(tabsOf(seg), ['Activity:l', 'Recovery:r']);
});

test('no tab row (one wide button, a mini player above the tabs): nothing is split, earlier marks are cleared', () => {
  const play = new N('button', { 'aria-label': 'Play' }, R(169, 674, 52, 52)), tab1 = new N('button', { 'aria-label': 'A' }, R(0, 740, 195, 44)), tab2 = new N('button', { 'aria-label': 'B' }, R(195, 740, 195, 44));
  const bar = new N('footer', {}, R(0, 668, 390, 120), [play, tab1, tab2]), body = new N('body', {}, R(0, 0, 390, 788), [bar]);
  assert.equal(ctx.orbTabs(docOf(body), bar, 390), true, 'only the lowest row counts (the player sits above it)');
  assert.deepEqual(tabsOf(bar), ['A:l', 'B:r']); assert.equal(play.attrs['data-wos-tab'], undefined);
  const wide = new N('button', { 'aria-label': 'Save' }, R(12, 740, 366, 48)), bar2 = new N('footer', {}, R(0, 730, 390, 58), [wide]);
  const stale = new N('div', { 'data-wos-tabs': 'bar', 'data-wos-nl': '1' }, R(0, 0, 10, 10));
  const body2 = new N('body', {}, R(0, 0, 390, 788), [bar2, stale]);
  assert.equal(ctx.orbTabs(docOf(body2), bar2, 390), false);
  assert.equal(wide.attrs['data-wos-tab'], undefined); assert.equal(stale.attrs['data-wos-tabs'], undefined, 'stale marks go');
});

test('the shell wiring: the CSS around the orb, gated on the orb being over the frame; the views hand over the dock orb', () => {
  // the split rules apply only while html.wos-orb-bar is set; without it the old lift (room above the orb) stays
  assert.match(host, /'html:not\(\.wos-orb-bar\) \[data-wos-inset-bar\]\{height:auto!important;padding-bottom:calc\(var\(--wos-inset-b,0px\) - 12px\)!important\}' \+ ORB_BAR;/);
  assert.match(host, /html\.wos-orb-bar \[data-wos-tabs\]::after\{content:""!important;display:block!important;position:static!important;order:2!important;flex:0 0 var\(--wos-orb-slot,80px\)!important/, 'an empty slot as wide as the orb in the middle');
  assert.match(host, /min-height:calc\(2\*var\(--wos-orb-cy,40px\)\)!important/, 'the tabs sit on the orb\'s row');
  assert.match(host, /html\.wos-orb-bar \[data-wos-tab\]\{order:1!important;flex:0 0 calc\(\(100% - var\(--wos-orb-slot,80px\)\)\/2\/var\(--wos-tab-n,1\)\)!important/, 'each side gets half the rest, shared by its tabs');
  assert.match(host, /if \(o && o\.d > 0 && cy > o\.d \/ 2 && cy < 160 && fr\.width >= vwTop \* \.9 && Math\.abs\(vwTop \/ 2 - o\.x\) < 8\) \{/, 'only a screen-wide frame with the orb centred over its bottom');
  assert.match(host, /d\.documentElement\.style\.setProperty\('--wos-orb-slot', Math\.round\(o\.d \+ 16\) \+ 'px'\);/);
  assert.match(host, /inset\(px, orb = null\) \{/, 'api.apps.inset(px, orb): the layout says where its orb is');
  assert.match(host, /new d\.defaultView\.MutationObserver\(/, 'an app that redraws its bar is laid out again');
  const chrome = read('web/layouts/apps/chrome.js');
  assert.match(chrome, /api\.apps\.inset\(inset \?\? FLOAT_INSET\[shell\], shell === 'phone' \? orbSpot : null\)/, 'phone views hand over the dock orb; the desktop keeps the lift');
  assert.match(chrome, /d = o\.offsetWidth \|\| r\.width;/, 'the untransformed size: pressing the orb never reflows the bar');
});
