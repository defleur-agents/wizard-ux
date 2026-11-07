/* Wizard OS · Settings › Network & security: one plain line about disk encryption (wizard-os spec/DISK_ENCRYPTION.md).
 *   "Disk encrypted, unlocks with this box's security chip" · "Not encrypted" · "Protected by FileVault on this Mac" …
 * Source: the App Manager's read-only `wam disk status` (store-install/_disk, owner only). The line is written there,
 * so the shell never words a security claim itself. Asked when the page is drawn, at most every 10 minutes
 * (1 minute after a failure); a box whose App Manager has no such route shows nothing, so the page stays hidden. */
(() => {
  'use strict';
  const S = window.WosSettings;
  if (!S || S.features?.some(f => f.id === 'disk-encryption')) return;
  const src = document.currentScript?.src || location.href;
  const URL_ = new URL('../store-install/_disk', src).href;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clip = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  const LEVELS = new Set(['ok', 'warn', 'error']);
  const FRESH = 600e3, RETRY = 60e3;
  // known: the route answered at least once (a box without it never shows the row or the page).
  let st = null, at = 0, busy = false, known = false;

  const refresh = () => { try { S.refresh(); } catch (_) {} };
  function load() {
    if (busy || (at && Date.now() - at < (st ? FRESH : RETRY)) || typeof fetch !== 'function') return;
    busy = true;
    fetch(URL_, { credentials: 'same-origin', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null, () => null)
      .catch(() => null)
      .then(d => {
        const line = clip(d?.line);
        const was = st?.line;
        st = line ? { line, level: LEVELS.has(d.level) ? d.level : 'warn' } : (known ? st : null);
        if (line) known = true;
        at = Date.now(); busy = false;
        if (st?.line !== was) refresh();
      });
  }
  function html() {
    load();
    if (!st) return '';
    return `<div class="st-group" data-disk-encryption data-level="${st.level}"><h4>Disk</h4><div class="st-row static"><span class="st-tx"><b>Disk encryption</b><small>${esc(st.line)}</small></span></div></div>`;
  }
  S.register({ id: 'disk-encryption', page: 'network', aliases: ['disk', 'disk-encryption', 'security'], available: () => { load(); return !!st; }, html: () => html() });
})();
