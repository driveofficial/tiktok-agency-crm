import http from 'node:http'; import { readFile } from 'node:fs/promises'; import { join, extname } from 'node:path';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer(async (req,res)=>{try{const p=join(process.cwd(),(req.url==='/'?'/preview.html':req.url).split('?')[0]);const b=await readFile(p);res.writeHead(200,{'content-type':T[extname(p)]||'application/octet-stream'});res.end(b);}catch(e){res.writeHead(404);res.end('404');}}).listen(4173,()=>console.log('serve http://localhost:4173'));
