import assert from 'node:assert/strict';
// Phone: wears the AI apps layout; off brings the stock phone back. Desktop: never wears it (tests/ai-apps-view.test.mjs).
export default async function check(f) {
  assert.equal(f.host.layout, 'ai-apps');
  assert.equal(f.doc.documentElement.dataset.layout, 'ai-apps');
  await f.clear();
  assert.equal(f.host.layout, 'classic');
  assert.equal(f.doc.documentElement.dataset.layout, undefined);
}
