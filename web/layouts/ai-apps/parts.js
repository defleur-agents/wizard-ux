/* The AI apps view's shared marks and words (phone layout.js and desktop.js): one icon set, one row-menu order, so the
 * drawer on the phone and the sidebar on the desktop draw and say the same things. 24-unit outline paths, drawn with
 * currentColor by the caller's CSS. No DOM at import time. */
export const SVG = 'http://www.w3.org/2000/svg';
export const ICON = {
  menu: ['M4 8.5h16', 'M4 15.5h10'],
  // a bell: a notification among the chats (round 5)
  bell: ['M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  // a house: Home (round 5, the top bar's middle)
  home: ['M4.5 10.5 12 4.5l7.5 6', 'M6.5 9v10h11V9', 'M10 19v-5h4v5'],
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M15.5 15.5 20 20'],
  apps: ['M5 5h5v5H5z', 'M14 5h5v5h-5z', 'M5 14h5v5H5z', 'M14 14h5v5h-5z'],
  plus: ['M12 5v14', 'M5 12h14'],
  chev: ['m10 7 5 5-5 5'],
  down: ['m7 10 5 5 5-5'],
  more: ['M5.5 12h.01', 'M12 12h.01', 'M18.5 12h.01'],
  // the sidebar toggle (ChatGPT's ◫): a panel with its left column
  side: ['M4.5 5.5h15v13h-15z', 'M9.5 5.5v13'],
  pin: ['M9 4h6l-1 6 3 3H7l3-3-1-6z', 'M12 13v7'],
  rename: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  unread: ['M3.5 6.5h17v11h-17z', 'm4.5 7.5 7.5 5.5 7.5-5.5'],
  snooze: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 8v4.5l3 2'],
  done: ['M3.5 5h17v4h-17z', 'M5.5 9v9.5h13V9', 'M10 13h4'],
  restore: ['M4.5 12a7.5 7.5 0 1 0 2.2-5.3', 'M4.5 4.5v4h4'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  // the app panel wider / back to a third (round 7, the Orb desktop's panel)
  expand: ['M14 4h6v6', 'M20 4l-7 7', 'M10 20H4v-6', 'M4 20l7-7'],
  shrink: ['M4 14h6v6', 'M10 14l-6 6', 'M20 10h-6V4', 'M14 10l6-6'],
  // a microphone: the orb wears it (round 6: the orb IS the microphone)
  mic: ['M12 3.5a2.75 2.75 0 0 0-2.75 2.75v5.5a2.75 2.75 0 0 0 5.5 0v-5.5A2.75 2.75 0 0 0 12 3.5z', 'M6.5 11.25a5.5 5.5 0 0 0 11 0', 'M12 16.75v3.75'],
  newchat: ['M12 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V12', 'M17.5 4.5l2 2L13 13l-3 1 1-3z'],
  // a cogwheel (the Lucide settings outline, ISC licence)
  cog: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
};
/* The row menu (long press on the phone, ⋯ or right click on the desktop), in the order they use (Pin, Rename, …, the
 * filing action last), Wizard's words. */
export const ACTS = [['pin', 'Pin'], ['rename', 'Rename'], ['unread', 'Mark unread'], ['snooze', 'Snooze'], ['restore', 'Restore'], ['done', 'Archive']];
/** An outline icon from ICON as an <svg> of the given class. */
export function svgIcon(doc, name, cls) {
  const s = doc.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls);
  for (const d of ICON[name] || []) { const p = doc.createElementNS(SVG, 'path'); p.setAttribute('d', d); s.append(p); }
  return s;
}
/** The first letter of a name, for a workspace disc. */
export const initial = n => (String(n || '').trim()[0] || 'W').toUpperCase();
/* The chats in Wizard's own sections (round 5, Miguel: in place of Recents and View all), in the stock Chats order
 * (Archive on top, then Working, then Ready nearest the thumb), each header like their Recents label. */
export const SECTIONS = [['archive', 'Archive'], ['working', 'Working'], ['ready', 'Ready']];
/** Which sections are open: Ready open, Working and Archive folded at first; a stored choice (this device) wins. */
export function sectionsOpen(stored) {
  const o = { archive: false, working: false, ready: true };
  if (stored && typeof stored === 'object') for (const k of Object.keys(o)) if (typeof stored[k] === 'boolean') o[k] = stored[k];
  return o;
}
/* Round 7 (Miguel, 2 Nov 2026): the stock Chats statuses (core/chats.js stiKind: what a thread wants from him), in Chats'
 * own order of urgency, with Chats' own words. The rail groups Ready by them and marks each chat with its colour; a
 * notification row is FYI unless it is urgent. */
export const STATES = [['needs', 'Needs you'], ['approval', 'Needs approval'], ['failed', 'Error'], ['check', 'Your call'], ['fyi', 'FYI'], ['done', 'Done'], ['deferred', 'Snoozed'], ['none', 'Ready']];
const KNOWN = new Set(STATES.map(s => s[0]));
/** One row's status: the shell's own (row.state), else what the row says (needs / a note). */
export function stateOf(r) {
  const s = r && typeof r.state === 'string' ? r.state : '';
  if (KNOWN.has(s)) return s;
  return r?.needs ? 'needs' : r?.note ? 'fyi' : 'none';
}
/** Ready grouped by status in STATES order: [{ state, word, rows }], empty groups left out. */
export function stateGroups(rows) {
  const by = new Map(STATES.map(([k]) => [k, []]));
  for (const r of rows || []) by.get(stateOf(r)).push(r);
  return STATES.map(([state, word]) => ({ state, word, rows: by.get(state) })).filter(g => g.rows.length);
}
/* Round 8 (Miguel, 2 Nov 2026: the rail's coloured first letters were confusing): each Ready chat on the folded rail is
 * its stock Chats status icon (core/chats.js STI, the Orb desktop's thin column of status icons), the same drawings:
 * [tag, attrs] parts; class f = filled in the status colour, k / kd = the cut-out mark in the panel's colour. */
export const STATE_ICON = {
  needs: [['path', { d: 'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8' }], ['path', { d: 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15' }]],
  check: [['path', { d: 'M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.6a1 1 0 0 0 .9 1.4h12.8a1 1 0 0 0 .9-1.4l-5.1-10.2a2 2 0 0 1-.2-.9V2M8.5 2h7M7 16h10' }]],
  done: [['circle', { class: 'f', cx: '12', cy: '12', r: '10' }], ['path', { class: 'k', d: 'm7.5 12.3 3 3 6-6.3' }]],
  fyi: [['circle', { class: 'f', cx: '12', cy: '12', r: '10' }], ['path', { class: 'k', d: 'M12 11v5.5' }], ['circle', { class: 'kd', cx: '12', cy: '7.6', r: '1.35' }]],
  deferred: [['circle', { cx: '12', cy: '12', r: '9' }], ['path', { d: 'M12 7.5V12l3 2' }]],
  approval: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
  failed: [['path', { d: 'm21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3M12 9v4M12 17h.01' }]],
  none: [['circle', { class: 'f', cx: '12', cy: '12', r: '3' }]],
};
/** A Ready chat's status icon (STATE_ICON) as an <svg> of the given class. */
export function stateIcon(doc, state, cls) {
  const s = doc.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls);
  for (const [tag, attrs] of STATE_ICON[state] || STATE_ICON.none) { const p = doc.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v); s.append(p); }
  return s;
}
/** The notification Chats shows in place of a thread (a New chat holding the note: .ch-notif-thread), if one is on
 * screen; the AI apps view treats it exactly like a chat (never Home). */
export function noteThread(doc, scope = '') {
  for (const n of doc.querySelectorAll(`${scope} .ch-thread.ch-notif-thread`.trim())) {
    if (typeof n.getClientRects === 'function' && !n.getClientRects().length) continue;
    return n;
  }
  return null;
}
/** A notification's Badge | Chats choice joins its actions (round 7): moved into the thread's own sticky action row
 * (.ch-tacts), first, so the note reads like a chat with one action row. Chats' click handler finds it there too
 * (.ch-notif-route [data-notify-route]); a repaint puts it back above the message, so call again on renders. */
export function noteRouteIntoActions(doc, scope = '') {
  const t = noteThread(doc, scope); if (!t) return false;
  const route = t.querySelector('.ch-notif-route'), acts = t.querySelector('.ch-tacts');
  if (!route || !acts || route.parentNode === acts) return false;
  acts.insertBefore(route, acts.firstChild); return true;
}
/** The AI fuel gauge (the network Home's E ▮▮▮ F, miguel/machines-home) copied into a box of the view (the sidebar's or
 * the drawer's foot, round 7): the live one stays where it is painted; this copy follows it (call again on renders)
 * and opens Settings › AI. Returns the copy's signature so callers repaint only on change. */
export function gaugeInto(doc, box, last, open) {
  const src = [...doc.querySelectorAll('.mh-gauge')].find(n => !n.classList.contains('is-still') && !n.closest('[data-fuel-copy]'));
  const sig = src && typeof src.cloneNode === 'function' ? `${src.getAttribute('data-s')}|${src.getAttribute('aria-label')}|${src.querySelectorAll('.on').length}` : '';
  if (sig === last) return last;
  if (!sig) { box.replaceChildren(); box.hidden = true; return sig; }
  const c = src.cloneNode(true);
  for (const n of [c, ...c.querySelectorAll('[id]')]) n.removeAttribute('id');
  c.removeAttribute('data-go'); c.classList.add('vw-gauge');
  box.replaceChildren(c); box.hidden = false;
  c.addEventListener('click', open);
  return sig;
}
/** The box of one column of a grid row (the composer's orb slot, round 6): its middle in viewport px and its size
 * ({ x, y, d }), on the grid's last row. Read from the resolved tracks, so it is right whether the composer is one line
 * or two (words on top, the controls under them). null when the row is not a grid or the column is empty. */
export function gridSlot(row, col) {
  const cs = row?.ownerDocument?.defaultView?.getComputedStyle(row); if (!cs) return null;
  const cols = String(cs.gridTemplateColumns).split(' ').map(parseFloat), rows = String(cs.gridTemplateRows).split(' ').map(parseFloat);
  if (cols.length <= col || cols.some(Number.isNaN) || !rows.length || rows.some(Number.isNaN)) return null;
  const r = row.getBoundingClientRect(), px = k => parseFloat(cs[k]) || 0, cg = px('columnGap'), rg = px('rowGap');
  let x = r.left + px('borderLeftWidth') + px('paddingLeft'), y = r.top + px('borderTopWidth') + px('paddingTop');
  for (let i = 0; i < col; i++) x += cols[i] + cg;
  for (let i = 0; i < rows.length - 1; i++) y += rows[i] + rg;
  const w = cols[col], h = rows[rows.length - 1];
  return w > 0 && h > 0 ? { x: x + w / 2, y: y + h / 2, d: Math.min(w, h) } : null;
}
