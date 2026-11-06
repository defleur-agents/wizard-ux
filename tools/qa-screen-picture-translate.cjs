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
const current = path.resolve(__dirname, '../android/app/src/main/assets/assist/screen.html');
const baseline = path.join(fixture, 'baseline-screen.html');
const record = {mode: 'recorded-installed-private-inference-replay, NOT new inference or native device proof', checks: [], screenshots: []};
const check = (name, ok) => { record.checks.push({name, ok}); assert.ok(ok, name); };
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const skin of ['nebula','grove']) {
      const context = await browser.newContext({viewport:{width:360,height:780},deviceScaleFactor:3,hasTouch:true,isMobile:true});
      for (const version of ['baseline','candidate']) {
        const page = await context.newPage(), errors=[];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(({jpeg,read,mapping}) => {
          window.__calls = [];
          window.ScreenNative = {shot: () => jpeg, log() {}, close() {}, closeSearch() {}, sheet() {}, search() {},
            copy: text => window.__calls.push({kind:'copy',text}), ask: text => window.__calls.push({kind:'ask',text}),
            picture: id => { window.__calls.push({kind:'picture'}); setTimeout(() => S.pictured(id,read), 25); },
            translate: (id,json,to) => {
              const items = JSON.parse(json); window.__calls.push({kind:'translate',items,to});
              const unknown = items.filter(t => !(t in mapping));
              if (unknown.length || to !== 'English') throw new Error('No recorded inference for requested input');
              setTimeout(() => S.translated(id,{items:items.map(t => mapping[t]),from:items.some(t => /[\u0e00-\u0e7f]/.test(t)) ? 'Thai' : ''}),25);
            }};
        }, {jpeg:image.toString('base64'),read,mapping});
        await page.goto('file://' + (version === 'baseline' ? baseline : current));
        await page.evaluate(skin => {
          const roles = skin === 'grove' ? {'--wz-panel':'#f5f2e8','--wz-ink':'#17291e','--wz-accent':'#245a39','--wz-ink-secondary':'#56614f','--wz-line':'#b3bfa9'} : {'--wz-panel':'#120e24','--wz-ink':'#f4f1ff','--wz-accent':'#b99bff','--wz-ink-secondary':'#a79fc4','--wz-line':'#51436c'};
          Object.entries(roles).forEach(([k,v]) => document.documentElement.style.setProperty(k,v));
        },skin);
        const labels=['Copy translation','Select text','Ask Wizard'];
        const blocks=labels.map((t,i) => ({t,x:8+i*115,y:720,w:110,h:22,l:false,wd:t.split(' ').map((s,j,a) => [s,j===a.length-1?'':' '])}));
        await page.evaluate(blocks => S.open({mode:'translate',shot:true,dpr:1,sw:360,sh:780,top:24,bot:24,few:false,blocks}),blocks);
        if (version === 'baseline') {
          await page.waitForFunction(() => /Already in English/.test(S.peek().pill || ''));
          const calls=await page.evaluate(() => window.__calls);
          check('baseline '+skin+': false English verdict bypasses vision',!calls.some(c=>c.kind==='picture'));
        } else {
          await page.waitForFunction(() => S.peek().trans?.text?.includes("I'm heading to battle"));
          let state=await page.evaluate(() => S.peek());
          check('candidate '+skin+': Thai meme extracted',state.pic.some(t=>/[\u0e00-\u0e7f]/.test(t)));
          check('candidate '+skin+': actual recorded English translations visible',state.trans.text.includes('Are there any girls?') && state.sheet && /Thai/.test(state.pill));
          check('candidate '+skin+': not false English verdict',!/Already in English/.test(state.pill));
          const before=state.trans.text;
          await page.evaluate(() => document.documentElement.style.setProperty('--wz-panel','#203428'));
          state=await page.evaluate(() => S.peek());
          check('candidate '+skin+': live role change keeps translation',state.trans.text===before);
          const bg=await page.locator('#sheet').evaluate(e=>getComputedStyle(e).backgroundColor);
          check('candidate '+skin+': text panel fully opaque',!bg.startsWith('rgba'));
          await page.evaluate(skin => document.documentElement.style.setProperty('--wz-panel',skin==='grove'?'#f5f2e8':'#120e24'),skin);
          await page.screenshot({path:path.join(out,version+'-'+skin+'.png')});
          record.screenshots.push(version+'-'+skin+'.png');
          // An outside touch dismisses the sheet, never the app; translation stays copyable.
          await page.touchscreen.tap(345,100);
          state=await page.evaluate(() => S.peek());
          check('candidate '+skin+': outside dismiss',!state.sheet);
          await page.locator('#tCopy').click();
          check('candidate '+skin+': recovered text remains copyable',await page.evaluate(()=>window.__calls.some(c=>c.kind==='copy'&&c.text.includes('Are there any girls?'))));
        }
        check(version+' '+skin+': no runtime errors',errors.length===0);
        await page.close();
      }
      await context.close();
    }
    record.ok=true;
  } catch(error) { record.ok=false; record.error=error.stack; throw error; }
  finally { await browser.close(); fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(record,null,2)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
