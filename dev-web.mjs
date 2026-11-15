// Local full stack: serves web/ with the same routing rules as vercel.json, and the API.
// Run with: npm run dev:web  (reads .env if present). Port: PORT or 3000.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runApi } from './lib/vercel-handler.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'web');
const port = Number(process.env.PORT || 3000);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function fileFor(pathname) {
  const file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + sep)) return null;
  if (existsSync(file) && statSync(file).isFile()) return file;
  if (existsSync(file) && statSync(file).isDirectory() && existsSync(resolve(file, 'index.html'))) return resolve(file, 'index.html');
  return null;
}

function send(res, status, file) {
  res.writeHead(status, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }

  // vercel.json "redirects"
  if (pathname === '/home') { res.writeHead(302, { Location: '/' }).end(); return; }
  // Files in the output directory win, as on Vercel.
  const direct = fileFor(pathname);
  if (direct) return send(res, 200, direct);
  // vercel.json "rewrites", in order.
  if (pathname === '/challenge') return send(res, 200, resolve(root, 'challenges.html'));
  if (pathname.startsWith('/api/')) { runApi(req, res, pathname); return; }
  const page = /^\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (page) {
    const file = fileFor(`/${page[1]}.html`);
    if (file) return send(res, 200, file);
  }
  const notFound = resolve(root, '404.html');
  if (existsSync(notFound)) return send(res, 404, notFound);
  res.writeHead(404).end('Not found');
}).listen(port, () => console.log(`promptdyno (web + API) at http://localhost:${port}`));
