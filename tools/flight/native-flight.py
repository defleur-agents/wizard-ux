#!/usr/bin/env python3
"""Disposable forum release-APK acceptance. Run ONLY under a durable heavy lease.
No owner origin, live data or native modification; SDK/AVD remain under this job.
The release WebView is intentionally not debug-enabled. Use native input and
accessibility, preserve screenshots, and FAIL rather than invent DOM evidence.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess as sp
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
import importlib.util
import renderer_r14
_spec=importlib.util.spec_from_file_location('adb_transport',Path(__file__).with_name('adb-transport.py'))
_transport=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_transport)

def installed_application_uid(installed, package):
    """API35 exact-package appId, cross-checked against actual user-0 UID."""
    blocks = list(re.finditer(r'^  Package \[([^\]]+)\].*$', installed, re.M))
    selected = [(m, blocks[i+1].start() if i+1<len(blocks) else len(installed))
                for i,m in enumerate(blocks) if m[1] == package]
    if len(selected) != 1:raise ValueError('exact installed package missing or ambiguous')
    match,end = selected[0]
    app_ids = set(map(int,re.findall(r'^    appId=(\d+)\b',installed[match.end():end],re.M)))
    uids = set(map(int,re.findall(r'^    uid=(\d+)\b',installed,re.M)))
    if len(app_ids)!=1 or len(uids)!=1:raise ValueError('actual appId/uid missing or ambiguous')
    app_id = app_ids.pop(); uid = uids.pop()
    if app_id < 10000 or app_id >= 100000 or uid != app_id:
        raise ValueError('user-0 appId/uid mismatch or unsafe UID')
    return uid

def stop_signal(*_):raise KeyboardInterrupt('admitted native job terminated')
signal.signal(signal.SIGTERM,stop_signal)

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT/'source-manifest.json').read_text())
OUT = ROOT / 'evidence' / 'native'
OUT.mkdir(parents=True, exist_ok=True)
SDK = Path(os.environ.get('PIN_ANDROID_SDK', Path('/srv/work/android-sdk')))
IMAGE = 'system-images;android-35;google_apis;x86_64'
APK = ROOT / 'current-release.apk'
EXPECTED = '04a188ae173b3a2cd22139256be9fe3158355079949f8b44c4be0eca2f90b767'
PKG = 'ai.wizards.os'
PORT = 28543
SERIAL = '127.0.0.1:6169'
ORIGIN = f'https://localhost:{PORT}'
ENV = {**os.environ, 'ANDROID_HOME': str(SDK), 'ANDROID_SDK_ROOT': str(SDK),
       'ANDROID_AVD_HOME': str(ROOT / 'avds'), 'TMPDIR': str(ROOT / 'tmp'), 'ANDROID_ADB_SERVER_PORT': '5147',
       'ADB_SERVER_SOCKET':'tcp:127.0.0.1:5147', 'ADB_LOCAL_TRANSPORT_MAX_PORT':'5553',
       'ADB_MDNS_AUTO_CONNECT':''}
checks = []
fixture = emulator = None
adb = SDK / 'platform-tools/adb'
transport = _transport.Transport(adb,ENV,OUT,SERIAL)
wrapper = ROOT/'isolated-adb.py'

def run(argv, *, ok=True, timeout=120, input=None):
    r = sp.run([str(x) for x in argv], env=ENV, input=input, capture_output=True, timeout=timeout)
    if ok and r.returncode:
        raise RuntimeError(f'{argv!r} exited {r.returncode}: {r.stderr.decode(errors="replace")[-3000:]} {r.stdout.decode(errors="replace")[-3000:]}')
    return r.stdout.decode(errors='replace')

def a(*args, **kw):
    # Fail fast: a lost transport is evidence, not three 180-second waits.
    r=transport.command(*args,timeout=kw.pop('timeout',120))
    if kw.get('ok',True) and r.returncode:raise RuntimeError(f'ADB command failed, NOT replayed: {args!r} rc={r.returncode} stderr={r.stderr.decode(errors="replace")[-3000:]}')
    if r.returncode==0 and args and args[0]=='reverse':
        transport.reverse=None if '--remove' in args else tuple(args[1:])
    return r.stdout.decode(errors='replace')

def shell(command, **kw):
    if command.startswith(('getprop ','dumpsys ','pidof ','cat ','ss ','iptables -S ','logcat -d ')) and kw.get('ok',True):
        return transport.read('shell',command,timeout=kw.get('timeout',120)).decode(errors='replace')
    if 'am force-stop ' in command:transport.identity=None
    return a('shell', command, **kw)

def top():
    return '\n'.join(s for s in shell('dumpsys activity activities').splitlines() if 'ResumedActivity' in s)

def record(name, condition, detail=None):
    checks.append({'name': name, 'pass': bool(condition), 'detail': detail})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    if not condition:
        raise AssertionError(name + ': ' + str(detail))

def until(fn, seconds=60):
    end = time.monotonic() + seconds
    last = None
    while time.monotonic() < end:
        last = fn()
        if last:
            return last
        time.sleep(1)
    raise TimeoutError(str(last))

def readiness(name, command, predicate, seconds=60):
    # Persist every actual API35 response; a timeout names its predicate, not False.
    last = ''
    def probe():
        nonlocal last
        last = shell(command, ok=False, timeout=15)
        (OUT / ('ready-' + name + '.txt')).write_text(last)
        return predicate(last)
    try:
        until(probe, seconds)
    except Exception:
        record('native readiness: ' + name, False, {'command':command,'last':last[-3000:]})
        raise
    record('native readiness: ' + name, True, {'command':command,'last':last[-3000:]})

ui_serial = 0

def raw_screen(name):
    image=transport.read('exec-out','screencap','-p',timeout=15)
    r=sp.CompletedProcess([],0,image,b'')
    (OUT / (name + '-screencap.stderr')).write_bytes(r.stderr)
    if r.returncode == 0 and r.stdout.startswith(b'\x89PNG'):
        (OUT / (name + '.png')).write_bytes(r.stdout)
    else:
        (OUT / (name + '-screencap.stdout')).write_bytes(r.stdout)

def diagnostics(name):
    # Every probe independent: failed accessibility must never suppress raw pixels/logs.
    for suffix, command in [('activity','dumpsys activity activities'),('window','dumpsys window'),('input','dumpsys input'),('user','dumpsys user'),('zygote','getprop init.svc.zygote; pidof zygote64; pidof zygote'),('logcat','logcat -d -t 1500')]:
        try:(OUT / (name + '-' + suffix + '.txt')).write_text(shell(command, ok=False, timeout=15))
        except Exception as e:(OUT / (name + '-' + suffix + '.error')).write_text(repr(e))

def ui():
    global ui_serial
    ui_serial += 1
    name = 'ui-%04d' % ui_serial
    try:raw_screen(name)  # MUST precede UIAutomator, even its first invocation.
    except Exception as e:(OUT / (name + '-screencap.error')).write_text(repr(e))
    deadline = time.monotonic() + 65
    for attempt in range(3):
        prefix = OUT / (name + '-attempt-%d' % attempt)
        # uiautomator overwrites its capture path; no mutating rm before a read.
        argv = [str(adb), '-H','127.0.0.1','-P', '5147', '-s', SERIAL, 'shell', 'timeout 18s uiautomator dump --compressed /sdcard/pin-ui.xml']
        try:
            # Idempotent capture only: offline reconnect cannot duplicate an input.
            data=transport.read('shell',argv[-1],timeout=22)
            r=sp.CompletedProcess(argv,0,data,b'')
            prefix.with_suffix('.stdout').write_bytes(r.stdout)
            prefix.with_suffix('.stderr').write_bytes(r.stderr)
            prefix.with_suffix('.json').write_text(json.dumps({'argv':argv,'returncode':r.returncode}))
            if r.returncode == 0:
                raw = shell('cat /sdcard/pin-ui.xml', timeout=10)
                root = ET.fromstring(raw)
                if root.tag == 'hierarchy' and list(root.iter('node')):
                    (OUT / (name + '.xml')).write_text(raw)
                    (OUT / 'latest.xml').write_text(raw)
                    transport.bind_identity()
                    return raw
        except (sp.TimeoutExpired, ET.ParseError) as e:
            prefix.with_suffix('.error').write_text(repr(e))
            if isinstance(e, sp.TimeoutExpired):
                prefix.with_suffix('.stdout').write_bytes(e.stdout or b'')
                prefix.with_suffix('.stderr').write_bytes(e.stderr or b'')
        diagnostics(name + '-attempt-%d' % attempt)
        if time.monotonic() >= deadline:break
        time.sleep(1)
    raise RuntimeError('UIAutomator unavailable after bounded attempts; raw pixels, stdout/stderr, activity/window/input/zygote/logcat at ' + name)

def nodes(raw=None):
    return list(ET.fromstring(raw or ui()).iter('node'))

def label(n):
    return (n.get('text') or n.get('content-desc') or '').strip()

def bounds(n):
    v = list(map(int, re.findall(r'\d+', n.get('bounds', ''))))
    return ((v[0]+v[2])//2, (v[1]+v[3])//2) if len(v)==4 and v[2]>v[0] and v[3]>v[1] else None

def find(pattern, raw=None):
    return next((bounds(n) for n in nodes(raw) if re.search(pattern, label(n), re.I) and bounds(n)), None)

def tap(pattern, seconds=30, long=False):
    xy = until(lambda: find(pattern), seconds)
    x, y = xy
    shell(f'input swipe {x} {y} {x} {y} 800' if long else f'input tap {x} {y}')
    time.sleep(1)
    return xy

def scroll_tap(pattern, attempts=10):
    for _ in range(attempts):
        xy = find(pattern)
        if xy:
            shell(f'input tap {xy[0]} {xy[1]}'); time.sleep(1); return xy
        shell('input swipe 540 1700 540 600 450'); time.sleep(1)
    raise AssertionError('No visible native target: ' + pattern)

def page_count(raw=None):
    counts=[label(n) for n in nodes(raw) if re.fullmatch(r'\d+\s*/\s*\d+',label(n))]
    if len(counts)!=1:raise AssertionError('Expected actual reader page count: '+repr(counts))
    return tuple(map(int,counts[0].split('/')))

def next_page():
    raw=ui();before=page_count(raw);ns=nodes(raw)
    # Bounds are from actual accessibility: between reader header and page footer.
    header=next(n for n in ns if label(n)=='Chapter discussions')
    footer=next(n for n in ns if re.fullmatch(r'\d+\s*/\s*\d+',label(n)))
    hb=list(map(int,re.findall(r'\d+',header.get('bounds',''))))
    fb=list(map(int,re.findall(r'\d+',footer.get('bounds',''))))
    rootb=list(map(int,re.findall(r'\d+',ns[0].get('bounds',''))))
    left,right=rootb[0],rootb[2];y=(hb[3]+fb[1])//2
    assert hb[3]<y<fb[1] and right-left>100
    shell(f'input swipe {left+(right-left)*4//5} {y} {left+(right-left)//5} {y} 200')
    after=until(lambda: (c if (c:=page_count())!=before else None),15)
    record('native touch swipe advances exactly one real page',after==(before[0]+1,before[1]),{'before':before,'after':after,'header':hb,'footer':fb})
    return after

def capture(name):
    for action in [lambda:raw_screen(name), lambda:diagnostics(name), lambda:(OUT / (name + '.xml')).write_text(ui())]:
        try:action()
        except Exception as e:
            with (OUT / (name + '-capture-error.txt')).open('a') as f:f.write(repr(e)+'\n')


def sdk_prepare():
    # Reuse preflighted SDK/API35; no downloads or old AVD state. Fresh disposable device.
    manager = SDK/'cmdline-tools/latest/bin/avdmanager'
    assert manager.is_file() and (SDK/'system-images/android-35/google_apis/x86_64/system.img').is_file()
    transport.start()
    run([manager,'create','avd','--name','wisdom-flight','--package',IMAGE,'--path',ROOT/'avd'],input=b'no\n',timeout=90)
    config=ROOT/'avd/config.ini'
    lines=config.read_text().splitlines()
    settings={'hw.lcd.width':'1080','hw.lcd.height':'2160','hw.lcd.density':'420','firstboot.bootFromDownloadableSnapshot':'no','firstboot.bootFromLocalSnapshot':'no','firstboot.saveToLocalSnapshot':'no'}
    config.write_text('\n'.join(x for x in lines if x.split('=')[0].strip() not in settings)+'\n'+'\n'.join(k+'='+v for k,v in settings.items())+'\n')

def tls_prepare():
    """Rig-generated CA; never owner keys. Trust it only inside this disposable AVD."""
    ca, key = ROOT / 'rig-ca.pem', ROOT / 'rig-ca.key'
    cert, server_key = ROOT / 'rig-server.pem', ROOT / 'rig-server.key'
    run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',ca,
         '-days','2','-subj','/CN=Disposable Wisdom pin rig CA',
         '-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-addext','subjectKeyIdentifier=hash'])
    csr = ROOT / 'rig-server.csr'
    run(['openssl','req','-newkey','rsa:2048','-nodes','-keyout',server_key,'-out',csr,
         '-subj','/CN=localhost'])
    ext = ROOT / 'rig-tls.ext'
    ext.write_text('subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nauthorityKeyIdentifier=keyid\n')
    run(['openssl','x509','-req','-in',csr,'-CA',ca,'-CAkey',key,'-CAcreateserial',
         '-out',cert,'-days','2','-extfile',ext])
    h = run(['openssl','x509','-subject_hash_old','-noout','-in',ca]).strip()
    a('root'); a('wait-for-device')
    shell('setenforce 0')
    shell('mkdir -p /data/local/tmp/pin-cacerts; cp /apex/com.android.conscrypt/cacerts/* /data/local/tmp/pin-cacerts/')
    a('push', str(ca), '/data/local/tmp/pin-cacerts/' + h + '.0')
    shell('chmod 755 /data/local/tmp/pin-cacerts; chmod 644 /data/local/tmp/pin-cacerts/*')
    # Android 14+ Conscrypt reads its APEX certs in zygote namespaces, not /system.
    # Bind the copied store in each zygote namespace before starting the release APK.
    mounted=[]
    for z in ['zygote64', 'zygote']:
        pids = shell('pidof ' + z, ok=False).split()
        for pid in pids:
            shell(f'nsenter -t {pid} -m -- /system/bin/mount --bind /data/local/tmp/pin-cacerts /apex/com.android.conscrypt/cacerts')
            mounted.append({'zygote':z,'pid':pid})
    record('test CA mounted only in disposable AVD zygotes', bool(mounted), mounted)
    return cert, server_key

started_at=time.time()
result = {'name':'wizard pin opens wisdom offline', 'source_revision':MANIFEST['shell_candidate'],
          'apk':{'version':'0.10.23','versionCode':87,'sha256':EXPECTED},'checks':checks,
          'origin':ORIGIN,'device':'disposable forum API35 x86_64 AVD','status':'failed'}
try:
    record('actual current-version APK bytes', hashlib.sha256(APK.read_bytes()).hexdigest()==EXPECTED)
    assert MANIFEST['apk']=={'sha256':EXPECTED,'signer':'3bf74d0b597bc170761079909d3692428702ba057f753ee1ffd62da3c76ed1fd','version':'0.10.23','versionCode':87}
    signer=run([SDK/'build-tools/35.0.0/apksigner','verify','--print-certs',APK]);(OUT/'apk-signer.txt').write_text(signer)
    record('published signer verified',MANIFEST['apk']['signer'] in signer.lower().replace(':',''))
    badging=run([SDK/'build-tools/35.0.0/aapt','dump','badging',APK]);(OUT/'apk-badging.txt').write_text(badging)
    record('release package/version and non-debuggable preflight',"package: name='ai.wizards.os'" in badging and "versionCode='87'" in badging and "versionName='0.10.23'" in badging and 'application-debuggable' not in badging)

    (ROOT/'avds').mkdir(exist_ok=True)
    (ROOT/'tmp').mkdir(exist_ok=True)
    record('hardware KVM accessible', os.access('/dev/kvm', os.R_OK|os.W_OK))
    renderer_meta=renderer_r14.preflight(SDK)
    pinned=json.loads((ROOT/'proof/renderer-preflight-r14.json').read_text())
    record('installed swangle metadata matches pinned host inputs', renderer_meta['host_inputs']==pinned['host_inputs'] and renderer_meta['help_gpu']==pinned['help_gpu'])
    sdk_prepare()
    # SDK-documented explicit pair outside shared ADB's default scan range.
    # R14: explicit swangle selects ANGLE -> Vulkan SwiftShader, not legacy GLES.
    # Guest Vulkan remains disabled; prove actual selection/libraries at boot/end.
    (OUT/'emulator-help-feature.txt').write_text(run([SDK/'emulator/emulator','-help-feature']))
    emulator_argv = [str(SDK/'emulator/emulator'), '-avd','wisdom-flight','-ports','6168,6169',
        '-no-direct-adb','-adb-path',str(wrapper),
        '-accel','on','-no-window','-no-audio','-no-snapshot','-wipe-data','-gpu','swangle',
        '-memory','4096','-cores','4','-feature','-Vulkan']
    result['graphics']={'gpu':'swangle','feature_override':['-feature','-Vulkan'],
        'argv':emulator_argv,'scope':'emulator functional acceptance; not physical GPU proof'}
    (OUT/'emulator-argv.json').write_text(json.dumps(emulator_argv,indent=2))
    emulator = sp.Popen(emulator_argv, env=ENV, stdout=(OUT/'emulator.log').open('w'), stderr=sp.STDOUT)
    transport.attach(emulator)
    until(lambda:a('get-state',ok=False).strip()=='device',180)
    transport.start_logcat()
    record('native readiness: adb transport', True)
    readiness('boot-completed', 'getprop sys.boot_completed', lambda s:s.strip()=='1', 240)
    shell('input keyevent KEYCODE_WAKEUP; wm dismiss-keyguard')
    readiness('user-unlocked', 'dumpsys user', lambda s:bool(re.search(r'UserInfo\{0:[^\n]+\n(?:(?!\s*UserInfo\{)[\s\S])*?\n\s+State: RUNNING_UNLOCKED\b',s)) and 'Started users state: [0=RUNNING_UNLOCKED]' in s)
    readiness('zygote-running', 'getprop init.svc.zygote', lambda s:s.strip()=='running')
    readiness('system-server', 'pidof system_server', lambda s:bool(re.fullmatch(r'[0-9]+(?:\s+[0-9]+)*',s.strip())))
    # R4 full dumpsys window captured this real field; the windows subcommand did not.
    readiness('focused-window', 'dumpsys window', lambda s:bool(re.search(r'mCurrentFocus=Window\{[^}]+\}',s)))
    for setting in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:
        shell('settings put global '+setting+' 0')
    record('boot unlocked API35 input/window services ready',shell('getprop ro.build.version.sdk').strip()=='35')
    record('actual ANGLE Vulkan SwiftShader backend at boot', renderer_r14.observe(emulator,OUT,'renderer-boot',SDK)['accepted'])
    cert, key = tls_prepare()
    transport.start_logcat(restart=True)  # root changed adbd before installation
    readiness('post-tls-user-unlocked', 'dumpsys user', lambda s:bool(re.search(r'UserInfo\{0:[^\n]+\n(?:(?!\s*UserInfo\{)[\s\S])*?\n\s+State: RUNNING_UNLOCKED\b',s)) and 'Started users state: [0=RUNNING_UNLOCKED]' in s)
    readiness('post-tls-zygote', 'getprop init.svc.zygote', lambda s:s.strip()=='running')
    diagnostics('boot-ready')
    # The app UID policy is installed after package discovery, before first launch.
    # Do not filter root/adbd: its TCP control transport is not app web egress.
    (OUT/'device-sockets-before.txt').write_text(shell('ss -ntp; iptables -S OUTPUT; ip6tables -S OUTPUT'))
    env={**ENV,'QA_LOST_HIGHLIGHT':'1'}
    fixture = sp.Popen([sys.executable,str(ROOT/'ux/tools/qa-flight-offline-fixture.py'),
        '--web',str(ROOT/'ux/web'),'--wisdom-source',str(ROOT/'wisdom'),'--port',str(PORT),
        '--cert',str(cert),'--key',str(key)],env=env,stdout=(OUT/'fixture.jsonl').open('w'),stderr=(OUT/'fixture.log').open('w'))
    until(lambda:(OUT/'fixture.jsonl').stat().st_size>0,60)
    import ssl
    context=ssl.create_default_context(cafile=str(ROOT/'rig-ca.pem'))
    def receipt():
        with urllib.request.urlopen(ORIGIN+'/__fixture__/receipt',context=context) as r:return json.load(r)
    record('synthetic-only isolated collection',receipt()['synthetic'] and len(receipt()['state']['collections'])==1)
    chosen={'collection':{'title':'Synthetic flight collection'},'entry':{'title':'A quiet beginning'}}
    result['source_manifest_sha256']=hashlib.sha256((ROOT/'source-manifest.json').read_bytes()).hexdigest()
    result['chapter']={'collection':chosen['collection']['title'],'title':chosen['entry']['title']}
    a('reverse',f'tcp:{PORT}',f'tcp:{PORT}')
    record('published release installs','Success' in a('install','-r',str(APK),timeout=180))
    installed=shell('dumpsys package '+PKG);(OUT/'installed-package.txt').write_text(installed)
    record('installed exact .23/code87 signed artifact','versionName=0.10.23' in installed and 'versionCode=87' in installed)
    uid=installed_application_uid(installed,PKG)
    record('exact installed application UID discovered', True, {'package':PKG,'appId':uid,'uid':uid,'androidUser':0})
    record('application UID is not root or shell',uid>=10000)
    for table in ('iptables','ip6tables'):
        shell(f'{table} -N WISDOM_QA_EGRESS && {table} -A WISDOM_QA_EGRESS ! -o lo -j REJECT && {table} -I OUTPUT 1 -m owner --uid-owner {uid} -j WISDOM_QA_EGRESS')
    policy=shell('iptables -S OUTPUT; iptables -S WISDOM_QA_EGRESS; ip6tables -S OUTPUT; ip6tables -S WISDOM_QA_EGRESS')
    (OUT/'device-egress-policy.txt').write_text(policy)
    record('app external egress denied IPv4 and IPv6 before launch',policy.count(f'--uid-owner {uid} -j WISDOM_QA_EGRESS')==2 and policy.count('! -o lo -j REJECT')==2,{'uid':uid,'scope':'release app UID; loopback retained; root/adbd unaffected'})
    # Documentation-only address cannot receive traffic: the UID rule rejects the SYN.
    probe=shell(f"su {uid} /system/bin/sh -c 'id; toybox nc -w 2 192.0.2.1 443 </dev/null; echo probe_status=$?'",timeout=10)
    counters=shell('iptables -nvx -L WISDOM_QA_EGRESS; ip6tables -nvx -L WISDOM_QA_EGRESS; ss -ntp')
    (OUT/'device-egress-probe.txt').write_text(probe+'\n'+counters)
    rejected=sum(int(m[1]) for m in re.finditer(r'^\s*(\d+)\s+\d+\s+REJECT\b',counters,re.M))
    record('app UID external SYN rejected by actual firewall counter',f'uid={uid}' in probe and 'probe_status=0' not in probe and rejected>0,{'probe':probe,'rejected_packets':rejected})
    record('ADB healthy immediately after app egress isolation',a('get-state',timeout=10).strip()=='device' and shell('echo adb-control-alive',timeout=10).strip()=='adb-control-alive')
    (OUT/'device-sockets-after.txt').write_text(shell('ss -ntp; cat /proc/net/nf_conntrack 2>/dev/null',ok=False))
    # Pair through the real release Connect screen (no QA origin hook or TLS bypass).
    data='wizard://connect?origin=https%3A%2F%2Flocalhost%3A'+str(PORT)
    transport.identity=None  # intentional Activity/process transition, never recovery
    shell('am start -W -a android.intent.action.VIEW -d '+data+' -p '+PKG)
    transport.bind_identity()
    # Bounded real stability probe, same AVD/install and untouched Connect screen.
    for stability_index in range(20):
        raw=ui();raw_screen('connect-stability-%02d'%stability_index)
        record('Connect transport stability %02d'%stability_index,find('^Connect$',raw) is not None and 'ai.wizards.os' in raw,{'xml':'ui-%04d.xml'%ui_serial,'screenshot':'connect-stability-%02d.png'%stability_index})
        time.sleep(.5)
    capture('00-connect-before-input')
    scroll_tap('^Connect$')
    until(lambda:'.MainActivity' in top(),60)
    time.sleep(2)
    for _ in range(8):
        raw=ui(); p=find(r'^(Skip|Got it|GOT IT|OK|Not now)$',raw)
        if not p: break
        shell(f'input tap {p[0]} {p[1]}');time.sleep(1)
    orb=until(lambda:find(r'^Wizard orb\.'),60)
    # Native swipe on the actual accessible orb opens the existing Apps launcher.
    shell(f'input swipe {orb[0]} {orb[1]} {orb[0]} {orb[1]-500} 350')
    tap('^Wisdom$',long=True)
    if not find('^Add to home screen$'):
        # attach(launcher) is gated by overviewMode().appHold; Miguel disables it.
        # Its source-supported alternative is a single-app Desks download action.
        tap('^Wisdom$')
        until(lambda:find('^A quiet beginning$'),45)
        dock=until(lambda:next((bounds(n) for n in nodes() if label(n)=='Wisdom' and bounds(n) and bounds(n)[1]>1700),None),20)
        x,y=dock;shell(f'input swipe {x} {y} {x} {y} 800')
        tap(r'^Wisdom, current desk$',long=True)
        tap('^Add Wisdom to home screen$')
    capture('01-native-pin-sheet')
    tap('^Add to home screen$')
    capture('02-os-pin-confirmation')
    tap('^(Add|Add automatically|Add to home screen|ADD)$')
    shortcuts=shell('dumpsys shortcut');(OUT/'shortcuts.txt').write_text(shortcuts)
    record('native OS-confirmed Wisdom shortcut exists','homeapp-' in shortcuts and 'Wisdom' in shortcuts)
    shell('input keyevent KEYCODE_HOME');tap('^Wisdom$')
    until(lambda:'.AppSessionActivity' in top(),30)
    # Accessibility may omit the transient saving pill. Native offline content below,
    # not a fixed timer or a partial download log, is the final cache-readiness proof.
    until(lambda:find(r'Synthetic flight collection|Browse all'),60)
    # Source-defined diagnostic label remains in accessibility only when exposed;
    # fixture request closure is a server-side readiness diagnostic, never a fake API.
    until(lambda: any('/wisdom/api/wisdom' == x['path'] for x in receipt()['reads']) and any('/wisdom/wisdom-art/c/flight-chapter.jpg' == x['path'] for x in receipt()['reads']),60)
    capture('03-online-pinned')
    result['onlineLabels']=[label(n) for n in nodes() if label(n)]
    record('pinned online Wisdom rendered',any(re.search('Browse|Suggested|Currently reading',s) for s in result['onlineLabels']))
    shortcuts_before=shell('dumpsys shortcut');(OUT/'shortcuts-before.txt').write_text(shortcuts_before)
    shell('cmd connectivity airplane-mode enable; svc wifi disable')
    record('Wi-Fi actually disabled','disabled' in shell('cmd wifi status').lower())
    record('airplane mode actually enabled',shell('settings get global airplane_mode_on').strip()=='1')
    (OUT/'connectivity-airplane.txt').write_text(shell('dumpsys connectivity'))
    a('reverse','--remove',f'tcp:{PORT}')
    transport.identity=None  # subsequent intentional process-death gate
    # Removing reverse makes this origin unreachable; keep server state for later reconnect.
    shell('input keyevent KEYCODE_HOME');shell('am force-stop '+PKG);time.sleep(2)
    record('Wizard process stopped before icon tap',not shell('pidof '+PKG,ok=False).strip())
    tap('^Wisdom$')
    time.sleep(12)
    capture('04-offline-cold-pin')
    labels=[label(n) for n in nodes() if label(n)]
    result['offlineLabels']=labels
    record('offline icon launches AppSessionActivity','.AppSessionActivity' in top())
    record('Wisdom renders offline rather than ReachScreen',any(re.search('Browse|Suggested|Currently reading',s) for s in labels)
           and not any(re.search('can.t reach your Wizard|Tailscale is off|Try again',s,re.I) for s in labels),labels)
    # One synthetic collection may be reached directly or via Browse all.
    if find(r'Browse all'):tap(r'Browse all')
    capture('05-offline-library')
    visible_title=re.sub(r'^The wisdom of\s+', '', chosen['collection']['title'], flags=re.I)
    scroll_tap(re.escape(visible_title))
    scroll_tap(re.escape(chosen['entry']['title']))
    capture('06-offline-illustrated-chapter')
    chapter_labels=[label(n) for n in nodes() if label(n)]
    record('offline chapter title readable',any(chosen['entry']['title'] in s for s in chapter_labels),chapter_labels)
    record('reader controls prove chapter opened',find('^Chapter discussions$') is not None)
    next_page()
    capture('06b-offline-chapter-text')
    body_labels=[label(n) for n in nodes() if label(n)]
    record('offline chapter has readable text',sum(len(s) for s in body_labels)>120,body_labels)
    # Actual release WebView is not debug-enabled. Use native touch/accessibility only.
    result['artEvidence']='06-offline-illustrated-chapter.png (synthetic image; parent inspect)'
    record('no offline popups anywhere',not any(re.search(r'Saving for offline|Saved for offline|Syncing changes|synced|Offline \u2014|device is offline',s,re.I) for s in body_labels),body_labels)
    textnode=next((n for n in nodes() if 'Quiet attention begins' in label(n) and bounds(n)),None)
    record('native selectable body exists',textnode is not None)
    b=list(map(int,re.findall(r'\d+',textnode.get('bounds',''))))
    x,y=b[0]+min(18,(b[2]-b[0])//3),b[1]+min(25,(b[3]-b[1])//3)
    shell(f'input swipe {x} {y} {x} {y} 1200');time.sleep(2)
    capture('09-native-highlight-menu')
    tap(r'^Highlight$')
    capture('10-native-highlight-saved-offline')
    # Real Android Back must pop a chapter before ever leaving the pinned activity.
    shell('input keyevent KEYCODE_BACK');time.sleep(1)
    after=[label(n) for n in nodes() if label(n)]
    record('native nested Back returns to collection',find('^Chapter discussions$') is None and any('Export this collection' in s for s in after),after)
    scroll_tap(re.escape(chosen['entry']['title']));next_page()
    # Move forward to save actual reading position, then kill the process again offline.
    next_page();next_page()
    shell('input keyevent KEYCODE_HOME');shell('am force-stop '+PKG)
    record('second process death before reconnect',not shell('pidof '+PKG,ok=False).strip())
    tap('^Wisdom$');until(lambda:'.AppSessionActivity' in top(),30);time.sleep(8)
    # Do not replace/recreate this OS shortcut. Open the saved Highlights view in the same pin.
    for _ in range(6):shell('input keyevent KEYCODE_BACK');time.sleep(.3)
    record('repeated native root Back never exits','.AppSessionActivity' in top())
    # browse() renders libraryTiles(), including its /highlights tile. A collection
    # or /shelf/private does not render it. Do not detour through either.
    scroll_tap(r'^Browse all')
    scroll_tap(r'^Highlights\b')
    capture('11-retained-offline-highlight')
    retained=[label(n) for n in nodes() if label(n)]
    record('highlight survives offline process death',any('Quiet' in s for s in retained),retained)
    # Reconnect only after the retained local highlight has been observed.
    shell('cmd connectivity airplane-mode disable; svc wifi enable')
    a('reverse',f'tcp:{PORT}',f'tcp:{PORT}')
    # Airplane/transport restoration fires normal online/retry handling. A foreground reload
    # is also real pin behavior and triggers existing flush; never invoke app JS from native QA.
    for attempt in range(3):
        shell('input keyevent KEYCODE_HOME');shell('am force-stop '+PKG);tap('^Wisdom$');time.sleep(5)
        r=receipt()
        if len([x for x in r['writes'] if x['path'].endswith('/highlight')])>=2:break
    r=receipt();hs=r['state']['highlights'];ops=[x['offline_id'] for x in r['writes'] if x['path'].endswith('/highlight')]
    record('native retained edits reconnect exactly once',len(hs)==1 and len(ops)>=2 and len(set(ops))==1 and bool(ops[0]),{'highlights':len(hs),'attempts':len(ops),'ids':ops})
    record('native reading progress survives and syncs',r['state']['entries'][0]['progress']>0,r['state']['entries'][0]['progress'])
    (OUT/'synthetic-server-receipt.json').write_text(json.dumps(r,indent=2))
    after_shortcuts=shell('dumpsys shortcut');(OUT/'shortcuts-after.txt').write_text(after_shortcuts)
    record('same native pin identity retained',re.findall(r'id=homeapp-[^,}\s]+',shortcuts_before)==re.findall(r'id=homeapp-[^,}\s]+',after_shortcuts))
    capture('12-reconnected-same-pin')
    record('actual ANGLE Vulkan SwiftShader backend after complete flight', renderer_r14.observe(emulator,OUT,'renderer-complete',SDK)['accepted'])
    result['status']='passed-needs-visual-inspection'
except Exception as e:
    result['failure']=repr(e)
    print('FAILED',repr(e),flush=True)
    if emulator: capture('FAIL')
finally:
    result['emulator_pre_cleanup_returncode']=emulator.poll() if emulator else None
    rc=result['emulator_pre_cleanup_returncode']
    result['host_failure_classification']=('emulator-host-SIGSEGV-not-guest-app-crash' if rc == -signal.SIGSEGV else
        'emulator-host-exited-before-cleanup' if rc is not None else 'no-premature-emulator-exit')
    if rc is not None:result['status']='failed'
    try:
        text=(OUT/'emulator.log').read_text(errors='replace')
        (OUT/'graphics-backend.txt').write_text('\n'.join(line for line in text.splitlines()
            if re.search(r'vulkan|swiftshader|gfxstream|renderer|opengl|feature',line,re.I))+'\n')
    except Exception as e:(OUT/'graphics-backend.error').write_text(repr(e))
    result['logcat_alive_before_cleanup']=transport.logcat is not None and transport.logcat.poll() is None
    if emulator:
        try:(OUT/'logcat.txt').write_text(a('logcat','-d','-t','5000',ok=False))
        except Exception:pass
        # Own Popen only: TCP serial is not an 'adb emu' serial.
        if emulator.poll() is None:emulator.terminate()
        try:emulator.wait(timeout=20)
        except Exception:emulator.kill();emulator.wait(timeout=10)
        try:
            transport.command('disconnect',SERIAL,serial=False)
            until(lambda: SERIAL not in transport.command('devices','-l',serial=False).stdout.decode(),10)
        except Exception as e:
            result['status']='failed';result['cleanup_error']=repr(e)
    transport_cleanup=transport.close()
    # Preserve crash reports only for this run's advertised crash DB. No crash assumption.
    if emulator:
        try:
            text=(OUT/'emulator.log').read_text(errors='replace')
            for crash_path in re.findall(r'Storing crashdata in: ([^,\n]+)',text):
                path=Path(crash_path)
                if path.is_dir():
                    inventory=[{'path':str(f.relative_to(path)),'size':f.stat().st_size,'mtime':f.stat().st_mtime} for f in path.rglob('*') if f.is_file()]
                    (OUT/'crashdb-inventory.json').write_text(json.dumps({'path':crash_path,'files':inventory},indent=2))
                    # Shared SDK crashdb metadata is read-only. Never copy older runs.
                    if result['emulator_pre_cleanup_returncode'] is not None:
                        for item in inventory:
                            f=path/item['path']
                            if item['mtime']>=started_at and item['size']<16*1024**2:
                                target=OUT/'emulator-crashdb'/item['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,target)
        except Exception as e:(OUT/'crashdb-capture.error').write_text(repr(e))
    if fixture:
        fixture.terminate()
        try:fixture.wait(timeout=15)
        except Exception:fixture.kill();fixture.wait(timeout=10)
    result['cleanup']={'emulator_stopped':emulator is None or emulator.poll() is not None,'fixture_stopped':fixture is None or fixture.poll() is not None,'adb_server_port':5147,'emulator_returncode':emulator.poll() if emulator else None,**transport_cleanup}
    if not result['cleanup']['adb_server_stopped']:result['status']='failed'
    result['passed']=sum(c['pass'] for c in checks);result['total']=len(checks)
    (OUT/'acceptance.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2),flush=True)
    sys.exit(0 if result['status']=='passed-needs-visual-inspection' else 1)
