 'use strict';
// Synthetic origins only. UI preference writes are fixture-local; other writes are aborted.
const assert = require('node:assert/strict');
const { chromium } = require('../tools/qa-playwright.cjs');
const { ownerRead } = require('../tools/qa-desktop-frame-fixture.cjs');
const fs = require('node:fs'), path = require('node:path');
const repo = path.resolve(__dirname, '..'), origin = 'https://working-sort.test', prefix = '/wizard-os-home/';
const out = process.env.QA_OUT || 'working-sort-evidence'; fs.mkdirSync(out, { recursive: true });
const now = Date.now();
const rows = [['z', 'Zulu', 1000], ['a', 'alpha', 3000], ['b', 'Beta', 2000]].map(([id, title, age]) => ({ id, title, runtime: 'direct', status: 'running', updated_at: new Date(now - age).toISOString(), updatedAt: new Date(now - age).toISOString(), message_count: 2, messageCount: 2 }));
const mime = f => f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.json') ? 'application/json' : 'text/html';
(async () => {
 const browser = await chromium.launch(); const report = { cases: [], screenshots: [] }, failures = [];
 try {
  for (const skin of ['nebula', 'sepia']) {
   const prefs = { migrations: { 'launcher-seed-v1': true }, readyOrder: 'oldest', chatLayout: 'status' };
   const writes = [], aborted = [], errors = [];
   async function pageFor(surface) {
    const phone = surface !== 'desktop';
    const c = await browser.newContext({ viewport: phone ? { width: 412, height: 915 } : { width: 1440, height: 960 }, isMobile: phone, hasTouch: phone, serviceWorkers: 'block' });
    await c.routeWebSocket('**/*', w => w.close());
    await c.addInitScript(({ skin, surface }) => {
     if (window !== top) return;
     const seed = { 'wos.shell': surface === 'desktop' ? 'desktop' : 'phone', 'wos.coached': 'true', 'wos.tour.v1': 'true', 'wos.welcome.v1': 'done', 'wos.skin': skin };
     if (surface === 'desktop') seed['wos.desktop-view.v1'] = 'ai-apps';
     if (surface === 'drawer') seed['wos.mobile-view.v1'] = 'ai-apps';
     for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }, { skin, surface });
    await c.route('**/*', async r => {
     const q = r.request(), u = new URL(q.url());
     if (u.origin !== origin) return r.abort();
     if (!['GET','HEAD'].includes(q.method())) {
      if (u.pathname === '/wizard/v1/ui-preferences' && q.method() === 'PUT') { const body = q.postDataJSON(); assert.deepEqual(Object.keys(body), ['workingOrder']); if (body.workingOrder === 'newest' && !writes.length) await new Promise(resolve => setTimeout(resolve, 5000)); Object.assign(prefs, body); writes.push(body); return r.fulfill({ json: { ...prefs } }); }
      aborted.push({ method: q.method(), path: u.pathname }); return r.abort();
     }
     if (u.pathname.startsWith(prefix)) {
      const file = decodeURIComponent(u.pathname.slice(prefix.length) || 'index.html'), abs = path.resolve(repo,'web',file);
      if (!abs.startsWith(path.join(repo,'web') + path.sep)) return r.abort();
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return r.fulfill({ body: fs.readFileSync(abs), contentType: mime(file) });
      return r.fulfill({ status: 404, body: 'Missing synthetic asset' });
     }
     if (u.pathname === '/wizard/v1/ui-preferences') return r.fulfill({ json: { ...prefs } });
     if (u.pathname === '/wizard/hermes/api/sessions') return r.fulfill({ json: { data: rows, has_more: false } });
     if (/\/sessions\/[^/]+\/messages/.test(u.pathname)) return r.fulfill({ json: { messages: [{ role: 'user', content: 'Synthetic work', timestamp: now/1000-10 },{ role: 'assistant', content: 'Synthetic progress', timestamp: now/1000-5 }] } });
     const id = /\/sessions\/([^/]+)$/.exec(u.pathname)?.[1];
     if (id && rows.some(r => r.id === id)) return r.fulfill({ json: { session: rows.find(r => r.id === id) } });
     return r.fulfill({ json: ownerRead(u.pathname) });
    });
    const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(origin+prefix+(phone ? 'index.html' : 'desktop.html'));
    await p.waitForFunction(() => (window.__wux || window.__wos) && !window.WosWelcome?.active && !window.WosExperience?.state?.busy);
    return { c, p };
   }
   async function persist(p, act) { await Promise.all([p.waitForResponse(r => r.url().endsWith('/wizard/v1/ui-preferences') && r.request().method() === 'PUT'), act()]); }
   async function shot(p, name) { const file = path.join(out, skin+'-'+name+'.png'); await p.screenshot({ path:file, animations:'disabled' }); report.screenshots.push(file); }
   try {
    const { c, p } = await pageFor('desktop');
    await p.locator('.aad-working-orderb').waitFor();
    await p.locator('.aad-sec[data-sec="working"]').click();
    const ids = () => p.locator('#aad-sec-working .aad-rw').evaluateAll(ns => ns.map(n=>n.dataset.sid));
    await p.waitForFunction(() => document.querySelectorAll('#aad-sec-working .aad-rw').length === 3);
    assert.deepEqual(await ids(), ['a','b','z']);
    await p.locator('.aad-working-orderb').click();
    await p.getByRole('menu',{name:'Sort Working',exact:true}).waitFor();
    await shot(p,'desktop-menu');
    await p.getByRole('menuitemradio',{name:'Newest first',exact:true}).click();
    assert.deepEqual(await ids(), ['z','b','a'], 're-sorts before the delayed preference write returns');
    assert.equal(await p.evaluate(() => localStorage.getItem('wos.chats.workingOrder.v1')), 'newest');
    await p.waitForResponse(r => r.url().endsWith('/wizard/v1/ui-preferences') && r.request().method() === 'PUT');
    assert.equal(prefs.workingOrder,'newest');
    assert.equal(prefs.readyOrder,'oldest');
    await p.locator('.aad-working-orderb').click();
    await persist(p, () => p.getByRole('menuitemradio',{name:'Oldest first',exact:true}).click());
    assert.deepEqual(await ids(), ['a','b','z']);
    await p.locator('.aad-working-orderb').click(); await p.mouse.click(1000,600);
    assert.equal(await p.locator('.aad-sortmenu').count(),0);
    await p.locator('.aad-working-orderb').click(); await p.keyboard.press('Escape');
    assert.equal(await p.locator('.aad-sortmenu').count(),0);
    await p.evaluate(() => __wux.openSettings('working-order'));
    const setting = p.locator('[data-settings-working-order]'); await setting.waitFor(); assert.equal(await setting.inputValue(),'oldest');
    await persist(p, () => setting.selectOption('alphabetical')); await p.waitForFunction(() => WizLive.workingOrder()==='alphabetical');
    assert.equal(prefs.workingOrder,'alphabetical');
    await shot(p,'desktop-settings'); await c.close();
    const { c: pc, p: phone } = await pageFor('phone');
    await phone.evaluate(() => __wos.openWin({ app: 'chats', title: 'Chats' }));
    const select = phone.locator('[data-working-order]'); await select.waitFor(); assert.equal(await select.inputValue(),'alphabetical');
    const hd = phone.locator('section[data-sec="working"] [data-sectoggle="working"]');
    if (await hd.count() && await hd.getAttribute('aria-expanded') !== 'true') await hd.click();
    await phone.waitForFunction(() => document.querySelectorAll('section[data-sec="working"] .ch-row').length===3);
    const phoneIds = () => phone.locator('section[data-sec="working"] [data-chopen]').evaluateAll(ns=>ns.map(n=>n.dataset.chopen));
    assert.deepEqual(await phoneIds(),['a','b','z']);
    await persist(phone, () => select.selectOption('newest')); assert.deepEqual(await phoneIds(),['z','b','a']);
    await persist(phone, () => select.selectOption('oldest')); assert.deepEqual(await phoneIds(),['a','b','z']);
    await shot(phone,'phone-working');
    await phone.evaluate(() => __wos.openSettings('working-order'));
    await phone.locator('[data-settings-working-order]').waitFor();
    assert.equal(await phone.locator('[data-settings-working-order]').inputValue(),'oldest');
    await shot(phone,'phone-settings');
    await pc.close();
    const { c: dc, p: drawer } = await pageFor('drawer');
    await drawer.locator('.aa-menu').waitFor(); await drawer.locator('.aa-menu').click();
    const drawerSort = drawer.locator('.aa-sech select[aria-label="Sort Working"]');
    await drawerSort.waitFor(); assert.equal(await drawerSort.inputValue(), 'oldest');
    const drawerHead = drawer.locator('.aa-sec[data-sec="working"]');
    if (await drawerHead.getAttribute('aria-expanded') !== 'true') await drawerHead.click();
    await persist(drawer, () => drawerSort.selectOption('alphabetical'));
    assert.deepEqual(await drawer.locator('#aa-sec-working [data-sid]').evaluateAll(ns => ns.map(n => n.dataset.sid)), ['a','b','z']);
    await shot(drawer,'phone-drawer'); await dc.close();
    assert.equal(prefs.readyOrder,'oldest'); assert.ok(writes.length>=5);
    assert.equal(aborted.filter(r=>r.path.includes('/v1/runs')).length,0);
    assert.deepEqual(errors,[]);
    report.cases.push({skin,passed:true,writes,aborted});
   } catch (e) { failures.push(skin+': '+e.stack); report.cases.push({skin,passed:false,error:e.stack,writes,aborted,errors}); }
  }
 } finally { await browser.close(); fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)); }
 if (failures.length) throw Error(failures.join('\n'));
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
