// Synthetic raw Agent Service list fixture, shared by all Morning browser cases.
// Mirrors web/live.js normalize/fetchSessions, NOT the listVersion=1 slim DTO.
// Bootstrap is config-only; WIZ_DATA is a retired, unread compatibility global.
function readySessionFixture(now = Date.now()) {
  const at = new Date(now).toISOString(), before = new Date(now - 60000).toISOString();
  const id = 'qa_morning_ready';
  const user = { id: 1, session_id: id, role: 'user', content: 'Synthetic fixture question.', timestamp: before };
  const assistant = { id: 2, session_id: id, role: 'assistant', content: 'Synthetic fixture answer ready.', timestamp: at };
  const session = { id, source: 'wizard-mobile', agent: '', title: 'Synthetic Ready chat',
    status: 'completed', wizard_last_run_status: 'completed', archived: false, hidden: false, message_count: 2,
    started_at: before, updated_at: at, last_active: at, wizard_activity_at: at,
    wizard_last_user_at: before, wizard_last_assistant_at: at,
    latest_message: assistant, last_user_message: user,
    wizard_attention: { state: 'done', ask: 'Synthetic fixture answer ready.', subject: 'Fixture' } };
  return { id, session,
    list: { object: 'list', data: [session], has_more: false,
      pagination: { offset: 0, limit: 100, returned: 1, has_more: false } },
    detail: { session },
    messages: { object: 'list', data: [user, assistant], has_more: false,
      pagination: { offset: 0, limit: 500, returned: 2, has_more: false } } };
}
module.exports = { readySessionFixture };
