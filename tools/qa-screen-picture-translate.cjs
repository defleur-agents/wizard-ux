// Exact user-image regression using recorded responses from the installed private route.
// No provider substitute. Private fixture directory is supplied out of tree; never publish its outputs.
// Usage: node tools/qa-screen-picture-translate.cjs PRIVATE_FIXTURE OUT
const {chromium} = require('./qa-playwright.cjs');
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto');
const fixture = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, {recursive:true});
const image = fs.readFileSync(path.join(fixture, 'exact-image.jpg'));
assert.equal(crypto.createHash('sha256').update(image).digest('hex'), 'e25f968b5acec4cbf6fefae8d036c8c9a3a1affa259b12c68181a1c5b68ca6c7');
const read = JSON.parse(fs.readFileSync(path.join(fixture, 'live-read-image.json')));
const translation = JSON.parse(fs.readFileSync(path.join(fixture, 'live-translate.json')));
assert.equal(read.model, 'gemma4-31b');
assert.equal(read.lines.length, translation.items.length);
const mapping = Object.fromEntries(read.lines.map((s,i) => [s, translation.items[i]]));
const current = path.resolve(process.env.SCREEN_PAGE_SOURCE || path.join(__dirname, '../android/app/src/main/assets/assist/screen.html'));
// Accessibility chrome is a synthetic English control, not part of the recorded Thai inference.
const chromeLabels = ['Copy translation', 'Select text', 'Ask Wizard'];
const baseline = path.join(fixture, 'baseline-screen.html');
const record = {mode: 'recorded-installed-private-inference-replay, NOT new inference or native device proof', checks: [], screenshots: []};
const check = (name, ok) => { record.checks.push({name, ok:!!ok}); console.log((ok ? 'PASS ' : 'FAIL ') + name); };
// State completion precedes the sheet's 200ms entrance transition.
function sheetCaptureReady() {
  const sheet = document.querySelector('#sheet'), r = sheet.getBoundingClientRect();
  const bounds = [r.left, r.top, r.right, r.bottom];
  const previous = window.__qaSheetBounds;
  const stable = previous && bounds.every((v,i) => Math.abs(v - previous.bounds[i]) < 0.1);
  window.__qaSheetBounds = {bounds, frames: stable ? previous.frames + 1 : 0};
  return sheet.classList.contains('show') && getComputedStyle(sheet).transform === 'none'
    && r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0
    && r.right <= innerWidth && r.bottom <= innerHeight && window.__qaSheetBounds.frames >= 3;
}
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const skin of ['nebula','grove']) {
      const context = await browser.newContext({viewport:{width:360,height:780},deviceScaleFactor:3,hasTouch:true,isMobile:true});
      for (const version of ['baseline','candidate']) {
        const page = await context.newPage(), errors=[];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(({jpeg,read,mapping,chromeLabels}) => {
          window.__calls = [];
          window.ScreenNative = {shot: () => jpeg, log() {}, close() {}, closeSearch() {}, sheet() {}, search() {},
            copy: text => window.__calls.push({kind:'copy',text}), ask: text => window.__calls.push({kind:'ask',text}),
            picture: id => { window.__calls.push({kind:'picture'}); setTimeout(() => S.pictured(id,read), 25); },
            translate: (id,json,to) => {
              const items = JSON.parse(json); window.__calls.push({kind:'translate',items,to});
              const unknown = items.filter(t => !(t in mapping) && !chromeLabels.includes(t));
              if (unknown.length || to !== 'English') throw new Error('No recorded inference for requested input');
              setTimeout(() => S.translated(id,{items:items.map(t => mapping[t] ?? t),from:items.some(t => /[\u0e00-\u0e7f]/.test(t)) ? 'Thai' : ''}),25);
            }};
        }, {jpeg:image.toString('base64'),read,mapping,chromeLabels});
        await page.goto('file://' + (version === 'baseline' ? baseline : current));
        await page.evaluate(skin => {
          const roles = skin === 'grove' ? {'--wz-panel':'#f5f2e8','--wz-ink':'#17291e','--wz-accent':'#245a39','--wz-ink-secondary':'#56614f','--wz-line':'#b3bfa9'} : {'--wz-panel':'#120e24','--wz-ink':'#f4f1ff','--wz-accent':'#b99bff','--wz-ink-secondary':'#a79fc4','--wz-line':'#51436c'};
          Object.entries(roles).forEach(([k,v]) => document.documentElement.style.setProperty(k,v));
        },skin);
        const labels=chromeLabels;
        const blocks=labels.map((t,i) => ({t,x:8+i*115,y:720,w:110,h:22,l:false,wd:t.split(' ').map((s,j,a) => [s,j===a.length-1?'':' '])}));
        await page.evaluate(blocks => S.open({mode:'translate',shot:true,dpr:1,sw:360,sh:780,top:24,bot:24,few:false,blocks}),blocks);
        const waitFor = async predicate => {
          try { await page.waitForFunction(predicate, null, {timeout:10000}); }
          catch(error) {
            fs.writeFileSync(path.join(out,version+'-'+skin+'-failure.json'),JSON.stringify({errors,state:await page.evaluate(()=>S.peek()),calls:await page.evaluate(()=>window.__calls)},null,2));
            await page.screenshot({path:path.join(out,version+'-'+skin+'-failure.png')});
            throw error;
          }
        };
        if (version === 'baseline') {
          await waitFor(() => /Already\s+in\s+English/.test(S.peek().pill || ''));
          const calls=await page.evaluate(() => window.__calls);
          check('baseline '+skin+': false English verdict bypasses vision',!calls.some(c=>c.kind==='picture'));
          await page.screenshot({path:path.join(out,version+'-'+skin+'.png')});
          record.screenshots.push(version+'-'+skin+'.png');
        } else {
          await waitFor(() => S.peek().trans?.text?.includes("I'm heading to battle"));
          let state=await page.evaluate(() => S.peek());
          check('candidate '+skin+': Thai meme extracted',state.pic.some(t=>/[\u0e00-\u0e7f]/.test(t)));
          check('candidate '+skin+': actual recorded English translations visible',state.trans.text.includes('Are there any girls?') && state.sheet && /Thai/.test(state.pill));
          check('candidate '+skin+': not false English verdict',!/Already\s+in\s+English/.test(state.pill));
          const before=state.trans.text;
          await page.evaluate(() => document.documentElement.style.setProperty('--wz-panel','#203428'));
          state=await page.evaluate(() => S.peek());
          check('candidate '+skin+': live role change keeps translation',state.trans.text===before);
          const bg=await page.locator('#sheet').evaluate(e=>getComputedStyle(e).backgroundColor);
          check('candidate '+skin+': text panel fully opaque',!bg.startsWith('rgba'));
          await page.evaluate(skin => document.documentElement.style.setProperty('--wz-panel',skin==='grove'?'#f5f2e8':'#120e24'),skin);
          await page.waitForFunction(sheetCaptureReady, null, {polling:'raf',timeout:10000});
          await page.screenshot({path:path.join(out,version+'-'+skin+'-originals.png')});
          record.screenshots.push(version+'-'+skin+'-originals.png');
          // Originals precede English in the existing scrollable sheet; capture both positions.
          await page.locator('#sel').evaluate(async sel => {
            sel.scrollTop = sel.scrollHeight;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          });
          const geometry = await page.evaluate(() => {
            const sel = document.querySelector('#sel'), clip = sel.getBoundingClientRect();
            const rect = r => ({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
            const within = (r,c) => r.width > 0 && r.height > 0 && r.left >= Math.max(0,c.left) - 0.5
              && r.top >= Math.max(0,c.top) - 0.5 && r.right <= Math.min(innerWidth,c.right) + 0.5
              && r.bottom <= Math.min(innerHeight,c.bottom) + 0.5;
            const english = ["I'm heading to battle", 'Okay, and over there', 'Are there any girls?'].map(text => {
              const walker = document.createTreeWalker(sel,NodeFilter.SHOW_TEXT);
              let node; while ((node = walker.nextNode()) && !node.data.includes(text)) {}
              if (!node) return {text,visible:false,rects:[]};
              const range = document.createRange(), start = node.data.indexOf(text);
              range.setStart(node,start); range.setEnd(node,start + text.length);
              const rects = [...range.getClientRects()];
              return {text,rects:rects.map(rect),visible:rects.length > 0 && rects.every(r =>
                within(r,clip) && sel.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2)))};
            });
            const buttons = ['aCopy','aSearch','aTrans','aAsk'].map(id => {
              const el = document.getElementById(id), r = el.getBoundingClientRect();
              return {id,rect:rect(r),reachable:!el.disabled && within(r,{left:0,top:0,right:innerWidth,bottom:innerHeight})
                && el.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))};
            });
            return {sheet:rect(document.querySelector('#sheet').getBoundingClientRect()),clip:rect(clip),scrollTop:sel.scrollTop,english,buttons};
          });
          fs.writeFileSync(path.join(out,version+'-'+skin+'-capture.json'),JSON.stringify(geometry,null,2));
          check('candidate '+skin+': captured English is visibly inside scroll viewport',geometry.english.every(item=>item.visible));
          check('candidate '+skin+': sheet actions are in viewport and hit-testable',geometry.buttons.every(item=>item.reachable));
          assert.ok(geometry.english.every(item=>item.visible) && geometry.buttons.every(item=>item.reachable),'capture geometry must pass before screenshot');
          await page.screenshot({path:path.join(out,version+'-'+skin+'.png')});
          record.screenshots.push(version+'-'+skin+'.png');
          // An outside touch dismisses the sheet, never the app; translation stays copyable.
          await page.touchscreen.tap(345,100);
          state=await page.evaluate(() => S.peek());
          check('candidate '+skin+': outside dismiss',!state.sheet);
          fs.writeFileSync(path.join(out,'candidate-'+skin+'-outside.json'),JSON.stringify(state,null,2));
          await page.screenshot({path:path.join(out,'candidate-'+skin+'-outside.png')});
          // Retain a failed dismissal verdict; use the page's existing Back route only
          // to collect independent Copy coverage, not to relabel the failed touch.
          if (state.sheet) {
            await page.evaluate(() => { for(let n=0;n<4 && S.peek().sheet;n++) { if(!S.back()) break; } });
          }
          await page.locator('#tCopy').click();
          check('candidate '+skin+': recovered text remains copyable',await page.evaluate(()=>window.__calls.some(c=>c.kind==='copy'&&c.text.includes('Are there any girls?'))));
        }
        check(version+' '+skin+': no runtime errors',errors.length===0);
        await page.close();
      }
      await context.close();
    }
    record.ok=record.checks.length>0 && record.checks.every(c=>c.ok);
    if(!record.ok) process.exitCode=1;
  } catch(error) { record.ok=false; record.error=error.stack; throw error; }
  finally { await browser.close(); fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(record,null,2)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
