/* Desktop Escape-as-back: one press, one owner. No navigation at an empty root.
 * Owners push on open and release on close; watched legacy owners join the same
 * recency order. Recording is always first; a focused surface is always last. */
(() => {
  'use strict';
  function create() {
    let clock = 0;
    const entries = new Set();
    function push(back, { active = () => true, name = 'overlay' } = {}) {
      sync(); // an older legacy owner may have opened in this same event frame
      const entry = { back, active, name, at: ++clock, token: true };
      entries.add(entry);
      return () => entries.delete(entry);
    }
    function watch(active, back, name) {
      const entry = { active, back, name, at: 0, token: null, watched: true };
      entries.add(entry);
      return () => entries.delete(entry);
    }
    function sync() {
      for (const e of entries) if (e.watched) {
        const token = e.active() || null;
        if (token && token !== e.token) e.at = ++clock;
        e.token = token;
      }
    }
    function run({ recording, surface, fallback, event } = {}) {
      if (event?.isComposing || event?.keyCode === 229 || event?.repeat) return 'held';
      if (recording?.()) return 'voice-cancel';
      sync();
      const top = [...entries].filter(e => e.watched ? e.token : e.active()).sort((a, b) => b.at - a.at)[0];
      // A layer may be waiting for an asynchronous stop/close. Never fall through
      // to a second owner just because its callback returned false or a promise.
      if (top) { top.back(); return top.name; }
      if (surface?.()) return 'surface';
      return fallback?.() || '';
    }
    return Object.freeze({ push, watch, sync, run });
  }
  window.WizEscapeBack = Object.freeze({ create });
})();
