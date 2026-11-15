import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SceneGrader } from '../../src/scene3d/index';

// A local server that counts every request, and a file with a secret in it.
let server: Server;
let port = 0;
let hits = 0;
let dir = '';
let fileUrl = '';
const SECRET = 'secret-7f3a9c';

beforeAll(async () => {
  server = createServer((req, res) => {
    hits++;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(SECRET);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
  dir = mkdtempSync(join(tmpdir(), 'scene3d-'));
  const file = join(dir, 'secret.txt');
  writeFileSync(file, SECRET);
  fileUrl = pathToFileURL(file).href;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

describe('3D grader: a scene cannot reach out', () => {
  it('cannot reach a local server or read a file, by any route', async () => {
    const url = `http://127.0.0.1:${port}/`;
    const code = `function buildScene(THREE) {
  const url = ${JSON.stringify(url)};
  const file = ${JSON.stringify(fileUrl)};
  let found = '';
  const sync = (u) => { try { const x = new XMLHttpRequest(); x.open('GET', u, false); x.send(); found += x.responseText; } catch (e) {} };
  sync(url + 'xhr');
  sync(file);
  try { fetch(url + 'fetch').then((r) => r.text()).then((t) => { found += t; }).catch(() => {}); } catch (e) {}
  try { fetch(file).catch(() => {}); } catch (e) {}
  try { import(url + 'module.js').catch(() => {}); } catch (e) {}
  try { new Worker(url + 'worker.js'); } catch (e) {}
  try { new SharedWorker(url + 'shared.js'); } catch (e) {}
  try { document.cookie = 'grader=1'; found += document.cookie; } catch (e) {}
  try { window.open(url + 'popup'); } catch (e) {}
  try { new Image().src = url + 'image'; } catch (e) {}
  try { navigator.sendBeacon(url + 'beacon', 'x'); } catch (e) {}
  try { const s = document.createElement('script'); s.src = url + 'script.js'; document.head.appendChild(s); } catch (e) {}
  try { const f = document.createElement('iframe'); f.src = url + 'frame'; document.body.appendChild(f); } catch (e) {}
  try { new WebSocket('ws://127.0.0.1:${port}/ws'); } catch (e) {}
  setTimeout(() => { try { location.href = url + 'navigate'; } catch (e) {} }, 100);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  box.name = found.slice(0, 90);
  return box;
}`;
    // Keep the page open for a while after the code returns, so everything it started gets its chance.
    const grader = new SceneGrader({ lingerMs: 1500 });
    try {
      const scene = await grader.build(code);
      expect(scene.meshes).toHaveLength(1);
      expect(scene.meshes[0].name).not.toContain(SECRET);
      expect(hits).toBe(0);
      // A normal scene still builds afterwards.
      const ok = await grader.build('function buildScene(THREE) { return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); }');
      expect(ok.triangleCount).toBe(12);
    } finally {
      await grader.close();
    }
    expect(hits).toBe(0);
  });
});
