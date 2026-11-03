# Single narrow OS-window New chat: screenshot contract

## Source custody

Inspected live `current` release and serving repository on 3 Nov 2026: both source revision `37ed1d2bcb021e6b6ad890c4c4eb99833319fbf8`, web tree `f91151379baf06a37976363814e69d7ae0fb969f`.
This branch extends the existing harness only. No production change is justified yet; no source-red or candidate-green result has been executed. Do not deploy this branch as a claimed repair.

## Screenshot → source

- One app fills one narrow browser/OS window. There is no evidence of a second tiled app. Use forced desktop shell at CSS 595×945 / DPR2 as the initial, explicitly provisional size interpretation. The screenshot includes browser chrome, so its full 1190×1890 pixel dimensions are not proof of exact web viewport height.
- `web/core/agents.js:161-171` renders `Archimedes Main Agent` for the default registry entry. `web/desktop/desktop.js:490` calls `WosAgents.titlebar(w.agent || '')` for **every** Chats window. This title does **not** prove `w.agent === 'hermes'`, agent Focus, a separate agent window, or a different app.
- `web/core/apps.js:172-176` builds the actual default-agent launcher tile with `id: 'wizard'`, `kind: 'chats'`, and **no `agent` property**. `desktop.js:418-423` reuses/opens normal Chats. The harness clicks this visible, registry-derived `Archimedes Main Agent` tile instead of calling a guessed agent route.
- Supported saved Focus is `w.focus = {kind:'agent',key:'hermes'}`. `chats.js:32-38` migrates a sole legacy `w.agent` window into this shape; `winAgent` at line 1633 normalizes the default agent to the empty main-agent route. The test also seeds that supported saved shape without any owner data.
- The Back arrow and absent list correspond to `.dchats[data-thread="__new__"]` inside the 620px container rule (`desktop.css:129-134`), not to shell tile count. The empty center card uses `chats.js:2111`; its desktop hint comes from `desktop.js:102`. `Message Archimedes` is the default-agent composer placeholder.

## Existing owning behavior (important contradiction)

REUSE shared Chats `leaveAfterSend`, `modelRoute`, draft storage, durable outbox; EXTEND existing `qa-thread-trail.cjs` and `desktop-tiled-new-send.test.mjs`; NEW no production capability.

At the exact current live source, `keepNewSendList(wid, '__new__')` already accepts **either** a tiled workspace **or** a `.dchats` measured width ≤620px (`desktop.js:591-596`). This is used by both typed capture and native composer-mic handoff. `mainChats` excludes legacy `w.agent` but not `w.focus`; boot migration removes the sole legacy property before the guard. Therefore the claim “focused Archimedes bypasses this guard” is not supported by the actual source. Narrow single-window new sends are predicted to remain on the shared list already. This is a prediction, not a browser PASS.

A source-red must be established on this exact asset before selecting another production fix. If the staged probe passes, report NOT_REPRODUCED; inspect the affected client's loaded revision and real measured layout before changing policy. Do not turn a harness exception or mismatch into a RED. Do not import the earlier tiled red/green evidence for this surface.

## Parent-admitted canary

`QA_SCREENSHOT_NEW=1` selects eight isolated synthetic cases in the existing harness: Nebula/Grove × real default-agent launcher/saved main-agent Focus × native Enter/native MediaRecorder composer mic. No second app, CSS width override, owner history, private agents, real model run or real transcription. Every request is fulfilled locally or aborted; journal unexpected writes as failures.

For each case capture pre-send state and screenshot: shell, single window, viewport, DPR, titlebar, saved Focus, normalized route, visible Back, hidden list, empty-card hint and composer placeholder. Hold the real delivery enqueue before durable storage, require list after 450ms and after synthetic run ACK, compare session-create/run agent query+body, provider/model locks, and retain capture-journal/native recording readiness of ≥1200 bytes. Existing broad tiled/phone/reply tests remain unchanged and are not run by this canary.

The model fixture intentionally uses `qa-model` / `qa-provider`; this proves preservation of the selected route, not availability of the owner's GPT 6.1 Sol subscription. CSS 595×945 / DPR2 and the chosen skins are synthetic interpretation variants, not evidence read from the affected browser. Screenshots still require parent visual review.

## Admission boundary

The stage contains only a source diagnosis spec. Source-red cannot honestly be predeclared. Candidate-green admission must follow a valid source reproduction and a minimal owning production change; no candidate or repair receipt is fabricated. No tests, browser, deployment, main merge or heavy job were run/submitted by this worker.
