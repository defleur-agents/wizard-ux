import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const chats=readFileSync(new URL('../web/core/chats.js',import.meta.url),'utf8');
const start=chats.indexOf('  const MORNING ='),end=chats.indexOf("  document.addEventListener('visibilitychange'",start);
const block=chats.slice(start,end);
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
for(const thread of [null,'open-thread']) for(const held of [false,true]) test(`Morning message paints pinned card despite thread=${thread}, hold=${held}`,async()=>{
 let handler,finish,rendered=0;const card={outerHTML:'old',remove(){this.outerHTML='removed';}},st={day:'day',done:0,total:4,next_label:'Workout'};
 const c={location:{origin:'https://wizard.test'},window:{WizCanOpen:()=>true},CH:{'desk::list':{}},H:{win:id=>id==='desk'?{app:'chats'}:{thread}},owner:()=> 'desk',elOf:()=>({querySelector:s=>s==='.ch-list'?{}:s==='.ch-morning-w'?card:null}),holdList:()=>held,renderChatList(){rendered++;},addEventListener:(type,fn)=>handler=fn,fetch:()=>new Promise(r=>finish=r),morningCard(){return `<b>${c.current().done}</b>`;}};
 vm.createContext(c);vm.runInContext(block+'\nthis.current=()=>MORNING.data;this.poll=morningPoll;',c);
 handler({origin:c.location.origin,data:{type:'wizard:morning',status:st,pending:false}});
 // Start a poll before the edit, with its old snapshot held at the transport.
 vm.runInContext('MORNING.at=0;morningPoll();',c);
 handler({origin:c.location.origin,data:{type:'wizard:morning',status:{...st,done:1},pending:true}});
 assert.equal(card.outerHTML,'<b>1</b>','visible card changes synchronously, no full-list paint required');
 finish({ok:true,json:async()=>st});await flush();assert.equal(c.current().done,1,'stale poll is fenced');
 handler({origin:c.location.origin,data:{type:'wizard:morning',status:st}});assert.equal(c.current().done,1,'legacy status cannot overwrite pending tap');
 handler({origin:c.location.origin,data:{type:'wizard:morning',status:st,pending:false}});assert.equal(card.outerHTML,'<b>0</b>','failed edit restores held card');
 assert.equal(rendered>0,!thread&&!held);
});

for (const code of [200,500]) test(`shell custody survives destroyed frame, response ${code}, clears latch and polls`,async()=>{
 const steps=['workout','meditate','mindfeed','read'];
 const state={day:'2030-01-02',done:0,total:4,hidden:false,steps:Object.fromEntries(steps.map(s=>[s,{done:false}]))};
 const source={document:{hidden:false}},frame={src:'https://wizard.test/morning/',contentWindow:source,isConnected:true,getClientRects:()=>[{}]};
 let finish,handler,notices=0,polls=0;
 const c={URL,location:{origin:'https://wizard.test',href:'https://wizard.test/wizard-os-home/'},document:{querySelectorAll:()=>frame.isConnected?[frame]:[]},window:{WizCanOpen:()=>true},CH:{},addEventListener:(t,f)=>handler=f,toast:()=>notices++,fetch:(url)=>{if(url.endsWith('/status')){polls++;return Promise.resolve({ok:true,json:async()=>state});}return new Promise(r=>finish=r);}};
 vm.createContext(c);vm.runInContext(block+'\nthis.current=()=>MORNING;this.poll=()=>{MORNING.at=0;morningPoll();};',c);
 const a=c.window.WizMorningWrite(source,'step',{step:'workout',done:true,how:'tap'},state);a.catch(()=>{});
 assert.equal(c.current().data.done,1,'same-task projection');
 assert.equal(c.current().pending,true);
 frame.isConnected=false;await flush();
 handler({origin:c.location.origin,data:{type:'wizard:morning',status:state,pending:false}});assert.equal(c.current().data.done,1);
 const canonical=structuredClone(state);canonical.steps.workout.done=true;
 finish({ok:code===200,status:code,json:async()=>canonical});
 if(code===200)await a;else await assert.rejects(a);
 assert.equal(c.current().pending,false,'removed frame cannot leave a permanent pending latch');
 assert.equal(c.current().data.done,code===200?1:0);assert.equal(notices,code===200?0:1);
 c.poll();await flush();assert.equal(polls,1,'canonical polling resumes after terminal settlement');
});

test('shell custody serializes different steps and preserves later projection on earlier failure',async()=>{
 const names=['workout','meditate','mindfeed','read'],state={day:'day',done:0,total:4,steps:Object.fromEntries(names.map(s=>[s,{done:false}]))};
 const source={document:{hidden:true}},frame={src:'https://wizard.test/morning/',contentWindow:source,isConnected:true,getClientRects:()=>[]};
 const requests=[];let notices=0;
 const c={URL,location:{origin:'https://wizard.test',href:'https://wizard.test/'},document:{querySelectorAll:()=>[frame]},window:{},CH:{},addEventListener(){},toast:()=>notices++,fetch:(u,o)=>new Promise(resolve=>requests.push({resolve,body:JSON.parse(o.body)}))};
 vm.createContext(c);vm.runInContext(block+'\nthis.current=()=>MORNING;',c);
 const a=c.window.WizMorningWrite(source,'step',{step:'workout',done:true,how:'tap'},state);a.catch(()=>{});
 const b=c.window.WizMorningWrite(source,'step',{step:'read',done:true,how:'sheet'},state);
 assert.equal(c.current().data.done,2);await flush();assert.equal(requests.length,1);
 requests[0].resolve({ok:false,status:500});await assert.rejects(a);await flush();
 assert.equal(c.current().data.done,1);assert.equal(requests.length,2);
 const st=structuredClone(state);st.steps.read.done=true;requests[1].resolve({ok:true,json:async()=>st});await b;
 assert.equal(c.current().pending,false);assert.equal(c.current().data.done,1);assert.equal(notices,1);
});
