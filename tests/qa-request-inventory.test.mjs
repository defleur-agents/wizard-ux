import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url).pathname;
const fx = require('../tools/qa-proof-fixture.cjs');
const { scan } = require('../tools/qa-request-inventory.cjs');
const inventory = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/proof-request-inventory.json'), 'utf8'));
const HARNESSES = ['qa-instant-ui-taps.cjs', 'qa-offline-popup.cjs', 'qa-search-archive-routed.cjs'];

test('every network path in web/ is classified in the committed inventory (and nothing stale)', () => {
 const found = scan(root), known = new Set(Object.keys(inventory.paths));
 const missing = [...found.keys()].filter(p => !known.has(p)).map(p => `${p}  (first seen in ${found.get(p)})`);
 assert.deepEqual(missing, [], 'Uncatalogued request path(s). Add each to tests/fixtures/proof-request-inventory.json as catalogued (with a synthetic response in tools/qa-proof-fixture.cjs) or not-exercised (with a reason).');
 assert.deepEqual([...known].filter(p => !found.has(p)), [], 'Inventory lists a path that no longer appears in web/');
 assert.deepEqual(inventory.harnesses, HARNESSES);
});

test('catalogued paths answer with synthetic data; not-exercised paths are refused', () => {
 fx.resetRefusals();
 let catalogued = 0;
 for (const [p, row] of Object.entries(inventory.paths)) {
  assert.ok(['catalogued', 'not-exercised'].includes(row.status), p);
  if (row.status === 'catalogued') {
   assert.ok(row.examples.length, p); catalogued++;
   for (const { method, path: example } of row.examples) {
    const answer = fx.response(example, method);
    assert.notEqual(answer.status, 451, `${method} ${example} must be catalogued`);
    assert.ok(typeof answer.body === 'string' || Buffer.isBuffer(answer.body));
   }
  } else {
   assert.ok(row.note && row.kind, p);
   const answer = fx.response(p.replaceAll('{}', 'x').replace('/{app}', '/x'), row.kind === 'write-or-stream' ? 'POST' : 'GET');
   assert.equal(answer.status, 451, `${p} is not exercised and must be refused`);
  }
 }
 assert.ok(catalogued >= 30);
 assert.equal(fx.refused().length, Object.values(inventory.paths).filter(r => r.status === 'not-exercised').length);
 fx.resetRefusals();
});

test('unknown requests are refused (451, no data) and ALL of them are collected, not just the first', () => {
 fx.resetRefusals();
 const a = fx.response('/wizard/never/seen-one', 'GET'), b = fx.response('/wizard/v1/ui-preferences/other', 'POST'), c = fx.response('/morning/ready.json', 'DELETE');
 for (const r of [a, b, c]) { assert.equal(r.status, 451); assert.doesNotMatch(r.body, /"data"|"state"/); }
 fx.response('/wizard/never/seen-one', 'GET');
 assert.deepEqual(fx.refused().map(r => [r.request, r.count]), [['DELETE /morning/ready.json', 1], ['GET /wizard/never/seen-one', 2], ['POST /wizard/v1/ui-preferences/other', 1]]);
 assert.equal(fx.response('/wizard/v1/bootstrap', 'GET').status, 200);
 fx.resetRefusals();
});

test('a run with refusals continues, then exits non-zero with the full list and refused-*.json; a clean run exits 0', () => {
 const dir = mkdtempSync(path.join(tmpdir(), 'refused-'));
 try {
  const script = body => `const fx=require(${JSON.stringify(path.join(root, 'tools/qa-proof-fixture.cjs'))});fx.failAtExit(${JSON.stringify(dir)});${body}`;
  const bad = spawnSync(process.execPath, ['-e', script(`fx.response('/wizard/one','GET');fx.response('/wizard/two','POST');console.log('still running');process.exit(0)`)], { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.match(bad.stdout, /still running/);
  assert.match(bad.stderr, /REFUSED 2 uncatalogued/); assert.match(bad.stderr, /GET \/wizard\/one/); assert.match(bad.stderr, /POST \/wizard\/two/);
  const file = readdirSync(dir).find(f => f.startsWith('refused-'));
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, file), 'utf8')).map(r => r.request), ['GET /wizard/one', 'POST /wizard/two']);
  const clean = spawnSync(process.execPath, ['-e', script(`fx.response('/wizard/v1/bootstrap','GET')`)], { encoding: 'utf8' });
  assert.equal(clean.status, 0);
  // A harness that already failed keeps its own code.
  const failed = spawnSync(process.execPath, ['-e', script(`process.exitCode=2`)], { encoding: 'utf8' });
  assert.equal(failed.status, 2);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('all three harnesses use the shared collect-all fence and never answer unknown paths with a silent success', () => {
 for (const name of HARNESSES) {
  const src = readFileSync(path.join(root, name), 'utf8');
  assert.match(src, /fx\.failAtExit\(\)/, name);
  assert.doesNotMatch(src, /Uncatalogued/, name);
 }
 const instant = readFileSync(path.join(root, HARNESSES[0]), 'utf8');
 assert.doesNotMatch(instant, /return json\(\{\}\);/);
 assert.ok(!existsSync(path.join(root, 'qa-hosted-notes-read.cjs.disabled')));
});
