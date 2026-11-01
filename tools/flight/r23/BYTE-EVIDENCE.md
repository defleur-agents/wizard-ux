# Independent browser byte evidence (R25)

QA-only. Product UX/reader source is not changed here.

Completed full GET bodies still require exact source SHA-256. HEAD, 304 and ranges never count as complete network-body coverage. Empty plain-page GET, wrong nonempty body, unfinished response or transport error fails.

A completed empty Playwright body is eligible for separate evidence only when request ownership is explicitly worker-owned or SW-served. It stays `networkBody: UNOBSERVABLE-empty-PW-body`, never a verified network body. Coverage then requires actual read-only CacheStorage `response.clone().arrayBuffer()` bytes, exact full URL (including query), expected size/hash from frozen source, valid response metadata, source-derived cache names, active worker bindings, and an initially empty same-origin cache/registration snapshot in this exact fresh profile. Context IDs and one persistent-profile generation prevent late events from another context supplying coverage. Reboots retain that generation and all source-defined required shell members must still match. SW font fallback additionally requires observed loaded FontFace family, CSS-defined source URL mapping, and no font errors. It does not assert every unused worker GET's bytes were observable.

The source-derived policy includes both configured shell closures plus all observed empty tracked GETs. Every known static entry in an owned current cache is checked, so a bad cached copy cannot hide behind another correct copy. Unexpected older owned cache names fail. Sibling caches/workers remain untouched.

Before the unchanged ten-case matrix, the parent runner must pass a real five-mode probe with separate fresh profiles and a synthetic-only server/worker protocol: GOOD accepts exact bytes; EMPTY really stores a zero-length body with nonzero content-length; WRONG rejects wrong bytes; STALE rejects an old-generation cache; PLAIN-EMPTY rejects an actual non-SW empty page GET. The same observer and cache verifier are used. No product response routing/fulfillment and no verification fetch/cache writes. The synthetic negative worker's intentional CacheStorage writes are fixtures, not production fallback.

70-second external probe cap + unchanged 720-second matrix caps fit the existing 830-second runner envelope and parent light 900 seconds. Probe failure blocks matrix admission. Source-only verification starts no browser or fixture. Browser/native proof remains pending until the parent submits the exact sealed packet. Historical R24 reports remain failed old-source provenance, never inherited passes.

A focused first-party Opus one-shot agreed with the explicit cache-closure/network-unobservable boundary; its prompt and full result are preserved in the staged packet. It is judgment, not execution evidence.
