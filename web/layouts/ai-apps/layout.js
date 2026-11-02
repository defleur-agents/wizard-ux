/* AI apps view (Miguel, 2 Nov 2026). Worn by the miguel/ai-apps tweak, off by default; one shell view at a time (Orb,
 * Apps, AI apps; all off = Desks). Phone only for now: on the desktop it does nothing (the stock desktop stays).
 *
 * Copies the layout the ChatGPT, Claude and Perplexity phone apps share (measured references:
 * ~/.hermes/cache/screenshots/ai-apps-ref/REPORT.md, "Recommended spec", Mobile), with Wizard's own pieces in it:
 *   - Top bar, always there (an app open too): ☰ on the left opens the drawer; the Wizard's name in the middle (what is
 *     in front, a thread's title or an app's name, under it); on the right the workspace switcher, in the slot where
 *     they put Temporary / Incognito (this Wizard, then the Wizards he manages; Manage = Settings › Your network).
 *   - Drawer from the left (☰, or a swipe from the left edge; a swipe right in a thread too, which keeps the chat
 *     under it and never also runs the thread swipe-back): the name and 🔍 (searches chats and apps), then where they list Projects / GPTs / Spaces
 *     a compact grid of EVERY open app (a small icon with its name under it, like ChatGPT's GPT grid; desk order, apps
 *     with a badge first as in the Orb view, the badge on the icon), ending in All apps = the three-level sheet (Open ·
 *     Installed · Get more, chrome.js); then Recents = the chats Working and Ready (a long press opens the row menu:
 *     Pin, Rename, Mark unread, Snooze, Archive / Restore, through Chats' own actions), View all = the stock Chats
 *     list. At the foot (round 2): New chat = a big round + where ChatGPT puts its compose button, Settings = a cog.
 *   - Main screen = the real Chats window, without its list (the list lives in the drawer): a New chat or the thread
 *     picked, with the real composer: + (attach) on the left, the model chip, the mic, and on the right one round
 *     button: Send when there are words, else the voice button (it hands the press to the dock orb, so tap talks and
 *     hold gives a command, exactly as in every view). A take shows the stock voice controls at the bottom.
 *   - An app = its desk, filling the screen under the same top bar, with the orb bar at the bottom: the dock orb in its
 *     one fixed spot, bottom centre, and the app's own tabs (if it has a bottom tab bar) split either side of it
 *     (chrome.js inset → skin-host's orb bar).
 * Shapes (round 2, measured on the native apps): round discs for the top-bar buttons, a 16 px end radius on the drawer,
 * 12 px row pills, 18 px menus, 28 px sheets, full pills for the composer, search and chips; icons as rounded squares.
 * Every list comes from the shell (open apps = desks, the same as the Apps view's icons and the Orb's satellites;
 * chats = Chats' own Working / Ready), so switching views loses nothing. Colours are skin tokens (layout.css). */
import { viewChrome, openApps, matches, CHATS } from '../apps/chrome.js';

const SVG = 'http://www.w3.org/2000/svg';
const ICON = {
  menu: ['M4 8.5h16', 'M4 15.5h10'],
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M15.5 15.5 20 20'],
  apps: ['M5 5h5v5H5z', 'M14 5h5v5h-5z', 'M5 14h5v5H5z', 'M14 14h5v5h-5z'],
  plus: ['M12 5v14', 'M5 12h14'],
  chev: ['m10 7 5 5-5 5'],
  pin: ['M9 4h6l-1 6 3 3H7l3-3-1-6z', 'M12 13v7'],
  rename: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  unread: ['M3.5 6.5h17v11h-17z', 'm4.5 7.5 7.5 5.5 7.5-5.5'],
  snooze: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 8v4.5l3 2'],
  done: ['M3.5 5h17v4h-17z', 'M5.5 9v9.5h13V9', 'M10 13h4'],
  restore: ['M4.5 12a7.5 7.5 0 1 0 2.2-5.3', 'M4.5 4.5v4h4'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  newchat: ['M12 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V12', 'M17.5 4.5l2 2L13 13l-3 1 1-3z'],
  // a cogwheel (the Lucide settings outline, ISC licence)
  cog: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
};
/* The row menu (long press on a chat), in the order they use (Pin, Rename, …, the filing action last), Wizard's words. */
const ACTS = [['pin', 'Pin'], ['rename', 'Rename'], ['unread', 'Mark unread'], ['snooze', 'Snooze'], ['restore', 'Restore'], ['done', 'Archive']];
const LONG_PRESS = 450;     // ms, a still press on a chat row opens its menu
const EDGE = 24;            // px from the left edge where a swipe opens the drawer

export default function setup(api) {
  if (api.env.shell !== 'phone') return () => {};
  const doc = document, root = doc.documentElement;
  const el = (tag, cls, attrs = {}) => { const n = doc.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } return n; };
  const icon = (name, cls = 'aa-ico') => {
    const s = doc.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls);
    for (const d of ICON[name] || []) { const p = doc.createElementNS(SVG, 'path'); p.setAttribute('d', d); s.append(p); }
    return s;
  };
  const initial = n => (String(n || '').trim()[0] || 'W').toUpperCase();
  const desks = () => (api.desks?.list || api.phone.desks)();
  root.dataset.aiApps = 'on';

  // the + sheet in three levels, the dock without its desk switcher, the orb's swipes (up = Home, here the chat) and
  // room under every hosted app for the floating orb: the Orb and Apps views' own chrome, so all three agree
  const chrome = viewChrome(api, { openIds: () => desks().map(d => d.id) });

  /* ---------- data ---------- */
  let sessions = null, badgeMap = api.apps.badges(m => { badgeMap = m; paintBadges(); });
  const agentName = () => (api.agents.list().find(a => a.main) || {}).label || (api.workspaces?.list()[0] || {}).name || 'Wizard';
  const readSessions = () => { sessions = api.sessions.list() || { working: [], ready: [], archive: [] }; return sessions; };
  const titleOf = id => { const s = sessions || readSessions(); for (const k of ['working', 'ready', 'archive']) { const r = (s[k] || []).find(x => x.id === id); if (r) return r.title; } return ''; };
  const appName = id => (api.apps.list().find(a => a.id === id) || desks().find(d => d.id === id) || {}).name || '';

  /* ---------- the top bar ---------- */
  const top = el('header', 'aa-top');
  const menuBtn = el('button', 'aa-tb aa-menu', { type: 'button', 'aria-label': 'Open menu', 'aria-expanded': 'false', 'aria-controls': 'aa-drawer' });
  const menuDot = el('i', 'aa-dot', { 'aria-hidden': 'true' }); menuDot.hidden = true;
  menuBtn.append(icon('menu'), menuDot);
  const mid = el('div', 'aa-mid'), nameEl = el('b', 'aa-name'), subEl = el('small', 'aa-sub');
  mid.append(nameEl, subEl);
  const wsBtn = el('button', 'aa-tb aa-ws', { type: 'button', 'aria-haspopup': 'dialog' });
  const wsDisc = el('span', 'aa-ws-i', { 'aria-hidden': 'true' }); wsBtn.append(wsDisc);
  top.append(menuBtn, mid, wsBtn);
  api.mount(top);

  /* ---------- the drawer ---------- */
  const layer = el('div', 'aa-layer'); layer.hidden = true;
  const scrim = el('div', 'aa-scrim', { 'aria-hidden': 'true' });
  const drawer = el('nav', 'aa-drawer', { id: 'aa-drawer', 'aria-label': 'Menu' });
  const head = el('div', 'aa-dh');
  const word = el('b', 'aa-word');
  const findBtn = el('button', 'aa-tb aa-find', { type: 'button', 'aria-label': 'Search chats and apps' }); findBtn.append(icon('search'));
  const searchBox = el('label', 'aa-search'); searchBox.hidden = true;
  const field = el('input', 'aa-q', { type: 'search', placeholder: 'Search chats and apps', 'aria-label': 'Search chats and apps', autocomplete: 'off', enterkeyhint: 'search' });
  searchBox.append(icon('search', 'aa-ico aa-search-i'), field);
  const cancelBtn = el('button', 'aa-cancel', { type: 'button', text: 'Cancel' }); cancelBtn.hidden = true;
  head.append(word, findBtn, searchBox, cancelBtn);
  const scroll = el('div', 'aa-scroll');
  // the foot: New chat = a big round + (ChatGPT's compose spot, bottom left), Settings = a cog (bottom right); icons only
  const foot = el('div', 'aa-foot');
  const newBtn = el('button', 'aa-new', { type: 'button', 'aria-label': 'New chat', title: 'New chat' }); newBtn.append(icon('plus'));
  const setBtn = el('button', 'aa-set', { type: 'button', 'aria-label': 'Settings', title: 'Settings' }); setBtn.append(icon('cog'));
  foot.append(newBtn, setBtn);
  drawer.append(head, scroll, foot);
  layer.append(scrim, drawer);
  api.mount(layer);

  let open = false, offBack = null, q = '', listWanted = false;   // listWanted: View all asked for the stock list
  function openDrawer() {
    if (open) return; open = true; closeMenu();
    readSessions(); paintDrawer(true);
    layer.hidden = false; layer.classList.remove('is-drag'); drawer.style.removeProperty('transform'); scrim.style.removeProperty('opacity');
    api.frame(() => layer.classList.add('is-open'));
    root.dataset.aaDrawer = 'open'; menuBtn.setAttribute('aria-expanded', 'true');
    offBack = api.back.push(closeDrawer);
  }
  function closeDrawer() {
    if (!open) return; open = false; closeMenu();
    offBack?.(); offBack = null;
    layer.classList.remove('is-open', 'is-drag'); drawer.style.removeProperty('transform'); scrim.style.removeProperty('opacity');
    delete root.dataset.aaDrawer; menuBtn.setAttribute('aria-expanded', 'false');
    if (q) setSearch(false);
    api.after(220, () => { if (!open) layer.hidden = true; });
  }
  function setSearch(on) {
    searchBox.hidden = cancelBtn.hidden = !on; word.hidden = findBtn.hidden = on;
    if (!on) { q = ''; field.value = ''; }
    paintDrawer();
    if (on) field.focus?.({ preventScroll: true });
  }
  api.listen(menuBtn, 'click', () => (open ? closeDrawer() : openDrawer()));
  api.listen(scrim, 'click', closeDrawer);
  api.listen(findBtn, 'click', () => setSearch(true));
  api.listen(cancelBtn, 'click', () => setSearch(false));
  api.listen(field, 'input', () => { q = field.value; paintDrawer(); });
  api.listen(newBtn, 'click', () => { closeDrawer(); api.sessions.newChat(); });
  api.listen(setBtn, 'click', () => { closeDrawer(); api.desk.settings(); });

  /* rows: an app (its logo, else the dock's own mark for it), a chat (Working spinner / Ready dot, title, pin) */
  function appTile(id) {
    const t = el('span', 'aa-tile', { 'aria-hidden': 'true' });
    const mark = api.phone.mark(id);
    if (mark) { mark.querySelector?.('.dbg')?.remove(); mark.classList?.add('aa-mark'); t.append(mark); }
    api.apps.logo(id).then(url => {
      if (!url || !t.isConnected) return;
      const im = el('img', 'aa-logo', { alt: '', src: url, draggable: 'false' });
      im.decode().then(() => { t.replaceChildren(im); t.classList.add('is-logo'); }, () => {});
    });
    return t;
  }
  // the badge as the shell shows it (50+ for an app that lists only its newest items), else the count
  const badgeText = id => { const n = badgeMap[id] || 0; if (!n) return ''; const t = api.apps.badgeText?.(id); return t || (n > 99 ? '99+' : String(n)); };
  const lit = id => (badgeMap[id] || 0) > 0;
  /* the open apps as a grid of small icons with their names under them; badged apps first (the Orb view's rule), then
   * the rest, each in desk order */
  const litFirst = list => [...list.filter(a => lit(a.id)), ...list.filter(a => !lit(a.id))];
  function appCell(a, go) {
    const b = el('button', 'aa-gi aa-app', { type: 'button', role: 'listitem', 'data-app': a.id, title: a.name });
    const ic = el('span', 'aa-gt'), n = el('b', 'aa-badge', { 'data-badge': a.id, 'aria-hidden': 'true', text: badgeText(a.id) }); n.hidden = !n.textContent;
    ic.append(appTile(a.id), n);
    b.append(ic, el('span', 'aa-gn', { text: a.name }));
    b.setAttribute('aria-label', a.name + (n.textContent ? `, ${n.textContent} new` : ''));
    api.listen(b, 'click', () => { closeDrawer(); go(); });
    return b;
  }
  function plainCell(cls, ico, label, go) {
    const b = el('button', 'aa-gi ' + cls, { type: 'button', role: 'listitem', 'aria-label': label });
    const ic = el('span', 'aa-gt'), t = el('span', 'aa-tile is-plain', { 'aria-hidden': 'true' }); t.append(icon(ico)); ic.append(t);
    b.append(ic, el('span', 'aa-gn', { text: label, 'aria-hidden': 'true' }));
    api.listen(b, 'click', () => { closeDrawer(); go(); });
    return b;
  }
  const grid = (label, cells) => { const g = el('div', 'aa-grid', { role: 'list', 'aria-label': label }); g.append(...cells); return g; };
  const goApp = id => { const d = desks().find(x => x.id === id); if (d) api.nav.goDesk(d.desk); else api.apps.openDesk(id); };
  function chatRow(s, here) {
    const b = el('button', 'aa-row aa-chat', { type: 'button', 'data-sid': s.id, 'data-kind': s.kind, ...(s.id === here ? { 'aria-current': 'page' } : {}) });
    // plain titles like theirs; a pin, then the state at the end only when there is one (Working turns, Ready new = a dot)
    b.append(el('span', 'aa-row-t', { text: s.title }));
    if (s.pinned) b.append(icon('pin', 'aa-ico aa-pin'));
    if (s.kind === 'working' || (s.kind === 'ready' && s.unread)) b.append(el('i', 'aa-st' + (s.kind === 'working' ? '' : ' is-new'), { 'aria-hidden': 'true' }));
    b.setAttribute('aria-label', `${s.title}${s.kind === 'working' ? ', working' : s.unread ? ', ready, new' : s.kind === 'ready' ? ', ready' : ''}${s.pinned ? ', pinned' : ''}`);
    pressable(b, s);
    return b;
  }
  const label = (text, cls = '') => el('h3', 'aa-lab' + (cls ? ' ' + cls : ''), { text });
  let drawn = '';
  function paintDrawer(force = false) {
    if (!open) return;
    const name = agentName(); word.textContent = name;
    const here = api.route().thread, out = [], s = sessions || readSessions();
    const apps = api.apps.list(), dk = desks();
    // repaint only when what it lists changed (renders come often while a chat is working; a row under a finger stays)
    const sig = JSON.stringify([q, here, dk.map(d => d.id + d.desk + (lit(d.id) ? '*' : '')), apps.length, ['working', 'ready', ...(q ? ['archive'] : [])].map(k => (s[k] || []).map(r => [r.id, r.title, r.unread, r.pinned, r.actions.join()]))]);
    if (!force && sig === drawn && scroll.childElementCount) return;
    drawn = sig;
    if (q) {
      const hitsA = apps.filter(a => a.id !== CHATS && !a.agent && !a.connector && !a.dev && matches(a, q));
      const seen = new Set(), hitsC = ['working', 'ready', 'archive'].flatMap(k => s[k] || []).filter(r => !seen.has(r.id) && seen.add(r.id) && matches({ name: r.title }, q));
      if (hitsA.length) out.push(label('Apps'), grid('Apps', hitsA.map(a => appCell(a, () => goApp(a.id)))));
      if (hitsC.length) out.push(label('Chats'), ...hitsC.map(r => chatRow(r, here)));
      if (!hitsA.length && !hitsC.length) out.push(el('p', 'aa-empty', { text: 'No chat or app by that name.' }));
    } else {
      // every open app (none hidden behind "N more"), then All apps as the grid's last cell
      const openList = litFirst(openApps(apps, dk));
      out.push(grid('Open apps', [...openList.map(a => appCell(a, () => goApp(a.id))), plainCell('aa-all', 'apps', 'All apps', () => chrome.open())]));
      out.push(el('hr', 'aa-div'));
      const rows = [...(s.working || []), ...(s.ready || [])];
      out.push(label('Recents'));
      if (rows.length) out.push(...rows.map(r => chatRow(r, here)));
      else out.push(el('p', 'aa-empty', { text: sessions ? 'Nothing working or ready.' : 'Loading your chats…' }));
      const all = el('button', 'aa-viewall', { type: 'button' }); all.append(el('span', '', { text: 'View all' }), icon('chev', 'aa-ico aa-chev'));
      api.listen(all, 'click', () => { closeDrawer(); listWanted = true; api.sessions.openList('ready'); });
      out.push(all);
    }
    scroll.replaceChildren(...out);
  }
  function paintBadges() {
    if (open) paintDrawer();   // a badge that comes or goes reorders the grid (badged first); the signature skips the rest
    for (const n of scroll.querySelectorAll('[data-badge]')) {
      n.textContent = badgeText(n.dataset.badge); n.hidden = !n.textContent;
      const b = n.closest('.aa-gi'), nm = b?.querySelector('.aa-gn')?.textContent || '';
      if (b && nm) b.setAttribute('aria-label', nm + (n.textContent ? `, ${n.textContent} new` : ''));
    }
    const ready = badgeMap[CHATS] || 0;
    menuDot.hidden = !ready || open;
    menuBtn.setAttribute('aria-label', ready ? `Open menu, ${ready} ready` : 'Open menu');
  }

  /* ---------- a chat row: tap opens it; a long press (or right click) opens its menu ---------- */
  let press = null, swallow = 0;
  function pressable(b, s) {
    api.listen(b, 'pointerdown', e => {
      if (e.button > 0) return;
      const p = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
      p.off = api.after(LONG_PRESS, () => { if (press !== p) return; p.done = true; press = null; swallow = Date.now() + 700; openMenu(b, s); });
      press = p;
    });
    api.listen(b, 'pointermove', e => { if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { press.off(); press = null; } });
    const end = () => { if (press) { press.off(); press = null; } };
    api.listen(b, 'pointerup', end); api.listen(b, 'pointercancel', end);
    api.listen(b, 'contextmenu', e => { e.preventDefault(); end(); swallow = Date.now() + 400; openMenu(b, s); });
    api.listen(b, 'click', e => { if (Date.now() < swallow) { e.preventDefault(); return; } closeDrawer(); api.sessions.open(s.id); });
  }
  let menu = null, offMenuBack = null;
  function openMenu(row, s) {
    closeMenu();
    const acts = ACTS.filter(([k]) => (s.actions || []).includes(k));
    if (!acts.length) return;
    const box = el('div', 'aa-menu-layer');
    const shade = el('div', 'aa-menu-scrim', { 'aria-hidden': 'true' });
    const card = el('div', 'aa-pop', { role: 'menu', 'aria-label': s.title });
    for (const [k, word0] of acts) {
      const w = k === 'pin' && s.pinned ? 'Unpin' : word0;
      const it = el('button', 'aa-pop-i' + (k === 'done' ? ' is-file' : ''), { type: 'button', role: 'menuitem', 'data-act': k });
      it.append(icon(k), el('span', '', { text: w }));
      api.listen(it, 'click', () => { if (Date.now() < swallow) return; closeMenu(); if (k === 'rename') closeDrawer(); api.sessions.act(s.id, k); api.after(120, () => { readSessions(); paintDrawer(); }); });
      card.append(it);
    }
    box.append(shade, card);
    drawer.append(box);
    // under the row, right-aligned in the drawer (above it when the row sits low), like their popovers
    const dr = drawer.getBoundingClientRect(), rr = row.getBoundingClientRect(), h = acts.length * 48 + 12;
    const below = rr.bottom - dr.top + 4, above = rr.top - dr.top - h - 4;
    card.style.top = Math.max(8, below + h > dr.height - 8 ? above : below) + 'px';
    api.listen(shade, 'click', () => { if (Date.now() >= swallow) closeMenu(); });   // not the lift of the press that opened it
    api.listen(shade, 'pointerdown', e => e.preventDefault());
    menu = box; row.classList.add('is-held');
    offMenuBack = api.back.push(closeMenu);
    api.after(0, () => card.querySelector('button')?.focus?.({ preventScroll: true }));
  }
  function closeMenu() {
    if (!menu) return;
    menu.remove(); menu = null; offMenuBack?.(); offMenuBack = null;
    for (const r of scroll.querySelectorAll('.is-held')) r.classList.remove('is-held');
  }

  /* ---------- open the drawer with a swipe: from the left edge anywhere, or rightwards anywhere in a chat ----------
   * Once recognised, the swipe is the drawer's alone (Miguel, 2 Nov 2026: a swipe from the left of a chat also ran the
   * thread swipe-back, which left the chat for a New chat under the drawer): it claims the finger (api.gesture.claim:
   * the dock swipe and the row long-press stand down) and keeps its touches from the chat below, where the thread
   * swipe-back listens, so the chat stays as it was. It is recognised before the swipe-back would follow the finger
   * (16 px sideways vs its 24). Touch events, like the swipe-back, so a list starting to scroll never cancels it; code,
   * tables, the composer and fields keep their own sideways gestures. Back (the button) still steps a thread back. */
  const OWN_SIDEWAYS = 'pre, table, [data-part="composer"], .ch-compose, .ms-track, input, textarea, [contenteditable="true"]';
  let drag = null, touchPid = null;
  const W = () => drawer.getBoundingClientRect().width || 300;
  api.listen(doc, 'pointerdown', e => { if (e.pointerType === 'touch' && e.isPrimary !== false) touchPid = e.pointerId; }, true);
  api.listen(doc, 'touchstart', e => {
    drag = null;
    if (open || menu || sheet || root.dataset.vcSheet || e.touches.length !== 1) return;
    const t = e.touches[0], tg = e.target;
    // under the top bar only, never from the composer (its + sits at the edge), the dock or a sheet
    if (t.clientY <= top.getBoundingClientRect().bottom || tg?.closest?.('.ch-compose, #dock, .aa-sheet, .vc-sheet')) return;
    const edge = t.clientX <= EDGE;
    const inChat = !edge && root.dataset.aiFront === 'chat' && api.route().view === 'thread' && !tg?.closest?.(OWN_SIDEWAYS)
      && !String(globalThis.getSelection?.() || '');
    if (edge || inChat) drag = { x: t.clientX, y: t.clientY, at: performance.now(), on: false, edge };
  }, { capture: true, passive: true });
  api.listen(doc, 'touchmove', e => {
    if (!drag) return;
    const t = e.touches[0];
    if (!t || e.touches.length !== 1) { if (drag.on) settle(false); drag = null; return; }
    const dx = t.clientX - drag.x, dy = t.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (drag.edge ? dx < 10 : !(dx > 16 && dx > Math.abs(dy) * 2)) return;
      drag.on = true; if (touchPid != null) api.gesture.claim(touchPid);
      closeMenu(); readSessions(); open = true; paintDrawer(); open = false;
      layer.hidden = false; layer.classList.add('is-drag');
    }
    // the drawer's swipe from here: nothing below (thread swipe-back, desk steps, scrolling) follows it
    e.stopPropagation(); if (e.cancelable) e.preventDefault();
    const w = W(), x = Math.max(0, Math.min(w, dx));
    drawer.style.transform = `translateX(${x - w}px)`; scrim.style.opacity = String(x / w);
  }, { capture: true, passive: false });
  function settle(go) {
    if (go) return openDrawer();
    layer.classList.remove('is-drag'); drawer.style.removeProperty('transform'); scrim.style.removeProperty('opacity');
    api.after(220, () => { if (!open) layer.hidden = true; });
  }
  const dragEnd = e => {
    if (!drag) return;
    const g = drag; drag = null; if (!g.on) return;
    e.stopPropagation();
    const t = e.changedTouches?.[0], dx = t ? t.clientX - g.x : 0, dy = t ? t.clientY - g.y : 0;
    settle(e.type !== 'touchcancel' && !!t && (dx > W() * .4 || api.gesture.intent(dx, dy, performance.now() - g.at)));
  };
  api.listen(doc, 'touchend', dragEnd, { capture: true, passive: true }); api.listen(doc, 'touchcancel', dragEnd, { capture: true, passive: true });
  // a swipe left on the open drawer closes it
  let shut = null;
  api.listen(drawer, 'pointerdown', e => { if (!menu) shut = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now() }; });
  api.listen(drawer, 'pointerup', e => {
    if (!shut || e.pointerId !== shut.id) return; const g = shut; shut = null;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (dx < -40 && Math.abs(dx) > Math.abs(dy) * 1.5) closeDrawer();
  });
  api.listen(drawer, 'pointercancel', () => { shut = null; });

  /* ---------- workspaces (top right) ---------- */
  let sheet = null, offSheetBack = null;
  function paintWs() {
    const list = api.workspaces?.list() || [], own = list[0] || { name: agentName() };
    wsDisc.textContent = initial(own.name);
    wsBtn.setAttribute('aria-label', `Workspace: ${own.name}. Switch workspace`); wsBtn.title = `Workspace: ${own.name}`;
    if (sheet) paintSheet(list);
  }
  function paintSheet(list) {
    const body = sheet.querySelector('.aa-sh-body'), out = [];
    for (const w of list) {
      const r = el('div', 'aa-sh-row' + (w.current ? ' is-on' : ' is-off'), { role: 'listitem' });
      const disc = el('span', 'aa-ws-i is-big', { 'aria-hidden': 'true', text: initial(w.name) });
      const words = el('span', 'aa-sh-w'); words.append(el('b', '', { text: w.name }), el('small', '', { text: w.current ? 'This Wizard · on this screen' : `${w.org ? w.org + ' · ' : ''}Not connected yet` }));
      r.append(disc, words); if (w.current) r.append(icon('check', 'aa-ico aa-sh-check'));
      out.push(r);
    }
    const list0 = el('div', 'aa-sh-list', { role: 'list', 'aria-label': 'Workspaces' }); list0.append(...out);
    const manage = el('button', 'aa-sh-manage', { type: 'button', text: 'Manage workspaces' });
    api.listen(manage, 'click', () => { closeSheet(); api.desk.settings('network'); });
    body.replaceChildren(list0, manage);
  }
  function openSheet() {
    if (sheet) return; closeDrawer();
    api.workspaces?.refresh();
    sheet = el('div', 'aa-sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Workspaces' });
    const sc = el('div', 'aa-sh-scrim', { 'aria-hidden': 'true' }), card = el('div', 'aa-sh-card');
    const hd = el('div', 'aa-sh-head'); const x = el('button', 'aa-tb aa-sh-x', { type: 'button', 'aria-label': 'Close' }); x.append(icon('x'));
    hd.append(el('h3', 'aa-sh-t', { text: 'Workspaces' }), x);
    card.append(el('i', 'aa-sh-grip', { 'aria-hidden': 'true' }), hd, el('div', 'aa-sh-body'));
    sheet.append(sc, card); api.mount(sheet);
    api.listen(sc, 'click', closeSheet); api.listen(x, 'click', closeSheet);
    offSheetBack = api.back.push(closeSheet);
    wsBtn.setAttribute('aria-expanded', 'true');
    paintSheet(api.workspaces?.list() || []);
    api.after(0, () => x.focus?.({ preventScroll: true }));
  }
  function closeSheet() { if (!sheet) return; sheet.remove(); sheet = null; offSheetBack?.(); offSheetBack = null; wsBtn.setAttribute('aria-expanded', 'false'); }
  api.listen(wsBtn, 'click', () => (sheet ? closeSheet() : openSheet()));
  api.listen(globalThis, 'wos:resources', paintWs);

  /* ---------- the round button: Send with words, else the voice button (the dock orb's own press) ---------- */
  const sendOf = t => t?.closest?.('.ch-compose .ch-send');
  const empty = b => !b.closest('.ch-compose')?.classList.contains('has-text');
  api.listen(doc, 'pointerdown', e => {
    const b = sendOf(e.target); if (!b || !empty(b) || e.isPrimary === false) return;
    const host = api.phone.orb(); if (!host) return;
    e.preventDefault(); e.stopPropagation();
    b.classList.add('is-pressed');
    const init = { bubbles: true, cancelable: true, composed: true, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: true, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, button: e.button, buttons: e.buttons, width: e.width, height: e.height, pressure: e.pressure };
    host.dispatchEvent(new PointerEvent('pointerdown', init));
  }, true);
  const unpress = () => { for (const b of doc.querySelectorAll('.ch-send.is-pressed')) b.classList.remove('is-pressed'); };
  api.listen(globalThis, 'pointerup', unpress, true); api.listen(globalThis, 'pointercancel', unpress, true);
  // the press went to the orb: the button's own click (an empty submit) never happens
  api.listen(doc, 'click', e => { const b = sendOf(e.target); if (b && empty(b) && e.detail !== 0) { e.preventDefault(); e.stopPropagation(); } }, true);
  api.listen(doc, 'keydown', e => { const b = sendOf(e.target); if (b && empty(b) && (e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); e.stopPropagation(); api.voice.tap(); } }, true);
  const labelSend = () => { for (const b of doc.querySelectorAll('.ch-compose .ch-send')) b.setAttribute('aria-label', empty(b) ? `Talk to ${agentName()} (hold for a command)` : 'Send'); };
  api.listen(doc, 'input', e => { if (e.target?.closest?.('.ch-compose')) api.frame(labelSend); }, true);

  /* ---------- the main screen: the chat (Home and the bare list become it), or an app ---------- */
  let last = { view: '', thread: null, desk: -1 }, pending = false;
  const soon = fn => { if (pending) return; pending = true; api.after(0, () => { pending = false; fn(); }); };
  function onRoute(r) {
    if (r.home) { soon(() => { if (api.route().home) api.sessions.chats(); }); return paintTop(r); }
    if (r.view === 'list') {
      if (!listWanted) {
        // the list lives in the drawer here: a thread left for the list (Back) opens the drawer over a new chat
        const fromThread = last.view === 'thread' && last.desk === r.desk;
        soon(() => { if (api.route().view === 'list' && !listWanted) { api.sessions.newChat(); if (fromThread) openDrawer(); } });
      }
    } else listWanted = false;
    last = { view: r.view, thread: r.thread, desk: r.desk };
    paintTop(r);
  }
  function paintTop(r = api.route()) {
    const app = r.app && r.app !== 'chats' ? r.app : '';
    root.dataset.aiFront = r.home ? 'chat' : app ? 'app' : r.view === 'list' ? 'list' : 'chat';
    nameEl.textContent = agentName();
    const sub = app ? appName(app) : r.thread && r.thread !== '__new__' ? titleOf(r.thread) : '';
    subEl.textContent = sub; subEl.hidden = !sub;
    labelSend();
    paintWs();
  }
  api.on('route', onRoute);
  api.on('render', () => { if (open) { readSessions(); paintDrawer(); } paintTop(); });
  api.on('home', () => soon(() => { if (api.route().home) api.sessions.chats(); }));
  api.on('voice', () => paintTop());
  readSessions(); paintTop(); paintBadges();
  if (api.route().home) soon(() => api.sessions.chats());

  return () => {
    closeMenu(); closeSheet(); closeDrawer();
    top.remove(); layer.remove(); chrome.dispose();
    for (const k of ['aiApps', 'aiFront', 'aaDrawer']) delete root.dataset[k];
  };
}
