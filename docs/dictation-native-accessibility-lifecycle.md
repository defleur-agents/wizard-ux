# Native dictation gate: accessibility startup ordering

REUSE existing three product/control APK pairs, selected JUnit class and real
cross-process editor. EXTEND the queue-only native controller; NEW product
implementation: none. No changes under `android/`, no APK rebuilding/signing,
no production-review supersession.

## Diagnosis from existing evidence, not a suppression guess

The original baseline log has this order:

- `04:14:59.451`: start target PID 3106 for `WizardKeyboardService`.
- `04:14:59.975`: `Force stopping ... : start instr`; PID 3106 killed and the
  actual accessibility ServiceRecord forcibly stopped.
- `04:14:59.990`: target instrumentation process PID 3168 starts.
- `04:15:00.664`: framework registers UiAutomation with **flags=0x1**.
- Both selected methods fail in `@Before` waiting for the real service, before
  editor creation. Missing optional `dictation-fixture.json` then obscured this
  primary assertion in the host receipt.

The selected class already uses
`getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)`.
Unselected Connect/Backup instrumentation classes use other calls but do not
execute in this class/method selection. Changing their code or claiming a
zero-flag UiAutomation caused this failure would not fit the observed log.

AOSP Android 15 tag `android-15.0.0_r1` was inspected directly:

- [ActivityManagerService.java, lines 16585–16597](https://android.googlesource.com/platform/frameworks/base/+/android-15.0.0_r1/services/core/java/com/android/server/am/ActivityManagerService.java#16585): normal instrumentation force-stops/relaunches its target (`start instr`).
- [AccessibilityManagerService.java, lines 818–845](https://android.googlesource.com/platform/frameworks/base/+/android-15.0.0_r1/services/accessibility/java/com/android/server/accessibility/AccessibilityManagerService.java#818): force-stop removes matching enabled services, clears binding/crash state and persists the changed secure setting.
- [UiAutomationManager.java, lines 104–107 and 173–176](https://android.googlesource.com/platform/frameworks/base/+/android-15.0.0_r1/services/accessibility/java/com/android/server/accessibility/UiAutomationManager.java#173): registration records the flags; flag bit 1 prevents suppression.
- [Instrumentation.java, lines 2502–2503 and 2540–2550](https://android.googlesource.com/platform/frameworks/base/+/android-15.0.0_r1/core/java/android/app/Instrumentation.java#2540): default overload requests flags 0; different flags disconnect the previous instance. Therefore readiness accepts only the **last** matching framework registration with bit 1 set, not any earlier matching line.

The APK definition census and merged-source manifest inspection are preserved
in the prepared packet's `diagnosis.json`: production singleton definitions
belong to the target APK, not duplicate test-APK definitions. Service and
instrumentation use the target default process; the editor alone is declared
in `:dictationEditor`. This rules out a duplicate singleton definition as an
alternative explanation; it is not runtime proof that the service connects.

## Controller correction

Disable/clear accessibility before starting instrumentation. Spawn the original
exact instrumentation selection; after the framework's non-suppressing
UiAutomation registration (which is after destructive target restart), enable
the original real service via secure settings. The existing six-second
`WizardKeyboardService.get()` and real input-method/editor lifecycle waits are
unchanged. There is no new service constructor, fake IPC, fallback insertion,
longer test timeout, assertion change or `--no-restart` escape hatch.

Always save raw instrumentation protocol and validate it before optional
artifact retrieval. Capture accessibility/service/process/settings/logcat and
screen diagnostics before disabling accessibility, even on setup failure.
Diagnostic errors are separate fields and never replace protocol assertions.
JUnit continues its independent selected methods; the controller now also
continues rejected/candidate lanes when baseline fails, then fails the aggregate.
A rejected service/setup failure is still **not** the required negative control:
both control methods must fail specifically at `exact field text`.

## Verification and parent-only execution

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=tools python3 -m unittest -v \
  test_qa_queue_lease test_qa_dictation_insertion_native \
  test_qa_dictation_candidate_resume test_qa_dictation_accessibility_lifecycle
```

53 controller tests pass (32 prior, 21 new); these are synthetic controller/real
child-descriptor checks, **not Android native acceptance**. Added cases cover
lifecycle ordering, suppressing/stale flags, early exit/timeouts, primary result
retention, diagnostic isolation, continued independent lanes, guest cleanup,
and seal/product/rebuild injection refusals.

`tools/qa_dictation_native_resume.py prepare` makes a fresh sibling packet on
the worker. It seals all original sources, receipts, six APKs, selected fixture
sources, candidate unit/lint reports and failed native logs; changes only the
host controller. The three revisions, manifests, APK hashes, source fixture
hashes and 27 candidate methods remain exact. `workers={}` explicitly forbids
build scheduling. Candidate unit census remains 410 and must be reread before
native execution. Native census remains baseline 2 passes, rejected 2 decisive
insertion failures, candidate 27 passes.

The emitted `parent-only-spec.json` pins `seal.json` SHA-256 in argv, retains the
real inherited queue FD and 200 GiB reserve, uses the forum heavy lane and stops
the fresh synthetic emulator in `finally`. Preparation does not submit, start a
guest, run Gradle, publish or claim acceptance. Only the parent submits it; the
native receipt, not preparation or controller tests, determines acceptance.
The separately reviewed/signed production artifact is untouched.
