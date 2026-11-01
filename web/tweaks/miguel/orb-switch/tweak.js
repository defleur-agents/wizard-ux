/* Desks | Orbs | Apps switch (Miguel, 31 Oct 2026; was Classic | Orb; Apps added 1 Nov 2026). Three equal views, one
 * tap each, for this device, no reload, never through Settings:
 *   - Desks: the stock shell (no layout);
 *   - Orbs: the miguel/orb-shell tweak (desktop: the orb scene instead of desks; phone: the orb on Home);
 *   - Apps (phone only): the miguel/apps-home tweak (Home as an app grid, one icon per desk). The desktop keeps
 *     Desks | Orbs: a grid of desk icons over windows would only repeat the bar's desks there.
 * The views are mutually exclusive: a tap switches every view tweak to match (both switches are asked in the same
 * turn, so the device reloads its tweaks once). It switches them the same way Settings › Look › Tweaks does (the
 * device's tweak mix), so it can never leave him stuck: the switch stays whichever view is on. The lit option
 * follows what the shell really wears (html[data-layout], tweak.css), so a half-loaded view still shows the truth.
 * Desktop: in the middle of the top bar, in place of the date and time. Phone: at the top of Home on all three views. */
export default function setup(api) {
  const desk = api.env.shell === 'desktop';
  // [class key, label, the tweak wearing it]; the keys stay classic / orb so the desktop's styling is unchanged
  const VIEWS = desk ? [['classic', 'Desks', null], ['orb', 'Orbs', 'miguel/orb-shell']]
    : [['classic', 'Desks', null], ['orb', 'Orbs', 'miguel/orb-shell'], ['apps', 'Apps', 'miguel/apps-home']];
  const TWEAKS = ['miguel/orb-shell', 'miguel/apps-home'];
  const TITLES = desk ? { classic: 'Desks: numbered desks with your windows, the bar and Home', orb: 'Orbs: the orb in the middle, your apps around it, chats beside it' }
    : { classic: 'Desks: the usual Home', orb: 'Orbs: the orb on Home, your apps around it, Chats under it', apps: 'Apps: Home as an app grid, one icon per desk' };
  const box = document.createElement('div');
  box.className = 'os-switch'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', (desk ? 'Desktop' : 'Home') + ' view: ' + VIEWS.map(v => v[1]).join(', '));
  const worn = () => VIEWS.find(([, , id]) => id && api.settings.tweakOn(id))?.[0] || 'classic';
  const sides = VIEWS.map(([key, label, id]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'os-side is-' + key; b.textContent = label; b.title = TITLES[key];
    api.listen(b, 'click', () => {
      if (box.classList.contains('is-busy') || worn() === key) return;
      // every view tweak that must change, asked together (the last ask wins one reload)
      const asks = TWEAKS.filter(t => api.settings.tweakOn(t) !== (t === id)).map(t => api.settings.toggleTweak(t));
      if (!asks.length) return;
      box.classList.add('is-busy');
      Promise.all(asks).then(() => box.classList.remove('is-busy'), () => box.classList.remove('is-busy'));
    });
    box.append(b);
    return [key, b];
  });
  const paint = () => { const w = worn(); for (const [key, b] of sides) b.setAttribute('aria-pressed', String(key === w)); };
  paint(); api.on('route', paint);
  if (desk) api.slot.mount('bar-center', box, -10);
  else api.slot.mount('home-main', box, -20);
  return () => box.remove();
}
