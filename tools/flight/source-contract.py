#!/usr/bin/env python3
"""Read-only source/AST gate. Not a substitute for admitted rendered/device QA."""
import argparse, ast, hashlib, json, re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--ux',type=Path,required=True);p.add_argument('--wisdom',type=Path,required=True);a=p.parse_args()
u,w=a.ux.resolve(),a.wisdom.resolve()
def text(root,name):return (root/name).read_text()
reader=text(w,'static/wisdom.js'); offline=text(w,'static/offline.js'); qa=text(u,'tools/qa-flight-offline.cjs'); fixture=text(u,'tools/qa-flight-offline-fixture.py')
# Check declarations in render output, NOT matches in CSS or unrelated prose.
classes=set()
for attr in re.findall(r'class="([^"]*)"',reader):
 classes.update(re.findall(r'(?<![\w-])(wb-[\w-]+)(?![\w-])',attr))
expected={'wb-reader','wb-flow','wb-stage','wb-count','wb-home'}
assert expected<=classes,expected-classes
assert 'id="wb-pages"' not in reader  # reader itself is .wb-reader; no pages ID
assert 'wisdom-pages' not in qa,'phantom reader selector'
assert 'aria-label="Chapter discussions"' in reader and 'aria-label="Next page"' in reader
assert "link('/highlights'" in reader and "tile('/highlights','Highlights'" in reader
assert '${libraryTiles()}' in reader and "tile('private','My library'" in reader
# Every selector literal used by browser QA is accounted for, including intentional
# negative probes and actual shell selectors. Adding one requires an owner here.
selectors={m[1] for m in re.findall(r"(?:querySelector|getElementById|locator)\((['\"])(.*?)\1",qa)}
owners={'.wb-reader':'reader render article','.wb-reader img':'reader artHtml','.wb-flow':'reader render article','.wb-stage':'reader stage','.wb-count':'reader footer','#toast.show':'negative popup probe','toast':'app toast (negative)', 'wisdom-offline':'removed legacy popup (negative)', '#wisdom-offline':'removed legacy popup (negative)', '[data-offline-failures]':'offline indicator inline status', 'iframe':'actual shell frame',  'a[data-wisdom-route^="/read/flight-chapter"]':'reader collection toc link' , '.wb-home':'home render', '.wd-panel':'discussions.js section constructor'}
for sel in selectors:assert sel in owners,(sel,'unaccounted selector; inspect actual renderer')
for marker in ['data-offline-failures',"prefix:'wisdom-'","writes:['api/wisdom/highlight','api/wisdom/reaction']",'...kit,renderFailures,request:']:assert marker in offline,marker
kit=text(w,'static/offline-kit.js')
exports={'request','flush','status','started','warm','projected','dispose','renderFailures'}
for marker in exports-{'renderFailures'}:assert marker in kit,marker
assert set(re.findall(r'WisdomOffline(?:\?\.|\.)([A-Za-z_$][\w$]*)',qa))<=exports
assert "panel = $('section', 'wd-panel')" in text(w,'static/discussions.js')
# AST: catalog shape and source-generated fixture, no owner data. Normalization in
# wisdom.state/_collections supplies sections/numbers/thinkers/count/minutes/art.
tree=ast.parse(fixture)
node=next(n for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='fixture' for t in n.targets))
keys=[ast.literal_eval(k) for k in node.value.keys]
assert {'thinkers','entries','collections','_art'}<=set(keys)
assert 'Synthetic flight collection' in fixture and 'A quiet beginning' in fixture and 'Quiet attention begins' in fixture
state=text(w,'wisdom.py')
for marker in ["col['sections']","col['numbers']","col['thinkers']","e['body_sha256']","e['minutes']","e['art']"]:assert marker in state,marker
shell=text(u,'web/app.js'); connect=text(u,'android/app/src/main/java/ai/wizards/os/ConnectActivity.java'); index=text(u,'web/index.html')
for marker in ['Wizard orb.', 'Apps and views']:assert marker in index
for marker in ['WizHomeScreenApps?.attach(launcher','appHold !== false','data-ovdl','Add ${esc(window.WizHomeScreenPolicy','overviewMode().appAction']:assert marker in shell,marker
# Derive tokens from the real imported Appearance client, never invented wz-bg.
client=text(w,'static/wizard-appearance.js')
names=ast.literal_eval(re.search(r"const NAMES = (\[[^;]+\]);",client)[1])
reads=set(re.findall(r"getPropertyValue\(['\"](--wz-[^'\"]+)['\"]\)",qa))
assert reads and reads<={'--wz-'+n for n in names},reads
assert "WosSkin.set(s)" in qa and "WizardTheme.current?.skin===s" in qa
native=text(u,'tools/flight/native-flight.py')
assert "'dumpsys window windows'" not in native
assert 'cmd user is-user-unlocked' not in native and native.count("'dumpsys user', lambda") == 2 and "'dumpsys window'" in native
assert 'Started users state: [0=RUNNING_UNLOCKED]' in native
assert 'value:17' not in qa and 'chosen-real-page' in qa and 'before-process-close' in qa
assert "name:'Next page',exact:true" in qa and "'server equals exact final durable reader page'" in qa
assert "Input.dispatchTouchEvent" in qa and "type:'touchStart'" in qa and "type:'touchMove'" in qa and "type:'touchEnd'" in qa
assert "window.WisdomOffline?.renderFailures();" in text(w,'static/app.js')
assert '--uid-owner {uid}' in native and 'ADB healthy immediately after app egress isolation' in native
assert "iptables -I OUTPUT 1 ! -o lo" not in native and "'wait-for-device'], env=ENV, timeout=180" not in native
assert "SERIAL = 'emulator-5568'" in native and "tap('^Next page$')" not in native
assert 'def next_page()' in native and 'native touch swipe advances exactly one real page' in native
assert 'Connect' in connect and 'EditText' in connect and 'connect' in connect
for file in (u/'tools/flight').glob('*.py'):ast.parse(file.read_text(),filename=str(file))
result={'kind':'read-only source AST contract; no rendered QA claim','selectors':{k:owners[k] for k in sorted(selectors)},'readerClasses':sorted(expected),'fixture':'synthetic catalog; server source normalizes render fields','files':{str(x.relative_to(u) if x.is_relative_to(u) else 'wisdom/'+str(x.relative_to(w))):hashlib.sha256(x.read_bytes()).hexdigest() for x in [u/'tools/qa-flight-offline.cjs',u/'tools/qa-flight-offline-fixture.py',u/'tools/flight/native-flight.py',w/'static/wisdom.js',w/'static/offline.js',w/'wisdom.py']}}
print(json.dumps(result,indent=2))
