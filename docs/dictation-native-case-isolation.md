# Native dictation: case isolation (controller only)

REUSE the exact six already-built QA APKs and d508af17 real-service startup fix.
EXTEND controller process isolation, evidence custody and regressions. No Android
source, fixture assertion, production code, signed APK or product revision changes.

## Why the previous run is inconclusive

The multi-method run reports previous modes/payloads in subsequent failure
assertions. The fixture clears its JSON before launching another activity, but an
old editor process/activity still has delayed persistence callbacks and lacks
onDestroy cancellation. Its IME readiness wait only compares packageName; in a
multi-method run, the previous editor has the same package. Existing logcat lacks
a dispatch marker, so onFinishInput/onStartInput timing alone does not prove a
product fence/verification defect. `qa_dictation_case_evidence.py` derives exact
case start/failure timestamps, IME events and observed fixture modes from retained
raw protocols, not a reconstructed successful run.

Baseline missingNode is not waived. Built baseline insertText obtains the real IC
and commits without requiring findEditable to return a node. A stale previous
connection can explain `typed` without new fixture writes, but only an isolated
real run establishes whether the baseline control is valid in this environment.
Both original baseline cases must pass and both rejected controls must fail at
the unchanged exact insertion assertion. Setup failures never count as rejection.

## Repair and limits

- Every selected method gets its own instrumentation invocation: 2 baseline,
  2 rejected, all 27 candidate. Failures do not skip independent cases or lanes.
- Disable accessibility, force-stop target and test packages, and verify no exact
  package or colon-suffixed process remains (including :dictationEditor). Only
  then remove both fixture files and prove absence. This kills old callbacks.
- Start unchanged instrumentation, wait for its latest non-suppressing real
  UiAutomation registration, then re-enable the actual accessibility service.
- The source contract checks that every selected method launches exactly one
  literal editor and selection precedes focus. In a fresh target/editor process,
  the first matching package belongs to that sole editor, not a previous case.
  Existing real InputConnection/package readiness and product fences remain.
- Audit the actual first framework EditorInfo (fieldId=1 and initial selection)
  and final fixture mode per case; reject audit mismatch and retain raw logs.
  This is **not** an explicit pre-dispatch fieldId/selection probe. No such probe
  can be added controller-only to these exact APKs. An isolated failure still
  needs a minimal actual reproduction/timestamp before product attribution.
- Preserve raw protocol and diagnostics before teardown, then prove process
  absence again. Keep per-case receipts and strict combined method census.
- Bound each invocation to 90 seconds and unwind the emulator at 2300 seconds,
  before the outer 2700-second child and 3600-second queue deadlines.

## Parent-only staging

Use `qa_dictation_native_resume.py prepare` on forum against the previous failed
packet and the evidence JSON. Preparation verifies and seals original source,
APKs, raw failed results, controller closure and unchanged packet method list.
Only the parent may submit the returned one-use `parent-only-spec.json` through
the heavy queue. Preparation/controller regressions are NOT native acceptance.

If isolation still produces exact field text with expected verified count 1 but
actual 0, preserve that case's protocol, fixture counters and IME restart trace.
Do not weaken editorGeneration/connection/node fences or broadly rewrite product.
The parent decides the next minimal timestamped reproduction.
