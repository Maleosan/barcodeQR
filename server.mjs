import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
const root=new URL('./',import.meta.url).pathname;const secure=process.argv.includes('--https');const port=Number(process.env.PORT||(secure?8443:4173));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
async function serve(request,response){try{const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);const relative=normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/,'');let file=join(root,relative||'index.html');if(!(await stat(file).catch(()=>null))?.isFile())file=join(root,'index.html');const body=await readFile(file);response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('service-worker.js')?'no-cache':'public, max-age=0'});response.end(body);}catch(error){response.writeHead(500);response.end(error.message);}}
let server;if(secure){const [key,cert]=await Promise.all([readFile(new URL('./certs/dev-key.pem',import.meta.url)),readFile(new URL('./certs/dev-cert.pem',import.meta.url))]).catch(()=>{console.error('Buat sertifikat dahulu: ./scripts/create-dev-cert.sh <IP-LAN>');process.exit(1);});server=httpsServer({key,cert},serve);}else server=httpServer(serve);
server.listen(port,'0.0.0.0',()=>{const protocol=secure?'https':'http';console.log(`StokQR: ${protocol}://localhost:${port}`);for(const group of Object.values(networkInterfaces()))for(const address of group||[])if(address.family==='IPv4'&&!address.internal)console.log(`HP/LAN: ${protocol}://${address.address}:${port}`);});
