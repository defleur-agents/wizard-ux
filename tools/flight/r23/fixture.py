#!/usr/bin/env python3
"""Source-bound synthetic Wisdom + real shell/core fixture. No owner data/network.
Runs only on Forum through durable admission. API writes remain in temporary SQLite.
"""
import argparse,base64,copy,hashlib,json,mimetypes,os,ssl,sys,tempfile,threading,time
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit,unquote
p=argparse.ArgumentParser();p.add_argument('--wisdom-source',type=Path,required=True);p.add_argument('--web',type=Path,required=True);p.add_argument('--port',type=int,default=0);p.add_argument('--cert');p.add_argument('--key');a=p.parse_args()
a.wisdom_source=a.wisdom_source.resolve();a.web=a.web.resolve()
tmp=tempfile.TemporaryDirectory(prefix='wisdom-flight-synthetic-',dir=os.environ.get('TMPDIR'))
os.environ.update(WISDOM_DATA=tmp.name+'/data',WISDOM_LIBRARY=tmp.name+'/library',WISDOM_ADMIT='disabled',WISDOM_WIZARD_ORIGIN='')
sys.path.insert(0,str(a.wisdom_source));import server,wisdom,library,discussions
server.DATA=Path(tmp.name)/'data';server.DATA.mkdir();server.BASE='/wisdom'
body='# Flight fixture\n\n## A quiet beginning\n\n'+'Quiet attention begins with one thing. Read slowly and return to the moment. '*150
fixture={'thinkers':[{'id':'flight-author','name':'Synthetic Author','series':'Flight','bio':'Synthetic fixture','url':'https://example.invalid'}], 'entries':[{'id':'flight-chapter','title':'A quiet beginning','thinker':'flight-author','part':1,'deck':'Synthetic flight acceptance, not James’s library','source_url':'https://example.invalid','body':body}], 'collections':[{'id':'flight-collection','title':'Synthetic flight collection','description':'Only generated test text','entries':['flight-chapter']}], '_art':{'c/flight-chapter.jpg':'synthetic'}}
library.catalog=lambda c:copy.deepcopy(fixture)
with server.db() as c:
 library.init(c);wisdom.init(c);discussions.init(c,server.DATA/'wisdom.sqlite');c.commit()
# Unmistakable synthetic checkerboard art: native screenshots must show this, not a blank fallback.
import struct,zlib
w,h=180,240
raw=b''.join(b'\0'+b''.join(bytes((32,88,155) if (x//30+y//30)%2 else (238,175,62)) for x in range(w)) for y in range(h))
def chunk(t,d):return struct.pack('!I',len(d))+t+d+struct.pack('!I',zlib.crc32(t+d)&0xffffffff)
PNG=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
class H(server.Handler):
 calls=[]
 reads=[]
 lost=False
 def send(self,code,data,ctype='application/json',headers=None):
  if getattr(self,'_qa_call',None) is not None:
   call=self._qa_call
   if call is not None:call.update(status=code,handlerReturnedAt=time.time_ns()//1000000)
  # Deliberately lose one ACK *after* the real SQLite transaction commits.
  if os.environ.get('QA_LOST_HIGHLIGHT')=='1' and not H.lost and self.command=='POST' and urlsplit(self.path).path=='/wisdom/api/wisdom/highlight' and code==200:
   H.lost=True
   import socket
   self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
  return super().send(code,data,ctype,headers)
 def do_GET(self):
  self._qa_call=None
  path=unquote(urlsplit(self.path).path)
  self.reads.append({'path':path})
  if path=='/__fixture__/blank':return self.send(200,b'<!doctype html><title>Empty profile byte observer</title>','text/html')
  if path=='/__observer__/':return self.send(200,b'<!doctype html><title>Synthetic observer negative</title>','text/html')
  if path=='/wisdom/__observer__.js':
   mode=urlsplit(self.path).query
   # HTTP Content-Length is ALWAYS generated from these actual bytes by server.send.
   # Invalid length metadata belongs only to the synthetic cached Response below.
   data=b'' if mode=='plain-empty' else b'actual source bytes'
   return self.send(200,data,'application/javascript')
  if path=='/__observer__/sw.js':
   mode=urlsplit(self.path).query
   assert mode in ('good','empty','wrong','stale')
   # Consume the real fetch in EVERY mode before substituting cache-only bytes.
   # R25 EMPTY abandoned r unread; explicitly remove that unconsumed-body seam.
   script="self.addEventListener('install',e=>e.waitUntil((async()=>{const r=await fetch('/wisdom/__observer__.js?MODE');const networkBytes=await r.clone().arrayBuffer();if(networkBytes.byteLength!==19)throw Error('fixture network framing');const c=await caches.open('CACHE');await c.put('/wisdom/__observer__.js?MODE',VALUE);await self.skipWaiting()})()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));"
   value="new Response('',{status:200,headers:{'content-length':'19','content-type':'application/javascript'}})" if mode=='empty' else "new Response('wrong! source bytes',{status:200,headers:{'content-length':'19','content-type':'application/javascript'}})" if mode=='wrong' else 'r'
   script=script.replace('MODE',mode).replace('CACHE','observer-shell-old' if mode=='stale' else 'observer-shell-current').replace('VALUE',value)
   return self.send(200,script.encode(),'application/javascript')
  if path=='/__fixture__/receipt':
   with server.db() as c:
    state=wisdom.state(c);tables={r[0] for r in c.execute('select name from sqlite_master')};count=c.execute('select count(*) from wisdom_offline_receipts').fetchone()[0] if 'wisdom_offline_receipts' in tables else 0;receipt_rows=[dict(r) for r in c.execute('SELECT id,path,digest FROM wisdom_offline_receipts')] if count else []
   return self.send(200,{'synthetic':True,'state':state,'receipts':count,'receipt_rows':receipt_rows,'writes':self.calls,'reads':self.reads})
  if path.startswith('/wisdom/wisdom-art/f/'):
   font=(a.wisdom_source/'static'/path.removeprefix('/wisdom/')).resolve()
   if font.is_relative_to(a.wisdom_source/'static') and font.is_file():return self.send(200,font.read_bytes(),mimetypes.guess_type(font.name)[0] or 'font/woff2')
   return self.send(404,{})
  if path.startswith('/wisdom/wisdom-art/'):
   return self.send(200,PNG,'image/png')
  if path=='/wizard/v1/bootstrap':
   return self.send(200,{'bootstrap':1,'settings':{'owner':{},'agent':{'name':'Wizard'},'clock':{}},'capabilities':{},'endpoints':{'apps':'/wizard/v1/apps'}})
  if path in ('/wizard/v1/apps','/apps.json','/wizard-os-home/apps.json','/wizard/wizard-os-home/apps.json','/wizard/store-data/wizard/v1/installed-apps','/wizard-os-home/store-data/wizard/v1/installed-apps'):
   app={'id':'wisdom','name':'Wisdom','type':'utility','system':False,'source':'apps.json','status':'running','url':'/wisdom/','icon':'book-open','colors':['#c4b393','#675b43'],'view':{'mode':'own','url':'/wisdom/'},'runtime':{'status':'running'}}
   sibling={'id':'sibling-pin','name':'Synthetic sibling','type':'utility','system':False,'source':'apps.json','status':'running','url':'/sibling-pin/','icon':'book-open','view':{'mode':'own','url':'/sibling-pin/'},'runtime':{'status':'running'}}
   return self.send(200,{'apps':[app,sibling],'wam':[app,sibling]})
  if path=='/sibling-pin/sw.js':
   return self.send(200,b"self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));",'application/javascript')
  if path=='/sibling-pin/':
   return self.send(200,b'<html><head><script src="/wizard-os-home/core/app-client.js"></script></head><body><h1 id="sibling-ready">Synthetic sibling</h1></body></html>','text/html')
  if path.startswith('/wizard-os-home/'):
   rel=path[len('/wizard-os-home/'):];target=(a.web/(rel or 'index.html')).resolve()
   if not target.is_relative_to(a.web):return self.send(403,{})
   if target.is_file():
    mime=mimetypes.guess_type(target.name)[0] or 'application/octet-stream';raw=target.read_bytes()
    return self.send(200,json.loads(raw) if mime=='application/json' else raw,mime)
   if '.' not in Path(path).name:return self.send(200,{})
   return self.send(404,{})
  if path.startswith('/wizard/') or path in ('/agents','/settings'):
   return self.send(200,{})
  if path.startswith('/wisdom/'):
   return super().do_GET()
  return self.send(404,{})
 def do_POST(self):
  path=urlsplit(self.path).path
  if path not in ('/wisdom/api/wisdom/reaction','/wisdom/api/wisdom/highlight'):
   return self.send(503,{'error':'Synthetic acceptance blocks all agent, authoring, lookup and other writes'})
  self._qa_call={'path':path,'offline_id':self.headers.get('X-Wizard-Offline-Id'),'method':self.command,'startedAt':time.time_ns()//1000000};self.calls.append(self._qa_call)
  return super().do_POST()
http=ThreadingHTTPServer(('127.0.0.1',a.port),H)
if a.cert:
 ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
 ctx.minimum_version=ssl.TLSVersion.TLSv1_2
 ctx.load_cert_chain(a.cert,a.key);http.socket=ctx.wrap_socket(http.socket,server_side=True)
print(json.dumps({'url':f'{"https" if a.cert else "http"}://localhost:{http.server_port}/wizard-os-home/?app-session=wisdom','port':http.server_port,'synthetic':True,'data':str(server.DATA),'web':str(a.web),'wisdom_source':str(a.wisdom_source),'body_sha256':hashlib.sha256(body.encode()).hexdigest()}),flush=True)
server.ORIGINS={f'{"https" if a.cert else "http"}://localhost:{http.server_port}'}
import signal
signal.signal(signal.SIGTERM,lambda *_:(_ for _ in ()).throw(KeyboardInterrupt()))
try:http.serve_forever()
except KeyboardInterrupt:pass
finally:http.server_close();tmp.cleanup()
