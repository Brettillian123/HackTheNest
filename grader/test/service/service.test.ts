import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Grader, SceneBuildError, type PreparedScene, type PreparedSite, type SiteFiles, type SiteGradeOutput } from '../../src/index';
import {
  asCode,
  asSiteFiles,
  createService,
  GoalCache,
  goalKey,
  keyMatches,
  optionsFromEnv,
  sceneKey,
  type GraderLike,
  type SceneGraderLike,
  type Service,
} from '../../service/app';

const KEY = 'test-key-0123456789abcdef';
const SAME_LENGTH_WRONG = 'test-key-0123456789abcdeX';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const page = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;margin:40px}` +
  `h1{font-family:Georgia,serif;color:#234}</style></head><body>${body}</body></html>`;

const SITE: SiteFiles = {
  'index.html': page('Home', '<h1>Welcome</h1><p>Hello there.</p><a href="about.html">About</a>'),
  'about.html': page('About', '<h1>About us</h1><p>We make pages.</p><a href="index.html">Home</a>'),
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function call(port: number, method: string, path: string, body?: unknown, key: string | null = KEY) {
  const headers: Record<string, string> = {};
  if (key !== null) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: JSON.parse(text) as any };
}

/** A grader stand-in with no browser: grades wait until `release` is called. */
function fakeGrader() {
  let release: () => void = () => {};
  let gate = Promise.resolve();
  const fake = {
    closes: 0,
    hold() {
      gate = new Promise<void>((resolve) => (release = resolve));
    },
    release: () => release(),
    async render() {
      return {} as any;
    },
    async prepareSite() {
      return { files: new Map(), pages: [] } as unknown as PreparedSite;
    },
    async gradeSite(): Promise<SiteGradeOutput> {
      await gate;
      return { result: { total: 42 } as any, candidate: null };
    },
    async close() {
      fake.closes++;
    },
  };
  return fake satisfies GraderLike;
}

/** A 3D grader stand-in with no browser. Goal code "broken" will not build. */
function fakeSceneGrader() {
  const view = (name: string) => ({ name, width: 4, height: 3, pixels: new Uint8Array(48), png: PNG_SIGNATURE });
  const scene = { views: ['a', 'b', 'c', 'd'].map(view), scene: { meshes: [] } } as unknown as PreparedScene;
  const fake = {
    made: 0,
    prepares: 0,
    closes: 0,
    async prepare(code: string) {
      fake.prepares++;
      if (code === 'broken') throw new SceneBuildError('The code has a syntax error.', 'source');
      return scene;
    },
    async grade(_goal: string | PreparedScene, code: string) {
      if (code === 'bad') return { result: { total: 0, error: 'no buildScene', feedback: ['no buildScene'] } as any, candidate: null };
      return { result: { total: 77, feedback: [] } as any, candidate: scene };
    },
    async close() {
      fake.closes++;
    },
  };
  return fake satisfies SceneGraderLike;
}

describe('service helpers (no socket)', () => {
  it('checks the key in constant time and rejects near misses', () => {
    expect(keyMatches(`Bearer ${KEY}`, KEY)).toBe(true);
    expect(keyMatches(undefined, KEY)).toBe(false);
    expect(keyMatches(KEY, KEY)).toBe(false);
    expect(keyMatches(`Bearer ${SAME_LENGTH_WRONG}`, KEY)).toBe(false);
    expect(keyMatches('Bearer short', KEY)).toBe(false);
  });

  it('validates site fields', () => {
    expect(() => asSiteFiles(undefined, 'goal')).toThrow('"goal" is required.');
    expect(() => asSiteFiles('x', 'goal')).toThrow(/must be an object/);
    expect(() => asSiteFiles(['x'], 'goal')).toThrow(/must be an object/);
    expect(() => asSiteFiles({ 'a.html': 3 }, 'goal')).toThrow(/must be a string/);
    expect(asSiteFiles(SITE, 'goal')).toBe(SITE);
  });

  it('keys goals by content, not file order, and evicts the least recently used', () => {
    expect(goalKey({ a: '1', b: '2' })).toBe(goalKey({ b: '2', a: '1' }));
    expect(goalKey({ a: '1' })).not.toBe(goalKey({ a: '2' }));
    const cache = new GoalCache(2, 1e9);
    const site = (n: number) => ({ files: new Map(), pages: [], n }) as unknown as PreparedSite;
    cache.set('a', site(1));
    cache.set('b', site(2));
    cache.get('a');
    cache.set('c', site(3));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('dispatch answers without a socket', async () => {
    const service = createService({ apiKey: KEY, grader: fakeGrader(), log: () => {} });
    expect((await service.dispatch('GET', '/nope', undefined, undefined)).status).toBe(404);
    expect((await service.dispatch('POST', '/v1/grade/site', 'Bearer nope', {})).status).toBe(401);
    const reply = await service.dispatch('POST', '/v1/grade/site', `Bearer ${KEY}`, { goal: SITE, candidate: SITE });
    expect(reply.status).toBe(200);
    expect(reply.total).toBe(42);
  });

  it('validates scene fields and keys 3D goals by their code', () => {
    expect(() => asCode(undefined, 'goal')).toThrow('"goal" is required.');
    expect(() => asCode({}, 'goal')).toThrow(/must be a string of JavaScript code/);
    expect(asCode('function buildScene(THREE) {}', 'goal')).toBe('function buildScene(THREE) {}');
    expect(sceneKey('a')).toBe(sceneKey('a'));
    expect(sceneKey('a')).not.toBe(sceneKey('b'));
  });

  it('grades and renders 3D scenes, starting the 3D grader only when first needed', async () => {
    const scenes = fakeSceneGrader();
    const service = createService({
      apiKey: KEY,
      grader: fakeGrader(),
      sceneGrader: () => {
        scenes.made++;
        return scenes;
      },
      log: () => {},
    });
    const auth = `Bearer ${KEY}`;
    let health = await service.dispatch('GET', '/health', undefined, undefined);
    expect(health.body).toMatchObject({ sceneBrowserReady: false, cachedScenes: 0 });
    expect((await service.dispatch('POST', '/v1/grade/scene', 'Bearer nope', {})).status).toBe(401);
    for (const [body, message] of [
      [{ candidate: 'x' }, /^"goal" is required\.$/],
      [{ goal: 'x', candidate: 5 }, /"candidate" must be a string/],
      [{ goal: 'x', candidate: 'y', views: 'yes' }, /"views" must be true or false/],
    ] as [unknown, RegExp][]) {
      const reply = await service.dispatch('POST', '/v1/grade/scene', auth, body);
      expect(reply.status).toBe(400);
      expect((reply.body as any).error).toMatch(message);
    }
    expect(scenes.made).toBe(0);

    const plain = await service.dispatch('POST', '/v1/grade/scene', auth, { goal: 'goal', candidate: 'good' });
    expect(plain.status).toBe(200);
    expect(plain.total).toBe(77);
    expect((plain.body as any).views).toBeUndefined();
    const withViews = await service.dispatch('POST', '/v1/grade/scene', auth, { goal: 'goal', candidate: 'good', views: true });
    const views = (withViews.body as any).views;
    expect(views.map((v: any) => v.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(Buffer.from(views[0].png, 'base64').equals(PNG_SIGNATURE)).toBe(true);
    expect(scenes.prepares).toBe(1);
    expect(service.stats.sceneCacheHits).toBe(1);

    const bad = await service.dispatch('POST', '/v1/grade/scene', auth, { goal: 'goal', candidate: 'bad', views: true });
    expect(bad.status).toBe(200);
    expect((bad.body as any).result.error).toBe('no buildScene');
    expect((bad.body as any).views).toEqual([]);

    const rendered = await service.dispatch('POST', '/v1/render/scene', auth, { code: 'other goal' });
    expect(rendered.status).toBe(200);
    expect((rendered.body as any).views).toHaveLength(4);
    const broken = await service.dispatch('POST', '/v1/render/scene', auth, { code: 'broken' });
    expect(broken.status).toBe(400);
    expect((broken.body as any).error).toMatch(/goal scene could not be built: The code has a syntax error/);

    health = await service.dispatch('GET', '/health', undefined, undefined);
    expect(health.body).toMatchObject({ sceneBrowserReady: true, cachedScenes: 2 });
    expect(scenes.made).toBe(1);
    await service.close();
    expect(scenes.closes).toBe(1);
  });

  it('does not start the 3D grader just to shut down', async () => {
    let made = 0;
    const service = createService({
      apiKey: KEY,
      grader: fakeGrader(),
      sceneGrader: () => {
        made++;
        return fakeSceneGrader();
      },
      log: () => {},
    });
    await service.close();
    expect(made).toBe(0);
  });

  it('refuses to start without GRADER_API_KEY', async () => {
    expect(() => optionsFromEnv({})).toThrow(/GRADER_API_KEY is not set/);
    expect(() => optionsFromEnv({ GRADER_API_KEY: 'short' })).toThrow(/at least 16/);
    expect(optionsFromEnv({ GRADER_API_KEY: KEY })).toMatchObject({
      port: 8080,
      maxBodyBytes: 8 * 1024 * 1024,
      cacheBytes: 256 * 1024 * 1024,
      requestTimeoutMs: 55_000,
    });
    expect(optionsFromEnv({ GRADER_API_KEY: KEY, GRADER_MAX_BODY_MB: '2', PORT: '9000' })).toMatchObject({
      port: 9000,
      maxBodyBytes: 2 * 1024 * 1024,
    });
    expect(() => optionsFromEnv({ GRADER_API_KEY: KEY, PORT: 'abc' })).toThrow(/PORT must be/);
    const env = { ...process.env };
    delete env.GRADER_API_KEY;
    const child = spawn(process.execPath, ['--import', 'tsx', 'service/server.ts'], { cwd: ROOT, env });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    expect(code).toBe(1);
    expect(stderr).toMatch(/GRADER_API_KEY is not set/);
  });
});

describe('service over a socket, with the real grader', () => {
  class CountingGrader extends Grader {
    prepares = 0;
    closes = 0;
    override prepareSite(files: SiteFiles) {
      this.prepares++;
      return super.prepareSite(files);
    }
    override async close() {
      this.closes++;
      return super.close();
    }
  }
  const grader = new CountingGrader();
  let service: Service;
  let port: number;

  beforeAll(async () => {
    service = createService({ apiKey: KEY, grader, log: () => {} });
    port = await service.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await service.close();
  });

  it('answers health without a key and without grading', async () => {
    const res = await call(port, 'GET', '/health', undefined, null);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, version: expect.any(String), browserReady: false });
    expect(grader.prepares).toBe(0);
  });

  it('refuses every /v1/ route without a key, with a wrong key, and with a same-length wrong key', async () => {
    for (const path of ['/v1/grade/site', '/v1/render/site', '/v1/grade/scene', '/v1/render/scene']) {
      for (const key of [null, 'wrong', SAME_LENGTH_WRONG]) {
        const res = await call(port, 'POST', path, { goal: SITE, candidate: SITE, site: SITE }, key);
        expect(res.status, `${path} ${key}`).toBe(401);
        expect(res.json.error).toBe('Missing or wrong API key.');
      }
    }
    expect(grader.prepares).toBe(0);
  });

  it('grades a site against itself as 100, and uses the cached goal the second time', async () => {
    const first = await call(port, 'POST', '/v1/grade/site', { goal: SITE, candidate: SITE });
    expect(first.status).toBe(200);
    expect(first.json.result.total).toBe(100);
    expect(first.json.screenshots).toBeUndefined();
    expect(grader.prepares).toBe(1);

    const second = await call(port, 'POST', '/v1/grade/site', { goal: SITE, candidate: SITE, screenshots: false });
    expect(second.json.result.total).toBe(100);
    expect(second.json.screenshots).toBeUndefined();
    expect(grader.prepares).toBe(1);
    expect(service.stats.cacheHits).toBe(1);
  });

  it('returns PNG screenshots of the submitted pages when asked', async () => {
    const res = await call(port, 'POST', '/v1/grade/site', { goal: SITE, candidate: SITE, screenshots: true });
    expect(res.status).toBe(200);
    expect(Object.keys(res.json.screenshots).sort()).toEqual(['about.html', 'index.html']);
    for (const b64 of Object.values(res.json.screenshots) as string[]) {
      expect(Buffer.from(b64, 'base64').subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    }
  });

  it('renders a site for display, and gives 400 with the reason for an invalid one', async () => {
    const res = await call(port, 'POST', '/v1/render/site', { site: SITE });
    expect(res.status).toBe(200);
    expect(res.json.pages.map((p: any) => p.path).sort()).toEqual(['about.html', 'index.html']);
    for (const p of res.json.pages) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(Buffer.from(p.png, 'base64').subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    }
    const bad = await call(port, 'POST', '/v1/render/site', { site: { 'site.css': 'p{}' } });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatch(/no \.html page/);
  });

  it('gives 400 with the grader reason for an invalid goal', async () => {
    const res = await call(port, 'POST', '/v1/grade/site', { goal: { 'site.css': 'p{}' }, candidate: SITE });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/no \.html page/);
    expect(res.text).not.toMatch(/\bat .*\.ts:\d+/);
  });

  it('scores a bad submission 0 with the reason, as a 200', async () => {
    const res = await call(port, 'POST', '/v1/grade/site', { goal: SITE, candidate: { 'site.css': 'p{}' } });
    expect(res.status).toBe(200);
    expect(res.json.result.total).toBe(0);
    expect(res.json.result.error).toMatch(/no \.html page/);
  });

  it('says the browser is up once a page has rendered', async () => {
    const res = await call(port, 'GET', '/health', undefined, null);
    expect(res.json.browserReady).toBe(true);
    expect(res.json.cachedGoals).toBe(1);
  });

  it('closes the browser on shutdown', async () => {
    await service.close();
    expect(grader.closes).toBe(1);
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });
});

describe('service over a socket, request checks and queueing (no browser)', () => {
  const grader = fakeGrader();
  let service: Service;
  let port: number;

  beforeAll(async () => {
    service = createService({ apiKey: KEY, grader, maxQueue: 0, maxBodyBytes: 4096, requestTimeoutMs: 2000, log: () => {} });
    port = await service.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    grader.release();
    await service.close();
  });

  it('answers bad requests with a plain message and keeps running', async () => {
    const cases: [unknown, number, RegExp][] = [
      ['{not json', 400, /^The request body is not valid JSON\.$/],
      [[1, 2], 400, /must be a JSON object/],
      [{ candidate: SITE }, 400, /^"goal" is required\.$/],
      [{ goal: 'index.html', candidate: SITE }, 400, /"goal" must be an object/],
      [{ goal: SITE, candidate: { 'index.html': 5 } }, 400, /"candidate" file "index.html" must be a string/],
      [{ goal: SITE, candidate: SITE, screenshots: 'yes' }, 400, /"screenshots" must be true or false/],
    ];
    for (const [body, status, message] of cases) {
      const res = await call(port, 'POST', '/v1/grade/site', body);
      expect(res.status, JSON.stringify(body)).toBe(status);
      expect(res.json.error).toMatch(message);
    }
    expect((await call(port, 'GET', '/nope', undefined, null)).status).toBe(404);
    expect((await call(port, 'GET', '/v1/grade/site')).status).toBe(405);
    expect((await call(port, 'GET', '/health', undefined, null)).status).toBe(200);
  });

  it('rejects an oversized body with 413 before reading all of it', async () => {
    const result = await new Promise<{ status: number; body: string; sent: number }>((resolve, reject) => {
      const declared = 10 * 1024 * 1024;
      let sent = 0;
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/v1/grade/site',
          headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Content-Length': declared },
        },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body, sent }));
        },
      );
      req.on('error', reject);
      const chunk = '{"goal":{"index.html":"' + 'x'.repeat(1000);
      req.write(chunk);
      sent += chunk.length;
      // The rest of the 10 MB is never sent: the answer must come anyway.
    });
    expect(result.status).toBe(413);
    expect(JSON.parse(result.body).error).toMatch(/larger than 4096 bytes/);
    expect(result.sent).toBeLessThan(4096);

    // A body with no declared length is cut off once it passes the limit.
    const chunked = await new Promise<number>((resolve) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/v1/grade/site',
          headers: { Authorization: `Bearer ${KEY}`, 'Transfer-Encoding': 'chunked' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', () => {}); // the server drops the connection after answering
      for (let i = 0; i < 3; i++) req.write('x'.repeat(2000));
    });
    expect(chunked).toBe(413);
    expect((await call(port, 'GET', '/health', undefined, null)).status).toBe(200);
  });

  it('answers 503 with Retry-After when the queue is full, and 504 past the deadline', async () => {
    grader.hold();
    const first = call(port, 'POST', '/v1/grade/site', { goal: SITE, candidate: SITE });
    await new Promise((r) => setTimeout(r, 100));
    const second = await call(port, 'POST', '/v1/grade/site', { goal: SITE, candidate: SITE });
    expect(second.status).toBe(503);
    expect(second.headers.get('retry-after')).toBe('5');
    expect(second.json.error).toMatch(/busy/);
    const late = await first;
    expect(late.status).toBe(504);
    expect(late.json.error).toMatch(/did not finish within 2 seconds/);
    grader.release();
    await new Promise((r) => setTimeout(r, 50));
    const ok = await call(port, 'POST', '/v1/grade/site', { goal: SITE, candidate: SITE });
    expect(ok.status).toBe(200);
    expect(ok.json.result.total).toBe(42);
  });

  it('finishes the grade in flight before closing the browser on shutdown', async () => {
    grader.hold();
    const inFlight = call(port, 'POST', '/v1/grade/site', { goal: SITE, candidate: SITE });
    await new Promise((r) => setTimeout(r, 100));
    const closed = service.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(grader.closes).toBe(0);
    grader.release();
    const res = await inFlight;
    expect(res.status).toBe(200);
    await closed;
    expect(grader.closes).toBe(1);
  });
});
