// Pages is an agent-facing system utility. It belongs under Agent apps, not the owner's main Apps grid.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const appsJs = readFileSync(new URL('../web/core/apps.js', import.meta.url), 'utf8');
const kindsJs = readFileSync(new URL('../web/core/app-kinds.js', import.meta.url), 'utf8');

async function boot() {
  const storage = new Map();
  const window = {
    WizCore: { norm: s => String(s).toLowerCase() },
    WizConfig: { endpoint: () => '/apps' },
    WosPages: { available: true, ready: Promise.resolve(true) },
    WosSkinHost: { inboxThreads: false },
    dispatchEvent() {},
  };
  const context = {
    window,
    document: { hidden: false, addEventListener() {} },
    CustomEvent: class {},
    URL,
    location: new URL('https://wizard.test/'),
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    addEventListener() {},
    fetch: async () => ({ ok: true, json: async () => ({ apps: [] }) }),
  };
  vm.runInNewContext(appsJs, context);
  vm.runInNewContext(kindsJs, context);
  await window.WizCore.appsLoaded();
  const { APPS, APP } = window.WizCore.apps('mobile');
  return { page: APP.pages, groups: window.WosAppKinds.kinds(APPS, APP) };
}

test('Pages is explicitly grouped with Agent apps and excluded from Apps', async () => {
  const { page, groups } = await boot();
  assert.equal(page.agentApp, true);
  assert.equal(groups.apps.some(app => app.id === 'pages'), false);
  assert.equal(groups.wiz.some(app => app.id === 'pages'), true);
});
