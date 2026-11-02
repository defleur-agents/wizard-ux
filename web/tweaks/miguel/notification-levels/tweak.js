/* Notification levels (Miguel, 2 Nov 2026): every source goes to one place, loudest to quietest:
 *   Chats · Badge · Morning report · Off
 * Morning report (stored as `daily`) = one line in the next Morning Report (its Overnight section reads Notifications
 * /api/daily); only for Notifications' own alerts and System notices, greyed out for an app's feed (Mail, Messenger),
 * which would lose its point waiting a day. Off = no badge, nothing in Chats, kept in Notifications' own history.
 *
 * System: notices about Wizard itself (app updates, app connections, Wizard updates) come through Notifications but
 * route on their own rows (`system:<kind>`), default Morning report. A System notice that needs the owner (tagged
 * `needs-you`, priority 4+, or a title asking for him) never goes quiet: it routes as Notifications. System notices set
 * to Badge count on the Settings cog and as "N new from Wizard" in Settings; opening Settings › Notifications is
 * seeing them (marked read). A notice is System when its sender tags it `wizard-system,<kind>`, else by known title.
 *
 * Choices are saved on the box (Notifications /api/routes), so every device shows the same; this device's copy covers
 * a cold start, a choice made offline is sent on the next sync, and a box with nothing saved takes this device's
 * choices once. Everything here is the core `notify-routing` part (core/notif-bell.js), replaced through the skin
 * host's `notify` capability; switching the tweak off brings back stock Badge | Chats. */
const TO = ['chats', 'badge', 'daily', 'off'];
const APPID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SYSTEM = [
  { kind: 'app-updates', name: 'App updates', title: /^(\d+ apps? updated|App updates need a look)$/i },
  { kind: 'connections', name: 'App connections', title: /^(App connection added|Connection needs your OK)$/i },
  { kind: 'wizard-updates', name: 'Wizard updates', title: /^(App Manager updated|Wizard OS updated|Your release needs you to finish an update)$/i },
];
const SYSID = /^system:([a-z-]{1,40})$/;
const sysOf = id => { const m = SYSID.exec(String(id || '')); return m ? SYSTEM.find(k => k.kind === m[1]) || null : null; };
const validId = id => APPID.test(id) || !!sysOf(id);
const dailyOk = id => id === 'notifications' || !!sysOf(id);
const LABEL = { chats: 'Chats', badge: 'Badge', daily: 'Morning report', off: 'Off' };
// The Morning Report's own coffee cup (its house sigil, sigils.css .sg-coffee), so the choice reads as that app.
const CUP = 'M96 235H349V236Q353 236 357 236Q381 236 399 253Q416 270 416 295Q416 320 399 337Q381 354 357 354Q346 354 336 351C316 389 275 414 222 414C148 414 96 365 96 297V281H349V297C349 306 348 315 346 323Q351 325 357 325Q369 325 378 316Q387 307 387 295Q387 282 378 274Q369 265 357 265Q353 265 349 266V260H96ZM173 213Q162 199 163 181Q164 172 171 156Q176 144 176 138Q177 130 172 122Q169 117 170 110Q172 104 177 101Q183 97 189 99Q195 100 199 105Q209 123 207 141Q206 152 199 168Q195 180 194 184Q194 189 198 194Q202 199 201 205Q200 212 195 216Q190 220 184 219Q177 218 173 213ZM251 213Q240 199 241 181Q242 172 249 156Q254 144 254 138Q255 130 250 122Q247 117 248 110Q250 104 255 101Q260 97 267 99Q273 100 276 105Q287 123 285 141Q284 152 277 168Q273 180 272 184Q272 189 275 194Q280 199 279 205Q278 212 273 216Q268 220 262 219Q255 218 251 213Z';
const ICON = {
  daily: { viewBox: '0 0 512 512', d: CUP, cls: 'wos-route-mr' },
  off: { viewBox: '0 0 16 16', circle: [8, 8, 5.5], d: 'M4.2 11.8l7.6-7.6' },
};

// Which System kind a Notifications item is: the sender's tags (`wizard-system` + kind), else its known title.
function sysKind(it) {
  if (!it || it.app) return null;
  const tags = Array.isArray(it.tags) ? it.tags.map(String) : [];
  if (tags.includes('wizard-system')) { const k = SYSTEM.find(k => tags.includes(k.kind)); if (k) return k; }
  const t = String(it.title || '').trim();
  return SYSTEM.find(k => k.title.test(t)) || null;
}
// Needs the owner: tagged so, high priority, or a title that asks for him. Never silenced by a System row.
const needsYou = it => (Array.isArray(it.tags) && it.tags.includes('needs-you')) || (Number(it.priority) || 3) >= 4
  || /need(s)? (a look|your OK|you)/i.test(String(it.title || ''));

function levels(api, now = () => Date.now()) {
  let host = null, notes = [], snapshot = null;
  const seen = new Set();  // marked read here, until Notifications' list says so too
  const SYNC = { at: 0, pending: {}, busy: false };
  const route = id => host ? host.route(id) : 'badge';
  const unread = i => !i.read && !i.archived && !seen.has(i.id);
  const sourceOf = it => { const k = sysKind(it); return k && !needsYou(it) ? 'system:' + k.kind : 'notifications'; };
  const badged = () => notes.filter(i => unread(i) && sysOf(sourceOf(i)) && route(sourceOf(i)) === 'badge');
  const recent = () => notes.filter(i => sysKind(i)).sort((a, b) => b.time - a.time).slice(0, 8)
    .map(i => ({ title: i.title || sysKind(i).name, text: String(i.message || '').slice(0, 160), time: i.time, fresh: !i.read && !i.archived && !seen.has(i.id), needs: needsYou(i) }));
  async function sync(force) {
    if (!host || !host.installed() || SYNC.busy || (!force && now() - SYNC.at < 30e3)) return;
    SYNC.busy = true; SYNC.at = now();
    try {
      const up = Object.keys(SYNC.pending).length ? { ...SYNC.pending } : null;
      if (up && await api.notify.routes.save(up)) for (const k of Object.keys(up)) if (SYNC.pending[k] === up[k]) delete SYNC.pending[k];
      const d = await api.notify.routes.get();
      if (!d || !d.routes || typeof d.routes !== 'object') return;
      const mine = host.stored();
      if (!d.saved && Object.keys(mine).length) {
        // A box with nothing saved yet takes this device's choices once.
        const keep = {}; for (const [k, v] of Object.entries(mine)) if (validId(k) && TO.includes(v) && (v !== 'daily' || dailyOk(k))) keep[k] = v;
        if (Object.keys(keep).length) await api.notify.routes.save(keep);
        return;
      }
      host.adopt({ ...d.routes, ...SYNC.pending });
    } catch (_) {} finally { SYNC.busy = false; }
  }
  return {
    attach(h) { host = h; void sync(true); },
    route: (id, stored) => {
      const r = stored !== undefined ? stored : sysOf(id) ? 'daily' : id === 'notifications' ? 'chats' : undefined;
      return TO.includes(r) && (r !== 'daily' || dailyOk(id)) ? r : 'badge';
    },
    accepts: (id, to) => validId(id) && TO.includes(to) && (to !== 'daily' || dailyOk(id)),
    choices: (id, name) => TO.map(to => ({ to, label: LABEL[to], ...(ICON[to] ? { icon: ICON[to] } : {}),
      ...(to === 'daily' ? { disabled: !dailyOk(id), title: dailyOk(id) ? 'One line in tomorrow’s Morning Report' : `${name} would lose its point waiting for the Morning Report` } : {}) })),
    // Morning report and Off: no badge here and nothing in Chats.
    quiet: (id, r) => r === 'off' || r === 'daily',
    carried: id => !!sysOf(id),
    sourceOf,
    name: id => sysOf(id)?.name || '',
    describe(r, off) {
      if (sysOf(r.id)) return r.route === 'daily' ? 'In the Morning Report · once a day' : r.route === 'off' ? 'Off · listed below' : r.route === 'chats' && !off ? 'In Chats' : 'Badge on the Settings cog';
      return r.route === 'daily' ? 'In the Morning Report · once a day' : r.route === 'off' ? 'Off · kept in its own history' : r.route === 'chats' && !off ? 'In Chats · no badge on its icon' : 'Badge on its icon · not in Chats';
    },
    // "Notifications go to", "App updates go to", "Messenger notifications go to" (never "Notifications notifications").
    ask: (id, name) => id === 'notifications' || sysOf(id) ? `${name} go to` : `${name} notifications go to`,
    moved(id, r, from, name) {
      const back = TO.includes(from) && from !== r ? from : r === 'badge' ? 'chats' : 'badge';
      const text = r === 'off' ? `${name} turned off · ` : r === 'daily' ? `${name} moved to the Morning Report · ` : `${name} moved to ${r === 'badge' ? 'badges' : 'Chats'} · `;
      return { back, text };
    },
    intro: () => ({ lead: [['Each app tells you in one place: a thread in '], ['Chats', true], [' that waits with Archive and Snooze, a '], ['Badge', true], [' on its icon, a line in the '], ['Morning report', true], [', or '], ['Off', true], ['. The Chats badge counts everything waiting in Chats.']],
      foot: 'Apps not listed here only show badges. The same on every device.' }),
    groups: () => host && host.installed() ? [{ key: 'sys', title: 'System', hint: 'About Wizard itself, not your apps. Anything that needs you, like a failed update, still reaches you as Notifications do.',
      rows: SYSTEM.map(k => 'system:' + k.kind), list: { title: 'Recent', items: snapshot || recent() } }] : [],
    attention: () => { const n = badged().length; return n ? { n, label: 'new from Wizard', short: 'new' } : null; },
    readsAll: () => true,
    notes(items) { notes = Array.isArray(items) ? items : []; for (const id of [...seen]) { const i = notes.find(x => x.id === id); if (!i || i.read || i.archived) seen.delete(id); } },
    picked(id, to) { SYNC.pending = { ...SYNC.pending, [id]: to }; void sync(true); },
    tick(force) { void sync(force); },
    // Opening Settings › Notifications is seeing the System notices: the cog clears, the list keeps their dots.
    entered() {
      snapshot = recent();
      const ids = badged().map(i => i.id); if (!ids.length || !host) return;
      for (const id of ids) seen.add(id);
      host.changed(); void host.mark(ids, { read: true });
    },
    left() { snapshot = null; },
  };
}

export default function setup(api) {
  if (!api.notify) return () => {};
  api.notify.routing(levels(api), { version: 1 });
  return () => {};
}
