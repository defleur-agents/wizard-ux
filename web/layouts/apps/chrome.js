/* The chrome the Orb and Apps views share (Miguel, 1 Nov 2026): the + sheet that opens an app that is not open yet,
 * and the orb swipes both views wear. Used by the Apps view on both shells (layouts/apps) and by the Orb view on the
 * phone (layouts/orb/phone.js); one source, so both views offer exactly the same list and the same gestures.
 *
 *   - No Back button (Miguel, 1 Nov 2026, round 6): Home is a swipe up on the orb, like the iPhone's home swipe
 *     (ORB_SWIPES: up = Home; sideways and down do nothing in these views). The desktop also keeps ⌥`.
 *   - The + sheet: every installed app that is NOT already open, as the stock app picker lists them (api.apps.list()
 *     = WosAppKinds.kinds().apps: the picker's Apps group, so no agents, agent apps, connectors or in-development
 *     copies) minus Chats (always there already) and minus every app open on a desk. A tap opens it on a desk of its
 *     own (api.apps.openDesk), where it then shows as its own icon / satellite. Backdrop, ✕ or Back / Esc close it.
 *
 * Its CSS (chrome.css, loaded from here) is scoped to html[data-view-chrome], set only while a view wears it. No
 * timers, no storage, no innerHTML; everything through the layout API. */
import { glyphOf, colourOf } from '../orb/shared.js';

const SVG = 'http://www.w3.org/2000/svg';
export const CHATS = 'wizard';

/** The + sheet's list: the picker's apps minus Chats and every app already open (ids of the open desks). */
export function notOpen(apps, openIds) {
  const open = new Set(openIds || []);
  return (apps || []).filter(a => a && a.id && a.id !== CHATS && !a.agent && !a.connector && !a.dev && !open.has(a.id));
}

/** The phone dock orb's swipes in the Orb and Apps views (api.phone.swipes): up = Home; sideways (desk steps) and down
 * (distraction-free) do nothing; no Desks panel / app picker from the orb (the + covers new apps). Tap and hold stay
 * the stock ones. Desks declares nothing, so the dock keeps every stock swipe there. */
export const ORB_SWIPES = Object.freeze({ up: 'home', side: null, down: null });

export function viewChrome(api, { openIds }) {
  const doc = document, root = doc.documentElement, shell = api.env.shell === 'desktop' ? 'desktop' : 'phone';
  const el = (tag, cls, attrs = {}) => { const n = doc.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } return n; };
  const icon = (d, cls) => {
    if (typeof doc.createElementNS !== 'function') return el('i', cls);
    const s = doc.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls);
    const p = doc.createElementNS(SVG, 'path'); p.setAttribute('d', d); s.append(p); return s;
  };
  let href = 'chrome.css';
  try { const u = new URL('chrome.css', import.meta.url); u.search = new URL(import.meta.url).search; href = u.href; } catch (_) {}
  const css = el('link', '', { rel: 'stylesheet', href });
  const unmountCss = api.mount(css);
  root.dataset.viewChrome = shell;

  // the dock orb's swipes (phone; the desktop Apps orb is the layout's own button): up = Home, the rest inert
  const offSwipes = shell === 'phone' && api.phone?.swipes ? api.phone.swipes(ORB_SWIPES) : null;

  /* ---------- the + sheet ---------- */
  let sheet = null, offBack = null, offMount = null;
  function list() { return notOpen(api.apps.list(), openIds()); }
  function row(a) {
    const b = el('button', 'vc-app', { type: 'button', 'data-app': a.id, 'aria-label': 'Open ' + a.name });
    const tile = el('span', 'vc-tile', { 'aria-hidden': 'true' }); tile.style.setProperty('--c', colourOf(a));
    tile.append(el('i', `sgi sg-${glyphOf(a)}`, { 'aria-hidden': 'true' }));
    b.append(tile, el('span', 'vc-name', { text: a.name }));
    api.listen(b, 'click', () => { close(); api.apps.openDesk ? api.apps.openDesk(a.id) : api.apps.open(a.id); });
    api.apps.logo(a.id).then(url => {
      if (!url || !b.isConnected) return;
      const im = el('img', 'vc-logo', { alt: '', src: url, draggable: 'false' });
      im.decode().then(() => { tile.replaceChildren(im); b.classList.add('is-logo'); }, () => {});
    });
    return b;
  }
  function open() {
    if (sheet) return;
    const apps = list();
    sheet = el('div', 'vc-sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Open an app' });
    const scrim = el('div', 'vc-scrim', { 'aria-hidden': 'true' });
    const card = el('div', 'vc-card');
    const head = el('div', 'vc-head');
    const shut = el('button', 'vc-x', { type: 'button', 'aria-label': 'Close' }); shut.append(icon('M6 6l12 12M18 6L6 18', 'vc-ico'));
    head.append(el('span', 'vc-title', { text: 'Open an app' }), shut);
    const grid = el('div', 'vc-list', { role: 'list' });
    if (apps.length) grid.append(...apps.map(row));
    else grid.append(el('p', 'vc-empty', { text: 'Every app is open already.' }));
    card.append(head, grid); sheet.append(scrim, card);
    api.listen(scrim, 'click', close); api.listen(shut, 'click', close);
    offMount = api.mount(sheet);
    offBack = api.back?.push ? api.back.push(close) : null;
    root.dataset.vcSheet = 'open';
    shut.focus?.({ preventScroll: true });
  }
  function close() {
    if (!sheet) return;
    const s = sheet; sheet = null;
    offBack?.(); offBack = null; offMount?.(); offMount = null; s.remove();
    delete root.dataset.vcSheet;
  }
  /** A + button (Apps: the grid's last tile; Orb: beside the Chats pill). */
  function plus(cls, label = 'Open an app', build = null) {
    const b = el('button', cls, { type: 'button', 'aria-label': label, title: label }), ico = icon('M12 5v14M5 12h14', 'vc-ico');
    if (build) build(b, ico, el); else b.append(ico);
    api.listen(b, 'click', open);
    return b;
  }

  return {
    plus, open, close, list,
    get isOpen() { return !!sheet; },
    dispose() { close(); offSwipes?.(); unmountCss(); css.remove(); delete root.dataset.viewChrome; },
  };
}
