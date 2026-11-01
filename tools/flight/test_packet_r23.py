"""Source-only packet guards. No browser, fixture server, Docker build or VM."""
import ast, copy, hashlib, importlib.util, io, json, os, tarfile, tempfile, unittest
from pathlib import Path
import reader_boundary_r17 as boundary
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('packet',HERE/'run-native-r23.py')
packet=importlib.util.module_from_spec(spec);spec.loader.exec_module(packet)

def tree_functions(path):
    return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(path.read_text()).body
            if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}

class Packet(unittest.TestCase):
    def test_reader_pin_renderer_controls_unchanged(self):
        old=tree_functions(HERE/'fixtures/r23-packet/native-r19.py.txt')
        new=tree_functions(HERE/'native-flight.py')
        self.assertEqual(set(new)-set(old),{'cache_inventory'})
        self.assertTrue(old)
        for name in old:self.assertEqual(old[name],new[name],name)
    def test_no_legacy_inheritance_called(self):
        t=ast.parse((HERE/'run-native-r23.py').read_text())
        calls=[n.func.attr for n in ast.walk(t) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)]
        self.assertNotIn('verify_inherited',calls)
        self.assertIn('verify_native',calls)
    def test_docker_overlay_has_no_user_or_ownership_changes(self):
        docker=(HERE/'Dockerfile.r23').read_text()
        self.assertIn('FROM wisdom-r23-base:32ebac204db4',docker)
        self.assertIn('COPY --chmod=a+rX wisdom/static/ /app/static/',docker)
        self.assertNotIn('--chown',docker)
        self.assertFalse(any(l.startswith(('RUN ','USER ','ENTRYPOINT ','CMD ')) for l in docker.splitlines()))
    def test_exact_rgb_and_total_still_fail(self):
        before={'pair':[5,13],'crop':[0,207,1080,2031],'body_rgb_sha256':'unit-a'}
        with self.assertRaises(AssertionError):boundary.compare(before,{**before,'pair':[5,15]})
        with self.assertRaises(AssertionError):boundary.compare(before,{**before,'body_rgb_sha256':'unit-b'})
    def test_extra_progress_receipt_not_miscounted_as_duplicate_highlight(self):
        i='test-id';path='/wisdom/api/wisdom/highlight'
        r={'writes':[{'path':path,'offline_id':i}]*2,
           'offline_receipt_rows':[{'id':i,'path':'/api/wisdom/highlight'},
                                   {'id':'unrelated-progress','path':'/api/wisdom/reaction'}],
           'lost_ack':{'id':i,'path':path},'state':{'highlights':[{'entry_id':'flight-chapter'}],
           'entries':[{'id':'flight-chapter','progress':29}]}}
        self.assertEqual(boundary.replay(r,[5,15])['receipt_count_for_id_path'],1)
        r['offline_receipt_rows'].append({'id':i,'path':'/api/wisdom/highlight'})
        with self.assertRaises(AssertionError):boundary.replay(r,[5,15])
    def test_image_copy_inventory_hashes_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as d:
            p=Path(d)/'static.tar'; raw=b'unit-only-static'
            with tarfile.open(p,'w') as t:
                n=tarfile.TarInfo('static/app.js');n.size=len(raw);t.addfile(n,io.BytesIO(raw))
            self.assertEqual(packet.assets_from_copy(p),{'static/app.js':hashlib.sha256(raw).hexdigest()})
            with tarfile.open(p,'w') as t:
                n=tarfile.TarInfo('static/escape');n.type=tarfile.SYMTYPE;n.linkname='/outside';t.addfile(n)
            with self.assertRaises(AssertionError):packet.assets_from_copy(p)
    def make_source(self,d):
        root=Path(d)
        for p in ('ux','wisdom','qa-source'):(root/p).mkdir()
        apk=root/'current-release.apk';apk.write_bytes(b'unit-apk');apk.chmod(0o644)
        m={'shell_candidate':packet.SHELL,'wisdom_candidate':packet.WISDOM,
           'runtime_web_tree':packet.WEB,'source_counts':{'ux':0,'wisdom':0,'qa-source':0},
           'acceptance':{k:False for k in ('native','image','release','live_parity','visual')},
           'apk':{'sha256':packet.sha(apk)},'members':{
           'current-release.apk':{'mode':'100644','posix_mode':'0o644','sha256':packet.sha(apk)}}}
        packet.write(root/'source-manifest.json',m)
        return root,packet.sha(root/'source-manifest.json')
    def test_wrong_sha_fails_before_metadata_or_runtime(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as d:
            root,digest=self.make_source(d)
            with self.assertRaisesRegex(AssertionError,'manifest digest mismatch'):packet.verify(root,'0'*64)
            self.assertFalse((root/'evidence').exists())
    def test_changed_source_fails(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as d:
            root,digest=self.make_source(d);packet.verify(root,digest)
            (root/'current-release.apk').write_bytes(b'changed')
            with self.assertRaisesRegex(AssertionError,'source digest mismatch'):packet.verify(root,digest)
    def test_extra_export_file_fails(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as d:
            root,digest=self.make_source(d);(root/'ux/untracked').write_text('extra')
            with self.assertRaisesRegex(AssertionError,'unexpected source'):packet.verify(root,digest)
    def test_verify_only_returns_before_lease_and_actions(self):
        main=next(n for n in ast.parse((HERE/'run-native-r23.py').read_text()).body
                  if isinstance(n,ast.FunctionDef) and n.name=='main')
        branch=next(n for n in main.body if isinstance(n,ast.If) and ast.unparse(n.test)=='a.verify_only')
        self.assertTrue(any(isinstance(n,ast.Return) for n in branch.body))
        later=main.body[main.body.index(branch)+1:]
        self.assertIn('WIZARD_HEAVY_LOCK_FD',ast.unparse(ast.Module(body=later,type_ignores=[])))
    def test_fixture_body_unchanged(self):
        def body(path):
            return next(ast.dump(n,include_attributes=False) for n in ast.parse(path.read_text()).body
                        if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='body' for t in n.targets))
        self.assertEqual(body(HERE/'native-fixture-r17.py'),body(HERE/'fixtures/r23-packet/fixture-r19.py.txt'))

if __name__=='__main__':unittest.main()
