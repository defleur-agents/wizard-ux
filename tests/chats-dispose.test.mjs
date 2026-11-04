import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../web/core/chats.js',import.meta.url),'utf8');
const start=source.indexOf('  async function loadThread(w, force) {');
const end=source.indexOf('  /* Thread trail:',start);
const code=source.slice(start,end);
test('pending transcript read cannot paint or retry after forget deletes its state',async()=>{
 let resolve,paints=0;const w={id:'w',thread:'sid'},c={readNav:1};
 const env={CH:{w:c},W:{w},INC:null,ch:()=>c,LIVE:{session:()=>null,messages:()=>new Promise(r=>resolve=r)},
 pendingFor:()=>[],isWorking:()=>false,toTurns:x=>x,retireLanded:()=>false,elOf:()=>{paints++;throw Error('disposed root');},
 loadApproval:async()=>false,renderThreadLive:()=>{paints++;},Date,JSON,clearTimeout};
 const load=vm.runInNewContext(code+';loadThread',env);const read=load(w,true);
 delete env.CH.w; resolve([{a:{text:'new answer'}}]);await read;
 assert.equal(paints,0);assert.equal(c.turns,undefined);assert.equal(c.loading,false);
});
