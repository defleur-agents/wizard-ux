/* Apps view (Miguel, 1 Nov 2026). Worn by the miguel/apps-home tweak, off by default, picked with the
 * Desks | Orb | Apps switch (phone: top of Home; desktop: the middle of the bar).
 *
 *   Phone: Home looks like a standard iPhone / Android home screen: a grid of app icons, ONE per desk (each desk is one
 *   app), in desk order, each with its real logo (else the dock's own mark for it), its name and its live count. A tap
 *   opens that desk. Chats is always the first icon, with the Ready count, and opens the stock Chats list. The grid
 *   ends with a + tile: the sheet of every app not open yet (chrome.js); a pick opens it on a desk of its own. Home's
 *   own top stays (which Wizard, the switch, the AI fuel gauge, the gear). The stock desk switcher is gone on EVERY
 *   screen (chrome.css): only the dock orb is left at the bottom centre, exactly where it sits (tap talks, hold
 *   commands, sideways swipes between desks), and away from Home a round Back beside it goes Home (this grid).
 *
 *   Desktop: the same idea as a launchpad (desktop.js).
 *
 * No timers, no motion of its own: it repaints when the route, the desks or a count change. Colours are the wearing
 * tweak's tokens (--ap-*: miguel/apps-home tweak.css). Everything through the layout API. */
import { viewChrome } from './chrome.js';
import desktop from './desktop.js';

const CHATS = 'wizard';

export default function setup(api) {
  if (api.env.shell === 'desktop') return desktop(api);
  if (api.env.shell !== 'phone') return () => {};
  const doc = document, root = doc.documentElement;
  const el = (tag, cls, attrs = {}) => { const n = doc.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } return n; };

  const grid = el('nav', 'ap-grid', { 'aria-label': 'Apps' });
  root.dataset.appsHome = 'on';
  const desks = () => (api.desks?.list || api.phone.desks)();
  // Back (in the dock row beside the orb, away from Home) and the + sheet (every app not open yet)
  const chrome = viewChrome(api, { home: () => api.nav.goDesk(0), openIds: () => desks().map(d => d.id) });
  // the grid's last tile: a + in a plain tile, labelled like the others
  const plus = chrome.plus('ap-icon ap-plus', 'Open an app', (b, ico) => { const t = el('span', 'ap-tile', { 'aria-hidden': 'true' }); t.append(ico); b.append(t, el('span', 'ap-label', { text: 'Open app' })); });
  const placeBack = () => { const o = api.phone.orb?.(); if (o?.parentNode && chrome.back.parentNode !== o.parentNode) o.parentNode.insertBefore(chrome.back, o); };

  let badgeMap = api.apps.badges(m => { badgeMap = m; paintCounts(); });
  let names = new Map(), sig = '', icons = [];
  const nameOf = (id, fallback) => names.get(id) || fallback || id;

  // one icon: a tile with the app's logo (or the dock's mark for it), a count badge and its name under it
  function icon(item) {
    const b = el('button', 'ap-icon', { type: 'button', 'data-app': item.id, ...(item.desk != null ? { 'data-desk': String(item.desk) } : {}) });
    const tile = el('span', 'ap-tile', { 'aria-hidden': 'true' });
    const mark = api.phone.mark(item.id);
    if (mark) { mark.querySelector?.('.dbg')?.remove(); mark.classList?.add('ap-mark'); tile.append(mark); }
    const c = mark?.style?.getPropertyValue?.('--c'); if (c) b.style.setProperty('--c', c);
    const count = el('b', 'ap-badge', { 'aria-hidden': 'true' }); count.hidden = true;
    b.append(tile, count, el('span', 'ap-label', { text: item.name }));
    api.listen(b, 'click', () => {
      if (item.id === CHATS) api.sessions.openList('ready');
      else if (item.desk != null) api.nav.goDesk(item.desk);
    });
    if (item.id !== CHATS) api.apps.logo(item.id).then(url => {
      if (!url || !b.isConnected) return;
      const im = el('img', 'ap-logo', { alt: '', src: url, draggable: 'false' });
      im.decode().then(() => { tile.replaceChildren(im); b.classList.add('is-logo'); }, () => {});
    });
    return { b, count, item };
  }

  function items() {
    names = new Map(api.apps.list().map(a => [a.id, a.name]));
    const out = [{ id: CHATS, name: 'Chats', desk: null }];
    for (const d of desks()) if (d.id && d.id !== CHATS) out.push({ id: d.id, name: nameOf(d.id, d.name), desk: d.desk });
    return out;
  }
  function paintCounts() {
    for (const { b, count, item } of icons) {
      const n = badgeMap[item.id] || 0;
      count.textContent = n > 99 ? '99+' : n ? String(n) : ''; count.hidden = !n;
      b.setAttribute('aria-label', item.id === CHATS ? (n ? `Chats, ${n} ready` : 'Chats') : `${item.name}${n ? `, ${n} new` : ''}`);
    }
  }
  function paint() {
    const sec = api.phone.home(); if (sec && grid.parentNode !== sec) sec.append(grid);   // a rebuilt desk strip: back in
    const list = items(), next = list.map(i => `${i.id}@${i.desk}:${i.name}`).join('|');
    if (next !== sig) {
      sig = next;
      const was = new Map(icons.map(x => [`${x.item.id}@${x.item.desk}:${x.item.name}`, x]));
      icons = list.map(i => was.get(`${i.id}@${i.desk}:${i.name}`) || icon(i));
      grid.replaceChildren(...icons.map(x => x.b), plus);
    }
    paintCounts();
    placeBack(); chrome.paintBack(!!api.route().home);
  }
  api.on('route', paint);
  api.on('render', paint);
  api.on('home', paint);
  paint();

  return () => { grid.remove(); chrome.dispose(); delete root.dataset.appsHome; };
}
