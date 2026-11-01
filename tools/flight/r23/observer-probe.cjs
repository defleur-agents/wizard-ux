'use strict';
// Real browser/worker/cache protocol gate. Parent-admitted runner ONLY.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_DIR),C=require('./contracts.cjs'),B=require('./byte-evidence.cjs'),M=JSON.parse(fs.readFileSync(process.env.QA_SOURCE_MANIFEST));
const origin=new URL(process.env.QA_URL).origin,OUT=process.env.QA_OUT,member={bytes:19,sha256:createHash('sha256').update('actual source bytes').digest('hex')},reports=[];
(async()=>{for(const mode of ['good','empty','wrong','stale','plain-empty']){
 const context=await chromium.launchPersistentContext(path.join(OUT,'probe-profile-'+mode),{executablePath:process.env.QA_CHROME,headless:true,serviceWorkers:'allow',args:['--disable-background-networking','--ignore-certificate-errors-spki-list='+M.fixture_tls.leaf_spki_sha256]});
 let observer;const row={mode,records:[],failures:[],served:{},expected:mode==='good'?'accept':'reject'};reports.push(row);
 try{
 const p=await context.newPage();p.setDefaultTimeout(10000);await p.goto(origin+'/__fixture__/blank');const initial=await p.evaluate(B.snapshot);assert.deepEqual(initial.names,[]);assert.deepEqual(initial.registrations,[]);assert.equal(initial.controller,null);
 const generation={id:randomUUID(),origin,initialEmpty:true,initial},contextId='probe-'+mode,url=origin+'/wisdom/__observer__.js?'+mode;
 const policy={prefixes:['observer-shell-'],allowed:['observer-shell-current'],workers:mode==='plain-empty'?[]:[{scope:'/__observer__/',script:'/__observer__/sw.js?'+mode}],required:mode==='plain-empty'?[]:[{url,cache:'observer-shell-current'}]};
 observer=C.observeAssets({context,origin,members:{'wisdom/static/__observer__.js':member},served:row.served,records:row.records,failures:row.failures,contextId,generationId:generation.id,readProof:async()=>{row.snapshot=await p.evaluate(B.snapshot);row.snapshot.contextId=contextId;row.snapshot.generationId=generation.id;return B.validate({snapshot:row.snapshot,generation,contextId,origin,members:{'wisdom/static/__observer__.js':member},policy})}});
 await p.goto(origin+'/__observer__/');
 if(mode==='plain-empty')await p.evaluate(async url=>{await (await fetch(url)).arrayBuffer()},url);
 else {await p.evaluate(async mode=>{await navigator.serviceWorker.register('/__observer__/sw.js?'+mode,{scope:'/__observer__/'});await navigator.serviceWorker.ready},mode);await p.waitForFunction(()=>navigator.serviceWorker.controller)}
 await observer.drain();observer=null;
 assert(row.records.some(r=>r.url===url&&r.method==='GET'),'real GET observed');
 if(mode==='good'){assert.equal(row.failures.length,0,JSON.stringify(row.failures));assert.equal(row.snapshot.entries[0].sha256,member.sha256);assert.equal(row.snapshot.entries[0].bytes,member.bytes)}else {assert(row.failures.length>0,'real bad protocol must reject');if(mode==='empty'){assert(row.snapshot.entries.some(e=>e.bytes===0&&Number(e.responseHeaders['content-length'])===member.bytes),'actual empty CacheStorage arrayBuffer despite nonzero header');assert(row.failures.some(f=>f.message.includes('empty cached body')))}}
 row.status='pass';
 }catch(e){row.status='failed';row.error=e.stack;throw e}finally{try{if(observer)await observer.drain()}finally{await context.close();fs.writeFileSync(path.join(OUT,'observer-probe.json'),JSON.stringify({status:reports.length===5&&reports.every(r=>r.status==='pass')?'pass':'failed',reports},null,2))}}
}})().catch(e=>{console.error(e);process.exitCode=1});
