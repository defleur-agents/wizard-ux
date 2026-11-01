#!/usr/bin/env python3
"""Durably admitted Forum job only. Exact source exports, no owner data or APK rebuild."""
import argparse,hashlib,json,os,selectors,shutil,signal,socket,stat,subprocess,sys,time

def terminate_signal(*_):raise KeyboardInterrupt('admitted job terminated')
signal.signal(signal.SIGTERM,terminate_signal)
from pathlib import Path
R=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--manifest-sha',required=True);args=p.parse_args()
def digest(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
assert digest(R/'source-manifest.json')==args.manifest_sha,'admitted source manifest differs'
M=json.loads((R/'source-manifest.json').read_text())
for name,meta in M['members'].items():
 f=R/name;assert f.is_file() and digest(f)==meta['sha256'],name
for name,meta in M['export_members'].items():
 f=R/name
 if meta['mode']=='120000':assert f.is_symlink() and os.readlink(f)==meta['target'],name
 else:assert f.is_file() and digest(f)==meta['sha256'] and bool(f.stat().st_mode&0o111)==(meta['mode']=='100755'),name
OUT=R/'evidence';assert not OUT.exists(),'Keep previous evidence; create a new admitted stage for a rerun';OUT.mkdir()
ENV={**os.environ,'TMPDIR':str(R/'tmp'),'PLAYWRIGHT_DIR':'/srv/work/provider-signin-browser/node_modules/playwright','QA_SOURCE_MANIFEST':str(R/'source-manifest.json')};(R/'tmp').mkdir(exist_ok=True)
NODE='/srv/work/node22/bin/node';SDK=Path('/srv/work/android-sdk');fixture=None
result={'status':'failed','source_manifest_sha256':args.manifest_sha,'sources':{k:v for k,v in M.items() if k.endswith('candidate') or k.endswith('base')},'checks':{}}
def run(argv,*,cwd=R,env=ENV,timeout=180,log=None,ok=True):
 # Foreground children only. Give native/PW their own finally block before hard cleanup.
 stream=Path(log).open('w') if log else None
 proc=subprocess.Popen(list(map(str,argv)),cwd=cwd,env=env,stdout=stream or subprocess.PIPE,stderr=subprocess.STDOUT if stream else subprocess.PIPE,text=True,start_new_session=True)
 try:
  stdout,stderr=proc.communicate(timeout=timeout)
  r=subprocess.CompletedProcess(argv,proc.returncode,stdout or '',stderr or '')
 except BaseException:
  if proc.poll() is None:
   os.killpg(proc.pid,signal.SIGTERM)
   try:proc.wait(timeout=90)
   except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=15)
  raise
 finally:
  if stream:stream.close()
 if ok and r.returncode:raise RuntimeError(f'Command failed {argv}: '+(str(log) if log else r.stderr[-2000:]))
 return r

def stop_fixture():
 global fixture
 if fixture:
  fixture.terminate()
  try:fixture.wait(timeout=15)
  except subprocess.TimeoutExpired:fixture.kill();fixture.wait(timeout=10)
  fixture=None

def browser_case(name,width,baseline=False,smoke=False):
 global fixture
 out=OUT/name;out.mkdir();err=(out/'fixture.log').open('w')
 source=R/('baseline-wisdom' if baseline else 'wisdom')
 fixture=subprocess.Popen([sys.executable,str(R/'ux/tools/qa-flight-offline-fixture.py'),'--web',str(R/'ux/web'),'--wisdom-source',str(source)],cwd=R,env={**ENV,'QA_LOST_HIGHLIGHT':'1'},stdout=subprocess.PIPE,stderr=err,text=True)
 try:
  sel=selectors.DefaultSelector();sel.register(fixture.stdout,selectors.EVENT_READ);assert sel.select(timeout=40),'fixture readiness timeout'
  line=fixture.stdout.readline();assert line,'fixture exited before readiness; see '+str(err.name);info=json.loads(line);(out/'fixture.json').write_text(json.dumps(info,indent=2));sel.close()
  env={**ENV,'QA_URL':info['url'],'QA_OUT':str(out),'QA_WIDTH':str(width),'QA_BASELINE':'1' if baseline else '0','QA_SMOKE':'1' if smoke else '0'}
  rc=run([NODE,R/'ux/tools/qa-flight-offline.cjs'],env=env,timeout=240,log=out/'browser.log',ok=False).returncode
  report=json.loads((out/'acceptance.json').read_text())
  if baseline:assert rc!=0 and report['checks'].get('ASSERT_REACHED')=='no offline popups anywhere' and report['checks'].get('baselinePopup',{}).get('visible') and (out/'expected-popup.png').is_file() and 'no offline popups anywhere' in report['error']['message'],'baseline must reach the assertion with actual popup evidence, not infrastructure'
  else:assert rc==0 and report['status']=='pass',str(out/'acceptance.json')
  return {'status':'expected-red' if baseline else 'pass','receipt':str((out/'acceptance.json').relative_to(R)),'sha256':digest(out/'acceptance.json')}
 finally:stop_fixture();err.close()
try:
 run([sys.executable,R/'ux/tools/flight/source-contract.py','--ux',R/'ux','--wisdom',R/'wisdom'],log=OUT/'source-contract.json')
 assert os.access('/dev/kvm',os.R_OK|os.W_OK),'KVM unavailable'
 assert shutil.disk_usage(R).free>30*1024**3,'insufficient scratch disk'
 mem={s.split(':')[0]:int(s.split()[1])*1024 for s in Path('/proc/meminfo').read_text().splitlines()};assert mem['MemAvailable']>8*1024**3,'insufficient available RAM'
 for port in [5588,5589,5147,28543]:
  with socket.socket() as s:s.bind(('127.0.0.1',port))
 package=json.loads((Path(ENV['PLAYWRIGHT_DIR'])/'package.json').read_text());assert package['version']=='1.64.1'
 browsers=json.loads((Path(ENV['PLAYWRIGHT_DIR']).parent/'playwright-core/browsers.json').read_text());assert next(b for b in browsers['browsers'] if b['name']=='chromium')['revision']=='1248'
 assert (Path.home()/'.cache/ms-playwright/chromium-1248/chrome-linux64/chrome').is_file()
 result['preflight']={'playwright':'1.64.1','chromium_revision':'1248','kvm':True,'free_disk':shutil.disk_usage(R).free,'mem_available':mem['MemAvailable'],'adb':run([SDK/'platform-tools/adb','version']).stdout,'emulator':run([SDK/'emulator/emulator','-version']).stdout[:600]}
 cert=run([SDK/'build-tools/35.0.0/apksigner','verify','--print-certs',R/'current-release.apk']).stdout
 assert '3bf74d0b597bc170761079909d3692428702ba057f753ee1ffd62da3c76ed1fd' in cert;assert digest(R/'current-release.apk')==M['apk']['sha256'];(OUT/'apk-signer.txt').write_text(cert)
 # Package from the exact accepted current runtime; no model/backend/content changes.
 base='sha256:c20dac0d0609dcc26e8ee07fefe57b1a3e1bdd8003661dc3be97248eece44823'
 prior=Path('/srv/work/wisdom-flight-c0fa4bd7-908f001e-r2')
 previous=json.loads((prior/'evidence/acceptance.json').read_text())['image']
 assert previous['id']=='sha256:dc229c78a6fe51015b1a8e2f82f1208def35046066b65473e48c6945e94a2c9b' and previous['source']==M['wisdom_candidate']
 imageTar=prior/'artifacts/wisdom-candidate-image.tar';assert digest(imageTar)=='44ee956574ca62d25a90ac60ced82e840cbe76a857fe18523076a65ffd53e7f9'==previous['tar_sha256']
 tag=previous['id'];info=json.loads(run(['docker','image','inspect',tag]).stdout)[0]
 assert info['Id']==tag and info['Architecture']=='amd64' and info['RootFS']==previous['rootfs'] and info['Config']['Labels']['org.wizard.source.sha']==M['wisdom_candidate']
 (OUT/'image-inspect.json').write_text(json.dumps(info,indent=2))
 result['image_reuse']={'prior':str(prior),'tar_sha256':previous['tar_sha256'],'id':tag}
 static={k[len('wisdom/'):]:v['sha256'] for k,v in M['export_members'].items() if k.startswith('wisdom/static/') and v['mode']!='120000'}
 code='import pathlib,hashlib,json; r=pathlib.Path("/app"); names='+repr(list(static))+';print(json.dumps({n:hashlib.sha256((r/n).read_bytes()).hexdigest() for n in names}))'
 cname='wisdom-flight-proof-'+M['wisdom_candidate'][:12]
 try:
  actual=json.loads(run(['docker','run','--rm','--name',cname,'--network','none','--entrypoint','python',tag,'-c',code],timeout=60).stdout);assert actual==static,'candidate image static bytes differ'
 finally:run(['docker','rm','-f',cname],ok=False)
 assert static==previous['assets'],'prior full static asset map differs';art=prior/'artifacts'
 result['image']={'id':info['Id'],'tag':tag,'tar_sha256':digest(art/'wisdom-candidate-image.tar'),'source':M['wisdom_candidate'],'assets':static,'rootfs':info['RootFS']}
 # A real API/status/cache smoke must pass before the longer flows. After it,
 # browser/baseline failures never hide first-ever native evidence.
 result['checks']['api_smoke']=browser_case('api-smoke',390,smoke=True)
 failures={}
 def phase(name,fn):
  try:result['checks'][name]=fn()
  except Exception as e:failures[name]=repr(e)
  result['phase_failures']=failures;(OUT/'acceptance.json').write_text(json.dumps(result,indent=2))
 def controller():
  run([sys.executable,'-m','unittest','discover','-s','ux/tools','-p','test_qa_unified_share_android.py'],timeout=180,log=OUT/'sender-controller.log')
  return {'status':'pass'}
 phase('sender_controller',controller)
 phase('baseline',lambda:browser_case('before-live-red',390,True))
 phase('phone',lambda:browser_case('phone',390))
 phase('desktop',lambda:browser_case('desktop',1280))
 def native_case():
  rc=run([sys.executable,R/'native-flight.py'],timeout=1000,log=OUT/'native.log',ok=False).returncode
  native=json.loads((OUT/'native/acceptance.json').read_text())
  assert rc==0 and native['status']=='passed-needs-visual-inspection','native release pin acceptance failed; see native/acceptance.json'
  return {'status':native['status'],'receipt_sha256':digest(OUT/'native/acceptance.json')}
 phase('native',native_case)
 assert not failures,failures
 result['status']='pass-needs-visual-review'
except BaseException as e:
 result['error']=repr(e);raise
finally:
 stop_fixture();result['finished_at']=time.time();(OUT/'acceptance.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
