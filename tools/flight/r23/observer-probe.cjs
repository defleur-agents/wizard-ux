'use strict';
// Real browser/worker/cache protocol gate. Parent-admitted runner ONLY.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_DIR),C=require('./contracts.cjs'),B=require('./byte-evidence.cjs'),M=JSON.parse(fs.readFileSync(process.env.QA_SOURCE_MANIFEST));
const origin=new URL(process.env.QA_URL).origin,OUT=process.env.QA_OUT,member={bytes:19,sha256:createHash('sha256').update('actual source bytes').digest('hex')},reports=[];
const save=()=>fs.writeFileSync(path.join(OUT,'observer-probe.json'),JSON.stringify({status:reports.length===5&&reports.every(r=>r.status==='pass')?'pass':'failed',reports},null,2));
(async()=>{for(const mode of ['good','empty','wrong','stale','plain-empty']){
 const row={mode,records:[],failures:[],served:{},expected:mode==='good'?'accept':mode==='plain-empty'?'network-reject':'cache-reject'};reports.push(row);save();
 const context=await chromium.launchPersistentContext(path.join(OUT,'probe-profile-'+mode),{executablePath:process.env.QA_CHROME,headless:true,serviceWorkers:'allow',args:['--disable-background-networking','--ignore-certificate-errors-spki-list='+M.fixture_tls.leaf_spki_sha256]});
 let observer;
 try{
 const p=await context.newPage();p.setDefaultTimeout(10000);await p.goto(origin+'/__fixture__/blank');const initial=await p.evaluate(B.snapshot);assert.deepEqual(initial.names,[]);assert.deepEqual(initial.registrations,[]);assert.equal(initial.controller,null);
 const generation={id:randomUUID(),origin,initialEmpty:true,initial},contextId='probe-'+mode,url=origin+'/wisdom/__observer__.js?'+mode;
 const policy={prefixes:['observer-shell-'],allowed:['observer-shell-current'],workers:mode==='plain-empty'?[]:[{scope:'/__observer__/',script:'/__observer__/sw.js?'+mode}],required:[{url,cache:'observer-shell-current'}]};
 const readProof=async()=>{row.snapshot=await p.evaluate(B.snapshot);row.snapshot.contextId=contextId;row.snapshot.generationId=generation.id;try{const proof=B.validate({snapshot:row.snapshot,generation,contextId,origin,members:{'wisdom/static/__observer__.js':member},policy});row.cacheValidation={status:'accept'};return proof}catch(e){row.cacheValidation={status:'reject',message:e.message};throw e}finally{save()}};
 // Isolated probe-only seeding: a correct cache cannot mask a plain-page empty GET.
 if(mode==='plain-empty')await p.evaluate(async url=>{const r=await fetch('/wisdom/__observer__.js?good');await (await caches.open('observer-shell-current')).put(url,r)},url);
 observer=C.observeAssets({context,origin,members:{'wisdom/static/__observer__.js':member},served:row.served,records:row.records,failures:row.failures,contextId,generationId:generation.id,readProof});
 row.step='fixture-navigation';save();await p.goto(origin+'/__observer__/');
 if(mode==='plain-empty')await p.evaluate(async url=>{await (await fetch(url)).arrayBuffer()},url);
 else {row.step='worker-install';save();await p.evaluate(async mode=>{await navigator.serviceWorker.register('/__observer__/sw.js?'+mode,{scope:'/__observer__/'});await navigator.serviceWorker.ready},mode);await p.waitForFunction(()=>navigator.serviceWorker.controller)}
 row.step='observer-drain';save();await observer.drain();observer=null;
 const network=row.records.filter(r=>r.url===url&&r.method==='GET');assert.equal(network.length,1,'one real fixture GET');const n=network[0];
 row.networkMeasurement={bodyBytes:n.bodyBytes,sha256:n.sha256,contentLength:n.responseHeaders['content-length'],failure:n.failure||null};
 if(mode==='plain-empty'){
  assert.equal(n.bodyBytes,0);assert.equal(n.responseHeaders['content-length'],'0');assert(!n.worker&&!n.fromServiceWorker);assert.match(n.failure,/empty completed GET/);assert.equal(row.cacheValidation.status,'accept');assert.equal(row.snapshot.entries[0].bytes,member.bytes);assert.deepEqual(row.served,{});
 }else{
  assert.equal(n.bodyBytes,member.bytes,'fully consumed real network bytes');assert.equal(n.sha256,member.sha256);assert.equal(Number(n.responseHeaders['content-length']),member.bytes);assert(!n.failure,'good network must not be labelled incorrect');
  const e=row.snapshot.entries.find(e=>e.url===url);assert(e,'actual CacheStorage entry');
  if(mode==='good'){assert.equal(row.failures.length,0,JSON.stringify(row.failures));assert.equal(row.cacheValidation.status,'accept');assert.equal(e.sha256,member.sha256);assert.equal(e.bytes,member.bytes)}
  else {assert.equal(row.cacheValidation.status,'reject');assert(row.failures.some(f=>f.message.startsWith('independent cache closure:')));
   if(mode==='empty'){assert.equal(e.bytes,0);assert.equal(Number(e.responseHeaders['content-length']),member.bytes);assert.match(row.cacheValidation.message,/empty cached body/)}
   if(mode==='wrong'){assert.equal(e.bytes,member.bytes);assert.notEqual(e.sha256,member.sha256);assert.match(row.cacheValidation.message,/cached exact-source hash/)}
   if(mode==='stale'){assert.equal(e.bytes,member.bytes);assert.equal(e.sha256,member.sha256);assert.equal(e.cache,'observer-shell-old');assert.match(row.cacheValidation.message,/unexpected\/old owned cache/)}
  }
 }
 row.status='pass';row.step='complete';
 }catch(e){row.status='failed';row.error=e.stack;save();throw e}finally{try{if(observer)await observer.drain()}finally{await context.close();save()}}
}})().catch(e=>{console.error(e);process.exitCode=1});
