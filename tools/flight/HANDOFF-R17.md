# R17 diagnosis — candidate only; NOT STAGED / NOT NATIVE-PASSED

## Outcome

R16 cannot be repaired honestly by waiting for its footer. Its failure contains
**two distinct questions**: an absent accessibility footer at assertion time,
and a fully rendered later **5/15**, versus saved **5/13**. Exact reading-position
acceptance remains blocked. No R17 native stage/spec/image was created, no VM or
browser was started, and no product was deployed.

Small product candidate pushed to Wisdom branch
`fix/wisdom-reader-font-settlement-r17`, commit
`e45fea79102a66093a50fb8405340327d13b7364`. Local checkout is
`/home/telos/.hermes/cache/scratch/wisdom-flight-finish/wisdom`.
It is NOT the frozen a800c16c product, NOT an accepted replacement, and has no
new image identity. Original R16 remote stage remains untouched.

## Source-backed defect, not conclusive native root cause

`static/wisdom.js:1028` used to take `document.fonts.ready` **before** the first
`layout(false)` forces reader font discovery. An already-resolved ready promise
can run the second fallback layout, then miss the real font swap entirely.
The footer/columnCount can therefore retain fallback pagination while the actual
text paints in Newsreader. A warm library route masks this direct-resume race.
Font files are present; offline.js explicitly warms all four faces. R16 does not
preserve completed per-font requests, so do NOT claim failed cached font fetches.

Candidate moves initial layout before taking ready; settlement ignores a removed
or replaced reader and restores an untouched exact fraction rather than anchoring
a transient fallback page. Genuine page turns still use existing line anchoring.
Only `static/wisdom.js` and `qa/reader-font-settlement.test.cjs` changed.

**Unresolved arithmetic:** saved 5/13 implies f=4/12; restoring that f at 15 pages
would display **6/15**, not the actual 5/15. The observed 5/15 requires f in
[0.25, 0.32142857142857145). Thus font readiness alone does not explain all native
position evidence. No exact pre-kill screenshot, localStorage value, or client
outbox snapshot was saved. Do not invent a kill-durability failure or persisted
fraction, and do not use 5==5 as a pass. Both screenshots have similar serif
metrics; appearance alone does not prove measured columnCount is current.

## What actually ran

- Six lightweight source-control-flow tests: candidate **6 pass**, exact R16
  source **2 pass / 4 fail** (expected negative run exit1). These model font-ready
  promise replacement and 15/13 metrics; they are NOT browser/native proof.
- Three actual-capture audit tests pass in
  `tools/flight/test_reader_evidence_r17.py`: actual FAIL.xml is 5/15; removing its
  footer creates an explicitly derived fixture that first rejects `[]`, then
  still rejects newly available actual5/15 against expected5/13. No flight gate
  changed. Hash-pinned actual FAIL.xml SHA:
  `b2ee44f524ea6dba77488b1db1ef15f3f9f6b2e9402af45bc90f4b4d0c630e54`.
- Actual FAIL.xml body text nodes all have zero bounds despite clearly visible
  screenshot text. Its paragraph string cannot prove the first visible word.
- `git diff --check` passed; product remote branch read back at exact commit.
  Hook printed missing lefthook; explicit tests ran. No build/browser/native PASS.
- One bounded read-only Opus consultation (actual first-party claude-opus-5-5,
  is_error=false, no permission denials) independently identified the ready race
  **and rejected conclusive native attribution** because of 6/15 vs5/15.

Local source evidence and logs:
`/home/telos/.hermes/cache/scratch/wisdom-flight-finish/r16-diagnosis/`
contains actual 06b/10/FAIL PNGs, actual FAIL.xml, old source, both TAP outputs,
actual-capture tests, and Opus prompt/raw response. No native evidence was
fabricated. Derived fixture exists only in the Python test's memory.

## Parent's next bounded gate; no blind R17 native rerun

First use parent durable Forum queue for an affected real-browser proof of old
and candidate bundles with real fonts, delayed font delivery, fresh direct-reader
navigation, actual final footer and freshly measured sentinel/column count.
Compare against warm-font reading at the exact same viewport and saved fraction;
record first-visible character offset/text, stored fraction, highlights and
outbox position at each checkpoint. Delay is controlled network timing, not a
native UI sleep. Test at least untouched restore, genuine turn while pending,
and removed/replaced-reader callback. Mock tests alone cannot resolve native.

If browser confirms/fixes the defect, rebuild the Wisdom image and run the
inherited affected browser gates at that new identity; R8 evidence cannot be
silently inherited across changed Wisdom. APK87 need not be debug-enabled or
changed merely for this JavaScript repair. Only then prepare a fresh admitted
native stage with the original complete functional/renderer/UID-egress/cleanup
and promotion gates preserved, plus pre-kill and post-kill settled page pair AND
reader-body pixels. A stable footer alone is not a font/readiness signal.
Native must not inject JS/CDP or read private owner content. Exact content/offset
proof belongs in source-backed browser evidence plus native visible body/pair,
not fabricated from zero-bounds accessibility body text.

## Remaining native route audit

R16 lines516-519 use `Browse all` -> `Highlights` from root, which is the correct
libraryTiles path; the collection/private shelf does not contain this tile.
Highlight remains local until actually observed before reconnect. Keep the
lost-ACK transaction and >=2 POST attempts with the same nonempty offlineID,
exactly one resulting highlight, same OS shortcut and all root Back gates.

Current fixture receipt has only a **total** receipt count, including progress
reaction receipts. Do NOT assert total==1. For a future stage, extend receipt
metadata with id/path rows and require exactly one receipt for the highlight's
specific offlineID and path; real server.offline_mutation inserts it in the same
SQLite transaction as the edit. Its primary key prevents duplicate IDs, but
native evidence should record that exact target rather than infer from row count.
Current progress>0 gate is insufficient to resolve the exact pre-kill mismatch;
retain it and add exact captured position/content checks, do not replace the
failed precise gate. Keep new work minimal; do not stage while this discrepancy
remains unexplained.
