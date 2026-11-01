# R17 font proof R3 — targeted interceptor repair, parent admission only

REUSE the R2 real-font browser harness and every acceptance assertion. EXTEND only
font delivery plus browser-free regression coverage and prior-evidence integrity.
No product changes: old a800c16c81b520150ec72721eb79613b242169e8 and candidate
e45fea79102a66093a50fb8405340327d13b7364 remain exact release source archives.

R2's font-delay callback called Playwright route.fetch(), a Node-side request
which does not inherit Chromium's narrow fixture-leaf SPKI trust. Its rejected
TLS promise (UNABLE_TO_VERIFY_LEAF_SIGNATURE) killed the Node harness. This was
not a product verdict; all four R2 warm cases passed.

R3 removes that unnecessary Node HTTPS hop. For each actual installed browser
font request it reads the corresponding old/candidate static/wisdom-art/f asset,
checks manifest.fonts and the exact source member's commit/path/hash, then fulfils
status 200, font/woff2, with those real bytes AFTER the original font gate.
Only the fixture origin, exact /wisdom/wisdom-art/f/ URL and four known filenames
are admitted. Traversal, encoded aliases, queries, credentials, missing pins,
wrong source identity, noncanonical paths/symlinks and changed bytes fail closed.
The description is **font bytes fulfil from hash-pinned release assets**, not a
real HTTPS server response. No synthetic/approximate fonts are delivered.

Callback validation, fulfil and abort rejections are caught and saved as case
routeErrors instead of becoming unhandled Node failures. Browser-free tests use
the actual staged release files and stub requests; no browser is launched.

Chromium fixture SPKI trust on BOTH persistent launches, trusted mobile edge taps,
screenshot-only font-wait suppression, native FontFaceSet promise identity and
all explicit real font loading checks are unchanged. Offline warm/cache and
post-SIGKILL same-profile resume do not use the font interceptor.

Acceptance remains 20 identities: both arms, both viewports, five cases each;
every candidate case passes, exact warm A/B reference, actual loaded-font checks
and freshly measured sentinel metrics, exact visible character offsets/passage,
fractions, projected progress, outbox and highlights, removed-reader guards, and
the specific old loaded-font stale-sentinel negative. No old reproduction means
indeterminate, not PASS. Real font metrics can establish only this browser A/B
result; the historical native 5/13 -> 5/15 mismatch is still unresolved.
releaseAllowed=false and nativeAcceptance=false remain mandatory.

R3 is a fresh one-use manifest-bound stage. The complete original R2 evidence
inventory (including profiles) is hash-pinned and checked before and after work;
R2 evidence is never copied over, rerun, or modified. No images, installs, native
runs, private content or live writes. Parent alone submits the emitted exact
Forum light/900 specification once. Staging/unit/preflight is not browser proof.
