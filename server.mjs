import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = new URL('./public/', import.meta.url).pathname;
const useHttps = process.argv.includes('--https');
const port = Number(process.env.PORT || (useHttps ? 8443 : 4173));
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };

async function handler(req, res) {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
    let file = join(root, relative || 'index.html');
    if (!(await stat(file).catch(() => null))?.isFile()) file = join(root, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': file.endsWith('service-worker.js') ? 'no-cache' : 'public, max-age=0' });
    res.end(data);
  } catch (error) { res.writeHead(500); res.end(`Server error: ${error.message}`); }
}

let server;
if (useHttps) {
  const [key, cert] = await Promise.all([readFile(new URL('./certs/dev-key.pem', import.meta.url)), readFile(new URL('./certs/dev-cert.pem', import.meta.url))]).catch(() => {
    console.error('Sertifikat tidak ditemukan. Jalankan: ./scripts/create-dev-cert.sh <IP-LAN>'); process.exit(1);
  });
  server = createHttpsServer({ key, cert }, handler);
} else server = createHttpServer(handler);
server.listen(port, '0.0.0.0', () => {
  const protocol = useHttps ? 'https' : 'http';
  console.log(`StokQR: ${protocol}://localhost:${port}`);
  for (const entries of Object.values(networkInterfaces())) for (const net of entries || []) if (net.family === 'IPv4' && !net.internal) console.log(`Jaringan lokal: ${protocol}://${net.address}:${port}`);
});
