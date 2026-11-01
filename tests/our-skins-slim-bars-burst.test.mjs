import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Miguel's layout rules sit behind his miguel/layout tweak (a zero-specificity :where gate); read them ungated.
const ungate = s => s.replaceAll(':where([data-tweaks~="miguel/layout"])', '');
const read=p=>ungate(readFileSync(new URL('../web/'+p,import.meta.url),'utf8'));
test('the update burst runs on every skin',()=>{
 const s=read('core/web-update.js');
 assert.match(s,/if \(why === 'tap'\) \{ burst\(\);/);
 assert.ok(!/OURS/.test(s));
 assert.ok(read('core/update-banner.css').includes('\n.wos-burst {'));
});
for (const [f,p] of [['skins/obsidian/skin.css','html[data-skin^="obsidian"]'],['skins/landscapes/skin.css','html[data-skin^="landscapes"]']]) test(f+' carries the slim phone bar, skin-scoped',()=>{
 const c=read(f);
 assert.ok(c.includes(p+'[data-shell="phone"][data-skin-frame="borderless"] .win > .wbar { height: 36px;'));
 assert.ok(!c.includes('wos-burst'));
});
test('the burst lives only in the shared banner CSS',()=>{ for (const f of ['styles.css','core/skin-frame.css']) { assert.ok(!read(f).includes('wos-burst')); } });
