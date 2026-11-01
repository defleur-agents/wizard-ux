import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
function moduleFixture(saved) {
  const storage=new Map(saved ? [['wos.orbSwitcher.v1',JSON.stringify(saved)]]:[]), listeners=new Map();
  const window={addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:(k,fn)=>{if(listeners.get(k)===fn)listeners.delete(k);},dispatchEvent(){}};
  const adapter={cancelGesture(){},hover(){},voice:{}};
  const context={window,adapter,document:{querySelectorAll:()=>[],body:{classList:{remove(){}}}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},CustomEvent:class{},setTimeout,clearTimeout};
  const create=vm.runInNewContext(read('web/core/orb-switcher.js').replace('export default function createOrbSwitcher','function createOrbSwitcher')+'\n;createOrbSwitcher;',context);
  return {create:()=>create(adapter),window,listeners};
}
test('lazy radial module initializes real defaults and tears down its only global listener',()=>{
  const f=moduleFixture(),o=f.create();
  assert.equal(f.window.WosOrbSwitcher,o);assert.equal(o.active(),true);assert.equal(o.get().quickTakes,false);
  assert.equal(o.get().pins.length,0);assert.equal(o.get().holdMs,300);assert.equal(f.listeners.size,1);
  o.dispose();o.dispose();assert.equal(o.active(),false);assert.equal(f.window.WosOrbSwitcher,undefined);assert.equal(f.listeners.size,0);
  const again=f.create();assert.equal(again.active(),true);again.dispose();assert.equal(f.listeners.size,0);
});
test('radial saved configuration survives reload and preserves compact geometry',()=>{
  const f=moduleFixture({pins:['home','calendar'],voiceSlot:'far',holdMs:450,quickTakes:true}),o=f.create();
  assert.equal(o.get().pins.join(','),'home,calendar');assert.equal(o.get().voiceSlot,'far');assert.equal(o.get().holdMs,450);assert.equal(o.get().quickTakes,true);
  const slots=o._assign([{id:'voice',voice:true},{id:'calendar',desk:1},{id:'customize',customize:true}],'near');
  assert.equal(slots.find(s=>s.it?.voice).ring,0);assert.equal(slots.find(s=>s.it?.customize).ring,1);
  assert.ok(slots.every(s=>s.r1<=138));o.dispose();
});
test('entrypoint never loads radial module or CSS; only trusted enabled tweak requests its code',()=>{
  assert.doesNotMatch(read('web/index.html'),/orb-switcher|orb-radial|desk-fan|preview-seed-orb/);
  assert.doesNotMatch(read('web/desktop.html'),/orb-switcher|orb-radial|desk-fan|preview-seed-orb/);
  assert.match(read('web/tweaks/wizard/orb-radial/tweak.js'),/api\.orb\.switcher\(\)/);
  assert.match(read('web/app.js'),/WosOrbSwitcher\?\.active\(\) && !G\.corner/);
});
