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
