"""Source-only replay: actual R17 loading/ready XML; pixel sampler is mocked.
No device is started. These guards prove readiness, not native pixel acceptance.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from types import SimpleNamespace
import unittest
import xml.etree.ElementTree as ET
import native_ui_r16 as native_ui
import reader_boundary_r17 as boundary

HERE=Path(__file__).parent
FIX=HERE/'fixtures'/'r17-reader-readiness'
def captured(name,digest):
    raw=(FIX/name).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==digest, name
    return raw.decode()
LOADING=captured('loading.xml','7cf475e79b1f9129ec866454d530cf05c1728cd8016da5c70d0fe73e80a3653e')
READY=captured('ready-5-of-15.xml','b2ee44f524ea6dba77488b1db1ef15f3f9f6b2e9402af45bc90f4b4d0c630e54')
PREKILL=captured('prekill-5-of-13.xml','e8af4817522a86b3f1ae8afaf484e70d8b01898980695c11546dfa45756d7d41')
ACTIVITY='mResumedActivity: ActivityRecord{test ai.wizards.os/.AppSessionActivity}'
SOURCE=Path(os.environ.get('R18_NATIVE_SOURCE',HERE/'native-flight.py'))
tree=ast.parse(SOURCE.read_text())
selected: list[ast.stmt]=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='settle_reader']
assert len(selected)==1

def pair(raw):
    labels=[native_ui.label(n) for n in native_ui.visible(raw) if re.fullmatch(r'\d+\s*/\s*\d+',native_ui.label(n))]
    assert len(labels)==1
    return list(map(int,labels[0].split('/')))

class Readiness(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='r18-reader-unit-',dir=os.environ.get('TMPDIR'))
        self.addCleanup(self.tmp.cleanup)
        self.out=Path(self.tmp.name)
        self.clock=0
        self.samples=0
    def run_replay(self,raws,activities=None,changing=False):
        it=iter(raws);current=raws[-1]
        acts=iter(activities or [ACTIVITY]*len(raws))
        def ui():
            nonlocal current
            current=next(it,current)
            return current
        def now():
            self.clock+=.5
            return self.clock
        def screen(stem):
            # Explicit unit stub; never presented as a native screenshot.
            (self.out/(stem+'.png')).write_bytes(b'unit-screen-stub')
        def sample(raw,image,crop):
            self.samples+=1
            return {'pair':pair(raw),'crop':[0,207,1080,2031],
                    'body_rgb_sha256':str(self.samples) if changing else 'unit-pixel-sampler-stub'}
        scope={'ui':ui,'OUT':self.out,'raw_screen':screen,'top':lambda:next(acts,ACTIVITY),
               'PKG':'ai.wizards.os','nodes':native_ui.visible,'label':native_ui.label,
               'find':lambda p,raw:native_ui.target(p,raw),'json':json,'re':re,
               'time':SimpleNamespace(monotonic=now,sleep=lambda _:None),
               'boundary':SimpleNamespace(sample=sample)}
        exec(compile(ast.Module(body=selected,type_ignores=[]),str(SOURCE),'exec'),scope)
        return scope['settle_reader']('restored',[0,207,1080,2031])
    def test_actual_loading_then_ready_passes_only_readiness_and_rejects_13_to_15(self):
        state=self.run_replay([LOADING,READY,READY,READY])
        self.assertEqual(len(state['frames']),3)
        self.assertEqual([f['pair'] for f in state['frames']],[[5,15]]*3)
        self.assertEqual([o['reader_painted'] for o in state['observations']],[False,True,True,True])
        self.assertEqual((self.out/'restored-00.xml').read_text(),LOADING)
        self.assertTrue((self.out/'restored-00.png').is_file())
        before={**state['frames'][-1],'pair':pair(PREKILL)}
        with self.assertRaisesRegex(AssertionError,'exact boundary footer changed'):
            boundary.compare(before,state['frames'][-1])
    def test_header_without_footer_is_still_loading(self):
        root=ET.fromstring(READY)
        for n in root.iter('node'):
            if re.fullmatch(r'\d+\s*/\s*\d+',native_ui.label(n)):
                n.set('text','');n.set('content-desc','')
        derived=ET.tostring(root,encoding='unicode')
        state=self.run_replay([derived,READY,READY,READY])
        self.assertFalse(state['observations'][0]['reader_painted'])
        self.assertEqual(self.samples,3)
    def test_loading_timeout_retains_last_raw_observation(self):
        with self.assertRaisesRegex(AssertionError,'within 30 seconds'):
            self.run_replay([LOADING])
        state=json.loads((self.out/'restored.json').read_text())
        self.assertEqual(state['frames'],[])
        self.assertTrue((self.out/state['observations'][-1]['xml']).is_file())
    def test_foreign_activity_refused_even_before_first_paint(self):
        with self.assertRaisesRegex(AssertionError,'activity must stay foreground'):
            self.run_replay([LOADING],['mResumedActivity: launcher/.Launcher'])
        self.assertTrue((self.out/'restored-00.xml').is_file())
    def test_navigation_after_first_paint_is_not_retried(self):
        with self.assertRaisesRegex(AssertionError,'foreground after first paint'):
            self.run_replay([READY,LOADING])
        state=json.loads((self.out/'restored.json').read_text())
        self.assertEqual(len(state['frames']),1)
        self.assertEqual(len(state['observations']),2)
    def test_three_identical_frames_still_required(self):
        with self.assertRaisesRegex(AssertionError,'eight painted captures'):
            self.run_replay([READY],changing=True)
        self.assertEqual(self.samples,8)
    def test_ready_still_rejects_body_pixels_and_geometry(self):
        f=self.run_replay([READY])['frames'][-1]
        with self.assertRaisesRegex(AssertionError,'passage/layout pixels changed'):
            boundary.compare(f,{**f,'body_rgb_sha256':'changed'})
        with self.assertRaisesRegex(AssertionError,'geometry changed'):
            boundary.compare(f,{**f,'crop':[0,208,1080,2031]})
    def test_selection_toolbar_is_not_waived(self):
        root=ET.fromstring(READY)
        ET.SubElement(root,'node',{'text':'Highlight','bounds':'[10,10][100,100]','enabled':'true'})
        with self.assertRaisesRegex(AssertionError,'selection toolbar must be closed'):
            self.run_replay([ET.tostring(root,encoding='unicode')])

if __name__=='__main__':unittest.main()
