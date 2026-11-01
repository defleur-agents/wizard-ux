/* Apps view (Miguel, 1 Nov 2026). Phone only; worn by the miguel/apps-home tweak, off by default, picked with the
 * Desks | Orbs | Apps switch at the top of Home.
 *
 *   Home looks like a standard iPhone / Android home screen: a grid of app icons, ONE per desk (each desk is one app),
 *   in desk order, each with its real logo (else the dock's own mark for it), its name and its live count. A tap opens
 *   that desk. Chats is always the first icon, with the Ready count, and opens the stock Chats list. Home's own top
 *   stays (which Wizard, the switch, the AI fuel gauge, the gear) and the stock dock stays as the home screen's dock
 *   row (the orb: tap talks, hold commands, swipe up for every app). Everything beyond Home is the stock phone.
 *
 *   The desktop never wears it (the tweak only asks for it on the phone): there the switch stays Desks | Orbs.
 *
 * No timers, no motion of its own: it repaints when the route, the desks or a count change. Colours are the wearing
 * tweak's tokens (--ap-*: miguel/apps-home tweak.css). Everything through the layout API. */
const CHATS = 'wizard';

export default function setup(api) {
  if (api.env.shell !== 'phone') return () => {};
  const doc = document, root = doc.documentElement;
  const el = (tag, cls, attrs = {}) => { const n = doc.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } return n; };

  const grid = el('nav', 'ap-grid', { 'aria-label': 'Apps' });
  root.dataset.appsHome = 'on';

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
    for (const d of api.phone.desks()) if (d.id && d.id !== CHATS) out.push({ id: d.id, name: nameOf(d.id, d.name), desk: d.desk });
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
      grid.replaceChildren(...icons.map(x => x.b));
    }
    paintCounts();
  }
  api.on('route', paint);
  api.on('render', paint);
  api.on('home', paint);
  paint();

  return () => { grid.remove(); delete root.dataset.appsHome; };
}
