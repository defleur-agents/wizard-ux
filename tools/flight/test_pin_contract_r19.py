import hashlib,json,unittest
from pathlib import Path
import pin_contract_r19 as pin
F=Path(__file__).with_name('fixtures')/'r19-pin'
ORIGIN='https://localhost:28543'
LAUNCHER='com.google.android.apps.nexuslauncher'

class PinContract(unittest.TestCase):
    def setUp(self):
        self.source=(F/'HomeScreenShortcuts.java.txt').read_bytes()
        self.policy=(F/'HomeScreenPolicy.java.txt').read_bytes()
        self.raw=(F/'r18-02-os-pin-confirmation.xml').read_text()
        self.shortcuts=(F/'r17-shortcuts.txt').read_text()
        self.id=pin.identity(ORIGIN)
        self.prefs='<map><boolean name="'+self.id+':confirmed" value="true" /></map>'
    def test_bound_actual_evidence(self):
        for name,meta in json.loads((F/'provenance.json').read_text())['files'].items():
            self.assertEqual(hashlib.sha256((F/name).read_bytes()).hexdigest(),meta['sha256'])
    def test_actual_r18_and_r17_same_widget_wording_is_shortcut_route(self):
        for rev in ('r18','r17'):
            out=pin.route((F/(rev+'-02-os-pin-confirmation.xml')).read_text(),self.source,self.policy)
            self.assertEqual(out['api'],'ShortcutManager.requestPinShortcut')
            self.assertEqual(out['presentation'],'launcher-widget-cell-1x1')
    def test_unknown_source_not_widget_fallback(self):
        with self.assertRaises(ValueError):pin.route(self.raw,self.source+b' ',self.policy)
    def test_unknown_or_ambiguous_os_surface_refuses(self):
        for raw in (self.raw.replace('Wisdom widget','Other widget'),self.raw.replace(LAUNCHER,'ai.wizards.os'), self.raw.replace('</hierarchy>',self.raw.split('<hierarchy rotation="0">')[1])):
            with self.assertRaises((ValueError,Exception)):pin.route(raw,self.source,self.policy)
    def test_actual_failed_r18_is_not_receipt(self):
        self.assertIsNone(pin.shortcut_receipt((F/'r18-shortcuts.txt').read_text(),ORIGIN,LAUNCHER))
    def test_actual_r17_exact_origin_app_identity(self):
        receipt=pin.shortcut_receipt(self.shortcuts,ORIGIN,LAUNCHER)
        self.assertIsNotNone(receipt)
        self.assertEqual(receipt['id'],self.id)
    def test_wrong_origin_label_component_pin_flag_or_launcher_refuses(self):
        self.assertIsNone(pin.shortcut_receipt(self.shortcuts,ORIGIN+'x',LAUNCHER))
        for old,new in [('shortLabel=Wisdom,','shortLabel=Other,'),('cmp=ai.wizards.os/.AppSessionActivity','cmp=ai.wizards.os/.MainActivity'),('[PinIc-fStr]','[Ic-fStr]'),('Pinned: '+self.id,'Pinned: homeapp-other')]:
            self.assertIsNone(pin.shortcut_receipt(self.shortcuts.replace(old,new),ORIGIN,LAUNCHER))
    def test_callback_required_and_token_consumed(self):
        self.assertTrue(pin.confirmed(self.prefs,self.id))
        for prefs in ('','<map/>',self.prefs.replace('true','false'),self.prefs.replace('</map>','<string name="'+self.id+'">pending-token</string></map>')):
            self.assertFalse(pin.confirmed(prefs,self.id))
    def wait(self,observations):
        times=[0.0];saved=[];it=iter(observations);last=[None]
        def observe():
            last[0]=next(it,last[0]);return last[0]
        def sleep(n):times[0]+=n
        def save(*args):saved.append(args)
        result=pin.await_persisted(observe,save,ORIGIN,LAUNCHER,lambda:times[0],sleep,timeout=1)
        return result,saved,times[0]
    def test_bounded_readonly_r18_to_r17_persistence_then_callback(self):
        # Synthetic schedule of actual observations; NOT a new OS reproduction.
        empty={'shortcuts':(F/'r18-shortcuts.txt').read_text(),'preferences':'<map/>','appwidget':'diagnostic','activity':'MainActivity'}
        os_only={**empty,'shortcuts':self.shortcuts}
        ready={**os_only,'preferences':self.prefs}
        result,saved,elapsed=self.wait([empty,os_only,ready])
        self.assertEqual(result['id'],self.id);self.assertEqual(len(saved),3);self.assertEqual(elapsed,1)
        self.assertEqual([x[3] for x in saved],[False,False,True])
    def test_timeout_never_accepts_missing_callback_or_os_identity(self):
        for obs in ({'shortcuts':self.shortcuts,'preferences':'<map/>'},{'shortcuts':'','preferences':self.prefs}):
            with self.assertRaises(TimeoutError):self.wait([obs])

if __name__=='__main__':unittest.main()
