#!/usr/bin/env python3
"""R36 candidate-only native with inherited exact controls; --verify-only never starts a runtime."""
import argparse,hashlib,importlib.util,json,os,shutil,signal,subprocess as sp,sys,tarfile,time
from pathlib import Path
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parent
FALSE=dict(nativeAcceptance=False,releaseAllowed=False,liveParityAcceptance=False,visualAcceptance=False,ordinaryPathAcceptance=False)
def interrupted(*_):raise KeyboardInterrupt('parent-admitted R36 interrupted; unwind owned native driver')
signal.signal(signal.SIGTERM,interrupted)
def sha(p):return hashlib.file_digest(Path(p).open('rb'),'sha256').hexdigest()
def read(p):return json.loads(Path(p).read_text())
def write(p,x):Path(p).write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def run(a,**kw):
 timeout=kw.pop('timeout',60)
 if PHASE_END is not None:timeout=max(.01,min(timeout,PHASE_END-time.monotonic()))
 return sp.run(list(map(str,a)),check=True,timeout=timeout,**kw)
BUDGET=dict(build=180,normal=2200,cleanup=120,prepost=100)
assert sum(BUDGET.values())==2600
CANDIDATE='a1ac47d04093377f94540a379c46f1dc01e6ce97'
CONTROL='ec5c5f1df4165383113e534f1f773f7c5305e154'
DRIVER='dfcb7278757f84716a735812c9daf975d83782ccd1c2167ce7efee44455679cb'
PHASE_END=None
def alarm(*_):raise TimeoutError('R36 bounded phase deadline')
def phase(seconds):
 global PHASE_END
 PHASE_END=time.monotonic()+seconds
 signal.signal(signal.SIGALRM,alarm);signal.setitimer(signal.ITIMER_REAL,seconds)
def endphase():signal.setitimer(signal.ITIMER_REAL,0)
def supervise(proc,cap,grace=20):
 # SIGTERM to the exact driver FIRST preserves its original finally handler.
 try:return proc.wait(timeout=cap)
 finally:
  if proc.poll() is None:
   proc.terminate()
   try:proc.wait(timeout=grace)
   except sp.TimeoutExpired:pass
  # Driver-owned descendants share this new session; never kill global adb.
  try:os.killpg(proc.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  until=time.monotonic()+min(5,grace)
  while time.monotonic()<until:
   try:os.killpg(proc.pid,0)
   except ProcessLookupError:break
   time.sleep(.05)
  try:os.killpg(proc.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  if proc.poll() is None:proc.wait(timeout=5)
def verify(d):
 assert sha(R/'source-manifest.json')==d,'manifest digest mismatch'
 m=read(R/'source-manifest.json');assert m['acceptance']==FALSE
 assert m['candidate']==CANDIDATE and m['control']==CONTROL,'wrong candidate/base'
 assert m['budget']==BUDGET and m['budget_provenance']=='RESTORE_ORIGINAL_R24_NORMAL_CAP2200'
 assert m['control_image']=='sha256:d59436fbb13ebc55627b3e84167b61e82262a357d807c73242dc16af12bf1eb4','image alias rejected'
 assert sha(R/'template/native-flight.py')==DRIVER
 assert 'rc=proc.wait(timeout=2200)' in (R/'historical/run-native-r24.py').read_text().splitlines()[182]
 diag=read(R/'historical/r33-deadline-evidence.json')
 assert diag['original_failure_preserved']['status']=='failed'
 for n,h in m['external_members'].items():assert sha(n)==h,n
 for n,rows in diag['source_closure_comparison'].items():
  assert len(set(rows.values()))==1 and sha(R/'template'/n)==next(iter(rows.values())),n
 for prefix,row in m['inventories'].items():
  actual={str(p.relative_to(R/prefix)):sha(p) for p in sorted((R/prefix).rglob('*')) if p.is_file()}
  assert actual==row['files'] and len(actual)==row['count'],prefix
 audit=read(R/'control-fullsource-audit.json');assert audit['actual_files']==audit['expected_files']==61 and not audit['extra'] and not audit['mismatches']
 for n,h in audit['files'].items():assert sha(R/'template/wisdom'/n)==h,n
 assert sha(R/'historical/reader-boundary.json')==diag['historical_normal']['sha256']
 assert sha(R/'historical/diagnostic-r25.json')==diag['historical_reciprocal']['sha256']
 for n,h in m['members'].items():assert sha(R/n)==h,n
 for prefix in ('template','candidate'):
  assert {str(p.relative_to(R)) for p in (R/prefix).rglob('*') if p.is_file()}=={n for n in m['members'] if n.startswith(prefix+'/')},'source closure '+prefix
 assert sha(R/'template/current-release.apk')==m['apk']['sha256']
 return m
def inspect(image):return json.loads(sp.check_output(['docker','image','inspect',image],timeout=20))[0]
def arm(m):
 root=R/'runs/candidate-normal';shutil.copytree(R/'template',root)
 shutil.rmtree(root/'wisdom');shutil.copytree(R/'candidate',root/'wisdom')
 native=read(root/'source-manifest.json');native['wisdom_candidate']=m['candidate'];write(root/'source-manifest.json',native)
 write(root/'arm-inputs.json',{'source':m['candidate'],'diagnostic':False,'driver':DRIVER,'members':{str(p.relative_to(root)):sha(p) for p in root.rglob('*') if p.is_file()}})
 assert sha(root/'native-flight.py')==DRIVER
 ports_free()
 with (R/'evidence/candidate-normal.log').open('w') as log:
  proc=sp.Popen([sys.executable,'-B',R/'native-entry-r36.py',root/'native-flight.py',DRIVER,str(BUDGET['normal'])],cwd=root,env={**os.environ,'PIN_ANDROID_SDK':'/srv/work/android-sdk','PYTHONDONTWRITEBYTECODE':'1'},stdout=log,stderr=sp.STDOUT,start_new_session=True)
  write(R/'evidence/owned-process.json',{'driver_pid':proc.pid,'process_group':proc.pid,'normal_cap':2200})
  try:rc=supervise(proc,2200)
  finally:
   ports_free()
   # Process-group absence supplements exact-driver cleanup evidence.
   try:os.killpg(proc.pid,0)
   except ProcessLookupError:pass
   else:raise AssertionError('owned process group remains')
 result=read(root/'evidence/native/acceptance.json')
 assert all(result['cleanup'][k] for k in ('emulator_stopped','fixture_stopped','adb_server_stopped','emulator_ports_closed'))
 for n,h in read(root/'arm-inputs.json')['members'].items():assert sha(root/n)==h,n
 return root,result,rc

def ports_free():
 import socket
 for port in (28543,5147,6169,6170):
  with socket.socket() as sock:
   assert sock.connect_ex(('127.0.0.1',port))!=0,('owned fixture/adb/emulator port remains or occupied',port)

def totals(root):
 d=read(root/'evidence/native/diagnostic-r25.json');names=('initial-text-before-highlight','larger','original-setting-restored','cold-after-restored-setting')
 vals=[]
 for name in names:
  frames=d[name]['frames'];assert len(frames)==3
  pairs=[f['pair'] for f in frames];assert pairs[0]==pairs[1]==pairs[2]
  vals.append(pairs[0][1])
 return vals

def package(m):
 out=R/'evidence';image='wisdom-r36-diagnostic:'+m['candidate'][:12]
 dockerfile=R/'Dockerfile.r36';iid=out/'candidate.iid'
 with (out/'build.log').open('w') as log:run(['docker','build','--network=none','--pull=false','--iidfile',iid,'-t',image,'-f',dockerfile,R],timeout=120,stdout=log,stderr=sp.STDOUT)
 image=iid.read_text().strip();current=inspect(image);old=inspect(m['control_image'])
 assert current['RootFS']['Layers'][:len(old['RootFS']['Layers'])]==old['RootFS']['Layers']
 for k,v in old['Config'].items():
  if k not in ('Labels','Image'):assert current['Config'][k]==v,('config drift',k)
 expected_labels={**old['Config']['Labels'],'org.opencontainers.image.revision':m['candidate'],'org.wizard.source.sha':m['candidate'],'io.wizard.diagnostic.only':'true'}
 assert current['Config']['Labels']==expected_labels
 cid=None
 try:
  cid=sp.check_output(['docker','create',image],text=True,timeout=20).strip()
  with (out/'app.tar').open('wb') as f:run(['docker','cp',cid+':/app','-'],stdout=f)
  with tarfile.open(out/'app.tar') as t:
   actual={str(Path(x.name).relative_to('app')):hashlib.sha256(t.extractfile(x).read()).hexdigest() for x in t if x.isfile()}
  expected={str(p.relative_to(R/'candidate')):sha(p) for p in (R/'candidate').rglob('*') if p.is_file()}
  assert actual==expected,'full runtime /app source closure mismatch'
 finally:
  if cid:run(['docker','rm',cid])
 write(out/'image-identity.json',dict(id=image,source=m['candidate'],app_members=actual,inspect=current,fixture_source_inventory=m['inventories']['candidate'],control_archive_sha256=m['external_members'][m['control_archive']],releaseAllowed=False))
 return image

def main():
 p=argparse.ArgumentParser();p.add_argument('--manifest-sha',required=True);p.add_argument('--verify-only',action='store_true');a=p.parse_args()
 pre=time.monotonic();phase(100)
 m=verify(a.manifest_sha)
 control=read(R/'control-image-identity.json');assert sha(m['control_archive'])==control['tar_sha256']
 with tarfile.open(m['control_archive']) as archive:
  index=json.load(archive.extractfile('manifest.json'));assert len(index)==1
  config_bytes=archive.extractfile(index[0]['Config']).read();config=json.loads(config_bytes)
  assert 'sha256:'+hashlib.sha256(config_bytes).hexdigest()==m['control_image']
  assert config['rootfs']['diff_ids']==control['rootfs']['Layers'] and config['config']['Labels']==control['labels']
 # Source-only: hash the pinned SDK files directly; do not run emulator -help.
 pin=read(R/'template/proof/renderer-preflight-r14.json')
 for n,h in pin['host_inputs'].items():assert sha(n)==h,n
 endphase();pre_used=time.monotonic()-pre
 if a.verify_only:print(json.dumps(dict(status='verified-source-only',members=len(m['members']),budget=m['budget'],runtimes_started=0,**FALSE)));return
 fd=int(os.environ.get('WIZARD_HEAVY_LOCK_FD','-1'));assert fd>=3 and os.environ.get('WIZARD_WORKER_LANE')=='heavy','parent heavy admission required'
 st=os.fstat(fd);canonical=Path('/srv/work/heavy/production/worker.lock').stat();assert (st.st_dev,st.st_ino)==(canonical.st_dev,canonical.st_ino)
 import fcntl
 probe="import fcntl,sys;f=open(sys.argv[1]);\ntry:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError:sys.exit(0)\nsys.exit(1)"
 run([sys.executable,'-c',probe,'/srv/work/heavy/production/worker.lock']);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 assert not (R/'evidence').exists() and not (R/'runs').exists(),'one-use stage'
 assert shutil.disk_usage(R).free>=200*1024**3
 ports_free();(R/'evidence').mkdir();(R/'runs').mkdir()
 report=dict(status='failed',manifest_sha256=a.manifest_sha,normalCandidateChecksPassed=False,inherited_controls=m['inherited_controls'],r33_failed_control_preserved=True,**FALSE)
 try:
  phase(180)
  try:loaded=inspect(m['control_image'])
  except sp.CalledProcessError:
   with (R/'evidence/control-image-load.log').open('w') as log:run(['docker','load','-i',m['control_archive']],stdout=log,stderr=sp.STDOUT,timeout=90)
   loaded=inspect(m['control_image'])
  assert loaded['RootFS']==control['rootfs'] and loaded['Config']['Labels']==control['labels']
  report['candidate_image']=package(m);endphase()
  root,c,rc=arm(m)
  assert rc==0 and c['status']=='passed-needs-visual-inspection' and c['checks'] and all(x['pass'] is True for x in c['checks']),'STOP candidate failed unchanged native gates; no repeated font patches'
  # Recompute mandatory exact native RGB evidence, not just the footer or PASS text.
  phase(max(.01,100-pre_used))
  sys.path.insert(0,str(root));import reader_boundary_r17,renderer_r14,egress_r15,pin_contract_r19
  out=root/'evidence/native'
  assert reader_boundary_r17.verify_evidence(out,c['checks'])
  assert renderer_r14.verify_evidence(out,c['graphics'])
  assert egress_r15.verify_evidence(out,c['checks'])
  assert pin_contract_r19.verify_evidence(out,c['origin'])
  gate_spec=importlib.util.spec_from_file_location('native_gate',root/'verify-inheritance.py');gate=importlib.util.module_from_spec(gate_spec);gate_spec.loader.exec_module(gate)
  report['native_gate']=gate.verify_native(root,read(root/'source-manifest.json'))
  b=read(out/'reader-boundary.json')
  for name in ('prekill','restored','home_prekill','home_restored'):assert b[name]['frames'][-1]['pair']==[5,15]
  report['normalCandidateChecksPassed']=True;report['status']='diagnostic-normal-candidate-passed-parent-adjudication-required'
 except BaseException as e:report['failure']=repr(e)
 finally:
  endphase();phase(90)  # <=30s owned-process unwind + <=90s seal/ports = cleanup <=120
  try:ports_free();verify(a.manifest_sha)
  except BaseException as e:report['cleanup_or_seal_failure']=repr(e);report['normalCandidateChecksPassed']=False;report['status']='failed'
  finally:endphase();report['finished_at']=time.time();write(R/'evidence/acceptance.json',report);print(json.dumps(report,indent=2))
 if not report['normalCandidateChecksPassed']:raise SystemExit(1)
if __name__=='__main__':main()
