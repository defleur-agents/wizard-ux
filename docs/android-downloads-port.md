# Android Downloads port v1

`window.wizardDownloadsPort` is how the Wizard shell reads and manages the in-app Downloads list
(`web/core/downloads.js`). It replaces four `WizardOSNative.downloads*` JavaScript-interface methods
(PR #1140), which were exposed to **every** frame: `addJavascriptInterface` cannot tell the shell from
a hosted-app iframe, and the guard only looked at the top-level URL, so an iframe inside the normal
shell passed it. Those methods no longer exist. The toast path (`WizardOSNative.download(url)` →
`DownloadManager`) is unchanged.

## Who may call (native, `downloads/DownloadsCallerPolicy`)

Added with `WebViewCompat.addWebMessageListener` for the selected Wizard's primary origin, like
`wizardScreenPort`. A message is admitted only if **all** hold:

1. the WebView supports `WEB_MESSAGE_LISTENER` — otherwise the port is simply not installed
   (fail closed; the shell shows no Downloads UI);
2. it comes from the current WebView (not a replaced or destroyed one);
3. the sending frame is the main frame;
4. its origin equals the primary origin exactly;
5. the page now at the top is `/wizard-os-home` or `/wizard-os-home/…` on that origin.

A denied message gets no reply and runs nothing. After admission, the answer (list) is re-checked
against a per-page-load counter, the WebView and the top URL before it is posted; open / cancel /
remove are carried out in the same UI-thread task as their admission. Hosted-app iframes (same- or
cross-origin) and any non-shell top-level page are refused.

## Envelope

```
page → native  {"v":1,"id":"dl1","method":"list"|"open"|"cancel"|"remove","params":{"id":"<digits>"}}
native → page  {"v":1,"id":"dl1","ok":true,"result":…} | {"v":1,"id":"dl1","ok":false,"error":"…"}
```

`list` → `{"v":1,"items":[{id,name,mime,size,got,status,started,finished}]}`; `open` → `"ok" | "missing"
| "none"`; `cancel` / `remove` → `"ok" | "missing"`. Ids are DownloadManager ids as plain digits;
anything else never reaches native. Native pushes (`start | done | failed | sync`) still arrive through
`window.__wosDownloads(...)`, delivered with `evaluateJavascript` (main frame only).

## What the tests do and do not prove

* `DownloadsCallerPolicyTest` (pure JUnit): the admission rules above, request parsing, that a denied
  caller runs nothing and the tracked transfer survives, and that `MainActivity` has no `downloads*`
  JavaScript-interface methods.
* `tests/downloads.test.mjs`: the web consumer against a **fake** port. A fake bridge does not certify
  native security.
* Not covered by either: a real WebView with a hosted iframe. That needs a device/emulator check.

## Same-origin hosted frames (honest limit)

`addWebMessageListener` places the port object on every frame whose origin matches, and a call made through
`parent.wizardDownloadsPort.postMessage(...)` is attributed to the parent's frame, so `isMainFrame` alone cannot tell it
from the shell. Native cannot close that by itself. What this change does:

* Removes the frame-blind exposure: no JavaScript-interface methods, so cross-origin frames, sandboxed frames, frames on
  other pages and any non-shell top-level page reach nothing. A frame's own copy of the port is refused natively.
* Defence in depth in the page: `web/core/downloads.js` takes the port into its closure at startup (before any hosted
  frame exists), binds `postMessage` / `addEventListener`, and removes `window.wizardDownloadsPort`, so
  `parent.wizardDownloadsPort` is gone for hosted apps. Fake-window web tests cover it.
* Native->page events (`start | done | failed | sync`) go out only while the shell is the top page, through a script
  that re-checks origin, path and top frame in the document it lands in.

What it does not do, and cannot at this layer: a same-origin hosted app has the shell's authority (it can script the
shell DOM and the public `WosDownloads` object, as with every existing port: `wizardScreenPort`, `wizardAppsPort`, ...).
Closing that needs hosted apps on their own origin or in sandboxed iframes without `allow-same-origin`; that is an
architecture change outside this fix. Download rows are only taken off the list ("remove"); the file is never deleted.
Whether the real WebView lets the page delete the injected property, and what a hosted iframe finds, is part of the
on-device acceptance (queued on forum, not run here).
