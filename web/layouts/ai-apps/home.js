/* The AI apps view's Home (Miguel, 2 Nov 2026: "apps move out of the drawer onto the Home screen"), shared by the phone
 * (layout.js) and the desktop (desktop.js). Home = the empty New chat; above its composer:
 *   - Grid (the default): an iPhone-style grid of real apps (the shared sheet's Apps: never agent apps, agents,
 *     connectors, system or in-development apps), each icon filling its tile with its name under it; the open apps
 *     first (badged ones first), then the rest of the installed apps, ending in Get more (the App Store). It scrolls;
 *     the composer and the orb stay pinned at the bottom.
 *   - Orb: the Orb view's scene (its night sky, from layouts/orb/shared.js) with an orb in the centre and the open apps
 *     still around it (nothing moves under the finger), the same taps.
 * A small Grid | Orb switch at the top of Home picks the style, kept on this device (api.storage 'homeStyle').
 * No timers, markup strings or storage of its own; everything through the layout API. */
import { openApps, realApps, CHATS } from '../apps/chrome.js';
import { glyphOf, colourOf, palettes, starsFor, paintSky } from '../orb/shared.js';
import { svgIcon } from './parts.js';

/* App letters (Miguel, 2 Nov 2026: "keep ALL existing Option-key hotkeys"): ⌥ + a letter opens a Home app, but only
 * letters the desktop's own ⌥ keys leave free (⌥C D F G I L N O P R S T V W X Z keep their meaning; H flips the Home
 * style), so nothing changes meaning while ⌥ is held. The Orbs view's rule otherwise (layouts/orb/keys.js): one plain
 * letter per app, the first free letter of its name, else any free one; stable per device; the rest get none. */
export const APP_LETTERS = [...'ABEJKMQUY'];
export function appKeys(apps, saved = {}) {
  const free = new Set(APP_LETTERS), out = {};
  for (const a of apps) { const k = saved?.[a.id]; if (typeof k === 'string' && free.has(k)) { out[a.id] = k; free.delete(k); } }
  for (const a of apps) { if (out[a.id]) continue; const k = [...String(a.name || a.id).toUpperCase()].find(c => free.has(c)); if (k) { out[a.id] = k; free.delete(k); } }
  for (const a of apps) if (!out[a.id]) { const k = [...free][0]; if (k) { out[a.id] = k; free.delete(k); } }
  return out;
}
export const HOME_STYLES = [['grid', 'Grid'], ['orb', 'Orb']];
/** A stored Home style, or the default (Grid). */
export const homeStyle = v => (v === 'orb' ? 'orb' : 'grid');
const byName = (x, y) => String(x.name).localeCompare(String(y.name), undefined, { sensitivity: 'base' });
/** Home's apps: the open real apps (badged first, then desk order), then the other installed real apps by name. */
export function homeApps(apps, desks, kinds, lit = () => false) {
  const open = realApps(openApps(apps, desks), kinds), openIds = new Set(open.map(a => a.id));
  const pool = kinds && Array.isArray(kinds.apps) ? kinds.apps : apps || [];
  const rest = realApps(pool.filter(a => a && a.id && a.id !== CHATS && !openIds.has(a.id)), kinds && Array.isArray(kinds.apps) ? { apps: pool } : null).sort(byName);
  return { open: [...open.filter(a => lit(a.id)), ...open.filter(a => !lit(a.id))], rest };
}

export function homeView(api, { goApp, getMore, lit, badgeText, desks }) {
  const doc = document;
  const el = (tag, cls, attrs = {}) => { const n = doc.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } return n; };
  let style = homeStyle(api.storage.get('homeStyle'));
  const box = el('section', 'ah', { 'aria-label': 'Home' }); box.hidden = true;
  const sw = el('div', 'ah-sw', { role: 'radiogroup', 'aria-label': 'Home style' });
  const opts = HOME_STYLES.map(([id, word]) => { const b = el('button', 'ah-swo', { type: 'button', role: 'radio', 'data-style': id, text: word }); api.listen(b, 'click', () => setStyle(id)); return b; });
  sw.append(...opts);
  const grid = el('div', 'ah-grid', { role: 'list', 'aria-label': 'Apps' });
  const scene = el('div', 'ah-scene'); const sky = el('canvas', 'ah-sky', { 'aria-hidden': 'true' });
  const core = el('button', 'ah-core', { type: 'button', 'aria-label': 'Wizard orb: talk' });
  const cv = el('canvas', 'ah-corec', { width: '220', height: '220', 'aria-hidden': 'true' }), fb = el('img', 'ah-corefb', { alt: '', src: 'robert-thread-orb.png', draggable: 'false' }); fb.hidden = true;
  core.append(cv, fb);
  const ring = el('div', 'ah-ring', { role: 'list', 'aria-label': 'Open apps' });
  scene.append(sky, core, ring);
  box.append(sw, grid, scene);
  api.listen(core, 'click', () => (api.voice?.talk || api.voice?.tap)?.());
  let eng = null;

  function tile(a) {
    const t = el('span', 'ah-tile', { 'aria-hidden': 'true' });
    t.style.setProperty('--c', colourOf(a)); t.append(el('i', `sgi sg-${glyphOf(a)}`, { 'aria-hidden': 'true' }));
    api.apps.logo(a.id).then(url => {
      if (!url || !t.isConnected) return;
      const im = el('img', 'ah-logo', { alt: '', src: url, draggable: 'false' });
      im.decode().then(() => { t.replaceChildren(im); t.classList.add('is-logo'); }, () => {});
    });
    return t;
  }
  function cell(a, cls = 'ah-app') {
    const b = el('button', cls, { type: 'button', role: 'listitem', 'data-app': a.id, title: a.name });
    const ic = el('span', 'ah-ic'), n = el('b', 'ah-badge', { 'aria-hidden': 'true', text: badgeText(a.id) }); n.hidden = !n.textContent;
    ic.append(tile(a), n);
    b.append(ic, el('span', 'ah-name', { text: a.name }));
    b.setAttribute('aria-label', a.name + (n.textContent ? `, ${n.textContent} new` : ''));
    api.listen(b, 'click', () => goApp(a.id));
    return b;
  }
  function moreCell() {
    const b = el('button', 'ah-app ah-more', { type: 'button', role: 'listitem', 'aria-label': 'Get more apps' });
    const ic = el('span', 'ah-ic'), t = el('span', 'ah-tile is-plain', { 'aria-hidden': 'true' }); t.append(svgIcon(doc, 'plus', 'ah-ico')); ic.append(t);
    b.append(ic, el('span', 'ah-name', { text: 'Get more', 'aria-hidden': 'true' }));
    api.listen(b, 'click', getMore);
    return b;
  }
  let drawn = '';
  function paint(force = false) {
    if (box.hidden) return;
    const { open, rest } = homeApps(api.apps.list(), desks(), api.apps.kinds?.(), lit);
    const sig = JSON.stringify([style, open.map(a => a.id + badgeText(a.id)), rest.map(a => a.id)]);
    for (const o of opts) o.setAttribute('aria-checked', String(o.dataset.style === style));
    box.dataset.style = style;
    if (!force && sig === drawn) { if (style === 'orb') paintScene(); return; }
    drawn = sig;
    grid.replaceChildren(...open.map(a => cell(a)), ...rest.map(a => cell(a)), moreCell());
    // the ring: the open apps, still, clockwise from the top (badged ones first, so they sit together at the top)
    ring.replaceChildren(...open.map(a => cell(a, 'ah-app ah-sat')));
    if (style === 'orb') paintScene();
  }
  function paintScene() {
    const r = scene.getBoundingClientRect(); if (!r.width || !r.height) return;
    const W = Math.round(r.width), H = Math.round(r.height), cx = W / 2, cy = H / 2;
    sky.width = W; sky.height = H;
    const sx = sky.getContext?.('2d'); if (sx) { const P = palettes(doc)('skin'); paintSky(sx, { W, H, gx: cx, cy, t: 0, lv: 0, P, stars: starsFor(W, H) }); }
    const O = Math.min(150, Math.max(96, Math.min(W, H) * .3)); core.style.setProperty('--ah-o', O + 'px');
    const sats = [...ring.children], n = sats.length, R = Math.min(W / 2 - 44, H / 2 - 52, O / 2 + 40 + n * 6);
    sats.forEach((s, i) => { const t = -Math.PI / 2 + i / Math.max(1, n) * Math.PI * 2; s.style.setProperty('--x', Math.round(cx + Math.cos(t) * R) + 'px'); s.style.setProperty('--y', Math.round(cy + Math.sin(t) * R) + 'px'); });
    if (!eng && api.orb?.ready) api.orb.ready().then(ok => { if (ok && !eng && box.isConnected) { eng = api.orb.create(cv, fb, { R: .64 }); eng?.setRestingMotion?.(false); } });
  }
  function setStyle(id) { style = homeStyle(id); api.storage.set('homeStyle', style); paint(true); }
  // the letters: the apps in Home's order (open first), kept per device
  let keys = {};
  function lettersFor() {
    const { open, rest } = homeApps(api.apps.list(), desks(), api.apps.kinds?.(), lit);
    const saved = api.storage.get('appKeys'); keys = appKeys([...open, ...rest], saved && typeof saved === 'object' ? saved : {});
    if (JSON.stringify(keys) !== JSON.stringify(saved || {})) api.storage.set('appKeys', keys);
    return keys;
  }
  return {
    el: box,
    get style() { return style; },
    toggleStyle: () => setStyle(style === 'grid' ? 'orb' : 'grid'),
    switchEl: sw,
    letters: lettersFor,
    /** The app a letter opens (null when none). */
    appFor: k => { const ks = lettersFor(); return Object.keys(ks).find(id => ks[id] === k) || null; },
    /** The Home icons on screen with their letters (for the hold-⌥ hints). */
    chips() { if (box.hidden) return []; const ks = lettersFor(); return [...box.querySelectorAll(style === 'orb' ? '.ah-ring > .ah-app' : '.ah-grid > .ah-app[data-app]')].filter(b => ks[b.dataset.app]).map(b => ({ el: b.querySelector('.ah-ic'), key: ks[b.dataset.app], at: 'inside' })); },
    show(on) { if (box.hidden === !on) { if (on) paint(); return; } box.hidden = !on; if (on) paint(true); },
    paint,
  };
}
