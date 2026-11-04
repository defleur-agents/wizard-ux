import assert from 'node:assert/strict';
// The CSS switch, plus one Settings switch that picks whether long replies start collapsed (default) or expanded.
export default async function check(f) {
  assert.ok(f.doc.head.children.some(n => n.href?.endsWith('reply-summary/tweak.css')));
  assert.equal(f.ctx.window.WosSkinHost.replySummaryStart, 'collapsed');
  await f.clear(); assert.equal(f.doc.head.children.length, 0); assert.equal(f.ctx.window.WosSkinHost.replySummaryStart, 'collapsed');
}
