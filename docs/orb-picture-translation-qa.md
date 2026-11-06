# Orb picture translation repair

## Ownership and source cutoff

- REUSE `ScreenMode.picture` → existing `/wizard-search/api/read-image`, existing translation route and private configured models. No OCR dependency, new provider, external destination or silent fallback added.
- EXTEND the existing `assist/screen.html` Translate state machine: accessibility is not image coverage. Translate accessible blocks as before, then read the frozen screenshot, deduplicate exact native lines, and translate missing picture text in the existing sheet. Native overlays, Copy, Ask, selection and Back remain owned by the same page.
- EXTEND existing page QA and add a focused model-free state-machine regression. NEW capability: none.
- Exact installed/update-feed cutoff: 0.10.23/code87, APK SHA256 `04a188ae173b3a2cd22139256be9fe3158355079949f8b44c4be0eca2f90b767`, source `a1e00dafbed3bcadc8fda098a9f9255b4437ce88`. Candidate starts from this source, not divergent shared main (which still declares code85). Version89 / 0.10.25 avoids the separately reserved code88 dictation lane (#839). Recheck release ownership/feed before publication. This branch does not take over that lane.

## Proven cause

This is not a missing Thai OCR engine. The shipped page invokes `picture(true)` only when no accessible words exist. When Telegram exposes English chrome, the page translates that subset and immediately calls `pillDone`, which says “Already in English” if no native block changed. It never asks the existing vision route to read the photo.

A real request with the authorized exact attached JPEG to the installed `/wizard-search/api/read-image` route returned Thai picture lines using `gemma4-31b`; the same installed translation route returned “I'm heading to battle”, “Okay, and over there”, and “Are there any girls?”. Raw requests/results and personal image stay out of Git. The vision result contains a minor Thai spelling variation in the final line; successful translation is not a claim of perfect transcription.

## Behaviour and guards

- Always check available screenshot pixels, including screens whose native blocks are all English or already include a different foreign language.
- Keep original picture lines separately from translations; include recovered translations in Copy/Ask after dismissing the sheet. Outside pointer taps must reach the existing dismissal handler while the automatic picture panel is open; dismiss the sheet without clearing recovered text.
- Report read/translation failures honestly and make the pill retry. Invalid response shape/count is an error, never a successful English verdict.
- Fence callbacks by run and target language; reuse successful screenshot reading for a retry/language change rather than re-uploading pixels.
- With no screenshot, qualify the result as readable text only.
- Keep floating text panels opaque with Appearance v1 role fallbacks. Browser checks cover two role sets and a live role change; these are not a claim of native skin transport or physical phone proof.

## Verification and release custody

`node --test tests/screen-picture-translation.test.mjs` covers English chrome + Thai, French + Thai, English-only, error/retry, malformed provider replies, stale callbacks, unavailable screenshot, and image/numeric-only cases. Initial DOM-double registration failure was repaired in the harness; it was not a product failure.

`tools/qa-screen-picture-translate.cjs PRIVATE_FIXTURE OUT` is a private recorded-live-inference replay against baseline and candidate with the exact attached image. It must prove baseline bypasses vision with the false English verdict; candidate extracts/translates Thai, retains Copy and outside-dismiss, and passes two role sets/live role change. It is not fresh model inference or native-device proof. Existing `qa-screen-page.cjs` continues checking Latin/native text overlays and gestures with synthetic model replies.

The admitted forum packet builds a correctly signed owner-origin release with unit/lint tasks and runs focused page gates. It does not publish. Native exact-byte upgrade and live phone receipt remain explicit follow-on gates if not present in that packet's receipt. The only delivery destination is the normal owner in-app update feed; no alternate APK is sent to the owner.

The shared-main port is source integration, not the phone release source: its inherited code85 must not be installed or offered as an upgrade over87. The separate release branch `fix/orb-picture-translation-20261106` declares89 / 0.10.25; the signing/upgrade controller refuses any other candidate version and checks the production signer, baked origin and exact baseline87. Do not bump unrelated shared-main packaging just to make that review port appear deliverable.

The outside-touch regression executes a real pointerdown/pointerup pair against the shipped inline script: it fails with the old picture-panel early return and passes after removing that one guard. Copy and original picture translations stay intact. An APK built before this asset repair does not contain it; preserve that artifact as historical evidence and sign the changed release source separately. The existing packet collects browser failures without suppressing independent upgrade checks, and keeps the aggregate failed if any collected phase fails.
