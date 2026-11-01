/* Look sync: the owner's skin and tweak choices are one set, the same on every device and app (Miguel, 1 Nov 2026).
 *
 * The shared copy is one small file in the owner's Files, Pages/wizard-look/look.json, read and written through the
 * Agent Service Pages file API (GET/PUT /wizard/v1/pages/<slug>/<file>: owner only, versioned, a stale save is a 409
 * carrying the newer text, every save kept in Pages history). It has no page.json, so it is never listed as a page.
 * Each device still paints its last copy (wos.skin, wos.skin-tweaks.v1) at first frame; the box copy then wins.
 *
 *   { version: 1, skin: { id, at }, tweaks: { '<author>/<id>': { on, at } }, updated }
 *
 * `at` = when that choice was made (ms). 0 = carried over from a device's old local set (a seed): never newer than a
 * real change. Merging is per choice, newest wins, so two devices switching different tweaks keep both. A device with
 * nothing on never writes until its owner changes something. The first device with tweaks on seeds the box; a device
 * syncing for the first time with more tweaks on than the box's seeds replaces those seeds (the set in daily use beats
 * one just being set up) and keeps every real change made since. Shell views
 * (manifest `view`) stay exclusive: the newest one switched on is kept. Offline or failing box: the device keeps its
 * own copy, retries with backoff, and sends its changes when the box answers. Other devices pick a change up on their
 * next load or when they come back to the foreground.
 *
 *   WosLookSync.create({ req, store, exp, skin }) → { sync, schedule, stop, state }   (started below for the shell) */
(() => {
  'use strict';
  const PATH = '/wizard/v1/pages/wizard-look/look.json', META = 'wos.look-sync.v1';
  const ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/, SKIN = /^[a-z0-9][a-z0-9-]{0,47}$/;
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
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
    return out;
  }
  // Per choice, newest wins; a tie keeps the box's.
  function merge(box, mine) {
    const out = { version: 1, skin: box?.skin || null, tweaks: { ...(box?.tweaks || {}) } };
    if (mine?.skin && (!out.skin || mine.skin.at > out.skin.at)) out.skin = mine.skin;
    for (const [id, t] of Object.entries(mine?.tweaks || {})) if (!out.tweaks[id] || t.at > out.tweaks[id].at) out.tweaks[id] = t;
    return out;
  }
  const onIds = doc => Object.keys(doc?.tweaks || {}).filter(id => doc.tweaks[id].on).sort();
  const mixOn = mix => Object.keys(mix || {}).filter(id => ID.test(id) && mix[id] === true).sort();
  const pick = (doc, keep) => ({ version: 1, skin: doc.skin && keep(doc.skin) ? doc.skin : null, tweaks: Object.fromEntries(Object.entries(doc.tweaks).filter(([, t]) => keep(t))) });
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
    const save = () => { try { store.setItem(META, JSON.stringify({ version: meta.version, synced: meta.synced, pending: { skin: meta.pending.skin, tweaks: meta.pending.tweaks } })); } catch (_) {} };
    const dirty = () => !!meta.pending.skin || Object.keys(meta.pending.tweaks).length > 0;
    const views = () => { try { return (exp.state?.tweaks || []).filter(t => t.view).map(t => t.id); } catch (_) { return []; } };
    // What this device runs now, as seeds.
    function local() {
      const doc = empty(), s = skin.chosen;
      if (typeof s === 'string' && SKIN.test(s)) doc.skin = { id: s, at: 0 };
      for (const id of mixOn(exp.mix)) if (live(id)) doc.tweaks[id] = { on: true, at: 0 };
      return doc;
    }
    const absent = () => Object.assign(new Error('absent'), { absent: true });
    async function get() {
      const r = await req(PATH, { cache: 'no-store', credentials: 'same-origin' });
      const j = await r.json().catch(() => null);
      if (r.status === 200 && typeof j?.text === 'string') return { doc: parse(j.text) || empty(), version: typeof j.version === 'string' ? j.version : null };
      if (r.status === 404 && j?.error === 'file_not_found') return { doc: null, version: null };
      if (r.status === 404 || r.status === 403) throw absent(); // no Pages on this box, or not the owner: this device only
      throw new Error('look ' + r.status);
    }
    async function put(doc, version) {
      const text = JSON.stringify({ ...doc, updated: new Date(now()).toISOString() }, null, 1) + '\n';
      const r = await req(PATH, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, version }) });
      const j = await r.json().catch(() => null);
      if (r.ok && typeof j?.version === 'string') return { ok: true, version: j.version };
      if (r.status === 409 && isObj(j?.current)) return { ok: false, doc: j.current.exists ? parse(j.current.text) || empty() : null, version: typeof j.current.version === 'string' ? j.current.version : null };
      if (r.status === 404 || r.status === 403) throw absent();
      throw new Error('look ' + r.status);
    }
    // Wear the box's set here. Our own listeners ignore the events this raises.
    function adopt(doc) {
      doc = exclusive(doc, views());
      applying = true;
      try {
        if (doc.skin && doc.skin.id !== skin.current && skin.has(doc.skin.id)) skin.set(doc.skin.id);
        const want = wear(doc);
        if (!same(want, mixOn(exp.mix).filter(live))) exp.adopt(Object.fromEntries(want.map(id => [id, true])));
      } finally { applying = false; }
    }
    // Drop only what this pass delivered; a change made meanwhile stays queued.
    function sent(p) {
      if (p.skin && meta.pending.skin && meta.pending.skin.at === p.skin.at) meta.pending.skin = null;
      for (const [id, t] of Object.entries(p.tweaks)) if (meta.pending.tweaks[id]?.at === t.at) delete meta.pending.tweaks[id];
    }
    async function sync() {
      if (off) return;
      if (busy) { again = true; return; }
      busy = true; cancel(timer); timer = 0; last = 'syncing';
      try {
        if (!known) try { known = new Set(await exp.tweakIds()); } catch (_) { /* catalog unreadable now: count every id */ }
        let { doc, version } = await get();
        for (let tries = 0; tries < 4; tries++) {
          const pending = JSON.parse(JSON.stringify(meta.pending));
          let want = null;
          if (!doc) { const mine = merge(local(), pending); if (onIds(mine).length || dirty()) want = mine; } // seed; an untouched empty device never writes
          else if (dirty()) want = merge(doc, pending);
          // First sync of a device whose old local set is bigger than the box's seeds: its seeds replace them; real changes stay.
          else if (!meta.synced && onIds(local()).length > onIds(seeds(doc)).filter(live).length) want = merge(changes(doc), local());
          if (want) want = exclusive(want, views());
          if (want && !same(want, doc)) {
            const w = await put(want, version);
            if (!w.ok) { doc = w.doc; version = w.version; continue; } // another device saved first: merge onto theirs
            doc = want; version = w.version; sent(pending);
          } else if (doc) sent(pending);
          if (doc) { meta.version = version; meta.synced = true; boxDoc = doc; adopt(doc); }
          save(); last = 'ok'; break;
        }
        if (last !== 'ok') throw new Error('look busy'); // four other saves in a row: try again later
        fails = 0;
      } catch (e) {
        if (e?.absent) { off = true; last = 'local'; }
        else { last = 'offline'; fails++; timer = later(sync, Math.min(60000, 2000 * 2 ** Math.min(fails, 5))); }
      } finally {
        busy = false; on(last);
        if (again) { again = false; schedule(); }
      }
    }
    function schedule(ms = 600) { if (off) return; cancel(timer); timer = later(sync, ms); }
    function tweakChoice(id, value) {
      if (applying || !ID.test(String(id))) return;
      meta.pending.tweaks[id] = { on: !!value, at: now() }; save(); schedule();
    }
    function skinChoice(id) {
      if (applying || typeof id !== 'string' || !SKIN.test(id)) return;
      meta.pending.skin = { id, at: now() }; save(); schedule();
    }
    // Views are known once the tweaks have loaded. A box copy with two views on (an older client, the agent) is fixed
    // on the box too (the newest one stays), so a stale view never comes back; a device-only both-on is fixed here.
    function settle() {
      if (applying || busy || !views().length) return;
      let want;
      if (boxDoc && !dirty()) {
        const fixed = exclusive(boxDoc, views());
        if (!same(fixed, boxDoc)) {
          for (const [id, t] of Object.entries(fixed.tweaks)) if (!same(t, boxDoc.tweaks[id])) meta.pending.tweaks[id] = t;
          boxDoc = fixed; save(); schedule(0);
        }
        want = wear(fixed);
      } else want = wear(exclusive(local(), views()));
      const mine = local();
      if (!same(want, onIds(mine))) { applying = true; try { exp.adopt(Object.fromEntries(want.map(id => [id, true]))); } finally { applying = false; } }
    }
    return {
      sync, schedule, tweakChoice, skinChoice, settle,
      stop() { off = true; cancel(timer); },
      get state() { return { last, off, busy, synced: meta.synced, pending: JSON.parse(JSON.stringify(meta.pending)) }; },
    };
  }

  window.WosLookSync = { create, parse, merge, exclusive, PATH, current: null };
  const E = window.WosExperience, S = window.WosSkin;
  if (!E || !S || typeof window.fetch !== 'function' || typeof E.adopt !== 'function') return;
  const sync = create({
    req: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }),
    store: localStorage, exp: E,
    skin: { get chosen() { return S.chosen; }, get current() { return S.current; }, has: id => S.list.some(s => s.id === id), set: id => S.set(id) },
  });
  window.WosLookSync.current = sync;
  window.addEventListener('wos:tweak-choice', e => sync.tweakChoice(e.detail?.id, e.detail?.on));
  window.addEventListener('wos:skin', e => sync.skinChoice(e.detail));
  window.addEventListener('wos:experience', () => { if (!E.state.busy) sync.settle(); });
  // Back in the foreground: another device may have changed the set meanwhile.
  let woke = 0;
  const wake = () => { if (document.hidden || Date.now() - woke < 3000) return; woke = Date.now(); void sync.sync(); };
  for (const type of ['focus', 'online', 'pageshow']) window.addEventListener(type, wake);
  document.addEventListener('visibilitychange', wake);
  woke = Date.now(); void sync.sync();
})();
