'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { decodePNG, compare, interiorROI, longMetrics } = require('./viewer-qa-oracles.cjs');
const hash = b => require('node:crypto').createHash('sha256').update(b).digest('hex');
const write = (out, name, data) => fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(data, null, 2) + '\n');
async function zoom({ p, out, settle, state, open, fits }) {
  await open();
  await p.evaluate(() => {
    window.__viewerInput = [];
    for (const type of ['pointerdown', 'pointerup', 'gotpointercapture', 'lostpointercapture', 'click', 'dblclick']) document.addEventListener(type, e => {
      if (__viewerInput.length < 100) __viewerInput.push({ type, trusted: e.isTrusted, pointerType: e.pointerType, detail: e.detail, x: e.clientX, y: e.clientY, target: e.target.className, state: WosChat.viewer.state });
    }, true);
  });
  const journal = [];
  const snapshot = async label => {
    journal.push(await p.evaluate(label => { const v = document.querySelector('.mviewer'), img = v?.querySelector('img'), s = v?.querySelector('.mv-stage'); return { label, state: WosChat.viewer.state, active: document.activeElement?.className, image: img?.getBoundingClientRect().toJSON(), stage: s?.getBoundingClientRect().toJSON(), events: [...__viewerInput] }; }, label));
    write(out, 'desktop-zoom-input', journal);
  };
  const ink = await p.evaluate(() => {
    const i = document.querySelector('.mv-stage img'), r = i.getBoundingClientRect(), b = i.parentElement.getBoundingClientRect(), long = WosChat.viewer.state.long;
    const k = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight), w = long ? r.width : i.naturalWidth * k, h = long ? r.height : i.naturalHeight * k;
    const left = Math.max(b.left, r.left + (r.width - w) / 2), right = Math.min(b.right, r.right - (r.width - w) / 2), top = Math.max(b.top, r.top + (r.height - h) / 2), bottom = Math.min(b.bottom, r.bottom - (r.height - h) / 2);
    const x = (left + right) / 2, y = (top + bottom) / 2;
    return { x, y, left, right, top, bottom, hit: document.elementFromPoint(x, y) === i };
  });
  journal.push({ ink }); write(out, 'desktop-zoom-input', journal);
  assert(ink.hit && ink.right > ink.left && ink.bottom > ink.top, 'trusted click must hit actual media ink');
  // Production owns a pointerup double-tap recognizer, not a dblclick listener.
  // Never dispatch DOM PointerEvents or bypass stage capture to manufacture a pass.
  await p.mouse.move(ink.x, ink.y);
  await p.mouse.click(ink.x, ink.y, { delay: 20 }); await snapshot('first trusted click');
  assert((await state()).open, 'ordinary media-ink click must not dismiss viewer; inspect captured pointer/click targets');
  await p.waitForTimeout(100);
  await p.mouse.click(ink.x, ink.y, { delay: 20 }); await settle(p); await snapshot('second trusted click');
  assert((await state()).open && (await state()).scale > 2, 'trusted double click zooms without dismissal');
  await p.waitForTimeout(400);
  await p.mouse.click(ink.x, ink.y, { delay: 20 }); await p.waitForTimeout(100); await p.mouse.click(ink.x, ink.y, { delay: 20 });
  await settle(p); await snapshot('reset'); assert((await state()).open); assert.equal((await state()).scale, 1);
  if (fits) await fits('reset');
}
async function opacity({ p, out, name, settle }) {
  await settle(p);
  for (const selector of ['.mv-top', '.mv-bar', '.mv-menu-b']) {
    const panel = p.locator(selector); if (!await panel.isVisible()) continue;
    const stem = name.replace(/\W/g, '-') + selector.replace(/\W/g, '-'), ledger = { selector, name, captures: [] };
    let restored;
    const shot = async tag => {
      await settle(p);
      const b = await panel.screenshot(), decoded = decodePNG(b); fs.writeFileSync(path.join(out, stem + '-' + tag + '.png'), b);
      ledger.captures.push({ tag, sha256: hash(b), width: decoded.width, height: decoded.height }); write(out, stem, ledger); return decoded;
    };
    try {
      ledger.meta = await panel.evaluate(e => {
        const r = e.getBoundingClientRect(), s = getComputedStyle(e), exclusions = [];
        const add = b => exclusions.push({ left: b.left - r.left, right: b.right - r.left, top: b.top - r.top, bottom: b.bottom - r.top });
        e.querySelectorAll('button,input,img,svg').forEach(n => add(n.getBoundingClientRect()));
        const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.trim()) { const range = document.createRange(); range.selectNodeContents(n); for (const b of range.getClientRects()) add(b); }
        return { width: Math.floor(r.width), height: Math.floor(r.height), rect: r.toJSON(), background: s.backgroundColor, opacity: s.opacity, radii: ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].map(k => parseFloat(s[k]) || 0), borders: ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].map(k => parseFloat(s[k]) || 0), padding: ['paddingTop','paddingRight','paddingBottom','paddingLeft'].map(k => parseFloat(s[k]) || 0), exclusions, oldStyle: e.getAttribute('style') };
      });
      assert(ledger.meta.opacity === '1' && /^rgb\(/.test(ledger.meta.background), 'opaque computed panel');
      ledger.roi = interiorROI(ledger.meta);
      // No production style change. Only sibling stacking/fixture geometry is normalized.
      await panel.evaluate(e => { e.style.position = 'relative'; e.style.zIndex = '2'; });
      const a = await shot('bare-a'), b = await shot('bare-b');
      ledger.bareControl = compare(a, b, ledger.roi); assert.equal(ledger.bareControl.changed, 0, 'unchanged interior control');
      ledger.probe = await panel.evaluate(e => {
        const parent = e.parentElement, r = e.getBoundingClientRect(), b = parent.getBoundingClientRect(), x = document.createElement('div'); x.id = 'loud-underlay';
        x.style.cssText = `position:absolute;left:${r.left-b.left}px;top:${r.top-b.top}px;width:${r.width}px;height:${r.height}px;z-index:1;pointer-events:none;background:repeating-linear-gradient(90deg,#ff0000 0 5px,#00ff00 5px 10px);font:40px sans-serif;color:#000`;
        x.textContent = 'LOUD SYNTHETIC TEXT '.repeat(200); parent.insertBefore(x, e);
        x.style.pointerEvents = 'auto'; const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2); x.style.pointerEvents = 'none';
        return { parent: parent.className, panelIndex: stack.indexOf(e), probeIndex: stack.indexOf(x), rect: x.getBoundingClientRect().toJSON(), panelRect: r.toJSON(), immediatelyBefore: x.nextElementSibling === e, zIndex: getComputedStyle(x).zIndex };
      });
      assert(ledger.probe.immediatelyBefore && ledger.probe.zIndex === '1' && ledger.probe.panelIndex >= 0 && ledger.probe.probeIndex > ledger.probe.panelIndex, 'probe is below exact panel in same stack');
      const loud = await shot('loud'); ledger.fullBox = compare(a, loud); ledger.interior = compare(a, loud, ledger.roi);
      assert.equal(ledger.interior.changed, 0, 'zero interior change over loud text');
      // Same exact interior, same sibling. A genuinely transparent text panel MUST fail.
      await panel.evaluate(e => e.style.background = 'transparent');
      const transparent = await shot('transparent-negative'); ledger.negative = compare(a, transparent, ledger.roi);
      assert(ledger.negative.changed > 0, 'same-ROI real transparency negative must be detectable');
      await panel.evaluate((e, background) => e.style.background = background, ledger.meta.background);
      await p.locator('#loud-underlay').evaluate(e => e.remove()); restored = await shot('restored'); ledger.restored = compare(a, restored, ledger.roi);
      assert.equal(ledger.restored.changed, 0, 'restored interior control');
      ledger.pass = true;
    } finally {
      await p.locator('#loud-underlay').evaluateAll(es => es.forEach(e => e.remove()));
      if (ledger.meta) await panel.evaluate((e, old) => old === null ? e.removeAttribute('style') : e.setAttribute('style', old), ledger.meta.oldStyle);
      write(out, stem, ledger);
    }
  }
}
async function phoneBottom({ p, ctx, out, drag, open, state, capture }) {
  const ledger = [];
  const measure = async label => {
    const g = await p.evaluate(label => { const i = document.querySelector('.mv-stage img'), s = i.parentElement; return { label, state: WosChat.viewer.state, natural: { width: i.naturalWidth, height: i.naturalHeight }, image: i.getBoundingClientRect().toJSON(), stage: s.getBoundingClientRect().toJSON(), active: document.activeElement?.className }; }, label);
    ledger.push({ ...g, measured: longMetrics(g) }); write(out, 'phone-footer-measurements', ledger); return g;
  };
  const env = await p.evaluate(() => ({ shell: document.documentElement.dataset.shell, ua: navigator.userAgent, touch: navigator.maxTouchPoints }));
  assert.equal(env.shell, 'phone'); assert(/Android/.test(env.ua) && env.touch > 0);
  await open(3); const g0 = await measure('initial'), b = g0.stage, x = b.x + b.width / 2, delta = b.height * .6;
  const hit = await p.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.mv-stage'), { x, y: b.y + b.height * .8 }); assert(hit, 'phone drag begins on real stage');
  const cdp = await ctx.newCDPSession(p);
  try {
    await drag(cdp, [{ x, y: b.y + b.height * .8 }], [{ x, y: b.y + b.height * .2 }]);
    const first = await measure('first drag'); assert(first.state.y < 0, 'pan moves screenshot');
    // Test keys as an independent input, retain focus and state diagnostics before
    // touch recovery; do not refocus the page or mask missing keyboard delivery.
    await p.keyboard.press('PageDown'); const key = await measure('one PageDown');
    assert(key.state.y < first.state.y || Math.abs(longMetrics(key).remaining) < 2, 'PageDown progresses reading');
    const limit = Math.ceil(longMetrics(key).remaining / delta) + 3; assert(limit <= 40, 'bounded geometry-derived drag budget');
    let current = key;
    for (let n = 0; n < limit && longMetrics(current).remaining > 1; n++) {
      const prior = current.state.y;
      await drag(cdp, [{ x, y: b.y + b.height * .8 }], [{ x, y: b.y + b.height * .2 }]); current = await measure('drag ' + (n + 2));
      assert(current.state.y < prior || longMetrics(current).remaining < 2, 'every drag progresses or reaches clamp');
    }
    await p.waitForTimeout(350); current = await measure('settled clamp'); const m = longMetrics(current);
    assert(Math.abs(current.state.y - m.minY) < 2, 'actual state reaches production bottom clamp');
    assert(Math.abs(m.footerBottom - m.stageBottom) < 2, 'actual image footer reaches stage bottom');
    await drag(cdp, [{ x, y: b.y + b.height * .8 }], [{ x, y: b.y + b.height * .2 }]); const over = await measure('extra drag at bottom');
    assert(Math.abs(over.state.y - m.minY) < 2 && (await state()).open, 'extra drag cannot overscroll or close');
    await capture('phone-long-bottom');
  } finally { await cdp.detach(); }
}
module.exports = { zoom, opacity, phoneBottom };
