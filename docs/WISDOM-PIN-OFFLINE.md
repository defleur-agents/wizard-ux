# Wisdom Android pin: flight offline integration (staged, not deployed)

Reuse:
- REUSE #544's scoped pin host, offline-apps allowlist, shared offline-kit and single-app-session Back/Appearance bridge. No Chrome PWA, new origin or pin replacement.
- EXTEND the exact-live workspace worker by composing fetch ownership with offline-sw; preserve wos-shell-v1 lifecycle, warming, normal workspace navigation and all sibling caches. Generate `core/offline-session-config.js`, never overwrite the live root worker.
- REUSE the current signed Android .23/code87 artifact; no native changes. EXTEND the effective live Wisdom adapter with #52 quiet failures and finite progress while preserving discussion recovery.
- NEW only source-bound synthetic flight acceptance runners/fixture; no owner-state test writes or model, prompt or content changes.

## Live ancestry

Integration starts at serving shell `33e85353e856b75f7c740f305f6c565452d7797a` (re-resolved after the initial f9afdb37 base advanced), retaining all later orb behavior. Pin machinery provenance: PR #544 / `bf89ab14716ac0c803a3a8936e0076651f6912e8`. The companion Wisdom branch starts at **effective image source** `7a423b38647fe2a06e54b0942e4c3d87d45ce7c2`, not the catalog's older source. No helpers merge or deploy; the parent owns serialized promotion after acceptance.

## Invariants

1. Remove only Wisdom's obsolete worker-unregister migration. Leave other reviewed cleanup intact.
2. Keep the existing native pin URL `/wizard-os-home/?app-session=wisdom`. Offline fallback is a small host using the real registered iframe/shared core. Strict host navigation allowlist excludes arbitrary/malformed app sessions and private query data.
3. Keep one fetch owner per request: `offline-sw` exposes `handles`; the existing workspace handler defers only those requests. Preserve the live workspace worker's existing code and cache lifecycle.
4. Wisdom's existing replica/outbox, app worker and server idempotency remain the sole reading-state implementation. No Agent Service API responses or private attachments/files enter pin caches. No origin-wide cache matching/deletion.
5. No automatic offline/sync/success popups anywhere. Genuine failures are quiet inline in My library; quota failures reject, never claim saved. AI authoring/queries remain online. Keep live Ask AI local recovery/admission behavior.
6. Back stays inside the pin at nested and root routes. Preserve Appearance v1 `--wz-*`, live skins, dark standalone fallback and fully opaque text-bearing panels.

## Focused verification

Source-only:
```
python3 tools/build-offline-session.py --check
node --test tests/wizard-pin-opens-wisdom-offline.test.cjs tests/components-inventory.test.mjs
```

Current source-bound fixture: `tools/qa-flight-offline-fixture.py`; browser driver: `tools/qa-flight-offline.cjs`. It creates **only synthetic** text, a conspicuous blue/gold checkerboard and temporary SQLite, serves exact tracked fonts/shell/app sources, uses the real backend mutation/idempotency handler, blocks agent/authoring/provider writes, and deliberately loses one committed highlight ACK. Do not use the legacy copied-library fixture for this flight acceptance.

The staged Forum heavy runner verifies exact source tar/per-member hashes and modes, compares current-before/candidate parity, packages a narrow static overlay on the exact accepted current Wisdom image, runs the before-live negative assertion plus phone/desktop browser cases, and exercises the **published signed release APK** through native touch/accessibility (not browser CDP). Required native path: prime one disposable OS pin → airplane/Wi-Fi off/all network blocked → force-stop → same pin offline → list/chapter/art → progress/highlight → another process death → retained highlight → reconnect/lost-ACK replay exactly once. No private library, phone, origin or model calls. Child processes/AVD/fixture/own ADB server stop in `finally`, including cancellation.

The original #544 browser receipt is retained as provenance only. Its failed .17/code81 native receipt is not inherited. Browser evidence is never labelled native. Current-run screenshots require independent review before the parent promotes; an unrun heavy specification is not acceptance.

## Delivery

Use the checkpointed `wisdom-flight-finish/HANDOFF.md` and exact `heavy-spec.json` for admission. Parent promotion rechecks current source, packages immutable shell assets, uses the existing guarded WAM/Runtipi Wisdom start route and both existing shell serving targets, preserves mounts/config/models and retains rollback image/shell. Never overwrite an advanced live source. No APK rebuild unless current-release native evidence demonstrates a real native delta. Each device must prime its existing Wisdom pin online; cache readiness is device-local and quota/eviction cannot be guaranteed remotely.
