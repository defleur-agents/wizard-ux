'use strict';
// Read-only event observer. A browser may checkpoint microtasks between native
// capture listeners and the delegated Settings handler: that is BEFORE the action.
// Window bubble runs after that handler, still in the SAME trusted click dispatch.
function observeAppearanceTaps() {
  window.__tapFrames = []; window.__tapPhases = [];
  const sample = (e, phase) => {
    const el = e.target.closest('[data-skinfamily], [data-skinpick]'); if (!el) return;
    const art = el.querySelector('.skp-mini'), after = art && getComputedStyle(art, '::after');
    return { phase, trusted: e.isTrusted, pending: el.classList.contains('st-pending'), busy: el.getAttribute('aria-busy'), disabled: el.disabled, animation: after?.animationName, width: after?.width, opacity: getComputedStyle(el).opacity, text: el.querySelector('.skp-nm')?.innerText };
  };
  addEventListener('click', e => {
    if (!e.target.closest('[data-skinfamily], [data-skinpick]')) return;
    queueMicrotask(() => window.__tapPhases.push(sample(e, 'capture-microtask')));
  }, true);
  addEventListener('click', e => {
    const row = sample(e, 'bubble-same-dispatch'); if (!row) return;
    window.__tapPhases.push(row); window.__tapFrames.push(row);
  }, false);
}
module.exports = { observeAppearanceTaps };
