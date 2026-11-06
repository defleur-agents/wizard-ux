import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { modelContext } from './fixtures/chats-list-model.mjs';
import '../web/core/chats-list-model.js';
const M = globalThis.WizChatsListModel;
const at = n => `2026-11-06T${String(n).padStart(2, '0')}:00:00Z`;
const ids = rows => Array.from(rows, r => r.id);
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const rows = [{ id: 'z', title: 'Zulu', at: at(9) }, { id: 'a-old', title: 'alpha', at: at(1) },
  { id: 'b', title: 'Beta', at: at(8) }, { id: 'a-new', title: 'ALPHA', at: at(7) },
  { id: 'untitled', title: '', at: at(2) }, { id: 'pin', title: 'ZZ pin', pinned: true, at: at(3) }];
test('Working defaults A to Z, case insensitive with newest ties, visible untitled fallback, pins first and no mutation', () => {
  const before = JSON.stringify(rows);
  for (const order of [undefined, null, 'bad', 'priority', 'alphabetical']) assert.deepEqual(ids(M.workingSort(rows, order)), ['pin', 'a-new', 'a-old', 'b', 'untitled', 'z']);
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(M.workingSort(), []);
});
test('emoji and accented titles follow locale collation of the actual visible title', () => {
  const input = [{ id: 'rocket', title: '🚀 Work' }, { id: 'a', title: 'ápple' }, { id: 'sparkle', title: '✨ Work' }, { id: 'z', title: 'zebra' }, { id: 'empty' }];
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const expected = input.slice().sort((a, b) => collator.compare(a.title || 'New chat', b.title || 'New chat'));
  assert.deepEqual(ids(M.workingSort(input)), ids(expected));
});
test('Newest and Oldest reuse Ready time ordering without attention or snooze priority; pins remain first', () => {
  assert.deepEqual(ids(M.workingSort(rows, 'newest')), ['pin', 'z', 'b', 'a-new', 'untitled', 'a-old']);
  assert.deepEqual(ids(M.workingSort(rows, 'oldest')), ['pin', 'a-old', 'untitled', 'a-new', 'b', 'z']);
  const equal = [{ id: 'b', title: 'Beta', state: 'approval', at: at(1) }, { id: 'a', title: 'Alpha', snoozed: true, at: at(1) }];
  for (const order of ['oldest', 'newest']) assert.deepEqual(ids(M.workingSort(equal, order)), ['a', 'b']);
});
test('stock renderer uses the same Working comparator and raw session cardAt', () => {
  const src = read('web/core/chats.js'), c = modelContext({ window: {}, LIVE: { cardAt: s => s.at, workingOrder: () => 'alphabetical' } });
  vm.runInContext(src.slice(src.indexOf('  const workingOrdered ='), src.indexOf('  const workingSortControl =')) + '\nthis.sort = workingOrdered;', c);
  assert.deepEqual(ids(c.sort(rows.filter(r => !r.pinned))), ['a-new', 'a-old', 'b', 'untitled', 'z']);
});
test('Working time sort falls back for sessions without request clocks, without changing Ready', () => {
  const live = { cardAt: s => s.requestAt || '' }, facts = { live, chats: {} };
  const sessions = [{ id: 'z', title: 'Zulu', updatedAt: at(9) }, { id: 'a', title: 'alpha', updatedAt: at(1) }, { id: 'b', title: 'Beta', createdAt: at(8) }];
  const projected = sessions.map(s => M.sessionRow(s, 'working', facts));
  assert.deepEqual(ids(M.workingSort(projected, 'newest')), ['z', 'b', 'a']);
  assert.deepEqual(ids(M.workingSort(projected, 'oldest')), ['a', 'b', 'z']);
  assert.equal(M.sessionRow(sessions[0], 'ready', facts).at, '', 'Ready clock unchanged');
  assert.equal(M.workingAt({ requestAt: at(2), updatedAt: at(9) }, live), at(2), 'request clock remains authoritative');
});
test('every surface has a separate Working control, and Settings uses the shared registry', () => {
  assert.match(read('web/layouts/ai-apps/desktop.js'), /openSortMenu\(sort, 'working-sort'\)/);
  assert.match(read('web/layouts/ai-apps/layout.js'), /'aria-label': 'Sort Working'/);
  assert.match(read('web/core/settings.js'), /id: 'working-order', page: 'chats'/);
  assert.match(read('web/core/chats.js'), /data-working-order/);
  assert.match(read('web/live.js'), /workingOrder: \['wos.chats.workingOrder.v1'/);
});
