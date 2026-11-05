// Candidate shell screenshots + real picker/hold regression. CI or approved Forum worker only.
// QA_PREVIEW_URL can target the delivered private route; otherwise starts the same synthetic preview origin.
const { chromium } = require('./tools/qa-playwright.cjs');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const out = process.env.QA_SHOTS || path.join(__dirname, 'qa-results/backgrounds-orb');
fs.mkdirSync(out,{recursive:true});
let origin=process.env.QA_PREVIEW_URL, server, browser;
const cases=[],errors=[];
const record=(name,value=true)=>{assert.ok(value,name);cases.push({name,pass:true});console.log('PASS',name);};
const shot=(p,name)=>p.screenshot({path:path.join(out,name+'.png')});
const ready=p=>p.waitForFunction(()=>window.WosSkin && window.WosExperience && !WosExperience.state.busy && (window.__wux || window.__wos),null,{timeout:30000});
async function main(){
  if(!origin){
    origin='http://127.0.0.1:9376';
    server=spawn(process.execPath,['tools/qa-origin.cjs','9376'],{cwd:__dirname,env:{...process.env,QA_SAMPLE_BG_ORB:'1'},stdio:['ignore','inherit','inherit']});
    let response;for(let i=0;i<40;i++){try{response=await fetch(origin+'/__preview/receipt');if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(response?.ok,'synthetic origin bound');
  }
  browser=await chromium.launch({executablePath:process.env.QA_CHROME || undefined});
  const desktop=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block',ignoreHTTPSErrors:true});
  const p=await desktop.newPage();p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(origin+'/wizard-os-home/?shell=desktop&view=skin');await ready(p);
  await p.waitForSelector('[data-bgpick="living"]');
  record('fresh desktop starts on living canvas',await p.evaluate(()=>WosSkin.wallpaper==='living'));
  for(const [palette,image] of [['nebula','lake'],['grove','landscapes']]){
    await p.locator(`[data-skinpick="${palette}"]`).click();
    await p.waitForFunction(id=>WosSkin.current===id,palette);
    await p.locator(`[data-bgpick="${image}"]`).click();
    await p.waitForFunction(([id,img])=>WosSkin.current===id&&WosSkin.wallpaper===img,[palette,image]);
    await p.waitForFunction(()=>{const c=document.getElementById('skinA');if(!c?.width||+c.style.opacity<.9)return false;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let min=255,max=0;for(let i=0;i<d.length;i+=Math.max(4,Math.floor(d.length/400/4)*4)){min=Math.min(min,d[i]);max=Math.max(max,d[i]);}return max-min>20;});
    record(palette+': real Background card preserves color and paints an image');
    const panels=await p.locator('.win:visible').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));
    record(palette+': text windows are fully opaque',panels.length>0&&panels.every(c=>!c.includes('rgba')&&!c.includes('/')));
    await shot(p,'desktop-'+palette+'-'+image+'-picker');
    await p.evaluate(()=>{__wux.closeSettings();__wux.goHome();});await shot(p,'desktop-'+palette+'-'+image+'-home');
    await p.reload();await ready(p);
    record(palette+': selection survives reload',await p.evaluate(img=>WosSkin.wallpaper===img,image));
    await p.evaluate(()=>__wux.openSettings('look'));await p.waitForSelector('[data-bgpick="living"]');
  }
  await p.locator('[data-bgpick="living"]').click();
  record('Living canvas restores scenery without changing color',await p.evaluate(()=>WosSkin.current==='grove'&&WosSkin.wallpaper==='living'&&!document.documentElement.hasAttribute('data-image-background')));
  await p.locator('[data-skinfamily="mizel"]').click();await p.waitForSelector('[data-bgpick="sea"]');
  await p.locator('[data-bgpick="sea"]').click();await p.waitForFunction(()=>WosSkin.current==='landscapes'&&WosSkin.wallpaper==='sea');
  await p.waitForTimeout(800);await shot(p,'desktop-mizel-sea-picker');
  await p.evaluate(()=>{__wux.closeSettings();__wux.goHome();});await shot(p,'desktop-mizel-sea-home');
  record('Mizel keeps its existing Background/Mode picker and independent preference');
  await p.evaluate(()=>__wux.openSettings('look'));await p.locator('[data-skinmode="light"]').click();
  await p.waitForFunction(()=>WosSkin.current==='landscapes-light'&&WosSkin.wallpaper==='sea');record('Mizel light mode preserves chosen image');
  await p.locator('[data-skinfamily="wizard"]').click();await p.waitForSelector('[data-bgpick="living"]');
  record('switching back to Wizard keeps living-canvas reset',await p.evaluate(()=>WosSkin.wallpaper==='living'));
  const phone=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce',serviceWorkers:'block',ignoreHTTPSErrors:true,userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'});
  const q=await phone.newPage();q.on('pageerror',e=>errors.push(String(e)));
  await q.goto(origin+'/wizard-os-home/?shell=phone');await ready(q);await q.waitForFunction(()=>window.WosOrbSwitcher?.active());
  record('phone starts with core radial and no activation tweak',await q.evaluate(()=>!WosExperience.state.tweaks.some(t=>t.id==='wizard/orb-radial')));
  await q.evaluate(()=>__wos.openSheet('settings'));await q.locator('[data-st-page="appearance"]').click();
  record('phone Wizard background behaviour is unchanged',await q.locator('[data-bgpick]').count()===0);
  await q.evaluate(()=>WosSettings.focus('orb-switcher'));await q.locator('[data-orbsw-open]').click();
  await q.locator('[data-app="preview-notes"] [data-pin]').click();
  await q.locator('[data-app="preview-calendar"] [data-pin]').click();
  await q.locator('.wor-sheet [data-close]').click();await q.evaluate(()=>__wos.closeSheets());
  const cdp=await phone.newCDPSession(q);
  const orb=await q.locator('#orbWrap').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:orb.x+orb.width/2,y:orb.y+orb.height/2,id:1}]});
  await q.waitForSelector('.wor.on');await q.waitForTimeout(600);
  record('physical phone hold opens pins, microphone and Customize without recording',await q.evaluate(()=>WosOrbSwitcher.isOpen&&__wos.voice==='idle'&&document.querySelectorAll('.wor-ic.app').length===2));
  await shot(q,'phone-nebula-radial-open');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await q.waitForFunction(()=>!WosOrbSwitcher.isOpen);record('release in cancel zone closes without voice',await q.evaluate(()=>__wos.voice==='idle'));
  await q.reload();await ready(q);record('phone pins survive reload',await q.evaluate(()=>WosOrbSwitcher.get().pins.join(',')==='preview-notes,preview-calendar'));
  record('zero unexpected page errors',errors.length===0);
  const receipt=await (await fetch(origin+'/__preview/receipt')).json();record('no sends or runs admitted',receipt.synthetic&&receipt.upstream===false&&receipt.runs===0);
  record('server refuses real mutation path',(await fetch(origin+'/wizard/hermes/v1/runs',{method:'POST',body:'{}'})).status===403);
  await desktop.close();await phone.close();
}
main().catch(e=>{console.error(e);errors.push(String(e));process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();if(server)server.kill();
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({cases,pass:cases.length,errors,origin,sha:process.env.GITHUB_SHA||process.env.PREVIEW_SHA||null},null,2));
});
