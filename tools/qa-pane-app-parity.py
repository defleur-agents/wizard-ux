#!/usr/bin/env python3
"""app-parity-gate: block a port/rewrite/cutover that silently drops features of the LIVE app.

Usage: app-parity-gate LIVE_DIR CANDIDATE_DIR [--waivers FILE] [--renames FILE]
                       [--core auto|first-party|vendored] [--json]

LIVE_DIR must be the source that is actually serving today (resolve it from the systemd
unit / route / image revision, never from GitHub main or a leftover folder). Compare
tracked source (git archive of exact commits), never a working folder holding generated
private files.
Compares a feature inventory: user-visible UI labels, HTTP routes, source modules and
tests. Exit 1 when anything in LIVE is missing from CANDIDATE and not listed in the
waivers file (one item per line; only items James explicitly approved dropping).
Also exits 1 when LIVE is a git checkout whose HEAD is not on any remote (stranded work).

--core: `core/` is skipped only when it is a vendored copy of the shell core (checked
upstream). In the Wizard shell repo itself (web/core beside web/desktop.html) core is
first-party and IS inventoried; `auto` (default) detects that.

--renames: a behaviour that survives under new wording is NOT a waiver. One mapping per line:
    label:OLD => NEW | test=<candidate path> | token=<string>
The gate verifies, and BLOCKs otherwise: OLD is really missing from the candidate; NEW
appears verbatim in candidate non-test code; the test file exists in the candidate and
contains token; token also appears in the candidate code file holding NEW. Unused or
unverifiable mappings BLOCK, so dead labels and stale mappings cannot pass.
"""
import json, os, re, subprocess, sys, pathlib

SKIP = {'node_modules', '.git', 'qa', 'evidence', 'dist', 'build', '__pycache__', '.cache'}
CODE = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.html', '.java', '.kt'}
LABEL_CTX = re.compile(r"(button|menuitem|aria-label|title|placeholder|textContent|text:|label|toast|>)", re.I)
STR = re.compile(r"""(['"`])((?:(?!\1).){3,60})\1""")
# Visible text between tags inside HTML or JS template markup, e.g. `<a …>Get Tailscale</a>`.
TEXTNODE = re.compile(r""">\s*([^<>{}$`'"\\]{3,60}?)\s*</""")
ROUTE = re.compile(r"""['"`](/(?:api|v1|mcp)[/A-Za-z0-9_\-:{}.]*)""")
PYROUTE = re.compile(r"""@\w+\.(?:get|post|put|patch|delete|websocket)\(\s*['"]([^'"]+)""")
TESTNAME = re.compile(r"(^|[-_.])(test|qa|spec)([-_.]|$)")

def files(root):
    for d, ds, fs in os.walk(root):
        ds[:] = [x for x in ds if x not in SKIP]
        for f in fs:
            p = pathlib.Path(d, f)
            if p.suffix in CODE and not f.endswith('.min.js'):
                yield p

def norm_route(r):
    r = re.sub(r"\$\{[^}]*\}|\{[^}]*\}|:[A-Za-z_]+", "*", r.split('?')[0]).rstrip('/')
    return re.sub(r"^/(?:mizel|meetings|wizard-recorder|mizel-live)(?=/)", "", r)

def label_ok(s):
    s = s.strip()
    if not re.match(r"^[A-Z…][\w'’ ,.…?!&/:-]+$", s): return False
    if s.isupper() and '_' in s: return False
    return len(s.split()) <= 8 and not s.startswith(('GET', 'POST', 'PUT', 'DELETE'))

def first_party_core(root):
    r = pathlib.Path(root)
    return (r / 'web' / 'core').is_dir() and (r / 'web' / 'desktop.html').is_file()

def inventory(root, core_first_party=False):
    inv = {'label': set(), 'route': set(), 'module': set(), 'test': set()}
    for p in files(root):
        name = p.stem.lower()
        name = re.sub(r"mizel|meeting-recorder|wizard-recorder", "app", name)
        # Directory-contained tests and Node test stems are not runtime modules.
        # Keep the existing explicitly named test inventory; .node.mjs coverage can
        # move between suites without pretending a production module was removed.
        rel_parts = p.relative_to(root).parts[:-1]
        if TESTNAME.search(p.name):
            inv['test'].add(name)
        elif not any(part in {'test', 'tests', '__tests__'} for part in rel_parts) and not p.name.endswith('.node.mjs'):
            inv['module'].add(name)
        try: t = p.read_text(errors='ignore')
        except Exception: continue
        rel = '/' + str(p.relative_to(root))
        if '/vendor/' in rel: continue
        if '/core/' in rel and not core_first_party: continue  # vendored shell core is checked upstream
        for line in t.splitlines():
            for m in ROUTE.finditer(line): inv['route'].add(norm_route(m.group(1)))
            for m in PYROUTE.finditer(line): inv['route'].add(norm_route(m.group(1)))
            if p.suffix in {'.js', '.mjs', '.html', '.jsx', '.tsx'} and LABEL_CTX.search(line):
                for s in [m.group(2) for m in STR.finditer(line)] + [m.group(1) for m in TEXTNODE.finditer(line)]:
                    if label_ok(s): inv['label'].add(re.sub(r"\bMizel(\.ai)?\b", "APP", s.strip()))
    return inv

def code_texts(root):
    out = {}
    for p in files(root):
        if TESTNAME.search(p.name) or '/tests/' in '/' + str(p.relative_to(root)): continue
        try: out[str(p.relative_to(root))] = p.read_text(errors='ignore')
        except Exception: pass
    return out

RENAME = re.compile(r"^(\w+):(.+?)\s*=>\s*(.+?)\s*\|\s*test=(\S+)\s*\|\s*token=(.+?)\s*$")

def check_renames(path, cand, missing):
    """Return (accepted {kind: {old: record}}, problems [str])."""
    accepted, problems, code = {}, [], None
    for n, raw in enumerate(open(path, encoding='utf-8'), 1):
        line = raw.strip()
        if not line or line.startswith('#'): continue
        m = RENAME.match(line)
        if not m: problems.append(f"renames:{n}: unparsable"); continue
        kind, old, new, test, token = (g.strip() for g in m.groups())
        if old not in missing.get(kind, []):
            problems.append(f"renames:{n}: {kind}:{old} is not missing (stale or dead mapping)"); continue
        if code is None: code = code_texts(cand)
        holders = [f for f, t in code.items() if new in t]
        if not holders: problems.append(f"renames:{n}: new wording '{new}' not in candidate non-test code"); continue
        tp = pathlib.Path(cand, test)
        if not tp.is_file(): problems.append(f"renames:{n}: evidence test {test} missing in candidate"); continue
        if token not in tp.read_text(errors='ignore'): problems.append(f"renames:{n}: token '{token}' absent from {test}"); continue
        if not any(token in code[f] for f in holders): problems.append(f"renames:{n}: token '{token}' not in code holding '{new}'"); continue
        accepted.setdefault(kind, {})[old] = {'new': new, 'in': sorted(holders), 'test': test, 'token': token}
    return accepted, problems

def stranded(root):
    try:
        top = subprocess.check_output(['git', '-C', root, 'rev-parse', '--show-toplevel'], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None
    head = subprocess.check_output(['git', '-C', top, 'rev-parse', 'HEAD'], text=True).strip()
    if not subprocess.run(['git', '-C', top, 'remote'], text=True, capture_output=True).stdout.strip():
        return {'head': head[:12], 'unpushed_commits': 0, 'dirty': False, 'note': 'local-only repo: this live folder is the source of truth'}
    out = subprocess.run(['git', '-C', top, 'rev-list', '--count', head, '--not', '--remotes'], text=True, capture_output=True).stdout.strip()
    dirty = subprocess.run(['git', '-C', top, 'status', '--porcelain', '--', root], text=True, capture_output=True).stdout.strip()
    return {'head': head[:12], 'unpushed_commits': int(out or 0), 'dirty': bool(dirty)}

def opt(a, name, default=None):
    return a[a.index(name) + 1] if name in a else default

def main():
    a = sys.argv[1:]
    if len(a) < 2: print(__doc__); sys.exit(2)
    live, cand = a[0], a[1]
    waivers = set()
    if '--waivers' in a:
        waivers = {l.strip() for l in open(opt(a, '--waivers')) if l.strip() and not l.startswith('#')}
    core = opt(a, '--core', 'auto')
    if core not in ('auto', 'first-party', 'vendored'): print('--core must be auto|first-party|vendored'); sys.exit(2)
    fp = core == 'first-party' or (core == 'auto' and (first_party_core(live) or first_party_core(cand)))
    L, C = inventory(live, fp), inventory(cand, fp)
    missing = {k: sorted(x for x in L[k] - C[k] if f"{k}:{x}" not in waivers and x not in waivers) for k in L}
    renamed, problems = {}, []
    if '--renames' in a:
        renamed, problems = check_renames(opt(a, '--renames'), cand, missing)
        missing = {k: [x for x in v if x not in renamed.get(k, {})] for k, v in missing.items()}
    st = stranded(live)
    res = {'live': live, 'candidate': cand, 'live_git': st, 'core': 'first-party' if fp else 'vendored',
           'missing': missing, 'renamed': renamed, 'rename_problems': problems,
           'counts': {k: [len(L[k]), len(C[k])] for k in L}}
    bad = any(missing.values()) or bool(problems) or (st and (st['unpushed_commits'] or st['dirty']))
    res['verdict'] = 'BLOCK' if bad else 'PASS'
    if '--json' in a: print(json.dumps(res, indent=2))
    else:
        print(f"{res['verdict']}: live={live} candidate={cand} core={res['core']}")
        if st: print(f"  live git {st['head']}: unpushed={st['unpushed_commits']} dirty={st['dirty']} {st.get('note','')}")
        for k, v in renamed.items():
            for old, r in v.items(): print(f"  renamed {k}: {old} => {r['new']} ({r['test']} / {r['token']})")
        for p in problems: print(f"  rename problem: {p}")
        for k, v in missing.items():
            if v: print(f"  missing {k} ({len(v)}): " + '; '.join(v[:40]) + (' …' if len(v) > 40 else ''))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()