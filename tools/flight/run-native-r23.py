#!/usr/bin/env python3
"""Parent-admitted Forum: exact static image packaging + signed release native QA.
--verify-only reads source/toolchain/image metadata only. No runtime admission.
"""
import argparse, hashlib, importlib.util, io, json, os, signal, stat
import subprocess as sp
import sys, tarfile, time
from pathlib import Path
sys.dont_write_bytecode = True
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
R = Path(__file__).resolve().parent
BASE = 'sha256:32ebac204db40284e3fb2d415e6620c35d6c5042448f8fbb1056aaf84ebcd5cf'
BASE_TAG = 'wisdom-r23-base:32ebac204db4'
TAG = 'wisdom-flight-r23:a0d20c06-fd7e3de9'
SHELL = 'fd7e3de99cddbc3452b6e775bd49363fc4608f9e'
WISDOM = 'a0d20c06b804ebdd93fabe7327143ddc0267cd7a'
WEB = 'e4f44c9cc552c493a0557db7cdbdd2e1ef2e08f8'
FLOOR = 200 * 1024**3

def sha(p):
    h = hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda: f.read(1048576), b''): h.update(b)
    return h.hexdigest()

def read(p): return json.loads(Path(p).read_text())
def write(p, v): Path(p).write_text(json.dumps(v, indent=2, sort_keys=True)+'\n')
def command(argv, timeout=60, **kwargs):
    return sp.run(list(map(str, argv)), check=True, timeout=timeout, **kwargs)
def inspect(image):
    return json.loads(sp.check_output(['docker','image','inspect',image], timeout=30))[0]

def verify(root, expected):
    root = Path(root)
    assert sha(root/'source-manifest.json') == expected, 'manifest digest mismatch'
    m = read(root/'source-manifest.json')
    assert m['shell_candidate'] == SHELL and m['wisdom_candidate'] == WISDOM
    assert m['runtime_web_tree'] == WEB
    assert m['acceptance'] == {k: False for k in ('native','image','release','live_parity','visual')}
    seen=set()
    for name, row in m['members'].items():
        p=Path(name)
        assert not p.is_absolute() and '..' not in p.parts and name not in seen, name
        seen.add(name); f=root/p
        if row['mode'] == '120000':
            assert f.is_symlink() and os.readlink(f)==row['target'], name
        else:
            assert f.is_file() and not f.is_symlink(), name
            assert sha(f)==row['sha256'], 'source digest mismatch: '+name
            assert oct(stat.S_IMODE(f.stat().st_mode))==row['posix_mode'], name
    # Exact inventories, not just expected-members existence. Runtime output roots
    # are excluded explicitly; no exports or QA helper directory may gain files.
    actual={str(p.relative_to(root)) for prefix in ('ux','wisdom','qa-source')
            for p in (root/prefix).rglob('*') if p.is_file() or p.is_symlink()}
    expected_sources={n for n in seen if n.split('/')[0] in ('ux','wisdom','qa-source')}
    assert actual==expected_sources, 'unexpected source member inventory'
    assert sum(m['source_counts'].values())==len(expected_sources)
    assert sha(root/'current-release.apk')==m['apk']['sha256']
    return m

def preflight(root, expected):
    m=verify(root, expected)
    assert sha('/usr/bin/ffmpeg')==m['toolchain']['ffmpeg_sha256']
    import renderer_r14
    now=renderer_r14.preflight('/srv/work/android-sdk')
    pinned=read(root/'proof/renderer-preflight-r14.json')
    assert now['host_inputs']==pinned['host_inputs'] and now['help_gpu']==pinned['help_gpu']
    old=inspect(BASE); pinned=read(root/'proof/base-image-inspect.json')
    assert old['Id']==BASE and all(old[k]==pinned[k] for k in ('Id','RootFS','Config'))
    assert m['base_image']['id']==BASE
    assert sha(root/'proof/base-image-inspect.json')==m['base_image']['inspect_sha256']
    # Pinned browser proof is evidence only, never fresh native/live-parity truth.
    browser=read(root/'proof/r22-browser-acceptance.json')
    assert browser['status']=='passed-browser-old-fail-new-pass-only'
    assert set(browser['cases'])=={'old-highlight','old-control','candidate-highlight','candidate-control'}
    assert browser['nativeAcceptance'] is False and browser['releaseAllowed'] is False
    free=os.statvfs(root).f_bavail*os.statvfs(root).f_frsize
    return m,old,{'status':'verified-source-metadata-only','members':len(m['members']),
                 'source_counts':m['source_counts'],'free_bytes':free,'required_free_bytes':FLOOR,
                 'resource_admission_ready':free>=FLOOR,'browsers_started':0,'emulators_started':0,
                 'image_built':False,'native_acceptance':False}

def assets_from_copy(path):
    result={}
    with tarfile.open(path) as t:
        for item in t:
            assert not item.issym() and not item.islnk(), item.name
            parts=Path(item.name).parts
            assert parts and parts[0]=='static' and '..' not in parts
            if item.isfile():
                result['/'.join(parts)]=hashlib.sha256(t.extractfile(item).read()).hexdigest()
    return result

def package(m, old, out):
    # No network or backend rebuild. Preserve every existing rootfs layer and
    # all Config fields/labels except the two declared source revision labels.
    command(['docker','tag',BASE,BASE_TAG]); assert inspect(BASE_TAG)['Id']==BASE
    iid=out/'candidate.iid'
    with (out/'image-build.log').open('w') as log:
        command(['docker','build','--pull=false','--network=none','--iidfile',iid,
                 '--build-arg','WISDOM_SOURCE='+WISDOM,'--tag',TAG,
                 '--file',R/'Dockerfile.r23',R],timeout=480,stdout=log,stderr=sp.STDOUT)
    image=iid.read_text().strip(); current=inspect(image)
    write(out/'image-inspect.json',current)
    assert inspect(BASE_TAG)['Id']==BASE
    prior=old['RootFS']['Layers']; assert current['RootFS']['Layers'][:len(prior)]==prior
    assert len(current['RootFS']['Layers'])==len(prior)+1
    for k,v in old['Config'].items():
        if k not in ('Labels','Image'): assert current['Config'][k]==v, ('config drift',k)
    labels={**old['Config']['Labels'],'org.opencontainers.image.revision':WISDOM,'org.wizard.source.sha':WISDOM}
    assert current['Config']['Labels']==labels
    assert current['Architecture']==old['Architecture']=='amd64' and current['Os']==old['Os']=='linux'
    expected={n.removeprefix('wisdom/'):row['sha256'] for n,row in m['members'].items()
              if n.startswith('wisdom/static/') and row['mode']!='120000'}
    name='wisdom-r23-static-'+m['qa_revision'][:12]
    cid=None
    try:
        cid=sp.check_output(['docker','create','--name',name,image],timeout=30,text=True).strip()
        # create/cp only, never start this container. All QA HTTP uses exact
        # source static bytes independently matched to this packaged image.
        with (out/'image-static.tar').open('wb') as f:
            command(['docker','cp',cid+':/app/static','-'],stdout=f,timeout=90)
        actual=assets_from_copy(out/'image-static.tar'); assert actual==expected, 'packaged static drift'
    finally:
        if cid: command(['docker','rm',cid])
    archive=out/'wisdom-candidate-image.tar'
    with archive.open('wb') as f: command(['docker','save',image],stdout=f,timeout=240)
    result={'id':image,'tag':TAG,'base_id':BASE,'tar':str(archive),'tar_sha256':sha(archive),
            'source_revision':WISDOM,'hosted_shell_revision':SHELL,'hosted_web_tree':WEB,
            'assets':actual,'rootfs':current['RootFS'],'labels':labels,
            'dockerfile_sha256':sha(R/'Dockerfile.r23'),'image_inspect_sha256':sha(out/'image-inspect.json'),
            'static_copy_sha256':sha(out/'image-static.tar'),'container_started':False}
    write(out/'image-identity.json',result)
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest-sha',required=True);p.add_argument('--verify-only',action='store_true');a=p.parse_args()
    m,old,meta=preflight(R,a.manifest_sha)
    if a.verify_only: print(json.dumps(meta,indent=2));return
    # The heavy lease is supplied only by native parent admission, not this helper.
    fd=int(os.environ.get('WIZARD_HEAVY_LOCK_FD','-1'))
    assert fd>=3 and os.environ.get('WIZARD_WORKER_LANE')=='heavy', 'native parent heavy lease required'
    lock=Path('/srv/work/heavy/production/worker.lock')
    actual=os.fstat(fd); expected=lock.stat()
    assert (actual.st_dev,actual.st_ino)==(expected.st_dev,expected.st_ino), 'canonical lease inode mismatch'
    probe="import fcntl,sys; f=open(sys.argv[1],'r');\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError: sys.exit(0)\nsys.exit(1)"
    command([sys.executable,'-B','-c',probe,lock],timeout=10)
    import fcntl
    fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    assert meta['resource_admission_ready'], '200 GiB work-volume reserve required'
    out=R/'evidence'; assert not out.exists(), 'one-use stage: preserve previous evidence'
    out.mkdir()
    report={'status':'failed','source_manifest_sha256':a.manifest_sha,'sources':{
        'shell':SHELL,'web_tree':WEB,'wisdom':WISDOM,'qa':m['qa_revision']},
        'native_acceptance':False,'image_acceptance':False,'releaseAllowed':False,
        'liveParityAcceptance':False,'visualAcceptance':False,'historical_r8_acceptance_inherited':False,
        'preflight':meta,'phase_failures':{},'checks':{}}
    write(out/'acceptance.json',report)
    proc=None
    def interrupted(*_): raise KeyboardInterrupt('parent-admitted R23 interrupted')
    signal.signal(signal.SIGTERM,interrupted)
    try:
        with (out/'source-units.log').open('w') as log:
            command([sys.executable,'-B','-m','unittest','test_boundary_r17','test_reader_ready_r18',
                     'test_pin_contract_r19','test_packet_r23'],cwd=R,stdout=log,stderr=sp.STDOUT,timeout=45)
        report['checks']['source_units']={'sha256':sha(out/'source-units.log'),'status':'passed'}
        report['image']=package(m,old,out);report['image_acceptance']=True
        write(out/'acceptance.json',report)
        with (out/'native.log').open('w') as log:
            proc=sp.Popen([sys.executable,'-B',R/'native-flight.py'],cwd=R,
                          env={**os.environ,'PIN_ANDROID_SDK':'/srv/work/android-sdk'},
                          stdout=log,stderr=sp.STDOUT,start_new_session=True)
            rc=proc.wait(timeout=2200)
        assert rc==0, 'native failed; retain exact pair/body failure and diagnostics'
        import renderer_r14, egress_r15, pin_contract_r19
        spec=importlib.util.spec_from_file_location('native_gate',R/'verify-inheritance.py')
        gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
        report['checks']['native']=gate.verify_native(R,m)  # never verify_inherited()
        native=read(out/'native/acceptance.json')
        assert renderer_r14.verify_evidence(out/'native',native['graphics'])
        assert egress_r15.verify_evidence(out/'native',native['checks'])
        assert pin_contract_r19.verify_evidence(out/'native',native['origin'])
        report['native_acceptance']=True;report['status']='passed-native-needs-visual-and-live-parity'
    except BaseException as e:
        report['phase_failures']['active']=repr(e)
    finally:
        if proc and proc.poll() is None:
            proc.terminate()
            try:proc.wait(timeout=100)
            except sp.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=15)
        report['native_process_returncode']=proc.poll() if proc else None
        try:
            verify(R,a.manifest_sha);report['sourceIntegrityAfter']='verified'
        except BaseException as e:
            report['native_acceptance']=False;report['status']='failed';report['phase_failures']['source']=repr(e)
        report['finished_at']=time.time();write(out/'acceptance.json',report)
        print(json.dumps(report,indent=2))
    if not report['native_acceptance']:raise SystemExit(1)
if __name__=='__main__': main()
