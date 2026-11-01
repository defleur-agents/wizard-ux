'use strict';
// Browser-free guards of the three observed setup defects. No PW import/launch.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const source=fs.readFileSync(__dirname+'/font-proof.cjs','utf8');
const runner=fs.readFileSync(__dirname+(fs.existsSync(__dirname+'/run-font-proof.py')?'/run-font-proof.py':'/runner.py'),'utf8');
const pick=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function context(width,extra={}){return vm.createContext({assert,WIDTH:width,HEIGHT:789,BASE:'https://localhost:1234/wisdom/',URL,process:{env:{QA_CHROME:'/fixture/chrome'}},manifest:{fixture_tls:{leaf_spki_sha256:'A'.repeat(43)+'='}},report:{},save(){},...extra})}
function inputs(width,{trusted=true,blocked=false}={}){
 const c=context(width);let page=5,taps=0,clicks=0;const window={};
 const target={tagName:'DIV',className:'wb-flow',closest(){return blocked}};
 const element={getBoundingClientRect(){return {x:0,y:0,width:411,height:700}},contains(t){return t===target},addEventListener(){}};
 c.window=window;c.document={elementFromPoint(){return target}};
 const run=(fn,...args)=>vm.runInContext('('+fn.toString()+')',c)(...args);
 const stage={async waitFor(){},async evaluate(fn,arg){return run(fn,element,arg)},async tap({position}){taps++;page+=position.x>200?1:-1;window.__qaPagingEvents=[{type:'pointerdown',isTrusted:trusted,pointerType:'touch'}]}};
 const count={async textContent(){return page+' / 20'},async evaluate(fn){return run(fn,{textContent:page+' / 20'})}};
 const p={locator(selector){return selector==='.wb-stage'?stage:count},getByRole(role,{name}){assert(width>=600,'hidden mobile arrow must never be used');return {async click(){clicks++;page+=name==='Next page'?1:-1}}},async evaluate(fn){return run(fn)},async waitForFunction(){},async waitForTimeout(){}};
 vm.runInContext(pick('async function pageInput(', 'async function stableDurable('),c);
 return {c,p,stats:()=>({page,taps,clicks})};
}
test('mobile warm, pending-turn and bidirectional seek reuse trusted R8 edge taps',async()=>{const {c,p,stats}=inputs(411);await c.turn(p);await c.seek(p,4);assert.deepEqual(stats(),{page:4,taps:3,clicks:0});assert.equal(c.report.pagingInputs.length,3)});
test('desktop retains accessible arrows',async()=>{const {c,p,stats}=inputs(1280);await c.turn(p);await c.seek(p,4);assert.deepEqual(stats(),{page:4,taps:0,clicks:3})});
test('mobile rejects untrusted events and control-covered hit targets',async()=>{let o=inputs(411,{trusted:false});await assert.rejects(()=>o.c.turn(o.p),/trusted touch/);o=inputs(411,{blocked:true});await assert.rejects(()=>o.c.turn(o.p),/No visible non-control/)});
test('screenshot-only wait disabled at launch; explicit real font checks remain',()=>{assert(runner.includes("'PW_TEST_SCREENSHOT_NO_FONTS_READY':'1'"));assert(runner.includes('if (!process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY)'));assert(source.includes('await p.evaluate(()=>document.fonts.ready)'));assert(source.includes("document.fonts.status==='loaded'&&document.fonts.check"));assert(source.includes("s.fonts.checkText&&s.fonts.status==='loaded'"));assert(source.indexOf("fs.writeFileSync(path.join(OUT,label+'.json')")<source.indexOf('await p.screenshot'));assert(!source.includes('PW_TEST_SCREENSHOT_NO_FONTS_READY'))});
test('same narrow verified fixture-leaf trust on initial and post-death persistent launches',()=>{const c=context(411);vm.runInContext(pick('function launchOptions(', 'async function open('),c);const opts=c.launchOptions(true);assert.equal(opts.ignoreHTTPSErrors,false);assert.equal(opts.serviceWorkers,'allow');assert.equal(opts.args.filter(x=>x.startsWith('--ignore-certificate')).length,1);assert.equal(opts.args.at(-1),'--ignore-certificate-errors-spki-list='+'A'.repeat(43)+'=');assert(source.includes('launchPersistentContext(profile,launchOptions(sw))'));assert(source.includes('launchPersistentContext(profile,launchOptions(true))'));assert(!source.includes('ignoreHTTPSErrors:true'));assert(runner.includes("M['fixture_tls']['leaf_spki_sha256']"));assert(runner.includes("['openssl','x509'"));c.manifest.fixture_tls.leaf_spki_sha256='bad';assert.throws(()=>c.launchOptions(true),/SPKI/)});
test('specific old negative and candidate identity/durability gates remain unweakened',()=>{for(const token of ["s.get('total')!=s.get('measuredTotal')","'indeterminate-not-reproduced'","expectedCaseCount=20","new.get('status')!='pass'"])assert(runner.includes(token));for(const token of ['assert.deepEqual(after.outbox,before.outbox','assert.deepEqual(final.firstVisible,ref.firstVisible','assert.equal(final.localRaw,ref.localRaw','assert.equal(s.total,s.measuredTotal'])assert(source.includes(token))});
