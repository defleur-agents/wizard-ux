/* AI apps view (Miguel, 2 Nov 2026): wears the built-in AI apps layout (web/layouts/ai-apps) on the phone: the layout
 * the ChatGPT, Claude and Perplexity phone apps share, with Wizard's apps where they put Projects / GPTs / Spaces.
 * The desktop keeps the stock shell for now (its layout comes once the desktop reference is captured again).
 * Turning this off releases the layout: the stock phone (Desks) comes straight back. */
export default function setup(api) {
  if (api.env.shell !== 'phone') return () => {};
  return api.layout.use('ai-apps');
}
