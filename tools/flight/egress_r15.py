"""Fail-closed QA guard, not product code. Import is inert; no network here.
Counter proof and kernel no-route proof are different, never relabelled.
"""
import re
import shlex

CHAIN = 'WISDOM_QA_EGRESS'
DEST = '192.0.2.1'  # TEST-NET, no DNS or Internet dependency
PHASES = ('before-launch', 'after-connect', 'after-flight')

def policy_snapshot(text, uid, family):
    """Parse exact iptables-save -c filter rules, not human table columns."""
    if not 10000 <= uid < 100000:
        raise ValueError('unsafe app UID')
    lines = text.splitlines()
    if lines.count('*filter') != 1 or lines.count('COMMIT') != 1:
        raise ValueError('incomplete filter snapshot')
    if not any(re.fullmatch(':' + CHAIN + r' - \[\d+:\d+\]', l) for l in lines):
        raise ValueError('missing UID chain')
    rows = []
    for line in lines:
        if '-A ' not in line:
            continue
        match = re.fullmatch(r'\[(\d+):(\d+)\] (-A .+)', line)
        if not match:
            raise ValueError('missing rule counters')
        rows.append((int(match[1]), shlex.split(match[3])))
    output = [r for _, r in rows if r[1] == 'OUTPUT']
    expected = ['-A', 'OUTPUT', '-m', 'owner', '--uid-owner', str(uid), '-j', CHAIN]
    if not output or output[0] != expected:
        raise ValueError('UID guard is not exact first OUTPUT rule')
    references = [r for _, r in rows if CHAIN in r[2:]]
    if references != [expected]:
        raise ValueError('unexpected UID chain references')
    reject = 'icmp-port-unreachable' if family == 4 else 'icmp6-port-unreachable'
    exact = ['-A', CHAIN, '!', '-o', 'lo', '-j', 'REJECT', '--reject-with', reject]
    chain = [(count, r) for count, r in rows if r[1] == CHAIN]
    if len(chain) != 1 or chain[0][1] != exact:
        raise ValueError('non-loopback deny-all rule drift')
    return chain[0][0]

def classify(uid, before, after, probe, route):
    """Require both families intact and either new REJECTs or explicit ENETUNREACH.
    probe/route are actual transport results with stdout/stderr/returncode.
    An unsupported ip command, timeout, wrong UID or generic nc failure is refusal.
    """
    b = [policy_snapshot(before[str(f)], uid, f) for f in (4, 6)]
    a = [policy_snapshot(after[str(f)], uid, f) for f in (4, 6)]
    if any(x < y for x, y in zip(a, b)):
        raise ValueError('counter reset')
    delta = sum(x-y for x, y in zip(a, b))
    identity = re.compile(r'^uid=' + str(uid) + r'(?:\(|\s)', re.M)
    if not identity.search(probe['stdout']) or probe['returncode'] != 1 or not re.search(r'^probe_status=1$', probe['stdout'], re.M):
        raise ValueError('probe succeeded or UID/command failure')
    if delta and probe['stderr'].strip() in (
            'nc: connect: Connection refused', 'nc: connect: Permission denied',
            'nc: connect: Operation not permitted', 'nc: connect: Network is unreachable'):
        mechanism = 'firewall-reject-counter-increased'
    elif (identity.search(route['stdout']) and route['returncode'] != 0
          and route['stderr'].strip() == 'RTNETLINK answers: Network is unreachable'
          and probe['stderr'].strip() == 'nc: connect: Network is unreachable'):
        mechanism = 'kernel-network-unreachable-before-filter'
    else:
        raise ValueError('no observed counter rejection or verified kernel no-route')
    return {'accepted': True, 'mechanism': mechanism, 'uid': uid,
            'reject_packets_before': b, 'reject_packets_after': a,
            'new_reject_packets': delta, 'both_families_deny_non_loopback': True}

def verify_evidence(out, checks):
    """Independent read-back gate used by runner and promotion preparation."""
    import json
    from pathlib import Path
    out = Path(out)
    for phase in PHASES:
        saved = json.loads((out / ('egress-' + phase + '.json')).read_text())
        actual = classify(saved['uid'], saved['before'], saved['after'], saved['probe'], saved['route'])
        if actual != saved['verdict']:
            raise ValueError('egress verdict drift: ' + phase)
        name = 'app external egress impossible ' + phase
        if not any(c['name'] == name and c['pass'] is True and c['detail'] == actual for c in checks):
            raise ValueError('missing egress phase: ' + phase)
    return True
