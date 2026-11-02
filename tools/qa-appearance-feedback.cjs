// Real shell, isolated API fixture: no private reads or live writes reach qa-origin.
// PW=<playwright module> node tools/qa-appearance-feedback.cjs <origin> <out>
// Optional QA_CASES/QA_SHELLS/QA_SKINS comma-separated filters for a bounded preflight.
const { chromium, devices } = require(process.env.PW || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const BASE = process.argv[2], OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const checks = [], errors = [], blocked = [];
const pick = (key, defaults) => process.env[key]?.split(',') || defaults;
const controls = '[data-skinfamily], [data-skinpick], [data-ownskin], [data-newskin], [data-tweak-toggle], [data-tweakauthor]';
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {}) });
  try {
    for (const shell of pick('QA_SHELLS', ['phone', 'desktop'])) for (const skin of pick('QA_SKINS', ['nebula', 'obsidian'])) for (const kind of pick('QA_CASES', ['family', 'colour', 'tweak', 'all', 'own', 'new'])) {
      const ctx = await browser.newContext({ ...(shell === 'phone' ? devices['Pixel 7'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      const id = `${shell}-${skin}-${kind}`;
      let held = null;
      const active = ['family', 'colour', 'tweak', 'all'].includes(kind) ? 'qa-worn' : null;
      const skins = { skins: [{ id: 'qa-quiet', name: 'Quiet', base: skin, tweaks: {} }, { id: 'qa-worn', name: 'My skin', base: skin, tweaks: {} }], active };
      await ctx.route('**/*', async r => {
        const q = r.request(), u = new URL(q.url());
        const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (u.origin !== new URL(BASE).origin) return r.abort();
        if (q.method() !== 'GET' && q.method() !== 'HEAD') {
          blocked.push({ shell, skin, kind, method: q.method(), path: u.pathname });
          if (u.pathname.startsWith('/wizard/v1/skins/') && ['PUT', 'PATCH'].includes(q.method())) {
            await new Promise(resolve => { held = resolve; });
            return json({ error: 'QA refuses writes' }, 403);
          }
          return json({ error: 'QA refuses writes' }, 403);
        }
        if (u.pathname === '/wizard/v1/skins') return json(skins);
        if (u.pathname === '/wizard/v1/my-skin') return r.fulfill({ contentType: 'text/css', body: '' });
        // Only checked-out assets reach the read-only origin. Every dynamic/private API is fixture data.
        if (u.pathname.startsWith('/wizard-os-home/') && !/\/(store-install|(?:api|voice|models|usage|registry|config|status|files))(?:\/|$)/.test(u.pathname)) return r.continue();
        if (/\/events(?:\/|$)/.test(u.pathname)) return r.fulfill({ contentType: 'text/event-stream', body: ': QA empty stream\n\n' });
        if (/\/apps$/.test(u.pathname)) return json({ apps: [], slots: {} });
        if (/\/sessions$/.test(u.pathname)) return json({ data: [], has_more: false });
        return json({ agents: [], items: [], data: [], sessions: [], ready: false, configured: false });
      });
      await ctx.addInitScript(({ shell, skin }) => {
        for (const [k, v] of Object.entries({ 'wux.shell': shell, 'wos.skin': skin, 'wos.coached': 'true', 'wos.tour.v1': 'true', 'wos.welcome.v1': 'done', 'wos.tour.done': '1', 'wos.voiceTipSeen': 'true' })) localStorage.setItem(k, v);
        navigator.sendBeacon = () => false;
      }, { shell, skin });
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push({ id, error: String(e) }));
      const url = BASE + (shell === 'phone' ? '?shell=phone&view=settings' : 'desktop.html?view=settings');
      for (let retry = 0; ; retry++) { try { await p.goto(url, { waitUntil: 'load', timeout: 60000 }); break; } catch (e) { if (retry > 1 || !String(e).includes('ERR_NETWORK_CHANGED')) throw e; } }
      await p.waitForFunction(({ skin, active }) => window.WosExperience?.state.owner && window.WosSkin?.current === skin && !WosExperience.state.busy && (WosMySkin.active?.id || null) === active, { skin, active }, { timeout: 30000 });
      assert.equal(await p.evaluate(() => document.documentElement.dataset.shell), shell);
      assert.equal(await p.evaluate(() => WosMySkin.active?.id || null), active);
      await p.evaluate(shell => { if (shell === 'desktop') __wux.openSettings('appearance'); else __wos.openSheet('settings'); }, shell);
      if (shell === 'phone') { await p.waitForTimeout(800); await p.locator('#settingsBody').getByText('Appearance', { exact: true }).first().click(); }
      const group = p.locator('.tw-group:visible').first(); await group.waitFor({ state: 'visible', timeout: 20000 });
      await p.waitForTimeout(700);
      const text = await group.innerText();
      assert.ok(text.includes(active ? 'My skin’s tweaks' : skin === 'nebula' ? 'Wizard’s tweaks' : 'Miguel’s tweaks'));
      assert.ok(!text.includes(skin === 'nebula' ? 'Miguel’s tweaks' : 'Wizard’s tweaks'));
      assert.ok(!/James[’']s/.test(text)); assert.ok(text.includes('Built-in choices'));
      assert.equal(await p.locator('[data-tweakauthor]:visible').count(), 1);
      const selectors = {
        family: '[data-skinfamily="' + (skin === 'nebula' ? 'mizel' : 'wizard') + '"]',
        colour: '[data-skinpick]:not([aria-pressed="true"])', tweak: '[data-tweak-toggle]',
        all: '[data-tweakauthor]', own: '[data-ownskin="qa-quiet"]', new: '[data-newskin]'
      };
      const tile = p.locator(selectors[kind] + ':visible').first();
      // Centre inside Settings' own scroller, never under the phone dock.
      await tile.evaluate(el => {
        const pane = el.closest('.st-page'); const root = el.closest('.st-root');
        const scroller = getComputedStyle(pane).overflowY === 'auto' ? pane : root;
        const a = el.getBoundingClientRect(), b = scroller.getBoundingClientRect();
        scroller.scrollTop += a.top - b.top - Math.max(24, (b.height - a.height - 100) / 2);
      });
      await p.waitForTimeout(300);
      // New skin is entirely local once defaults are cached. Hold only its work frame;
      // the real click handler still paints synchronously, with no test-added CSS/classes.
      if (kind === 'new') await p.evaluate(() => {
        const raf = window.requestAnimationFrame;
        window.__qaFrames = [];
        window.requestAnimationFrame = fn => { window.__qaFrames.push(fn); return 0; };
        window.__qaReleaseFrames = () => { window.requestAnimationFrame = raf; window.__qaFrames.splice(0).forEach(fn => raf(fn)); };
      });
      const before = await tile.boundingBox();
      const sync = await tile.evaluate(el => { el.click(); return { busy: el.getAttribute('aria-busy'), disabled: el.disabled, pending: el.classList.contains('st-pending') }; });
      assert.deepEqual(sync, { busy: 'true', disabled: true, pending: true });
      if (kind !== 'new') await p.waitForFunction(() => document.querySelector('.st-pending[aria-busy="true"]'));
      if (kind !== 'new') {
        for (let i = 0; !held && i < 100; i++) await p.waitForTimeout(25);
        assert.ok(held, `${id}: skin PUT held at browser route, never sent`);
      }
      const after = await tile.boundingBox(); assert.deepEqual(after, before, `${id}: no layout shift`);
      const material = await tile.evaluate((el, controls) => {
        const preview = el.querySelector('.skp-mini'), target = preview || el.querySelector('.sw');
        const a = getComputedStyle(target, '::after'), b = getComputedStyle(target, '::before');
        const r = target.getBoundingClientRect(), label = el.querySelector('.skp-nm');
        const panel = el.closest('.dsettings, .sheet');
        return { preview: !!preview, art: getComputedStyle(target).backgroundImage, overlay: b.backgroundColor, overlayRadius: b.borderRadius,
          radius: getComputedStyle(target).borderRadius, spinner: a.borderTopColor, stroke: a.borderTopWidth, size: a.width,
          opacity: getComputedStyle(el).opacity, animation: a.animationName, pulse: getComputedStyle(target).animationName,
          outline: getComputedStyle(el).outlineStyle, label: label ? { text: label.textContent, visibility: getComputedStyle(label).visibility, opacity: getComputedStyle(label).opacity } : null,
          hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el,
          competitors: [...el.closest('.st-root').querySelectorAll(controls)].filter(b => b !== el).map(b => ({ disabled: b.disabled, opacity: getComputedStyle(b).opacity })),
          panelBackground: panel && getComputedStyle(panel).backgroundColor };
      }, controls);
      assert.equal(material.opacity, '1'); assert.equal(material.animation, 'st-busy-spin');
      assert.equal(material.stroke, '2px'); assert.equal(material.size, material.preview ? '22px' : '18px');
      assert.ok(material.hit, `${id}: control is visibly in front`);
      assert.ok(material.competitors.every(b => b.disabled && b.opacity === '0.6'));
      if (material.preview) {
        assert.equal(material.overlayRadius, material.radius); assert.notEqual(material.radius, '0px');
        assert.equal(material.outline, 'none'); assert.equal(material.label.visibility, 'visible'); assert.equal(material.label.opacity, '1');
        assert.equal(material.pulse, 'st-busy-ring');
      } else { assert.equal(material.pulse, 'none'); }
      await p.screenshot({ path: path.join(OUT, `${id}-pending.png`) });
      await p.emulateMedia({ reducedMotion: 'reduce' });
      const reduced = await tile.evaluate(el => { const x = el.querySelector('.skp-mini, .sw'); return { spin: getComputedStyle(x, '::after').animationName, pulse: getComputedStyle(x).animationName }; });
      assert.deepEqual(reduced, { spin: 'none', pulse: 'none' });
      if (kind === 'new') {
        await p.evaluate(() => window.__qaReleaseFrames());
        await p.locator('[data-newskin-sheet]:visible').waitFor();
      } else {
        held(); await p.waitForFunction(() => !document.querySelector('[aria-busy="true"].st-pending'));
        assert.equal(await p.evaluate(() => WosSkin.current), skin);
        assert.equal(await p.evaluate(() => WosMySkin.active?.id || null), active);
        await p.locator('[role="alert"]:visible').first().waitFor();
      }
      checks.push({ id, sync, material, reduced, noLayoutShift: true, rollback: kind !== 'new', failureShown: kind !== 'new' });
      fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ checks, errors, blocked }, null, 2));
      await ctx.close();
    }
    assert.equal(errors.length, 0, JSON.stringify(errors));
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ checks, errors, blocked }, null, 2));
  }
  console.log(JSON.stringify({ checks: checks.length, screenshots: fs.readdirSync(OUT).filter(f => f.endsWith('.png')).length, errors, blocked }));
})().catch(e => { console.error(e); process.exitCode = 1; });
