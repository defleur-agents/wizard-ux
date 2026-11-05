'use strict';
// Real shell + shared viewer + real app-media bridge. Entirely synthetic; forum queue only.
// QA_TREE=<export> QA_OUT=<fresh-dir> [QA_RED=1] node qa-viewer-desktop-fit.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('./tools/qa-playwright.cjs');
const F=require('./tools/qa-closed-shell.cjs'),OUT=process.env.QA_OUT,RED=process.env.QA_RED==='1';
const Repair=require('./tools/viewer-qa-repair.cjs');
const SELECT=process.env.QA_ONLY?new Set(process.env.QA_ONLY.split('|')):null;
const results=[],geometries=[],captures=[];let browser,p,ctx,active='boot';
const state=()=>p.evaluate(()=>WosChat.viewer.state);
async function check(name,fn){if(SELECT&&!SELECT.has(name))return;active=name;try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:String(e.stack||e)});console.log('FAIL',name,String(e));if(p)await p.screenshot({path:path.join(OUT,'failure-'+results.length+'.png')}).catch(()=>{});}}
async function ready(){await p.waitForFunction(()=>{const i=document.querySelector('.mviewer img');return i&&i.complete&&i.naturalWidth>0});await F.settle(p);}
async function boot(phone=false){const b=await F.boot(phone,async c=>{
  await c.addInitScript(()=>{if(window!==window.top)return;window.__nativeKeys=[];window.addEventListener('keydown',e=>{if(!/^Arrow(Left|Right)$/.test(e.key))return;const row={key:e.key,trusted:e.isTrusted,target:e.target.tagName,path:e.composedPath().map(n=>n.tagName).filter(Boolean),prevented:e.defaultPrevented};__nativeKeys.push(row);setTimeout(()=>row.prevented=e.defaultPrevented,0)},true)});
  await c.route(/\/wizard\/v1\/apps(?:\?.*)?$/,r=>r.fulfill({json:{apps:[{id:'viewer-fixture',name:'Synthetic album',kind:'wizard',url:'/viewer-fixture/'}]}}));
  await c.route('**/viewer-fixture/**',r=>{
    const u=new URL(r.request().url());
    if(r.request().method()!=='GET')return r.fulfill({status:403,body:'No writes'});
    if(u.pathname==='/viewer-fixture/')return r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic album</title><button id="open">Open synthetic album</button><input id="draft" value="Synthetic unsent draft"><script>window.documentIdentity="synthetic-retained";window.arrows=0;addEventListener("keydown",e=>{if(/^Arrow/.test(e.key))arrows++});document.querySelector("#open").onclick=()=>parent.WizAppServices.connect(window,{}).media.view(parent.__album,1);</script>'});
    if(['/viewer-fixture/native-video.webm','/viewer-fixture/native-audio.wav'].includes(u.pathname)) {
      assert(process.env.QA_MEDIA_DIR,'sealed synthetic native media required');
      return r.fulfill({contentType:u.pathname.endsWith('.webm')?'video/webm':'audio/wav',body:fs.readFileSync(path.join(process.env.QA_MEDIA_DIR,path.basename(u.pathname)))});
    }
    const m=/^\/viewer-fixture\/(\d+)x(\d+)\.svg$/.exec(u.pathname);if(!m)throw Error('uncatalogued synthetic media');
    const w=+m[1],h=+m[2];return r.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#19344d"/><path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#8df" stroke-width="12"/><rect x="0" y="${h-30}" width="${w}" height="30" fill="#ffdf00"/><rect x="0" y="0" width="${w}" height="30" fill="#ef6b7b"/><text x="20" y="90" fill="white" font-size="45">SYNTHETIC ${w} × ${h}</text></svg>`});
  });
});ctx=b.c;p=F.getPage();p.setDefaultTimeout(10000);
await p.evaluate(()=>{const frame=document.createElement('iframe');frame.id='synthetic-album';frame.src='/viewer-fixture/';frame.style.cssText='position:fixed;left:24px;top:110px;width:550px;height:260px;z-index:60';(document.getElementById('device')||document.body).appendChild(frame);WizAppServices.attach(frame,{appId:'viewer-fixture',path:'/viewer-fixture/',isVisible:()=>true,isFront:()=>true});window.__album=[[2400,900],[786,1704],[1200,1200],[240,4800],[80,60]].map(([w,h],i)=>({url:`/viewer-fixture/${w}x${h}.svg`,name:`Synthetic ${i}: ${w}x${h}`,kind:'image',mime:'image/svg+xml'}));window.__underArrows=0;window.addEventListener('keydown',e=>{if(/^Arrow(Left|Right)$/.test(e.key))__underArrows++},true);});
await p.frameLocator('#synthetic-album').locator('#open').waitFor();return b;}
async function open(i=1){await p.evaluate(i=>WosChat.viewer.open(__album,i),i);await ready();}
async function clickOpen(){await p.frameLocator('#synthetic-album').locator('#open').click();await ready();}
async function geometry(){return p.evaluate(()=>{const v=document.querySelector('.mviewer'),s=v.querySelector('.mv-stage'),i=s.querySelector('img'),r=i.getBoundingClientRect(),b=s.getBoundingClientRect(),k=Math.min(r.width/i.naturalWidth,r.height/i.naturalHeight),w=i.naturalWidth*k,h=i.naturalHeight*k;return{shell:document.documentElement.dataset.shell,skin:window.WosSkin?.current,state:WosChat.viewer.state,viewport:{w:innerWidth,h:innerHeight},stage:b.toJSON(),pic:{left:r.left+(r.width-w)/2,right:r.left+(r.width+w)/2,top:r.top+(r.height-h)/2,bottom:r.top+(r.height+h)/2,w,h},ratio:i.naturalWidth/i.naturalHeight,controls:[...v.querySelectorAll('.mv-top button,.mv-bar button')].filter(e=>!e.hidden).map(e=>{const r=e.getBoundingClientRect();return{name:e.dataset.mv,rect:r.toJSON(),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})}});}
async function fits(label){const g=await geometry();geometries.push({label,...g});assert.equal(g.shell,'desktop');assert.equal(g.state.long,false,'desktop must not width-fit long images');const a=g.pic,b=g.stage;assert(a.left>=b.left-.6&&a.right<=b.right+.6&&a.top>=b.top-.6&&a.bottom<=b.bottom+.6,'entire painted photo within stage');assert(Math.abs(a.w/a.h-g.ratio)<.001,'aspect retained');assert(Math.abs((a.left+a.right)-(b.left+b.right))<1&&Math.abs((a.top+a.bottom)-(b.top+b.bottom))<1,'photo centred');assert(b.top>=0&&b.bottom<=g.viewport.h,'stage within viewport');for(const c of g.controls)assert(c.hit&&c.rect.top>=0&&c.rect.bottom<=g.viewport.h&&c.rect.left>=0&&c.rect.right<=g.viewport.w,'visible hit-tested '+c.name);}
async function capture(name){await F.settle(p);const file=path.join(OUT,name+'.png');await p.screenshot({path:file});captures.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),geometry:await geometry()});}
async function close(){await p.evaluate(()=>{while(WosChat.viewer.isOpen())WosChat.viewer.close()});}
async function drag(cdp,points,end){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});for(let j=1;j<=10;j++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points.map((x,k)=>({x:x.x+(end[k].x-x.x)*j/10,y:x.y+(end[k].y-x.y)*j/10}))});await p.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(100);}
async function opacity(name){return Repair.opacity({p,out:OUT,name,settle:F.settle});}
(async()=>{fs.mkdirSync(OUT,{recursive:true});browser=await chromium.launch({headless:true});F.setBrowser(browser);
try{
await boot();
await check('desktop portrait initial-fit',async()=>{await clickOpen();await capture('desktop-portrait-'+(RED?'before':'after'));await fits('initial portrait');});
await close();
await check('iframe gallery arrows focus/order/count/propagation',async()=>{await clickOpen();assert(await p.evaluate(()=>document.activeElement.classList.contains('mviewer')),'focus leaves original iframe');for(const [key,index]of [['ArrowRight',2],['ArrowRight',3],['ArrowLeft',2],['ArrowLeft',1],['ArrowLeft',0],['ArrowLeft',4],['ArrowRight',0]]){await p.keyboard.press(key);await ready();assert.equal((await state()).i,index);assert.equal(await p.locator('.mv-ti small').textContent(),`${index+1} of 5`);}assert.equal(await p.evaluate(()=>__underArrows),0,'underlying capture handler sees no gallery arrows');assert.equal(await p.frameLocator('#synthetic-album').locator('body').evaluate(()=>arrows),0);});
await check('native media controls seek without gallery navigation',async()=>{
  const journal=[];const cdp=await ctx.newCDPSession(p);
  try {
    // Observe only. No test keyboard listener changes time, focus or event cancellation.
    await p.evaluate(()=>{window.__nativeKeys=[]});
    for(const kind of ['video','audio']) for(const count of [1,3]) {
      await close();await p.evaluate(({kind,count})=>{const media={kind,url:kind==='video'?'/viewer-fixture/native-video.webm':'/viewer-fixture/native-audio.wav',name:'Synthetic native '+kind,mime:kind==='video'?'video/webm':'audio/wav'};WosChat.viewer.open(count===1?[media]:[__album[0],media,__album[2]],count===1?0:1)}, {kind,count});
      const selector='.mv-stage '+kind;
      await p.waitForFunction(s=>{const m=document.querySelector(s);return m&&m.readyState>=2&&Number.isFinite(m.duration)&&m.duration>20&&!m.error},selector);
      await p.locator(selector).evaluate(m=>{m.pause();m.currentTime=10});
      await p.waitForFunction(s=>Math.abs(document.querySelector(s).currentTime-10)<.1&&!document.querySelector(s).seeking,selector);
      // Focus Chromium's actual UA timeline, not a synthetic substitute or JS seek handler.
      const dom=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
      const walk=n=>[n,...(n.children||[]).flatMap(walk),...(n.shadowRoots||[]).flatMap(walk)];
      const timeline=walk(dom.root).find(n=>{const a=n.attributes||[];return a.includes('-webkit-media-controls-timeline')});
      assert(timeline,'real native media timeline');await cdp.send('DOM.focus',{backendNodeId:timeline.backendNodeId});
      assert(await p.locator(selector).evaluate(m=>m===document.activeElement&&m.controls),'native media host owns focus');
      const initial=await state();
      for(const [key,direction] of [['ArrowRight',1],['ArrowLeft',-1]]) {
        const before=await p.locator(selector).evaluate(m=>m.currentTime),start=await p.evaluate(()=>__nativeKeys.length);
        await p.keyboard.press(key);await p.waitForTimeout(120);
        const after=await p.locator(selector).evaluate(m=>m.currentTime),events=await p.evaluate(start=>__nativeKeys.slice(start),start),current=await state();
        const row={kind,count,key,before,after,delta:after-before,events,indexBefore:initial.i,indexAfter:current.i,timelineBackendNodeId:timeline.backendNodeId};journal.push(row);fs.writeFileSync(path.join(OUT,'native-media-keys.json'),JSON.stringify(journal,null,2));
        assert(events.length===1&&events[0].trusted&&events[0].target===kind.toUpperCase()&&!events[0].prevented,'trusted retargeted native key must remain uncancelled');
        assert.equal(current.i,initial.i,'native seek must not navigate gallery');assert(current.open);
        assert(direction*(after-before)>.01,'native browser seeking must change currentTime in the requested direction');
      }
    }
  }finally{await cdp.detach();await close();}
});
if(!RED){
await check('desktop shapes at large/small/resized hosts',async()=>{for(const size of [{width:1440,height:900},{width:760,height:540},{width:420,height:650}]){await p.setViewportSize(size);for(let i=0;i<5;i++){await open(i);await fits(`${size.width}x${size.height} item ${i}`)}}await p.setViewportSize({width:1440,height:900});});
await check('desktop explicit zoom/reset still works',()=>Repair.zoom({p,out:OUT,settle:F.settle,state,open,fits:process.env.QA_ZOOM_DIAGNOSTIC==='1'?null:fits}));
await check('two real skins/live switch/opaque chrome and menu',async()=>{await Repair.paintCalibration({p,out:OUT});await open();for(const skin of ['nebula','signal','sepia']){await p.evaluate(skin=>WosSkin.set(skin),skin);await p.waitForFunction(skin=>WosSkin.current===skin&&document.documentElement.dataset.skin===skin,skin);await F.settle(p);await fits(skin);await opacity(skin);await capture('desktop-'+skin);await p.locator('.mv-stage img').click({button:'right'});await opacity(skin+' menu');await p.keyboard.press('Escape');assert((await state()).open&&!(await state()).menu,'Escape closes only menu');}});
await check('Share and Save retain selected synthetic file',async()=>{await p.evaluate(()=>{window.WosShareSheet=null;window.__shared=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async x=>{__shared.push({name:x.files?.[0]?.name,size:x.files?.[0]?.size})}})});await open(2);await p.locator('[data-mv="share"]').click();await p.waitForFunction(()=>__shared.length===1);assert.equal(await p.evaluate(()=>__shared[0].name),'Synthetic 2: 1200x1200');const download=p.waitForEvent('download');await p.locator('[data-mv="save"]').click();const d=await download;assert((await d.suggestedFilename()).includes('Synthetic 2'));assert.equal(await d.failure(),null);});
await check('Escape/outside close only viewer and restore app focus/draft',async()=>{await close();await clickOpen();const before=await p.frameLocator('#synthetic-album').locator('#draft').inputValue();await p.keyboard.press('Escape');assert(!(await state()).open);assert.equal(await p.evaluate(()=>document.activeElement.id),'synthetic-album');assert.equal(await p.frameLocator('#synthetic-album').locator('#draft').inputValue(),before);await clickOpen();const g=await geometry();await p.mouse.click(g.stage.left+4,(g.stage.top+g.stage.bottom)/2);assert(!(await state()).open);assert.equal(await p.frameLocator('#synthetic-album').locator('body').evaluate(()=>documentIdentity),'synthetic-retained');});
if(!SELECT || [...SELECT].some(name=>name.startsWith('phone '))){
await ctx.close();await boot(true);
await check('phone UA/touch long-reading pan/fling and bottom reach',()=>Repair.phoneBottom({p,ctx,out:OUT,drag,open,state,capture}));
await check('phone pinch/pan/reset and gallery swipe preserve order',()=>Repair.phoneGestures({p,ctx,out:OUT,drag,open,state,capture,settle:F.settle}));
await check('phone Back/menu/outside retain mounted synthetic app',async()=>{await p.evaluate(()=>WosChat.viewer.menu());await p.evaluate(()=>__wosNativeBack());assert((await state()).open&&!(await state()).menu);await p.evaluate(()=>__wosNativeBack());assert(!(await state()).open);assert.equal(await p.frameLocator('#synthetic-album').locator('#draft').inputValue(),'Synthetic unsent draft');await open(0);const g=await geometry();await p.touchscreen.tap(g.stage.left+4,g.stage.top+4);assert(!(await state()).open);});
}
}
await ctx.close();
if(!RED) await check('standalone dark fallback without Appearance host',async()=>{
  ctx=await browser.newContext({viewport:{width:1100,height:760},serviceWorkers:'block'});
  const tree=process.env.QA_TREE||__dirname;
  await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(r.request().method()!=='GET'||u.origin!=='https://viewer.invalid')return r.abort();if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html data-shell="desktop"><link rel="stylesheet" href="/core/base.css"><link rel="stylesheet" href="/core/chats.css"><script src="/core/chat-kit.js"></script><body><button id="source">Synthetic standalone</button>'});if(['/core/base.css','/core/chats.css','/core/chat-kit.js'].includes(u.pathname))return r.fulfill({contentType:u.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(tree,'web',u.pathname))});return r.abort()});
  p=await ctx.newPage();await p.goto('https://viewer.invalid/');await p.evaluate(()=>{const c=document.createElement('canvas');c.width=786;c.height=1704;const g=c.getContext('2d');g.fillStyle='#19344d';g.fillRect(0,0,c.width,c.height);window.__album=[{url:c.toDataURL(),kind:'image',name:'Synthetic standalone'}];WosChat.viewer.open(__album)});await ready();
  await opacity('standalone-dark');assert.equal(await p.evaluate(()=>document.documentElement.dataset.skin),undefined);await capture('standalone-dark');await ctx.close();
});
}catch(e){results.push({name:active,pass:false,harnessError:String(e.stack||e)});}finally{await browser?.close();const report={red:RED,source:process.env.QA_SOURCE_SHA,synthetic:true,physicalDevice:false,results,geometries,captures,transport:F.report};fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,unknown:F.report.unknown,errors:F.report.errors}));if(F.report.unknown.length||F.report.errors.length)process.exitCode=2;else process.exitCode=results.some(x=>!x.pass)?1:0;}
})().catch(e=>{console.error(e);process.exitCode=2});
