'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const probe=require('./layout-trace.cjs');
const source=fs.readFileSync(process.argv[2],'utf8');
const hash=crypto.createHash('sha256').update(source).digest('hex');
class SourceOnlyCDP extends EventEmitter {
  conditions=[]; removed=[];
  async send(method,args){
    if(method==='Debugger.enable'){this.emit('Debugger.scriptParsed',{url:'https://localhost/wisdom/static/wisdom.js?v=current',scriptId:'synthetic-transport'});return {}}
    if(method==='Debugger.getScriptSource')return {scriptSource:source};
    if(method==='Debugger.setBreakpoint'){new Function('return '+args.condition);this.conditions.push(args);return {actualLocation:args.location,breakpointId:'test'+this.conditions.length}}
    if(method==='Debugger.removeBreakpoint'){this.removed.push(args.breakpointId);return {}}
    if(method==='Debugger.disable')return {};
    throw Error('unexpected CDP command '+method);
  }
}
(async()=>{
 const cdp=new SourceOnlyCDP(),p=await probe.attach(cdp,source,hash),scripts=await p.ready();
 assert.equal(scripts.length,1);assert.equal(cdp.conditions.length,2);assert.deepEqual(cdp.conditions.map(x=>x.location.lineNumber),[564,578]);
 await p.detach();assert.equal(cdp.removed.length,2);
 let size='1',taps=0,labels=[];
 const frame={locator:sel=>({getAttribute:async()=>size,tap:async()=>{size=String(Number(size)+(sel.includes('="-1"')?-1:1));taps++}})};
 await probe.sizeSequence({frame,checkpoint:async label=>labels.push(label)});
 assert.equal(size,'1');assert.equal(taps,2);assert.deepEqual(labels,['initial-text-before-highlight','larger','original-setting-restored']);
 console.log(JSON.stringify({status:'PASS-source-transport-only',executedSourceSHA:hash,conditionsCompiled:cdp.conditions.length,trustedUITapCountMocked:taps,browserStarted:false,nativeCausalityProven:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
