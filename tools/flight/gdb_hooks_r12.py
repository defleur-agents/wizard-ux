"""GDB Python hooks: inert outside GDB; no guest/app changes."""
import gdb
import hashlib
import json
import os
from pathlib import Path
import time
OUT=Path(os.environ['R12_GDB_OUT'])
LAST_SIGNAL=None

def save(name,body):
    target=OUT/name;tmp=OUT/(name+'.tmp')
    tmp.write_text(json.dumps(body,indent=2));tmp.replace(target)
def inferior_state(*_):
    try:
        inf=gdb.selected_inferior();pid=inf.pid
        if pid:
            exe=os.readlink('/proc/%d/exe'%pid)
            state={'pid':pid,'exe':exe,'qemu_inferior':'/qemu/' in exe and 'qemu-system-x86_64' in exe,'time':time.time()}
            save('gdb-inferior.json',state)
    except Exception as e:
        (OUT/'gdb-inferior.error').write_text(str(e))
def stopped(event):
    global LAST_SIGNAL
    inferior_state()
    if isinstance(event,gdb.SignalEvent):LAST_SIGNAL=event.stop_signal

gdb.events.new_objfile.connect(inferior_state)
gdb.events.cont.connect(inferior_state)
gdb.events.stop.connect(stopped)

def r12_finish():
    inferior_state()
    state=json.loads((OUT/'gdb-inferior.json').read_text()) if (OUT/'gdb-inferior.json').exists() else {}
    body={**state,'signal':LAST_SIGNAL,'native_acceptance':False,'time':time.time()}
    inf=gdb.selected_inferior()
    if not inf.pid:
        save('gdb-terminal.json',body);gdb.execute('quit 87');return
    pc=int(gdb.parse_and_eval('$pc'));body['pc']=hex(pc)
    maps=Path('/proc/%d/maps'%inf.pid).read_text();(OUT/'gdb-fault-maps.txt').write_text(maps)
    for line in maps.splitlines():
        fields=line.split(None,5);start,end=(int(v,16) for v in fields[0].split('-'))
        if start<=pc<end:
            offset=int(fields[2],16)
            body['fault_mapping']={'raw':line,'pc_file_offset':hex(pc-start+offset),'pc_minus_mapping_load_bias':hex(pc-(start-offset))}
            if len(fields)==6 and Path(fields[5]).is_file():body['fault_mapping']['library_sha256']=hashlib.sha256(Path(fields[5]).read_bytes()).hexdigest()
            break
    body['executable_sha256']=hashlib.sha256(Path(state['exe']).read_bytes()).hexdigest()
    save('gdb-fault.json',body)
    chunks=[];errors=[]
    for command in ('info inferiors','info threads','info registers','info symbol $pc','x/i $pc','info sharedlibrary','info proc mappings','thread apply all bt 32'):
        try:chunks.append('\n=== '+command+' ===\n'+gdb.execute(command,to_string=True))
        except Exception as e:
            errors.append(command);chunks.append('\nERROR '+command+': '+str(e)+'\n')
    text=''.join(chunks);(OUT/'gdb-stack.txt').write_text(text);gdb.write(text)
    save('gdb-stack-complete.json',{'signal':LAST_SIGNAL,'inferior':state,'stack_sha256':hashlib.sha256(text.encode()).hexdigest(),'all_threads_command':'thread apply all bt 32','errors':errors,'native_acceptance':False})
    # Kill the stopped inferior, not continue into a signal handler/core dump.
    gdb.execute('kill');gdb.execute('quit 86')
