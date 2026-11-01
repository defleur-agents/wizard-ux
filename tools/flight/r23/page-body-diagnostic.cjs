'use strict';
// Observer only: no streaming verdict and no inner completion replacement.
const {createHash}=require('node:crypto');
const {safeHeaders}=require('./stream-diagnostic.cjs');
const flags={diagnosticOnly:true,review_required:true,releaseAllowed:false,freshIsolationAcceptance:false};
const identity=r=>JSON.stringify(['contextId','generationId','browserContextId','targetType','targetId','sessionId','requestId'].map(k=>r[k]));
exports.create=({contextId,generationId,origin,send,limits={}})=>{
 const cap={row:4194304,total:67108864,rows:2000,events:20000,json:100663296,...limits};
 const rows=[],events=[],errors=[],excluded=new Map(),map=new Map(),sessions=new Map();let total=0,drops=0,jsonBytes=0,seq=0,sealed=false,ownedContext;
 // Missing starts remain fatal. Retain exact identity before refusal; no private/foreign URL capture.
 const fixtureURL=p=>{const value=p.request?.url||p.response?.url;try{const u=new URL(value);return u.origin===origin&&/^\/(?:__consumer__|__fixture__)\//.test(u.pathname)?{fixtureURL:value.slice(0,2048)}:{}}catch{return {}}};
 const metadata=(method,p,s)=>({contextId,generationId,...fixtureURL(p),browserContextId:s?.target?.browserContextId??null,targetType:s?.target?.type??null,targetId:s?.target?.targetId??null,sessionId:s?.id??null,requestId:p.requestId??null,method,receiveSequence:seq,receivedMonotonicNs:process.hrtime.bigint().toString(),protocolTimestamp:p.timestamp??null,enabledAt:s?.enabledAt??null,enableSentAt:s?.enableSentAt??null,...(p.response?{status:p.response.status,headers:safeHeaders(p.response.headers)}:{})});
 const bad=(r,reason,detail={})=>{if(r)r.invalid=true;if(errors.length<2000)errors.push({requestId:r?.requestId||null,reason,...detail});else drops++};
 const log=(method,p,r)=>{const e={receiveSequence:++seq,receivedMonotonicNs:process.hrtime.bigint().toString(),method,requestId:p.requestId,protocolTimestamp:p.timestamp,identity:r?JSON.parse(identity(r)):null};const n=Buffer.byteLength(JSON.stringify(e));if(events.length>=cap.events||jsonBytes+n>cap.json){drops++;bad(r,'event cap');return}jsonBytes+=n;events.push(e)};
 function feed(method,p,s){
  if(sealed||!method.startsWith('Network.'))return;
  if(!s?.id||!s.target?.targetId||!s.target.browserContextId){bad(null,'missing session identity',metadata(method,p,s));return}
  const binding=JSON.stringify(s.target);if((sessions.has(s.id)&&sessions.get(s.id)!==binding)||(ownedContext&&s.target.browserContextId!==ownedContext)){bad(null,'foreign session target/context',metadata(method,p,s));return}sessions.set(s.id,binding);ownedContext??=s.target.browserContextId;
  const key=s.id+':'+p.requestId;let r=map.get(key),ignored=excluded.get(key);
  if(method==='Network.requestWillBeSent'){
   // Check reuse BEFORE origin exclusion: a foreign redirect cannot erase an admitted row.
   if(r||ignored){bad(r,'duplicate request or redirect',metadata(method,p,s));return}
   let u;try{u=new URL(p.request.url)}catch{bad(null,'invalid URL',metadata(method,p,s));return}
   if(u.origin!==origin){if(rows.length+excluded.size>=cap.rows){drops++;return}ignored={...metadata(method,p,s),classification:'explicitly-excluded-origin',started:true,finished:false};excluded.set(key,ignored);log(method,p,ignored);return}
   if(rows.length+excluded.size>=cap.rows){drops++;return}
   r={contextId,generationId,browserContextId:s.target.browserContextId,targetType:s.target.type,targetId:s.target.targetId,sessionId:s.id,requestId:p.requestId,url:p.request.url,method:p.request.method,requestHeaders:safeHeaders(p.request.headers),started:true,finished:false,bodyCalls:0};map.set(key,r);rows.push(r);
   Object.defineProperty(r,'seen',{value:new Set()});
  }
  if(ignored){
   log(method,p,ignored);
   if(method==='Network.responseReceived'){
    let foreign=false;try{foreign=new URL(p.response.url).origin!==origin}catch{}
    if(!foreign||safeHeaders(p.response.headers)['x-qa-write-id']||ignored.responded||ignored.finished)bad(null,'excluded response scope ambiguity',metadata(method,p,s));ignored.responded=true;
   }
   if(['Network.loadingFinished','Network.loadingFailed'].includes(method)){if(ignored.finished)bad(null,'duplicate excluded terminal',metadata(method,p,s));ignored.finished=true}
   return;
  }
  if(!r){if(['Network.responseReceived','Network.dataReceived','Network.loadingFinished','Network.loadingFailed'].includes(method)){log(method,p,{...metadata(method,p,s)});bad(null,'missing request start',metadata(method,p,s))}return}
  log(method,p,r);if(p.timestamp!==undefined&&!Number.isFinite(p.timestamp))bad(r,'invalid protocol timestamp');
  // Raw protocol stamps are observations, NOT a cross-event causal assertion.
  // Ordering is the received event sequence; no tolerance invented from model advice.
  if(method==='Network.responseReceived'){
   if(r.status!==undefined||r.finished||r.failed){bad(r,'duplicate or late response');return}
   if(p.response.url!==r.url){bad(r,'wrong response URL');return}
   Object.assign(r,{status:p.response.status,headers:safeHeaders(p.response.headers),fromServiceWorker:p.response.fromServiceWorker??null,serviceWorkerResponseSource:p.response.serviceWorkerResponseSource??null});
  }else if(method==='Network.dataReceived'){
   if(r.status===undefined)bad(r,'data before response');
   if(r.finished||r.failed)bad(r,'data after terminal');
   const sig=JSON.stringify(p);if(r.seen.has(sig))bad(r,'duplicate data');if(r.seen.size>=cap.events){drops++;bad(r,'data event cap')}else r.seen.add(sig);
  }else if(method==='Network.loadingFailed'){
   if(r.finished||r.failed)bad(r,'duplicate terminal');r.failed=true;r.errorText=String(p.errorText||'').slice(0,2048);bad(r,'request failed');
  }else if(method==='Network.loadingFinished'){
   if(r.finished||r.failed||r.status===undefined){bad(r,'duplicate terminal or missing response');return}r.finished=true;r.finishReceiveSequence=seq;r.finishProtocolTimestamp=p.timestamp;
   if(!['page','iframe'].includes(r.targetType)||r.invalid||drops)return;
   const savedIdentity=identity(r);r.bodyCalls++;
   const task=Promise.resolve().then(()=>send('Network.getResponseBody',{requestId:r.requestId},r.sessionId)).then(v=>{
    if(sealed)throw Error('sealed before body response');if(identity(r)!==savedIdentity)throw Error('body identity changed');
    if(!v||typeof v.body!=='string'||typeof v.base64Encoded!=='boolean')throw Error('invalid API response');
    if(v.body.length>cap.row*4/3+4)throw Error('encoded body cap');
    let bytes;if(v.base64Encoded){if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.body))throw Error('invalid base64');bytes=Buffer.from(v.body,'base64');if(bytes.toString('base64')!==v.body)throw Error('noncanonical base64')}else{if(/[^\x00-\x7f]/.test(v.body))throw Error('non-ASCII text cannot establish original byte identity');bytes=Buffer.from(v.body,'ascii')}
    if(bytes.length>cap.row||total+bytes.length>cap.total){drops++;throw Error('decoded body cap')}
    total+=bytes.length;r.body={api:'Network.getResponseBody',completed:true,base64Encoded:v.base64Encoded,data:v.body,decodedBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...flags};
   }).catch(e=>{r.bodyError=String(e.message).slice(0,2048);bad(r,'completed PAGE body unavailable: '+r.bodyError)});
   Object.defineProperty(r,'task',{value:task});
  }
 }
 const snapshot=()=>({...flags,limits:cap,totalBytes:total,drops,errors,events,excludedRequests:[...excluded.values()].map(r=>({...r})),rows:rows.map(r=>({...r}))});
 function link(inner,member){
  const v=snapshot(),matches=v.rows.filter(r=>['page','iframe'].includes(r.targetType)&&['contextId','generationId','browserContextId','url','method','status'].every(k=>r[k]===inner[k])&&r.headers?.['x-qa-write-id']&&r.headers['x-qa-write-id']===inner.headers?.['x-qa-write-id']);
  const inners=v.rows.filter(r=>r.targetType==='service_worker'&&['contextId','generationId','browserContextId','url','method','status','sessionId','requestId','targetId'].every(k=>r[k]===inner[k])&&r.headers?.['x-qa-write-id']===inner.headers?.['x-qa-write-id']);
  const innerCandidates=v.rows.filter(r=>r.targetType==='service_worker'&&['contextId','generationId','browserContextId','url','method','status'].every(k=>r[k]===inner[k])&&r.headers?.['x-qa-write-id']===inner.headers?.['x-qa-write-id']);
  const r=matches[0];const encoding=r?.headers?.['content-encoding'];
  const linked=matches.length===1&&inners.length===1&&innerCandidates.length===1&&!v.drops&&!v.errors.length&&!inner.invalid&&!inner.failed&&r.started&&r.finished&&!r.invalid&&!r.failed&&r.fromServiceWorker===true&&r.method==='GET'&&r.status===200&&!r.requestHeaders.range&&!inner.requestHeaders?.range&&(!encoding||encoding==='identity')&&r.body?.completed&&r.body.decodedBytes===member.bytes&&r.body.sha256===member.sha256&&member.bytes>0;
  return {...flags,linked:!!linked,innerFinished:!!inner.finished,consumer:matches.length===1?r:null,matches:matches.length,innerMatches:inners.length,scope:'page network-agent completed-response bytes only; not application consumption, streaming PASS, or inner completion'};
 }
 return {feed,snapshot,link,async flush(){await Promise.allSettled(rows.map(r=>r.task))},detach(s){for(const r of rows)if(r.sessionId===s.id&&!r.finished)bad(r,'target closed before finish')},async close(){await Promise.allSettled(rows.map(r=>r.task));sealed=true;return snapshot()}};
};
