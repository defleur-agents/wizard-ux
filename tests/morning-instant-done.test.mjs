import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,state,effect,flush} from './fixtures/morning-domain.mjs';
for(const thread of [null,'open-thread'])for(const held of [false,true])test(`same-task receipt bypasses background list guard thread=${thread} held=${held}`,async()=>{
 const f=fixture({thread,held});const p=f.write();assert.equal(f.c.current().data.done,1);assert.match(f.html(),/1 of 4/);assert.equal(f.requests.length,0);
 await flush();assert.equal(f.requests.length,1);f.reply(0);await p;assert.equal(f.c.current().pending,false);
});
for(const code of [200,400])for(const visibility of ['destroyed','covered','offscreen','hidden'])test(`${visibility}: terminal ${code} always releases custody; failure remains actionable`,async()=>{
 const f=fixture();const p=f.write();p.catch(()=>{});f.first.frame.isConnected=visibility!=='destroyed';f.first.source.document.hidden=visibility==='hidden';await flush();f.reply(0,code);
 if(code===200)await p;else await assert.rejects(p);
 assert.equal(f.c.current().pending,false);assert.equal(f.notices.length,code===200?0:1);
 if(code!==200){assert.ok(f.c.current().failure);assert.match(f.html(),/data-chmorningrecover/);assert.match(f.html(),/open Morning to retry/);}
});
test('one writer: step then shell X serializes; failed hide never restores stale progress in a held list',async()=>{
 const f=fixture({held:true});const a=f.write();f.c.hide();assert.equal(f.html(),'');await flush();assert.equal(f.requests.length,1);assert.equal(f.c.current().pending,true);
 f.reply(0);await a;await flush();assert.equal(f.requests.length,2);assert.equal(f.requests[1].body.hidden,true);assert.equal(f.c.current().data.done,1);
 f.reply(1,400);await flush();assert.equal(f.c.current().pending,false);assert.equal(f.c.current().data.done,1);assert.equal(f.c.current().data.hidden,false);assert.match(f.html(),/data-chmorningrecover/);
});
test('one writer: X then step cannot return out of order or resurrect hidden card',async()=>{
 const f=fixture();await f.c.poll();f.c.hide();const b=f.write('read');await flush();assert.equal(f.requests.length,1);assert.ok('hidden'in f.requests[0].body);
 f.reply(0);await flush();assert.equal(f.requests.length,2);f.reply(1);await b;assert.equal(f.c.current().data.hidden,true);assert.equal(f.c.current().data.done,1);assert.equal(f.html(),'');
});
test('same effect replays coalesce; opposite step and X/show-again explicitly refuse without false success',async()=>{
 const f=fixture();const a=f.write();assert.equal(f.write(),a);assert.throws(()=>f.write('workout',false),e=>/saving/.test(e.message)&&e.morningStatus.steps.workout.done===true);
 f.c.hide();assert.throws(()=>f.c.WizMorningWrite(f.first.source,'hide',{hidden:false},state()),/saving/);
 await flush();assert.equal(f.requests.length,1);f.reply(0);await a;await flush();f.reply(1);await flush();assert.equal(f.requests.length,2);
});
test('canonical survives stale second-frame before and late message; old poll is fenced across write settlement',async()=>{
 const f=fixture({holdReads:true});const old=f.c.poll();const a=f.write();await flush();f.reply(0);await a;
 f.reads[0].resolve({ok:true,json:async()=>state()});await old;assert.equal(f.c.current().data.done,1);
 const other=f.addFrame('morning2');f.message({status:state(),pending:true},other.source);assert.equal(f.c.current().pending,false);assert.equal(f.c.current().data.done,1);
 f.reads[1].resolve({ok:true,json:async()=>f.backend()});await flush();
 const b=f.write('read',true,state(),other.source);b.catch(()=>{});await flush();assert.equal(f.c.current().data.done,2);f.reply(1,400);await flush();f.reads[2].resolve({ok:true,json:async()=>f.backend()});await assert.rejects(b);
 assert.equal(f.c.current().data.done,1);assert.equal(f.c.canonical().steps.workout.done,true);
});
for(const defect of ['foreign-app','detached','navigated','cross-origin','nested','opaque','self'])test(`source-bound bridge and messages refuse ${defect} without changing canonical or creating lease`,async()=>{
 const f=fixture();await f.c.poll();const before=JSON.stringify(f.c.canonical());let source=f.first.source;
 if(defect==='foreign-app')f.wins.morning1.appId='other';if(defect==='detached')f.first.frame.isConnected=false;
 if(defect==='navigated')source.location.href='https://wizard.test/other/';if(defect==='cross-origin')source.location.href='https://other.test/morning/';
 if(defect==='nested'||defect==='self')source={document:{},location:{href:'https://wizard.test/morning/'}};
 if(defect==='opaque')Object.defineProperty(source,'location',{get(){throw Error('opaque');}});
 assert.throws(()=>f.write('workout',true,state(),source),/Current shell-owned/);f.message({status:state(),pending:true},source);await flush();
 assert.equal(f.c.current().pending,false);assert.equal(JSON.stringify(f.c.canonical()),before);assert.equal(f.requests.length,0);assert.equal(f.reads.length,1);
});
test('valid legacy pending is only invalidation, never an unbounded pending latch',async()=>{
 const f=fixture();f.message({status:state(),pending:true});await flush();assert.equal(f.c.current().pending,false);assert.equal(f.reads.length,1);assert.equal(f.c.current().data.done,0);
});
for(const malformed of ['json','total','hidden','day','effect'])test(`malformed/contradictory 200 ${malformed} reconciles synthetic committed state, no POST retry`,async()=>{
 const f=fixture();const a=f.write();await flush();const good=effect(state(),{step:'workout',done:true});f.setBackend(good);
 const bad=structuredClone(good);if(malformed==='total')delete bad.total;if(malformed==='hidden')bad.hidden='yes';if(malformed==='day')bad.day='yesterday';if(malformed==='effect')bad.steps.workout.done=false;
 f.requests[0].gate.resolve({ok:true,json:async()=>{if(malformed==='json')throw Error('broken JSON');return bad;}});
 await a;assert.equal(f.c.current().data.done,1);assert.equal(f.requests.length,1);assert.equal(f.reads.length,1);assert.equal(f.notices.length,0);
});
test('lost response after commit reconciles success without retry',async()=>{
 const f=fixture();const p=f.write();await flush();f.setBackend(effect(state(),f.requests[0].body));f.requests[0].gate.reject(Error('lost'));await p;
 assert.equal(f.c.current().data.done,1);assert.equal(f.requests.length,1);
});
test('never-settling POST and failed reconcile are bounded; queue refuses, recovery read permits explicit retry',async()=>{
 const f=fixture({holdReads:true});const p=f.write();p.catch(()=>{});const queued=f.write('read');queued.catch(()=>{});await flush();
 [...f.timers.values()].find(t=>t.ms===12000).f();await flush();assert.equal(f.reads.length,1);
 [...f.timers.values()].find(t=>t.ms===12000).f();await assert.rejects(p);await assert.rejects(queued);
 assert.equal(f.c.current().pending,false);assert.equal(f.c.current().uncertain,true);assert.equal(f.requests.length,1);assert.match(f.html(),/outcome unknown/);assert.throws(()=>f.write(),/Check Morning status/);
 const read=f.c.poll();f.reads[1].resolve({ok:true,json:async()=>state()});await read;assert.equal(f.c.current().uncertain,false);
 const retry=f.write();await flush();f.reply(1);await retry;assert.equal(f.c.current().failure.op.body.step,'read','retrying one item cannot dismiss another blocked intent');
 const next=f.write('read');await flush();f.reply(2);await next;assert.equal(f.c.current().failure,null);assert.equal(f.requests.length,3);
});
test('queued expected_day survives rollover rejection; no successor POST applies yesterday intent today',async()=>{
 const f=fixture();const a=f.write();a.catch(()=>{});const b=f.write('read');b.catch(()=>{});await flush();assert.equal(f.requests[0].body.expected_day,'2030-01-02');
 f.setBackend(state({day:'2030-01-03'}));f.reply(0,409);await assert.rejects(a);await assert.rejects(b);assert.equal(f.requests.length,1);assert.equal(f.c.current().data.day,'2030-01-03');assert.match(f.html(),/new morning started/);
});
