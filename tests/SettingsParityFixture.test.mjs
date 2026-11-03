import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import fixture from '../tools/qa-settings-fixture.cjs';
const welcome = fs.readFileSync(new URL('../web/core/welcome.js', import.meta.url), 'utf8');
const harness = fs.readFileSync(new URL('../qa-settings-component-parity.cjs', import.meta.url), 'utf8');
function slice(start, end) { const a=welcome.indexOf(start),b=welcome.indexOf(end,a);assert(a>=0&&b>a);return welcome.slice(a,b); }
async function boot(options, setup, state) {
  const tasks=[],opened=[],log=[],s={Promise,tsig:()=>({}),booted:false,H:null,acted:false,act(){},addEventListener(){},removeEventListener(){},seenPending:()=>false,markSeen(){},read:()=>state,log:x=>log.push(x),open:x=>opened.push(x),setTimeout:(f,ms)=>{if(!ms)tasks.push(f);},fetch:async url=>({ok:true,json:async()=>url.endsWith('/model/options')?options:setup})};
  s.window={WizCore:{appsLoaded:()=>Promise.resolve()},WizConfig:{ready:Promise.resolve()}};
  s.OPTIONS='/wizard/hermes/api/model/options';s.SETUP='/wizard/v1/setup';s.SUB='claude-subscription-directsdk-experimental';
  vm.runInNewContext(slice('  function aiConnected(j, slug)','\n  // slug:')+slice('  async function aiReady(slug)','\n  async function setupState()')+slice('  async function setupState()','\n  // The server')+slice('  function boot(h)','\n\n  // The first thread')+'\nthis.boot=boot;',s);
  s.boot({});assert.equal(tasks.length,1);await tasks.shift()();return{opened,log};
}
test('Settings init seeds the actual Welcome key persistently, preserves saved state and never touches frames',()=>{
  const saved=new Map(),s={navigator:{},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)}};s.window=s;s.top=s;
  vm.runInNewContext(`(${fixture.seedOwner})()`,s);assert.equal(saved.get('wos.welcome.v1'),'done');
  saved.set('wos.skin','obsidian-light');vm.runInNewContext(`(${fixture.seedOwner})()`,s);assert.equal(saved.get('wos.skin'),'obsidian-light');
  s.top={};s.localStorage.setItem=()=>{throw Error('frame write');};vm.runInNewContext(`(${fixture.seedOwner})()`,s);
});
test('actual Welcome boot accepts setup first_run:false plus authenticated synthetic model and done key',async()=>{
  const r=await boot(fixture.ownerRead('/wizard/hermes/api/model/options'),fixture.ownerRead('/wizard/v1/setup'),'done');
  assert.deepEqual(r.opened,[]);assert.deepEqual(r.log,['boot:true:done:false']);
  const bad=await boot({}, {}, '');assert.deepEqual(bad.opened,['ai']);assert.deepEqual(bad.log,['boot:false::false']);
});
test('Settings browser keeps original paths, real boot oracle and re-resolving trusted input',()=>{
  for(const text of ["ctx.addInitScript(seedOwner)","window.__welcomeLog?.includes('boot:true:done:false')","assert.equal(welcome.active,false)","assert.equal(welcome.overlay,false)","phone?await el.tap():await el.click()","['nebula','obsidian-light']",'data-skinfamily','data-skinpick','nearest Back returns to categories','outside unwinds nearest page then dismisses','#1552 Settings centred over Home','missing route visible and fail-closed','read-only retry recovers verified mode','existing native check action preserved','Ask me action/readback','Automatic action/readback','original Install action intercepted'])assert(harness.includes(text),text);
  assert(!harness.includes('scrollIntoViewIfNeeded'));assert(!/wosWelcome[^\n]*remove\(/.test(harness));assert(!harness.includes('force:true'));assert(!harness.includes('force: true'));
  assert.equal(fixture.ownerRead('/wizard/v1/runs'),null);
});
