// Remaining real-handler acceptance. Synthetic loopback fixture only; queue admission required.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const q=require('./qa-morning-instant-done.cjs');
const mode=process.env.QA_CASE;
const nap=ms=>new Promise(r=>setTimeout(r,ms));
async function extra(o){
 const {p,ctx,frame,gates,requests,model,ctl,desktop,skin,label,out,base,statusReads}=o;
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
 const notices=()=>p.evaluate(()=>window.__morningNotices.slice()); // one entry per actual shell failure toast paint (installed by the scenario)
 const shellNotices=async()=>({...(await p.locator('#toast').evaluate(e=>({text:e.innerText,visible:e.getClientRects().length>0&&getComputedStyle(e).opacity!=='0'}))),count:(await notices()).length});
 const cardTexts=()=>p.evaluate(()=>[...document.querySelectorAll('.ch-morning-w')].map(n=>n.textContent));
 const cardText=async()=>(await cardTexts()).join('|');
 const refreshed=()=>p.waitForFunction(()=>/Status refreshed/.test([...document.querySelectorAll('.ch-morning-w')].map(n=>n.textContent).join('')));
 const toastGone=()=>p.waitForFunction(()=>{const t=document.querySelector('#toast');return !t.classList.contains('show')&&!t.classList.contains('on');});
 const controls=async()=>p.evaluate(()=>[...document.querySelectorAll('.ch-morning-w')].every(c=>c.querySelector('[data-chmorningrecover]')&&c.querySelector('[data-chmorning]')));
 // Authoritative check through the actual card control; waits on the shell's own text transition.
 const clickRecover=async()=>{await p.waitForFunction(()=>{const b=document.querySelector('.ch-morning-w [data-chmorningrecover]');return !!b&&!b.disabled;});await p.evaluate(()=>document.querySelector('.ch-morning-w [data-chmorningrecover]').click());};
 const checkStatus=async()=>{const r=statusReads();await clickRecover();await refreshed();must(statusReads()>r,'actual Check status control reads canonical status');};
 // A refusal inside the app reloads its own state first (a real second tap is then needed); never a blind POST.
 const retryTap=async fire=>{await fire();for(let i=0;i<2&&!gates.length;i++){const end=Date.now()+1200;while(!gates.length&&Date.now()<end)await nap(20);if(!gates.length)await fire();}};
 // With canonical reads unavailable a retry has no way to reconcile: the app/shell must refuse locally.
 const attemptWhileUnreadable=async(fire,what)=>{const posts=requests.length;ctl.statusFail=true;try{await fire();await nap(300);must(requests.length===posts&&gates.length===0,what+' is refused without a blind POST');must(!/Status refreshed/.test(await cardText()),what+' leaves the uncertainty visible while status is unreadable');}finally{ctl.statusFail=false;}};
  if(mode.startsWith('destroy-')){
  const code=mode==='destroy-success'?200:500;
  const result=await p.evaluate(()=>{const a=window.__wos||window.__wux,f=[...document.querySelectorAll('iframe')].find(f=>f.contentWindow?.__morning),w=Object.values(a.wins).find(w=>w.appId==='morning'||w.url?.startsWith('/morning/'));if(!w)throw Error('Morning host window missing');const b=f.contentDocument.querySelector('[data-step="workout"] [data-done]');b.click();const own=f.contentWindow.__morning.state().steps.workout.done;if(!w)throw Error('Morning host window missing');a.closeWin(w.id);return {own,removed:!f.isConnected};});
  must(result.own&&result.removed,'actual Done then actual host close destroys frame in same task',result);
  await chats();await waitGate();await nap(5100);
  must(await cardText().then(t=>t.includes('1 of 4')),'projection survives destroyed frame and 5s backend hold');
  await p.evaluate(m=>postMessage({type:'wizard:morning',status:m,pending:false},location.origin),q.initial());
  must(await cardText().then(t=>t.includes('1 of 4')),'stale settled app message cannot steal transport custody');
  await settle(code,null);
  if(code===200){
   await p.waitForFunction(()=>document.querySelector('.ch-morning-w')?.innerText.includes('1 of 4'));
   must(model.steps.workout.done,'late terminal result reconciles actual fixture state');
   const n=await shellNotices();must(n.count===0&&!(await cardText()).includes('outcome unknown'),'no failure notice or card for a committed late success',n);
  }else{
   await p.waitForFunction(()=>/Save outcome unknown/.test([...document.querySelectorAll('.ch-morning-w')].map(n=>n.textContent).join('')));
   must(!model.steps.workout.done,'late failed terminal result is not a commit in the synthetic server');
   const n=await shellNotices(),text=await cardText();
   must(n.count===1&&n.visible&&n.text.includes('Save outcome unknown')&&!n.text.includes('Morning wasn’t saved'),'destroyed frame: one visible shell notice, honest uncertainty (not definitely unsaved)',n);
   must(/Workout/.test(text)&&await controls(),'destroyed frame: persistent card names the step and keeps Check status/Open Morning',text);
   await shot('terminal');await toastGone();
   must(/Save outcome unknown/.test(await cardText())&&requests.length===1&&gates.length===0,'destroyed frame: card persists after the toast and no automatic POST retry');
  }
  if(code===200)await shot('terminal');
  const reads=statusReads();await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));const until=Date.now()+5000;while(statusReads()===reads&&Date.now()<until)await nap(20);
  must(statusReads()>reads,'status polling resumes after destroyed-frame terminal settlement');
  if(code===500){await refreshed();must(/Workout/.test(await cardText())&&await controls(),'resumed poll is a status check: card turns to Status refreshed and stays actionable');}
  const f=await open();must(await f.evaluate(want=>__morning.state().steps.workout.done===want,code===200),'new app frame reads canonical terminal state');
  if(code===500){await done();await settle(200);must(model.steps.workout.done&&requests.length===2,'real Done retry after checked destroyed-frame failure persists with one new POST');must(!(await cardText()).includes('outcome unknown')&&!(await cardText()).includes('Status refreshed'),'successful retry clears the persistent failure');}
 }else if(mode==='retry'){
  await done();must(await frame().evaluate(()=>__morning.state().steps.workout.done),'Done immediately acknowledges while failure unresolved');await waitGate();await chats();await settle(500);
  const n=await shellNotices();must(n.count===1&&n.visible&&n.text.includes('Save outcome unknown')&&!n.text.includes('Morning wasn’t saved'),'exactly one visible offscreen failure notice, outcome unknown',n);must(await frame().evaluate(()=>!__morning.state().steps.workout.done),'failed Done rolls back, not mistaken for Undo');
  const text=await cardText();must(/Workout/.test(text)&&/Save outcome unknown/.test(text)&&await controls(),'persistent actionable uncertainty card names the failed step',text);
  must(await frame().evaluate(()=>!document.querySelector('#err').hidden&&/Save outcome unknown/.test(document.querySelector('#err').textContent)),'local Morning error is also honest uncertainty');
  await shot('failed-Done');await opacityProof();await toastGone();
  must(/Save outcome unknown/.test(await cardText())&&await controls()&&requests.length===1&&gates.length===0,'card persists after the toast and nothing retried automatically');
  await open();
  await attemptWhileUnreadable(done,'real Done retry before a status check');
  await checkStatus();must(/Workout/.test(await cardText()),'checked status keeps the unresolved failure visible');
  await retryTap(done);await settle(200);must(model.steps.workout.done&&requests.length===2,'real Done retry after check produces one new successful write');
  must((await cardTexts()).every(c=>!/outcome unknown|Status refreshed/.test(c))&&(await notices()).length===1,'success clears persistent failure and emits no further failure notice');
  // Exercise both adjacent sheet actions, not only setDone with a how string.
  for(const [step,selector] of [['meditate','#meds [data-open]'],['read','#picks [data-open]']]){
   await frame().evaluate(({step,selector})=>{const el=document.querySelector(`[data-step="${step}"]`);if(!el.classList.contains('is-current'))el.querySelector('[data-toggle]').click();document.querySelector(selector).click();document.querySelector('#sheetDone').click();},{step,selector});
   must(await frame().evaluate(s=>__morning.state().steps[s].done,step),`${step} actual sheet Mark done paints immediately`);await settle(200);must(requests.at(-1).how==='sheet',`${step} real sheet transport attribution`);
  }
 }else if(mode==='skip'){
  const r=await frame().evaluate(()=>{document.querySelector('#hideBtn').click();return {hidden:__morning.state().hidden,label:document.querySelector('#hideBtn').textContent,disabled:document.querySelector('#hideBtn').disabled};});
  must(r.hidden&&r.disabled&&r.label.includes('show it again'),'Skip today paints Show again and pending before backend',r);
  await waitGate();await chats();must(await p.locator('.ch-morning-w').count()===0,'Skip removes pinned card immediately');await settle(500);
  let text=await cardText();
  must(!model.hidden&&model.done===0&&/Show \/ hide/.test(text)&&/Save outcome unknown/.test(text)&&await controls(),'failed Skip leaves a persistent Show/hide uncertainty card and ticks no step',text);must((await shellNotices()).count===1,'failed offscreen Skip has one shell notice');await shot('failed-skip');
  const hide=async()=>frame().evaluate(()=>document.querySelector('#hideBtn').click());
  await open();await attemptWhileUnreadable(hide,'Skip retry before a status check');await checkStatus();
  await retryTap(hide);await settle(200);must(model.hidden&&model.done===0,'Skip retry after check persists hide without Done');
  await chats();must(await p.locator('.ch-morning-w').count()===0,'successful Skip clears the failure and hides the card');
  await open();await hide();
  must(await frame().evaluate(()=>!__morning.state().hidden&&document.querySelector('#hideBtn').textContent.startsWith('Skip today')),'Show again paints immediately');await settle(500);
  must(await frame().evaluate(()=>__morning.state().hidden),'Show again failure restores hidden status');
  text=await cardText();must(model.hidden&&/Show \/ hide/.test(text)&&/Save outcome unknown/.test(text)&&await controls()&&(await shellNotices()).count===2,'failed Show again keeps a persistent card even though canonical is hidden, with its own single notice',text);
  await attemptWhileUnreadable(hide,'Show again retry before a status check');await checkStatus();
  await retryTap(hide);await settle(200);must(!model.hidden&&model.done===0,'Show again retry after check persists without changing steps');
  await chats();must(await p.locator('.ch-morning-w').count()>0&&(await cardTexts()).every(c=>!/outcome unknown|Status refreshed/.test(c)),'successful Show again returns the normal card');
 }else if(mode==='refusal'){
  // A definitive 4xx refusal is a different state from an ambiguous response: nothing was saved, the
  // wording says so, and an explicit retry needs no status check.
  await done();must(await frame().evaluate(()=>__morning.state().steps.workout.done),'Done acknowledges before a definitive refusal');await waitGate();await chats();await settle(400);
  const n=await shellNotices(),text=await cardText();
  must(n.count===1&&n.visible&&n.text.includes('Morning wasn’t saved')&&!n.text.includes('outcome unknown'),'definitive refusal: one visible shell notice says not saved',n);
  must(/Workout/.test(text)&&/Morning wasn’t saved/.test(text)&&!/outcome unknown/.test(text)&&await controls(),'definitive refusal: persistent actionable card, not an uncertainty',text);
  must(await frame().evaluate(()=>!__morning.state().steps.workout.done&&!document.querySelector('#err').hidden&&/Not saved/.test(document.querySelector('#err').textContent)),'definitive refusal rolls back with local Not saved error');
  must(!model.steps.workout.done&&requests.length===1&&gates.length===0,'refused write is not committed and is not retried automatically');
  await shot('refused');await opacityProof();await toastGone();must(/Morning wasn’t saved/.test(await cardText()),'definitive refusal card persists after the toast');
  await open();await done();await settle(200);
  must(model.steps.workout.done&&requests.length===2,'explicit retry after definitive refusal needs no status check and persists with one new POST');
  must((await cardTexts()).every(c=>!/wasn’t saved|outcome unknown/.test(c))&&(await notices()).length===1,'successful retry clears the refusal card without another notice');
 }else if(mode==='lost-commit'){
  // Response lost AFTER the server committed. The bounded status read proves the effect, so the shell must
  // reconcile to success: no failure card or notice, and never a second POST.
  for(const [step,how,code] of [['workout','tap','commit-500'],['meditate','tap','commit-abort']]){
   const posts=requests.length;await done(step);must(await frame().evaluate(s=>__morning.state().steps[s].done,step),`${step}: Done acknowledges before the lost response`);
   await waitGate();await chats();await settle(code);
   await p.waitForFunction(m=>document.querySelector('.ch-morning-w')?.innerText.includes(m),step==='workout'?'1 of 4':'2 of 4');
   must(model.steps[step].done&&requests.length===posts+1&&gates.length===0,`${step}: committed-but-lost response is reconciled with exactly one POST`);
   must((await cardTexts()).every(c=>!/outcome unknown|wasn’t saved|Status refreshed/.test(c))&&(await notices()).length===0,`${step}: confirmed commit shows no failure card or notice`);
   must(await open().then(f=>f.evaluate(s=>__morning.state().steps[s].done,step)),`${step}: reopened app agrees with committed state`);
  }
  await shot('reconciled');
 }else if(mode==='uncertain'){
  // Server outcome cannot be established because the canonical read is also unavailable. The UI must say
  // so honestly, show the OLD canonical state, never retry blindly, and let a later read decide.
  ctl.statusFail=true;await done('workout');await waitGate();await chats();await settle('commit-abort');
  await p.waitForFunction(()=>/Save outcome unknown/.test([...document.querySelectorAll('.ch-morning-w')].map(n=>n.textContent).join('')));
  must(model.steps.workout.done&&requests.length===1,'fixture: server did commit but the client has no evidence');
  let n=await shellNotices(),text=await cardText();
  must(n.count===1&&n.text.includes('Save outcome unknown')&&!n.text.includes('Morning wasn’t saved')&&/Workout/.test(text)&&await controls(),'committed-but-unreadable: honest uncertainty, not definitely unsaved',text);
  await shot('unknown-committed');await toastGone();
  const reads=statusReads();await clickRecover();const end=Date.now()+5000;while(statusReads()===reads&&Date.now()<end)await nap(20);
  must(statusReads()>reads&&/Save outcome unknown/.test(await cardText())&&requests.length===1,'failed status check does not invent a result and does not POST');
  await nap(100);ctl.statusFail=false;await clickRecover();
  await p.waitForFunction(()=>document.querySelector('.ch-morning-w')?.innerText.includes('1 of 4'));
  must(requests.length===1&&(await cardTexts()).every(c=>!/outcome unknown|Status refreshed/.test(c)),'later canonical read proves the commit; failure clears without any retry');
  // Second step: genuinely not committed + unreadable, then recovered and retried explicitly.
  ctl.statusFail=true;await open();await done('meditate');await waitGate();await chats();await settle(500);
  await p.waitForFunction(()=>/Meditate/.test([...document.querySelectorAll('.ch-morning-w')].map(n=>n.textContent).join(''))&&/Save outcome unknown/.test([...document.querySelectorAll('.ch-morning-w')].map(n=>n.textContent).join('')));
  must(!model.steps.meditate.done&&requests.length===2&&(await notices()).length===2,'uncommitted-and-unreadable failure has its own single notice');
  await open();await attemptWhileUnreadable(()=>done('meditate'),'retry while status is unreadable');
  await checkStatus();await retryTap(()=>done('meditate'));await settle(200);
  must(model.steps.meditate.done&&requests.length===3&&(await cardTexts()).every(c=>!/outcome unknown|Status refreshed/.test(c)),'explicit retry after a successful check persists with exactly one new POST');
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
  await p.locator('[data-step="workout"] [data-done]').click();must(await p.evaluate(()=>__morning.state().steps.workout.done),'standalone actual Done paints before request');await settle(500,f);
  must(await p.evaluate(()=>!__morning.state().steps.workout.done&&!document.querySelector('#err').hidden&&/Save outcome unknown/.test(document.querySelector('#err').textContent)&&/Save outcome unknown/.test(document.querySelector('#toast').textContent)),'standalone failed Done rolls back with local honest-uncertainty error');
  const posts=requests.length;await p.locator('[data-step="workout"] [data-done]').click();await nap(300);
  must(requests.length===posts&&gates.length===0,'standalone retry before the status check is refused without a blind POST');
  await p.waitForFunction(()=>document.querySelector('#err').hidden);
  await p.locator('[data-step="workout"] [data-done]').click();await settle(200,f);must(model.steps.workout.done&&requests.length===posts+1,'standalone real Done retry after check persists with one new POST');
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
