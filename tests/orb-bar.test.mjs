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
const src = host.match(/  const setAttr = [^\n]+\n  const WOS_MARKS = [^\n]+\n  const WOS_MARKED = [^\n]+\n  const unmark = [^\n]+\n/)[0]
  + host.match(/  function orbTabs\(d, bar, vw\) \{[\s\S]*?\n  \}\n/)[0] + host.match(/  function tabFit\(sides, room\) \{[\s\S]*?\n  \}\n/)[0];
const ctx = {}; vm.runInNewContext(src + ';globalThis.orbTabs = orbTabs; globalThis.tabFit = tabFit;', ctx);
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
  assert.match(host, /html\.wos-orb-bar \[data-wos-tab\]\{order:1!important;flex:0 0 calc\(\(100% - var\(--wos-orb-slot,80px\)\)\/2\*var\(--wos-tab-f,1\)\)!important/, 'each side gets half the rest, shared by its tabs (tabFit\'s shares)');
  assert.match(host, /html\.wos-orb-bar \[data-wos-fs\]\{white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important;max-width:none!important/, 'a label is never cut or ellipsed');
  assert.match(host, /if \(row\) fitTabs\(d, row\);/, 'the split bar is measured and shared by its labels');
  assert.match(host, /if \(o && o\.d > 0 && cy > o\.d \/ 2 && cy < 160 && \(fr\.width >= vwTop \* \.9 && Math\.abs\(vwTop \/ 2 - o\.x\) < 8 \|\| fr\.width >= vwTop \* \.6 && Math\.abs\(fr\.left \+ fr\.width \/ 2 - o\.x\) < 8\)\) \{/, 'only a screen-wide frame with the orb centred over its bottom (or the desktop AI apps frame beside its sidebar, the orb centred over it)');
  assert.match(host, /d\.documentElement\.style\.setProperty\('--wos-orb-slot', Math\.round\(o\.d \+ 16\) \+ 'px'\);/);
  assert.match(host, /inset\(px, orb = null\) \{/, 'api.apps.inset(px, orb): the layout says where its orb is');
  assert.match(host, /new d\.defaultView\.MutationObserver\(/, 'an app that redraws its bar is laid out again');
  const chrome = read('web/layouts/apps/chrome.js');
  assert.match(chrome, /api\.apps\.inset\(inset \?\? FLOAT_INSET\[shell\], orb \|\| \(shell === 'phone' \? orbSpot : null\)\)/, 'phone views hand over the dock orb; a view drawing its own orb says where it is (desktop AI apps); else the lift');
  assert.match(chrome, /d = o\.offsetWidth \|\| r\.width;/, 'the untransformed size: pressing the orb never reflows the bar');
});

/* Every label whole (Miguel, 2 Nov 2026: Podcasts has three tabs, two share the left side, and 'Discover' read 'Dis…').
 * tabFit shares each side by what the tabs need instead of in equal parts, and shrinks labels only as far as needed. Label
 * widths below are the apps' bold labels as measured on a phone (about .6 em per letter); the orb slot is the phone's
 * (60 px orb + 16). For every phone width 360-430: each tab is at least as wide as its label (or icon) plus a little room
 * and at least 44 px, a side's tabs fill exactly its half (never under the orb), and labels stay >= 10 px. */
const SLOT = 76, em = (s, fs) => s.length * .6 * fs;
const tab = (label, fs = 14) => ({ icon: 20, text: em(label, fs), word: Math.max(...label.split(' ').map(w => em(w, fs))), fs, label });
function check(labels, fs, { wrapOk = false } = {}) {
  for (let vw = 360; vw <= 430; vw += 10) {
    const tabs = labels.map(l => tab(l, fs)), nl = Math.ceil(tabs.length / 2), sides = [tabs.slice(0, nl), tabs.slice(nl)], room = (vw - SLOT) / 2;
    const fit = ctx.tabFit(sides.map(s => s.map(({ icon, text, word, fs }) => ({ icon, text, word, fs }))), room);
    assert.ok(fit.s * fs >= 10 - 1e-9, `${vw}px: labels stay >= 10 px (${(fit.s * fs).toFixed(1)})`);
    if (!wrapOk) assert.equal(fit.wrap, false, `${vw}px: ${labels.join(', ')} each on one line`);
    sides.forEach((side, i) => {
      if (!side.length) return;
      const shares = fit.share[i], sum = shares.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 1e-6, `${vw}px: side ${i} is filled exactly (${sum})`);
      side.forEach((t, j) => {
        const w = shares[j] * room, label = (fit.wrap ? t.word : t.text) * fit.s;
        assert.ok(w >= 44 - 1e-6, `${vw}px: ${t.label} is a 44 px target (${w.toFixed(1)})`);
        assert.ok(w >= label + 4 && w >= t.icon + 4, `${vw}px: '${t.label}' fits whole: ${label.toFixed(1)} px label in a ${w.toFixed(1)} px tab`);
      });
    });
  }
}

test('three tabs (Podcasts: My feed · Discover | orb | Filters): every label whole at 360-430 px, the pair shares by need', () => {
  check(['My feed', 'Discover', 'Filters'], 14);
  // the old equal split gave 'Discover' (≈ 67 px at 14 px) half of the 142 px side at 360 px: 71 px with the app's
  // 6 px padding each side = 59 px for the word, so it was cut; now its share follows its label
  const room = (360 - SLOT) / 2, fit = ctx.tabFit([[tab('My feed'), tab('Discover')], [tab('Filters')]], room);
  assert.ok(fit.share[0][1] > fit.share[0][0], 'the longer label gets the larger share');
  assert.deepEqual(fit.share[1], [1], 'a single tab takes its whole side');
});

test('five tabs (two sides of 3 and 2) and the rest of 1-6: labels whole, smaller only when a side is tight', () => {
  check(['Home', 'Search', 'Library', 'Saved', 'Settings'], 12);
  check(['Review', 'Spending', 'Net worth', 'Accounts'], 14);   // Money
  check(['Activity', 'Recovery & sleep'], 14, { wrapOk: true }); // Health (two words may take two lines)
  check(['Inbox'], 14); check(['Feed', 'Saved'], 14); check(['Home', 'Search', 'Library', 'Saved', 'Profile', 'More'], 11);
  const roomy = ctx.tabFit([[tab('Home'), tab('Feed')], [tab('Saved'), tab('More')]], (430 - SLOT) / 2);
  assert.equal(roomy.s, 1, 'room to spare: the app\'s own label size'); assert.equal(roomy.wrap, false);
});

test('a bar of one tab: it sits left of the orb, the orb stays centred (the slot takes the empty right half)', () => {
  const only = new N('button', { 'aria-label': 'Inbox' }, R(150, 740, 90, 44)), bar = new N('nav', {}, R(0, 735, 390, 53), [only]);
  assert.equal(ctx.orbTabs(docOf(new N('body', {}, R(0, 0, 390, 788), [bar])), bar, 390), true);
  assert.equal(only.attrs['data-wos-tab'], 'l'); assert.equal(bar.attrs['data-wos-nl'], '1'); assert.equal(bar.attrs['data-wos-nr'], '0');
  assert.match(host, /html\.wos-orb-bar \[data-wos-tabs\]\[data-wos-nr="0"\]::after\{flex-basis:calc\(var\(--wos-orb-slot,80px\) \+ \(100% - var\(--wos-orb-slot,80px\)\)\/2\)!important\}/);
});
