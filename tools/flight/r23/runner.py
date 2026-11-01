#!/usr/bin/env python3
"""Parent-only Forum light browser packet. --verify-only cannot launch browsers/fixtures."""
import argparse,base64,hashlib,json,os,selectors,shutil,signal,subprocess,sys,time,traceback
from pathlib import Path
R=Path(__file__).resolve().parent
P=argparse.ArgumentParser();P.add_argument('--manifest-sha',required=True);P.add_argument('--verify-only',action='store_true');P.add_argument('--remaining-only',action='store_true');P.add_argument('--isolation-only',action='store_true');P.add_argument('--diagnostic-only',action='store_true');A=P.parse_args();assert not(A.remaining_only and A.isolation_only)
sha=lambda p:hashlib.file_digest(open(p,'rb'),'sha256').hexdigest()
assert sha(R/'source-manifest.json')==A.manifest_sha,'manifest drift'
M=json.loads((R/'source-manifest.json').read_text());NODE=M['tools']['node'];PW=M['tools']['playwright'];CHROME=M['tools']['chrome']
CASES=[('functional-mobile','functional',390,145),('functional-desktop','functional',1440,145),('presentation-mobile','presentation',390,65),('presentation-desktop','presentation',1440,65),('strict-quota','strict-quota',390,45),('strict-unsupported','strict-unsupported',390,45),('boot-read-fail','boot-read-fail',390,55),('boot-strict-unsupported','boot-strict-unsupported',390,55),('boot-open-unsupported','boot-open-unsupported',390,45),('isolation','isolation',390,55)]
assert len(CASES)==10 and len({c[0] for c in CASES})==10
assert not A.diagnostic_only or A.isolation_only,'diagnostic mode requires historical isolation binding'
SELECTED=[c for c in CASES if (c[0]=='isolation' if A.isolation_only else not A.remaining_only or c[0] in ('presentation-mobile','presentation-desktop','isolation'))]
if A.isolation_only:
 binding=M['r29SourceEquivalence'];assert binding['productBytesUnchanged'] and binding['priorActualPasses']==9
 assert set(binding['priorPassReports'])=={c[0] for c in CASES}-{c[0] for c in SELECTED}
 for row in binding['priorPassReports'].values():
  old=json.loads((R/row['file']).read_text());assert sha(R/row['file'])==row['sha256'] and old['status']=='pass' and old['sourceManifest']==row['sourceManifest']
if A.remaining_only:
 binding=M['r28SourceEquivalence'];assert binding['productBytesUnchanged'] and binding['priorActualPasses']==7
 assert set(binding['priorPassReports'])=={c[0] for c in CASES}-{c[0] for c in SELECTED}
 for name,row in binding['priorPassReports'].items():
  previous=R/row['file'];assert sha(previous)==row['sha256'];old=json.loads(previous.read_text());assert old['status']=='pass' and old['sourceManifest']==binding['priorManifestSha256']
ENV={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PLAYWRIGHT_DIR':PW,'PLAYWRIGHT_BROWSERS_PATH':'/home/james/.cache/ms-playwright','QA_CHROME':CHROME,'NODE_EXTRA_CA_CERTS':str(R/'rig-ca.pem'),'QA_SOURCE_MANIFEST':str(R/'source-manifest.json'),'QA_MANIFEST_SHA':A.manifest_sha}
def integrity():
 assert sha(R/'source-manifest.json')==A.manifest_sha
 for name,row in M['members'].items():
  target=R/name;assert target.is_file() and not target.is_symlink() and sha(target)==row['sha256'],'member drift: '+name
  assert target.stat().st_mode&0o777==int(row['mode'],8),'member mode drift: '+name
 for root in ('ux','wisdom','qa','historical'):
  actual={str(p.relative_to(R)) for p in (R/root).rglob('*') if p.is_file() or p.is_symlink()};assert actual=={n for n in M['members'] if n.startswith(root+'/')},'complete source closure '+root
 for root in ('ux','wisdom','qa','historical'):
  assert len([k for k in M['members'] if k.startswith(root+'/')])==M['counts'][root]
 for name,digest in M['toolchain']['files'].items():assert sha(name)==digest,'toolchain drift '+name
 historical=json.loads((R/'historical/r8-evidence-index.json').read_text());assert len(historical['files'])==2291,'historical R8 inventory count'
 assert len(historical['checks'])==9 and historical['overall_status']=='failed','retain failed-native overall status separately from browser checks'
 for name,row in historical['files'].items():
  target=Path(historical['root'])/name;assert target.is_file() and not target.is_symlink() and target.stat().st_size==row['bytes'] and sha(target)==row['sha256'],'historical artifact drift '+name
 for name,row in historical['checks'].items():
  if 'receipt' in row:assert sha(Path(historical['stage'])/row['receipt'])==row['sha256'],'historical phase receipt drift '+name
 assert sha(CHROME)==M['toolchain']['chrome_sha256']
 assert os.access(CHROME,os.X_OK)
 assert subprocess.check_output([NODE,'--version'],text=True,timeout=5).strip()==M['toolchain']['node_version']
 # Metadata-only Playwright resolution; never calls launch(). Explicit browser
 # path avoids this module's missing default headless-shell cache.
 resolved=json.loads(subprocess.check_output([NODE,'-e',"const p=require(process.argv[1]);console.log(JSON.stringify({version:require(process.argv[1]+'/package.json').version,default:p.chromium.executablePath()}))",PW],timeout=10,text=True));assert resolved['version']=='1.64.1'
 ldd=subprocess.run(['ldd',CHROME],capture_output=True,text=True,check=True,timeout=10);assert 'not found' not in ldd.stdout+ldd.stderr
 pub=subprocess.check_output(['openssl','x509','-in',R/'rig-server.pem','-pubkey','-noout'],timeout=5);der=subprocess.run(['openssl','pkey','-pubin','-outform','DER'],input=pub,capture_output=True,check=True,timeout=5).stdout
 assert base64.b64encode(hashlib.sha256(der).digest()).decode()==M['fixture_tls']['leaf_spki_sha256']
 subprocess.run(['openssl','verify','-CAfile',R/'rig-ca.pem',R/'rig-server.pem'],capture_output=True,check=True,timeout=5)
 for name in ('browser.cjs','extra.cjs','pixels.cjs','contracts.cjs','contracts.test.cjs','byte-evidence.cjs','observer-probe.cjs','raw-cdp.cjs','raw-cdp.test.cjs','ownership.test.cjs','raw-cdp-probe.cjs','stream-diagnostic.cjs','stream-diagnostic.test.cjs','consumer-probe.cjs','page-body-diagnostic.cjs','page-body-diagnostic.test.cjs','consumer-body-probe.cjs'):subprocess.run([NODE,'--check',R/'qa'/name],env=ENV,check=True,timeout=5)
 regression=subprocess.run([NODE,R/'qa/contracts.test.cjs',R],env=ENV,capture_output=True,text=True,timeout=20);assert regression.returncode==0,regression.stdout+regression.stderr
 # Recompute policy from frozen source, never trust a served manifest/cache list.
 import runpy
 assert M['bytePolicy']==runpy.run_path(str(R/'qa/byte-policy.py'))['from_sources'](R),'byte policy/source generation drift'
 for name in ('runner.py','qa/fixture.py','qa/static-guards.py','qa/byte-policy.py'):compile((R/name).read_text(),str(R/name),'exec')
 guard=subprocess.run([sys.executable,R/'qa/static-guards.py',R],env=ENV,capture_output=True,text=True,timeout=10);assert guard.returncode==0,guard.stdout+guard.stderr
 free=shutil.disk_usage(R).free;assert free>=3*1024**3,'3GiB execution free floor'
 return {'integrity':'verified','members':len(M['members']),'sourceCounts':M['counts'],'expectedCases':[c[0] for c in SELECTED],'caseBudgetSeconds':sum(c[3] for c in SELECTED),'browsersStarted':0,'fixturesStarted':0,'freeBytes':free,'playwright':resolved,'staticGuards':json.loads(guard.stdout),'seamRegressions':regression.stdout}
preflight=integrity()
streamtests=subprocess.run([NODE,R/'qa/stream-diagnostic.test.cjs'],env=ENV,capture_output=True,text=True,timeout=20);assert streamtests.returncode==0,streamtests.stdout+streamtests.stderr
preflight['streamRegressions']=streamtests.stdout
bodytests=subprocess.run([NODE,R/'qa/page-body-diagnostic.test.cjs'],env={**ENV,'R34_TRACE':str(R/'historical/r35/r34-consumer-probe.json')},capture_output=True,text=True,timeout=20);assert bodytests.returncode==0,bodytests.stdout+bodytests.stderr
preflight['pageBodyRegressions']=bodytests.stdout
if A.verify_only:print(json.dumps(preflight));sys.exit(0)
# This packet has no submission path; only the owning parent admits the sealed argv.
assert os.environ.get('WIZARD_WORKER_LANE')=='light','parent-admitted Forum light lane required'
OUT=R/'evidence';assert not OUT.exists(),'one-use immutable stage; preserve previous evidence';OUT.mkdir()
TMP=Path('/srv/work/wr24-'+A.manifest_sha[:12]);assert not TMP.exists(),'fresh short owned TMPDIR required';TMP.mkdir(mode=0o700)
ENV.update(TMPDIR=str(TMP),QA_R23_OWNED_ROOT=str(OUT))
report={'status':'incomplete','manifest_sha256':A.manifest_sha,'sources':M['sources'],'preflight':preflight,'cases':{},'historical':M['historical'],'releaseAllowed':False,'nativeAcceptance':False,'liveParityAcceptance':False,'visualReview':'PARENT_MUST_INSPECT_REAL_PNGS','freshBrowserAcceptance':False,'review_required':True,'freshIsolationAcceptance':False,'diagnosticOnly':True}
report.update(scope='isolation-only' if A.isolation_only else 'remaining-three-only' if A.remaining_only else 'all-ten',currentCaseAcceptance=False,freshRemainingBrowserAcceptance=False,historicalBrowserPasses=M.get('r29SourceEquivalence' if A.isolation_only else 'r28SourceEquivalence',{}).get('priorPassReports',{}),historicalPassesAreFresh=False)
fixture=child=None;overall=time.monotonic()+(210 if A.isolation_only else 830)
class DiagnosticDone(Exception):pass

def save():(OUT/'acceptance.json').write_text(json.dumps(report,indent=2)+'\n')
def stop(p):
 if p and p.poll() is None:
  try:os.killpg(p.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  try:p.wait(timeout=2)
  except subprocess.TimeoutExpired:
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   p.wait(timeout=2)
def processes():
 rows={};roots=set()
 for p in Path('/proc').iterdir():
  if not p.name.isdigit() or int(p.name) in (0,1,os.getpid()):continue
  try:
   if p.stat().st_uid!=os.getuid():continue
   pid=int(p.name);s=(p/'stat').read_text().split(') ',1)[1].split();ppid,pgid,start=int(s[1]),int(s[2]),s[19];argv=(p/'cmdline').read_bytes();env=(p/'environ').read_bytes();rows[pid]=(ppid,pgid,start)
   if str(OUT).encode() in argv or (str(R/'qa/browser.cjs').encode() in argv) or (str(R/'qa/fixture.py').encode() in argv) or ('QA_R23_OWNED_ROOT='+str(OUT)).encode()+b'\0' in env:roots.add(pid)
  except (OSError,ValueError):pass
 selected=set(roots)
 while True:
  new=selected|{pid for pid,(ppid,_,_) in rows.items() if ppid in selected}
  if new==selected:break
  selected=new
 return {pid:rows[pid][2] for pid in sorted(selected)}
def cleanup():
 selected=processes();stop(child);stop(fixture)
 for sig in (signal.SIGTERM,signal.SIGKILL):
  for pid,start in processes().items():
   try:
    current=(Path('/proc')/str(pid)/'stat').read_text().split(') ',1)[1].split()[19]
    if current==start:os.kill(pid,sig)
   except (OSError,ProcessLookupError):pass
  end=time.monotonic()+1.2
  while processes() and time.monotonic()<end:time.sleep(.1)
 remains=processes();return {'selectedPids':list(selected),'remainingPids':list(remains),'verified':not remains}
def interrupted(*_):raise KeyboardInterrupt('parent-admitted browser packet terminated')
signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
def case(identity,phase,width,cap,probe: bool | str=False):
 global fixture,child
 out=OUT/identity;out.mkdir();deadline=min(overall,time.monotonic()+cap)
 row={'status':'incomplete','phase':phase,'width':width,'capSeconds':cap}
 if probe:report['rawCDPProbe' if probe=='cdp' else 'observerProbe']=row
 else:report['cases'][identity]=row
 save()
 with (out/'fixture.log').open('w') as fl,(out/'browser.log').open('w') as bl:
  try:
   fixture=subprocess.Popen([sys.executable,R/'qa/fixture.py','--wisdom-source',R/'wisdom','--web',R/'ux/web','--cert',R/'rig-server.pem','--key',R/'rig-server.key'],cwd=R,env={**ENV,'QA_LOST_HIGHLIGHT':'1' if phase=='functional' else '0'},stdout=subprocess.PIPE,stderr=fl,text=True,start_new_session=True)
   with selectors.DefaultSelector() as sel:
    sel.register(fixture.stdout,selectors.EVENT_READ);assert sel.select(timeout=min(12,deadline-time.monotonic())),'fixture readiness timeout';line=fixture.stdout.readline();assert line,'fixture exited before readiness';info=json.loads(line)
   (out/'fixture.json').write_text(json.dumps(info,indent=2));assert info['synthetic'] and info['url'].startswith('https://localhost:') and info['url'].endswith('/wizard-os-home/?app-session=wisdom')
   child=subprocess.Popen([NODE,R/'qa'/('consumer-body-probe.cjs' if probe=='consumer' else 'raw-cdp-probe.cjs' if probe=='cdp' else 'observer-probe.cjs' if probe else 'browser.cjs')],cwd=R,env={**ENV,'QA_OUT':str(out),'QA_URL':info['url'],'QA_PHASE':phase,'QA_WIDTH':str(width)},stdout=bl,stderr=subprocess.STDOUT,start_new_session=True)
   try:rc=child.wait(timeout=max(1,deadline-time.monotonic()-5))
   except subprocess.TimeoutExpired:row['timeout']=True;raise RuntimeError('externally bounded browser case timeout')
   if probe=='consumer':
    r=json.loads((out/'consumer-probe.json').read_text());assert rc==0 and r['status']=='pass' and r['unfinishedRefused'] and r['goodBodyValid'] and [x['mode'] for x in r['results']]==['good','wrong','empty']
    row.update(status='pass',report=str((out/'consumer-probe.json').relative_to(R)),sha256=sha(out/'consumer-probe.json'));return
   if probe=='cdp':
    r=json.loads((out/'raw-cdp-probe.json').read_text());assert rc==0 and r['status']=='pass' and [x['actual'] for x in r['reports']]==['RAW-PASS','RAW-UNFINISHED']
    row.update(status='pass',report=str((out/'raw-cdp-probe.json').relative_to(R)),sha256=sha(out/'raw-cdp-probe.json'));return
   if probe:
    r=json.loads((out/'observer-probe.json').read_text());assert rc==0 and r['status']=='pass' and [x['mode'] for x in r['reports']]==['good','empty','wrong','stale','plain-empty'],'independent byte observer protocol gate'
    row.update(status='pass',report=str((out/'observer-probe.json').relative_to(R)),sha256=sha(out/'observer-probe.json'));return
   row['exitCode']=rc;r=json.loads((out/'report.json').read_text());assert rc==0 and r['status']=='pass',str(r.get('error','browser failed'))
   assert r['sourceManifest']==A.manifest_sha and r['sources']==M['sources'] and r['phase']==phase and r['viewport']==width
   required={'functional':['onlineCatalogFontsArt','offlineColdEntry','offlineReader','offlineWritesDurable','strictCommitTelemetry','secondProcessDeathRetained','siblingWorkerPreserved','exactlyOnceReplay','quotaInlineAfterDomReplacement'],'presentation':['liveSkins','hostBack','standaloneFallback'],'strict-quota':['quietFailure'],'strict-unsupported':['quietFailure'],'boot-read-fail':['bootFailure'],'boot-strict-unsupported':['bootFailure'],'boot-open-unsupported':['bootFailure'],'isolation':['nonWisdomIsolation']}[phase]
   assert all(r['checks'].get(k) for k in required),'missing required acceptance checks'
   if phase=='functional' and width<600:assert r['checks']['trustedTouchEvents']>=2 and r['checks']['trustedOnePageTouch']
   delivered=r['servedAssets'];must=['ux/web/core/offline-kit.js','ux/web/core/home-screen-policy.js','ux/web/core/single-app-session.js','wisdom/static/offline.js','wisdom/static/app.js']
   assert all(k in delivered and delivered[k]==M['members'][k]['sha256'] for k in must),'missing fresh served source hashes'
   if phase=='presentation':
    assert len(r['checks']['liveSkins'])==3
    for name in ['skin-0-obsidian.png','skin-1-obsidian-light.png','skin-2-obsidian.png','standalone-dark-fallback.png']:assert (out/name).is_file() and (out/name).stat().st_size>10000
   row.update(status='pass',report=str((out/'report.json').relative_to(R)),sha256=sha(out/'report.json'),checks=list(r['checks']))
  except BaseException as e:
   row.update(status='failed',errorType=type(e).__name__,error=str(e));(out/'failure.txt').write_text(traceback.format_exc())
   if isinstance(e,(KeyboardInterrupt,SystemExit)):raise
  finally:
   row['cleanup']=cleanup();child=fixture=None
   if not row['cleanup']['verified']:row['status']='failed';row['cleanupFailure']=True
   save()
try:
 save()
 if A.isolation_only:
  # Frozen actual protocol passes inherited by exact hash, never rerun.
  report['inheritedProtocolPasses']=M['r34Diagnostic']['inheritedProtocolPasses']
  case('consumer-probe','consumer-probe',390,60,probe='consumer')
  assert report['observerProbe']['status']=='pass' and report['observerProbe']['cleanup']['verified'],'new stream canary failed; no isolation admission'
 else:
  raise RuntimeError('R34 permits selected isolation diagnostic only')
 for entry in CASES:
  if entry not in SELECTED:continue
  if time.monotonic()>=overall:report['cases'][entry[0]]={'status':'not-run-budget-exhausted'};save();continue
  case(*entry)
  if any(r.get('cleanupFailure') for r in report['cases'].values()):raise RuntimeError('owned cleanup failed; refusing later launches')
 assert len(report['cases'])==len(SELECTED) and set(report['cases'])=={c[0] for c in SELECTED}
 report['sourceIntegrityAfter']=integrity()['integrity']
 report['currentCaseAcceptance']=all(c['status']=='pass' for c in report['cases'].values())
 report['freshBrowserAcceptance']=report['currentCaseAcceptance'] and not (A.remaining_only or A.isolation_only)
 report['freshRemainingBrowserAcceptance']=report['currentCaseAcceptance'] and (A.remaining_only or A.isolation_only)
 report['status']=('passed-fresh-isolation-plus-nine-historical' if A.isolation_only else 'passed-fresh-remaining-three-pending-parent-visual-review' if A.remaining_only else 'passed-fresh-browser-pending-parent-visual-review') if report['currentCaseAcceptance'] else 'failed-browser-cases'
except DiagnosticDone:report.update(status='diagnostic-only-'+report['rawCDPProbe']['status'],scope='raw-canary-diagnostic-only',diagnosticOnly=True)
except BaseException as e:report.update(status='failed',errorType=type(e).__name__,error=str(e));(OUT/'runner-failure.txt').write_text(traceback.format_exc())
finally:
 report.update(review_required=True,releaseAllowed=False,freshIsolationAcceptance=False,currentCaseAcceptance=False,freshBrowserAcceptance=False,freshRemainingBrowserAcceptance=False,diagnosticOnly=True)
 report['cleanup']=cleanup();report['artifacts']={str(p.relative_to(R)):{'sha256':sha(p),'bytes':p.stat().st_size} for p in OUT.rglob('*') if p.is_file() and p.name!='acceptance.json' and 'profile' not in p.relative_to(OUT).parts};save()
print(json.dumps({'status':report['status'],'cases':{k:v['status'] for k,v in report['cases'].items()},'cleanup':report['cleanup'],'receipt':str(OUT/'acceptance.json')}))
sys.exit(0 if report['currentCaseAcceptance'] and report['cleanup']['verified'] else 1)
