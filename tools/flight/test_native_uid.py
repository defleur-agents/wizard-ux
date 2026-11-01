"""Read-only API35 parser regression; never imports the device runner."""
import ast
from pathlib import Path
import re
import unittest

source = Path(__file__).with_name('native-flight.py').read_text()
fn = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'installed_application_uid')
namespace = {'re': re}
exec(compile(ast.Module(body=[fn], type_ignores=[]), '<actual UID parser>', 'exec'), namespace)
parse = namespace['installed_application_uid']
SAMPLE = '''    uid=10209 gids=[] type=0 prot=signature
  Package [ai.wizards.os] (37410c8):
    appId=10209
    versionCode=87
    versionName=0.10.23
'''

class InstalledUidTest(unittest.TestCase):
    def test_api35_appid_without_userid(self):
        self.assertEqual(parse(SAMPLE, 'ai.wizards.os'), 10209)
    def test_mismatch_rejected(self):
        with self.assertRaises(ValueError):parse(SAMPLE.replace('appId=10209', 'appId=10210'), 'ai.wizards.os')
    def test_wrong_package_rejected(self):
        with self.assertRaises(ValueError):parse(SAMPLE, 'ai.wizards.other')
    def test_unsafe_uid_rejected(self):
        with self.assertRaises(ValueError):parse(SAMPLE.replace('10209', '2000'), 'ai.wizards.os')
    def test_selected_package_not_other_package(self):
        self.assertEqual(parse(SAMPLE+'  Package [ai.wizards.other] (abc):\n    appId=10888\n', 'ai.wizards.os'), 10209)
    def test_missing_actual_uid_rejected(self):
        with self.assertRaises(ValueError):parse(SAMPLE.split('\n',1)[1], 'ai.wizards.os')

if __name__ == '__main__':unittest.main()
