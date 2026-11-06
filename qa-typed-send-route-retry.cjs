// Extends the shared custody browser harness. All API reads/writes/inference are
// synthetic/intercepted; the old failed model-only row is explicitly seeded.
// This is NOT proof of the original device's IndexedDB row or executed inference.
const fs = require('fs'), path = require('path');
module.exports = async ({ boot, ok, sleep, sid, out }) => {
  const model = 'gpt-6.1-sol', provider = 'openai-codex';
  for (const desktop of [false, true]) for (const skin of ['nebula', 'signal']) {
    // A run left active by the fixture can make the next fresh send steer instead
    // of admit a run. Each case owns a context; Signal still switches LIVE from
    // Nebula in that context, rather than merely loading a Signal screenshot.
    const fixture = {
      typedRoute: true, skin: 'nebula',
      sessions: [{ id: sid, title: 'Synthetic typed-send recovery', source: 'wizard-mobile',
        model, provider: null, status: 'completed', message_count: 2,
        messages: [{ role: 'user', content: 'Synthetic prior question' }, { role: 'assistant', content: 'Synthetic prior answer' }] }],
      agents: [{ id: 'hermes', label: 'Wizard', is_default: true, status: 'running', model: { model, provider } }],
      modelOptions: { model, provider, providers: [{ slug: provider, authenticated: true, is_current: true, models: [model, 'gpt-6-astra'] }] }
    };
    const f = await boot(desktop, false, null, fixture), p = f.p;
    let wid = f.wid, chat = p.locator(`[data-chats="${wid}"]`);
    f.state.down = false;
    const label = `${desktop ? 'desktop' : 'phone'}-${skin}`, record = (v, n, d) => ok(v, `${label}: ${n}`, d);
    const click = locator => locator[desktop ? 'click' : 'tap']();
    async function reopen() {
      // Docked desktop Send destroys its thread panel; a still-visible outgoing
      // animation is NOT a live window. Rebind to the real newly opened panel.
      const current = await p.evaluate(({ wid, sid }) => (window.__wos || window.__wux).wins[wid]?.thread === sid, { wid, sid });
      if (!current || !await chat.locator('.ch-compose textarea').isVisible().catch(() => false)) {
        await click(p.locator(`button.ch-row[data-chopen="${sid}"]:visible`).first());
      }
      await p.waitForFunction(sid => {
        const A = window.__wos || window.__wux;
        return [...document.querySelectorAll('[data-chats]')].some(el =>
          A.wins[el.dataset.chats]?.thread === sid && !el.closest('[inert], .panel-out') &&
          el.querySelector('.ch-compose textarea')?.getClientRects().length);
      }, sid);
      wid = await p.evaluate(sid => {
        const A = window.__wos || window.__wux;
        return [...document.querySelectorAll('[data-chats]')].find(el =>
          A.wins[el.dataset.chats]?.thread === sid && !el.closest('[inert], .panel-out') &&
          el.querySelector('.ch-compose textarea')?.getClientRects().length).dataset.chats;
      }, sid);
      chat = p.locator(`[data-chats="${wid}"]`);
      await chat.locator('.ch-compose textarea').waitFor({ state: 'visible' });
    }
    try {
      await p.evaluate(skin => WosSkin.set(skin), skin);
      await p.waitForFunction(skin => WosSkin.current === skin && document.documentElement.dataset.skin === skin, skin);
      await reopen(); await sleep(250);
      const chip = await chat.locator('[data-chmodel]:visible').first().innerText();
      record(/Sol/.test(chip), 'model-only thread displays the original Sol chip', chip);
      const freshText = `Synthetic fresh typed reply ${label}`, beforeFresh = f.state.posts.length;
      await chat.locator('.ch-compose textarea').fill(freshText);
      await click(chat.locator('.ch-compose button[type="submit"]'));
      await p.waitForFunction(text => [...WosOutbox._items.values()].some(it => it.text === text && it.state === 'sent'), freshText);
      const fresh = f.state.posts.slice(beforeFresh);
      record(fresh.length === 1 && fresh[0].input === freshText && fresh[0].session_id === sid && fresh[0].model === model && fresh[0].provider === provider && fresh[0].require_model_lock === true,
        'fresh typed Send captures exact chip route once through real composer', fresh);
      // Wait on canonical navigation, not a fixed delay or outgoing panel's rect.
      if (!desktop || await p.evaluate(() => !!WosSkinHost.panelMode)) {
        await p.waitForFunction(({ wid, sid }) => (window.__wos || window.__wux).wins[wid]?.thread !== sid, { wid, sid });
      }
      await reopen();
      const text = `Synthetic retained typed reply ${label}`;
      const id = await p.evaluate(async ({ sid, model, text }) => {
        const it = await WosOutbox.stage({ kind: 'reply', sessionId: sid, model, provider: '', text });
        await WosOutbox.transition(it.id, 'failed', 'No confirmed model route · choose a model before retrying');
        return it.id;
      }, { sid, model, text });
      const bubble = chat.locator(`[data-ob="${id}"]`), retry = bubble.locator(`[data-obretry="${id}"]`);
      await retry.waitFor({ state: 'visible' }); await retry.scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(out, `${label}-model-only-before.png`), animations: 'disabled' });
      const beforeRetry = f.state.posts.length;
      await click(retry);
      await p.waitForFunction(id => WosOutbox.get(id)?.state === 'sent', id);
      const sent = f.state.posts.slice(beforeRetry), calls = (f.state.calls || []).filter(x => x.key === id);
      record(sent.length === 1 && calls.length === 1 && sent[0].input === text && sent[0].session_id === sid && sent[0].model === model && sent[0].provider === provider && sent[0].require_model_lock === true,
        'real Retry repairs only saved provider, keeping text/thread/key and one admission', { sent, calls });
      record(await p.evaluate(id => { const it = WosOutbox.get(id); return it?.durable && it.model === 'gpt-6.1-sol' && it.provider === 'openai-codex'; }, id),
        'repaired route is durably owned by the original row');
      await p.screenshot({ path: path.join(out, `${label}-model-only-after.png`), animations: 'disabled' });
      recordRequests(f, label, out);
    } catch (e) {
      await p.screenshot({ path: path.join(out, `${label}-typed-route-failure.png`) }).catch(() => {});
      recordRequests(f, label, out); throw e;
    } finally { await f.done(`${label} typed-route synthetic fixture`); }
  }
};
function recordRequests(f, label, out) {
  fs.writeFileSync(path.join(out, `${label}-typed-route-requests.json`), JSON.stringify({
    synthetic: true, writesForwarded: 0, note: 'Shared harness intercepts every API request; only candidate static files are served.',
    requests: f.state.requests, calls: f.state.calls, errors: f.state.errors
  }, null, 2));
}
