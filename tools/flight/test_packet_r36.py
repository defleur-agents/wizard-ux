#!/usr/bin/env python3
"""Source QA only. Fake Python children test deadlines, never native outcomes."""
import copy,hashlib,importlib.util,json,os,signal,subprocess as sp,sys,tempfile,time,unittest
from pathlib import Path
R=Path(sys.argv.pop(1)).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('r36',R/'run-native-r36.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class Packet(unittest.TestCase):
 def test_budget(self):self.assertEqual(sum(mod.BUDGET.values()),2600);self.assertEqual(mod.BUDGET['normal'],2200)
 def test_exact_driver(self):self.assertEqual(mod.sha(R/'template/native-flight.py'),mod.DRIVER)
 def reject(self,mutate):
  with tempfile.TemporaryDirectory(prefix='r36-source-',dir=R.parent) as d:
   t=Path(d)
   for p in R.iterdir():
    if p.name!='source-manifest.json':(t/p.name).symlink_to(p,target_is_directory=p.is_dir())
   m=copy.deepcopy(json.loads((R/'source-manifest.json').read_text()));mutate(m)
   (t/'source-manifest.json').write_text(json.dumps(m));old=mod.R;mod.R=t
   try:
    with self.assertRaises((AssertionError,FileNotFoundError)):mod.verify(mod.sha(t/'source-manifest.json'))
    self.assertFalse((t/'evidence').exists());self.assertFalse((t/'runs').exists())
   finally:mod.R=old
 def test_wrong_manifest(self):
  with self.assertRaisesRegex(AssertionError,'manifest digest'):mod.verify('0'*64)
 def test_missing_member(self):self.reject(lambda m:m['members'].update({'missing-required-member':'0'*64}))
 def test_wrong_candidate(self):self.reject(lambda m:m.update(candidate='f'*40))
 def test_wrong_base(self):self.reject(lambda m:m.update(control='f'*40))
 def test_wrong_control_hash(self):self.reject(lambda m:m['external_members'].update({m['control_archive']:'0'*64}))
 def test_image_alias(self):self.reject(lambda m:m.update(control_image='wisdom:latest'))
 def test_timeout_stack_and_owned_cleanup(self):
  with tempfile.TemporaryDirectory(prefix='r36-timeout-',dir=R.parent) as d:
   p=Path(d);driver=p/'blocked.py'
   driver.write_text("import subprocess as sp,sys,time\nfrom pathlib import Path\nchild=sp.Popen([sys.executable,'-c','import time;time.sleep(20)'])\nPath('child.pid').write_text(str(child.pid))\ntry:\n print('PHASE blocked-synthetic-child',flush=True)\n time.sleep(20)\nfinally:\n child.terminate();child.wait(timeout=1)\n")
   with (p/'log').open('w') as log:
    proc=sp.Popen([sys.executable,'-B',R/'native-entry-r36.py',driver,mod.sha(driver),'60.1'],cwd=p,stdout=log,stderr=sp.STDOUT,start_new_session=True)
    with self.assertRaises(sp.TimeoutExpired):mod.supervise(proc,.4,grace=.3)
   text=(p/'log').read_text();self.assertIn('PHASE blocked-synthetic-child',text);self.assertIn('Timeout',text);self.assertIn('blocked.py',text);self.assertNotEqual(proc.returncode,0)
   child=int((p/'child.pid').read_text())
   # A dead reparented zombie may briefly remain; never a live child.
   status=Path('/proc')/str(child)/'stat'
   if status.exists():self.assertEqual(status.read_text().split()[2],'Z')
 def test_early_exit_no_idle_wait(self):
  started=time.monotonic();p=sp.Popen([sys.executable,'-c','pass'],start_new_session=True)
  self.assertEqual(mod.supervise(p,2200),0);self.assertLess(time.monotonic()-started,2)
if __name__=='__main__':unittest.main(verbosity=2)
