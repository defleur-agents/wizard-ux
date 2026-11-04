"use strict";
const fs=require('node:fs'),path=require('node:path');
const ORIGIN='https://wizard.test';
const now=1793500000;
const row={id:'tap-thread',title:'Synthetic fixture thread',source:'wizard-mobile',status:'completed',message_count:2,hidden:false,started_at:now-60,last_active:now,wizard_last_user_at:now-30,wizard_last_assistant_at:now,latest_message:{role:'assistant',content:'Synthetic reply',timestamp:now}};
function app(id){return {id,name:id,url:'/'+id+'/',source:'apps.json',type:'view',kind:'app',status:'running',...(id==='morning'?{provides:['ready-extension']}:{})};}
function read(p){
 if(p==='/wizard/v1/bootstrap')return {bootstrap:1,settings:{agent:{name:'Synthetic Wizard'},clock:{timezone:'UTC'}},endpoints:{apps:'/wizard/v1/apps',sessions:'/wizard/hermes/api/sessions'}};
 if(p==='/wizard/v1/setup')return {first_run:false};
 if(p==='/wizard/hermes/api/model/options')return {provider:'fixture',model:'fixture',providers:[{slug:'fixture',authenticated:true,models:[{id:'fixture',name:'Fixture'}]}]};
 if(p==='/wizard/v1/apps')return {apps:[app('morning'),app('wisdom')]};
 if(p==='/wizard/v1/agents')return {agents:[{id:'hermes',is_default:true,label:'Synthetic Wizard',harness:'hermes',status:'running',privacy:'standard'}]};
 if(p==='/wizard/hermes/api/sessions')return {data:[row],has_more:false};
 if(p.endsWith('/messages'))return {data:[{role:'user',content:'Synthetic question',timestamp:now-30},{role:'assistant',content:'Synthetic reply',timestamp:now}],has_more:false};
 if(p==='/wizard/thread-seen')return {state:{initializedAt:1,threads:{}}};
 if(p==='/wizard/v1/ui-preferences')return {spaces:[],pinnedChats:[],migrations:{'launcher.v1':true,'launcher-seed-v1':true}};
 return {};
}
function staticResponse(r,root,relative){
 const file=path.resolve(root,decodeURIComponent(relative||'index.html'));
 if(!file.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return r.fulfill({status:404,body:''});
 return r.fulfill({path:file});
}
function seed(){if(window!==top)return;for(const[k,v]of Object.entries({'wos.coached':'true','wos.welcome.v1':'done','wos.voiceTipSeen':'true','wos.skin':'nebula'}))localStorage.setItem(k,v);}
module.exports={ORIGIN,row,read,app,staticResponse,seed};
