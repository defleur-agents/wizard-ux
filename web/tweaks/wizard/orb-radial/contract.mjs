import assert from 'node:assert/strict';
export default async function check(f) {
  assert.ok(f.host.tweakState.includes('wizard/orb-radial'));
  await f.clear();
  assert.ok(!f.host.tweakState.includes('wizard/orb-radial'));
  assert.equal(f.ctx.window.WosOrbSwitcher, undefined);
}
