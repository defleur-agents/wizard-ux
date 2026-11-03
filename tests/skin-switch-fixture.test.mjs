import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { observeAppearanceTaps } = require('../tools/qa-skin-switch-fixture.cjs');
const { ownerRead } = require('../tools/qa-desktop-frame-fixture.cjs');

test('same-dispatch observer samples after delegated handler, never pre-handler capture microtask', async () => {
  const listeners = []; let pending = false;
  const tile = { classList: { contains: () => pending }, getAttribute: () => pending ? 'true' : null, get disabled() { return pending; }, querySelector: s => s === '.skp-mini' ? {} : { innerText: 'Wizard' } };
  const ctx = { queueMicrotask, addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }), getComputedStyle: () => ({ animationName: 'st-busy-spin', width: '16px', opacity: '1' }) };
  ctx.window = ctx; vm.runInNewContext(`(${observeAppearanceTaps.toString()})()`, ctx);
  const event = { target: { closest: () => tile }, isTrusted: true };
  assert.deepEqual(listeners.map(l => l.capture), [true, false]);
  listeners[0].fn(event); await Promise.resolve(); // Native per-listener checkpoint, before target handler.
  assert.equal(ctx.__tapPhases[0].pending, false);
  assert.equal(ctx.__tapFrames.length, 0, 'pre-handler state is diagnostic, not acceptance');
  pending = true; // Real delegated handler sets state synchronously.
  listeners[1].fn(event);
  assert.equal(ctx.__tapFrames[0].phase, 'bubble-same-dispatch');
  assert.equal(ctx.__tapFrames[0].pending, true);
  assert.equal(ctx.__tapFrames[0].busy, 'true');
  assert.equal(ctx.__tapFrames[0].disabled, true);
  pending = false;
  assert.equal(ctx.__tapFrames[0].pending, true, 'immutable event-time sample');
});

test('observer does not make a missing product acknowledgement pass', () => {
  const listeners = [];
  const el = { classList: { contains: () => false }, getAttribute: () => null, disabled: false, querySelector: () => null };
  const ctx = { queueMicrotask, addEventListener: (_, fn, capture) => listeners.push({ fn, capture }), getComputedStyle: () => ({ opacity: '1' }) };
  ctx.window = ctx; vm.runInNewContext(`(${observeAppearanceTaps.toString()})()`, ctx);
  listeners.find(l => !l.capture).fn({ target: { closest: () => el }, isTrusted: true });
  assert.equal(ctx.__tapFrames[0].pending, false);
  assert.equal(ctx.__tapFrames[0].busy, null);
});

test('established owner bootstrap uses real Welcome contracts without hiding it', () => {
  assert.equal(ownerRead('/wizard/v1/setup').first_run, false);
  const models = ownerRead('/wizard/hermes/api/model/options');
  assert.equal(models.providers[0].authenticated, true);
  assert.equal(models.provider, models.providers[0].slug);
  assert.ok(models.providers[0].models.some(m => m.id === models.model));
});
