# R18: wait for reader paint without weakening position acceptance

QA-only continuation of R17. The resumed AppSessionActivity can precede the
WebView's visible reader header/footer. R17 asserted the header immediately and
failed before sampling the restored page. R18 saves each raw XML/screenshot and
resumed activity first, waits at most 30 seconds for both visible controls, then
requires the original three identical nonblank RGB frames (eight painted
captures maximum). A foreign activity fails even before paint; disappearing
reader chrome after paint fails rather than being retried as loading.

Reuse: EXTEND the existing native `settle_reader` readiness seam; REUSE the exact
R17 pair/crop/RGB comparator, original image/APK/product, progress and replay,
renderer, egress, identity, Back and cleanup gates. No product or style changes.
Appearance's existing source-bound two-skin browser proofs remain inherited,
not fresh native visual acceptance. Both native death arms remain mandatory.

Source-only replay guards use three SHA-bound synthetic R17 XML captures:
loading `ui-0084.xml`, painted `FAIL.xml` (5/15), and final prekill XML (5/13).
The sampler/screenshots in unit replay are explicit mocks, not device proof.
The loading-then-ready test fails on original R17 at `reader must stay
foreground`; R18 passes readiness and still rejects 5/13 versus 5/15. Additional
guards cover timeout, header without footer, foreign activity, navigation after
paint, unstable RGB, selection toolbar and unchanged geometry/pixel rejection.

R17's three actual prekill frames were 5/13 with identical body RGB SHA256
`4fac2cbaea8db0421dd88465bce960cd50a4323288512b798a134f0cbc15d782`.
The later actual FAIL screenshot says 5/15; its same-geometry body RGB SHA256 is
`8add8a7a46dfe9ac870c8dcb48732f1b46e5d40782f54846b28793d840faddec`.
Header/footer-derived crop is [0,207,1080,2031] in both. Visually the serif body
and line wrapping look similar; this does not prove equal pixels, a font root
cause, or exact word-offset identity in repeated prose. R17 lacks a stable
restored tail because its readiness assertion aborted first.

R18 must obtain that tail on the unchanged product. A confirmed 13-to-15 footer
change is a product failure even if the numerator remains 5 or the body looks
similar. Do not normalize totals, compare only the numerator, tolerate changed
RGB or change stored fraction precision to make this pass. Quarantined font
candidate e45 is not used. Parent admits native execution; source-only staging
and unit replay are not native acceptance or release authority.
