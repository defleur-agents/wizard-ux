"""Pure source metadata. No browser, server or product execution."""
import hashlib,json,re
from urllib.parse import urljoin

def from_sources(root):
 def config(path,marker):return json.JSONDecoder().raw_decode((root/path).read_text().split(marker,1)[1].lstrip())[0]
 host=config('ux/web/core/offline-session-config.js','self.WIZ_OFFLINE_CONFIG =')
 app=config('wisdom/static/sw.js','self.WIZ_OFFLINE_CONFIG =')
 host_cache='wizard-os-home-shell-'+host['version'];app_cache=app['prefix']+'shell-'+app['version']
 required=[{'url':urljoin('/wizard-os-home/',p),'cache':host_cache} for p in host['shell']]+[{'url':urljoin('/wisdom/',p),'cache':app_cache} for p in app['shell']]
 files=['ux/web/sw.js','ux/web/core/offline-session-config.js','ux/web/core/offline-sw.js','wisdom/static/sw.js','wisdom/static/offline-sw.js']
 # Cache names are engine-defined: only shell uses the build version. Data/assets
 # retain -v1 names; freshness comes from the proven initially empty profile.
 naming="const names = {shell: c.prefix+'shell-'+c.version, data: c.prefix+'data-v1', assets: c.prefix+'assets-v1'};"
 for worker in ('ux/web/core/offline-sw.js','wisdom/static/offline-sw.js'):assert naming in (root/worker).read_text(),'shared worker cache naming changed'
 prefixes=[host['prefix'],app['prefix']]
 allowed=['wos-shell-v1','wos-shell-next-v1']+[p+kind+suffix for p,version in ((host['prefix'],host['version']),(app['prefix'],app['version'])) for kind,suffix in (('shell-',version),('data-','v1'),('assets-','v1'))]
 legacy=(root/'ux/web/sw.js').read_text();shared=(root/'ux/web/core/offline-sw.js').read_text()
 assert "!/no-store/i.test(res.headers.get('cache-control') || '')" in legacy
 assert "shell.has(clean.href)" in shared and "if (self.WizOfflineWorker?.handles(req)) return" in legacy
 assert not any(host.get(k) for k in ('data','assets','onlineOnly')),'rederive network-only policy for new host config'
 network_only=[{'url':urljoin('/wizard-os-home/',p),'path':'ux/web/'+p,'worker':'/wizard-os-home/sw.js','reason':'outside source-defined shared shell; legacy cacheable rejects no-store'} for p in ('store/store-router.js','store/store-install.js','icon-192.png','favicon.ico')]
 assert not any(x['url'] in [i['url'] for i in required] for x in network_only)
 return {'networkOnly':network_only,'allowed':allowed, 'prefixes':['wos-shell-']+[p+kind for p in prefixes for kind in ('shell-','data-','assets-')], 'workers':[{'scope':'/wizard-os-home/','script':'/wizard-os-home/sw.js'},{'scope':'/wisdom/','script':'/wisdom/sw.js'}], 'required':required,'fontSources':[{'url':urljoin('/wisdom/',src),'family':family} for family,src in re.findall(r'@font-face\{font-family:"([^"]+)";src:url\(([^)]+)\)',(root/'wisdom/static/wisdom.css').read_text())],'generationSourceHashes':{f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in files},'claim':'Complete source-defined app+host shell closure and every unobservable tracked GET exact URL; not every unused product-file or per-worker network-response body.'}
