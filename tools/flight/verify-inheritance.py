#!/usr/bin/env python3
"""Read-only mixed-source gate. R8 remains FAILED overall; inherit only named
passed phases. R9 cannot pass without a real fresh complete native receipt.
"""
import hashlib,json,os
from pathlib import Path
PHASES=('api_smoke','baseline','phone','desktop','phone_appearance','phone_back','desktop_appearance','desktop_back')
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def read(p):return json.loads(Path(p).read_text())
def safe(root,name):
 p=Path(name);assert not p.is_absolute() and '..' not in p.parts,name
 f=Path(root)/p;assert f.resolve().is_relative_to(Path(root).resolve()),name
 return f
def verify_inherited(root,manifest,prior_override=None):
 root=Path(root);link=read(root/'inheritance-r8.json');prior=Path(prior_override or link['stage'])
 assert sha(prior/'source-manifest.json')==link['manifest_sha256']
 assert sha(prior/'evidence/acceptance.json')==link['acceptance_sha256']
 old=read(prior/'source-manifest.json');report=read(prior/'evidence/acceptance.json')
 assert report['status']=='failed' and set(report['phase_failures'])=={'native'}
 assert report['source_manifest_sha256']==link['manifest_sha256']
 assert report['sources']=={k:v for k,v in old.items() if k.endswith(('candidate','base'))}
 assert manifest['wisdom_candidate']==old['wisdom_candidate']
 assert manifest['apk']==old['apk'] and sha(root/'current-release.apk')==old['apk']['sha256']
 # All product bytes (including Android), not just the renderer. QA-only tools
 # may change; no browser fixture/driver is allowed to drift under inheritance.
 for name,meta in old['export_members'].items():
  if name.startswith('ux/tools/flight/'):continue
  assert manifest['export_members'][name]==meta,'product/export drift: '+name
 assert {k for k in manifest['export_members'] if not k.startswith('ux/tools/flight/')}=={k for k in old['export_members'] if not k.startswith('ux/tools/flight/')}
 # Bind all retained images/logs/receipts, not just status words. Old native
 # failure is preserved as evidence but never included as a passed gate.
 for name,meta in link['evidence_files'].items():assert sha(safe(prior,name))==meta['sha256'],name
 checks={}
 for name in PHASES:
  row=report['checks'][name];f=safe(prior,row['receipt']);assert sha(f)==row['sha256']
  body=read(f);assert body['sourceManifest']==str(prior/'source-manifest.json') or prior_override
  if name=='baseline':
   assert row['status']=='expected-red' and body['status']=='failed'
   assert body['checks']['ASSERT_REACHED']=='no offline popups anywhere' and body['checks']['baselinePopup']['visible'] is True
  else:assert row['status']==body['status']=='pass'
  if name in ('phone','desktop'):
   for field in ('zeroWidthFiniteProgress','offlineWritesDurable','secondProcessDeathRetained','quotaFailureNeverClaimsSaved','siblingWorkspaceCachesPreserved','exactProgressPersistence','exactlyOnceReplay'):
    assert body['checks'][field],(name,field)
  if name.endswith('appearance'):assert body['checks']['skins']==['obsidian','obsidian-light'] and body['checks']['opaqueTextPanels'] is True
  if name.endswith('back'):assert body['checks']['nestedAndRootBack'] is True
  checks[name]={**row,'inherited':True,'source_job':link['job'],'source_stage':link['stage'],'source_manifest_sha256':link['manifest_sha256']}
 log=(prior/'evidence/sender-controller.log').read_text();assert 'Ran 78 tests' in log and log.rstrip().endswith('OK')
 assert report['checks']['sender_controller']['status']=='pass'
 checks['sender_controller']={'status':'pass','inherited':True,'source_job':link['job'],'source_stage':link['stage'],'receipt':'evidence/sender-controller.log','sha256':sha(prior/'evidence/sender-controller.log')}
 assert report['image']['id']==link['image_id'] and report['image']['tar_sha256']==link['image_tar_sha256']
 assert sha(root/'artifacts/wisdom-candidate-image.tar')==link['image_tar_sha256']
 assert sha(root/'Dockerfile.flight')==report['image_build']['dockerfile_sha256']
 static={k[len('wisdom/'):]:v['sha256'] for k,v in manifest['export_members'].items() if k.startswith('wisdom/static/') and v['mode']!='120000'}
 assert static==report['image']['assets']
 return {'link':link,'checks':checks,'image':report['image'],'image_build':report['image_build'],'image_reuse':report['image_reuse']}
def verify_native(root,manifest):
 import egress_r15
 import reader_boundary_r17
 root=Path(root);f=root/'evidence/native/acceptance.json';n=read(f)
 assert egress_r15.verify_evidence(root/'evidence/native',n['checks'])
 assert reader_boundary_r17.verify_evidence(root/'evidence/native',n['checks'])
 assert n['status']=='passed-needs-visual-inspection' and not n.get('failure') and not n.get('cleanup_error')
 assert n['source_manifest_sha256']==sha(root/'source-manifest.json') and n['source_revision']==manifest['shell_candidate']
 assert n['apk']=={k:manifest['apk'][k] for k in ('sha256','version','versionCode')}
 assert n['checks'] and n['passed']==n['total']==len(n['checks']) and all(c['pass'] is True for c in n['checks'])
 assert len([c for c in n['checks'] if c['name'].startswith('Connect transport stability ')])==20
 for field in ('emulator_stopped','fixture_stopped','adb_server_stopped','monitor_alive_at_cleanup','emulator_ports_closed'):assert n['cleanup'][field] is True
 assert n['logcat_alive_before_cleanup'] is True
 assert n['emulator_pre_cleanup_returncode'] is None,'emulator died before cleanup'
 assert (root/'evidence/native/transport-monitor.jsonl').stat().st_size>0
 assert list((root/'evidence/native').glob('continuous-logcat-*.txt'))
 required=('native OS-confirmed Wisdom shortcut exists','Wisdom renders offline rather than ReachScreen','offline chapter title readable','offline chapter has readable text','highlight survives offline process death','native retained edits reconnect exactly once','native reading progress survives and syncs','same native pin identity retained','repeated native root Back never exits')
 names={c['name'] for c in n['checks']};assert set(required)<=names
 return {'status':n['status'],'inherited':False,'source_stage':str(root),'receipt':'evidence/native/acceptance.json','receipt_sha256':sha(f)}
