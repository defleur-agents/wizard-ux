# R34 read-only browser response-stream diagnostic — parent handoff

**SOURCE ONLY. No runtime, HTTP fixture, helper browser or heavy job launched.** Parent alone admits the generated `parent-light-spec.json`, after reviewing source verification and the exact seal hash. Do not run the full case matrix.

Reuse:
- REUSE original raw ownership/public-spawn provenance, source closure, fixture TLS/no-store policy, selected isolation functional assertions and cleanup gates.
- EXTEND the owned read-only CDP observer with bounded Network transcripts, response streams and exact consumer-page diagnostic linking.
- NEW none (no new product capability).
Visual: none; no UI/skin files changed. Native and browser final visual acceptance remain later strict gates.

## Scope and uncertainty

Base is `06d5ff7826f2d7dab527e277999359eccdc638af`; branch `qa/wisdom-r34-readonly-stream-diagnostic`. Separate from the native R33 branch. The actual R32 failed job log has parent-verified SHA256 `dceb71ec5d0c1d366c82b8ee264a69e3e3f27875fdafcc2d18739e566728993b`. The prior diagnosis is `NO_FIX_PROOF_MISSING`: all exact failed response joins lack independently observed inner completion. No retained other Playwright response has the same write ID. Existing cache/server bytes cannot replace that missing finish.

Hypothesis, NOT fact: `networkFirst(request,'shell')` returns the fetched Response directly to `respondWith`, transferring its body to the consumer page while the inner SW Network request lacks loadingFinished. This packet adds a previously absent owned PAGE/iframe event tap before application navigation, while keeping inner completion false. An exact linked consumer byte/finish observation remains diagnostic-only until parent adjudicates semantics.

The new controlled protocol canary uses the actual staged UX `core/offline-sw.js` networkFirst function byte-for-byte, with synthetic-only wrapper globals and fetch listener. It requests an uncached HTTP script from a controlled page; GOOD must have actual streamed source bytes and independent loadingFinished. NEVERFINISH must remain unfinished. If protocol streaming is unsupported/not ready/invalid, capture the error and stop before the selected isolation. No fallback to server writes or cache timing. Old actual raw GOOD/NEVERFINISH and five observer protocol PASS reports are frozen by hash, not rerun.

## Diagnostic data

`raw-cdp-<context>.json.stream.json` includes context/generation/browser-context/target/session/request identity, full URL/method/status, safe headers/write ID, fromServiceWorker and serviceWorkerResponseSource, event receive wall/monotonic times and protocol monotonic timestamps. `Network.streamResourceContent` starts on responseReceived; bufferedData and dataReceived base64 bytes are retained, hashed and size-checked. Inner gate still requires its own loadingFinished and existing proof path. Exact consumer links require full URL/method/status/write ID/current context/generation/browser-context plus one and only one consumer. Different write IDs are never equivalent.

Caps: 4 MiB decoded per row, 64 MiB decoded aggregate (pending data additionally bounded), 2,000 rows, 20,000 events, 96 MiB event JSON. Safe-header allowlist only; any recorded drop makes stream validity unknown/failure. No interception, pausing/resuming, product injection, production aliases, application response-consumption edits, or acceptance substitution.

## Packet and parent admission

`stage-r34-browser.py` reuses every exact member from the accepted R32 source closure, replaces only QA members from the pushed QA commit, verifies all 2,079 product files byte-identical, retains nine actual historical pass reports and R32 failed evidence, and binds original diagnosis inputs by SHA256. Ownership/public launch functions are asserted byte-identical. The packet is fresh under `/srv/work/wisdom-flight-r34-browser-<qa8>-ec5c5f1d-stage`.

Packet root artifacts:
- `source-manifest.json`: exact hash/mode/member closure and inherited actual protocol reports.
- `parent-light-spec.json`: exact Forum light cwd/argv/key/240s timeout; runs only new canary then one existing isolation case.
- `source-verification.json`, `source-test-output.txt`: complete old source regressions, new adversarial stream tests, ModuleTests, compilation, static guards, wrong-SHA-before-evidence refusal.
- `historical/r34/input-hashes.json`: all diagnosis input hashes and retained actual evidence hashes.

All outcomes keep `review_required=true`, `releaseAllowed=false`, `freshIsolationAcceptance=false`, current/runtime browser acceptance false. Functional and cleanup checks stay unchanged. Raw traces are saved before any failure is finalized. No normal acceptance claim follows even if the diagnostic case passes.
