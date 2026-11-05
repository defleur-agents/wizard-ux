// Synthetic control-only replay of the published Android 0.10.23/code87 contract.
// Not a physical-handset proof; never loads owner storage, content, or native journals.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const source=process.env.QA_REVIEW_CORE?readFileSync(process.env.QA_REVIEW_CORE+'/app-capture.js','utf8'):read('web/core/app-capture.js');
const hash=s=>createHash('sha256').update(s).digest('hex');
test('published code87 bridge, hub and protocol bytes remain bound to the recovered signed build receipt',()=>{
  for(const [name,expected] of Object.entries({
    MizelBridge:'b0e0f25590d8bda3075bd740daf33acc9e48b9bae6f13f70496a726613503175',
    MizelHub:'6dd6fa1ee7ec73af619a4ae0f5b9a59022cdf2f49437728b01618afb85a60302',
    MizelProtocol:'f23abc264045c982ea4beb1e6c65550f119f64a8a84fdb7c17bf74b9cd3ae302',
    MizelConfig:'de180a6bfc7781d7fbc5c0598c42139beb645ab39c8cb522fb9caf051b417088'
  }))assert.equal(hash(read(`android/app/src/main/java/ai/wizards/os/mizel/${name}.java`)),expected,name);
});
function section(a,b){const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j);}
const state=(recording=false,phase='idle',meetingId=null)=>({recording,paused:phase==='paused',meetingId,mediaMs:0,pendingChunks:0,pausedMs:0,phase,pauseTimeoutMs:1800000,livePcm:true});
function replay({status=state(),owned=false,failStorage=false,device='null',rows:seed=[],delay=false,noReply=false}={}){
  const data=structuredClone(seed),calls=[],timers=new Map();let n=0;
  const W={WizardOSDevice:{recActive:()=>device}};
  const port=W.wizardMizelPort={onmessage:owned?()=>{}:null,postMessage(raw){
    const m=JSON.parse(raw);calls.push(m.cmd);assert.equal(m.cmd,'status','recovery must not stop, ack or alter native custody');
    if(noReply)return;
    const reply=()=>port.onmessage?.({data:JSON.stringify({id:m.id,ok:true,status})});
    if(delay)queueMicrotask(reply);else reply();
  }};
  const ctx={W,Map,Set,Promise,JSON,crypto:{randomUUID},Date,structuredClone,
    active:null,preparations:new Map(),ownedRows:new Map(),recoveryLive:new Set(),
    ownershipLoaded:false,recoveryError:null,unknownMeetingActive:false,attachedMeetingBridge:null,
    setTimeout(fn){const id=++n;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),
    fail:(code,message,extra)=>Object.assign(Error(message),{code},extra),safeCall:(fn,...a)=>fn?.(...a),
    rows:async()=>{if(failStorage)throw Object.assign(Error('synthetic unreadable custody'),{code:'storage_failed'});return data},changed(){},
    put:async row=>{const i=data.findIndex(r=>r.id===row.id);if(i<0)data.push(row);else data[i]=row;ctx.ownedRows.set(row.id,row)},
    adapter:()=>({recover:async row=>status?.recording&&status.meetingId===row.nativeId?{live:true}:{partial:true,meta:{backendOwned:true}}}),
    ready:Promise.resolve(),
  };
  vm.runInNewContext(section('  let rawMeetingBridge;','  // James\'s contract (18 Oct 2026)'),ctx);
  ctx.meetingBridge=()=>ctx.nativeMeetingPort();
  vm.runInNewContext(section('  async function recoverLocked(','  async function recover()'),ctx);
  ctx.recover=async()=>{ctx.recoveryError=null;try{await ctx.recoverLocked({})}catch(e){ctx.recoveryError=e;throw e}};
  vm.runInNewContext(section('  function reloadCheck()','  // Last moment before the shell reloads'),ctx);
  return {ctx,data,calls,timers,port};
}
for(const phase of ['idle','done','finishing'])test(`native code87 ${phase} reply is accepted without touching retained uploads`,async()=>{
  const pending={id:'synthetic-pending',appId:'synthetic',status:'pending',bytes:32000,meta:{synthetic:true}};
  const f=replay({status:{...state(false,phase,phase==='idle'?null:'synthetic-meeting'),pendingChunks:phase==='finishing'?3:0},rows:[pending]});
  const check=await f.ctx.reconcileReload();assert.equal(check.safe,true);assert.equal(check.durable,true);
  assert.deepEqual(f.data,[pending]);assert.deepEqual(f.calls,['status','status']);assert.equal(f.timers.size,0);
});
for(const phase of ['recording','paused'])test(`native code87 ${phase} adopts only the real synthetic native owner and keeps its service`,async()=>{
  const f=replay({status:state(true,phase,'synthetic-meeting')});const check=await f.ctx.reconcileReload();
  assert.equal(check.safe,true);assert.equal(check.keeps.meetingId,'synthetic-meeting');assert.equal(check.durable,false);
  assert.equal(f.data.length,1);assert.equal(f.data[0].status,'recoverable');assert.deepEqual(f.calls,['status','status']);
});
for(const status of [null,{}, {recording:'false'},state(true,'recording',null)])test(`missing/malformed native ownership stays blocked: ${JSON.stringify(status)}`,async()=>{
  const f=replay({status});const check=await f.ctx.reconcileReload();assert.equal(check.safe,false);assert.notEqual(check.durable,true);
  assert.equal(f.data.length,0);assert.deepEqual(f.calls,['status','status']);
});
test('Android event-loop delivery works without a synchronous mock reply',async()=>{
  const f=replay({delay:true});assert.equal((await f.ctx.reconcileReload()).safe,true);assert.deepEqual(f.calls,['status','status']);
});
test('an existing native-port listener is not overwritten or bypassed',async()=>{
  const f=replay({owned:true}),listener=f.port.onmessage;await assert.rejects(f.ctx.reconcileReload(),e=>e.code==='native_bridge_owned');
  assert.equal(f.ctx.reloadCheck().safe,false);assert.equal(f.port.onmessage,listener);assert.deepEqual(f.calls,[]);
});
test('unreadable browser custody blocks before querying or mutating native ownership',async()=>{
  const f=replay({failStorage:true});await assert.rejects(f.ctx.reconcileReload(),e=>e.code==='storage_failed');
  assert.equal(f.ctx.reloadCheck().safe,false);assert.deepEqual(f.calls,[]);assert.equal(f.data.length,0);
});
test('a dropped native status reply stays unknown through both bounded checks',async()=>{
  const f=replay({noReply:true}),p=f.ctx.reconcileReload();
  for(let i=0;i<15;i++)await Promise.resolve();
  assert.equal(f.timers.size,1);for(const fn of [...f.timers.values()])fn();
  for(let i=0;i<15;i++)await Promise.resolve();
  assert.equal(f.calls.length,2);for(const fn of [...f.timers.values()])fn();
  assert.equal((await p).safe,false);assert.equal(f.ctx.recoveryError.code,'native_owner_uncertain');assert.equal(f.data.length,0);
});
test('malformed device-recorder bridge truth cannot borrow the meeting idle proof',async()=>{
  const f=replay({device:'{invalid'});assert.equal((await f.ctx.reconcileReload()).safe,false);assert.equal(f.data.length,0);
});
