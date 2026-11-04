// Now playing (Miguel, 4 Nov 2026): one place to pause whatever an app is playing, shown only while something plays.
// A small pill (moving bars, the title, pause / play) sits at the top of the AI apps view's right apps column (the
// `apps-top` slot that view renders), else at the start of the desktop top bar's right controls. Desktop only for now:
// on the phone a floating pill covered apps' own bottom tab bars (Podcasts), so the phone's spot comes next. A click on the pill lists everything playing (app, title, pause / play each) and Pause all. Nothing is drawn
// while nothing plays: the pill leaves the page. The shell's media watcher (api.media, core/media-watch.js) does the
// watching and pausing; rule for what stays listed is there (paused items stay a minute with a play button).
export default function setup(api) {
  const M = api.media; if (!M || api.env.shell !== 'desktop') return () => {};
  const SVG = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const k in attrs) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); } return n; };
  const PATH = { pause: 'M9 5.5v13M15 5.5v13', play: 'M8.5 5.8v12.4l9.6-6.2z' };
  const glyph = name => { const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'np-g'); const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', PATH[name]); s.append(p); return s; };
  const bars = () => { const s = el('span', 'np-bars', { 'aria-hidden': 'true' }); s.append(el('i'), el('i'), el('i')); return s; };
  const setBtn = (b, on, what) => { b.replaceChildren(glyph(on ? 'pause' : 'play')); const w = (on ? 'Pause' : 'Play') + (what ? ' ' + what : ''); b.setAttribute('aria-label', w); b.title = on ? 'Pause' : 'Play'; };

  const pill = el('div', 'np', { role: 'group', 'aria-label': 'Now playing' });
  const body = el('button', 'np-b', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
  const label = el('span', 'np-t');
  body.append(bars(), label);
  const tog = el('button', 'np-p', { type: 'button' });
  const pop = el('div', 'np-pop', { role: 'dialog', 'aria-label': 'Playing now' }); pop.hidden = true;
  const rows = el('div', 'np-rows');
  const all = el('button', 'np-all', { type: 'button', text: 'Pause all' });
  pop.append(rows, all);
  pill.append(body, tog, pop);

  let items = [], open = false, unback = null;
  const top = () => items[0] || null;
  const what = x => x.title || x.app;

  function row(x) {
    const r = el('div', 'np-row' + (x.playing ? ' is-on' : ''));
    const go = el('button', 'np-go', { type: 'button', title: 'Open ' + x.app });
    const ic = el('span', 'np-ri'); const mark = M.icon(x.appId); ic.append(mark || bars());
    const words = el('span', 'np-rw');
    words.append(el('b', 'np-rt', { text: what(x) }));
    if (x.title) words.append(el('small', 'np-ra', { text: x.artist ? x.artist + ' · ' + x.app : x.app }));
    go.append(ic, words);
    api.listen(go, 'click', () => { closePop(); M.open(x.appId); });
    const b = el('button', 'np-p np-rp', { type: 'button' }); setBtn(b, x.playing, what(x));
    api.listen(b, 'click', () => { if (x.playing) M.pause(x.key); else M.play(x.key); });
    r.append(go, b); return r;
  }
  function paint(list) {
    items = Array.isArray(list) ? list : [];
    if (!items.length) { leave(); return; }
    pill.classList.remove('is-out');
    const x = top();
    pill.classList.toggle('is-paused', !items.some(i => i.playing));
    label.textContent = what(x);
    body.title = (x.title ? x.title + ' · ' : '') + x.app + (items.length > 1 ? ` · ${items.length} playing` : '');
    body.setAttribute('aria-label', 'Now playing: ' + what(x) + (x.title ? ', ' + x.app : '') + '. Show everything playing');
    setBtn(tog, x.playing, what(x));
    if (open) { rows.replaceChildren(...items.map(row)); all.hidden = !items.some(i => i.playing); api.frame(placePop); }
    place();
  }
  // Where it sits: the AI apps column when that view shows it, else the bar / dock.
  function place() {
    if (!items.length) return;
    const at = api.slot('apps-top') ? 'apps-top' : 'dock-end';
    if (!api.slot.mount(at, pill, at === 'dock-end' ? -1 : 0)) return;
    pill.dataset.at = at;
  }
  // Fade out (250 ms) then leave the page, so an idle screen is exactly what it was.
  function leave() {
    closePop();
    if (!pill.parentNode || pill.classList.contains('is-out')) return;
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm || typeof pill.getClientRects !== 'function' || !pill.getClientRects().length) { pill.remove(); return; }
    pill.classList.add('is-out');
  }
  api.listen(pill, 'animationend', e => { if (e.target === pill && pill.classList.contains('is-out') && !items.length) { pill.classList.remove('is-out'); pill.remove(); } });

  // The list: under the pill (above it on the phone), kept inside the screen.
  function placePop() {
    if (!open) return;
    pop.style.left = '0px'; pop.style.top = '0px';
    const o = pop.getBoundingClientRect(), p = pill.getBoundingClientRect(), w = o.width, h = o.height;
    const W = innerWidth, H = innerHeight, gap = 6;
    let x = p.right - w; if (p.left + p.width / 2 < W / 2) x = p.left;
    x = Math.max(8, Math.min(W - w - 8, x));
    let y = p.bottom + gap; if (y + h > H - 8) y = Math.max(8, p.top - gap - h);
    // a parent that makes its own fixed frame (a glass bar): subtract where 0,0 landed
    pop.style.left = Math.round(x - o.left) + 'px'; pop.style.top = Math.round(y - o.top) + 'px';
  }
  function openPop() {
    if (open || !items.length) return;
    open = true; pop.hidden = false; body.setAttribute('aria-expanded', 'true');
    rows.replaceChildren(...items.map(row)); all.hidden = !items.some(i => i.playing);
    unback = api.back.push(closePop);
    placePop();
  }
  function closePop() {
    if (!open) return;
    open = false; pop.hidden = true; body.setAttribute('aria-expanded', 'false');
    const off = unback; unback = null; off?.();
  }
  api.listen(body, 'click', () => (open ? closePop() : openPop()));
  api.listen(tog, 'click', () => { const x = top(); if (!x) return; if (x.playing) M.pause(x.key); else M.play(x.key); });
  api.listen(all, 'click', () => { M.pauseAll(); });
  api.listen(document, 'pointerdown', e => { if (open && !pill.contains(e.target)) closePop(); }, true);
  // a click inside an app (its own frame) never reaches the shell: the shell losing focus closes the list too
  api.listen(globalThis, 'blur', closePop);
  api.listen(globalThis, 'resize', () => { if (open) api.frame(placePop); });

  api.on('route', place); api.on('render', place);
  const off = M.watch(paint);
  return () => { off(); closePop(); };
}
