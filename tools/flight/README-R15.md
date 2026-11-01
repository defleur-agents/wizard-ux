# R15 native-only QA continuation

Artifact: source-bound acceptance harness, not a product release.

R14 failed before app launch: the actual app-UID `nc` command's separately
recorded stderr is `nc: connect: Network is unreachable`; both actual REJECT
counters were zero. The human-table parser was not at fault. Historical route
output was not captured, so R15 must capture it rather than invent it.

EXTEND the R14 native harness only. Keep product, signed APK code87, candidate
Wisdom image, renderer SWANGLE flags/actual backend gates, 20 Connect captures,
all functional flight operations, R8 browser/controller/baseline inheritance,
and cleanup unchanged.

Before first launch install the identical app-UID first-OUTPUT IPv4 and IPv6
non-loopback REJECT guards. Read full `iptables-save -c -t filter` and
`ip6tables-save -c -t filter` snapshots before and after each bounded probe;
refuse missing/reordered/weakened rules. Capture command, exit, stdout AND
stderr for app-UID route lookup and the same TEST-NET nc destination. Proceed
only with new actual reject counters or simultaneous exact kernel no-route
outputs from both route lookup and nc. Do not call zero counters a firewall
pass. Unknown command/errors, successful probes, wrong UID and counter reset
refuse. Never enable a route or relax either guard to test the probe.

Reverify after real Connect and after the complete flight, with raw snapshots,
route/probe outputs, connectivity diagnostics and distinct mechanism receipts.
The aggregate and promotion preparation independently recalculate all three
receipts. Missing phases or tampering refuse promotion. No historical R14
receipt is relabelled. No image rebuild or browser rerun is necessary.

Acceptance remains a real complete APK flight plus renderer, cleanup and
visual review. Source-only tests and staging are not native acceptance. Only
the owning parent may admit the returned heavy specification.
