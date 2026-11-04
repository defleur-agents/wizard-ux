# Miguel release coverage before the v5 gate

Frozen prior coverage: `a30a93b029ec6ab75e46fe747cbcc0ad24568a7a`.
New covered `release/miguel` tip: `257106beb72248652abef8a88ea56e013cc2c4e1`.

`git log --reverse --no-merges <old>..<covered>` enumerates exactly eight commits. Every one has a disposition below; `git cherry HEAD <covered> <old>` reports all eight as patch-equivalent after these ports. Do not interpret this as covering a future moving tip.

| Source commit | Disposition on main / this PR |
|---|---|
| `a2e8fb6790aa31d1ac2c8464d8810639bbd11979` | Already covered by ancestor `21bbbf4f0c8c2ce16dfd3d5303bc9a3d49e099a6`: AI fuel gauge independent of network Home. Patch-equivalent. |
| `86e3c5eb2028ee0ca978a14546248f00626ea938` | Already covered by ancestor `14f1c6ce42e118f613edb922a7afdcb1167bc539`: Resources ink on Landscapes. Patch-equivalent. |
| `6514ed8f15092b3ff95663f4cab641224f1106d1` | Ported as `f0c22e6705ccd682b514c24d07e360e455690102`: Background inside Skin. Its old picker is then superseded, as intended upstream, by the final Background/Mode port below. |
| `74ad9b9b323a74458bc4f88f67fa3d061106e74c` | Ported as `795f052c4f75688ca9d0a40c19d376f8ac11037f`: separate Group and Sort dropdowns. |
| `0eac35cf1fc08d8d6a8cc787dce2971de604311d` | Already covered by ancestor `7a53256227699f71c1285e8e9cf69b44464b26d9` / PR #954: re-arm the usage feed on visible drawer/sidebar foot. Patch-equivalent. |
| `bca5a188676233f285ed7c61912af84755982d2a` | Ported as `b9961a201f02f67fa3b0f2b0317bd77a31c27bf9`: omit repeated project prefixes when grouping by project. |
| `070f830a58cf3e5264ef2e13f2375b0f38a0c32c` | Ported as `0d2e270eaa2596ed5e2a6ad7036ee5e8998f4c1c`: failed/interrupted and yesterday/past-week chats join Ready in both shell projections. |
| `257106beb72248652abef8a88ea56e013cc2c4e1` | Ported as `7cebecab21ef35ea8ace166a1099fc8c7286615e`: Background cards and Dark/Light mode for twinned skins. |

## Drawer reconciliation

This PR starts at merged main `48f8743600baec19e45893db3f4732690e415239` (PR #957). The phone AI apps `layout.js` is byte-identical before and after the five ports: no donor branch replacement, loss of shell-sheet guard, gesture-claim repair or deferred-Chat continuity fix. All three new drawer regression tests remain present and pass after the ports. An already-started drawer drag is cancelled immediately when a shell sheet opens.

## Evidence and remaining acceptance

Actual browser-free tests on this combined tree: `ai-apps-view.test.mjs` 80/80 PASS; `wizard-os-background.test.mjs` 4/4 PASS. No full local npm, browser, Docker, deployment or restart. Full npm and visual acceptance remain the source-sealed parent-submitted v5 forum gate. It must pin the final merged main, retain the covered release SHA above, and inspect phone/desktop screenshots on Nebula and Obsidian light, including the phone Settings off-retap, before visual acceptance. The earlier round5 directory pinned only to #957 is superseded and must not be submitted.
