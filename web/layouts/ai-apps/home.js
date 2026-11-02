/* The AI apps view's Home (Miguel, 2 Nov 2026: "apps move out of the drawer onto the Home screen"), shared by the phone
 * (layout.js) and the desktop (desktop.js). Home = the empty New chat; above its composer an iPhone-style grid of real
 * apps (the shared sheet's Apps: never agent apps, agents, connectors, system or in-development apps), each icon
 * filling its tile with its name under it; the open apps first (badged ones first), then the rest of the installed
 * apps, ending in Get more (the App Store). It scrolls; the composer and the orb stay pinned at the bottom.
 * Round 7 (Miguel, familiarity first): the Grid | Orb choice is gone; Home is the grid only (the Orb shell view, its own
 * tweak, keeps the orb scene).
 * No timers, markup strings or storage of its own; everything through the layout API. */
import { openApps, realApps, CHATS } from '../apps/chrome.js';
import { glyphOf, colourOf } from '../orb/shared.js';
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
  const box = el('section', 'ah', { 'aria-label': 'Home' }); box.hidden = true;
  const grid = el('div', 'ah-grid', { role: 'list', 'aria-label': 'Apps' });
  box.append(grid);

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
    api.listen(b, 'click', e => { if (Date.now() < swallow) { e.preventDefault?.(); return; } goApp(a.id); });
    holdable(b, a.id);
    return b;
  }
  /* Round 7 (Miguel): a hold on an app icon (phone) or a right click (desktop) offers it for the home screen, exactly as
   * the Desks' hold on an app tile does: the stock sheet (core/home-screen-apps.js through api.apps.homeScreen; native
   * pin on the Android app, the two-step Add to Home Screen / Install app guide elsewhere), never a copy. Apps the stock
   * sheet would not offer (system apps, no frontend) keep a plain tap. */
  const HOLD = 450;   // the stock hold (home-screen-apps.js)
  let swallow = 0, hold = null;
  const canPin = id => !!api.apps.homeScreen?.can?.(id);
  function offer(id) { swallow = Date.now() + 700; return !!api.apps.homeScreen?.offer?.(id); }
  function holdable(b, id) {
    api.listen(b, 'pointerdown', e => {
      if (e.button > 0 || !canPin(id)) return;
      const h = { x: e.clientX, y: e.clientY, pid: e.pointerId };
      h.off = api.after(HOLD, () => { if (hold !== h) return; hold = null; offer(id); });
      hold = h;
    });
    const end = () => { if (hold) { hold.off?.(); hold = null; } };
    api.listen(b, 'pointermove', e => { if (hold && e.pointerId === hold.pid && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) end(); });
    api.listen(b, 'pointerup', end); api.listen(b, 'pointercancel', end);
    api.listen(b, 'contextmenu', e => { if (!canPin(id)) return; e.preventDefault?.(); end(); if (Date.now() >= swallow) offer(id); });
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
    const sig = JSON.stringify([open.map(a => a.id + badgeText(a.id)), rest.map(a => a.id)]);
    if (!force && sig === drawn) return;
    drawn = sig;
    grid.replaceChildren(...open.map(a => cell(a)), ...rest.map(a => cell(a)), moreCell());
  }
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
    letters: lettersFor,
    /** The app a letter opens (null when none). */
    appFor: k => { const ks = lettersFor(); return Object.keys(ks).find(id => ks[id] === k) || null; },
    /** The Home icons on screen with their letters (for the hold-⌥ hints). */
    chips() { if (box.hidden) return []; const ks = lettersFor(); return [...box.querySelectorAll('.ah-grid > .ah-app[data-app]')].filter(b => ks[b.dataset.app]).map(b => ({ el: b.querySelector('.ah-ic'), key: ks[b.dataset.app], at: 'inside' })); },
    show(on) { if (box.hidden === !on) { if (on) paint(); return; } box.hidden = !on; if (on) paint(true); },
    paint,
  };
}
