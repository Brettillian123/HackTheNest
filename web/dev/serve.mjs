// Zero-dependency static server for web/. Run: node web/dev/serve.mjs  (http://localhost:4173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end('Forbidden'); return; }
    if (/(^|[\\/])\.env/.test(file)) { res.writeHead(404).end('Not found'); return; }
    const s = await stat(file);
    const target = s.isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    // Unknown path: serve the site's 404 page with status 404.
    let page = 'Not found';
    let type = 'text/plain; charset=utf-8';
    try {
      // 404.html carries <base href="/"> and root paths, so it works at any depth.
      page = await readFile(join(ROOT, '404.html'));
      type = TYPES['.html'];
    } catch { /* plain text fallback */ }
    res.writeHead(404, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(req.method === 'HEAD' ? undefined : page);
  }
}).listen(PORT, () => console.log(`promptdyno web on http://localhost:${PORT}`));
