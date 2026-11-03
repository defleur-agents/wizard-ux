# Shared components

**Appearance:** [Wizard app style guide](https://github.com/humanitylabs-org/wizard-os/blob/main/style/APP-DESIGN-RULES.md). Inventory.

**One implementation per capability.** NEW: `web/core/` + row, never an app.

CI: [reuse gate](app-reuse-gate.md).

```
Reuse:
- chat: REUSE WizardApp.nav.openThread
- orb: EXTEND Orb.create (row updated)
- streak: NEW web/core/streaks.js + row
```

`Reuse: n/a (reason)` requires no `web/` or `android/` changes.

## Apps (`WizardApp`: `/wizard-os-home/core/app-client.js`)

| Need | Use | Never hand-roll | Test the shared path by |
|---|---|---|---|
| Owner signatures | `WizardApp.identity.*` → `wizardDevicePort` | See notes | `wizard-id-bridge.test.mjs` |
| Agent chat | `WizardApp.nav.openThread(sessionId, {reply})`, `nav.openContextDraft` | See notes | shell `[data-chats]`; 503: one outbox item/message |
| Home-screen identity + app root | `WizardAppIdentity` (`web/core/app-identity.js`), loaded by SDK | See notes | manifest wins; frames untouched |
| Own chat-box input: paste, drop, Enter | `WizardApp.composer.bind` (Chats' `web/core/composer-input.js`) | See notes | `qa-composer-input.cjs` |
| File chip before send | `WizardApp.attachChip.node` (Chats' tray, `core/attach-chip.js`) | See notes | `qa-attach-chip.cjs` |
| Full-screen photo/video | `WizardApp.media.view(items, i)` = Chats' `WosChat.viewer` | See notes | Messenger `photo_viewer_browser.cjs` |
| Bound same-app companion | `WizardApp.shell.openCompanion` → `WizCompanionPane` (`web/core/companion-pane.js`); [API](shared-app-services-host.md) | See notes | `qa-companion-pane.cjs`: nested Back |
| Back in app; leave on dismiss | `WizardApp.back.register/push`, `nav.back()`; `WizOpenApp(id,path)` validates repair app URL + origin | See notes | nested Back stays; repair → source chat |
| Skin, tokens, light/dark | `WizardApp.theme.get / onChange`, `--wz-*` roles | See notes | two skins + live change keep state |
| Native Android skin | `WizardLook` (`android/app/src/main/java/ai/wizards/os/WizardLook.java`): saved roles, Nebula fallback | See notes |
| Native offline/connect | `ReachScreen` / `ReachPolicy` (+`TailscaleGuide`), `ConnectActivity` / `ServerSettings`; web `WizReach` | See notes |
| Transcribe audio | `WizardApp.voice.transcribe(blob, {language})` → `{text}` / `{unavailable:true}`; verified frame, 25 MB; `WizConfig.transcribe` (rechecks) | See notes | stale/foreign denied; unavailable explicit |
| Share out (people → apps → Other) | `WizardApp.share.text / file` | See notes | cancel ≠ shared |
| Receive shares | `WizardApp.share.receive({accepts, targets, receive}) / targets / check` (`docs/SHARE-SHEET.md`) | See notes | pending until accepted, ack once |
| Mic, camera, screen capture | `WizardApp.capture.start / current / settle / pending / ack`, `WizardApp.voiceInput.register` | `getUserMedia`; `MediaRecorder` | pending survives Back; ack once |
| Duck Music; orb app button | `WizardApp.audio.duck(on)`; `.orb.claim/release` (two-orb) | See notes | off on close |
| Title-bar tools | `WizardApp.titlebar.set(tools)` | See notes | icons/dot in shell bar |
| Fingerprint app secret | `WizardApp.vault` (`VaultBridge`, 2-slot `VaultSlots`) | See notes | cancel keeps old |
| Offline replica, durable edits | `WizOffline.create` (`core/offline-kit.js`) | See notes | recoverable failures |
| Protect unsaved work from updates | `WizardApp.update.hold` | See notes | release after save+readback |
| Offline shell | `web/sw.js` | See notes | offline reload |
| App reading place | `WizAppReadingPosition` (`web/core/app-reading-position.js`), automatic | See notes | reopen lands at the saved place |
| Motion/haptics | `WizardMotion` (`/wizard-os-home/motion/wizard-motion.js`) | See notes | — |
| Canonical style admission | `check_style.py` (`wizard-os/style/`), mirrored in WAM | See notes | legacy warns; changed lines fail |
| App kit: rows/sections/empty/add | `WizardApp`: `web/kit/wizard-ui.css` + `--wz-*`, then core/package/My skin | `.wz-field-row` | two skins + My skin restyle `.wz-*` |
| Owner signatures | `WizardApp.identity.*` → `wizardDevicePort` | app keys | `wizard-id-bridge.test.mjs` |
| Agent chat | `WizardApp.nav.openThread(sessionId, {reply})`, `nav.openContextDraft` | own chat UI/retries | shell `[data-chats]`; 503: one outbox item/message |
| Home-screen identity + app root | `WizardAppIdentity` (`web/core/app-identity.js`), loaded by SDK | per-app manifest injectors | manifest wins; frames untouched |
| Own chat-box input: paste, drop, Enter | `WizardApp.composer.bind` (Chats' `web/core/composer-input.js`) | own paste/drop/Enter | `qa-composer-input.cjs` |
| File chip before send | `WizardApp.attachChip.node` (Chats' tray, `core/attach-chip.js`) | own chip | `qa-attach-chip.cjs` |
| Full-screen photo/video | `WizardApp.media.view(items, i)` = Chats' `WosChat.viewer` | own lightbox | Messenger `photo_viewer_browser.cjs` |
| Bound same-app companion | `WizardApp.shell.openCompanion` → `WizCompanionPane` (`web/core/companion-pane.js`); [API](shared-app-services-host.md) | app-specific desks/relays | `qa-companion-pane.cjs`: nested Back |
| Back in app; leave on dismiss | `WizardApp.back.register/push`, `nav.back()`; `WizOpenApp(id,path)` validates repair app URL + origin | guards, 2nd tap | nested Back stays; repair → source chat |
| Skin, tokens, light/dark | `WizardApp.theme.get / onChange`, `--wz-*` roles | theme storage, own dark mode, literal colours | two skins + live change keep state |
| Native Android skin | `WizardLook` (`android/app/src/main/java/ai/wizards/os/WizardLook.java`): saved roles, Nebula fallback | literal colours in native screens |
| Native offline/connect | `ReachScreen` / `ReachPolicy` (+`TailscaleGuide`), `ConnectActivity` / `ServerSettings`; web `WizReach` | duplicate offline/address UI |
| Transcribe audio | `WizardApp.voice.transcribe(blob, {language})` → `{text}` / `{unavailable:true}`; verified frame, 25 MB; `WizConfig.transcribe` (rechecks) | app transcriber | stale/foreign denied; unavailable explicit |
| Share out (people → apps → Other) | `WizardApp.share.text / file` | own picker | cancel ≠ shared |
| Receive shares | `WizardApp.share.receive({accepts, targets, receive}) / targets / check` (`docs/SHARE-SHEET.md`) | own inbound route | pending until accepted, ack once |
| Mic, camera, screen capture | `WizardApp.capture.start / pending / ack`, `WizardApp.voiceInput.register` | `getUserMedia`, `MediaRecorder`, mic AudioContext | pending survives Back; ack once |
| Duck Music; orb app button | `WizardApp.audio.duck(on)`; `.orb.claim/release` (two-orb) | own volume/FAB | off on close |
| Title-bar tools | `WizardApp.titlebar.set(tools)` | repeated header | icons/dot in shell bar |
| Fingerprint app secret | `WizardApp.vault` (`VaultBridge`, 2-slot `VaultSlots`); `WizAppServices` gates prompts on steady shell focus and keeps the shipped legacy adapter | caller-supplied app identity | background cannot prompt; cancel keeps old; late/reloaded document gets no secret |
| Offline replica, durable edits | `WizOffline.create` (`core/offline-kit.js`) | app outbox | recoverable failures |
| Protect unsaved work from updates | `WizardApp.update.hold` | app SW, forced reload | release after save+readback |
| Offline shell | `web/sw.js` | API cache | offline reload |
| App reading place | `WizAppReadingPosition` (`web/core/app-reading-position.js`), automatic | app-local scroll store | reopen lands at the saved place |
| Motion/haptics | `WizardMotion` (`/wizard-os-home/motion/wizard-motion.js`) | own springs/haptics | — |
| Canonical style admission | `check_style.py` (`wizard-os/style/`), mirrored in WAM | per-app lint forks | legacy warns; changed lines fail |
| App kit: rows/sections/empty/add | `WizardApp`: `web/kit/wizard-ui.css` + `--wz-*`, then core/package/My skin | kit forks; `.wz-field-row` chat; literals | two skins + My skin restyle `.wz-*` |

## Shell (`web/core/`): both shells/all agents; per-kind EXTEND.

| Need | Use | Never hand-roll |
|---|---|---|
| Desktop tiling | `layout` / `tile` in `web/desktop/desktop.js`: all desks, own fullscreen | See notes |
| Pages: list, viewer, editor, history, bridge | `WosPages` (`pages.js`) | See notes |
| Action menu | `WosContextMenu.open`/`.back` (`core/context-menu.js`) | See notes |
| Saved Wizards | `WizWorkspaces` (`web/core/workspaces.js`); [v1](workspaces.md) | See notes |
| App setup | `WosAppSetup` (`app-setup.js`) | See notes |
| Workspace sync and shared desk order | `WosWorkspaceSync` (`workspace-sync.js`), phone `insertPos`/`bringBeside` | See notes |
| Chats: Focus/Filter/search, composer/files/read,… | `WizCore`; `chats.js`; `.css`; `WizLive.readyRank`; `setFocus`; `migrateChatsFocus`; `WizLive`; `CHATS.clearFilter(id::list)` | See notes | `WizLive.cardAt` `c.sOpen` `chatSearch.rank` `streamShown`
| Chats list variant | `WizChatsHost` view slot (`chats-view.js`) | See notes |
| Bound-view handle; first three appearances glow | `WosSkinHost` built-in (`edge-peek.js`), host storage | See notes |
| Repaint a live view without flicker (only changed… | `WosMorph.morph` (`dom-morph.js`) | `innerHTML` |
| Models/retry, composer mic, receipts, reading… | `WosChatPower`; `chat-power.js`; `WosModels`; `chat-models.js`; `WosErrors`; `chat-errors.js`; `WosWork`; `chat-work.js`; `WizCore`; `chats.js`; `fitLabel`; `chat-power.css`; `lab-row` | See notes |
| Markdown, drafts, inline/bottom media | `WosChat` (`chat-kit.js`: `helm`, `md`, `copyRich`, `viewer`); Chats `mediaBlock` | See notes | `inboxHint`
| Spaces / Focus | `WizCore`; `chats.js`; `WizLive.prefOps`; `spaces`; `WizLive.spaceSessions(ids)`; `winAgent`; `modelRoute`; `WosOutbox.onNew`; `WosAgents.colour`; `distinctHues`; `--ch-agent-hue` | See notes |
| Pins: menu / opt-in row buttons | `WosChatPins` (`chat-pins.js`) | See notes |
| Snooze thread/message: Later today · Tomorrow · In… | `WosBoomerang` (`scheduled-reminders.js`) on the one scheduler; Settings → Schedules `WosSchedules` (`schedules.js`; optimistic delete) | See notes |
| Thread topic emoji | `WosTopicEmoji` (`chat-topic-emojis.js`, data `WosTopicEmojiData`) | See notes |
| Durable send, saved Retry, failed Dismiss; >6h hold | `WosOutbox`, `WosCarry` (`web/outbox.js`) | See notes |
| Cancelled-recording keep | `WosCancelled` (`cancelled.js`; deleting progress) | See notes |
| Share to Wizard | `WizShareWizard` (`share-wizard.js`) | `share.wizard`; `durable` |
| Uploads of any size | `WizUploads` (`uploads.js`) | See notes |
| Files browse, preview, attach | `WosFiles` (`files.js`) | See notes |
| Settings in both shells (pages/versions) | `WosSettings.register` (`settings.js`; System pages only from packages: `hasSystem`), `focus(id)`, `WosFeatures`; `WizConfig.responseStyle` | See notes |
| Settings in both shells | `WosSettings.register` (`settings.js`; Wizards; System pages only from packages: `hasSystem`), `focus(id)`, `WosFeatures`; `WizConfig.responseStyle` | See notes |
| Agent identity, glyph, hue; which agents an app joins (`appAgents`: privacy, needs_private_agent) | `WosAgents` (`agents.js`) | See notes |
| Store | `storeKind,sourceLabel,parseInstallLink,removeInstalledApp` (`web/store/`) | See notes |
| App agent routing, private-app note + setup (incl.… | `WosAppRoute` (`app-route.js`) | See notes |
| Desktop keys | `watchFrame → onKey` (`desktop/desktop.js`); frame capture, keyup/blur | See notes |
| App icons, logos | `WizSigil` (`sigils.js`, `sigils.css`); registry glyphs/aliases, masks and brands beat package pictures; Store reuses the same identity; unknown logos preserved | See notes | `WizSigil.of` `wizard-notes`
| Launcher policy | `WizLauncher`, `WizLauncherDefaults` (`core/launcher*.js`); synced prefs+defaults, 1s boot cap | See notes |
| App groups | `WosAppKinds` (`app-kinds.js`) | See notes |
| Brand hat | `WizBrand` (`brand.js`) | See notes |
| Links: sheet/window (`asWindow`), images, long-press browser/Download/Copy | `WizLinks` (`links.js`; Android: `WizardOSNative.openInBrowser` / `download`) | `window.open` |
| Selection menu | `WosSelMenu`, `WizardApp.selection` | See notes |
| Share sheet (text/url/image/file), receivers,… | `WosShareSheet` (`share-sheet.js`), entered via `WosChat.sharePayload`/`shareFile`; hold → tray: `bindSharePress` | See notes |
| Agent screen context | `WizScreen` (`screen-text.js`) | See notes |
| Dictation into a focused field | `WizCore` focused field (`focused-field.js`); voice `WizCore` (`voice.js`); mic choice `WosMic` (`mic.js`) | See notes |
| Local commands | `WosCommands` (`commands.js`) | See notes |
| Screen capture | `WosScreenCapture` (`screen-capture.js`), `WosCaptureTools` (`capture-tools.js`) | See notes |
| Update banners/card/pop-up | `WizWebUpdate`, `WizAppUpdates` (`web-update.js`), `WizAppVersions` (`app-versions.js`), `WosUpdates` (`os-updates.js`: `card`/`popup`) | See notes |
| Provider login (Claude, ChatGPT) for agents and apps | the installed login apps (`wizard-claude`, `wizard-chatgpt`; skill `app-owned-codex-connections`) | See notes |
| Native phone mic recording (voice notes, orb takes,… | `NoteRecorder` (`audio/NoteRecorder.java`) over `MicRoute` (`audio/MicRoute.java`: `MicRoute.start`: `MicRoute.NOTE_SOURCES` for notes, `MicRoute.SOURCES` for STT) | `new MediaRecorder`; `AudioRecord`; `setAudioSource`; `audio/` | `MicRouteTest`, `NoteRecorderTest` |
| Android shell capabilities | `WosDevicePort` (`device-port.js`), `WosDeviceRecording` (`device-recording.js`), `WosDeviceOrb` (`device-orb.js`); `wizardDevicePort` v1 (`device/DeviceMessageProtocol.java`) | `@JavascriptInterface` |
| Home-screen apps / safe top | `WizHomeScreenApps.attach / offer / canOffer`; `single-app-session.js`; `home-screen-apps.css`; `WizChatsHost.openHosted / replyRecorder`; `WizAppCapture`; `sendVoiceTo` | See notes |
| Home-screen declaration | `WizHomeScreenCapabilities` (`web/core/home-screen-capabilities.js`): sanitize/matcher/replicaPrefix | per-app offline/storage switches | refresh/revoke |
| Long screenshot, text selection | WebView document scroll, `SelectionWebView`, `ScrollCaptureCrashGuard` (`docs/android-document-scroll.md`) | See notes | long Chats capture |
| Incognito chat | `WizCore.incognitoChats` (RAM-only, `WizLive.openRunStream`) | See notes |

## Visual (drawn/animated: side-by-side screenshot under `Visual:`)

| Need | Use | Never hand-roll |
|---|---|---|
| The orb, any size | `Orb.create(canvas, fallback, {R})` (`web/orb.js`, icon/core); mirrored Android assist; ordered shader ramps and context restore preserve mode/level/sleep | See notes | `android/app/src/main/assets/assist/everywhere.html`
| App heading ink | `WosSkinFrame`/`frameEdge` (`web/app.js`): sRGB luminance, Settings/themed exclusions | See notes |
| Skins, backgrounds, scenery, skin switches (`--wos-orb-swipe-up`, `--wos-reply-regenerate`) | `WosSkin`; `web/core/skins.js`; `WosSkinHost`; `web/core/skin-host.js`; `api.orb.switcher()`; `core/slots.json`; `home-main`; `paintHome`; `windowRefresh`; `data.read`; `back.push`; `WosExperience`; `web/core/experience.js`; `WosMySkin`; `web/core/my-skin.js`; `skin.js`; `WosScenery`; `web/core/scenery.js`; `WizAppearance`; `web/core/appearance-host.js` | See notes | `WosLookSync` `look-sync.js`
| Pins-only orb radial | `WosOrbSwitcher` (`web/core/orb-switcher.js`) | See notes |
| Motion | `WizardMotion` (`web/motion/wizard-motion.js`) | See notes |
| Tour/help, responsive Done, skip/exit; desktop `WosTour.desk` | `WosTour` (`web/core/tour.js`) | See notes |
| Install prompt; `hold(on, owner?)` during tours/overlays | `WizardPwaInstall` (`web/pwa-install.js`) | `beforeinstallprompt` |
| First run (Welcome: name, AI, colour, hello; Setup… | `WosWelcome`; `web/core/welcome.js`; `WosSetupLaunch`; `web/core/setup-launch.js`; `web/setup/setup.js`; `WizPhoneConnect`; `web/core/phone-connect.js` | See notes |

## App voice/audio

| Module | Contract |
|---|---|
| `web/core/app-voice.js` (`WosAppVoice`) | Registry names/claims. |
| `web/core/voice-legacy.js` (`WosVoiceLegacy`) | Frozen Music/device schema to APK A; Food grammar; ids: `appIdAliases`. |
| `web/core/background-audio-legacy.js` (`WizBackgroundAudioLegacy`) | Pilot grant/token until APK A. |

## Plumbing (single owner; files in `web/core/` unless noted)

`WizCompanionPane` (`companion-pane.js`), `WizardApp` (`app-client.js`), `WizAppCapture` (`app-capture.js`), `WizComposerInput` (`composer-input.js`), `WizAttachChip` (`attach-chip.js`), `WosSkinFrame` (`skin-frame.js`), `WosDevice` (`web/device.js`), `WizAppServices` (`app-services.js`), `WizCore` (`core.js`, `bridge.js`), `WizConfig` (`config.js`), `WizReach` (`reach.js`), `WizAndroidRelay` (`android-relay.js`), `WizBackgroundAudio` (`background-audio.js`), `WizHomeScreenPolicy` (`home-screen-policy.js`), `WosOwnViews` (`own-views.js`), `WosOrbHandoff` (`orb-handoff.js`), `WosShareSheet` (`share-sheet.js`), `WosBell` (`notif-bell.js`, items), `WosResources` (`resources.js`), `WosUsage` (`usage.js`), `WizPhotosRelay` (`photos-relay.js`), `WosMusic`, `WizDeviceLegacy` (`voice-legacy.js`), openers `WizAppOpen`, `WizCanOpen`, `WizOpenApp`, `WizOpenAgentChats` (`web/app.js`), `WosBoundView` (`bound-view.js`), `WosWorkspaceSync` (`workspace-sync.js`, rig).

AI usage: EXTEND `WosResources`/`WosUsage` for extra usage; an unknown cap or spend shows as text, never zero or unlimited (`tests/claude-extra-usage.test.mjs`).

Devices: `WizPhoneConnect`, #677 + #648, shared kit. Setup/Mac reuse; +16px tinted Setup action, step-2 green check/Show again, final Done.

Full merged capability and reuse notes: [convergence details](CONVERGENCE-COMPONENT-NOTES.md).
