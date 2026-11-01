#!/usr/bin/env python3
"""R33 parent-only native A/B; --verify-only never starts a runtime."""
import argparse,hashlib,importlib.util,json,os,shutil,signal,subprocess as sp,sys,tarfile,time
from pathlib import Path
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parent
FALSE=dict(nativeAcceptance=False,releaseAllowed=False,liveParityAcceptance=False,visualAcceptance=False,ordinaryPathAcceptance=False)
def sha(p):return hashlib.file_digest(Path(p).open('rb'),'sha256').hexdigest()
def read(p):return json.loads(Path(p).read_text())
def write(p,x):Path(p).write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def run(a,**kw):return sp.run(list(map(str,a)),check=True,timeout=kw.pop('timeout',60),**kw)
def verify(d):
 assert sha(R/'source-manifest.json')==d,'manifest digest mismatch'
 m=read(R/'source-manifest.json');assert m['acceptance']==FALSE
 for n,h in m['members'].items():assert sha(R/n)==h,n
 for prefix in ('template','candidate'):
  assert {str(p.relative_to(R)) for p in (R/prefix).rglob('*') if p.is_file()}=={n for n in m['members'] if n.startswith(prefix+'/')},'source closure '+prefix
 assert sha(R/'template/current-release.apk')==m['apk']['sha256']
 return m
def inspect(image):return json.loads(sp.check_output(['docker','image','inspect',image],timeout=20))[0]
def arm(name,candidate,m,diagnostic=False):
 root=R/'runs'/name;shutil.copytree(R/'template',root)
 if candidate:shutil.rmtree(root/'wisdom');shutil.copytree(R/'candidate',root/'wisdom')
 # Every arm receives a separate wipe-data AVD/profile; exact unmodified APK.
 native=read(root/'source-manifest.json');native['wisdom_candidate']=m['candidate'] if candidate else m['control'];write(root/'source-manifest.json',native)
 if diagnostic:
  src=(root/'native-flight.py').read_text();needle="    textnode=next((n for n in nodes() if 'Quiet attention begins' in label(n) and bounds(n)),None)"
  assert src.count(needle)==1
  src=src.replace(needle,"    import diagnostic_ui_r25\n    diagnostic_ui_r25.run(globals())\n    result['status']='diagnostic-only-complete'\n    raise SystemExit(0)\n"+needle)
  # SystemExit still runs owned finally; keep all acceptance fields false.
  src=src.replace("    result['passed']=sum(c['pass'] for c in checks);", "    result.update("+repr(FALSE)+");\n    result['passed']=sum(c['pass'] for c in checks);")
  end="sys.exit(0 if result['status']=='passed-needs-visual-inspection' else 1)";assert src.count(end)==1
  src=src.replace(end,"sys.exit(0 if result['status']=='diagnostic-only-complete' else 1)")
  (root/'native-flight.py').write_text(src);shutil.copyfile(R/'diagnostic_ui_r25.py',root/'diagnostic_ui_r25.py')
 # Bind the actual executed input closure, including QA-only transformed driver.
 write(root/'arm-inputs.json',{'source':native['wisdom_candidate'],'diagnostic':diagnostic,'members':{str(p.relative_to(root)):sha(p) for p in root.rglob('*') if p.is_file()}})
 with (R/'evidence'/(name+'.log')).open('w') as log:
  proc=sp.Popen([sys.executable,'-B',root/'native-flight.py'],cwd=root,env={**os.environ,'PIN_ANDROID_SDK':'/srv/work/android-sdk','PYTHONDONTWRITEBYTECODE':'1'},stdout=log,stderr=sp.STDOUT)
  try:proc.wait(timeout=240)
  finally:
   if proc.poll() is None:
    proc.terminate()
    try:proc.wait(timeout=65)
    except sp.TimeoutExpired:proc.kill();proc.wait(timeout=10)
 result=read(root/'evidence/native/acceptance.json');assert result['cleanup']['emulator_stopped'] and result['cleanup']['adb_server_stopped'] and result['cleanup']['emulator_ports_closed']
 # Input closure excludes only its own receipt and runtime-created files.
 for n,h in read(root/'arm-inputs.json')['members'].items():assert sha(root/n)==h,n
 return root,result,proc.returncode

def totals(root):
 d=read(root/'evidence/native/diagnostic-r25.json');names=('initial-text-before-highlight','larger','original-setting-restored','cold-after-restored-setting')
 vals=[]
 for name in names:
  frames=d[name]['frames'];assert len(frames)==3
  pairs=[f['pair'] for f in frames];assert pairs[0]==pairs[1]==pairs[2]
  vals.append(pairs[0][1])
 return vals

def package(m):
 out=R/'evidence';image='wisdom-r33-diagnostic:'+m['candidate'][:12]
 dockerfile=R/'Dockerfile.r33';iid=out/'candidate.iid'
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
 with (out/'candidate-image.tar').open('wb') as f:run(['docker','save',image],stdout=f,timeout=90)
 write(out/'image-identity.json',dict(id=image,archive_sha256=sha(out/'candidate-image.tar'),source=m['candidate'],app_members=actual,inspect=current,runtipi_config_sha256=sha(R/'candidate/runtipi/config.json'),runtipi_compose_sha256=sha(R/'candidate/runtipi/docker-compose.yml'),runtipi_alignment='Original .35 install metadata preserved, diagnostic image NOT published or installable; no replacement production alias',releaseAllowed=False))
 return image

def main():
 p=argparse.ArgumentParser();p.add_argument('--manifest-sha',required=True);p.add_argument('--verify-only',action='store_true');a=p.parse_args();m=verify(a.manifest_sha)
 current=inspect(m['control_image']);assert current['Id']==m['control_image']
 control=read(R/'control-image-identity.json');assert current['RootFS']==control['rootfs'] and current['Config']['Labels']==control['labels']
 assert sha(m['control_archive'])==control['tar_sha256']
 # Exact renderer/toolchain checks are metadata only; no emulator is started.
 sys.path.insert(0,str(R/'template'));import renderer_r14
 observed=renderer_r14.preflight('/srv/work/android-sdk');pinned=read(R/'template/proof/renderer-preflight-r14.json')
 assert observed['host_inputs']==pinned['host_inputs'] and observed['help_gpu']==pinned['help_gpu']
 if a.verify_only:print(json.dumps(dict(status='verified-source-only',members=len(m['members']),runtimes_started=0,**FALSE)));return
 fd=int(os.environ.get('WIZARD_HEAVY_LOCK_FD','-1'));assert fd>=3 and os.environ.get('WIZARD_WORKER_LANE')=='heavy','parent heavy admission required'
 st=os.fstat(fd);canonical=Path('/srv/work/heavy/production/worker.lock').stat();assert (st.st_dev,st.st_ino)==(canonical.st_dev,canonical.st_ino)
 import fcntl
 probe="import fcntl,sys;f=open(sys.argv[1]);\ntry:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError:sys.exit(0)\nsys.exit(1)"
 run([sys.executable,'-c',probe,'/srv/work/heavy/production/worker.lock']);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 assert not (R/'evidence').exists() and not (R/'runs').exists(),'one-use stage'
 assert shutil.disk_usage(R).free>=200*1024**3
 (R/'evidence').mkdir();(R/'runs').mkdir();report=dict(status='failed',manifest_sha256=a.manifest_sha,**FALSE)
 try:
  root,c,rc=arm('control-normal',False,m)
  b=read(root/'evidence/native/reader-boundary.json');assert b['prekill']['frames'][-1]['pair']==[5,13] and b['restored']['frames'][-1]['pair']==[5,15] and rc!=0,'STOP: native normal control did not reproduce exact old failure'
  report['control_normal']='exact-5/13-to-5/15-reproduced'
  root,d,rc=arm('control-reciprocal',False,m,True);assert totals(root)==[13,15,18,15],'STOP: native reciprocal control not reproduced'
  report['control_reciprocal']=[13,15,18,15];write(R/'evidence/acceptance.json',report)
  report['candidate_image']=package(m)
  root,c,rc=arm('candidate-normal',True,m)
  assert rc==0 and c['status']=='passed-needs-visual-inspection' and all(x['pass'] for x in c['checks']),'STOP: diagnostic candidate failed unchanged normal native gates'
  b=read(root/'evidence/native/reader-boundary.json')
  for phase in ('prekill','restored','home_prekill','home_restored'):assert b[phase]['frames'][-1]['pair']==[5,15]
  report['candidate_normal']='all normal native gates observed; parent pixel review still required'
  root,d,rc=arm('candidate-reciprocal',True,m,True);report['candidate_reciprocal']=totals(root)
  assert report['candidate_reciprocal']==[15,18,15,15],'STOP: candidate reciprocal discriminator failed'
  report['status']='diagnostic-effect-observed-not-root-cause-or-flight-ready'
 except BaseException as e:report['failure']=repr(e)
 finally:
  verify(a.manifest_sha);report['finished_at']=time.time();write(R/'evidence/acceptance.json',report);print(json.dumps(report,indent=2))
 if report['status']!='diagnostic-effect-observed-not-root-cause-or-flight-ready':raise SystemExit(1)
if __name__=='__main__':main()
