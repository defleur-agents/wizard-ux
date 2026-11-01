#!/usr/bin/env python3
"""Light controller seams, NOT native acceptance evidence."""
import ast,importlib.util,subprocess as sp,tempfile,unittest
from pathlib import Path
from unittest.mock import Mock,patch
ROOT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('transport',ROOT/'adb-transport.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class Contracts(unittest.TestCase):
 def test_read_only_retry_once(self):
  t=mod.Transport('/sdk/adb',{},ROOT);t.command=Mock(side_effect=[sp.CompletedProcess([],1,b'',b'device offline'),sp.CompletedProcess([],0,b'PNG',b'')]);t.recover=Mock()
  self.assertEqual(t.read('exec-out','screencap','-p'),b'PNG');t.recover.assert_called_once();self.assertEqual(t.command.call_count,2)
 def test_nontransport_failure_not_retried(self):
  t=mod.Transport('/sdk/adb',{},ROOT);t.command=Mock(return_value=sp.CompletedProcess([],1,b'',b'permission denied'));t.recover=Mock()
  with self.assertRaises(AssertionError):t.read('shell','cat x')
  t.recover.assert_not_called();self.assertEqual(t.command.call_count,1)
 def test_crashed_emulator_never_recovered(self):
  t=mod.Transport('/sdk/adb',{},ROOT);t.emulator=Mock();t.emulator.poll.return_value=-6;t.command=Mock()
  with self.assertRaises(AssertionError):t.recover()
  t.command.assert_not_called()
 def test_dead_server_never_replaced(self):
  t=mod.Transport('/sdk/adb',{},ROOT);t.emulator=Mock();t.emulator.poll.return_value=None;t.server=Mock();t.server.poll.return_value=1;t.command=Mock()
  with self.assertRaises(AssertionError):t.recover()
  t.command.assert_not_called()
 def test_recovery_budget(self):
  t=mod.Transport('/sdk/adb',{},ROOT);t.emulator=Mock();t.emulator.poll.return_value=None;t.server=Mock();t.server.poll.return_value=None;t.recoveries=2;t.command=Mock()
  with self.assertRaises(AssertionError):t.recover()
  t.command.assert_not_called()
 def recovery_controller(self):
  t=mod.Transport('/sdk/adb',{},ROOT);t.emulator=Mock();t.emulator.poll.return_value=None;t.server=Mock();t.server.poll.return_value=None
  t.command=Mock(side_effect=lambda *a,**kw:sp.CompletedProcess([],0,b'List of devices attached\n127.0.0.1:6169 offline\n' if a[0]=='devices' else b'device\n',b''));t.start_logcat=Mock();return t
 def test_recovery_preserves_identity_and_reverse(self):
  t=self.recovery_controller();t.identity={'pid':123};t.app_identity=Mock(return_value={'pid':123});t.reverse=('tcp:28543','tcp:28543');t.recover()
  calls=[c.args for c in t.command.call_args_list];self.assertIn(('reconnect','offline'),calls);self.assertIn(('reverse','tcp:28543','tcp:28543'),calls);self.assertFalse(any(x in str(calls) for x in ('install','force-stop','reboot','input tap')))
 def test_process_changed_during_recovery_fails(self):
  t=self.recovery_controller();t.identity={'pid':123};t.app_identity=Mock(return_value={'pid':124})
  with self.assertRaises(AssertionError):t.recover()
 def test_foreign_serial_blocks_reconnect(self):
  t=self.recovery_controller();t.command=Mock(return_value=sp.CompletedProcess([],0,b'List of devices attached\nother device\n',b''))
  with self.assertRaises(AssertionError):t.recover()
  self.assertEqual(t.command.call_count,1)
 def test_mutating_a_has_no_retry(self):
  tree=ast.parse((ROOT/'native-flight.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='a')
  self.assertFalse(any(isinstance(n,(ast.For,ast.While)) for n in ast.walk(fn)));self.assertNotIn('recover',ast.unparse(fn))
 def test_no_shared_kill_and_documented_pair(self):
  native=(ROOT/'native-flight.py').read_text();self.assertNotIn('kill-server',native);self.assertIn("'-ports','6168,6169'",native);self.assertIn("'ADB_SERVER_SOCKET':'tcp:127.0.0.1:5147'",native)
 def test_no_browser_in_native_runner(self):
  source=(ROOT/'run-native-r9.py').read_text();self.assertNotIn('browser_case',source);self.assertNotIn('qa-flight-offline.cjs',source)
if __name__=='__main__':unittest.main(verbosity=2)
