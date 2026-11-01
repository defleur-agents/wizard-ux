// Real staged ingress smoke + pixel parity against the live-HEAD card; no owner writes.
const {chromium}=require('./qa-playwright.cjs');
const fs=require('node:fs'),path=require('node:path');
const base=process.argv[2];if(!base)throw Error('Pass the isolated staged origin');
const out=process.env.QA_OUT||path.join(process.env.TMPDIR||process.cwd(),'app-ready-preview');fs.mkdirSync(out,{recursive:true});
let passed=0,failed=0;const check=(v,n,d='')=>{v?passed++:failed++;console.log(v?'PASS':'FAIL',n,d);};
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
 const shots={};
 for(const skin of ['nebula','landscapes-light'])for(const baseline of [true,false]) {
  const ctx=await b.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await ctx.addInitScript(s=>{localStorage.setItem('wos.coached','true');localStorage.setItem('wos.welcome.v1','done');localStorage.setItem('wos.voiceTipSeen','true');localStorage.setItem('wos.shell','phone');localStorage.setItem('wos.skin',s);},skin);
  if(baseline)await ctx.route('**/core/chats.*',r=>{const name=new URL(r.request().url()).pathname.split('/').pop();return r.fulfill({path:path.join(process.env.QA_BASE_DIR,name),contentType:name.endsWith('.css')?'text/css':'application/javascript'});});
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  try {
   await p.goto(base+'/__preview/reset');await p.goto(base+'/wizard-os-home/?view=chats&section=ready&shell=phone',{waitUntil:'domcontentloaded'});
   await p.waitForFunction(()=>window.__wos?.live?.ok,null,{timeout:20000});await p.waitForTimeout(1500);
   await p.evaluate(()=>WizCore.deeplink.route('/wizard-os-home/?view=chats&section=ready'));await p.waitForTimeout(700);
   const toggle=p.locator('[data-sectoggle="ready"]:visible').first();if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
   const selector=baseline?'.ch-morning-w':'.ch-appcard-w';await p.locator(selector+':visible').first().waitFor({timeout:10000});await p.evaluate(()=>document.fonts.ready);
   check(await p.evaluate(s=>document.documentElement.dataset.skin===s,skin),skin+' real staged skin');
   const key=skin+(baseline?'-before':'-after');shots[key]=await p.locator(selector+':visible').first().screenshot({path:path.join(out,key+'-card.png')});
   shots[key+'-contract']=await p.locator(selector+':visible').first().evaluate(n=>{const r=n.getBoundingClientRect();const style=e=>{const s=getComputedStyle(e);return ['background','border','borderRadius','color','font','padding','gap'].map(k=>s[k])};return {width:r.width,height:r.height,text:n.innerText,button:style(n.querySelector('button')),badge:style(n.querySelector('.sun,.badge')),subtitle:style(n.querySelector('small')),dots:[...n.querySelectorAll('.dots i')].map(style)};});
   await p.screenshot({path:path.join(out,key+'-shell.png')});
   if(!baseline) {
    check(JSON.stringify(shots[skin+'-before-contract'])===JSON.stringify(shots[key+'-contract']),skin+' card geometry, text, dots and styles identical to live HEAD');
    const registry=await p.evaluate(async()=> (await (await fetch('/wizard/v1/apps')).json()).apps);
    const ids=['morning','wisdom','meditate','profiles','outline'].filter(id=>registry.some(a=>a.id===id));
    check(ids.length===5,'five real apps registered',JSON.stringify(ids));
    for(const id of ids) {
     await p.evaluate(id=>WizOpenApp(id),id);let frame;await p.waitForFunction(id=>[...document.querySelectorAll('iframe')].some(f=>f.src.includes('/'+id+'/')),id,{timeout:15000});
     frame=p.frames().find(f=>{try{return new URL(f.url()).pathname.startsWith('/'+id+'/')}catch{return false}});if(!frame){await p.waitForTimeout(1000);frame=p.frames().find(f=>f.url().includes('/'+id+'/'));}
     if(frame){await frame.waitForLoadState('domcontentloaded').catch(()=>{});await p.waitForTimeout(1500);const d=await frame.evaluate(()=>({title:document.title,text:document.body.innerText.length,nested:!!document.querySelector('#orbWrap')}));check(!!d.title&&d.text>20&&!d.nested,skin+' real app '+id,JSON.stringify(d));}else check(false,skin+' missing app '+id);
     await p.evaluate(id=>{const a=__wos;const w=Object.values(a.wins).find(w=>w.app==='frame'&&w.appId===id);if(w)a.closeWin(w.id);},id);
    }
    check(errors.length===0,skin+' staged page errors',JSON.stringify(errors));
   }
  }catch(e){check(false,skin+(baseline?' baseline':' candidate'),e.stack);await p.screenshot({path:path.join(out,skin+(baseline?'-before':'-after')+'-failure.png')});console.log('DIAGNOSTIC',await p.evaluate(()=>({text:document.body.innerText.slice(0,1200),cards:document.querySelectorAll('.ch-appcard-w,.ch-morning-w').length,errors:window.__qaErrors})),errors);}finally{await ctx.close();}
 }
 }finally{await b.close();}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed,failed},null,2));console.log(`${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
