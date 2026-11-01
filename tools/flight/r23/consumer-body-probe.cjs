'use strict';
const raw=require('./raw-cdp.cjs');raw.installOwnedLaunchObservation();raw.assertPinnedPlaywright(process.env.PLAYWRIGHT_DIR);
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{chromium}=require(process.env.PLAYWRIGHT_DIR);
const origin=new URL(process.env.QA_URL).origin,OUT=process.env.QA_OUT,M=JSON.parse(fs.readFileSync(process.env.QA_SOURCE_MANIFEST));
const hash=b=>createHash('sha256').update(b).digest('hex'),expected={bytes:19,sha256:hash('/* actual source */')};
(async()=>{let ctx,observer;const report={status:'failed',diagnosticOnly:true,releaseAllowed:false,freshIsolationAcceptance:false,review_required:true,results:[]};
 const ledger=path.join(OUT,'consumer-ledger.json');
 try{
  const profile=path.join(OUT,'profile-consumer'),prepared=raw.prepareProfile(profile),launched=await raw.launchOwned({prepared,executablePath:process.env.QA_CHROME,out:path.join(OUT,'original-launch.json')},()=>chromium.launchPersistentContext(prepared.canonical,{headless:true,executablePath:fs.realpathSync(process.env.QA_CHROME),args:['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--disable-background-networking','--ignore-certificate-errors-spki-list='+M.fixture_tls.leaf_spki_sha256]}));
  ctx=launched.context;const p=await ctx.newPage();await p.goto(origin+'/__fixture__/blank');
  const knownOwnedBrowserPID=await raw.ownedBrowserPID(ctx,path.join(OUT,'trusted-browser.json'));
  observer=await raw.connect({profile,prepared,knownOwnedBrowserPID,launchWitness:launched.witness,origin,workers:[{script:'/__consumer__/sw.js'}],contextId:'consumer-canary',generationId:'consumer-canary-generation',out:ledger});
  await p.evaluate(async()=>{const r=await navigator.serviceWorker.register('/__consumer__/sw.js',{scope:'/__consumer__/'});if(!r.active)await new Promise(resolve=>(r.installing||r.waiting).addEventListener('statechange',function(){if(this.state==='activated')resolve()}))});
  await observer.ready();await p.goto(origin+'/__consumer__/');
  // Only synthetic canary consumes these bytes. No inline execution of WRONG.
  for(const mode of ['good','wrong','empty']){
   const actual=await p.evaluate(async mode=>{const r=await fetch('/__consumer__/asset?'+mode);return await r.text()},mode);
   for(let i=0;i<150;i++){await observer.flushPageBodies();const t=JSON.parse(fs.readFileSync(ledger+'.page-body.json'));if(t.rows.some(r=>r.targetType==='page'&&r.url===origin+'/__consumer__/asset?'+mode&&(r.body||r.bodyError)))break;await p.waitForTimeout(20)}
   const v=JSON.parse(fs.readFileSync(ledger+'.page-body.json')),rows=v.rows.filter(r=>r.url===origin+'/__consumer__/asset?'+mode),pages=rows.filter(r=>r.targetType==='page'),inners=rows.filter(r=>r.targetType==='service_worker');
   assert.equal(pages.length,1);assert.equal(inners.length,1);const r=pages[0];
   assert(r.finished&&r.body?.completed&&!r.invalid&&!r.failed&&r.fromServiceWorker===true,'NO_FIX_CAPTURE_PATH: completed PAGE API unsupported/empty/error');
   assert.equal(r.headers['x-qa-write-id'],'consumer-'+mode);assert.equal(r.body.decodedBytes,Buffer.byteLength(actual));assert.equal(r.body.sha256,hash(actual));
   const linked=observer.pageBodyLink(inners[0],expected);
   report.results.push({mode,actualBytes:Buffer.byteLength(actual),body:r.body,linked});
   if(mode==='good')assert(linked.linked,'NO_FIX_CAPTURE_PATH: GOOD bytes or exact join missing');
   else {assert(!linked.linked,'wrong/empty accepted');assert.equal(actual,mode==='empty'?'':'wrong! source bytes')}
  }
  await p.evaluate(()=>{fetch('/__consumer__/asset?neverfinish').then(r=>r.text()).catch(()=>{})});await p.waitForTimeout(700);await observer.flushPageBodies();
  const v=JSON.parse(fs.readFileSync(ledger+'.page-body.json')),never=v.rows.filter(r=>r.url===origin+'/__consumer__/asset?neverfinish');
  assert(never.length>=1&&never.every(r=>!r.finished&&!r.bodyCalls&&!r.body),'NEVERFINISH accepted');report.unfinishedRefused=true;report.goodBodyValid=true;report.status='pass';
 }catch(e){report.error=String(e.stack||e);process.exitCode=1}
 finally{if(observer)await observer.close();if(ctx)await ctx.close();for(const [k,suffix] of [['bodyTrace','.page-body.json'],['unchangedStreamTrace','.stream.json']])if(fs.existsSync(ledger+suffix))report[k]=JSON.parse(fs.readFileSync(ledger+suffix));fs.writeFileSync(path.join(OUT,'consumer-probe.json'),JSON.stringify(report,null,2))}
})();
