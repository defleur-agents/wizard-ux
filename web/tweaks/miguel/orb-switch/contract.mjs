import assert from 'node:assert/strict';
// One view switch, Desks | Orb | Apps on both shells: desktop in the middle of the bar (bar-center, where the clock
// was); phone at the top of Home (home-main, first). A click on a view that is not worn switches the view
// tweaks to match (own author only; mutually exclusive); a click on the worn view does nothing.
export default async function check(f) {
  const desk = f.doc.documentElement.dataset.shell === 'desktop';
  const bar = f.doc.body.querySelector(desk ? '[data-slot="bar-center"]' : '[data-slot="home-main"]');
  const box = bar.children.find(n => n.className === 'os-switch'); assert.ok(box, desk ? 'switch in the bar' : 'switch on Home');
  assert.deepEqual(box.children.map(b => b.textContent), ['Desks', 'Orb', 'Apps']);
  const [classic, orb, apps] = box.children;
  assert.equal(classic.attrs['aria-pressed'], 'true'); assert.equal(orb.attrs['aria-pressed'], 'false');
  const asked = []; f.ctx.window.WosExperience = { toggle: async id => { asked.push(id); } };
  classic.fire('click'); assert.deepEqual(asked, [], 'the worn side does nothing');
  orb.fire('click'); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(asked, ['miguel/orb-shell']);
  asked.length = 0; apps.fire('click'); await new Promise(r => setTimeout(r, 0)); assert.deepEqual(asked, ['miguel/apps-home']);
  await f.clear(); assert.ok(!bar.children.some(n => n.className === 'os-switch'));
}
