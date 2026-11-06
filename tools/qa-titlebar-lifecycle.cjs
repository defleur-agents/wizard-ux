'use strict';
// Fully closed real-shell fixture. Run only through the Forum resource queue.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('./qa-playwright.cjs');
const closed=require('./qa-closed-shell.cjs');
const OUT=process.env.QA_OUT; assert(OUT);fs.mkdirSync(OUT,{recursive:true});
const report={synthetic:true,source:process.env.QA_SOURCE_SHA,cases:[],captures:[],errors:[]};
const fixture='<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:dark}body{margin:0;padding:24px;background:var(--wz-base,#12121a);color:var(--wz-text,#eee);font:16px system-ui}section{background:var(--wz-panel,var(--wz-base,#12121a));padding:20px;border:1px solid var(--wz-border,#555)}button{font:inherit;padding:12px}</style><body><section><h1>Synthetic Messenger</h1><p>No accounts or messages. Initialization is held until the test releases it.</p><input aria-label="Unsent draft" value="Retained synthetic draft"><p id="result">Waiting for header</p></section><script src="/wizard-os-home/core/app-client.js"></script><script src="/titlebar-fixture.js"></script></body></html>';
const appJS=`window.calls=[]; window.releaseTools=async()=>{await WizardApp.ready(); return WizardApp.titlebar.set([{id:'qr',kind:'button',icon:'qr',label:'My QR codes'},{id:'search',kind:'button',icon:'search',label:'Search'},{id:'settings',kind:'button',icon:'settings',label:'Settings'}],({id})=>{calls.push(id);document.querySelector('#result').textContent='Opened '+id;});}; WizardApp.ready();`;
async function run(){
 const browser=await chromium.launch({headless:true});closed.setBrowser(browser);
 try{
  for(const phone of [false,true]){
   const {c}=await closed.boot(phone,async c=>{
    await c.addInitScript(phone=>{if(window!==top)return;localStorage.setItem(phone?'wos.mobile-view.v1':'wos.desktop-view.v1','ai-apps');},phone);
    await c.route('http://wizard-qa.invalid/titlebar-fixture/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:fixture}));
    await c.route('http://wizard-qa.invalid/titlebar-fixture.js',r=>r.fulfill({contentType:'text/javascript; charset=utf-8',body:appJS}));
    if(process.env.QA_BASELINE_LAYOUT) await c.route('http://wizard-qa.invalid/wizard-os-home/layouts/ai-apps/desktop.js',r=>r.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(process.env.QA_BASELINE_LAYOUT)}));
   });
   const p=closed.getPage();
   try{
    await p.evaluate(phone=>{const reg=WizCore.apps(phone?'mobile':'desktop');const app={id:'messenger',name:'Messenger',kind:'wizard',url:'/titlebar-fixture/'};const old=reg.APPS.find(a=>a.id===app.id);if(old)Object.assign(old,app);else reg.APPS.push(app);(phone?__wos:__wux).openApp(reg.APPS.find(a=>a.id===app.id));},phone);
    await p.waitForFunction(()=>document.querySelector('iframe[src*="/titlebar-fixture/"]'));
    const f=await (async()=>{await p.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentWindow?.releaseTools));return p.frames().find(f=>f.url().includes('/titlebar-fixture/'));})();assert(f);
    await closed.settle(p);
    if(!phone){assert.equal(await p.locator('.aad-ptools [data-tool="settings"]').count(),0,'cold header has no tools before app initialization');}
    await f.evaluate(()=>releaseTools());
    const selector=phone?'.win .wbar > .wtools':'.aad-ptools';
    await p.locator(selector+' [data-tool="settings"]').filter({visible:true}).first().waitFor({state:'visible',timeout:5000});
    await p.locator(selector+' [data-tool="settings"]').filter({visible:true}).first().click();
    await f.waitForFunction(()=>calls.length===1);assert.deepEqual(await f.evaluate(()=>calls),['settings']);
    report.cases.push((phone?'phone':'desktop')+' held-init late registration visible without minimize; exact one handler');
    for(let n=0;n<3;n++){
     await f.evaluate(()=>WizardApp.titlebar.set(null));
     await p.waitForFunction(s=>!document.querySelector(s+' [data-tool="settings"]'),selector);
     await f.evaluate(()=>releaseTools());
     await p.locator(selector+' [data-tool="settings"]').filter({visible:true}).first().waitFor({state:'visible'});
    }
    report.cases.push((phone?'phone':'desktop')+' repeated tool removal/recreation');
    for(const skin of ['nebula','sepia']){
     await p.evaluate(s=>{WosSkin.set(s);WizAppearance.sync();},skin);
     await f.waitForFunction(s=>document.documentElement.dataset.skin===s,skin);
     await closed.settle(p);assert.equal(await f.locator('input').inputValue(),'Retained synthetic draft');
     const file=path.join(OUT,(phone?'phone':'desktop')+'-'+skin+'.png');await p.screenshot({path:file});
     report.captures.push({file,phone,skin,shell:await p.evaluate(()=>document.documentElement.dataset.shell)});
    }
    assert.equal(await f.evaluate(()=>calls.length),1,'rerenders never invoke app action');
   }finally{await c.close();}
  }
  report.pass=true;
 }catch(e){report.error=e.stack;throw e;}
 finally{await browser.close();report.transport=closed.report;fs.writeFileSync(path.join(OUT,'titlebar-report.json'),JSON.stringify(report,null,2));}
}
run().catch(e=>{console.error(e);process.exitCode=1});
