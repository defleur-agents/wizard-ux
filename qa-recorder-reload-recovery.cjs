'use strict';
// Reuse the exact-live closed synthetic shell fence; never contact an owner origin or meeting API.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('./tools/qa-playwright.cjs');
const fixture=require('./tools/qa-closed-shell.cjs');
const OUT=process.env.QA_OUT;assert(OUT);fs.mkdirSync(OUT,{recursive:true});
const ORIGIN='http://wizard-qa.invalid',results={source:process.env.QA_SOURCE_SHA,synthetic:true,cases:[],screenshots:[]};
let browser,page,stage='boot';const pass=name=>{results.cases.push(name);console.log('PASS',name)};
const app='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/wizard-os-home/kit/wizard-ui.css"><script src="/wizard-os-home/core/app-client.js"></script><p>Synthetic Recorder: microphone startup failed. No private data.</p><script>window.fixtureHold=WizardApp.update.hold("Mizel recording");window.fixtureReady=true;</script>';
async function load(phone){
 let version='a'.repeat(40);
 const {c}=await fixture.boot(phone,async c=>{
   await c.addInitScript(()=>{if(window===top)sessionStorage.setItem('syntheticLoads',String(+(sessionStorage.getItem('syntheticLoads')||0)+1));});
   await c.route('**/wizard/v1/apps',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({apps:[{id:'mizel',name:'Synthetic Recorder',kind:'wizard',url:'/fixture-recorder/',source:'apps.json'}]})}));
   await c.route('**/fixture-recorder/**',r=>r.fulfill({contentType:'text/html',body:app}));
   await c.route('**/wizard-os-home/ux-version.txt',r=>r.fulfill({contentType:'text/plain',body:version}));
 });
 page=fixture.getPage();await page.clock.resume();
 await page.waitForFunction(()=>window.WizAppCapture&&window.WizWebUpdate&&window.WizAppServices);
 await page.evaluate(()=>WizOpenApp('mizel'));
 await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentWindow?.fixtureReady));
 await page.waitForFunction(()=>WizAppServices.inspect().some(f=>f.appId==='mizel'&&f.holds.includes('Mizel recording')));
 await page.evaluate(()=>WizCore.deeplink.route(location.origin+'/wizard-os-home/?view=chats'));
 await fixture.settle(page);
 const frame=()=>page.frames().find(f=>f.url().includes('/fixture-recorder/'));
 return {c,frame,async update(){await page.evaluate(()=>WizWebUpdate.check(true));version='b'.repeat(40);await page.evaluate(()=>WizWebUpdate.check(true));await page.locator('#dvWeb [data-web="go"]').waitFor();}};
}
async function shot(name,skin){
 await fixture.settle(page);assert.equal(await page.evaluate(()=>WosSkin.current),skin);
 const button=page.locator('#dvWeb [data-web="go"]'),box=await button.boundingBox(),viewport=page.viewportSize();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height);
 const file=path.join(OUT,name+'.png');await page.screenshot({path:file});results.screenshots.push({file,skin,box,shell:await page.evaluate(()=>document.documentElement.dataset.shell)});
}
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.QA_CHROME||undefined,args:['--disable-background-networking','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--unsafely-treat-insecure-origin-as-secure='+ORIGIN]});fixture.setBrowser(browser);
 for(const phone of [true,false]){
  const mode=phone?'phone':'desktop';stage=mode+': failed Start';const {c,frame,update}=await load(phone);
  await page.waitForFunction(()=>WizAppCapture.getState().nativeRegistryReady===true);
  assert.equal(await page.evaluate(()=>WizAppServices.update.reloadPlan().ok),true,'REGRESSION_FAILED_START_HOLD_MUST_NOT_TRAP_RELOAD');pass(mode+': exact failed-start hold no longer traps Reload');
  await frame().evaluate(()=>window.notesHold=WizardApp.update.hold('Mizel unsaved notes'));
  assert.equal(await page.evaluate(()=>WizAppServices.update.reloadPlan().ok),false);await frame().evaluate(()=>notesHold.release());pass(mode+': unsaved notes remain protected');
  await update();
  for(const skin of ['nebula','sepia']){
   stage=mode+': '+skin+' check';await page.evaluate(s=>WosSkin.set(s),skin);await fixture.settle(page);
   await page.evaluate(()=>WizAppCapture.configureNativeBridge({start:()=>{throw Error('must not start')},stop:()=>{throw Error('must not stop')},status:()=>new Promise(r=>window.syntheticStatus=r)}));
   await page.locator('#dvWeb [data-web="go"]').click();
   await page.waitForFunction(()=>!!window.syntheticStatus);assert.equal(await page.locator('#dvWeb [data-web="go"]').textContent(),'Checking recorder…');
   await shot(mode+'-'+skin+'-checking',skin);
   // A bridge failure must leave this document/audio intact, then allow a normal retry.
   const before=await page.evaluate(()=>sessionStorage.getItem('syntheticLoads'));
   await page.evaluate(()=>{syntheticStatus(null);window.syntheticStatus=null});
   await page.waitForFunction(()=>!document.querySelector('#dvWeb [aria-busy="true"]'));
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('syntheticLoads')),before);pass(mode+': '+skin+' immediate checking/error stays recoverable');
  }
  stage=mode+': real browser capture';
  await page.evaluate(async()=>{WizAppCapture.configureNativeBridge(null);await WizAppCapture.reconcileReload();window.syntheticSession=await WizAppCapture.start('mizel',{kind:'audio',chunkMs:100,meta:{meetingId:'synthetic-only'}});});
  assert.equal(await page.evaluate(()=>WizAppCapture.reloadCheck().safe),false);
  const before=await page.evaluate(()=>sessionStorage.getItem('syntheticLoads'));
  await page.locator('#dvWeb [data-web="go"]').click();assert.equal(await page.evaluate(()=>WizWebUpdate.armed),true);
  await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>sessionStorage.getItem('syntheticLoads')),before);pass(mode+': real MediaRecorder audio cannot be bypassed');
  const kept=await page.evaluate(async()=>{const out=await syntheticSession.stop();sessionStorage.setItem('syntheticCapture',out.id);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await out.blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');return {id:out.id,bytes:out.blob.size,hash}});assert(kept.bytes>0);
  await page.waitForFunction(before=>sessionStorage.getItem('syntheticLoads')!==before,before,{timeout:15000});
  await page.waitForFunction(()=>window.WizAppCapture);
  const after=await page.evaluate(async()=>{const rows=await WizAppCapture.pending('mizel');const r=rows.find(r=>r.id===sessionStorage.getItem('syntheticCapture'));return r&&{id:r.id,bytes:r.blob.size,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('')}});
  assert.deepEqual(after,kept);pass(mode+': Stop then Reload retains exact durable synthetic audio bytes');
  results[mode]={kept};await c.close();
 }
 assert.deepEqual(fixture.report.unknown,[],'no uncatalogued or real network paths');assert.deepEqual(fixture.report.errors,[],'no page exceptions');pass('closed synthetic fence: no private content/API access');
}catch(e){results.failure={stage,error:String(e.stack)};await page?.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});process.exitCode=1;console.error(results.failure)}finally{fs.writeFileSync(path.join(OUT,'recorder-reload.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'fixture-requests.json'),JSON.stringify(fixture.report,null,2));await browser?.close();}})();
