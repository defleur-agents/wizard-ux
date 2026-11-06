import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const live = process.env.QA_BASELINE ? execFileSync('git', ['show', `${process.env.QA_BASELINE}:web/live.js`], { encoding: 'utf8' }) : readFileSync(new URL('../web/live.js', import.meta.url), 'utf8');
for (const accepted of [true, false]) test(`Ready Done paints immediately but ${accepted ? 'persists matching Seen' : 'rolls back stale Seen'}`, async () => {
  const row = { id: 't', archived: false }, writes = [];
  const ctx = { OVER: new Map(), hasNew: () => false, readRestored: () => ({}), writeRestored() {},
    req: async (path, init) => { writes.push({path, body: JSON.parse(init.body)}); }, aq: () => '', J: {},
    Date, setTimeout() {}, encodeURIComponent };
  const methods = vm.runInNewContext('({' + live.slice(live.indexOf('    busy(id)'), live.indexOf('    // Stop exactly the watcher')) + '})', ctx);
  const L = { ...methods, session: () => row, seenOf: () => null, emit() {}, refresh() {} };
  let confirm; const confirmed = new Promise(r => { confirm = r; });
  const result = L.archive('t', { confirmed });
  assert.equal(row.archived, true, 'same-frame Done projection');
  assert.equal(writes.length, 0, 'no archive request before Seen validates');
  confirm(accepted);
  assert.equal(await result, accepted);
  assert.equal(row.archived, accepted);
  assert.equal(writes.length, accepted ? 1 : 0);
  if (accepted) { assert.equal(writes[0].path, '/wizard/hermes/api/sessions/t'); assert.deepEqual(writes[0].body, { archived: true }); }
});
