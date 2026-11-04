import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fx = require('../tools/qa-proof-fixture.cjs');
const source = readFileSync(new URL('../qa-offline-popup.cjs', import.meta.url), 'utf8');
const captureNames = ['orb-tap-starts-real-fake-mic', 'capture-hides-checks', 'capture-navigation-suppressed'];
// Execute the actual capture branch and actual emitted result, not a parallel report builder.
async function captureCase(phone, captured) {
  const begin = source.indexOf('// Actual pointer delivery');
  const end = source.indexOf('        await navigate(); await pillOnly();', begin);
  const emit = source.match(/results\.push\(\{[^\n]+\}\);/)[0];
  let pillCalls = 0, navigations = 0;
  const page = {
    locator: () => ({ boundingBox: async () => ({ x: 0, y: 0, width: 10, height: 10 }), click: async () => {} }),
    mouse: { click: async () => {} },
    waitForFunction: async fn => { if (String(fn).includes("!== 'idle'") && !captured) throw Object.assign(Error('no capture'), { name: 'TimeoutError' }); },
    evaluate: async () => { navigations++; }, waitForTimeout: async () => {}, screenshot: async () => {}
  };
  const ctx = { phone, page, pillOnly: async () => { pillCalls++; }, checks: [], notRun: [], results: [],
    shell: phone ? 'phone' : 'desktop', skin: 'nebula', geometry: {}, start: Date.now(), liveReads: 0, blockedWrites: 0, assets: {}, OUT: '.', path: require('node:path') };
  await vm.runInNewContext(`(async()=>{${source.slice(begin, end)}\n${emit}})()`, ctx);
  return { row: ctx.results[0], pillCalls, navigations };
}

test('desktop without capture reports none of the non-executed capture checks as passed', async () => {
  const { row, pillCalls, navigations } = await captureCase(false, false);
  assert.equal(row.captured, false);
  for (const check of captureNames) {
    assert.ok(!row.checks.includes(check), `${check} did not execute`);
    assert.match(row.notRun.find(r => r.check === check)?.reason || '', /desktop mic needs an open chat target/i);
  }
  assert.ok(!row.checks.includes('pill-tap-opens-under-status-bar'));
  assert.equal(pillCalls, 0, 'outside-click dismissal is not capture-hides-checks evidence');
  assert.equal(navigations, 0);
});

for (const phone of [true, false]) test(`${phone ? 'phone' : 'desktop'} actual capture records only executed capture checks`, async () => {
  const { row, pillCalls, navigations } = await captureCase(phone, true);
  assert.equal(row.captured, true);
  assert.deepEqual(Array.from(row.checks), captureNames);
  assert.equal(row.notRun.length, 0);
  assert.equal(pillCalls, 2);
  assert.equal(navigations, phone ? 2 : 1);
});

test('phone capture timeout remains a hard failure', async () => {
  await assert.rejects(() => captureCase(true, false), /no capture/);
});

test('status-bar geometry is passed only after phone assertions execute; desktop records notRun', () => {
  const begin = source.indexOf('        if (phone) { assert.ok(geometry.card.y');
  const end = source.indexOf('        assert.ok(/', begin);
  assert.ok(begin >= 0 && end > begin);
  for (const phone of [true, false]) {
    const ctx = { phone, assert, geometry: { card: { y: 20, bottom: 80 }, orb: { top: 100 } }, pillBox: { y: 0, height: 20 }, checks: [], notRun: [] };
    vm.runInNewContext(source.slice(begin, end), ctx);
    assert.equal(ctx.checks.includes('pill-tap-opens-under-status-bar'), phone);
    if (!phone) assert.match(ctx.notRun[0].reason, /phone-only geometry/i);
  }
});

test('proof fixtures reject unknown paths, foreign origins and arbitrary message targets', () => {
  for (const p of ['/unknown', '/wizard/v1/unknown', '/unknown/messages', '/wizard/hermes/api/sessions/owner-thread/messages', 'https://owner.example/wizard/v1/setup']) {
    assert.throws(() => fx.read(p), /Uncatalogued fixture request|Non-fixture origin/);
  }
});

test('known-empty proof endpoints are explicit entries in the shared closed catalogue', () => {
  assert.deepEqual(fx.read('/wizard/thread-dispositions'), { state: {} });
  assert.deepEqual(fx.read('/wizard/v1/boomerangs'), { reminders: [] });
  assert.equal(fx.read('/wizard/hermes/api/sessions/tap-thread/messages').data.length, 2);
  assert.equal(fx.read('/wizard/hermes/api/sessions').data[0].id, 'tap-thread');
  assert.throws(() => fx.read('/wizard/v1/setup', 'POST'), /Uncatalogued fixture request/);
});
