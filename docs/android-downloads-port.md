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

## Same-origin hosted frames

`addWebMessageListener` places the port object on every frame whose origin matches, and a call made through
`parent.wizardDownloadsPort.postMessage(...)` is attributed to the parent's frame (so `isMainFrame` alone cannot
tell it from the shell). Native therefore cannot close this by itself. `web/core/downloads.js` takes the port into
its own closure at startup (before any hosted frame exists), binds `postMessage` / `addEventListener`, and removes
`window.wizardDownloadsPort`; a hosted app has nothing left to reach through `parent.*`. A frame's own copy of the
port is refused natively (not the main frame). This is covered by fake-window web tests only; whether the real
WebView lets the page delete the injected property, and whether a hosted iframe really finds nothing, is part of
the device/emulator acceptance (queued on forum, not run here).

Still true and unchanged for every existing port (`wizardScreenPort`, `wizardAppsPort`, ...): a same-origin frame
can script the shell DOM in other ways; this change does not isolate the shell document from hosted apps.
