import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { listFixture } from './fixtures/chats-list-render.mjs';
const window = {};
vm.runInNewContext(fs.readFileSync(new URL('../web/core/chat-search.js', import.meta.url), 'utf8'), { window });
const { rank, SEARCH_TIME_BONUS: B } = window.WizCore.chatSearch;
const HOUR = 3600000, NOW = Date.parse('2026-10-31T12:00:00Z');
const row = (id, title = '', hours = 0, more = {}) => ({ id, title, activityAt: new Date(NOW - hours * HOUR).toISOString(), ...more });
const sorted = (rows, q = 'messenger') => Array.from(rank(rows, q, s => s.activityAt), s => s.id);
test('recent body-only beats a week-old title prefix', () => {
  assert.deepEqual(sorted([row('old', 'Messenger project', 168), row('new', 'Follow-up', 1)]), ['new', 'old']);
});
test('equal age: title-word-prefix > title contains > preview > body', () => {
  assert.deepEqual(sorted([row('body'), row('preview', '', 0, { preview: 'messenger notes' }), row('contains', 'premessenger notes'), row('prefix', 'Messenger notes')]), ['prefix', 'contains', 'preview', 'body']);
});
test('archived threads mix by recency without an archive penalty', () => {
  assert.deepEqual(sorted([row('live', 'Messenger', 168), row('archive', '', 24, { archived: true })]), ['archive', 'live']);
});
test('equal score prefers newer activity, exact ties preserve input order', () => {
  assert.deepEqual(sorted([row('older-prefix', 'messenger', 36), row('newer-body'), row('same-body')]), ['newer-body', 'same-body', 'older-prefix']);
  const input = [row('z'), row('a')];
  assert.deepEqual(sorted(input), ['z', 'a']);
  assert.deepEqual(input.map(s => s.id), ['z', 'a'], 'ranking does not mutate rows');
});
test('named bonuses and extra DISTINCT title words', () => {
  assert.equal(B.titleWordPrefix, 36 * HOUR); assert.equal(B.titleContains, 18 * HOUR);
  assert.equal(B.previewContains, 6 * HOUR); assert.equal(B.extraTitleWord, 6 * HOUR); assert.equal(B.bodyOnly, 0);
  const all = row('both', 'Messenger project', 5), partial = row('one', 'Messenger', 0);
  assert.deepEqual(sorted([partial, all], 'messenger project'), ['both', 'one']);
  assert.deepEqual(sorted([row('old', 'messenger', 40), row('new')], 'messenger messenger'), ['new', 'old']);
});
test('uses the injected live card clock, not stale updatedAt or status/pin priority', () => {
  const rows = [row('stale', 'messenger', 200, { updatedAt: new Date(NOW).toISOString(), status: 'running', pinned: true }), row('new')];
  assert.deepEqual(sorted(rows), ['new', 'stale']);
});
test('invalid timestamps rank deterministically after current results', () => {
  assert.deepEqual(sorted([row('invalid', '', 0, { activityAt: '' }), row('valid')]), ['valid', 'invalid']);
});
test('real list renderer mixes pinned/archived matches, labels status and pages once', () => {
  const rows = Array.from({ length: 55 }, (_, i) => row('r' + i, 'match', i, { section: i === 1 ? 'archive' : 'ready' }));
  const f = listFixture({ query: 'match', inputRows: rows, pinned: ['r54'] });
  let html = f.render();
  const ids = h => [...h.matchAll(/data-chopen="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids(html).length, 40);
  assert.deepEqual(ids(html).slice(0, 2), ['r0', 'r1']);
  assert.doesNotMatch(html, /ch-sec-h|data-sec="pinned"/);
  assert.equal((html.match(/data-secmore="search"/g) || []).length, 1);
  f.state.more.search = true; html = f.render();
  assert.equal(ids(html).length, 55); assert.doesNotMatch(html, /data-secmore/);
  assert.match(html, /ch-search-status">Archive/);
});
