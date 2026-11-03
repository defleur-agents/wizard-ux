# Desktop app-frame hotkeys

Reuse: EXTEND **Desktop frame shortcuts** (`watchFrame → onKey`, `web/desktop/desktop.js`). No second shortcut table, synthetic key dispatch, postMessage key protocol, nested-frame scan or native wrapper change.

## Failure mechanism

The shell listens on its own window in capture phase. Its same-origin app-frame adapter instead listened on the child **document** (`watchFrame`, old line 645). Keyboard events do not bubble between browsing contexts. An app/editor/modal's child-window capture handler calling `stopPropagation()` therefore prevents the document adapter from ever seeing either keydown or keyup. The app stays focused and shortcuts appear dead; clicking shell chrome returns focus to the working shell-window listener.

Listen on `doc.defaultView` in capture phase, using the original event and the existing `onKey(e, true)` ownership/typing/chord/repeat policy. `stopPropagation()` does not stop other listeners on the same event target. Retain one document-lifetime hook and add frame-window blur cleanup for held-key hints. Pointer focus and dictation binding remain document-local.

This is a reproduced propagation failure, not telemetry identifying which private app James was using. App-owned `preventDefault()` and `stopImmediatePropagation()` remain respected. Opaque and nested documents deliberately do not gain a shell shortcut channel. Native `wizard:*` commands in `core/bridge.js` remain unchanged; source QA is not physical Mac/WebView proof.

## Exact-live source and tests

Base: `9e743932bfc0e5799a601d3623103af0e5a57950`, not main. On this revision **Alt+1 selects the first desktop**, Alt+2 the second, and Alt+Backquote selects Home (`core/workspace-navigation.js`). The older Home-on-Alt+1 QA script is obsolete on this live source; its unchanged first-slot failure is not repaired here.

Light checks:

```sh
node --check web/desktop/desktop.js
node --check qa-desktop-frame-hotkeys.cjs
node --test tests/DesktopFrameHotkeys.test.mjs tests/desktop-keys-layout.test.mjs tests/settings-preview-windows.test.mjs
QA_DESKTOP_SOURCE=<exact-base>/web/desktop/desktop.js node --test tests/DesktopFrameHotkeys.test.mjs
```

Candidate: 34/34 focused source tests pass. Original-code control: 3 pass / 4 fail, including the specific app-window capture regression, keyup cleanup and blur cleanup. These use a small propagation model, not a browser.

`qa-desktop-frame-hotkeys.cjs` is a separate real-browser synthetic A/B harness. Its first exact failure oracle is `REGRESSION: frame window capture cannot strand desktop switching`; the runner rejects a baseline failure anywhere else. It checks focused input desk switching, app picker chords, typing/select-all, repeated relative navigation without duplicate dispatch, keydown/up, blur, autorepeat, reload lifetime, nested opaque privacy, two in-shell skins with live redress and opaque-panel raster comparison, phone boot, and a labelled synthetic standalone dark fallback. Every request is intercepted; all writes receive 403. No private content or actual app is loaded.

**Browser acceptance and screenshots remain pending until the parent admits the sealed forum job and inspects its output.** No deployment or main merge is authorized by this source-only result.
