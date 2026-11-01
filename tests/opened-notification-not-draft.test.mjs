import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../web/core/chats.js',import.meta.url),'utf8');
const cut=(start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a);assert.ok(a>0&&b>a,start);return src.slice(a,b);};
const code=cut('  const SAVED_NEW','  function newDrafts')+cut('  function untouchedNotif','  function openNewDraft');
function run(all){const store={'wos.chat.drafts.v1':JSON.stringify(all)};
 const ctx={localStorage:{setItem:(k,v)=>{store[k]=v},getItem:k=>store[k]},KIT:{drafts:{all:()=>JSON.parse(store['wos.chat.drafts.v1'])}},Date,Math,JSON};
 vm.createContext(ctx);vm.runInContext(code+';this.rotateNew=rotateNew;this.untouchedNotif=untouchedNotif',ctx);
 return {ctx,saved:()=>JSON.parse(store['wos.chat.drafts.v1'])};}
const n=(t,key='notifications:n1')=>({text:t,files:[],reply:{key,title:'T',message:'m'},at:1});
test('leaving an untouched opened notification does not save it as a draft',()=>{const r=run({new:n('')});r.ctx.rotateNew('');assert.deepEqual(Object.keys(r.saved()),[]);});
test('words typed on a notification still save as a draft',()=>{const r=run({new:n('my reply')});r.ctx.rotateNew('');assert.equal(Object.keys(r.saved()).length,1);});
test('another app reply with no words keeps its draft',()=>{const r=run({new:n('','wisdom:p1')});r.ctx.rotateNew('');assert.equal(Object.keys(r.saved()).length,1);});
test('untouchedNotif tells a read notification from a draft',()=>{const r=run({});assert.equal(r.ctx.untouchedNotif(n('')),true);assert.equal(r.ctx.untouchedNotif(n(' x ')),false);assert.equal(r.ctx.untouchedNotif({...n(''),files:[{id:'f'}]}),false);});
