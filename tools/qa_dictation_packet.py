#!/usr/bin/env python3
"""Sealed coordinator for the parent-owned forum queue; no build/emulator at preparation time."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify(root):
    root = Path(root).resolve()
    seal = json.loads((root/'seal.json').read_text())
    for name, expected in seal['files'].items():
        path = Path(name)
        if not path.is_absolute() or not path.resolve().is_relative_to('/srv/work/AndroidBuilds'):
            raise ValueError('sealed path outside worker root')
        if digest(path) != expected: raise ValueError('seal mismatch: '+name)
    config = json.loads((root/'packet.json').read_text())
    if config['source_revision'] != seal['source_revision']: raise ValueError('source revision mismatch')
    if set(config['workers']) != {'candidate','baseline','rejected'}: raise ValueError('missing control build')
    for name, worker in config['workers'].items():
        cfg=json.loads(Path(worker['config']).read_text())
        if cfg['host'] != 'forum' or cfg.get('signing_env') or cfg.get('expected_signer'):
            raise ValueError('debug/control build must have no signing environment or release certificate pin')
        expected_tasks=[':app:assembleDebug',':app:assembleDebugAndroidTest']
        if name == 'candidate': expected_tasks=[':app:testDebugUnitTest',':app:lintDebug']+expected_tasks
        if cfg['tasks'] != expected_tasks or cfg['revision'] != config[name]['revision']:
            raise ValueError('worker task/revision differs: '+name)
    return config


def execute(root):
    root=Path(root).resolve(); config=verify(root)
    if 'WIZARD_HEAVY_LOCK_FD' not in os.environ: raise RuntimeError('queue lease required')
    evidence={'status':'failed','source_revision':config['source_revision'],'stages':{},'handset_proven':False}
    try:
        for name in ('baseline','rejected','candidate'):
            worker=config['workers'][name]
            log=root/(name+'-build-controller.log')
            with log.open('w') as out:
                completed=subprocess.run(worker['argv'],cwd=worker['cwd'],stdout=out,stderr=subprocess.STDOUT,timeout=1800)
            receipt=json.loads(Path(config[name]['receipt']).read_text())
            evidence['stages'][name]={'exit_code':completed.returncode,'receipt':config[name]['receipt'],'receipt_sha256':digest(config[name]['receipt'])}
            if completed.returncode or receipt.get('status') != 'ok': raise RuntimeError(name+' worker failed')
        runner=root/'qa_dictation_insertion_native.py'
        with (root/'native-controller.log').open('w') as out:
            completed=subprocess.run([sys.executable,str(runner),str(root/'packet.json'),str(root/'native')],
                                     cwd=root,stdout=out,stderr=subprocess.STDOUT,timeout=2400)
        evidence['native_exit_code']=completed.returncode
        if completed.returncode: raise RuntimeError('native gate failed')
        native=json.loads((root/'native/receipt.json').read_text())
        if native.get('status') != 'ok' or not native.get('stopped_emulator'): raise RuntimeError('native receipt not accepted')
        evidence['native_receipt_sha256']=digest(root/'native/receipt.json');evidence['status']='ok'
    except BaseException:
        evidence['error']=traceback.format_exc();raise
    finally:
        (root/'receipt.json').write_text(json.dumps(evidence,indent=2)+'\n')
    return evidence


if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root',type=Path);p.add_argument('--verify-only',action='store_true')
    a=p.parse_args();print(json.dumps(verify(a.root) if a.verify_only else execute(a.root),indent=2))
