#!/usr/bin/env python3
"""Preparation only on forum: copy immutable inputs into a one-use QA-only sibling.

Never submits, extracts a product tree, builds, signs, starts a guest or takes a lease.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tarfile
from qa_dictation_packet import verify, digest

PRODUCT = '28d2027bcda85a36ecfe4d304f4ed5d06ea58543'
ORIGINAL = Path('/srv/work/AndroidBuilds/qa/graphene-orb-28d2027b-20261102')
MEMBERS = ('qa_dictation_packet.py','qa_dictation_insertion_native.py','qa_queue_lease.py',
           'test_qa_queue_lease.py','test_qa_dictation_insertion_native.py','prepare_dictation_lease_packet.py')


def write(path, data):
    with path.open('x') as out:
        out.write(json.dumps(data,indent=2,sort_keys=True)+'\n')
    path.chmod(0o600)


def prepare(root, revision):
    if os.uname().nodename != 'forum': raise RuntimeError('forum preparation only')
    if not re.fullmatch('[0-9a-f]{40}',revision): raise ValueError('full QA revision required')
    root = root.resolve()
    if not root.is_relative_to(ORIGINAL.parent) or root == ORIGINAL or root.exists():
        raise ValueError('fresh sibling root required')
    if shutil.disk_usage(ORIGINAL).free < 240*1024**3:
        raise RuntimeError('200 GiB reserve plus 40 GiB pending allocation required')
    original_seal = json.loads((ORIGINAL/'seal.json').read_text())
    original = json.loads((ORIGINAL/'packet.json').read_text())
    if original['source_revision'] != PRODUCT or original_seal['source_revision'] != PRODUCT:
        raise ValueError('immutable product revision differs')
    preserved = dict(original_seal['files'])
    # The original release job is bound as immutable input only; never executed here.
    for name in ('seal.json','receipt.json','baseline-build-controller.log'):
        preserved[str(ORIGINAL/name)] = digest(ORIGINAL/name)
    preserved[original['baseline']['receipt']] = digest(original['baseline']['receipt'])
    for name, expected in preserved.items():
        if digest(name) != expected: raise ValueError('original seal drift: '+name)
    os.umask(0o077)
    root.mkdir(mode=0o700)
    (root/'jobs').mkdir(mode=0o700)
    (root/'scratch').mkdir(mode=0o700)
    for name in MEMBERS:
        shutil.copyfile(Path(__file__).parent/name,root/name)
        (root/name).chmod(0o600)
    config = copy.deepcopy(original)
    for lane in ('baseline','rejected','candidate'):
        old_job = Path(original['workers'][lane]['cwd'])
        job = root/'jobs'/lane
        job.mkdir(mode=0o700)
        for member in ('job.json','source.tar.gz','worker.py'):
            shutil.copyfile(old_job/member,job/member)
            (job/member).chmod(0o600)
            if digest(old_job/member) != digest(job/member): raise ValueError('copy drift')
        # Inspect only fixture archive bytes, without extracting source/ or running a worker.
        cfg = json.loads((job/'job.json').read_text())
        with tarfile.open(job/'source.tar.gz') as archive:
            for member, expected in original['control_overlay'].items():
                stream = archive.extractfile(member)
                if stream is None: raise ValueError('fixture is not a regular file: '+member)
                with stream:
                    if hashlib.sha256(stream.read()).hexdigest() != expected:
                        raise ValueError('fixture archive drift: '+lane+'/'+member)
        if hashlib.sha256(json.dumps(cfg['files'],sort_keys=True).encode()).hexdigest() != original[lane]['manifest_sha256']:
            raise ValueError('original manifest drift')
        config['workers'][lane] = {'argv':['/usr/bin/python3',str(job/'worker.py'),'--worker',str(job/'job.json')],
                                   'cwd':str(job),'config':str(job/'job.json')}
        config[lane]['receipt'] = str(job/'receipt.json')
    write(root/'packet.json',config)
    write(root/'custody.json',{'product_revision':PRODUCT,'qa_revision':revision,
          'original_packet':str(ORIGINAL/'packet.json'),'original_failed_packet':str(ORIGINAL),
          'original_failed_job':'heavy_5204f187522a4868acc22b98967085d7',
          'separate_release_job':'heavy_5fd87e966e3744d0991fe80d5abbfc31',
          'separate_release_job_untouched':True,'preserved_originals':preserved,
          'source_manifests':{lane:original[lane] for lane in ('baseline','rejected','candidate')},
          'fixture_hashes':original['control_overlay'],
          'qa_files':{name:digest(root/name) for name in MEMBERS},
          'scope':'queue-descriptor transport only; no product source changes',
          'handset_proven':False,'native_acceptance_executed':False})
    files = dict(preserved)
    for path in root.rglob('*'):
        if path.is_file(): files[str(path)] = digest(path)
    write(root/'seal.json',{'source_revision':PRODUCT,'qa_revision':revision,'files':files})
    # Lock-free static verification, not native execution or admission.
    verify(root)
    spec = {'host':'forum','lane':'heavy','key':'dictation-lease-'+revision,
            'cwd':str(root),'argv':['/usr/bin/env','PYTHONDONTWRITEBYTECODE=1',
            'TMPDIR='+str(root/'scratch'),'/usr/bin/python3',str(root/'qa_dictation_packet.py'),str(root),
            '--seal-sha256',digest(root/'seal.json')],'timeout_seconds':9000}
    write(root/'parent-only-spec.json',spec)
    write(root/'preparation.json',{'status':'prepared_not_submitted','product_revision':PRODUCT,'qa_revision':revision,
          'seal_sha256':digest(root/'seal.json'),'spec_sha256':digest(root/'parent-only-spec.json'),
          'originals_preserved':all(digest(name)==expected for name,expected in preserved.items()),
          'fresh_source_trees_absent':all(not (root/'jobs'/lane/'source').exists() for lane in config['workers']),
          'free_bytes':shutil.disk_usage(root).free,'reserve_bytes':200*1024**3,
          'native_acceptance_executed':False,'handset_proven':False})
    return spec


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path);parser.add_argument('--qa-revision',required=True)
    args=parser.parse_args();print(json.dumps(prepare(args.root,args.qa_revision),indent=2))
