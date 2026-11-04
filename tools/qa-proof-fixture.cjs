"use strict";
const fs=require('node:fs'),path=require('node:path');
const {responseFor}=require('./qa-synthetic-fence.cjs');
const ORIGIN='https://wizard.test';
const now=1793500000;
const row={id:'tap-thread',title:'Synthetic fixture thread',source:'wizard-mobile',status:'completed',message_count:2,hidden:false,started_at:now-60,last_active:now,wizard_last_user_at:now-30,wizard_last_assistant_at:now,latest_message:{role:'assistant',content:'Synthetic reply',timestamp:now}};
function app(id){return {id,name:id,url:'/'+id+'/',source:'apps.json',type:'view',kind:'app',status:'running',...(id==='morning'?{provides:['ready-extension']}:{})};}
// Explicit path catalogue for these shell proofs. Query filtering/paging belongs
// to each proof's overrides; no arbitrary session IDs or suffix matches admitted.
const bodies={
 '/wizard/v1/bootstrap':{bootstrap:1,settings:{agent:{name:'Synthetic Wizard'},clock:{timezone:'UTC'}},endpoints:{apps:'/wizard/v1/apps',sessions:'/wizard/hermes/api/sessions'}},
 '/wizard/v1/setup':{first_run:false},
 '/wizard/hermes/api/model/options':{provider:'fixture',model:'fixture',providers:[{slug:'fixture',authenticated:true,models:[{id:'fixture',name:'Fixture'}]}]},
 '/wizard/v1/apps':{apps:[app('morning'),app('wisdom')]},
 '/wizard/v1/agents':{agents:[{id:'hermes',is_default:true,label:'Synthetic Wizard',harness:'hermes',status:'running',privacy:'standard'}]},
 '/wizard/hermes/api/sessions':{data:[row],has_more:false},
 '/wizard/hermes/api/sessions/tap-thread':{session:row},
 '/wizard/hermes/api/sessions/tap-thread/messages':{data:[{role:'user',content:'Synthetic question',timestamp:now-30},{role:'assistant',content:'Synthetic reply',timestamp:now}],has_more:false},
 '/wizard/thread-seen':{state:{initializedAt:1,threads:{}}},
 '/wizard/v1/ui-preferences':{spaces:[],pinnedChats:[],migrations:{'launcher.v1':true,'launcher-seed-v1':true}},
 // Intentionally empty capabilities, not a successful fallback for unknown APIs.
 '/wizard/thread-dispositions':{state:{}},
 '/wizard/v1/boomerangs':{reminders:[]},
 '/wizard/attention':{items:[]},
 '/wizard/v1/workspaces':{workspaces:[]},
};
const fixture={base:ORIGIN,responses:Object.fromEntries(Object.entries(bodies).flatMap(([p,body])=>['GET','HEAD','OPTIONS'].map(method=>[method+' '+p,{status:200,body:JSON.stringify(body)}])))};
function read(p,method='GET'){
 return JSON.parse(responseFor(fixture,p,method).body);
}
function staticResponse(r,root,relative){
 const file=path.resolve(root,decodeURIComponent(relative||'index.html'));
 if(!file.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return r.fulfill({status:404,body:''});
 return r.fulfill({path:file});
}
function seed(){if(window!==top)return;for(const[k,v]of Object.entries({'wos.coached':'true','wos.welcome.v1':'done','wos.voiceTipSeen':'true','wos.skin':'nebula'}))localStorage.setItem(k,v);}
module.exports={ORIGIN,row,read,app,staticResponse,seed};
