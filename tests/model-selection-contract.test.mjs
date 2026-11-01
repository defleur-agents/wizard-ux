import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = readFileSync(new URL('../web/core/chat-models.js', import.meta.url), 'utf8');
const A = { model: 'fixture-alpha', provider: 'fixture-one' }, B = { model: 'fixture-beta', provider: 'fixture-two' };
function fixture(fetchImpl) {
  const stored = new Map(), rows = new Map();
  const ctx = { console, crypto: webcrypto, AbortSignal, setTimeout, clearTimeout, document: { documentElement: { dataset: {} } },
    localStorage: { getItem: k => stored.get(k) || null, setItem: (k, v) => stored.set(k, v) },
    fetch: fetchImpl, WizLive: { session: id => rows.get(id), agentOf: () => '' } };
  ctx.window = ctx; vm.runInNewContext(source, ctx);
  const M = ctx.WosModels; M.ready = true; M.options = [{ value: A.model, provider: A.provider, isGlobalDefault: true }, { value: B.model, provider: B.provider }];
  rows.set('synthetic', { id: 'synthetic', ...A, modelLockAt: 7, selection: { ...A, version: 7, state: 'confirmed' } });
  return { M, rows };
}
function ack(route, version) { return new Response(JSON.stringify({ runtime: { ...route, model_lock: 'confirmed', selection_version: version } }), { headers: { 'Content-Type': 'application/json' } }); }
test('typed/attachment send snapshot carries the displayed provider, model and confirmed revision', () => {
  const { M } = fixture(); const r = M.snapshot('synthetic');
  assert.equal(r.model, A.model); assert.equal(r.provider, A.provider); assert.equal(r.selection_version, 7);
});
test('new draft default and explicit picker work without an existing thread lock', () => {
  const { M } = fixture();
  assert.equal(M.snapshot('').model, A.model); assert.equal(M.snapshot('', B).model, B.model);
  assert.equal(M.snapshot('', B).selection_version, 0);
});
test('picker POST includes previous revision; pending acknowledgement blocks Send', async () => {
  let release, body;
  const { M } = fixture(async (_url, init) => { body = JSON.parse(init.body); return new Promise(resolve => { release = resolve; }); });
  const work = M.setThreadModel('synthetic', { value: B.model, provider: B.provider });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(body.selection_version, 7); assert.ok(body.selection_request_id);
  assert.throws(() => M.snapshot('synthetic'), /still saving/);
  release(ack(B, 8)); await work;
  assert.equal(M.snapshot('synthetic').model, B.model); assert.equal(M.snapshot('synthetic').selection_version, 8);
});
test('a stale same-model list response cannot erase a newer provider choice', async () => {
  const sameModel = { ...A, provider: B.provider };
  const { M, rows } = fixture(async () => ack(sameModel, 8));
  await M.setThreadModel('synthetic', { value: A.model, provider: B.provider });
  const stale = { id: 'synthetic', ...A, modelLockAt: 7 }; rows.set('synthetic', stale); M.reconcile([stale]);
  assert.equal(M.snapshot('synthetic').provider, B.provider); assert.equal(M.snapshot('synthetic').selection_version, 8);
});
test('failed or lost picker ACK blocks sending until selection can be confirmed', async () => {
  const { M } = fixture(async () => { throw new TypeError('Connection lost'); });
  await assert.rejects(M.setThreadModel('synthetic', { value: B.model, provider: B.provider }));
  assert.throws(() => M.snapshot('synthetic'), /not confirmed/);
});
test('native recording recovery retains original revision after later picker change', async () => {
  const { M } = fixture(async () => ack(B, 8));
  const captured = M.snapshot('synthetic'); M.keepVoiceRoute('synthetic-native', captured);
  await M.setThreadModel('synthetic', { value: B.model, provider: B.provider });
  const recovered = M.voiceRoute('synthetic-native');
  assert.equal(recovered.model, A.model); assert.equal(recovered.provider, A.provider); assert.equal(recovered.selection_version, 7);
});
test('outbox source carries the captured revision in item and immutable send/steer envelopes', () => {
  const outbox = readFileSync(new URL('../web/outbox.js', import.meta.url), 'utf8');
  assert.match(outbox, /selection_version: o\.selection_version/);
  assert.match(outbox, /selection_version: it\.selection_version, require_model_lock: true/);
});
test('an unexpected actual provider never matches merely because requested metadata matches', () => {
  const { M } = fixture(); assert.equal(M.matchesRuntime({ ...B, model: A.model, requested: A }, A), false);
});
