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
function fonts(arm='candidate'){
 const path=require('node:path'),crypto=require('node:crypto'),root=process.env.QA_FONT_TEST_STAGE||__dirname;
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'source-manifest.json')));
 const c=context(411,{ARM:arm,__dirname:root,manifest,fs,path,sha:b=>crypto.createHash('sha256').update(b).digest('hex')});
 vm.runInContext(pick('function pinnedFont(', 'async function delayed('),c);return c;
}
test('all four actual old/candidate release fonts match member and font pins',()=>{
 for(const arm of ['old','candidate']){const c=fonts(arm);for(const file of Object.keys(c.manifest.fonts)){
  const row=c.pinnedFont('https://localhost:1234/wisdom/wisdom-art/f/'+file);assert.equal(row.sha256,c.manifest.fonts[file]);assert(row.body.length>0);assert.equal(row.body.subarray(0,4).toString(),'wOF2');
 }}
});
test('reject foreign origin, names, traversal, encoded paths, query and credentials',()=>{
 const c=fonts(),base='https://localhost:1234/wisdom/wisdom-art/f/';
 for(const url of ['https://evil.test/wisdom/wisdom-art/f/newsreader.woff2','https://localhost:1235/wisdom/wisdom-art/f/newsreader.woff2',base+'other.woff2',base+'../f/newsreader.woff2',base+'%2e%2e/f/newsreader.woff2',base+'%6eewsreader.woff2',base+'newsreader.woff2?q=1',base+'newsreader.woff2#x','https://user@localhost:1234/wisdom/wisdom-art/f/newsreader.woff2','https://localhost:1234/other/newsreader.woff2'])assert.throws(()=>c.pinnedFont(url));
 c.ARM='../old';assert.throws(()=>c.pinnedFont(base+'newsreader.woff2'),/arm allowlist/);
});
test('reject absent hashes, wrong source identity, changed bytes and symlink escapes',()=>{
 const url='https://localhost:1234/wisdom/wisdom-art/f/newsreader.woff2',key='candidate/static/wisdom-art/f/newsreader.woff2';
 for(const mutate of [c=>delete c.manifest.fonts['newsreader.woff2'],c=>delete c.manifest.members[key],c=>c.manifest.members[key].source_commit='wrong',c=>c.manifest.members[key].source_path='../newsreader.woff2',c=>c.manifest.members[key].sha256='0'.repeat(64),c=>c.fs={...fs,readFileSync:()=>Buffer.from('changed')},c=>c.fs={...fs,realpathSync:()=>'/escape'}]){const c=fonts();mutate(c);assert.throws(()=>c.pinnedFont(url));}
});
test('real release bytes wait for font gate and fulfil without any Node fetch',async()=>{
 const c=fonts(),deliveries=[],errors=[];let release,payload;
 const gate=new Promise(r=>release=r),route={request:()=>({url:()=> 'https://localhost:1234/wisdom/wisdom-art/f/newsreader.woff2'}),fetch(){throw Error('Node TLS fetch forbidden')},async fulfill(p){payload=p},async abort(){throw Error('unexpected abort')}};
 const job=c.deliverFont(route,gate,deliveries,errors);await Promise.resolve();assert.equal(payload,undefined);assert.equal(deliveries[0].released,false);release();await job;
 assert.equal(payload.status,200);assert.equal(payload.contentType,'font/woff2');assert.equal(c.sha(payload.body),c.manifest.fonts['newsreader.woff2']);assert.equal(deliveries[0].released,true);assert.equal(errors.length,0);assert(!source.includes('route.fetch('));
});
test('interceptor validation and async fulfil/abort failures become saved diagnostics',async()=>{
 for(const badURL of [false,true]){const c=fonts(),errors=[];let saves=0;c.save=()=>saves++;
  await c.deliverFont({request:()=>({url:()=> 'https://localhost:1234/wisdom/wisdom-art/f/'+(badURL?'other':'newsreader')+'.woff2'}),async fulfill(){throw Error('fulfil failed')},async abort(){throw Error('abort failed')}},Promise.resolve(),[],errors);
  assert.equal(errors.length,2);assert.equal(saves,2);assert.match(errors[0].message,badURL?/allowlist/:/fulfil failed/);assert.equal(errors[1].phase,'abort');
 }
 assert(source.includes("report.cases[name]={status:'failed',routeErrors}"));assert(source.includes("assert.equal(routeErrors.length,0"));
});
test('specific old negative and candidate identity/durability gates remain unweakened',()=>{for(const token of ["s.get('total')!=s.get('measuredTotal')","'indeterminate-not-reproduced'","expectedCaseCount=20","new.get('status')!='pass'"])assert(runner.includes(token));for(const token of ['assert.deepEqual(after.outbox,before.outbox','assert.deepEqual(final.firstVisible,ref.firstVisible','assert.equal(final.localRaw,ref.localRaw','assert.equal(s.total,s.measuredTotal'])assert(source.includes(token))});
