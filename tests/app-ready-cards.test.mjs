import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../web/core/chats.js', import.meta.url), 'utf8');
const apps = readFileSync(new URL('../web/core/apps.js', import.meta.url), 'utf8');
const fn = (s, name) => { const i = s.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return s.slice(i, s.indexOf('\n  }', i) + 4); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = () => ({day:'day',done:1,total:4,next_label:'Water',hidden:false});
const app = () => ({id:'garden',url:'/garden/',ready_card:{title:'Garden',subtitle:'Water · Feed',status:'/garden/api/status',dismiss:'/garden/api/hide'}});
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
function setup({held=false,installed=true}={}) {
 const events=[],nodes=[],cards=new Map(), a=app(); let registry=installed?[a]:[];
 const w={id:'desk',app:'chats',thread:'__new__'}, pane={id:'desk::list',thread:null};
 const c={READY_CARDS:cards,readyApps:()=>registry,esc,window:{WizCore:{readyCards:()=>registry},WizCanOpen:()=>true},H:{root:()=>({querySelectorAll:()=>nodes.filter(n=>n.connected)}),win:id=>id==='desk'?w:pane},CH:{'desk::list':{}},owner:id=>id.replace(/::list$/,''),elOf:()=>({querySelector:()=>true}),holdList:()=>held,renderChatList:()=>events.push('render'),toast:(...a)=>events.push(a),requestAnimationFrame:fn=>{events.push('frame');fn();},setTimeout:fn=>fn(),fetch:()=>{events.push('fetch');return new Promise(()=>{});}};
 for(let i=0;i<2;i++) { const parent={isConnected:true,querySelector:()=>nodes.find(n=>n.parentNode===parent&&n.connected),insertBefore(n){n.connected=true;n.parentNode=this;}}; nodes.push({parentNode:parent,nextSibling:null,connected:true,remove(){this.connected=false;events.push('remove');}}); }
 vm.createContext(c); vm.runInContext(['readyPaint','readyStatus','readySet','readyPoll','readyHide','readyCards'].map(n=>fn(src,n)).join('\n'),c);
 return {c,cards,events,nodes,a,uninstall:()=>{registry=[];},put:d=>cards.set(a.id,{key:JSON.stringify(a.ready_card),data:d,at:0,busy:false,rev:0})};
}
test('a non-routine app uses the same renderer, open/optional dismiss and escaped progress',()=>{
 const t=setup();t.put({...state(),next_label:'<b>Water</b>'});const html=t.c.readyCards();
 assert.match(html,/data-chappopen="garden"/);assert.match(html,/data-chapphide="garden"/);assert.match(html,/1 of 4 done · next: &lt;b&gt;Water&lt;\/b&gt;/);assert.equal((html.match(/<i class="on">/g)||[]).length,1);
 assert.doesNotMatch(html,/<button[^]*<button[^]*<\/button><\/button>/);
 delete t.a.ready_card.dismiss;assert.doesNotMatch(t.c.readyCards(),/data-chapphide/);
 t.put({...state(),done:0});assert.match(t.c.readyCards(),/Water · Feed/);
});
test('done, hidden, invalid, absent and uninstalled apps never render a card',()=>{
 const t=setup();for(const d of [{...state(),done:4},{...state(),hidden:true},null]){t.put(d);assert.equal(t.c.readyCards(),'');}
 for(const d of [{...state(),total:1e9},{...state(),done:-1},{...state(),done:1.5},{...state(),day:null}])assert.equal(t.c.readyStatus(d),null);
 t.put(state());t.uninstall();assert.equal(t.c.readyCards(),'');t.c.readyPoll();assert.equal(t.cards.size,0);assert.ok(!t.events.includes('fetch'));
});
for(const held of [false,true])test(`dismiss removes both lists before I/O, stale update fenced, rollback and ! toast; held=${held}`,async()=>{
 const t=setup({held});t.put(state());let settle;
 t.c.fetch=()=>{assert.ok(t.nodes.every(n=>!n.connected));assert.equal(t.cards.get('garden').data.hidden,true);t.events.push('fetch');return new Promise(r=>{settle=r;});};
 t.c.readyHide('garden');t.c.readyHide('garden');assert.deepEqual(t.events,['remove','remove','frame','fetch']);
 t.c.readySet(t.cards.get('garden'),state());assert.equal(t.cards.get('garden').data.hidden,true);
 settle({ok:false,status:500});await flush();assert.ok(t.nodes.every(n=>n.connected));assert.equal(t.cards.get('garden').data.hidden,false);assert.ok(t.events.some(e=>Array.isArray(e)&&e[0]==='!'));assert.equal(t.events.includes('render'),!held);
});
test('successful dismiss trusts confirmed app state; malformed 200 rolls back',async()=>{
 for(const good of [true,false]) {const t=setup();t.put(state());t.c.fetch=async()=>({ok:true,json:async()=>good?{...state(),hidden:true}: {ok:true}});t.c.readyHide('garden');await flush();assert.equal(t.cards.get('garden').data.hidden,good);assert.equal(t.nodes.some(n=>n.connected),!good);}
});
test('poll is per-app, cheap, unchanged state does not repaint, uninstall discards late response',async()=>{
 const t=setup();let settle;t.c.fetch=()=>{t.events.push('fetch');return new Promise(r=>settle=r);};t.c.readyPoll();t.c.readyPoll();assert.deepEqual(t.events,['fetch']);settle({ok:true,json:async()=>state()});await flush();assert.deepEqual(t.events,['fetch','render']);t.c.readyPoll();assert.equal(t.events.filter(x=>x==='fetch').length,1);
 t.c.readySet(t.cards.get('garden'),state());assert.equal(t.events.filter(x=>x==='render').length,1);
 t.cards.get('garden').at=0;t.c.readyPoll();t.uninstall();t.c.readyPoll();settle({ok:true,json:async()=>state()});await flush();assert.equal(t.cards.size,0);
});
test('invalidation coalesces behind an in-flight status read without painting its stale payload',async()=>{
 const t=setup(), replies=[];t.c.fetch=()=>{t.events.push('fetch');return new Promise(r=>replies.push(r));};t.c.readyPoll();
 t.cards.get('garden').at=0;replies.shift()({ok:true,json:async()=>state()});await flush();
 assert.deepEqual(t.events,['fetch','fetch']);assert.equal(t.cards.get('garden').data,null);
 replies.shift()({ok:true,json:async()=>({...state(),hidden:true})});await flush();assert.equal(t.cards.get('garden').data.hidden,true);
});
test('registry paths are relative, bounded, confined to same-origin app; no cached opt-in',()=>{
 const c={};vm.createContext(c);vm.runInContext(fn(apps,'readyCard'),c);
 const a={id:'garden',url:'/garden/',ready_card:{title:'Garden',status:'api/status',dismiss:'api/hide'}};assert.equal(c.readyCard(a).status,'/garden/api/status');
 for(const status of ['../hide','/wizard/api/hide','https://other/x','api/%2e%2e/x','api\\x','//evil/x','api/x?x=1'])assert.equal(c.readyCard({...a,ready_card:{...a.ready_card,status}}),null,status);
 for(const url of ['//evil/','https://other/garden/','/garden/?x=1'])assert.equal(c.readyCard({...a,url}),null);
 assert.match(apps,/trusted && readyCard\(a\)/);assert.match(apps,/WizCore\.readyCards = \(\) => REMOTE\.filter/);
});
test('generic clicks reuse same-frame H.openApp with Chats source; no app-specific status knowledge',()=>{
 assert.match(src,/H\.openApp\?\.\(appOpen\.dataset\.chappopen, e\.target\)/);assert.ok(src.indexOf("closest('[data-chapphide]')")<src.indexOf("closest('[data-chappopen]')"));
 const block=src.slice(src.indexOf('  const READY_CARDS'),src.indexOf('  // The agent\'s status line'));
 assert.doesNotMatch(block,/\b(morning|workout|meditate|read)\b/i);assert.match(block,/type !== 'wizard:ready-card'/);assert.match(block,/e\.origin !== location\.origin/);
});
