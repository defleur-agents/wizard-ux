'use strict';
// Read-only CacheStorage evidence, never fetches, seeds or repairs an asset.
const assert=require('node:assert/strict');
exports.snapshot=async function snapshot(){
 const names=(await caches.keys()).sort(),entries=[];
 for(const name of names){const cache=await caches.open(name);for(const request of await cache.keys()){
  const matches=await cache.matchAll(request);for(const response of matches){const bytes=await response.clone().arrayBuffer();entries.push({cache:name,url:request.url,method:request.method,type:response.type,responseHeaders:Object.fromEntries(response.headers),status:response.status,redirected:response.redirected,matches:matches.length,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')})}
 }}
 return {origin:location.origin,at:Date.now(),names,entries,registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.scriptURL,state:r.active?.state,installing:r.installing?.scriptURL,waiting:r.waiting?.scriptURL})),controller:navigator.serviceWorker.controller?.scriptURL||null};
};
exports.rel=url=>{const p=new URL(url).pathname;return p.startsWith('/wizard-os-home/')?'ux/web/'+p.slice(16):p.startsWith('/wisdom/')?'wisdom/static/'+(p.slice(8)||'index.html'):null};
exports.validate=({snapshot:s,generation,contextId,origin,members,policy,fonts=[]})=>{
 assert(generation?.initialEmpty&&generation.origin===origin&&s.origin===origin,'fresh same-origin cache generation required');
 assert.equal(s.generationId,generation.id,'stale cache generation');assert.equal(s.contextId,contextId,'foreign context evidence');
 for(const name of s.names){const owned=policy.prefixes.some(p=>name.startsWith(p));if(owned)assert(policy.allowed.includes(name),'unexpected/old owned cache '+name)}
 for(const w of policy.workers){const found=s.registrations.filter(r=>r.scope===new URL(w.scope,origin).href);assert.equal(found.length,1,'exact active worker scope '+w.scope);const r=found[0];assert.equal(r.active,new URL(w.script,origin).href);assert.equal(r.state,'activated');assert(!r.installing&&!r.waiting,'worker generation changing')}
 const coverage={};
 for(const e of s.entries.filter(e=>policy.allowed.includes(e.cache))){const rel=exports.rel(e.url),m=members[rel];if(!m)continue;assert.equal(e.method,'GET');assert(e.bytes>0||m.bytes===0,'empty cached body '+e.url);assert.equal(e.bytes,m.bytes,'cached size '+e.url);assert.equal(e.sha256,m.sha256,'cached exact-source hash '+e.url);assert.equal(e.type,'basic','non-basic cached response');assert.equal(e.status,200);assert(!e.redirected&&e.matches===1,'ambiguous/redirected cache entry');coverage[e.url]??=[];coverage[e.url].push(e)}
 for(const item of policy.required){const url=new URL(item.url,origin).href;assert(coverage[url]?.some(e=>e.cache===item.cache),'missing generation cache closure '+url)}
 return {generationId:generation.id,contextId,coverage,fonts,fontSources:(policy.fontSources||[]).map(f=>({...f,url:new URL(f.url,origin).href})),scope:'exact new-generation cache bytes; NOT individual worker network-response bytes'};
};
exports.resolve=(row,proof,member)=>{
 assert(row.worker||row.fromServiceWorker,'empty plain-page GET cannot use cache evidence');assert.equal(row.contextId,proof.contextId,'old-context response');assert.equal(row.generationId,proof.generationId,'stale response generation');
 const entries=proof.coverage[row.url];assert(entries?.length,'unobservable GET lacks exact-URL cache evidence '+row.url);for(const e of entries){assert.equal(e.sha256,member.sha256);assert.equal(e.bytes,member.bytes)}
 if(!row.worker&&row.fromServiceWorker&&/\.woff2(?:\?|$)/.test(row.url)){const family=proof.fontSources.find(f=>f.url===row.url)?.family;assert(family,'unmapped SW font URL');assert(proof.fonts.some(f=>f.family.replaceAll('"','').replaceAll("'",'')===family&&f.status==='loaded'),'SW font family not actually loaded '+family);assert(!proof.fonts.some(f=>f.status==='error'),'FontFace error')}
 return {cacheEntries:entries,scope:proof.scope,generationId:proof.generationId,contextId:proof.contextId};
};
