# Recorder recovery at the interface Reload guard

## Component decision
- **REUSE** `WizAppCapture` durable custody, microphone lock and `recover` lifecycle; `WizAppServices.update.reloadPlan`; `WizWebUpdate.reload/go`.
- **EXTEND** these owners with a tap-only, fail-closed ownership refresh and a proven-durable stopped-custody predicate. No replacement recorder, second reload guard, audio deletion or hold timeout.
- **NEW** regression fixtures only. `qa-closed-shell.cjs` adopts the existing closed synthetic shell fence from the live unread-badge acceptance (599ff269); the Recorder runner adds no owner/network fallback.

## Verified lineage and limits
Serving shell discovery on 4 November: `WIZARD_UX_DIR=/home/telos/.local/share/wizard-ux/current/web`, release `599ff2694806235759738c4a1a2c5e2011dfd6e4`.
Serving Recorder frontend is the immutable `7b4a3d1-owner-876c5c8b9a38-nodiar/adoptions/mizel-live/web/app.js` release (source only inspected). No meeting API, private DB, audio, title, transcript or agent home was read.

The screenshot's toast is emitted by `web/core/web-update.js:reload`, where either the host is busy or a non-armable hold blocks. It cannot identify the handset's in-memory owner. No claim is made that server inspection proves the handset state.

The serving Recorder has a concrete failed-start lifecycle leak: `beginRecording` catches Start errors, clears `state.rec.engine`, then unconditionally calls `startPillClock`; that function acquires `Mizel recording`. `stopRecording` returns immediately in error phase, and normal `endRecSession` releases the hold only after a successful save. The shell's existing broad capture-name matcher already recognizes both `Mizel recording` and `Mizel capture or durable task save`; a label mismatch is **not** the cause.

Separately, the old Reload path judges a synchronous ownership snapshot. Abandoned native ownership is refreshed by capture recovery, not by Reload, so a stale owner can keep the banner held. The old `go` also waits 900 ms after the click without checking whether recording/work began during that animation.

## Safe behavior
1. Real active browser capture, stopping/input-memory state, mic preparations/loans and unknown native owners still block. Android's existing positive native-survival path stays intact.
2. With no in-page active session or warm preparation, a tapped Reload paints `Checking recorder…`, uses the existing locked recovery, then judges a fresh whole-shell plan. A 15-second UI wait bound restores retryability; it never cancels capture or expires data/holds.
3. Only Recorder's two exact capture holds may follow committed pending custody (including an empty failed-start registry). Registry load, no recovery error, no active/live owner and every retained row pending are all required. Notes/other app holds remain blocked. Pending audio is neither acknowledged nor deleted; the existing Recorder pending-capture recovery uploads it after reload.
4. Every final reload checks the host + app/capture predicate after its animation and after native backup flushing.

## Bootstrap / owner safety
An already loaded handset still runs the old guard until it obtains new JS. Deployment does **not** inject a bypass into a live page. First finish/save any actual recording using its owning Recorder/voice controls. If the old Reload is still blocked, opening Recorder can run its existing shared-capture reattach/recovery path. Do not force-stop, clear browser storage, force-close the APK, or discard an error-state take. If that still does not free Reload, a handset control-only owner inspection/readiness confirmation is required before a one-time document reload; the server alone cannot prove that an in-page buffer is empty.

No Recorder service restart or backend migration is needed for the shell patch. Deployment must preserve all currently serving unrelated features and be coordinated against the live release immediately before activation.

## Tests / acceptance
`tests/recorder-reload-recovery.test.mjs`: exact hold names, unrelated work/notes, positive durable predicate, active/paused/stopping capture, unknown native truth, stale reservation custody retention, same-frame check paint, recovery failure retry and recording beginning during the reload animation.
`qa-recorder-reload-recovery.cjs`: closed offline real shell, mobile + desktop, Nebula + Sepia in-shell screenshots, failing bridge stays retryable, real fake-mic MediaRecorder protection and exact synthetic pending audio byte count after Stop + actual document reload. Run via forum durable queue only. Negative replay serves the exact old live tree and must fail `REGRESSION_FAILED_START_HOLD_MUST_NOT_TRAP_RELOAD`.
