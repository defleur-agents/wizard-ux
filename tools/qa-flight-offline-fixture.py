#!/usr/bin/env python3
"""Source-bound synthetic Wisdom + real shell/core fixture. No owner data/network.
Runs only on Forum through durable admission. API writes remain in temporary SQLite.
"""
import argparse,base64,copy,hashlib,json,mimetypes,os,ssl,sys,tempfile,threading
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
# Small valid PNG; no copied artwork, fonts, collections or owner state.
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
class H(server.Handler):
 calls=[]
 lost=False
 def send(self,code,data,ctype='application/json',headers=None):
  # Deliberately lose one ACK *after* the real SQLite transaction commits.
  if os.environ.get('QA_LOST_HIGHLIGHT')=='1' and not H.lost and self.command=='POST' and urlsplit(self.path).path=='/wisdom/api/wisdom/highlight' and code==200:
   H.lost=True
   import socket
   self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
  return super().send(code,data,ctype,headers)
 def do_GET(self):
  path=unquote(urlsplit(self.path).path)
  if path=='/__fixture__/receipt':
   with server.db() as c:
    state=wisdom.state(c);tables={r[0] for r in c.execute('select name from sqlite_master')};count=c.execute('select count(*) from wisdom_offline_receipts').fetchone()[0] if 'wisdom_offline_receipts' in tables else 0
   return self.send(200,{'synthetic':True,'state':state,'receipts':count,'writes':self.calls})
  if path.startswith('/wisdom/wisdom-art/'):
   return self.send(200,PNG,'image/png')
  if path=='/wizard/v1/bootstrap':
   return self.send(200,{'bootstrap':1,'settings':{'owner':{},'agent':{'name':'Wizard'},'clock':{}},'capabilities':{},'endpoints':{'apps':'/wizard/v1/apps'}})
  if path in ('/wizard/v1/apps','/apps.json','/wizard-os-home/apps.json','/wizard/wizard-os-home/apps.json','/wizard/store-data/wizard/v1/installed-apps','/wizard-os-home/store-data/wizard/v1/installed-apps'):
   app={'id':'wisdom','name':'Wisdom','type':'utility','system':False,'source':'apps.json','status':'running','url':'/wisdom/','icon':'book-open','colors':['#c4b393','#675b43'],'view':{'mode':'own','url':'/wisdom/'},'runtime':{'status':'running'}}
   return self.send(200,{'apps':[app],'wam':[app]})
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
  self.calls.append({'path':path,'offline_id':self.headers.get('X-Wizard-Offline-Id')})
  return super().do_POST()
http=ThreadingHTTPServer(('127.0.0.1',a.port),H)
if a.cert:
 ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(a.cert,a.key);http.socket=ctx.wrap_socket(http.socket,server_side=True)
print(json.dumps({'url':f'{"https" if a.cert else "http"}://localhost:{http.server_port}/wizard-os-home/?app-session=wisdom','port':http.server_port,'synthetic':True,'data':str(server.DATA),'web':str(a.web),'wisdom_source':str(a.wisdom_source),'body_sha256':hashlib.sha256(body.encode()).hexdigest()}),flush=True)
server.ORIGINS={f'{"https" if a.cert else "http"}://localhost:{http.server_port}'}
import signal
signal.signal(signal.SIGTERM,lambda *_:(_ for _ in ()).throw(KeyboardInterrupt()))
try:http.serve_forever()
except KeyboardInterrupt:pass
finally:http.server_close();tmp.cleanup()
