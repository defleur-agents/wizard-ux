'use strict';
// QA-only browser CDP probe. Never connect to the release WebView or owner data.
// Product script bytes remain unmodified. Logpoint expressions are instrumentation.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
module.exports.attach = async function attach(cdp, expectedSource, expectedSHA) {
  assert.equal(sha(expectedSource), expectedSHA, 'caller source hash');
  const lines = expectedSource.split('\n');
  assert(lines[564].includes('textPages=Math.max(1,Math.floor(left/W)+1)'), 'exact measurement seam');
  assert(lines[578].includes('if(anchored!==null)textAnchor='), 'exact post-go seam');
  const scripts = new Map(), pending = new Set(), failures = [], breakpointIds = [];
  const queue = event => {
    if (!/\/wisdom\.js(?:\?|$)/.test(event.url)) return;
    const work = (async () => {
      const {scriptSource} = await cdp.send('Debugger.getScriptSource', {scriptId:event.scriptId});
      assert.equal(sha(scriptSource), expectedSHA, 'actual executed product script');
      scripts.set(event.scriptId, {url:event.url,sha256:sha(scriptSource)});
      const A = `(()=>{try{const q=globalThis.__r31LayoutTrace||(globalThis.__r31LayoutTrace=[]);if(q.length>=80)return false;const c=getComputedStyle(flow);q.push({phase:'measurement',t:performance.now(),size:r.dataset.size,firstReaderIsPaged:document.querySelector('.wisdom-reader')===r,readerCount:document.querySelectorAll('.wisdom-reader').length,W,H,T,B,P,left,priorTextPages:textPages,derivedTextPages:Math.max(1,Math.floor(left/W)+1),style:flow.getAttribute('style'),fontSize:c.fontSize,lineHeight:c.lineHeight,fontFamily:c.fontFamily,columnWidth:c.columnWidth,columnGap:c.columnGap,fontsStatus:document.fonts.status,faces:[...document.fonts].map(f=>({family:f.family,style:f.style,weight:f.weight,status:f.status}))});}catch(e){(globalThis.__r31LayoutErrors||(globalThis.__r31LayoutErrors=[])).push(String(e))}return false})()`;
      const B = `(()=>{try{const q=globalThis.__r31LayoutTrace||(globalThis.__r31LayoutTrace=[]);if(q.length>=80)return false;const f=flow.getBoundingClientRect(),s=flow.querySelector('.wb-sentinel').getBoundingClientRect();q.push({phase:'after-expansion',t:performance.now(),size:r.dataset.size,W,H,T,B,P,textPages,textFrom,pages,footer:r.querySelector('.wb-count').textContent,left:s.left-f.left,measuredTextPages:Math.max(1,Math.floor((s.left-f.left)/W)+1),flowWidth:f.width,scrollWidth:flow.scrollWidth,style:flow.getAttribute('style')});}catch(e){(globalThis.__r31LayoutErrors||(globalThis.__r31LayoutErrors=[])).push(String(e))}return false})()`;
      for (const [lineNumber,condition] of [[564,A],[578,B]]) {
        const bp = await cdp.send('Debugger.setBreakpoint', {location:{scriptId:event.scriptId,lineNumber,columnNumber:0},condition});
        assert.equal(bp.actualLocation.lineNumber,lineNumber,'logpoint stayed on exact seam');
        breakpointIds.push(bp.breakpointId);
      }
    })();
    pending.add(work);work.catch(e=>failures.push(e)).finally(()=>pending.delete(work));
  };
  cdp.on('Debugger.scriptParsed',queue);
  await cdp.send('Debugger.enable');
  // Install before chapter UI opens. Caller waits ready() again after initial navigation.
  return {
    async ready(){await Promise.all([...pending]);assert.equal(failures.length,0,failures.map(String).join('\n'));return [...scripts.values()]},
    async read(frame){await Promise.all([...pending]);return frame.evaluate(()=>({events:globalThis.__r31LayoutTrace||[],errors:globalThis.__r31LayoutErrors||[]}))},
    async detach(){await Promise.all([...pending]);for(const breakpointId of breakpointIds)await cdp.send('Debugger.removeBreakpoint',{breakpointId});cdp.off('Debugger.scriptParsed',queue);await cdp.send('Debugger.disable')}
  };
};
module.exports.sizeSequence = async function sizeSequence({frame,checkpoint}) {
  const state = () => frame.locator('.wb-reader').getAttribute('data-size');
  assert.equal(await state(),'1','fresh default, do not seed size');
  await checkpoint('initial-text-before-highlight');
  for (const [label,delta,want] of [['larger',1,'2'],['original-setting-restored',-1,'1']]) {
    await frame.locator(`.wb-reader [data-wisdom-size="${delta}"]`).tap();
    assert.equal(await state(),want,'one actual trusted tap advances exactly once');
    await checkpoint(label);
  }
  // Caller performs verified owned-process death/reopen offline and checkpoints cold state.
};
