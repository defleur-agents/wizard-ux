"""Native pixel boundary evidence only; no DOM or owner storage claims."""
import hashlib,json,re
from pathlib import Path
import struct,zlib,subprocess as sp
from collections import Counter
import native_ui_r16 as native_ui

def geometry(raw,size):
 ns=native_ui.visible(raw)
 def rect(pattern):
  hits=[n for n in ns if re.fullmatch(pattern,native_ui.label(n))]
  assert len(hits)==1,(pattern,len(hits))
  r=native_ui.rect(hits[0]);assert r;return r
 header=rect('Chapter discussions');footer=rect(r'\d+\s*/\s*\d+')
 w,h=size;crop=(0,header[3]+8,w,footer[1]-8)
 assert 0<=crop[1]<crop[3]<=h and crop[3]-crop[1]>h//3,crop
 return crop

def sample(raw,image,crop=None,save_crop=True):
 counts=[native_ui.label(n) for n in native_ui.visible(raw) if re.fullmatch(r'\d+\s*/\s*\d+',native_ui.label(n))]
 assert len(counts)==1,counts
 data=Path(image).read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n'
 w,h=struct.unpack('>II',data[16:24]);actual=geometry(raw,(w,h))
 assert crop is None or tuple(crop)==actual,('reader geometry drift',crop,actual)
 x,y,right,bottom=actual;cw,ch=right-x,bottom-y
 body=sp.check_output(['/usr/bin/ffmpeg','-v','error','-threads','1','-i',str(image),'-vf',f'crop={cw}:{ch}:{x}:{y}','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],timeout=8)
 assert len(body)==cw*ch*3
 hist=Counter(((299*r+587*g+114*b)//1000)//4 for r,g,b in zip(body[::3],body[1::3],body[2::3]))
 ink_pixels=cw*ch-max(hist.values());populated_bins=len(hist)
 assert populated_bins>=4 and ink_pixels>=1000,('blank/textless crop',populated_bins,ink_pixels)
 digest=hashlib.sha256(body).hexdigest()
 if save_crop:
  def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
  rows=b''.join(b'\0'+body[i*cw*3:(i+1)*cw*3] for i in range(ch))
  Path(image).with_suffix('.body.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',cw,ch,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))

 return {'pair':list(map(int,counts[0].split('/'))),'crop':list(actual),'body_rgb_sha256':digest,'image':Path(image).name,'body_image':Path(image).with_suffix('.body.png').name,'nonblank':{'populated_64_bins':populated_bins,'nonmodal_pixels':ink_pixels,'minimum_bins':4,'minimum_pixels':1000}}

def compare(before,after):
 assert before['pair']==after['pair'],('exact boundary footer changed',before['pair'],after['pair'])
 assert before['crop']==after['crop'],'boundary crop geometry changed'
 assert before['body_rgb_sha256']==after['body_rgb_sha256'],'visible reading passage/layout pixels changed'
 return True

def replay(receipt,pair):
 path='/wisdom/api/wisdom/highlight'
 ops=[x['offline_id'] for x in receipt['writes'] if x['path']==path]
 assert len(ops)>=2 and len(set(ops))==1 and ops[0],ops
 # server.Handler.route() strips BASE before recording its database receipt.
 receipt_path='/api/wisdom/highlight'
 rows=[x for x in receipt['offline_receipt_rows'] if x['id']==ops[0] and x['path']==receipt_path]
 assert len(rows)==1,rows
 assert receipt['lost_ack']=={'id':ops[0],'path':path},receipt['lost_ack']
 hs=receipt['state']['highlights'];assert len(hs)==1 and hs[0]['entry_id']=='flight-chapter',hs
 progress=[x['progress'] for x in receipt['state']['entries'] if x['id']=='flight-chapter']
 # JS Math.round, not Python bankers rounding. No exact-fraction storage claim.
 expected=int((pair[0]-1)/(pair[1]-1)*100+.5)
 assert progress==[expected],(progress,expected,pair)
 return {'highlight_id':ops[0],'path':path,'receipt_path':receipt_path,'post_count':len(ops),'receipt_count_for_id_path':1,'chapter':'flight-chapter','expected_progress':expected,'actual_progress':progress[0]}

def verify_evidence(root,checks):
 root=Path(root);r=json.loads((root/'reader-boundary.json').read_text())
 for phase in ('prekill','restored','home_prekill','home_restored'):
  frames=r[phase]['frames'];assert len(frames)>=3
  tail=frames[-3:]
  for f in frames:
   observed=sample((root/f['xml']).read_text(),root/f['image'],f['crop'],save_crop=False);assert all(observed[k]==f[k] for k in observed)
  assert all(compare(tail[0],f) for f in tail[1:])
  assert all(b['monotonic']-a['monotonic']>=.4 for a,b in zip(tail,tail[1:]))
 assert compare(r['prekill']['frames'][-1],r['restored']['frames'][-1])
 assert compare(r['prekill']['frames'][-1],r['home_prekill']['frames'][-1])
 assert compare(r['home_prekill']['frames'][-1],r['home_restored']['frames'][-1])
 assert 0<=r['force_stop_started_monotonic']-r['prekill']['frames'][-1]['monotonic']<2,'kill not adjacent to final pixels'
 assert 0<=r['home_started_monotonic']-r['home_prekill']['frames'][-1]['monotonic']<2,'HOME arm not adjacent to final pixels'
 if r['initial_saved_pair']!=r['prekill']['frames'][-1]['pair']:
  assert r['finding']['name']=='live pre-death reflow observed' and r['finding']['status']=='open-live-reflow-not-resolved-by-native-durability'
 receipt=json.loads((root/'synthetic-server-receipt.json').read_text())
 assert replay(receipt,r['prekill']['frames'][-1]['pair'])==r['replay']
 names={c['name'] for c in checks if c['pass'] is True}
 assert {'exact prekill reader pixels and page survive process death','native exact chapter progress destination syncs','highlight specific lost ACK receipt verified'}<=names
 return True
