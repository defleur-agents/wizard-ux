#!/usr/bin/env python3
"""Small source/adapter unit tests. No GDB, VM, package or native execution."""
import ast, importlib.util, json, os, tempfile, unittest
from pathlib import Path
from unittest.mock import Mock
HERE=Path(__file__).resolve().parent

def load(name,filename):
    s=importlib.util.spec_from_file_location(name,HERE/filename);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
runner=load('r12_runner','run-diag-r12.py');adapter=load('r12_adapter','gdb_process_r12.py')
class SourceTests(unittest.TestCase):
    def test_transform_preserves_every_functional_statement(self):
        p=Path(os.environ['R12_TEST_NATIVE_SOURCE']);original=p.read_text();generated=runner.native_source(original)
        a=ast.parse(original);b=ast.parse(generated)
        # Sole non-launch differences are explicit nonacceptance labels/path + import.
        replacements=[('diagnostic-flight-completed-review-required','passed-needs-visual-inspection'),('diagnostic-native.json','acceptance.json')]
        s=generated.replace('from gdb_process_r12 import EmulatorProcess\n','')
        s=s.replace('emulator = EmulatorProcess(emulator_argv, ENV, OUT)',"emulator = sp.Popen(emulator_argv, env=ENV, stdout=(OUT/'emulator.log').open('w'), stderr=sp.STDOUT)")
        for old,new in replacements:s=s.replace(old,new)
        self.assertEqual(s,original)
        self.assertIn('for stability_index in range(20):',generated)
    def test_transform_fails_closed_on_drift(self):
        with self.assertRaises(AssertionError):runner.native_source('changed')
    def test_real_inferior_pid_not_gdb_pid(self):
        with tempfile.TemporaryDirectory(dir=os.environ['TMPDIR']) as t:
            out=Path(t);e=object.__new__(adapter.EmulatorProcess);e.out=out;e.returncode=None;e.gdb=Mock(pid=999);e.gdb.poll.return_value=None
            (out/'gdb-inferior.json').write_text(json.dumps({'pid':123,'qemu_inferior':True}))
            self.assertEqual(e.pid,123);self.assertIsNone(e.poll())
            (out/'gdb-inferior.json').write_text(json.dumps({'pid':456,'qemu_inferior':False}))
            self.assertIsNone(e.pid)
    def test_debugger_zero_is_not_native_success(self):
        with tempfile.TemporaryDirectory(dir=os.environ['TMPDIR']) as t:
            e=object.__new__(adapter.EmulatorProcess);e.out=Path(t);e.returncode=None;e.gdb=Mock();e.gdb.poll.return_value=0
            self.assertEqual(e.poll(),88)
    def test_sigsegv_classification_requires_qemu(self):
        with tempfile.TemporaryDirectory(dir=os.environ['TMPDIR']) as t:
            e=object.__new__(adapter.EmulatorProcess);e.out=Path(t);e.returncode=None;e.gdb=Mock();e.gdb.poll.return_value=None
            f=e.out/'gdb-fault.json';f.write_text(json.dumps({'signal':'SIGSEGV','qemu_inferior':False}));self.assertIsNone(e.poll())
            f.write_text(json.dumps({'signal':'SIGSEGV','qemu_inferior':True}));self.assertEqual(e.poll(),-11)
    def test_unstarted_cleanup_is_inert(self):
        with tempfile.TemporaryDirectory(dir=os.environ['TMPDIR']) as t:self.assertFalse(adapter.cleanup_owned_group(t)['started'])
if __name__=='__main__':unittest.main()
