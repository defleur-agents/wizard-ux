export default function setup(api) {
  // The layout itself lives in the shell (checks html[data-tweaks~="miguel/layout"]) and in Miguel's skin CSS
  // under :where([data-tweaks~="miguel/layout"]), so picking Dark, Light or Landscapes never changes layout alone.
  return () => {};
}
