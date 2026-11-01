"""Source-only R33 packet contract; never imports the native driver."""
import ast
from pathlib import Path
import unittest
R=Path(__file__).parent
class Packet(unittest.TestCase):
 def setUp(self):self.s=(R/'run-native-r33.py').read_text();ast.parse(self.s)
 def test_control_before_candidate_build(self):
  s=self.s[self.s.index('def main():'):]
  self.assertLess(s.index("arm('control-normal'"),s.index("arm('control-reciprocal'"));self.assertLess(s.index("arm('control-reciprocal'"),s.index('package(m)'));self.assertLess(s.index('package(m)'),s.index("arm('candidate-normal'"))
 def test_verify_has_no_runtime(self):
  tree=ast.parse(self.s);f=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='verify');text=ast.unparse(f)
  for banned in ('Popen','docker','emulator','arm('):self.assertNotIn(banned,text)
 def test_immutable_normal_driver(self):
  self.assertIn('if diagnostic:',self.s);self.assertIn("root/'native-flight.py'",self.s)
  self.assertNotIn('diagnostic_strict_record',self.s)
 def test_stop_and_flags(self):
  for token in ('STOP: native normal control','STOP: native reciprocal control','STOP: diagnostic candidate failed','STOP: candidate reciprocal','releaseAllowed=False','nativeAcceptance=False'):
   self.assertIn(token,self.s)
 def test_closure(self):
  for token in ('full runtime /app source closure mismatch','arm-inputs.json','emulator_ports_closed','adb_server_stopped','candidate-image.tar','runtipi_config_sha256'):self.assertIn(token,self.s)
 def test_parent_admission(self):
  for token in ('WIZARD_HEAVY_LOCK_FD','WIZARD_WORKER_LANE','canonical.st_ino','LOCK_EX|fcntl.LOCK_NB','one-use stage'):
   self.assertIn(token,self.s)
if __name__=='__main__':unittest.main()
