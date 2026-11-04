import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { fixture } from './fixtures/tweaks.mjs';

// Reply summary (miguel/reply-summary, --wos-reply-summary: on): a long reply shows only the agent's own plain-words
// ask (its hidden status line, served by the Agent Service as wizard_ask) as one tappable block; tapping it shows the
// full reply in its place and Show less folds it back. Collapsed or expanded to start: Settings › Chats & app screens.
// Off (every stock skin), the rendered reply is byte-identical to before.
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const kitCtx = { window: null, URL, Intl, Date, navigator: {}, location: { origin: 'https://wizard.example', href: 'https://wizard.example/' },
  document: { addEventListener() {}, querySelector() { return null; } }, addEventListener() {} };
kitCtx.window = kitCtx; vm.createContext(kitCtx); vm.runInContext(read('web/core/chat-kit.js'), kitCtx);
const KIT = kitCtx.WosChat;
const chats = read('web/core/chats.js');
const line = start => { const a = chats.indexOf(start); assert.ok(a >= 0, start); return chats.slice(a, chats.indexOf('\n', a) + 1); };
const slice = (start, end) => { const a = chats.indexOf(start), b = chats.indexOf(end, a); assert.ok(a >= 0 && b > a, `${start} .. ${end}`); return chats.slice(a, b); };

function render(rows, { on, start = 'collapsed', chosen = null }) {
  const ctx = { getComputedStyle: () => ({ getPropertyValue: name => name === '--wos-reply-summary' && on ? ' on' : name === '--wos-reply-regenerate' ? '' : '' }),
    document: { documentElement: {} }, window: { WizConfig: { agent: () => 'Fixture' }, WosSkinHost: { replySummaryStart: start } }, KIT: { time: { full: String, stamp: String } }, esc: KIT.esc, md: KIT.md, PW: null,
    replyCard: () => '', userMedia: () => '', mediaBlock: () => '', clip: s => s, CHECK_SVG: '', COPY_SVG: '', SHARE_SVG: '', noteHtml: () => '', runContextHtml: () => '' };
  vm.createContext(ctx);
  vm.runInContext(`${['  const regenOn = ', '  const summaryOn = ', '  const SUMMARY_WORDS = ', '  const summaryOf = ', '  const summaryStartsOpen = ', '  const CHEV_SVG = ', '  const timeTag = '].map(line).join('')}${slice('  function turnHtml(', '  const turnAt = ')}this.turnHtml = turnHtml;`, ctx);
  return KIT.parseRows(rows).map((tn, i, all) => ctx.turnHtml({ texts: [], ...(chosen ? { rsum: new Map(chosen) } : {}) }, tn, i === all.length - 1, false, null, null)).join('');
}
const long = Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ');
const ask = 'New chat groups are live. Say if the 11 groups feel right';
const rows = [{ role: 'user', timestamp: 1, content: 'Do the thing' }, { role: 'assistant', timestamp: 2, content: long, wizard_ask: ask, wizard_state: 'check' }];

const lead = `<button type="button" class="rsum" data-reply-summary="2000" aria-expanded="false"`;
const full = `<div class="rdet" data-reply-details="2000"`;
test('on: a long reply shows only its ask, as one button; the full reply waits hidden in its place', () => {
  const html = render(rows, { on: true });
  assert.match(html, /<div class="msg a has-rsum"/);
  assert.ok(html.includes(`${lead}><span class="rsum-t">${ask}</span><svg class="rsum-chev"`), 'the whole short answer is the toggle');
  assert.ok(html.includes(`${full} hidden><button type="button" class="rless" data-reply-summary="2000" aria-expanded="true">Show less`));
  assert.ok(html.indexOf(full) < html.indexOf('word159'), 'the full reply sits in the hidden block');
  assert.doesNotMatch(html, /<details class="rdet"|<summary>Details<\/summary>/, 'no separate Details control');
  assert.match(html, /data-mcopy="0"/, 'Copy still copies the full reply');
});

test('on: "start expanded" shows the full reply with the short answer hidden; a reply the owner tapped keeps its own state', () => {
  const open = render(rows, { on: true, start: 'expanded' });
  assert.match(open, /<div class="msg a has-rsum rsum-open"/);
  assert.ok(open.includes(`${lead} hidden>`) && open.includes(`${full}><button type="button" class="rless"`));
  assert.match(render(rows, { on: true, start: 'expanded', chosen: [['2000', false]] }), /<div class="msg a has-rsum"[^]*class="rdet" data-reply-details="2000" hidden>/);
  assert.match(render(rows, { on: true, chosen: [['2000', true]] }), /<div class="msg a has-rsum rsum-open"/);
});

test('on: short replies, replies without an ask and failed turns stay as they are', () => {
  const short = render([rows[0], { ...rows[1], content: 'Done, it works.' }], { on: true });
  const noAsk = render([rows[0], { role: 'assistant', timestamp: 2, content: long }], { on: true });
  const failed = render([rows[0], { ...rows[1], display_kind: 'failed_turn' }], { on: true });
  for (const html of [short, noAsk, failed]) { assert.doesNotMatch(html, /rsum|rdet|has-rsum/); }
});

test('off (stock): output is byte-identical to a reply that carries no ask', () => {
  const plain = render([rows[0], { role: 'assistant', timestamp: 2, content: long }], { on: false });
  assert.equal(render(rows, { on: false }), plain);
  assert.doesNotMatch(plain, /rsum|rdet/);
});

test('only the two toggle buttons switch a reply, the choice is kept per reply across repaints, and keys work', () => {
  const h = slice("    const rsb = e.target.closest('[data-reply-summary]');", "    if (e.target.closest('[data-chearlier]'))");
  const ctx = { CH: {}, ch: id => (ctx.CH[id] = ctx.CH[id] || {}), id: 'w1' };
  vm.createContext(ctx); vm.runInContext(`${line('  const setSummaryOpen = ').replace(/\n$/, '')}${chats.slice(chats.indexOf('  const setSummaryOpen = ') + line('  const setSummaryOpen = ').length, chats.indexOf('  };\n', chats.indexOf('  const setSummaryOpen = ')) + 5)}this.click = e => { ${h} return false; };`, ctx);
  const node = (cls = []) => ({ hidden: false, classes: new Set(cls), focused: false, focus() { this.focused = true; },
    classList: { contains: c => node.cur.classes.has(c) } });
  const msg = { classes: new Set(['msg', 'a', 'has-rsum']), classList: { toggle(c, on) { on ? msg.classes.add(c) : msg.classes.delete(c); }, contains: c => msg.classes.has(c) } };
  const sum = node(), det = node(), less = node(); det.hidden = true;
  msg.querySelector = q => q === '.bub > .rsum' ? sum : q === '.bub > .rdet' ? det : q === '.rless' ? less : null;
  const btn = { dataset: { replySummary: '2000' }, closest: q => q === '.msg.a.has-rsum' ? msg : null };
  const ev = (detail, hit) => ({ detail, target: { closest: q => q === '[data-reply-summary]' ? hit : null } });
  assert.equal(ctx.click(ev(1, null)), false, 'a link or text inside the reply is not a toggle');
  assert.equal(ctx.click(ev(1, btn)), true);
  assert.ok(msg.classes.has('rsum-open') && sum.hidden && !det.hidden && ctx.CH.w1.rsum.get('2000') === true && !less.focused);
  assert.equal(ctx.click(ev(0, btn)), true, 'Enter/Space (a keyboard click) folds it back');
  assert.ok(!msg.classes.has('rsum-open') && !sum.hidden && det.hidden && ctx.CH.w1.rsum.get('2000') === false && sum.focused);
  assert.doesNotMatch(chats, /openDetails/, 'state comes from the per-reply choice, not a DOM restore');
});

test('the host: api.replies.summaryStart is held by the package and released on teardown; Settings › Chats takes its switch', async () => {
  const f = fixture();
  f.lsMap.set('wos.skin.miguel/reply-summary.start', JSON.stringify('expanded'));
  const sections = [];
  f.ctx.window.WosSettings = { register: s => { sections.push(s); return () => sections.splice(sections.indexOf(s), 1); } };
  await f.mount('miguel/reply-summary');
  assert.equal(f.host.replySummaryStart, 'expanded');
  assert.deepEqual(sections.map(s => s.page), ['chats']);
  await f.clear();
  assert.equal(f.host.replySummaryStart, 'collapsed'); assert.equal(sections.length, 0);
  const src = read('web/tweaks/miguel/reply-summary/tweak.js');
  assert.match(src, /'Short answers start collapsed'/);
  assert.deepEqual(JSON.parse(read('web/tweaks/miguel/reply-summary/manifest.json')).capabilities, ['layout', 'settings']);
});

test('the switch is CSS only: the tweak sets --wos-reply-summary and core never tests the package id', () => {
  assert.match(read('web/tweaks/miguel/reply-summary/tweak.css'), /html\[data-tweaks~="miguel\/reply-summary"\] \{ --wos-reply-summary: on; \}/);
  assert.doesNotMatch(chats, /miguel\/reply-summary/);
  const catalog = JSON.parse(read('web/tweaks/catalog.json'));
  assert.ok(catalog.tweaks.includes('miguel/reply-summary') && !catalog.defaults.includes('miguel/reply-summary'), 'opt-in, not a default');
  assert.ok(existsSync(new URL('../web/tweaks/miguel/reply-summary/contract.mjs', import.meta.url)));
});
