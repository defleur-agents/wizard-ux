/* The chrome the Orb and Apps views share (Miguel, 1 Nov 2026): the + sheet, the orb swipes and the full-screen app
 * windows both views wear. Used by the Apps view on both shells (layouts/apps) and by the Orb view (layouts/orb: the
 * phone's Home and the desktop scene); one source, so both views offer exactly the same lists and the same gestures,
 * and switching views (Desks | Orb | Apps) never loses anything: they all read the same desks.
 *
 *   - Three levels, in one logical flow (Miguel, 1 Nov 2026):
 *       1. Open      = every app with a desk (one to one with the Apps view's icons and the Orb's satellites);
 *       2. Installed = installed apps that are not open: a tap opens it on a desk of its own, where it then shows as its
 *                      own icon / satellite;
 *       3. Get more  = the App Store's apps this Wizard lacks (the Store app's own listing, api.apps.store()): a tap
 *                      opens that app's page in the App Store window (its own Get, never a second store); once it is
 *                      installed it opens right away in the Store's place.
 *     The + opens the sheet: one search field filters all three; Open tiles carry a ✕ that closes the app (its desk
 *     goes, it moves back to Installed). Backdrop, ✕ or Back / Esc close the sheet.
 *   - No Back button (round 6): Home is a swipe up on the orb, like the iPhone's home swipe (ORB_SWIPES: up = Home;
 *     sideways and down do nothing in these views). The desktop also keeps ⌥`.
 *   - Full screen (Miguel, 1 Nov 2026: "like Chats"): an open app uses the whole screen, the orb floats over it and the
 *     app fades out toward the bottom (chrome.css); hosted apps get room under their last item (api.apps.inset), so
 *     every list still scrolls clear of the orb.
 *
 * Its CSS (chrome.css, loaded from here) is scoped to html[data-view-chrome], set only while a view wears it. No
 * timers, no storage, no innerHTML; everything through the layout API. */
import { glyphOf, colourOf } from '../orb/shared.js';

const SVG = 'http://www.w3.org/2000/svg';
export const CHATS = 'wizard';

/** Level 2, Installed: the picker's apps minus Chats and every app already open (ids of the open desks). */
export function notOpen(apps, openIds) {
  const open = new Set(openIds || []);
  return (apps || []).filter(a => a && a.id && a.id !== CHATS && !a.agent && !a.connector && !a.dev && !open.has(a.id));
}
/** Level 1, Open: one per open app, in desk order (Chats left out: it is always there), named as the picker names it. */
export function openApps(apps, desks) {
  const meta = new Map((apps || []).map(a => [a.id, a])), seen = new Set();
  return (desks || []).filter(d => d && d.id && d.id !== CHATS && !seen.has(d.id) && seen.add(d.id))
    .map(d => meta.get(d.id) || { id: d.id, name: d.name || d.id, icon: '' });
}
/** The sheet's one search field: a case-insensitive match on the name (and a Store app's summary). */
export const matches = (a, q) => { const n = String(q || '').trim().toLowerCase(); return !n || String(a.name || '').toLowerCase().includes(n) || String(a.summary || '').toLowerCase().includes(n); };
/** Room the floating orb takes at the bottom of an app window (px), per shell: hosted apps scroll their last item
 * clear of it (api.apps.inset). The phone's dock orb sits in its row (dock height + safe area, ~92 px); the desktop
 * Apps orb is 60 px over an 8 px margin. */
export const FLOAT_INSET = Object.freeze({ phone: 96, desktop: 84 });

/** The phone dock orb's swipes in the Orb and Apps views (api.phone.swipes): up = Home; sideways (desk steps) and down
 * (distraction-free) do nothing; no Desks panel / app picker from the orb (the + covers new apps). Tap and hold stay
 * the stock ones. Desks declares nothing, so the dock keeps every stock swipe there. */
export const ORB_SWIPES = Object.freeze({ up: 'home', side: null, down: null });

export function viewChrome(api, { openIds, goOpen = null, inset = null, swipes = null }) {
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
  // (a view may give its own: AI apps' swipe up is a New chat with the keyboard up, 'new')
  const offSwipes = shell === 'phone' && api.phone?.swipes ? api.phone.swipes(swipes || ORB_SWIPES) : null;

  /* ---------- full screen: hosted apps get room under their last item for the floating orb ---------- */
  // the orb bar (the Wizard standard on the phone): the dock orb's fixed spot, bottom centre; an app's own bottom tabs
  // are laid out either side of it on its row (skin-host), never under it
  const orbSpot = () => {
    const o = api.phone?.orb?.(); if (!o?.getBoundingClientRect) return null;
    const r = o.getBoundingClientRect(), d = o.offsetWidth || r.width;   // untransformed size: a press never reflows the bar
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, d } : null;
  };
  const offInset = api.apps.inset ? api.apps.inset(inset ?? FLOAT_INSET[shell], shell === 'phone' ? orbSpot : null) : null;

  /* ---------- the + sheet: Open · Installed · Get more ---------- */
  let sheet = null, offBack = null, offMount = null, q = '', store = null, storeErr = false, body = null, closing = false;
  const desks = () => (api.desks?.list || api.phone?.desks)?.() || [];
  function list() { return notOpen(api.apps.list(), openIds()); }
  function tile(a, cls = 'vc-tile') {
    const t = el('span', cls, { 'aria-hidden': 'true' }); t.style.setProperty('--c', colourOf(a));
    t.append(el('i', `sgi sg-${glyphOf(a)}`, { 'aria-hidden': 'true' }));
    api.apps.logo(a.id).then(url => {
      if (!url || !t.isConnected) return;
      const im = el('img', 'vc-logo', { alt: '', src: url, draggable: 'false' });
      im.decode().then(() => { t.replaceChildren(im); t.classList.add('is-logo'); }, () => {});
    });
    return t;
  }
  // level 1: an open app; tap = go to it, ✕ = close it (its desk goes; it moves back to Installed)
  function openTile(a) {
    const box = el('div', 'vc-open', { role: 'listitem', 'data-open': a.id });
    const go = el('button', 'vc-hit', { type: 'button', 'aria-label': 'Go to ' + a.name });
    go.append(tile(a), el('span', 'vc-name', { text: a.name }));
    const x = el('button', 'vc-close', { type: 'button', 'aria-label': 'Close ' + a.name, title: 'Close ' + a.name }); x.append(icon('M7 7l10 10M17 7 7 17', 'vc-ico'));
    api.listen(go, 'click', () => { close(); (goOpen || (id => api.apps.openDesk ? api.apps.openDesk(id) : api.apps.open(id)))(a.id); });
    api.listen(x, 'click', () => { closing = true; try { api.apps.close?.(a.id); } finally { closing = false; } api.after(60, paint); });   // the sheet stays open (closing a desk briefly leaves Home)
    box.append(go, x);
    return box;
  }
  // level 2: installed, not open; tap = open it on a desk of its own
  function row(a) {
    const b = el('button', 'vc-app', { type: 'button', role: 'listitem', 'data-app': a.id, 'aria-label': 'Open ' + a.name });
    b.append(tile(a), el('span', 'vc-name', { text: a.name }));
    api.listen(b, 'click', () => { close(); api.apps.openDesk ? api.apps.openDesk(a.id) : api.apps.open(a.id); });
    return b;
  }
  // level 3: in the App Store, not installed; tap = its Store page (Get there; it opens once installed)
  function getRow(a) {
    const b = el('button', 'vc-get', { type: 'button', role: 'listitem', 'data-store': a.id, 'aria-label': `Get ${a.name} from the App Store` });
    const words = el('span', 'vc-get-w'); words.append(el('b', 'vc-get-n', { text: a.name }), el('span', 'vc-get-s', { text: a.summary || 'In the App Store' }));
    b.append(tile(a, 'vc-tile vc-tile-s'), words, el('span', 'vc-get-b', { text: 'Get', 'aria-hidden': 'true' }));
    api.listen(b, 'click', () => { close(); if (!api.apps.get?.(a.id)) api.apps.openDesk('app-store'); });
    return b;
  }
  const section = (title, n) => { const h = el('h3', 'vc-sec-h'); h.append(el('span', '', { text: title }), ...(n != null ? [el('small', 'vc-count', { text: String(n) })] : [])); return h; };
  function paint() {
    if (!sheet || !body) return;
    const apps = api.apps.list(), open = openApps(apps, desks()).filter(a => matches(a, q)), inst = list().filter(a => matches(a, q));
    const out = [];
    if (open.length) { const g = el('div', 'vc-list', { role: 'list', 'aria-label': 'Open' }); g.append(...open.map(openTile)); out.push(section('Open', open.length), g); }
    out.push(section('Installed', inst.length));
    if (inst.length) { const g = el('div', 'vc-list', { role: 'list', 'aria-label': 'Installed' }); g.append(...inst.map(row)); out.push(g); }
    else out.push(el('p', 'vc-empty', { text: q ? 'No installed app by that name.' : 'Every installed app is open.' }));
    out.push(section('Get more', store ? store.filter(a => matches(a, q)).length : null));
    if (storeErr) out.push(el('p', 'vc-empty', { text: 'The App Store can’t be reached right now.' }));
    else if (!store) out.push(el('p', 'vc-empty', { text: 'Looking in the App Store…' }));
    else {
      const hits = store.filter(a => matches(a, q));
      if (hits.length) { const g = el('div', 'vc-rows', { role: 'list', 'aria-label': 'Get more' }); g.append(...hits.map(getRow)); out.push(g); }
      else out.push(el('p', 'vc-empty', { text: q ? 'Nothing in the App Store by that name.' : 'You have every app in the App Store.' }));
    }
    const all = el('button', 'vc-store', { type: 'button', text: 'Browse the App Store' });
    api.listen(all, 'click', () => { close(); api.apps.openDesk('app-store'); });
    out.push(all);
    body.replaceChildren(...out);
  }
  function open() {
    if (sheet) return;
    q = ''; store = null; storeErr = false;
    sheet = el('div', 'vc-sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Apps' });
    const scrim = el('div', 'vc-scrim', { 'aria-hidden': 'true' });
    const card = el('div', 'vc-card');
    const head = el('div', 'vc-head');
    const find = el('label', 'vc-find');
    const field = el('input', 'vc-q', { type: 'search', placeholder: 'Search apps', 'aria-label': 'Search apps', autocomplete: 'off', enterkeyhint: 'search' });
    find.append(icon('M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20', 'vc-ico vc-find-i'), field);
    const shut = el('button', 'vc-x', { type: 'button', 'aria-label': 'Close' }); shut.append(icon('M6 6l12 12M18 6L6 18', 'vc-ico'));
    head.append(find, shut);
    body = el('div', 'vc-body');
    card.append(head, body); sheet.append(scrim, card);
    api.listen(scrim, 'click', close); api.listen(shut, 'click', close);
    api.listen(field, 'input', () => { q = field.value; paint(); });
    api.listen(field, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); body.querySelector('button')?.click(); } });
    offMount = api.mount(sheet);
    offBack = api.back?.push ? api.back.push(close) : null;
    root.dataset.vcSheet = 'open';
    paint();
    const mine = sheet;
    Promise.resolve(api.apps.store ? api.apps.store() : []).then(l => { if (sheet === mine) { store = l || []; paint(); } }, () => { if (sheet === mine) { storeErr = true; paint(); } });
    // the desktop types at once; the phone waits for a tap (no keyboard over the lists)
    if (shell === 'desktop') field.focus?.({ preventScroll: true }); else shut.focus?.({ preventScroll: true });
  }
  function close() {
    if (!sheet) return;
    const s = sheet; sheet = null; body = null;
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
    get closing() { return closing; },
    dispose() { close(); offSwipes?.(); offInset?.(); unmountCss(); css.remove(); delete root.dataset.viewChrome; },
  };
}
