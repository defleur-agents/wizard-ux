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
exports.observeAssets=({context,origin,members,served,records,failures,contextId='mock',generationId='mock',readProof})=>{
 const evidence=require('./byte-evidence.cjs'),tasks=new Set(),pending=[],inflight=new Set();let accepting=true;
 const started=q=>{try{const u=new URL(q.url());if(u.origin===origin&&members[evidence.rel(u.href)])inflight.add(q)}catch{}};
 const finished=q=>inflight.delete(q);context.on('request',started);context.on('requestfinished',finished);context.on('requestfailed',finished);
 async function inspect(r){
  const u=new URL(r.url());if(u.origin!==origin)return;
  const rel=u.pathname.startsWith('/wizard-os-home/')?'ux/web/'+u.pathname.slice(16):u.pathname.startsWith('/wisdom/')?'wisdom/static/'+u.pathname.slice(8):null;
  if(!rel||!members[rel])return;
  const request=r.request(),row={contextId,generationId,path:rel,url:u.href,method:request.method(),status:r.status(),fromServiceWorker:r.fromServiceWorker(),worker:request.serviceWorker?.()?.url()||null,resourceType:request.resourceType(),observedAt:Date.now(),timing:request.timing()};records.push(row);
  try{
   row.requestHeaders=await request.allHeaders();row.responseHeaders=await r.allHeaders();
   const finished=await r.finished();row.completedAt=Date.now();row.timing=request.timing();assert(!finished,'asset request did not complete: '+String(finished));
   if(row.method==='HEAD'){
    assert.equal(row.status,200,'HEAD success');assert.equal(Number(row.responseHeaders['content-length']),members[rel].bytes,'HEAD expected file length');assert(row.responseHeaders['content-type'],'HEAD MIME header');row.provenance='headers-only-no-body-by-HTTP-contract';return;
   }
   if(row.method!=='GET'){row.provenance='non-GET-no-hash-coverage';return}
   if(row.status===304){assert(row.responseHeaders.etag||row.responseHeaders['last-modified'],'304 validator');row.provenance='not-modified-no-full-body-coverage';return}
   if(row.status===206||row.requestHeaders.range){row.provenance='range-no-full-body-coverage';return}
   assert.equal(row.status,200,'full GET success');const b=await r.body();row.bodyBytes=b.length;
   if(b.length===0&&members[rel].bytes>0&&(row.worker||row.fromServiceWorker)&&readProof){row.networkBody='UNOBSERVABLE-empty-PW-body';pending.push(row);return}
   assert(b.length>0||members[rel].bytes===0,'empty completed GET for nonempty source '+rel);
   const h=createHash('sha256').update(b).digest('hex');row.sha256=h;assert.equal(h,members[rel].sha256,'served exact-source asset '+rel);served[rel]=h;row.provenance='completed-full-GET-sha256';
  }catch(e){row.failure=e.message;failures.push({path:rel,method:row.method,status:row.status,message:e.message})}
 }
 const listener=r=>{if(!accepting)return;const task=inspect(r).catch(e=>failures.push({message:e.message}));tasks.add(task);task.finally(()=>tasks.delete(task))};context.on('response',listener);
 return {async drain(){
  const deadline=Date.now()+10000;while((tasks.size||inflight.size)&&Date.now()<deadline){await Promise.all([...tasks]);if(inflight.size)await new Promise(r=>setTimeout(r,25))}
  accepting=false;context.off('response',listener);context.off('request',started);context.off('requestfinished',finished);context.off('requestfailed',finished);while(tasks.size)await Promise.all([...tasks]);assert.equal(inflight.size,0,'owned asset requests did not drain');
  let proof;try{if(readProof)proof=await readProof()}catch(e){failures.push({contextId,generationId,message:'independent cache closure: '+e.message})}
  for(const row of pending){try{assert(proof,'no independently verified byte proof');row.independentByteEvidence=evidence.resolve(row,proof,members[row.path]);row.provenance='network-UNOBSERVABLE-cache-exact-source';served[row.path]=members[row.path].sha256}catch(e){row.failure=e.message;failures.push({contextId,generationId,path:row.path,message:e.message})}}
 }};
};
