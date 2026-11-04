// Wizard Files is the active backend. When the separate owner-facing Files screen exists,
// launchers hide the duplicate provider while direct app lookup remains available.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const apps = readFileSync(process.env.APPS_FILE || new URL('../web/core/apps.js', import.meta.url), 'utf8');
const kindsJs = readFileSync(new URL('../web/core/app-kinds.js', import.meta.url), 'utf8');

async function shell(installed, nativeLinks = []) {
  const storage = new Map();
  const window = {
    WizCore: { norm: s => s.toLowerCase() },
    WizConfig: { endpoint: () => '/apps' },
    WizLauncher: {
      ready: Promise.resolve(),
      get: key => key === 'nativeLinks' ? nativeLinks : [],
      onChange() {},
    },
    dispatchEvent() {},
  };

  const ctx = {
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
    fetch: async () => ({ ok: true, json: async () => ({ apps: installed }) }),
  };
  vm.runInNewContext(apps, ctx);
  vm.runInNewContext(kindsJs, ctx);
  await window.WizCore.appsLoaded();
  const { APPS, APP } = window.WizCore.apps('mobile');
  return { window, APP, groups: window.WosAppKinds.kinds(APPS, APP) };
}

const files = {
  id: 'files', name: 'Files', url: '/files/', source: 'apps.json',
  type: 'view', category: 'system', provides: ['files'],
};
const provider = {
  id: 'wizard-files', name: 'Wizard Files', url: '/wizard-files/', source: 'apps.json',
  type: 'service', category: 'system', provides: ['files'],
};
const nativeFiles = {
  id: 'files', name: 'Files', href: 'intent://files',
};

test('owner-facing Files hides Wizard Files from launchers without disabling it', async () => {
  const { window, APP, groups } = await shell([files, provider]);
  assert.equal(APP['wizard-files'].url, '/wizard-files/');
  assert.equal(window.WizCore.isMaintenanceApp(APP['wizard-files']), true);
  assert.ok(groups.apps.some(a => a.id === 'files'));
  assert.ok(!groups.apps.some(a => a.id === 'wizard-files'));
});

test('Wizard Files returns to launchers when no separate Files screen is installed', async () => {
  const { window, APP, groups } = await shell([provider]);
  assert.equal(window.WizCore.isMaintenanceApp(APP['wizard-files']), false);
  assert.ok(groups.apps.some(a => a.id === 'wizard-files'));
});

test('native Files hides Wizard Files while keeping both app records addressable', async () => {
  const { window, APP, groups } = await shell([provider], [nativeFiles]);
  assert.equal(APP.files.href, 'intent://files');
  assert.equal(APP['wizard-files'].url, '/wizard-files/');
  assert.equal(window.WizCore.isMaintenanceApp(APP['wizard-files']), true);
  assert.ok(!groups.apps.some(a => a.id === 'wizard-files'));
});
