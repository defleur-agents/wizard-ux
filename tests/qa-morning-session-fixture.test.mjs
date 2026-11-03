import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import fixture from '../tools/qa-morning-session.cjs';
const source = readFileSync(new URL('../web/live.js', import.meta.url), 'utf8');

// Queued execution only: prove the actual current normalizer/list consumer accepts
// the raw fixture without renderer changes, forced drafts, or synthetic DOM.
for (const layout of ['day', 'status']) test(`Morning fixture survives canonical list refresh in ${layout} Ready`, async () => {
  const now = Date.parse('2026-11-03T12:00:00Z'), f = fixture.readySessionFixture(now);
  const storage = new Map([['wos.chats.layout.v1', layout]]), calls = [];
  const c = { console, URL, URLSearchParams, AbortSignal,
    Date: class extends Date { static now() { return now; } },
    document: { documentElement: { dataset: {} }, readyState: 'loading', hidden: false, addEventListener() {} },
    navigator: {}, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    setTimeout() {}, setInterval() {}, addEventListener() {},
    WizConfig: { dayStart: n => n - n % 864e5 },
    async fetch(url) {
      calls.push(url);
      const pathname = new URL(url, 'https://fixture.test').pathname;
      const value = pathname === '/wizard/hermes/api/sessions' ? f.list :
        pathname === '/wizard/thread-seen' ? { state: { initializedAt: 1, threads: {} } } : {};
      return { ok: true, status: 200, json: async () => structuredClone(value) };
    } };
  c.window = c; vm.runInNewContext(source, c);
  await c.WizLive.refresh();
  assert.equal(c.WizLive.ok, true, c.WizLive.error);
  const row = c.WizLive.session(f.id);
  assert.equal(row.status, 'completed'); assert.equal(row.agent, '');
  assert.equal(row.previewRole, 'assistant'); assert.equal(row.messageCount, 2);
  assert.equal(row.previewAt, f.session.latest_message.timestamp);
  assert.equal(row.attention.state, 'done');
  assert.equal(c.WizLive.workGroups().ready.length, 1);
  assert.equal(c.WizLive.workGroups().ready[0].id, f.id);
  await c.WizLive.refresh();
  assert.equal(c.WizLive.sessions.length, 1, 'stable fixture page neither empties nor duplicates on poll');
  assert.equal(c.WizLive.workGroups().ready[0].id, f.id);
  assert.ok(calls.some(u => u.startsWith('/wizard/hermes/api/sessions?')));
  assert.equal(f.list.has_more, false); assert.equal(f.list.pagination.returned, f.list.data.length);
  assert.equal(f.list.list_version, undefined); assert.equal(f.session.listVersion, undefined);
  assert.strictEqual(f.detail.session, f.list.data[0]);
  assert.strictEqual(f.messages.data[1], f.session.latest_message);
});
