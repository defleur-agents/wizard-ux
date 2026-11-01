# R16 frozen-source native selector audit

QA only. Product web tree `71bf2528320df6290d38b99e49030b1e009d2db4`,
Wisdom `a800c16c81b520150ec72721eb79613b242169e8`, release APK .23/code87 unchanged.
REUSE the existing accessibility capture/input, renderer, egress and flight rig;
EXTEND native navigation/selectors and XML regressions. No product UI/API alias.

| Stage | Frozen source / actual observation | R16 action and gate |
|---|---|---|
| Connect | Existing MainActivity transition; R15 20 real stability captures | Retain same release Connect + all 20 captures, no permission pregrant |
| Welcome name | R15 `FAIL.xml` SHA e3e8a2bbd247c542b654c57fbe32d663e6cdad9850e94ab00a42f753ab8e68ed; Welcome dialog, Name your Wizard, Skip this step [388,1916][693,2034] | Click that enabled dialog-scoped control once, save observed XML/stage/action, wait for stage transition. Underlying orb has NONZERO bounds in actual R15: bounds alone do not establish unoccluded readiness |
| Welcome later steps | `web/core/welcome.js` paintAI/paintLook/paintHello/fromName/back, lines 138, 166, 179, 185, 287–295 | AI and hello have NO universal skip CTA. Use actual native Back: hello→look→name→close, AI→name→close. After returning to name use Back, do not cycle skip. Never sign in, rename, send or write setup state |
| Optional practice/mic | `web/core/tour.js` build/finish, lines 70–85, 211–219 | Exact Learn Wizard OS dialog → Skip tour, not record/reply. No capture-voice step exists in this frozen Welcome source. No microphone action is needed for pin acceptance |
| OS permission | `MainActivity.java` mic request only on voice; device notifications separately requested | If controller actually appears, identify controller package + permission_deny_button resource ID and real bounds. Unknown controller variant refuses with capture; no guessed labels/coordinates, generic OK or pm grant |
| Orb | `web/index.html` actual Wizard orb accessibility label; `app.js` orbUpDesks lines 1477–1482 | Only after modal gone and two ready captures. Swipe uses real visible orb bounds. Orb-up is Apps OR Desks depending on active skin, not always Apps |
| Pick app | `app.js` newDesk/kindGroups/openOverview | If Wisdom tile already visible, tap; else exact New desk: pick an app then Wisdom. Wait for real Wisdom home, not A quiet beginning: home may show collection tile/Browse all, not chapter title |
| Desks | `app.js` renderDots lines 400–452 | Current desk is the orb: there is NO Wisdom current dock button. Hold an actual Home/Chats dock button at orb height, derived from accessible bounds, to open overview without switching desks |
| Offer pin | `app.js` ovDl/ovCard/bindOverview lines 507–544, 587–645; `tweaks/miguel/arrange-download/tweak.js` | Hold exact Wisdom, current desk. Arrange/download disables launcher appHold; tap Add Wisdom to home screen when visible. Without tweak, hold directly offers the same sheet: inspect before choosing branch |
| Request pin | `core/home-screen-apps.js` show lines 46–54, 99–106; `HomeScreenShortcuts.java` requestPinShortcut | Enabled Add to home screen scoped to Wisdom home screen dialog AND MainActivity. Separate actual system launcher package/window + clickable Add/Add automatically/Add to home screen confirmation. App CTA never counts as OS confirmation; dumpsys shortcut remains mandatory |
| Pin launch/cold launch | Existing AppSessionActivity + Home icon | Retain real launcher Wisdom icon → AppSessionActivity, cold process absence, airplane mode + Wi-Fi disabled + reverse removed, no ReachScreen, same pin identity |
| Library/chapter | `wisdom/static/wisdom.js` discovery/browse/collection/reader; fixture generates only Flight collection/chapter | Browse all → Synthetic flight collection → A quiet beginning. Fresh chapter must show page 1 and checkerboard art (parent pixel review). Filter inaccessible zero-bound labels, so hidden pages never satisfy selectors |
| Pagination | `wisdom.js` reader/page layout/save progress lines 325, 564, 581–585 | Real touch swipe between accessible Chapter discussions header and page count footer; assert exactly one page. Reopen respects saved position, not a forced assumption of opener. Exact saved page must survive second offline process death |
| Highlight | `wisdom.js` showActive/select/commit/bindPop lines 743–774, 841–870 | Real long touch on visible synthetic paragraph, exact Highlight action (never Ask AI/Look up/Add a note). Keep retained offline passage check and lost-ACK exactly-once replay. Real toolbar can remain active after save |
| Native Back | `wisdom.js` active selection, `app.js` backStep; native handleBack | Bounded 3 Back actions until reader header gone: selection toolbar may consume first Back. Collection Export this collection gate still required. Repeated root Back must retain AppSessionActivity |
| Highlights route | `wisdom.js` browse/libraryTiles and Highlights tile | Browse all then Highlights, not collection/private shelf. Retained text before reconnect; preserve same shortcut, outbox IDs, one stored highlight after repeated lost-ACK attempts and progress sync |
| Visual | Unchanged R8 phone/desktop dark/light + opacity/Back evidence | Inherit exact nine phase receipts/hashes only, never R8 overall/native pass. Parent must inspect R8 baseline/phone/desktop plus fresh native screenshots. Native SWANGLE proof and three-stage IPv4/IPv6 app-UID guards remain unchanged |

## Honest runtime gaps

This audit and generated XML transition tests do not establish native success.
Actual API35 launcher confirmation text/package, any unexpected permission window,
WebView text-selection geometry, restored page count and final checkerboard art
must be observed by the parent-admitted R16 flight. Unknown/ambiguous controls fail
closed. The actual R15 XML is retained unchanged; generated variants are unit tests,
not fabricated native evidence. R15's 45 true checks ended before pin and do not
constitute complete native acceptance. No new emulator/browser/image/APK run is
performed during this source-only repair.
