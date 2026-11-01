# Registry-owned Ready cards

Reuse:
- Registry: EXTEND `WizCore` apps and Service `readApps`; no second registry.
- Cards: EXTEND Chats renderer, polling and existing card geometry/skin selectors.
- Open, Back, feedback: REUSE `H.openApp`, toast, visibility/list cadence.
Visual: synthetic full-shell phone/desktop acceptance on two skins; screenshot inspection remains required before promotion.

Apps opt in through their existing apps.json record or launcher.json owner link:

```json
{"id":"garden","name":"Garden","url":"/garden/","ready_card":{"title":"Garden","subtitle":"Water · Feed","status":"api/status","dismiss":"api/hide"}}
```

Service projects only allowlisted metadata. The shell requires a fresh installed census, running status and literal relative endpoints confined to the same-origin app directory. No cached opt-in, executable markup, cross-origin endpoint, query or traversal is allowed.

Status GET returns `{day,done,total,next_label?,hidden?}`; progress is integral and bounded to 1–32 dots. Apps own all step names, persistence and day rollover. Done/hidden/uninstalled apps have no card. Unchanged status never repaints the list. Generic `wizard:ready-card` messages with the app id invalidate a registered status read, never supply trusted state. The existing one-minute poll/visibility refresh remains the compatibility fallback.

Open reuses installed app identity and source/Back. Dismiss removes exact visible nodes in the click task, even for held desktop split lists. I/O starts after paint. POST sends `{hidden:true}` and requires confirmed hidden status. Failure restores the retained nodes and a plain-text error toast. Pending status reads cannot undo the tap.

## Current-live reconciliation

This narrow port starts at shell f9afdb3798a57f183e6ab06b322aa4d3ca38c607 and Service 37b99737351369652f2c6126dde9b6eb403a8060. It preserves current search ranking/order, orb radial and all other live changes. The only apply conflict was the section renderer: retain the current-live section ordering, replace only its legacy card call. The list-render fixture now stubs generic readyPoll/readyCards without changing assertions.

Morning is an existing private owner link; its declaration already exists and is not rewritten. Core contains no Morning card state, endpoints, handlers or CSS. Its old app invalidation is safely ignored until app adoption; minute polling still works. Do not mutate the owner's day or overwrite launcher.json. Promote Service before shell; roll back shell before Service. Keep metadata during rollback to support already-loaded new clients until they reload.

## Tests

`tests/app-ready-cards.test.mjs` covers a different app, validation, stale polls, held lists, rollback and host adapters. `qa-app-ready-cards.cjs` uses entirely synthetic data and slow 5-second requests on phone and desktop/thread/held lists. `tools/qa-opaque-overlays.cjs` compares production toast pixels over loud versus blank backgrounds. The external acceptance receipt binds source SHAs, manifests, full logs and screenshots; historical receipts are not current-head passes.
