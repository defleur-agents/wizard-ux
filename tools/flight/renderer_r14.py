"""R14 metadata and actual-renderer guards. No emulator boot on import/preflight."""
import hashlib,json,os,re,subprocess
from pathlib import Path

def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def preflight(sdk):
    r=Path(sdk)/'emulator'
    names=('emulator','qemu/linux-x86_64/qemu-system-x86_64-headless','source.properties',
           'lib64/gles_angle/libGLESv2.so','lib64/gles_angle/libEGL.so',
           'lib64/gles_angle/libvk_swiftshader.so','lib64/gles_angle/libvulkan.so')
    inputs={str(r/n):sha(r/n) for n in names}
    help=subprocess.check_output([str(r/'emulator'),'-help-gpu'],text=True,stderr=subprocess.STDOUT)
    assert re.search(r'^\s+swangle\s+-> Use ANGLE with Swiftshader backend for GLES',help,re.M),'installed emulator does not advertise swangle'
    dependencies={}
    for name in ('lib64/gles_angle/libvk_swiftshader.so','lib64/gles_angle/libGLESv2.so','lib64/gles_angle/libEGL.so'):
        proc=subprocess.run(['ldd',str(r/name)],capture_output=True,text=True,env={**os.environ,'LD_LIBRARY_PATH':str(r/'lib64/vulkan')+':'+str(r/'lib64')})
        assert proc.returncode==0 and 'not found' not in proc.stdout+proc.stderr,'missing renderer dependency: '+name
        dependencies[name]=proc.stdout+proc.stderr
    return {'gpu':'swangle','feature_override':['-feature','-Vulkan'],'host_inputs':inputs,'help_gpu':help,
            'source_properties':(r/'source.properties').read_text(),'dependencies':dependencies,
            'scope':'metadata only; explicit ANGLE on Vulkan SwiftShader, not Mesa; actual backend must be proven during native run'}

def validate_backend(log,maps):
    lines=[line for line in log.splitlines() if re.search(r'swangle|swiftshader|emuglConfig_init|Graphics Adapter|Graphics API Version',line,re.I)]
    selected=re.findall(r'emuglConfig_init:.*?vulkan_mode_selected:(\S+)\s+gles_mode_selected:(\S+)',log)
    assert selected and all(v=='swiftshader' and g=='swangle' for v,g in selected),'actual explicit swangle selection absent or fallback: '+repr(selected)
    assert '/gles_swiftshader/' not in maps,'legacy SwiftShader GLES library loaded'
    for library in ('libEGL.so','libGLESv2.so','libvk_swiftshader.so'):
        assert '/gles_angle/'+library in maps,'bundled ANGLE pipeline mapping absent: '+library
    assert re.search(r'Graphics Adapter[^\n]*ANGLE[^\n]*Vulkan[^\n]*SwiftShader Device',log,re.I),'ANGLE Vulkan SwiftShader graphics adapter not reported'
    return {'accepted':True,'requested_gpu':'swangle','selected':[{'vulkan':v,'gles':g} for v,g in selected],
            'angle_vulkan_swiftshader_loaded':True,'legacy_gles_swiftshader_loaded':False,'backend_lines':lines}

def observe(emulator,out,label,sdk):
    out=Path(out)
    assert emulator.poll() is None,'emulator exited before renderer proof'
    exe=Path('/proc')/str(emulator.pid)/'exe'
    actual=exe.resolve(strict=True)
    expected=Path(sdk)/'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless'
    assert actual==expected,'renderer PID is not the actual headless qemu'
    maps=(Path('/proc')/str(emulator.pid)/'maps').read_text()
    log=(out/'emulator.log').read_text(errors='replace')
    (out/(label+'-maps.txt')).write_text(maps)
    data={'accepted':False,'pid':emulator.pid,'exe':str(actual),'exe_sha256':sha(actual),
          'maps_sha256':hashlib.sha256(maps.encode()).hexdigest(),'log_snapshot_sha256':hashlib.sha256(log.encode()).hexdigest()}
    (out/(label+'-log.txt')).write_text(log)
    try:data.update(validate_backend(log,maps))
    finally:(out/(label+'.json')).write_text(json.dumps(data,indent=2))
    return data

def verify_evidence(out,graphics):
    out=Path(out)
    assert graphics['gpu']=='swangle' and graphics['feature_override']==['-feature','-Vulkan']
    argv=graphics['argv'];assert argv[argv.index('-gpu')+1]=='swangle'
    for label in ('renderer-boot','renderer-complete'):
        data=json.loads((out/(label+'.json')).read_text())
        maps=(out/(label+'-maps.txt')).read_text();log=(out/(label+'-log.txt')).read_text()
        assert data['accepted'] is True and data['maps_sha256']==sha(out/(label+'-maps.txt'))
        assert data['log_snapshot_sha256']==sha(out/(label+'-log.txt'))
        assert all(data[k]==v for k,v in validate_backend(log,maps).items())
    return True
