// Actual Morning handlers + actual Chats host, synthetic APIs only. Never proxy owner data.
// Runs on the queued Linux browser worker. QA_BASE_MORNING/QA_BASE_CHATS reproduce the live baseline.
const {chromium}=require('./tools/qa-playwright.cjs');
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
const initial=()=>({day:'2030-01-02',done:0,total:4,next:'workout',next_label:'Workout',hidden:false,steps:Object.fromEntries(steps.map(s=>[s,{done:false}])),reading:{ok:false,picks:[]},meditations:[],mindfeed:{ok:true,done:false,rated:0,total:3}});
const copy=x=>JSON.parse(JSON.stringify(x));
const recount=m=>{m.done=steps.filter(s=>m.steps[s].done).length;m.next=steps.find(s=>!m.steps[s].done)||null;m.next_label=({workout:'Workout',meditate:'Meditate',mindfeed:'MindFeed',read:'Read'})[m.next]||null;};
let passed=0,failed=0;const measurements=[];
const check=(c,name,detail)=>{c?passed++:failed++;console.log(c?'PASS':'FAIL',name,detail||'');};
async function scenario(browser,base,desktop,skin){
 const label=`${desktop?'desktop':'phone'}-${skin}`,ctx=await browser.newContext({viewport:desktop?{width:1600,height:1000}:{width:412,height:892},isMobile:!desktop,hasTouch:!desktop,serviceWorkers:'block'});
 let model=initial(),requests=[],gates=[],statusReads=0;
 await ctx.route('**/*',async r=>{
  const q=r.request(),u=new URL(q.url()),json=(d,status=200)=>r.fulfill({status,json:d}).catch(()=>{});
  if(u.pathname==='/morning/api/step'){
   const body=q.postDataJSON();requests.push(body);let release;const code=await new Promise(resolve=>{release=resolve;gates.push({resolve,body});});
   if(code===200){model.steps[body.step]={done:body.done,source:'you',at:'2030-01-02T10:00:00Z'};recount(model);}
   return json(code===200?copy(model):{error:'fixture failure'},code);
  }
  if(u.pathname==='/morning/api/status'){statusReads++;return json(copy(model));}
  if(u.pathname==='/morning/api/today')return json(copy(model));
  if(u.pathname.startsWith('/morning/api/'))return json({},503);
  if(['/mindfeed/','/wisdom/','/meditation/'].includes(u.pathname))return r.fulfill({contentType:'text/html',body:'<!doctype html><p>Synthetic app fixture</p>'});
  if(u.pathname==='/wizard/v1/bootstrap')return json({bootstrap:1,settings:{agent:{name:'Wizard'},clock:{timezone:'UTC'}},capabilities:{},endpoints:{apps:'/wizard/v1/apps',sessions:'/wizard/hermes/api/sessions'}});
  if(u.pathname==='/wizard/v1/setup')return json({first_run:false});
  if(u.pathname==='/wizard/v1/apps')return json({apps:[{id:'morning',name:'Morning',url:'/morning/',source:'apps.json',type:'view'}]});
  if(u.pathname==='/wizard/hermes/api/model/options')return json({provider:'fixture',providers:[]});
  if(u.pathname==='/wizard/hermes/api/sessions')return json({data:[],has_more:false});
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
  await p.evaluate(desktop=>{const a=window.__wux||window.__wos;if(desktop){window.__qaChat=a.newWin({app:'chats',thread:'__new__'});a.closeWin('wmain');}else{window.__qaChat=a.wins.wmain;a.chats.renderChats(a.wins.wmain);}},desktop);
  await p.locator('.ch-morning-w:visible').first().waitFor();
  await p.evaluate(()=>WizOpenApp('morning'));
  await p.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentWindow?.__morning?.state()));
  const frame=()=>p.frames().find(f=>/\/morning\//.test(f.url()));
  check(!!frame(),`${label} actual installed Morning iframe`);
  await p.screenshot({path:path.join(out,label+'-app-before.png')});
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
    const w=Object.values(a.wins).find(w=>w.app==='chats');if(w)a.focusWin(w.id);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const card=[...document.querySelectorAll('.ch-morning-w')].find(n=>n.getBoundingClientRect().width>0);
    return {ms:performance.now()-t,own,visible:!!card,text:card?.innerText||'',allGone:!document.querySelector('.ch-morning-w')};
   },{step,desktop});
   measurements.push({label,step,...result});
   check(result.ms<100&&result.own&&(index===3?result.allGone:result.visible&&result.text.includes(`${index+1} of 4`)),`${label}/${step} visible progress in two frames/<100ms`,JSON.stringify(result));
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
  // Undo/read failure after navigating to Chats: rollback must restore the all-done disappearance.
  await frame().evaluate(()=>{window.__pending=__morning.setDone('read',false);});await p.waitForTimeout(50);
  check(await p.locator('.ch-morning-w').count()>0,`${label} undo immediately restores card`);
  gates.shift().resolve(500);await frame().evaluate(()=>window.__pending);
  check(await p.locator('.ch-morning-w').count()===0,`${label} late failure reconciles after leaving Morning`);
  check(await frame().locator('#toast').innerText().then(t=>t.includes('Not saved')),`${label} one failure notice`);
  await p.screenshot({path:path.join(out,label+'-failure.png')});
  check(errors.length===0,`${label} no browser errors`,errors.join('; '));
 }catch(e){check(false,`${label} exception`,e.stack);await p.screenshot({path:path.join(out,label+'-exception.png')}).catch(()=>{});}
 finally{for(const g of gates)g.resolve(500);await ctx.close();}
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/wizard-os-home/`;
 const b=await chromium.launch({headless:true});try{for(const desktop of [false,true])for(const skin of ['obsidian','obsidian-light'])await scenario(b,base,desktop,skin);}finally{await b.close();server.close();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed,failed,measurements},null,2));console.log(`${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
