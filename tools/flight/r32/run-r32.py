#!/usr/bin/env python3
"""R22 parent-only light packet. --verify-only NEVER launches fixture/browser."""
import argparse,base64,hashlib,json,os,selectors,shutil,signal,subprocess,sys,time,traceback
from pathlib import Path
R=Path(__file__).resolve().parent
P=argparse.ArgumentParser();P.add_argument('--manifest-sha',required=True);P.add_argument('--verify-only',action='store_true');A=P.parse_args()
sha=lambda p:hashlib.file_digest(open(p,'rb'),'sha256').hexdigest()
assert sha(R/'source-manifest.json')==A.manifest_sha,'manifest drift'
M=json.loads((R/'source-manifest.json').read_text());NODE='/srv/work/node22/bin/node';PW='/srv/work/provider-signin-browser/node_modules/playwright';CHROME='/home/james/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
ENV={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PW_TEST_SCREENSHOT_NO_FONTS_READY':'1','PLAYWRIGHT_DIR':PW,'PLAYWRIGHT_BROWSERS_PATH':'/home/james/.cache/ms-playwright','QA_CHROME':CHROME,'NODE_EXTRA_CA_CERTS':str(R/'rig-ca.pem'),'TMPDIR':str(R/'tmp')}
def integrity():
 assert sha(R/'source-manifest.json')==A.manifest_sha,'manifest drift'
 for name,row in M['members'].items():
  target=R/name;assert target.is_file() and not target.is_symlink() and sha(target)==row['sha256'],'member drift: '+name
  assert target.stat().st_mode&0o777==int(row['mode'],8),'member mode drift: '+name
 for root in ['source/ux','source/wisdom']:
  actual={str(p.relative_to(R)) for p in (R/root).rglob('*') if p.is_file() or p.is_symlink()};assert actual=={n for n in M['members'] if n.startswith(root+'/')},'source closure '+root
 assert sha(R/'source/wisdom/static/wisdom.js')==M['productJSsha256']
 for name,digest in M['toolchain']['files'].items():assert sha(name)==digest,'toolchain drift '+name
 assert sha(CHROME)==M['toolchain']['chrome_sha256']
 assert subprocess.check_output([NODE,'--version'],text=True,timeout=10).strip()==M['toolchain']['node_version'].strip()
 assert json.loads((Path(PW)/'package.json').read_text())['version']=='1.64.1'
 pub=subprocess.check_output(['openssl','x509','-in',R/'rig-server.pem','-pubkey','-noout'],timeout=10)
 der=subprocess.run(['openssl','pkey','-pubin','-outform','DER'],input=pub,capture_output=True,check=True,timeout=10).stdout
 assert base64.b64encode(hashlib.sha256(der).digest()).decode()==M['fixture_tls']['leaf_spki_sha256']
 subprocess.run(['openssl','verify','-CAfile',R/'rig-ca.pem',R/'rig-server.pem'],capture_output=True,check=True,timeout=10)
 subprocess.run([NODE,'--check',R/'app-session-r32.cjs'],env=ENV,check=True,timeout=15)
 subprocess.run([NODE,R/'test-source.cjs',R/'source/wisdom/static/wisdom.js'],env=ENV,check=True,timeout=15)
 subprocess.run([NODE,R/'test-r32.cjs'],env=ENV,check=True,timeout=15)
 ldd=subprocess.run(['ldd',CHROME],capture_output=True,text=True,check=True,timeout=15);assert 'not found' not in ldd.stdout+ldd.stderr
 free=shutil.disk_usage(R).free;assert free>=2*1024**3,'2GiB free floor'
 return {'integrity':'verified','members':len(M['members']),'productCounts':M['product_counts'],'browsers_started':0,'free_bytes':free}
preflight=integrity()
if A.verify_only:print(json.dumps(preflight));sys.exit(0)
OUT=R/'evidence';assert not OUT.exists(),'immutable one-use stage';OUT.mkdir()
report={'status':'incomplete','manifest_sha256':A.manifest_sha,'preflight':preflight,'cases':{},'releaseAllowed':False,'nativeAcceptance':False,'liveParityAcceptance':False};fixture=child=None;GROUPS=set()
def save():(OUT/'acceptance.json').write_text(json.dumps(report,indent=2)+'\n')
def stop(p):
 if p and p.poll() is None:
  os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
def processes():
 rows={};roots=set()
 for p in Path('/proc').iterdir():
  if not p.name.isdigit() or int(p.name) in (0,1,os.getpid()):continue
  try:
   if p.stat().st_uid!=os.getuid():continue
   pid=int(p.name);s=(p/'stat').read_text().split(') ',1)[1].split();ppid,pgid=int(s[1]),int(s[2]);argv=(p/'cmdline').read_bytes();rows[pid]=(ppid,pgid)
   if any(x in argv for x in [str(R/'app-session-r32.cjs').encode(),str(R/'fixture.py').encode(),(str(OUT)+'/').encode()]):
    roots.add(pid)
    if pgid==pid:GROUPS.add(pgid)
  except (OSError,ValueError):pass
 selected={pid for pid,(_,pgid) in rows.items() if pid in roots or pgid in GROUPS}
 while True:
  new=selected|{pid for pid,(ppid,_) in rows.items() if ppid in selected}
  if new==selected:break
  selected=new
 return sorted(selected)
def cleanup():
 selected=processes();stop(child);stop(fixture)
 for sig in [signal.SIGTERM,signal.SIGKILL]:
  for pid in processes():
   try:os.kill(pid,sig)
   except ProcessLookupError:pass
  end=time.monotonic()+3
  while processes() and time.monotonic()<end:time.sleep(.1)
 remains=processes();GROUPS.clear();return {'selected_pids':selected,'remaining_pids':remains,'verified':not remains}
def interrupted(*_):raise KeyboardInterrupt('parent-admitted packet terminated')
signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
def case(variant,name,deadline):
 global fixture,child
 identity=variant+'-'+name;out=OUT/identity;out.mkdir();source=R/'source'
 web=source/'ux/web';wisdom=source/'wisdom'
 case_manifest={**M,'host_cache_shell':M['host_cache_shell']};(out/'case-manifest.json').write_text(json.dumps(case_manifest,indent=2))
 with (out/'fixture.log').open('w') as fl,(out/'browser.log').open('w') as bl:
  try:
   fixture=subprocess.Popen([sys.executable,R/'fixture.py','--wisdom-source',wisdom,'--web',web,'--cert',R/'rig-server.pem','--key',R/'rig-server.key'],cwd=R,env=ENV,stdout=subprocess.PIPE,stderr=fl,text=True,start_new_session=True)
   with selectors.DefaultSelector() as sel:
    sel.register(fixture.stdout,selectors.EVENT_READ);assert sel.select(timeout=15),'fixture readiness timeout';line=fixture.stdout.readline();assert line,'fixture exited';info=json.loads(line)
   (out/'fixture.json').write_text(json.dumps(info,indent=2));assert info['synthetic'] and info['url'].startswith('https://localhost:') and info['url'].endswith('/wizard-os-home/?app-session=wisdom')
   env={**ENV,'QA_OUT':str(out),'QA_URL':info['url'],'QA_CASE':name,'QA_VARIANT':variant,'QA_MANIFEST':str(out/'case-manifest.json')}
   child=subprocess.Popen([NODE,R/'app-session-r32.cjs'],cwd=R,env=env,stdout=bl,stderr=subprocess.STDOUT,start_new_session=True)
   budget=min(200,deadline-time.monotonic());assert budget>0,'overall browser budget exhausted'
   try:rc=child.wait(timeout=budget)
   except subprocess.TimeoutExpired:stop(child);raise RuntimeError('bounded browser case timed out')
   result=json.loads((out/'report.json').read_text());assert rc==0 and result['status']!='incomplete','incomplete: '+str(result.get('error',{}))
   assert result['case']==name and result['status']=='diagnostic-complete'
   assert len(result['states'])==4 and [x['size'] for x in result['states']]==['1','2','1','1']
   assert len(result['deaths'])==3 and all(d['remainingLiveGroup']==[] for d in result['deaths'])
   assert not result['egress'] and not result['pageErrors']
   return {'status':'diagnostic-complete','states':result['states'],'report':str((out/'report.json').relative_to(R)),'sha256':sha(out/'report.json')}

  finally:
   clean=cleanup();child=fixture=None;(out/'cleanup.json').write_text(json.dumps(clean,indent=2));assert clean['verified'],'owned process survived'
try:
 deadline=time.monotonic()+415
 for name in ['baseline','traced']:
  try:report['cases'][name]=case('exact-source',name,deadline)
  except Exception as e:report['cases'][name]={'status':'incomplete','error':str(e),'traceback':traceback.format_exc()}
  save()
 if all(v['status']=='diagnostic-complete' for v in report['cases'].values()):
  a,b=[report['cases'][n]['states'] for n in ['baseline','traced']]
  failed=lambda rows:any(x['size']=='1' and x['total'] in (13,18) for x in rows)
  report['status']='PERTURBED' if failed(a) and not failed(b) else 'NOT_REPRODUCED' if not failed(a) else 'REPRODUCED_INPUTS_REQUIRE_ANALYSIS'
  report['causalConclusionAllowed']=False
except BaseException as e:report['error']=str(e);report['traceback']=traceback.format_exc()
finally:
 report['cleanup']=cleanup()
 try:integrity();report['sourceIntegrityAfter']='verified'
 except Exception as e:report['sourceIntegrityAfter']=str(e);report['status']='incomplete'
 if not report['cleanup']['verified']:report['status']='incomplete'
 report['artifacts']={str(p.relative_to(R)):{'sha256':sha(p),'bytes':p.stat().st_size} for p in OUT.rglob('*') if p.is_file() and p.name!='acceptance.json' and not any(x.startswith('profile-') for x in p.relative_to(OUT).parts)}
 save();print(json.dumps({'status':report['status'],'cases':report['cases'],'receipt':str(OUT/'acceptance.json'),'releaseAllowed':False,'nativeAcceptance':False}));sys.exit(0 if report['status']!='incomplete' else 1)
