# R19 — wait for the existing native pin, never recreate it

Reuse:
- Pin capability: REUSE `WizHomeScreenApps` and signed native `HomeScreenShortcuts`.
- Acceptance: EXTEND the existing native-only flight and pin verification helper;
  no new product pin API, Android edits, APK build or browser/image rerun.

The 0.10.23/code87 signed APK is SHA 04a188ae…b767. Its retained build receipt
identifies source a1e00dafbed3bcadc8fda098a9f9255b4437ce88 and source manifest
b12de645…4272. The job's exact HomeScreenShortcuts.java and HomeScreenPolicy.java
hashes match the reviewed QA checkout byte-for-byte. `pin()` invokes
ShortcutManager.requestPinShortcut with AppSessionActivity and a task URI whose
identity is SHA256(origin + newline + appId). `PinConfirmed.onReceive()` checks
that identity, token, and actual pinned state before persisting :confirmed.
There is no AppWidgetManager request in this pin implementation.

R17 and R18 OS confirmation XML files are byte-identical, including the actual
“Wisdom widget, 1 wide by 1 high” content description. R17's actual ShortcutManager
receipt contains the exact origin/app-derived pinned identity. Thus the launcher
can present this shortcut as a widget cell; wording is not API-route authority.
R18 only sampled immediately after Add, found no shortcut, and aborted. Missing
asynchronous persistence is proven as a harness gap; a timing race as the full
R18 OS root cause remains unproven. No actual R18 AppWidget dump exists.

R19 confirms once, polls read-only at most 60 seconds, and retains each shortcut,
AppWidget, callback-preferences and Activity observation before accepting or
failing. It requires the exact launcher/user/package/pinned shortcut ID, Wisdom
label, AppSessionActivity intent, plus consumed callback token and persisted
confirmed flag. AppWidget is diagnostic, not a fallback acceptance route. Unknown
source or ambiguous/unknown OS surfaces refuse. No repeated request/Add tap.
After persistence it sends HOME once to map and click the actual existing icon.
Every later cold launch clicks that same launcher-labelled icon and records the
complete actual OS task URI, including ?app=wisdom and the origin-derived ID.
Before/after receipts must match exactly and fresh evidence is independently
verified. Failure diagnostics precede cleanup.

The actual R17/R18 XML/shortcut fixtures and exact signed-source hashes are in
fixtures/r19-pin/provenance.json. The delayed observation/callback unit sequence
is explicitly synthetic scheduling of historical captures, not new native proof.
The 27 combined tests include the exact 5/13-versus-5/15 rejection and all R18
reader-readiness negatives. settle_reader, reader comparator, fixture, egress,
renderer and inherited browser/product bytes remain unchanged. e45 remains unused.

Native acceptance is pending the parent's sole durable Forum admission. Do not
run the VM over SSH, deploy, read owner data, recreate a pin, or waive an exact
footer/pixel mismatch. A persistent 5/13→5/15 mismatch remains product failure.
