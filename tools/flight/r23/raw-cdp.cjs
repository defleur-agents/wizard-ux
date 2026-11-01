'use strict';
// Read-only CDP connection to this invocation's synthetic Chromium only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const headers=require('./stream-diagnostic.cjs').safeHeaders;
exports.verify=(row,raw,member)=>{
 assert(row.worker&&row.method==='GET'&&row.status===200,'worker full GET only');
 assert.equal(raw.contextId,row.contextId,'CDP context');assert.equal(raw.generationId,row.generationId,'CDP generation');
 assert.equal(raw.worker,row.worker,'CDP worker');assert.equal(raw.url,row.url,'CDP full URL');assert.equal(raw.method,'GET');assert.equal(raw.status,200);
 const id=row.responseHeaders['x-qa-write-id'];assert(id&&!/[\n,]/.test(id),'unique PW response write ID');assert.equal(raw.headers['x-qa-write-id'],id,'CDP exact response write ID');
 assert(raw.started&&raw.finished&&!raw.failed&&!raw.redirected&&!raw.detached,'CDP actual loadingFinished, no failure/redirect/detach');
 assert(!raw.requestHeaders.range,'CDP full body not range');assert(!row.requestHeaders.range,'PW full body not range');
 assert.equal(raw.bodyBytes,member.bytes,'CDP decoded byte length');assert.equal(raw.sha256,member.sha256,'CDP exact source bytes');
 if(!raw.headers['content-encoding'])assert.equal(Number(raw.headers['content-length']),member.bytes,'CDP unencoded Content-Length');
 assert(raw.headers['content-type'],'CDP MIME');
 return {contextId:raw.contextId,generationId:raw.generationId,worker:raw.worker,targetId:raw.targetId,sessionId:raw.sessionId,browserContextId:raw.browserContextId,requestId:raw.requestId,url:raw.url,writeId:id,bytes:raw.bodyBytes,sha256:raw.sha256,loadingFinished:raw.finished,encodedDataLength:raw.encodedDataLength,scope:'independent raw CDP loadingFinished + decoded source bytes; NOT PW response.finished PASS'};
};
const fingerprint=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
exports.prepareProfile=profile=>{
 fs.mkdirSync(profile,{recursive:true,mode:0o700});assert(!fs.lstatSync(profile).isSymbolicLink(),'profile leaf not symlink');const canonical=fs.realpathSync(profile),s=fs.statSync(canonical);assert(s.isDirectory(),'profile directory');assert.equal(s.uid,process.getuid(),'owned profile UID');assert.equal(s.mode&0o077,0,'private profile permissions');
 let previous=null;try{previous=fingerprint(fs.lstatSync(path.join(canonical,'DevToolsActivePort'),{bigint:true}))}catch(e){if(e.code!=='ENOENT')throw e}
 return Object.freeze({canonical,previous,preparedAt:Date.now(),profileDev:s.dev,profileIno:s.ino});
};
// Only the already-owned Playwright browser channel supplies the candidate PID.
// No raw endpoint is contacted to discover its own owner (no circular trust).
exports.ownedBrowserPID=async(context,out)=>{
 let session;const diagnostic={phase:'trusted-playwright-browser-channel',rawSocketOpened:false};
 try{const browser=context.browser();assert(browser,'owned Playwright browser available');session=await browser.newBrowserCDPSession();const info=await session.send('SystemInfo.getProcessInfo'),rows=info.processInfo.filter(p=>p.type==='browser');assert.equal(rows.length,1,'one trusted browser PID');const pid=Number(rows[0].id);assert(Number.isSafeInteger(pid)&&pid>0,'trusted browser PID');diagnostic.pid=pid;try{const command=await session.send('Browser.getBrowserCommandLine');diagnostic.commandLine=exports.argumentEvidence(command.arguments)}catch(e){diagnostic.commandLineError={code:e.code||null,name:e.name}}return pid}
 catch(e){diagnostic.error={message:e.message,code:e.code};throw e}
 finally{fs.writeFileSync(out,JSON.stringify(diagnostic,null,2));if(session)await session.detach()}
};
// Evidence never authorizes ownership. Only exact synthetic profile/debug options
// retain values; all other arguments (including URLs and positional operands) redact.
exports.argumentEvidence=args=>{
 assert(Array.isArray(args)&&args.length<=1024,'bounded argument count');
 let operand=false;const safe=args.map(a=>{assert(typeof a==='string'&&a.length<=65536,'bounded argument');if(operand){operand=false;return a}if(a==='--user-data-dir'||a==='--remote-debugging-port'){operand=true;return a}if(/^--(?:user-data-dir|remote-debugging-port)=/.test(a))return a;return /^--[a-zA-Z0-9-]+(?:=|$)/.test(a)?a.split('=')[0]+'=REDACTED':'REDACTED'});
 return {argc:args.length,arguments:safe};
};
exports.captureOwnedProc=(pid,io=fs,expectedProfile=null)=>{
 assert(Number.isSafeInteger(pid)&&pid>0,'explicit owned PID');const root='/proc/'+pid,result={pid,errors:[]};
 const read=(key,fn)=>{try{result[key]=fn()}catch(e){result.errors.push({field:key,code:e.code||null,name:e.name})}};
 read('uid',()=>io.statSync(root).uid);
 // Refuse foreign UID before reading any foreign process content.
 if(result.uid!==process.getuid())return result;
 read('comm',()=>io.readFileSync(root+'/comm','utf8').slice(0,256).trim());
 read('exe',()=>io.readlinkSync(root+'/exe'));
 read('stat',()=>{const s=io.readFileSync(root+'/stat','utf8');assert(s.length<=4096);const a=s.slice(s.lastIndexOf(') ')+2).split(' ');return {state:a[0],ppid:a[1],start:a[19]}});
 read('cmdline',()=>{const b=io.readFileSync(root+'/cmdline');assert(b.length<=65536,'bounded cmdline bytes');const text=b.toString('utf8'),args=text.split('\0');if(args.at(-1)==='')args.pop();return {bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),endsNUL:b.length>0&&b.at(-1)===0,...exports.argumentEvidence(args),...(expectedProfile?{expectedProfileMarkerPresent:args.length===1&&(' '+args[0]+' ').includes(' --user-data-dir='+expectedProfile+' ')}:{})}});
 return result;
};
// Chromium's Linux SetProcessTitleFromCommandLine flattens argv without escaping.
// Never reconstruct original launch arguments from this mutable display string.
const childProcess=require('node:child_process'),launchRecords=new WeakMap();
exports.assertPlaywrightBundle=bytes=>{
 const digest=createHash('sha256').update(bytes).digest('hex');assert.equal(digest,'829521b67ed7be90c7d6d6098ff39f2241562d47e4ad7ccab13710924a56001d','pinned public Playwright launch source');const source=bytes.toString('utf8');
 for(const text of ['childProcess = __toESM(require("child_process"))','childProcess.spawn(options.command, options.args || [], spawnOptions)','get: () => from[key]'])assert(source.includes(text),'public spawn property remains live');return {sha256:digest,livePublicSpawnGetter:true};
};
exports.assertPinnedPlaywright=directory=>exports.assertPlaywrightBundle(fs.readFileSync(path.join(path.dirname(require.resolve('playwright-core/package.json',{paths:[directory]})),'lib/coreBundle.js')));
let spawnOriginal=null,spawnWrapper=null,armed=null;
exports.installOwnedLaunchObservation=()=>{
 if(spawnWrapper&&childProcess.spawn===spawnWrapper)return;
 assert(!armed,'no overlapping owned launches');spawnOriginal=childProcess.spawn;
 spawnWrapper=function(command,args,options){
  const state=armed,snapshot=state&&command===state.executable?Array.from(args||[]):null;
  const child=Reflect.apply(spawnOriginal,this,arguments);
  if(state){state.calls++;if(state.observations.length<4)state.observations.push({pid:child.pid||null,commandMatches:command===state.executable,argc:snapshot?.length||0,argvSha256:snapshot?createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'):null});try{
   assert.equal(command,state.executable,'exact launch executable');assert.equal(state.calls,1,'one observed spawn only');
   const identity=exports.validateLaunchArguments(snapshot,state.prepared);
   const proc=exports.captureOwnedProc(child.pid);assert.equal(proc.uid,process.getuid(),'launch UID');assert(proc.stat,'launch stat readable');assert.equal(proc.stat.ppid,String(process.pid),'direct launch parent');
   state.record={...identity,pid:child.pid,start:proc.stat.start,ppid:proc.stat.ppid,uid:proc.uid,executable:state.executable,observedAt:Date.now()};
  }catch(e){state.errors.push({name:e.name,reason:'OWNED_SPAWN_IDENTITY_REFUSED'})}}
  return child;
 };childProcess.spawn=spawnWrapper;
};
exports.validateLaunchArguments=(args,prepared)=>{
 assert(Array.isArray(args)&&args.length<=1024,'bounded original launch argv');assert(args.every(a=>typeof a==='string'&&a.length<=65536&&!a.includes('\0')),'bounded original arguments');
 assert(!args.includes('--'),'no argument terminator ambiguity');
 const exact=(name,value)=>{const found=args.filter(a=>a===name||a.startsWith(name+'='));assert.equal(found.length,1,'one original '+name);assert.equal(found[0],name+'='+value,'exact original '+name)};
 exact('--user-data-dir',prepared.canonical);exact('--remote-debugging-port','0');exact('--remote-debugging-address','127.0.0.1');
 assert(!args.some(a=>a==='--type'||a.startsWith('--type=')),'original browser main process');assert(args.filter(a=>a==='--remote-debugging-pipe').length<=1,'one optional owned Playwright pipe');
 return {canonicalProfile:prepared.canonical,argvSha256:createHash('sha256').update(JSON.stringify(args)).digest('hex'),argc:args.length,debugPort:0,debugAddress:'127.0.0.1'};
};
exports.launchOwned=async({prepared,executablePath,out},launch)=>{
 assert(!armed,'no overlapping owned launches');exports.installOwnedLaunchObservation();
 const state={prepared,executable:fs.realpathSync(executablePath),calls:0,errors:[],observations:[],launchBeganAt:Date.now()};armed=state;let context,error;
 try{context=await launch();assert.equal(state.calls,1,'exactly one observed owned spawn');assert.equal(state.errors.length,0,'owned spawn observation refused');assert(state.record,'owned spawn witness required')}
 catch(e){error=e}
 finally{armed=null;const intact=childProcess.spawn===spawnWrapper;if(intact)childProcess.spawn=spawnOriginal;else error=error||Error('spawn observer replaced during launch');if(out)fs.writeFileSync(out,JSON.stringify({phase:'original-owned-spawn',expectedExecutable:state.executable,canonicalProfile:prepared.canonical,calls:state.calls,observations:state.observations,record:state.record||null,errors:state.errors,restored:intact,status:error?'refused':'observed'},null,2))}
 if(error){if(context?.close)await context.close();throw error}
 const witness=Object.freeze({...state.record,launchBeganAt:state.launchBeganAt});launchRecords.set(witness,witness);return {context,witness};
};
exports.verifyLaunchIdentity=({launchWitness,knownOwnedBrowserPID,canonicalProfile},proc,io=fs)=>{
 const w=io===fs?launchRecords.get(launchWitness):launchWitness;assert(w,'original observed launch witness required');assert.equal(w.pid,knownOwnedBrowserPID,'independent trusted PID equals observed launch PID');assert.equal(w.canonicalProfile,canonicalProfile,'original canonical profile');assert.equal(proc.uid,w.uid,'stable launch UID');assert.equal(proc.uid,process.getuid(),'exact browser UID');assert.equal(proc.exe,w.executable,'exact original executable');assert.equal(proc.stat?.start,w.start,'stable launch starttime');assert.equal(proc.stat?.ppid,w.ppid,'stable parent edge');assert.equal(w.ppid,String(process.pid),'direct owned parent');assert(!['Z','X'].includes(proc.stat?.state),'live owned browser');return w;
};
// Injectable filesystem is for browser-free fixtures only; connect always uses fs.
exports.inspectOwnership=({profile,prepared,knownOwnedBrowserPID,launchWitness,lines,diagnostic},io=fs)=>{
 const pid=knownOwnedBrowserPID;assert(Number.isSafeInteger(pid)&&pid>0,'trusted owned browser PID required');
 diagnostic.proc=exports.captureOwnedProc(pid,io,prepared.canonical);
 const root='/proc/'+pid;Object.assign(diagnostic,{pid,pidPath:root,logicalProfile:profile,canonicalProfile:io.realpathSync(profile),port:Number(lines[0]),endpointPath:lines[1],expectedUID:process.getuid(),matchingFDs:[],inspectionErrors:[]});
 diagnostic.launchWitness=launchWitness;const profileStat=io.statSync(diagnostic.canonicalProfile);diagnostic.profileUID=profileStat.uid;diagnostic.profileMode=profileStat.mode&0o777;
 assert.equal(diagnostic.canonicalProfile,prepared.canonical,'profile canonical identity unchanged');assert.equal(profileStat.uid,process.getuid(),'private profile UID stable');assert.equal(profileStat.mode&0o077,0,'profile remains private');assert.equal(profileStat.dev,prepared.profileDev,'same profile device');assert.equal(profileStat.ino,prepared.profileIno,'same profile inode');assert(!io.lstatSync(profile).isSymbolicLink(),'profile leaf remains non-symlink');
 exports.verifyLaunchIdentity({launchWitness,knownOwnedBrowserPID,canonicalProfile:diagnostic.canonicalProfile},diagnostic.proc,io);
 const file=io.lstatSync(path.join(profile,'DevToolsActivePort'),{bigint:true});assert(!file.isSymbolicLink()&&file.isFile(),'regular port file not symlink');assert.equal(Number(file.nlink),1,'single-link port file');assert.equal(Number(file.uid),process.getuid(),'port file UID');assert(Number(file.mtimeNs)/1e6+1>=launchWitness.launchBeganAt,'port file from current launch');assert.notEqual(fingerprint(file),prepared.previous,'fresh DevToolsActivePort required');diagnostic.portFileFingerprint=fingerprint(file);
 const stat=()=>io.readFileSync(root+'/stat','utf8').split(') ')[1].split(' ')[19];diagnostic.start=stat();
 // /proc cmdline is only display-title evidence, never an original argv parser.
 diagnostic.uid=diagnostic.proc.uid;diagnostic.argumentCanonicalProfile=launchWitness.canonicalProfile;
 const table=name=>io.readFileSync('/proc/net/'+name,'utf8').trim().split('\n').slice(1).map(l=>l.trim().split(/\s+/)).filter(c=>parseInt(c[1].split(':')[1],16)===Number(lines[0])&&c[3]==='0A');
 const listeners=table('tcp');diagnostic.listeners=listeners;diagnostic.ipv6Listeners=table('tcp6');assert.equal(listeners.length,1,'one owned IPv4 debugger listener');assert.equal(listeners[0][1].split(':')[0],'0100007F','debugger must bind 127.0.0.1 only');assert.equal(diagnostic.ipv6Listeners.length,0,'no IPv6 debugger exposure');assert.equal(Number(listeners[0][7]),process.getuid(),'listener exact UID');diagnostic.inode=listeners[0][9];assert(/^\d+$/.test(diagnostic.inode)&&diagnostic.inode!=='0','listener inode');
 let descriptors;try{descriptors=io.readdirSync(root+'/fd')}catch(e){diagnostic.inspectionErrors.push({path:root+'/fd',code:e.code,message:e.message});throw e}
 for(const fd of descriptors){const p=root+'/fd/'+fd;try{if(io.readlinkSync(p)==='socket:['+diagnostic.inode+']')diagnostic.matchingFDs.push(fd)}catch(e){diagnostic.inspectionErrors.push({path:p,code:e.code,message:e.message})}}
 assert(diagnostic.matchingFDs.length>0,'debugger listener must belong to exact trusted owned profile PID');assert.equal(stat(),diagnostic.start,'browser PID starttime stable');diagnostic.finalProc=exports.captureOwnedProc(pid,io);exports.verifyLaunchIdentity({launchWitness,knownOwnedBrowserPID,canonicalProfile:diagnostic.canonicalProfile},diagnostic.finalProc,io);assert.equal(fingerprint(io.lstatSync(path.join(profile,'DevToolsActivePort'),{bigint:true})),diagnostic.portFileFingerprint,'port file stable during inspection');
 return {pid,profile,canonicalProfile:diagnostic.canonicalProfile,start:diagnostic.start,address:'127.0.0.1',port:Number(lines[0]),inode:diagnostic.inode,matchingFDs:diagnostic.matchingFDs};
};
exports.connect=async({profile,prepared,knownOwnedBrowserPID,launchWitness,origin,workers,contextId,generationId,out,timeoutMs=8000})=>{
 const portFile=path.join(profile,'DevToolsActivePort'),diagnostic={phase:'preconnect-ownership',rawSocketOpened:false,logicalProfile:profile,knownOwnedBrowserPID,launchWitness};let lines,ownership;
 try{
  diagnostic.proc=exports.captureOwnedProc(knownOwnedBrowserPID);
  for(let i=0;i<100;i++){try{lines=fs.readFileSync(portFile,'utf8').trim().split('\n');break}catch(e){if(e.code!=='ENOENT')throw e;await sleep(20)}}
  assert(lines&&lines.length===2&&/^\d+$/.test(lines[0])&&Number(lines[0])>0&&Number(lines[0])<=65535&&/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(lines[1]),'owned DevToolsActivePort');
  ownership=exports.inspectOwnership({profile,prepared,knownOwnedBrowserPID,launchWitness,lines,diagnostic});diagnostic.status='verified';
 }catch(e){diagnostic.status='refused';diagnostic.error={message:e.message,code:e.code};throw e}
 finally{fs.writeFileSync(out+'.ownership.json',JSON.stringify(diagnostic,null,2))}
 const socket=new WebSocket('ws://127.0.0.1:'+lines[0]+lines[1]);await new Promise((r,j)=>{const timer=setTimeout(()=>{socket.close();j(Error('owned CDP connection timeout'))},3000);socket.addEventListener('open',()=>{clearTimeout(timer);r()},{once:true});socket.addEventListener('error',e=>{clearTimeout(timer);j(e)},{once:true})});
 let seq=0,active=true;const commands=new Map(),sessions=new Map(),attaching=new Map(),rows=[],errors=[],workerBindings=new Map(),claimed=new Map();
 const transcript=require('./stream-diagnostic.cjs').create({contextId,generationId,origin,send});
 const pageBodies=require('./page-body-diagnostic.cjs').create({contextId,generationId,origin,send});
 const save=()=>{fs.writeFileSync(out+'.page-body.json',JSON.stringify(pageBodies.snapshot()));fs.writeFileSync(out+'.stream.json',JSON.stringify(transcript.snapshot()));fs.writeFileSync(out,JSON.stringify({contextId,generationId,ownership,route:'owned-loopback-raw-WebSocket-discovery-nested-sessions-no-pause',sessions:[...sessions.values()].map(s=>({id:s.id,target:s.target,enabledAt:s.enabledAt,detached:s.detached})),rows,errors},null,2))};
 function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{commands.delete(id);reject(Error('CDP command timeout '+method))},3000);commands.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});const message={id,method,params};if(sessionId)send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify(message)}).catch(e=>{commands.get(id)?.reject(e);commands.delete(id)});else socket.send(JSON.stringify(message))})}
 const allowed=new Set(workers.map(w=>new URL(w.script,origin).href));let ownedBrowserContext;
 async function attach(target){if(!active||!((target.type==='service_worker'&&allowed.has(target.url))||(['page','iframe'].includes(target.type)&&new URL(target.url).origin===origin))||target.browserContextId!==ownedBrowserContext||attaching.has(target.targetId))return;
  const work=(async()=>{const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:false});if(!active)return;const s={id:sessionId,target,requests:new Map()};sessions.set(sessionId,s);s.enableSentAt=Date.now();await send('Network.enable',{maxTotalBufferSize:64*1024*1024,maxResourceBufferSize:4*1024*1024},sessionId);if(!active)return;s.enabledAt=Date.now();save()})();attaching.set(target.targetId,work);work.catch(e=>{errors.push({targetId:target.targetId,message:e.message});if(active)save()});return work;
 }
 function event(method,p,sessionId){if(!active)return;
  if(method==='Target.receivedMessageFromTarget'){message(JSON.parse(p.message),p.sessionId);return}
  if(method==='Target.targetCreated'||method==='Target.targetInfoChanged'){attach(p.targetInfo);return}
  if(method==='Target.detachedFromTarget'||method==='Target.targetDestroyed'){for(const s of sessions.values())if(s.id===p.sessionId||s.target.targetId===p.targetId){s.detached=Date.now();pageBodies.detach(s);transcript.detach(s);for(const r of s.requests.values())if(!r.finished)r.detached=s.detached}save();return}
  const s=sessions.get(sessionId);if(!s||s.detached)return;pageBodies.feed(method,p,s);transcript.feed(method,p,s);if(s.target.type!=='service_worker')return;let r=s.requests.get(p.requestId);
  if(method==='Network.requestWillBeSent'){
   if(new URL(p.request.url).origin!==origin)return;
   if(r){r.redirected=true;return}if(rows.length>=2000){errors.push({message:'row cap: UNKNOWN'});return}r={contextId,generationId,worker:s.target.url,targetId:s.target.targetId,browserContextId:s.target.browserContextId??null,sessionId,requestId:p.requestId,url:p.request.url,method:p.request.method,requestHeaders:headers(p.request.headers),started:Date.now(),wallTime:p.wallTime};s.requests.set(p.requestId,r);rows.push(r);
  }else if(method==='Network.responseReceived'&&r){r.status=p.response.status;r.headers=headers(p.response.headers)}
  else if(method==='Network.loadingFailed'&&r){r.failed={at:Date.now(),errorText:p.errorText,canceled:p.canceled};save()}
  else if(method==='Network.loadingFinished'&&r){r.finished={at:Date.now(),timestamp:p.timestamp};r.encodedDataLength=p.encodedDataLength;
   r.bodyTask=send('Network.getResponseBody',{requestId:p.requestId},sessionId).then(b=>{if(!active)return;const bytes=Buffer.from(b.body,b.base64Encoded?'base64':'utf8');r.bodyBytes=bytes.length;r.sha256=createHash('sha256').update(bytes).digest('hex')},e=>{if(active)r.bodyError=e.message}).finally(()=>{delete r.bodyTask;if(active)save()});
   // The promise is non-enumerable: raw evidence contains data, never promises.
   Object.defineProperty(r,'bodyTask',{value:r.bodyTask,writable:true,configurable:true,enumerable:false});
  }
 }
 function message(m,sessionId){if(m.id){const q=commands.get(m.id);if(q){commands.delete(m.id);m.error?q.reject(Error(m.error.message)):q.resolve(m.result)}return}try{event(m.method,m.params||{},sessionId)}catch(e){errors.push({message:e.message});if(active)save()}}
 socket.addEventListener('message',e=>message(JSON.parse(e.data)));socket.addEventListener('error',()=>errors.push({message:'owned CDP socket error'}));
 const initial=await send('Target.getTargets');const pages=initial.targetInfos.filter(t=>t.type==='page'&&new URL(t.url).origin===origin);assert.equal(pages.length,1,'one owned synthetic blank page');ownedBrowserContext=pages[0].browserContextId;
 await send('Target.setDiscoverTargets',{discover:true});for(const target of (await send('Target.getTargets')).targetInfos)await attach(target);save();
 return {pageBodyLink:(inner,member)=>pageBodies.link(inner,member),async flushPageBodies(){await pageBodies.flush();save()},async ready(){for(let i=0;i<200;i++){if([...sessions.values()].some(s=>s.target.type==='service_worker'&&s.enabledAt&&!s.detached))return;await sleep(20)}throw Error('CDP worker Network.enable readiness deadline')},async completion(row,member){const end=Date.now()+timeoutMs;while(active&&Date.now()<end){const id=row.responseHeaders['x-qa-write-id'];const matches=rows.filter(r=>r.worker&&r.headers?.['x-qa-write-id']===id&&id);if(matches.length>1)throw Error('ambiguous raw CDP write identity');if(matches.length===1){const r=matches[0];if(r.failed||r.detached||r.redirected)throw Error('raw CDP failed/stale/redirected');if(r.finished&&(!r.bodyTask||r.bodyError)){assert(!r.bodyError,'CDP body unavailable: '+r.bodyError);const proof=exports.verify(row,r,member),binding=workerBindings.get(row.workerInstanceId);assert(!binding||binding===r.sessionId,'PW worker instance cannot change CDP target');for(const [wid,sid] of workerBindings)assert(wid===row.workerInstanceId||sid!==r.sessionId,'CDP target cannot alias PW workers');const key=r.sessionId+':'+r.requestId;assert(!claimed.has(key)||claimed.get(key)===row,'one raw request cannot cover multiple PW rows');claimed.set(key,row);workerBindings.set(row.workerInstanceId,r.sessionId);return proof}}await sleep(20)}const matches=rows.filter(r=>r.headers?.['x-qa-write-id']===row.responseHeaders['x-qa-write-id']);for(const r of matches)errors.push({message:'DIAGNOSTIC ONLY: consumer link does not replace missing inner finish',consumerLink:transcript.link(r,member),completedPageBodyLink:pageBodies.link(r,member)});save();throw Error('raw CDP unfinished or unbound at independent completion deadline')},async close(){if(!active)return;for(const s of sessions.values())for(const r of s.requests.values())if(!r.finished&&!r.failed)r.classification='RAW-UNFINISHED';await pageBodies.close();await transcript.close();active=false;save();socket.close();for(const q of commands.values())q.reject(Error('owned CDP sealed'));commands.clear()}};
};
