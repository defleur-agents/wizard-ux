/* Desktop lifecycle boundary. Layouts own placement; the shell owns windows,
 * frames, bridge registration and leave/custody checks. No DOM selectors or
 * second window store here. The phone keeps its existing adapter. */
(() => {
  'use strict';
  let current = null;
  function attach(adapter) {
    if (current) throw new Error('Desktop host already attached');
    for (const key of ['has', 'windows', 'frame', 'openApp', 'focus', 'close']) {
      if (typeof adapter?.[key] !== 'function') throw new TypeError('Desktop host needs ' + key);
    }
    const listeners = new Set();
    let queued = false;
    const changed = () => {
      if (!listeners.size || queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (!listeners.size) return;
        const state = windows();
        for (const fn of [...listeners]) {
          try { fn(state); } catch (e) { console.error('Desktop host listener failed', e); }
        }
      });
    };
    const windows = () => Object.freeze(adapter.windows().map(w => Object.freeze({
      id: w.id, kind: w.kind, appId: w.appId, desk: w.desk, deskId: w.deskId, title: w.title,
      thread: w.thread, focused: !!w.focused, visible: !!w.visible, tiled: !!w.tiled,
    })));
    const find = id => typeof id === 'string' && id ? windows().find(w => w.id === id) : null;
    const has = id => typeof id === 'string' && !!id && adapter.has(id);
    const host = Object.freeze({
      windows,
      // A frame handle is the retained iframe, never a Classic window/container.
      frame: id => find(id)?.kind === 'frame' ? adapter.frame(id) || null : null,
      frameReady: id => {
        const w = find(id); if (!w) return false;
        const f = w.kind === 'frame' ? adapter.frame(id) : null; if (!f) return w.kind !== 'frame';
        try { const d = f.contentDocument; return !d || (d.readyState === 'complete' && d.URL !== 'about:blank'); } catch (_) { return true; }
      },
      renderTools: (id, slot) => {
        if (!slot?.replaceChildren) return false;
        return adapter.renderTools?.(find(id)?.kind === 'frame' ? adapter.frame(id) : null, slot) === true;
      },
      openApp: id => typeof id === 'string' && !!id ? adapter.openApp(id) !== false : false,
      focus: (id, { scroll = true } = {}) => {
        if (!has(id)) return false;
        const ok = adapter.focus(id, { scroll: scroll !== false }) === true; changed(); return ok;
      },
      close: id => has(id) ? adapter.close(id) === true : false,
      panes: adapter.panes,
      onChange(fn) {
        if (typeof fn !== 'function') return () => {};
        listeners.add(fn); return () => listeners.delete(fn);
      },
    });
    current = host;
    return Object.freeze({ host, changed });
  }
  window.WizDesktop = Object.freeze({ attach, get host() { return current; } });
})();
