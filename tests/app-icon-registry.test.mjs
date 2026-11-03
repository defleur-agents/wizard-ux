// Real source registry regression for the failed Food picker fixture. No browser or private data.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function registry({native=false,id='food'}={}) {
 const data=new Map(),window={WizCore:{norm:s=>String(s).toLowerCase()},dispatchEvent(){}};
 if(native)window.WizardOSNative={usuals:()=>JSON.stringify([])};
 const app={id,name:'Food',url:'/fixture-app/'+id+'/',source:'apps.json'};
 window.WizConfig={endpoint:()=>'/wizard/v1/apps'};
 const context=vm.createContext({window,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},document:{addEventListener(){},hidden:false},addEventListener(){},CustomEvent:class{},fetch:async url=>({ok:true,json:async()=>url.includes('app-logos')?{logos:{}}:{apps:[app]}}),URL,location:{origin:'https://fixtures.invalid',href:'https://fixtures.invalid/'}});
 vm.runInContext(read('web/core/voice-legacy.js'),context);
 vm.runInContext(read('web/core/apps.js'),context);
 await window.WizCore.appsLoaded();return window;
}
test('old fixture has no Food on either shell without the real legacy capability',async()=>{
 const w=await registry();
 for(const shell of ['mobile','desktop'])assert.equal(w.WizCore.apps(shell).APP.food,undefined);
 assert.equal(w.WizCore.appMetadata('food').id,'food');
});
test('synthetic empty native capability restores actual phone Food, never a desktop row',async()=>{
 const w=await registry({native:true}),mobile=w.WizCore.apps('mobile'),desktop=w.WizCore.apps('desktop');
 assert.equal(mobile.APP.food.id,'food');assert.equal(mobile.APP.food.name,'Food');
 assert.equal(desktop.APP.food,undefined);assert.equal(desktop.APPS.some(a=>a.id==='food'),false);
 const declaration=w.WizDeviceLegacy.find(d=>d.appId==='food');assert.equal(declaration.phoneOnly,true);assert.equal(declaration.probe,'usuals');
});
test('native compatibility records keep their real IDs even when lookup aliases exist',async()=>{
 const w=await registry({native:true,id:'usuals'}),mobile=w.WizCore.apps('mobile');
 assert.equal(mobile.APP.usuals.id,'usuals');
 assert.equal(mobile.APP.food.id,'food');
 // Aliases fill missing lookups; they do not overwrite two present native records.
 if(w.WizCore.appIdAliases)assert.equal(w.WizCore.appIdAliases.usuals,'food');
 assert.equal(w.WizCore.apps('desktop').APP.usuals,undefined);
});
