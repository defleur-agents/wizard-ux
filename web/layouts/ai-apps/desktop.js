/* AI apps view on the desktop (Miguel, 2 Nov 2026): the layout the ChatGPT, Claude and Perplexity desktop apps share,
 * measured at 1440 × 900 and 1280 × 800 (~/.hermes/cache/screenshots/ai-apps-ref/REPORT.md §6), with Wizard's own
 * pieces in it. Worn by the same miguel/ai-apps tweak as the phone (layout.js hands the desktop shell here).
 *
 *   - Sidebar on the left, 288 px (Claude's width, ChatGPT's panel): the Wizard's name, 🔍 (searches chats and apps)
 *     and the collapse toggle ◫ in its header; where they list Projects / GPTs / Spaces, the open apps as a grid of
 *     small icons with their names (every open app = desks, badged first then desk order, the badge on the icon; the
 *     same list as the phone drawer, the Apps icons and the Orb satellites), ending in All apps = the three-level
 *     sheet (chrome.js); then the chats in Wizard's own sections (round 5, in place of Recents and View all: the
 *     sidebar IS the chat list), in the stock Chats order Archive, Working, Ready, each header like their Recents label
 *     and a click folds it (Ready open, Working and Archive folded at first; kept on this device; ⋯ on hover or a right
 *     click on a row: Pin, Rename, Mark unread, Snooze, Archive / Restore, through Chats' own actions); at its foot a
 *     round + (New chat) and a cog (Settings), icons only, as on the phone. Its ◫ toggle (and the rail's) carries the
 *     Ready count (round 5, the phone's ☰ count).
 *   - Collapsed, it is a 120 px rail (round 12: words, not icons; was a 52 px icon rail, ChatGPT / Perplexity): ◫, +, 🔍, the open apps' icons, All apps, and the cog
 *     at the bottom. ◫ or Ctrl / ⌘ + Shift + S (ChatGPT's key) toggles it; the choice is kept on this device. It stays
 *     open from 900 px up (none of them fold it there); narrower it rests as the rail and opens over the page.
 *   - The main area beside it: a 52 px top row (what is in front on the left, a thread's title or an app's name; a small
 *     home button in its middle, always there (round 5, as on the phone); on the right, on Home only (round 5), the
 *     workspace switcher, where they put Temporary / Incognito), then the chat or the app.
 *       · The chat = the real Chats window without its list or its header (both live in the sidebar): one column, at
 *         most 768 px, centred (ChatGPT). A new chat shows the greeting with the composer centred under it; in a chat
 *         the composer docks 24 px from the bottom. The real composer: + · field · model chip · mic · one round button
 *         (Send with words, else the voice button: click talks, hold gives a command, as in every view).
 *       · An app = its desk, filling the main area under the same top row, and the orb floating at the bottom centre of
 *         the main area (the phone's standard): click talks, hold commands, a drag up opens a New chat with the cursor
 *         in its composer (round 5, the phone's swipe up: talk or type). An
 *         app's own bottom tab bar is laid out either side of it (the orb bar, skin-host), else lifted clear of it.
 *   - The stock bar keeps only what is not a desk switcher (the AI fuel gauge, warnings, update notices) and moves into
 *     the top row; every desktop key still works (⌥ keys, ⌥1–9 desks, ⌥` = Home = the chat here).
 * Round 8 (Miguel, 2 Nov 2026): the apps move to their own sidebar on the RIGHT, the left one's mirror (an app switcher:
 * open apps first, badged first, then installed, then Get more; folds to a rail with ◫ or ⌥⇧\, kept per device); an app
 * opens as the panel growing out of it toward the middle, the switcher staying in view; Home is clean again (the skin's
 * background and the composer only); one fuel gauge (the sidebar foot's); the header name is text only; the folded rail
 * shows each Ready chat's stock status icon, grouped by status with small counts. The phone keeps its Home grid.
 * Round 10 (Miguel, 2 Nov 2026: umbrelOS's Home with the AI-first composer): the right apps sidebar is gone. Home = the
 * skin's background, the new chat's composer floating in the upper middle and under it the app grid (home.js, paged:
 * big icons with their names, no plate behind them; the phone's order; drag to rearrange; a right click for quick
 * actions: Open, Add to Home Screen, App Store page, Close). An app slides in from the right OVER Home as the panel
 * (resizable, ⤢ wider, ✕ / Esc back to the grid); the grid and the composer stay where they are. ⌥ app letters sit on
 * the grid's icons.
 * Round 11 (Miguel, 2 Nov 2026): the desktop like the phone. The composer sits at the BOTTOM centre under the app grid;
 * the grid is always there on the background (Home, and with a chat column or an app panel open: it stays exactly
 * where it is, the panels slide over it; closing a chat is Home again). Its order is the desks' order (badged first),
 * nothing to drag. Opening or closing anything never touches the wallpaper (core/skins.js no longer re-renders on a
 * same-size resize) and moves things with short transforms only (flip below: no width or left transitions; one
 * re-tile after a change has settled, never one per frame).
 * Everything through the layout API; no timers of its own beyond api.after, no innerHTML, no storage of its own
 * beyond api.storage. Colours are skin tokens (desktop.css). */
import { viewChrome, openApps, realApps, matches, CHATS, MIC } from '../apps/chrome.js';
import { glyphOf, colourOf } from '../orb/shared.js';
import { HOLD_MS } from '../orb/keys.js';
import { ACTS, svgIcon, initial, SECTIONS, sectionsOpen, gridSlot, STATES, stateOf, stateGroups, noteThread, noteRouteIntoActions, gaugeInto } from './parts.js';
import { homeView } from './home.js';

export const SIDE = 288, RAIL = 120, DOCKED_FROM = 900;
/** Round 9 (Miguel, 2 Nov 2026): every panel resizable by drag, within these limits (px); the middle always keeps
 * MIDDLE px (the orb's room). */
export const SIZE_LIMITS = { side: [220, 440], panel: 340 }, MIDDLE = 200;
/** Ctrl / ⌘ + Shift + S: ChatGPT's sidebar key (the shell's own keys are all ⌥, so it takes nothing of theirs). */
export const isSideKey = e => !!e && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.code === 'KeyS' || String(e.key).toLowerCase() === 's');

export default function desktop(api) {
  const doc = document, root = doc.documentElement;
  const el = (tag, cls, attrs = {}) => { const n = doc.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } return n; };
  const icon = (name, cls = 'aad-ico') => svgIcon(doc, name, cls);
  const desks = () => api.desks.list();
  /* Round 11 (Miguel: opening and closing panels must be smooth): a change of layout snaps at once and its pieces glide
   * from where they were with a short transform (FLIP: translate only, never width / left), 220 ms. */
  const FLIP_MS = 220, EASE = 'cubic-bezier(.2, .8, .2, 1)';
  const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let flipping = 0, glideUntil = 0;
  function flip(nodes, change) {
    if (flipping) { change(); return; }   // (one flip at a time: a nested change rides the outer one)
    flipping++;
    try { flipNow(nodes, change); } finally { flipping--; }
  }
  function flipNow(nodes, change) {
    const list = nodes.filter(n => n && n.isConnected !== false && typeof n.getBoundingClientRect === 'function');
    const before = list.map(n => n.getBoundingClientRect());
    change();
    // the orb goes to its new spot first (measured on the final layout, before anything glides), then glides with the rest
    if (list.includes(orbBox)) placeOrb(true);
    if (reduced() || typeof list[0]?.animate !== 'function') return;
    list.forEach((n, i) => {
      const a = before[i], b = n.getBoundingClientRect(); if (!a.width || !b.width) return;
      const dx = Math.round(a.left - b.left), dy = Math.round(a.top - b.top); if (!dx && !dy) return;
      // (added to the element's own translate: the orb keeps its --vc-orb move underneath)
      n.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], { duration: FLIP_MS, easing: EASE, composite: 'add' });
      glideUntil = Date.now() + FLIP_MS + 10;
    });
  }
  const shownDesks = () => [...doc.querySelectorAll('#stage > .wsp:not([hidden])')];
  const homeComposer = () => [...doc.querySelectorAll('.win .dchats .pane-main .ch-compose')].find(n => n.getClientRects().length && n.getBoundingClientRect().width > 0) || null;
  root.dataset.aiApps = 'desktop';
  const css = el('link', '', { rel: 'stylesheet', href: api.asset('desktop.css') || '' });
  const unmountCss = api.mount(css);
  // the desks' windows are laid out in pixels from the page's sizes: again once this sheet (the sidebar, the widths) applies
  api.listen(css, 'load', () => globalThis.dispatchEvent?.(new Event('resize')));

  /* ---------- data ---------- */
  let pane = null, want = null;   // round 7: the app shown as the panel on the right ({ id, el: its desk }), the app asked for
  let sessions = null, badgeMap = api.apps.badges(m => { badgeMap = m; paintBadges(); });
  const agentName = () => (api.agents.list().find(a => a.main) || api.agents.here?.() || {}).label || (api.workspaces?.list()[0] || {}).name || 'Wizard';
  const readSessions = () => { sessions = api.sessions.list() || { working: [], ready: [], archive: [] }; return sessions; };
  const titleOf = id => { const s = sessions || readSessions(); for (const k of ['working', 'ready', 'archive']) { const r = (s[k] || []).find(x => x.id === id); if (r) return r.title; } return ''; };
  const appName = id => (api.apps.list().find(a => a.id === id) || desks().find(d => d.id === id) || {}).name || '';
  const badgeText = id => { const n = badgeMap[id] || 0; if (!n) return ''; const t = api.apps.badgeText?.(id); return t || (n > 99 ? '99+' : String(n)); };
  const lit = id => (badgeMap[id] || 0) > 0;
  const litFirst = list => [...list.filter(a => lit(a.id)), ...list.filter(a => !lit(a.id))];

  /* ---------- the sidebar ---------- */
  const side = el('nav', 'aad-side', { 'aria-label': 'Sidebar' });
  const head = el('div', 'aad-sh');
  // round 7 (Miguel): the workspace switcher IS the header (this Wizard's name; a click opens the switcher menu), where
  // the name was; Home = + and ⌥`
  const wsBtn = el('button', 'aad-ws', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  // round 8 (Miguel): text only and a small chevron, no disc before the name
  const wsName = el('span', 'aad-wsn');
  wsBtn.append(wsName, icon('down', 'aad-ico aad-wsc'));
  const findBtn = el('button', 'aad-ib aad-find', { type: 'button', 'aria-label': 'Search chats and apps', title: 'Search' }); findBtn.append(icon('search'));
  const togBtn = el('button', 'aad-ib aad-tog', { type: 'button', 'aria-controls': 'aad-side' }); togBtn.append(icon('side'));
  // the Ready count (round 5): on the sidebar's ◫ and on the rail's, like the phone's ☰
  const togCount = el('b', 'aad-count', { 'aria-hidden': 'true' }); togCount.hidden = true; togBtn.append(togCount);
  const searchBox = el('label', 'aad-search'); searchBox.hidden = true;
  const field = el('input', 'aad-q', { type: 'search', placeholder: 'Search chats and apps', 'aria-label': 'Search chats and apps', autocomplete: 'off' });
  searchBox.append(icon('search', 'aad-ico aad-search-i'), field);
  const cancelBtn = el('button', 'aad-cancel', { type: 'button', text: 'Cancel' }); cancelBtn.hidden = true;
  head.append(wsBtn, findBtn, searchBox, cancelBtn, togBtn);
  const scroll = el('div', 'aad-scroll');
  const foot = el('div', 'aad-foot');
  const newBtn = el('button', 'aad-new', { type: 'button', 'aria-label': 'New chat', title: 'New chat' }); newBtn.append(icon('plus'));
  const setBtn = el('button', 'aad-set', { type: 'button', 'aria-label': 'Settings', title: 'Settings' }); setBtn.append(icon('cog'));
  // round 7: the cog on the left, the AI fuel gauge between, + on the right
  const fuel = el('div', 'aad-fuel', { 'data-fuel-copy': '' }); fuel.hidden = true;
  foot.append(setBtn, fuel, newBtn);
  // the rail (collapsed): ◫ · + · 🔍, then (round 12, Miguel: readable words, no status icons) a short text list in the
  // sidebar's own type: Working n · Ready n, under it the stock Chats statuses with their counts (Needs you, Your call,
  // FYI, Done…) · Archive n … the cog
  const rail = el('div', 'aad-rail');
  const rTog = el('button', 'aad-ib aad-rtog', { type: 'button', 'aria-label': 'Open sidebar', title: 'Open sidebar' }); rTog.append(icon('side'));
  const rCount = el('b', 'aad-count', { 'aria-hidden': 'true' }); rCount.hidden = true; rTog.append(rCount);
  const rNew = el('button', 'aad-ib aad-rnew', { type: 'button', 'aria-label': 'New chat', title: 'New chat' }); rNew.append(icon('plus'));
  const rFind = el('button', 'aad-ib aad-rfind', { type: 'button', 'aria-label': 'Search chats and apps', title: 'Search' }); rFind.append(icon('search'));
  const rSet = el('button', 'aad-ib aad-rset', { type: 'button', 'aria-label': 'Settings', title: 'Settings' }); rSet.append(icon('cog'));
  const rList = el('div', 'aad-rlist', { role: 'list', 'aria-label': 'Chats' });
  rail.append(rTog, rNew, rFind, rList, rSet);   // (no apps: they live on Home)
  const panel = el('div', 'aad-panel'); panel.append(head, scroll, foot);
  side.id = 'aad-side'; side.append(panel, rail);
  const shade = el('div', 'aad-shade', { 'aria-hidden': 'true' });

  /* ---------- the top row of the main area: the chat column's title and ✕ · the app panel's title ---------- */
  const top = el('header', 'aad-top');
  // (no home button in the top row: Home = +, ⌥`; no workspace switcher either: it is the sidebar's header, round 7)
  const cTop = el('div', 'aad-ctop'), tt = el('b', 'aad-tt');
  const cX = el('button', 'aad-ib aad-cx', { type: 'button', 'aria-label': 'Close the chat (Esc)', title: 'Close (Esc)' }); cX.append(icon('x')); cX.hidden = true;
  cTop.append(tt, cX);
  // the app panel's own title over it, at the top row's right (round 7): its icon and name, and ✕ (Esc) to close it
  const pTop = el('div', 'aad-ptop'); pTop.hidden = true;
  const pIcon = el('span', 'aad-pti'), pName = el('b', 'aad-ptn');
  const pX = el('button', 'aad-ib aad-px', { type: 'button', 'aria-label': 'Close the app panel (Esc)', title: 'Close (Esc)' }); pX.append(icon('x'));
  // round 7: wider (the whole main area) and back to a third, like the Orb desktop's panel (⌥F, the desktop's full screen key)
  const pW = el('button', 'aad-ib aad-pw', { type: 'button', 'aria-pressed': 'false' });
  /* the app's own title-bar tools (WizardApp.titlebar: Morning Report's ‹ date › PDF) in the panel's top row: the
   * window's title bar is out of sight here, so its tools show beside the name; a tap or a pick goes to the window's own
   * tool (the app's own channel), and they follow the app's changes */
  const pTools = el('span', 'aad-ptools'); pTools.hidden = true;
  pTop.append(pIcon, pName, pTools, pW, pX);
  top.append(cTop, pTop);
  // a placeholder in the panel's place from the first frame while a slow app loads (never a blank third)
  const pLoad = el('div', 'aad-pload', { role: 'status' }); pLoad.hidden = true;
  const pLoadT = el('span', 'aad-pload-t'); pLoad.append(el('span', 'aad-pload-i'), pLoadT, el('i', 'aad-pload-s', { 'aria-hidden': 'true' }));
  // behind the docked chat column: the page's own surface (Home's apps sit on it)
  const back = el('div', 'aad-back', { 'aria-hidden': 'true' });

  /* ---------- the orb: bottom centre of the main area, always (Home, a chat, an app): the one way to talk ---------- */
  const orbBox = el('div', 'aad-orb');
  const cv = el('canvas', 'aad-orbc', { width: '128', height: '128', 'aria-hidden': 'true' });
  const fb = el('img', 'aad-orbfb', { alt: '', src: 'robert-thread-orb.png', draggable: 'false' }); fb.hidden = true;
  const orbBtn = el('button', 'aad-orbbtn', { type: 'button', 'aria-label': 'Wizard orb (the microphone). Click to talk, hold for a command, drag up for a new chat to type in.' });
  // round 6: the orb IS the microphone, so it wears a small one (in the composer, where the mic was, and on its own spot)
  const micG = el('span', 'aad-mic', { 'aria-hidden': 'true' }); micG.append(svgIcon(doc, 'mic', 'aad-mic-i'));
  orbBox.append(cv, fb, micG, orbBtn);

  const scene = el('div', 'aad');
  scene.append(back, shade, side, top, orbBox, pLoad);
  api.mount(scene);

  // the + sheet in three levels and room under hosted apps for the floating orb, from the shared view chrome; the orb's
  // spot (its centre, its size) lets an app's own bottom tabs go either side of it
  const orbSpot = () => { const r = orbBox.getBoundingClientRect?.(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, d: orbBox.offsetWidth || r.width } : null; };
  const chrome = viewChrome(api, { openIds: () => desks().map(d => d.id), orb: orbSpot });
  const near = (a, b) => a === b || (!!a && !!b && Math.abs(a.x - b.x) < .5 && Math.abs(a.y - b.y) < .5 && Math.abs(a.d - b.d) < .5);
  const orbAt = { done: false, slot: null, home: null };   // where placeOrb last put the orb (round 11)

  /* ---------- the sidebar's width: open, the rail, or open over the page (narrow) ---------- */
  let folded = api.storage.get('folded') === true, peek = false;
  const narrow = () => (globalThis.innerWidth || 1440) < DOCKED_FROM;
  function paintSide(relayout = true) {
    const mode = narrow() ? (peek ? 'over' : 'rail') : folded ? 'rail' : 'open';
    const was = root.dataset.aadSide;
    if (relayout && was && was !== mode) flip([top, orbBox, ...shownDesks()], () => { root.dataset.aadSide = mode; });
    else root.dataset.aadSide = mode;
    // the sidebar opens with a short reveal (clip, no width animation); folding snaps to the rail
    if (relayout && was === 'rail' && mode !== 'rail' && !reduced() && typeof side.animate === 'function') side.animate([{ clipPath: `inset(0 calc(100% - ${RAIL}px) 0 0)` }, { clipPath: 'inset(0 0 0 0)' }], { duration: FLIP_MS, easing: EASE });
    const open = mode !== 'rail';
    if (!open) only = '';   // round 12: a status shown alone is dropped when the sidebar folds
    togBtn.title = 'Close sidebar (Ctrl+Shift+S)';
    togBtn.setAttribute('aria-expanded', String(open)); rTog.setAttribute('aria-expanded', String(open));
    rTog.title = 'Open sidebar (Ctrl+Shift+S)';
    if (open) paintList(); else paintRail();
    applySizes();
    // the desks' windows are laid out in pixels: lay them out again for the new width
    if (relayout && was !== mode && (was === 'open') !== (mode === 'open')) retileSoon();
  }
  function toggleSide() {
    if (narrow()) { peek = !peek; if (peek) offPeek = api.back.push(() => { peek = false; offPeek = null; paintSide(); }); else { offPeek?.(); offPeek = null; } }
    else { folded = !folded; api.storage.set('folded', folded); }
    if (q) setSearch(false);
    paintSide();
  }
  let offPeek = null;
  // which sections are open (Ready open, Working and Archive folded at first), kept on this device
  const secOpen = sectionsOpen(api.storage.get('sections'));
  const STATE_WORD = Object.fromEntries(STATES);
  let only = '';   // round 12: the Ready status the sidebar shows alone (a click on it in the rail), '' = all
  const unpeek = () => { if (!peek) return; peek = false; offPeek?.(); offPeek = null; paintSide(); };
  api.listen(togBtn, 'click', toggleSide); api.listen(rTog, 'click', toggleSide);
  api.listen(shade, 'click', unpeek);
  api.listen(globalThis, 'resize', () => { if (!narrow() && peek) { peek = false; offPeek?.(); offPeek = null; } const want = narrow() ? (peek ? 'over' : 'rail') : folded ? 'rail' : 'open'; if (want !== root.dataset.aadSide) paintSide(); });
  api.keys.on({ down: e => { if (!isSideKey(e) || e.repeat) return false; toggleSide(); return true; } });
  /* ---------- round 9 (Miguel, 2 Nov 2026): every panel resizable by drag ----------
   * The Orb desktop's grips (layouts/orb/layout.js, its resizable panels), on the four panels here: the chats' sidebar,
   * the docked chat column and the app panel (round 10: the apps' sidebar is gone). A thin separator on each panel's inner edge (a hairline
   * in the accent on hover); drag it, or ←/→ (⇧ for bigger steps) with it focused; a double click or Enter goes back to
   * the default. Kept per device. Limits keep each panel readable and always leave the middle its room for the orb. */
  let sized = { ...(api.storage.get('widths') || {}) }, sizing = '', laidOut = '';
  const GRIP_NAMES = { side: 'Resize the chats sidebar', chat: 'Resize the chat', app: 'Resize the app panel' };
  const SIZE_VARS = { side: '--aad-side-w', chat: '--aad-chat-px', app: '--aad-app-px' };
  const vw = () => globalThis.innerWidth || 1440;
  const clampTo = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), Math.max(lo, hi)));
  /** each panel's width now (the owner's, else the default) within its limits: [now, lo, hi] */
  function sizes() {
    const W = vw(), out = {};
    out.side = [clampTo(sized.side ?? SIDE, SIZE_LIMITS.side[0], Math.min(SIZE_LIMITS.side[1], W * .32)), SIZE_LIMITS.side[0], Math.round(Math.min(SIZE_LIMITS.side[1], W * .32))];
    const main = W - (root.dataset.aadSide === 'open' ? out.side[0] : RAIL);
    const both = !!(docked && pane), lo = SIZE_LIMITS.panel;
    const chatHi = Math.max(lo, main - MIDDLE - (pane ? lo : 0)), appHi = Math.max(lo, main - MIDDLE - (docked ? lo : 0));
    let c = clampTo(sized.chat ?? Math.min(Math.max(W / 3, 400), 560), lo, chatHi), a = clampTo(sized.app ?? Math.min(Math.max(W / 3, 380), 600), lo, appHi);
    // both open: the middle keeps its room; the one not being dragged gives way first (else both, evenly), never below lo
    let over = both ? c + a - (main - MIDDLE) : 0;
    const give = (x, n) => { const t = Math.max(0, Math.min(n, x - lo)); return [x - t, n - t]; };
    if (over > 0) {
      if (sizing === 'chat') { [a, over] = give(a, over); [c, over] = give(c, over); }
      else if (sizing === 'app') { [c, over] = give(c, over); [a, over] = give(a, over); }
      else { const half = Math.ceil(over / 2); let left; [c, left] = give(c, half); over = over - half + left; [a, over] = give(a, over); [c, over] = give(c, over); }
    }
    out.chat = [c, lo, chatHi]; out.app = [a, lo, appHi];
    return out;
  }
  /* round 10 (Miguel: dragging felt laggy): a drag writes only what changed, once a frame. While a grip is held
   * (data-aad-resizing) the shown desks' windows follow their desk by CSS (desktop.css), and the page's resize (the
   * desks tiled again, every app frame, the orb, the composer) waits for the release: once, at pointerup. */
  const shownVars = {}, shownAria = {};
  function applySizes() {
    const s = sizes();
    for (const id of Object.keys(SIZE_VARS)) {
      const px = s[id][0] + 'px';
      if (shownVars[id] !== px) { shownVars[id] = px; root.style.setProperty(SIZE_VARS[id], px); }
      const g = grip[id]; if (!g) continue;
      const aria = `${s[id][0]},${s[id][1]},${Math.round(s[id][2])}`; if (shownAria[id] === aria) continue; shownAria[id] = aria;
      g.setAttribute('aria-valuenow', String(s[id][0])); g.setAttribute('aria-valuemin', String(s[id][1])); g.setAttribute('aria-valuemax', String(Math.round(s[id][2])));
    }
    // the desks' windows are laid out in pixels: again when a width changed (after the drag, while one is held)
    const sig = Object.keys(SIZE_VARS).map(id => s[id][0]).join(',');
    if (sig !== laidOut) { laidOut = sig; if (!sizing || !root.dataset.aadResizing) relayoutSoon(); }
  }
  /* One re-tile (the shell's own: a page resize) once a change has settled, coalesced: the windows of the shown panels
   * follow their desks by CSS meanwhile (desktop.css), so nothing re-lays out per frame and the wallpaper is untouched
   * (core/skins.js ignores a resize that leaves the page its size). */
  let retileOff = null;
  function retileSoon(ms = FLIP_MS + 20) { retileOff?.(); retileOff = api.after(ms, () => { retileOff = null; globalThis.dispatchEvent?.(new Event('resize')); syncOrb(); }); }
  const relayoutSoon = () => retileSoon();
  function setSize(id, w, keep) {
    sized = { ...sized, [id]: Math.round(w) }; applySizes();
    // what shows is what is kept (the panel that gave way too, so it never springs back over the middle)
    const now = sizes(); sized = { ...sized, [id]: now[id][0] };
    if (docked && pane && (id === 'chat' || id === 'app')) sized = { ...sized, chat: now.chat[0], app: now.app[0] };
    if (keep) api.storage.set('widths', sized);
  }
  function resetSize(id) { const { [id]: _, ...rest } = sized; sized = rest; api.storage.set('widths', sized); applySizes(); }
  /* (round 10) an app's page lays itself out again whenever its frame changes width, and the shown apps run in this
   * page's thread: while a grip is held their frames keep a fixed width (the window clips or shows its own background
   * at the moving edge), refitted a few times a second, and once more on release. */
  const FRAME_FIT_MS = 120;
  const shownFrames = () => [...doc.querySelectorAll('#stage > .wsp:not([hidden]) > .win:not(.gone) iframe')];
  function fitFrames(list) {
    for (const f of list) f.style.removeProperty('width');
    const ws = list.map(f => f.getBoundingClientRect().width);
    list.forEach((f, i) => { if (ws[i] > 0) f.style.setProperty('width', Math.round(ws[i]) + 'px'); });
  }
  const grips = el('div', 'aad-grips');
  const grip = {};
  for (const id of ['side', 'chat', 'app']) {
    const g = el('div', 'aad-grip', { role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', 'aria-label': GRIP_NAMES[id], title: GRIP_NAMES[id] + ' · double-click: back to default', 'data-grip': id });
    grips.append(g); grip[id] = g;
    // the left two grow to the right, the app panel to the left
    const sign = id === 'side' || id === 'chat' ? 1 : -1;
    let drag = null, cancelFrame = null;
    // (the pointer's latest x, applied once a frame: a fast mouse sends several moves a frame)
    const step = t => {
      cancelFrame = null; if (!drag || drag.at === drag.done) return;
      drag.done = drag.at; setSize(id, drag.w + (drag.at - drag.x) * sign, false);
      if (t && t - drag.fit > FRAME_FIT_MS) { drag.fit = t; fitFrames(drag.frames); }
    };
    api.listen(g, 'pointerdown', e => {
      if (e.button) return; e.preventDefault();
      try { g.setPointerCapture(e.pointerId); } catch (_) {}
      drag = { x: e.clientX, at: e.clientX, done: e.clientX, w: sizes()[id][0], fit: 0, frames: shownFrames() }; sizing = id; g.classList.add('is-drag'); root.dataset.aadResizing = id;
      fitFrames(drag.frames);
    });
    api.listen(g, 'pointermove', e => { if (!drag) return; drag.at = e.clientX; if (!cancelFrame) cancelFrame = api.frame(step); });
    const end = () => {
      if (!drag) return;
      cancelFrame?.(); cancelFrame = null; step(); const held = drag.frames; drag = null;
      for (const f of held) f.style.removeProperty('width');
      // the desks tiled for the final widths (and the orb placed) BEFORE the CSS follow is lifted: no jump on release
      sizing = ''; g.classList.remove('is-drag'); globalThis.dispatchEvent?.(new Event('resize')); syncOrb();
      delete root.dataset.aadResizing; api.storage.set('widths', sized);
    };
    api.listen(g, 'pointerup', end); api.listen(g, 'pointercancel', end); api.listen(g, 'lostpointercapture', end);
    api.listen(g, 'dblclick', () => resetSize(id));
    api.listen(g, 'keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); resetSize(id); return; }
      const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!dir) return;
      e.preventDefault(); sizing = id; setSize(id, sizes()[id][0] + dir * sign * (e.shiftKey ? 64 : 16), true); sizing = '';
    });
  }
  api.listen(globalThis, 'resize', () => applySizes());
  scene.append(grips);

  /* ---------- search (a field over the same lists, as on the phone) ---------- */
  let q = '';
  function setSearch(on) {
    if (on && root.dataset.aadSide === 'rail') { if (narrow()) { peek = true; offPeek = api.back.push(() => { peek = false; offPeek = null; paintSide(); }); } else { folded = false; api.storage.set('folded', false); } paintSide(); }
    searchBox.hidden = cancelBtn.hidden = !on; wsBtn.hidden = findBtn.hidden = on;
    if (!on) { q = ''; field.value = ''; offSearch?.(); offSearch = null; } else if (!offSearch) offSearch = api.back.push(() => { offSearch = null; setSearch(false); });
    paintList(true);
    if (on) field.focus?.({ preventScroll: true });
  }
  let offSearch = null;
  api.listen(findBtn, 'click', () => setSearch(true)); api.listen(rFind, 'click', () => setSearch(true));
  api.listen(cancelBtn, 'click', () => setSearch(false));
  api.listen(field, 'input', () => { q = field.value; paintList(); });
  api.listen(field, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); scroll.querySelector('button')?.click(); } });
  // Home (Miguel, 2 Nov 2026) = the empty new chat: the skin's background, the composer and the orb, no greeting. + goes
  // there from anywhere (and ⌥`, the desktop's own Home key).
  const newChat = () => { unpeek(); if (q) setSearch(false); closeMenu(); closeWs(); noteWant = false; api.sessions.newChat(); };
  const settings = () => { unpeek(); api.desk.settings(); };
  api.listen(newBtn, 'click', newChat); api.listen(rNew, 'click', newChat);
  api.listen(setBtn, 'click', settings); api.listen(rSet, 'click', settings);

  /* ---------- an app's icon: its logo, else its sigil in its colour (the sheet's own tile) ---------- */
  const metaOf = id => api.apps.list().find(a => a.id === id) || { id, name: appName(id) || id };
  function appTile(id, cls = 'aad-tile') {
    const a = metaOf(id), t = el('span', cls, { 'aria-hidden': 'true' });
    t.style.setProperty('--c', colourOf(a));
    t.append(el('i', `sgi sg-${glyphOf(a)}`, { 'aria-hidden': 'true' }));
    api.apps.logo(id).then(url => {
      if (!url || !t.isConnected) return;
      const im = el('img', 'aad-logo', { alt: '', src: url, draggable: 'false' });
      im.decode().then(() => { t.replaceChildren(im); t.classList.add('is-logo'); }, () => {});
    });
    return t;
  }
  // round 12: a Home icon is a desk (desk = its number): that desk. A Chats desk gets no app panel or placeholder: this
  // view has one chat area, so a Chats desk showing its list lands on the chat Home (the sidebar is the list)
  const goApp = (id, desk = null) => {
    unpeek(); const d = (desk != null && desks().find(x => x.desk === desk && x.id === id)) || desks().find(x => x.id === id);
    if (id === CHATS) { if (d) api.nav.goDesk(d.desk); else api.apps.openDesk(CHATS); return; }
    want = id; loading(id); if (d) api.nav.goDesk(d.desk); else api.apps.openDesk(id);
  };
  function appCell(a) {
    const b = el('button', 'aad-gi', { type: 'button', role: 'listitem', 'data-app': a.id, title: a.name, ...(a.id === (pane?.id || here().app) ? { 'aria-current': 'page' } : {}) });
    const ic = el('span', 'aad-gt'), n = el('b', 'aad-badge', { 'data-badge': a.id, 'aria-hidden': 'true', text: badgeText(a.id) }); n.hidden = !n.textContent;
    ic.append(appTile(a.id), n);
    b.append(ic, el('span', 'aad-gn', { text: a.name }));
    b.setAttribute('aria-label', a.name + (n.textContent ? `, ${n.textContent} new` : ''));
    api.listen(b, 'click', () => { if (q) setSearch(false); goApp(a.id); });
    return b;
  }
  function allCell(cls = 'aad-gi aad-all') {
    const b = el('button', cls, { type: 'button', role: 'listitem', 'aria-label': 'All apps', title: 'All apps' });
    const ic = el('span', 'aad-gt'), t = el('span', 'aad-tile is-plain', { 'aria-hidden': 'true' }); t.append(icon('apps')); ic.append(t);
    b.append(ic, el('span', 'aad-gn', { text: 'All apps', 'aria-hidden': 'true' }));
    api.listen(b, 'click', () => { unpeek(); chrome.open(); });
    return b;
  }
  const grid = (label, cells) => { const g = el('div', 'aad-grid', { role: 'list', 'aria-label': label }); g.append(...cells); return g; };

  /* ---------- Home's app grid (round 10, Miguel: umbrelOS's Home) ----------
   * Under the new chat's composer, over the skin's background (no panel behind it): big icons with their names, in the
   * phone's order (open first, badged first; then installed; then Get more), paged when they overflow (home.js); drag
   * to rearrange; a right click opens the quick actions below. Mounted on the stage itself, between the Chats desk and
   * an app panel, so the panel slides in OVER it. */
  const canPin = id => !!api.apps.homeScreen?.can?.(id);
  const home = homeView(api, { goApp: (id, desk) => goApp(id, desk), getMore: () => api.apps.openDesk('app-store'), lit, badgeText, desks, paged: true, menu: (a, at) => openAppMenu(a, at) });
  home.el.classList.add('aad-hg');
  const unmountHome = api.mount(home.el);
  const appFor = k => home.appFor(k);
  /* the quick actions (round 10): Open; Add to Home Screen (the Desks' own sheet, apps it would offer); the App Store
   * page (its own Update / Remove, behind the Store's own confirmations); Close for an open app (it stays installed) */
  function openAppMenu(a, at) {
    closeMenu(); closeWs();
    let isOpen = desks().some(d => d.id === a.id);
    const acts = [['open', 'Open', 'expand', () => goApp(a.id, a.desk)]];
    if (a.id === CHATS) isOpen = false;   // round 12: a Chats desk offers Open only
    else if (canPin(a.id)) acts.push(['pin', 'Add to Home Screen', 'plus', () => api.apps.homeScreen.offer(a.id)]);
    if (api.apps.get && a.id !== CHATS && !a.system) acts.push(['store', 'App Store page', 'apps', () => api.apps.get(a.id)]);
    if (isOpen && api.apps.close) acts.push(['close', 'Close', 'x', () => { api.apps.close(a.id); if (pane?.id === a.id) closeSide(); api.after(120, () => home.paint(true)); }]);
    const card = el('div', 'aad-pop aad-appmenu', { role: 'menu', 'aria-label': a.name });
    card.append(el('h3', 'aad-pop-h', { text: a.name }));
    for (const [k, word0, ico, run] of acts) {
      const it = el('button', 'aad-pop-i', { type: 'button', role: 'menuitem', 'data-act': k });
      it.append(icon(ico), el('span', '', { text: word0 }));
      api.listen(it, 'click', () => { closeMenu(); run(); });
      card.append(it);
    }
    scene.append(card);
    const h = acts.length * 40 + 44, H = globalThis.innerHeight || 900, W = globalThis.innerWidth || 1440;
    card.style.left = Math.round(Math.max(8, Math.min(at.x, W - 236))) + 'px';
    card.style.top = Math.round(at.y + h > H - 8 ? Math.max(8, at.y - h) : at.y) + 'px';
    const cellEl = at.el || null; cellEl?.classList.add('is-held');
    menu = { card, wrap: cellEl || card }; offMenuBack = api.back.push(closeMenu);
    api.after(0, () => card.querySelector('button')?.focus?.({ preventScroll: true }));
  }
  /** The app icons on screen with their letters (for the hold-⌥ hints): Home's page in view. */
  const appChips = () => home.chips().filter(c => shown(c.el));
  // round 11: Home's grid is always on the background (Home, a docked chat, an app panel: they slide over it), never
  // moved or re-laid out by them; only the stock list (the bare Chats list) replaces it
  function paintHome() {
    const on = root.dataset.aiFront !== 'list';
    if (on) root.dataset.aadHome = ''; else delete root.dataset.aadHome;
    home.show(on);
  }
  // the grid's box is fixed (desktop.css); a composer grown tall with words clips its lowest row instead of moving it
  let clipShown = '';
  function placeHome() {
    if (home.el.hidden) return;
    const c = !docked ? homeComposer() : null, r = c?.getBoundingClientRect(), g = home.el.getBoundingClientRect();
    const px = r && r.top > 0 && r.top - 12 < g.bottom ? Math.max(0, Math.round(g.bottom - (r.top - 12))) + 'px' : '0px';
    if (px !== clipShown) { clipShown = px; home.el.style.setProperty('--aad-hg-clip', px); }
  }

  /* ---------- a chat row: click opens it; ⋯ (on hover) or a right click opens its menu ---------- */
  function chatRow(s, cur) {
    const wrap = el('div', 'aad-rw' + (s.id === cur ? ' is-cur' : ''), { 'data-sid': s.id, 'data-kind': s.kind });
    const b = el('button', 'aad-row aad-chat', { type: 'button', ...(s.id === cur ? { 'aria-current': 'page' } : {}) });
    // a notification (round 5): the same row with a small bell before its title, nothing yellow
    if (s.note) { wrap.dataset.note = ''; b.append(icon('bell', 'aad-ico aad-bell')); }
    b.append(el('span', 'aad-row-t', { text: s.title }));
    if (s.pinned) b.append(icon('pin', 'aad-ico aad-pin'));
    if (s.kind === 'working' || (s.kind === 'ready' && s.unread)) b.append(el('i', 'aad-st' + (s.kind === 'working' ? '' : ' is-new'), { 'aria-hidden': 'true' }));
    b.setAttribute('aria-label', `${s.note ? 'Notification: ' : ''}${s.title}${s.kind === 'working' ? ', working' : s.unread ? ', ready, new' : s.snoozed && s.note ? ', snoozed' : s.kind === 'ready' ? ', ready' : ''}${s.pinned ? ', pinned' : ''}`);
    api.listen(b, 'click', () => { if (q) setSearch(false); unpeek(); noteWant = !!s.note; api.sessions.open(s.id); });
    api.listen(b, 'contextmenu', e => { e.preventDefault(); openMenu(wrap, s, { x: e.clientX, y: e.clientY }); });
    wrap.append(b);
    if ((s.actions || []).some(k => ACTS.some(([a]) => a === k))) {
      const m = el('button', 'aad-more', { type: 'button', 'aria-label': `More for ${s.title}`, title: 'More', 'aria-haspopup': 'menu' }); m.append(icon('more'));
      api.listen(m, 'click', e => { e.stopPropagation?.(); openMenu(wrap, s); });
      wrap.append(m);
    }
    return wrap;
  }
  let menu = null, offMenuBack = null;
  function openMenu(wrap, s, at = null) {
    closeMenu();
    const acts = ACTS.filter(([k]) => (s.actions || []).includes(k));
    if (!acts.length) return;
    const card = el('div', 'aad-pop aad-rowmenu', { role: 'menu', 'aria-label': s.title });
    for (const [k, w0] of acts) {
      const it = el('button', 'aad-pop-i' + (k === 'done' ? ' is-file' : ''), { type: 'button', role: 'menuitem', 'data-act': k });
      it.append(icon(k), el('span', '', { text: k === 'pin' && s.pinned ? 'Unpin' : w0 }));
      api.listen(it, 'click', () => { closeMenu(); api.sessions.act(s.id, k); api.after(120, () => { readSessions(); paintList(true); }); });
      card.append(it);
    }
    scene.append(card);
    const r = wrap.getBoundingClientRect(), h = acts.length * 40 + 12, H = globalThis.innerHeight || 900;
    const x = at ? at.x : r.right - 8, y0 = at ? at.y : r.bottom + 4;
    card.style.left = Math.round(Math.max(8, Math.min(x, (globalThis.innerWidth || 1440) - 228))) + 'px';
    card.style.top = Math.round(y0 + h > H - 8 ? Math.max(8, (at ? at.y : r.top - 4) - h) : y0) + 'px';
    menu = { card, wrap }; wrap.classList.add('is-held');
    offMenuBack = api.back.push(closeMenu);
    api.after(0, () => card.querySelector('button')?.focus?.({ preventScroll: true }));
  }
  function closeMenu() {
    if (!menu) return;
    menu.card.remove(); menu.wrap.classList.remove('is-held'); menu = null; offMenuBack?.(); offMenuBack = null;
  }

  /* ---------- paint the sidebar (only when what it lists changed: renders come often while a chat works) ---------- */
  const label = text => el('h3', 'aad-lab', { text });
  let drawn = '', railDrawn = '';
  function paintList(force = false) {
    if (root.dataset.aadSide === 'rail') return;
    const s = sessions || readSessions(), apps = api.apps.list(), dk = desks(), h = here();
    const sig = JSON.stringify([q, h.thread, h.app, pane?.id, dk.map(d => d.id + d.desk + (lit(d.id) ? '*' + badgeText(d.id) : '')), apps.length,
      secOpen, only, ['working', 'ready', 'archive'].map(k => (s[k] || []).map(r => [r.id, r.title, r.unread, r.pinned, (r.actions || []).join()]))]);
    if (!force && sig === drawn && scroll.childElementCount) return;
    drawn = sig;
    const out = [];
    if (q) {
      const hitsA = apps.filter(a => a.id !== CHATS && !a.agent && !a.connector && !a.dev && matches(a, q));
      const seen = new Set(), hitsC = ['working', 'ready', 'archive'].flatMap(k => s[k] || []).filter(r => !seen.has(r.id) && seen.add(r.id) && matches({ name: r.title }, q));
      if (hitsA.length) out.push(label('Apps'), grid('Apps', hitsA.map(appCell)));
      if (hitsC.length) out.push(label('Chats'), ...hitsC.map(r => chatRow(r, h.thread)));
      if (!hitsA.length && !hitsC.length) out.push(el('p', 'aad-empty', { text: 'No chat or app by that name.' }));
    } else {
      // the sidebar is the chat list only (Miguel, 2 Nov 2026: the apps live on Home now; a search still finds them)
      // Wizard's own sections in place of Recents (round 5): Archive, Working, Ready, each folding under its header
      for (const [k, word0] of SECTIONS) {
        const all = s[k] || [], on = !!secOpen[k], rows = k === 'ready' && only ? all.filter(r => stateOf(r) === only) : all;
        const hd = el('button', 'aad-lab aad-sec', { type: 'button', 'data-sec': k, 'aria-expanded': String(on), 'aria-controls': 'aad-sec-' + k });
        hd.append(el('span', '', { text: word0 }), icon('down', 'aad-ico aad-sec-c'));
        // folded (round 7): a minimal tally after the chevron: Working its count with a tiny spinner, Ready its count
        if (!on && k !== 'archive' && rows.length) { hd.append(el('span', 'aad-tally', { 'data-n': String(rows.length), 'aria-hidden': 'true' })); hd.setAttribute('aria-label', `${word0}, ${rows.length}, folded`); }
        api.listen(hd, 'click', () => { secOpen[k] = !secOpen[k]; if (k === 'ready') only = ''; api.storage.set('sections', { ...secOpen }); paintList(true); });
        const body = el('div', 'aad-sec-b', { id: 'aad-sec-' + k, role: 'group', 'aria-label': word0 }); body.hidden = !on;
        if (on && k === 'ready' && only) {
          // round 12: Ready showing one status (a click on it in the rail): its name and how to see all again
          const chip = el('button', 'aad-only', { type: 'button', 'aria-label': `Showing only ${STATE_WORD[only] || only}. Show all of Ready`, title: 'Show all of Ready' });
          chip.append(el('span', 'aad-only-w', { text: `${STATE_WORD[only] || only} · ${rows.length} of ${all.length}` }), el('span', 'aad-only-x', { text: 'Show all' }));
          api.listen(chip, 'click', () => { only = ''; paintList(true); });
          body.append(chip);
        }
        if (on) {
          if (rows.length) body.append(...rows.map(r => chatRow(r, h.thread)));
          else body.append(el('p', 'aad-empty', { text: !sessions ? 'Loading your chats…' : k === 'ready' ? 'Nothing ready.' : k === 'working' ? 'Nothing working.' : 'Nothing archived.' }));
        }
        out.push(hd, body);
      }
    }
    closeMenu();
    scroll.replaceChildren(...out);
  }
  /* The rail (round 12, Miguel: the icon tiles were unreadable): words in the expanded list's type, no status icons or
   * coloured dots. Working n, Ready n and under Ready, indented, each stock Chats status with chats in it (STATES:
   * core/chats.js stiKind's words and order; plain Ready chats count in Ready only), then Archive n, quieter. One click
   * opens the sidebar on that section, scrolled to it; a status opens Ready showing only that status, with a chip
   * above the rows that shows all again (dropped when the sidebar folds). */
  function openSection(k, state = '') {
    secOpen[k] = true; api.storage.set('sections', { ...secOpen });
    only = k === 'ready' ? state : '';
    if (q) setSearch(false);
    if (narrow()) { if (!peek) { peek = true; offPeek = api.back.push(() => { peek = false; offPeek = null; paintSide(); }); } }
    else { folded = false; api.storage.set('folded', false); }
    paintSide(); paintList(true);
    const hd = scroll.querySelector?.(`.aad-sec[data-sec="${k}"]`), top = hd?.getBoundingClientRect?.().top, box = scroll.getBoundingClientRect?.().top;
    if (typeof top === 'number' && typeof box === 'number') scroll.scrollTop = Math.max(0, (scroll.scrollTop || 0) + top - box - 4);
  }
  function railRow(k, n, word0, state = '') {
    const sub = !!state, tip = sub ? `${n} ${word0}: show them in Ready` : `${word0}, ${n}: open the sidebar there`;
    const b = el('button', 'aad-rk' + (sub ? ' is-sub' : ''), { type: 'button', role: 'listitem', 'data-k': sub ? state : k, title: tip, 'aria-label': tip });
    b.append(el('span', 'aad-rk-w', { text: word0 }), el('span', 'aad-rk-n', { text: n > 99 ? '99+' : String(n) }));
    api.listen(b, 'click', () => openSection(k, state));
    return b;
  }
  function paintRail(force = false) {
    if (root.dataset.aadSide !== 'rail') return;
    const s = sessions || readSessions(), ready = s.ready || [], groups = stateGroups(ready).filter(g => g.state !== 'none');
    const sig = JSON.stringify([(s.working || []).length, ready.length, (s.archive || []).length, groups.map(g => g.state + g.rows.length)]);
    if (!force && sig === railDrawn && rList.childElementCount) return;
    railDrawn = sig;
    const out = [];
    if ((s.working || []).length) out.push(railRow('working', s.working.length, 'Working'));
    if (ready.length) out.push(railRow('ready', ready.length, 'Ready'), ...groups.map(g => railRow('ready', g.rows.length, g.word, g.state)));
    if ((s.archive || []).length) out.push(railRow('archive', s.archive.length, 'Archive'));
    if (!out.length) out.push(el('p', 'aad-rnone', { text: 'Nothing ready' }));
    rList.replaceChildren(...out);
  }
  let fuelSig = '';
  const paintFuel = () => { fuelSig = gaugeInto(doc, fuel, fuelSig, () => { unpeek(); api.desk.settings('ai'); }); };
  function paintBadges() {
    home.paint(); paintFuel();
    if (root.dataset.aadSide === 'rail') paintRail(); else paintList();
    for (const n of scroll.querySelectorAll('[data-badge]')) { n.textContent = badgeText(n.dataset.badge); n.hidden = !n.textContent; }
    const rt = badgeText(CHATS);
    for (const c of [togCount, rCount]) { c.textContent = rt; c.hidden = !rt; }
    togBtn.setAttribute('aria-label', rt ? `Close sidebar, ${rt} ready` : 'Close sidebar');
    rTog.setAttribute('aria-label', rt ? `Open sidebar, ${rt} ready` : 'Open sidebar');
  }

  /* ---------- workspaces (top right): this Wizard, then the ones he manages ---------- */
  let wsPop = null, offWsBack = null;
  function paintWs() {
    const list = api.workspaces?.list() || [], own = list[0] || { name: agentName() };
    wsName.textContent = own.name;
    wsBtn.setAttribute('aria-label', `Workspace: ${own.name}. Switch workspace`); wsBtn.title = `Workspace: ${own.name}`;
    if (wsPop) paintWsPop(list);
  }
  function paintWsPop(list) {
    const rows = list.map(w => {
      const r = el('div', 'aad-wr' + (w.current ? ' is-on' : ' is-off'), { role: 'menuitemradio', 'aria-checked': String(!!w.current), tabindex: '-1' });
      const words = el('span', 'aad-ww'); words.append(el('b', '', { text: w.name }), el('small', '', { text: w.current ? 'This Wizard · on this screen' : `${w.org ? w.org + ' · ' : ''}Not connected yet` }));
      r.append(el('span', 'aad-wsd is-big', { 'aria-hidden': 'true', text: initial(w.name) }), words);
      if (w.current) r.append(icon('check', 'aad-ico aad-wcheck'));
      return r;
    });
    const manage = el('button', 'aad-wm', { type: 'button', role: 'menuitem', text: 'Manage workspaces' });
    api.listen(manage, 'click', () => { closeWs(); api.desk.settings('network'); });
    wsPop.replaceChildren(el('h3', 'aad-wh', { text: 'Workspaces' }), ...rows, el('hr', 'aad-pdiv'), manage);
  }
  function openWs() {
    if (wsPop) return; closeMenu();
    api.workspaces?.refresh();
    wsPop = el('div', 'aad-pop aad-wspop', { role: 'menu', 'aria-label': 'Workspaces' });
    scene.append(wsPop); paintWsPop(api.workspaces?.list() || []);
    offWsBack = api.back.push(closeWs); wsBtn.setAttribute('aria-expanded', 'true');
    api.after(0, () => wsPop?.querySelector('button')?.focus?.({ preventScroll: true }));
  }
  function closeWs() { if (!wsPop) return; wsPop.remove(); wsPop = null; offWsBack?.(); offWsBack = null; wsBtn.setAttribute('aria-expanded', 'false'); }
  api.listen(wsBtn, 'click', () => (wsPop ? closeWs() : openWs()));
  api.listen(globalThis, 'wos:resources', () => { paintWs(); paintFuel(); });
  // a click anywhere else closes the menus (their own popovers, like ChatGPT's)
  api.listen(doc, 'pointerdown', e => {
    const t = e.target;
    if (menu && !menu.card.contains(t) && !t?.closest?.('.aad-more')) closeMenu();
    if (wsPop && !wsPop.contains(t) && !wsBtn.contains(t)) closeWs();
  }, true);

  /* ---------- voice: the orb (click talks, hold commands, drag up = Home) ---------- */
  const MODES = ['idle', 'listen', 'command', 'think', 'paused', 'done', 'agent', 'typing'];
  let eng = null;
  api.orb.ready().then(ok => { if (!ok || !scene.isConnected) return; eng = api.orb.create(cv, fb, { R: .64 }); eng?.setRestingMotion?.(false); mode(api.voice.state()); });
  function mode(v) {
    const m = !v || v.state === 'idle' ? (v?.command ? 'command' : 'idle') : v.command ? 'command' : MODES.includes(v.state) ? v.state : 'listen';
    orbBox.dataset.mode = m; eng?.setMode?.(m);
    if (m === 'idle') delete root.dataset.aadVoice; else root.dataset.aadVoice = m;
  }
  api.on('voice', mode);
  api.orb.onLevel(v => eng?.setLevel?.(+v || 0));
  let press = null;
  // a press: click talks (again = send), hold = a local command (release runs it); on the orb a drag up = Home (the chat)
  function down(e, target, { drag }) {
    const p = { held: false, started: null, cancel: null, x: e.clientX, y: e.clientY, moved: false, drag, target }; press = p;
    try { target.setPointerCapture?.(e.pointerId); } catch (_) {}
    target.classList.add('is-pressed'); if (target === orbBtn) eng?.press?.(true);
    p.cancel = api.after(HOLD_MS, () => { if (press !== p || p.moved || (api.voice.state()?.state || 'idle') !== 'idle') return; p.held = true; p.started = Promise.resolve(api.voice.command()); });
  }
  function move(e) {
    const p = press; if (!p || p.held || p.moved) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; if (Math.hypot(dx, dy) < 48) return;
    p.moved = true; p.cancel?.();
    if (p.drag && dy < 0 && -dy > Math.abs(dx)) newChat();
  }
  function up(run) {
    const p = press; press = null; if (!p) return; p.cancel?.(); p.target.classList.remove('is-pressed'); if (p.target === orbBtn) eng?.press?.(false);
    if (!run || p.moved) return;
    if (p.held) p.started.then(r => { if (r === 'voice') api.voice.command(); });
    else api.voice.talk();
  }
  api.listen(orbBtn, 'pointerdown', e => { if (!e.button) down(e, orbBtn, { drag: true }); });
  api.listen(orbBtn, 'pointermove', move);
  api.listen(orbBtn, 'pointerup', () => up(true)); api.listen(orbBtn, 'pointercancel', () => up(false));
  api.listen(orbBtn, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) api.voice.talk(); } });
  api.listen(orbBtn, 'contextmenu', e => e.preventDefault());
  /* the composer (round 6, Miguel: the orb replaces the microphone): the orb sits INSIDE it, in the slot where the mic
   * was (desktop.css: the grid's 'orb' column, right, before the round Send that shows with words); off a chat, back to
   * its own spot at the bottom centre of the main area (or the end of an app's bottom row: skin-host via chrome) */
  function orbSlot() {
    if (root.dataset.aiFront !== 'chat' && !pane) return null;   // (beside an app panel the chat stays in view)
    if (pane && wide) return null;   // (the wide panel covers the chat: the orb takes its own spot; round 11: else the composer is always clear of the panel)
    const c = [...doc.querySelectorAll('.win .dchats .pane-main .ch-compose')].find(n => n.getClientRects().length && n.getBoundingClientRect().width > 0);
    const row = c?.querySelector('.ch-row2');
    return row ? gridSlot(row, 3) : null;
  }
  // (round 8: placed afresh each time: the orb's own spot moves too, sliding when the chat column or a sidebar changes,
  // while the slot can stay put; a same-slot call would keep a move measured mid-slide)
  // (round 11, Miguel: panels must open smoothly): only when the slot or the orb's own spot really moved. Every call
  // used to clear and re-set the orb's variables on <html>, a whole-page style recalc twice a call, ~20 calls an open.
  function placeOrb(force = false) {
    if (!force && Date.now() < glideUntil) return;   // (mid-glide the boxes are moving: the settle places it)
    const s = orbSlot(), h = chrome.orbHome?.() || null;
    if (!force && orbAt.done && near(s, orbAt.slot) && near(h, orbAt.home)) return;
    Object.assign(orbAt, { done: true, slot: s, home: h }); chrome.orbIn(null); chrome.orbIn(s);
  }
  const syncOrb = () => api.frame(() => { placeOrb(); placeHome(); watchComposer(); });
  /* round 8: the composer moves without a resize of the page (the Chats window laid out again after the sidebars settle,
   * the model chip filled in late): follow its box and its window's, so the orb never sits on the chip */
  let roSeen = null, roAsked = false;
  // (once a frame at most; while a grip is held the orb waits for the release, which places it: round 10)
  const ro = globalThis.ResizeObserver ? new ResizeObserver(() => { if (roAsked || root.dataset.aadResizing) return; roAsked = true; api.frame(() => { roAsked = false; placeOrb(); placeHome(); }); }) : null;
  function watchComposer() {
    if (!ro) return;
    const c = [...doc.querySelectorAll('.win .dchats .pane-main .ch-compose')].find(n => n.getClientRects().length) || null;
    if (c === roSeen) return;
    ro.disconnect(); roSeen = c;
    if (c) { ro.observe(c); const w = c.closest('.win'); if (w) ro.observe(w); const ch = c.querySelector('.ch-mlabel'); if (ch) ro.observe(ch); }
  }
  api.listen(globalThis, 'resize', syncOrb);
  api.listen(orbBox, 'transitionend', syncOrb);
  api.listen(doc, 'input', e => { if (e.target?.closest?.('.ch-compose')) syncOrb(); }, true);
  api.listen(doc, 'focusin', syncOrb, true);
  /* ---------- round 7 (Miguel, 2 Nov 2026): the Orb desktop's thirds ----------
   * The sidebar (the list) on the left; a chat (a thread, or a notification shown as one) opens as a column docked right
   * beside it, about a third wide (never the whole screen), with ✕ at its top right (Esc too) back to the list and Home,
   * whose apps stay in view behind it; an app opens as a panel about one third wide on the right, which grows to the
   * whole main area and back (⤢, ⌥F) and shows a placeholder from the first frame while a slow app loads. Built on the
   * desks as they are: the Chats desk and the app's desk are both shown (desktop.css, data-aad-role on their desks), so
   * the app keeps running as it was; ✕ or Esc hides the panel (the app keeps running on its desk, as in the Orb view).
   * Short slides + fades (desktop.css). */
  const wsps = () => [...doc.querySelectorAll('#stage > .wsp')];
  let toolsMo = null, toolsSrc = null;
  const srcTools = () => pane?.el?.querySelector(':scope > .win:not(.gone) > .wbar > .wtools') || null;
  function paintTools() {
    const src = srcTools();
    if (src !== toolsSrc) {
      toolsMo?.disconnect(); toolsMo = null; toolsSrc = src;
      if (src && globalThis.MutationObserver) { toolsMo = new MutationObserver(() => api.frame(paintTools)); toolsMo.observe(src, { childList: true, subtree: true, attributes: true }); }
    }
    pTools.replaceChildren(...(src ? [...src.children].map(c => { const n = c.cloneNode(true); if (c.tagName === 'SELECT') n.value = c.value; return n; }) : []));
    pTools.hidden = !pTools.children.length;
  }
  const srcTool = n => { const id = n?.dataset?.tool; return id && /^[a-z0-9-]{1,32}$/.test(id) ? srcTools()?.querySelector(`[data-tool="${id}"]`) || null : null; };
  api.listen(pTools, 'click', e => { const n = e.target?.closest?.('button[data-tool]'); if (n && !n.disabled) srcTool(n)?.click(); });
  api.listen(pTools, 'change', e => { const n = e.target?.closest?.('select[data-tool]'), o = srcTool(n); if (!o) return; o.value = n.value; o.dispatchEvent(new Event('change', { bubbles: true })); });
  const NOTE = '__note__';
  let noteWant = false, docked = false, wide = false;
  const noteOn = () => !!noteThread(doc, '.win .dchats .pane-main');
  const noteTitle = () => noteThread(doc, '.win .dchats .pane-main')?.querySelector('.ch-head .ti b')?.textContent || 'Notification';
  function paintSplit(chatOn) {
    const h = here();
    if (h.app && (want === h.app || !pane || pane.id !== h.app)) {
      // the app now in front becomes the panel (its desk is the one not hidden)
      const el0 = wsps().find(w => !w.hidden && !w.querySelector('.dchats'));
      if (el0) { const fresh = pane?.el !== el0; pane = { id: h.app, el: el0 }; if (fresh) anim('app'); }
      want = null;
    }
    if (pane && (!pane.el.isConnected || !desks().some(d => d.id === pane.id))) pane = null;
    if (!pane && wide) setWide(false);
    const chat = pane || chatOn ? wsps().find(w => w.querySelector('.dchats')) : null;
    for (const w of wsps()) { const r = w === pane?.el ? 'app' : w === chat ? 'chat' : ''; if ((w.dataset.aadRole || '') !== r) { if (r) w.dataset.aadRole = r; else delete w.dataset.aadRole; } }
    const was = `${!!root.dataset.aadSplit}${docked}`, wasDocked = docked;
    docked = !!(chatOn && chat);
    const setState = () => {
      if (pane && chat) root.dataset.aadSplit = 'on'; else delete root.dataset.aadSplit;
      if (docked) root.dataset.aadChat = 'on'; else delete root.dataset.aadChat;
    };
    // (the Home composer moves into the room the panel leaves it: it glides there; round 11)
    if (!docked && !wasDocked && !!(pane && chat) !== !!root.dataset.aadSplit) flip([homeComposer(), orbBox], setState); else setState();
    if (docked && !wasDocked) anim('dock');
    applySizes();
    // the windows are laid out in pixels and the app's bottom bar around the orb: again for the new widths
    if (was !== `${!!root.dataset.aadSplit}${docked}`) retileSoon();
    pTop.hidden = !pane; cX.hidden = !docked;
    if (pane) { pName.textContent = appName(pane.id); pIcon.replaceChildren(appTile(pane.id, 'aad-tile is-xs')); pX.setAttribute('aria-label', `Close ${appName(pane.id)} (Esc)`); }
    paintTools();
    if (loadId && (!want || want !== loadId) && (!pane || pane.id !== loadId)) { if (!want) doneLoading(); }
    else if (loadId && pane?.id === loadId) waitLoaded(pane.el);
  }
  // the panel goes (the app keeps running on its desk); the chat takes the room back and the keyboard
  let closing = null;
  function closeSide() {
    if (!pane || closing) return !!pane;
    const was = pane, el0 = was.el, w0 = el0.getBoundingClientRect?.().width || 480;
    const finish = () => {
      closing = null; if (pane !== was) return;
      pane = null; setWide(false); doneLoading(); anim('close');
      const c = homeComposer();
      flip([c, orbBox], () => { if (here().app === was.id) api.sessions.chats(); else paintSplit(!!chatThread); paintTop(); });
      api.frame(() => { out?.cancel?.(); fade?.cancel?.(); });
    };
    // the panel slides back out to the right (a transform), then the app goes back to running behind Home
    const out = !reduced() && typeof el0.animate === 'function' ? el0.animate([{ translate: '0px 0px', opacity: 1 }, { translate: `${Math.min(w0, 480)}px 0px`, opacity: 0.3 }], { duration: 200, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }) : null;
    let fade = null;
    if (out) { closing = api.after(200, finish); fade = pTop.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }) || null; } else finish();
    return true;
  }
  // the chat column goes: back to the list and Home (a new chat), the app panel (if any) stays
  function closeChat() {
    if (!docked) return false;
    chatThread = null; noteWant = false; anim('undock');
    api.sessions.newChat(); return true;
  }
  // the app panel: a third, or the whole main area (the Orb desktop's panel, wider and back)
  function setWide(on) {
    const w = !!on && !!pane; if (w === wide) return; wide = w;
    flip([pane?.el, pTop], () => { if (wide) root.dataset.aadWide = ''; else delete root.dataset.aadWide; });
    paintWide();
    retileSoon();
  }
  function paintWide() {
    pW.setAttribute('aria-pressed', String(wide)); pW.replaceChildren(icon(wide ? 'shrink' : 'expand'));
    pW.title = wide ? 'Back to a third (⌥F)' : 'Wider (⌥F)'; pW.setAttribute('aria-label', wide ? 'Make the app panel a third again' : 'Make the app panel wider');
  }
  paintWide();
  // a slow app: its placeholder in the panel's place at once (desktop.css fades it in after a beat, so a fast app never
  // flashes it), gone once the app's frame has loaded (or after 15 s whatever happens)
  let loadId = '', loadOff = null, loadWait = null;
  function loading(id) {
    if (pane?.id === id && frameReady(pane.el)) return;
    loadId = id; pLoadT.textContent = `Opening ${appName(id) || 'the app'}…`;
    pLoad.querySelector('.aad-pload-i').replaceChildren(appTile(id, 'aad-tile'));
    pLoad.hidden = false; root.dataset.aadLoading = '';
    loadOff?.(); loadOff = api.after(15000, doneLoading);
  }
  function doneLoading() { loadOff?.(); loadOff = null; loadWait?.(); loadWait = null; loadId = ''; pLoad.hidden = true; delete root.dataset.aadLoading; }
  function frameReady(w) {
    const f = w?.querySelector?.('iframe'); if (!f) return !!w;
    try { const d = f.contentDocument; return !d || (d.readyState === 'complete' && d.URL !== 'about:blank'); } catch (_) { return true; }
  }
  function waitLoaded(w) {
    if (frameReady(w)) return doneLoading();
    if (loadWait) return;
    const f = w.querySelector('iframe'); loadWait = api.listen(f, 'load', () => { if (frameReady(w)) doneLoading(); });
  }
  let animOff = null;
  // (round 11: on the pieces that move, never on <html>: a root attribute restyles the whole page twice an open)
  let animOn = [];
  function anim(kind) {
    animOff?.(); for (const n of animOn) delete n.dataset.aadAnim;
    const chatDesk = wsps().find(w => w.querySelector('.dchats'));
    animOn = (kind === 'app' ? [pane?.el, pTop] : kind === 'dock' ? [chatDesk, cTop] : kind === 'thread' ? [chatDesk] : []).filter(Boolean);
    for (const n of animOn) n.dataset.aadAnim = kind;
    animOff = api.after(320, () => { for (const n of animOn) delete n.dataset.aadAnim; animOn = []; animOff = null; });
  }
  api.listen(pX, 'click', closeSide);
  api.listen(cX, 'click', closeChat);
  api.listen(pW, 'click', () => setWide(!wide));
  const typing = () => { const a = doc.activeElement; return !!a && /^(TEXTAREA|INPUT)$/.test(a.tagName || '') && !!a.value; };
  // Esc: a wide panel back to a third, else the panel closes, else the chat column (never words being typed)
  api.keys.on({ down: e => {
    if (e.key !== 'Escape' || e.altKey || e.ctrlKey || e.metaKey || menu || wsPop || q) return false;
    if (pane) { if (wide) setWide(false); else closeSide(); return true; }
    if (docked && !typing()) { closeChat(); return true; }
    return false;
  } });

  /* ---------- ⌥ keys (Miguel, 2 Nov 2026): every desktop ⌥ key keeps working; the hold-⌥ hints map onto this view ----------
   * The shell's own hold-⌥ overlay (desktop.js keyHints: bare letters on their targets while LEFT ⌥ is held, gone on
   * release) draws these too (api.keys.guide). This view adds: ⌥\ the sidebar (as the Orbs view's list; Ctrl / ⌘ ⇧ S
   * too), ⌥W / Esc close the app panel (else the chat column), ⌥F the panel wider / a third (the desktop's own full
   * screen key), ⌥ + a free letter a Home app (home.js appKeys). */
  api.keys.on({ down: e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return false;
    if (e.code === 'Backslash' && !e.shiftKey) { if (!e.repeat) toggleSide(); return true; }
    if (e.code === 'KeyW' && !e.shiftKey && pane) { if (!e.repeat) closeSide(); return true; }
    if (e.code === 'KeyW' && !e.shiftKey && docked) { if (!e.repeat) closeChat(); return true; }
    if (e.code === 'KeyF' && !e.shiftKey && pane) { if (!e.repeat) setWide(!wide); return true; }
    const k = /^Key([A-Z])$/.exec(e.code || '')?.[1], id = k && !e.shiftKey && appFor(k);
    if (id) { if (!e.repeat) goApp(id); return true; }
    return false;
  } });
  const shown = n => !!n && n.isConnected !== false && !n.closest?.('[hidden]') && (typeof n.getClientRects !== 'function' || n.getClientRects().length > 0);
  api.keys.guide(() => {
    const open = root.dataset.aadSide === 'open', out = [];
    const put = (n, key, word, at) => { if (shown(n)) out.push({ el: n, key, word, at }); };
    put(open ? newBtn : rNew, '`', 'Home', open ? 'start' : 'end');
    put(open ? togBtn : rTog, '\\', open ? 'Close sidebar' : 'Sidebar', 'below');
    put(open ? newBtn : rNew, 'N', 'New chat', open ? 'above' : 'below');
    put(open ? setBtn : rSet, ',', 'Settings', 'above');
    put(open ? findBtn : rFind, '␣', 'Search', 'below');
    // ⌥↓ / ⌥↑: the next / previous Ready chat, on its row in the sidebar
    if (open) {
      const rows = [...side.querySelectorAll('.aad-rw[data-kind="ready"] .aad-row')].filter(shown), i = rows.findIndex(r => r.closest('.aad-rw.is-cur'));
      const next = rows.length && (i < 0 ? rows[0] : rows[(i + 1) % rows.length]); if (next && next !== rows[i]) put(next, '↓', '', 'inside');
      if (i > 0 && rows.length > 2) put(rows[i - 1], '↑', '', 'inside');
    }
    put(orbBox, 'S', 'Talk', 'above'); put(orbBox, 'C', 'Command', 'below');
    if (pane) { put(pX, 'W', 'Close · Esc', 'below'); put(pW, 'F', wide ? 'A third' : 'Wider', 'below'); }
    else if (docked) put(cX, 'W', 'Close · Esc', 'below');
    return out;
  });
  api.keys.guide(() => appChips());

  /* ---------- the main area: the chat (Home and the bare list become it), or an app ---------- */
  function here(r = api.route()) {
    const d = desks().find(x => x.desk === r.desk), id = r.home ? '' : d?.id || '';
    const app = id && id !== CHATS && !(r.view === 'thread' || r.view === 'list') ? id : '';
    // a notification opened from the list is a New chat holding the note (round 7: it is a chat, never Home)
    const note = !app && !r.home && r.view === 'thread' && r.thread === '__new__' && (noteWant || noteOn());
    return { app, thread: r.thread && r.thread !== '__new__' ? r.thread : null, note, r };
  }
  let pending = false;
  const soon = fn => { if (pending) return; pending = true; api.after(0, () => { pending = false; fn(); }); };
  function onRoute(r) {
    if (r.home) soon(() => { if (api.route().home) api.sessions.newChat(); });
    else if (r.view === 'list') soon(() => { if (api.route().view === 'list') api.sessions.newChat(); });
    paintTop(r);
  }
  let lastThread, chatThread = null;
  function paintTop(r = api.route()) {
    if (noteOn() || r.view !== 'thread' || (r.thread && r.thread !== '__new__')) noteWant = false;   // the note is on screen now (or gone)
    noteRouteIntoActions(doc, '.win .dchats .pane-main');
    const h = here(r);
    // the chat on screen: a thread, or a notification shown as one; with an app in front, the chat beside it stays
    if (!h.app) chatThread = h.thread || (h.note ? NOTE : null);
    const wasDocked = docked;
    paintSplit(!!chatThread);
    // a thread picked slides in from the left, next to the sidebar (the column itself slides in when it docks)
    if (h.thread !== lastThread) { if (h.thread && lastThread !== undefined && wasDocked) anim('thread'); lastThread = h.thread; }
    root.dataset.aiFront = r.home ? 'chat' : h.app ? 'app' : r.view === 'list' ? 'list' : 'chat';
    const fresh = !h.app && !h.note && (r.home || (r.view === 'thread' && r.thread === '__new__'));
    root.dataset.aadNew = String(fresh && !r.home);
    // Home (round 8, Miguel: clean again, like round 4) = the skin's background and the new chat's composer, nothing
    // else; the apps are in their own sidebar on the right
    const t = h.app && !pane ? appName(h.app) : chatThread === NOTE ? noteTitle() : chatThread ? titleOf(chatThread) : '';
    tt.textContent = t; tt.title = t;
    cX.setAttribute('aria-label', chatThread === NOTE ? 'Close the notification (Esc)' : 'Close the chat (Esc)');
    paintWs();
    if (root.dataset.aadSide === 'rail') paintRail(); else paintList();
    paintHome();
    syncOrb();
  }
  api.on('route', r => { onRoute(r); api.after(260, syncOrb); });
  api.on('render', () => { readSessions(); paintTop(); });
  api.on('home', () => soon(() => { if (api.route().home) api.sessions.newChat(); }));
  // Settings opens as the centred panel over the page (Claude's settings modal), never as a window beside the chat
  root.dataset.settingsOver = '';
  readSessions(); paintSide(false); paintTop(); paintBadges();
  globalThis.dispatchEvent?.(new Event('resize'));
  if (api.route().home) soon(() => api.sessions.newChat());
  // the composer settles once both sidebars and the stylesheet are in: the orb's slot in it again then
  api.listen(css, 'load', () => api.after(260, () => syncOrb()));

  return () => {
    closeMenu(); closeWs(); offSearch?.(); offPeek?.(); doneLoading(); ro?.disconnect();
    scene.remove(); unmountHome(); home.el.remove(); chrome.dispose(); unmountCss(); css.remove();
    toolsMo?.disconnect();
    for (const k of ['aiApps', 'aiFront', 'aadSide', 'aadHome', 'aadNew', 'aadVoice', 'settingsOver', 'aadSplit', 'aadChat', 'aadWide', 'aadLoading']) delete root.dataset[k];
    for (const w of wsps()) { delete w.dataset.aadRole; delete w.dataset.aadAnim; }
    delete root.dataset.aadResizing; for (const v of Object.values(SIZE_VARS)) root.style.removeProperty(v);
    globalThis.dispatchEvent?.(new Event('resize'));
  };
}
