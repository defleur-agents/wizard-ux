import assert from 'node:assert/strict';
// Mounts against the shell fixture: the package replaces the notify-routing part (version 1) and hands it back on teardown.
export default async function check(f) {
  const w = f.ctx.window, seen = [];
  w.WosBell.routing = { version: 1, replace(impl, opts) { seen.push(['replace', opts.version, opts.owner, Object.keys(impl).sort()]); return () => seen.push(['released']); } };
  await f.mount('miguel/notification-levels');
  assert.equal(seen[0][0], 'replace'); assert.equal(seen[0][1], 1); assert.equal(seen[0][2], 'miguel/notification-levels');
  for (const m of ['route', 'accepts', 'choices', 'quiet', 'carried', 'sourceOf', 'attention', 'groups', 'attach']) assert.ok(seen[0][3].includes(m), m);
  await f.clear();
  assert.deepEqual(seen.at(-1), ['released']);
  delete w.WosBell.routing;
}
