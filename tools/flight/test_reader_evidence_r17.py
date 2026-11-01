"""Unit-only audit of actual R16 captured XML and exact native page gate.

R16_FAIL_XML must point at preserved R16 evidence/native/FAIL.xml. The no-footer
variant is explicitly a derived fixture, NOT an additional native observation.
No device/browser is started and the native acceptance gate is not changed.
"""
import ast
import hashlib
import os
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET
import native_ui_r16 as native_ui

HERE = Path(__file__).parent
RAW = Path(os.environ['R16_FAIL_XML']).read_bytes()
EXPECTED_SHA = 'b2ee44f524ea6dba77488b1db1ef15f3f9f6b2e9402af45bc90f4b4d0c630e54'
assert hashlib.sha256(RAW).hexdigest() == EXPECTED_SHA, 'wrong immutable R16 capture'
# Exercise the actual flight function without importing its emulator entrypoint.
tree = ast.parse((HERE / 'native-flight.py').read_text())
selected: list[ast.stmt] = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'page_count']
assert len(selected) == 1
scope = {'re': re, 'label': native_ui.label, 'nodes': native_ui.visible}
exec(compile(ast.Module(body=selected, type_ignores=[]), 'R16-page-count', 'exec'), scope)
page_count = scope['page_count']

class ActualR16Evidence(unittest.TestCase):
    def test_actual_fully_painted_capture_is_5_of_15_not_5_of_13(self):
        self.assertEqual(page_count(RAW), (5, 15))
        self.assertNotEqual(page_count(RAW), (5, 13))

    def test_absent_footer_then_actual_footer_cannot_be_relabeled_position_pass(self):
        root = ET.fromstring(RAW)
        for n in root.iter('node'):
            if re.fullmatch(r'\d+\s*/\s*\d+', native_ui.label(n)):
                n.set('text', '')  # explicitly derived transient-readiness fixture
                n.set('content-desc', '')
        missing = ET.tostring(root, encoding='unicode')
        with self.assertRaisesRegex(AssertionError, r'\[\]'):
            page_count(missing)
        # A retry repairs only observation availability. Exact comparison MUST
        # still reject the newly available actual 5/15 against saved 5/13.
        observed = page_count(RAW)
        with self.assertRaises(AssertionError):
            self.assertEqual(observed, (5, 13))

    def test_accessibility_body_does_not_establish_visible_word_identity(self):
        all_nodes = list(ET.fromstring(RAW).iter('node'))
        body = [n for n in all_nodes if 'Read slowly and return to the moment.' in native_ui.label(n)]
        self.assertTrue(body)
        self.assertTrue(all(native_ui.rect(n) is None for n in body))
        # Actual native XML has zero-bounds body despite visible screenshot text.
        # The forthcoming native gate needs pre/post pixels as well as page pair;
        # an XML paragraph string is not the first visible text/offset.

if __name__ == '__main__':
    unittest.main()
