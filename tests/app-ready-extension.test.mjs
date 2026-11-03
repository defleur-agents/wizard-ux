import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../web/core/chats-view.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('/* Owner-installed Ready extensions are')).replace('import(entry.module.href)','loadModule(entry.module.href)');
const declared=(patch={})=>({id:'sample-app',source:'apps.json',provides:['ready-extension'],url:'/sample/',...patch});
const digest='a'.repeat(64),descriptor=(patch={})=>({contract:'wizard.ready-extension/1',module_sha256:digest,style_sha256:digest,...patch});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture() {
 const modules=[],links=[],opened=[],toasts=[],html=[],instances=[],frames=[];let data=descriptor(),pending=false,metadata=null,importGate=null;
 const root={querySelectorAll:s=>s==='iframe'?frames:[{parentNode:{querySelectorAll:()=>[]},insertAdjacentHTML:(_,s)=>html.push(s)}]};
 const wins={frame:{app:'frame',appId:'sample-app'}};
 const c={URL,AbortSignal,location:{origin:'https://wizard.test',href:'https://wizard.test/shell/'},document:{createElement:()=>({remove(){this.removed=true;}}),head:{appendChild:l=>links.push(l)}},
  fetch:async()=>metadata?metadata.promise:{ok:true,json:async()=>data},
  loadModule:async u=>{modules.push(u);if(importGate)await importGate.promise;return{contract:'wizard.ready-extension/1',default:api=>{const i={api,disposed:false,html:()=>'<button>Task</button>',poll(){},write:(_s,k,input)=>({k,input}),handle:()=>true,busy:()=>pending,dispose(){i.disposed=true;}};instances.push(i);return i;}};}};
 c.window=c;vm.runInNewContext(code,c);c.WizAppExtensions.attach({root:()=>root,win:id=>wins[id],openApp:(...x)=>opened.push(x),toast:(...x)=>toasts.push(x)});
 const doc={},win={document:doc,location:{href:'https://wizard.test/sample/'}};
 const frame={contentWindow:win,contentDocument:doc,src:'https://wizard.test/sample/',isConnected:true,hasAttribute:()=>false,closest:()=>({dataset:{win:'frame'}})};frames.push(frame);
 return{api:c.WizAppExtensions,modules,links,instances,opened,html,frames,win,frame,wins,setData:d=>data=d,setPending:p=>pending=p,setMeta:g=>metadata=g,setImport:g=>importGate=g};
}
test('only an explicit installed same-origin app declaration admits Ready code',async()=>{
 const f=fixture();for(const a of [declared({source:'launcher.json'}),declared({provides:[]}),declared({provides:'ready-extension'}),declared({url:'https://elsewhere.test/sample/'}),declared({url:'/'}),declared({url:'/sample/%2e%2e/'}),declared({url:'/sample/?unsafe=1'})])assert.equal(f.api.moduleURL(a),null);
 await f.api.configure({apps:[declared()]});assert.equal(f.modules.length,1);assert.match(f.modules[0],/shell.js\?sha256=a{64}$/);assert.match(f.links[0].href,/shell.css\?sha256=a{64}$/);assert.match(f.api.html(),/data-app-ready="sample-app"/);
 await f.api.configure({apps:[declared(),declared()]});assert.equal(f.modules.length,1,'stable metadata does not remount app state');
});
test('exact live shell-owned frame/document/path grants writes; nested, navigated and destroyed callers do not',async()=>{
 const f=fixture();await f.api.configure({apps:[declared()]});assert.equal(f.api.call(f.win,'step',{id:1}).k,'step');assert.throws(()=>f.api.call({},'step',{}),/frame required/);
 f.win.location.href='https://wizard.test/other/';assert.throws(()=>f.api.call(f.win,'step',{}),/frame required/);f.win.location.href='https://wizard.test/sample/';
 f.win.document={};assert.throws(()=>f.api.call(f.win,'step',{}),/frame required/);f.win.document=f.frame.contentDocument;
 f.frame.isConnected=false;assert.throws(()=>f.api.call(f.win,'step',{}),/frame required/);f.frame.isConnected=true;
 f.wins.frame.appId='different-app';assert.throws(()=>f.api.call(f.win,'step',{}),/frame required/);
});
test('updates are content addressed and wait for app-owned pending custody; uninstall revokes immediately',async()=>{
 const f=fixture();await f.api.configure({apps:[declared()]});const old=f.instances[0];f.setData(descriptor({module_sha256:'b'.repeat(64)}));f.setPending(true);
 await f.api.configure({apps:[declared()]});assert.equal(f.modules.length,1);f.setPending(false);await f.api.configure({apps:[declared()]});assert.equal(f.modules.length,2);assert.ok(old.disposed);assert.ok(f.links[0].removed);assert.equal(old.api.installed(),false);
 old.api.open('target');assert.equal(f.opened.length,0,'revoked instances cannot navigate');
 await f.api.configure({apps:[]});assert.equal(f.api.html(),'');assert.throws(()=>f.api.call(f.win,'step',{}),/frame required/);
});
test('removed/overlapping metadata and imports cannot resurrect a revoked extension',async()=>{
 const f=fixture(),g=deferred();f.setMeta(g);const pending=f.api.configure({apps:[declared()]});await f.api.configure({apps:[]});g.resolve({ok:true,json:async()=>descriptor()});await pending;assert.equal(f.modules.length,0);
 f.setMeta(null);const importing=deferred();f.setImport(importing);const load=f.api.configure({apps:[declared()]});await Promise.resolve();await Promise.resolve();await Promise.resolve();await f.api.configure({apps:[]});importing.resolve();await load;assert.equal(f.instances.length,0);assert.equal(f.api.html(),'');
});
test('malformed metadata fails closed without admitting arbitrary paths or code',async()=>{
 const f=fixture();f.setData(descriptor({module_sha256:'../evil'}));await f.api.configure({apps:[declared()]});assert.equal(f.modules.length,0);
 f.setData(descriptor({contract:'not-supported'}));await f.api.configure({apps:[declared()]});assert.equal(f.modules.length,0);
});
