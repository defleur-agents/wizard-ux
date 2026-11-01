# Ready app cards

Reuse:
- Installed-app discovery: EXTEND `readApps` → `WizCore` registry; no second registry.
- Ready rendering/polling: EXTEND Chats; one renderer for every opted-in app.
- Opening/Back, status lifecycle, toast: REUSE `H.openApp(id, srcEl)`, visibility/list cadence and toast.
- Appearance: EXTEND existing card geometry and skin selectors; preserve dots and warm badge, use `--wz-text-secondary`.

## Tiny opt-in

Add `ready_card` to an installed `apps.json` record, or an owner link in
`launcher.json.links`. The app owns that declaration, not shell code. The Agent
Service projects the allowlisted field on the existing `/wizard/v1/apps` response.
No custom HTML, scripts, CSS or arbitrary action URLs are accepted.

```json
{"id":"garden","name":"Garden","url":"/garden/","ready_card":{
  "title":"Garden","subtitle":"Water · Feed",
  "status":"api/status","dismiss":"api/hide"
}}
```

`status` and optional `dismiss` are relative to the app's same-origin directory
(`view` for installed apps). Only literal path segments are accepted, no traversal,
query, absolute/external URLs or root endpoints. Cached metadata does not opt in:
a fresh installed-app response is required. Stopped or removed apps have no card.

GET status returns `{day:string, done:integer, total:integer, next_label?:string,
hidden?:boolean}`. Progress is bounded to 1–32 dots. When `done === 0`, use the
manifest subtitle; otherwise show `N of M done · next: …`. `hidden` or
`done >= total` means gone. Apps own timezone/day rollover and persistent state.
A failed status read does not create a card. Only status changes repaint the list.

POST dismiss sends `{ "hidden": true }` and must return the updated status.
Remove the card's DOM nodes synchronously in the click handler (including held
and desktop split lists), then send after the paint. Fence stale polls; on failure,
restore the exact nodes and show `! Couldn’t hide <title> · try again`.

After an app edit, it can send `top.postMessage({type:'wizard:ready-card',app:'garden'},
location.origin)`. This invalidates the installed app's status read; frames cannot
inject card state or endpoints. The same cheap one-minute poll remains the fallback.
Open always uses the installed app id, not a manifest-supplied executable action.

## Morning adoption (private app, no live change)

The app lives in private `humanitylabs-org/morning`, currently an owner link at
`/morning/`, not a WAM package. Its paired branch adds `launcher-entry.json` and
switches its existing change notification to the generic invalidation. The entry
preserves `Morning`, `Workout · Meditate · Read`, four progress dots (from status),
open/back behavior and the existing app-owned hide-until-next-day endpoint.
The live launcher and running Morning code are untouched. Preview uses a backed-up
launcher COPY, the candidate service projection, and a disposable sample card so
James can judge the card even if his real day is already hidden/done.

## Verification

`node --test tests/app-ready-cards.test.mjs` checks a different app and rollback.
`node qa-app-ready-cards.cjs` runs isolated full-shell plain/desktop/thread tests,
5-second delayed hides, 500 rollback/toast, install gating, rollover, progress,
opening, no polling flicker and two real skins. Legacy QA names delegate here.
Use `QA_OUT` for screenshots/results and run browsers on the Linux worker.

Review question: does Morning look and behave exactly as before—pinned progress,
same-frame open/×, gone when done/skipped and back at the next app-owned day?
The preview is read-only except its disposable sample hide and sandbox skin choice.
