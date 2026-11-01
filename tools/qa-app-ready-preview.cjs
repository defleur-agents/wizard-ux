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
   await p.goto(base+'/__preview/reset');await p.goto(base+'/wizard-os-home/?open=chats&shell=phone',{waitUntil:'domcontentloaded'});
   const selector=baseline?'.ch-morning-w':'.ch-appcard-w';await p.locator(selector+':visible').first().waitFor({timeout:45000});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1200);
   check(await p.evaluate(s=>document.documentElement.dataset.skin===s,skin),skin+' real staged skin');
   const key=skin+(baseline?'-before':'-after');shots[key]=await p.locator(selector+':visible').first().screenshot({path:path.join(out,key+'-card.png')});
   await p.screenshot({path:path.join(out,key+'-shell.png')});
   if(!baseline) {
    check(shots[skin+'-before'].equals(shots[key]),skin+' card pixel-identical to live HEAD');
    const registry=await p.evaluate(async()=> (await (await fetch('/wizard/v1/apps')).json()).apps);
    const ids=['morning','wisdom','meditate','profiles','shopping'].filter(id=>registry.some(a=>a.id===id));
    check(ids.length===5,'five real apps registered',JSON.stringify(ids));
    for(const id of ids) {
     await p.evaluate(id=>WizOpenApp(id),id);let frame;await p.waitForFunction(id=>[...document.querySelectorAll('iframe')].some(f=>f.src.includes('/'+id+'/')),id,{timeout:15000});
     frame=p.frames().find(f=>new URL(f.url()).pathname.startsWith('/'+id+'/'));if(!frame){await p.waitForTimeout(1000);frame=p.frames().find(f=>f.url().includes('/'+id+'/'));}
     if(frame){await frame.waitForLoadState('domcontentloaded').catch(()=>{});await p.waitForTimeout(1500);const d=await frame.evaluate(()=>({title:document.title,text:document.body.innerText.length,nested:!!document.querySelector('#orbWrap')}));check(!!d.title&&d.text>20&&!d.nested,skin+' real app '+id,JSON.stringify(d));}else check(false,skin+' missing app '+id);
     await p.evaluate(id=>{const a=__wos;const w=Object.values(a.wins).find(w=>w.app===id);if(w)a.closeWin(w.id);},id);
    }
    check(errors.length===0,skin+' staged page errors',JSON.stringify(errors));
   }
  }catch(e){check(false,skin+(baseline?' baseline':' candidate'),e.stack);}finally{await ctx.close();}
 }
 }finally{await b.close();}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed,failed},null,2));console.log(`${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
