// Isolated full-shell regression: no live backend, no agent writes. Run on the Linux browser worker.
// QA_BASE_CHATS can serve the original chats.js for a failing-first A/B, without changing the checkout.
const { chromium } = require('./tools/qa-playwright.cjs');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const web = path.resolve(process.env.QA_WEB_DIR || path.join(__dirname, 'web'));
const out = process.env.QA_OUT || path.join(process.env.TMPDIR || process.cwd(), 'app-ready-cards');
fs.mkdirSync(out, { recursive: true });
let passed = 0, failed = 0;
const measurements = [], check = (value, name, detail = '') => { value ? passed++ : failed++; console.log(value ? 'PASS' : 'FAIL', name, detail); };
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://fixture');
  let rel = u.pathname.replace(/^\/wizard-os-home\//, '') || 'index.html';
  if (!u.pathname.startsWith('/wizard-os-home/') || rel.includes('..')) { res.writeHead(404); return res.end(); }
  const f = process.env.QA_BASE_CHATS && rel === 'core/chats.js' ? process.env.QA_BASE_CHATS : path.join(web, rel);
  if (rel === 'data.js' || rel === 'summaries.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(rel === 'data.js' ? 'window.WIZ_DATA={threads:[],projects:{}};' : 'window.WIZ_SUMMARIES={};'); }
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', mime[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
});
const now = Date.now()/1000;
const row = { id:'tap-thread', title:'Fixture thread', source:'wizard-mobile', status:'completed', message_count:2, hidden:false, started_at:now-60,last_active:now,wizard_last_user_at:now-30,wizard_last_assistant_at:now,wizard_activity_at:now,wizard_attention:{state:'check'},latest_message:{role:'assistant',content:'Fixture reply',timestamp:now} };
async function scenario(browser, origin, desktop, thread, status, skin = 'nebula', held = false) {
  const label = `${desktop ? 'desktop' : 'plain'}:${thread || 'list'}:${status}:${skin}${held ? ':held' : ''}`;
  const ctx = await browser.newContext({ viewport:desktop ? {width:1600,height:1000} : {width:412,height:892}, hasTouch:!desktop, isMobile:!desktop, serviceWorkers:'block' });
  let hideRequests = 0, hideSettled = false, statusReads = 0, installed = true;
  const model = { day:'fixture-day', done:0,total:3,next_label:'Water',hidden:false };
  await ctx.route('**/*', async r => {
    const q = r.request(), u = new URL(q.url()), json = (body, code = 200) => r.fulfill({status:code,json:body});
    if (u.pathname === '/garden/api/hide') {
      hideRequests++;
      await new Promise(resolve => setTimeout(resolve, 5000));
      hideSettled = true;
      if (status === 200) model.hidden = true;
      return json(status === 200 ? model : {error:'fixture failure'},status).catch(() => {});
    }
    if (u.pathname.endsWith('/store-data/router/v1/needs/garden')) { await new Promise(resolve=>setTimeout(resolve,5000)); return json({},status).catch(()=>{}); }
    if (u.pathname === '/garden/') return r.fulfill({contentType:'text/html',body:'<!doctype html><title>Garden</title><h1>Garden</h1><p>Sample app, not a shell</p>'});
    if (u.pathname === '/garden/api/status') { statusReads++; return json(model); }
    if (u.pathname === '/wizard/v1/bootstrap') return json({bootstrap:1,settings:{agent:{name:'Wizard'},clock:{timezone:'UTC'}},capabilities:{},endpoints:{apps:'/wizard/v1/apps',sessions:'/wizard/hermes/api/sessions'}});
    if (u.pathname === '/wizard/v1/setup') return json({first_run:false});
    if (u.pathname === '/wizard/hermes/api/model/options') return json({provider:'fixture',providers:[{slug:'fixture',authenticated:true,models:[]}]});
    if (u.pathname === '/wizard/v1/apps') return json({apps:installed?[{id:'garden',name:'Garden',url:'/garden/',source:'apps.json',type:'view',ready_card:{title:'Garden',subtitle:'Water · Feed',status:'api/status',dismiss:'api/hide'}}]:[]});
    if (u.pathname === '/wizard/hermes/api/sessions') return json({data:[row],has_more:false});
    if (u.pathname.endsWith('/messages')) return json({data:[{id:1,role:'user',content:'Fixture question',timestamp:now-30},{id:2,role:'assistant',content:'Fixture reply',timestamp:now}],has_more:false});
    if (u.pathname.endsWith('/sessions/tap-thread')) return json({session:row});
    if (u.pathname === '/wizard/v1/agents') return json({agents:[{id:'hermes',label:'Wizard',is_default:true,harness:'hermes',status:'running',privacy:'standard',model:{provider:'fixture',model:'fixture'}}]});
    if (u.pathname === '/wizard/thread-seen') return json({state:{initializedAt:1,threads:{}}});
    if (u.pathname === '/wizard/v1/ui-preferences') return json({spaces:[],pinnedChats:[],readyOrder:'newest',migrations:{'launcher.v1':true}});
    if (u.pathname.startsWith('/wizard/')) return json({});
    if (!u.pathname.startsWith('/wizard-os-home/')) return json({});
    return r.continue();
  });
  await ctx.addInitScript(({desktop,skin}) => {
    localStorage.setItem('wos.coached','true');localStorage.setItem('wos.welcome.v1','done');localStorage.setItem('wos.voiceTipSeen','true');localStorage.setItem('wos.shell',desktop?'desktop':'phone');localStorage.setItem('wos.skin',skin);
    const wins={wmain:{id:'wmain',app:'chats',thread:null}}, desk={id:'dmain',wins:['wmain'],focus:'wmain'};
    if(desktop){localStorage.setItem('wux.desk.wins',JSON.stringify(wins));localStorage.setItem('wux.desk.ws',JSON.stringify([desk]));localStorage.setItem('wux.desk.cur','0');localStorage.setItem('wux.desk.homeOpen','false');}
    else{localStorage.setItem('wos.wins4',JSON.stringify(wins));localStorage.setItem('wos.strip',JSON.stringify([{id:'home',home:true,wins:[],focus:null},desk]));localStorage.setItem('wos.idx4','1');localStorage.setItem('wos.idxDesk',JSON.stringify('dmain'));}
  },{desktop,skin});
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errors = []; p.on('pageerror',e => errors.push(e.message));
  try {
    await p.goto(origin + (desktop ? 'desktop.html' : ''),{waitUntil:'domcontentloaded'});
    await p.waitForFunction(() => (window.__wux || window.__wos)?.live?.ok && window.WizCanOpen?.('garden'));
    // The initial async status can miss the first desktop paint on the original code. A fresh window is
    // the real user path that displays it, then leaves a New chat / existing thread beside its list.
    if (!statusReads) await p.waitForResponse(r => r.url().includes('/garden/api/status'));
    await p.waitForTimeout(100);
    await p.evaluate(({desktop,thread}) => {
      const a=window.__wux||window.__wos;
      if(desktop){a.newWin({app:'chats',thread:thread||null});a.closeWin('wmain');}
      else{const w=a.wins.wmain;a.goDesk(a.desks.findIndex(d=>d.wins.includes(w.id)));a.focusWin(w.id);a.chats.renderChats(w);}
    },{desktop,thread});
    const card = p.locator('.ch-appcard-w:visible').first(); await card.waitFor();
    check(await card.evaluate(n=>n.closest('[data-sec]').dataset.sec==='ready' && !n.previousElementSibling?.matches('.ch-row')), `${label} pinned in Ready`);
    check(await card.locator('small').innerText()==='Water · Feed', `${label} declared initial subtitle`);
    check(await card.locator('.dots i').count()===3, `${label} progress dots`);
    // The open tap must paint in the same task, before its delayed readiness check.
    const opened = await p.evaluate(()=>{const b=document.querySelector('[data-chappopen]');b.click();return b.classList.contains('opening') && getComputedStyle(b).opacity < 1 || [...document.querySelectorAll('.toast,#toast')].some(n=>n.textContent.includes('Opening Garden'));});
    check(opened, `${label} open paints feedback synchronously`);
    await p.waitForSelector('iframe[src*="/garden/"]');await p.waitForTimeout(250);
    check(p.frames().some(f=>f.url().endsWith('/garden/')),`${label} app, not a nested shell`);
    await p.evaluate(()=>{const a=window.__wux||window.__wos;const w=Object.values(a.wins).find(w=>w.app==='frame'&&w.appId==='garden');if(w)a.closeWin(w.id);if(window.__wos){const c=Object.values(a.wins).find(w=>w.app==='chats');a.goDesk(a.desks.findIndex(d=>d.wins.includes(c.id)));a.focusWin(c.id);}});
    if(status===200 && !desktop) {
      const mutations=await p.evaluate(()=>new Promise(resolve=>{let n=0;const mo=new MutationObserver(m=>n+=m.length);mo.observe(document.querySelector('.ch-list'),{childList:true,subtree:true});setTimeout(()=>{mo.disconnect();resolve(n)},17000)}));
      check(mutations===0,`${label} unchanged list across sessions poll`,String(mutations));
    }
    // Every non-floating text surface inherits opaque shell panels; toast is checked on failure below.
    check(await card.evaluate(n=>!!getComputedStyle(n.querySelector('small')).color),`${label} text uses skin styling`);
    check(await p.evaluate(s => WosSkin.current === s && document.documentElement.dataset.skin === s, skin), `${label} actual shell skin`);
    await p.screenshot({path:path.join(out,label.replace(/[^a-z0-9-]/gi,'-')+'-before.png')});
    if(desktop && thread==='tap-thread' && status===500 && !held) {
      await p.evaluate(()=>{document.querySelector('.ch-appcard-w').__proof='same-node';__wux.openSettings('appearance');});
      const appearance=p.locator('[data-st-page="appearance"]');if(await appearance.isVisible())await appearance.click();
      await p.locator('[data-skinfamily="wizard"]').click();await p.locator('[data-skinpick="signal"]').click();
      await p.evaluate(()=>__wux.closeSettings());await p.waitForTimeout(800);
      check(await p.evaluate(()=>document.documentElement.dataset.skin==='signal' && document.querySelector('.ch-appcard-w').__proof==='same-node'),`${label} real live skin picker keeps card identity`);
      await p.screenshot({path:path.join(out,'live-signal.png')});
      await p.evaluate(()=>__wux.openSettings('appearance'));if(await appearance.isVisible())await appearance.click();
      await p.locator('[data-skinfamily="wizard"]').click();await p.locator(`[data-skinpick="${skin}"]`).click();await p.evaluate(()=>__wux.closeSettings());await p.waitForTimeout(600);
    }
    if (held) {
      // A live touch/reading guard must not swallow an explicit dismiss.
      await p.evaluate(() => {const n=document.querySelector('.ch-appcard-w').closest('.ch-scroll');n.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,changedTouches:[new Touch({identifier:99,target:n,clientX:10,clientY:10})]}));});
      check(await p.evaluate(()=>{const b=document.querySelector('[data-chapphide]'),id=b.closest('[data-chats]').dataset.chats;return __wux.chats.holdList(id);}), `${label} real list guard held before tap`);
    }
    await p.evaluate(() => {
      window.__tap = {start:0,gone:null,sameTask:false,paintBeforeFetch:false};
      const realFetch=window.fetch;window.fetch=function(input,...args){if(String(input).includes('/garden/api/hide'))__tap.paintBeforeFetch=!document.querySelector('.ch-appcard-w');return realFetch.call(this,input,...args);};
      document.addEventListener('click',e=>{if(e.target.closest('[data-chapphide]')) __tap.start=performance.now();},true);
      const mo=new MutationObserver(()=>{if(__tap.start&&!document.querySelector('.ch-appcard-w')&&__tap.gone===null)__tap.gone=performance.now()-__tap.start;});
      mo.observe(document.body,{childList:true,subtree:true});
      document.addEventListener('click',e=>{if(__tap.start)__tap.sameTask=!document.querySelector('.ch-appcard-w');});
    });
    await card.locator('[data-chapphide]').click();
    await p.waitForTimeout(100);
    const early = await p.evaluate(() => ({...__tap,cards:document.querySelectorAll('.ch-appcard-w').length}));
    measurements.push({label,...early});
    check(early.cards === 0 && early.gone !== null && early.gone <= 100 && early.sameTask && early.paintBeforeFetch, `${label} gone in click task, <=100ms`,JSON.stringify(early));
    check(hideRequests === 1 && !hideSettled, `${label} backend still pending for 5s`);
    // A stale status message must not put a pending tap back on screen.
    await p.evaluate(model=>postMessage({type:'wizard:ready-card',app:'garden'},location.origin), {...model,hidden:false});
    await p.waitForTimeout(50);
    check(await p.locator('.ch-appcard-w').count() === 0, `${label} stale status cannot undo pending hide`);
    await p.waitForTimeout(5050);
    if(status === 500){
      check(await p.locator('.ch-appcard-w').count() === 1, `${label} failure restores card`);
      check(await p.locator('#toast').innerText().then(s=>s.includes('!')&&s.includes('Couldn’t hide Garden')),`${label} failure shows ! toast`);
    } else check(await p.locator('.ch-appcard-w').count() === 0, `${label} successful reconciliation stays hidden`);
    await p.screenshot({path:path.join(out,label.replace(/[^a-z0-9-]/gi,'-')+'.png')});
    check(errors.length === 0, `${label} no page errors`,errors.join(' | '));
    if(held){await p.evaluate(()=>{const n=document.querySelector('.ch-appcard-w').closest('.ch-scroll');n.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[new Touch({identifier:99,target:n,clientX:10,clientY:10})]}));});await p.waitForTimeout(500);}
    // App state alone controls done, skip and rollover; messages only invalidate a registry-bound read.
    for(const [name,change,want] of [['done',{done:3,hidden:false},0],['hidden',{done:0,hidden:true},0],['rollover',{day:'next-day',done:1,hidden:false},1]]) {
      Object.assign(model,change);await p.evaluate(()=>postMessage({type:'wizard:ready-card',app:'garden'},location.origin));
      await p.waitForTimeout(150);check(await p.locator('.ch-appcard-w').count()===want,`${label} ${name}`);
    }
    check(await p.locator('.ch-appcard small').innerText()==='1 of 3 done · next: Water',`${label} partial progress and next label`);
    installed=false;const beforeReads=statusReads;await p.evaluate(()=>WizCore.refreshApps());await p.waitForTimeout(150);
    check(await p.locator('.ch-appcard-w').count()===0,`${label} uninstalled = no card`);
    await p.evaluate(()=>postMessage({type:'wizard:ready-card',app:'garden'},location.origin));await p.waitForTimeout(100);
    check(statusReads===beforeReads,`${label} uninstalled = no fetch`);
    if (desktop && status === 200) {
      const result=await p.evaluate(()=>{const a=__wux,id=Object.keys(a.wins)[0],start=performance.now();a.closeWin(id);return {ms:performance.now()-start,removed:!a.wins[id]&&!document.querySelector(`.win[data-win="${id}"]`)};});
      check(result.removed&&result.ms<=100, `${label} desktop window close synchronous`,JSON.stringify(result));
    }
  } catch(e) {check(false,label+' fixture/run',e.stack);console.log('DIAGNOSTIC',JSON.stringify(await p.evaluate(()=>({shell:!!(window.__wux||window.__wos),live:(window.__wux||window.__wos)?.live?.ok,can:window.WizCanOpen?.('garden'),text:document.body.innerText.slice(0,1200)}))),errors);}
  finally {await ctx.close();}
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=process.argv[2]||`http://127.0.0.1:${server.address().port}/wizard-os-home/`;
  const browser=await chromium.launch({executablePath:process.env.QA_CHROME||undefined,args:['--no-sandbox']});
  try {
    for(const [desktop,thread] of (process.env.QA_QUICK ? [[true,'__new__']] : [[false,null],[true,'__new__'],[true,'tap-thread']]))for(const status of (process.env.QA_QUICK ? [500] : [200,500]))await scenario(browser,origin,desktop,thread,status);
    if(!process.env.QA_QUICK)await scenario(browser,origin,true,'tap-thread',500,'landscapes-light',true);
  } finally {await browser.close();server.close();}
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed,failed,measurements},null,2));
  console.log(`${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);server.close();process.exitCode=2;});
