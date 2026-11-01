#!/usr/bin/env python3
"""Source-bound R12 diagnostic. Only --verify-only may run outside admission."""
import argparse, hashlib, importlib.util, json, os, signal, subprocess as sp, sys, time
from pathlib import Path
R = Path(__file__).resolve().parent
BASE = Path('/srv/work/wisdom-flight-e42830b5-a800c16c-r10')
BASE_SHA = 'f019a1be7b8d6f82382c173aef3512fc13bdf2dcae4d40acbbf5abdb98ec2c61'
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()
def read(p): return json.loads(Path(p).read_text())
def native_source(original):
    changes = [
        ('import hashlib\n', 'import hashlib\nfrom gdb_process_r12 import EmulatorProcess\n'),
        ("emulator = sp.Popen(emulator_argv, env=ENV, stdout=(OUT/'emulator.log').open('w'), stderr=sp.STDOUT)", "emulator = EmulatorProcess(emulator_argv, ENV, OUT)"),
        ("result['status']='passed-needs-visual-inspection'", "result['status']='diagnostic-flight-completed-review-required'"),
        ("(OUT/'acceptance.json')", "(OUT/'diagnostic-native.json')"),
        ("sys.exit(0 if result['status']=='passed-needs-visual-inspection' else 1)", "sys.exit(0 if result['status']=='diagnostic-flight-completed-review-required' else 1)")
    ]
    for old,new in changes:
        assert original.count(old)==1, old
        original=original.replace(old,new)
    return original

def verify(manifest_sha):
    assert sha(R/'diagnostic-manifest.json')==manifest_sha
    m=read(R/'diagnostic-manifest.json')
    for name,digest in m['scripts'].items(): assert sha(R/name)==digest,name
    assert sha(BASE/'source-manifest.json')==BASE_SHA==m['base_manifest_sha256']
    assert (R/'native-flight-r12.py').read_text()==native_source((BASE/'native-flight.py').read_text())
    for path, digest in m['host_inputs'].items(): assert sha(path)==digest,path
    s=importlib.util.spec_from_file_location('r10_gate',BASE/'verify-inheritance.py')
    gate=importlib.util.module_from_spec(s);s.loader.exec_module(gate)
    base=read(BASE/'source-manifest.json')
    for name,meta in {**base['members'],**base['export_members']}.items():
        f=gate.safe(BASE,name)
        if meta['mode']=='120000': assert f.is_symlink() and os.readlink(f)==meta['target'],name
        else: assert f.is_file() and sha(f)==meta['sha256'],name
    linked=gate.verify_inherited(BASE,base)
    for name in ('ux','wisdom','artifacts','current-release.apk','source-manifest.json','adb-transport.py'):
        assert (R/name).is_symlink() and (R/name).resolve()==(BASE/name).resolve(),name
    # This helper resolves __file__ for evidence output; it MUST be a real copy.
    assert not (R/'isolated-adb.py').is_symlink() and sha(R/'isolated-adb.py')==sha(BASE/'isolated-adb.py')
    assert not (R/'evidence').exists(), 'one-use evidence directory exists'
    return m,linked

def provision(m,out):
    packages=R/'packages'; packages.mkdir(); root=packages/'root';root.mkdir()
    env={**os.environ,'DEBUGINFOD_URLS':'','DEBIAN_FRONTEND':'noninteractive'}
    log=out/'package-install.log'; commands=[]
    def call(argv,cwd=packages,env=env,timeout=180):
        commands.append(list(map(str,argv)))
        with log.open('a') as f:
            f.write('\nARGV '+json.dumps(commands[-1])+'\n');f.flush()
            return sp.run(argv,cwd=cwd,env=env,stdout=f,stderr=sp.STDOUT,timeout=timeout,check=True)
    result={'method':'job-scoped-apt-download-and-dpkg-deb-extract','packages':m['packages'],'commands':commands}
    try:
        call(['apt','download',*[p['Package']+'='+p['Version'] for p in m['packages']]])
        for p in m['packages']:
            candidates=list(packages.glob(p['Package']+'_*.deb'))
            assert len(candidates)==1,p
            assert sha(candidates[0])==p['SHA256'],p
            call(['dpkg-deb','--extract',str(candidates[0]),str(root)])
        gdb=root/'usr/bin/gdb'
        genv={**env,'LD_LIBRARY_PATH':str(root/'usr/lib/x86_64-linux-gnu')}
        prefix=[str(gdb),'--data-directory='+str(root/'usr/share/gdb')]
        call([*prefix,'--version'],env=genv)
        call([*prefix,'-nx','-nh','--batch','-ex','python import gdb, json, hashlib'],env=genv)
    except Exception as e:
        result['extract_error']=repr(e)
        # Routine admitted dependency fallback. No apt update, upgrades or global core changes.
        result['method']='sudo-apt-get-install-fallback'
        call(['sudo','-n','apt-get','install','-y','--no-install-recommends','gdb=16.3-1'],timeout=240)
        gdb=Path('/usr/bin/gdb');prefix=[str(gdb)];genv=env
        call([*prefix,'--version'],env=genv)
        call([*prefix,'-nx','-nh','--batch','-ex','python import gdb, json, hashlib'],env=genv)
    finally:
        (out/'package-manifest.json').write_text(json.dumps(result,indent=2))
    result.update({'gdb_binary':str(gdb),'gdb_sha256':sha(gdb),'prefix':prefix})
    (out/'package-manifest.json').write_text(json.dumps(result,indent=2))
    # LD_LIBRARY_PATH is debugger-only; never leak extracted libs into the emulator.
    return {'R12_GDB_PREFIX':json.dumps(prefix),'R12_GDB_LIBRARY_PATH':genv.get('LD_LIBRARY_PATH','')}

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest-sha',required=True);p.add_argument('--verify-only',action='store_true');a=p.parse_args()
    m,linked=verify(a.manifest_sha)
    if a.verify_only:
        print(json.dumps({'status':'source-verified-not-executed','manifest_sha256':a.manifest_sha,'r8_job':linked['link']['job'],'native_acceptance':'unproved'}));return
    out=R/'evidence';out.mkdir()
    report={'status':'diagnostic-failed','native_acceptance':False,'review_required':True,'manifest_sha256':a.manifest_sha,'base_manifest_sha256':BASE_SHA,'r8_job':linked['link']['job'],'r8_manifest_sha256':linked['link']['manifest_sha256']}
    proc=None
    def stop(*_): raise KeyboardInterrupt('R12 interrupted')
    signal.signal(signal.SIGTERM,stop)
    try:
        # Read-only exact-image comparison. Never rebuild or run product containers.
        info=json.loads(sp.check_output(['docker','image','inspect',linked['image']['id']],text=True))[0]
        prior=read(Path(linked['link']['stage'])/'evidence/image-inspect.json')
        assert info['Id']==prior['Id']==linked['image']['id'] and info['RootFS']==prior['RootFS']==linked['image']['rootfs'] and info['Config']==prior['Config']
        (out/'image-inspect.json').write_text(json.dumps(info,indent=2))
        env=provision(m,out)
        with (out/'native.log').open('w') as f:
            proc=sp.Popen([sys.executable,str(R/'native-flight-r12.py')],cwd=R,env={**os.environ,**env,'PIN_ANDROID_SDK':'/srv/work/android-sdk','PYTHONDONTWRITEBYTECODE':'1'},stdout=f,stderr=sp.STDOUT,start_new_session=True)
            report['native_driver_returncode']=proc.wait(timeout=1400)
        n=read(out/'native/diagnostic-native.json')
        report['native_flight_status']=n['status'];report['native_cleanup']=n['cleanup']
        assert not n.get('cleanup_error')
        for field in ('emulator_stopped','fixture_stopped','adb_server_stopped','emulator_ports_closed'):
            assert n['cleanup'][field] is True,field
        fault=out/'native/gdb-fault.json'
        if fault.exists():
            report['fault']=read(fault)
            assert report['fault']['signal']=='SIGSEGV' and report['fault']['qemu_inferior'] is True
            stack=read(out/'native/gdb-stack-complete.json')
            assert not stack['errors'] and sha(out/'native/gdb-stack.txt')==stack['stack_sha256']
            report['status']='diagnostic-SIGSEGV-stack-captured-review-required'
        else:
            report['status']='diagnostic-no-SIGSEGV-review-required'
    except BaseException as e: report['error']=repr(e)
    finally:
        if proc:
            if proc.poll() is None:
                proc.terminate()
                try:proc.wait(timeout=75)
                except sp.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=10)
            # Reap only descendants in the process group this invocation created.
            try:os.killpg(proc.pid,signal.SIGTERM)
            except ProcessLookupError:pass
        from gdb_process_r12 import cleanup_owned_group
        try: report['debugger_cleanup']=cleanup_owned_group(out/'native')
        except Exception as e: report['cleanup_error']=repr(e);report['status']='diagnostic-failed'
        report['finished_at']=time.time()
        report['native_acceptance']=False
        (out/'diagnostic.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
    raise SystemExit(0 if report['status']=='diagnostic-SIGSEGV-stack-captured-review-required' and not report.get('cleanup_error') else 1)
if __name__=='__main__':main()
