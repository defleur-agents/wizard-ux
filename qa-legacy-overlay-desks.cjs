// Saved-state regression for James's original Miguel selector customization.
// QA_OWNER_FIXTURE: narrowly captured Files CSS + skins metadata; never owner content.
// QA_EXPECT_BROKEN=1 serves baseline bytes and proves the old palette -> active:null transition.
const fs = require('fs'), path = require('path');
const { chromium } = require('./tools/qa-playwright.cjs');
const { boot, ready, T, slide, orbXY, sleep, runs } = require('./qa-orb-radial.cjs');
const fixture = JSON.parse(fs.readFileSync(process.env.QA_OWNER_FIXTURE, 'utf8'));
const broken = process.env.QA_EXPECT_BROKEN === '1', shots = process.env.QA_SHOTS;
let passed = 0;
function check(value, name, detail) { if (!value) throw new Error(name + ': ' + JSON.stringify(detail)); passed++; console.log('PASS', name); }
const copy = value => JSON.parse(JSON.stringify(value));
async function setup(ctx, data, css, writes) {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await ctx.route('**/wizard/v1/skins**', route => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname === '/wizard/v1/skins/active' && req.method() === 'PUT') {
      const input = req.postDataJSON(); writes.push(input); data.active = input.id; return json(route, data);
    }
    if (u.pathname === '/wizard/v1/skins' && req.method() === 'GET') return json(route, data);
    return json(route, { error: 'qa: unrelated write refused' }, 403);
  });
  await ctx.route('**/wizard/v1/user-files/content?path=Skins%2FMy%20skin%2Fskin.json', r => json(r, { error: 'not_found' }, 404));
  await ctx.route('**/wizard/v1/my-skin*', r => {
    if (new URL(r.request().url()).searchParams.has('format')) return json(r, { path: data.active ? 'Skins/My skin/skin.css' : '', exists: !!data.active, empty: !data.active, script: { exists: false } });
    return r.fulfill({ status: 200, contentType: 'text/css', body: data.active ? css : '' });
  });
}
async function swipe(p) {
  const o = await orbXY(p); await T(p, 'touchStart', o.x, o.y); await slide(p, o, {x:o.x,y:o.y-176}, 8, 16); await T(p, 'touchEnd'); await sleep(550);
}
const state = p => p.evaluate(() => ({ skin: WosSkin.current, active: WosMySkin.active?.id || null, overlay: WosMySkin.overlay, variable: getComputedStyle(document.documentElement).getPropertyValue('--wos-orb-swipe-up').trim(), pill: !!document.querySelector('#overview.open.ov-pill .ov-close'), apps: document.getElementById('launcher').classList.contains('open'), css: document.getElementById('wosMySkin')?.textContent || '' }));
async function close(p) { await p.evaluate(() => { __wos.closeOverview(); __wos.closeSheets(); }); await sleep(350); }
async function shot(p, name) {
  if (!shots) return; fs.mkdirSync(shots, {recursive:true}); await sleep(700); await p.screenshot({path:path.join(shots,name+'.png')});
}
(async () => {
  const browser = await chromium.launch({executablePath:process.env.QA_CHROME || undefined,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  try {
    // The REAL broken persisted state: nonempty CSS remains in Files, active pointer empty.
    const data = copy(fixture.skins), writes = [];
    const {ctx,p} = await boot(browser, undefined, {'wos.skin':'nebula','wos.tour.v1':'true'}, false, c=>setup(c,data,fixture.css,writes));
    await p.waitForFunction(()=>WosMySkin.state.loaded); await swipe(p); let s=await state(p);
    check(s.apps && !s.pill && !s.variable && data.active===null, 'captured deactivated owner CSS reproduces Apps before restoration', s);
    await shot(p,'before-disabled-overlay'); await close(p);
    // Supported restore (not hidden client storage), then reproduce the transition that lost it.
    await p.evaluate(()=>WosMySkin.wear('My skin')); await p.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--wos-orb-swipe-up').trim()==='pill');
    await swipe(p); s=await state(p); check(s.pill&&!s.apps,'restored real CSS selects Miguel panel, not generic overview',s); await close(p);
    await p.evaluate(()=>WosSkin.set('grove')); await sleep(900); await swipe(p); s=await state(p);
    if (broken) {
      check(data.active===null&&s.apps&&!s.pill&&writes.some(x=>x.id===null),'baseline palette switch silently clears persisted active pointer and returns Apps',s);
      await shot(p,'baseline-palette-loses-overlay');
    } else {
      check(data.active==='My skin'&&s.pill&&!s.apps&&s.skin==='grove'&&!writes.some(x=>x.id===null),'fixed legacy overlay keeps selector and box pointer across palette switch',s);
      check(s.css===fixture.css,'all original My skin rules preserved byte-for-byte',s.css.length);
    }
    check(p.errs.length===0,'saved-state scenario has zero page errors',p.errs); await ctx.close();
    if (broken) { console.log(`COMPLETE ${passed} passed, 0 failed`); return; }
    // Independent fresh profiles with restored box state, radial OFF/ON and optional two-orbs.
    for (const enabled of [false,true]) for (const two of [false,true]) {
      const data=copy(fixture.skins);data.active='My skin';const writes=[];
      const {ctx,p}=await boot(browser,undefined,{'wos.skin':'grove','wos.tour.v1':'true'},enabled,c=>setup(c,data,fixture.fixed_css,writes));
      await p.waitForFunction(()=>WosMySkin.state.loaded&&WosMySkin.overlay);
      check((await state(p)).skin==='grove','fresh profile retains current palette, never guessed nebula base');
      if(two){await p.evaluate(()=>WosExperience.toggle('wizard/two-orbs'));await p.waitForFunction(()=>WosSkinHost.tweakState.includes('wizard/two-orbs'));await sleep(700);}
      for (const skin of ['nebula','grove']) {
        // Use actual Appearance controls, including family and palette entry points.
        await p.evaluate(()=>__wos.openSheet('settings'));
        await p.waitForFunction(()=>__wos.sheet==='settings'&&document.querySelector('#settings.open'));
        const settings=p.locator('#settings.open #settingsBody');
        // Settings categories use data-st-page; data-st names feature actions, not routes.
        await settings.locator('[data-st-page="appearance"]').click();
        await p.waitForFunction(()=>document.querySelector('#settingsBody').dataset.settingsPage==='appearance');
        await settings.locator('[data-skinfamily="wizard"]').click();
        // Look paints pending before its rAF action. !busy alone can pass before the action starts.
        await p.waitForFunction(()=>!WosExperience.state.busy&&!document.querySelector('#settingsBody [data-skinfamily][disabled], #settingsBody [data-skinfamily][aria-busy="true"]'));
        await settings.locator(`[data-skinpick="${skin}"]`).click();
        await p.waitForFunction(s=>WosSkin.current===s&&!WosExperience.state.busy&&!document.querySelector('#settingsBody [data-skinpick][disabled], #settingsBody [data-skinpick][aria-busy="true"]'),skin);
        await p.evaluate(()=>__wos.closeSheets());
        await p.waitForFunction(()=>!__wos.sheet&&!document.querySelector('#settings.open'));
        await sleep(650);
        await swipe(p);let s=await state(p);check(s.pill&&!s.apps&&s.skin===skin&&s.active==='My skin',`${skin} radial:${enabled} two-orbs:${two}: actual Look -> Miguel selector`,s);
        const fill=await p.locator('#overview .ov-sheet').evaluate(e=>({background:getComputedStyle(e).backgroundColor,blur:getComputedStyle(e).backdropFilter,radius:getComputedStyle(e).borderRadius}));
        check(!/rgba\([^)]*,\s*0\./.test(fill.background)&&fill.blur==='none'&&parseFloat(fill.radius)>20,'Miguel pill has opaque shared panel and rounded identity',fill);
        // Pixel proof: remove only the scrim, then put loud text behind the selector sheet.
        const sheet=p.locator('#overview .ov-sheet'), before=await sheet.screenshot();
        await p.evaluate(()=>{const n=document.createElement('div');n.id='qa-loud';n.style='position:fixed;inset:0;z-index:1;color:red;background:lime;font-size:48px;pointer-events:none';n.textContent='LOUD TEXT '.repeat(100);document.getElementById('device').append(n);});
        const after=await sheet.screenshot();check(before.equals(after),'selector panel pixels unchanged over loud text');await p.evaluate(()=>document.getElementById('qa-loud').remove());
        if(!two)await shot(p,`fixed-${skin}-radial-${enabled}`);await close(p);
      }
      await p.reload({waitUntil:'load'});await ready(p,enabled);await p.waitForFunction(()=>WosMySkin.state.loaded);await swipe(p);
      let s=await state(p);check(s.pill&&!s.apps&&data.active==='My skin'&&s.skin==='grove','reload reads restored CSS and active pointer from box without reseeding',s);await close(p);
      // Real thumb hold + tap still use the existing voice/radial handlers.
      let o=await orbXY(p);await T(p,'touchStart',o.x,o.y);await sleep(750);
      if(enabled)check(await p.evaluate(()=>WosOrbSwitcher.isOpen&&WosOrbSwitcher._wedges().every(w=>w.kind==='voice'||w.kind==='custom'||(w.kind==='app'&&WosLauncher.get().pins.includes(w.item.id)))),'long hold remains pins-only radial (no desk wedges)');
      else check(await p.evaluate(()=>__wos.voice==='command'),'OFF long hold remains ordinary voice command');
      await p.evaluate(()=>__wos.cancelVoice(true));await T(p,'touchEnd');await sleep(500);
      o=await orbXY(p);await T(p,'touchStart',o.x,o.y);await sleep(40);await T(p,'touchEnd');await sleep(500);
      check(await p.evaluate(()=>__wos.voice!=='idle'),'tap remains voice');await p.evaluate(()=>__wos.cancelVoice(true));await sleep(300);
      check(writes.length===0,'skin changes and reload perform no hidden owner active writes',writes);
      await p.evaluate(()=>WosMySkin.leave());await p.reload({waitUntil:'load'});await ready(p,enabled);await swipe(p);s=await state(p);
      check(s.apps&&!s.pill&&data.active===null,'explicit leave is durable opt-out; no automatic resurrection',s);
      check(p.errs.length===0,'restored profile has zero page errors',p.errs);await ctx.close();
    }
    check(runs().length===0,'no agent runs or new sessions',runs()); console.log(`COMPLETE ${passed} passed, 0 failed`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
