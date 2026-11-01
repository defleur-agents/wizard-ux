/* Parent-admitted Forum light ONLY. Exact old/candidate runtime + real app session.
 * REUSE R3 TLS/profile death/range metrics; EXTEND diagnostic, not product.
 * No API writes, fraction seeding, font preload, font/layout wrappers or delays.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_DIR);
const OUT=process.env.QA_OUT,BASE=process.env.QA_URL,CASE=process.env.QA_CASE;
const M=JSON.parse(fs.readFileSync(process.env.QA_MANIFEST));
const report={kind:'R32-layout-discriminator',variant:process.env.QA_VARIANT,case:CASE,status:'incomplete',releaseAllowed:false,nativeAcceptance:false,platform:'browser simulated native top24 cutout0; trusted CDP touch; NOT Android WebView',viewport:{width:411,height:799,dpr:2.625},checkpoints:[],deaths:[],egress:[],pageErrors:[]};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function save(){fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));}
let owned=null, probe=null; const layout=require('./layout-trace.cjs');
function prebootNative(){
 // Platform boundary inputs must exist before any host product script.
 if(window===window.top)window.WizardOSNative={insetTop:()=>24,cutoutTop:()=>0,immersive:()=>{}};
}
function installObservers(){
 // Readonly diagnostic listeners, installed against this actual owned document.
 const doc=document;
 if(window.__r20?.readout?.().sameDocument)return window.__r20.readout();
 const q=window.__r20={events:[],inputs:[]};
 const meta={id:location.href+':'+performance.now(),installedAt:performance.now(),readyAt:null,inputListeners:[],fontListeners:[],mutationAttached:false,resizeTargets:0};
 const readout=()=>({...meta,sameDocument:document===doc,qIdentity:window.__r20===q,fontTarget:doc.fonts===fontTarget,readyState:doc.readyState,url:location.href});
 const fontTarget=doc.fonts;
 Object.defineProperty(q,'readout',{value:readout});
 const add=(event,extra={})=>{if(q.events.length<4000)q.events.push({event,t:performance.now(),...extra})};
 const sizes=new ResizeObserver(rows=>{for(const row of rows)add('resize-observed',{target:row.target.className,width:row.contentRect.width,height:row.contentRect.height})});
 const sized=new WeakSet();
 const watchSizes=()=>{for(const el of doc.querySelectorAll('iframe.appframe,.wb-stage,.wb-flow'))if(!sized.has(el)){sized.add(el);sizes.observe(el);meta.resizeTargets++}};
 for(const type of ['loading','loadingdone','loadingerror']){fontTarget.addEventListener(type,()=>add('fonts-'+type,{status:fontTarget.status,faces:[...fontTarget].map(x=>({family:x.family,status:x.status}))}));meta.fontListeners.push(type)}
 for(const type of ['pointerdown','pointerup','pointercancel','click']){doc.addEventListener(type,e=>{if(q.inputs.length<300)q.inputs.push({type,isTrusted:e.isTrusted,pointerType:e.pointerType,x:e.clientX,y:e.clientY,t:performance.now(),target:e.target?.className})},true);meta.inputListeners.push(type)}
 new MutationObserver(rows=>{watchSizes();for(const row of rows){const el=row.target.nodeType===1?row.target:row.target.parentElement;
   if(!el?.closest?.('.wb-reader')&&!el?.matches?.('iframe.appframe'))continue;
   if(row.type==='attributes'&&!['style','class','data-cap-hl','hidden'].includes(row.attributeName))continue;
   const r=doc.querySelector('.wb-reader');add('mutation',{type:row.type,attribute:row.attributeName,target:el.className,count:r?.querySelector('.wb-count')?.textContent,flowStyle:r?.querySelector('.wb-flow')?.getAttribute('style'),marks:r?[...r.querySelectorAll('mark.wb-hl')].map(m=>({text:m.textContent,id:m.dataset.hl,class:m.className})):[]});
 }}).observe(doc,{subtree:true,childList:true,characterData:true,attributes:true});meta.mutationAttached=true;
 const ready=()=>{if(meta.readyAt!==null)return;meta.readyAt=performance.now();watchSizes();add('observer-document-ready',{readyState:doc.readyState})};
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
 return readout();
}
async function observersReady(){
 const rows={};
 for(const [name,frame]of [['host',owned.p],['child',owned.f]]){
  // Repair omitted/deferred init-script installation only; never mutate product.
  await frame.waitForFunction(()=>document.readyState!=='loading');
  await frame.evaluate(installObservers);
  const a=await frame.evaluate(()=>window.__r20?.readout?.());
  await frame.evaluate(installObservers);
  const b=await frame.evaluate(()=>window.__r20?.readout?.());
  rows[name]={first:a,second:b};
  assert(a&&b&&a.id===b.id&&b.qIdentity&&b.sameDocument&&b.fontTarget,'own observer queue identity '+name);
  assert(b.readyAt!==null&&b.inputListeners.length===4&&b.fontListeners.length===3&&b.mutationAttached,'owned document observer readiness '+name);
 }
 report.observerLaunches??=[];report.observerLaunches.push(rows);save();
}
function options(){assert.equal(new URL(BASE).hostname,'localhost');assert(/^[A-Za-z0-9+/]{43}=$/.test(M.fixture_tls.leaf_spki_sha256));return {executablePath:process.env.QA_CHROME,headless:true,viewport:{width:411,height:799},deviceScaleFactor:2.625,isMobile:true,hasTouch:true,serviceWorkers:'allow',ignoreHTTPSErrors:false,args:['--disable-background-networking','--no-first-run','--ignore-certificate-errors-spki-list='+M.fixture_tls.leaf_spki_sha256]};}
async function launch(profile,offline,arm='legacy'){
 const ctx=await chromium.launchPersistentContext(profile,{...options(),offline:!!offline});owned={ctx,profile,p:null,f:null};
 // Capture startup before ANY goto/close; never unload a competing writer to hide it.
 const startup={arm,offlineRequested:offline,offlineAtConstruction:!!offline,pages:[]};
 report.startups??=[];report.startups.push(startup);save();
 for(const page of ctx.pages()){
  const row={url:page.url(),frames:[]};startup.pages.push(row);
  try{const c=await ctx.newCDPSession(page);row.history=await c.send('Page.getNavigationHistory');await c.detach()}catch(e){row.historyError=e.message}
  for(const frame of page.frames())try{row.frames.push(await frame.evaluate(()=>{const rows={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('wos.single.v1:'))rows[k]=localStorage.getItem(k)}}catch{}return {url:location.href,ready:document.readyState,storage:rows}}))}catch(e){row.frames.push({error:e.message})}
 }
 save();
 if(arm==='controlled')assert(startup.pages.every(x=>['about:blank',''].includes(x.url)),'controlled cold start must contain no restored app page');
 await ctx.addInitScript(prebootNative);
 await ctx.addInitScript(installObservers);
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==new URL(BASE).origin){report.egress.push({url:u.href});save();return route.abort('blockedbyclient')}return route.continue()});
 ctx.on('request',req=>{const u=new URL(req.url());if(!['data:','blob:'].includes(u.protocol)&&u.origin!==new URL(BASE).origin){report.egress.push({url:u.href,observed:true});save()}});
 if(offline)await ctx.setOffline(true);
 const p=ctx.pages()[0]||await ctx.newPage();owned.p=p;p.setDefaultTimeout(18000);
 p.on('pageerror',e=>{report.pageErrors.push(e.message);save()});
 const trace={arm,profile,events:[]};report.bootTraces??=[];report.bootTraces.push(trace);
 const session=await ctx.newCDPSession(p);await session.send('Page.enable');await session.send('DOMStorage.enable');
 for(const type of ['Page.frameNavigated','Page.navigatedWithinDocument','DOMStorage.domStorageItemAdded','DOMStorage.domStorageItemUpdated','DOMStorage.domStorageItemRemoved'])session.on(type,e=>{if(trace.events.length<3000)trace.events.push({type,t:Date.now(),event:e})});
 if(CASE==='traced'){probe=await layout.attach(await ctx.newCDPSession(p),fs.readFileSync(path.join(__dirname,'source/wisdom/static/wisdom.js'),'utf8'),M.productJSsha256);}
 await p.goto(BASE,{waitUntil:'domcontentloaded',timeout:30000});
 const hostPages=ctx.pages().filter(x=>{try{const u=new URL(x.url());return u.origin===new URL(BASE).origin&&u.searchParams.get('app-session')==='wisdom'}catch{return false}});
 trace.appSessionURLs=hostPages.map(x=>x.url());save();assert.equal(hostPages.length,1,'one app-session writer only; no silent tab close');
 await p.locator('iframe.appframe').waitFor({state:'visible'});
 const frameEl=await p.locator('iframe.appframe').elementHandle(),f=await frameEl.contentFrame();assert(f,'actual host-owned Wisdom iframe');owned.f=f;
 await f.waitForFunction(()=>window.WisdomOffline&&document.querySelector('.wb-home,.wb-reader,.wb-collection'));
 await observersReady();if(probe){const sources=await probe.ready();report.tracedSources??=[];report.tracedSources.push(sources);save();assert(sources.length,'actual script identity before reader');}
 return owned;
}
async function reader(){await owned.f.locator('.wb-reader .wb-count').waitFor({state:'visible'});await owned.f.waitForFunction(()=>document.querySelector('.wb-count')?.textContent.includes('/'));}
async function checkpoint(label){
 const {p,f}=owned;
 const host=await p.evaluate(()=>{const el=document.querySelector('iframe.appframe'),b=el?.getBoundingClientRect(),slot='wos.single.v1:'+JSON.stringify([location.origin,'wisdom']);const storage={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k===slot||k.startsWith(slot+':presentation:')||k.startsWith('wos.app-reading.v1:'))storage[k]=localStorage.getItem(k)}return {url:location.href,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},iframe:b?.toJSON(),insets:{nat:getComputedStyle(document.documentElement).getPropertyValue('--nat-t'),cut:getComputedStyle(document.documentElement).getPropertyValue('--cut-t')},storage,observer:window.__r20?.readout?.(),events:window.__r20?.events||[],inputs:window.__r20?.inputs||[]}});
 host.presentationJournal=await p.evaluate(async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('wisdom-offline-v1',1);r.onupgradeneeded=()=>{r.transaction.abort();reject(Error('Expected existing replica'))};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('meta','readonly'),get=tx.objectStore('meta').get('presentation:wos.single.v1:'+JSON.stringify([location.origin,'wisdom']));let result;get.onsuccess=()=>{result=get.result};tx.oncomplete=()=>{db.close();resolve(result||null)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}}}));
 const child=await f.evaluate(async()=>{
  const rect=x=>x?.getBoundingClientRect().toJSON();
  const q=window.__r20,r=document.querySelector('.wb-reader');
  const s={url:location.href,hash:location.hash,t:performance.now(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},presentationFacade:!!window.__wosPresentationStorage,localRaw:localStorage.getItem('wisdom:/wisdom/:pos:flight-chapter'),reader:!!r,observer:q?.readout?.(),events:q?.events||[],inputs:q?.inputs||[],fonts:{status:document.fonts.status,text:document.fonts.check('22px "WB Text"'),display:document.fonts.check('600 36px "WB Display"'),faces:[...document.fonts].map(x=>({family:x.family,style:x.style,weight:x.weight,status:x.status}))},scrolls:[{tag:'window',x:scrollX,y:scrollY}]};
  // Existing DB only, readonly; never create a schema or mutate outbox.
  s.outbox=await new Promise((resolve,reject)=>{const req=indexedDB.open('wisdom-offline-v1',1);req.onupgradeneeded=()=>{req.transaction.abort();reject(Error('Expected existing offline DB'))};req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('outbox','readonly'),get=tx.objectStore('outbox').getAll();let rows;get.onsuccess=()=>rows=get.result;tx.oncomplete=()=>{db.close();resolve(rows)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}}});
  const projected=await WisdomOffline.projected();s.projected={entry:projected.entries.find(x=>x.id==='flight-chapter'),highlights:projected.highlights};s.offline=await WisdomOffline.status();
  if(!r)return s;
  const stage=r.querySelector('.wb-stage'),flow=r.querySelector('.wb-flow'),track=r.querySelector('.wb-track'),sentinel=flow.querySelector('.wb-sentinel'),b=stage.getBoundingClientRect(),fb=flow.getBoundingClientRect(),sb=sentinel.getBoundingClientRect(),cs=getComputedStyle(flow),W=stage.clientWidth;
  s.dataSize=r.dataset.size;s.bodyRGB=getComputedStyle(document.body).backgroundColor;s.domSHAInput=flow.innerHTML;s.count=r.querySelector('.wb-count').textContent;[s.page,s.total]=s.count.split('/').map(Number);s.left=r.querySelector('.wb-left')?.textContent;s.bodySHA=r.dataset.bodySha256;s.lead=r.querySelectorAll('.wb-track>.wb-slide:not(.wb-end)').length;
  s.declaredColumns=+flow.style.columnCount;s.measuredColumns=Math.max(1,Math.floor((sb.left-fb.left)/W)+1);s.measuredTotal=s.lead+s.measuredColumns+1;
  s.measurement='R3 live post-render sentinel delta / stage.clientWidth; no clone, no style reset. This is live expanded-flow geometry, NOT a re-executed one-column layout().';
  s.geometry={stage:rect(stage),flow:rect(flow),sentinel:rect(sentinel),track:rect(track),flowClientWidth:flow.clientWidth,flowScrollWidth:flow.scrollWidth,flowScrollLeft:flow.scrollLeft,flowScrollTop:flow.scrollTop,flowStyle:flow.getAttribute('style'),stageWidth:W,stageHeight:stage.clientHeight};
  s.flowFont=Object.fromEntries(['fontFamily','fontSize','lineHeight','fontWeight','fontStyle','letterSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','columnWidth','columnGap','columnCount'].map(k=>[k,cs[k]]));
  s.stylesheets=[...document.styleSheets].map(x=>({href:x.href,disabled:x.disabled,media:x.media.mediaText}));s.resources=performance.getEntriesByType('resource').map(x=>({name:x.name,initiatorType:x.initiatorType,startTime:x.startTime,responseEnd:x.responseEnd,transferSize:x.transferSize}));
  const crop={left:b.left,right:b.right,top:Math.max(b.top,fb.top+parseFloat(cs.paddingTop)),bottom:Math.min(b.bottom,fb.top+stage.clientHeight-parseFloat(cs.paddingBottom))};s.semanticClip=crop;
  s.occlusions=[...r.querySelectorAll('.wb-hlpop,.wb-glosspop,.wb-top,.wb-foot,.wb-bar')].filter(x=>!x.hidden&&getComputedStyle(x).display!=='none').map(x=>x.getBoundingClientRect().toJSON()).filter(x=>x.width>0&&x.height>0);
  // Body prefix of exact highlightNodes indexing; appended epigraph/cover index
  // is also exported separately, but cannot affect these body offsets.
  const nodes=[],walker=document.createTreeWalker(flow,NodeFilter.SHOW_TEXT);let n,off=0,text='',visible=[];
  while((n=walker.nextNode())){nodes.push({node:n,offset:off});text+=n.nodeValue;const rg=document.createRange();for(let i=0;i<n.length;i++){if(/\s/.test(n.nodeValue[i]))continue;rg.setStart(n,i);rg.setEnd(n,i+1);const box=[...rg.getClientRects()].find(x=>x.width>0&&x.height>0&&x.right>crop.left+.5&&x.left<crop.right-.5&&x.bottom>crop.top+.5&&x.top<crop.bottom-.5&&!s.occlusions.some(o=>x.right>o.left&&x.left<o.right&&x.bottom>o.top&&x.top<o.bottom));if(box)visible.push({offset:off+i,c:n.nodeValue[i],x:box.left,y:box.top,w:box.width,h:box.height})}off+=n.length}
  s.bodyText=text;s.bodyLength=text.length;s.highlightIndexText=[flow,r.querySelector('.wb-epigraph blockquote'),r.querySelector('.wb-opener-copy h1'),r.querySelector('.wb-opener-copy p')].filter(Boolean).map(x=>x.textContent).join('');
  visible.sort((a,b)=>a.y-b.y||a.x-b.x||a.offset-b.offset);s.visibleOffsets=visible.map(x=>x.offset).sort((a,b)=>a-b);s.firstVisible=visible[0]||null;s.lastVisible=visible.at(-1)||null;s.visibleText=visible.map(x=>x.c).join('');
  const vis=new Set(s.visibleOffsets),words=[...text.matchAll(/[\p{L}\p{N}’'-]+/gu)],first=words.find(w=>vis.has(w.index));s.firstStartingVisibleWord=first?{offset:first.index,text:first[0]}:null;
  s.firstText=s.firstVisible?text.slice(s.firstVisible.offset,s.firstVisible.offset+180):null;s.lastText=s.lastVisible?text.slice(Math.max(0,s.lastVisible.offset-180),s.lastVisible.offset+1):null;
  s.marks=[...flow.querySelectorAll('mark')].map(x=>({text:x.textContent,attrs:[...x.attributes].map(a=>[a.name,a.value])}));s.selectionText=[...flow.querySelectorAll('mark.sel')].map(x=>x.textContent).join('');
  const cap=flow.querySelector('h2+p');s.dropcap=cap?{attrs:[...cap.attributes].map(a=>[a.name,a.value]),firstLetter:Object.fromEntries(['fontFamily','fontSize','lineHeight','fontWeight','float','color'].map(k=>[k,getComputedStyle(cap,'::first-letter')[k]]))}:null;
  s.domStructure=[...flow.querySelectorAll('*')].map(x=>({tag:x.tagName,attrs:[...x.attributes].map(a=>[a.name,a.value]),textLength:x.textContent.length}));
  for(let el=flow;el;el=el.parentElement)s.scrolls.push({tag:el.tagName,class:el.className,x:el.scrollLeft,y:el.scrollTop,width:el.clientWidth,height:el.clientHeight});
  return s;
 });
 if(child.domSHAInput){child.domSHA=hash(child.domSHAInput);delete child.domSHAInput;}
 if(probe){child.layoutTrace=await probe.read(f);}
 if(child.bodyText){child.bodyTextSHA=hash(child.bodyText);delete child.bodyText;child.highlightIndexSHA=hash(child.highlightIndexText);delete child.highlightIndexText;}
 const row={label,host,child};fs.writeFileSync(path.join(OUT,label+'.json'),JSON.stringify(row,null,2));report.checkpoints.push({label,file:label+'.json',count:child.count,measuredTotal:child.measuredTotal,firstOffset:child.firstVisible?.offset});save();
 await p.screenshot({path:path.join(OUT,label+'.png')});if(probe){assert.equal(child.layoutTrace.errors.length,0,'trace expressions');if(child.reader){assert(child.layoutTrace.events.some(x=>x.phase==='measurement'),'A measurement record');assert(child.layoutTrace.events.some(x=>x.phase==='after-expansion'),'B expansion record');}}return row;
}
async function kill(label){
 const {ctx,profile}=owned,cdp=await ctx.browser().newBrowserCDPSession(),info=await cdp.send('SystemInfo.getProcessInfo'),pid=Number(info.processInfo.find(x=>x.type==='browser')?.id);
 assert(Number.isInteger(pid)&&pid>1);assert(fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').includes(profile));const pgid=Number(fs.readFileSync(`/proc/${pid}/stat`,'utf8').split(') ')[1].split(' ')[2]);assert.equal(pid,pgid);
 report.deaths.push({label,kind:'SIGKILL verified owned Chromium process group',pid,pgid,profile});save();
 const died=new Promise(r=>ctx.browser().once('disconnected',r));process.kill(-pgid,'SIGKILL');await Promise.race([died,new Promise((_,rej)=>setTimeout(()=>rej(Error('process death timeout')),6000))]);
 const liveGroup=()=>fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x)).filter(x=>{try{const stat=fs.readFileSync(`/proc/${x}/stat`,'utf8').split(') ')[1].split(' ');return Number(stat[2])===pgid&&stat[0]!=='Z'}catch{return false}});
 for(let n=0;n<40&&liveGroup().length;n++)await new Promise(r=>setTimeout(r,50));
 const remains=liveGroup();report.deaths.at(-1).remainingLiveGroup=remains;save();assert.equal(remains.length,0,'all owned browser-group members dead before profile snapshot');owned=null;probe=null;return profile;
}
async function inspectScopedCache(context){
 return context.evaluate(async()=>{
  const rows=[],cacheNames=await caches.keys();
  for(const key of cacheNames){const c=await caches.open(key);for(const req of await c.keys()){
   const res=await c.match(req);if(!res)throw Error('Cache entry disappeared: '+req.url);
   const b=await res.arrayBuffer(),d=await crypto.subtle.digest('SHA-256',b);
   rows.push({cache:key,url:req.url,bytes:b.byteLength,sha256:[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')});
  }}
  return {url:location.href,origin:location.origin,cacheNames,rows,offlineStatus:window.WisdomOffline?await window.WisdomOffline.status():null,sessionReady:await window.WizOfflineSession?.ready,observer:window.__r20?.readout?.(),workers:(await navigator.serviceWorker.getRegistrations()).map(x=>({scope:x.scope,active:x.active?.scriptURL,state:x.active?.state})),controller:navigator.serviceWorker.controller?.scriptURL};
 });
}
async function cacheInventory(){
 // Read each normal window.caches surface; never borrow a raw origin-wide handle.
 // offline-kit.js:112-121 creates assets-v1 in Wisdom's own execution context.
 // No cache-filtering facade is established by the pinned app-services.js source.
 const read=async(frame,context)=>{try{return {context,...await inspectScopedCache(frame)}}catch(e){return {context,error:e.message,rows:[],workers:[],cacheNames:[]}}};
 const [host,child]=await Promise.all([read(owned.p,'host-app-session'),read(owned.f,'wisdom-owned-frame')]);
 return {contexts:{host,child},rows:[...host.rows.map(x=>({...x,context:host.context})),...child.rows.map(x=>({...x,context:child.context}))],workers:[...host.workers.map(x=>({...x,context:host.context})),...child.workers.map(x=>({...x,context:child.context}))]};
}
function validateCacheInventory(inv){
 const {host,child}=inv.contexts;
 assert.equal(host.context,'host-app-session');assert.equal(child.context,'wisdom-owned-frame');
 assert(!host.error&&!child.error,'both context inventory reads succeeded');
 assert.equal(Object.keys(M.fonts).length,4,'all four release fonts required');
 assert(child.cacheNames.includes('wisdom-assets-v1'),'Wisdom owns assets cache');
 for(const [file,sha256]of Object.entries(M.fonts))assert(child.rows.some(x=>x.cache==='wisdom-assets-v1'&&new URL(x.url).pathname==='/wisdom/wisdom-art/f/'+file&&x.sha256===sha256&&x.bytes>0),'cached exact release font '+file);
 assert(child.rows.some(x=>x.cache==='wisdom-assets-v1'&&new URL(x.url).pathname==='/wisdom/wisdom-art/c/flight-chapter.jpg'&&x.bytes>0),'cached synthetic chapter art in Wisdom own context');
 for(const file of M.host_cache_shell)assert(host.rows.some(x=>new URL(x.url).pathname==='/wizard-os-home/'+file),'host own shell closure '+file);
 assert(child.workers.some(x=>x.scope.endsWith('/wisdom/')&&x.state==='activated'),'Wisdom activated worker visible in child');
 assert(host.workers.some(x=>x.scope.endsWith('/wizard-os-home/')&&x.state==='activated'),'host activated worker visible in host');
}
async function waitForCacheClosure(){
 // Read BOTH real context inventories on EVERY attempt. Status is not closure.
 const start=Date.now(),attempts=[];
 for(let attempt=1;attempt<=60;attempt++){
  const inv=await cacheInventory();let pending=null;
  try{
   validateCacheInventory(inv);
   assert(inv.contexts.child.offlineStatus?.ready&&!inv.contexts.child.offlineStatus?.warming&&!inv.contexts.child.offlineStatus?.error,'Wisdom status ready');
   assert(inv.contexts.host.sessionReady===true,'host session ready');
   assert(inv.contexts.host.controller&&inv.contexts.child.controller,'both context worker controllers');
  }catch(e){pending=e.message}
  const row={attempt,elapsedMs:Date.now()-start,pending,inventory:inv};
  attempts.push(row);report.cacheAttempts=attempts;report.cache=inv;save();
  fs.writeFileSync(path.join(OUT,'cache-attempt-'+String(attempt).padStart(3,'0')+'.json'),JSON.stringify(row,null,2));
  if(!pending){fs.writeFileSync(path.join(OUT,'cache-warm.json'),JSON.stringify(inv,null,2));return inv;}
  if(Date.now()-start>=60000||attempt===60)throw Error('actual cached asset closure timeout: '+pending);
  await owned.p.waitForTimeout(1000);
 }
}
async function warm(){
 await waitForCacheClosure();
 await checkpoint('online-warm');
}
async function turn(label){
 const f=owned.f,before=await f.locator('.wb-count').textContent(),stage=f.locator('.wb-stage');
 const observed=await f.evaluate(()=>({id:window.__r20.readout().id,n:window.__r20.inputs.length}));
 const hit=await stage.evaluate(el=>{const b=el.getBoundingClientRect();for(const fy of [.5,.35,.2,.65]){const x=b.width*.85,y=b.height*fy,t=document.elementFromPoint(b.x+x,b.y+y);if(t&&el.contains(t)&&!t.closest('button,a,input,textarea,select,[role="button"],mark'))return {x,y}}throw Error('No non-control edge target')});
 await stage.tap({position:hit});await f.waitForFunction(x=>document.querySelector('.wb-count')?.textContent!==x,before);await f.waitForTimeout(420);
 const s=await checkpoint(label);assert.equal(s.child.page,+before.split('/')[0]+1,'one trusted touch turns one page');assert.equal(s.child.observer.id,observed.id);assert(s.child.observer.qIdentity&&s.child.observer.sameDocument);assert(s.child.inputs.slice(observed.n).some(x=>x.type==='pointerdown'&&x.isTrusted&&x.pointerType==='touch'),'new real trusted touch delivered to owned observer');assert(s.child.events.some(x=>x.event==='mutation')&&s.child.events.some(x=>x.event==='resize-observed'),'real observer callbacks delivered');return s;
}
async function tapObserved(label,locator,href){
 await locator.waitFor({state:'visible'});assert.equal(await locator.count(),1,'unique native UI target '+label);
 const outerHTML=await locator.evaluate(el=>el.outerHTML),boundingBox=await locator.boundingBox(),actualHref=await locator.getAttribute('href');
 report.uiTargets??=[];report.uiTargets.push({label,outerHTML,boundingBox,href:actualHref});save();
 assert(boundingBox&&boundingBox.width>0&&boundingBox.height>0,'visible native target '+label);if(href)assert.equal(actualHref,href);
 await locator.tap();
}
async function openChapter(label){
 const link=owned.f.locator('.wb-collection .wb-toc').getByRole('link',{name:/A quiet beginning/});
 await tapObserved(label,link,'#/read/flight-chapter/flight-collection');
}
async function failureDOM(label='failure'){
 // Export both actual documents before expensive ranges/IDB/screenshots can fail.
 const rows={};for(const [name,frame]of [['host',owned.p],['wisdom-frame',owned.f]]){
  try{const html=await frame.content();fs.writeFileSync(path.join(OUT,label+'-'+name+'.html'),html);rows[name]={bytes:Buffer.byteLength(html),sha256:hash(html),url:frame.url()};}catch(e){rows[name]={error:e.message};}
 }report.failureDOM=rows;save();
}
async function stable(label){
 // Exactly three checkpoints: no blind retries or correction of page/fraction.
 const rows=[];for(let i=0;i<3;i++){await owned.f.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));rows.push(await checkpoint(label+'-0'+i));}
 const c=rows.map(x=>x.child),keys=c.map(s=>JSON.stringify([s.dataSize,s.count,s.measuredTotal,s.localRaw,s.visibleOffsets,s.projected.entry.progress,s.outbox]));assert(keys.every(x=>x===keys[0]),'three stable actual rendered/durable states required');
 assert(c[0].firstVisible,'semantic body visible');assert(c[0].presentationFacade,'actual host presentation facade installed');assert(c[0].localRaw!==null,'real saved fraction');
 if(process.env.QA_VARIANT==='candidate')for(const row of rows){const j=row.host.presentationJournal;assert(j&&Number.isSafeInteger(j.revision),'actual committed journal exists');assert.equal(j.route.href,row.child.url,'committed exact current reader route');assert.equal(String(j.positions['wisdom:/wisdom/:pos:flight-chapter']),row.child.localRaw,'committed exact fraction, no progress rounding');}
 const latest=c[0].outbox.filter(x=>x.body?.field==='progress'&&x.body.id==='flight-chapter').at(-1);assert(latest,'durable real progress operation');assert.equal(latest.body.value,c[0].projected.entry.progress);return rows[0];
}

(async()=>{try{
 assert(['baseline','traced'].includes(CASE));
 const profile=path.join(OUT,'profile-'+CASE);await launch(profile,false);await warm();await kill('warm-to-offline');await launch(profile,true);await checkpoint('offline-home');
 await tapObserved('browse-all',owned.f.getByRole('link',{name:/Browse all/}),'#/browse');
 await tapObserved('browse-collection',owned.f.locator('.wb-browse a.wb-cover[href="#/collection/flight-collection"]'),'#/collection/flight-collection');
 await openChapter('chapter-first-open');await reader();await checkpoint('chapter-cover');await turn('first-text');
 await layout.sizeSequence({frame:owned.f,checkpoint:async label=>{const row=await stable(label);report.states??=[];report.states.push({label,size:row.child.dataSize,count:row.child.count,total:row.child.total});save();}});
 await kill('size1-stable-to-offline-cold');await launch(profile,true);await reader();const cold=await stable('offline-cold');report.states.push({label:'offline-cold',size:cold.child.dataSize,count:cold.child.count,total:cold.child.total});save();
 assert.equal(cold.child.dataSize,'1');assert.equal(report.egress.length,0);assert.equal(report.pageErrors.length,0,'strict source runtime errors');report.status='diagnostic-complete';
}catch(e){report.status='incomplete';report.error={message:e.message,stack:e.stack};if(owned?.p&&!owned.p.isClosed())try{await failureDOM();await checkpoint('failure')}catch(s){report.failureSnapshotError=s.message;}}
finally{if(owned)try{await kill('final-owned-cleanup')}catch(e){report.cleanupError=e.message;report.status='incomplete';}save();console.log(JSON.stringify({case:CASE,status:report.status,error:report.error?.message}));process.exitCode=report.status==='incomplete'?1:0;}})();
