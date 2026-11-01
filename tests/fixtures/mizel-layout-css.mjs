// Miguel's layout left his Dark/Light/Landscapes skins for the miguel/layout tweak (1 Nov 2026). Tests that pin how his
// skins look *with his layout on* read the skin stylesheet plus the tweak's, the tweak's rules written with the skin's prefix.
import { readFileSync } from 'node:fs';
const TWEAK = readFileSync(new URL('../../web/tweaks/miguel/layout/tweak.css', import.meta.url), 'utf8');
export function withLayout(path, text) {
  const m = String(path).match(/skins\/(obsidian|landscapes)\/skin\.css$/);
  if (!m) return text;
  return text.replaceAll('[data-tweaks~="miguel/layout"]', '') + '\n' + TWEAK.replaceAll('html[data-tweaks~="miguel/layout"]', `html[data-skin^="${m[1]}"]`);
}
