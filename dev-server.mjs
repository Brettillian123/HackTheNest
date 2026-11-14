import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRequest } from './backend/route/api.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'frontend');
const pages = resolve(root, 'pages');
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

function resolvePage(pathname) {
  if (pathname === '/') return null;
  if (pathname === '/challenge') return resolve(pages, 'home.html');
  const route = pathname.split('/').filter(Boolean).join('/');
  if (!route || route.includes('\\')) return null;
  const candidate = resolve(pages, `${route}.html`);
  return candidate.startsWith(pages + sep) ? candidate : null;
}

createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }

  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname);
    return;
  }

  if (pathname === '/') {
    res.writeHead(302, { Location: '/home' }).end();
    return;
  }

  let file;
  if (extname(pathname)) {
    file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
  } else {
    file = resolvePage(pathname);
  }

  if (!file || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Frontend running at http://localhost:${port}`));
