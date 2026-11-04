'use strict';
// Focused extension of qa-model-picker-bounds.cjs: same real shell + draft picker boot.
// All static bytes from QA_TREE; every API synthetic; no upstream fetch/continue.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('./tools/qa-playwright.cjs');
const TREE = path.resolve(process.env.QA_TREE || __dirname), OUT = path.resolve(process.env.QA_OUT);
const TREE_ID = process.env.QA_TREE_ID;
assert.match(TREE_ID,/^[0-9a-f]{40}$/,'exact source web tree required');
const SUB = 'claude-subscription-directsdk-experimental';
const catalogue = {model:'gpt-6.1-sol',provider:'openai-codex',providers:[
  {slug:'openai-codex',authenticated:true,models:['gpt-6.1-sol','gpt-6.1-astra']},
  {slug:SUB,authenticated:true,models:['claude-opus-5-5[1m]','claude-sonnet-5[1m]']},
  {slug:'anthropic',authenticated:true,models:['claude-opus-5-5','claude-sonnet-5-5']}
]};
const report = {fixtureOnly:true,tree:TREE,cases:[],requests:[],failures:[]};
fs.mkdirSync(OUT,{recursive:true});
function check(value, name, detail) { if (!value) report.failures.push({case:report.current,name,detail}); }
const persist = () => fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');
async function opaque(page, tag) {
  const clip = await page.locator('.ch-mpop .ch-sheet-b').evaluate(card => {
    card.style.willChange='transform';
    const loud=document.createElement('div'); loud.dataset.qaLoud='';
    loud.style.cssText='position:absolute;inset:0;overflow:hidden;background:repeating-linear-gradient(90deg,#f0f 0 8px,#0f0 8px 16px);color:red;font-size:24px;pointer-events:none';
    loud.textContent='LOUD TEXT BEHIND THE PICKER '.repeat(500);card.parentElement.prepend(loud);
    const r=card.getBoundingClientRect(),p=card.parentElement.getBoundingClientRect();return {inside:{x:Math.ceil(r.x+18),y:Math.ceil(r.y+18),width:Math.floor(r.width-36),height:Math.floor(r.height-36)},outside:{x:Math.ceil(p.x+3),y:Math.ceil(p.y+3),width:8,height:8}};
  });
  assert(clip.inside.width>0&&clip.inside.height>0,'usable opacity region');
  const control=await page.screenshot({clip:clip.outside,animations:'disabled'});
  const a=await page.screenshot({clip:clip.inside,animations:'disabled',path:path.join(OUT,tag+'-opaque-loud.png')});
  await page.locator('[data-qa-loud]').evaluate(e=>e.style.visibility='hidden');
  const b=await page.screenshot({clip:clip.inside,animations:'disabled',path:path.join(OUT,tag+'-opaque-blank.png')});
  const blank=await page.screenshot({clip:clip.outside,animations:'disabled'});
  check(!control.equals(blank),'opacity-outside-control-changes');
  check(a.equals(b),'opaque-panel-pixels');await page.locator('[data-qa-loud]').evaluate(e=>e.remove());
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME,args:['--no-sandbox','--disable-background-networking']});
  try { for(const shell of ['phone','desktop']) {
    const phone=shell==='phone';
    const ctx=await browser.newContext({viewport:phone?{width:412,height:892}:{width:1440,height:960},serviceWorkers:'block',
      ...(phone?{isMobile:true,hasTouch:true,deviceScaleFactor:1,userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'}:{})});
    await ctx.route('**/*',async r=>{
      const q=r.request(),u=new URL(q.url()),p=u.pathname;
      const event={shell,method:q.method(),path:p,kind:''};report.requests.push(event);
      const json=(v,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
      if(u.origin!=='https://wizard.test'){event.kind='blocked-outbound';return r.abort();}
      if(!['GET','HEAD'].includes(q.method())){event.kind='refused-write';event.status=403;return json({error:'Synthetic QA refuses all writes'},403);}
      event.kind='synthetic-api';
      if(p==='/wizard/hermes/api/model/options')return json(catalogue);
      if(p==='/wizard-claude/api/accounts')return json({accounts:[{id:'claude-subscription',status:'connected'}]});
      if(p==='/wizard/v1/agents')return json({agents:[{id:'hermes',label:'Fixture agent',is_default:true,harness:'hermes',privacy:'standard',status:'running'}]});
      if(p==='/wizard/v1/bootstrap')return json({bootstrap:1,settings:{owner:{name:'Fixture owner'},agent:{name:'Fixture agent'},clock:{timezone:'UTC'},voice:{}},endpoints:{apps:'/wizard/v1/apps',sessions:'/wizard/hermes/api/sessions',runs:'/wizard/hermes/v1/runs'},capabilities:{}});
      if(p==='/wizard/v1/setup')return json({first_run:false});
      if(p==='/wizard/v1/apps'||p==='/wizard-os-home/installed-apps')return json({apps:[]});
      if(p==='/wizard/hermes/api/sessions')return json({data:[],has_more:false,list_version:1});
      if(p==='/wizard/thread-seen')return json({state:{initializedAt:1,threads:{}}});
      if(p.includes('ui-preferences'))return json({migrations:{'launcher-seed-v1':'fixture'},launcher:{}});
      if(p==='/wizard-os-home/ux-version.txt'){event.kind='synthetic-metadata';return r.fulfill({status:200,body:TREE_ID+'\n'});}
      if(p==='/wizard-os-home/ux-changes.json')return json({v:1,head:TREE_ID,updates:[]});
      if(p==='/wizard-os-home/data.js'||p==='/wizard-os-home/summaries.js'){event.kind='synthetic-content';return r.fulfill({status:200,contentType:'application/javascript',body:''});}
      // Same bounded empty dynamic contracts used by the original picker harness.
      // No fallthrough reaches a real Service, owner catalogue, history or inference.
      if(p.startsWith('/wizard/')||p.startsWith('/wizard-claude/')||p.startsWith('/wizard-chatgpt/')||p.startsWith('/wizard-tinfoil/'))return json({});
      const prefix='/wizard-os-home/';
      if(!p.startsWith(prefix)){event.kind='missing';return r.fulfill({status:404,body:''});}
      const rel=decodeURIComponent(p.slice(prefix.length))||'index.html',file=path.resolve(TREE,'web',rel);
      if(!file.startsWith(path.join(TREE,'web')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){event.kind='missing';return r.fulfill({status:404,body:''});}
      event.kind='source-static';
      const types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
      return r.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    });
    await ctx.addInitScript(()=>{try{
      localStorage.setItem('wos.skin','nebula');localStorage.setItem('wos.skin.composition.v1',JSON.stringify({version:1,extends:'nebula'}));
      // No sticky shell override: phone must really be selected from Android UA/touch.
      for(const k of ['wos.coached','wos.tour.v1','wos.tour.done'])localStorage.setItem(k,'true');
      localStorage.setItem('wos.welcome.v1','done');
    }catch{}});
    const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(12000);
    page.on('pageerror',e=>errors.push(e.message));
    const root=phone?'__wos':'__wux';
    try {
      await page.goto('https://wizard.test/wizard-os-home/'+(phone?'':'desktop.html'),{waitUntil:'load'});
      await page.waitForFunction(root=>window[root]?.chats&&WizConfig.live,root);
      await page.waitForFunction(()=>window.__welcomeLog?.includes('boot:true:done:false'));
      check(await page.evaluate(()=>document.documentElement.dataset.shell)===shell,'actual-shell');
      check(await page.evaluate(()=>!window.WosWelcome?.active),'welcome-inactive');
      if(phone)await page.evaluate(()=>__wos.openApp(WizCore.apps('mobile').APPS.find(a=>a.id==='wizard')));
      await page.waitForFunction(root=>Object.values(window[root].wins).some(w=>w.app==='chats'),root);
      const wid=await page.evaluate(root=>{const a=window[root],w=Object.values(a.wins).find(w=>w.app==='chats');a.chats.openNewDraft(w.id,'');return w.id;},root);
      await page.waitForFunction(()=>WosModels.ready&&WosAgents.ready);
      const host=page.locator(`[data-chats="${wid}"]`),draft='Keep this unsent Sonnet picker fixture.';
      const ta=host.locator('.ch-compose textarea');await ta.waitFor({state:'visible'});await ta.fill(draft);
      for(const skin of ['nebula','obsidian-light']) {
        const tag=shell+'-'+skin;report.current=tag;
        try {
          if(skin!=='nebula')await page.evaluate(s=>WosSkin.set(s),skin);
          await page.waitForFunction(s=>WosSkin.current===s&&document.documentElement.dataset.skin===s,skin);
          await page.locator('.mz-intro').waitFor({state:'detached'});
          await page.waitForFunction(()=>!WosExperience?.state.busy);
          await host.locator('[data-chmodel]').click();await page.locator('.ch-mpop [data-mall]').click();
          const sonnet=page.locator('.ch-mpop [data-mpick]').filter({hasText:/Sonnet/});await sonnet.waitFor({state:'visible'});await sonnet.scrollIntoViewIfNeeded();
          await page.waitForTimeout(600); // finite desk/picker transitions, not a readiness substitute
          const state=await page.evaluate(({wid,root})=>{
            const a=window[root],c=a.chats.ch(wid),cur=c.newModel||WosModels.currentRoute('');
            const list=WosModels.popHtml({mode:'new',cur,all:true}).list;
            const o=list.find(o=>WosModels.family(o.value,o.provider)==='claude:sonnet');
            return {sonnet:o,def:WosModels.defaultOption(),legacy:WosModels.options.some(o=>o.provider==='claude-subscription-directsdk-experimental'&&o.value==='claude-sonnet-5[1m]'),skin:WosSkin.current,shell:document.documentElement.dataset.shell};
          },{wid,root});
          const index=await sonnet.getAttribute('data-mpick');
          check(!!state.sonnet&&state.sonnet.value==='claude-sonnet-5-5'&&state.sonnet.provider==='anthropic','connected-native-sonnet',state.sonnet);
          check(state.def.value==='gpt-6.1-sol'&&state.def.provider==='openai-codex','sol-default-unchanged',state.def);
          check(state.legacy,'legacy-option-retained');
          await page.screenshot({path:path.join(OUT,tag+'-expanded.png'),animations:'disabled'});
          await opaque(page,tag);
          await sonnet.click();
          await page.waitForFunction(({root,wid})=>window[root].chats.ch(wid).newModel?.model?.startsWith('claude-sonnet'),{root,wid});
          const selected=await page.evaluate(({root,wid})=>window[root].chats.ch(wid).newModel,{root,wid});
          check(selected.model===state.sonnet.value&&selected.provider===state.sonnet.provider,'clicked-row-route',selected);
          check(await ta.inputValue()===draft,'draft-preserved');
          check(await page.evaluate(()=>WosModels.defaultOption().value)==='gpt-6.1-sol','global-default-after-pick');
          await page.screenshot({path:path.join(OUT,tag+'-selected.png'),animations:'disabled'});
          // Return only this disposable draft to Sol; no API persistence or inference.
          await host.locator('[data-chmodel]').click();await page.locator('.ch-mpop [data-mpick]').filter({hasText:/^Sol$/}).click();
          report.cases.push({tag,state,index,selected});persist();
        }catch(e){report.failures.push({case:tag,name:'harness-error',detail:String(e.stack||e)});await page.screenshot({path:path.join(OUT,tag+'-failure.png')}).catch(()=>{});persist();}
      }
      check(errors.length===0,'no-page-errors',errors);
    }catch(e){report.failures.push({case:shell,name:'boot-error',detail:String(e.stack||e),welcome:await page.evaluate(()=>window.__welcomeLog).catch(()=>null)});await page.screenshot({path:path.join(OUT,shell+'-boot-failure.png')}).catch(()=>{});persist();}
    finally {await ctx.close();}
  }}finally{await browser.close();persist();}
  check(report.cases.length===4,'complete-four-case-matrix',report.cases.map(c=>c.tag));
  check(!report.requests.some(r=>r.kind==='blocked-outbound'),'zero-outbound');
  check(!report.requests.some(r=>/\/runs(?:\/|$)/.test(r.path)),'zero-inference-attempts');
  persist();console.log(JSON.stringify({cases:report.cases.length,failures:report.failures}));process.exitCode=report.failures.length?1:0;
})().catch(e=>{report.failures.push({name:'fatal',detail:String(e.stack||e)});persist();console.error(e);process.exitCode=2;});
