/**
 * The grading service: a small HTTP server around the grader, so the web
 * app (on Vercel, where a headless browser cannot run) can score sites and
 * 3D scenes.
 * `service/server.ts` starts it from environment variables; tests use
 * `createService` directly.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  checkPromptOriginality,
  DocRubricError,
  gradeDoc,
  gradeWorkflow,
  workflowRubricProblem,
  type DocKind,
  type DocRubric,
  Grader,
  GRADER_VERSION,
  GraderInputError,
  SceneBuildError,
  SceneGrader,
  type PreparedScene,
  type PreparedSite,
  type SiteFiles,
} from '../src/index';

/** The parts of the grader the service uses (tests pass a stand-in). */
export type GraderLike = Pick<Grader, 'render' | 'prepareSite' | 'gradeSite' | 'close'>;

/** The parts of the 3D grader the service uses (tests pass a stand-in). */
export type SceneGraderLike = Pick<SceneGrader, 'prepare' | 'grade' | 'close'>;

export interface ServiceOptions {
  /** Shared secret callers send as `Authorization: Bearer <key>`. */
  apiKey: string;
  grader?: GraderLike;
  /** Makes the 3D grader; called once, on the first 3D request, so its browser starts only when needed. */
  sceneGrader?: () => SceneGraderLike;
  /** Requests allowed to wait behind the one being graded. */
  maxQueue?: number;
  /** Time from a request being queued to its answer. */
  requestTimeoutMs?: number;
  maxBodyBytes?: number;
  /** Prepared goals kept in memory: at most this many... */
  cacheEntries?: number;
  /** ...and at most this many bytes (screenshots are large). */
  cacheBytes?: number;
  /** One line per request. Defaults to stdout. */
  log?: (line: string) => void;
}

export const DEFAULTS = {
  port: 8080,
  host: '0.0.0.0',
  maxQueue: 8,
  requestTimeoutMs: 55_000,
  maxBodyBytes: 8 * 1024 * 1024,
  cacheEntries: 16,
  cacheBytes: 256 * 1024 * 1024,
} as const;

export const MIN_KEY_LENGTH = 16;

/** A reply from a route, before it is written to the socket. */
export interface Reply {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  /** The grade's total, for the log line. */
  total?: number;
}

interface Route {
  auth: boolean;
  /** Whether the route takes a JSON body. */
  body: boolean;
  handle(body: unknown): Promise<Reply>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- helpers

/** Constant-time check of an `Authorization` header against the key. */
export function keyMatches(header: string | undefined, key: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  // Hash both sides so the comparison takes the same time whatever the lengths.
  const given = createHash('sha256').update(match ? match[1] : '').digest();
  const wanted = createHash('sha256').update(key).digest();
  return timingSafeEqual(given, wanted) && match !== null;
}

/** Checks that a request field is a site: an object of path -> text. */
/** The optional `intent` field: page path -> { keyFacts: string[] }. Undefined when absent. */
export function asIntent(value: unknown): Record<string, { keyFacts: string[] }> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, '"intent" must be an object mapping page paths to { "keyFacts": [...] }.');
  const out: Record<string, { keyFacts: string[] }> = {};
  for (const [path, entry] of Object.entries(value as Record<string, unknown>)) {
    const facts = entry && typeof entry === 'object' ? (entry as { keyFacts?: unknown }).keyFacts : undefined;
    if (!Array.isArray(facts) || !facts.every((f) => typeof f === 'string')) {
      throw new HttpError(400, `"intent.${path}.keyFacts" must be a list of strings.`);
    }
    out[path] = { keyFacts: facts as string[] };
  }
  return out;
}

export function asSiteFiles(value: unknown, name: string): SiteFiles {
  if (value === undefined || value === null) throw new HttpError(400, `"${name}" is required.`);
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `"${name}" must be an object mapping file paths to file text.`);
  }
  for (const [path, text] of Object.entries(value)) {
    if (typeof text !== 'string') {
      throw new HttpError(400, `"${name}" file "${path.slice(0, 100)}" must be a string of file text.`);
    }
  }
  return value as SiteFiles;
}

/** Checks that a request field is a string of code. */
export function asCode(value: unknown, name: string): string {
  if (value === undefined || value === null) throw new HttpError(400, `"${name}" is required.`);
  if (typeof value !== 'string') throw new HttpError(400, `"${name}" must be a string of JavaScript code.`);
  return value;
}

function asFlag(value: unknown, name: string): boolean {
  if (value !== undefined && typeof value !== 'boolean') throw new HttpError(400, `"${name}" must be true or false.`);
  return value === true;
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'The request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

/** Cache key for a goal: the same files in any order give the same key. */
export function goalKey(files: SiteFiles): string {
  const entries = Object.keys(files)
    .sort()
    .map((path) => [path, files[path]]);
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

function siteBytes(site: PreparedSite): number {
  let bytes = 0;
  for (const page of site.pages) bytes += (page.snapshot.pixels?.byteLength ?? 0) + (page.snapshot.png?.length ?? 0);
  return bytes;
}

/** Cache key for a 3D goal. */
export function sceneKey(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function sceneBytes(scene: PreparedScene): number {
  let bytes = 0;
  for (const view of scene.views) bytes += (view.pixels?.byteLength ?? 0) + (view.png?.length ?? 0);
  for (const mesh of scene.scene?.meshes ?? []) bytes += mesh.positions?.byteLength ?? 0;
  return bytes;
}

/** Prepared goals (sites by default, or 3D scenes), least recently used evicted first. */
export class GoalCache<T = PreparedSite> {
  private readonly entries = new Map<string, { site: T; bytes: number }>();
  private bytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
    private readonly sizeOf: (value: T) => number = siteBytes as unknown as (value: T) => number,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.site;
  }

  set(key: string, site: T): void {
    if (this.maxEntries <= 0) return;
    const old = this.entries.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.entries.delete(key);
    }
    const bytes = this.sizeOf(site);
    this.entries.set(key, { site, bytes });
    this.bytes += bytes;
    // Always keep the newest entry, even if it alone is over the byte cap.
    while (this.entries.size > 1 && (this.entries.size > this.maxEntries || this.bytes > this.maxBytes)) {
      const [oldestKey, oldest] = this.entries.entries().next().value!;
      this.entries.delete(oldestKey);
      this.bytes -= oldest.bytes;
    }
  }
}

class QueueFullError extends Error {}
class DeadlineError extends Error {}

/** Runs one job at a time; a bounded number may wait. */
export class JobQueue {
  private running = false;
  private readonly waiting: (() => void)[] = [];
  private idle: (() => void)[] = [];

  constructor(private readonly maxWaiting: number) {}

  get busy(): boolean {
    return this.running;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  /** Rejects with QueueFullError at once, or DeadlineError if not done within `timeoutMs`. */
  run<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    if (this.running && this.waiting.length >= this.maxWaiting) return Promise.reject(new QueueFullError());
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const settle = (done: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        done();
      };
      const job = () => {
        Promise.resolve()
          .then(fn)
          .then(
            (value) => settle(() => resolve(value)),
            (error) => settle(() => reject(error)),
          )
          .finally(() => this.next());
      };
      // A job that has started cannot be stopped (the grader caps its own
      // rendering time); a late answer is dropped and the next job waits for it.
      const timer = setTimeout(() => {
        const index = this.waiting.indexOf(job);
        if (index >= 0) this.waiting.splice(index, 1);
        settle(() => reject(new DeadlineError()));
      }, timeoutMs);
      if (this.running) this.waiting.push(job);
      else {
        this.running = true;
        job();
      }
    });
  }

  whenIdle(): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => this.idle.push(resolve));
  }

  private next(): void {
    const job = this.waiting.shift();
    if (job) return job();
    this.running = false;
    const idle = this.idle;
    this.idle = [];
    for (const resolve of idle) resolve();
  }
}

// ---------------------------------------------------------------- service

export interface Service {
  readonly server: Server;
  /** Answers one request; used as the server's request handler. */
  handle(req: IncomingMessage, res: ServerResponse): void;
  /** The route table without HTTP: method, path, Authorization header, parsed body. */
  dispatch(method: string, path: string, authorization: string | undefined, body: unknown): Promise<Reply>;
  listen(port?: number, host?: string): Promise<number>;
  /** Renders a tiny page so the browser is running before the first grade. */
  warmUp(): Promise<void>;
  /** Stops accepting, finishes work in flight, closes the browser. */
  close(): Promise<void>;
  readonly stats: { prepares: number; cacheHits: number; scenePrepares: number; sceneCacheHits: number };
}

export function createService(options: ServiceOptions): Service {
  const apiKey = options.apiKey;
  if (typeof apiKey !== 'string' || apiKey.length < MIN_KEY_LENGTH) {
    throw new Error(`The API key must be at least ${MIN_KEY_LENGTH} characters.`);
  }
  const grader: GraderLike = options.grader ?? new Grader();
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULTS.maxBodyBytes;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs;
  const queue = new JobQueue(options.maxQueue ?? DEFAULTS.maxQueue);
  const cacheEntries = options.cacheEntries ?? DEFAULTS.cacheEntries;
  const cacheBytes = options.cacheBytes ?? DEFAULTS.cacheBytes;
  const cache = new GoalCache(cacheEntries, cacheBytes);
  // 3D goals have their own cache with the same limits; they are small (four views and the triangles).
  const sceneCache = new GoalCache<PreparedScene>(cacheEntries, cacheBytes, sceneBytes);
  const log = options.log ?? ((line: string) => process.stdout.write(line + '\n'));
  const stats = { prepares: 0, cacheHits: 0, scenePrepares: 0, sceneCacheHits: 0 };
  const inFlight = new Set<ServerResponse>();
  let browserReady = false;
  let sceneBrowserReady = false;
  let scenes: SceneGraderLike | null = null;
  let closing: Promise<void> | null = null;

  /** The 3D grader, made on first use. */
  function sceneGrader(): SceneGraderLike {
    scenes ??= options.sceneGrader ? options.sceneGrader() : new SceneGrader();
    return scenes;
  }

  /** Queues a job that uses a browser: the site renderer's, or the 3D grader's. */
  async function queued<T>(fn: () => Promise<T>, browser: 'site' | 'scene' = 'site'): Promise<T> {
    const ready = () => {
      if (browser === 'site') browserReady = true;
      else sceneBrowserReady = true;
    };
    try {
      const value = await queue.run(fn, timeoutMs);
      ready();
      return value;
    } catch (error) {
      if (error instanceof QueueFullError) {
        throw new HttpError(503, 'The grader is busy. Try again shortly.', { 'Retry-After': '5' });
      }
      if (error instanceof DeadlineError) {
        throw new HttpError(504, `The grader did not finish within ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      if (error instanceof GraderInputError || error instanceof SceneBuildError) ready();
      throw error;
    }
  }

  async function preparedScene(code: string): Promise<PreparedScene> {
    const key = sceneKey(code);
    const hit = sceneCache.get(key);
    if (hit) {
      stats.sceneCacheHits++;
      return hit;
    }
    stats.scenePrepares++;
    const scene = await sceneGrader().prepare(code);
    sceneCache.set(key, scene);
    return scene;
  }

  const viewsOf = (scene: PreparedScene | null) =>
    (scene?.views ?? []).map((view) => ({
      name: view.name,
      width: view.width,
      height: view.height,
      png: view.png.toString('base64'),
    }));

  async function preparedGoal(files: SiteFiles): Promise<PreparedSite> {
    const key = goalKey(files);
    const hit = cache.get(key);
    if (hit) {
      stats.cacheHits++;
      return hit;
    }
    stats.prepares++;
    const site = await grader.prepareSite(files);
    cache.set(key, site);
    return site;
  }

  const routes: Record<string, Route> = {
    'GET /health': {
      auth: false,
      body: false,
      handle: async () => ({
        status: closing ? 503 : 200,
        body: {
          ok: !closing,
          version: GRADER_VERSION,
          // Each browser starts lazily and restarts itself after a crash;
          // these say it has done some work since the server started.
          browserReady,
          sceneBrowserReady,
          busy: queue.busy,
          waiting: queue.waitingCount,
          cachedGoals: cache.size,
          cachedScenes: sceneCache.size,
        },
      }),
    },

    'POST /v1/grade/site': {
      auth: true,
      body: true,
      handle: async (raw) => {
        const body = asObject(raw);
        const goalFiles = asSiteFiles(body.goal, 'goal');
        const candidateFiles = asSiteFiles(body.candidate, 'candidate');
        if (body.screenshots !== undefined && typeof body.screenshots !== 'boolean') {
          throw new HttpError(400, '"screenshots" must be true or false.');
        }
        const intent = asIntent(body.intent);
        const { result, candidate } = await queued(async () =>
          intent ? grader.gradeSite(await preparedGoal(goalFiles), candidateFiles, { intent }) : grader.gradeSite(await preparedGoal(goalFiles), candidateFiles),
        );
        const reply: Record<string, unknown> = { result };
        if (body.screenshots) {
          const shots: Record<string, string> = {};
          for (const page of candidate?.pages ?? []) shots[page.path] = page.snapshot.png.toString('base64');
          reply.screenshots = shots;
        }
        return { status: 200, body: reply, total: result.total };
      },
    },

    'POST /v1/render/site': {
      auth: true,
      body: true,
      handle: async (raw) => {
        const site = await queued(() => preparedGoal(asSiteFiles(asObject(raw).site, 'site')));
        return {
          status: 200,
          body: {
            version: GRADER_VERSION,
            pages: site.pages.map((page) => ({
              path: page.path,
              width: page.snapshot.width,
              height: page.snapshot.height,
              png: page.snapshot.png.toString('base64'),
            })),
          },
        };
      },
    },

    'POST /v1/grade/scene': {
      auth: true,
      body: true,
      handle: async (raw) => {
        const body = asObject(raw);
        const goal = asCode(body.goal, 'goal');
        const candidateCode = asCode(body.candidate, 'candidate');
        const views = asFlag(body.views, 'views');
        const { result, candidate } = await queued(
          async () => sceneGrader().grade(await preparedScene(goal), candidateCode),
          'scene',
        );
        const reply: Record<string, unknown> = { result };
        if (views) reply.views = viewsOf(candidate);
        return { status: 200, body: reply, total: result.total };
      },
    },

    'POST /v1/grade/doc': {
      auth: true,
      body: true,
      handle: async (raw) => {
        const body = asObject(raw);
        if (typeof body.candidate !== 'string') throw new HttpError(400, '"candidate" must be a string (for "mcp-tools", the JSON as text).');
        try {
          const result = gradeDoc({ kind: body.kind as DocKind, rubric: body.rubric as DocRubric, candidate: body.candidate });
          return { status: 200, body: { result }, total: result.total };
        } catch (error) {
          if (error instanceof DocRubricError) throw new HttpError(400, error.message);
          throw error;
        }
      },
    },

    'POST /v1/grade/workflow': {
      auth: true,
      body: true,
      handle: async (raw) => {
        const body = asObject(raw);
        const problem = workflowRubricProblem(body.rubric);
        if (problem) throw new HttpError(400, problem);
        const result = gradeWorkflow({ rubric: body.rubric, candidate: body.candidate });
        return { status: 200, body: { result }, total: result.total };
      },
    },

    // No browser: answered at once, never waits in the grading queue.
    'POST /v1/check/prompt': {
      auth: true,
      body: true,
      handle: async (raw) => {
        const body = asObject(raw);
        if (typeof body.prompt !== 'string') throw new HttpError(400, '"prompt" must be a string.');
        const texts = body.challengeTexts;
        if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string')) {
          throw new HttpError(400, '"challengeTexts" must be an array of strings.');
        }
        return { status: 200, body: { result: checkPromptOriginality(body.prompt, texts as string[]) } };
      },
    },

    'POST /v1/render/scene': {
      auth: true,
      body: true,
      handle: async (raw) => {
        const scene = await queued(() => preparedScene(asCode(asObject(raw).code, 'code')), 'scene');
        return { status: 200, body: { version: GRADER_VERSION, views: viewsOf(scene) } };
      },
    },
  };

  async function dispatch(method: string, path: string, authorization: string | undefined, body: unknown): Promise<Reply> {
    try {
      const route = routes[`${method} ${path}`];
      if (!route) throw notFound(path);
      if (route.auth && !keyMatches(authorization, apiKey)) throw unauthorized();
      if (closing && route.auth) throw new HttpError(503, 'The grader is shutting down.', { 'Retry-After': '10' });
      return await route.handle(body);
    } catch (error) {
      return errorReply(error);
    }
  }

  function notFound(path: string): HttpError {
    const methods = Object.keys(routes)
      .filter((key) => key.endsWith(` ${path}`))
      .map((key) => key.split(' ')[0]);
    if (methods.length) return new HttpError(405, 'Method not allowed.', { Allow: methods.join(', ') });
    return new HttpError(404, 'Not found.');
  }

  function unauthorized(): HttpError {
    return new HttpError(401, 'Missing or wrong API key.', { 'WWW-Authenticate': 'Bearer' });
  }

  function errorReply(error: unknown): Reply {
    if (error instanceof HttpError) return { status: error.status, body: { error: error.message }, headers: error.headers };
    if (error instanceof GraderInputError) return { status: 400, body: { error: error.message } };
    // Only a goal reaches here: a submission that will not build scores 0 instead.
    if (error instanceof SceneBuildError) return { status: 400, body: { error: `The goal scene could not be built: ${error.message}` } };
    process.stderr.write(`grader service error: ${error instanceof Error ? error.message : String(error)}\n`);
    return { status: 500, body: { error: 'Internal error.' } };
  }

  function send(res: ServerResponse, reply: Reply, extraHeaders: Record<string, string> = {}): void {
    if (res.headersSent) return;
    const text = JSON.stringify(reply.body);
    res.writeHead(reply.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
      ...(reply.headers ?? {}),
      ...extraHeaders,
    });
    res.end(text);
  }

  /** Answers 413 without reading the rest of the body, then drops the connection. */
  function tooLarge(req: IncomingMessage, res: ServerResponse): Reply {
    const reply: Reply = {
      status: 413,
      body: { error: `The request body is larger than ${maxBodyBytes} bytes.` },
    };
    req.pause();
    res.on('finish', () => setTimeout(() => req.destroy(), 50));
    send(res, reply, { Connection: 'close' });
    return reply;
  }

  function readBody(req: IncomingMessage): Promise<Buffer | null> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const onData = (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBodyBytes) {
          req.off('data', onData);
          resolve(null);
          return;
        }
        chunks.push(chunk);
      };
      req.on('data', onData);
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  async function answer(req: IncomingMessage, res: ServerResponse): Promise<Reply> {
    const method = req.method ?? 'GET';
    const path = (req.url ?? '/').split('?')[0];
    const route = routes[`${method} ${path}`];
    // Refuse unknown routes and bad keys before reading any body.
    if (!route || (route.auth && !keyMatches(req.headers.authorization, apiKey))) {
      const reply = await dispatch(method, path, req.headers.authorization, undefined);
      send(res, reply);
      return reply;
    }
    let body: unknown;
    if (route.body) {
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBodyBytes) return tooLarge(req, res);
      const raw = await readBody(req);
      if (raw === null) return tooLarge(req, res);
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        const reply: Reply = { status: 400, body: { error: 'The request body is not valid JSON.' } };
        send(res, reply);
        return reply;
      }
    }
    const reply = await dispatch(method, path, req.headers.authorization, body);
    send(res, reply);
    return reply;
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const started = Date.now();
    inFlight.add(res);
    res.on('close', () => inFlight.delete(res));
    answer(req, res)
      .catch((error) => {
        const reply = errorReply(error);
        send(res, reply);
        return reply;
      })
      .then((reply) => {
        const line: Record<string, unknown> = {
          time: new Date(started).toISOString(),
          method: req.method,
          route: (req.url ?? '/').split('?')[0].slice(0, 100),
          status: reply.status,
          ms: Date.now() - started,
        };
        if (reply.total !== undefined) line.total = reply.total;
        log(JSON.stringify(line));
      });
  }

  const server = createServer(handle);
  server.headersTimeout = 15_000;
  server.requestTimeout = timeoutMs + 30_000;

  return {
    server,
    handle,
    dispatch,
    stats,
    listen(port = DEFAULTS.port, host = DEFAULTS.host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve((server.address() as AddressInfo).port);
        });
      });
    },
    async warmUp() {
      await queued(() => grader.render('<!doctype html><title>warm-up</title><p>ready</p>'));
    },
    close() {
      closing ??= (async () => {
        const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
        server.closeIdleConnections();
        await queue.whenIdle();
        // Let answers already computed reach their callers.
        await Promise.all(
          [...inFlight].map((res) => new Promise<void>((resolve) => (res.writableFinished || res.destroyed ? resolve() : res.once('close', () => resolve())))),
        );
        await Promise.all([grader.close(), scenes ? scenes.close() : Promise.resolve()]);
        browserReady = false;
        sceneBrowserReady = false;
        server.closeAllConnections();
        await stopped;
      })();
      return closing;
    },
  };
}

// ---------------------------------------------------------------- environment

export class ConfigError extends Error {}

function envNumber(env: NodeJS.ProcessEnv, name: string, fallback: number, scale = 1): number {
  const text = env[name];
  const value = text === undefined || text === '' ? fallback : Number(text);
  if (!Number.isFinite(value) || value < 0) throw new ConfigError(`${name} must be a non-negative number, not "${text}".`);
  return Math.round(value * scale);
}

/** Reads settings from the environment (see service/README.md). Throws ConfigError if they are wrong. */
export function optionsFromEnv(env: NodeJS.ProcessEnv): ServiceOptions & { port: number; host: string } {
  const apiKey = env.GRADER_API_KEY ?? '';
  if (!apiKey) {
    throw new ConfigError(
      'GRADER_API_KEY is not set. Refusing to start: without it anyone on the internet could make this server ' +
        'render arbitrary pages. Set it to a long random secret (for example `openssl rand -hex 32`).',
    );
  }
  if (apiKey.length < MIN_KEY_LENGTH) {
    throw new ConfigError(`GRADER_API_KEY must be at least ${MIN_KEY_LENGTH} characters. Use a long random secret.`);
  }
  return {
    apiKey,
    port: envNumber(env, 'PORT', DEFAULTS.port),
    host: env.HOST || DEFAULTS.host,
    maxQueue: envNumber(env, 'GRADER_MAX_QUEUE', DEFAULTS.maxQueue),
    requestTimeoutMs: envNumber(env, 'GRADER_REQUEST_TIMEOUT_MS', DEFAULTS.requestTimeoutMs),
    maxBodyBytes: envNumber(env, 'GRADER_MAX_BODY_MB', DEFAULTS.maxBodyBytes / 1048576, 1048576),
    cacheEntries: envNumber(env, 'GRADER_GOAL_CACHE', DEFAULTS.cacheEntries),
    cacheBytes: envNumber(env, 'GRADER_GOAL_CACHE_MB', DEFAULTS.cacheBytes / 1048576, 1048576),
  };
}

/** Starts the service from environment variables and warms up the browser. */
export async function startFromEnv(env: NodeJS.ProcessEnv): Promise<{ service: Service; port: number }> {
  const { port: wanted, host, ...options } = optionsFromEnv(env);
  const service = createService(options);
  const port = await service.listen(wanted, host);
  void service.warmUp().catch((error) => {
    process.stderr.write(`Browser warm-up failed: ${error instanceof Error ? error.message : String(error)}\n`);
  });
  return { service, port };
}
