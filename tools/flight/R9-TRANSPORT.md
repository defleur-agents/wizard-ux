# Wisdom native-only R9 transport repair

Scope: QA controller only; preserve release APK code87, Android product source,
`web` runtime tree `71bf2528320df6290d38b99e49030b1e009d2db4`, Wisdom
`a800c16c81b520150ec72721eb79613b242169e8`, and the R7-built/R8-verified image.

## Observed, not inferred

Forum SDK: adb 37.0.1-15733141, emulator 37.2.12.0. Shared daemon 5037
exists from another job. R8 reached real Connect UI after 22 passing checks,
including UID10209 REJECT counters and immediate healthy ADB. Then transport
went offline; R8 did not retain emulator return code or continuous logcat.
No crash or competing-daemon root cause has been established.

AOSP adb `client/commandline.cpp` lines 1666–1684 explicitly supports both
`ADB_SERVER_SOCKET` and `ANDROID_ADB_SERVER_PORT`; socket takes precedence.
The latter is NOT an invented/ignored adb variable. SDK emulator's
`libandroid-emu-shared.so` contains `ANDROID_ADB_SERVER_PORT` too. A logged
helper command without `-P` does not establish that it reached 5037.
Source: https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/client/commandline.cpp

Actual no-VM probe found SDK37 rejects **listener** `-L tcp:127.0.0.1:5147`
with fatal `listening on specified hostname currently unsupported` (exit -6).
Listener `-L tcp:5147 server nodaemon` works. Both **client** socket env
`tcp:127.0.0.1:5147` and explicit `-H 127.0.0.1 -P 5147 server-status`
read that exact owned server. Its PID was stopped directly; shared5037 stayed
unchanged. Never use client `-P` without `-H` for recovery: absent-server
implicit startup could hide an owned-server crash.

## R9 lane

- SDK `-help-ports` explicitly documents `-ports console,adb` for isolated
  networking. Use checked-free 6168,6169 outside default scan5555–5585;
  own daemon5147 uses `ADB_LOCAL_TRANSPORT_MAX_PORT=5553`, no scanning.
  Do not invent an out-of-range `-port` argument (its help says5554–5584).
- SDK `-help-adb-path` / `-help-no-direct-adb` support routing emulator helper
  commands through our recorded adapter. Adapter pins server and translates
  emulator helper serial to the single explicit TCP serial127.0.0.1:6169.
- Pass standard socket env plus compatible emulator port env to ALL processes;
  explicit client host/port prohibit fallback/implicit daemon startup.
- Record host listener/process/RAM/server-state/serial snapshots every2s,
  each ADB result/stdout/stderr, helper commands, and continuous guest logcat
  before app installation and failure. Preserve pre-cleanup emulator exit code
  and fresh crashdb files when it died. Root/CA setup happens only before APK
  installation. No guest reset/reinstall inside recovery.
- At most2 transport recoveries: validate owned process/server alive and no
  foreign serial; reconnect offline plus explicit connect; verify same boot,
  installed package/version/install times and app PID; restore reverse only
  when origin is online. Resume only read-only/idempotent captures. Inputs,
  installs and app mutations never replay. A failed input remains a failure.
-20 real Connect hierarchy+pixel captures precede the first Connect tap, in
  the same emulator/install as main native acceptance; no extra browser run.
- Stop only owned processes, disconnect only owned serial, and retain failures.

## Mixed proof contract

`verify-inheritance.py` SHA-validates R8's immutable source manifest, top
receipt, every retained evidence file,8 browser receipts and sender log; it
checks functional, two-skin, Back, smoke and expected-red predicates directly.
It requires identical product exports (including Android and browser fixture
and driver); only `ux/tools/flight/` may change. It binds unchanged APK,
image tar, full static map and Dockerfile. R9 runner additionally reads exact
image ID/rootfs/config metadata. R8 remains failed overall; only its named
passed phases are inherited. Final receipt explicitly says browser=R8,
native=R9 and retains the original job/manifests/phase hashes.

Only fresh full native acceptance,20 stability captures, all assertions,
exact APK/source and owned-process cleanup can produce aggregate
`pass-needs-visual-review`. Parent still owns visual inspection and existing
owner-only promotion gates. `--verify-only` never starts a VM/browser/container.
