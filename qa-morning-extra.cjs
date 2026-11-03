// Remaining real-handler acceptance. Synthetic loopback fixture only; queue admission required.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const q=require('./qa-morning-instant-done.cjs');
const mode=process.env.QA_CASE;
const nap=ms=>new Promise(r=>setTimeout(r,ms));
async function extra(o){
 const {p,ctx,frame,gates,requests,model,desktop,skin,label,out,base,statusReads}=o;
 const must=(c,n,d)=>{q.check(c,`${label}/${mode}: ${n}`,d);assert.ok(c,n);};
 const waitGate=async()=>{const end=Date.now()+5000;while(!gates.length&&Date.now()<end)await nap(20);assert.equal(gates.length,1,'one real synthetic transport gate');};
 const settle=async(code,f=frame())=>{await waitGate();gates.shift().resolve(code);if(f&&!f.isDetached())await f.waitForFunction(()=>![...document.querySelectorAll('[data-done],#hideBtn')].some(b=>b.disabled));else await nap(100);};
 const shot=async n=>{await p.locator('.mz-intro').waitFor({state:'detached'});await p.screenshot({path:path.join(out,`${label}-${mode}-${n}.png`)});};
 const opacityProof=async()=>{
  await nap(400);const b=await p.locator('#toast').boundingBox();assert.ok(b&&b.width>48&&b.height>20);
  const clip={x:Math.ceil(b.x+20),y:Math.ceil(b.y+8),width:Math.floor(b.width-40),height:Math.floor(b.height-16)};
  const samples=[];
  try{for(const loud of [false,true]){await p.evaluate(({b,loud})=>{let e=document.querySelector('#qa-under-toast');if(!e){e=document.createElement('div');e.id='qa-under-toast';document.body.append(e);}e.style.cssText=`position:fixed;pointer-events:none;left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px;z-index:2147483645;background:${loud?'#ff00ff':'#00ff00'};font:24px monospace;color:#fff`;e.textContent=loud?'LOUD TEXT LOUD TEXT LOUD TEXT':'';const t=document.querySelector('#toast');if(!('qaOldZ' in t.dataset))t.dataset.qaOldZ=t.style.zIndex;t.style.zIndex='2147483646';},{b,loud});const png=await p.screenshot({clip});fs.writeFileSync(path.join(out,`${label}-${mode}-opaque-${loud?'text':'blank'}.png`),png);samples.push(png);}
   must(samples[0].equals(samples[1]),'floating failure text panel pixels unchanged over loud text and blank');
  }finally{await p.evaluate(()=>{document.querySelector('#qa-under-toast')?.remove();const e=document.querySelector('#toast');e.style.zIndex=e.dataset.qaOldZ||'';delete e.dataset.qaOldZ;});}
 };
 const open=async()=>{await p.evaluate(()=>WizOpenApp('morning'));await p.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentWindow?.__morning?.state()));return frame();};
 const chats=async()=>{await p.evaluate(()=>{const a=window.__wos||window.__wux,w=Object.values(a.wins).find(w=>w.app==='chats');if(window.__wos)a.goDesk(a.desks.findIndex(d=>d.wins.includes(w.id)));a.focusWin(w.id);});};
 const done=async(step='workout')=>frame().evaluate(s=>{const e=document.querySelector(`[data-step="${s}"]`);if(!e.classList.contains('is-current')&&!e.classList.contains('is-open'))e.querySelector('[data-toggle]').click();e.querySelector('[data-done]').click();},step);
 const shellNotices=async()=>p.locator('#toast').evaluate(e=>({text:e.innerText,visible:e.getClientRects().length>0&&getComputedStyle(e).opacity!=='0',count:window.__morningNoticeCount||0}));
 // Count actual shell failure paints, not console calls or hidden app toasts.
 await p.evaluate(()=>{window.__morningNoticeCount=0;let last='';const e=document.querySelector('#toast');new MutationObserver(()=>{const t=e.textContent;if(t!==last&&t.includes('Morning wasn’t saved'))window.__morningNoticeCount++;last=t;}).observe(e,{subtree:true,childList:true,characterData:true});});
 if(mode.startsWith('destroy-')){
  const code=mode==='destroy-success'?200:500;
  const result=await p.evaluate(()=>{const a=window.__wos||window.__wux,f=[...document.querySelectorAll('iframe')].find(f=>f.contentWindow?.__morning),w=Object.values(a.wins).find(w=>w.appId==='morning'||w.url?.startsWith('/morning/'));if(!w)throw Error('Morning host window missing');const b=f.contentDocument.querySelector('[data-step="workout"] [data-done]');b.click();const own=f.contentWindow.__morning.state().steps.workout.done;if(!w)throw Error('Morning host window missing');a.closeWin(w.id);return {own,removed:!f.isConnected};});
  must(result.own&&result.removed,'actual Done then actual host close destroys frame in same task',result);
  await chats();await waitGate();await nap(5100);
  must(await p.locator('.ch-morning-w').innerText().then(t=>t.includes('1 of 4')),'projection survives destroyed frame and 5s backend hold');
  await p.evaluate(m=>postMessage({type:'wizard:morning',status:m,pending:false},location.origin),q.initial());
  must(await p.locator('.ch-morning-w').innerText().then(t=>t.includes('1 of 4')),'stale settled app message cannot steal transport custody');
  await settle(code,null);
  await p.waitForFunction(want=>document.querySelector('.ch-morning-w')?.innerText.includes(want),code===200?'1 of 4':'Workout · Meditate · Read');
  must(model.steps.workout.done===(code===200),'late terminal result reconciles actual fixture state');
  const n=await shellNotices();must(code===200?n.count===0:n.count===1&&n.visible&&n.text.includes('Morning wasn’t saved'),'one visible shell failure notice, none for success',n);await shot('terminal');
  const reads=statusReads();await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));const until=Date.now()+5000;while(statusReads()===reads&&Date.now()<until)await nap(20);
  must(statusReads()>reads,'status polling resumes after destroyed-frame terminal settlement');
  const f=await open();must(await f.evaluate(want=>__morning.state().steps.workout.done===want,code===200),'new app frame reads canonical terminal state');
  if(code===500){await done();await settle(200);must(model.steps.workout.done,'real Done retry after destroyed-frame failure persists');}
 }else if(mode==='retry'){
  await done();must(await frame().evaluate(()=>__morning.state().steps.workout.done),'Done immediately acknowledges while failure unresolved');await waitGate();await chats();await settle(500);
  const n=await shellNotices();must(n.count===1&&n.visible,'exactly one visible offscreen failure notice',n);must(await frame().evaluate(()=>!__morning.state().steps.workout.done),'failed Done rolls back, not mistaken for Undo');await shot('failed-Done');await opacityProof();
  await open();await done();await settle(200);must(model.steps.workout.done&&requests.length===2,'real Done retry produces one new successful write');
  // Exercise both adjacent sheet actions, not only setDone with a how string.
  for(const [step,selector] of [['meditate','#meds [data-open]'],['read','#picks [data-open]']]){
   await frame().evaluate(({step,selector})=>{const el=document.querySelector(`[data-step="${step}"]`);if(!el.classList.contains('is-current'))el.querySelector('[data-toggle]').click();document.querySelector(selector).click();document.querySelector('#sheetDone').click();},{step,selector});
   must(await frame().evaluate(s=>__morning.state().steps[s].done,step),`${step} actual sheet Mark done paints immediately`);await settle(200);must(requests.at(-1).how==='sheet',`${step} real sheet transport attribution`);
  }
 }else if(mode==='skip'){
  const r=await frame().evaluate(()=>{document.querySelector('#hideBtn').click();return {hidden:__morning.state().hidden,label:document.querySelector('#hideBtn').textContent,disabled:document.querySelector('#hideBtn').disabled};});
  must(r.hidden&&r.disabled&&r.label.includes('show it again'),'Skip today paints Show again and pending before backend',r);
  await waitGate();await chats();must(await p.locator('.ch-morning-w').count()===0,'Skip removes pinned card immediately');await settle(500);
  must(!model.hidden&&await p.locator('.ch-morning-w').count()>0,'failed Skip restores card and does not tick any step');must((await shellNotices()).count===1,'failed offscreen Skip has one shell notice');await shot('failed-skip');
  await open();await frame().evaluate(()=>document.querySelector('#hideBtn').click());await settle(200);must(model.hidden&&model.done===0,'Skip retry persists hide without Done');
  await open();await frame().evaluate(()=>document.querySelector('#hideBtn').click());
  must(await frame().evaluate(()=>!__morning.state().hidden&&document.querySelector('#hideBtn').textContent.startsWith('Skip today')),'Show again paints immediately');await settle(500);
  must(await frame().evaluate(()=>__morning.state().hidden),'Show again failure restores hidden status');await frame().evaluate(()=>document.querySelector('#hideBtn').click());await settle(200);must(!model.hidden&&model.done===0,'Show again retry persists without changing steps');
 }else if(mode==='skins'){
  await frame().evaluate(()=>{window.__documentBeforeSkin=document;});await done();await waitGate();
  const original=await p.evaluate(()=>({skin:WosSkin.current,saved:localStorage.getItem('wos.skin')}));
  try{
   for(const worn of ['obsidian','obsidian-light']){
    await p.evaluate(()=>WizCore.deeplink.route('/wizard-os-home/?view=skin'));
    const family=p.locator('[data-skinfamily="mizel"]:visible').first();await family.click();await p.locator('.mz-intro').waitFor({state:'detached'});
    await p.locator(`[data-skinpick="${worn}"]:visible`).first().click();await p.locator('.mz-intro').waitFor({state:'detached'});
    await p.waitForFunction(s=>WosSkin.current===s&&document.querySelector(`[data-skinpick="${s}"]`)?.getAttribute('aria-pressed')==='true',worn);
    await shot(worn+'-picker');
    await p.locator(desktop?'#dsettings [data-close]:visible':'#settings [data-stclose]:visible').first().click();
    await open();await frame().waitForFunction(s=>document.documentElement.dataset.skin===s,worn);
    const state=await frame().evaluate(()=>({same:document===window.__documentBeforeSkin,done:__morning.state().steps.workout.done,busy:document.querySelector('[data-step="workout"] [data-done]').disabled,skin:document.documentElement.dataset.skin,base:getComputedStyle(document.documentElement).getPropertyValue('--wz-base'),panel:getComputedStyle(document.querySelector('#toast')).backgroundColor}));
    must(state.same&&state.done&&state.busy&&state.skin===worn,'live skin change retains actual document and pending edit',state);await shot(worn+'-pending-app');
   }
   await settle(200);must(model.steps.workout.done,'skin change does not replay or lose the pending write');must(requests.length===1,'two actual picker changes never duplicate Done');
  }finally{await p.evaluate(o=>{WosSkin.set(o.skin);if(o.saved===null)localStorage.removeItem('wos.skin');else localStorage.setItem('wos.skin',o.saved);},original);}
 }else if(mode==='standalone-timers'){
  await p.clock.install();await p.goto(new URL('/morning/',base).href);await p.waitForFunction(()=>window.__morning?.state());
  const f=p.mainFrame();must(await p.evaluate(()=>parent===window&&!window.WizardApp),'actual unhosted entry has no shell bridge');
  const bg=await p.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,ink:getComputedStyle(document.body).color}));must(bg.bg!==bg.ink&&bg.bg!=='rgb(255, 255, 255)','standalone dark fallback has distinct canvas and ink',bg);await shot('standalone-loaded');
  await p.locator('[data-step="workout"] [data-done]').click();must(await p.evaluate(()=>__morning.state().steps.workout.done),'standalone actual Done paints before request');await settle(500,f);must(await p.evaluate(()=>!__morning.state().steps.workout.done&&document.querySelector('#toast').textContent.includes('Not saved')),'standalone failed Done rolls back with local error');
  await p.locator('[data-step="workout"] [data-done]').click();await settle(200,f);must(model.steps.workout.done,'standalone real Done retry persists');
  for(const step of ['meditate','read']){
   const e=p.locator(`[data-step="${step}"]`);if(!await e.evaluate(el=>el.classList.contains('is-current')))await e.locator('[data-toggle]').click();
   const total=await e.locator('[data-timer]').getAttribute('data-timer');await e.locator('[data-start]').click();must(await e.locator('[data-start]').innerText()==='Pause',`${step} actual timer Start handler running`);
   await p.clock.fastForward(Number(total)*1000+1000);await waitGate();must(await p.evaluate(s=>__morning.state().steps[s].done,step),`${step} actual wall-clock completion paints while write unresolved`);
   must(requests.at(-1).how===(step==='meditate'?'silent-timer':'timer'),`${step} actual timer transport source`);await settle(200,f);
  }
  await shot('standalone-timers-done');
 }else throw Error('Unknown acceptance mode '+mode);
}
(async()=>{
 await new Promise(r=>q.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${q.server.address().port}/wizard-os-home/`;
 const b=await q.chromium.launch({headless:true});try{await q.scenario(b,base,process.env.QA_PROFILE==='desktop',process.env.QA_SKIN||'obsidian',extra);}finally{await b.close();q.server.close();}
 const r=q.report();r.mode=mode;fs.writeFileSync(path.join(q.out,'results.json'),JSON.stringify(r,null,2));process.exitCode=r.failed?1:0;
})().catch(e=>{console.error(e);q.server.close();process.exitCode=1;});
