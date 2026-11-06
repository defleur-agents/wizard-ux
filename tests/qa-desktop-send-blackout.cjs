'use strict';
// Synthetic-origin send + iframe hit testing. All APIs local; no owner/network continuation.
// Extends archive-flash frame sampling, boot-layout restored workspace, custom-background Files fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), {execFileSync} = require('node:child_process');
const {chromium} = require('../tools/qa-playwright.cjs');
const {ownerRead, MODEL_OPTIONS} = require('../tools/qa-desktop-frame-fixture.cjs');
const repo = path.resolve(__dirname, '..'), prefix = '/wizard-os-home/', origin = 'https://blackout.test';
const out = process.env.QA_OUT || 'blackout-evidence'; fs.mkdirSync(out, {recursive:true});
const refs = (process.env.QA_REFS || '4b1a5f1deab9bb3971c0fead465463ae6fd94883,9500aaeea09e5d6c528887a7e746edf03526dab6,51ca9c73b2962935743eb0f2c948e509ecbe10ec').split(',');
const report = {synthetic:true, matrix:{refs, skins:['nebula','sepia'], backdrops:['default','custom'], actions:['typed-reply','typed-new','voice-reply','voice-new']}, cases:[], failures:[]};
const save = () => fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
const mime = f => /\.m?js$/.test(f)?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.webp')?'image/webp':f.endsWith('.json')?'application/json':'text/html';
const app = {id:'qa-messenger', name:'Synthetic Messenger', url:'/qa-messenger/', source:'apps.json',type:'view',kind:'wizard',status:'running'};
const appHTML = '<!doctype html><html><meta charset="utf-8"><style>html{color-scheme:dark}body{background:var(--wz-base,#14141e);color:var(--wz-text,#eee);font:16px system-ui}button{margin:40px;padding:40px}</style><body><h1>Synthetic Messenger</h1><button id="hit">Click retained app</button><input aria-label="App input" value="Synthetic retained draft"><script src="/wizard-os-home/core/app-client.js"></script><script>window.clicks=0;document.getElementById("hit").onclick=()=>{clicks++;document.getElementById("hit").textContent="Clicked "+clicks};WizardApp.ready().then(()=>WizardApp.titlebar.set([{id:"search",kind:"button",label:"Synthetic Search",icon:"search"}],()=>{}));</script></body></html>';
function snapshot() {
 const visible = n => { if(!n?.isConnected)return false; const r=n.getBoundingClientRect();if(r.width<1||r.height<1||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)return false;for(let a=n;a;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility!=='visible'||+s.opacity===0)return false; const b=a.getBoundingClientRect();if(a!==n&&/(hidden|clip|auto|scroll)/.test(s.overflow+s.overflowX+s.overflowY)&&(r.right<=b.left||r.left>=b.right||r.bottom<=b.top||r.top>=b.bottom))return false;}return true;};
 const brief=n=>n?{tag:n.tagName,id:n.id,cls:typeof n.className==='string'?n.className:'',win:n.closest?.('[data-win]')?.dataset.win,desk:n.closest?.('[data-desk]')?.dataset.desk}:null;
 const frames=[...document.querySelectorAll('iframe[src*="/qa-messenger/"]')].map(f=>{const r=f.getBoundingClientRect(),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {visible:visible(f),rect:{x:r.x,y:r.y,w:r.width,h:r.height},hit:brief(h),hitsFrame:h===f,inert:!!f.closest('[inert]'),pointer:getComputedStyle(f).pointerEvents};});
 const content=[...document.querySelectorAll('#stage .ch-compose,#stage .ch-msgs')].filter(visible).map(brief);
 const point=document.elementFromPoint(innerWidth/2,innerHeight/2);
 return {t:performance.now(),html:{...document.documentElement.dataset},content,frames,centre:brief(point),layout:window.WosSkinHost?.layoutState,fault:localStorage.getItem('wos.layout-fault.v1'),wins:window.__wux?Object.values(__wux.wins).map(w=>({id:w.id,app:w.app,thread:w.thread})):[],desks:[...document.querySelectorAll('#stage > .wsp')].map(n=>({id:n.dataset.desk,hidden:n.hidden,role:n.dataset.aadRole,rect:{w:n.offsetWidth,h:n.offsetHeight},text:n.innerText?.slice(0,160)}))};
}
(async()=>{
 const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
 for(const ref of refs){
  const sha=execFileSync('git',['rev-parse',ref+'^{commit}'],{cwd:repo,encoding:'utf8'}).trim();
  const files=new Set(execFileSync('git',['ls-tree','-r','--name-only',sha,'--','web/'],{cwd:repo,encoding:'utf8'}).trim().split('\n')),cache=new Map();
  for(const skin of report.matrix.skins)for(const backdrop of report.matrix.backdrops)for(const action of report.matrix.actions){
   const stem=[sha.slice(0,8),skin,backdrop,action].join('-');
   const row={sha,skin,backdrop,action,errors:[],logs:[],requests:[],checks:[],frames:[]};report.cases.push(row);
   const ctx=await browser.newContext({viewport:{width:1512,height:943},serviceWorkers:'block',permissions:['microphone']});
   let page; const sessions=new Map(),messages=new Map();
   const thread={id:'qa-thread',title:'Synthetic pinned conversation',runtime:'direct',status:'completed',source:'wizard-mobile',model:MODEL_OPTIONS.model,provider:MODEL_OPTIONS.provider,updated_at:'2026-11-06T10:00:00Z',message_count:2};
   sessions.set(thread.id,thread);messages.set(thread.id,[{id:'q1',role:'user',content:'Synthetic request',timestamp:1793959200},{id:'a1',role:'assistant',content:'Synthetic answer remains visible',timestamp:1793959201}]);
   const filesData=new Map();let runCount=0;
   try{
    await ctx.routeWebSocket('**/*',ws=>ws.close());
    const seed = ({skin,backdrop,app})=>{
     if(window!==top)return;
     if(!sessionStorage.getItem('qa-seeded')){
      sessionStorage.setItem('qa-seeded','1');
      for(const[k,v]of Object.entries({'wos.shell':'desktop','wos.desktop-view.v1':'ai-apps','wos.coached':'true','wos.tour.v1':'true','wos.welcome.v1':'done','wos.skin':skin,'wux.apps.v1':JSON.stringify([app]),'wos.skin.layout:ai-apps.pins':JSON.stringify([app.id]),'wos.chats.pinned.v2':JSON.stringify(['qa-thread']),'wos.chats.pinned.migrated.v1':'1'}))localStorage.setItem(k,v);
      const wins={restored:{id:'restored',app:'chats',thread:'qa-thread'},messenger:{id:'messenger',app:'frame',appId:app.id,url:app.url,title:app.name}};
      const ws=[{id:'dchat',wins:['restored'],focus:'restored',mono:false},{id:'dmessenger',wins:['messenger'],focus:'messenger',mono:false}];
      for(const[k,v]of Object.entries({wins,ws,cur:0,homeOpen:false}))localStorage.setItem('wux.desk.'+k,JSON.stringify(v));
      if(backdrop==='custom'){localStorage.setItem('wos.skin.wallpaper.wizard.custom',JSON.stringify({wide:'qa-wide',tall:'qa-tall'}));localStorage.setItem('wos.skin.wallpaper.wizard.desktop','custom');}
     }
     window.qaSnapshot=SNAPSHOT;
    };
    await ctx.addInitScript('('+seed.toString().replace('SNAPSHOT','('+snapshot.toString()+')')+')('+JSON.stringify({skin,backdrop,app})+')');
    await ctx.route('**/*',async r=>{
     const q=r.request(),u=new URL(q.url()),p=u.pathname,m=q.method();
     if(u.origin!==origin){row.requests.push({m,p,external:true});return r.abort();}
     if(!['GET','HEAD'].includes(m)){
      row.requests.push({m,p,bytes:q.postDataBuffer()?.length||0});
      if(p==='/wizard/thread-seen'&&m==='PUT')return r.fulfill({json:{ok:true,state:{initializedAt:1,threads:{}}}});
      if(p==='/wizard/files/upload'&&m==='POST'){const id='qa-audio-'+filesData.size;filesData.set(id,q.postDataBuffer());return r.fulfill({json:{file:{id,name:'voice.webm',mime:'audio/webm',bytes:q.postDataBuffer()?.length||0}}});}
      if(p==='/qa-transcribe'&&m==='POST')return r.fulfill({json:{text:'Synthetic recorded reply',model:'fixture'}});
      if(p==='/wizard/hermes/api/sessions'&&m==='POST'){const b=q.postDataJSON();sessions.set(b.id,{...thread,id:b.id,title:'Synthetic new conversation'});messages.set(b.id,[]);return r.fulfill({json:{session:sessions.get(b.id)}});}
      if(p==='/wizard/hermes/v1/runs'&&m==='POST'){
       const b=q.postDataJSON(),run_id='qa-run-'+(++runCount),s=sessions.get(b.session_id);assert.ok(s,'send stays in synthetic fixture');
       s.status='running';s.run_id=run_id;s.updated_at='2026-11-06T12:34:00Z';
       messages.get(b.session_id).push({id:run_id+'-user',role:'user',content:b.input,timestamp:1793968440});
       await new Promise(resolve=>setTimeout(resolve,450));
       return r.fulfill({json:{run_id,session_id:b.session_id,status:'running',user_message_id:run_id+'-user'}});
      }
      row.requests.at(-1).refused=true;return r.fulfill({status:405,json:{error:'Synthetic origin refuses unlisted mutation'}});
     }
     if(p==='/qa-messenger/')return r.fulfill({contentType:'text/html',body:appHTML});
     if(p==='/wizard/v1/bootstrap')return r.fulfill({json:{bootstrap:1,settings:{agent:{name:'Wizard'},owner:{name:'Synthetic owner'}},capabilities:{voice:true,files:true,steer:true},endpoints:{transcribe:'/qa-transcribe',upload:'/wizard/files/upload'}}});
     if(p==='/wizard/v1/apps')return r.fulfill({json:{apps:[app]}});
     if(p==='/wizard/v1/ui-preferences')return r.fulfill({json:{migrations:{'launcher-seed-v1':true},pinnedChats:['qa-thread']}});
     if(p==='/wizard/v1/pages/wizard-look/look.json')return r.fulfill({json:{exists:true,version:'1',text:JSON.stringify({version:1,skin:{id:skin,at:1},tweaks:{},...(backdrop==='custom'?{desktopBackdrop:{id:'custom',wide:'qa-wide',tall:'qa-tall'}}:{})})}});
     if(p==='/wizard/files/qa-wide/content'||p==='/wizard/files/qa-tall/content')return r.fulfill({path:process.env[p.includes('qa-wide')?'QA_WIDE':'QA_TALL'],contentType:'image/webp'});
     const file=p.match(/^\/wizard\/files\/([^/]+)\/content$/);if(file&&filesData.has(file[1]))return r.fulfill({body:filesData.get(file[1]),contentType:'audio/webm'});
     if(p==='/wizard/hermes/api/sessions')return r.fulfill({json:{object:'list',data:[...sessions.values()],has_more:false,snapshot:'qa-stable'}});
     const match=p.match(/^\/wizard\/hermes\/api\/sessions\/([^/]+)(\/messages)?$/);
     if(match&&sessions.has(match[1]))return r.fulfill({json:match[2]?{messages:messages.get(match[1]),data:messages.get(match[1]),has_more:false}:{session:sessions.get(match[1])}});
     if(p.startsWith(prefix)){
      const name='web/'+decodeURIComponent(p.slice(prefix.length)||'index.html');if(!files.has(name))return r.fulfill({status:404,body:'Missing exact ref asset'});
      if(!cache.has(name))cache.set(name,execFileSync('git',['show',sha+':'+name],{cwd:repo,maxBuffer:32*1024*1024}));
      return r.fulfill({body:cache.get(name),contentType:mime(name)});
     }
     return r.fulfill({json:ownerRead(p)});
    });
    page=await ctx.newPage();page.setDefaultTimeout(10000);
    page.on('pageerror',e=>row.errors.push(e.stack||e.message));
    page.on('console',m=>{if(['error','warning'].includes(m.type()))row.logs.push({type:m.type(),text:m.text(),location:m.location()});});
    await page.goto(origin+prefix+'desktop.html');
    await page.waitForFunction(()=>window.__wux&&document.documentElement.dataset.aiApps==='desktop'&&!WosExperience.state.busy);
    await page.evaluate(()=>document.getElementById('wosWelcome')?.remove());
    await page.reload(); // restored state, not just first-mount
    await page.waitForFunction(()=>window.__wux&&document.documentElement.dataset.aiApps==='desktop'&&!WosExperience.state.busy);
    await page.evaluate(()=>document.getElementById('wosWelcome')?.remove());
    await page.locator('.aad-vtab[data-app="qa-messenger"]').click();
    await page.frameLocator('iframe[src*="/qa-messenger/"]').locator('#hit').click();
    row.checks.push('restored app iframe accepts real pointer click');
    await page.locator('.aad-rw[data-sid="qa-thread"] .aad-row').click();
    if(action.endsWith('-new'))await page.evaluate(()=>__wux.newChat());
    await page.locator('.pane-main .ch-compose textarea').first().waitFor({state:'visible'});
    row.before=await page.evaluate(snapshot);row.backdropState=await page.evaluate(()=>({wall:WosSkin.wallpaper,customSupported:!!WosSkin.adoptDesktopBackdrop}));
    await page.screenshot({path:path.join(out,stem+'-before.png')});
    await page.evaluate(()=>{window.qaFrames=[];window.qaSampling=true;function sample(){qaFrames.push(qaSnapshot());if(qaSampling)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
    if(action.startsWith('typed')){
     await page.locator('.pane-main .ch-compose textarea').first().fill('Synthetic typed message');
     await page.locator('.pane-main .ch-send').first().click();
    }else{
     const started=await page.evaluate(()=>{const w=Object.values(__wux.wins).find(w=>w.app==='chats');return __wux.recordReply(w.id,w.thread);});
     assert.equal(started,'recording','real fake-device recording starts');
     await page.waitForTimeout(1200);
     await page.locator('#voiceSend').click();
    }
    for(let i=0;i<8;i++){await page.waitForTimeout(100);await page.screenshot({path:path.join(out,stem+'-'+i+'.png')});}
    await page.waitForTimeout(1600);
    row.after=await page.evaluate(snapshot);row.frames=await page.evaluate(()=>{qaSampling=false;return qaFrames;});
    row.outbox=await page.evaluate(()=>__wux.outbox.unsent().map(i=>({id:i.id,kind:i.kind,sessionId:i.sessionId,state:i.state,error:i.error})));
    row.blackFrames=row.frames.filter(f=>!f.content.length&&!f.frames.some(i=>i.visible&&i.hitsFrame));
    row.interceptedFrames=row.frames.filter(f=>f.frames.some(i=>i.visible&&!i.hitsFrame));
    row.checks.push('sampled '+row.frames.length+' animation frames');
    assert.ok(row.requests.some(r=>r.p==='/wizard/hermes/v1/runs'&&r.m==='POST'),'fixture received a real product outbox send');
    assert.equal(row.blackFrames.length,0,'no empty opaque centre stage');
    assert.equal(row.interceptedFrames.length,0,'visible app iframe stays a pointer target');
    await page.locator('.aad-vtab[data-app="qa-messenger"]').click();
    row.appAfter=await page.evaluate(snapshot);
    await page.frameLocator('iframe[src*="/qa-messenger/"]').locator('#hit').click();
    assert.equal(await page.frameLocator('iframe[src*="/qa-messenger/"]').locator('#hit').textContent(),'Clicked 2','retained document clickable after send');
    row.checks.push('app accepts pointer click after send; same retained document');
    assert.deepEqual(row.errors,[],'no page errors');row.pass=true;
   }catch(e){row.pass=false;row.failure=e.stack;report.failures.push({stem,error:e.message});if(page){row.failureState=await page.evaluate(snapshot).catch(()=>null);await page.screenshot({path:path.join(out,stem+'-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,stem+'-failure.html'),await page.content().catch(()=>''));}}
   finally{save();await ctx.close();console.log(JSON.stringify({stem,pass:row.pass,failure:row.failure,blackFrames:row.blackFrames?.length,interceptedFrames:row.interceptedFrames?.length}));}
  }
 }
 }finally{await browser.close();save();}
 assert.equal(report.cases.length,refs.length*16,'complete matrix');assert.deepEqual(report.failures,[],'all send/click cases');
})().catch(e=>{console.error(e);process.exitCode=1;});
