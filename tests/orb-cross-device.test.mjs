import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fixture, read } from './fixtures/tweaks.mjs';

// An already-ON package, not an OFF/ON toggle. Real host + real tweak setup;
// only the network/module boundary is controlled. This is not handset telemetry.
function client(mode = 'recover') {
  const f = fixture();
  let starts = 0, disposals = 0, release;
  const imports = [];
  f.host._test.setImporter(async url => {
    if (!url.includes('/core/orb-switcher.js')) {
      const src = read('web/tweaks/wizard/orb-radial/tweak.js').replace('export default function setup', 'function setup');
      return vm.runInNewContext(`(() => { ${src}; return {default:setup}; })()`, f.ctx);
    }
    imports.push(url);
    if (mode === 'delayed') await new Promise(r => { release = r; });
    if (mode === 'fail' || (mode === 'recover' && imports.length === 1)) throw new TypeError('Failed to fetch dynamically imported module');
    return { default: () => { starts++; return { dispose() { disposals++; } }; } };
  });
  return { f, imports, get starts() { return starts; }, get disposals() { return disposals; }, release: () => release?.() };
}

test('already ON: independent client retries a failed lazy module without a toggle; healthy client stays single', async () => {
  for (const mode of ['recover', 'healthy']) {
    const c = client(mode);
    await c.f.mount('wizard/orb-radial');
    assert.equal(c.starts, 1, `${mode}: active membership must have an installed handler before load settles`);
    assert.deepEqual(Array.from(c.f.host.tweakState), ['wizard/orb-radial']);
    if (mode === 'recover') {
      assert.equal(c.imports.length, 2);
      assert.notEqual(c.imports[0], c.imports[1], 'an ES module rejection is cached by URL; retry needs a distinct key');
    } else assert.equal(c.imports.length, 1);
    await c.f.clear();
    assert.equal(c.disposals, 1);
  }
});

test('already ON: unrecoverable lazy failure cannot report an active radial; explicit refresh can recover', async () => {
  const c = client('fail');
  await c.f.mount('wizard/orb-radial');
  assert.equal(c.starts, 0);
  assert.deepEqual(Array.from(c.f.host.tweakState), []);
  assert.match(c.f.toasts.join('\n'), /wizard\/orb-radial turned off.*Failed to fetch/);
  c.f.host._test.setImporter(async url => url.includes('/core/') ? { default: () => { c.f.ctx.window.handler = true; return { dispose() {} }; } } : { default: api => api.orb.switcher() });
  await c.f.mount('wizard/orb-radial');
  assert.equal(c.f.ctx.window.handler, true);
  await c.f.clear();
});

test('turning OFF while an already-ON lazy load is unresolved cannot resurrect a handler', async () => {
  const c = client('delayed');
  const pending = c.f.mount('wizard/orb-radial');
  while (!c.imports.length) await new Promise(r => setImmediate(r));
  await c.f.clear();
  c.release(); await pending;
  assert.equal(c.starts, 0);
  assert.deepEqual(Array.from(c.f.host.tweakState), []);
});
