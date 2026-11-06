// REUSE qa-closed-shell transport and real shell/SDK fixtures; EXTEND only their exact boot contracts.
// Opaque about:blank init runs are not storage failures; real http(s) errors must still fail QA.
// Browser/renderer acceptance stays on Forum. These tests mock transport, never owner data.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../tools/qa-closed-shell.cjs', import.meta.url), 'utf8');
function load() {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, __dirname: path.resolve('tools'), process: { env: { QA_TREE: process.cwd(), QA_OUT: process.env.TMPDIR || os.tmpdir() } }, console, URL,
    require: name => name === './qa-playwright.cjs' ? { devices: { 'Pixel 7': {} } } : require(name) });
  return module.exports;
}
test('AI apps wait is strict per shell, not truthy or phone-only', async () => {
  const closed = load(); let predicate;
  const p = { waitForFunction: async (fn, phone, options) => { predicate = fn; assert.equal(phone, false); assert.equal(options.timeout, 10000); }, evaluate: async () => ({}), frames: () => [] };
  await closed.waitForAiApps(p, false);
  for (const phone of [false, true]) for (const shell of ['desktop', 'phone']) for (const aiApps of ['desktop', 'on', '', 'wrong']) for (const present of [true, false]) {
    const got = vm.runInNewContext(`(${predicate})(${phone})`, { window: { WosExperience: present ? {} : undefined }, document: { documentElement: { dataset: { shell, aiApps } } } });
    assert.equal(got, present && shell === (phone ? 'phone' : 'desktop') && aiApps === (phone ? 'on' : 'desktop'));
  }
  for (const file of ['qa-titlebar-lifecycle.cjs', 'qa-sonnet-compact.cjs']) {
    const s = readFileSync(new URL('../tools/' + file, import.meta.url), 'utf8');
    assert(s.includes('closed.waitForAiApps(p,phone)')); assert(!s.includes("dataset.aiApps==='on'"));
  }
  assert.match(readFileSync(new URL('../web/layouts/ai-apps/desktop.js', import.meta.url), 'utf8'), /root\.dataset\.aiApps = 'desktop'/);
  assert.match(readFileSync(new URL('../web/layouts/ai-apps/layout.js', import.meta.url), 'utf8'), /root\.dataset\.aiApps = 'on'/);
});
test('failed bounded wait retains original error and useful shell/frame diagnostics', async () => {
  const closed = load(), error = new Error('synthetic boot timeout');
  const state = { location: 'http://wizard-qa.invalid/wizard-os-home/desktop.html', experience: 'object', shell: 'desktop', aiApps: 'wrong' };
  const p = { waitForFunction: async () => { throw error; }, evaluate: async () => state, frames: () => [{ url: () => state.location }] };
  await assert.rejects(closed.waitForAiApps(p, false), e => e === error);
  assert.deepEqual(JSON.parse(JSON.stringify(closed.report.bootDiagnostics)), [{ phone: false, ...state, frameUrls: [state.location], pageErrors: [] }]);
});
test('all storage seeds skip opaque documents but never swallow real-origin storage failures', async () => {
  const closed = load(); let seed;
  const page = { on() {}, clock: { install: async () => {} }, goto: async () => {}, waitForFunction: async () => {}, evaluate: async fn => fn.toString().includes('WosSkin.current') ? 'nebula' : false };
  const c = { routeWebSocket: async () => {}, addInitScript: async fn => { seed = fn; }, route: async () => {}, newPage: async () => page };
  closed.setBrowser({ newContext: async () => c }); await closed.boot(false);
  const seeds = [seed.toString()];
  for (const file of ['qa-titlebar-lifecycle.cjs', 'qa-sonnet-compact.cjs']) {
    const s = readFileSync(new URL('../tools/' + file, import.meta.url), 'utf8');
    const match = s.match(/c\.addInitScript\((phone=>\{[^\n]+\}),phone\)/); assert(match); seeds.push(match[1]);
  }
  for (const fn of seeds) for (const protocol of ['about:', 'data:', 'file:', 'http:', 'https:']) {
    const w = {}; w.top = w;
    const context = vm.createContext({ window: w, top: w, location: { protocol } });
    vm.runInContext("Object.defineProperty(globalThis,'localStorage',{get(){throw Error('real origin denied storage')}})", context);
    const run = () => vm.runInContext(`(${fn})(false)`, context);
    if (/^https?:$/.test(protocol)) assert.throws(run, /real origin denied storage/); else assert.doesNotThrow(run);
  }
});
test('Messenger inbox has exact empty feed contract; no arbitrary API or owner writes admitted', async () => {
  const closed = load(); let route;
  const page = { on() {}, clock: { install: async () => {} }, goto: async () => {}, waitForFunction: async () => {}, evaluate: async fn => fn.toString().includes('WosSkin.current') ? 'nebula' : false };
  const c = { routeWebSocket: async () => {}, addInitScript: async () => {}, route: async (_, fn) => { route = fn; }, newPage: async () => page };
  closed.setBrowser({ newContext: async () => c }); await closed.boot(false);
  async function request(method, url) {
    let result;
    await route({ request: () => ({ method: () => method, url: () => new URL(url, 'http://wizard-qa.invalid').href }), fulfill: async v => { result = v; }, abort: async v => { result = { abort: v }; } });
    return result;
  }
  assert.deepEqual(JSON.parse((await request('GET', '/messenger/api/inbox')).body), { inbox: 1, items: [] });
  assert.equal((await request('GET', '/messenger/api/inbox?extra=1')).status, 451);
  assert.equal((await request('GET', '/other/api/inbox')).status, 451);
  assert.equal((await request('POST', '/messenger/api/inbox')).status, 403);
  assert.equal((await request('GET', 'https://owner.invalid/messenger/api/inbox')).abort, 'blockedbyclient');
  assert.equal(closed.report.unknown.length, 3); assert.equal(closed.report.refusedWrites.length, 1);
});
