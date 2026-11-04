import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const read = name => readFileSync(new URL('../web/core/'+name+'.js', import.meta.url),'utf8');
const source = read('app-capture');
function extract(from,to,ctx) {
  const a=source.indexOf(from),b=source.indexOf(to,a); assert.ok(a>=0&&b>a,from);
  vm.runInNewContext(source.slice(a,b),ctx); return ctx;
}
function capture(overrides={}) {
  const ctx={active:null,preparations:new Map(),ownedRows:new Map(),recoveryLive:new Set(),unknownMeetingActive:false,
    ownershipLoaded:true,recoveryError:null,attachedMeetingBridge:null,W:{},...overrides};
  extract('  function reloadCheck()', '  // Last moment before the shell reloads',ctx);
  return ctx;
}
function service(cap,appId='mizel') {
  const sourceWindow={location:new URL('https://fixture.invalid/'+appId+'/'),document:{},addEventListener(){},postMessage(){}};
  const frame={tagName:'IFRAME',src:sourceWindow.location.href,isConnected:true,contentWindow:sourceWindow,hasAttribute:()=>false,addEventListener(){},removeEventListener(){}};
  const window={WizCore:{apps:()=>({APPS:[{id:appId,name:'Synthetic Recorder',kind:'wizard',url:'/'+appId+'/'}]})},WizAppCapture:{reloadCheck:()=>cap},dispatchEvent(){}};
  vm.runInNewContext(read('app-services'),{window,location:new URL('https://fixture.invalid/wizard-os-home/'),URL,crypto:{randomUUID},addEventListener(){},setInterval(){},setTimeout,clearTimeout,document:{readyState:'loading',addEventListener(){}},CustomEvent:class{},navigator:{}});
  const host=window.WizAppServices;host.attach(frame,{appId,path:'/'+appId+'/'});
  return {host,facade:host.connect(sourceWindow,{}),plan:()=>host.update.reloadPlan()};
}
test('shared durable custody never overrides app-owned capture or dirty-work holds',()=>{
  const cap=capture().reloadCheck(); assert.equal(cap.durable,true);
  for(const appId of ['mizel','other']) for(const reason of ['Mizel recording','Mizel capture or durable task save','Mizel unsaved notes','Recording','Some capture work','Mizel recording notes']) {
    const f=service(cap,appId),hold=f.facade.update.hold(reason);assert.equal(f.plan().ok,false,appId+': '+reason);
    hold.release();assert.equal(f.plan().ok,true);
  }
});
test('durability is positive proof, never inferred from an error, unloaded registry, unresolved row or active memory',()=>{
  for(const overrides of [{ownershipLoaded:false},{recoveryError:{code:'storage_failed'}},{ownedRows:new Map([['x',{status:'recoverable'}]])}]){
    const cap=capture(overrides).reloadCheck(),f=service(cap);assert.notEqual(cap.durable,true);assert.equal(cap.safe,false);assert.equal(f.plan().ok,false);
  }
  const retained={id:'stopped',appId:'mizel',kind:'meeting',status:'pending',bytes:32000};
  const ctx=capture({ownedRows:new Map([['stopped',retained]])});assert.equal(ctx.reloadCheck().durable,true);assert.equal(ctx.ownedRows.get('stopped'),retained);
});
test('real browser recording, stopping, unsaved memory, preparations and microphone loans remain blocked',()=>{
  for(const phase of ['starting','recording','paused','stopping']) {
    const cap=capture({active:{row:{id:'live',appId:'mizel'},phase,engine:{},queue:[{blob:'synthetic-unsaved'}]}}).reloadCheck();
    assert.equal(cap.safe,false,phase);assert.equal(cap.recheck,false);const f=service(cap);f.facade.update.hold('Mizel recording');assert.equal(f.plan().ok,false);
  }
  assert.equal(capture({preparations:new Map([['warm',{}]])}).reloadCheck().safe,false);
  const ctx=capture({W:{wizardMizelPort:{}},active:{row:{id:'live',appId:'mizel',native:'wizard-meetings',nativeId:'qa-meeting',kind:'meeting',meta:{}},phase:'recording',engine:{}}});
  const cap=ctx.reloadCheck();assert.equal(cap.safe,true);assert.equal(cap.keeps.appId,'mizel');
  ctx.active.borrow={};assert.equal(ctx.reloadCheck().reason,'microphone_loan');
});
test('native survival is specific: steady Android meeting keeps recording, private mic loans and unfinished saves block',()=>{
  const row={id:'native-capture',appId:'recorder-fixture',kind:'meeting',native:'wizard-meetings',nativeId:'meeting'};
  const active={row,phase:'recording',engine:{}};
  assert.equal(capture({active,W:{wizardMizelPort:{}}}).reloadCheck().safe,true);
  for(const patch of [{borrow:{private:true}},{borrowWork:Promise.resolve()},{finishPromise:Promise.resolve()},{phase:'stopping'},{engineDetached:true}]) {
    const check=capture({active:{...active,...patch},W:{wizardMizelPort:{}}}).reloadCheck();
    assert.equal(check.safe,false);if(patch.borrow||patch.borrowWork)assert.equal(check.reason,'microphone_loan');
  }
});
test('unknown/malformed native owners fail closed',()=>{
  for(const overrides of [{unknownMeetingActive:true},{W:{WizardOSDevice:{recActive:()=>'{broken'}}},{W:{WizardOSDevice:{recActive:()=>'{"id":"native-live"}'}}},{ownedRows:new Map([['x',{native:'wizard-meetings',status:'recoverable'}]])}])assert.equal(capture(overrides).reloadCheck().safe,false);
});
test('tap reconciliation only runs the existing locked recovery when inactive; no stop/cancel/ack/delete',async()=>{
  let recovered=0;
  const ctx=capture({ready:Promise.resolve(),recover:async()=>recovered++});await ctx.reconcileReload();assert.equal(recovered,1);
  ctx.active={row:{},phase:'recording',engine:{}};await ctx.reconcileReload();assert.equal(recovered,1);
  ctx.active=null;ctx.preparations.set('warm',{});await ctx.reconcileReload();assert.equal(recovered,1);
});
test('stale native ID-less reservation becomes pending without deleting metadata/chunks; live/unknown stays protected',async()=>{
  for(const st of [{recording:false},{recording:true},null]){
    const row={id:'stale',appId:'mizel',kind:'meeting',native:'wizard-meetings',status:'recoverable',bytes:32000,meta:{synthetic:true}};
    const data=[row],ctx={ownedRows:new Map(),recoveryLive:new Set(),ownershipLoaded:false,unknownMeetingActive:false,active:null,
      rows:async()=>data,changed(){},meetingBridge:()=>({status:async()=>st}),W:{},put:async r=>{data[0]=r;ctx.ownedRows.set(r.id,r)},fail:(code,message)=>Object.assign(Error(message),{code}),crypto:{randomUUID},Date};
    extract('  async function recoverLocked(', '  async function recover()',ctx);
    if(st===null){await assert.rejects(ctx.recoverLocked({}),e=>e.code==='native_owner_uncertain');assert.equal(data[0],row);}
    else {await ctx.recoverLocked({});assert.equal(data[0].status,st.recording?'recoverable':'pending');assert.equal(data[0].bytes,32000);assert.deepEqual(data[0].meta,row.meta);}
  }
});
function updater() {
  const timers=[],toasts=[],events=[],els=new Map();let revision='a'.repeat(40),reloads=0,p={ok:true,blocking:[],recording:false,capture:{recheck:true}};
  function element(){return {classList:{toggle(){}},setAttribute(){},dataset:{},addEventListener(){},innerHTML:'',remove(){els.delete('burst')}};}
  const body={appendChild(el){if(el.id)els.set(el.id,el);else if(el.className==='wos-burst')els.set('burst',el)}};
  const document={currentScript:{src:'https://fixture.invalid/wizard-os-home/core/web-update.js'},body,hidden:false,
    querySelector:s=>s==='.wos-burst'?els.get('burst'):null,getElementById:id=>els.get(id),createElement:element,addEventListener(){},querySelectorAll:()=>[]};
  const window={WizAppServices:{update:{announce(){},reloadPlan:()=>p,prepareReload:async()=>{}}},WizAppCapture:{reconcileReload:async()=>{}},WizAppReadingPosition:{flush(){}}};
  const ctx={window,document,URL,location:{href:'https://fixture.invalid/wizard-os-home/',reload(){reloads++}},navigator:{onLine:true},fetch:async u=>({ok:true,text:async()=>revision,json:async()=>({updates:[]})}),setTimeout:(f,ms)=>{timers.push([f,ms]);return timers.length},clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(){}};
  vm.runInNewContext(read('web-update'),ctx);const web=window.WizWebUpdate;web.init({shell:'phone',mount:()=>body,busy:()=>false,toast:(...a)=>toasts.push(a),log:(...a)=>events.push(a)});
  return {web,window,timers,toasts,els,events,get reloads(){return reloads},set plan(v){p=v},get plan(){return p},set revision(v){revision=v}};
}
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
test('Reload paints checking before I/O, retries once, and reloads only under the current predicate',async()=>{
  const f=updater();await f.web.check(true);f.revision='b'.repeat(40);await f.web.check(true);
  let release;f.window.WizAppCapture.reconcileReload=()=>new Promise(r=>release=r);
  f.web.reload('tap');assert.match(f.els.get('dvWeb').innerHTML,/disabled aria-busy="true">Checking recorder/);assert.equal(release,undefined);await tick();assert.ok(release);assert.equal(f.reloads,0);
  release();await tick();const animation=f.timers.find(([,ms])=>ms===900);assert.ok(animation);
  f.plan={ok:false,blocking:[{kind:'capture'}],recording:true};animation[0]();await tick();assert.equal(f.reloads,0);assert.equal(f.els.has('burst'),false);assert.match(f.toasts.at(-1)[1],/Reload paused/);
  f.plan={ok:true,blocking:[],recording:false};f.web.reload('tap');f.timers.filter(([,ms])=>ms===900).at(-1)[0]();await tick();assert.equal(f.reloads,1);
});
test('reload recovery errors do not unload, discard, or get stuck in checking',async()=>{
  const f=updater();await f.web.check(true);f.revision='b'.repeat(40);await f.web.check(true);f.window.WizAppCapture.reconcileReload=async()=>{throw Error('synthetic offline')};
  f.web.reload('tap');await tick();assert.equal(f.reloads,0);assert.doesNotMatch(f.els.get('dvWeb').innerHTML,/Checking recorder/);assert.match(f.toasts.at(-1)[1],/audio is still kept/);
});
test('recording/work starting during asynchronous native backup flush prevents reload',async()=>{
  const f=updater();let release;f.plan={ok:true,keeps:{appId:'mizel'},blocking:[],recording:false};
  f.window.WizAppServices.update.prepareReload=()=>new Promise(r=>release=r);
  f.web.reload('tap');f.timers.find(([,ms])=>ms===900)[0]();await tick();assert.ok(release);
  f.plan={ok:false,blocking:[{kind:'work',reason:'unsaved notes'}],recording:false};release();await tick();assert.equal(f.reloads,0);assert.match(f.toasts.at(-1)[1],/Reload paused/);
});
test('hung recorder check has a bounded UI wait without cancelling the underlying take',async()=>{
  const f=updater();await f.web.check(true);f.revision='b'.repeat(40);await f.web.check(true);
  f.window.WizAppCapture.reconcileReload=()=>new Promise(()=>{});f.web.reload('tap');await tick();
  f.timers.find(([,ms])=>ms===15000)[0]();await tick();assert.equal(f.reloads,0);assert.doesNotMatch(f.els.get('dvWeb').innerHTML,/Checking recorder/);assert.match(f.toasts.at(-1)[1],/audio is still kept/);
});
