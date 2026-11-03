import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const src=readFileSync(new URL('../../web/core/chats.js',import.meta.url),'utf8');
const startMarker='  const MORNING =', endMarker='  // The agent\'s status line for a finished thread';
const start=src.indexOf(startMarker), end=src.indexOf(endMarker,start);
assert.ok(start>=0 && end>start,'Morning fixture source boundaries missing or out of order');
assert.equal(src.indexOf(startMarker,start+startMarker.length),-1,'Morning fixture start boundary is ambiguous');
assert.equal(src.indexOf(endMarker,end+endMarker.length),-1,'Morning fixture end boundary is ambiguous');
assert.match(src.slice(end),/^  \/\/ The agent's status line[^\n]*\n  const ATT =/,'Morning fixture end must immediately precede ATT');
const block=src.slice(start,end);
assert.match(block,/function morningCard\(/,'Morning fixture must include the complete card block');
const names=['workout','meditate','mindfeed','read'], labels={workout:'Workout',meditate:'Meditate',mindfeed:'MindFeed',read:'Read'};
export const state=(changes={})=>{
 const d={day:'2030-01-02',hidden:false,total:4,steps:Object.fromEntries(names.map(s=>[s,{done:false}])),...changes};
 d.done=names.filter(s=>d.steps[s].done).length;d.next=names.find(s=>!d.steps[s].done)||null;d.next_label=labels[d.next]||null;return d;
};
export const effect=(d,body)=>{const n=structuredClone(d);if('hidden'in body)n.hidden=body.hidden;else n.steps[body.step]={done:body.done};return state(n);};
export const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
export function fixture({thread=null,held=false,holdReads=false,panes=1}={}) {
 const requests=[], reads=[], frames=[], wins={desk:{app:'chats'},'desk::list':{thread}}, timers=new Map(), notices=[];
 let backend=state(), handler, timerId=0,renders=0;
 const htmlById=new Map(Array.from({length:panes},(_,i)=>[i?'desk2::list':'desk::list','old']));
 if(panes>1){wins.desk2={app:'chats'};wins['desk2::list']={thread};}
 const element=id=>({querySelector:s=>s==='.ch-list'?{}:s==='.ch-morning-w'?(htmlById.get(id)?{get outerHTML(){return htmlById.get(id);},set outerHTML(s){htmlById.set(id,s);},remove(){htmlById.set(id,'');}}:null):s==='[data-slot="ready-top"]'?{insertAdjacentHTML:(_,s)=>htmlById.set(id,s)}:null});
 const addFrame=(id='morning1')=>{const doc={hidden:false},source={document:doc,location:{href:'https://wizard.test/morning/'}},frame={src:'https://wizard.test/morning/',contentWindow:source,contentDocument:doc,isConnected:true,closest:()=>({dataset:{win:id}})};frames.push(frame);wins[id]={app:'frame',appId:'morning'};return{source,frame};};
 const first=addFrame();
 const c={URL,AbortController,Date,console,location:{origin:'https://wizard.test',href:'https://wizard.test/wizard-os-home/'},document:{hidden:false,addEventListener(){}},CH:Object.fromEntries([...htmlById.keys()].map(id=>[id,{}])),H:{root:()=>({querySelectorAll:()=>frames}),win:id=>wins[id]},owner:id=>id.replace(/::list$/,''),elOf:element,holdList:()=>held,renderChatList:()=>renders++,esc:s=>s,WizCanOpen:()=>true,toast:(...x)=>notices.push(x),addEventListener:(t,fn)=>{if(t==='message')handler=fn;},setTimeout:(f,ms)=>{const id=++timerId;timers.set(id,{f,ms});return id;},clearTimeout:id=>timers.delete(id)};
 c.window=c;
 c.fetch=(url,opt)=>{
  if(url.endsWith('/status')) {const gate=deferred();reads.push(gate);if(!holdReads)gate.resolve({ok:true,json:async()=>structuredClone(backend)});return gate.promise;}
  const gate=deferred();requests.push({gate,body:JSON.parse(opt.body),url});return gate.promise;
 };
 vm.createContext(c);vm.runInContext(block+'\nthis.current=()=>MORNING;this.canonical=()=>morningCanonical;this.hide=morningHide;this.poll=()=>morningPoll(true);this.card=morningCard;',c);
 const write=(step='workout',done=true,before=state(),source=first.source)=>c.WizMorningWrite(source,'step',{step,done,how:'tap'},before);
 const reply=(i,code=200,{commit=code===200,payload}={})=>{const r=requests[i];if(commit)backend=effect(backend,r.body);r.gate.resolve({ok:code===200,status:code,json:async()=>payload===undefined?structuredClone(backend):payload});};
 return{c,requests,reads,timers,notices,wins,first,addFrame,write,reply,html:(id='desk::list')=>htmlById.get(id),renders:()=>renders,backend:()=>backend,setBackend:d=>backend=d,message:(data,source=first.source)=>handler({origin:c.location.origin,source,data:{type:'wizard:morning',...data}})};
}
