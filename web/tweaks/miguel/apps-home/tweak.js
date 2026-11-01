/* Apps view (Miguel, 1 Nov 2026): wears the built-in Apps layout (web/layouts/apps) on the phone: Home as a standard
 * home screen, one app icon per desk, Chats first. The desktop never wears it (its switch stays Desks | Orbs).
 * Turning this off releases the layout: the stock phone Home comes straight back. */
export default function setup(api) {
  if (api.env.shell === 'desktop') return () => {};
  return api.layout.use('apps');
}
