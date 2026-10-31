import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('orb_packet', HERE / 'qa_orb_phone_packet.py')
assert spec and spec.loader
packet = importlib.util.module_from_spec(spec); spec.loader.exec_module(packet)
spec2 = importlib.util.spec_from_file_location('orb_native', HERE / 'qa_orb_release_native.py')
assert spec2 and spec2.loader
native = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(native)


class PacketTests(unittest.TestCase):
    def test_scopes(self):
        self.assertEqual(packet.SIGNED_TASKS, [':app:assembleRelease', ':app:testReleaseUnitTest', ':app:lintRelease'])
        self.assertEqual(packet.DEBUG_TASKS, [':app:assembleDebug'])
        self.assertEqual(packet.SIGNER, native.SIGNER)

    def test_focused_files_exist(self):
        source = HERE.parent
        for name in ['orb-render-recovery', 'orb-icon-core', 'owner-skins-guard', 'manager-orb-route']:
            self.assertTrue((source / 'tests' / (name + '.test.mjs')).is_file())

    def test_actual_control_window_names(self):
        java = (HERE.parent / 'android/app/src/main/java/ai/wizards/os/everywhere/EverywhereService.java').read_text()
        qa = (HERE / 'qa_orb_release_native.py').read_text()
        for name in ['WizardEverywhere', 'WizOrbCtl-pause', 'WizOrbCtl-cancel']:
            self.assertIn('"' + name + '"', java)
            self.assertIn("'" + name + "'", qa)

    def test_packaged_asset_binding(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d); source = p / 'source'; assist = source / 'android/app/src/main/assets/assist'
            assist.mkdir(parents=True); (source / 'web').mkdir()
            (assist / 'orb.js').write_bytes(b'exact renderer'); (source / 'web/orb.js').write_bytes(b'exact renderer')
            apk = p / 'one.apk'
            with zipfile.ZipFile(apk, 'w') as z: z.write(assist / 'orb.js', 'assets/assist/orb.js')
            native.check_assets(apk, source)
            (assist / 'orb.js').write_bytes(b'drift')
            with self.assertRaises(AssertionError): native.check_assets(apk, source)

    def test_junit_complete_and_no_skip(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d); results = p / 'source/android/app/build/test-results/testReleaseUnitTest'; results.mkdir(parents=True)
            x = results / 'TEST-case.xml'; x.write_text('<testsuite tests="392" failures="0" errors="0" skipped="0"/>')
            self.assertEqual(packet.junit_counts(p)['tests'], 392)
            x.write_text('<testsuite tests="392" failures="0" errors="0" skipped="1"/>')
            with self.assertRaises(AssertionError): packet.junit_counts(p)

    def test_native_capture_requires_later_review(self):
        source = (HERE / 'qa_orb_release_native.py').read_text()
        self.assertIn('Parent must visually inspect', source)
        self.assertNotIn('from PIL', source)
        self.assertNotIn('setWebContentsDebuggingEnabled', source)


if __name__ == '__main__': unittest.main()
