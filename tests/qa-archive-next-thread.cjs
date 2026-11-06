'use strict';
// Disposable synthetic transport only. No real owner API reads or writes, ever.
const assert = require('node:assert/strict');
const { chromium } = require('../tools/qa-playwright.cjs');
const { ownerRead } = require('../tools/qa-desktop-frame-fixture.cjs');
const fs = require('node:fs'), path = require('node:path');
const repo = path.resolve(__dirname, '..'), origin = process.env.QA_ORIGIN || 'https://archive-next.test', prefix = '/wizard-os-home/';
const web = process.env.QA_WEB || path.join(repo, 'web'), out = process.env.QA_OUT || path.join(repo, 'archive-next-evidence');
fs.mkdirSync(out, { recursive: true });
const report = { origin, web, cases: [] }, now = Date.now();
const profiles = [ ['phone', 'classic'], ['desktop', 'classic'], ['desktop', 'ai-apps'] ];
const snapshot = () => {
  const h = window.__wux || window.__wos;
  return { threads: Object.values(h.wins).filter(w => w.app === 'chats' && w.thread).map(w => w.thread), titles: [...document.querySelectorAll('.ch-thread .ti')].filter(n => n.getClientRects().length).map(n => n.textContent) };
};
(async () => {
  const browser = await chromium.launch();
  try {
    for (const [shell, layout] of profiles) for (const skin of ['nebula', 'sepia']) {
      const phone = shell === 'phone';
      for (const scenario of ['middle', 'last', 'only', 'nonopen', ...(layout === 'classic' ? ['filter', 'space'] : ['keyboard'])]) {
        const stem = `${shell}-${layout}-${skin}-${scenario}`, entry = { stem, errors: [], refused: [], writes: [], checks: [] };
        report.cases.push(entry);
        const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 960 }, isMobile: phone, hasTouch: phone, serviceWorkers: 'block', ...(phone ? { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36' } : {}) });
        const names = scenario === 'only' ? ['middle'] : ['north', 'middle', 'south'];
        const rows = names.map((name, i) => ({ id: 'qa-' + name, title: 'Synthetic ' + name, runtime: 'direct', status: 'completed', updated_at: new Date(now - i * 1000).toISOString(), updatedAt: new Date(now - i * 1000).toISOString(), message_count: 2, messageCount: 2, archived: false }));
        let archiveSettled = false;
        try {
          await context.routeWebSocket('**/*', w => w.close());
          await context.addInitScript(({ shell, layout, skin }) => {
            if (window !== top) return;
            for (const [k, v] of Object.entries({ 'wos.shell': shell, 'wos.desktop-view.v1': layout, 'wos.coached': 'true', 'wos.tour.v1': 'true', 'wos.welcome.v1': 'done', 'wos.skin': skin })) localStorage.setItem(k, v);
          }, { shell, layout, skin });
          await context.route('**/*', async r => {
            const q = r.request(), u = new URL(q.url()), method = q.method(), p = u.pathname;
            if (u.origin !== origin) { entry.refused.push({ method, url: q.url(), reason: 'external' }); return r.abort(); }
            if (!['GET', 'HEAD'].includes(method)) {
              const body = q.postDataJSON(); entry.writes.push({ method, path: p, body });
              const target = /^\/wizard\/hermes\/api\/sessions\/(qa-(?:north|middle|south))$/.exec(p);
              if (method === 'PATCH' && target && body.archived === true && Object.keys(body).length === 1) {
                if (scenario === 'middle') { await new Promise(resolve => setTimeout(resolve, 5000)); archiveSettled = true; return r.fulfill({ status: 500, json: { error: 'Synthetic archive refusal' } }); }
                rows.find(s => s.id === target[1]).archived = true; archiveSettled = true; return r.fulfill({ json: { ok: true } });
              }
              if (method === 'PUT' && p === '/wizard/thread-seen') return r.fulfill({ json: { ok: true, state: body } });
              entry.refused.push({ method, path: p, reason: 'unexpected-write' }); return r.fulfill({ status: 405, json: { error: 'Synthetic fixture refuses this write' } });
            }
            // Generated endpoints are synthetic, even when they share the static prefix.
            if (p === prefix + 'installed-apps.json') return r.fulfill({ json: { apps: [] } });
            if (p.startsWith(prefix)) {
              const f = decodeURIComponent(p.slice(prefix.length) || 'index.html'), abs = path.resolve(web, f);
              if (!abs.startsWith(path.resolve(web) + path.sep)) return r.abort();
              if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return r.fulfill({ path: abs });
              return r.fulfill({ status: 404, body: 'No synthetic static asset' });
            }
            if (p === '/wizard/v1/ui-preferences') return r.fulfill({ json: { migrations: { 'launcher-seed-v1': true }, spaces: [{ id: 'qa-space', name: 'Synthetic space', threads: ['qa-middle', 'qa-south'] }] } });
            if (p === '/wizard/hermes/api/sessions') return r.fulfill({ json: { data: rows, has_more: false } });
            const match = /^\/wizard\/hermes\/api\/sessions\/(qa-(?:north|middle|south))(\/messages)?$/.exec(p);
            if (match) return r.fulfill({ json: match[2] ? { messages: [{ role: 'user', content: 'Synthetic question', timestamp: now / 1000 }, { role: 'assistant', content: 'Answer for ' + match[1], timestamp: now / 1000 + 1 }] } : { session: rows.find(s => s.id === match[1]) } });
            return r.fulfill({ json: ownerRead(p) });
          });
          const page = await context.newPage(); page.on('pageerror', e => entry.errors.push(e.message));
          await page.goto(origin + prefix + (phone ? 'index.html?phone' : 'desktop.html'));
          await page.waitForFunction(() => (window.__wux || window.__wos) && !window.WosWelcome?.active && !window.WosExperience?.state.busy);
          assert.equal(await page.evaluate(() => document.documentElement.dataset.shell), shell);
          if (layout === 'ai-apps') await page.waitForFunction(() => document.documentElement.dataset.aiApps === 'desktop');
          else await page.evaluate(phone => phone ? __wos.openSheet('inbox') : __wux.openChatsList(), phone);
          const rowSelector = layout === 'ai-apps' ? '.aad-rw[data-sid]' : '.ch-list [data-chopen]';
          await page.locator(rowSelector + (layout === 'ai-apps' ? '[data-sid="qa-middle"]' : '[data-chopen="qa-middle"]')).filter({ visible: true }).first().waitFor();
          if (scenario === 'filter' || scenario === 'space') {
            await page.evaluate(({ scenario }) => {
              const h = window.__wux || window.__wos, w = Object.values(h.wins).find(w => w.app === 'chats' && !w.thread), id = document.querySelector(`[data-chats="${w.id}::list"]`) ? w.id + '::list' : w.id;
              if (scenario === 'filter') h.chats.setQuery({ ...w, id, thread: null }, 'Synthetic middle');
              else h.chats.setFocus(w, { kind: 'space', key: 'qa-space' });
            }, { scenario });
          }
          const visibleRows = await page.locator(rowSelector).filter({ visible: true }).evaluateAll(rs => rs.map(r => r.dataset.sid || r.dataset.chopen));
          entry.visibleRows = visibleRows;
          const sid = scenario === 'last' ? visibleRows.at(-1) : 'qa-middle';
          assert.ok(visibleRows.includes(sid), stem + ' expected source row');
          if (scenario === 'filter') assert.deepEqual(visibleRows, ['qa-middle']);
          if (scenario === 'space') assert.deepEqual(visibleRows, ['qa-middle', 'qa-south']);
          const index = visibleRows.indexOf(sid), next = scenario === 'nonopen' ? sid : visibleRows[index + 1] || visibleRows[index - 1] || null;
          const row = page.locator(layout === 'ai-apps' ? `.aad-rw[data-sid="${sid}"] .aad-row` : `.ch-list [data-chopen="${sid}"]`).filter({ visible: true }).first();
          await row.click();
          await page.getByText('Answer for ' + sid, { exact: true }).filter({ visible: true }).waitFor();
          await page.locator('.ch-thread [data-chact="done"]').filter({ visible: true }).waitFor();
          if (scenario === 'middle') { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(out, stem + '-before.png') }); }
          await page.evaluate(snapshot => {
            window.archiveReceipt = null;
            window.addEventListener('click', e => {
              if (e.target.closest('[data-chact="done"], [data-rsact="done"], [data-act="done"]')) {
                const h = window.__wux || window.__wos;
                window.archiveReceipt = { at: performance.now(), threads: Object.values(h.wins).filter(w => w.app === 'chats' && w.thread).map(w => w.thread), titles: [...document.querySelectorAll('.ch-thread .ti')].filter(n => n.getClientRects().length).map(n => n.textContent) };
              }
            });
          });
          if (scenario === 'nonopen') {
            const other = visibleRows.find(id => id !== sid);
            if (layout === 'ai-apps') {
              await page.locator(`.aad-rw[data-sid="${other}"] .aad-row`).dispatchEvent('contextmenu');
              await page.locator('[role="menuitem"][data-act="done"]').click();
            } else {
              await page.evaluate(other => { const h = window.__wux || window.__wos, w = Object.values(h.wins).find(w => w.thread === 'qa-middle'); h.chats.openRowSheet(w.id, other); }, other);
              await page.locator('[data-rsact="done"]').filter({ visible: true }).click();
            }
          } else if (scenario === 'keyboard') {
            await page.keyboard.press('Alt+KeyE');
          } else await page.locator('.ch-thread [data-chact="done"]').filter({ visible: true }).click();
          entry.receipt = await page.evaluate(() => archiveReceipt);
          assert.ok(entry.receipt, stem + ': post-handler click receipt');
          assert.deepEqual(entry.receipt.threads, next ? [next] : [], stem + ': same-task selection');
          if (next) assert.ok(entry.receipt.titles.includes('Synthetic ' + next.slice(3)), stem + ': same-task painted title');
          if (scenario === 'middle') {
            assert.equal(archiveSettled, false, 'archive request still pending');
            await page.getByText('Answer for ' + next, { exact: true }).filter({ visible: true }).waitFor();
            await page.screenshot({ path: path.join(out, stem + '-after.png') });
            await page.getByText('Couldn’t archive · thread restored', { exact: true }).filter({ visible: true }).waitFor({ timeout: 8000 });
            assert.deepEqual((await page.evaluate(snapshot)).threads, [next], 'failure never yanks back');
            assert.equal(rows.find(s => s.id === sid).archived, false);
          } else await page.waitForFunction(() => document.body.innerText.includes('Archived'));
          assert.equal(entry.errors.length, 0, 'browser errors: ' + entry.errors.join('; '));
          assert.equal(entry.refused.filter(x => x.reason === 'unexpected-write').length, 0, 'no unexpected mutations');
          if (scenario !== 'nonopen' && next) {
            // Exercise the owning shell Back path, not a second opener.
            await page.evaluate(() => { const h = window.__wux || window.__wos, w = Object.values(h.wins).find(w => w.app === 'chats' && w.thread); h.chats.threadBack(w); });
            assert.deepEqual((await page.evaluate(snapshot)).threads, [], 'Back is one layer to list');
          }
          entry.pass = true;
        } catch (e) { entry.failure = e.stack; const pages = context.pages(); if (pages[0]) { entry.body = await pages[0].locator('body').innerText().catch(() => ''); await pages[0].screenshot({ path: path.join(out, stem + '-failure.png') }).catch(() => {}); } throw e; }
        finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await context.close(); }
      }
    }
    assert.equal(report.cases.length, 34);
  } finally { await browser.close(); }
  console.log(JSON.stringify({ cases: report.cases.length, passed: report.cases.filter(c => c.pass).length, screenshots: fs.readdirSync(out).filter(f => f.endsWith('.png')) }));
})().catch(e => { console.error(e); process.exitCode = 1; });
