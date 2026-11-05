// Synthetic-only loopback evidence sink. Never an owner API and never a reload/capture guard.
// Use a real wire body: Chromium/CDP may omit Blob elements from request.postDataBuffer().
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const owned=new WeakMap();
function origin(sink){
 const url=owned.get(sink);
 if(!url||!/^http:\/\/127\.0\.0\.1:[1-9]\d*$/.test(url))throw Error('Expected an active owned synthetic evidence server');
 return url;
}
async function start({out,mode,report}){
 if(!['phone','desktop'].includes(mode))throw Error('Invalid synthetic evidence mode');
 let receive;const received=new Promise(resolve=>{receive=resolve});
 const server=http.createServer((req,res)=>{
  const request={mode,method:req.method,url:req.url,host:req.headers.host};
  (report.evidenceRequests??=[]).push(request);
  const reject=error=>{request.status=500;request.error=String(error);report.errors.push({evidence:String(error),mode,method:req.method,url:req.url,host:req.headers.host});res.writeHead(500);res.end('Synthetic evidence failed');receive({error:String(error)})};
  try{
   // Browser-generated favicon is the only admitted non-evidence wire request.
   if(req.method==='GET'&&req.url==='/favicon.ico'){
    request.admitted='favicon';request.status=204;res.writeHead(204);res.end();return;
   }
   const u=new URL(req.url,'http://127.0.0.1'),id=u.searchParams.get('id');
   if(req.method!=='POST'||u.pathname!=='/fixture-capture-evidence'||!id||!(/^[a-f0-9-]+$/.test(id)||id==='preflight'))throw Error('Unexpected synthetic evidence request');
   const chunks=[];let size=0;
   req.on('data',chunk=>{size+=chunk.length;if(size>32*1024*1024){req.destroy(Error('Synthetic evidence too large'));return}chunks.push(chunk)});
   req.on('error',reject);
   req.on('end',()=>{try{
    const bytes=Buffer.concat(chunks);if(!bytes.length)throw Error('Empty synthetic evidence');
    if(id==='preflight'){
     if(!bytes.equals(Buffer.from([0,255,128])))throw Error('Synthetic Blob transport changed bytes');
     (report.evidencePreflights??=[]).push({mode,bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex'),host:req.headers.host});
    }else{
     const kept={id,bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')};
     fs.writeFileSync(path.join(out,mode+'-stop.bin'),bytes);
     fs.writeFileSync(path.join(out,mode+'-stop.json'),JSON.stringify(kept,null,2));
     receive(kept);
    }
    request.admitted=id==='preflight'?'preflight':'stop';request.status=204;
    res.writeHead(204);res.end();
   }catch(e){reject(e)}});
  }catch(e){reject(e)}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const sink={url:'http://127.0.0.1:'+server.address().port,
  received:()=>received.then(value=>{if(value.error)throw Error(value.error);return value}),
  close:()=>{owned.delete(sink);return new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections()})}};
 owned.set(sink,sink.url);return Object.freeze(sink);
}
module.exports={start,origin};
