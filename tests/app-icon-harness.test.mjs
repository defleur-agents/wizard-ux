import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { assertReadOnlyFixture } = createRequire(import.meta.url)('./notes-fixture-write-policy.cjs');
const source = readFileSync(new URL('./qa-app-icon-identity.cjs', import.meta.url), 'utf8');
test('icon browser fixture records real refused status before all dynamic handlers', () => {
  assert.ok(source.indexOf("if(req.method!=='GET')") < source.indexOf("if(p==='/wizard/v1/bootstrap')"));
  assert.match(source, /r\.status=status;res\.writeHead\(status/);
  assert.match(source, /r\.refusedBeforeHandlers=true;return send\(.*405\)/);
  const refused = (method,path) => ({method,path,status:405,refusedBeforeHandlers:true});
  const result = assertReadOnlyFixture([refused('POST','/wizard/v1/ui-preferences/seed'),refused('PUT','/wizard/thread-seen')]);
  assert.equal(result.acceptedMutations.length,0);
  for (const row of [refused('POST','/messenger/api/send'),refused('PUT','/notes/api/tree'),refused('POST','/unknown'),{...refused('POST','/wizard/v1/ui-preferences/seed'),status:200},{method:'PUT',path:'/wizard/thread-seen',status:405}]) assert.throws(()=>assertReadOnlyFixture([row]));
});
test('icon harness reuses working readiness, shortcut, selectors and skin hover settlement', () => {
  assert.match(source,/keyboard\.press\('Alt\+o'\)/);
  assert.match(source,/locator\('\.[n]m'/);
  assert.doesNotMatch(source,/networkidle|(?:Control|Meta)\+o/);
  assert.match(source,/window\.WizConfig\?\.live/);
  assert.match(source,/rowFor\(page,shell,'wizard-calendar'\)/);
  assert.match(source,/WizCore\.refreshApps\(\)/);
  assert.match(source,/report\.writePolicy=assertReadOnlyFixture\(requests\)/);
  assert.match(source,/serviceWorkers:'block'/);
});
test('Food follows actual platform admission instead of fabricating a picker row', () => {
  assert.match(source,/registry\.APP\[id\]/);
  assert.match(source,/WizardOSNative=\{usuals:\(\)=>JSON\.stringify\(\[\]\)\}/);
  assert.match(source,/shared-renderer-control-not-launcher/);
  assert.match(source,/desktop\.APP\.food\|\|desktop\.APPS\.some/);
  assert.match(source,/phoneOnly!==true/);
  assert.doesNotMatch(source,/force:\s*true|APP\.food\s*=|APPS\.push/);
  assert.match(source,/userAgent:'Mozilla\/5\.0 \(Linux; Android/);
  assert.match(source,/data-skinpick/);
  assert.match(source,/data-st-page="appearance"/);
  assert.match(source,/#dsettings/);
  assert.doesNotMatch(source,/WosSkin\.set\(/);
});
