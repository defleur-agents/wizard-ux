/* Look sync: the owner's skin and tweak choices are one set, the same on every device and app (Miguel, 1 Nov 2026).
 *
 * The shared copy is one small file in the owner's Files, Pages/wizard-look/look.json, read and written through the
 * Agent Service Pages file API (GET/PUT /wizard/v1/pages/<slug>/<file>: owner only, versioned, a stale save is a 409
 * carrying the newer text, every save kept in Pages history). It has no page.json, so it is never listed as a page.
 * Each device still paints its last copy (wos.skin, wos.skin-tweaks.v1) at first frame; the box copy then wins.
 *
 *   { version: 1, skin: { id, at }, tweaks: { '<author>/<id>': { on, at } }, views?: { desktop?: { id, at }, phone?: { id, at } }, updated }
 *
 * `at` = an observed logical revision (not a device clock). 0 = an old local seed: never newer than a
 * real change. Merging is per choice, newest wins, so two devices switching different tweaks keep both. A device with
 * nothing on never writes until its owner changes something. The first device with tweaks on seeds the box; a device
 * syncing for the first time with more tweaks on than the box's seeds replaces those seeds (the set in daily use beats
 * one just being set up) and keeps every real change made since. Shell views
 * (manifest `view`) are chosen per shell type (Miguel, 4 Nov 2026): `views.desktop` / `views.phone` = the view id worn on
 * every desktop / every phone ('' = Desks), merged per type, newest wins; all his desktops match, all his phones match.
 * A type with no entry (every file from before) keeps the old meaning: the view switched on in `tweaks` is worn on every
 * shell it supports, and those legacy view entries stay exclusive (the newest one on is kept). `views` is only written
 * once a per-type choice is made, so an untouched file stays byte for byte as it was; an older shell ignores `views`
 * (its parse drops unknown fields) and, if it saves, the file falls back to the old meaning. Offline or failing box: the device keeps its
 * own copy, retries with backoff, and sends its changes when the box answers. Other devices pick a change up on their
 * next load or when they come back to the foreground.
 *
 *   WosLookSync.create({ req, store, exp, skin }) → { sync, schedule, stop, state }   (started below for the shell) */
(() => {
  'use strict';
  const PATH = '/wizard/v1/pages/wizard-look/look.json', META = 'wos.look-sync.v1';
  const ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/, SKIN = /^[a-z0-9][a-z0-9-]{0,47}$/;
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const SHELLS = ['desktop', 'phone'];
  const at = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const empty = () => ({ version: 1, skin: null, tweaks: {} });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Lenient: anything malformed is dropped, the rest kept (the agent or an older shell may have written the file).
  function parse(value) {
    let j = value;
    if (typeof value === 'string') { try { j = JSON.parse(value); } catch (_) { return null; } }
    if (!isObj(j) || j.version !== 1) return null;
    const out = empty();
    if (isObj(j.skin) && typeof j.skin.id === 'string' && SKIN.test(j.skin.id)) out.skin = { id: j.skin.id, at: at(j.skin.at) };
    if (isObj(j.tweaks)) for (const [id, t] of Object.entries(j.tweaks)) if (ID.test(id) && isObj(t) && typeof t.on === 'boolean') out.tweaks[id] = { on: t.on, at: at(t.at) };
    if (isObj(j.views)) for (const s of SHELLS) { const v = j.views[s]; if (isObj(v) && typeof v.id === 'string' && (v.id === '' || ID.test(v.id))) (out.views ||= {})[s] = { id: v.id, at: at(v.at) }; }
    return out;
  }
  // Per choice, newest wins; a tie keeps the box's.
  function merge(box, mine) {
    const out = { version: 1, skin: box?.skin || null, tweaks: { ...(box?.tweaks || {}) } };
    if (mine?.skin && (!out.skin || mine.skin.at > out.skin.at)) out.skin = mine.skin;
    for (const [id, t] of Object.entries(mine?.tweaks || {})) if (!out.tweaks[id] || t.at > out.tweaks[id].at) out.tweaks[id] = t;
    for (const s of SHELLS) {  // per shell type, newest wins; the key only appears once a type has a choice
      const a = box?.views?.[s], b = mine?.views?.[s], v = b && (!a || b.at > a.at) ? b : a;
      if (v) (out.views ||= {})[s] = v;
    }
    return out;
  }
  const onIds = doc => Object.keys(doc?.tweaks || {}).filter(id => doc.tweaks[id].on).sort();
  const mixOn = mix => Object.keys(mix || {}).filter(id => ID.test(id) && mix[id] === true).sort();
  const pick = (doc, keep) => {
    const out = { version: 1, skin: doc.skin && keep(doc.skin) ? doc.skin : null, tweaks: Object.fromEntries(Object.entries(doc.tweaks).filter(([, t]) => keep(t))) };
    for (const s of SHELLS) if (doc.views?.[s] && keep(doc.views[s])) (out.views ||= {})[s] = doc.views[s];
    return out;
  };
  // The view each shell type wears by its own choice ({ desktop: id, phone: '' }); a type without one is left out.
  const shellViews = doc => Object.fromEntries(SHELLS.filter(s => doc?.views?.[s]).map(s => [s, doc.views[s].id]));
  const seeds = doc => pick(doc, t => !t.at), changes = doc => pick(doc, t => t.at > 0);
  // One shell view at a time (views = ids in catalog order): the newest one on wins, a tie keeps the first.
  function exclusive(doc, views) {
    const on = views.filter(id => doc.tweaks[id]?.on);
    if (on.length < 2) return doc;
    const keep = on.reduce((a, b) => (doc.tweaks[b].at > doc.tweaks[a].at ? b : a));
    const tweaks = { ...doc.tweaks };
    for (const id of on) if (id !== keep) tweaks[id] = { on: false, at: tweaks[keep].at };
    return { ...doc, tweaks };
  }

  function create({ req, store, exp, skin, now = () => Date.now(), later = (f, ms) => setTimeout(f, ms), cancel = t => clearTimeout(t), on = () => {} }) {
    const load = () => {
      try {
        const m = JSON.parse(store.getItem(META));
        if (isObj(m)) return { version: typeof m.version === 'string' ? m.version : null, synced: m.synced === true, pending: parse({ version: 1, ...(isObj(m.pending) ? m.pending : {}) }) || empty() };
      } catch (_) {}
      return { version: null, synced: false, pending: empty() };
    };
    let meta = load(), busy = false, again = false, timer = 0, fails = 0, off = false, applying = false, last = 'idle', boxDoc = null, known = null;
    const live = id => !known || known.has(id); // retired ids an old device still stores are no choice: never seeded, never counted
    // What a set switches on here: retired ids on the box are never worn, or this device would never match the box and
    // re-apply every tweak on every pass (settle() after each apply: a reload storm that flickers the whole shell).
    const wear = doc => onIds(doc).filter(live);
    const save = () => { try { store.setItem(META, JSON.stringify({ version: meta.version, synced: meta.synced, pending: { skin: meta.pending.skin, tweaks: meta.pending.tweaks, ...(meta.pending.views ? { views: meta.pending.views } : {}) } })); } catch (_) {} };
    let clock = 0;
    const observe = d => { clock = Math.max(clock, d?.skin?.at || 0, ...Object.values(d?.tweaks || {}).map(t => t.at || 0), ...Object.values(d?.views || {}).map(t => t.at || 0)); };
    observe(meta.pending);
    const stamp = () => ++clock;
    function renewPending(d) {
      observe(d);
      if (meta.pending.skin && (d?.skin?.at || 0) >= meta.pending.skin.at) meta.pending.skin.at = stamp();
      for (const [id, t] of Object.entries(meta.pending.tweaks)) if ((d?.tweaks[id]?.at || 0) >= t.at) t.at = stamp();
      for (const [shell, t] of Object.entries(meta.pending.views || {})) if ((d?.views?.[shell]?.at || 0) >= t.at) t.at = stamp();
    }
    const dirty = () => !!meta.pending.skin || Object.keys(meta.pending.tweaks).length > 0 || Object.keys(meta.pending.views || {}).length > 0;
    // Experience modules from before per-shell views have no `views`: they keep the old one-view-everywhere meaning.
    const perShell = () => { try { return isObj(exp.views); } catch (_) { return false; } };
