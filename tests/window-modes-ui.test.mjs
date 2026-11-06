import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const ui = readFileSync(new URL('../web/layouts/ai-apps/desktop.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/layouts/ai-apps/desktop.css', import.meta.url), 'utf8');
const backSource = readFileSync(new URL('../web/core/escape-back.js', import.meta.url), 'utf8');
const coreSource = readFileSync(new URL('../web/core/pane-layout.js', import.meta.url), 'utf8');
test('mode command changes only mode/focus, preserving tiled state and using one pane ancestor per window', () => {
 const window = { WizCore: {}, localStorage: { getItem: () => null, setItem() {} } };
 vm.runInNewContext(coreSource, { window }); const panes = window.WizCore.panes;
 panes.set({ratio:'1/3',side:'end',weights:{chats:2,app:1}}); const before=JSON.stringify(panes.get());
 const start=ui.indexOf('  function windowMode('), end=ui.indexOf('  function modeBar(',start);
 assert.ok(start>0 && end>start); const nodes=[{}, {}, {}], seen=[];
 const command=vm.runInNewContext(ui.slice(start,end)+';windowMode', {panes,dockEl:nodes[0],pane:{el:nodes[1]},secondEl:nodes[2],flip:(n,fn)=>{seen.push(n);fn();}});
 for(const mode of ['centre','pair','full','tiled']) command(mode,'chats');
 assert.equal(JSON.stringify(panes.get()),before); assert.equal(seen.length,4); assert.equal(seen[0].length,3);
 assert.match(ui,/chatHeaderHost = docked && chat \? chat : top/);
});
test('full mode is a last-priority surface, after recording and transient overlays, not an overlay owner', () => {
 const window={};vm.runInNewContext(backSource,{window});const registry=window.WizEscapeBack.create();
 let mode='full', closes=0; const panes={get:()=>({mode})}, windowMode=m=>{mode=m;};
 const start=ui.indexOf('  api.back.surface?.(() => {'), end=ui.indexOf('    const a = doc.activeElement;',start);
 assert.ok(start>0 && end>start);
 const prefix=ui.slice(start,end).replace('  api.back.surface?.(() => {','');
 const surface=vm.runInNewContext('(function(){'+prefix+'return false;})',{panes,windowMode});
 registry.push(()=>{closes++;});registry.run({recording:()=>true,surface});assert.equal(mode,'full');assert.equal(closes,0);
 registry.run({surface});assert.equal(closes,1);assert.equal(mode,'full');registry.run({surface});assert.equal(mode,'tiled');
});
test('shifted mode shortcuts precede app dispatch but yield to existing modal guards; native plain Alt keys unchanged',()=>{
 assert.match(ui,/MODE_KEYS = \{ KeyU: 'centre', KeyJ: 'pair', KeyF: 'full', KeyT: 'tiled' \}/);
 const keys=ui.slice(ui.indexOf('    if (!e.altKey || e.ctrlKey || e.metaKey) return false;\n    const code'));
 assert.ok(keys.indexOf('snoozeOpen()')<keys.indexOf('sh && MODE_KEYS[code]'));
 assert.ok(keys.indexOf('sh && MODE_KEYS[code]')<keys.indexOf('if (!sh && appFront())'));
 assert.match(ui,/code === 'KeyF' && !sh && pane/);
 assert.match(ui,/for \(const \{ bar \} of modeBars\)/);
 assert.match(css,/background: var\(--wz-panel\) !important; backdrop-filter: none/);
 assert.match(css,/data-aad-mode="full".*#bar/);
});
