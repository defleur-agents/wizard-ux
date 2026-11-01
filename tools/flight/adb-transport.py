#!/usr/bin/env python3
"""Owned ADB lane; import is inert. No shared daemon mutations, no guest reset.
SDK37 listener accepts tcp:PORT, NOT tcp:HOST:PORT; clients use standard
ADB_SERVER_SOCKET=tcp:127.0.0.1:PORT and explicit -H/-P (no auto-start).
"""
import hashlib,json,os,re,socket,subprocess as sp,threading,time
from pathlib import Path

class Transport:
    def __init__(self,adb,env,out,serial='127.0.0.1:6169',port=5147):
        self.adb=str(adb);self.env=env;self.out=Path(out);self.serial=serial;self.port=port
        self.server=self.emulator=self.logcat=None;self.stop=threading.Event();self.lock=threading.Lock()
        self.identity=None;self.reverse=None;self.recoveries=0;self.seq=0
    def command(self,*args,serial=True,**kw):
        return self.call([self.adb,'-H','127.0.0.1','-P',str(self.port),*(['-s',self.serial] if serial else []),*args],**kw)
    def call(self,argv,timeout=15):
        with self.lock:self.seq+=1;n=self.seq
        prefix=self.out/('transport-command-%05d'%n)
        start=time.time()
        try:
            r=sp.run(list(map(str,argv)),env=self.env,capture_output=True,timeout=timeout)
        except sp.TimeoutExpired as e:
            prefix.with_suffix('.stdout').write_bytes(e.stdout or b'');prefix.with_suffix('.stderr').write_bytes(e.stderr or b'')
            prefix.with_suffix('.json').write_text(json.dumps({'argv':list(map(str,argv)),'started':start,'timeout':timeout,'returncode':None}))
            raise
        prefix.with_suffix('.stdout').write_bytes(r.stdout);prefix.with_suffix('.stderr').write_bytes(r.stderr)
        prefix.with_suffix('.json').write_text(json.dumps({'argv':list(map(str,argv)),'started':start,'finished':time.time(),'returncode':r.returncode}))
        return r
    def start(self):
        for port in (self.port,6168,6169,28543):
            with socket.socket() as s:
                s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('127.0.0.1',port))
        self.server=sp.Popen([self.adb,'-L','tcp:'+str(self.port),'server','nodaemon'],env=self.env,stdout=(self.out/'adb-server.stdout').open('wb'),stderr=(self.out/'adb-server.stderr').open('wb'))
        for _ in range(50):
            assert self.server.poll() is None,'owned ADB server exited'
            try:
                with socket.create_connection(('127.0.0.1',self.port),timeout=.1):break
            except OSError:time.sleep(.1)
        r=self.command('server-status',serial=False);assert r.returncode==0,r.stderr
        self.thread=threading.Thread(target=self.monitor,daemon=True);self.thread.start()
    def attach(self,emulator):
        self.emulator=emulator
        for _ in range(120):
            assert emulator.poll() is None,'emulator exited before transport: '+str(emulator.returncode)
            try:
                with socket.create_connection(('127.0.0.1',6169),timeout=.1):break
            except OSError:time.sleep(1)
        r=self.command('connect',self.serial,serial=False);assert r.returncode==0,r.stderr
    def monitor(self):
        assert self.server is not None
        # Capture host PID/RAM/return codes and BOTH server serial lists throughout.
        while not self.stop.is_set():
            row={'time':time.time(),'emulator_pid':self.emulator.pid if self.emulator else None,'emulator_returncode':self.emulator.poll() if self.emulator else None,'server_pid':self.server.pid,'server_returncode':self.server.poll(),'logcat_pid':self.logcat.pid if self.logcat else None,'logcat_returncode':self.logcat.poll() if self.logcat else None}
            for name,path in [('memory','/proc/meminfo'),('emulator_status',f'/proc/{row["emulator_pid"]}/status')]:
                try:row[name]=Path(path).read_text()
                except OSError as e:row[name]=repr(e)
            for name,cmd in [('listeners',['ss','-ltnp']),('processes',['pgrep','-af','adb|emulator|qemu-system'])]:
                try:r=sp.run(cmd,capture_output=True,timeout=3);row[name]={'returncode':r.returncode,'stdout':r.stdout.decode(errors='replace'),'stderr':r.stderr.decode(errors='replace')}
                except Exception as e:row[name]=repr(e)
            for port in (5037,self.port):
                # -H prevents implicit daemon launch; shared is read-only.
                for command in ('devices','server-status'):
                    try:
                        r=sp.run([self.adb,'-H','127.0.0.1','-P',str(port),command,*(['-l'] if command=='devices' else [])],env=self.env,capture_output=True,timeout=3)
                        row[str(port)+'_'+command]={'returncode':r.returncode,'stdout':r.stdout.decode(errors='replace'),'stderr':r.stderr.decode(errors='replace')}
                    except Exception as e:row[str(port)+'_'+command]=repr(e)
            with (self.out/'transport-monitor.jsonl').open('a') as f:f.write(json.dumps(row)+'\n')
            self.stop.wait(2)
    def start_logcat(self,restart=False):
        if self.logcat and self.logcat.poll() is None:
            if not restart:return
            self.logcat.terminate()
            try:self.logcat.wait(timeout=5)
            except sp.TimeoutExpired:self.logcat.kill();self.logcat.wait(timeout=5)
        with self.lock:self.seq+=1;n=self.seq
        self.logcat=sp.Popen([self.adb,'-H','127.0.0.1','-P',str(self.port),'-s',self.serial,'logcat','-v','epoch'],env=self.env,stdout=(self.out/f'continuous-logcat-{n}.txt').open('wb'),stderr=(self.out/f'continuous-logcat-{n}.stderr').open('wb'))
    def app_identity(self):
        r=self.command('shell','dumpsys package ai.wizards.os; pidof ai.wizards.os; cat /proc/sys/kernel/random/boot_id')
        assert r.returncode==0,r.stderr
        text=r.stdout.decode();version=re.search(r'\bversionCode=(\d+)',text);name=re.search(r'\bversionName=([^\s]+)',text)
        boot=re.search(r'[a-f0-9]{8}-[a-f0-9-]{27,}',text)
        # Last numeric line is pidof, not a package timestamp. Preserve raw dump too.
        pids=re.findall(r'^\d+(?: \d+)*$',text,re.M)
        assert version and name and boot
        return {'versionCode':version[1],'versionName':name[1],'boot_id':boot[0], 'pids':pids[-1] if pids else '', 'install':re.findall(r'^\s*(?:codePath|firstInstallTime|lastUpdateTime|appId)=.*$',text,re.M)}
    def bind_identity(self):self.identity=self.app_identity()
    def recover(self):
        # Only transport control; never root/reboot/install/clear/force-stop/tap here.
        assert self.emulator and self.emulator.poll() is None,'emulator died; no transport recovery'
        assert self.server and self.server.poll() is None,'owned server died; no daemon replacement'
        assert self.recoveries<2,'transport recovery budget exhausted'
        self.recoveries+=1
        before=self.identity
        r=self.command('devices','-l',serial=False);rows=r.stdout.decode().splitlines()[1:]
        assert all(not x.strip() or x.split()[0] in (self.serial,'emulator-6168') for x in rows),'foreign device on owned server'
        self.command('reconnect','offline',serial=False)
        self.command('connect',self.serial,serial=False)
        for _ in range(20):
            r=self.command('get-state')
            if r.returncode==0 and r.stdout.strip()==b'device':break
            time.sleep(.5)
        else:raise RuntimeError('owned transport unavailable after bounded reconnect')
        if before:
            after=self.app_identity();assert before==after,{'before':before,'after':after,'reason':'recovery changed app/install/process/boot'}
        if self.reverse:
            r=self.command('reverse',*self.reverse);assert r.returncode==0,r.stderr
        self.start_logcat()
    def read(self,*args,timeout=15):
        r=self.command(*args,timeout=timeout)
        if r.returncode and any(x in r.stderr.lower() for x in (b'offline',b'not found',b'closed',b'no devices')):
            self.recover();r=self.command(*args,timeout=timeout)
        assert r.returncode==0,(args,r.stderr.decode(errors='replace'))
        return r.stdout
    def close(self):
        self.stop.set()
        if hasattr(self,'thread'):self.thread.join(timeout=25)
        for proc in (self.logcat,self.server):
            if proc and proc.poll() is None:
                proc.terminate()
                try:proc.wait(timeout=10)
                except sp.TimeoutExpired:proc.kill();proc.wait(timeout=5)
        return {'adb_server_stopped':self.server is None or self.server.poll() is not None,'adb_server_returncode':self.server.poll() if self.server else None,'logcat_returncode':self.logcat.poll() if self.logcat else None,'recoveries':self.recoveries}
