// Apps view (Miguel, 1 Nov 2026): a third view beside Desks and Orb, on the phone and (round 4) the desktop. Guards:
//   - the switch: Desks | Orb | Apps on both shells, mutually exclusive: a tap switches every view tweak to match, the
//     worn view does nothing, the lit option follows html[data-layout];
//   - Apps on the phone: Home is an app grid with ONE icon per desk (each desk is one app), in desk order, Chats first
//     with its Ready count, a + tile last; a tap opens that desk (Chats: the stock list); the stock Home widgets step
//     aside; no stock desk switcher on any screen; no Back button: a swipe up on the orb goes Home;
//   - the + sheet: the picker's apps minus Chats and every app already open; a pick opens it on a desk of its own;
//   - Apps on the desktop: a launchpad, one icon per desk, Chats first, +, the orb at the bottom centre (drag up = Home);
//   - Desks = the stock shell: the tweak off leaves no grid, no flag, no layout.
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
    const self = this; this.classList = { add(c) { self.className = (self.className + ' ' + c).trim(); }, remove(c) { self.className = self.className.split(' ').filter(x => x !== c).join(' '); }, contains: c => self.className.split(' ').includes(c) }; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  append(...n) { for (const c of n) { if (typeof c === 'string') continue; c.parentNode?.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); } }
  insertBefore(c, ref) { c.parentNode?.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
  focus() {}
  setPointerCapture() {}
  decode() { return Promise.resolve(); }
  get firstChild() { return this.children[0] || null; }
  replaceChildren(...n) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...n); }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  querySelector() { return null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.tagName === 'HTML'; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener() {}
  dispatchEvent(e) { for (const fn of this.listeners[e.type] || []) fn(e); return true; }
}

function appsWorld({ shell = 'phone' } = {}) {
  const html = new El('html'), body = new El('body'), device = new El('div'), homeSec = new El('section'), dock = new El('div'), orbWrap = new El('div');
  html.append(body); body.append(device); device.append(homeSec, dock); dock.append(orbWrap); dock.id = 'dock';
  globalThis.document = { documentElement: html, body, createElement: t => new El(t) };
  const state = { desks: [{ desk: 1, id: 'mail', name: 'Mail' }, { desk: 2, id: 'wizard', name: 'Chats' }, { desk: 3, id: 'music', name: 'Music' }, { desk: 5, id: 'files', name: 'Files' }],
    badges: { wizard: 7, mail: 2 }, gone: [], lists: [], on: {}, home: true, openedDesk: [], backs: [], homes: 0, voice: [] };
  const mark = id => { const m = new El('span'); m.className = 'dsg'; m.style.setProperty('--c', '#7c5cff'); m.id = id; return m; };
  const apps = [{ id: 'mail', name: 'Mail' }, { id: 'music', name: 'Music' }, { id: 'files', name: 'Files', system: true }, { id: 'notes', name: 'Notes' }, { id: 'maps', name: 'Maps' },
    { id: 'wizard-claude', name: 'Claude', connector: true }, { id: 'agents', name: 'Agents', agent: true }, { id: 'mail-next', name: 'Mail next', dev: true }];
  const api = {
    env: { shell }, route: () => ({ home: state.home, desk: state.desk ?? 0 }), on: (t, fn) => { (state.on[t] ||= []).push(fn); return () => {}; },
    listen: (t, type, fn) => { t.addEventListener(type, fn); return () => {}; },
    mount: n => { device.append(n); return () => n.remove(); }, after: () => () => {},
    back: { push: fn => { state.backs.push(fn); return () => { state.backs.splice(state.backs.indexOf(fn), 1); }; } },
    apps: { list: () => apps.map(a => ({ ...a })), badges: watch => { state.watch = watch; return { ...state.badges }; }, logo: () => Promise.resolve(null), open: id => state.openedDesk.push('open:' + id), openDesk: id => state.openedDesk.push(id) },
    sessions: { openList: k => state.lists.push(k) }, nav: { goDesk: i => state.gone.push(i) },
    desks: { list: () => state.desks.map(d => ({ ...d })) },
    desk: { home: () => { state.homes++; } },
    voice: { state: () => ({ state: 'idle' }), talk: () => state.voice.push('talk'), command: () => { state.voice.push('command'); return 'voice'; } },
    orb: { ready: () => Promise.resolve(false), create: () => null, onLevel() {} },
    phone: { home: () => homeSec, desks: () => state.desks.map(d => ({ ...d })), mark, orb: () => orbWrap,
      swipes: m => { state.swipes = m; return () => { state.swipes = 'released'; }; } },
  };
  const find = cls => { const all = []; const walk = n => { for (const c of n.children) { if (String(c.className).split(' ').includes(cls)) all.push(c); walk(c); } }; walk(html); return all; };
  return { html, device, homeSec, dock, orbWrap, api, state, find, fire: t => { for (const fn of state.on[t] || []) fn(); } };
}

test('Apps on the phone: one icon per desk in desk order, Chats first with its Ready count; a tap opens that desk', async () => {
  const P = appsWorld();
  const { default: setup } = await import(new URL('web/layouts/apps/layout.js', root));
  const off = setup(P.api);
  assert.equal(P.html.dataset.appsHome, 'on');
  const grid = P.homeSec.children.find(c => c.className === 'ap-grid'); assert.ok(grid, 'the grid lives in the Home desk (it slides with Home)');
  const icons = () => grid.children.filter(b => !b.classList.contains('ap-plus')).map(b => [b.attrs['data-app'], b.attrs['data-desk'] ?? null]);
  assert.deepEqual(icons(), [['wizard', null], ['mail', '1'], ['music', '3'], ['files', '5']], 'Chats first, then one icon per desk (the Chats desk is the Chats icon)');
  assert.ok(grid.children.at(-1).classList.contains('ap-plus'), 'the grid ends with a + tile');
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
  assert.equal(P.html.dataset.viewChrome, undefined, 'the dock switcher is back (chrome.css only matches while worn)'); assert.equal(P.find('vc-back').length, 0, 'no Back left');
});

test('Apps on the desktop: a launchpad, one icon per desk (Chats first, + last), no Back, the orb at the bottom on every screen (drag up = Home)', async () => {
  const P = appsWorld({ shell: 'desktop' });
  P.state.desks = [{ desk: 0, id: 'mail', name: 'Mail' }, { desk: 1, id: 'wizard', name: 'Chats' }, { desk: 2, id: 'music', name: 'Music' }];
  const { default: setup } = await import(new URL('web/layouts/apps/layout.js', root));
  const off = setup(P.api);
  const grid = P.find('apd-grid')[0]; assert.ok(grid && P.find('apd')[0].parentNode === P.device, 'mounted on the stage');
  const ids = () => grid.children.map(b => b.attrs['data-app'] ?? '+');
  assert.deepEqual(ids(), ['wizard', 'mail', 'music', '+'], 'Chats first, one icon per desk, + last');
  assert.equal(grid.children[0].attrs['data-desk'], '1', 'Chats is the Chats desk');
  assert.equal(grid.children[0].attrs['aria-label'], 'Chats, 7 ready'); assert.equal(grid.children[1].attrs['aria-label'], 'Mail, 2 new');
  assert.equal(P.html.dataset.appsDesk, 'home'); assert.equal(P.html.dataset.viewChrome, 'desktop');
  assert.equal(P.find('vc-back').length, 0, 'no Back button');
  assert.ok(P.find('apd-orbbtn')[0], 'the orb is there on Home');
  assert.equal(P.state.swipes, undefined, 'the desktop orb is the layout\'s own: no dock swipe map');
  grid.children[2].dispatchEvent({ type: 'click' }); assert.deepEqual(P.state.gone, [2], 'an icon opens its desk');
  // away from Home: the grid steps aside, the orb stays (still no Back)
  P.state.home = false; P.state.desk = 2; P.fire('route');
  assert.equal(P.html.dataset.appsDesk, 'desk'); assert.equal(P.find('apd-home')[0].hidden, true); assert.equal(P.find('vc-back').length, 0);
  assert.ok(P.find('apd-orbbtn')[0].parentNode, 'the orb floats on every screen');
  // the orb: a click talks; a sideways drag does nothing (no desk steps); a drag up = Home (the grid)
  const ob = P.find('apd-orbbtn')[0], gone = P.state.gone.length;
  ob.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 600, clientY: 700, pointerId: 1 }); ob.dispatchEvent({ type: 'pointerup' });
  assert.deepEqual(P.state.voice, ['talk']);
  for (const [dx, dy] of [[-70, 0], [70, 0], [0, 60]]) {
    ob.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 600, clientY: 700, pointerId: 1 }); ob.dispatchEvent({ type: 'pointermove', clientX: 600 + dx, clientY: 700 + dy }); ob.dispatchEvent({ type: 'pointerup' });
  }
  assert.equal(P.state.gone.length, gone, 'sideways / down: no desk step'); assert.equal(P.state.homes, 0, 'and not Home'); assert.deepEqual(P.state.voice, ['talk'], 'a drag never talks');
  ob.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 600, clientY: 700, pointerId: 1 }); ob.dispatchEvent({ type: 'pointermove', clientX: 610, clientY: 630 }); ob.dispatchEvent({ type: 'pointerup' });
  assert.equal(P.state.homes, 1, 'drag up = Home (the grid)'); assert.deepEqual(P.state.voice, ['talk']);
  P.state.home = true; P.fire('route');
  ob.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 600, clientY: 700, pointerId: 1 }); ob.dispatchEvent({ type: 'pointermove', clientX: 600, clientY: 620 }); ob.dispatchEvent({ type: 'pointerup' });
  assert.equal(P.state.homes, 1, 'on Home a drag up does nothing more (⌥` would toggle away; this never does)');
  // the + sheet on the desktop: every app not open yet, a pick opens it on a desk of its own
  P.state.home = true; P.fire('route');
  grid.children.at(-1).dispatchEvent({ type: 'click' });
  const sheet = P.find('vc-sheet')[0]; assert.ok(sheet, 'the sheet opens');
  assert.deepEqual(P.find('vc-app').map(b => b.attrs['data-app']), ['files', 'notes', 'maps']);
  P.find('vc-app')[1].dispatchEvent({ type: 'click' }); assert.deepEqual(P.state.openedDesk, ['notes']); assert.equal(P.find('vc-sheet').length, 0, 'and closes');
  off(); for (const n of P.find('apd')) n.remove();
  assert.equal(P.html.dataset.appsDesk, undefined); assert.equal(P.html.dataset.viewChrome, undefined);
});

test('the + sheet lists the stock picker\'s apps minus Chats and every app already open; Back / Esc / the backdrop close it', async () => {
  const { notOpen } = await import(new URL('web/layouts/apps/chrome.js', root));
  const list = [{ id: 'wizard', name: 'Chats' }, { id: 'mail', name: 'Mail' }, { id: 'files', name: 'Files', system: true }, { id: 'x', name: 'X', connector: true }, { id: 'a', name: 'A', agent: true }, { id: 'n', name: 'N', dev: true }, { id: 'music', name: 'Music' }];
  assert.deepEqual(notOpen(list, ['mail', 'wizard']).map(a => a.id), ['files', 'music'], 'system apps stay (the picker shows them); connectors, agents, test copies and open apps go');
  const P = appsWorld();
  const { default: setup } = await import(new URL('web/layouts/apps/layout.js', root));
  const off = setup(P.api);
  const plus = P.find('ap-plus')[0]; plus.dispatchEvent({ type: 'click' });
  assert.deepEqual(P.find('vc-app').map(b => b.attrs['data-app']), ['notes', 'maps'], 'Mail, Music and Files are open on desks already');
  assert.equal(P.state.backs.length, 1, 'the open sheet joins the Back order'); P.state.backs[0](); assert.equal(P.find('vc-sheet').length, 0);
  plus.dispatchEvent({ type: 'click' }); P.find('vc-scrim')[0].dispatchEvent({ type: 'click' }); assert.equal(P.find('vc-sheet').length, 0, 'the backdrop closes it');
  plus.dispatchEvent({ type: 'click' }); P.find('vc-app')[0].dispatchEvent({ type: 'click' });
  assert.deepEqual(P.state.openedDesk, ['notes'], 'a pick opens it on a desk of its own'); assert.equal(P.state.backs.length, 0);
  // the new desk shows up as its own icon
  P.state.desks.push({ desk: 6, id: 'notes', name: 'Notes' }); P.fire('route');
  assert.ok(P.find('ap-icon').some(b => b.attrs['data-app'] === 'notes'));
  plus.dispatchEvent({ type: 'click' }); assert.deepEqual(P.find('vc-app').map(b => b.attrs['data-app']), ['maps']);
  off();
});

test('phone, Apps and Orb: no stock desk switcher on any screen, the dock orb stays where it is; no Back: the orb swipes up = Home', async () => {
  const P = appsWorld();
  const { default: setup } = await import(new URL('web/layouts/apps/layout.js', root));
  const off = setup(P.api);
  assert.equal(P.find('vc-back').length, 0, 'no Back button on Home');
  P.state.home = false; P.fire('route'); assert.equal(P.find('vc-back').length, 0, 'nor on an opened app / thread / Chats');
  assert.deepEqual({ ...P.state.swipes }, { up: 'home', side: null, down: null }, 'the dock orb: up = Home, sideways and down nothing');
  assert.equal(P.dock.children.length, 1, 'only the orb in the dock row');
  off(); assert.equal(P.state.swipes, 'released', 'Desks: the stock swipes are back');
  const css = read('web/layouts/apps/chrome.css').replace(/\/\*[\s\S]*?\*\//g, '');
  // the switcher goes on every screen (never gated on Home), only while a view wears the chrome
  assert.match(css, /html\[data-view-chrome="phone"\] #dock > :is\(#dotsL, #dotsR, \.scrub\) \{ display: none !important; \}/);
  assert.ok(!/data-orb-scene|home-desk/.test(css), 'not just on Home');
  assert.ok(!/vc-back/.test(css + read('web/layouts/apps/layout.css')), 'no Back button styles left');
  for (const sel of [...css.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(x => !/^(from|to)$/.test(x))) for (const part of sel.split(/,(?![^(]*\))/)) assert.ok(part.trim().startsWith('html[data-view-chrome'), `chrome.css reaches Desks: ${part.trim()}`);
  // the Orb view wears the same chrome (+ beside the Chats pill, the same swipes), and no Back either
  const ph = read('web/layouts/orb/phone.js');
  assert.match(ph, /import \{ viewChrome \} from '\.\.\/apps\/chrome\.js';/);
  assert.match(ph, /const plus = chrome\.plus\('obp-plus', 'Open an app'\);\n  layer\.append\(field, orbBox, chats, plus\);/);
  assert.ok(!/chrome\.back|paintBack|vc-back/.test(ph + read('web/layouts/apps/chrome.js') + read('web/layouts/apps/desktop.js') + read('web/layouts/apps/layout.js')), 'no Back anywhere');
  assert.ok(!/fly|FLY|animate\(/.test(ph), 'the orb never flies between the centre and the dock');
});

test('Desks unchanged: the desktop and phone stock paths never meet Apps CSS unless worn; Apps wears on the desktop too', async () => {
  const css = read('web/layouts/apps/layout.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const sel of [...css.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(x => !/^(from|to)$/.test(x))) for (const part of sel.split(/,(?![^(]*\))/))
    assert.ok(/^html\[data-shell="(phone|desktop)"\]\[data-layout="apps"\]/.test(part.trim()), `unscoped: ${part.trim()}`);
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css + read('web/layouts/apps/chrome.css')), 'colours are tokens');
  for (const f of ['layout.js', 'desktop.js', 'chrome.js']) { const js = read('web/layouts/apps/' + f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); assert.ok(!/Math\.random|innerHTML|localStorage|setTimeout|setInterval/.test(js), f); }
  const f = fixture({ shell: 'desktop' });
  await f.mount('miguel/apps-home'); await settle();
  assert.equal(f.host.layout, 'apps', 'the desktop wears Apps too'); assert.ok(f.doc.head.children.some(l => /layouts\/apps\/layout\.css/.test(l.href || '')));
  await f.clear(); assert.equal(f.host.layout, 'classic'); assert.ok(!f.doc.head.children.some(l => /layouts\//.test(l.href || '')));
  // desktop adapter: one entry per desk (empty desks left out; a Chats desk is 'wizard'); + opens on a desk of its own
  const dj = read('web/desktop/desktop.js');
  const fn = dj.match(/deskApps: (\(\) => ws\.map[^\n]*),\n/)[1];
  const run = vm.runInNewContext(`(${fn})`, { ws: [{ wins: ['a'], focus: 'a' }, { wins: [] }, { wins: ['c', 'd'], focus: 'd' }, { wins: ['e'], focus: 'e' }],
    W: { a: { app: 'frame', appId: 'mail' }, c: { app: 'frame', appId: 'notes' }, d: { app: 'chats' }, e: { app: 'frame', appId: 'music' } },
    appOf: w => w.app === 'chats' ? { id: 'wizard', name: 'Wizard' } : { id: w.appId, name: w.appId[0].toUpperCase() + w.appId.slice(1) }, winTitle: () => '' });
  assert.deepEqual(JSON.parse(JSON.stringify(run())), [{ desk: 0, id: 'mail', name: 'Mail' }, { desk: 2, id: 'wizard', name: 'Chats' }, { desk: 3, id: 'music', name: 'Music' }]);
  assert.match(dj, /openAppDesk: id => \{[^\n]*if \(at >= 0\) \{ goWs\(at\); return true; \}\n\s+if \(ws\[cur\]\.wins\.length\) \{ ws\.push\(freshDesk\(\)\); return openApp\(a, \{ ws: ws\.length - 1 \}\) !== false; \} return openApp\(a\) !== false; \},/);
  const host = read('web/core/skin-host.js');
  assert.match(host, /openDesk: id => live\(\) && typeof id === 'string' && id \? !!\(shell\.openAppDesk \? shell\.openAppDesk\(id\) : shell\.openApp\?\.\(id\)\) : false,/);
  assert.match(host, /list: \(\) => \{ const l = live\(\) \? \(shell\.deskApps \|\| shell\.phoneDesks\)\?\.\(\) : null;/);
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
  for (const sel of [...tw.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim())) for (const part of sel.split(/,(?![^(]*\))/)) assert.ok(/^html\[data-layout="apps"\]|^html\[data-shell="(phone|desktop)"\]\[data-layout="apps"\]/.test(part.trim()), `apps-home tweak.css reaches past the Apps view: ${part.trim()}`);
});

test('Apps view: listed under Miguel, never a default, chosen in Settings › Look › Shell view (manifest view: Apps)', async () => {
  assert.equal(JSON.parse(read('web/tweaks/miguel/apps-home/manifest.json')).view, 'Apps');
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
