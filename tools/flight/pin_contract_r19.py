"""EXTEND the existing native pin verifier, not the product pin capability.
Launcher widget wording is presentation, not evidence of AppWidgetManager.
The exact signed source is the route authority; unknown/ambiguous source refuses.
"""
import hashlib
import re
import xml.etree.ElementTree as ET
import native_ui_r16 as ui

SHORTCUT_SOURCE_SHA = '36a41331c4a0c1ce6716ed44d81980ad3eeca02372936e83c223967219bd643f'
POLICY_SOURCE_SHA = 'f46bfa65910cf6ecb49d4c65e10da8ecd605fd2f47c58e1a2a2210f32a8e0d11'

def identity(origin, app='wisdom'):
    return 'homeapp-' + hashlib.sha256((origin+'\n'+app).encode()).hexdigest()

def route(raw, source, policy):
    if hashlib.sha256(source).hexdigest()!=SHORTCUT_SOURCE_SHA or hashlib.sha256(policy).hexdigest()!=POLICY_SOURCE_SHA:
        raise ValueError('unreviewed signed native pin source')
    if b'requestPinShortcut(shortcut,pending.getIntentSender())' not in source or b'requestPinAppWidget' in source:
        raise ValueError('unknown or ambiguous native pin route')
    ns=ui.visible(raw)
    packages={n.get('package') for n in ns if 'launcher' in n.get('package','')}
    if len(packages)!=1 or any(n.get('package')==ui.PKG for n in ns):
        raise ValueError('not one actual OS confirmation')
    package=packages.pop()
    # Exact API35 observed confirmation, shared by R17 and R18. No inference
    # that a widget-looking confirmation created an actual AppWidget record.
    cells=[n for n in ns if n.get('resource-id')==package+':id/widget_cell'
           and n.get('content-desc')=='Wisdom widget, 1 wide by 1 high']
    if len(cells)!=1 or not ui.os_pin_target(raw):
        raise ValueError('unknown or ambiguous OS confirmation')
    return {'api':'ShortcutManager.requestPinShortcut','presentation':'launcher-widget-cell-1x1','launcher':package}

def shortcut_receipt(raw, origin, launcher):
    expected=identity(origin)
    # Exact launcher ownership and exact source-derived origin+app identity.
    launchers=re.split(r'\n\s*Launcher: ',raw)
    owned=[s for s in launchers[1:] if s.startswith(launcher+'  Package user: 0  Owner user: 0')]
    if len(owned)!=1 or not re.search(r'Package: ai\.wizards\.os\s+User: 0\s+Pinned: '+re.escape(expected)+r'(?:\s|$)',owned[0]):
        return None
    blocks=re.split(r'(?=ShortcutInfo \{id=)',raw)
    pins=[s for s in blocks if s.startswith('ShortcutInfo {id=homeapp-') and '\n            packageName=ai.wizards.os\n' in s]
    if len(pins)!=1:return None
    block=pins[0].split('ShortcutInfo {id=',1)[-1]
    if not block.startswith(expected+', flags=') or not re.search(r'flags=0x[0-9a-f]+ \[[^\]]*Pin',block):return None
    if not all(s in block for s in ('shortLabel=Wisdom,','act=android.intent.action.VIEW','dat=wizard-homeapp://ai.wizards.os/', 'cmp=ai.wizards.os/.AppSessionActivity')):return None
    return {'api':'ShortcutManager.requestPinShortcut','package':'ai.wizards.os','android_user':0,
            'launcher':launcher,'id':expected,'label':'Wisdom','intent_component':'ai.wizards.os/.AppSessionActivity',
            'origin':origin,'app_id':'wisdom'}

def confirmed(raw, pin_id):
    try:root=ET.fromstring(raw)
    except ET.ParseError:return False
    values=[n for n in root if n.get('name')==pin_id+':confirmed']
    return len(values)==1 and values[0].tag=='boolean' and values[0].get('value')=='true' and not any(n.get('name')==pin_id for n in root)

def await_persisted(observe, save, origin, launcher, monotonic, sleep, timeout=60):
    """Read-only asynchronous wait: no retry of request, confirmation or icon tap."""
    deadline=monotonic()+timeout
    index=0
    while True:
        observation=observe(deadline)
        receipt=shortcut_receipt(observation['shortcuts'],origin,launcher)
        ready=monotonic()<=deadline and receipt is not None and confirmed(observation['preferences'],receipt['id'])
        save(index,observation,receipt,ready)  # always before assertion/return
        if ready:return receipt
        if monotonic()>=deadline:raise TimeoutError('OS pin/callback not persisted within 60 seconds; never recreate')
        index+=1
        sleep(min(.5,max(0,deadline-monotonic())))

def verify_evidence(root, origin):
    import json
    before=json.loads((root/'pin-before.json').read_text())
    after=json.loads((root/'pin-after.json').read_text())
    assert before==after and before['id']==identity(origin)
    for phase in ('before','after'):
        receipt=shortcut_receipt((root/('shortcuts-'+phase+'.txt')).read_text(),origin,before['launcher'])
        assert receipt==before
        assert confirmed((root/('pin-'+phase+'-preferences.xml')).read_text(),before['id'])
    launches=list(root.glob('pin-launch-*-activities.txt'))
    assert len(launches)>=5,'initial, offline, both death arms and reconnect must click existing pin'
    expected_uri='wizard-homeapp://ai.wizards.os/'+before['id']+'?app=wisdom'
    for launch in launches:
        lines=[line for line in launch.read_text().splitlines() if 'Intent {' in line and 'dat='+expected_uri+' ' in line
               and 'cmp=ai.wizards.os/.AppSessionActivity' in line and 'act=android.intent.action.VIEW' in line]
        assert len(lines)==1,'exact Wisdom/origin native task metadata missing or ambiguous'
    return True
