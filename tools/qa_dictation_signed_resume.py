#!/usr/bin/env python3
"""Seal a separate exact-source OS-pinned signed job; preparation never admits execution."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import traceback
from qa_dictation_candidate_resume import digest, read, write, archive_files, check_proof, manifest_hash

OS_SIGNER = '3bf74d0b597bc170761079909d3692428702ba057f753ee1ffd62da3c76ed1fd'


def verify(root, seal_hash):
    root=root.resolve()
    if digest(root/'release-seal.json') != seal_hash: raise ValueError('parent-pinned release seal mismatch')
    seal=read(root/'release-seal.json')
    for name, expected in seal['files'].items():
        path=Path(name)
        if not path.resolve().is_relative_to(root) or digest(path) != expected: raise ValueError('release input drift: '+name)
    required={str(root/name) for name in ('job.json','source.tar.gz','worker.py','qa_queue_lease.py',
              'qa_dictation_candidate_resume.py','qa_dictation_signed_resume.py','source-proof.json')}
    if set(seal['files']) != required: raise ValueError('release seal closure differs')
    cfg=read(root/'job.json'); proof=read(root/'source-proof.json')
    check_proof(proof,cfg['files'])
    if cfg['revision'] != proof['new_revision'] or seal['source_revision'] != cfg['revision']:
        raise ValueError('release revision differs')
    if cfg['tasks'] != [':app:assembleRelease'] or cfg['host'] != 'forum' or cfg.get('owner_config') or cfg.get('cap_sync'):
        raise ValueError('canonical release-only configuration required')
    if cfg['expected_signer'] != OS_SIGNER or not cfg['signing_env']:
        raise ValueError('separate OS certificate pin required')
    if cfg['manifest_sha256'] != manifest_hash(cfg['files']) or archive_files(root/'source.tar.gz') != cfg['files']:
        raise ValueError('release source manifest/archive differs')
    return cfg


def prepare(root, proof, revision):
    root=root.resolve()
    if os.uname().nodename != 'forum' or (root/'source').exists() or (root/'receipt.json').exists():
        raise ValueError('fresh unexecuted forum preparation required')
    if shutil.disk_usage(root).free < 240*1024**3: raise ValueError('worker disk reserve required')
    for name in ('qa_queue_lease.py','qa_dictation_candidate_resume.py','qa_dictation_signed_resume.py'):
        shutil.copyfile(Path(__file__).with_name(name),root/name)
    shutil.copyfile(proof,root/'source-proof.json')
    (root/'scratch').mkdir(mode=0o700)
    files={str(root/name):digest(root/name) for name in ('job.json','source.tar.gz','worker.py','qa_queue_lease.py',
           'qa_dictation_candidate_resume.py','qa_dictation_signed_resume.py','source-proof.json')}
    cfg=read(root/'job.json')
    write(root/'release-seal.json',{'source_revision':cfg['revision'],'qa_revision':revision,'files':files})
    sha=digest(root/'release-seal.json'); verify(root,sha)
    spec={'host':'forum','lane':'heavy','key':'dictation-signed-resume-'+cfg['revision']+'-'+revision,
          'cwd':str(root),'argv':['/usr/bin/env','PYTHONDONTWRITEBYTECODE=1','TMPDIR='+str(root/'scratch'),
          '/usr/bin/python3',str(root/'qa_dictation_signed_resume.py'),'execute',str(root),'--seal-sha256',sha],
          'timeout_seconds':5400}
    write(root/'parent-only-release-spec.json',spec)
    write(root/'release-preparation.json',{'status':'prepared_not_submitted','source_revision':cfg['revision'],
          'source_manifest_sha256':cfg['manifest_sha256'],'seal_sha256':sha,
          'spec_sha256':digest(root/'parent-only-release-spec.json'),'expected_signer':OS_SIGNER,
          'superseded_release_not_publishable':read(proof)['old_revision'],'release_build_executed':False})
    return spec


def execute(root, seal_hash):
    from qa_queue_lease import validated_queue_fd, run_with_queue_lease
    cfg=verify(root,seal_hash); validated_queue_fd()
    if (root/'release-resume-receipt.json').exists() or (root/'receipt.json').exists(): raise ValueError('release job is one-use')
    if shutil.disk_usage(root).free < 200*1024**3: raise ValueError('worker disk reserve required')
    evidence={'status':'failed','source_revision':cfg['revision'],'published':False}
    try:
        with (root/'release-build-controller.log').open('w') as out:
            completed=run_with_queue_lease([sys.executable,str(root/'worker.py'),'--worker',str(root/'job.json')],
                       cwd=root,stdout=out,stderr=subprocess.STDOUT,timeout=3600)
        result=read(root/'receipt.json')
        if completed.returncode or result.get('status') != 'ok' or result['source_revision'] != cfg['revision']:
            raise RuntimeError('signed worker failed')
        if result['source_manifest_sha256'] != cfg['manifest_sha256'] or result['tasks'] != cfg['tasks'] or len(result['artifacts']) != 1:
            raise ValueError('signed receipt identity differs')
        item=result['artifacts'][0]; path=root/'source'/item['path']
        if not path.resolve().is_relative_to(root/'source') or digest(path) != item['sha256']:
            raise ValueError('signed APK digest differs')
        if item['signer_sha256'] != OS_SIGNER or item['aapt2']['package'] != 'ai.wizards.os':
            raise ValueError('not the pinned Wizard OS release')
        evidence.update(status='ok',receipt_sha256=digest(root/'receipt.json'),artifact=item)
    except BaseException:
        evidence['error']=traceback.format_exc(); raise
    finally:
        write(root/'release-resume-receipt.json',evidence)
    return evidence


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('mode',choices=['prepare','verify','execute'])
    parser.add_argument('root',type=Path);parser.add_argument('--source-proof',type=Path);parser.add_argument('--qa-revision')
    parser.add_argument('--seal-sha256');args=parser.parse_args()
    if args.mode == 'prepare':
        if args.source_proof is None or args.qa_revision is None: parser.error('proof and QA revision required')
        result=prepare(args.root,args.source_proof,args.qa_revision)
    else:
        if not args.seal_sha256: parser.error('parent-pinned seal SHA required')
        result=verify(args.root,args.seal_sha256) if args.mode == 'verify' else execute(args.root,args.seal_sha256)
    print(json.dumps(result,indent=2,sort_keys=True))
