import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const chats = readFileSync(new URL('../web/core/chats.js', import.meta.url), 'utf8');
const send = chats.slice(chats.indexOf('  async function sendChat('), chats.indexOf('  const picker =', chats.indexOf('  async function sendChat(')));
for (const agent of ['', 'profile-qa', 'container-qa', 'restricted-qa']) for (const working of [false, true]) test(`send/steer paints green Seen before phone navigation or custody wait: ${agent || 'main'}/${working}`, () => {
 const order = [], w = { id:'w', thread:'t' }, c = { files:[] };
 const ctx = { INC:null, W:{w}, ch:()=>c, joinWords:(...s)=>s.filter(Boolean).join('\n'), pendRef:x=>x, MAX_FILES:10,
  KIT:{drafts:{get:()=>({}), clear(){}}}, LIVE:{session:()=>({runId:'run'}), agentOf:()=>agent, holdSend:()=>null},
  isWorking:()=>working, PW:null, OUTBOX:{enqueue:o=>{order.push(['enqueue',o.steerRunId]);return new Promise(()=>{});}},
  leaveAfterSend:()=>{order.push(['leave']);return true;}, renderChats(){}, applyLayout(){}, deskOf:()=>null,
  WosThreadTracker:{beforeSend:(...a)=>order.push(['seen',...a])},
 }; ctx.window=ctx; vm.createContext(ctx); vm.runInContext(send+'\nthis.send=sendChat;',ctx);
 ctx.send('w','Synthetic message','typing',null,{instructions:'fixture'});
 assert.deepEqual(order,[['seen','t',agent],['leave'],['enqueue',working?'run':'']]);
});
