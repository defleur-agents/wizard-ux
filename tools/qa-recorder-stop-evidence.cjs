// Synthetic-only loopback evidence sink. Never an owner API and never a reload/capture guard.
// Use a real wire body: Chromium/CDP may omit Blob elements from request.postDataBuffer().
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
async function start({out,mode,report}){
 if(!['phone','desktop'].includes(mode))throw Error('Invalid synthetic evidence mode');
 let receive;const received=new Promise(resolve=>{receive=resolve});
 const server=http.createServer((req,res)=>{
  const reject=error=>{report.errors.push({evidence:String(error)});res.writeHead(500);res.end('Synthetic evidence failed');receive({error:String(error)})};
  try{
   const u=new URL(req.url,'http://127.0.0.1'),id=u.searchParams.get('id');
   if(req.method!=='POST'||u.pathname!=='/fixture-capture-evidence'||!id||!(/^[a-f0-9-]+$/.test(id)||id==='preflight'))throw Error('Unexpected synthetic evidence request');
   const chunks=[];let size=0;
   req.on('data',chunk=>{size+=chunk.length;if(size>32*1024*1024){req.destroy(Error('Synthetic evidence too large'));return}chunks.push(chunk)});
   req.on('error',reject);
   req.on('end',()=>{try{
    const bytes=Buffer.concat(chunks);if(!bytes.length)throw Error('Empty synthetic evidence');
    if(id==='preflight'){
     if(!bytes.equals(Buffer.from([0,255,128])))throw Error('Synthetic Blob transport changed bytes');
    }else{
     const kept={id,bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')};
     fs.writeFileSync(path.join(out,mode+'-stop.bin'),bytes);
     fs.writeFileSync(path.join(out,mode+'-stop.json'),JSON.stringify(kept,null,2));
     receive(kept);
    }
    res.writeHead(204);res.end();
   }catch(e){reject(e)}});
  }catch(e){reject(e)}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {url:'http://127.0.0.1:'+server.address().port,
  received:()=>received.then(value=>{if(value.error)throw Error(value.error);return value}),
  close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections()})};
}
module.exports={start};
