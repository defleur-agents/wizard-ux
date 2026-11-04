// The switch itself is CSS (--wos-reply-summary: on); the host removes it on teardown and Chats repaints without it.
// Settings › Chats & app screens gets one switch, "Short answers start collapsed" (on by default, kept on this device):
// off asks the shell for every long reply to open in full (api.replies.summaryStart).
export default function setup(api) {
  const collapsed = () => api.storage.get('start') !== 'expanded';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const group = el('div', 'st-group'), row = el('button', 'st-row tw-row'), tx = el('span', 'st-tx'), sw = el('span', 'sw'), note = el('small');
  row.type = 'button'; row.setAttribute('role', 'switch'); row.setAttribute('data-rsum-start', '');
  sw.setAttribute('aria-hidden', 'true'); sw.append(el('i'));
  tx.append(el('b', '', 'Short answers start collapsed'), note); row.append(tx, sw); group.append(el('h4', '', 'Short answer first'), row);
  const paint = () => {
    const on = collapsed();
    row.setAttribute('aria-checked', String(on)); sw.className = on ? 'sw on' : 'sw';
    note.textContent = on ? 'Long replies show their short answer; tap it for the full reply' : 'Long replies open in full; Show less folds them to the short answer';
    api.replies.summaryStart(on ? 'collapsed' : 'expanded');
  };
  api.listen(row, 'click', () => { api.storage.set('start', collapsed() ? 'expanded' : 'collapsed'); paint(); });
  paint();
  api.settings.section('reply-summary', 'chats', group);
  return () => {};
}
