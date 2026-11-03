/* The AI apps view's Home (Miguel, 2 Nov 2026: "apps move out of the drawer onto the Home screen"), shared by the phone
 * (layout.js) and the desktop (desktop.js). Home = the empty New chat; with it an iPhone-style grid of real apps (the
 * shared sheet's Apps: never agent apps, agents, connectors, system or in-development apps), each icon filling its tile
 * with its name under it; the open apps first (badged ones first), then the rest of the installed apps, ending in Get
 * more (the App Store).
 * Round 7 (Miguel, familiarity first): the Grid | Orb choice is gone; Home is the grid only.
 * Round 10 (Miguel, 2 Nov 2026: umbrelOS's Home with the AI-first composer):
 *   - Paged (the desktop): as many rows as fit (never a single row), then pages with dots; the wheel / a trackpad, ← / →
 *     (PageUp / PageDown) and a drag on the empty grid turn them.
 *   - A right click (the desktop) opens the caller's quick actions (menu).
 * Round 11 (Miguel, 2 Nov 2026): the order IS the desks' order, one to one with the Desks view (the same desk list it
 *   reads, api.desks.list), the only exception being that apps with a badge come first (in desk order among them); then
 *   the installed apps not open yet, by name; Get more last. No drag to rearrange and no order kept per device any more
 *   (round 10's appOrder is cleared), so switching from Desks never reshuffles anything. Icons stay put: no hover lift.
 * Round 12 (Miguel, 2 Nov 2026: "all"): one icon PER DESK, every desk the Desks view has (Chats, a second Chats desk,
 *   Files, the App Store, Claude, any system / agent / connector app with a desk), with the stock desk name and the
 *   Apps view's desk icon (Chats = the chats glyph on the accent); a click opens THAT desk. The round-6 "real apps
 *   only" filter now applies to the installed apps not open yet, after them, as before.
 * Round 16 item 7 (Miguel, 3 Nov 2026: one app model, phone and desktop; the phone's Home here, `layers`): the grid is his
 *   PINNED apps (his pin order, open or not; press and hold, then drag to rearrange; a hold without moving = the app's
 *   menu), then under a divider 'Open' the open apps that are not pinned (smaller, same icons; auto-tidy), then a + tile:
 *   the picker of installed apps neither pinned nor open (chrome.js), its last tile + Get more = the App Store.
 * No timers beyond api.after, no markup strings; everything through the layout API. */
import { realApps, CHATS } from '../apps/chrome.js';
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
/** Home's icons: every desk, one each, in the desks' order (badged first) with its stock name ({ ...app, desk, key }),
 * then the other installed real apps by name ({ ...app, key }). */
export function homeApps(apps, desks, kinds, lit = () => false) {
  const meta = new Map([...(kinds && Array.isArray(kinds.apps) ? kinds.apps : []), ...(apps || [])].filter(a => a && a.id).map(a => [a.id, a]));
  // round 14: Chats' count is one inbox: only the first Chats desk carries it (a second one is `dupe`: no badge, not first)
  let chats = 0;
  const open = (desks || []).filter(d => d && d.id).map(d => {
    const a = meta.get(d.id) || { id: d.id, icon: '' };
    return { ...a, id: d.id, name: d.name || (d.id === CHATS ? 'Chats' : a.name || d.id), desk: d.desk, key: `desk:${d.desk}`, ...(d.id === CHATS && chats++ ? { dupe: true } : {}) };
  });
  const openIds = new Set(open.map(a => a.id));
  const pool = kinds && Array.isArray(kinds.apps) ? kinds.apps : apps || [];
  const rest = realApps(pool.filter(a => a && a.id && a.id !== CHATS && !openIds.has(a.id)), kinds && Array.isArray(kinds.apps) ? { apps: pool } : null).sort(byName).map(a => ({ ...a, key: a.id }));
  const on = a => !a.dupe && lit(a.id);
  return { open: [...open.filter(on), ...open.filter(a => !on(a))], rest };
}

/** Round 10's per-device arrangement (retired in round 11: cleared once, never read). */
export const OLD_ORDER_KEY = 'appOrder';
/** A page of the desktop grid: the columns and rows that fit (cell cw × ch), at most maxCols wide, never one row. */
export function pageFit(w, h, cw, ch, maxCols = 7) {
  const cols = Math.max(2, Math.min(maxCols, Math.floor(w / cw) || 0)), rows = Math.max(2, Math.floor(h / ch) || 0);
  return { cols, rows, per: cols * rows };
}
export const CELL = { w: 124, h: 128 };

export function homeView(api, { goApp, getMore, lit, badgeText, desks, paged = false, menu = null, layers = null }) {
  const doc = document;
  const el = (tag, cls, attrs = {}) => { const n = doc.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } return n; };
  const box = el('section', 'ah' + (paged ? ' ah-paged' : ''), { 'aria-label': 'Home' }); box.hidden = true;
  // the phone: one grid that scrolls; the desktop: pages in a sliding track, dots under them
  const grid = paged ? null : el('div', 'ah-grid', { role: 'list', 'aria-label': 'Apps' });
  const view = paged ? el('div', 'ah-view') : null, track = paged ? el('div', 'ah-track') : null, dots = paged ? el('div', 'ah-dots', { role: 'tablist', 'aria-label': 'Pages' }) : null;
  if (paged) { view.append(track); box.append(view, dots); } else box.append(grid);

  function tile(a) {
    const t = el('span', 'ah-tile', { 'aria-hidden': 'true' }), chats = a.id === CHATS;
    // a Chats desk: the Apps view's desk icon (the chats glyph on the accent; Chats has no logo of its own)
    t.style.setProperty('--c', chats ? 'var(--wz-accent)' : colourOf(a)); t.append(el('i', `sgi sg-${chats ? 'chats' : glyphOf(a)}`, { 'aria-hidden': 'true' }));
    if (!chats) api.apps.logo(a.id).then(url => {
      if (!url || !t.isConnected) return;
      const im = el('img', 'ah-logo', { alt: '', src: url, draggable: 'false' });
      im.decode().then(() => { t.replaceChildren(im); t.classList.add('is-logo'); }, () => {});
    });
    return t;
  }
  function cell(a, cls = 'ah-app') {
    if (a.group) cls += a.group === 'pin' ? ' is-pin' + (a.desk == null ? ' is-closed' : ' is-run') : ' is-opensec';
    const b = el('button', cls, { type: 'button', role: 'listitem', 'data-app': a.id, 'data-desk': a.desk == null ? null : String(a.desk), 'data-group': a.group || null, title: a.name });
    const ic = el('span', 'ah-ic'), n = el('b', 'ah-badge', { 'aria-hidden': 'true', text: a.dupe ? '' : badgeText(a.id) }); n.hidden = !n.textContent;
    ic.append(tile(a), n);
    b.append(ic, el('span', 'ah-name', { text: a.name }));
    b.setAttribute('aria-label', a.name + (n.textContent ? `, ${n.textContent} new` : ''));
    api.listen(b, 'click', e => { if (Date.now() < swallow) { e.preventDefault?.(); return; } goApp(a.id, a.desk); });
    if (layers) holdable(b, a); else pressable(b, a);
    return b;
  }
  /* Round 16 item 7 (layers): a hold (HOLD ms, still) lifts a pinned icon: drag it to its new place among the pins (the
   * one under the finger is marked); let go without moving = the app's menu (Pin / Unpin, Add to Home Screen, Open,
   * Close). An open (not pinned) icon's hold = its menu. A right click = the menu. */
  let lift = null;
  const pinCells = () => [...grid.querySelectorAll('.ah-app[data-group="pin"]')];
  function holdable(b, a) {
    api.listen(b, 'pointerdown', e => {
      if (e.button > 0) return;
      const p = { b, a, x: e.clientX, y: e.clientY, pid: e.pointerId, lifted: false, moved: false, to: -1 };
      p.off = api.after(HOLD, () => {
        if (press !== p) return;
        p.lifted = true; swallow = Date.now() + 700;
        if (a.group !== 'pin') { press = null; layers.menu?.(a, { x: p.x, y: p.y, el: b }); return; }
        lift = p; p.cells = pinCells(); p.from = p.cells.indexOf(b); p.rects = p.cells.map(c => c.getBoundingClientRect());
        b.classList.add('is-lift'); grid.dataset.drag = '';
      });
      press = p;
    });
    api.listen(b, 'contextmenu', e => { e.preventDefault?.(); if (lift) return; swallow = Date.now() + 700; layers.menu?.(a, { x: e.clientX, y: e.clientY, el: b }); });
  }
  function liftMove(e) {
    const p = lift; if (!p) return false;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; if (Math.hypot(dx, dy) > 6) p.moved = true;
    p.b.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
    let best = -1, bd = Infinity;
    p.rects.forEach((r, i) => { const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); if (d < bd) { bd = d; best = i; } });
    if (best !== p.to) { p.cells[p.to]?.classList.remove('is-drop'); p.to = best; if (best !== p.from) p.cells[best]?.classList.add('is-drop'); }
    return true;
  }
  function liftEnd(commit) {
    const p = lift; if (!p) return false; lift = null; press = null;
    p.b.classList.remove('is-lift'); p.b.style.translate = ''; for (const c of p.cells) c.classList.remove('is-drop'); delete grid.dataset.drag;
    swallow = Date.now() + 500;
    if (!commit) return true;
    if (p.moved && p.to >= 0 && p.to !== p.from) layers.reorderPins?.(p.from, p.to);
    else if (!p.moved) layers.menu?.(p.a, { x: p.x, y: p.y, el: p.b });
    return true;
  }
  if (layers && grid) api.listen(grid, 'touchmove', e => { if (lift) e.preventDefault?.(); }, { passive: false });
  /* Round 7 (Miguel): a hold on an app icon (phone) or a right click (desktop) offers it for the home screen, exactly as
   * the Desks' hold on an app tile does: the stock sheet (core/home-screen-apps.js through api.apps.homeScreen; native
   * pin on the Android app, the two-step Add to Home Screen / Install app guide elsewhere), never a copy. Apps the stock
   * sheet would not offer (system apps, no frontend) keep a plain tap. (Round 11: no drag to rearrange any more.) */
  const HOLD = 450;   // the stock hold (home-screen-apps.js)
  let swallow = 0, press = null;
  const canPin = id => !!api.apps.homeScreen?.can?.(id);
  function offer(id) { swallow = Date.now() + 700; return !!api.apps.homeScreen?.offer?.(id); }
  function pressable(b, a) {
    api.listen(b, 'pointerdown', e => {
      if (e.button > 0) return;
      const touch = !!e.pointerType && e.pointerType !== 'mouse';
      if (!touch || !canPin(a.id)) return;
      const p = { b, id: a.id, x: e.clientX, y: e.clientY, pid: e.pointerId };
      p.off = api.after(HOLD, () => { if (press !== p) return; press = null; offer(a.id); });
      press = p;
    });
    api.listen(b, 'contextmenu', e => {
      if (press) { e.preventDefault?.(); return; }   // a long press (Android) is the hold's
      if (menu) { e.preventDefault?.(); menu(a, { x: e.clientX, y: e.clientY, el: b }); return; }
      if (!canPin(a.id)) return; e.preventDefault?.(); if (Date.now() >= swallow) offer(a.id);
    });
  }
  function endPress() { if (lift) { liftEnd(true); return; } if (!press) return; press.off?.(); press = null; }
  api.listen(doc, 'pointermove', e => {
    if (lift) { liftMove(e); return; }
    if (!press || (e.pointerId != null && press.pid != null && e.pointerId !== press.pid)) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) endPress();   // (a scroll, not a hold)
  });
  api.listen(doc, 'pointerup', endPress);
  api.listen(doc, 'pointercancel', () => { if (lift) liftEnd(false); else endPress(); });

  /* ---------- the order and the cells ---------- */
  let order = [], cells = new Map(), more = null, page = 0, fitNow = { cols: 4, rows: 2, per: 8 };
  const moreCell = () => {
    const b = el('button', 'ah-app ah-more', { type: 'button', role: 'listitem', 'aria-label': 'Get more apps' });
    const ic = el('span', 'ah-ic'), t = el('span', 'ah-tile is-plain', { 'aria-hidden': 'true' }); t.append(svgIcon(doc, 'plus', 'ah-ico')); ic.append(t);
    b.append(ic, el('span', 'ah-name', { text: 'Get more', 'aria-hidden': 'true' }));
    api.listen(b, 'click', () => { if (Date.now() >= swallow) getMore(); });
    return b;
  };
  const plusTile = () => {
    const b = el('button', 'ah-app ah-more ah-plus', { type: 'button', role: 'listitem', 'aria-label': 'Add an app: installed apps not pinned or open, and Get more' });
    const ic = el('span', 'ah-ic'), t = el('span', 'ah-tile is-plain', { 'aria-hidden': 'true' }); t.append(svgIcon(doc, 'plus', 'ah-ico')); ic.append(t);
    b.append(ic, el('span', 'ah-name', { text: 'Add', 'aria-hidden': 'true' }));
    api.listen(b, 'click', () => { if (Date.now() >= swallow) layers.plus?.(); });
    return b;
  };
  const pages = () => paged ? [...track.children] : [grid];
  function fit() {
    if (!paged) return fitNow;
    const r = view.getBoundingClientRect();
    return pageFit(Math.max(0, r.width - 24), Math.max(0, r.height), CELL.w, CELL.h);
  }
  /** Lay the cells out in `order` (pages of fitNow.per on the desktop). */
  let divider = null, plusCell = null, splitAt = -1;
  function place() {
    const nodes = [...order.map(id => cells.get(id)).filter(Boolean), more];
    if (layers) {
      // round 16 item 7: the pins, then (when any) the 'Open' divider and the open apps, then +
      divider ||= Object.assign(el('div', 'ah-div', { role: 'presentation' }), {}); if (!divider.childElementCount) divider.append(el('span', 'ah-div-w', { text: 'Open' }));
      const list = order.map(id => cells.get(id)).filter(Boolean);
      nodes.splice(0, nodes.length, ...list.slice(0, splitAt), ...(splitAt < list.length ? [divider, ...list.slice(splitAt)] : []), plusCell ||= plusTile());
    }
    const put = (box0, want) => { const now = box0.children; if (now.length !== want.length || want.some((n, k) => now[k] !== n)) box0.replaceChildren(...want); };
    if (!paged) put(grid, nodes);
    else {
      const n = Math.max(1, Math.ceil(nodes.length / fitNow.per));
      while (track.children.length < n) track.append(el('div', 'ah-grid ah-page', { role: 'list' }));
      while (track.children.length > n) track.lastElementChild.remove();
      pages().forEach((pg, i) => { pg.setAttribute('aria-label', n > 1 ? `Apps, page ${i + 1} of ${n}` : 'Apps'); put(pg, nodes.slice(i * fitNow.per, (i + 1) * fitNow.per)); });
      if (box.style.getPropertyValue('--ah-cols') !== String(fitNow.cols)) box.style.setProperty('--ah-cols', String(fitNow.cols));
      if (box.style.getPropertyValue('--ah-rows') !== String(fitNow.rows)) box.style.setProperty('--ah-rows', String(fitNow.rows));
      paintDots(n); showPage(Math.min(page, n - 1), false);
    }
  }
  let drawn = '';
  function paint(force = false) {
    if (box.hidden) return;
    let list;
    if (layers) {
      // round 16 item 7: the layers (parts.js appLayers, the desktop's right column too)
      const L = layers.model(), meta = new Map([...(Array.isArray(api.apps.kinds?.()?.apps) ? api.apps.kinds().apps : []), ...api.apps.list()].filter(a => a && a.id).map(a => [a.id, a]));
      const pins = L.pinned.map(p => ({ ...(meta.get(p.id) || {}), id: p.id, name: p.name || meta.get(p.id)?.name || p.id, desk: p.desk ?? null, key: 'pin:' + p.id, group: 'pin' }));
      const open = L.open.map(d => ({ ...(meta.get(d.id) || {}), id: d.id, name: d.name || meta.get(d.id)?.name || d.id, desk: d.desk, key: 'desk:' + d.desk, group: 'open', ...(d.id === CHATS ? { dupe: true } : {}) }));
      list = [...pins, ...open]; splitAt = pins.length;
    } else { const { open, rest } = homeApps(api.apps.list(), desks(), api.apps.kinds?.(), lit); list = [...open, ...rest]; }
    fitNow = fit();
    const cellSig = a => JSON.stringify([a.id, a.name, a.desk, a.group || '', a.dupe ? '' : badgeText(a.id)]);
    const sig = JSON.stringify([list.map(a => [a.key, cellSig(a)]), fitNow.per]);
    if (!force && sig === drawn) return;
    drawn = sig;
    // round 14 (the New tab page must open instantly): a cell is kept while what it shows is the same (no rebuild, no
    // logo decoded again, no flash from the sigil to the logo); only a changed or new one is made
    const was = cells; cells = new Map();
    for (const a of list) { const s = cellSig(a), c = was.get(a.key); cells.set(a.key, c && c.__sig === s ? c : Object.assign(cell(a), { __sig: s })); }
    order = list.map(a => a.key); more ||= moreCell();
    place();
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
    api.listen(globalThis, 'resize', () => { if (!box.hidden) paint(); });
  }

  // round 10's per-device arrangement is gone (round 11): forget it once
  if (api.storage.get(OLD_ORDER_KEY) != null) api.storage.set(OLD_ORDER_KEY, null);

  // the letters: the apps in Home's order (open first), kept per device
  let keys = {};
  function lettersFor() {
    const { open, rest } = homeApps(api.apps.list(), desks(), api.apps.kinds?.(), lit);
    // (a letter per app, not per desk: the first desk of an app gets it; Chats keeps its own ⌥ keys)
    const seen = new Set(), apps = [...open, ...rest].filter(a => a.id !== CHATS && !seen.has(a.id) && seen.add(a.id));
    const saved = api.storage.get('appKeys'); keys = appKeys(apps, saved && typeof saved === 'object' ? saved : {});
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
      const first = new Set();
      return [...(pg?.querySelectorAll('.ah-app[data-app]') || [])].filter(b => ks[b.dataset.app] && !first.has(b.dataset.app) && first.add(b.dataset.app)).map(b => ({ el: b.querySelector('.ah-ic'), key: ks[b.dataset.app], at: 'inside' }));
    },
    show(on) { if (box.hidden === !on) { if (on) paint(); return; } box.hidden = !on; if (on) paint(true); },
    page: () => page, turn,
    paint,
  };
}
