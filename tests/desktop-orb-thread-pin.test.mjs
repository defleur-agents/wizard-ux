import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = process.env.QA_SOURCE || new URL('..', import.meta.url).pathname;
const source = readFileSync(resolve(root, 'web/desktop/desktop.js'), 'utf8');
const adapter = source.slice(source.indexOf('mountHost: () => stage,'));
const expression = adapter.match(/^\s*talk: (.+),$/m)?.[1];
assert.ok(expression, 'real desktop skin-host talk adapter exists');

for (const state of ['idle', 'listen', 'paused']) {
  test(`desktop layout talk uses contextual recorder in ${state}, never explicit new chat`, () => {
    const calls = [];
    const talk = vm.runInNewContext(`(${expression})`, {
      VOICE: { state }, talk: (...args) => calls.push(['context', ...args]),
      talkNew: (...args) => calls.push(['new', ...args]),
    });
    talk();
    assert.deepEqual(calls, [['context']], 'toggle starts from idle and sends a running take; send is stop-only');
  });
}

test('contextual recorder freezes thread, active run and model route before voice capture', () => {
  const start = source.indexOf('  async function talk(');
  const body = source.slice(start, source.indexOf('  // Composer mic:', start));
  const capture = body.indexOf('await VOICE.start()');
  for (const token of ['vSnapshot = commandSnapshot()', 'vReply = !forceNew', 'steerRunId:', 'vRoute = vConversation ? null : resolveRoute()']) {
    assert.ok(body.indexOf(token) >= 0 && body.indexOf(token) < capture, token);
  }
  assert.match(body, /const aimSid = vFeedback\?\.thread \|\| rp\?\.sid/);
  assert.match(body, /CHATS\.sendVoiceTo\(rp\.wid, rp\.sid/);
  assert.match(body, /OUTBOX\.handOff\?\.\(stagedId\)/);
});
