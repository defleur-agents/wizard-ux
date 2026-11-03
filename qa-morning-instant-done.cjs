// Actual Morning handlers + actual Chats host, synthetic APIs only. Never proxy owner data.
// Runs on the queued Linux browser worker. QA_BASE_MORNING/QA_BASE_CHATS reproduce the live baseline.
const {chromium}=require('./tools/qa-playwright.cjs');
const {readySessionFixture}=require('./tools/qa-morning-session.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const web=path.resolve(process.env.QA_WEB_DIR||path.join(__dirname,'web'));
const morning=path.resolve(process.env.QA_MORNING_WEB);
const out=path.resolve(process.env.QA_OUT);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://fixture'),app=u.pathname.startsWith('/morning/'),prefix=app?'/morning/':'/wizard-os-home/';
 if(!u.pathname.startsWith(prefix)){res.writeHead(404);return res.end();}
 const rel=decodeURIComponent(u.pathname.slice(prefix.length))||'index.html';if(rel.split('/').includes('..')){res.writeHead(400);return res.end();}
 if(!app&&['data.js','summaries.js'].includes(rel)){res.setHeader('Content-Type','text/javascript');return res.end(rel==='data.js'?'window.WIZ_DATA={threads:[],projects:{}};':'window.WIZ_SUMMARIES={};');}
 const f=app&&rel==='app.js'&&process.env.QA_BASE_MORNING?process.env.QA_BASE_MORNING:!app&&rel==='core/chats.js'&&process.env.QA_BASE_CHATS?process.env.QA_BASE_CHATS:path.join(app?morning:web,rel);
 if(!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);
});
const steps=['workout','meditate','mindfeed','read'];
const initial=()=>({day:'2030-01-02',done:0,total:4,next:'workout',next_label:'Workout',hidden:false,steps:Object.fromEntries(steps.map(s=>[s,{done:false}])),reading:{ok:true,in_progress:[],new:[{href:'/wisdom/',title:'Synthetic chapter',collection:'Fixture',kind:'new',why:'Synthetic QA'}]},meditations:[{id:'fixture',href:'/meditation/',title:'Synthetic sit'}],mindfeed:{ok:true,done:false,rated:0,total:3}});
const copy=x=>JSON.parse(JSON.stringify(x));
const recount=m=>{m.done=steps.filter(s=>m.steps[s].done).length;m.next=steps.find(s=>!m.steps[s].done)||null;m.next_label=({workout:'Workout',meditate:'Meditate',mindfeed:'MindFeed',read:'Read'})[m.next]||null;};
let passed=0,failed=0;const measurements=[],checks=[],profiles=[];
const check=(c,name,detail)=>{checks.push({pass:!!c,name,detail});c?passed++:failed++;console.log(c?'PASS':'FAIL',name,detail||'');};
async function scenario(browser,base,desktop,skin,extra){
 const profile={desktop,skin,setupPassed:false,regressionReproduced:false,phase:'setup'};profiles.push(profile);
 const label=`${desktop?'desktop':'phone'}-${skin}`,ctx=await browser.newContext({viewport:desktop?{width:1600,height:1000}:{width:412,height:892},isMobile:!desktop,hasTouch:!desktop,serviceWorkers:'block'});
 const sessions=readySessionFixture(); // one stable raw page per context, including refreshes
 let model=initial(),requests=[],gates=[],statusReads=0,todayReads=0,sessionReads=0;
 const ctl={statusFail:false}; // synthetic, test-owned: makes the canonical status read unavailable
 await ctx.route('**/*',async r=>{
  const q=r.request(),u=new URL(q.url()),json=(d,status=200)=>r.fulfill({status,json:d}).catch(()=>{});
  if(u.origin!==new URL(base).origin)return r.abort('blockedbyclient');
  if(u.pathname==='/morning/api/step'||u.pathname==='/morning/api/hide'){
   const body=q.postDataJSON(),kind=u.pathname.endsWith('/hide')?'hide':'step';requests.push({...body,kind});
   // Fixture-owned completion is independent of the iframe's RAF/paint lifecycle after Back.
   let complete;const completed=new Promise(resolve=>{complete=resolve;});
   const code=await new Promise(resolve=>gates.push({resolve,body,kind,completed}));
   // Numeric codes: 200 commits; every other number is an uncommitted refusal/failure.
   // 'commit-500' / 'commit-abort' commit on the synthetic server, then lose the response.
   const commits=code===200||code==='commit-500'||code==='commit-abort';
   if(commits){if(kind==='hide')model.hidden=body.hidden;else model.steps[body.step]={done:body.done,source:'you',at:'2030-01-02T10:00:00Z'};recount(model);}
   try{
    if(code==='commit-abort')await r.abort('connectionreset').catch(()=>{});
    else{const status=code==='commit-500'?500:code;await json(status===200?copy(model):{error:'fixture failure'},status);}
   }finally{complete({code,commits,kind,body:copy(body),canonical:copy(model)});}
   return;
  }
  if(u.pathname==='/morning/api/status'){statusReads++;return ctl.statusFail?json({error:'status unavailable'},503):json(copy(model));}
  if(u.pathname==='/morning/api/today'){todayReads++;return json(copy(model));}
  if(u.pathname.startsWith('/morning/api/'))return json({},503);
  if(['/mindfeed/','/wisdom/','/meditation/'].includes(u.pathname))return r.fulfill({contentType:'text/html',body:'<!doctype html><p>Synthetic app fixture</p>'});
  if(u.pathname==='/wizard/v1/bootstrap')return json({bootstrap:1,settings:{agent:{name:'Fixture Agent'},clock:{timezone:'UTC'}},capabilities:{},endpoints:{apps:'/wizard/v1/apps',sessions:'/wizard/hermes/api/sessions'}});
  if(u.pathname==='/wizard/v1/setup')return json({first_run:false});
  if(u.pathname==='/wizard/v1/apps')return json({apps:[{id:'morning',name:'Morning',url:'/morning/',source:'apps.json',type:'view'}]});
  if(u.pathname==='/wizard/hermes/api/model/options')return json({provider:'openai-codex',model:'fixture',providers:[{slug:'openai-codex',authenticated:true,models:[]}]});
  if(u.pathname==='/wizard/hermes/api/settings')return json({settings:{agent:{name:'Fixture Agent'},clock:{timezone:'UTC'}}});
  if(u.pathname==='/wizard/hermes/api/sessions'){sessionReads++;return json(sessions.list);}
  if(u.pathname===`/wizard/hermes/api/sessions/${sessions.id}`)return json(sessions.detail);
  if(u.pathname===`/wizard/hermes/api/sessions/${sessions.id}/messages`)return json(sessions.messages);
  if(u.pathname==='/wizard/v1/agents')return json({agents:[{id:'hermes',label:'Wizard',is_default:true,harness:'hermes',status:'running',privacy:'standard'}]});
  if(u.pathname==='/wizard/thread-seen')return json({state:{initializedAt:1,threads:{}}});
  if(u.pathname==='/wizard/v1/ui-preferences')return json({spaces:[],pinnedChats:[],readyOrder:'newest',migrations:{'launcher.v1':true}});
  if(u.pathname.startsWith('/wizard/'))return json({});
  if(u.pathname.startsWith('/wizard-os-home/')||u.pathname.startsWith('/morning/'))return r.continue();
  return json({});
 });
 await ctx.addInitScript(({desktop,skin})=>{
  localStorage.setItem('wos.coached','true');localStorage.setItem('wos.welcome.v1','done');localStorage.setItem('wos.voiceTipSeen','true');localStorage.setItem('wos.shell',desktop?'desktop':'phone');localStorage.setItem('wos.skin',skin);
  const wins={wmain:{id:'wmain',app:'chats',thread:null}},desk={id:'dmain',wins:['wmain'],focus:'wmain'};
  if(desktop){localStorage.setItem('wux.desk.wins',JSON.stringify(wins));localStorage.setItem('wux.desk.ws',JSON.stringify([desk]));localStorage.setItem('wux.desk.cur','0');localStorage.setItem('wux.desk.homeOpen','false');}
  else{localStorage.setItem('wos.wins4',JSON.stringify(wins));localStorage.setItem('wos.strip',JSON.stringify([{id:'home',home:true,wins:[],focus:null},desk]));localStorage.setItem('wos.idx4','1');localStorage.setItem('wos.idxDesk',JSON.stringify('dmain'));}
 },{desktop,skin});
 const p=await ctx.newPage();p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+(desktop?'desktop.html':''),{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=> (window.__wux||window.__wos)?.live?.ok&&window.WizCanOpen?.('morning'));
  await p.waitForTimeout(150);
  // Both shells restore the same ordinary main Chats list; __new__ is a composer/draft,
  // not a substitute for real session data, and would mask the empty-hit shortcircuit.
  await p.evaluate(desktop=>{const a=window.__wux||window.__wos,w=a.wins.wmain;if(!w||w.thread)throw Error('fixture must restore main Chats list');window.__qaChat=w;a.focusWin(w.id);if(!desktop)a.chats.renderChats(w);},desktop);
  await p.locator('.ch-morning-w:visible').first().waitFor();
  await p.waitForFunction(()=>(window.__welcomeLog||[]).some(s=>s.startsWith('boot:')));
  await p.waitForFunction(()=>![...document.querySelectorAll('h2')].some(n=>n.getClientRects().length&&/Name your Wizard|Connect your AI/.test(n.textContent)));
  profile.setupEvidence=await p.evaluate(id=>{const a=window.__wux||window.__wos,w=a.wins.wmain,c=a.chats.ch(w.id),lc=a.chats.ch(w.id+'::list'),s=a.live.session(id),root=document.querySelector(`[data-win="${w.id}"]`);return {id:s?.id,status:s?.status,agent:s?.agent,ready:a.live.workGroups().ready.map(s=>s.id),query:c.q,listQuery:lc.q,filter:!!c.filter||!!lc.filter,focus:a.chats.focusOf(w),thread:w.thread,readyOpen:!!root?.querySelector('[data-sec="ready"].open'),row:!!root?.querySelector(`[data-sec="ready"] [data-chopen="${id}"]`),cards:root?.querySelectorAll('.ch-morning-w').length};},sessions.id);
  const se=profile.setupEvidence;se.sessionReads=sessionReads;
  if(!(sessionReads>0&&se.id===sessions.id&&se.status==='completed'&&!se.agent&&se.ready.includes(sessions.id)&&!se.query&&!se.listQuery&&!se.filter&&!se.focus&&se.thread===null&&se.readyOpen&&se.row&&se.cards>0))throw Error('synthetic main Ready list did not mount normally: '+JSON.stringify(se));
  profile.setupPassed=true;profile.phase='mounted';
  check(await p.evaluate(d=>document.documentElement.dataset.shell===(d?'desktop':'phone'),desktop),`${label} actual shell kind`);
  await p.screenshot({path:path.join(out,label+'-mount-canary.png')});
  if(process.env.QA_CANARY==='1')return;
  // Count each ACTUAL shell failure toast paint (one innerHTML write per toast call), not
  // distinct strings: a duplicated identical notice must count twice.
  await p.evaluate(()=>{window.__morningNotices=[];const e=document.querySelector('#toast');new MutationObserver(recs=>{if(!recs.some(r=>r.addedNodes.length))return;const t=e.textContent;if(/wasn’t saved|outcome unknown|new morning started/.test(t))window.__morningNotices.push(t.trim());}).observe(e,{subtree:true,childList:true,characterData:true});});
  await p.evaluate(()=>WizOpenApp('morning'));
  await p.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentWindow?.__morning?.state()));
  const frame=()=>p.frames().find(f=>/\/morning\//.test(f.url()));
  check(!!frame(),`${label} actual installed Morning iframe`);
  await p.screenshot({path:path.join(out,label+'-app-before.png')});
  if(extra){profile.phase='extra';await extra({p,ctx,frame,requests,gates,model,ctl,desktop,skin,label,check,out,base,statusReads:()=>statusReads,todayReads:()=>todayReads});check(errors.length===0,`${label} no browser errors`,errors.join('; '));return;}
  profile.phase='progress';
  for(const [index,step] of steps.entries()){
   const before=requests.length;
   await p.evaluate(step=>{
    const f=[...document.querySelectorAll('iframe')].find(f=>f.contentWindow?.__morning),d=f.contentDocument;
    // Real handlers: the MindFeed sheet's Mark done, and each actual Done button.
    if(step==='mindfeed'){d.querySelector('#mfOpen').click();}
    else {const el=d.querySelector(`[data-step="${step}"]`);if(!el.classList.contains('is-current'))el.querySelector('[data-toggle]').click();}
   },step);
   const result=await p.evaluate(async({step,desktop})=>{
    const f=[...document.querySelectorAll('iframe')].find(f=>f.contentWindow?.__morning),d=f.contentDocument,a=window.__wux||window.__wos;
    const t=performance.now();(step==='mindfeed'?d.querySelector('#sheetDone'):d.querySelector(`[data-step="${step}"] [data-done]`)).click();
    const own=f.contentWindow.__morning.state().steps[step].done;
    // Navigate back to the retained Chats desk, not a test-only card. Keep the request alive.
    const w=Object.values(a.wins).find(w=>w.app==='chats');if(w){if(window.__wos){const i=a.desks.findIndex(d=>d.wins.includes(w.id));if(i>=0)a.goDesk(i);}a.focusWin(w.id);}
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const card=[...document.querySelectorAll('.ch-morning-w')].find(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;});
    return {ms:performance.now()-t,own,visible:!!card,text:card?.innerText||'',allGone:!document.querySelector('.ch-morning-w')};
   },{step,desktop});
   measurements.push({label,step,...result});
   const instant=result.ms<100&&result.own&&(index===3?result.allGone:result.visible&&result.text.includes(`${index+1} of 4`));
   check(instant,`${label}/${step} visible progress in two frames/<100ms`,JSON.stringify(result));
   if(!instant&&process.env.QA_BASE_MORNING){profile.regressionReproduced=!result.own||(index===3?!result.allGone:!result.text.includes(`${index+1} of 4`));profile.phase=profile.regressionReproduced?'intended-regression':'timing-only-failure';return;}
   await p.waitForFunction(()=>true);await p.waitForTimeout(50);
   check(requests.length===before+1,`${label}/${step} one pending write`);
   // A second invocation races an opposite write; the domain must keep the first single flight.
   await frame().evaluate(step=>{ __morning.setDone(step,false); },step);
   check(requests.length===before+1,`${label}/${step} no duplicate write`);
   await p.evaluate(model=>postMessage({type:'wizard:morning',status:model},location.origin),copy(model));
   await frame().evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   await p.waitForTimeout(5100);
   check(gates.length===1,`${label}/${step} backend unresolved beyond 5s`);
   await p.screenshot({path:path.join(out,`${label}-${step}-pending.png`)});
   const held=await p.evaluate(()=>[...document.querySelectorAll('.ch-morning-w')].map(n=>n.innerText).join(''));
   check(index===3?!held:held.includes(`${index+1} of 4`),`${label}/${step} stale read/repaint preserves edit`);
   gates.shift().resolve(200);await frame().waitForFunction(step=>!document.querySelector(`[data-step="${step}"] [data-done]`)?.disabled,step);
   const canonical=await frame().evaluate(()=>fetch('api/today').then(r=>r.json()));check(canonical.steps[step].done,`${label}/${step} canonical GET confirms success`);
  }
  // Undo/read failure after navigating to Chats. Repaired contract: the pending Undo paints at once;
  // an ambiguous 500 with a canonical read that does not show the Undo is explicit UNCERTAINTY
  // (never "definitely not saved"); the shell owns ONE terminal notice and a persistent actionable
  // card that survives an all-done canonical state, with no automatic POST retry.
  const notices=()=>p.evaluate(()=>window.__morningNotices.slice());
  const cardTexts=()=>p.evaluate(()=>[...document.querySelectorAll('.ch-morning-w')].map(n=>n.textContent));
  const cardText=()=>p.evaluate(()=>[...document.querySelectorAll('.ch-morning-w')].map(n=>n.textContent).join('|'));
  const failBefore={posts:requests.length,reads:statusReads,notices:(await notices()).length};
  await frame().evaluate(()=>{window.__pending=__morning.setDone('read',false);});await p.waitForTimeout(50);
  check(await p.locator('.ch-morning-w').count()>0,`${label} undo immediately restores card`);
  gates.shift().resolve(500);const undoResult=await frame().evaluate(()=>window.__pending);
  check(undoResult===false,`${label} failed Undo resolves false to the actual handler`);
  const cards=await p.locator('.ch-morning-w').count(),ctext=await cardText(),each=await cardTexts();
  check(cards>=1&&each.every(t=>/Read/.test(t)&&/Save outcome unknown/.test(t)&&!/Done for today/.test(t)&&!/wasn’t saved/.test(t)),`${label} persistent uncertainty card survives all-done canonical`,ctext);
  check(await p.locator('.ch-morning-w [data-chmorningrecover]').count()===cards&&await p.locator('.ch-morning-w [data-chmorning]').count()===cards,`${label} every failure card keeps Check status and Open Morning controls`);
  const noticed=(await notices()).slice(failBefore.notices);
  check(noticed.length===1&&/Save outcome unknown/.test(noticed[0]),`${label} exactly one shell terminal notice, uncertain wording`,JSON.stringify(noticed));
  check(await p.locator('#toast').innerText().then(t=>t.includes('Save outcome unknown'))&&!(await p.locator('#toast').innerText()).includes('Morning wasn’t saved'),`${label} visible notice says outcome unknown, not definitely unsaved`);
  check(statusReads>failBefore.reads,`${label} failed write is followed by a canonical status read`);
  check(await frame().evaluate(()=>!document.querySelector('#err').hidden&&/Save outcome unknown/.test(document.querySelector('#err').textContent)),`${label} local frame error is also honest uncertainty`);
  await p.screenshot({path:path.join(out,label+'-failure.png')});
  // Barrier on the transient toast leaving, not a fixed sleep: the card is the persistent surface.
  await p.waitForFunction(()=>{const t=document.querySelector('#toast');return !t.classList.contains('show')&&!t.classList.contains('on');});
  check(await p.locator('.ch-morning-w [data-chmorningrecover]').count()>=1&&/Save outcome unknown/.test(await cardText()),`${label} error card persists after the toast is gone`);
  check(requests.length===failBefore.posts+1&&gates.length===0,`${label} no automatic POST retry`);
  await p.screenshot({path:path.join(out,label+'-failure-persistent.png')});
  // Explicit retry before an authoritative check: with the canonical read unavailable (503) the real app
  // and shell must refuse locally, with no blind POST and the failure card unchanged.
  ctl.statusFail=true;
  const readsBeforeRetry=statusReads;
  const refused=await frame().evaluate(()=>__morning.setDone('read',false));
  const unreadable=await new Promise(r=>setTimeout(r,300)).then(()=>statusReads>readsBeforeRetry);
  check(refused===false&&requests.length===failBefore.posts+1&&gates.length===0,`${label} retry before an authoritative status check is refused without POST`);
  check(/Save outcome unknown/.test(await cardText())&&!/Status refreshed/.test(await cardText()),`${label} unreadable status keeps honest uncertainty`,JSON.stringify({unreadable}));
  ctl.statusFail=false;
  const manualReads=statusReads;
  await p.waitForFunction(()=>{const b=document.querySelector('.ch-morning-w [data-chmorningrecover]');return !!b&&!b.disabled;});
  await p.evaluate(()=>document.querySelector('.ch-morning-w [data-chmorningrecover]').click());
  await p.waitForFunction(()=>/Status refreshed/.test([...document.querySelectorAll('.ch-morning-w')].map(n=>n.textContent).join('')));
  check(statusReads>manualReads,`${label} actual Check status control reads canonical`);
  check(/Read/.test(await cardText())&&await p.locator('.ch-morning-w [data-chmorningrecover]').count()>=1,`${label} checked status still shows the unresolved failure`);
  const retry=frame().evaluate(()=>__morning.setDone('read',false));
  for(const end=Date.now()+5000;!gates.length&&Date.now()<end;)await new Promise(r=>setTimeout(r,20));
  check(gates.length===1&&requests.length===failBefore.posts+2&&requests.at(-1).done===false,`${label} explicit retry after check sends exactly one new POST`);
  gates.shift().resolve(200);check(await retry===true,`${label} explicit retry succeeds`);
  const after=await cardText();
  check((await cardTexts()).every(t=>/3 of 4/.test(t)&&!/outcome unknown|Status refreshed|wasn’t saved/.test(t))&&await p.locator('.ch-morning-w').count()>=1&&(await notices()).length===failBefore.notices+1,`${label} success clears the failure without another notice`,after);
  check(errors.length===0,`${label} no browser errors`,errors.join('; '));
 }catch(e){profile.error=String(e);profile.diagnostic=await p.evaluate(()=>{const a=window.__wos||window.__wux;return {welcome:window.__welcomeLog,shell:document.documentElement.dataset.shell,canMorning:window.WizCanOpen?.('morning'),wins:Object.values(a?.wins||{}).map(w=>({id:w.id,app:w.app,thread:w.thread,focus:w.focus,query:a.chats.ch(w.id).q,filter:a.chats.ch(w.id).filter})),sessions:a?.live?.sessions?.map(s=>({id:s.id,status:s.status,agent:s.agent})),ready:a?.live?.workGroups().ready.map(s=>s.id),cards:document.querySelectorAll('.ch-morning-w').length,body:document.body.innerText.slice(0,1800)};}).catch(()=>({}));profile.diagnostic.statusReads=statusReads;profile.diagnostic.sessionReads=sessionReads;profile.diagnostic.errors=errors;check(false,`${label} exception`,e.stack);await p.screenshot({path:path.join(out,label+'-exception.png')}).catch(()=>{});}
 finally{for(const g of gates)g.resolve(500);await ctx.close();}
}
const report=()=>({passed,failed,checks,profiles,measurements});
module.exports={server,scenario,report,initial,recount,copy,check,chromium,out};
if(require.main===module)(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/wizard-os-home/`;
 const b=await chromium.launch({headless:true});try{for(const desktop of process.env.QA_PROFILE?[process.env.QA_PROFILE==='desktop']:[false,true])for(const skin of process.env.QA_SKIN?[process.env.QA_SKIN]:['obsidian','obsidian-light'])await scenario(b,base,desktop,skin);}finally{await b.close();server.close();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report(),null,2));console.log(`${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
