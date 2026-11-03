import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

// Reply summary (miguel/reply-summary, --wos-reply-summary: on): a long reply leads with the agent's own plain-words
// ask (its hidden status line, served by the Agent Service as wizard_ask) and folds the full text under Details.
// Off (every stock skin), the rendered reply is byte-identical to before.
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const kitCtx = { window: null, URL, Intl, Date, navigator: {}, location: { origin: 'https://wizard.example', href: 'https://wizard.example/' },
  document: { addEventListener() {}, querySelector() { return null; } }, addEventListener() {} };
kitCtx.window = kitCtx; vm.createContext(kitCtx); vm.runInContext(read('web/core/chat-kit.js'), kitCtx);
const KIT = kitCtx.WosChat;
const chats = read('web/core/chats.js');
const slice = (start, end) => { const a = chats.indexOf(start), b = chats.indexOf(end, a); assert.ok(a >= 0 && b > a, `${start} .. ${end}`); return chats.slice(a, b); };

function render(rows, { on }) {
  const ctx = { getComputedStyle: () => ({ getPropertyValue: name => name === '--wos-reply-summary' && on ? ' on' : name === '--wos-reply-regenerate' ? '' : '' }),
    document: { documentElement: {} }, window: { WizConfig: { agent: () => 'Fixture' } }, KIT: { time: { full: String, stamp: String } }, esc: KIT.esc, md: KIT.md, PW: null,
    replyCard: () => '', userMedia: () => '', mediaBlock: () => '', clip: s => s, CHECK_SVG: '', COPY_SVG: '', SHARE_SVG: '', noteHtml: () => '', runContextHtml: () => '' };
  vm.createContext(ctx);
  vm.runInContext(`${slice('  const regenOn = ', '  const ourSkin = ')}${slice('  const timeTag = ', '  // A note another agent')}${slice('  function turnHtml(', '  const turnAt = ')}this.turnHtml = turnHtml;`, ctx);
  return KIT.parseRows(rows).map((tn, i, all) => ctx.turnHtml({ texts: [] }, tn, i === all.length - 1, false, null, null)).join('');
}
const long = Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ');
const ask = 'New chat groups are live. Say if the 11 groups feel right';
const rows = [{ role: 'user', timestamp: 1, content: 'Do the thing' }, { role: 'assistant', timestamp: 2, content: long, wizard_ask: ask, wizard_state: 'check' }];

test('on: a long reply leads with its ask and folds the full text under Details', () => {
  const html = render(rows, { on: true });
  assert.match(html, /<div class="msg a has-rsum"/);
  assert.ok(html.indexOf(`<p class="rsum" data-reply-summary>${ask}</p>`) < html.indexOf('<details class="rdet" data-reply-details="2000"><summary>Details</summary>'));
  assert.ok(html.indexOf('<summary>Details</summary>') < html.indexOf('word159'), 'the full reply sits inside Details');
  assert.match(html, /data-mcopy="0"/, 'Copy still copies the full reply');
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

test('an opened Details survives live repaints of the same thread, like run-context originals', () => {
  assert.match(chats, /const openDetails = el\.dataset\.draftFor === dkey \? new Set\(\[\.\.\.el\.querySelectorAll\('\[data-reply-details\]\[open\]'\)\]/);
  assert.match(chats, /for \(const detail of el\.querySelectorAll\('\[data-reply-details\]'\)\) if \(detail\.open !== openDetails\.has/);
});

test('the switch is CSS only: the tweak sets --wos-reply-summary and core never tests the package id', () => {
  assert.match(read('web/tweaks/miguel/reply-summary/tweak.css'), /html\[data-tweaks~="miguel\/reply-summary"\] \{ --wos-reply-summary: on; \}/);
  assert.doesNotMatch(chats, /miguel\/reply-summary/);
  const catalog = JSON.parse(read('web/tweaks/catalog.json'));
  assert.ok(catalog.tweaks.includes('miguel/reply-summary') && !catalog.defaults.includes('miguel/reply-summary'), 'opt-in, not a default');
  assert.ok(existsSync(new URL('../web/tweaks/miguel/reply-summary/contract.mjs', import.meta.url)));
});
