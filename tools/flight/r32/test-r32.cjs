'use strict';
// Source/API contract tests only. This file must NEVER launch a browser/fixture.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const R=__dirname,source=fs.readFileSync(path.join(R,'source/wisdom/static/wisdom.js'),'utf8'),driver=fs.readFileSync(path.join(R,'app-session-r32.cjs'),'utf8'),fixture=fs.readFileSync(path.join(R,'fixture.py'),'utf8'),probe=require('./layout-trace.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(sha(source),'54c9812d1d73dfe8e0b500034fd84040d10ec577a433afd4bb700ee104dff2b1');
for(const token of ['data-wisdom-size="-1"','data-wisdom-size="1"','aria-label="Smaller text"','aria-label="Larger text"','data-size="${size}"','size+Number(b.dataset.wisdomSize)','layout(true)'])assert(source.includes(token),token);
assert(fixture.includes("'Synthetic flight collection'")&&fixture.includes('Quiet attention begins with one thing.'));
assert(fixture.includes("server.DATA=Path(tmp.name)"));
assert(driver.includes("CASE==='traced'")&&driver.includes('layout.attach(await ctx.newCDPSession(p)'));
assert(driver.indexOf('layout.attach(')<driver.indexOf('await p.goto(BASE'));
assert(driver.includes('await layout.sizeSequence({frame:owned.f,checkpoint:async label=>'));
assert(driver.includes('requestAnimationFrame(()=>resolve())'));
assert(driver.includes("for(let i=0;i<3;i++)"));
assert(driver.includes("SIGKILL verified owned Chromium process group"));
assert(driver.includes("M.productJSsha256"));
assert(!driver.includes('await selectQuiet')&&!driver.includes('await backToCollection')&&!driver.includes('await snapshotProfile'));
assert(!driver.includes("Debugger.enable"),'baseline has no direct debugger calls');
assert(!driver.includes('addScriptTag')&&!driver.includes('addStyleTag'));
const pw=require(process.env.PLAYWRIGHT_DIR);assert.equal(typeof pw.chromium.launchPersistentContext,'function');
class Fake extends EventEmitter{constructor(mode){super();this.mode=mode;this.commands=[];}async send(method,args){this.commands.push(method);if(method==='Debugger.enable'){this.emit('Debugger.scriptParsed',{url:'https://localhost/wisdom/wisdom.js',scriptId:'qa-source-contract'});return {}}if(method==='Debugger.getScriptSource')return {scriptSource:this.mode==='wrong-source'?source+'\n':source};if(method==='Debugger.setBreakpoint')return {actualLocation:{...args.location,lineNumber:args.location.lineNumber+(this.mode==='shift'?1:0)},breakpointId:'qa'};return {}}}
(async()=>{const f=new Fake();await assert.rejects(probe.attach(f,source,'0'.repeat(64)),/caller source hash/);assert.equal(f.commands.length,0);for(const mode of ['wrong-source','shift']){const c=new Fake(mode),p=await probe.attach(c,source,sha(source));await assert.rejects(p.ready());}console.log(JSON.stringify({status:'PASS-source-API-contract-only',browserStarted:false,productChanged:false,sourceHash:sha(source),tests:['actual source controls','synthetic fixture','actual driver entry and trace-only branch','three frame checkpoints','owned kill boundary','Playwright API availability','source mismatch rejected before CDP','executed script mismatch rejected','shifted breakpoint rejected']}));})().catch(e=>{console.error(e);process.exitCode=1});
