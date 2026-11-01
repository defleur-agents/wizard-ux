#!/usr/bin/env python3
"""Native-only R15. Parent must admit with a durable Forum lease. --verify-only
is metadata/source/hash verification: no emulator, browser, Docker run/build.
"""
import argparse,hashlib,importlib.util,json,os,signal,subprocess as sp,sys,time
from pathlib import Path
import renderer_r14
import egress_r15
os.environ['PYTHONDONTWRITEBYTECODE']='1'
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('inheritance',R/'verify-inheritance.py');gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
def main():
 p=argparse.ArgumentParser();p.add_argument('--manifest-sha',required=True);p.add_argument('--verify-only',action='store_true');a=p.parse_args()
 assert gate.sha(R/'source-manifest.json')==a.manifest_sha
 m=gate.read(R/'source-manifest.json')
 for name,meta in {**m['members'],**m['export_members']}.items():
  f=gate.safe(R,name)
  if meta['mode']=='120000':assert f.is_symlink() and os.readlink(f)==meta['target'],name
  else:assert f.is_file() and gate.sha(f)==meta['sha256'] and oct(f.stat().st_mode&0o777)==meta.get('posix_mode',meta['mode']),name
 pinned=gate.read(R/'proof/renderer-preflight-r14.json')
 current=renderer_r14.preflight('/srv/work/android-sdk')
 assert current['host_inputs']==pinned['host_inputs'] and current['help_gpu']==pinned['help_gpu'], 'renderer host metadata drift'
 linked=gate.verify_inherited(R,m)
 # Exact image is unchanged; read-only Docker metadata, no container or rebuild.
 info=json.loads(sp.check_output(['docker','image','inspect',linked['image']['id']],text=True))[0]
 prior_info=gate.read(Path(linked['link']['stage'])/'evidence/image-inspect.json')
 assert info['Id']==prior_info['Id']==linked['image']['id'] and info['RootFS']==prior_info['RootFS']==linked['image']['rootfs'] and info['Config']==prior_info['Config']
 if a.verify_only:
  print(json.dumps({'status':'source-and-inheritance-verified-native-not-run','r8_job':linked['link']['job'],'inherited_phases':list(linked['checks']),'native':'pending','runtime_web_tree':m['qa_retry']['runtime_web_tree']},indent=2));return
 out=R/'evidence';assert not out.exists(),'Evidence is immutable. Stage a new attempt, never overwrite.';out.mkdir()
 report={'native_acceptance':False,'status':'failed','source_manifest_sha256':a.manifest_sha,'sources':{k:v for k,v in m.items() if k.endswith(('candidate','base'))},'checks':linked['checks'],'inheritance':{'browser':'R8','native':'R15','r8_overall_status':'failed-native-only','r8_job':linked['link']['job'],'r8_stage':linked['link']['stage'],'r8_acceptance_sha256':linked['link']['acceptance_sha256'],'r8_manifest_sha256':linked['link']['manifest_sha256']},'image':linked['image'],'image_build':linked['image_build'],'image_reuse':linked['image_reuse'],'image_evidence_origin':'R7 built; R8 verified; R15 byte-and-inspect linked; no rebuild','phase_failures':{}}
 (out/'image-inspect.json').write_text(json.dumps(info,indent=2))
 proc=None
 def terminated(*_):raise KeyboardInterrupt('admitted R15 interrupted')
 signal.signal(signal.SIGTERM,terminated)
 try:
  with (out/'native.log').open('w') as log:
   proc=sp.Popen([sys.executable,str(R/'native-flight.py')],cwd=R,env={**os.environ,'PIN_ANDROID_SDK':'/srv/work/android-sdk'},stdout=log,stderr=sp.STDOUT,start_new_session=True)
   rc=proc.wait(timeout=1400)
  assert rc==0,'native process failed; read native.log and native/acceptance.json'
  # Independently read every inherited hash again after native run.
  refreshed=gate.verify_inherited(R,m);assert refreshed==linked
  report['checks']['native']=gate.verify_native(R,m)
  native=gate.read(R/'evidence/native/acceptance.json')
  assert renderer_r14.verify_evidence(R/'evidence/native',native['graphics'])
  assert egress_r15.verify_evidence(R/'evidence/native',native['checks'])
  report['native_acceptance']=True
  report['renderer']='swangle-angle-vulkan-proven-no-legacy-GLES'
  report['status']='pass-needs-visual-review'
 except BaseException as e:
  report['phase_failures']['native']=repr(e);report['error']=repr(e)
 finally:
  if proc and proc.poll() is None:
   # Give native finally time to stop only its owned emulator/server/fixture.
   proc.terminate()
   try:proc.wait(timeout=90)
   except sp.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=10)
  report['native_process_returncode']=proc.poll() if proc else None
  report['finished_at']=time.time();(out/'acceptance.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
 if report['status']!='pass-needs-visual-review':raise SystemExit(1)
if __name__=='__main__':main()
