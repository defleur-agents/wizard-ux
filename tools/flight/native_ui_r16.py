"""Pure native accessibility selectors; no device, production or storage hooks."""
import re
import xml.etree.ElementTree as ET

PKG = 'ai.wizards.os'
ORB = r'^Wizard orb\.'
WELCOME = ('Name your Wizard', 'Connect your AI', 'Pick a skin', 'Say hello')

def label(n):
    return (n.get('text') or n.get('content-desc') or '').strip()

def rect(n):
    v = tuple(map(int, re.findall(r'-?\d+', n.get('bounds', ''))))
    return v if len(v) == 4 and v[0] >= 0 and v[1] >= 0 and v[2] > v[0] and v[3] > v[1] else None

def center(n):
    b = rect(n)
    return ((b[0]+b[2])//2, (b[1]+b[3])//2) if b else None

def visible(raw):
    def walk(n, hidden=False):
        hidden = hidden or n.get('visible-to-user') == 'false'
        if n.tag == 'node' and not hidden and rect(n):
            yield n
        for c in n:
            yield from walk(c, hidden)
    return list(walk(ET.fromstring(raw)))

def target(pattern, raw, *, package=None, clickable=False, scope=None):
    root = ET.fromstring(raw)
    if scope:
        scopes = [n for n in visible(raw) if label(n) == scope and n.get('class') == 'android.app.Dialog']
        if len(scopes) != 1:
            return None
        root = scopes[0]
    # visible() also rejects zero bounds and explicit hidden ancestors.
    candidates = [n for n in visible(ET.tostring(root, encoding='unicode'))
                  if re.search(pattern, label(n), re.I) and n.get('enabled') != 'false'
                  and (not package or n.get('package') == package)
                  and (not clickable or n.get('clickable') == 'true')]
    if not candidates:
        return None
    # A text child may duplicate its clickable parent; identical centers are harmless.
    points = {center(n) for n in candidates}
    if len(points) != 1:
        raise ValueError('ambiguous visible native target: ' + pattern)
    return points.pop()

def onboarding(raw):
    ns = visible(raw)
    # Exact API35 permission-controller deny control, never a generic app button.
    perms = [n for n in ns if n.get('package') in ('com.android.permissioncontroller', 'com.google.android.permissioncontroller')]
    if perms:
        deny = [n for n in perms if n.get('resource-id', '').split(':id/')[-1] == 'permission_deny_button'
                and n.get('enabled') != 'false' and n.get('clickable') == 'true']
        if len(deny) != 1:
            raise ValueError('unknown permission dialog; preserve capture, do not guess')
        return 'permission-deny', center(deny[0])
    welcome = [n for n in ns if label(n) == 'Welcome' and n.get('class') == 'android.app.Dialog' and n.get('package') == PKG]
    if welcome:
        titles = [label(n) for n in welcome[0].iter('node') if rect(n) and label(n) in WELCOME]
        if len(titles) != 1:
            raise ValueError('unknown Welcome stage')
        stage = titles[0]
        if stage == WELCOME[0]:
            xy = target(r'^Skip this step$', raw, package=PKG, clickable=True, scope='Welcome')
            if xy:
                return 'welcome-name-skip', xy
        # welcome.js back(): hello -> look -> name -> close. No send/install/name write.
        return 'welcome-back:' + stage, None
    tour = [n for n in ns if label(n) == 'Learn Wizard OS' and n.get('class') == 'android.app.Dialog']
    if tour:
        xy = target(r'^Skip tour$', raw, package=PKG, clickable=True, scope='Learn Wizard OS')
        if not xy:
            raise ValueError('tour skip unavailable')
        return 'tour-skip', xy
    dialogs = [label(n) for n in ns if n.get('class') == 'android.app.Dialog' and n.get('package') == PKG and label(n) not in ('Settings',)]
    if dialogs:
        raise ValueError('unknown blocking app dialog: ' + repr(dialogs))
    xy = target(ORB, raw, package=PKG, clickable=True)
    return ('ready', xy) if xy else ('waiting', None)

def dismiss_onboarding(capture, tap_xy, back, save, sleep, *, max_steps=12, transition_polls=12):
    """Act once per observed stage; require a different stage before the next action."""
    name_skipped = False
    for index in range(max_steps):
        raw = capture()
        state, xy = onboarding(raw)
        # After skip-name, Back returns to name; source-supported Back closes it.
        if state == 'welcome-name-skip' and name_skipped:
            state, xy = 'welcome-back:Name your Wizard', None
        save(index, state, raw, xy)
        if state == 'ready':
            sleep(1)
            confirm = capture()
            if onboarding(confirm)[0] == 'ready':
                return onboarding(confirm)[1]
            continue
        if state == 'waiting':
            sleep(1)
            continue
        if state == 'welcome-name-skip':
            name_skipped = True
        if xy:
            tap_xy(xy)
        else:
            back()
        for _ in range(transition_polls):
            sleep(.5)
            observed = capture()
            next_state, _ = onboarding(observed)
            if state == 'welcome-back:Name your Wizard' and next_state == 'welcome-name-skip':
                continue
            if next_state != state:
                break
        else:
            raise TimeoutError('onboarding action did not transition: ' + state)
    raise TimeoutError('onboarding exceeded bounded stages')

def os_pin_target(raw):
    # Actual system launcher window only: never re-tap the app's same-named CTA.
    ns = visible(raw)
    packages = {n.get('package') for n in ns if n.get('package') and n.get('package') != PKG and 'launcher' in (n.get('package') or '')}
    if len(packages) != 1:
        return None
    package = packages.pop()
    return target(r'^(Add|Add automatically|Add to home screen)$', raw, package=package, clickable=True)
