"""Pure synthetic negative guards, run only inside admitted R17 job before native."""
import copy, unittest
import reader_boundary_r17 as b

class Guards(unittest.TestCase):
 def base(self):
  return {'pair':[5,15],'crop':[0,100,411,700],'body_rgb_sha256':'actual-synthetic-unit-digest'}
 def test_exact_pair_not_numerator(self):
  x=self.base();y=copy.deepcopy(x);y['pair']=[5,13]
  with self.assertRaises(AssertionError):b.compare(x,y)
 def test_passage_pixels_required(self):
  x=self.base();y=copy.deepcopy(x);y['body_rgb_sha256']='different'
  with self.assertRaises(AssertionError):b.compare(x,y)
 def test_geometry_required(self):
  x=self.base();y=copy.deepcopy(x);y['crop'][1]+=1
  with self.assertRaises(AssertionError):b.compare(x,y)
 def receipt(self):
  p='/wisdom/api/wisdom/highlight';i='11111111-1111-1111-1111-111111111111'
  return {'writes':[{'path':p,'offline_id':i}]*2,'offline_receipt_rows':[{'id':i,'path':'/api/wisdom/highlight'}],'lost_ack':{'id':i,'path':p},'state':{'highlights':[{'entry_id':'flight-chapter'}],'entries':[{'id':'flight-chapter','progress':29}]}}
 def test_valid_specific_receipt(self):self.assertEqual(b.replay(self.receipt(),[5,15])['actual_progress'],29)
 def test_wrong_progress_not_merely_positive(self):
  r=self.receipt();r['state']['entries'][0]['progress']=33
  with self.assertRaises(AssertionError):b.replay(r,[5,15])
 def test_unrelated_receipt_not_counted(self):
  r=self.receipt();r['offline_receipt_rows'][0]['path']='/api/wisdom/reaction'
  with self.assertRaises(AssertionError):b.replay(r,[5,15])
 def test_lost_marker_exact_id_required(self):
  r=self.receipt();r['lost_ack']['id']='different'
  with self.assertRaises(AssertionError):b.replay(r,[5,15])
 def test_replay_same_id_required(self):
  r=self.receipt();r['writes']=copy.deepcopy(r['writes']);r['writes'][1]['offline_id']='different'
  with self.assertRaises(AssertionError):b.replay(r,[5,15])
if __name__=='__main__':unittest.main()
