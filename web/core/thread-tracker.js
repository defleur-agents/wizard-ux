/* Thread tracker (tweak wizard/thread-tracker, off by default).
 *
 * The asks inside one thread, kept by the Agent Service from each reply's hidden status line, drawn as
 *   - a strip under the thread title ("7 asks · ●2 ●2 ●3") that opens into Your move / Running / Finished not seen,
 *   - small dots on every thread row in Chats (counts of needs-you / running / finished-not-seen),
 *   - Reply on any message (a quote above the composer, a header on the sent bubble: see chat-kit reply.quote).
 * The chat itself stays an ordinary linear chat: nothing here moves a message. Tapping a row only scrolls to the
 * reply that covers it (chats.js jumpToMessage) and flashes it.
 *
 * Data: GET /wizard/v1/thread-items?thread=<id>[&agent=<id>] → { items, counts }, POST …/seen { thread, agent, ids },
 * GET …/counts → { threads: { '<agent>/<thread>': counts } }. Seen is stored on the box, so phone and desktop agree.
 * Everything paints from local state first (a tap never waits on the box); the box then confirms.
 *
 *   WosThreadTracker.on() · load(sid, agent) · stripHtml(sid, agent) · dots(sid, agent) · dotsNode(sid, agent) · loadCounts()
 *   · click(e, { sid, agent, jump }) · itemFor(message) · isOpen() · close() · repaint()
 */
(() => {
  'use strict';
  const ID = 'wizard/thread-tracker';
  const BASE = '/wizard/v1/thread-items';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const on = () => { try { return (document.documentElement.dataset.tweaks || '').split(' ').includes(ID); } catch (_) { return false; } };
  const key = (sid, agent) => `${agent || 'hermes'}/${sid}`;
  const threads = new Map(); // key → { items, at, loading }
  let counts = {}, countsAt = 0, countsLoading = false;
  const openKeys = new Set(), ackKeys = new Set();
  let opened = null; // the key of the one open dropdown (a tap outside closes it)
  const pendingSeen = new Map(); // key → seen writes in flight
  const seenLocally = new Map(); // key → Set(id@updated_at): taps the box has not confirmed yet

  const isSeen = i => i.seen === true;
  const tally = items => {
    const out = { needs_you: 0, running: 0, done_unseen: 0, blocked: 0, acknowledged: 0, total: 0 };
    for (const i of items) {
      out.total++;
      if (isSeen(i) && (i.state === 'done' || (i.state === 'needs_you' && i.try))) out.acknowledged++;
      else if (i.state === 'done') out.done_unseen++;
      else if (i.state === 'blocked') out.blocked++;
      else if (i.state === 'needs_you') out.needs_you++;
      else out.running++;
    }
    return out;
  };
  const ago = ms => {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  };
  const req = (path, init) => fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
  const agentQ = agent => (agent && agent !== 'hermes' ? `&agent=${encodeURIComponent(agent)}` : '');

  function merge(k, items) {
    const mine = seenLocally.get(k);
    const list = (items || []).map(i => (mine?.has(`${i.id}@${i.updated_at}`) ? { ...i, seen: true } : i));
    for (const i of list) if (i.seen) mine?.delete(`${i.id}@${i.updated_at}`);
    return list;
  }
  async function load(sid, agent = '') {
    if (!on() || !sid || sid === '__new__') return;
    const k = key(sid, agent), cur = threads.get(k);
    if (cur?.loading || (cur && Date.now() - cur.at < 2500)) return;
    threads.set(k, { items: cur?.items || [], at: Date.now(), loading: true });
    try {
      const r = await req(`${BASE}?thread=${encodeURIComponent(sid)}${agentQ(agent)}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const items = merge(k, j.items);
      const changed = JSON.stringify(items) !== JSON.stringify(cur?.items || []);
      threads.set(k, { items, at: Date.now(), loading: false });
      if (changed) { counts[k] = tally(items); changedEvent(); }
    } catch (_) { threads.set(k, { items: cur?.items || [], at: Date.now(), loading: false }); }
  }
  async function loadCounts(force = false) {
    if (!on() || countsLoading || (!force && Date.now() - countsAt < 4000)) return;
    countsLoading = true;
    try {
      const r = await req(`${BASE}/counts`);
      if (r.ok) {
        const next = (await r.json())?.threads || {};
        // A thread open in this shell knows its own latest; keep that over a poll that raced a tap.
        // Only a tap the box has not confirmed yet is kept over the poll; otherwise the poll is the newer truth, and a
        // loaded thread whose tally moved is reloaded so its strip follows.
        for (const [k, t] of threads) {
          if (!t.items.length) continue;
          if (pendingSeen.get(k) > 0 && next[k]) next[k] = tally(t.items);
          else if (JSON.stringify(next[k] || null) !== JSON.stringify(counts[k] || null) && !t.loading) { t.at = 0; const s = k.indexOf('/'); load(k.slice(s + 1), k.slice(0, s) === 'hermes' ? '' : k.slice(0, s)); }
        }
        if (JSON.stringify(next) !== JSON.stringify(counts)) { counts = next; changedEvent(); }
        countsAt = Date.now();
      }
    } catch (_) { /* offline: dots stay as they were */ }
    countsLoading = false;
  }
  const changedEvent = () => { repaint(); try { window.dispatchEvent(new CustomEvent('wos:thread-tracker')); } catch (_) { /* no window events */ } };

  /* ---------- the strip ---------- */
  const dot = (kind) => `<i class="tt-dot ${kind}" aria-hidden="true"></i>`;
  const kindOf = i => (isSeen(i) && (i.state === 'done' || (i.state === 'needs_you' && i.try)) ? 'ack' : i.state === 'done' ? 'done' : i.state === 'blocked' ? 'bad' : i.state === 'needs_you' ? 'you' : 'run');
  const subOf = i => {
    const when = ago(i.updated_at || i.at || Date.now());
    if (kindOf(i) === 'ack') return `Seen · ${when}`;
    if (i.state === 'done') return `Finished · ${when}`;
    if (i.state === 'blocked') return `Stuck · ${when}`;
    if (i.state === 'needs_you') return i.try ? `Ready to try · ${when}` : `Waiting on you · ${when}`;
    return `Working · since ${ago(i.created_at || i.at || Date.now()).replace(' ago', '')}`;
  };
  function rowHtml(i) {
    const kind = kindOf(i);
    const act = kind === 'ack' || kind === 'run' ? '' : i.state === 'done' ? '<button type="button" class="tt-btn ok" data-tt-seen aria-label="Mark seen">✓ Seen</button>'
      : i.try ? '<button type="button" class="tt-btn" data-tt-seen aria-label="Looks good">Looks good</button>' : '<button type="button" class="tt-btn go" data-tt-open>Open</button>';
    return `<div class="tt-row ${kind}" role="button" tabindex="0" data-tt-row="${esc(i.id)}" aria-label="${esc(i.title)}: go to the reply">${dot(kind)}<span class="tt-ti"><span class="tt-t">${esc(i.title)}</span><span class="tt-s">${esc(subOf(i))}</span></span>${act}</div>`;
  }
  function innerHtml(sid, agent) {
    const k = key(sid, agent), items = threads.get(k)?.items || [];
    if (!items.length) return '';
    const c = tally(items), open = openKeys.has(k), fold = ackKeys.has(k);
    const live = items.filter(i => kindOf(i) !== 'ack');
    const ack = items.filter(i => kindOf(i) === 'ack');
    const you = live.filter(i => i.state === 'needs_you' || i.state === 'blocked');
    const run = live.filter(i => i.state === 'running');
    const fin = live.filter(i => i.state === 'done');
    const group = (title, list) => list.length ? `<div class="tt-g"><div class="tt-gh">${title}</div>${list.map(rowHtml).join('')}</div>` : '';
    const tl = (n, kind) => n ? `<span class="tt-tally">${dot(kind)}${n}</span>` : '';
    const head = `<button type="button" class="tt-h" data-tt-toggle aria-expanded="${open}" aria-label="Asks in this thread"><span class="tt-tot">${c.total} ${c.total === 1 ? 'ask' : 'asks'}</span>${tl(c.needs_you, 'you')}${tl(c.blocked, 'bad')}${tl(c.running, 'run')}${tl(c.done_unseen, 'done')}<span class="tt-caret" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span></button>`;
    const body = `<div class="tt-panel" ${open ? '' : 'hidden'}>${group('Your move', you)}${group('Running', run)}${group('Finished · not seen', fin)}`
      + (ack.length ? `<div class="tt-g tt-ackg"><button type="button" class="tt-more" data-tt-ack aria-expanded="${fold}">${ack.length} acknowledged · ${fold ? 'hide' : 'show'}</button>${fold ? ack.map(rowHtml).join('') : ''}</div>` : '')
      + (!live.length && !ack.length ? '<div class="tt-none">Nothing here yet</div>' : '') + '</div>';
    return head + body;
  }
  function stripHtml(sid, agent = '') {
    if (!on() || !sid || sid === '__new__') return '';
    const inner = innerHtml(sid, agent);
    if (!inner) return '';
    const k = key(sid, agent);
    return `<div class="tt-strip${openKeys.has(k) ? ' open' : ''}" data-part="thread-tracker" data-tt-strip="${esc(sid)}" data-tt-agent="${esc(agent || '')}">${inner}</div>`;
  }
  function dots(sid, agent = '') {
    if (!on()) return '';
    const c = counts[key(sid, agent)];
    if (!c) return '';
    const n = (v, kind, label) => v ? `<span class="tt-d" title="${v} ${label}" aria-label="${v} ${label}">${dot(kind)}${v > 1 ? `<b>${v}</b>` : ''}</span>` : '';
    const html = n(c.needs_you, 'you', 'need you') + n(c.blocked, 'bad', 'stuck') + n(c.running, 'run', 'running') + n(c.done_unseen, 'done', 'finished, not seen');
    return html ? `<span class="tt-dots" data-tt-dots="${esc(key(sid, agent))}">${html}</span>` : '';
  }
  // The same dots as a node, for a list that builds its rows with the DOM (the AI apps sidebar).
  function dotsNode(sid, agent = '') {
    const html = dots(sid, agent); if (!html || typeof document === 'undefined') return null;
    const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild;
  }
  // Repaint what is on screen from local state (a tap and a poll both end here). Only the strip's inside and the
  // dots are replaced, so the thread, its scroll and the composer are never touched.
  function repaint() {
    if (typeof document === 'undefined') return;
    for (const el of document.querySelectorAll('[data-tt-strip]')) {
      const sid = el.dataset.ttStrip, agent = el.dataset.ttAgent || '', k = key(sid, agent), html = innerHtml(sid, agent);
      if (!html) { el.remove(); continue; }
      el.classList.toggle('open', openKeys.has(k));
      if (el.dataset.ttSig !== html) { el.innerHTML = html; el.dataset.ttSig = html; }
    }
    for (const el of document.querySelectorAll('[data-tt-dots]')) {
      const k = el.dataset.ttDots, slash = k.indexOf('/'), html = dots(k.slice(slash + 1), k.slice(0, slash) === 'hermes' ? '' : k.slice(0, slash));
      if (!html) el.remove();
      else if (el.outerHTML !== html) el.outerHTML = html;
    }
  }

  /* ---------- taps ---------- */
  const anchorOf = i => ({ message_id: i.message_id || null, at: i.at || 0 });
  function markSeen(sid, agent, ids) {
    const k = key(sid, agent), t = threads.get(k);
    if (!t) return;
    const mine = seenLocally.get(k) || new Set(); seenLocally.set(k, mine);
    t.items = t.items.map(i => { if (ids.includes(i.id) && !i.seen) { mine.add(`${i.id}@${i.updated_at}`); return { ...i, seen: true }; } return i; });
    counts[k] = tally(t.items);
    changedEvent(); // painted before the box hears about it
    pendingSeen.set(k, (pendingSeen.get(k) || 0) + 1);
    const settle = () => pendingSeen.set(k, Math.max(0, (pendingSeen.get(k) || 1) - 1));
    // A write the box did not take is rolled back at once and the thread re-read, so this device never hides what the others still show.
    const undo = () => { settle(); const set = seenLocally.get(k); for (const i of ids) for (const tok of [...(set || [])]) if (tok.startsWith(`${i}@`)) set.delete(tok); const cur = threads.get(k); if (cur) cur.at = 0; load(sid, agent); };
    req(`${BASE}/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread: sid, agent: agent || 'hermes', ids }) })
      .then(r => (r.ok ? r.json() : null)).then(j => { if (!j?.items) { undo(); return; } settle(); threads.set(k, { items: merge(k, j.items), at: Date.now(), loading: false }); counts[k] = tally(threads.get(k).items); changedEvent(); })
      .catch(undo);
  }
  function close() { if (!opened) return false; openKeys.delete(opened); opened = null; repaint(); return true; }
  // Returns true when the tap belonged to the tracker.
  function click(e, { sid, agent = '', jump } = {}) {
    const t = e.target;
    const strip = t.closest?.('[data-tt-strip]');
    if (!strip) { if (opened && !t.closest?.('[data-tt-strip]')) close(); return false; }
    const s = strip.dataset.ttStrip, a = strip.dataset.ttAgent || '', k = key(s, a);
    if (t.closest('[data-tt-toggle]')) {
      if (openKeys.has(k)) { openKeys.delete(k); opened = null; } else { openKeys.add(k); opened = k; }
      repaint(); return true;
    }
    if (t.closest('[data-tt-ack]')) { ackKeys.has(k) ? ackKeys.delete(k) : ackKeys.add(k); repaint(); return true; }
    const row = t.closest('[data-tt-row]');
    if (!row) return true;
    const item = (threads.get(k)?.items || []).find(i => i.id === row.dataset.ttRow);
    if (!item) return true;
    if (t.closest('[data-tt-seen]')) { markSeen(s, a, [item.id]); return true; }
    // Open, or the row itself: close the list so the reply is visible, then go to it. Finished asks that were
    // opened count as seen (you are looking at the answer).
    openKeys.delete(k); opened = null; repaint();
    if (typeof jump === 'function') jump(anchorOf(item), item);
    if (item.state === 'done' && !item.seen) markSeen(s, a, [item.id]);
    return true;
  }
  const itemFor = (sid, agent, m) => {
    const list = threads.get(key(sid, agent))?.items || [];
    const hit = list.filter(i => (m.message_id && i.message_id && String(i.message_id) === String(m.message_id)) || (m.at && i.at && Math.abs(i.at - m.at) < 1500));
    const rank = { needs_you: 0, blocked: 1, running: 2, done: 3 };
    return hit.sort((x, y) => (rank[x.state] ?? 9) - (rank[y.state] ?? 9))[0] || null;
  };
  // A brief highlight on the message that was jumped to.
  function flash(node) {
    if (!node) return;
    node.classList.remove('tt-flash'); void node.offsetWidth; node.classList.add('tt-flash');
    setTimeout(() => node.classList.remove('tt-flash'), 1800);
  }
  window.WosThreadTracker = Object.freeze({ ID, on, load, loadCounts, stripHtml, dots, dotsNode, repaint, click, close, isOpen: () => !!opened, itemFor, flash, key, _tally: tally });
  // A tweak turned on or off: paint (or remove) at once.
  window.addEventListener('wos:tweak-choice', e => { if (e?.detail?.id === ID) { if (e.detail.on) { countsAt = 0; loadCounts(true); } changedEvent(); } });
  // A tap anywhere outside the open list closes it on the same frame (the tap itself still goes through).
  document.addEventListener('pointerdown', e => { if (opened && !e.target.closest?.('[data-tt-strip]')) close(); }, true);
  // The host writes data-tweaks once the package is mounted (a toggle, a sync from the other device, a reload).
  let wasOn = on();
  try { new MutationObserver(() => { const now = on(); if (now === wasOn) return; wasOn = now; if (now) { countsAt = 0; loadCounts(true); } changedEvent(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tweaks'] }); } catch (_) { /* no observer: the toggle event above still repaints */ }
  setInterval(() => { if (on() && !document.hidden) loadCounts(); }, 15000);
})();
