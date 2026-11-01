/* Real-font source-bound browser diagnostic. Parent-admitted Forum light job ONLY.
 * Reuse: qa-flight-offline-fixture.py, actual Wisdom adapter/reader/fonts and PW.
 * No mocked FontFaceSet/geometry, product-source edits, native, or live data.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_DIR);
const OUT=process.env.QA_OUT,BASE=process.env.QA_URL,ARM=process.env.QA_ARM;
const WIDTH=+process.env.QA_WIDTH,HEIGHT=+process.env.QA_HEIGHT;
const manifest=JSON.parse(fs.readFileSync(process.env.QA_MANIFEST));
const report={kind:'real-font-browser-diagnostic',arm:ARM,viewport:{width:WIDTH,height:HEIGHT,dpr:1},status:'failed',cases:{},nativeAttribution:'unresolved; no historical pre-kill fraction/content evidence'};
const contexts=new Set();
function save(){fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// This getter observer ALWAYS returns the identical native promise. Only timing,
// status and DOM metadata are observed; no FontFace, metrics or promise is mocked.
function observe(){
 const proto=FontFaceSet.prototype,desc=Object.getOwnPropertyDescriptor(proto,'ready'),ids=new WeakMap();let serial=0;
 const q=window.__fontQA={events:[],accesses:[],firstResolved:false};
 const faces=()=>[...document.fonts].map(f=>({family:f.family,style:f.style,weight:f.weight,status:f.status}));
 const log=(event,more={})=>q.events.push({event,t:performance.now(),status:document.fonts.status,...more});
 Object.defineProperty(proto,'ready',{...desc,get(){
  const p=desc.get.call(this);if(!ids.has(p)){const row={id:++serial,resolved:false};ids.set(p,row);p.then(()=>{row.resolved=true;log('ready-resolved',{id:row.id})});}
  const row=ids.get(p),r=document.querySelector('.wb-reader');
  q.accesses.push({t:performance.now(),id:row.id,alreadyResolved:row.resolved,reader:!!r,flowStyled:!!r?.querySelector('.wb-flow')?.style.height,status:this.status,faces:faces(),bindReader:new Error().stack.includes('bindReader')});return p;
 }});
 document.fonts.ready.then(()=>{q.firstResolved=true;log('first-ready-resolved')});
 for(const e of ['loading','loadingdone','loadingerror'])document.fonts.addEventListener(e,()=>log(e,{faces:faces()}));
 q.readOutbox=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('wisdom-offline-v1',1);r.onupgradeneeded=()=>{r.transaction.abort();reject(Error('Expected existing offline DB'))};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('outbox','readonly'),get=tx.objectStore('outbox').getAll();let rows;get.onsuccess=()=>rows=get.result;tx.oncomplete=()=>{db.close();resolve(rows)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}}});
}
// Narrow fixture-leaf SPKI trust applies equally before and after process death.
// PersistentContext supplies the required isolated --user-data-dir itself.
function launchOptions(sw){
 const spki=manifest.fixture_tls.leaf_spki_sha256;
 assert(/^[A-Za-z0-9+/]{43}=$/.test(spki),'pinned synthetic fixture leaf SPKI');
 assert.equal(new URL(BASE).hostname,'localhost','fixture loopback only');
 return {executablePath:process.env.QA_CHROME,headless:true,viewport:{width:WIDTH,height:HEIGHT},deviceScaleFactor:1,isMobile:WIDTH<600,hasTouch:WIDTH<600,ignoreHTTPSErrors:false,serviceWorkers:sw?'allow':'block',args:['--disable-background-networking','--no-first-run','--ignore-certificate-errors-spki-list='+spki]};
}
async function open(name,{fraction=null,sw=false,offline=false}={}){
 const profile=path.join(OUT,'profile-'+name);
 const ctx=await chromium.launchPersistentContext(profile,launchOptions(sw));
 contexts.add(ctx);await ctx.addInitScript(observe);
 // Controlled restore input is set before app boot, never over a live reader.
 if(fraction!==null)await ctx.addInitScript(f=>{if(!sessionStorage.getItem('qa-seeded')){localStorage.setItem('wisdom:/wisdom/:pos:flight-chapter',String(f));sessionStorage.setItem('qa-seeded','1')}},fraction);
 const violations=[];
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==new URL(BASE).origin){violations.push({origin:u.origin,path:u.pathname});return route.abort('blockedbyclient')}return route.continue()});
 if(offline)await ctx.setOffline(true);
 const p=ctx.pages()[0]||await ctx.newPage();p.setDefaultTimeout(16000);
 p.on('pageerror',e=>{report.pageErrors??=[];report.pageErrors.push({name,message:e.message})});
 return {ctx,p,profile,violations};
}
async function close(o){if(o){await o.ctx.close();contexts.delete(o.ctx);assert.equal(o.violations.length,0,'no requests outside isolated loopback fixture')}}
async function reader(p){await p.locator('.wb-reader .wb-count').waitFor();await p.waitForFunction(()=>window.WisdomOffline&&document.querySelector('.wb-count')?.textContent.includes('/'));}
async function frames(p,n=5){await p.evaluate(n=>new Promise(resolve=>{const step=()=>--n?requestAnimationFrame(step):resolve();requestAnimationFrame(step)}),n);}
async function settled(p){await p.evaluate(()=>document.fonts.ready);await frames(p);await p.waitForFunction(()=>document.fonts.status==='loaded'&&document.fonts.check('22px "WB Text"'));}
async function snapshot(p,label){
 const s=await p.evaluate(async()=>{
  const r=document.querySelector('.wb-reader');if(!r)return {reader:false,hash:location.hash,fontEvents:__fontQA.events,readyAccesses:__fontQA.accesses};
  const stage=r.querySelector('.wb-stage'),flow=r.querySelector('.wb-flow'),sentinel=flow.querySelector('.wb-sentinel');
  const b=stage.getBoundingClientRect(),fb=flow.getBoundingClientRect(),sb=sentinel.getBoundingClientRect(),W=stage.clientWidth;
  const count=r.querySelector('.wb-count').textContent,[page,total]=count.split('/').map(Number),lead=r.querySelectorAll('.wb-track>.wb-slide:not(.wb-end)').length;
  const measuredColumns=Math.max(1,Math.floor((sb.left-fb.left)/W)+1);
  // UTF-16 offsets in the exact .wb-flow text-node concatenation (same indexing
  // prefix as highlightNodes). getClientRects per character proves visibility;
  // repeated synthetic prose cannot make distinct offsets compare equal.
  const walker=document.createTreeWalker(flow,NodeFilter.SHOW_TEXT);let node,off=0,text='',visible=[],anchorRects=[];
  while((node=walker.nextNode())){
   text+=node.nodeValue;const rg=document.createRange();
   for(let i=0;i<node.length;i++){
    if(/\s/.test(node.nodeValue[i]))continue;rg.setStart(node,i);rg.setEnd(node,i+1);
    const boxes=[...rg.getClientRects()];
    const box=boxes.find(x=>x.width>0&&x.height>0&&x.right>b.left+.5&&x.left<b.right-.5&&x.bottom>b.top+.5&&x.top<b.bottom-.5);
    if(box){visible.push({offset:off+i,c:node.nodeValue[i],x:box.left,y:box.top});if(anchorRects.length<4)anchorRects.push({offset:off+i,x:box.left,y:box.top,w:box.width,h:box.height})}
   }off+=node.length;
  }
  visible.sort((a,b)=>a.y-b.y||a.x-b.x||a.offset-b.offset);
  const first=visible[0]||null,projected=await WisdomOffline.projected(),outbox=await __fontQA.readOutbox();
  return {reader:true,hash:location.hash,bodySHA:r.dataset.bodySha256,bodyText:text,bodyLength:text.length,count,page,total,lead,declaredColumns:+flow.style.columnCount,measuredColumns,measuredTotal:lead+measuredColumns+1,sentinel:{left:sb.left,flowLeft:fb.left,delta:sb.left-fb.left},stage:{width:W,height:stage.clientHeight,x:b.x,y:b.y},flowFont:{family:getComputedStyle(flow).fontFamily,size:getComputedStyle(flow).fontSize,lineHeight:getComputedStyle(flow).lineHeight},firstVisible:first?{offset:first.offset,text:text.slice(first.offset,first.offset+180),char:first.c}:null,visibleOffsets:visible.map(x=>x.offset).sort((a,b)=>a-b),firstRects:anchorRects,localRaw:localStorage.getItem('wisdom:/wisdom/:pos:flight-chapter'),projectedProgress:projected.entries.find(e=>e.id==='flight-chapter')?.progress,highlights:projected.highlights,outbox,fonts:{status:document.fonts.status,checkText:document.fonts.check('22px "WB Text"'),checkDisplay:document.fonts.check('600 36px "WB Display"'),faces:[...document.fonts].map(f=>({family:f.family,style:f.style,weight:f.weight,status:f.status}))},readyAccesses:__fontQA.accesses,fontEvents:__fontQA.events,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
 });
 if(s.bodyText){s.bodyTextSHA=sha(s.bodyText);delete s.bodyText;}
 fs.writeFileSync(path.join(OUT,label+'.json'),JSON.stringify(s,null,2));save();await p.screenshot({path:path.join(OUT,label+'.png')});return s;
}
function metrics(s){assert(s.fonts.checkText&&s.fonts.status==='loaded','actual Newsreader face loaded');assert.equal(s.total,s.measuredTotal,'footer total equals fresh actual sentinel columns');assert.equal(s.declaredColumns,s.measuredColumns,'declared columnCount equals fresh actual sentinel columns');assert(s.firstVisible,'actual body text must be visible');}
function identity(s,ref){assert.equal(s.bodyTextSHA,ref.bodyTextSHA);assert.equal(s.count,ref.count,'exact warm reference page/total');assert.deepEqual(s.firstVisible,ref.firstVisible,'exact warm reference visible offset/text');assert.equal(s.localRaw,ref.localRaw,'exact persisted fraction');}
// REUSE R8's trusted locator tap/hit test; arrows are intentionally hidden mobile.
async function pageInput(p,forward){
 const before=await p.locator('.wb-count').textContent();
 if(WIDTH<600){
  const stage=p.locator('.wb-stage');await stage.waitFor({state:'visible'});
  const hit=await stage.evaluate((el,forward)=>{const b=el.getBoundingClientRect();for(const fy of [.5,.35,.2,.65]){const x=b.width*(forward?.85:.15),y=b.height*fy,t=document.elementFromPoint(b.x+x,b.y+y);if(t&&el.contains(t)&&!t.closest('button,a,input,textarea,select,[role="button"]'))return {position:{x,y},bounds:{x:b.x,y:b.y,width:b.width,height:b.height},target:{tag:t.tagName,className:t.className}}}throw Error('No visible non-control reader edge tap target')},forward);
  await stage.evaluate(el=>{window.__qaPagingEvents=[];for(const type of ['pointerdown','pointerup','click'])el.addEventListener(type,e=>window.__qaPagingEvents.push({type:e.type,isTrusted:e.isTrusted,pointerType:e.pointerType}),{capture:true,once:true})});
  await stage.tap({position:hit.position});
  const events=await p.evaluate(()=>window.__qaPagingEvents);
  report.pagingInputs??=[];report.pagingInputs.push({kind:'R8 trusted locator edge tap',forward,before,hit,events});save();
  assert(events.some(e=>e.type==='pointerdown'&&e.isTrusted&&e.pointerType==='touch'),'actual trusted touch reached reader stage');
 }else await p.getByRole('button',{name:forward?'Next page':'Previous page',exact:true}).click();
 await p.waitForFunction(x=>document.querySelector('.wb-count')?.textContent!==x,before);await p.waitForTimeout(380);
 const after=await p.locator('.wb-count').textContent();assert.equal(+after.split('/')[0],+before.split('/')[0]+(forward?1:-1),'one real input turns exactly one page');
}
async function turn(p){await pageInput(p,true);}
async function seek(p,target){let current=await p.locator('.wb-count').evaluate(el=>+el.textContent.split('/')[0]);assert(target>=1&&target<=100);while(current!==target){await pageInput(p,current<target);current=await p.locator('.wb-count').evaluate(el=>+el.textContent.split('/')[0]);}}
async function stableDurable(p,label){let last='',n=0;for(let i=0;i<35;i++){
 const s=await snapshot(p,label),latest=s.outbox.filter(x=>x.body?.field==='progress'&&x.body.id==='flight-chapter').at(-1),pct=Math.round((s.page-1)/(s.total-1)*100),key=JSON.stringify([s.localRaw,s.projectedProgress,s.count,s.outbox]);
 n=key===last?n+1:0;last=key;if(n>=2&&s.projectedProgress===pct&&latest?.body.value===pct&&s.localRaw!==null&&Number(s.localRaw)===(s.page-1)/(s.total-1))return s;await p.waitForTimeout(100);
 }throw Error('Actual UI page, exact fraction, projected progress and durable outbox did not agree');}
async function warm(){
 const o=await open('warm',{fraction:0});await o.p.goto(BASE,{waitUntil:'domcontentloaded'});await o.p.waitForFunction(()=>typeof Wisdom!=='undefined'&&document.querySelector('.wb-home'));
 await o.p.evaluate(async()=>{for(const face of ['22px "WB Text"','italic 22px "WB Text"','600 36px "WB Display"','italic 500 36px "WB Display"'])await document.fonts.load(face);await document.fonts.ready;Wisdom.navigate('/read/flight-chapter')});
 await reader(o.p);await settled(o.p);for(let i=0;i<4;i++)await turn(o.p);
 const s=await snapshot(o.p,'warm-reference');metrics(s);assert.equal(s.page,5,'warm position chosen by four real page turns');return {...o,reference:s};
}
async function delayed(name,fraction,action,warmRef){
 const o=await open(name,{fraction});let releaseAPI,releaseFonts;
 const apiGate=new Promise(r=>releaseAPI=r),fontGate=new Promise(r=>releaseFonts=r),deliveries=[];
 let apiHeld=0,fontsReleased=false;
 await o.ctx.route('**/api/wisdom',async route=>{if(route.request().method()!=='GET')return route.fallback();apiHeld++;await apiGate;return route.continue()});
 await o.ctx.route('**/wisdom-art/f/*.woff2',async route=>{
  const response=await route.fetch(),bytes=await response.body(),file=new URL(route.request().url()).pathname.split('/').at(-1),hash=sha(bytes);
  const row={file,sha256:hash,heldAt:Date.now(),released:false};deliveries.push(row);
  assert.equal(hash,manifest.fonts[file],'real response equals pinned source font asset');await fontGate;
  row.released=true;row.releasedAt=Date.now();return route.fulfill({response,body:bytes});
 });
 try{
  await o.p.goto(BASE+'#/read/flight-chapter',{waitUntil:'domcontentloaded'});
  await o.p.waitForFunction(()=>window.__fontQA?.firstResolved&&document.fonts.status==='loaded'&&!document.querySelector('.wb-reader'));
  for(let i=0;!apiHeld&&i<60;i++)await o.p.waitForTimeout(50);
  assert(apiHeld>0,'real data response held before reader discovery');const before=await o.p.evaluate(()=>({firstResolved:__fontQA.firstResolved,status:document.fonts.status,events:__fontQA.events}));
  releaseAPI();await reader(o.p);await o.p.waitForFunction(()=>document.fonts.status==='loading');await frames(o.p,10);
  const pending=await snapshot(o.p,name+'-pending');assert(pending.readyAccesses.some(x=>x.bindReader),'native FontFaceSet.ready observed in actual bindReader');
  assert(!pending.fonts.checkText,'fallback layout before actual Newsreader delivery');assert(!fontsReleased&&deliveries.some(x=>x.file==='newsreader.woff2'&&!x.released),'real Newsreader response held until after fallback DOM layout');
  let turned=null,removed=null;
  if(action==='turn'){await turn(o.p);turned=await snapshot(o.p,name+'-turned-pending');assert.equal(turned.page,pending.page+1);assert(turned.firstVisible,'turned fallback body visible');}
  if(action==='replace'){
   await o.p.evaluate(()=>{const r=document.querySelector('.wb-reader');__fontQA.removed=r;__fontQA.removedMutations=[];new MutationObserver(rows=>__fontQA.removedMutations.push(...rows.map(x=>({type:x.type,attribute:x.attributeName})))).observe(r,{subtree:true,attributes:true,childList:true,characterData:true});Wisdom.navigate('/collection/flight-collection')});
   await o.p.locator('.wb-reader').waitFor({state:'hidden'});
   await o.p.locator('a[data-wisdom-route^="/read/flight-chapter"]').first().click();await reader(o.p);await frames(o.p);
   removed=await o.p.evaluate(()=>{__fontQA.removedMutations.length=0;return {connected:__fontQA.removed.isConnected,count:__fontQA.removed.querySelector('.wb-count').textContent}});assert.equal(removed.connected,false);
  }
  fontsReleased=true;releaseFonts();await settled(o.p);
  const final=await snapshot(o.p,name+'-final'),evidence={before,pending,turned,removed,final,deliveries};
  // Persist diagnostic evidence BEFORE any regression assertion.
  report.cases[name]={status:'failed',...evidence};save();
  metrics(final);
  if(action==='turn'){
   const anchor=turned.firstVisible.offset;
   const target=await warmRef.p.evaluate(off=>{const r=document.querySelector('.wb-reader'),flow=r.querySelector('.wb-flow'),stage=r.querySelector('.wb-stage'),walker=document.createTreeWalker(flow,NodeFilter.SHOW_TEXT),lead=r.querySelectorAll('.wb-track>.wb-slide:not(.wb-end)').length;let n,pos=0;while((n=walker.nextNode())){if(pos+n.length>off){const rg=document.createRange();rg.setStart(n,off-pos);rg.setEnd(n,off-pos+1);return lead+Math.floor((rg.getBoundingClientRect().left-flow.getBoundingClientRect().left+1)/stage.clientWidth)+1;}pos+=n.length;}throw Error('anchor outside same body')},anchor);
   await seek(warmRef.p,target);const ref=await snapshot(warmRef.p,name+'-warm-anchor-reference');metrics(ref);
   assert(final.visibleOffsets.includes(anchor),'genuine turn preserves the exact fallback-visible anchor after font settlement');assert.equal(final.count,ref.count);assert.deepEqual(final.firstVisible,ref.firstVisible,'turned pending position equals fully warm anchored passage');assert.equal(final.localRaw,ref.localRaw,'turned pending exact persisted fraction equals warm anchored passage');
  }else identity(final,warmRef.reference);
  if(action==='replace'){const after=await o.p.evaluate(()=>({connected:__fontQA.removed.isConnected,count:__fontQA.removed.querySelector('.wb-count').textContent,mutations:__fontQA.removedMutations}));report.cases[name].removedAfter=after;assert.equal(after.count,removed.count);assert.equal(after.mutations.length,0,'no stale callback mutation of removed reader');}
  report.cases[name].status='pass';return final;
 }finally{releaseAPI();releaseFonts();fs.writeFileSync(path.join(OUT,name+'-font-deliveries.json'),JSON.stringify(deliveries,null,2));await close(o);}
}
async function offline(){
 let o=await open('offline',{fraction:0,sw:true});
 try{
  await o.p.goto(BASE+'#/read/flight-chapter',{waitUntil:'domcontentloaded'});await reader(o.p);await settled(o.p);
  await o.p.evaluate(async()=>{await WisdomOffline.started;await WisdomOffline.warm(await WisdomOffline.projected())});
  await o.p.waitForFunction(async()=>{const s=await WisdomOffline.status();return s.ready&&!s.warming&&!s.error&&navigator.serviceWorker.controller});
  const cache=await o.p.evaluate(async()=>{const rows=[];for(const key of await caches.keys()){const c=await caches.open(key);for(const req of await c.keys())if(req.url.includes('/wisdom-art/f/')){const b=await(await c.match(req)).arrayBuffer(),h=await crypto.subtle.digest('SHA-256',b);rows.push({key,file:new URL(req.url).pathname.split('/').at(-1),sha256:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')})}}return rows});
  fs.writeFileSync(path.join(OUT,'offline-warmed-font-cache.json'),JSON.stringify(cache,null,2));
  for(const [file,hash]of Object.entries(manifest.fonts))assert(cache.some(x=>x.file===file&&x.sha256===hash),'actual warmed font cache '+file);
  await o.ctx.setOffline(true);for(let i=0;i<4;i++)await turn(o.p);
  await o.p.evaluate(async()=>{const e=(await WisdomOffline.projected()).entries.find(e=>e.id==='flight-chapter'),text='Quiet attention begins with one thing.',flow=document.querySelector('.wb-flow'),start=flow.textContent.indexOf(text);if(start<0)throw Error('fixture quote absent');await api('wisdom/highlight',{action:'add',entry_id:e.id,start,end:start+text.length,text,body_sha256:e.body_sha256,note:'Synthetic font settlement proof'})});
  const before=await stableDurable(o.p,'offline-before-kill');metrics(before);assert.equal(before.highlights.length,1);
  const cdp=await o.ctx.browser().newBrowserCDPSession(),info=await cdp.send('SystemInfo.getProcessInfo'),pid=Number(info.processInfo.find(x=>x.type==='browser')?.id);
  assert(Number.isInteger(pid)&&pid>1,'actual browser PID');assert(fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').includes(o.profile),'browser PID bound to this isolated persistent profile');
  const pgid=Number(fs.readFileSync(`/proc/${pid}/stat`,'utf8').split(') ')[1].split(' ')[2]);assert.equal(pgid,pid,'owned Chromium is its own process-group root');
  report.cases.offline={status:'failed',cache,before,death:{kind:'SIGKILL of verified actual Chromium process group',pid,pgid}};save();
  const disconnected=new Promise(r=>o.ctx.browser().once('disconnected',r));process.kill(-pgid,'SIGKILL');await Promise.race([disconnected,new Promise((_,rej)=>setTimeout(()=>rej(Error('browser death timeout')),6000))]);contexts.delete(o.ctx);
  const profile=o.profile;o=null;
  // Re-open the SAME disk-backed profile after real process death, with network
  // offline BEFORE navigation. No fonts/storage/API response injection on resume.
  const ctx=await chromium.launchPersistentContext(profile,launchOptions(true));contexts.add(ctx);await ctx.setOffline(true);await ctx.addInitScript(observe);o={ctx,p:ctx.pages()[0]||await ctx.newPage(),profile,violations:[]};o.p.setDefaultTimeout(16000);
  await o.p.goto(BASE+'#/read/flight-chapter',{waitUntil:'domcontentloaded'});await reader(o.p);await settled(o.p);const after=await stableDurable(o.p,'offline-after-process-death');report.cases.offline.after=after;save();
  metrics(after);identity(after,before);assert.deepEqual(after.highlights,before.highlights,'exact persisted highlight rows');assert.deepEqual(after.outbox,before.outbox,'exact durable outbox including IDs and position values');assert.equal(after.projectedProgress,before.projectedProgress);
  report.cases.offline.status='pass';
 }finally{await close(o);}
}
async function phase(name,fn){try{await fn()}catch(e){report.cases[name]={...report.cases[name],status:'failed',error:{message:e.message,stack:e.stack}}}save();}
(async()=>{try{
 let w;try{w=await warm();report.cases.warm={status:'pass',reference:w.reference};save();}catch(e){report.cases.warm={status:'failed',error:e.message};throw e}
 const fraction=Number(w.reference.localRaw);report.restoreInput={fraction,raw:w.reference.localRaw,source:'actual warm reader four trusted page inputs (R8 mobile edge taps / desktop Next clicks)'};
 try{for(const [name,action]of [['untouched','none'],['turn-pending','turn'],['replaced-reader','replace']])await phase(name,()=>delayed(name,fraction,action,w));}finally{await close(w)}
 await phase('offline',offline);
 report.status=Object.values(report.cases).every(x=>x.status==='pass')?'pass':'failed';
}catch(e){report.error={message:e.message,stack:e.stack}}finally{for(const c of contexts)try{await c.close()}catch{}save();console.log(JSON.stringify({arm:ARM,viewport:report.viewport,status:report.status,cases:Object.fromEntries(Object.entries(report.cases).map(([k,v])=>[k,v.status])),report:path.join(OUT,'report.json')}));process.exitCode=report.status==='pass'?0:1;}})();
