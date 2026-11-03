// Shared-main contract: one list of skins, tweaks chosen separately. #803's family controls are excluded.
// Keep the renderer/dispatch custody regressions; do not replace the shared-main picker expectations.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../web/core/settings.js', import.meta.url), 'utf8');
function look(shell) {
  const picked = [];
  const S = { current: 'nebula', list: ['nebula', 'grove', 'obsidian', 'obsidian-light'].map(id => ({id, name:id, t:{}})),
    set(id) { picked.push(id); this.current = id; } };
  const s = {console, URL, setTimeout, CSS:{escape:String}, navigator:{userAgent:'Desktop'}, document:{activeElement:null},
    location:{host:'example.test'}, WizCore:{}, WosSkin:S,
    WosMySkin:{recipes:[], active:null, on(){}, create(draft){this.created=JSON.parse(JSON.stringify(draft));}},
    WosExperience:{installedReady:true, installed:async()=>[{id:'sample',name:'Sample tweak'}], defaults:async()=>({sample:true}), state:{tweaks:[{id:'sample',on:true}]}}};
  s.window=s; vm.runInNewContext(source,s);
  const handlers={},root={innerHTML:'',scrollTop:0,dataset:{},classList:{add(){}},contains:()=>false,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{handlers[name]=fn;},removeEventListener(){}};
  const view=s.WosSettings.mount(root,{shell,live:{ok:true}});view.focus('look');
  const act=(attr,value)=>view.dispatch({closest:selector=>selector==='[data-settings-feature]'?{dataset:{settingsFeature:'look'}}:selector===`[${attr}]`?{dataset:{[attr.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value}}:null});
  const input=(attr,value)=>handlers.input({target:{value,matches:selector=>selector===`[${attr}]`,closest:()=>({dataset:{settingsFeature:'look'}})}});
  return {S,root,view,act,input,s,picked};
}
for(const shell of ['phone','desktop']) {
  test(`${shell}: every skin is in the same list and a plain pick needs no box write`,async()=>{
    const h=look(shell);
    h.s.WosMySkin.leave=()=>{throw Error('must not leave when no own skin is worn');};
    assert.doesNotMatch(h.root.innerHTML,/data-skinfamily/);
    for(const id of ['nebula','grove','obsidian','obsidian-light'])assert.match(h.root.innerHTML,new RegExp(`data-skinpick="${id}"`));
    h.act('data-skinpick','obsidian-light');await Promise.resolve();
    assert.equal(h.S.current,'obsidian-light');assert.equal(h.picked.at(-1),'obsidian-light');h.view.destroy();
  });
  test(`${shell}: New skin selects any base without resetting name or independent tweaks`,async()=>{
    const h=look(shell);h.act('data-newskin','');
    for(let tick=0;tick<10&&!h.view.context.skinDraft.items.length;tick++)await Promise.resolve();
    assert.match(h.root.innerHTML,/aria-label="Base skins"/);assert.doesNotMatch(h.root.innerHTML,/data-skin-base|data-skinfamily/);
    h.input('data-skin-name','Quiet morning');h.act('data-draft-tweak','sample');h.act('data-skinpick','obsidian');
    assert.equal(h.S.current,'nebula');assert.equal(h.view.context.skinDraft.name,'Quiet morning');assert.equal(h.view.context.skinDraft.tweaks.sample,false);
    h.act('data-skin-create','');assert.equal(h.s.WosMySkin.created.base,'obsidian');assert.equal(h.s.WosMySkin.created.name,'Quiet morning');assert.equal(h.s.WosMySkin.created.tweaks.sample,false);
    h.act('data-newskin','');assert.equal(h.view.back(),true);assert.equal(h.view.context.skinDraft,null);assert.match(h.root.innerHTML,/aria-label="All skins"/);h.view.destroy();
  });
  test(`${shell}: slow Create saves a snapshot and cannot wipe a later draft`,async()=>{
    const h=look(shell);let finish,submitted;
    h.s.WosMySkin.create=snapshot=>{submitted=snapshot;return new Promise(resolve=>{finish=resolve;});};
    h.act('data-newskin','');for(let tick=0;tick<10&&!h.view.context.skinDraft.items.length;tick++)await Promise.resolve();
    h.input('data-skin-name','First');h.act('data-skin-create','');h.input('data-skin-name','Changed while saving');h.act('data-skinpick','grove');h.act('data-draft-tweak','sample');
    assert.equal(h.view.context.skinDraft.name,'First');assert.equal(submitted.base,'nebula');assert.equal(submitted.tweaks.sample,true);
    assert.equal(h.view.back(),true);h.act('data-newskin','');h.input('data-skin-name','Second');const next=h.view.context.skinDraft;
    finish();await Promise.resolve();await Promise.resolve();assert.equal(h.view.context.skinDraft,next);assert.equal(next.name,'Second');h.view.destroy();
  });
}
