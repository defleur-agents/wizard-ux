/* The host owns the lazy shared module and its reversible shell adapter. */
export default function setup(api) {
  return api.orb.switcher();
}
