/* Notifications bell on the Chats panel: a small bell beside search with the unread count from the installed
 * Notifications app (same origin, /notifications/api/count). Tapping it opens Notifications as an ordinary app
 * window, so it sits on a desk you can swipe to. Hidden entirely when no Notifications app is installed, and
 * hidden while a Notifications window is open: its desk mark already carries the same count as a badge, so the
 * owner sees one or the other, never both. Shells expose WizAppOpen(id) and call WosBell.paint() on window changes.
 *
 * Where each app's notifications go (Settings › Notifications; Miguel, 1 Nov 2026: "badges or my unified inbox, but
 * not both"): one choice per app, Badge or Chats. Badge = the count on the app's own icon, nothing in Chats. Chats =
 * its items wait in Chats (yellow threads with Archive / Snooze, counted in Chats' Ready badge) and its own icon
 * shows no count. Default: Notifications (agent alerts) → Chats, every other app → Badge. Chats needs a package that
 * lists inbox threads (wizard/unified-inbox, on by default); without one everything is a badge. Saved per device
 * (`wos.notify.route.v1`); the same choice on every device would need a ui-preferences field in the Agent Service. */
(() => {
  'use strict';
  const S = { unread: 0, needs: 0, ok: false, at: 0 };
  const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
  // Installed: openable as an app window, or present as a screenless agent app (its inbox then lives in Chats).
  const installed = () => !!((window.WizCanOpen && window.WizCanOpen('notifications')) || window.WizCore?.backendApps?.().some(a => a.id === 'notifications'));
  const store = (() => { try { return window.localStorage || null; } catch (e) { return null; } })();
  const readJson = (k, d) => { try { const v = JSON.parse(store?.getItem(k) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : d; } catch (e) { return d; } };
  const writeJson = (k, v) => { try { store?.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* ---- Routing: Badge or Chats, per app ---- */
  const ROUTE_KEY = 'wos.notify.route.v1', ROUTE_DEFAULT = Object.freeze({ notifications: 'chats' });
  const APPID = /^[a-z0-9][a-z0-9-]{0,63}$/;
  let ROUTES = readJson(ROUTE_KEY, {});
  const route = id => { id = String(id || ''); const r = Object.prototype.hasOwnProperty.call(ROUTES, id) ? ROUTES[id] : ROUTE_DEFAULT[id]; return r === 'chats' ? 'chats' : 'badge'; };
  const chatsReady = () => !!window.WosSkinHost?.inboxList;
  // Effective: Chats only when Chats can list it (a package holds the inbox list) and, for an app, it has a feed.
  // Chats itself ('wizard') is the inbox and always keeps its own badge.
  function inChats(id) {
    id = String(id || '');
    if (!id || id === 'wizard' || route(id) !== 'chats' || !chatsReady()) return false;
    return id === 'notifications' ? installed() : known()[id]?.s === 'yes';
  }
  function setRoute(id, to) {
    id = String(id || ''); if (!APPID.test(id) || id === 'wizard' || !['badge', 'chats'].includes(to)) return false;
    if (route(id) === to) return true;
    ROUTES = { ...ROUTES, [id]: to }; writeJson(ROUTE_KEY, ROUTES);
    rerouted(); loadItems();
    return true;
  }
  // Something changed what goes where: drop items that no longer belong in Chats at once, recount every badge.
  function rerouted() {
    const keep = IN.items.filter(i => i.app ? inChats(i.app) : inChats('notifications'));
    if (keep.length !== IN.items.length) { IN.items = Object.freeze(keep); for (const fn of [...IN.subs]) { try { fn(IN.items); } catch (e) {} } }
    window.WizCore?.workspaceNav?.rerouted?.();
    paint();
    window.dispatchEvent(new CustomEvent('wizard:notify-route'));
    inboxChanged();
  }

  function html() {
    if (!installed()) return '';
    // Routed to Chats (or its window is open): the count already shows in one place, so no bell.
    if (inChats('notifications') || (typeof window.WizAppOpen === 'function' && window.WizAppOpen('notifications'))) return '<button type="button" class="ch-bell" data-chbell hidden aria-hidden="true" tabindex="-1"></button>';
    const n = S.unread, lbl = n ? `Notifications, ${n} unread` : 'Notifications';
    return `<button type="button" class="ch-bell${S.needs ? ' needs' : ''}" data-chbell aria-label="${lbl}">${BELL}${n ? `<b>${n > 99 ? '99+' : n}</b>` : ''}</button>`;
  }
  function paint() {
    // The raw count; workspace-navigation shows it as a badge only while Notifications is set to Badge.
    window.WizCore?.workspaceNav?.setCount('notifications', S.unread);
    for (const b of document.querySelectorAll('[data-chbell]')) {
      const h = html(); if (!h) { b.remove(); continue; }
      const t = document.createElement('div'); t.innerHTML = h; const nb = t.firstElementChild;
      if (b.outerHTML !== nb.outerHTML) b.replaceWith(nb);
    }
  }
  /* Inbox items for a trusted tweak (skin-host `inbox` capability): newest first, each with read / archived. Fetched only
   * while something watches, on the bell's own cadence. Text stays data; the tweak renders it with textContent.
   * Only what is routed to Chats is listed: Notifications' items, and the items of apps set to Chats. */
  const IN = { items: [], subs: new Set(), seq: 0 };
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  // The editor's short message is a preview, not the source. Keep the complete original separately, including
  // paragraphs and long diagnostic output. Legacy items without editor details use their complete body.
  const cleanItem = i => Object.freeze({ id: str(i.id, 128), title: str(i.title, 300), message: str(i.message, 8000), details: String(i.details || i.message || ''), time: Number(i.time) || 0, source: str(i.source, 40), priority: Number(i.priority) || 3, link: str(i.link, 2000), read: !!i.read, archived: !!i.archived,
    ...(i.app ? { app: str(i.app, 64), appName: str(i.appName, 80), key: str(i.key, 200), open: str(i.open, 500) } : {}) });

  /* App inbox feeds (Wizard OS inbox feed v1): an installed app that serves GET /<app>/api/inbox → { inbox: 1, items }
   * lists what needs the owner now (what its badge counts), one item per thing. Read only for apps set to Chats (and
   * once per app to learn which apps have one, for the Settings list). A thing handled in the app leaves its feed, so
   * its row clears by itself. Archive / Snooze are inbox marks (Notifications /api/marks, else this device) covering
   * the item's activity time: newer activity brings it back. Only a definite answer (404/405/410, or a 200 that is
   * not a feed) counts as "no feed", asked again after 30 min; an app that was restarting is asked again in 2 min. */
  const FEED_KEY = 'wos.inbox.feeds.v2', MARK_KEY = 'wos.inbox.appmarks.v1', NO_AGAIN = 30 * 60e3, RETRY = 2 * 60e3;
  const FEED_SKIP = new Set(['notifications', 'wizard', 'wizard-agent-service', 'wizard-connection-router', 'wizard-ux', 'setup', 'side-button', 'pages', 'app-store', 'agents', 'troubleshooter']);
  const FD = { known: null, last: {}, marks: null, retry: {}, probing: null, ready: null };
  const known = () => FD.known || (FD.known = readJson(FEED_KEY, {}));
  const saveKnown = () => writeJson(FEED_KEY, known());
  const hash = t => { let a = 0x811c9dc5, b = 0x01000193; for (const c of String(t)) { const k = c.codePointAt(0); a = Math.imul(a ^ k, 16777619) >>> 0; b = Math.imul(b ^ k, 2246822519) >>> 0; } return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0'); };
  const appItemId = (app, key) => 'a-' + app + '-' + hash(key);
  const timed = (p, ms = 4000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  function feedApps() {
    const ids = new Set();
    try { for (const a of window.WizCore?.apps?.('mobile')?.APPS || []) if (a && a.kind === 'wizard' && a.source && a.url) ids.add(a.id); } catch (e) {}
    try { for (const a of window.WizCore?.backendApps?.() || []) if (a && (a.url || a.originalUrl)) ids.add(a.id); } catch (e) {}
    return [...ids].filter(id => APPID.test(String(id)) && !FEED_SKIP.has(id));
  }
  const appName = id => { try { return window.WizCore?.appMetadata?.(id)?.name || [...(window.WizCore?.apps?.('mobile')?.APPS || [])].find(a => a.id === id)?.name || id; } catch (e) { return id; } };
  // A feed, null when the app definitely has none, or a throw when it could not answer now (restarting, offline).
  async function getFeed(id) {
    const r = await timed(fetch(`/${id}/api/inbox`, { cache: 'no-store', credentials: 'same-origin', redirect: 'error' }));
    if (!r.ok) { if ([404, 405, 410].includes(r.status)) return null; throw new Error('feed ' + r.status); }
    if (!/json/.test(r.headers?.get?.('content-type') || '')) return null;
    const d = await r.json();
    return d && d.inbox === 1 && Array.isArray(d.items) ? d.items : null;
  }
  function fromFeed(app, raw) {
    const key = str(raw && raw.key, 200); if (!key) return null;
    const open = typeof raw.open === 'string' && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(raw.open) ? str(raw.open.replace(/^\/+/, ''), 500) : '';
    const text = str(raw.text, 2000);
    return { id: appItemId(app, key), app, appName: appName(app), key, title: str(raw.title, 300), message: text, details: text, time: Number(raw.time) || 0, source: app,
      priority: Math.max(1, Math.min(5, Number(raw.priority) || 3)), link: '', open };
  }
  async function readFeed(id, now) {
    const k = known()[id];
    if (k && k.s === 'no' && now - k.at < NO_AGAIN) return null;
    if (!(k && k.s === 'yes') && FD.retry[id] && now < FD.retry[id]) return null;
    try {
      const items = await getFeed(id);
      delete FD.retry[id];
      if (!items) { known()[id] = { s: 'no', at: now }; saveKnown(); delete FD.last[id]; return null; }
      if (!k || k.s !== 'yes') { known()[id] = { s: 'yes', at: now }; saveKnown(); }
      const list = items.slice(0, 50).map(it => fromFeed(id, it)).filter(Boolean);
      FD.last[id] = { at: now, items: list }; return list;
    } catch (e) {
      if (!(k && k.s === 'yes')) FD.retry[id] = now + RETRY;
      // A feed that stops answering keeps its last items a few minutes (no flicker), then they go.
      return FD.last[id] && now - FD.last[id].at < 5 * 60e3 ? FD.last[id].items : null;
    }
  }
  const feedList = () => feedApps().filter(id => known()[id]?.s === 'yes');
  /* Which installed apps have a feed (for Settings › Notifications). One probe per app, remembered on the device. */
  function discover() {
    if (FD.probing) return FD.probing;
    const now = Date.now(), want = feedApps().filter(id => { const k = known()[id]; return !k || (k.s === 'no' && now - k.at >= NO_AGAIN); });
    if (!want.length) return Promise.resolve(false);
    const before = JSON.stringify(feedList());
    FD.probing = Promise.all(want.map(id => readFeed(id, now))).then(() => {
      FD.probing = null; const changed = before !== JSON.stringify(feedList());
      if (changed) { rerouted(); loadItems(); }
      return changed;
    }, () => { FD.probing = null; return false; });
    return FD.probing;
  }
  async function loadMarks() {
    if (installed()) try { const r = await timed(fetch('/notifications/api/marks', { cache: 'no-store', credentials: 'same-origin' })); if (r.ok) { const d = await r.json(); if (d && d.marks) { FD.marks = d.marks; return; } } } catch (e) {}
    if (!FD.marks) FD.marks = readJson(MARK_KEY, {});
  }
  const withMarks = list => { const M = FD.marks || {}; return list.map(it => { const m = M[it.id]; const covers = m && Number(m.at) >= it.time; return { ...it, read: !!(covers && (m.read || m.archived)), archived: !!(covers && m.archived) }; }); };
  // Only apps set to Chats are asked for their items; an app on Badge costs nothing here.
  async function loadFeeds() {
    if (!chatsReady()) return [];
    const now = Date.now(), out = [];
    await Promise.all(feedApps().filter(id => route(id) === 'chats').map(async id => { const l = await readFeed(id, now); if (l) out.push(...l); }));
    if (out.length) await loadMarks();
    return withMarks(out.filter(it => inChats(it.app)));
  }
  async function loadItems() {
    if (!IN.subs.size) return;
    const seq = ++IN.seq;
    try {
      const wantNotes = installed() && route('notifications') === 'chats';
      const [notes, apps] = await Promise.all([
        wantNotes ? fetch('/notifications/api/items?view=all&limit=200', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null, () => null) : null,
        loadFeeds().catch(() => []),
      ]);
      if (seq !== IN.seq) return;
      // A failed Notifications read keeps its last items; Notifications set to Badge lists none.
      const base = !wantNotes ? [] : notes && Array.isArray(notes.items) ? notes.items : IN.items.filter(i => !i.app);
      const before = JSON.stringify(IN.items);
      IN.items = Object.freeze([...base, ...apps].filter(i => i && i.id).map(cleanItem).sort((a, b) => b.time - a.time));
      for (const fn of [...IN.subs]) { try { fn(IN.items); } catch (e) {} }
      if (before !== JSON.stringify(IN.items)) inboxChanged();
    } catch (e) {}
  }
  function watch(fn) {
    if (typeof fn !== 'function') return () => {};
    IN.subs.add(fn); if (IN.items.length) { try { fn(IN.items); } catch (e) {} }
    loadItems();
    return () => { IN.subs.delete(fn); };
  }
  function inboxChanged() { window.dispatchEvent(new CustomEvent('wizard:notifications')); }
  // Same rows as Chats Ready, including quiet/snoozed ones, never completed ones. Apps set to Chats count here too.
  const readyCount = () => window.WosSkinHost?.inboxList ? IN.items.filter(i => !i.archived).length : 0;
  async function mark(ids, marks) {
    ids = (ids || []).map(String).filter(Boolean); if (!ids.length) return false;
    const appIds = ids.filter(id => IN.items.some(i => i.id === id && i.app));
    if (!installed() && appIds.length < ids.length) return false;
    // Moves at once; a failed write puts it back on the reload below. Archiving also marks read (the server does too).
    const next = { ...marks, ...(marks.archived ? { read: true } : {}) };
    // An app item's mark covers its activity as of now: newer activity in the app brings it back.
    const at = {}; for (const id of appIds) { const it = IN.items.find(i => i.id === id); at[id] = it ? it.time : Date.now() / 1000; }
    IN.items = Object.freeze(IN.items.map(i => ids.includes(i.id) ? Object.freeze({ ...i, ...next }) : i)); for (const fn of [...IN.subs]) { try { fn(IN.items); } catch (e) {} }
    inboxChanged();
    if (appIds.length) { FD.marks = { ...(FD.marks || {}) }; for (const id of appIds) FD.marks[id] = { ...(FD.marks[id] || {}), ...next, at: at[id] }; writeJson(MARK_KEY, FD.marks); }
    let ok = !installed();
    try {
      if (installed()) { const r = await fetch('/notifications/api/mark', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, ...marks, ...(appIds.length ? { at } : {}) }) }); ok = r.ok; }
    } catch (e) {}
    await refresh(true); await loadItems();
    return ok;
  }
  // At most one count read every 10 s (60 s after a failure): a burst of registry events must
  // never become a request storm against the Notifications app (26 Oct 2026: ~50 req/s).
  // An owner action (mark) forces a read; one landing during an in-flight read reruns once right after it.
  let inflight = false, nextAt = 0, again = false;
  async function refresh(force) {
    if (!installed()) { if (IN.subs.size && (force === true || Date.now() >= nextAt)) { nextAt = Date.now() + 10000; loadItems(); } return; }
    if (inflight) { if (force === true) again = true; return; }
    if (force !== true && Date.now() < nextAt) return;
    inflight = true; nextAt = Date.now() + 10000;
    loadItems();
    try {
      const r = await fetch('/notifications/api/count', { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) { nextAt = Date.now() + 60000; return; }
      const d = await r.json();
      const ch = d.unread !== S.unread || d.needs !== S.needs;
      Object.assign(S, { unread: d.unread | 0, needs: d.needs | 0, ok: true, at: Date.now() });
      if (ch) { paint(); window.dispatchEvent(new CustomEvent('wizard:notifications', { detail: { ...S } })); }
    } catch (e) { nextAt = Date.now() + 60000; } finally { inflight = false; if (again) { again = false; refresh(true); } }
  }
  // The Notifications window tells us its count as soon as something is marked read.
  addEventListener('message', e => {
    const d = e.data; if (e.origin !== location.origin || !d || d.type !== 'wizard:notifications:count') return;
    S.unread = d.unread | 0; S.needs = d.needs | 0; paint(); loadItems();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-chbell]')) return;
    e.preventDefault(); e.stopPropagation();
    if (typeof window.WizOpenApp === 'function') window.WizOpenApp('notifications');
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  addEventListener('wizard:apps', () => { refresh(); paint(); });
  // The inbox package came or went (skin-host fires wos:prefs): what Chats can hold changed, so recount.
  addEventListener('wos:prefs', () => { const on = chatsReady(); if (on !== FD.ready) { FD.ready = on; rerouted(); loadItems(); } });
  // Another tab on this device changed a choice.
  addEventListener('storage', e => { if (e && e.key === ROUTE_KEY) { ROUTES = readJson(ROUTE_KEY, {}); rerouted(); loadItems(); } });
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  setTimeout(refresh, 800);
  const nameOf = id => { const n = appName(id); return id === 'notifications' && n === 'notifications' ? 'Notifications' : n; };
  /* The list Settings › Notifications shows: Notifications (when installed), then every app with a feed, by name. */
  function routes() {
    const out = [];
    if (installed()) out.push({ id: 'notifications', name: nameOf('notifications'), route: route('notifications'), chats: inChats('notifications') });
    for (const id of feedList().sort((a, b) => appName(a).localeCompare(appName(b)))) out.push({ id, name: appName(id), route: route(id), chats: inChats(id) });
    return out;
  }

  /* THE Badge | Chats picker (Miguel, 1 Nov 2026: "one simple design everywhere"). Settings › Notifications and every
   * notification opened in Chats render this one function, and both write the one saved route above, so a change in
   * either place shows in the other at once (`wizard:notify-route`). Badge wears a badge dot, Chats a chat bubble. */
  const ROUTE_ICON = {
    badge: '<svg class="wos-route-ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5"/></svg>',
    chats: '<svg class="wos-route-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h10A1.5 1.5 0 0 1 14.5 4v6a1.5 1.5 0 0 1-1.5 1.5H7.5L4.5 14v-2.5H3A1.5 1.5 0 0 1 1.5 10V4A1.5 1.5 0 0 1 3 2.5z"/></svg>',
  };
  const escH = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function picker(id, { name, off = false } = {}) {
    id = String(id || ''); const nm = name || nameOf(id), cur = off ? 'badge' : route(id);
    return `<div class="st-seg st-nr-seg wos-route" role="radiogroup" aria-label="Where ${escH(nm)} notifications go">${[['badge', 'Badge'], ['chats', 'Chats']].map(([to, label]) => `<button type="button" role="radio" data-notify-route="${escH(id)}" data-notify-to="${to}" aria-checked="${cur === to}"${to === 'chats' && off ? ' disabled' : ''}>${ROUTE_ICON[to]}<span>${label}</span></button>`).join('')}</div>`;
  }
  /* Picked Badge from inside Chats: its items have already left Chats (setRoute). The shell's own toast says so, with
   * Undo, which puts the app back on Chats. `toast` is the shell's toast(icon, text, ms); the button is added here. */
  function movedToast(id, toast, ms = 5000) {
    id = String(id || ''); const back = route(id) === 'badge' ? 'chats' : 'badge';
    const text = `${nameOf(id)} moved to ${back === 'chats' ? 'badges' : 'Chats'} · `;
    try { toast?.('●', '', ms); } catch (e) {}
    const t = document.getElementById?.('toast'); if (!t) return null;
    const spans = t.querySelectorAll('span'); const tx = spans[spans.length - 1];
    if (tx) tx.textContent = text; else t.append(document.createTextNode(text));
    const b = document.createElement('button'); b.type = 'button'; b.className = 'wos-undo'; b.dataset.wosUndo = id; b.textContent = 'Undo';
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); setRoute(id, back); t.classList.remove('show', 'on'); });
    t.append(b);
    return b;
  }
  window.WosBell = { html, refresh, paint, watch, mark, readyCount, route, setRoute, inChats, routes, discover, picker, movedToast, nameOf, get chatsAvailable() { return chatsReady(); }, item: id => IN.items.find(i => i.id === String(id)) || null, items: () => IN.items, icon: BELL, get state() { return { ...S }; } };
})();
