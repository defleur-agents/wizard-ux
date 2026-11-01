# R36 native candidate-only — submit-ready, not launched

## Exact parent admission packet

- `host`: `forum`; `lane`: `heavy`
- `key`: `wisdom-r36-native-candidate-a1ac47d0-8d1fddad2420`
- `cwd`: `/srv/work/wisdom-r36-native-candidate-a1ac47d0-v1`
- `argv`: `["python3","-B","/srv/work/wisdom-r36-native-candidate-a1ac47d0-v1/run-native-r36.py","--manifest-sha","8d1fddad2420a80071043cbc375ad61b3b4978ced4cdf96b1d3a1047540ee8b3"]`
- `timeout_seconds`: **2600**, calculated by the script from build180 + unchanged normal2200 + cleanup120 + fixed pre/post100.
- Machine spec: `parent-heavy-spec-r36.json`. Exact remote manifest/spec readback: `r36-stage-readback.json`.
- Executable QA archive commit: `77efc3249c056861bdf4fdc5447b538149a8262b`, pushed and remote HEAD read back on `qa/wisdom-r36-native-candidate` in `humanitylabs-org/wizard-ux`. Any later evidence-only commit does not change the sealed executable archive.

## Approved work goal, not a retry of R33

Candidate only: `a1ac47d04093377f94540a379c46f1dc01e6ce97` from `diagnostic/native-layout-box-r33`, base `ec5c5f1df4165383113e534f1f773f7c5305e154`. Its only executable reader delta is synchronous display:none / offsetHeight layout-box rebuild; cache-key, documentation and source QA additions are explicit. No new native product, APK or font patch.

Budget provenance is `RESTORE_ORIGINAL_R24_NORMAL_CAP2200`: frozen `run-native-r24.py` line183, full file SHA `9b10577637583669afd05bdff173e0c18ba25d4787518c1ee5dbbce2d4fb52f9`. This restores an existing cap; it does not predict the runtime or assert the candidate needs 2200 seconds. Parent explicitly authorized revised2600 wall budget. Child exits immediately on completion.

Historical controls are inherited, not rerun, relabelled or claimed freshly reproduced:

- R24 reader boundary `47715176aabe362ba0aafcb8448e1fa5ee1f3c553e85eed0d545f90f75276b0b`: stable5/13 before death -> stable5/15 after.
- R25 reciprocal `49d6a4abd85b217ef97eb732d5fd3204da13ba778d4f0d081df07ebf243c6f70`: totals13,15,18,15.
- Original R33 saved failed status,240-second exception, wrapper SHA and log remain sealed and unchanged. No fresh-baseline claim. No candidate reciprocal arm in this job.

## Source/identity evidence and mandatory gates

Manifest binds6200 members and exact external control artifacts/archive hashes. Full comparison verifies474 old shell web files,172 old Wisdom files,26 fixture files and all10 critical native inputs. Driver remains byte-identical, SHA `dfcb7278757f84716a735812c9daf975d83782ccd1c2167ce7efee44455679cb`. New QA source contains1923 files vs old1919: precisely the4 R36 QA files added, zero changed/removed; all474 web files identical. Candidate source closure173 files is the exact git archive, checked against remote product branch HEAD. See `r36-source-comparison.json`.

Actual control image remains `sha256:d59436fbb13ebc55627b3e84167b61e82262a357d807c73242dc16af12bf1eb4`, archived SHA `aa29bf41f634f251344f299218a2d79b05691729820fb8ef4e7d434a66e92ffb`. Archive configuration and pinned labels/rootfs checked without Docker. Original actual61-file control image audit is bound and compared to source. Under future heavy admission only, control image loads if missing, candidate builds offline, and immutable candidate image ID/config/layer lineage/full extracted /app closure are bound to the exact tree passed to the native synthetic fixture. No production alias, publishing or release install.

Signed APK remains0.10.23/code87 SHA `04a188ae173b3a2cd22139256be9fe3158355079949f8b44c4be0eca2f90b767`. Same source-bound public closure and pin path; no APK rebuild.

All normal native assertions remain untouched: three stable page/bodyRGB frames, foreground+HOME exact pre/post RGB and5/15, same pin identity, native retained highlight/lost-ACK ID, reconnect/progress/receipt, renderer GPU before/after, egress and cleanup. Parent additionally executes existing `verify_native`, boundary pixel recomputation, renderer, egress and pin evidence verifiers. A failed candidate stops; no repeated font patches or font/engine/cache cause inference.

## Bounded diagnostics and ownership

Separate stdlib `native-entry-r36.py` checks exact driver SHA then executes the unchanged file with `runpy.run_path`. Faulthandler dumps stack at normal cap-60. Parent sends SIGTERM to exact driver first, preserving its original finally handler, grace20, then TERM/KILL only its new owned process group, never global adb. Driver/group/port and original complete cleanup evidence must all pass. Driver unwind<=30 plus final seal/ports<=90 supplies cleanup<=120. Existing transport completed-command journal remains unchanged; command440 has no pre-start receipt and its precise interrupted instruction stays unproven.

Source-only simulated Python child timeout actually printed phase/stack, returned nonzero and left no live known child. Early-exit test proved no idle2200-second wait. These are wrapper QA, never fabricated native evidence.

## Actual source QA

- Forum `--verify-only` passed twice, including after source units:6200 members, runtimes_started0, all acceptance flags false.
-10 packet tests passed: budget, exact driver, wrong manifest, missing member, wrong candidate/base, wrong control hash, image alias rejection, timeout/stack/owned-child cleanup and early exit.
- Existing unchanged Python boundary/reader/pin/packet suites and4 unchanged Node suites plus JS syntax check passed; `r36-existing-source-units.log`.
- Actual old-source negative returned1, precisely ordered rebuild failing; other2 cases passed. `r36-old-negative.json`.
- `r36-stage-readback.json` confirms exact manifest/spec and evidence/runs absent.

An initial large file-transfer timeout was recovered by copying exact template/candidate bytes read-only from original Forum stage and transferring the remaining source bundle compressed; final complete member verification passed. No original R24/R25/R33 stage was edited. R37 browser helper was not touched. Source tests emitted benign inherited sha-file ResourceWarnings; controlled rerun suppressed warnings, all10 passed. Missing optional lefthook binary warned at git commit; commit/push/readback succeeded.

## Acceptance and next action

**Submit-ready for the parent's admission; no heavy job was submitted.** No emulator, browser, fixture HTTP service, container, build/load or native arm ran. Only file operations, source assertions, source tests and tiny host Python timeout children ran on Forum.

`normalCandidateChecksPassed` may become true only after actual full driver and evidence gates. `nativeAcceptance`, `ordinaryPathAcceptance`, `releaseAllowed`, `liveParityAcceptance`, `visualAcceptance` remain false irrespective of this run until parent adjudication and required full-source/browser/two-skin in-shell checks. Existing sharing/public-publishing and owner-permission rules are unchanged.
