/* Focused source-bound browser proof; never labelled native. Forum admission only. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_DIR);
const URL0=process.env.QA_URL,OUT=process.env.QA_OUT,WIDTH=+(process.env.QA_WIDTH||390),BASELINE=process.env.QA_BASELINE==='1';
const result={kind:'browser',viewport:WIDTH,checks:{},status:'failed',sourceManifest:process.env.QA_SOURCE_MANIFEST};
let context;const profile=path.join(OUT,'profile');
async function open(offline=false){context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:WIDTH,height:900},isMobile:WIDTH<600,hasTouch:WIDTH<600,serviceWorkers:'allow'});if(offline)await context.setOffline(true);const p=await context.newPage();p.setDefaultTimeout(35000);return p;}
async function frame(p){await p.waitForFunction(()=>Array.from(document.querySelectorAll('iframe')).some(f=>f.src.includes('/wisdom/')));let f;for(let i=0;i<100;i++){f=p.frames().find(f=>new URL(f.url()||'about:blank').pathname.startsWith('/wisdom/'));if(f)break;await p.waitForTimeout(100)}assert(f,'real registered Wisdom iframe');await f.waitForFunction(()=>window.WisdomOffline&&typeof Wisdom!=='undefined'&&Wisdom.state?.collections?.length===1);return f;}
async function quiet(f){await f.waitForTimeout(500);assert(await f.evaluate(()=>{const el=document.getElementById('wisdom-offline');return !el||el.hidden||getComputedStyle(el).display==='none'||getComputedStyle(el).visibility==='hidden'}),'no offline popups anywhere');assert(await f.evaluate(()=>!document.querySelector('#toast.show')),'no automatic success/connectivity popups');}
async function chapter(f){await f.evaluate(()=>{location.hash='#/collection/flight-collection'});await f.locator('[data-wisdom-open="flight-chapter"]').first().click();await f.locator('#wisdom-pages').waitFor();await f.waitForFunction(()=>{const e=Wisdom.state.entries.find(e=>e.id==='flight-chapter');const im=document.querySelector('#wisdom-pages img');return e?.body?.includes('Quiet attention')&&im?.complete&&im.naturalWidth>0});}
async function cacheReady(f,p){await f.evaluate(()=>WisdomOffline.prefetch());await f.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();const ks=await caches.keys();return r?.active&&navigator.serviceWorker.controller&&ks.some(k=>k.startsWith('wisdom-shell-'))});await p.waitForFunction(async()=>{const ks=await caches.keys();return navigator.serviceWorker.controller&&ks.some(k=>k.startsWith('wizard-os-home-shell-'))});}
(async()=>{try{
 let p=await open();await p.goto(BASELINE?new URL('/wisdom/',URL0).href:URL0,{waitUntil:'domcontentloaded'});
 if(BASELINE){await p.waitForFunction(()=>window.WisdomOffline&&typeof Wisdom!=='undefined'&&Wisdom.state?.collections?.length);await context.setOffline(true);await p.evaluate(()=>window.dispatchEvent(new Event('offline')));await quiet(p);throw Error('baseline unexpectedly passed new assertion')}
 let f=await frame(p);assert.equal(await f.locator('[data-wisdom-col="flight-collection"]').count(),1);await cacheReady(f,p);
 result.checks.actualRegisteredIframe=await p.evaluate(()=>({id:WizSingleAppSession.id,offline:WizOfflineApps.allows('wisdom','/wisdom/')}));assert.deepEqual(result.checks.actualRegisteredIframe,{id:'wisdom',offline:true});
 const tokens=[];
 for(const skin of ['obsidian','obsidian-light']){
  await p.evaluate(s=>WosSkin.set(s),skin);await p.waitForTimeout(350);
  const t=await f.evaluate(()=>({bg:getComputedStyle(document.documentElement).getPropertyValue('--wz-bg').trim(),surface:getComputedStyle(document.documentElement).getPropertyValue('--wz-surface').trim()}));assert(t.bg&&t.surface,'Appearance v1 shared tokens');tokens.push(t.bg);
  await p.screenshot({path:path.join(OUT,`skin-${skin}.png`),fullPage:true});
 }
 assert.notEqual(tokens[0],tokens[1],'live skin change reaches real registered iframe');result.checks.skins=['obsidian','obsidian-light'];
 await p.evaluate(async()=>{for(const k of ['sibling-pin-sentinel','wos-shell-v1']){const c=await caches.open(k);await c.put(new URL('flight-cache-sentinel',location.href),new Response('keep'))}});
 await context.setOffline(true);await f.evaluate(()=>window.dispatchEvent(new Event('offline')));await quiet(f);await context.close();context=null;
 p=await open(true);await p.goto(URL0,{waitUntil:'domcontentloaded'});f=await frame(p);await quiet(f);await chapter(f);await p.screenshot({path:path.join(OUT,'offline-cold-chapter.png')});
 const write=await f.evaluate(async()=>{const e=Wisdom.state.entries.find(e=>e.id==='flight-chapter');const text='Quiet attention begins with one thing.';const start=e.body.indexOf(text);await api('wisdom/reaction',{kind:'entry',id:e.id,field:'progress',value:17});const h=await api('wisdom/highlight',{action:'add',entry_id:e.id,start,end:start+text.length,text,body_sha256:e.body_sha256,note:'Synthetic flight highlight'});return {queued:h.queued,pending:await WisdomOffline.pending(),snapshot:await WisdomOffline.snapshot()}});
 assert.equal(write.queued,true);assert(write.pending.length>=2);assert.equal(write.snapshot.highlights.length,1);result.checks.offlineWritesDurable=true;
 await context.close();context=null;p=await open(true);await p.goto(URL0,{waitUntil:'domcontentloaded'});f=await frame(p);
 const retained=await f.evaluate(async()=>({s:await WisdomOffline.snapshot(),q:await WisdomOffline.pending()}));assert.equal(retained.s.highlights.length,1);assert(retained.s.entries.find(e=>e.id==='flight-chapter').progress>=17);assert(retained.q.length>=2);result.checks.secondProcessDeathRetained=true;
 await chapter(f);await quiet(f);
 const failure=await f.evaluate(async()=>{const old=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Synthetic quota failure','QuotaExceededError')};try{await api('wisdom/reaction',{kind:'entry',id:'flight-chapter',field:'progress',value:67});return 'claimed-saved'}catch{return 'rejected'}finally{IDBObjectStore.prototype.put=old}});assert.equal(failure,'rejected');assert(!(await f.evaluate(()=>document.querySelector('#toast.show'))));result.checks.quotaFailureNeverClaimsSaved=true;
 await p.evaluate(async()=>{for(const k of ['sibling-pin-sentinel','wos-shell-v1'])assertSentinel: {const c=await caches.open(k);if(!await c.match(new URL('flight-cache-sentinel',location.href)))throw Error('sibling/workspace cache lost: '+k)}});result.checks.siblingWorkspaceCachesPreserved=true;
 await p.evaluate(()=>WizSingleAppSession.handleBack());await f.waitForFunction(()=>!document.getElementById('wisdom-pages')&&location.hash.includes('/collection/'));for(let i=0;i<6;i++)await p.evaluate(()=>WizSingleAppSession.handleBack());assert(new URL(p.url()).searchParams.get('app-session')==='wisdom');result.checks.nestedAndRootBack=true;
 await context.setOffline(false);await f.evaluate(()=>window.dispatchEvent(new Event('online')));
 // The fixture deliberately loses the first committed highlight ACK. Retry the SAME durable operation.
 for(let i=0;i<5;i++){await f.evaluate(()=>WisdomOffline.flush());if(await f.evaluate(async()=>(await WisdomOffline.pending()).length===0))break;await f.waitForTimeout(200)}
 assert.equal(await f.evaluate(async()=>(await WisdomOffline.pending()).length),0);
 const receipt=await (await context.request.get(new URL('/__fixture__/receipt',URL0).href)).json();assert.equal(receipt.synthetic,true);assert.equal(receipt.state.highlights.length,1);assert(receipt.state.entries.find(e=>e.id==='flight-chapter').progress>=17);
 const ids=receipt.writes.filter(x=>x.path.endsWith('/highlight')).map(x=>x.offline_id);assert(ids.length>=2&&new Set(ids).size===1,'lost ACK exactly-once replay with stable id');result.checks.exactlyOnceReplay={attempts:ids.length,uniqueIds:1,highlights:1};await quiet(f);
 result.status='pass';
 }catch(e){result.error={message:e.message,stack:e.stack};if(context)try{await context.pages().at(-1)?.screenshot({path:path.join(OUT,'FAIL.png')})}catch{};throw e}
 finally{if(context)await context.close();fs.writeFileSync(path.join(OUT,'acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))}
})().catch(()=>process.exitCode=1);
