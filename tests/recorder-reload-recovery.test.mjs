import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const read = name => readFileSync(process.env.QA_REVIEW_CORE ? process.env.QA_REVIEW_CORE+'/'+name+'.js' : new URL('../web/core/'+name+'.js', import.meta.url),'utf8');
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
  return {host,window,frame,facade:host.connect(sourceWindow,{}),plan:()=>host.update.reloadPlan()};
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
    if(st===null){await ctx.recoverLocked({});assert.equal(ctx.recoveryError.code,'native_owner_uncertain');assert.equal(data[0].status,'recoverable');}
    else {await ctx.recoverLocked({});assert.equal(data[0].status,st.recording?'recoverable':'pending');assert.equal(data[0].bytes,32000);assert.deepEqual(data[0].meta,row.meta);}
  }
});
function updater(host={}) {
  const timers=[],toasts=[],events=[],els=new Map();let revision='a'.repeat(40),reloads=0,p={ok:true,blocking:[],recording:false,capture:{recheck:true}};
  function element(){return {classList:{toggle(){}},setAttribute(){},dataset:{},addEventListener(){},innerHTML:'',remove(){els.delete('burst')}};}
  const body={appendChild(el){if(el.id)els.set(el.id,el);else if(el.className==='wos-burst')els.set('burst',el)}};
  const document={currentScript:{src:'https://fixture.invalid/wizard-os-home/core/web-update.js'},body,hidden:false,
    querySelector:s=>s==='.wos-burst'?els.get('burst'):null,getElementById:id=>els.get(id),createElement:element,addEventListener(){},querySelectorAll:()=>[]};
  const window={WizAppServices:{update:{announce(){},reloadPlan:()=>p,prepareReload:async()=>{}}},WizAppCapture:{reconcileReload:async()=>{}},WizAppReadingPosition:{flush(){}}};
  const ctx={window,document,URL,location:{href:'https://fixture.invalid/wizard-os-home/',reload(){reloads++}},navigator:{onLine:true},fetch:async u=>({ok:true,text:async()=>revision,json:async()=>({updates:[]})}),setTimeout:(f,ms)=>{timers.push([f,ms]);return timers.length},clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(){}};
  vm.runInNewContext(read('web-update'),ctx);const web=window.WizWebUpdate;web.init({shell:'phone',mount:()=>body,busy:()=>false,toast:(...a)=>toasts.push(a),log:(...a)=>events.push(a),...host});
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

test('aborted native flush preserves the actual frame, hold and registered observers; commit alone detaches',async()=>{
  const f=service({safe:true,keeps:{appId:'mizel'}});
  let finish,removed=0,detached=0;
  f.frame.removeEventListener=()=>detached++;
  f.frame.remove=()=>{removed++;f.frame.isConnected=false};
  f.window.WizAppReadingPosition={};
  f.window.WizAppCapture.prepareReload=()=>new Promise(r=>finish=r);
  const hold=f.facade.update.hold('Mizel recording');
  const plan=f.plan();assert.equal(plan.ok,true);
  const work=f.host.update.prepareReload(plan);await tick();
  assert.equal(removed,0);assert.equal(f.host.inspect()[0].ready,true);
  assert.deepEqual(Array.from(f.host.inspect()[0].holds),['Mizel recording']);
  // Native flush completes, but unrelated unsaved work now vetoes the shell reload.
  const notes=f.facade.update.hold('Unsaved notes');finish();await work;
  assert.equal(f.plan().ok,false);assert.equal(removed,0);assert.equal(f.host.inspect()[0].ready,true);
  assert.equal(f.host.inspect()[0].holds.length,2);
  hold.release(); // exact facade is still authorized after an aborted preparation
  assert.equal(f.host.inspect()[0].holds.length,1);assert.equal(detached,0);
  notes.release();f.host.update.commitReload(f.plan());
  assert.equal(removed,1);assert.equal(detached,1);assert.equal(f.host.inspect().length,0);
});
test('host becomes busy during animation or native flush: no host hook, commit, removal or reload',async()=>{
  for(const during of ['animation','flush']) {
    let busy=false,hooks=0,commits=0,finish;
    const f=updater({busy:()=>busy,beforeReload:()=>hooks++});
    f.plan={ok:true,keeps:{appId:'mizel'},blocking:[],recording:false};
    f.window.WizAppServices.update.commitReload=()=>commits++;
    f.window.WizAppServices.update.prepareReload=()=>new Promise(r=>finish=r);
    f.web.reload('tap');if(during==='animation')busy=true;
    f.timers.find(([,ms])=>ms===900)[0]();await tick();
    if(during==='flush'){assert.ok(finish);busy=true;finish();await tick();}
    assert.equal(hooks,0);assert.equal(commits,0);assert.equal(f.reloads,0);
  }
});
test('native preparation failure is not swallowed into a reload',async()=>{
  const f=updater();let commits=0;f.plan={ok:true,keeps:{appId:'mizel'},blocking:[]};
  f.window.WizAppServices.update.prepareReload=async()=>{throw Error('unknown flush')};
  f.window.WizAppServices.update.commitReload=()=>commits++;
  f.web.reload('tap');f.timers.find(([,ms])=>ms===900)[0]();await tick();
  assert.equal(f.reloads,0);assert.equal(commits,0);assert.match(f.toasts.at(-1)[1],/still kept/);
});
test('timed-out Reload retries join one underlying recovery until it settles',async()=>{
  let release,calls=0;const c=capture({ready:Promise.resolve(),recover:()=>{calls++;return new Promise(r=>release=r)}});
  const a=c.reconcileReload(),b=c.reconcileReload();assert.equal(a,b);await tick();assert.equal(calls,1);
  release();await a;c.recover=async()=>calls++;await c.reconcileReload();assert.equal(calls,2);
});
for(const status of ['missing','reject'])test(`unknown native ${status} still repairs browser rows without declaring quiet`,async()=>{
  const original={id:'browser',appId:'recorder-fixture',status:'recording',bytes:32000,meta:{meetingId:'synthetic'}};
  let row=original;
  const c={active:null,ownedRows:new Map(),recoveryLive:new Set(),ownershipLoaded:false,unknownMeetingActive:false,recoveryError:null,
    rows:async()=>[row],changed(){},meetingBridge:()=>({status:async()=>{if(status==='reject')throw Error('offline');return {};}}),W:{},
    put:async r=>{row=r;c.ownedRows.set(r.id,r)},fail:(code,message)=>Object.assign(Error(message),{code}),crypto:{randomUUID},Date};
  extract('  async function recoverLocked(', '  async function recover()',c);await c.recoverLocked({});
  assert.equal(row.status,'pending');assert.equal(row.bytes,32000);assert.equal(row.meta,original.meta);
  assert.equal(c.recoveryError.code,'native_owner_uncertain');assert.equal(capture(c).reloadCheck().safe,false);
});
test('notification start during row writes invalidates the earlier idle native snapshot',async()=>{
  let calls=0,row={id:'browser',appId:'fixture',status:'recording',bytes:1,meta:{}};
  const c={active:null,ownedRows:new Map(),recoveryLive:new Set(),ownershipLoaded:false,unknownMeetingActive:false,
    rows:async()=>[row],changed(){},meetingBridge:()=>({status:async()=>++calls===1?{recording:false}:{recording:true,meetingId:'new-native'}}),W:{},
    put:async r=>{row=r;c.ownedRows.set(r.id,r)},fail:(code,message)=>Object.assign(Error(message),{code}),crypto:{randomUUID},Date};
  extract('  async function recoverLocked(', '  async function recover()',c);await c.recoverLocked({});
  assert.equal(calls,2);assert.equal(c.unknownMeetingActive,true);assert.equal(capture(c).reloadCheck().safe,false);
});
test('consumed warm preparation release cannot close input now owned by a session',async()=>{
  let closed=0,stopped=0;
  const c={preparations:new Map(),active:null,changed(){},validate:()=>({}),crypto:{randomUUID},Date,
    setTimeout,clearTimeout,DEFAULT_LIMIT:100000,START_BOUND_MS:10000,PROMPT_BOUND_MS:60000,Promise,
    startRun:async s=>{assert.equal(s.ctx,p.ctx);c.discardPrepared('fixture','warm');throw Error('late setup failure')}};
  extract('  function discardPrepared(', '  async function streamChunks(',c);
  const p={id:'warm',appId:'fixture',ctx:{close(){closed++;return Promise.resolve()}},display:Promise.resolve({getTracks:()=>[{stop(){stopped++}}]})};
  c.preparations.set(p.id,p);
  // Execute the exact production consumption path, then replay the app's late catch release.
  extract('  async function start(appId,', '  async function startRun(',c);
  await assert.rejects(c.start('fixture',{kind:'meeting',preparedId:p.id}),/late setup failure/);
  c.discardPrepared('fixture',p.id);
  assert.equal(closed,0);assert.equal(stopped,0);
});
test('unknown native status cannot become an empty app-custody proof, but repaired browser takes remain accessible',async()=>{
  const row={id:'browser',appId:'fixture',status:'pending',bytes:32000};let data=[];
  const c={validate(){},ready:Promise.resolve(),recover:async()=>{},rows:async()=>data,result:async r=>r,
    recoveryError:Object.assign(Error('native unknown'),{code:'native_owner_uncertain'}),unknownMeetingActive:false,ownershipLoaded:true,ownedRows:new Map(),
    fail:(code,message)=>Object.assign(Error(message),{code})};
  extract('  async function pending(appId)', '  async function ack(',c);
  await assert.rejects(c.pending('fixture'),e=>e.code==='native_owner_uncertain');
  data=[row];c.ownedRows.set(row.id,row);assert.equal((await c.pending('fixture'))[0],row);
});
test('a different native take appearing during flush cannot inherit the prior take preparation',async()=>{
  const f=updater();let finish,commits=0;
  f.plan={ok:true,keeps:{appId:'fixture',id:'original',meetingId:'original'}};
  f.window.WizAppServices.update.prepareReload=()=>new Promise(r=>finish=r);
  f.window.WizAppServices.update.commitReload=()=>commits++;
  f.web.reload('tap');f.timers.find(([,ms])=>ms===900)[0]();await tick();
  f.plan={ok:true,keeps:{appId:'fixture',id:'new',meetingId:'new'}};finish();await tick();
  assert.equal(f.reloads,0);assert.equal(commits,0);
});
