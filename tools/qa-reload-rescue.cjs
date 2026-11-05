#!/usr/bin/env node
/* Closed synthetic shell: never contacts the owner server or opens owner audio. */
const {boot,assert,fs,path}=require('./qa-closed-shell.cjs');
const out=path.resolve(process.env.QA_OUT||'qa-reload-rescue');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const results=[];
 for(const skin of ['nebula','obsidian-light']){
  let revision='a'.repeat(40),uploaded=0,bytes=0,heads=0;
  const f=await boot({tree:process.env.QA_TREE,skin,configure:async c=>{
   await c.route('**/ux-version.txt',r=>r.fulfill({status:200,contentType:'text/plain',body:revision}));
   await c.route('**/synthetic-capture/',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Synthetic capture fixture</title>'}));
   await c.route('**/wizard/files/upload',async r=>{const b=r.request().postDataBuffer();assert.equal(r.request().method(),'POST');assert.deepEqual([...b],[0,255,128,9]);bytes=b.length;uploaded++;await r.fulfill({status:201,contentType:'application/json',body:JSON.stringify({file:{id:'wf_synthetic_recovered',bytes:b.length}})});});
   await c.route('**/wizard/files/wf_synthetic_recovered/content',async r=>{assert.equal(r.request().method(),'HEAD');heads++;await r.fulfill({status:200,headers:{'Content-Length':'4','Content-Type':'audio/webm'},body:''});});
  }});
  try{
   const p=f.page;
   await p.waitForFunction(()=>!!window.WizWebUpdate&&!!window.WizAppCapture&&!!window.WosSkin);
   await p.evaluate(async()=>{
    // Both browser-owned stores contain fixture bytes only. No persistent owner browser is used.
    const req=indexedDB.open('wizard-app-capture-v1',1);
    const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
    await new Promise((resolve,reject)=>{const tx=db.transaction(['sessions','chunks'],'readwrite');
      tx.objectStore('sessions').put({id:'synthetic-stale-note',appId:'messenger',kind:'audio',status:'pending',startedAt:Date.parse('2026-11-03T10:00:00Z'),durationMs:1,seq:2,bytes:4,mime:'audio/webm',meta:{}});
      tx.objectStore('chunks').put({id:'synthetic-stale-note',seq:0,source:'me',blob:new Blob([Uint8Array.of(0,255)])});
      tx.objectStore('chunks').put({id:'synthetic-stale-note',seq:1,source:'me',blob:new Blob([Uint8Array.of(128,9)])});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    await WizAppCapture.pending('messenger');
    for(const platform of ['mobile','desktop']){const apps=WizCore.apps(platform).APPS;const old=apps.find(a=>a.id==='messenger');if(old)Object.assign(old,{kind:'wizard',url:location.origin+'/synthetic-capture/'});else apps.push({id:'messenger',name:'Messenger',kind:'wizard',url:location.origin+'/synthetic-capture/'});}
    const frame=document.createElement('iframe');frame.style.display='none';frame.src='/synthetic-capture/';document.body.append(frame);await new Promise(r=>frame.onload=r);
    WizAppServices.attach(frame,{appId:'messenger',path:'/synthetic-capture/'});
    const client=WizAppServices.connect(frame.contentWindow);if(!client)throw Error('Synthetic app not authorized');
    window.__syntheticCaptureHold=client.update.hold('Recording');
    // This fixture app acknowledges that its own capture hold is empty after the host clears the row.
    addEventListener('wizard-app-capture-state',()=>{if(!WizAppCapture.staleTakes().length)window.__syntheticCaptureHold?.release()});
    await WizWebUpdate.check(true);
   });
   revision='b'.repeat(40);await p.evaluate(()=>WizWebUpdate.check(true));
   await p.evaluate(skin=>WosSkin.set(skin),skin);
   await p.waitForFunction(s=>WosSkin.current===s,skin);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
   await p.evaluate(()=>WosUpdates.popup());
   const popup=p.locator('.osu-pop');await popup.waitFor({state:'visible'});
   await assert.equal(await popup.getByText('Save to Files and clear',{exact:true}).count(),1);
   assert.match(await popup.innerText(),/Messenger.*(3 Nov|Nov 3)/);
   assert.match(await popup.innerText(),/Discard/);
   const geometry=await popup.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{background:s.backgroundColor,image:s.backgroundImage,opacity:s.opacity,width:r.width,height:r.height,left:r.left,right:r.right,bottom:r.bottom,viewport:innerWidth}});
   assert.equal(geometry.opacity,'1');assert(geometry.left>=0&&geometry.right<=geometry.viewport);assert(geometry.height>100);
   const shot=path.join(out,'phone-'+skin+'-rescue.png');await p.screenshot({path:shot});
   await popup.getByRole('button',{name:'Save to Files and clear',exact:true}).click();
   await p.waitForFunction(()=>!document.querySelector('.osu-pop [data-osu="rescue-save"]'));
   await p.waitForTimeout(1200);
   assert.equal(uploaded,1);assert.equal(bytes,4);assert.equal(heads,1);
   results.push({skin,shot,geometry,uploaded,bytes,heads,errors:f.errors});
   assert.deepEqual(f.errors,[]);
  }finally{await f.close()}
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({ok:true,results},null,2));console.log(JSON.stringify({ok:true,cases:results.length,results}));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
