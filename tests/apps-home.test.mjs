// Apps view (Miguel, 1 Nov 2026): a third phone view beside Desks and Orbs. Guards:
//   - the switch: Desks | Orbs | Apps on the phone (Desks | Orbs on the desktop), mutually exclusive: a tap switches
//     every view tweak to match, the worn view does nothing, the lit option follows html[data-layout];
//   - Apps on the phone: Home is an app grid with ONE icon per desk (each desk is one app), in desk order, Chats first
//     with its Ready count; a tap opens that desk (Chats: the stock list); the stock Home widgets step aside;
//   - Desks = the stock phone: the tweak off leaves no grid, no flag, no layout;
//   - the desktop never wears it (no layout, no CSS that can match it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fixture } from './fixtures/tweaks.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const settle = () => new Promise(r => setTimeout(r, 15));

class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this.dataset = {}; this.attrs = {}; this.className = ''; this.hidden = false; this.listeners = {}; this.textContent = '';
    const st = {}; this.style = Object.assign(st, { setProperty(k, v) { st[k] = v; }, getPropertyValue: k => st[k] || '' });
    const self = this; this.classList = { add(c) { self.className = (self.className + ' ' + c).trim(); }, contains: c => self.className.split(' ').includes(c) }; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  append(...n) { for (const c of n) { c.parentNode?.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); } }
  replaceChildren(...n) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...n); }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  querySelector() { return null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.tagName === 'HTML'; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener() {}
  dispatchEvent(e) { for (const fn of this.listeners[e.type] || []) fn(e); return true; }
}

function appsWorld({ shell = 'phone' } = {}) {
  const html = new El('html'), homeSec = new El('section'); html.append(homeSec);
  globalThis.document = { documentElement: html, createElement: t => new El(t) };
  const state = { desks: [{ desk: 1, id: 'mail', name: 'Mail' }, { desk: 2, id: 'wizard', name: 'Chats' }, { desk: 3, id: 'music', name: 'Music' }, { desk: 5, id: 'files', name: 'Files' }],
    badges: { wizard: 7, mail: 2 }, gone: [], lists: [], on: {} };
  const mark = id => { const m = new El('span'); m.className = 'dsg'; m.style.setProperty('--c', '#7c5cff'); m.id = id; return m; };
  const api = {
    env: { shell }, route: () => ({ home: true }), on: (t, fn) => { (state.on[t] ||= []).push(fn); return () => {}; },
    listen: (t, type, fn) => { t.addEventListener(type, fn); return () => {}; },
    apps: { list: () => [{ id: 'mail', name: 'Mail' }, { id: 'music', name: 'Music' }, { id: 'files', name: 'Files' }], badges: watch => { state.watch = watch; return { ...state.badges }; }, logo: () => Promise.resolve(null) },
    sessions: { openList: k => state.lists.push(k) }, nav: { goDesk: i => state.gone.push(i) },
    phone: { home: () => homeSec, desks: () => state.desks.map(d => ({ ...d })), mark },
  };
  return { html, homeSec, api, state, fire: t => { for (const fn of state.on[t] || []) fn(); } };
}

test('Apps on the phone: one icon per desk in desk order, Chats first with its Ready count; a tap opens that desk', async () => {
  const P = appsWorld();
  const { default: setup } = await import(new URL('web/layouts/apps/layout.js', root));
  const off = setup(P.api);
  assert.equal(P.html.dataset.appsHome, 'on');
  const grid = P.homeSec.children.find(c => c.className === 'ap-grid'); assert.ok(grid, 'the grid lives in the Home desk (it slides with Home)');
  const icons = () => grid.children.map(b => [b.attrs['data-app'], b.attrs['data-desk'] ?? null]);
  assert.deepEqual(icons(), [['wizard', null], ['mail', '1'], ['music', '3'], ['files', '5']], 'Chats first, then one icon per desk (the Chats desk is the Chats icon)');
  const [chats, mail] = grid.children;
  assert.equal(chats.attrs['aria-label'], 'Chats, 7 ready'); assert.equal(chats.children[1].textContent, '7'); assert.equal(chats.children[1].hidden, false);
  assert.equal(mail.attrs['aria-label'], 'Mail, 2 new'); assert.equal(grid.children[2].children[1].hidden, true, 'no count, no badge');
  assert.equal(mail.children[2].textContent, 'Mail', 'the label under the icon');
  assert.equal(mail.style['--c'], '#7c5cff', 'the app\'s own colour from the dock\'s mark');
  mail.dispatchEvent({ type: 'click' }); assert.deepEqual(P.state.gone, [1], 'tap = that desk');
  chats.dispatchEvent({ type: 'click' }); assert.deepEqual(P.state.lists, ['ready'], 'Chats = the stock Chats list');
  // a new desk (an app opened) or a closed one: the grid follows; counts follow live
  P.state.desks.push({ desk: 6, id: 'notes', name: 'Notes' }); P.fire('route');
  assert.deepEqual(icons().map(i => i[0]), ['wizard', 'mail', 'music', 'files', 'notes']);
  P.state.watch({ wizard: 2 }); assert.equal(grid.children[0].attrs['aria-label'], 'Chats, 2 ready'); assert.equal(grid.children[1].children[1].hidden, true);
  off();
  assert.ok(!P.homeSec.children.some(c => c.className === 'ap-grid'), 'Desks: no grid left'); assert.equal(P.html.dataset.appsHome, undefined);
});

test('the desktop never wears Apps: the tweak and the layout both stay out', async () => {
  const P = appsWorld({ shell: 'desktop' });
  const { default: setup } = await import(new URL('web/layouts/apps/layout.js', root));
  setup(P.api)(); assert.equal(P.homeSec.children.length, 0); assert.equal(P.html.dataset.appsHome, undefined);
  const f = fixture({ shell: 'desktop' });
  await f.mount('miguel/apps-home'); await settle();
  assert.equal(f.host.layout, 'classic', 'the desktop stays Desks'); assert.equal(f.doc.documentElement.dataset.layout, undefined);
  await f.clear();
  // every Apps rule is phone-scoped; the switch's desktop side never mentions Apps
  const css = read('web/layouts/apps/layout.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const sel of [...css.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim())) for (const part of sel.split(/,(?![^(]*\))/)) assert.ok(part.trim().startsWith('html[data-shell="phone"][data-layout="apps"]'), `unscoped: ${part.trim()}`);
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css), 'colours are the tweak\'s tokens');
  const sw = read('web/tweaks/miguel/orb-switch/tweak.css');
  assert.ok(!/html\[data-shell="desktop"\][^{]*is-apps/.test(sw));
});

test('Desks = the stock phone: Apps off releases the layout and its CSS; Apps on the phone wears it', async () => {
  const f = fixture({ shell: 'phone' });
  await f.mount('miguel/apps-home'); await settle();
  assert.equal(f.host.layout, 'apps'); assert.equal(f.doc.documentElement.dataset.layout, 'apps');
  assert.ok(f.doc.head.children.some(l => /layouts\/apps\/layout\.css/.test(l.href || '')));
  await f.clear();
  assert.equal(f.host.layout, 'classic'); assert.equal(f.doc.documentElement.dataset.layout, undefined);
  assert.ok(!f.doc.head.children.some(l => /layouts\//.test(l.href || '')));
  const tw = read('web/tweaks/miguel/apps-home/tweak.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const sel of [...tw.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim())) for (const part of sel.split(/,(?![^(]*\))/)) assert.ok(/^html\[data-layout="apps"\]|^html\[data-shell="phone"\]\[data-layout="apps"\]/.test(part.trim()), `apps-home tweak.css reaches past the Apps view: ${part.trim()}`);
});

test('the switch: three equal views on the phone, mutually exclusive, asked together; the lit option follows the worn layout', async () => {
  const f = fixture({ shell: 'phone' });
  let api;
  f.host._test.setImporter(async () => ({ default: a => { api = a; return () => {}; } }));
  await f.host.loadTweaks(['miguel/orb-switch'], f.slots, { teamAuthors: ['miguel'] });
  const asked = []; f.ctx.window.WosExperience = { toggle: async id => { asked.push(id); } };
  assert.equal(await api.settings.toggleTweak('miguel/apps-home'), true, 'own author: the switch may switch Apps');
  await f.clear();
  // the real switch, with Orbs worn: Apps turns Orbs off and Apps on in the same turn; Desks turns whatever is on off
  const g = fixture({ shell: 'phone' });
  const host = g.host;
  const asks = []; g.ctx.window.WosExperience = { toggle: id => { asks.push(id); return new Promise(r => setTimeout(r, 5)); } };
  // tweakOn reads the loaded tweaks: pretend Orbs is worn by loading it too
  await host.loadTweaks(['miguel/orb-switch', 'miguel/orb-shell'], g.slots, { teamAuthors: ['miguel'] }); await settle();
  const box2 = g.doc.body.querySelector('[data-slot="home-main"]').children.find(n => n.className === 'os-switch');
  const [desks, orbs, apps] = box2.children;
  assert.deepEqual(box2.children.map(b => b.attrs['aria-pressed']), ['false', 'true', 'false'], 'Orbs lit');
  orbs.fire('click'); assert.deepEqual(asks, [], 'the worn view does nothing');
  apps.fire('click'); assert.deepEqual(asks, ['miguel/orb-shell', 'miguel/apps-home'], 'Orbs off and Apps on, asked together');
  assert.ok(box2.classList.contains('is-busy')); apps.fire('click'); assert.equal(asks.length, 2, 'one switch at a time');
  await settle(); asks.length = 0;
  desks.fire('click'); assert.deepEqual(asks, ['miguel/orb-shell'], 'Desks = every view tweak off');
  await settle(); await g.clear();
  const css = read('web/tweaks/miguel/orb-switch/tweak.css');
  assert.match(css, /html:not\(\[data-shell="desktop"\]\):not\(\[data-layout="orb"\], \[data-layout="apps"\]\) \.home-desk \.os-side\.is-classic,\nhtml:not\(\[data-shell="desktop"\]\)\[data-layout="orb"\] \.home-desk \.os-side\.is-orb,\nhtml:not\(\[data-shell="desktop"\]\)\[data-layout="apps"\] \.home-desk \.os-side\.is-apps \{/, 'lit from html[data-layout]');
  assert.match(css, /\.home-desk \.os-switch \{[^}]*height: 44px;/, 'thumb-sized');
  // catalog: listed under Miguel, never a default; not turned on by any migration
  const cat = JSON.parse(read('web/tweaks/catalog.json'));
  assert.ok(cat.tweaks.includes('miguel/apps-home') && !cat.defaults.includes('miguel/apps-home'));
  assert.ok(!/apps-home/.test(read('web/core/experience.js')));
});

test('the phone adapter lists one entry per desk (Home and empty desks left out) and the layout API hands it out', () => {
  const app = read('web/app.js'), host = read('web/core/skin-host.js');
  const fn = app.match(/phoneDesks: (\(\) => desks\.map[^\n]*),\n/)[1];
  const run = vm.runInNewContext(`(${fn})`, { desks: [{ home: true, wins: [] }, { wins: ['a'], focus: 'a' }, { wins: [] }, { wins: ['c'], focus: 'c' }],
    W: { a: { appId: 'mail' }, c: { app: 'chats' } }, winApp: w => w.app === 'chats' ? { id: 'wizard', name: 'Chats' } : { id: w.appId, name: 'Mail' } });
  assert.deepEqual(JSON.parse(JSON.stringify(run())), [{ desk: 1, id: 'mail', name: 'Mail' }, { desk: 3, id: 'wizard', name: 'Chats' }]);
  assert.match(host, /desks: \(\) => \{ const l = live\(\) \? shell\.phoneDesks\?\.\(\) : null;/);
  assert.match(host, /Object\.freeze\(\{ id: 'apps', name: 'Apps',/);
  assert.match(host, /if \(\(layoutId === 'orb' \|\| layoutId === 'apps'\) && !\(layoutHolder && tweaks\.has\(layoutHolder\)\)\) setLayout\('classic'\);/, 'a stale stored Apps layout goes back to Desks');
  assert.ok(!/Math\.random/.test(read('web/layouts/apps/layout.js')));
});
