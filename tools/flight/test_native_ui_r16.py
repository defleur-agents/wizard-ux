"""Pure XML/source tests. Generated transition variants are NOT native evidence."""
import hashlib
import json
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
import native_ui_r16 as u

T=Path(__file__).resolve().parent
F=T/'fixtures/r15-onboarding'
RAW=(F/'FAIL.xml').read_text()

def variant(stage=None, skip=True, orb=True):
    root=ET.fromstring(RAW)
    parents={c:p for p in root.iter() for c in p}
    welcome=next(n for n in root.iter('node') if u.label(n)=='Welcome')
    if stage is None:
        parents[welcome].remove(welcome)
    else:
        title=next(n for n in welcome.iter('node') if u.label(n)=='Name your Wizard')
        title.set('text',stage)
        if not skip:
            n=next(n for n in welcome.iter('node') if u.label(n)=='Skip this step')
            parents[n].remove(n)
    if not orb:
        for n in root.iter('node'):
            if u.label(n).startswith('Wizard orb.'):
                n.set('bounds','[0,0][0,0]')
    return ET.tostring(root,encoding='unicode')

def small(nodes):
    root=ET.Element('hierarchy')
    for attrs in nodes:
        ET.SubElement(root,'node',{'bounds':'[10,20][110,120]','enabled':'true','clickable':'true',**attrs})
    return ET.tostring(root,encoding='unicode')

class NativeUiTests(unittest.TestCase):
    def test_exact_observed_r15_hash_and_old_regex_miss(self):
        self.assertEqual(hashlib.sha256((F/'FAIL.xml').read_bytes()).hexdigest(),'e3e8a2bbd247c542b654c57fbe32d663e6cdad9850e94ab00a42f753ab8e68ed')
        self.assertIsNone(u.target(r'^(Skip|Got it|GOT IT|OK|Not now)$',RAW))
    def test_observed_name_skip_bounds(self):
        self.assertEqual(u.onboarding(RAW),('welcome-name-skip',(540,1975)))
    def test_modal_blocks_underlying_real_orb(self):
        self.assertIsNotNone(u.target(u.ORB,RAW))
        self.assertNotEqual(u.onboarding(RAW)[0],'ready')
    def test_zero_bounds_ignored(self):
        self.assertIsNone(u.target('^Wisdom$',RAW))
        self.assertEqual(u.onboarding(variant(orb=False)),('waiting',None))
    def test_visible_match_after_hidden_match(self):
        raw=small([{'text':'Wisdom','bounds':'[0,0][0,0]'}, {'text':'Wisdom'}])
        self.assertEqual(u.target('^Wisdom$',raw),(60,70))
    def test_explicit_hidden_ancestor(self):
        raw='<hierarchy><node visible-to-user="false"><node text="Wisdom" bounds="[1,1][20,20]"/></node></hierarchy>'
        self.assertIsNone(u.target('Wisdom',raw))
    def test_disabled_skip_not_clicked(self):
        root=ET.fromstring(RAW)
        next(n for n in root.iter('node') if u.label(n)=='Skip this step').set('enabled','false')
        self.assertEqual(u.onboarding(ET.tostring(root,encoding='unicode')),('welcome-back:Name your Wizard',None))
    def test_all_frozen_welcome_stages_use_back_not_send(self):
        for title in u.WELCOME:
            with self.subTest(title=title):
                self.assertEqual(u.onboarding(variant(title,skip=False)),('welcome-back:'+title,None))
    def test_observed_modal_sequence_skip_then_back_then_close(self):
        states=iter([RAW,variant('Pick a skin'),variant('Pick a skin'),RAW,RAW,variant(),variant(),variant()])
        actions=[];saved=[]
        result=u.dismiss_onboarding(lambda:next(states),lambda xy:actions.append(('tap',xy)),lambda:actions.append(('back',)),lambda *a:saved.append(a),lambda _:None)
        self.assertEqual(result,(542,1998))
        self.assertEqual(actions,[('tap',(540,1975)),('back',),('back',)])
        self.assertEqual([x[1] for x in saved],['welcome-name-skip','welcome-back:Pick a skin','welcome-back:Name your Wizard','ready'])
    def test_no_replay_of_stuck_skip(self):
        actions=[]
        with self.assertRaises(TimeoutError):
            u.dismiss_onboarding(lambda:RAW,lambda xy:actions.append(xy),lambda:None,lambda *a:None,lambda _:None,transition_polls=2)
        self.assertEqual(len(actions),1)
    def test_unknown_welcome_fails_closed(self):
        with self.assertRaises(ValueError):u.onboarding(variant('Unknown setup'))
    def test_permission_deny_scoped_to_controller_id(self):
        for package in ('com.android.permissioncontroller','com.google.android.permissioncontroller'):
            raw=small([{'package':package,'resource-id':package+':id/permission_deny_button','text':'Don’t allow'}])
            self.assertEqual(u.onboarding(raw),('permission-deny',(60,70)))
    def test_unknown_permission_not_generic_ok(self):
        with self.assertRaises(ValueError):u.onboarding(small([{'package':'com.android.permissioncontroller','text':'OK'}]))
    def test_app_permission_lookalike_not_denied(self):
        self.assertEqual(u.onboarding(small([{'package':u.PKG,'text':'Don’t allow','resource-id':u.PKG+':id/permission_deny_button'}])),('waiting',None))
    def test_tour_skip_is_exact_not_record_send(self):
        raw='<hierarchy><node text="Learn Wizard OS" class="android.app.Dialog" package="ai.wizards.os" bounds="[0,0][1000,2000]"><node text="Skip tour" clickable="true" enabled="true" package="ai.wizards.os" bounds="[10,20][110,120]"/></node></hierarchy>'
        self.assertEqual(u.onboarding(raw),('tour-skip',(60,70)))
    def test_app_pin_cta_never_os_confirmation(self):
        self.assertIsNone(u.os_pin_target(small([{'text':'Add to home screen','package':u.PKG}])))
    def test_system_launcher_confirmation_only(self):
        raw=small([{'text':'Add to home screen','package':u.PKG}, {'text':'Add automatically','package':'com.google.android.apps.nexuslauncher','bounds':'[30,40][130,140]'}])
        self.assertEqual(u.os_pin_target(raw),(80,90))
    def test_ambiguous_confirmation_fails_closed(self):
        with self.assertRaises(ValueError):u.os_pin_target(small([{'text':'Add','package':'com.android.launcher3'},{'text':'Add automatically','package':'com.android.launcher3','bounds':'[200,200][300,300]'}]))
    def test_no_native_or_product_execution(self):
        s=(T/'native_ui_r16.py').read_text()
        for forbidden in ('subprocess','localStorage','evaluateJavascript','adb '):self.assertNotIn(forbidden,s)
    def test_exact_r15_source_delta_and_records_retained(self):
        import ast
        old=(F/'native-flight.py.txt').read_text();s=(T/'native-flight.py').read_text()
        meta=json.loads((F/'provenance.json').read_text())
        self.assertEqual(hashlib.sha256(old.encode()).hexdigest(),meta['native-flight.py.txt_sha256'])
        for before,after in json.loads((F/'approved-ui-delta.json').read_text()):
            self.assertEqual(old.count(before),1)
            old=old.replace(before,after)
        self.assertEqual(s,old)
        def names(text):
            return [n.args[0].value for n in ast.walk(ast.parse(text)) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='record' and n.args and isinstance(n.args[0],ast.Constant)]
        for name in names((F/'native-flight.py.txt').read_text()):self.assertIn(name,names(s))
    def test_frozen_selector_contracts(self):
        root=T.parents[1]
        welcome=(root/'web/core/welcome.js').read_text();app=(root/'web/app.js').read_text();pin=(root/'web/core/home-screen-apps.js').read_text()
        for title in u.WELCOME:self.assertIn(title,welcome)
        self.assertIn("log('name:skipped'); fromName()",welcome)
        self.assertIn("if (step === 'hello') { step = 'look'",welcome)
        self.assertIn("close(); log('back:close')",welcome)
        for s in ('New desk: pick an app','current desk','data-ovdl','data-goto'):self.assertIn(s,app)
        self.assertIn("aria-label', name + ' home screen'",pin)
        self.assertIn("hold: 'arrange', appAction: 'home-screen', appHold: false",(root/'web/tweaks/miguel/arrange-download/tweak.js').read_text())
    def test_r16_runner_does_not_weaken_acceptance(self):
        s=(T/'run-native-r16.py').read_text()
        self.assertEqual(s,(T/'run-native-r15.py').read_text().replace('R15','R16'))
        for marker in ('gate.verify_native(R,m)','renderer_r14.verify_evidence','egress_r15.verify_evidence'):
            self.assertLess(s.index(marker),s.index("report['native_acceptance']=True"))

if __name__=='__main__':unittest.main()
