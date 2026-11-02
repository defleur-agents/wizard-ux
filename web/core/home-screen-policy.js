/* Pin identity is an app ID, never a caller-provided launch URL. */
(() => {
  'use strict';
  const validId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(id);
  const isShell = value => { try { return /^\/wizard-os-home(?:[/-]|$)/.test(new URL(value,location.origin).pathname); } catch (_) { return true; } };
  function within(value, base, origin = location.origin) {
    try {
      const u = new URL(value, origin), b = new URL(base, origin);
      const root = b.pathname.endsWith('/') ? b.pathname : b.pathname.slice(0, b.pathname.lastIndexOf('/') + 1);
      return u.origin === origin && b.origin === origin && root !== '/' && !/%(?:2f|5c|2e|25)/i.test(u.pathname) && u.pathname.startsWith(root);
    } catch (_) { return false; }
  }
  const key = (origin, id) => 'wos.single.v1:' + JSON.stringify([origin, id]);
  // Registry names stay unchanged in desks; launcher/task names are app names.
  const displayName = app => window.WizLauncher?.displayName(app) || app.name;
  const requested = new URLSearchParams(location.search).get('app-session');
  // Even malformed session links must not reveal the workspace.
  const mode = requested !== null;
  const id = validId(requested) ? requested : '';
  if (mode) document.documentElement.setAttribute('data-app-session', id || 'unavailable');
  let journal = null, preparing = null, presentationFailed = false;
  const positionPrefix = () => key(location.origin,id) + ':presentation:';
  const positionKey = k => /^wisdom:.*:pos:/.test(String(k));
  function notifyPresentationFailure() {
    presentationFailed = true;
    for (const f of document.querySelectorAll?.('iframe') || []) {
      try { f.contentWindow.WisdomOffline?.savingFailed?.(); } catch (_) {}
    }
  }
  function preparePresentation() {
    // Opt in only the reviewed Wisdom adapter; other apps keep their storage contract.
    if (id !== 'wisdom' || !mode) return Promise.resolve();
    if (preparing) return preparing;
    if (!window.WizOffline?.presentation) { notifyPresentationFailure(); return Promise.resolve(false); }
    journal = window.WizOffline.presentation({ prefix:'wisdom-',slot:key(location.origin,id),onFailure:notifyPresentationFailure,
      initial:() => {
        let route = null; try { route = JSON.parse(localStorage.getItem(key(location.origin,id))); } catch (_) {}
        const positions = Object.create(null), prefix = positionPrefix();
        for (const k of Object.keys(localStorage)) if (k.startsWith(prefix) && positionKey(k.slice(prefix.length))) {
          const n = Number(localStorage.getItem(k)); if (Number.isFinite(n) && n >= 0 && n <= 1) positions[k.slice(prefix.length)] = n;
        }
        return {route,positions:Object.fromEntries(Object.entries(positions).slice(-80))};
      }
    });
    preparing = journal.ready.then(() => true, () => false);
    return preparing;
  }
  function presentationRoute() { return journal?.snapshot()?.route; }
  function savePresentationRoute(route) {
    if (!journal || presentationFailed) return;
    const current = journal.snapshot();
    // at is diagnostic; an unchanged route/state must not churn the disk every 750ms.
    if (current?.route?.href === route.href && current.route.base === route.base && JSON.stringify(current.route.state) === JSON.stringify(route.state)) return;
    void journal.commit({route}).catch(() => {});
  }
  function readPosition(k,storage) {
    const value = journal?.snapshot();
    if (value && positionKey(k)) return Object.hasOwn(value.positions,k) ? String(value.positions[k]) : null;
    return storage.getItem(positionPrefix()+k);
  }
  function savePosition(k,v,storage) {
    // The synchronous cache remains immediate; only the strict IDB commit is durable.
    try { storage.setItem(positionPrefix()+k,v); } catch (_) {}
    const n = Number(v), current = journal?.snapshot();
    if (!presentationFailed && current && Number.isFinite(n) && n >= 0 && n <= 1 && current.positions[k] !== n) {
      void journal.commit({positions:{[k]:n}}).catch(() => {});
    }
  }
  function installPresentationStorage(frame) {
    if (!mode || !id || frame === window || frame.location.origin !== location.origin || (frame.__wosPresentationStorageDocument && frame.__wosPresentationStorageDocument === frame.document)) return;
    const storage = frame.localStorage, prefix = key(location.origin,id) + ':presentation:';
    // Wisdom's paginated reader stores screen position, not content/preferences, under these keys.
    // Keep size/theme, highlights, read/saved state and every other backend/content key shared.
    const map = k => /^wisdom:.*:pos:/.test(String(k)) ? prefix + k : String(k);
    const facade = new Proxy(storage, {
      get(target, prop) {
        if (prop === 'getItem') return k => positionKey(k) && id === 'wisdom' ? readPosition(String(k),target) : target.getItem(map(k));
        if (prop === 'setItem') return (k,v) => positionKey(k) && id === 'wisdom' ? savePosition(String(k),v,target) : target.setItem(map(k),v);
        if (prop === 'removeItem') return k => { target.removeItem(map(k)); if (id === 'wisdom' && positionKey(k) && journal?.snapshot() && !presentationFailed) void journal.commit({positions:{[String(k)]:null}}).catch(() => {}); };
        const value = Reflect.get(target,prop,target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    Object.defineProperty(frame,'localStorage',{ configurable:true, value:facade });
    frame.__wosPresentationStorage = true;
    frame.__wosPresentationStorageDocument = frame.document;
  }
  window.WizHomeScreenPolicy = Object.freeze({ validId, isShell, within, key, displayName, mode, id, installPresentationStorage, preparePresentation, presentationRoute, savePresentationRoute, get presentationFailed() { return presentationFailed; } });
})();
