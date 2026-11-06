import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync(process.env.TITLEBAR_SOURCE || new URL('../web/layouts/ai-apps/desktop.js', import.meta.url), 'utf8');
// Execute the production header projection unchanged; no Messenger data or app replica logic.
const block = source.slice(source.indexOf('  let toolsMo ='), source.indexOf('  const NOTE ='));
function fixture() {
  const observers = [], queued = [], listeners = {};
  const button = (id, owner) => ({tagName:'BUTTON', dataset:{tool:id}, disabled:false,
    cloneNode(){ return button(id, owner); }, click(){ owner.calls.push(id); }});
  const host = id => ({id, calls:[], src:null,
    querySelector(){ return this.src; },
    tools(ids=['settings']) { this.src = {children:ids.map(id=>button(id,this)), contains(n){return n===this || this.children.includes(n);}, querySelector(s){return this.children.find(n=>s.includes('"'+n.dataset.tool+'"')) || null;}}; return this.src; }});
  const a = host('messenger-fixture'), b = host('second-fixture');
  const mirror = {children:[], hidden:true, replaceChildren(...children){ this.children=children; }};
  class Observer {
    constructor(fn){this.fn=fn; observers.push(this);}
    observe(target, options){this.target=target; this.options=options; this.active=true;}
    disconnect(){this.active=false;}
  }
  const context = vm.createContext({pane:{el:a}, pTools:mirror, MutationObserver:Observer,
    api:{frame:fn=>queued.push(fn), listen:(el,event,fn)=>{listeners[event]=fn;}}, Event:class{}});
  vm.runInContext(block+'\nglobalThis.paint = paintTools; globalThis.switchPane = el => {pane = el ? {el} : null; paintTools();};', context);
  const mutate = (h,target=h) => {for(const o of observers) if(o.active && (o.target===h || o.target===target || o.target.contains?.(target))) o.fn([{target}]);};
  const drain = () => {let n=0; while(queued.length){assert(++n<10,'no observer feedback loop');queued.shift()();}};
  const click = () => listeners.click({target:{closest:()=>mirror.children[0]}});
  return {a,b,mirror,observers,queued,paint:context.paint,switchPane:context.switchPane,mutate,drain,click};
}
test('cold header observes tools registered after held app initialization, without reopening',()=>{
  const f=fixture(); f.paint(); assert(f.mirror.hidden);
  f.a.tools(['qr','search','settings']); f.mutate(f.a); f.drain();
  assert.deepEqual(f.mirror.children.map(n=>n.dataset.tool),['qr','search','settings']); assert(!f.mirror.hidden);
  f.click(); assert.deepEqual(f.a.calls,['qr']);
});
test('header follows source removal, replacement and repeated rerenders; mirror cannot loop',()=>{
  const f=fixture(); f.a.tools(); f.paint();
  for(let i=0;i<4;i++) {f.a.src=null; f.mutate(f.a); f.drain(); assert(f.mirror.hidden);
    const s=f.a.tools(['settings']); f.mutate(f.a); f.drain(); assert(!f.mirror.hidden);
    f.paint(); f.mutate(f.a,f.mirror); assert.equal(f.queued.length,0);
    f.mutate(f.a,s); f.drain(); f.click();}
  assert.deepEqual(f.a.calls,Array(4).fill('settings'));
});
test('focus switch and minimize/reopen retain exact app ownership, once per tap',()=>{
  const f=fixture(); f.a.tools(); f.b.tools(['search']); f.paint(); f.click();
  f.switchPane(f.b); f.click(); f.a.tools(['qr']); f.mutate(f.a); assert.equal(f.queued.length,0);
  f.switchPane(null); assert(f.mirror.hidden); assert(!f.observers.some(o=>o.active));
  f.switchPane(f.a); f.click(); assert.deepEqual(f.a.calls,['settings','qr']); assert.deepEqual(f.b.calls,['search']);
});
