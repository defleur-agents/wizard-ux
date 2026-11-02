/* The AI apps view's Home (Miguel, 2 Nov 2026: "apps move out of the drawer onto the Home screen"), shared by the phone
 * (layout.js) and the desktop (desktop.js). Home = the empty New chat; with it an iPhone-style grid of real apps (the
 * shared sheet's Apps: never agent apps, agents, connectors, system or in-development apps), each icon filling its tile
 * with its name under it; the open apps first (badged ones first), then the rest of the installed apps, ending in Get
 * more (the App Store).
 * Round 7 (Miguel, familiarity first): the Grid | Orb choice is gone; Home is the grid only.
 * Round 10 (Miguel, 2 Nov 2026: umbrelOS's Home with the AI-first composer):
 *   - Rearrange (both shells, iPhone / Umbrel style): press and drag an icon (the desktop: a mouse drag; the phone: hold,
 *     then drag); the others make room with a short slide; dropped, the order is kept (api.storage `appOrder`, on this
 *     device: there is no owner-wide app order to reuse). Apps never placed come after the arranged ones, in the default
 *     order; Get more stays last. A hold released without a drag still offers the app for the home screen (round 7).
 *   - Paged (the desktop): as many rows as fit (never a single row), then pages with dots; the wheel / a trackpad, ← / →
 *     (PageUp / PageDown) and a drag on the empty grid turn them; dragging an icon to a side edge turns the page too.
 *   - A right click (the desktop) opens the caller's quick actions (menu).
 * No timers beyond api.after, no markup strings; everything through the layout API. */
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

/** Round 10: the owner's arrangement (kept per device under this key). */
export const ORDER_KEY = 'appOrder';
/** The list in the owner's order: the arranged apps first, as he left them; the ones he never placed after, as given. */
export function orderApps(list, saved) {
  if (!Array.isArray(saved) || !saved.length) return list;
  const by = new Map(list.map(a => [a.id, a])), out = [];
  for (const id of saved) if (typeof id === 'string' && by.has(id)) { out.push(by.get(id)); by.delete(id); }
  return [...out, ...list.filter(a => by.has(a.id))];
}
/** ids with id moved so that it ends at index i (a new array). */
export function moveTo(ids, id, i) {
  const out = ids.filter(x => x !== id);
  out.splice(Math.max(0, Math.min(out.length, i | 0)), 0, id);
  return out;
}
/** A page of the desktop grid: the columns and rows that fit (cell cw × ch), at most maxCols wide, never one row. */
export function pageFit(w, h, cw, ch, maxCols = 7) {
  const cols = Math.max(2, Math.min(maxCols, Math.floor(w / cw) || 0)), rows = Math.max(2, Math.floor(h / ch) || 0);
  return { cols, rows, per: cols * rows };
}
export const CELL = { w: 124, h: 128 }, DRAG_FROM = 6, EDGE = 40, EDGE_MS = 550;

export function homeView(api, { goApp, getMore, lit, badgeText, desks, paged = false, menu = null }) {
  const doc = document;
  const el = (tag, cls, attrs = {}) => { const n = doc.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } return n; };
  const box = el('section', 'ah' + (paged ? ' ah-paged' : ''), { 'aria-label': 'Home' }); box.hidden = true;
  // the phone: one grid that scrolls; the desktop: pages in a sliding track, dots under them
  const grid = paged ? null : el('div', 'ah-grid', { role: 'list', 'aria-label': 'Apps' });
  const view = paged ? el('div', 'ah-view') : null, track = paged ? el('div', 'ah-track') : null, dots = paged ? el('div', 'ah-dots', { role: 'tablist', 'aria-label': 'Pages' }) : null;
  if (paged) { view.append(track); box.append(view, dots); } else box.append(grid);

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
    pressable(b, a);
    return b;
  }
  /* Round 7 (Miguel): a hold on an app icon (phone) or a right click (desktop) offers it for the home screen, exactly as
   * the Desks' hold on an app tile does: the stock sheet (core/home-screen-apps.js through api.apps.homeScreen; native
   * pin on the Android app, the two-step Add to Home Screen / Install app guide elsewhere), never a copy. Apps the stock
   * sheet would not offer (system apps, no frontend) keep a plain tap. Round 10: the hold also picks the icon up: a drag
   * from there rearranges, a release without one offers it. */
  const HOLD = 450;   // the stock hold (home-screen-apps.js)
  let swallow = 0, press = null, drag = null;
  const canPin = id => !!api.apps.homeScreen?.can?.(id);
  function offer(id) { swallow = Date.now() + 700; return !!api.apps.homeScreen?.offer?.(id); }
  function pressable(b, a) {
    api.listen(b, 'pointerdown', e => {
      if (e.button > 0 || drag) return;
      const touch = !!e.pointerType && e.pointerType !== 'mouse';
      const p = { b, id: a.id, x: e.clientX, y: e.clientY, pid: e.pointerId, touch, armed: !touch, held: false };
      if (touch) p.off = api.after(HOLD, () => { if (press !== p) return; p.armed = true; p.held = true; b.classList.add('is-armed'); });
      press = p;
    });
    api.listen(b, 'contextmenu', e => {
      if (press?.touch) { e.preventDefault?.(); return; }   // a long press (Android) is the hold's
      if (menu) { e.preventDefault?.(); endPress(); menu(a, { x: e.clientX, y: e.clientY, el: b }); return; }
      if (!canPin(a.id)) return; e.preventDefault?.(); endPress(); if (Date.now() >= swallow) offer(a.id);
    });
  }
  function endPress() { if (!press) return; press.off?.(); press.b.classList.remove('is-armed'); press = null; }
  api.listen(doc, 'pointermove', e => {
    if (!press || (e.pointerId != null && press.pid != null && e.pointerId !== press.pid)) return;
    const d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (!drag) {
      if (!press.armed) { if (d > 8) endPress(); return; }   // (a scroll, not a hold)
      if (d < DRAG_FROM) return;
      startDrag();
    }
    moveDrag(e.clientX, e.clientY);
  });
  const release = cancelled => {
    if (!press) return;
    const p = press;
    if (drag) { drop(); press = null; return; }
    endPress();
    if (!cancelled && p.held && canPin(p.id)) offer(p.id);   // held, never dragged: the round 7 offer
    else if (p.held) swallow = Date.now() + 400;
  };
  api.listen(doc, 'pointerup', () => release(false));
  api.listen(doc, 'pointercancel', () => release(true));
  // while an icon is held on a touch screen, the page must not scroll under the finger
  api.listen(box, 'touchmove', e => { if (press?.armed || drag) e.preventDefault?.(); }, { passive: false });

  /* ---------- the order and the cells ---------- */
  let order = [], cells = new Map(), more = null, page = 0, fitNow = { cols: 4, rows: 2, per: 8 };
  const moreCell = () => {
    const b = el('button', 'ah-app ah-more', { type: 'button', role: 'listitem', 'aria-label': 'Get more apps' });
    const ic = el('span', 'ah-ic'), t = el('span', 'ah-tile is-plain', { 'aria-hidden': 'true' }); t.append(svgIcon(doc, 'plus', 'ah-ico')); ic.append(t);
    b.append(ic, el('span', 'ah-name', { text: 'Get more', 'aria-hidden': 'true' }));
    api.listen(b, 'click', () => { if (Date.now() >= swallow) getMore(); });
    return b;
  };
  const pages = () => paged ? [...track.children] : [grid];
  function fit() {
    if (!paged) return fitNow;
    const r = view.getBoundingClientRect();
    return pageFit(Math.max(0, r.width - 24), Math.max(0, r.height), CELL.w, CELL.h);
  }
  /** Lay the cells out in `order` (pages of fitNow.per on the desktop); animate = the others slide to their new spots. */
  function place(animate) {
    const nodes = [...order.map(id => cells.get(id)).filter(Boolean), more];
    const before = animate ? new Map(nodes.map(n => [n, n.getBoundingClientRect()])) : null;
    if (!paged) grid.replaceChildren(...nodes);
    else {
      const n = Math.max(1, Math.ceil(nodes.length / fitNow.per));
      while (track.children.length < n) track.append(el('div', 'ah-grid ah-page', { role: 'list' }));
      while (track.children.length > n) track.lastElementChild.remove();
      pages().forEach((pg, i) => { pg.setAttribute('aria-label', n > 1 ? `Apps, page ${i + 1} of ${n}` : 'Apps'); pg.replaceChildren(...nodes.slice(i * fitNow.per, (i + 1) * fitNow.per)); });
      box.style.setProperty('--ah-cols', String(fitNow.cols)); box.style.setProperty('--ah-rows', String(fitNow.rows));
      paintDots(n); showPage(Math.min(page, n - 1), false);
    }
    if (!animate) return;
    const W = paged ? view.getBoundingClientRect().width : Infinity;
    for (const n of nodes) {
      if (n === drag?.b) continue;
      const a = before.get(n), b = n.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if ((!dx && !dy) || Math.abs(dx) > W * .6) continue;   // (one that changed page just appears there)
      n.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
  }
  let drawn = '';
  function paint(force = false) {
    if (box.hidden || drag) return;
    const { open, rest } = homeApps(api.apps.list(), desks(), api.apps.kinds?.(), lit);
    const list = orderApps([...open, ...rest], api.storage.get(ORDER_KEY));
    fitNow = fit();
    const sig = JSON.stringify([list.map(a => [a.id, a.name, badgeText(a.id)]), fitNow.per]);
    if (!force && sig === drawn) return;
    drawn = sig;
    cells = new Map(list.map(a => [a.id, cell(a)])); order = list.map(a => a.id); more ||= moreCell();
    place(false);
  }

  /* ---------- pages (the desktop) ---------- */
  function paintDots(n) {
    if (!paged) return;
    dots.hidden = n < 2;
    while (dots.children.length < n) { const i = dots.children.length, d = el('button', 'ah-dot', { type: 'button', role: 'tab', 'aria-label': `Page ${i + 1}` }); api.listen(d, 'click', () => showPage(i)); dots.append(d); }
    while (dots.children.length > n) dots.lastElementChild.remove();
  }
  function showPage(i, anim = true) {
    if (!paged) return;
    const n = track.children.length; page = Math.max(0, Math.min(n - 1, i | 0));
    track.classList.toggle('is-still', !anim);
    track.style.transform = `translateX(${-page * 100}%)`;
    pages().forEach((pg, k) => { const on = k === page; pg.toggleAttribute?.('inert', !on); if (on) pg.removeAttribute('aria-hidden'); else pg.setAttribute('aria-hidden', 'true'); });
    [...dots.children].forEach((d, k) => d.setAttribute('aria-selected', String(k === page)));
  }
  const turn = dir => { const was = page; showPage(page + dir); return page !== was; };
  if (paged) {
    // the wheel / a trackpad: one page per gesture (its momentum never turns two)
    let acc = 0, last = 0, locked = false;
    api.listen(box, 'wheel', e => {
      if (track.children.length < 2) return;
      e.preventDefault?.();
      const now = e.timeStamp || Date.now(), gap = now - last; last = now;
      if (locked && gap < 220) return;
      if (gap > 300) acc = 0;
      locked = false;
      acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(acc) >= 40) { turn(Math.sign(acc)); acc = 0; locked = true; }
    }, { passive: false });
    api.listen(box, 'keydown', e => {
      const dir = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }[e.key];
      if (!dir || e.altKey || e.metaKey || e.ctrlKey || track.children.length < 2) return;
      e.preventDefault?.(); if (turn(dir)) pages()[page]?.querySelector('button')?.focus?.({ preventScroll: true });
    });
    // a drag (or a swipe) on the grid's empty room turns the page
    let sw = null;
    api.listen(view, 'pointerdown', e => { if (e.button > 0 || e.target?.closest?.('.ah-app')) return; sw = { x: e.clientX, y: e.clientY }; });
    api.listen(doc, 'pointerup', e => { if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) turn(dx < 0 ? 1 : -1); });
    api.listen(globalThis, 'resize', () => { if (!box.hidden && !drag) paint(); });
  }

  /* ---------- rearranging ---------- */
  function startDrag() {
    const b = press.b, r = b.getBoundingClientRect();
    press.off?.();
    drag = { b, id: press.id, gx: press.x - r.left, gy: press.y - r.top, tx: 0, ty: 0, edge: null };
    b.classList.remove('is-armed'); b.classList.add('is-drag'); box.classList.add('is-arranging');
  }
  function lift(x, y) {
    const b = drag.b, r = b.getBoundingClientRect(), left = r.left - drag.tx, top = r.top - drag.ty;
    drag.tx = Math.round(x - drag.gx - left); drag.ty = Math.round(y - drag.gy - top);
    b.style.translate = `${drag.tx}px ${drag.ty}px`;
  }
  /** The slot under the pointer: the index of the cell it is over (on the page in view), else null. */
  function slotAt(x, y) {
    const pg = paged ? pages()[page] : grid; if (!pg) return null;
    for (const c of pg.children) {
      if (c === drag.b || c === more) continue;
      const r = c.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return order.indexOf(c.dataset.app);
    }
    return null;
  }
  function moveDrag(x, y) {
    lift(x, y);
    const t = slotAt(x, y);
    if (t != null && t >= 0 && t !== order.indexOf(drag.id)) { order = moveTo(order, drag.id, t); place(true); lift(x, y); }
    if (!paged) return;
    // held at a side edge: the page turns, the icon lands on its first (or last) spot
    const v = view.getBoundingClientRect(), dir = x < v.left + EDGE ? -1 : x > v.right - EDGE ? 1 : 0;
    if (!dir) { drag.edge?.(); drag.edge = null; return; }
    if (drag.edge) return;
    drag.edge = api.after(EDGE_MS, () => {
      if (!drag) return; drag.edge = null;
      if (!turn(dir)) return;
      order = moveTo(order, drag.id, dir > 0 ? page * fitNow.per : page * fitNow.per + fitNow.per - 1);
      place(true); lift(x, y);
    });
  }
  function drop() {
    const d = drag; drag = null; d.edge?.();
    const { b, tx, ty } = d;
    b.style.translate = ''; b.classList.remove('is-drag', 'is-armed'); box.classList.remove('is-arranging');
    b.animate?.([{ translate: `${tx}px ${ty}px` }, { translate: '0px 0px' }], { duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    swallow = Date.now() + 400;
    api.storage.set(ORDER_KEY, [...order]);
    drawn = '';
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
    /** The Home icons on screen with their letters (for the hold-⌥ hints): the page in view. */
    chips() {
      if (box.hidden) return []; const ks = lettersFor(), pg = paged ? pages()[page] : grid;
      return [...(pg?.querySelectorAll('.ah-app[data-app]') || [])].filter(b => ks[b.dataset.app]).map(b => ({ el: b.querySelector('.ah-ic'), key: ks[b.dataset.app], at: 'inside' }));
    },
    show(on) { if (box.hidden === !on) { if (on) paint(); return; } box.hidden = !on; if (on) paint(true); else if (drag) drop(); },
    /** The desktop: where the grid starts (px from the top; under the composer). */
    top(px) { const v = Math.round(px) + 'px'; if (box.style.top !== v) { box.style.top = v; if (!box.hidden && !drag) paint(); } },
    page: () => page, turn,
    paint,
  };
}
