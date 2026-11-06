import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const java = p => read('android/app/src/main/java/ai/wizards/os/' + p + '.java');

test('both replacement receivers preserve the meeting before ordinary crash recovery', () => {
  for (const p of ['update/UpdateBoot', 'everywhere/EverywhereBoot'])
    assert.match(java(p), /ACTION_MY_PACKAGE_REPLACED[\s\S]*afterPackageReplaced\(c\)/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android.intent.action.MY_PACKAGE_REPLACED/);
});
test('replacement handler never starts the microphone or a foreground service', () => {
  const body = java('mizel/MeetingRecorderService').split('public static void afterPackageReplaced')[1].split('public static void resumeUpdateFromActivity')[0];
  assert.doesNotMatch(body, /startForegroundService|startCapture|ACTION_RESTORE/);
  assert.match(body, /!j.paused && j.stopReason == null && !j.stopSent/);
});
test('visible activity resumes before WebView native-resume events', () => {
  const s = java('MainActivity').split('protected void onResume()')[1];
  assert.ok(s.indexOf('resumeUpdateFromActivity(this)') < s.indexOf("wos-native-resume"));
});
test('update pause is a journal field and paused bridge state, not an ended meeting', () => {
  assert.match(java('mizel/MizelJournal'), /put\("resumeAfterUpdate", resumeAfterUpdate\)/);
  assert.match(java('mizel/MizelHub'), /MizelUpdatePolicy.pending\(last\)[\s\S]*state\(true, true,[^;]*"paused_for_update"/);
  assert.match(java('mizel/MizelStore'), /recover\(id, now, false\); \/\/ adopt the final partial WAV without sending \/stop/);
});
test('notification opens the meeting Activity directly, not a receiver trampoline', () => {
  const s = java('mizel/MeetingRecorderService');
  assert.match(s, /Recording paused for the app update/);
  assert.match(s, /setContentIntent\(openMeeting\(c, id, 6\)\)/);
  assert.match(s, /PendingIntent.getActivity\(c, req, i,/);
});
test('server origin and the user stop fence recovery', () => {
  assert.match(java('mizel/MizelUpdatePolicy'), /j.stopReason == null && !j.stopSent/);
  assert.match(java('mizel/MizelUpdatePolicy'), /j.uploadOrigin.equals\(origin\)/);
  assert.match(java('mizel/MizelStore'), /j.recording = false;\s*j.resumeAfterUpdate = false;/);
});
test('updater only bypasses the meeting hold after durable preparation', () => {
  const s = java('update/Updater');
  assert.match(s, /if \(tapped && ok && app.getPackageManager\(\).canRequestPackageInstalls\(\)/);
  assert.ok(s.indexOf('prepareForUpdate()') < s.indexOf('UpdatePolicy.Step step ='));
  assert.match(s, /!ai.wizards.os.mizel.MeetingRecorderService.updatePending\(c\)/);
});
