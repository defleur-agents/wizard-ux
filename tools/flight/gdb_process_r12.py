"""Popen-compatible emulator monitor reports the real inferior, not the GDB PID."""
import json, os, signal, subprocess as sp, time
from pathlib import Path

def members(pgid):
    rows=[]
    for p in Path('/proc').iterdir():
        if not p.name.isdigit():continue
        try:
            stat=(p/'stat').read_text().rsplit(')',1)[1].split()
            if int(stat[2])==pgid and stat[0]!='Z':rows.append(int(p.name))
        except (OSError,ValueError):pass
    return rows

def cleanup_owned_group(out):
    out=Path(out);record=out/'gdb-process.json'
    if not record.exists():return {'owned_group_absent':True,'started':False}
    rec=json.loads(record.read_text());pgid=rec['pgid'];marker=('R12_GDB_OUT='+str(out)).encode()
    assert pgid>1 and pgid!=os.getpgrp()
    def owned():
        ps=members(pgid)
        for pid in ps:
            try:assert marker in Path('/proc/%d/environ'%pid).read_bytes().split(b'\0'), 'foreign process group member'
            except FileNotFoundError:pass
        return ps
    if owned():
        os.killpg(pgid,signal.SIGTERM)
        end=time.monotonic()+5
        while owned() and time.monotonic()<end:time.sleep(.1)
    if owned():
        os.killpg(pgid,signal.SIGKILL)
        end=time.monotonic()+5
        while owned() and time.monotonic()<end:time.sleep(.1)
    ps=owned();assert not ps,ps
    result={'owned_group_absent':True,'started':True,'pgid':pgid}
    (out/'gdb-cleanup.json').write_text(json.dumps(result,indent=2));return result

class EmulatorProcess:
    def __init__(self,argv,env,out):
        self.out=Path(out);self.returncode=None
        root=self.out.parent.parent
        commands=['set pagination off','set confirm off','set print thread-events off','set debuginfod enabled off','set startup-with-shell off','set disable-randomization off','set follow-fork-mode parent','set detach-on-fork on','set follow-exec-mode same','handle SIGPIPE nostop noprint pass','handle SIGUSR1 nostop noprint pass','handle SIGUSR2 nostop noprint pass','handle SIGSEGV stop print nopass']
        # GDB needs extracted libs; inferior retains original R10 environment.
        commands.append('unset environment LD_LIBRARY_PATH')
        if env.get('LD_LIBRARY_PATH'):commands.append('set environment LD_LIBRARY_PATH '+env['LD_LIBRARY_PATH'])
        commands += ['source '+str(root/'gdb_hooks_r12.py'),'run','python r12_finish()']
        script=self.out/'gdb-commands.txt';script.write_text('\n'.join(commands)+'\n')
        genv={**env,'R12_GDB_OUT':str(self.out),'DEBUGINFOD_URLS':''}
        if env.get('R12_GDB_LIBRARY_PATH'):genv['LD_LIBRARY_PATH']=env['R12_GDB_LIBRARY_PATH']
        prefix=json.loads(env['R12_GDB_PREFIX'])
        self.gdb=sp.Popen([*prefix,'-nx','-nh','--batch','-x',str(script),'--args',*argv],env=genv,stdout=(self.out/'emulator.log').open('w'),stderr=sp.STDOUT,start_new_session=True)
        (self.out/'gdb-process.json').write_text(json.dumps({'gdb_pid':self.gdb.pid,'pgid':self.gdb.pid,'argv':argv},indent=2))
    @property
    def pid(self):
        f=self.out/'gdb-inferior.json'
        try:
            row=json.loads(f.read_text())
            return row['pid'] if row['qemu_inferior'] else None
        except (OSError,ValueError):return None
    def poll(self):
        fault=self.out/'gdb-fault.json'
        if fault.exists():
            row=json.loads(fault.read_text())
            if row['signal']=='SIGSEGV' and row['qemu_inferior']:
                self.returncode=-signal.SIGSEGV;return self.returncode
        rc=self.gdb.poll()
        if rc is not None:
            # Debugger exit0 alone is never an emulator pass.
            self.returncode=rc if rc else 88
        return self.returncode
    def terminate(self):
        # Let bounded fault-stack collection finish before terminating GDB.
        if (self.out/'gdb-fault.json').exists() and self.gdb.poll() is None:
            try:self.gdb.wait(timeout=20)
            except sp.TimeoutExpired:pass
        cleanup_owned_group(self.out)
    def kill(self):cleanup_owned_group(self.out)
    def wait(self,timeout=None):
        try:return self.gdb.wait(timeout=timeout)
        finally:
            if self.gdb.poll() is not None:cleanup_owned_group(self.out)
