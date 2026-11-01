"""Focused source-only regressions; synthetic snapshots are NOT native evidence."""
import ast
import copy
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
import egress_r15 as e
import test_renderer_r14 as renderer_tests
T=Path(__file__).resolve().parent
F=T/'fixtures/r14-egress'
UID=10209

def snapshot(family=4,count=0):
    reason='icmp-port-unreachable' if family==4 else 'icmp6-port-unreachable'
    return ('*filter\n:OUTPUT ACCEPT [0:0]\n:WISDOM_QA_EGRESS - [0:0]\n'
            '[0:0] -A OUTPUT -m owner --uid-owner 10209 -j WISDOM_QA_EGRESS\n'
            '[0:0] -A OUTPUT -j oem_out\n'
            f'[{count}:80] -A WISDOM_QA_EGRESS ! -o lo -j REJECT --reject-with {reason}\nCOMMIT\n')

def tables(count=0):return {str(f):snapshot(f,count) for f in (4,6)}
def route():return {'returncode':2,'stdout':'uid=10209(u0_a209) gid=10209(u0_a209)\n','stderr':'RTNETLINK answers: Network is unreachable\n'}
def probe():return {'returncode':1,'stdout':(F/'transport-command-00057.stdout').read_text(),'stderr':(F/'transport-command-00057.stderr').read_text()}

def original():
    return subprocess.check_output(['git','-C',str(T),'show','a57056e3fd117fdc393ef36db3f43ffed568e410:tools/flight/native-flight.py'],text=True)

class EgressTests(unittest.TestCase):
    def test_recorded_failure_is_enetunreach_not_parser_bug(self):
        import re
        p=probe(); self.assertEqual(p['stderr'].strip(),'nc: connect: Network is unreachable')
        counters=(F/'transport-command-00058.stdout').read_text()
        hits=[int(m[1]) for m in re.finditer(r'^\s*(\d+)\s+\d+\s+REJECT\b',counters,re.M)]
        self.assertEqual(hits,[0,0])
        actual=json.loads((F/'transport-command-00057.json').read_text())
        self.assertIn('192.0.2.1 443',actual['argv'][-1])
    def test_real_fixture_hashes(self):
        manifest=json.loads((F/'provenance.json').read_text())
        for name,digest in manifest['files'].items():self.assertEqual(hashlib.sha256((F/name).read_bytes()).hexdigest(),digest)
    def test_explicit_no_route_accepted_without_claiming_counter(self):
        verdict=e.classify(UID,tables(),tables(),probe(),route())
        self.assertEqual(verdict['mechanism'],'kernel-network-unreachable-before-filter')
        self.assertEqual(verdict['new_reject_packets'],0)
    def test_real_counter_delta_path(self):
        p=probe();p['stderr']='nc: connect: Connection refused\n'
        v=e.classify(UID,tables(),tables(1),p,route())
        self.assertEqual(v['mechanism'],'firewall-reject-counter-increased');self.assertEqual(v['new_reject_packets'],2)
    def test_zero_counter_without_route_proof_fails(self):
        for message in ('','Unknown command uid','ip: bad argument uid','RTNETLINK answers: Permission denied'):
            r=route();r['stderr']=message
            with self.assertRaises(ValueError):e.classify(UID,tables(),tables(),probe(),r)
    def test_zero_counter_generic_probe_errors_fail(self):
        for message in ('','nc: not found','nc: connect: Connection refused','nc: connect: Network is unreachable\nextra error'):
            p=probe();p['stderr']=message
            with self.assertRaises(ValueError):e.classify(UID,tables(),tables(),p,route())
    def test_success_wrong_uid_and_command_failure_fail(self):
        for key,val in [('returncode',0),('returncode',127),('stdout','uid=0(root)\nprobe_status=1\n'),('stdout','uid=102090(app)\nprobe_status=1\n'),('stdout','uid=10209(app)\nprobe_status=0\n')]:
            p=probe();p[key]=val
            with self.assertRaises(ValueError):e.classify(UID,tables(),tables(1),p,route())
    def test_guard_absent_reordered_weakened_or_extra_rules_fail(self):
        text=snapshot()
        bad=[text.replace('--uid-owner 10209','--uid-owner 10210'),text.replace('! -o lo','-o lo'),text.replace('! -o lo','! -o lo -d 192.0.2.1'),text.replace('-j REJECT','-j ACCEPT'),text.replace('COMMIT',''),text.replace('[0:0] -A OUTPUT -m owner','[0:0] -A OUTPUT -j ACCEPT\n[0:0] -A OUTPUT -m owner'),text.replace('COMMIT','[0:0] -A WISDOM_QA_EGRESS -j ACCEPT\nCOMMIT')]
        for value in bad:
            for side in ('before','after'):
                b=tables();a=tables();(b if side=='before' else a)['4']=value
                with self.assertRaises(ValueError):e.classify(UID,b,a,probe(),route())
    def test_v6_missing_and_counters_reset_fail(self):
        t=tables();t['6']=''
        with self.assertRaises(ValueError):e.classify(UID,tables(),t,probe(),route())
        with self.assertRaises(ValueError):e.classify(UID,tables(2),tables(1),probe(),route())
    def test_historical_counter_not_new_counter(self):
        p=probe();p['stderr']='nc: connect: Connection refused'
        with self.assertRaises(ValueError):e.classify(UID,tables(4),tables(4),p,route())
    def test_independent_gate_requires_all_phases_and_recomputes(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp);checks=[]
            for phase in e.PHASES:
                row={'uid':UID,'before':tables(),'after':tables(),'probe':probe(),'route':route()}
                row['verdict']=e.classify(UID,row['before'],row['after'],row['probe'],row['route'])
                (out/('egress-'+phase+'.json')).write_text(json.dumps(row))
                checks.append({'name':'app external egress impossible '+phase,'pass':True,'detail':row['verdict']})
            self.assertTrue(e.verify_evidence(out,checks))
            with self.assertRaises(ValueError):e.verify_evidence(out,checks[:-1])
            row=json.loads((out/'egress-after-flight.json').read_text())
            row['verdict']['mechanism']='counter-passed'
            (out/'egress-after-flight.json').write_text(json.dumps(row))
            with self.assertRaises(ValueError):e.verify_evidence(out,checks)
    def test_all_functional_code_and_renderer_unchanged(self):
        old=ast.parse(original());new=ast.parse((T/'native-flight.py').read_text())
        # Whitelist only the old flaky probe block and added QA proof calls/helper.
        oldblock="Documentation-only address cannot receive traffic"
        class Normalize(ast.NodeTransformer):
            def visit_Import(self,node):return None if any(a.name=='egress_r15' for a in node.names) else node
            def visit_FunctionDef(self,node):return None if node.name=='verify_app_egress' else self.generic_visit(node)
            def visit_Assign(self,node):
                if any(isinstance(x,ast.Name) and x.id in ('probe','counters','rejected') for x in node.targets):return None
                return self.generic_visit(node)
            def visit_Expr(self,node):
                text=ast.unparse(node)
                if ('device-egress-probe.txt' in text or text.startswith('verify_app_egress(') or
                    'app UID external SYN rejected by actual firewall counter' in text or
                    'independent complete egress evidence verified' in text):return None
                return self.generic_visit(node)
        self.assertEqual(ast.dump(Normalize().visit(old),include_attributes=False),ast.dump(Normalize().visit(new),include_attributes=False))
    def test_probe_guard_precedes_launch_and_no_policy_bypass(self):
        s=(T/'native-flight.py').read_text()
        self.assertLess(s.index("verify_app_egress(uid,'before-launch')"),s.index("shell('am start -W -a android.intent.action.VIEW"))
        for phase in e.PHASES:self.assertIn("verify_app_egress(uid,'"+phase+"')",s)
        self.assertIn("transport.command('shell',text,timeout=15)",s)

class RendererTests(renderer_tests.GuardTests):
    # Same actual SWANGLE gates and emulator argv; only intentional egress delta differs.
    def test_original_functional_records_preserved(self):
        EgressTests('test_all_functional_code_and_renderer_unchanged').test_all_functional_code_and_renderer_unchanged()
    def test_no_fake_runtime_proof(self):
        s=(T/'run-native-r15.py').read_text()
        for call in ('gate.verify_native(R,m)','renderer_r14.verify_evidence','egress_r15.verify_evidence'):
            self.assertLess(s.index(call),s.index("report['native_acceptance']=True"))
if __name__=='__main__':unittest.main()
