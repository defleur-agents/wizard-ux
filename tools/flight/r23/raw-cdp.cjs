'use strict';
// Read-only CDP connection to this invocation's synthetic Chromium only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const headers=h=>Object.fromEntries(Object.entries(h||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
exports.verify=(row,raw,member)=>{
 assert(row.worker&&row.method==='GET'&&row.status===200,'worker full GET only');
 assert.equal(raw.contextId,row.contextId,'CDP context');assert.equal(raw.generationId,row.generationId,'CDP generation');
 assert.equal(raw.worker,row.worker,'CDP worker');assert.equal(raw.url,row.url,'CDP full URL');assert.equal(raw.method,'GET');assert.equal(raw.status,200);
 const id=row.responseHeaders['x-qa-write-id'];assert(id&&!/[\n,]/.test(id),'unique PW response write ID');assert.equal(raw.headers['x-qa-write-id'],id,'CDP exact response write ID');
 assert(raw.started&&raw.finished&&!raw.failed&&!raw.redirected&&!raw.detached,'CDP actual loadingFinished, no failure/redirect/detach');
 assert(!raw.requestHeaders.range,'CDP full body not range');assert(!row.requestHeaders.range,'PW full body not range');
 assert.equal(raw.bodyBytes,member.bytes,'CDP decoded byte length');assert.equal(raw.sha256,member.sha256,'CDP exact source bytes');
 if(!raw.headers['content-encoding'])assert.equal(Number(raw.headers['content-length']),member.bytes,'CDP unencoded Content-Length');
 assert(raw.headers['content-type'],'CDP MIME');
 return {contextId:raw.contextId,generationId:raw.generationId,worker:raw.worker,targetId:raw.targetId,sessionId:raw.sessionId,browserContextId:raw.browserContextId,requestId:raw.requestId,url:raw.url,writeId:id,bytes:raw.bodyBytes,sha256:raw.sha256,loadingFinished:raw.finished,encodedDataLength:raw.encodedDataLength,scope:'independent raw CDP loadingFinished + decoded source bytes; NOT PW response.finished PASS'};
};
exports.connect=async({profile,origin,workers,contextId,generationId,out,timeoutMs=8000})=>{
 const portFile=path.join(profile,'DevToolsActivePort');let lines;
 for(let i=0;i<100;i++){try{lines=fs.readFileSync(portFile,'utf8').trim().split('\n');break}catch{await sleep(20)}}
 assert(lines&&/^\d+$/.test(lines[0])&&lines[1]?.startsWith('/devtools/browser/'),'owned DevToolsActivePort');
 // Prove the listener is loopback-only and belongs to our exact profile PID.
 const listeners=fs.readFileSync('/proc/net/tcp','utf8').trim().split('\n').slice(1).map(l=>l.trim().split(/\s+/)).filter(c=>parseInt(c[1].split(':')[1],16)===Number(lines[0])&&c[3]==='0A');
 assert.equal(listeners.length,1,'one owned IPv4 debugger listener');assert.equal(listeners[0][1].split(':')[0],'0100007F','debugger must bind 127.0.0.1 only');
 const ipv6=fs.readFileSync('/proc/net/tcp6','utf8').trim().split('\n').slice(1).map(l=>l.trim().split(/\s+/));assert(!ipv6.some(c=>parseInt(c[1].split(':')[1],16)===Number(lines[0])&&c[3]==='0A'),'no IPv6 debugger exposure');
 const owners=[];for(const pid of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{const root='/proc/'+pid,args=fs.readFileSync(root+'/cmdline','utf8').split('\0');if(fs.statSync(root).uid!==process.getuid()||!args.includes('--user-data-dir='+profile)||args.some(a=>a.startsWith('--type=')))continue;if(fs.readdirSync(root+'/fd').some(fd=>{try{return fs.readlinkSync(root+'/fd/'+fd)==='socket:['+listeners[0][9]+']'}catch{return false}}))owners.push({pid:Number(pid),profile,start:fs.readFileSync(root+'/stat','utf8').split(') ')[1].split(' ')[19]})}catch{}}
 assert.equal(owners.length,1,'debugger listener must belong to exact owned profile PID');const ownership={...owners[0],address:'127.0.0.1',port:Number(lines[0]),inode:listeners[0][9]};
 const socket=new WebSocket('ws://127.0.0.1:'+lines[0]+lines[1]);await new Promise((r,j)=>{const timer=setTimeout(()=>{socket.close();j(Error('owned CDP connection timeout'))},3000);socket.addEventListener('open',()=>{clearTimeout(timer);r()},{once:true});socket.addEventListener('error',e=>{clearTimeout(timer);j(e)},{once:true})});
 let seq=0,active=true;const commands=new Map(),sessions=new Map(),attaching=new Map(),rows=[],errors=[],workerBindings=new Map(),claimed=new Map();
 const save=()=>fs.writeFileSync(out,JSON.stringify({contextId,generationId,ownership,route:'owned-loopback-raw-WebSocket-discovery-nested-sessions-no-pause',sessions:[...sessions.values()].map(s=>({id:s.id,target:s.target,enabledAt:s.enabledAt,detached:s.detached})),rows,errors},null,2));
 function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{commands.delete(id);reject(Error('CDP command timeout '+method))},3000);commands.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});const message={id,method,params};if(sessionId)send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify(message)}).catch(e=>{commands.get(id)?.reject(e);commands.delete(id)});else socket.send(JSON.stringify(message))})}
 const allowed=new Set(workers.map(w=>new URL(w.script,origin).href));let ownedBrowserContext;
 async function attach(target){if(!active||target.type!=='service_worker'||!allowed.has(target.url)||target.browserContextId!==ownedBrowserContext||attaching.has(target.targetId))return;
  const work=(async()=>{const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:false});if(!active)return;const s={id:sessionId,target,requests:new Map()};sessions.set(sessionId,s);await send('Network.enable',{maxTotalBufferSize:100*1024*1024,maxResourceBufferSize:20*1024*1024},sessionId);if(!active)return;s.enabledAt=Date.now();save()})();attaching.set(target.targetId,work);work.catch(e=>{errors.push({targetId:target.targetId,message:e.message});if(active)save()});return work;
 }
 function event(method,p,sessionId){if(!active)return;
  if(method==='Target.receivedMessageFromTarget'){message(JSON.parse(p.message),p.sessionId);return}
  if(method==='Target.targetCreated'||method==='Target.targetInfoChanged'){attach(p.targetInfo);return}
  if(method==='Target.detachedFromTarget'||method==='Target.targetDestroyed'){for(const s of sessions.values())if(s.id===p.sessionId||s.target.targetId===p.targetId){s.detached=Date.now();for(const r of s.requests.values())if(!r.finished)r.detached=s.detached}save();return}
  const s=sessions.get(sessionId);if(!s||s.detached)return;let r=s.requests.get(p.requestId);
  if(method==='Network.requestWillBeSent'){
   if(new URL(p.request.url).origin!==origin)return;
   if(r){r.redirected=true;return}r={contextId,generationId,worker:s.target.url,targetId:s.target.targetId,browserContextId:s.target.browserContextId??null,sessionId,requestId:p.requestId,url:p.request.url,method:p.request.method,requestHeaders:headers(p.request.headers),started:Date.now(),wallTime:p.wallTime};s.requests.set(p.requestId,r);rows.push(r);
  }else if(method==='Network.responseReceived'&&r){r.status=p.response.status;r.headers=headers(p.response.headers)}
  else if(method==='Network.loadingFailed'&&r){r.failed={at:Date.now(),errorText:p.errorText,canceled:p.canceled};save()}
  else if(method==='Network.loadingFinished'&&r){r.finished={at:Date.now(),timestamp:p.timestamp};r.encodedDataLength=p.encodedDataLength;
   r.bodyTask=send('Network.getResponseBody',{requestId:p.requestId},sessionId).then(b=>{if(!active)return;const bytes=Buffer.from(b.body,b.base64Encoded?'base64':'utf8');r.bodyBytes=bytes.length;r.sha256=createHash('sha256').update(bytes).digest('hex')},e=>{if(active)r.bodyError=e.message}).finally(()=>{delete r.bodyTask;if(active)save()});
   // The promise is non-enumerable: raw evidence contains data, never promises.
   Object.defineProperty(r,'bodyTask',{value:r.bodyTask,writable:true,configurable:true,enumerable:false});
  }
 }
 function message(m,sessionId){if(m.id){const q=commands.get(m.id);if(q){commands.delete(m.id);m.error?q.reject(Error(m.error.message)):q.resolve(m.result)}return}try{event(m.method,m.params||{},sessionId)}catch(e){errors.push({message:e.message});if(active)save()}}
 socket.addEventListener('message',e=>message(JSON.parse(e.data)));socket.addEventListener('error',()=>errors.push({message:'owned CDP socket error'}));
 const initial=await send('Target.getTargets');const pages=initial.targetInfos.filter(t=>t.type==='page'&&new URL(t.url).origin===origin);assert.equal(pages.length,1,'one owned synthetic blank page');ownedBrowserContext=pages[0].browserContextId;
 await send('Target.setDiscoverTargets',{discover:true});for(const target of (await send('Target.getTargets')).targetInfos)await attach(target);save();
 return {async ready(){for(let i=0;i<200;i++){if([...sessions.values()].some(s=>s.enabledAt&&!s.detached))return;await sleep(20)}throw Error('CDP worker Network.enable readiness deadline')},async completion(row,member){const end=Date.now()+timeoutMs;while(active&&Date.now()<end){const id=row.responseHeaders['x-qa-write-id'];const matches=rows.filter(r=>r.headers?.['x-qa-write-id']===id&&id);if(matches.length>1)throw Error('ambiguous raw CDP write identity');if(matches.length===1){const r=matches[0];if(r.failed||r.detached||r.redirected)throw Error('raw CDP failed/stale/redirected');if(r.finished&&(!r.bodyTask||r.bodyError)){assert(!r.bodyError,'CDP body unavailable: '+r.bodyError);const proof=exports.verify(row,r,member),binding=workerBindings.get(row.workerInstanceId);assert(!binding||binding===r.sessionId,'PW worker instance cannot change CDP target');for(const [wid,sid] of workerBindings)assert(wid===row.workerInstanceId||sid!==r.sessionId,'CDP target cannot alias PW workers');const key=r.sessionId+':'+r.requestId;assert(!claimed.has(key)||claimed.get(key)===row,'one raw request cannot cover multiple PW rows');claimed.set(key,row);workerBindings.set(row.workerInstanceId,r.sessionId);return proof}}await sleep(20)}throw Error('raw CDP unfinished or unbound at independent completion deadline')},async close(){if(!active)return;for(const s of sessions.values())for(const r of s.requests.values())if(!r.finished&&!r.failed)r.classification='RAW-UNFINISHED';active=false;save();socket.close();for(const q of commands.values())q.reject(Error('owned CDP sealed'));commands.clear()}};
};
