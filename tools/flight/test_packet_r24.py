"""Source-only R24 packaging guards; no native/browser/Docker execution."""
import ast, importlib.util, unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('packet24',HERE/'run-native-r24.py')
packet=importlib.util.module_from_spec(spec);spec.loader.exec_module(packet)
class R24Packet(unittest.TestCase):
 def test_exact_r23_rootfs_base(self):
  self.assertEqual(packet.BASE,'sha256:7af9d0c77ff96578f52635afe096c26a964d6715d43df965c6b1aabd535c8ff8')
  self.assertEqual(packet.WISDOM,'ec5c5f1df4165383113e534f1f773f7c5305e154')
  self.assertIn('FROM '+packet.BASE_TAG,(HERE/'Dockerfile.r24').read_text())
 def test_native_driver_unmodified_from_r23(self):
  # Existing R23 test also compares every driver function to R19.
  old=(HERE/'fixtures/r23-packet/native-r19.py.txt').read_text()
  now=(HERE/'native-flight.py').read_text()
  def functions(s):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)}
  a,b=functions(old),functions(now)
  self.assertTrue(a)
  for k,v in a.items():self.assertEqual(v,b[k],k)
 def test_append_only_image_full_config_and_assets(self):
  s=(HERE/'run-native-r24.py').read_text()
  for needle in ["==len(prior)+1","current['Config'][k]==v","current['Config']['Labels']==labels","actual==expected", "docker','save", "'Dockerfile.r24'"]:self.assertIn(needle,s)
 def test_no_runtime_in_verify_only(self):
  t=ast.parse((HERE/'run-native-r24.py').read_text())
  m=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='main')
  v=next(n for n in m.body if isinstance(n,ast.If) and ast.unparse(n.test)=='a.verify_only')
  self.assertIsInstance(v.body[-1],ast.Return)
  self.assertIn('WIZARD_HEAVY_LOCK_FD',ast.unparse(ast.Module(body=m.body[m.body.index(v)+1:],type_ignores=[])))
 def test_specific_old_negative_not_arbitrary_failure(self):
  s=(HERE/'run-native-r24.py').read_text()
  self.assertIn("negative.returncode==1",s)
  self.assertIn('loaded face leaves stale 13-page count',s)
  self.assertIn('0.2857142857142857',s)
 def test_docker_static_overlay_only(self):
  s=(HERE/'Dockerfile.r24').read_text()
  self.assertIn('COPY --chmod=a+rX wisdom/static/ /app/static/',s)
  self.assertFalse(any(x.startswith(('RUN ','USER ','ENTRYPOINT ','CMD ')) for x in s.splitlines()))
if __name__=='__main__':unittest.main()
