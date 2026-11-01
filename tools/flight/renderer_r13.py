"""R13 metadata and actual-renderer guards. No emulator boot on import/preflight."""
import hashlib,json,os,re,subprocess
from pathlib import Path

def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def preflight(sdk):
    r=Path(sdk)/'emulator'
    names=('emulator','qemu/linux-x86_64/qemu-system-x86_64-headless','source.properties',
           'lib64/vulkan/lvp_icd.json','lib64/vulkan/libvulkan_lvp.so','lib64/vulkan/libLLVM.so',
           'lib64/vulkan/libvulkan.so.1','lib64/gles_angle/libGLESv2.so','lib64/gles_angle/libEGL.so')
    inputs={str(r/n):sha(r/n) for n in names}
    help=subprocess.check_output([str(r/'emulator'),'-help-gpu'],text=True,stderr=subprocess.STDOUT)
    assert re.search(r'^\s+lavapipe\s+-> Use Lavapipe software renderer for Vulkan',help,re.M),'installed emulator does not advertise lavapipe'
    icd=json.loads((r/'lib64/vulkan/lvp_icd.json').read_text())
    assert icd['ICD']['library_path']=='./libvulkan_lvp.so','unexpected lavapipe ICD'
    dependencies={}
    for name in ('lib64/vulkan/libvulkan_lvp.so','lib64/gles_angle/libGLESv2.so','lib64/gles_angle/libEGL.so'):
        proc=subprocess.run(['ldd',str(r/name)],capture_output=True,text=True,env={**os.environ,'LD_LIBRARY_PATH':str(r/'lib64/vulkan')+':'+str(r/'lib64')})
        assert proc.returncode==0 and 'not found' not in proc.stdout+proc.stderr,'missing renderer dependency: '+name
        dependencies[name]=proc.stdout+proc.stderr
    return {'gpu':'lavapipe','feature_override':['-feature','-Vulkan'],'host_inputs':inputs,'help_gpu':help,
            'source_properties':(r/'source.properties').read_text(),'icd':icd,'dependencies':dependencies,
            'scope':'metadata only; installed help says GLES is auto-selected; actual backend must be proven during native run'}

def validate_backend(log,maps):
    lines=[line for line in log.splitlines() if re.search(r'lavapipe|llvmpipe|emuglConfig_init|Graphics Adapter|Graphics API Version',line,re.I)]
    selected=re.findall(r'emuglConfig_init:.*?vulkan_mode_selected:(\S+)\s+gles_mode_selected:(\S+)',log)
    assert selected and all(v=='lavapipe' and 'swiftshader' not in g.lower() for v,g in selected),'actual renderer selection absent or fallback: '+repr(selected)
    assert '/gles_swiftshader/' not in maps,'legacy SwiftShader GLES library loaded'
    assert 'libvulkan_lvp.so' in maps,'Mesa lavapipe library not loaded'
    assert re.search(r'Graphics (?:Adapter|API Version)[^\n]*(?:llvmpipe|lavapipe)',log,re.I),'actual Mesa graphics adapter not reported'
    return {'accepted':True,'requested_gpu':'lavapipe','selected':[{'vulkan':v,'gles':g} for v,g in selected],
            'mesa_lavapipe_loaded':True,'legacy_gles_swiftshader_loaded':False,'backend_lines':lines}

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
    assert graphics['gpu']=='lavapipe' and graphics['feature_override']==['-feature','-Vulkan']
    argv=graphics['argv'];assert argv[argv.index('-gpu')+1]=='lavapipe'
    for label in ('renderer-boot','renderer-complete'):
        data=json.loads((out/(label+'.json')).read_text())
        maps=(out/(label+'-maps.txt')).read_text();log=(out/(label+'-log.txt')).read_text()
        assert data['accepted'] is True and data['maps_sha256']==sha(out/(label+'-maps.txt'))
        assert data['log_snapshot_sha256']==sha(out/(label+'-log.txt'))
        assert all(data[k]==v for k,v in validate_backend(log,maps).items())
    return True
