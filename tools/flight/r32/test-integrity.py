"""Run only source/integrity negative cases. Never starts fixture/browser."""
from pathlib import Path
import hashlib,json,subprocess,tempfile,shutil,sys,os
R=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='r32-integrity-',dir=os.environ['TMPDIR']) as d:
 T=Path(d)
 for name in ['run-r32.py','source-manifest.json']:shutil.copyfile(R/name,T/name)
 for label,digest,want in [('wrong-manifest','0'*64,'manifest drift'),('missing-member',sha(T/'source-manifest.json'),'member drift:')]:
  p=subprocess.run([sys.executable,T/'run-r32.py','--manifest-sha',digest,'--verify-only'],capture_output=True,text=True,timeout=10)
  assert p.returncode and want in p.stderr,(label,p.stdout,p.stderr)
  assert not (T/'evidence').exists()
 print(json.dumps({'status':'PASS-negative-source-integrity','cases':['wrong manifest rejected before tooling','missing manifest member rejected before tooling'],'browsersStarted':0,'fixturesStarted':0}))
