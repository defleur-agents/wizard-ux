// The agent's own notes (about no app) only wait in Chats (Miguel, 5 Nov 2026): no Badge, Morning report or Off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './fixtures/notification-levels.mjs';

const src = read('web/core/notif-bell.js');
const at = src.indexOf('const chatsOnly');
const keep = src.slice(at, src.indexOf('\n', src.indexOf('const keepable', at)));

test('Notifications\' own source accepts Chats only; apps keep every choice', () => {
  const f = new Function('validId', 'TO', 'dailyOk', keep + '\nreturn { chatsOnly, keepable };');
  const { keepable } = f(() => true, ['chats', 'badge', 'daily', 'off'], () => true);
  assert.equal(keepable('notifications', 'chats'), true);
  for (const to of ['badge', 'daily', 'off']) assert.equal(keepable('notifications', to), false, to);
  for (const to of ['chats', 'badge', 'daily', 'off']) assert.equal(keepable('second-hand', to), true, to);
});

test('a saved non-Chats choice for the agent\'s notes reads as Chats, and the picker offers only Chats', () => {
  assert.match(src, /if \(chatsOnly\(id\)\) return 'chats';/);
  assert.match(src, /TO\.filter\(to => !chatsOnly\(id\) \|\| to === 'chats'\)/);
});
