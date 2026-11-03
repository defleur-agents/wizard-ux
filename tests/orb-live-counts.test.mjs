import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

test('orb exposes authoritative uncapped live counts for appearance layers', () => {
  assert.match(app, /const m = \[\.\.\.L\.needs[\s\S]*?\]\.slice\(0, 8\);/);
  assert.match(app, /moons\.dataset\.needs = String\(L\.needs\.length\);/);
  assert.match(app, /moons\.dataset\.working = String\(L\.working\.length\);/);
  assert.match(app, /moons\.dataset\.ready = String\(L\.ready\.length\);/);
  assert.ok(
    app.indexOf('moons.dataset.working = String(L.working.length);') < app.indexOf('moons.innerHTML ='),
    'the authoritative working count must be exposed independently of the capped moon nodes',
  );
});
