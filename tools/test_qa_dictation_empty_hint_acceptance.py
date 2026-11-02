#!/usr/bin/env python3
"""Browser/emulator-free controller regressions; executed only by parent-admitted worker."""
import copy
import unittest
import qa_dictation_empty_hint_acceptance as q


class AcceptanceTests(unittest.TestCase):
    def fixture(self):
        files={n:{'sha256':'new','mode':0o644} for n in q.ANDROID_DELTA}
        old=copy.deepcopy(files)
        for n in q.PRODUCT_DELTA:old[n]['sha256']='old'
        old['android/app/src/main/other.java']={'sha256':'same','mode':0o644}
        files['android/app/src/main/other.java']={'sha256':'same','mode':0o644}
        cfg={'host':'forum','tasks':q.TASKS.copy(),'revision':'a'*40,'files':files,'manifest_sha256':q.manifest_hash(files),
             'owner_config':None,'signing_env':None,'expected_signer':None,'cap_sync':False}
        proof={'revision':'a'*40,'reviewed_revision':'b'*40,'old_revision':q.OLD,'android_changed_paths':sorted(q.ANDROID_DELTA),
               'android_sha256':{n:'new' for n in q.ANDROID_DELTA},'unit_expected_tests':417,'dictation_unit_tests':21}
        return cfg,{'files':old},proof

    def test_exact_source_passes(self):
        q.check_source(*self.fixture())

    def test_generic_production_change_refused(self):
        cfg,old,proof=self.fixture();cfg['files']['android/app/src/main/other.java']['sha256']='drift'
        cfg['manifest_sha256']=q.manifest_hash(cfg['files'])
        with self.assertRaises(ValueError):q.check_source(cfg,old,proof)

    def test_missing_or_additional_product_normalization_refused(self):
        for name in q.PRODUCT_DELTA:
            cfg,old,proof=self.fixture();cfg['files'][name]=copy.deepcopy(old['files'][name])
            cfg['manifest_sha256']=q.manifest_hash(cfg['files'])
            with self.assertRaises(ValueError):q.check_source(cfg,old,proof)

    def test_owner_or_signing_or_sync_tasks_refused(self):
        for key in ('owner_config','signing_env','expected_signer','cap_sync'):
            cfg,old,proof=self.fixture();cfg[key]='unexpected'
            with self.assertRaises(ValueError):q.check_source(cfg,old,proof)
        cfg,old,proof=self.fixture();cfg['tasks']=[':app:assembleRelease']
        with self.assertRaises(ValueError):q.check_source(cfg,old,proof)

    def test_wrong_manifest_revision_unit_or_source_proof_refused(self):
        for key,value in [('revision','wrong'),('manifest_sha256','wrong')]:
            cfg,old,proof=self.fixture();cfg[key]=value
            with self.assertRaises(ValueError):q.check_source(cfg,old,proof)
        for key,value in [('unit_expected_tests',410),('dictation_unit_tests',14),('old_revision','wrong')]:
            cfg,old,proof=self.fixture();proof[key]=value
            with self.assertRaises(ValueError):q.check_source(cfg,old,proof)
        cfg,old,proof=self.fixture();proof['android_sha256'].pop(q.TEST)
        with self.assertRaises(ValueError):q.check_source(cfg,old,proof)

    def test_original_cases_plus_all_extras_once(self):
        old=['original'+str(i) for i in range(27)];new=old+sorted(q.EXTRA)
        q.check_cases(old,new)
        for wrong in (new[:-1],new+[new[0]],new[1:]+['replacement']):
            with self.assertRaises(ValueError):q.check_cases(old,wrong)

    def test_exact_opus_review_passes(self):
        proof={'reviewed_revision':'a'*40}
        review={'is_error':False,'permission_denials':[],'result':'## Verdict: PASS WITH NITS\nReviewed '+'a'*40,
                'modelUsage':{'claude-opus-5-5':{}}}
        q.check_review(review,proof)
        for key,value in [('is_error',True),('permission_denials',['denied']),('result','Verdict: FAIL; earlier PASS '+'a'*40),
                          ('result','Verdict: PASS\nwrongrevision'),('modelUsage',{'other-model':{}})]:
            wrong=copy.deepcopy(review);wrong[key]=value
            with self.assertRaises(ValueError):q.check_review(wrong,proof)


if __name__=='__main__':unittest.main()
