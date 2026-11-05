/* Notes for an app, read inside its own window (Miguel, 5 Nov 2026: "On my Second Hand app I see two notifications in
 * the badge, but it's not clear to me how to read whatever it's trying to notify me of or mark it as done").
 *
 * Notifications items tagged `app:<id>` are carried to that app (notif-bell.js): set to Badge, the unread ones count on
 * its icon. The app itself knows nothing about them, so the shell shows them: the moment that app's window is on
 * screen, each note is a small banner at the top of it (title, one line of message, time) with its own Mark read (✓).
 * Up to 3 banners stack; more end in a "+N more" line that opens the rest; Mark all read only with 2 or more. Marking
 * goes through WosBell.mark (Notifications' own /api/mark), so the badge drops at once. Back / Esc folds an opened
 * "+N more" list first (both shells ask WosAppNotes.back()). Works for any app: no app ids here. */
(() => {
  'use strict';
  if (window.WosAppNotes) return;
  const TICK = 1500;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const notes = new Map();      // frame -> { el, appId, open, key }
  const items = id => { try { return window.WosBell?.carried?.(id) || []; } catch (_) { return []; } };
  function ago(t) {
    const s = Math.max(0, Date.now() / 1000 - (Number(t) || 0));
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 7 * 86400) return Math.floor(s / 86400) + 'd';
    try { return new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (_) { return ''; }
  }
  // Every app window on screen: { frame, appId }. Prefer the shell's own list (authorized frames, with visibility).
  function shown() {
    const S = window.WizAppServices;
    if (S?.update?.frames) {
      try { return S.update.frames().filter(f => f.visible && f.appId).map(f => ({ frame: f.frame, appId: f.appId })); } catch (_) {}
    }
    return [...document.querySelectorAll('iframe[data-own-app]')].filter(f => f.dataset.ownApp && f.offsetParent).map(f => ({ frame: f, appId: f.dataset.ownApp }));
  }
  const SHOW = 3;
  const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  function render(n) {
    const list = items(n.appId), c = list.length;
    if (c <= SHOW) n.open = false;
    const key = JSON.stringify([n.open, list.map(i => [i.id, i.time, i.title, i.message])]);
    if (key === n.key) return;
    n.key = key;
    const shownList = n.open ? list : list.slice(0, SHOW), more = c - shownList.length;
    const banners = shownList.map(i => {
      const t = i.title || 'Note', m = i.message && i.message !== i.title ? String(i.message).replace(/\s+/g, ' ') : '';
      return `<div class="app-notes-row" role="listitem" data-id="${esc(i.id)}"><div class="app-notes-tx">` +
        `<div class="app-notes-t"><b>${esc(t)}</b><time>${esc(ago(i.time))}</time></div>` +
        (m ? `<p>${esc(m)}</p>` : '') +
        `</div><button type="button" class="app-notes-ok" data-notes-read="${esc(i.id)}" aria-label="Mark read: ${esc(t)}" title="Mark read">${CHECK}</button></div>`;
    }).join('');
    const foot = more > 0 || n.open || c > 1 ? `<div class="app-notes-foot">` +
      (more > 0 ? `<button type="button" data-notes-more aria-expanded="false">+${more} more</button>` : n.open ? `<button type="button" data-notes-more aria-expanded="true">Show fewer</button>` : '<span></span>') +
      (c > 1 ? `<button type="button" data-notes-all>Mark all read</button>` : '') + `</div>` : '';
    n.el.innerHTML = `<div class="app-notes-list" role="list">${banners}</div>${foot}`;
    n.el.classList.toggle('open', n.open);
  }
  function drop(frame) { const n = notes.get(frame); if (!n) return; n.el.remove(); notes.delete(frame); }
  function mark(n, ids) {
    if (!ids.length || !window.WosBell?.mark) return;
    window.WosBell.mark(ids, { read: true }).catch?.(() => {});
    scan();
  }
  function attach(frame, appId) {
    let n = notes.get(frame);
    const host = frame.parentElement; if (!host) return null;
    if (!n) {
      const el = document.createElement('div');
      el.className = 'app-notes'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Notes for this app'); el.dataset.app = appId;
      n = { el, appId, open: false, key: '' }; notes.set(frame, n);
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        if (b.hasAttribute('data-notes-more')) { n.open = !n.open; render(n); }
        else if (b.hasAttribute('data-notes-all')) mark(n, items(n.appId).map(i => i.id));
        else { const id = b.getAttribute('data-notes-read'); if (id) mark(n, [id]); }
        // The tapped button was redrawn: keep the keyboard in the shell (Esc folds the list), never lost to the app.
        try { n.el.querySelector?.('button')?.focus({ preventScroll: true }); } catch (_) {}
      });
    }
    n.appId = appId;
    if (getComputedStyle(host).position === 'static') host.classList.add('app-upd-host');
    if (n.el.parentElement !== host) host.appendChild(n.el);
    return n;
  }
  function scan() {
    const live = shown(), keep = new Set();
    for (const { frame, appId } of live) {
      if (!items(appId).length) continue;
      const n = attach(frame, appId); if (!n) continue;
      keep.add(frame); render(n);
    }
    for (const f of [...notes.keys()]) if (!keep.has(f)) drop(f);
  }
  // Esc folds an opened "+N more" list before anything else sees the key (a layout's own Esc, e.g. hiding its app panel, comes
  // after). Registered before the shells' own key handlers, which load later.
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || ![...notes.values()].some(n => n.open)) return;
    e.preventDefault(); e.stopImmediatePropagation(); api.back();
  }, true);
  setInterval(() => { if (!document.hidden) scan(); }, TICK);
  addEventListener('wizard:app-counts', () => scan());
  addEventListener('wizard:notify-route', () => scan());
  const api = window.WosAppNotes = Object.freeze({
    // Back / Esc: fold an opened "+N more" list (one step), else nothing (the banners stay until marked read).
    back() { for (const n of notes.values()) if (n.open) { n.open = false; render(n); return true; } return false; },
    scan,
    state: () => [...notes.values()].map(n => ({ app: n.appId, open: n.open, n: items(n.appId).length })),
  });
})();
