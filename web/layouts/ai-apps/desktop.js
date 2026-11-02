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
 *   - Collapsed, it is a 52 px icon rail (ChatGPT / Perplexity): ◫, +, 🔍, the open apps' icons, All apps, and the cog
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
 * Everything through the layout API; no timers of its own beyond api.after, no innerHTML, no storage of its own
 * beyond api.storage. Colours are skin tokens (desktop.css). */
import { viewChrome, openApps, realApps, matches, CHATS, MIC } from '../apps/chrome.js';
import { glyphOf, colourOf } from '../orb/shared.js';
import { HOLD_MS } from '../orb/keys.js';
import { ACTS, svgIcon, initial, SECTIONS, sectionsOpen, gridSlot, STATES, stateOf, stateGroups, noteThread, noteRouteIntoActions, gaugeInto, stateIcon } from './parts.js';
import { homeApps, appKeys } from './home.js';

export const SIDE = 288, RAIL = 52, DOCKED_FROM = 900;
/** Round 8 (Miguel, 2 Nov 2026): the apps' own sidebar on the RIGHT, mirroring the chats' on the left; folds to a rail. */
export const APPS_SIDE = 232;
/** Round 9 (Miguel, 2 Nov 2026): every panel resizable by drag, within these limits (px); the middle always keeps
 * MIDDLE px (the orb's room). */
export const SIZE_LIMITS = { side: [220, 440], apps: [180, 360], panel: 340 }, MIDDLE = 200;
/** ⌥⇧\ folds / unfolds the apps' sidebar (⌥\ is the chats' sidebar: the same key, shifted, for its mirror). */
export const isAppsKey = e => !!e && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'Backslash';
/** Ctrl / ⌘ + Shift + S: ChatGPT's sidebar key (the shell's own keys are all ⌥, so it takes nothing of theirs). */
export const isSideKey = e => !!e && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.code === 'KeyS' || String(e.key).toLowerCase() === 's');

export default function desktop(api) {
  const doc = document, root = doc.documentElement;
  const el = (tag, cls, attrs = {}) => { const n = doc.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } return n; };
  const icon = (name, cls = 'aad-ico') => svgIcon(doc, name, cls);
  const desks = () => api.desks.list();
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
  // the rail (collapsed, round 7): ◫ · + · 🔍 · Working (a count) · every Ready chat, grouped by its stock status
  // (Needs you, Your call, FYI, Done…: a coloured count, then each chat's initial with its status colour) · Archive (a
  // count) … the cog
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

  /* ---------- round 8 (Miguel, 2 Nov 2026): the apps' sidebar on the RIGHT, the left sidebar's mirror ----------
   * An app switcher in the left sidebar's language: a header (◫ toward the middle, then Apps), rows of an icon and a name
   * (the open apps first, badged first; then the rest installed; then Get more = the App Store), its badge on the right.
   * Folds to a 52 px icon rail like the left (◫ or ⌥⇧\, kept on this device); narrower than 900 px it rests as the rail.
   * A click opens the app as the panel growing out of it toward the middle; the switcher stays in view, so switching
   * apps is one click. A right click offers it for the home screen (the Desks' own sheet); ⌥ + a free letter opens it. */
  const appsSide = el('nav', 'aad-apps', { 'aria-label': 'Apps', id: 'aad-apps' });
  const aHead = el('div', 'aad-ah');
  const aTog = el('button', 'aad-ib aad-atog', { type: 'button', 'aria-controls': 'aad-apps' }); aTog.append(icon('side', 'aad-ico aad-flip'));
  const aWord = el('h2', 'aad-aw', { text: 'Apps' });
  aHead.append(aTog, aWord);
  const aList = el('div', 'aad-alist', { role: 'list', 'aria-label': 'Apps' });
  appsSide.append(aHead, aList);

  const scene = el('div', 'aad');
  scene.append(back, shade, side, appsSide, top, orbBox, pLoad);
  api.mount(scene);

  // the + sheet in three levels and room under hosted apps for the floating orb, from the shared view chrome; the orb's
  // spot (its centre, its size) lets an app's own bottom tabs go either side of it
  const orbSpot = () => { const r = orbBox.getBoundingClientRect?.(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, d: orbBox.offsetWidth || r.width } : null; };
  const chrome = viewChrome(api, { openIds: () => desks().map(d => d.id), orb: orbSpot });

  /* ---------- the sidebar's width: open, the rail, or open over the page (narrow) ---------- */
  let folded = api.storage.get('folded') === true, peek = false;
  const narrow = () => (globalThis.innerWidth || 1440) < DOCKED_FROM;
  function paintSide(relayout = true) {
    const mode = narrow() ? (peek ? 'over' : 'rail') : folded ? 'rail' : 'open';
    const was = root.dataset.aadSide; root.dataset.aadSide = mode;
    const open = mode !== 'rail';
    togBtn.title = 'Close sidebar (Ctrl+Shift+S)';
    togBtn.setAttribute('aria-expanded', String(open)); rTog.setAttribute('aria-expanded', String(open));
    rTog.title = 'Open sidebar (Ctrl+Shift+S)';
    if (open) paintList(); else paintRail();
    applySizes();
    // the desks' windows are laid out in pixels: lay them out again for the new width
    if (relayout && was !== mode && (was === 'open') !== (mode === 'open')) { globalThis.dispatchEvent?.(new Event('resize')); api.after(260, () => syncOrb()); }
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
  const unpeek = () => { if (!peek) return; peek = false; offPeek?.(); offPeek = null; paintSide(); };
  api.listen(togBtn, 'click', toggleSide); api.listen(rTog, 'click', toggleSide);
  api.listen(shade, 'click', unpeek);
  api.listen(globalThis, 'resize', () => { if (!narrow() && peek) { peek = false; offPeek?.(); offPeek = null; } const want = narrow() ? (peek ? 'over' : 'rail') : folded ? 'rail' : 'open'; if (want !== root.dataset.aadSide) paintSide(); });
  api.keys.on({ down: e => { if (!isSideKey(e) || e.repeat) return false; toggleSide(); return true; } });
  // the apps' sidebar: open or the rail (kept on this device; the rail below 900 px)
  let appsFolded = api.storage.get('appsFolded') === true;
  function paintAppsSide(relayout = true) {
    const mode = narrow() || appsFolded ? 'rail' : 'open', was = root.dataset.aadApps;
    root.dataset.aadApps = mode;
    const open = mode === 'open';
    aTog.setAttribute('aria-expanded', String(open));
    aTog.title = open ? 'Fold the apps (⌥⇧\\)' : 'Show the apps (⌥⇧\\)';
    aTog.setAttribute('aria-label', open ? 'Fold the apps sidebar' : 'Open the apps sidebar');
    paintApps(true); applySizes();
    if (relayout && was && was !== mode) { globalThis.dispatchEvent?.(new Event('resize')); api.after(260, () => syncOrb()); }
  }
  function toggleApps() { if (narrow()) return; appsFolded = !appsFolded; api.storage.set('appsFolded', appsFolded); paintAppsSide(); }
  api.listen(aTog, 'click', toggleApps);
  api.listen(globalThis, 'resize', () => { const m = narrow() || appsFolded ? 'rail' : 'open'; if (m !== root.dataset.aadApps) paintAppsSide(); });

  /* ---------- round 9 (Miguel, 2 Nov 2026): every panel resizable by drag ----------
   * The Orb desktop's grips (layouts/orb/layout.js, its resizable panels), on the four panels here: the chats' sidebar,
   * the docked chat column, the app panel and the apps' sidebar. A thin separator on each panel's inner edge (a hairline
   * in the accent on hover); drag it, or ←/→ (⇧ for bigger steps) with it focused; a double click or Enter goes back to
   * the default. Kept per device. Limits keep each panel readable and always leave the middle its room for the orb. */
  let sized = { ...(api.storage.get('widths') || {}) }, sizing = '', laidOut = '';
  const GRIP_NAMES = { side: 'Resize the chats sidebar', chat: 'Resize the chat', app: 'Resize the app panel', apps: 'Resize the apps sidebar' };
  const SIZE_VARS = { side: '--aad-side-w', chat: '--aad-chat-px', app: '--aad-app-px', apps: '--aad-rs-w' };
  const vw = () => globalThis.innerWidth || 1440;
  const clampTo = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), Math.max(lo, hi)));
  /** each panel's width now (the owner's, else the default) within its limits: [now, lo, hi] */
  function sizes() {
    const W = vw(), out = {};
    out.side = [clampTo(sized.side ?? SIDE, SIZE_LIMITS.side[0], Math.min(SIZE_LIMITS.side[1], W * .32)), SIZE_LIMITS.side[0], Math.round(Math.min(SIZE_LIMITS.side[1], W * .32))];
    out.apps = [clampTo(sized.apps ?? APPS_SIDE, SIZE_LIMITS.apps[0], Math.min(SIZE_LIMITS.apps[1], W * .26)), SIZE_LIMITS.apps[0], Math.round(Math.min(SIZE_LIMITS.apps[1], W * .26))];
    const main = W - (root.dataset.aadSide === 'open' ? out.side[0] : RAIL) - (root.dataset.aadApps === 'open' ? out.apps[0] : RAIL);
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
  function applySizes() {
    const s = sizes();
    for (const id of Object.keys(SIZE_VARS)) {
      root.style.setProperty(SIZE_VARS[id], s[id][0] + 'px');
      const g = grip[id]; if (!g) continue;
      g.setAttribute('aria-valuenow', String(s[id][0])); g.setAttribute('aria-valuemin', String(s[id][1])); g.setAttribute('aria-valuemax', String(Math.round(s[id][2])));
    }
    // the desks' windows are laid out in pixels: again when a width changed (once a frame while dragging)
    const sig = Object.keys(SIZE_VARS).map(id => s[id][0]).join(',');
    if (sig !== laidOut) { laidOut = sig; relayoutSoon(); }
  }
  let relayoutAsked = false;
  function relayoutSoon() { if (relayoutAsked) return; relayoutAsked = true; api.frame(() => { relayoutAsked = false; globalThis.dispatchEvent?.(new Event('resize')); syncOrb(); }); }
  function setSize(id, w, keep) {
    sized = { ...sized, [id]: Math.round(w) }; applySizes();
    // what shows is what is kept (the panel that gave way too, so it never springs back over the middle)
    const now = sizes(); sized = { ...sized, [id]: now[id][0] };
    if (docked && pane && (id === 'chat' || id === 'app')) sized = { ...sized, chat: now.chat[0], app: now.app[0] };
    if (keep) api.storage.set('widths', sized);
  }
  function resetSize(id) { const { [id]: _, ...rest } = sized; sized = rest; api.storage.set('widths', sized); applySizes(); }
  const grips = el('div', 'aad-grips');
  const grip = {};
  for (const id of ['side', 'chat', 'app', 'apps']) {
    const g = el('div', 'aad-grip', { role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', 'aria-label': GRIP_NAMES[id], title: GRIP_NAMES[id] + ' · double-click: back to default', 'data-grip': id });
    grips.append(g); grip[id] = g;
    // the left two grow to the right, the right two to the left
    const sign = id === 'side' || id === 'chat' ? 1 : -1;
    let drag = null;
    api.listen(g, 'pointerdown', e => {
      if (e.button) return; e.preventDefault();
      try { g.setPointerCapture(e.pointerId); } catch (_) {}
      drag = { x: e.clientX, w: sizes()[id][0] }; sizing = id; g.classList.add('is-drag'); root.dataset.aadResizing = id;
    });
    api.listen(g, 'pointermove', e => { if (drag) setSize(id, drag.w + (e.clientX - drag.x) * sign, false); });
    const end = () => { if (!drag) return; drag = null; sizing = ''; g.classList.remove('is-drag'); delete root.dataset.aadResizing; api.storage.set('widths', sized); relayoutSoon(); };
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
  const goApp = id => { unpeek(); want = id; loading(id); const d = desks().find(x => x.id === id); if (d) api.nav.goDesk(d.desk); else api.apps.openDesk(id); };
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

  /* ---------- the apps' sidebar (round 8): the switcher's rows ---------- */
  const lists = () => homeApps(api.apps.list(), desks(), api.apps.kinds?.(), lit);
  let letters = {};
  function lettersFor(l = lists()) {
    const saved = api.storage.get('appKeys');
    letters = appKeys([...l.open, ...l.rest], saved && typeof saved === 'object' ? saved : {});
    if (JSON.stringify(letters) !== JSON.stringify(saved || {})) api.storage.set('appKeys', letters);
    return letters;
  }
  const appFor = k => { const ks = lettersFor(); return Object.keys(ks).find(id => ks[id] === k) || null; };
  const canPin = id => !!api.apps.homeScreen?.can?.(id);
  function appRow(a, open) {
    const cur = a.id === (pane?.id || here().app);
    const b = el('button', 'aad-ai' + (open ? ' is-open' : ''), { type: 'button', role: 'listitem', 'data-app': a.id, title: a.name, ...(cur ? { 'aria-current': 'page' } : {}) });
    const ic = el('span', 'aad-gt'), n = el('b', 'aad-abadge', { 'data-badge': a.id, 'aria-hidden': 'true', text: badgeText(a.id) }); n.hidden = !n.textContent;
    ic.append(appTile(a.id, 'aad-tile is-s'));
    b.append(ic, el('span', 'aad-an', { text: a.name }), n);
    b.setAttribute('aria-label', a.name + (n.textContent ? `, ${n.textContent} new` : '') + (cur ? ', open in the panel' : open ? ', open' : ''));
    api.listen(b, 'click', () => goApp(a.id));
    // a right click offers it for the home screen through the Desks' own sheet (apps it would not offer keep the menu)
    api.listen(b, 'contextmenu', e => { if (!canPin(a.id)) return; e.preventDefault?.(); api.apps.homeScreen.offer(a.id); });
    return b;
  }
  function moreRow() {
    const b = el('button', 'aad-ai aad-amore', { type: 'button', role: 'listitem', 'aria-label': 'Get more apps', title: 'Get more apps' });
    const ic = el('span', 'aad-gt'), t = el('span', 'aad-tile is-s is-plain', { 'aria-hidden': 'true' }); t.append(icon('plus')); ic.append(t);
    b.append(ic, el('span', 'aad-an', { text: 'Get more', 'aria-hidden': 'true' }));
    api.listen(b, 'click', () => api.apps.openDesk('app-store'));
    return b;
  }
  let appsDrawn = '';
  function paintApps(force = false) {
    const l = lists(), cur = pane?.id || here().app, mode = root.dataset.aadApps || '';
    const sig = JSON.stringify([mode, cur, l.open.map(a => a.id + badgeText(a.id)), l.rest.map(a => a.id + badgeText(a.id))]);
    if (!force && sig === appsDrawn && aList.childElementCount) return;
    appsDrawn = sig;
    const out = [];
    if (l.open.length) out.push(el('h3', 'aad-lab aad-alab', { text: 'Open' }), ...l.open.map(a => appRow(a, true)));
    if (l.rest.length) out.push(el('h3', 'aad-lab aad-alab', { text: 'Installed' }), ...l.rest.map(a => appRow(a, false)));
    out.push(moreRow());
    aList.replaceChildren(...out);
    const lit0 = l.open.filter(a => lit(a.id)).length;
    aTog.classList.toggle('has-new', !!lit0 && mode === 'rail');
  }
  /** The app rows on screen with their letters (for the hold-⌥ hints). */
  function appChips() {
    const ks = lettersFor();
    return [...aList.querySelectorAll('.aad-ai[data-app]')].filter(b => ks[b.dataset.app] && shown(b)).map(b => ({ el: b.querySelector('.aad-gt'), key: ks[b.dataset.app], at: 'inside' }));
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
      secOpen, ['working', 'ready', 'archive'].map(k => (s[k] || []).map(r => [r.id, r.title, r.unread, r.pinned, (r.actions || []).join()]))]);
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
        const rows = s[k] || [], on = !!secOpen[k];
        const hd = el('button', 'aad-lab aad-sec', { type: 'button', 'data-sec': k, 'aria-expanded': String(on), 'aria-controls': 'aad-sec-' + k });
        hd.append(el('span', '', { text: word0 }), icon('down', 'aad-ico aad-sec-c'));
        // folded (round 7): a minimal tally after the chevron: Working its count with a tiny spinner, Ready its count
        if (!on && k !== 'archive' && rows.length) { hd.append(el('span', 'aad-tally', { 'data-n': String(rows.length), 'aria-hidden': 'true' })); hd.setAttribute('aria-label', `${word0}, ${rows.length}, folded`); }
        api.listen(hd, 'click', () => { secOpen[k] = !secOpen[k]; api.storage.set('sections', { ...secOpen }); paintList(true); });
        const body = el('div', 'aad-sec-b', { id: 'aad-sec-' + k, role: 'group', 'aria-label': word0 }); body.hidden = !on;
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
  /* The rail (round 7, Miguel: the folded sidebar must still be useful): Working as a count with a tiny spinner; every
   * Ready chat as a small clickable initial carrying its stock status colour (a dot for new), grouped by status under a
   * coloured count (Needs you · Your call · FYI · Done…), the title and status in its tooltip; Archive as a count. The
   * counts open the sidebar on that section. */
  const STATE_WORD = Object.fromEntries(STATES);
  function openSection(k) {
    secOpen[k] = true; api.storage.set('sections', { ...secOpen });
    if (narrow()) { if (!peek) { peek = true; offPeek = api.back.push(() => { peek = false; offPeek = null; paintSide(); }); } }
    else { folded = false; api.storage.set('folded', false); }
    paintSide(); paintList(true);
  }
  function railCount(k, n, word0, ico) {
    const b = el('button', 'aad-rk', { type: 'button', role: 'listitem', 'data-k': k, title: `${n} ${word0}`, 'aria-label': `${word0}: ${n}. Open the sidebar there` });
    b.append(ico, el('b', '', { text: n > 99 ? '99+' : String(n) }));
    api.listen(b, 'click', () => openSection(k));
    return b;
  }
  function paintRail(force = false) {
    if (root.dataset.aadSide !== 'rail') return;
    const s = sessions || readSessions(), h = here(), ready = s.ready || [], groups = stateGroups(ready);
    const sig = JSON.stringify([h.thread, (s.working || []).length, (s.archive || []).length, ready.map(r => [r.id, r.title, r.unread, stateOf(r)])]);
    if (!force && sig === railDrawn && rList.childElementCount) return;
    railDrawn = sig;
    const out = [];
    if ((s.working || []).length) out.push(railCount('working', s.working.length, 'working', el('i', 'aad-rspin', { 'aria-hidden': 'true' })));
    for (const g of groups) {
      out.push(el('span', 'aad-rg', { 'data-state': g.state, 'data-n': String(g.rows.length), title: `${g.rows.length} · ${g.word}`, 'aria-label': `${g.word}: ${g.rows.length}` }));
      for (const r of g.rows) {
        const b = el('button', 'aad-rc' + (r.id === h.thread ? ' is-cur' : ''), { type: 'button', role: 'listitem', 'data-sid': r.id, 'data-state': g.state, title: `${r.title} · ${STATE_WORD[g.state]}${r.unread ? ' · new' : ''}`,
          'aria-label': `${r.note ? 'Notification: ' : ''}${r.title}, ${STATE_WORD[g.state]}${r.unread ? ', new' : ''}`, ...(r.id === h.thread ? { 'aria-current': 'page' } : {}) });
        // round 8: its stock status icon (never a first letter); a notification keeps its bell
        b.append(r.note ? icon('bell', 'aad-ico aad-rc-i') : stateIcon(doc, g.state, 'aad-rc-i aad-sti'));
        b.append(el('i', 'aad-rc-m' + (r.unread ? ' is-new' : ''), { 'aria-hidden': 'true' }));
        api.listen(b, 'click', () => { noteWant = !!r.note; api.sessions.open(r.id); });
        out.push(b);
      }
    }
    if (!ready.length && !(s.working || []).length) out.push(el('span', 'aad-rnone', { title: 'Nothing ready', 'aria-label': 'Nothing ready' }));
    if ((s.archive || []).length) out.push(railCount('archive', s.archive.length, 'archived', icon('done', 'aad-ico aad-rk-i')));
    rList.replaceChildren(...out);
  }
  let fuelSig = '';
  const paintFuel = () => { fuelSig = gaugeInto(doc, fuel, fuelSig, () => { unpeek(); api.desk.settings('ai'); }); };
  function paintBadges() {
    paintApps(); paintFuel();
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
    const c = [...doc.querySelectorAll('.win .dchats .pane-main .ch-compose')].find(n => n.getClientRects().length && n.getBoundingClientRect().width > 0);
    const row = c?.querySelector('.ch-row2');
    return row ? gridSlot(row, 3) : null;
  }
  // (round 8: placed afresh each time: the orb's own spot moves too, sliding when the chat column or a sidebar changes,
  // while the slot can stay put; a same-slot call would keep a move measured mid-slide)
  const placeOrb = () => { chrome.orbIn(null); chrome.orbIn(orbSlot()); };
  const syncOrb = () => api.frame(() => { placeOrb(); watchComposer(); });
  /* round 8: the composer moves without a resize of the page (the Chats window laid out again after the sidebars settle,
   * the model chip filled in late): follow its box and its window's, so the orb never sits on the chip */
  let roSeen = null; const ro = globalThis.ResizeObserver ? new ResizeObserver(() => api.frame(placeOrb)) : null;
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
    if (pane && chat) root.dataset.aadSplit = 'on'; else delete root.dataset.aadSplit;
    if (docked) root.dataset.aadChat = 'on'; else delete root.dataset.aadChat;
    if (docked && !wasDocked) anim('dock');
    applySizes();
    // the windows are laid out in pixels and the app's bottom bar around the orb: again for the new widths
    if (was !== `${!!root.dataset.aadSplit}${docked}`) api.frame(() => globalThis.dispatchEvent?.(new Event('resize')));
    pTop.hidden = !pane; cX.hidden = !docked;
    if (pane) { pName.textContent = appName(pane.id); pIcon.replaceChildren(appTile(pane.id, 'aad-tile is-xs')); pX.setAttribute('aria-label', `Close ${appName(pane.id)} (Esc)`); }
    paintTools();
    if (loadId && (!want || want !== loadId) && (!pane || pane.id !== loadId)) { if (!want) doneLoading(); }
    else if (loadId && pane?.id === loadId) waitLoaded(pane.el);
  }
  // the panel goes (the app keeps running on its desk); the chat takes the room back and the keyboard
  function closeSide() {
    if (!pane) return false;
    const was = pane; pane = null; setWide(false); doneLoading(); anim('close');
    if (here().app === was.id) api.sessions.chats(); else paintSplit(!!chatThread);
    paintTop(); return true;
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
    if (wide) root.dataset.aadWide = ''; else delete root.dataset.aadWide;
    paintWide();
    api.after(260, () => globalThis.dispatchEvent?.(new Event('resize')));
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
  function anim(kind) { animOff?.(); root.dataset.aadAnim = kind; animOff = api.after(320, () => { delete root.dataset.aadAnim; animOff = null; }); }
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
    if (isAppsKey(e)) { if (!e.repeat) toggleApps(); return true; }
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
    put(aTog, '⇧\\', root.dataset.aadApps === 'open' ? 'Fold apps' : 'Apps', 'below');
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
    paintApps();
    syncOrb();
  }
  api.on('route', r => { onRoute(r); api.after(260, syncOrb); });
  api.on('render', () => { readSessions(); paintTop(); });
  api.on('home', () => soon(() => { if (api.route().home) api.sessions.newChat(); }));
  // Settings opens as the centred panel over the page (Claude's settings modal), never as a window beside the chat
  root.dataset.settingsOver = '';
  readSessions(); paintSide(false); paintAppsSide(false); paintTop(); paintBadges();
  globalThis.dispatchEvent?.(new Event('resize'));
  if (api.route().home) soon(() => api.sessions.newChat());
  // the composer settles once both sidebars and the stylesheet are in: the orb's slot in it again then
  api.listen(css, 'load', () => api.after(260, () => syncOrb()));

  return () => {
    closeMenu(); closeWs(); offSearch?.(); offPeek?.(); doneLoading(); ro?.disconnect();
    scene.remove(); chrome.dispose(); unmountCss(); css.remove();
    toolsMo?.disconnect();
    for (const k of ['aiApps', 'aiFront', 'aadSide', 'aadApps', 'aadNew', 'aadVoice', 'settingsOver', 'aadSplit', 'aadAnim', 'aadChat', 'aadWide', 'aadLoading']) delete root.dataset[k];
    for (const w of wsps()) delete w.dataset.aadRole;
    delete root.dataset.aadResizing; for (const v of Object.values(SIZE_VARS)) root.style.removeProperty(v);
    globalThis.dispatchEvent?.(new Event('resize'));
  };
}
