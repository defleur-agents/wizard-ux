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

  /* ---- Routing: Badge, Chats or Off, per app; and per System kind ---- */
  /* Off (Miguel, 2 Nov 2026): no badge and nothing in Chats; the item stays in Notifications' own history.
   * System (same day): notices about Wizard itself, not an app (app updates, app connections, Wizard updates), come
   * through Notifications but route on their own rows, default Off. A system notice that needs the owner (a failed
   * update, a connection waiting for his OK) never goes quiet: it follows Notifications' own choice instead.
   * A System row set to Badge counts on the Settings cog, and Settings lists them under Notifications. */
  const ROUTE_KEY = 'wos.notify.route.v1', ROUTE_DEFAULT = Object.freeze({ notifications: 'chats' });
  const APPID = /^[a-z0-9][a-z0-9-]{0,63}$/, TO = ['chats', 'badge', 'daily', 'off'];
  const SYSTEM = Object.freeze([
    { kind: 'app-updates', name: 'App updates', what: 'Apps updated overnight',
      title: /^(\d+ apps? updated|App updates need a look)$/i },
    { kind: 'connections', name: 'App connections', what: 'An app was connected to another',
      title: /^(App connection added|Connection needs your OK)$/i },
    { kind: 'wizard-updates', name: 'Wizard updates', what: 'Wizard itself was updated',
      title: /^(App Manager updated|Wizard OS updated|Your release needs you to finish an update)$/i },
  ]);
  const SYSID = /^system:([a-z-]{1,40})$/;
  const sysOf = id => { const m = SYSID.exec(String(id || '')); return m ? SYSTEM.find(k => k.kind === m[1]) || null : null; };
  const validId = id => APPID.test(id) || !!sysOf(id);
  let ROUTES = readJson(ROUTE_KEY, {});
  // Daily (one line in the Morning Report) is for Notifications' alerts and System notices only: an app's own items
  // (Mail, Messenger) would lose their point waiting a day, so its Daily is shown greyed out.
  const dailyOk = id => id === 'notifications' || !!sysOf(id);
  const route = id => { id = String(id || ''); const r = Object.prototype.hasOwnProperty.call(ROUTES, id) ? ROUTES[id] : sysOf(id) ? 'daily' : ROUTE_DEFAULT[id]; return TO.includes(r) && (r !== 'daily' || dailyOk(id)) ? r : 'badge'; };
  /* Saved on the box (Notifications /api/routes), so every device shows the same choice; this device keeps a copy for
   * a cold start or while Notifications is unreachable. A choice made offline is sent on the next sync. The first
   * sync on a box with nothing saved yet uploads this device's choices once. */
  const SYNC = { at: 0, pending: {}, busy: false, server: false };
  async function syncRoutes(force) {
    if (!installed() || SYNC.busy || (!force && Date.now() - SYNC.at < 30e3)) return;
    SYNC.busy = true; SYNC.at = Date.now();
    try {
      const up = Object.keys(SYNC.pending).length ? SYNC.pending : null;
      if (up) { const r = await fetch('/notifications/api/routes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routes: up }) }); if (r.ok) SYNC.pending = {}; }
      const r = await fetch('/notifications/api/routes', { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) return;
      const d = await r.json(); if (!d || typeof d.routes !== 'object') return;
      SYNC.server = true;
      if (!d.saved && Object.keys(ROUTES).length) {
        const keep = {}; for (const [k, v] of Object.entries(ROUTES)) if (validId(k) && TO.includes(v) && (v !== 'daily' || dailyOk(k))) keep[k] = v;
        if (Object.keys(keep).length) await fetch('/notifications/api/routes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routes: keep }) });
        return;
      }
      const next = { ...d.routes, ...SYNC.pending };
      if (JSON.stringify(next) !== JSON.stringify(ROUTES)) { ROUTES = next; writeJson(ROUTE_KEY, ROUTES); rerouted(); loadItems(); }
    } catch (e) {} finally { SYNC.busy = false; }
  }
  // Which System kind a Notifications item is: the sender's tags (`wizard-system` + kind), else its known title.
  function sysKind(it) {
    if (!it || it.app) return null;
    const tags = Array.isArray(it.tags) ? it.tags.map(String) : [];
    if (tags.includes('wizard-system')) { const k = SYSTEM.find(k => tags.includes(k.kind)); if (k) return k; }
    const t = String(it.title || '').trim();
    return SYSTEM.find(k => k.title.test(t)) || null;
  }
  // Needs the owner: tagged so, high priority, or a title that asks for him. These are never silenced by a System row.
  const needsYou = it => (Array.isArray(it.tags) && it.tags.includes('needs-you')) || (Number(it.priority) || 3) >= 4
    || /need(s)? (a look|your OK|you)/i.test(String(it.title || ''));
  // The route that decides one item: its app's, its System row's, or Notifications'.
  const routeIdOf = it => it.app ? it.app : (() => { const k = sysKind(it); return k && !needsYou(it) ? 'system:' + k.kind : 'notifications'; })();
  const chatsReady = () => !!window.WosSkinHost?.inboxList;
  // Effective: Chats only when Chats can list it (a package holds the inbox list) and, for an app, it has a feed.
  // Chats itself ('wizard') is the inbox and always keeps its own badge.
  function inChats(id) {
    id = String(id || '');
    if (!id || id === 'wizard' || route(id) !== 'chats' || !chatsReady()) return false;
    return id === 'notifications' || sysOf(id) ? installed() : known()[id]?.s === 'yes';
  }
  // Off: no badge anywhere and nothing in Chats (Notifications keeps it in its history).
  // Off or Daily: no badge here and nothing in Chats (Daily waits for the Morning Report instead).
  const isOff = id => { id = String(id || ''); return !!id && id !== 'wizard' && (route(id) === 'off' || route(id) === 'daily'); };
  function setRoute(id, to) {
    id = String(id || ''); if (!validId(id) || id === 'wizard' || !TO.includes(to) || (to === 'daily' && !dailyOk(id))) return false;
    if (route(id) === to) return true;
    ROUTES = { ...ROUTES, [id]: to }; writeJson(ROUTE_KEY, ROUTES);
    SYNC.pending = { ...SYNC.pending, [id]: to }; void syncRoutes(true);
    rerouted(); loadItems();
    return true;
  }
  // Something changed what goes where: drop items that no longer belong in Chats at once, recount every badge.
  function rerouted() {
    const keep = IN.items.filter(i => inChats(routeIdOf(i)));
    if (keep.length !== IN.items.length) { IN.items = Object.freeze(keep); for (const fn of [...IN.subs]) { try { fn(IN.items); } catch (e) {} } }
    window.WizCore?.workspaceNav?.rerouted?.();
    systemCount(); paint();
    window.dispatchEvent(new CustomEvent('wizard:notify-route'));
    inboxChanged();
  }

  function html() {
    if (!installed()) return '';
    // Routed to Chats or Off (or its window is open): the count already shows in one place, or nowhere, so no bell.
    if (inChats('notifications') || isOff('notifications') || (typeof window.WizAppOpen === 'function' && window.WizAppOpen('notifications'))) return '<button type="button" class="ch-bell" data-chbell hidden aria-hidden="true" tabindex="-1"></button>';
    const n = S.unread, lbl = n ? `Notifications, ${n} unread` : 'Notifications';
    return `<button type="button" class="ch-bell${S.needs ? ' needs' : ''}" data-chbell aria-label="${lbl}">${BELL}${n ? `<b>${n > 99 ? '99+' : n}</b>` : ''}</button>`;
  }
  function paint() {
    // The raw count; workspace-navigation shows it as a badge only while Notifications is set to Badge.
    // System notices are not Notifications' own: they count on their own rows (the Settings cog), never here.
    window.WizCore?.workspaceNav?.setCount('notifications', Math.max(0, S.unread - SY.away));
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
  /* Every Notifications item (not only Chats'): System rows read their history and counts from it. `SY.badge` = unread
   * System notices set to Badge (the Settings cog); `SY.away` = unread ones that are not Notifications' own count. */
  const NOTES = { all: [] }, SY = { badge: 0, away: 0 };
  function systemCount() {
    let badge = 0, away = 0;
    for (const i of NOTES.all) {
      if (i.read || i.archived) continue;
      const id = routeIdOf(i); if (!sysOf(id)) continue;
      away++; if (route(id) === 'badge') badge++;
    }
    const ch = badge !== SY.badge || away !== SY.away; SY.badge = badge; SY.away = away;
    if (ch) { paint(); window.dispatchEvent(new CustomEvent('wizard:system-notices', { detail: { n: badge } })); }
  }
  // Recent System notices for Settings › Notifications: a history, newest first (read, archived and needs-you ones too).
  const systemItems = (n = 8) => NOTES.all.filter(i => sysKind(i)).sort((a, b) => b.time - a.time).slice(0, n)
    .map(i => Object.freeze({ ...i, kind: sysKind(i).kind, kindName: sysKind(i).name, needs: needsYou(i) }));
  // Seen in Settings: unread System notices set to Badge are marked read (the cog clears).
  function seenSystem() {
    const ids = NOTES.all.filter(i => !i.read && !i.archived && sysOf(routeIdOf(i)) && route(routeIdOf(i)) === 'badge').map(i => i.id);
    if (!ids.length) return Promise.resolve(false);
    NOTES.all = Object.freeze(NOTES.all.map(i => ids.includes(i.id) ? Object.freeze({ ...i, read: true }) : i)); systemCount();
    return mark(ids, { read: true });
  }
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  // The editor's short message is a preview, not the source. Keep the complete original separately, including
  // paragraphs and long diagnostic output. Legacy items without editor details use their complete body.
  const cleanItem = i => Object.freeze({ id: str(i.id, 128), title: str(i.title, 300), message: str(i.message, 8000), details: String(i.details || i.message || ''), time: Number(i.time) || 0, source: str(i.source, 40), priority: Number(i.priority) || 3, link: str(i.link, 2000), read: !!i.read, archived: !!i.archived,
    tags: Object.freeze((Array.isArray(i.tags) ? i.tags : []).slice(0, 8).map(t => str(t, 40))),
    ...(i.app ? { app: str(i.app, 64), appName: str(i.appName, 80), key: str(i.key, 200), open: str(i.open, 500) } : {}) });

  /* App inbox feeds (Wizard OS inbox feed v1): an installed app that serves GET /<app>/api/inbox → { inbox: 1, items }
   * lists what needs the owner now (what its badge counts), one item per thing. Read only for apps set to Chats (and
   * once per app to learn which apps have one, for the Settings list). A thing handled in the app leaves its feed, so
   * its row clears by itself. Archive / Snooze are inbox marks (Notifications /api/marks, else this device) covering
   * the item's activity time: newer activity brings it back. Only a definite answer (404/405/410, or a 200 that is
   * not a feed) counts as "no feed", asked again after 30 min; an app that was restarting is asked again in 2 min. */
  const FEED_KEY = 'wos.inbox.feeds.v2', MARK_KEY = 'wos.inbox.appmarks.v1', NO_AGAIN = 30 * 60e3, RETRY = 2 * 60e3;
  const FEED_SKIP = new Set(['notifications', 'wizard', 'wizard-agent-service', 'wizard-connection-router', 'wizard-ux', 'setup', 'side-button', 'pages', 'app-store', 'agents', 'troubleshooter']);
  const FD = { known: null, last: {}, marks: null, retry: {}, probing: null, ready: null, more: {} };
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
    if (!(d && d.inbox === 1 && Array.isArray(d.items))) return null;
    FD.more[id] = d.more === true || d.items.length > 50; return d.items;
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
    if (!IN.subs.size) return loadNotes();
    const seq = ++IN.seq;
    try {
      // Notifications' list is read whenever it is installed: System rows and the Settings cog count from it too.
      const wantNotes = installed();
      const [notes, apps] = await Promise.all([
        wantNotes ? fetch('/notifications/api/items?view=all&limit=200', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null, () => null) : null,
        loadFeeds().catch(() => []),
      ]);
      if (seq !== IN.seq) return;
      // A failed Notifications read keeps its last items. Only what routes to Chats is listed there.
      if (wantNotes && notes && Array.isArray(notes.items)) NOTES.all = Object.freeze(notes.items.filter(i => i && i.id).map(cleanItem));
      const base = !wantNotes ? [] : NOTES.all.filter(i => inChats(routeIdOf(i)));
      systemCount();
      const before = JSON.stringify(IN.items);
      IN.items = Object.freeze([...base, ...apps].filter(i => i && i.id).map(cleanItem).sort((a, b) => b.time - a.time));
      for (const fn of [...IN.subs]) { try { fn(IN.items); } catch (e) {} }
      if (before !== JSON.stringify(IN.items)) inboxChanged();
    } catch (e) {}
  }
  // No Chats list watching: still read Notifications' list (at the bell's cadence) for System counts.
  async function loadNotes() {
    if (!installed()) return;
    try {
      const r = await fetch('/notifications/api/items?view=all&limit=200', { cache: 'no-store', credentials: 'same-origin' });
      const d = r.ok ? await r.json() : null;
      if (d && Array.isArray(d.items)) { NOTES.all = Object.freeze(d.items.filter(i => i && i.id).map(cleanItem)); systemCount(); }
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
  // Chats shows "50+" when an app routed here lists only its newest items (Mail: the newest 50 unread).
  const readyMore = () => !!window.WosSkinHost?.inboxList && Object.keys(FD.more).some(id => FD.more[id] && inChats(id));
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
    void syncRoutes(force === true);
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
  const nameOf = id => { if (sysOf(id)) return sysOf(id).name; const n = appName(id); return id === 'notifications' && n === 'notifications' ? 'Notifications' : n; };
  /* System rows for Settings › Notifications (only while Notifications is installed: it carries them). */
  const systemRoutes = () => installed() ? SYSTEM.map(k => ({ id: 'system:' + k.kind, kind: k.kind, name: k.name, what: k.what, route: route('system:' + k.kind), chats: inChats('system:' + k.kind) })) : [];
  /* The list Settings › Notifications shows: Notifications (when installed), then every app with a feed, by name. */
  function routes() {
    const out = [];
    if (installed()) out.push({ id: 'notifications', name: nameOf('notifications'), route: route('notifications'), chats: inChats('notifications') });
    for (const id of feedList().sort((a, b) => appName(a).localeCompare(appName(b)))) out.push({ id, name: appName(id), route: route(id), chats: inChats(id) });
    return out;
  }

  /* THE Chats | Badge | Off picker, loudest to quietest (Miguel, 2 Nov 2026: Chats one end, Off the other, Badge between).
   * Was: the Badge | Chats picker (Miguel, 1 Nov 2026: "one simple design everywhere"). Settings › Notifications and every
   * notification opened in Chats render this one function, and both write the one saved route above, so a change in
   * either place shows in the other at once (`wizard:notify-route`). Badge wears a badge dot, Chats a chat bubble. */
  const ROUTE_ICON = {
    badge: '<svg class="wos-route-ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5"/></svg>',
    chats: '<svg class="wos-route-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h10A1.5 1.5 0 0 1 14.5 4v6a1.5 1.5 0 0 1-1.5 1.5H7.5L4.5 14v-2.5H3A1.5 1.5 0 0 1 1.5 10V4A1.5 1.5 0 0 1 3 2.5z"/></svg>',
    daily: '<svg class="wos-route-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12.5h12M4.5 12.5a3.5 3.5 0 0 1 7 0M8 3.5v2M3.2 6.7l1.4 1.4M12.8 6.7l-1.4 1.4"/></svg>',
    off: '<svg class="wos-route-ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M4.2 11.8l7.6-7.6"/></svg>',
  };
  const escH = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function picker(id, { name, off = false } = {}) {
    id = String(id || ''); const nm = name || nameOf(id), cur = off && route(id) === 'chats' ? 'badge' : route(id);
    return `<div class="st-seg st-nr-seg wos-route" role="radiogroup" aria-label="Where ${escH(nm)} notifications go">${[['chats', 'Chats'], ['badge', 'Badge'], ['daily', 'Daily'], ['off', 'Off']].map(([to, label]) => `<button type="button" role="radio" data-notify-route="${escH(id)}" data-notify-to="${to}" aria-checked="${cur === to}"${(to === 'chats' && off) || (to === 'daily' && !dailyOk(id)) ? ' disabled' : ''}${to === 'daily' ? ` title="${dailyOk(id) ? 'One line in tomorrow’s Morning Report' : `${escH(nm)} would lose its point waiting a day`}"` : ''}>${ROUTE_ICON[to]}<span>${label}</span></button>`).join('')}</div>`;
  }
  /* Picked Badge from inside Chats: its items have already left Chats (setRoute). The shell's own toast says so, with
   * Undo, which puts the app back on Chats. `toast` is the shell's toast(icon, text, ms); the button is added here. */
  function movedToast(id, toast, ms = 5000, from) {
    id = String(id || ''); const now = route(id), back = TO.includes(from) && from !== now ? from : now === 'badge' ? 'chats' : 'badge';
    const text = now === 'off' ? `${nameOf(id)} turned off · ` : now === 'daily' ? `${nameOf(id)} moved to the Morning Report · ` : `${nameOf(id)} moved to ${now === 'badge' ? 'badges' : 'Chats'} · `;
    try { toast?.('●', '', ms); } catch (e) {}
    const t = document.getElementById?.('toast'); if (!t) return null;
    const spans = t.querySelectorAll('span'); const tx = spans[spans.length - 1];
    if (tx) tx.textContent = text; else t.append(document.createTextNode(text));
    const b = document.createElement('button'); b.type = 'button'; b.className = 'wos-undo'; b.dataset.wosUndo = id; b.textContent = 'Undo';
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); setRoute(id, back); t.classList.remove('show', 'on'); });
    t.append(b);
    return b;
  }
  window.WosBell = { html, refresh, paint, watch, mark, readyCount, readyMore, route, setRoute, inChats, isOff, dailyOk, syncRoutes, routes, systemRoutes, systemItems, seenSystem, routeIdOf, get systemCount() { return SY.badge; }, discover, picker, movedToast, nameOf, get chatsAvailable() { return chatsReady(); }, item: id => IN.items.find(i => i.id === String(id)) || null, items: () => IN.items, icon: BELL, get state() { return { ...S }; } };
})();
