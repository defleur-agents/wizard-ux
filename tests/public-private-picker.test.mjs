import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
assert.ok(process.env.BASELINE_UX,'sealed current live UX baseline required');
const old=readFileSync(join(process.env.BASELINE_UX,'web/core/chat-models.js'),'utf8');
const source=readFileSync(new URL('../web/core/chat-models.js',import.meta.url),'utf8');
for(const privacy of ['private',undefined]) test(`private/unknown picker baseline differential: ${privacy}`,async()=>{
 async function run(text){
  const agent={id:'fixture',privacy,model:{model:'fixture-a',provider:'tinfoil',allowed_models:['fixture-a','fixture-b']}};
  const row={id:'wizard_private',agent:'fixture',model:'fixture-a',provider:'tinfoil'},stored=new Map(),calls=[];
  const ctx={console,crypto:webcrypto,document:{documentElement:{dataset:{}}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
   WosAgents:{defaultId:()=> 'hermes',get:id=>id==='fixture'?agent:{id:'hermes',privacy:'standard'},isOther:id=>id==='fixture',allows:(a,m)=>a.model.allowed_models.includes(m),route:(a,m)=>({agent:a.id,model:m||a.model.model,provider:a.model.provider})},
   WizLive:{agentOf:id=>id==='wizard_private'?'fixture':'',session:id=>id==='wizard_private'?row:null},
   fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({runtime:{model:'fixture-b',provider:'custom',model_lock:'accepted',selection_version:7}}));}};
  ctx.window=ctx;vm.runInNewContext(text,ctx);const M=ctx.WosModels;
  const before=M.snapshot('wizard_private');M.keepVoiceRoute('take',before);const recovered=M.voiceRoute('take');
  const resolved=await M.resolveRoute({...before,agent:'fixture'});
  const choice=await M.setThreadModel('wizard_private',{value:'fixture-b',provider:'tinfoil'});
  const after=M.snapshot('wizard_private');
  M.reconcile([{...row,model:'fixture-b',modelLockAt:8}]);
  return JSON.parse(JSON.stringify({before,recovered,resolved,choice,after,calls,stored:[...stored],selections:[...M.selections],pending:[...M.pending]}));
 }
 assert.deepEqual(await run(source),await run(old));
});
test('Incognito and send destination/voice entrypoints remain live-source bytes',()=>{
 for(const file of ['web/core/incognito-chat.js','web/core/chats.js','web/orb.js','web/desktop/desktop.js']) {
  const expected=readFileSync(join(process.env.BASELINE_UX,file),'utf8');
  assert.equal(readFileSync(new URL('../'+file,import.meta.url),'utf8'),expected,file);
 }
});
