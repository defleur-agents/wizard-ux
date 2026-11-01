# Font-proof R2 — test-only repair, staged for parent admission

REUSE: R8 mobile locator edge-tap hit testing, the existing synthetic TLS fixture,
the pinned installed Playwright/Chromium, and the R17 source/manifest runner.
EXTEND: three setup repairs only; no Wisdom product source changes or new rig.

- Mobile warm/turn/seek all use trusted `.wb-stage` locator edge taps, with a
  non-control hit target and trusted-touch evidence. Desktop uses visible arrows.
- Worker launch sets `PW_TEST_SCREENSHOT_NO_FONTS_READY=1`; preflight verifies the
  exact installed Playwright source supports it. This disables only screenshot
  font waiting, not explicit settlement, `fonts.check`, source-font digests, or
  final sentinel/visible-offset/fraction checks. JSON is saved before screenshots.
- Both initial and post-SIGKILL persistent launches receive the SAME narrowly
  bound synthetic leaf SPKI exception, recomputed from the hash-bound fixture
  certificate at preflight. Chromium's installed binary contains the supported
  switch. Broad context `ignoreHTTPSErrors` is false. No production/native TLS,
  shared browser profile, owner data, Notes or live system is changed.

Switch contract: Chromium `services/network/public/cpp/network_switches.cc`
`kIgnoreCertificateErrorsSPKIList` accepts base64 SHA256 SPKI and requires a user
profile directory (supplied by Playwright persistent context). This is explicit
fixture-only browser trust, NOT an assertion that R8 used this TLS flag: R8's
passing browser fixture was plain loopback HTTP; reuse is its fixture/gesture.

Browser-free guards: `node --test tools/flight/test_font_proof_harness.cjs`.
They cover mobile/desktop routing, both directions, untrusted/covered targets,
screenshot-only suppression and retained font proof, initial/resume trust parity,
and unchanged specific-old-negative/durable-identity gates. Preparation may run
syntax, these guards, and `runner.py --preflight-only`; NEVER browser execution.

A fresh immutable `wfp-r17-r2-*` stage contains exact pushed QA source, full old
`a800c16c81b520150ec72721eb79613b242169e8` and candidate
`e45fea79102a66093a50fb8405340327d13b7364`, existing `web/`, fixture and synthetic
TLS material, exact manifest/toolchain closure, and parent-only light spec.
The parent reads the stage handoff/spec/hash and admits at most 900 seconds.
Do not execute runner without `--preflight-only` over SSH or in this child.

R1 `/srv/work/wfp-r17-6cc94a4e` remains untouched; actual root report is
`evidence/acceptance.json` (not `evidence/acceptance/report.json`). Its 1280-wide
pending JSON has real loading font faces and held actual WOFF2 deliveries, not
fabricated font geometry. These setup failures yield no product verdict.

All 20 case identities, exact warm A/B equality, candidate all-case success,
real loaded-font/stale-sentinel old-source negative, actual character offsets,
exact persisted fractions and outbox/highlights across process death remain
required. No old reproduction means `indeterminate-not-reproduced`, not PASS.
`releaseAllowed=false`, `nativeAcceptance=false`; historical native 5/13→5/15
attribution remains unresolved. No appearance/product changes in this repair.
