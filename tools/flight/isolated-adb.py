#!/usr/bin/env python3
"""SDK -adb-path adapter: route emulator helper commands to owned TCP serial.
No default-server fallback. Native shell remains the unmodified release APK.
"""
import json,os,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parent
out=root/'evidence/native';out.mkdir(parents=True,exist_ok=True)
args=sys.argv[1:]
if any(x in args for x in ('kill-server','start-server','-P','-H','-L')):raise SystemExit('emulator helper may not change server ownership')
args=['127.0.0.1:6169' if x=='emulator-6168' else x for x in args]
argv=[str(Path(os.environ['ANDROID_SDK_ROOT'])/'platform-tools/adb'),'-H','127.0.0.1','-P','5147',*args]
start=time.time()
r=subprocess.run(argv,capture_output=True,timeout=30,env={**os.environ,'ADB_SERVER_SOCKET':'tcp:127.0.0.1:5147'})
with (out/'emulator-adb-commands.jsonl').open('a') as f:f.write(json.dumps({'original':sys.argv[1:],'argv':argv,'started':start,'finished':time.time(),'returncode':r.returncode,'stdout':r.stdout.decode(errors='replace'),'stderr':r.stderr.decode(errors='replace')})+'\n')
sys.stdout.buffer.write(r.stdout);sys.stderr.buffer.write(r.stderr);raise SystemExit(r.returncode)
