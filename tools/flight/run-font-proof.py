#!/usr/bin/env python3
"""Bounded parent-only Forum browser job; --preflight-only NEVER starts a browser.
Reuse existing synthetic TLS fixture; no Docker/APK/VM/install/live writes.
"""
import argparse,hashlib,json,os,selectors,signal,subprocess,sys,time,traceback
from pathlib import Path
R=Path(__file__).resolve().parent
P=argparse.ArgumentParser();P.add_argument('--manifest-sha',required=True);P.add_argument('--preflight-only',action='store_true');A=P.parse_args()
M=json.loads((R/'source-manifest.json').read_text())
NODE='/srv/work/node22/bin/node'
PW='/srv/work/provider-signin-browser/node_modules/playwright'
CHROME='/home/james/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
ENV={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PLAYWRIGHT_DIR':PW,'PLAYWRIGHT_BROWSERS_PATH':'/home/james/.cache/ms-playwright','QA_CHROME':CHROME,'QA_MANIFEST':str(R/'source-manifest.json'),'TMPDIR':str(R/'tmp')}

def integrity():
 assert sha(R/'source-manifest.json')==A.manifest_sha,'manifest hash differs'
 for name,row in M['members'].items():
  p=R/name;assert p.is_file() and not p.is_symlink() and sha(p)==row['sha256'],'staged member drift: '+name
 for root in ['old','candidate','web']:
  actual={str(p.relative_to(R)) for p in (R/root).rglob('*') if p.is_file() or p.is_symlink()}
  expected={n for n in M['members'] if n.startswith(root+'/')};assert actual==expected,'source closure differs: '+root
 assert M['old_commit']=='a800c16c81b520150ec72721eb79613b242169e8'
 assert M['candidate_commit']=='e45fea79102a66093a50fb8405340327d13b7364'
 assert json.loads((Path(PW)/'package.json').read_text())['version']=='1.64.1'
 assert os.access(CHROME,os.X_OK) and sha(CHROME)==M['toolchain']['chrome_sha256'],'pinned Chrome differs'
 for name,row in M['toolchain']['files'].items():assert sha(name)==row,'pinned toolchain differs: '+name
 r=subprocess.run([NODE,'-e','const p=require(process.env.PLAYWRIGHT_DIR);console.log(JSON.stringify({version:require(process.env.PLAYWRIGHT_DIR+"/package.json").version,executable:p.chromium.executablePath()}))'],env=ENV,text=True,capture_output=True,timeout=15,check=True)
 tool=json.loads(r.stdout);assert tool=={'version':'1.64.1','executable':CHROME}
 ldd=subprocess.run(['ldd',CHROME],capture_output=True,text=True,timeout=15,check=True);assert 'not found' not in ldd.stdout+ldd.stderr
 return {'integrity':'pass','members':len(M['members']),'toolchain':tool,'chrome_sha256':sha(CHROME),'browsers_started':0}

preflight=integrity()
if A.preflight_only:
 print(json.dumps(preflight));sys.exit(0)
OUT=R/'evidence';assert not OUT.exists(),'one-use stage: preserve prior evidence; restage to rerun'
OUT.mkdir();(R/'tmp').mkdir(exist_ok=True)
report={'status':'failed','scope':'source-bound real-font browser ONLY','manifest_sha256':A.manifest_sha,'preflight':preflight,'groups':{},'releaseAllowed':False,'nativeAcceptance':False}
fixture=None;child=None

def save(): (OUT/'acceptance.json').write_text(json.dumps(report,indent=2)+'\n')
def stop(p):
 if p and p.poll() is None:
  os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=8)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=8)

def marker_processes():
 # Never inspect arbitrary process environments or persist foreign argv. Select
 # only same-UID processes bearing this stage's unique profile/TMPDIR marker.
 found=[]
 for root in Path('/proc').iterdir():
  if not root.name.isdigit() or int(root.name) in (0,1,os.getpid()):continue
  try:
   if root.stat().st_uid!=os.getuid():continue
   argv=(root/'cmdline').read_bytes();env=(root/'environ').read_bytes()
   if (str(R/'evidence')+'/').encode() in argv or ('TMPDIR='+str(R/'tmp')).encode()+b'\0' in env:found.append(int(root.name))
  except (FileNotFoundError,PermissionError,ProcessLookupError):pass
 return found

def cleanup():
 stop(child);stop(fixture)
 selected=marker_processes()
 for sig in (signal.SIGTERM,signal.SIGKILL):
  for pid in marker_processes():
   try:os.kill(pid,sig)
   except ProcessLookupError:pass
  deadline=time.monotonic()+4
  while marker_processes() and time.monotonic()<deadline:time.sleep(.1)
 remains=marker_processes();return {'selected_pids':selected,'remaining_pids':remains,'verified':not remains}

def signal_stop(*_):raise KeyboardInterrupt('admitted job terminated')
signal.signal(signal.SIGTERM,signal_stop);signal.signal(signal.SIGINT,signal_stop)

def group(arm,width,height):
 global fixture,child
 name=f'{arm}-{width}x{height}';out=OUT/name;out.mkdir()
 with (out/'fixture.log').open('w') as fixture_log,(out/'browser.log').open('w') as browser_log:
  try:
   fixture=subprocess.Popen([sys.executable,R/'fixture.py','--wisdom-source',R/arm,'--web',R/'web','--cert',R/'rig-server.pem','--key',R/'rig-server.key'],cwd=R,env=ENV,stdout=subprocess.PIPE,stderr=fixture_log,text=True,start_new_session=True)
   assert fixture.stdout is not None
   with selectors.DefaultSelector() as sel:
    sel.register(fixture.stdout,selectors.EVENT_READ);assert sel.select(timeout=20),'fixture readiness timeout'
    line=fixture.stdout.readline();assert line,'fixture exited before readiness';info=json.loads(line)
   assert info['synthetic'] is True and info['url'].startswith('https://localhost:'),'isolated TLS fixture only'
   (out/'fixture.json').write_text(json.dumps(info,indent=2))
   base=info['url'].split('/wizard-os-home/')[0]+'/wisdom/'
   env={**ENV,'QA_OUT':str(out),'QA_URL':base,'QA_ARM':arm,'QA_WIDTH':str(width),'QA_HEIGHT':str(height)}
   child=subprocess.Popen([NODE,R/'font-proof.cjs'],cwd=R,env=env,stdout=browser_log,stderr=subprocess.STDOUT,start_new_session=True)
   try:rc=child.wait(timeout=175)
   except subprocess.TimeoutExpired:stop(child);raise RuntimeError('bounded browser group timed out')
   result=json.loads((out/'report.json').read_text());return {'exit_code':rc,'report':str((out/'report.json').relative_to(R)),'sha256':sha(out/'report.json'),'result':result}
  finally:
   clean=cleanup();child=fixture=None
   (out/'cleanup.json').write_text(json.dumps(clean,indent=2));assert clean['verified'],'owned browser/fixture process survived cleanup'

try:
 deadline=time.monotonic()+780
 # Independent arms/viewports survive a negative old-source assertion. Every
 # checkpoint is saved before assertions; setup failures are never expected-red.
 for width,height in M['viewports']:
  for arm in ['old','candidate']:
   name=f'{arm}-{width}x{height}'
   try:
    assert time.monotonic()<deadline,'browser proof deadline exceeded';report['groups'][name]=group(arm,width,height)
   except Exception as e:report['groups'][name]={'status':'infrastructure-or-incomplete','error':str(e),'traceback':traceback.format_exc()}
   save()
 old_red=[];candidate_failures=[];cases=[]
 for width,height in M['viewports']:
  key=f'{width}x{height}';old=report['groups']['old-'+key].get('result',{});new=report['groups']['candidate-'+key].get('result',{})
  for arm,group_result in [('old',old),('candidate',new)]:
   for case in ['warm','untouched','turn-pending','replaced-reader','offline']:
    row=group_result.get('cases',{}).get(case,{});cases.append({'arm':arm,'viewport':key,'case':case,'status':row.get('status','not-run')})
  if new.get('status')!='pass':candidate_failures.append(key)
  old_warm=old.get('cases',{}).get('warm',{}).get('reference');new_warm=new.get('cases',{}).get('warm',{}).get('reference')
  if not old_warm or not new_warm or any(old_warm[k]!=new_warm[k] for k in ['count','localRaw','firstVisible','bodyTextSHA']):candidate_failures.append(key+': warm A/B reference differs or missing')
  lane=old.get('cases',{}).get('untouched',{});s=lane.get('final',{});pending=lane.get('pending',{})
  # Specific old-source negative control: actual real font loaded, still stale
  # footer/columnCount, with observed ready resolution before held-font release.
  binding=[a for a in pending.get('readyAccesses',[]) if a.get('bindReader')]
  if s.get('fonts',{}).get('checkText') and s.get('fonts',{}).get('status')=='loaded' and s.get('total')!=s.get('measuredTotal') and lane.get('before',{}).get('firstResolved') and binding and any(a['alreadyResolved'] or any(e['event']=='ready-resolved' and e.get('id')==a['id'] for e in pending.get('fontEvents',[])) for a in binding) and lane.get('deliveries'):
   old_red.append({'viewport':key,'footer':s['count'],'freshMeasuredTotal':s['measuredTotal'],'declaredColumns':s['declaredColumns'],'measuredColumns':s['measuredColumns'],'actualFraction':s['localRaw'],'firstVisible':s['firstVisible']})
 report.update(cases=cases,enumeratedCaseCount=len(cases),expectedCaseCount=20,oldStaleSentinel=old_red,candidateFailures=candidate_failures)
 assert len(cases)==20
 report['historicalNativePosition']={'savedPair':'5/13','restoredPair':'5/15','sameFractionIfSavedPageExact':str(4/12),'restoreAt15IfSameFractionPage':round((4/12)*14)+1,'fractionIntervalForObservedRestored5of15':[3.5/14,4.5/14],'status':'UNRESOLVED: historical pre-kill localStorage/outbox/body pixels were not captured; browser results do not invent them'}
 if candidate_failures:raise AssertionError('candidate failed or incomplete: '+repr(candidate_failures))
 if not old_red:
  report['status']='indeterminate-not-reproduced';raise AssertionError('old exact source did not demonstrate real-font stale-sentinel failure; NOT a pass')
 report['status']='browser-proof-pass-native-still-blocked'
except BaseException as e:
 report['error']=str(e);report['traceback']=traceback.format_exc()
finally:
 report['cleanup']=cleanup()
 try:integrity();report['sourceIntegrityAfter']='pass'
 except Exception as e:report['sourceIntegrityAfter']=str(e);report['status']='failed'
 if not report['cleanup']['verified']:report['status']='failed'
 # Hash all evidence (except this index and receipt itself) for parent readback.
 report['artifacts']={str(p.relative_to(R)):{'sha256':sha(p),'bytes':p.stat().st_size} for p in OUT.rglob('*') if p.is_file() and p.name!='acceptance.json' and not any(x.startswith('profile-') for x in p.relative_to(OUT).parts)}
 save();print(json.dumps({'status':report['status'],'groups':len(report['groups']),'manifest_sha256':A.manifest_sha,'receipt':str(OUT/'acceptance.json'),'releaseAllowed':False,'nativeAcceptance':False}))
 sys.exit(0 if report['status']=='browser-proof-pass-native-still-blocked' else 1)
