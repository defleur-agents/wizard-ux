# R17 real-font browser proof — STAGED ONLY, parent admission required

No browser, VM, APK, image build or live deployment was run. No durable job was
submitted. This is a new source-bound browser diagnostic, **not** native or release
acceptance. Product remains candidate-only.

## Executable parent-only light-job spec

Machine copy on Forum: `/srv/work/wfp-r17-6cc94a4e/parent-light-spec.json`.
Its SHA256 is `29e0ab6d1fa3a0e665a367aac2f8b5d180f4ecf399366426d76aa378fd865a68`.
The following JSON is byte-semantically identical to that machine spec:

```json
{
  "key": "wisdom-r17-fontproof-6cc94a4e-3523e55d4ed6",
  "host": "forum",
  "lane": "light",
  "cwd": "/srv/work/wfp-r17-6cc94a4e",
  "argv": [
    "python3",
    "/srv/work/wfp-r17-6cc94a4e/runner.py",
    "--manifest-sha",
    "3523e55d4ed68e9cb98c8d38a4bac1d1b278aa0b7892a33041eb753afe39bc1f"
  ],
  "timeout_seconds": 900
}
```

Parent checks the exact spec and existing stable-key registry before its one
`wizard_heavy_submit` call, then ends that turn. Do not execute this runner over
SSH. A nonexecuting preparation check is the same argv plus `--preflight-only`.
No Android/VM/shared-lock helper is used; browser subprocess groups are bounded,
waited and cleaned by the foreground runner. Four source/viewport groups each
have a 160-second outside-the-browser cap. No package installs or downloads.

## Immutable source and runtime closure

- Pushed QA source: `6cc94a4e8c67a4abd2b648c8bbcc350323d13a4e`, branch
  `qa/wisdom-r17-readerready`. A subsequent handoff-only commit does not change
  this stage's executable source identity.
- Old Wisdom: `a800c16c81b520150ec72721eb79613b242169e8`.
- Candidate Wisdom: `e45fea79102a66093a50fb8405340327d13b7364`, already pushed to
  `fix/wisdom-reader-font-settlement-r17`.
- Full tracked Wisdom archives in separate `old/` and `candidate/` trees; exact
  QA `web/` subtree for the reused core client. No private library export.
- Product delta asserted to be **only** `static/wisdom.js` and
  `qa/reader-font-settlement.test.cjs`.
- `fixture.py` is the **unchanged** existing `tools/qa-flight-offline-fixture.py`
  from that QA commit. Its one generated synthetic chapter, checkerboard art,
  temporary real SQLite backend and loopback TLS are reused. All four real
  Newsreader/Fraunces WOFF2 responses must hash to the source assets, identical
  between arms. Existing R16 synthetic TLS cert/key were copied on Forum only;
  the private key is not committed or printed.
- `source-manifest.json`: **818 files / 29,943,084 bytes**, each hash/mode bound;
  exact source inventory checked before and after execution. Genuine Git blob,
  path, mode and commit metadata preserved for each exported source file.
- Manifest SHA256:
  `3523e55d4ed68e9cb98c8d38a4bac1d1b278aa0b7892a33041eb753afe39bc1f`.
- Runner SHA256:
  `50fd908c43f13d3e625526ea16be71ffac0a02f95decf8c03bfcc867e25c92f9`.
- Browser script SHA256:
  `87f89381ea2edb4bb2b7135df1d148878d72646f368097fc81594951d3c3a835`.
- Installed toolchain: `/srv/work/node22/bin/node`, Playwright **1.64.1** from
  `/srv/work/provider-signin-browser/node_modules/playwright`; all **176** selected
  toolchain files (Node and the Playwright/core module closure) are hash-bound.
  Explicit matching Chromium:
  `/home/james/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, SHA256
  `377a9fc07b495c3b8d0ab8ec1fdfd153641759f9756fea34d8dfce4de82f5025`.
  No npm-global guess or installation. Module's actual executablePath was checked.

## Bounded experiment and exact acceptance

Two identical A/B CSS viewports: **411×789** mobile and **1280×900** desktop,
DPR **1** in both arms. Mobile is an explicitly approximate native CSS viewport,
not a claim to have measured R16's WebView. The real CSS selector/reader markup
is used; no font, geometry, body metrics or product source is mocked.

Each arm/viewport enumerates five cases: warm reference, untouched direct
restore, actual page turn while fonts are pending, removed/replaced reader, and
actual offline warm → browser process death → offline cold resume: **20 case
identities** total, with old regression failures retained rather than counted as
candidate successes.

- Warm reference is selected by four trusted Next page clicks. Its **actual raw
  localStorage fraction** is then used as pre-boot controlled restoration input
  for fresh direct-reader contexts. No arbitrary progress is injected into a
  live reader. The warm route loads the same real faces before opening.
- Direct-reader data is held until the first native `document.fonts.ready` has
  actually resolved with no reader DOM. Then real source font responses are held
  while the fallback reader lays out, and only released after its DOM/metrics
  snapshot. Getter instrumentation returns the **identical native promise**; it
  records access/resolution times, promise identity, reader/flow layout presence,
  face status, `fonts.check`, and FontFaceSet events. It does not replace fonts
  or promises. Each delivered font body is source-hash checked.
- Every snapshot saves the footer pair, declared columnCount, a freshly read
  actual sentinel rect/derived columns and total, body hash, stage geometry,
  projected progress, raw exact local fraction, highlights, and **actual readonly
  IndexedDB outbox rows**, including offline IDs and bodies.
- Per-character `Range.getClientRects()` over the same body records first-visible
  UTF-16 offset and text, plus visible offsets. Repetitive fixture prose cannot
  pass merely by matching a sentence. Untouched/replacement settlement must
  equal the exact warm page pair, visible offset/text, and raw persisted fraction.
  The pending-turn case instead compares against a warm page containing the
  actual fallback-visible anchor, including exact final saved fraction.
- Removed DOM is retained for readonly callback-mutation diagnostics while real
  route controls create its replacement. Its old footer must remain unchanged;
  replacement must settle to the warm reference.
- Offline case requires all four actual font bodies in CacheStorage with source
  digests, turns actual UI pages, and waits for exact fraction, displayed pair,
  projected percentage and latest actual durable position row to agree stably.
  It adds one synthetic offline highlight through the existing domain API (not
  a claim to have tested highlight selection UX). **Before** SIGKILL it saves
  exact position/body/queue/highlights. Browser PID/profile and process-group
  identity are verified via browser CDP and `/proc`, then the actual owned browser
  group is SIGKILLed. Same disk profile reopens offline before navigation with
  no storage/font/API injection; exact pair, visible text/offset, raw fraction,
  projected progress, highlights and complete outbox must remain equal.

**Pass requires:** complete candidate cases on both viewports, identical old/new
warm references, complete old snapshots (not infrastructure failures), and at
least one specific old-source **real-loaded-font / stale-sentinel-footer**
negative control. An arbitrary old-source exception is not expected red. If old
source never shows that condition, receipt is `indeterminate-not-reproduced`,
never PASS. Browser evaluation may reveal a further candidate defect; no oracle
has been weakened to pre-assume success.

## What preparation actually verified

`/srv/work/wfp-r17-6cc94a4e/staging-checks.json`, SHA256
`62b2c16c1fb0f5958bf09687d5b1c0c68d9f66d7d75951df4af4bc474169b05e`:

- Full 818-member hash/mode/source closure and installed module/browser identity
  pass; `ldd` has no missing libraries; remote Node syntax and Python AST pass.
- Wrong-manifest negative refused before workload start.
- **browsers_started=0**, **browser_workload_executed=false**, and no `evidence/`
  directory exists. Free space was **272,203,673,600 bytes** against **2,147,483,648**
  required; runner checks again at actual start.
- Local candidate source unit rerun: **6/6 pass**; these remain control-flow tests,
  not browser proof. `git diff --check` and source push/readback passed.

## Parent evidence consumption and remaining blocker

Read `evidence/acceptance.json`, each group `report.json`, per-checkpoint JSON/PNG,
font delivery/cache records, and cleanup receipts. Root receipt hashes diagnostic
artifacts and lists all 20 case identities; raw isolated browser profiles remain
in the scratch stage for review. It prints only a short summary to worker stdout.
`browser-proof-pass-native-still-blocked` is the strongest possible result;
`releaseAllowed=false` and `nativeAcceptance=false` always remain explicit.

The historical **5/13 → 5/15** discrepancy is **not resolved by staging**. A saved
page-exact fraction 4/12 would restore at 6/15, not 5/15. The runner records its
actual pre-kill fraction and first-visible text, and emits this contradiction
separately; it does not invent the absent historical native localStorage/outbox
or first visible word. Native pre-kill diagnostics remain pending even if this
source browser proof passes. Do not ship, rebuild images, rerun native, or inherit
R8 appearance/functional proof across the changed product identity from this
stage alone. No skin/UI design was changed; full inherited in-shell two-skin
and affected browser gates remain for the later new image identity.
