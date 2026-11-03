# Skin switching / duplicate personal skins — repair preflight

Lane: bounded shared UX repair. REUSE WosSkin, WosMySkin and WosSettings; no second picker or state store, no new public API. Production changes are confined to experience reconciliation, personal-skin discovery and legacy-overlay rollback. No owner CSS, recipe, pointer or real API writes are part of verification or deployment.

## Exact live source

The repair branch starts at `9e743932bfc0e5799a601d3623103af0e5a57950`, the Service immutable release and the edge-serving checkout at investigation time. Main has since diverged (including independent skin/tweak switches); its companion PR ports only the applicable guards, not this live source wholesale.

## Proven defects

1. `WosExperience.applyOnce()` sets `owner` before fetching manifests. A later timeout leaves an error but a matching owner. `chooseSkin()` used that owner equality as proof of completion, so Settings rolled every subsequent same-family colour pick back on the old error. A direct shared-module regression failed on the exact live source, then passed with the error-aware retry guard. Healthy picks remain cache-only and concurrent reconciliation is still joined.
2. Legacy My skin is an independent owner overlay. Picker rollback called `M.update({base})` even for that overlay, unlike its forward path. This could edit owner metadata, bind the overlay to a palette or fail on an older Service. The regression failed with the palette left changed. Rollback now restores only `WosSkin` for an overlay.
3. `loadRecipes()` automatically POSTed device-preview recipes during discovery and could PUT the box active pointer. The older Service's POST handler passes only name/css to `create()`, ignoring migration_key/base/tweaks/activate. Its `create()` suffixes folder IDs but keeps the same display name. Against the exact installed Service module, two synthetic cached previews reproduced `My skin 2` and `My skin 3`, both named My skin and zero CSS bytes. The corrected client performed zero writes and retained the original local recovery records. This proves the automatic mechanism, **not the identity of the historical client** that created real folders; no request audit was supplied.

Discovery is now strictly read-only. Explicit New skin/create, wear/leave and edits keep their existing APIs. Existing folders are neither deleted nor hidden by this change. Device-preview records remain in localStorage for recovery; no replacement migration/import UI is introduced.

## Verification and release boundary

- Dependency-free regressions cover stale errors, healthy picks, in-flight joining, profile-read retry, legacy rollback, read-only discovery, two-client legacy Service behavior and retention of local preview records.
- `tools/qa-skin-switch-recovery.cjs` uses actual shell adapters and shared Settings, fully intercepted synthetic APIs, phone UA/touch and desktop, Nebula and Obsidian Light, owner overlay and no overlay, actual family/colour controls, 5-second success/error waits, natural timeout, same-click pending/visual receipt, rollback, skin/family separation and reload persistence. Expected: 56 case/persistence rows, zero skin writes or agent runs. Screenshots require human inspection before release.
- Browser QA belongs on the durable forum light lane. Until its receipt finishes and screenshots are inspected, this is **not ready to deploy**.
- Parent owns deployment. Preserve both Service and edge revision ancestry; run tracked-source parity, immutable release metadata and exact served hash verification. Preserve owner CSS/recipe/active summaries before/after. Do not deploy main over the live integration branch and do not run historical activation helpers.
- Keep the main PR open for James's use/review. No live deploy was performed by this helper.
