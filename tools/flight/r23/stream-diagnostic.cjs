'use strict';
// Diagnostic only. Never supplies the existing acceptance completion gate.
const {createHash}=require('node:crypto');
const safeHeaders=h=>Object.fromEntries(Object.entries(h||{}).filter(([k])=>['content-length','content-type','content-encoding','x-qa-write-id','range','cache-control'].includes(k.toLowerCase())).map(([k,v])=>[k.toLowerCase(),String(v).slice(0,2048)]));
exports.safeHeaders=safeHeaders;
exports.create=({contextId,generationId,origin,send,limits={}})=>{
 const cap={row:4*1024*1024,total:64*1024*1024,rows:2000,events:20000,json:96*1024*1024,...limits},rows=[],events=[],errors=[],map=new Map();let total=0,pendingBytes=0,jsonBytes=0,drops=0,sealed=false;
 const bad=(r,reason)=>{if(r)r.invalid=true;if(errors.length<2000)errors.push({reason,requestId:r?.requestId||null});else drops++};
 function log(type,r,data={}){const e={type,receivedAt:Date.now(),receivedMonotonicNs:process.hrtime.bigint().toString(),protocolTimestampSource:'CDP Network event timestamp (seconds, monotonic); absent when protocol omits',...data,...(r?{contextId,generationId,targetId:r.targetId,sessionId:r.sessionId,requestId:r.requestId}: {})};const n=Buffer.byteLength(JSON.stringify(e));if(events.length>=cap.events||jsonBytes+n>cap.json){drops++;if(r)r.invalid=true;return}jsonBytes+=n;events.push(e)}
 function append(r,data,source){try{if(typeof data!=='string'||data.length%4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))throw Error('invalid base64');const b=Buffer.from(data,'base64');if(b.toString('base64')!==data)throw Error('noncanonical base64');if(r.streamBytes+b.length>cap.row||total+b.length>cap.total){drops++;throw Error('byte cap')}r.chunks.push({source,data,bytes:b.length});r.streamBytes+=b.length;total+=b.length}catch(e){bad(r,e.message)}}
 function feed(method,p,s){if(sealed)return;if(events.length>=cap.events||jsonBytes>=cap.json){drops++;return}const key=s.id+':'+p.requestId;let r=map.get(key);
  if(method==='Network.requestWillBeSent'){
   if(new URL(p.request.url).origin!==origin){if(r)bad(r,'foreign redirect');return}
   if(r){bad(r,'duplicate request or redirect');return}if(rows.length>=cap.rows){drops++;return}
   r={contextId,generationId,browserContextId:s.target.browserContextId,targetType:s.target.type,targetId:s.target.targetId,sessionId:s.id,requestId:p.requestId,url:p.request.url,method:p.request.method,requestHeaders:safeHeaders(p.request.headers),streamBytes:0,chunks:[],pending:[],finished:false};Object.defineProperty(r,'seen',{value:new Set(),enumerable:false});map.set(key,r);rows.push(r);
  }
  if(!r)return;
  const timestamp=p.timestamp;if(timestamp!==undefined&&(!Number.isFinite(timestamp)||timestamp<(r.lastTimestamp??-Infinity)))bad(r,'out of order protocol timestamp');if(timestamp!==undefined)r.lastTimestamp=timestamp;
  const detail={timestamp};
  if(method==='Network.responseReceived'){
   if(r.status!==undefined){bad(r,'duplicate response');return}Object.assign(r,{status:p.response.status,headers:safeHeaders(p.response.headers),fromServiceWorker:p.response.fromServiceWorker??null,serviceWorkerResponseSource:p.response.serviceWorkerResponseSource??null});Object.assign(detail,{url:r.url,status:r.status,headers:r.headers,fromServiceWorker:r.fromServiceWorker,serviceWorkerResponseSource:r.serviceWorkerResponseSource});
   r.task=Promise.resolve().then(()=>send('Network.streamResourceContent',{requestId:p.requestId},s.id)).then(v=>{if(sealed)return;if(!v||typeof v.bufferedData!=='string')throw Error('stream acknowledgement missing bufferedData');r.ack=true;append(r,v.bufferedData,'bufferedData');for(const item of r.pending){pendingBytes-=item.length;append(r,item,'dataReceived-before-ack')}r.pending=[];log('streamAcknowledged',r,{bufferedBytes:Buffer.from(v.bufferedData,'base64').length})}).catch(e=>{if(!sealed){r.streamError=String(e.message).slice(0,512);bad(r,'stream unsupported/not ready/invalid: '+r.streamError)}});
   Object.defineProperty(r,'task',{value:r.task,writable:true,enumerable:false});
  }else if(method==='Network.dataReceived'){
   const signature=createHash('sha256').update(JSON.stringify(p)).digest('hex');if(r.seen.has(signature)){bad(r,'duplicate data event');return}if(r.seen.size>=cap.events){drops++;bad(r,'per-row event cap');return}r.seen.add(signature);
   Object.assign(detail,{dataLength:p.dataLength,encodedDataLength:p.encodedDataLength,dataPresent:typeof p.data==='string'});
   if(r.finished)bad(r,'data after finish');
   if(typeof p.data==='string'){if(r.ack)append(r,p.data,'dataReceived');else {if(r.pending.reduce((n,x)=>n+x.length,0)+p.data.length>cap.row*4/3||total+pendingBytes+p.data.length>cap.total){drops++;bad(r,'pending byte cap')}else {r.pending.push(p.data);pendingBytes+=p.data.length}}}
  }else if(method==='Network.loadingFinished'){if(r.finished)bad(r,'duplicate finish');r.finished=true;r.encodedDataLength=p.encodedDataLength;r.finishedTimestamp=p.timestamp}
  else if(method==='Network.loadingFailed'){r.failed=true;bad(r,'loadingFailed')}
  log(method,r,detail);
 }
 function snapshot(){return {diagnosticOnly:true,review_required:true,releaseAllowed:false,freshIsolationAcceptance:false,contextId,generationId,limits:cap,totalBytes:total,eventJsonBytes:jsonBytes,drops,errors,events,rows:rows.map(({pending,...r})=>{const bytes=Buffer.concat(r.chunks.map(c=>Buffer.from(c.data,'base64')));return {...r,pendingChunks:pending.length,sha256:createHash('sha256').update(bytes).digest('hex'),streamValid:!!r.ack&&!r.invalid&&!r.failed&&!pending.length&&!drops,independentLoadingFinished:r.finished}})}}
 function link(inner,member){const view=snapshot();const matches=view.rows.filter(r=>r.targetType!=='service_worker'&&r.contextId===inner.contextId&&r.generationId===inner.generationId&&r.browserContextId===inner.browserContextId&&r.url===inner.url&&r.method===inner.method&&r.status===inner.status&&r.headers?.['x-qa-write-id']&&r.headers['x-qa-write-id']===inner.headers?.['x-qa-write-id']);if(matches.length!==1)return {diagnosticOnly:true,linked:false,reason:'missing or ambiguous exact consumer identity',matches:matches.length,innerFinished:!!inner.finished};const r=matches[0];return {diagnosticOnly:true,linked:r.streamValid&&r.independentLoadingFinished&&r.fromServiceWorker===true&&r.streamBytes===member.bytes&&r.sha256===member.sha256,innerFinished:!!inner.finished,consumer:r};}
 return {feed,log,snapshot,link,detach(s){for(const r of rows)if(r.sessionId===s.id&&!r.finished)bad(r,'target closure before finish');log('targetClosed',null,{targetId:s.target.targetId,sessionId:s.id})},async close(){await Promise.allSettled(rows.map(r=>r.task));sealed=true;return snapshot()}};
};
