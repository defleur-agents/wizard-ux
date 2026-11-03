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

test('the Chats navigation count excludes Working activity and counts only unread messages', () => {
  const nav = load();
  const rows = [{ id: 'unread-ready' }, { id: 'working-with-new-activity' }, { id: 'ready-but-read' }];
  const live = {
    ok: true,
    unified: () => rows,
    visibleUnread: received => [received[0], received[1]],
    workGroups: received => ({ ready: [received[0], received[2]], working: [received[1]] }),
  };
  assert.equal(nav.chatUnreadCount(live), 1);
  assert.equal(nav.chatUnreadCount({ ...live, ok: false }), 0);
  assert.equal(nav.chatUnreadCount({ ok: true }), 0);
});