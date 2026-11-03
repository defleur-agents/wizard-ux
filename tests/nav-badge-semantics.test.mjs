import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../web/core/workspace-navigation.js', import.meta.url), 'utf8');

function load() {
  const window = { WizCore: {}, dispatchEvent() {} };
  class CustomEvent {}
  vm.runInNewContext(source, { window, CustomEvent });
  return window.WizCore.workspaceNav;
}

test('the Chats navigation count comes only from visible unread chats', () => {
  const nav = load();
  const rows = [{ id: 'unread-a' }, { id: 'ready-but-read' }, { id: 'unread-b' }];
  const live = {
    ok: true,
    unified: () => rows,
    visibleUnread: received => [received[0], received[2]],
    workGroups: () => ({ ready: rows }),
  };
  assert.equal(nav.chatUnreadCount(live), 2);
  assert.equal(nav.chatUnreadCount({ ...live, ok: false }), 0);
  assert.equal(nav.chatUnreadCount({ ok: true }), 0);
});