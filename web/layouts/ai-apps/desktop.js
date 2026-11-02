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
 * Everything through the layout API; no timers of its own beyond api.after, no innerHTML, no storage of its own
 * beyond api.storage. Colours are skin tokens (desktop.css). */
import { viewChrome, openApps, realApps, matches, CHATS, MIC } from '../apps/chrome.js';
import { glyphOf, colourOf } from '../orb/shared.js';
import { HOLD_MS } from '../orb/keys.js';
import { ACTS, svgIcon, initial, SECTIONS, sectionsOpen, gridSlot } from './parts.js';
import { homeView } from './home.js';

export const SIDE = 288, RAIL = 52, DOCKED_FROM = 900;
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
  const word = el('button', 'aad-word', { type: 'button', title: 'Home' });
  const findBtn = el('button', 'aad-ib aad-find', { type: 'button', 'aria-label': 'Search chats and apps', title: 'Search' }); findBtn.append(icon('search'));
  const togBtn = el('button', 'aad-ib aad-tog', { type: 'button', 'aria-controls': 'aad-side' }); togBtn.append(icon('side'));
  // the Ready count (round 5): on the sidebar's ◫ and on the rail's, like the phone's ☰
  const togCount = el('b', 'aad-count', { 'aria-hidden': 'true' }); togCount.hidden = true; togBtn.append(togCount);
  const searchBox = el('label', 'aad-search'); searchBox.hidden = true;
  const field = el('input', 'aad-q', { type: 'search', placeholder: 'Search chats and apps', 'aria-label': 'Search chats and apps', autocomplete: 'off' });
  searchBox.append(icon('search', 'aad-ico aad-search-i'), field);
  const cancelBtn = el('button', 'aad-cancel', { type: 'button', text: 'Cancel' }); cancelBtn.hidden = true;
  head.append(word, findBtn, searchBox, cancelBtn, togBtn);
  const scroll = el('div', 'aad-scroll');
  const foot = el('div', 'aad-foot');
  const newBtn = el('button', 'aad-new', { type: 'button', 'aria-label': 'New chat', title: 'New chat' }); newBtn.append(icon('plus'));
  const setBtn = el('button', 'aad-set', { type: 'button', 'aria-label': 'Settings', title: 'Settings' }); setBtn.append(icon('cog'));
  foot.append(newBtn, setBtn);
  // the rail (collapsed): ◫ · + · 🔍 · the open apps · All apps … the cog
  const rail = el('div', 'aad-rail');
  const rTog = el('button', 'aad-ib aad-rtog', { type: 'button', 'aria-label': 'Open sidebar', title: 'Open sidebar' }); rTog.append(icon('side'));
  const rCount = el('b', 'aad-count', { 'aria-hidden': 'true' }); rCount.hidden = true; rTog.append(rCount);
  const rNew = el('button', 'aad-ib aad-rnew', { type: 'button', 'aria-label': 'New chat', title: 'New chat' }); rNew.append(icon('plus'));
  const rFind = el('button', 'aad-ib aad-rfind', { type: 'button', 'aria-label': 'Search chats and apps', title: 'Search' }); rFind.append(icon('search'));
  const rApps = el('div', 'aad-rapps', { role: 'list', 'aria-label': 'Open apps' });
  const rSet = el('button', 'aad-ib aad-rset', { type: 'button', 'aria-label': 'Settings', title: 'Settings' }); rSet.append(icon('cog'));
  rail.append(rTog, rNew, rFind, el('span', 'aad-rgap'), rSet);   // (no apps: they live on Home)
  // round 7: the AI fuel gauge sits at the top of the sidebar, under its header (the stock bar is placed over this row)
  const fuel = el('div', 'aad-fuel', { 'aria-hidden': 'true' });
  const panel = el('div', 'aad-panel'); panel.append(head, fuel, scroll, foot);
  side.id = 'aad-side'; side.append(panel, rail);
  const shade = el('div', 'aad-shade', { 'aria-hidden': 'true' });

  /* ---------- the top row of the main area: what is in front · the workspace switcher ---------- */
  const top = el('header', 'aad-top');
  // (round 7, Miguel: no home button in the top row, to save room: Home = the Wizard's name in the sidebar, +, ⌥`)
  const tt = el('b', 'aad-tt');
  const wsBtn = el('button', 'aad-ws', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const wsDisc = el('span', 'aad-wsd', { 'aria-hidden': 'true' }), wsName = el('span', 'aad-wsn');
  wsBtn.append(wsDisc, wsName, icon('down', 'aad-ico aad-wsc'));
  // the app panel's own title over it, at the top row's right (round 7): its icon and name, and ✕ (Esc) to close it
  const pTop = el('div', 'aad-ptop'); pTop.hidden = true;
  const pIcon = el('span', 'aad-pti'), pName = el('b', 'aad-ptn');
  const pX = el('button', 'aad-ib aad-px', { type: 'button', 'aria-label': 'Close the app panel (Esc)', title: 'Close (Esc)' }); pX.append(icon('x'));
  pTop.append(pIcon, pName, pX);
  top.append(tt, wsBtn, pTop);

  /* ---------- the orb: bottom centre of the main area, always (Home, a chat, an app): the one way to talk ---------- */
  const orbBox = el('div', 'aad-orb');
  const cv = el('canvas', 'aad-orbc', { width: '128', height: '128', 'aria-hidden': 'true' });
  const fb = el('img', 'aad-orbfb', { alt: '', src: 'robert-thread-orb.png', draggable: 'false' }); fb.hidden = true;
  const orbBtn = el('button', 'aad-orbbtn', { type: 'button', 'aria-label': 'Wizard orb (the microphone). Click to talk, hold for a command, drag up for a new chat to type in.' });
  // round 6: the orb IS the microphone, so it wears a small one (in the composer, where the mic was, and on its own spot)
  const micG = el('span', 'aad-mic', { 'aria-hidden': 'true' }); micG.append(svgIcon(doc, 'mic', 'aad-mic-i'));
  orbBox.append(cv, fb, micG, orbBtn);

  const scene = el('div', 'aad');
  scene.append(shade, side, top, orbBox);
  api.mount(scene);
  /* Home: the apps above the composer (Grid, or the Orb scene), home.js; an app opens as the panel on the right */
  const homeEl = homeView(api, { goApp: id => goApp(id), getMore: () => api.apps.openDesk('app-store'), lit: id => lit(id), badgeText: id => badgeText(id), desks });
  scene.append(homeEl.el);

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
    // the desks' windows are laid out in pixels: lay them out again for the new width
    if (relayout && was !== mode && (was === 'open') !== (mode === 'open')) globalThis.dispatchEvent?.(new Event('resize'));
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

  /* ---------- search (a field over the same lists, as on the phone) ---------- */
  let q = '';
  function setSearch(on) {
    if (on && root.dataset.aadSide === 'rail') { if (narrow()) { peek = true; offPeek = api.back.push(() => { peek = false; offPeek = null; paintSide(); }); } else { folded = false; api.storage.set('folded', false); } paintSide(); }
    searchBox.hidden = cancelBtn.hidden = !on; word.hidden = findBtn.hidden = on;
    if (!on) { q = ''; field.value = ''; offSearch?.(); offSearch = null; } else if (!offSearch) offSearch = api.back.push(() => { offSearch = null; setSearch(false); });
    paintList(true);
    if (on) field.focus?.({ preventScroll: true });
  }
  let offSearch = null;
  api.listen(findBtn, 'click', () => setSearch(true)); api.listen(rFind, 'click', () => setSearch(true));
  api.listen(cancelBtn, 'click', () => setSearch(false));
  api.listen(field, 'input', () => { q = field.value; paintList(); });
  api.listen(field, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); scroll.querySelector('button')?.click(); } });
  // Home (Miguel, 2 Nov 2026) = the empty new chat: the skin's background, the composer and the orb, no greeting. The
  // Wizard's name (sidebar header, or the top row while the sidebar is the rail) and + both go there, from anywhere.
  const newChat = () => { unpeek(); if (q) setSearch(false); closeMenu(); closeWs(); api.sessions.newChat(); };
  api.listen(word, 'click', () => newChat());
  const settings = () => { unpeek(); api.desk.settings(); };
  api.listen(newBtn, 'click', newChat); api.listen(rNew, 'click', newChat);
  api.listen(setBtn, 'click', settings); api.listen(rSet, 'click', settings);
  // the cog's count (System notices set to Badge, …): WosBell.attention, as on the stock desktop's cog and the phone's gear
  const setCounts = [setBtn, rSet].map(b => { const c = el('b', 'aad-count aad-setn', { 'aria-hidden': 'true' }); c.hidden = true; b.append(c); return c; });
  const paintCog = at => {
    const n = at?.n | 0, t = !n ? '' : n > 99 ? '99+' : String(n);
    for (const c of setCounts) { c.textContent = t; c.hidden = !n; }
    for (const b of [setBtn, rSet]) b.setAttribute('aria-label', n ? `Settings, ${n} ${at.label}` : 'Settings');
  };
  paintCog(api.desk.attention?.(paintCog));

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
  const goApp = id => { unpeek(); want = id; const d = desks().find(x => x.id === id); if (d) api.nav.goDesk(d.desk); else api.apps.openDesk(id); };
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
    api.listen(b, 'click', () => { if (q) setSearch(false); unpeek(); api.sessions.open(s.id); });
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
    word.textContent = agentName();
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
  function paintRail(force = false) {
    const dk = desks(), list = litFirst(realApps(openApps(api.apps.list(), dk), api.apps.kinds?.())), h = here();
    const sig = JSON.stringify([h.app, pane?.id, list.map(a => a.id + (lit(a.id) ? '*' : ''))]);
    if (!force && sig === railDrawn && rApps.childElementCount) return;
    railDrawn = sig;
    const cells = list.map(a => {
      const b = el('button', 'aad-ri', { type: 'button', role: 'listitem', 'data-app': a.id, title: a.name, 'aria-label': a.name + (lit(a.id) ? `, ${badgeText(a.id)} new` : ''), ...(a.id === (pane?.id || h.app) ? { 'aria-current': 'page' } : {}) });
      b.append(appTile(a.id, 'aad-tile is-s'));
      if (lit(a.id)) b.append(el('i', 'aad-rdot', { 'aria-hidden': 'true' }));
      api.listen(b, 'click', () => goApp(a.id));
      return b;
    });
    rApps.replaceChildren(...cells, allCell('aad-ri aad-all'));
  }
  function paintBadges() {
    homeEl.paint();
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
    wsDisc.textContent = initial(own.name); wsName.textContent = own.name;
    wsBtn.setAttribute('aria-label', `Workspace: ${own.name}. Switch workspace`); wsBtn.title = `Workspace: ${own.name}`;
    // the stock bar's last pieces (the fuel gauge) stop short of the switcher
    api.frame(() => { const w = Math.round(wsBtn.offsetWidth || 0); if (w) root.style.setProperty?.('--aad-ws-w', w + 'px'); });
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
  api.listen(globalThis, 'wos:resources', paintWs);
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
  const syncOrb = () => api.frame(() => { chrome.orbIn(orbSlot()); homeRoom(); });
  // Home's apps end where the composer starts
  function homeRoom() {
    const c = [...doc.querySelectorAll('.win .dchats .pane-main .ch-compose')].find(n => n.getClientRects().length && n.getBoundingClientRect().width > 0);
    const H = globalThis.innerHeight || 0, t = c ? c.getBoundingClientRect().top : 0;
    if (H && t > 0) root.style.setProperty('--ah-bottom', Math.round(H - t + 8) + 'px');
  }
  api.listen(globalThis, 'resize', syncOrb);
  api.listen(orbBox, 'transitionend', syncOrb);
  api.listen(doc, 'input', e => { if (e.target?.closest?.('.ch-compose')) syncOrb(); }, true);
  api.listen(doc, 'focusin', syncOrb, true);
  /* ---------- round 7 (Miguel, 2 Nov 2026): an app opens as a panel on the RIGHT, the chat stays in the middle ----------
   * The Orb desktop's thirds: the sidebar (the list) on the left, the chat in the middle, the app in a panel about one
   * third wide on the right; a thread opened from the sidebar slides in from the left, next to the sidebar. Built on the
   * desks as they are: the app's desk and the Chats desk are both shown (desktop.css, data-aad-role on their desks),
   * so the app keeps running as it was; ✕ or Esc hides the panel (the app keeps running on its desk, as in the Orb
   * view) and the chat takes the room back. Short slide + fade (desktop.css), the open app lit in the sidebar grid. */
  const wsps = () => [...doc.querySelectorAll('#stage > .wsp')];
  function paintSplit() {
    const h = here();
    if (h.app && (want === h.app || !pane || pane.id !== h.app)) {
      // the app now in front becomes the panel (its desk is the one not hidden)
      const el0 = wsps().find(w => !w.hidden && !w.querySelector('.dchats'));
      if (el0) { const fresh = pane?.el !== el0; pane = { id: h.app, el: el0 }; if (fresh) anim('app'); }
      want = null;
    }
    if (pane && (!pane.el.isConnected || !desks().some(d => d.id === pane.id))) pane = null;
    const chat = pane ? wsps().find(w => w.querySelector('.dchats')) : null;
    for (const w of wsps()) { const r = w === pane?.el ? 'app' : w === chat ? 'chat' : ''; if ((w.dataset.aadRole || '') !== r) { if (r) w.dataset.aadRole = r; else delete w.dataset.aadRole; } }
    const was = !!root.dataset.aadSplit;
    if (pane && chat) root.dataset.aadSplit = 'on'; else delete root.dataset.aadSplit;
    // the windows are laid out in pixels and the app's bottom bar around the orb: again for the new widths
    if (was !== !!root.dataset.aadSplit) api.frame(() => globalThis.dispatchEvent?.(new Event('resize')));
    pTop.hidden = !pane;
    if (pane) { pName.textContent = appName(pane.id); pIcon.replaceChildren(appTile(pane.id, 'aad-tile is-xs')); pX.setAttribute('aria-label', `Close ${appName(pane.id)} (Esc)`); }
  }
  // the panel goes (the app keeps running on its desk); the chat takes the room back and the keyboard
  function closeSide() {
    if (!pane) return false;
    const was = pane; pane = null; anim('close');
    if (here().app === was.id) api.sessions.chats(); else paintSplit();
    paintTop(); return true;
  }
  let animOff = null;
  function anim(kind) { animOff?.(); root.dataset.aadAnim = kind; animOff = api.after(320, () => { delete root.dataset.aadAnim; animOff = null; }); }
  api.listen(pX, 'click', closeSide);
  api.keys.on({ down: e => { if (e.key !== 'Escape' || e.altKey || e.ctrlKey || e.metaKey || !pane || menu || wsPop || q) return false; closeSide(); return true; } });

  /* ---------- ⌥ keys (Miguel, 2 Nov 2026): every desktop ⌥ key keeps working; the hold-⌥ hints map onto this view ----------
   * The shell's own hold-⌥ overlay (desktop.js keyHints: bare letters on their targets while LEFT ⌥ is held, gone on
   * release) draws these too (api.keys.guide). This view adds: ⌥\ the sidebar (as the Orbs view's list; Ctrl / ⌘ ⇧ S
   * too), ⌥W / Esc close the app panel, ⌥H Home's Grid ⇄ Orb, ⌥ + a free letter a Home app (home.js appKeys). */
  api.keys.on({ down: e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return false;
    if (e.code === 'Backslash' && !e.shiftKey) { if (!e.repeat) toggleSide(); return true; }
    if (e.code === 'KeyW' && !e.shiftKey && pane) { if (!e.repeat) closeSide(); return true; }
    if (e.code === 'KeyH' && !e.shiftKey && root.dataset.aadHome != null) { if (!e.repeat) homeEl.toggleStyle(); return true; }
    const k = /^Key([A-Z])$/.exec(e.code || '')?.[1], id = k && !e.shiftKey && homeEl.appFor(k);
    if (id) { if (!e.repeat) goApp(id); return true; }
    return false;
  } });
  const shown = n => !!n && n.isConnected !== false && !n.closest?.('[hidden]') && (typeof n.getClientRects !== 'function' || n.getClientRects().length > 0);
  api.keys.guide(() => {
    const open = root.dataset.aadSide === 'open', out = [];
    const put = (n, key, word, at) => { if (shown(n)) out.push({ el: n, key, word, at }); };
    put(open ? word : null, '`', 'Home', 'inside');
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
    if (pane) put(pX, 'W', 'Close · Esc', 'below');
    if (root.dataset.aadHome != null) put(homeEl.switchEl, 'H', 'Grid ⇄ Orb', 'start');
    return out;
  });
  api.keys.guide(() => homeEl.chips());

  /* ---------- the main area: the chat (Home and the bare list become it), or an app ---------- */
  function here(r = api.route()) {
    const d = desks().find(x => x.desk === r.desk), id = r.home ? '' : d?.id || '';
    return { app: id && id !== CHATS && !(r.view === 'thread' || r.view === 'list') ? id : '', thread: r.thread && r.thread !== '__new__' ? r.thread : null, r };
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
    const h = here(r);
    paintSplit();
    // a thread picked slides in from the left, next to the sidebar
    if (h.thread !== lastThread) { if (h.thread && lastThread !== undefined) anim('thread'); lastThread = h.thread; }
    root.dataset.aiFront = r.home ? 'chat' : h.app ? 'app' : r.view === 'list' ? 'list' : 'chat';
    root.dataset.aadNew = String(r.view === 'thread' && r.thread === '__new__');
    // the workspace switcher only on Home (round 5): never over a chat or an app
    // (with the app panel in front, the chat beside it is as it was: Home stays Home, a chat stays that chat)
    if (!h.app) chatThread = h.thread;
    const atHome = h.app ? !!pane && pane.id === h.app && !chatThread : (r.home || (r.view === 'thread' && r.thread === '__new__'));
    const home = atHome && !pane;
    wsBtn.hidden = !home; if (!home) closeWs();
    if (atHome) root.dataset.aadHome = ''; else delete root.dataset.aadHome;
    homeEl.show(atHome);
    const t = h.app && !pane ? appName(h.app) : h.app ? (chatThread ? titleOf(chatThread) : '') : h.thread ? titleOf(h.thread) : '';
    tt.textContent = t; tt.title = t;
    const nm = agentName();
    word.setAttribute('aria-label', `${nm}: Home (a new chat)`);
    paintWs();
    if (root.dataset.aadSide === 'rail') paintRail(); else paintList();
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

  return () => {
    closeMenu(); closeWs(); offSearch?.(); offPeek?.();
    scene.remove(); chrome.dispose(); unmountCss(); css.remove();
    for (const k of ['aiApps', 'aiFront', 'aadSide', 'aadNew', 'aadVoice', 'settingsOver', 'aadSplit', 'aadAnim', 'aadHome']) delete root.dataset[k];
    root.style.removeProperty?.('--ah-bottom');
    for (const w of wsps()) delete w.dataset.aadRole;
    root.style.removeProperty?.('--aad-ws-w');
    globalThis.dispatchEvent?.(new Event('resize'));
  };
}
