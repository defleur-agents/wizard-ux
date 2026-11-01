#!/usr/bin/env python3
"""QA entry only: execute the byte-identical normal driver with hang stacks."""
import faulthandler,hashlib,os,runpy,sys
from pathlib import Path
sys.dont_write_bytecode=True
p=Path(sys.argv[1]).resolve();expected=sys.argv[2];cap=float(sys.argv[3])
assert hashlib.sha256(p.read_bytes()).hexdigest()==expected,'entry driver digest mismatch'
faulthandler.enable();faulthandler.dump_traceback_later(max(.05,cap-60),repeat=False)
print('R36 PHASE native-driver-entry file='+str(p)+' sha256='+expected,flush=True)
sys.path.insert(0,str(p.parent));sys.argv=[str(p)]
try:runpy.run_path(str(p),run_name='__main__')
finally:faulthandler.cancel_dump_traceback_later()
