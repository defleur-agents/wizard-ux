"""Source-only R13 guards. Synthetic logs are unit fixtures, not native proof."""
import ast,importlib.util,unittest
from pathlib import Path
T=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('renderer_r13',T/'renderer_r13.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
LOG='INFO | emuglConfig_init: vulkan_mode_selected:lavapipe gles_mode_selected:angle\nINFO | Graphics Adapter ANGLE (Mesa, llvmpipe (LLVM), Vulkan)\n'
MAPS='0000-9999 r-xp 00000000 00:00 0 /sdk/lib64/vulkan/libvulkan_lvp.so\n'
class GuardTests(unittest.TestCase):
 def test_selected_mesa(self):self.assertTrue(m.validate_backend(LOG,MAPS)['accepted'])
 def test_missing_selection(self):
  with self.assertRaises(AssertionError):m.validate_backend('lavapipe requested only',MAPS)
 def test_old_selection(self):
  with self.assertRaises(AssertionError):m.validate_backend(LOG.replace('gles_mode_selected:angle','gles_mode_selected:swiftshader'),MAPS)
 def test_wrong_vulkan(self):
  with self.assertRaises(AssertionError):m.validate_backend(LOG.replace('vulkan_mode_selected:lavapipe','vulkan_mode_selected:swiftshader'),MAPS)
 def test_old_library(self):
  with self.assertRaises(AssertionError):m.validate_backend(LOG,MAPS+'/sdk/lib64/gles_swiftshader/libGLESv2.so\n')
 def test_missing_lvp(self):
  with self.assertRaises(AssertionError):m.validate_backend(LOG,'')
 def test_missing_adapter(self):
  with self.assertRaises(AssertionError):m.validate_backend(LOG.splitlines()[0],MAPS)
 def test_no_fake_runtime_proof(self):
  text=(T/'run-native-r13.py').read_text();self.assertIn("report['native_acceptance']=True",text)
  self.assertLess(text.index('gate.verify_native(R,m)'),text.index("report['native_acceptance']=True"))
  self.assertLess(text.index('renderer_r13.verify_evidence'),text.index("report['native_acceptance']=True"))
 def test_original_functional_records_preserved(self):
  import subprocess
  old=subprocess.check_output(['git','-C',str(T),'show','e42830b5d1e3d099527975e4aaefca907b60fd2e:tools/flight/native-flight.py'],text=True)
  def rows(src):return [ast.dump(x,include_attributes=False) for x in ast.walk(ast.parse(src)) if isinstance(x,ast.Call) and isinstance(x.func,ast.Name) and x.func.id=='record']
  oldrows=rows(old);newrows=rows((T/'native-flight.py').read_text())
  for row in oldrows:self.assertIn(row,newrows)
  self.assertEqual(len(newrows),len(oldrows)+3)
 def test_only_backend_argv_changed(self):
  import subprocess
  old=subprocess.check_output(['git','-C',str(T),'show','e42830b5d1e3d099527975e4aaefca907b60fd2e:tools/flight/native-flight.py'],text=True)
  def argv(src):
   return next(x.value for x in ast.walk(ast.parse(src)) if isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='emulator_argv' for t in x.targets))
  a=argv(old);b=argv((T/'native-flight.py').read_text())
  for n in ast.walk(a):
   if isinstance(n,ast.Constant) and n.value=='swiftshader':n.value='lavapipe'
  self.assertEqual(ast.dump(a,include_attributes=False),ast.dump(b,include_attributes=False))
if __name__=='__main__':unittest.main()
