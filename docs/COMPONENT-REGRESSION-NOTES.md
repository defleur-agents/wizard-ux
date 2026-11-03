# Component regression examples

Moved from the worker brief; API/security ownership stays in COMPONENTS.md.

- Need: Test the shared path by
- Owner signatures: `wizard-id-bridge.test.mjs`
- Agent chat: shell `[data-chats]`; 503: one outbox item/message
- App identity/root: manifest wins; frames untouched
- Composer input: `qa-composer-input.cjs`
- File chip before send: `qa-attach-chip.cjs`
- Photo/video viewer: Messenger `photo_viewer_browser.cjs`
- Same-app companion: `qa-companion-pane.cjs`: nested Back
- Back in app; leave on dismiss: Back stays; repair → source
- Skin/tokens/mode: two skins + live change keep state
- Transcribe audio: stale/foreign denied; unavailable explicit
- Share out (people → apps → Other): cancel ≠ shared
- Receive shares: pending until accepted, ack once
- Mic, camera, screen capture: pending survives Back; ack once
- Duck Music; orb app button: off on close
- Title-bar tools: icons/dot in shell bar
- Fingerprint app secret: late/closed denied
- Offline replica, durable edits: recoverable failures
- Protect unsaved work from updates: release after save+readback
- Offline shell: offline reload
- App reading place: reopen lands at the saved place
- Motion/haptics: —
- Canonical style admission: legacy warns; changed lines fail
- App kit: rows/sections/empty/add: two skins + My skin restyle `.wz-*`
