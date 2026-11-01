'use strict';
// QA-only assertions/observer, shared by real browser and browser-free regressions.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
exports.assertReplicaRetained=(before,after)=>{assert(before.outbox.length>0,'nonempty offline prior operation required');assert(before.meta.state&&after.meta.state,'existing canonical snapshots required');assert.equal(JSON.stringify(after.outbox),JSON.stringify(before.outbox),'failure retains byte-exact previous outbox');assert.deepEqual(after.meta.state,before.meta.state,'failure retains canonical snapshot')};
exports.assertFallback=x=>{
 assert(!x.connected&&!x.hosted&&x.theme==='dark','standalone must use unhosted dark fallback');
 assert.equal(x.root.background,'rgb(13, 12, 11)');assert.equal(x.body.background,x.root.background);
 assert.equal(x.reader.background,'rgb(13, 12, 11)');assert.equal(x.flow.color,'rgb(236, 230, 220)');
 const luminance=s=>{const a=s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722};
 for(const [fg,bg] of [[x.body.color,x.body.background],[x.flow.color,x.reader.background]])assert((luminance(fg)+.05)/(luminance(bg)+.05)>=4.5,'actual fallback text contrast >=4.5');
 assert(x.fonts.some(f=>f.status==='loaded'&&f.family.includes('WB Text')),'real reader font loaded');
 assert(x.art.length&&x.art.every(im=>im.complete&&im.width>0),'standalone real art decoded');
};
exports.observeAssets=({context,origin,members,served,records,failures,contextId='mock',generationId='mock',readProof,readWrites,independentCompletion,checkpoint=()=>{},closureMs=10000})=>{
 const evidence=require('./byte-evidence.cjs'),tasks=new Set(),pending=[],inflight=new Set(),admitted=new Set(),workerClosures=[];let accepting=true,sealed=false,drainPromise;
 // Cancellation terminates observer continuations, NOT the browser's requests.
 // Every captured inspect settles before owned.close(); late protocol rejections
 // remain handled and cannot mutate a report belonging to the next context.
 let cancel;const cancellation=new Promise((_,reject)=>cancel=()=>reject(Error('observer closure deadline')));cancellation.catch(()=>{});
 const guard=p=>Promise.race([p,cancellation]);
 const workers=new Map(),watchWorker=w=>{if(workers.has(w))return;const id=contextId+':worker-'+(workers.size+1),closed=()=>workerClosures.push({id,url:w.url(),closedAt:Date.now()});workers.set(w,{id,closed});w.on('close',closed)};
 for(const w of context.serviceWorkers?.()||[])watchWorker(w);context.on('serviceworker',watchWorker);
 const bounded=async(p,ms,label)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label)),ms))])}finally{clearTimeout(timer)}};
 const started=q=>{try{const u=new URL(q.url());if(accepting&&u.origin===origin&&members[evidence.rel(u.href)]){admitted.add(q);inflight.add(q)}}catch{}};
 const finished=q=>inflight.delete(q);context.on('request',started);context.on('requestfinished',finished);context.on('requestfailed',finished);
 async function inspect(r){
  const u=new URL(r.url());if(u.origin!==origin)return;
  const rel=u.pathname.startsWith('/wizard-os-home/')?'ux/web/'+u.pathname.slice(16):u.pathname.startsWith('/wisdom/')?'wisdom/static/'+u.pathname.slice(8):null;
  if(!rel||!members[rel])return;
  const request=r.request(),row={contextId,generationId,path:rel,url:u.href,method:request.method(),status:r.status(),fromServiceWorker:r.fromServiceWorker(),worker:request.serviceWorker?.()?.url()||null,resourceType:request.resourceType(),observedAt:Date.now(),timing:request.timing()};records.push(row);
  const worker=request.serviceWorker?.();if(worker?.on){watchWorker(worker);row.workerInstanceId=workers.get(worker).id}
  const documentUrl=()=>{try{return request.frame?.()?.url()||null}catch{return null}};row.documentAtResponse=documentUrl();row.navigationRequest=request.isNavigationRequest?.()||false;
  try{
   row.stage='headers';row.requestHeaders=await guard(request.allHeaders());row.responseHeaders=await guard(r.allHeaders());
   row.stage='finished';let finished;
   const pwFinished=guard(r.finished());
   if(independentCompletion&&row.worker&&row.method==='GET'&&row.status===200){
    const outcome=await guard(Promise.race([pwFinished.then(value=>({value})),new Promise(resolve=>setTimeout(()=>resolve({unobservable:true}),100))]));
    if(outcome.unobservable){
     row.playwrightFinished='UNOBSERVABLE-pending';row.stage='independent-cdp-completion';
     row.independentCompletion=await guard(independentCompletion(row,members[rel]));
     row.completedAt=row.independentCompletion.loadingFinished.at;row.completionSource='raw-cdp-loadingFinished+decoded-body-sha256';row.networkBody='UNOBSERVABLE-PW-finished-and-body';row.timing=request.timing();inflight.delete(request);pending.push(row);return;
    }finished=outcome.value;
   }else finished=await pwFinished;
   row.timing=request.timing();assert(!finished,'asset request did not complete: '+String(finished));row.completedAt=Date.now();
   if(row.method==='HEAD'){
    assert.equal(row.status,200,'HEAD success');assert.equal(Number(row.responseHeaders['content-length']),members[rel].bytes,'HEAD expected file length');assert(row.responseHeaders['content-type'],'HEAD MIME header');row.provenance='headers-only-no-body-by-HTTP-contract';return;
   }
   if(row.method!=='GET'){row.provenance='non-GET-no-hash-coverage';return}
   if(row.status===304){assert(row.responseHeaders.etag||row.responseHeaders['last-modified'],'304 validator');row.provenance='not-modified-no-full-body-coverage';return}
   if(row.status===206||row.requestHeaders.range){row.provenance='range-no-full-body-coverage';return}
   assert.equal(row.status,200,'full GET success');row.stage='body';const b=await guard(r.body());row.bodyBytes=b.length;
   if(b.length===0&&members[rel].bytes>0&&(row.worker||row.fromServiceWorker)&&readProof){assert.equal(Number(row.responseHeaders['content-length']),members[rel].bytes,'unobservable GET exact Content-Length');assert(row.responseHeaders['content-type'],'unobservable GET MIME required');row.networkBody='UNOBSERVABLE-empty-PW-body';pending.push(row);return}
   assert(b.length>0||members[rel].bytes===0,'empty completed GET for nonempty source '+rel);
   const h=createHash('sha256').update(b).digest('hex');row.sha256=h;assert.equal(h,members[rel].sha256,'served exact-source asset '+rel);served[rel]=h;row.provenance='completed-full-GET-sha256';row.stage='complete';
  }catch(e){row.timing=request.timing();row.requestFailure=request.failure?.()||null;row.documentAtFailure=documentUrl();row.abortClassification=row.requestFailure?.errorText==='net::ERR_ABORTED'?'observed-request-abort-NOT-byte-coverage':null;row.workerClosures=workerClosures.filter(w=>w.id===row.workerInstanceId);row.failure=e.message;row.unfinished=!row.completedAt;row.provenance=null;failures.push({contextId,generationId,path:rel,url:row.url,method:row.method,status:row.status,stage:row.stage,unfinished:row.unfinished,requestFailure:row.requestFailure,workerInstanceId:row.workerInstanceId,workerClosures:row.workerClosures,message:e.message})}
 }
 const inspected=new Set();
 const listener=r=>{const request=r.request();if(sealed||(!accepting&&!admitted.has(request))||inspected.has(request))return;inspected.add(request);const task=inspect(r).catch(e=>failures.push({contextId,generationId,message:e.message}));tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task))};context.on('response',listener);
 async function drain(){
  // Freeze admission synchronously; keep responses only for requests captured
  // before this boundary, including responses that arrive on the next turn.
  accepting=false;context.off('request',started);
  checkpoint('drain-start',{tasks:tasks.size,inflight:inflight.size,admission:'sealed-new-requests'});const deadline=Date.now()+closureMs;
  try{while(tasks.size||inflight.size){const remaining=deadline-Date.now();if(remaining<=0)break;await Promise.race([tasks.size?Promise.allSettled([...tasks]):new Promise(()=>{}),new Promise(r=>setTimeout(r,Math.min(25,remaining)))])}}
  finally{sealed=true;context.off('response',listener);context.off('requestfinished',finished);context.off('requestfailed',finished);context.off('serviceworker',watchWorker);for(const [w,{closed}] of workers)w.off('close',closed);cancel();await Promise.allSettled([...tasks]);for(const q of inflight)if(!inspected.has(q))failures.push({contextId,generationId,url:q.url(),message:'owned request has no response by observer closure deadline',requestFailure:q.failure?.()||null});checkpoint('drain-stopped',{unfinished:records.filter(x=>x.contextId===contextId&&!x.provenance&&!x.networkBody),inflight:inflight.size,workerClosures})}
  let proof,writes=[],proofReads=0;const getProof=()=>{assert(proofReads<3,'independent cache read budget');proofReads++;return readProof()};try{if(readProof){const end=Date.now()+closureMs;for(let attempt=0;;attempt++){try{proof=await bounded(getProof(),Math.max(1,end-Date.now()),'independent cache snapshot deadline');break}catch(e){if(attempt>=2||!/missing generation cache closure|worker generation changing/.test(e.message)||Date.now()>=end)throw e;await new Promise(r=>setTimeout(r,25))}}}}catch(e){failures.push({contextId,generationId,message:'independent cache closure: '+e.message})}
  if(readWrites&&pending.some(row=>proof?.networkOnly?.some(x=>x.url===row.url)))try{writes=await bounded(readWrites(),closureMs,'actual server-write receipt deadline')}catch(e){failures.push({contextId,generationId,message:e.message})}
  // Fresh snapshots only for missing cache-required URLs. No fetch, put, seed or waiver.
  const missing=()=>pending.filter(row=>!proof?.networkOnly?.some(x=>x.url===row.url)&&!proof?.coverage[row.url]);
  if(proof&&missing().length){const end=Date.now()+1000;while(proofReads<3&&missing().length&&Date.now()<end){await new Promise(r=>setTimeout(r,25));try{proof=await bounded(getProof(),Math.max(1,end-Date.now()),'late cache closure deadline')}catch(e){failures.push({contextId,generationId,message:e.message});break}}}
  for(const row of pending){try{assert(proof,'no independently verified byte proof');if(proof.networkOnly?.some(x=>x.url===row.url)){row.independentByteEvidence=evidence.resolveNetworkOnly(row,proof,members[row.path],writes);row.provenance='network-UNOBSERVABLE-actual-server-write'}else{row.independentByteEvidence=evidence.resolve(row,proof,members[row.path]);row.provenance='network-UNOBSERVABLE-cache-exact-source'}served[row.path]=members[row.path].sha256}catch(e){row.failure=e.message;failures.push({contextId,generationId,path:row.path,message:e.message})}}checkpoint('drain-complete',{pending:pending.length,failures:failures.length});
 }
 return {drain(){return drainPromise??=drain()}};
};
