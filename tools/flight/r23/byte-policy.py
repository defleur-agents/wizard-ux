"""Pure source metadata. No browser, server or product execution."""
import hashlib,json,re
from urllib.parse import urljoin

def from_sources(root):
 def config(path,marker):return json.JSONDecoder().raw_decode((root/path).read_text().split(marker,1)[1].lstrip())[0]
 host=config('ux/web/core/offline-session-config.js','self.WOS_SW_CONFIG =')
 app=config('wisdom/static/sw.js','self.WIZ_OFFLINE_CONFIG =')
 host_cache='wizard-os-home-shell-'+host['version'];app_cache=app['prefix']+'shell-'+app['version']
 required=[{'url':urljoin('/wizard-os-home/',p),'cache':host_cache} for p in host['shell']]+[{'url':urljoin('/wisdom/',p),'cache':app_cache} for p in app['shell']]
 files=['ux/web/sw.js','ux/web/core/offline-session-config.js','wisdom/static/sw.js','wisdom/static/offline-sw.js']
 return {'allowed':['wos-shell-v1','wos-shell-next-v1',host_cache,app_cache,app['prefix']+'data-'+app['version'],app['prefix']+'assets-'+app['version']], 'prefixes':['wos-shell-','wizard-os-home-shell-',app['prefix']+'shell-',app['prefix']+'data-',app['prefix']+'assets-'], 'workers':[{'scope':'/wizard-os-home/','script':'/wizard-os-home/sw.js'},{'scope':'/wisdom/','script':'/wisdom/sw.js'}], 'required':required,'fontSources':[{'url':urljoin('/wisdom/',src),'family':family} for family,src in re.findall(r'@font-face\{font-family:"([^"]+)";src:url\(([^)]+)\)',(root/'wisdom/static/wisdom.css').read_text())],'generationSourceHashes':{f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in files},'claim':'Complete source-defined app+host shell closure and every unobservable tracked GET exact URL; not every unused product-file or per-worker network-response body.'}
