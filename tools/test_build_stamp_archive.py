#!/usr/bin/env python3
"""Source-focused archive/Dockerfile metadata parity; no Docker/browser/network."""
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]


def git(repo, *args):
    return subprocess.check_output(['git', '-c', 'core.hooksPath=/dev/null', '-C', str(repo), *args], text=True).strip()


def archive(repo, ref, prefix='web'):
    data = subprocess.check_output(['git', '-C', str(repo), 'archive', ref, prefix])
    with tarfile.open(fileobj=io.BytesIO(data)) as files:
        member = files.getmember('web/build.json')
        stream = files.extractfile(member)
        assert stream is not None
        return stream.read(), member.mode


class BuildStamp(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ['TMPDIR'])
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        git(self.repo, 'init', '--quiet')
        git(self.repo, 'config', 'user.name', 'Synthetic QA')
        git(self.repo, 'config', 'user.email', 'synthetic@example.invalid')
        for name in ['.gitattributes', 'web/build.json']:
            target = self.repo/name
            target.parent.mkdir(exist_ok=True)
            target.write_bytes((SOURCE/name).read_bytes())
        self.a = self.commit('metadata fixture A')

    def commit(self, message):
        git(self.repo, 'add', '.')
        git(self.repo, 'commit', '--quiet', '-m', message)
        return git(self.repo, 'rev-parse', 'HEAD')

    def test_archive_commit_is_authority_and_regular_public_mode(self):
        body, mode = archive(self.repo, self.a)
        self.assertEqual(body, ('{"commit":"'+self.a+'"}\n').encode())
        self.assertIn(mode, [0o644, 0o664])
        self.assertEqual(mode & 0o111, 0)
        self.assertEqual(mode & 0o444, 0o444)
        self.assertRegex(json.loads(body)['commit'], r'\A[0-9a-f]{40}\Z')

    def test_unrelated_release_moves_stamp_without_metadata_edits(self):
        (self.repo/'unrelated.txt').write_text('unrelated fixture release\n')
        b = self.commit('metadata fixture B')
        self.assertNotEqual(self.a, b)
        self.assertEqual(archive(self.repo, self.a)[0], ('{"commit":"'+self.a+'"}\n').encode())
        self.assertEqual(archive(self.repo, b)[0], ('{"commit":"'+b+'"}\n').encode())
        self.assertEqual(git(self.repo, 'rev-parse', self.a+':web/build.json'), git(self.repo, 'rev-parse', b+':web/build.json'))

    def test_raw_tree_and_checkout_are_not_a_stamp(self):
        raw = (SOURCE/'web/build.json').read_bytes()
        self.assertIsNone(re.fullmatch(r'[0-9a-f]{40}', json.loads(raw)['commit']))
        body, _ = archive(self.repo, git(self.repo, 'rev-parse', self.a+'^{tree}'))
        self.assertEqual(body, raw)
        self.assertIsNone(re.fullmatch(r'[0-9a-f]{40}', json.loads(body)['commit']))

    def test_exact_docker_writer_valid_and_invalid_remove_no_stale_template(self):
        lines = (SOURCE/'Dockerfile').read_text().splitlines()
        writer = next(x[4:] for x in lines if x.startswith('RUN if ') and 'WIZARD_UX_COMMIT' in x)
        self.assertIn("printf '{\"commit\":\"%s\"}\\n'", writer)
        target = self.repo/'docker-build.json'
        command = writer.replace('/usr/share/nginx/wizard-ux/build.json', str(target))
        for value in [self.a, '', 'A'*40, 'a'*39, 'a'*41, ' '+self.a, self.a+'\n', self.a+'\n'+self.a, '$Format:%H$']:
            with self.subTest(value=value):
                target.write_text('{"commit":"stale"}\n')
                subprocess.run(['sh', '-c', command], env={**os.environ, 'WIZARD_UX_COMMIT':value}, check=True)
                if value == self.a:
                    self.assertEqual(target.read_bytes(), archive(self.repo, self.a)[0])
                else:
                    self.assertFalse(target.exists(), 'invalid input retained stale/template metadata')


if __name__ == '__main__':
    unittest.main()
