#!/usr/bin/env python3
"""Source/packet contract checks ONLY, not browser acceptance."""
import ast,json,sys
from pathlib import Path
r=Path(sys.argv[1]);qa=r/'qa';driver=(qa/'browser.cjs').read_text();extra=(qa/'extra.cjs').read_text();runner=(r/'runner.py').read_text();fixture=(qa/'fixture.py').read_text();kit=(r/'ux/web/core/offline-kit.js').read_text();host=(r/'ux/web/core/home-screen-policy.js').read_text()
checks={}
def check(name,ok):
 assert ok,name
 checks[name]=True
check('source-report-writer-reader-agree',"path.join(OUT,'report.json')" in driver and "out/'report.json'" in runner)
check('explicit-matching-chrome',"executablePath:process.env.QA_CHROME" in driver)
check('strict-actual-completion-observed',all(s in extra for s in ["actual:tx.durability","tx.addEventListener(event","actual==='strict'","completion==='complete'"]))
check('wisdom-only-journal-opt-in',"id !== 'wisdom' || !mode" in host and "prefix:'wisdom-'" in host)
check('same-existing-replica',"prefix+'offline-v1'" in kit and "indexedDB.open('wisdom-offline-v1',1)" in extra)
check('failure-seams-not-prod-hooks',all(s in extra for s in ['IDBDatabase.prototype.transaction','IDBObjectStore.prototype.add','read-fail','strict-unsupported','QuotaExceededError']) and '__qaFault' not in kit+host)
check('real-backend-fixture',"class H(server.Handler)" in fixture and 'super().do_POST()' in fixture and 'wisdom.state(c)' in fixture)
check('highlight-specific-retry-and-ack',all(s in driver for s in ["ids.length>=2","new Set(ids).size===1","r.id===ids[0]&&r.path.endsWith('/highlight')","highlightAckReceipts:1"]))
check('trusted-stage-edge-input',all(s in driver for s in [".wb-stage",".tap({position:","e.isTrusted","e.type==='touchstart'","trusted right edge advances exactly one actual page"]) and 'dispatchEvent(' not in driver.split('const hit=await stage.evaluate',1)[1].split('const chosen=',1)[0])
check('skin-two-live-same-document',all(s in extra for s in ["['obsidian','obsidian-light','obsidian']","__qaDocumentId","WosSkin.set(s)","--wz-base","--wz-text","naturalWidth"]))
check('decoded-opaque-panel-raster',all(s in extra for s in ['pixels.compare(loud,empty)','probe.differingBytes>0','raster.equal']))
check('sibling-actual-worker',"navigator.serviceWorker.register('/sibling-pin/sw.js'" in extra and 'siblingWorkerPreserved' in extra and 'extras.checkSibling(p)' in driver)
check('bounded-boots-and-previous-snapshot',all(s in extra for s in ['failed host hydration/strict mode must not hang','previousPresentationUnchanged:true','priorSnapshotReadable:true']))
check('no-browser-in-verify-branch',runner.index('if A.verify_only:')<runner.index('def case(') and "browsersStarted':0" in runner)
mod=ast.parse(runner);assignment=next(n for n in mod.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CASES' for t in n.targets));cases=ast.literal_eval(assignment.value)
check('ten-unique-case-identities',len(cases)==10 and len({c[0] for c in cases})==10)
check('budget-fits-light',sum(c[3] for c in cases)<=750 and 'time.monotonic()+830' in runner)
check('per-case-owned-cleanup',all(s in runner for s in ['deadline-time.monotonic()-5','QA_R23_OWNED_ROOT','current==start','cleanupFailure','remainingPids']))
check('no-release-native-claim',"'nativeAcceptance':False" in runner and "'releaseAllowed':False" in runner)
contracts=(qa/'contracts.cjs').read_text();tests=(qa/'contracts.test.cjs').read_text()
check('completed-get-only-asset-hashes',all(s in contracts for s in ["row.method==='HEAD'","await r.finished()","await r.body()","empty completed GET","fromServiceWorker","row.requestHeaders","row.responseHeaders","while(tasks.size)"]) and 'await closeContext()' in driver and 'responseTasks' not in driver)
check('real-dark-fallback-not-invented-token',all(s in extra for s in ['root:style(document.documentElement)','reader:style(document.querySelector','contracts.assertFallback(fallback)','standalone-dark-fallback.png']) and 'assert(fallback.base)' not in extra)
check('offline-baseline-after-ack-before-injection',extra.index("await f.evaluate(()=>WisdomOffline.flush())")<extra.index("'online-flush-settled'")<extra.index('await getContext().setOffline(true)')<extra.index("field:'saved',value:1")<extra.index('contracts.assertReplicaRetained(before,after)') and 'online-flush-server-receipt' in extra and 'failure-server-receipt' in extra)
check('real-sdk-sibling-keeps-existing-scope',"/wizard-os-home/core/app-client.js" in fixture and '__wosPresentationStorageDocument===document' in extra and 'host.rawPosition,null' in extra and 'pre-journal-home-screen-policy.js' in tests)
check('seam-regressions-before-browser-admission',runner.index('qa/contracts.test.cjs')<runner.index('if A.verify_only:'))
observer=(qa/'byte-evidence.cjs').read_text();probe=(qa/'observer-probe.cjs').read_text()
check('read-only-independent-cache-bytes',all(x in observer for x in ['response.clone().arrayBuffer()','crypto.subtle.digest','cache.matchAll(request)']) and not any(x in observer for x in ['fetch(','.put(','.delete(','ignoreSearch']))
check('empty-plain-get-still-fails',"row.worker||row.fromServiceWorker" in contracts and 'empty completed GET for nonempty source' in contracts and 'plain-page empty GET fails even with matching old/good cache' in tests)
check('unobservable-worker-is-not-network-pass',all(x in contracts for x in ['UNOBSERVABLE-empty-PW-body','network-UNOBSERVABLE-cache-exact-source']) and all(x in observer for x in ['row.contextId,proof.contextId','row.generationId,proof.generationId']))
check('initial-empty-and-old-generation-rejected',all(x in driver for x in ['initial.registrations.length,0','initial.names.length,0']) and all(x in observer for x in ['stale cache generation','unexpected/old owned cache']))
check('real-protocol-negatives-before-matrix',"['good','empty','wrong','stale','plain-empty']" in probe and all(x in probe for x in ['assert.equal(e.bytes,0)','row.cacheValidation.status','networkMeasurement','assert.equal(n.bodyBytes,member.bytes,']) and 'probe HTTP framing matches actual bytes' in tests and runner.index("case('observer-probe'")<runner.index('for entry in CASES:') and sum(c[3] for c in cases)+70<=830)
print(json.dumps({'status':'static-only-pass','checks':len(checks),'cases':len(cases),'budgetSeconds':sum(c[3] for c in cases),'browsersStarted':0,'fixturesStarted':0}))
