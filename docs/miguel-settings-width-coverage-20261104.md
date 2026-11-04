# Miguel follow-up disposition census (4 November 2026)

Previous covered release: `c474318ecc3a1a481ed8aaaef6dbdaeaf0dcb176`.
Fetched `release/miguel` boundary: `c474318ecc3a1a481ed8aaaef6dbdaeaf0dcb176`.

`git rev-list --reverse --no-merges c474318ecc3a1a481ed8aaaef6dbdaeaf0dcb176..origin/release/miguel`
returned zero commits. There are no new non-merge release changes to port in this follow-up.
Earlier dispositions remain in `miguel-device-view-coverage-20261104.md` and `miguel-release-coverage-20261104.md`.

## Settings repair disposition

Both current main and `release/miguel` already declare `data-settings-over` in the AI apps desktop layout,
with an explicit centred-panel comment. The desktop adapter only applied that contract on a later **open**;
turning AI apps on inside an existing Settings desk window left it in the view's right-hand panel.
This repair adopts that existing contract for an already-open panel without resetting Look, and one outside
close also removes the replaced Settings window. Other views retain their ordinary Settings window.

The shared Settings CSS already named an inline-size container but chose the category grid using viewport media
queries. At a wide desktop viewport a 470px app host still spent 280px plus gap/padding on the category column.
A host-width container query now uses the same category → page → Back stack below 700px, for every narrow host.
No second Settings renderer, shell-specific features, new palette or owner preference writes were introduced.

## Verification boundary

Browser-free Node DOM/CSS/host-lifecycle regressions accompany the repair. The v7 source-sealed forum gate retains
all prior phone/desktop view and two-skin coverage, adds >=280px Look-row checks and explicit narrow-host stacks,
and retries only detached-element scroll races after re-querying. Screenshots and real geometry remain a parent-admitted
gate, not evidence claimed by the source tests. No live deployment/restart is authorized here.
