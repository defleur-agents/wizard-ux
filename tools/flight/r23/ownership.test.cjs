'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('./raw-cdp.cjs');
function fixture(){
 const diagnostic={},input={profile:'/logical/profile',prepared:{canonical:'/resolved/profile',previous:null},knownOwnedBrowserPID:123,lines:['9222','/devtools/browser/fixture'],diagnostic};
 const state={uid:process.getuid(),argument:'/resolved/profile',inode:'555',address:'0100007F',ipv6:false,denied:false,missing:false,changedStart:false,starts:0,duplicate:false};
 const file={dev:1,ino:2,size:60,mtimeNs:3,ctimeNs:4,uid:process.getuid(),isSymbolicLink:()=>false};
 const row=()=>`0: ${state.address}:2406 00000000:0000 0A 0:0 0:0 0 ${process.getuid()} 0 555`;
 const io={realpathSync:p=>p==='/logical/profile'?'/resolved/profile':p,lstatSync:()=>file,statSync:()=>({uid:state.uid}),readdirSync:()=>['7'],readlinkSync:()=>{if(state.denied)throw Object.assign(Error('fixture permission denied'),{code:'EACCES'});return 'socket:['+(state.missing?'999':state.inode)+']'},readFileSync:p=>{
  if(p==='/proc/123/cmdline')return 'chromium\0--user-data-dir='+state.argument+'\0';
  if(p==='/proc/123/stat')return '123 (chromium) '+Array.from({length:20},(_,i)=>i===19?String(state.changedStart?++state.starts:100):'0').join(' ');
  if(p==='/proc/net/tcp')return 'header\n'+row()+(state.duplicate?'\n'+row():'');
  if(p==='/proc/net/tcp6')return 'header'+(state.ipv6?'\n'+row():'');
  throw Error('unexpected path '+p);
 }};return {input,state,io,file};
}
test('ownership canonicalizes logical symlink profile against resolved Chromium argument, retaining exact trusted PID and FD inode',()=>{const f=fixture(),p=D.inspectOwnership(f.input,f.io);assert.equal(p.pid,123);assert.equal(p.canonicalProfile,'/resolved/profile');assert.deepEqual(p.matchingFDs,['7']);assert.equal(f.input.diagnostic.start,'100')});
test('ownership rejects wrong PID, UID, profile, wildcard, IPv6, duplicate listeners, stale file and changed PID starttime',()=>{
 for(const mutate of [f=>f.input.knownOwnedBrowserPID=0,f=>f.state.uid++,f=>f.state.argument='/foreign',f=>f.state.address='00000000',f=>f.state.ipv6=true,f=>f.state.duplicate=true,f=>f.state.missing=true,f=>f.input.prepared.previous='1:2:60:3:4',f=>f.state.changedStart=true]){const f=fixture();mutate(f);assert.throws(()=>D.inspectOwnership(f.input,f.io))}
});
test('ownership permission failures remain explicit diagnostics and never waive socket ownership',()=>{const f=fixture();f.state.denied=true;assert.throws(()=>D.inspectOwnership(f.input,f.io),/must belong/);assert.equal(f.input.diagnostic.inspectionErrors[0].code,'EACCES');assert.equal(f.input.diagnostic.inspectionErrors[0].path,'/proc/123/fd/7');assert.deepEqual(f.input.diagnostic.matchingFDs,[])});
test('ownership FD directory inspection failure records exact path before refusing',()=>{const f=fixture();f.io.readdirSync=()=>{throw Object.assign(Error('fixture EPERM'),{code:'EPERM'})};assert.throws(()=>D.inspectOwnership(f.input,f.io),/EPERM/);assert.equal(f.input.diagnostic.inspectionErrors[0].path,'/proc/123/fd')});
