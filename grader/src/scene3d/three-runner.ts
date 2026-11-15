import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { SCENE_DETERMINISM, SCENE_LIMITS, SCENE_RENDER } from './config';
import { codeSize } from './source-size';
import { SceneBuildError, type SceneData, type SceneMesh, type SceneStructure } from './types';

/**
 * The Three.js front end: turns `function buildScene(THREE) { ... }` source
 * into a list of world-space triangles with colours. Nothing is drawn here
 * and no WebGL is used, so the result is the same on every machine.
 *
 * The code runs in a headless Chromium page of its own: JavaScript on,
 * offline, Chromium's process sandbox on, and every request refused except
 * the harness page and the three.js build, both answered from memory.
 */

const ORIGIN = 'http://scene.grader';
const HARNESS_URL = `${ORIGIN}/index.html`;

/**
 * A second lock on the door: even if a request slipped past the router,
 * the page itself may only load its own scripts and may not connect,
 * frame, start workers or submit forms anywhere.
 */
const CSP =
  "default-src 'none'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src 'none'; img-src 'none'; " +
  "worker-src 'none'; child-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";

const HARNESS_HTML =
  '<!doctype html><meta charset="utf-8"><title>scene</title>' +
  '<script type="module">import * as THREE from "./three.module.js"; window.__sceneThree = THREE;</script>';

let threeFiles: Map<string, string> | null = null;

/** The three.js build, read once from node_modules by the grader (never by the page). */
function loadThree(): Map<string, string> {
  if (threeFiles) return threeFiles;
  const require = createRequire(import.meta.url);
  const build = dirname(require.resolve('three')); // node_modules/three/build/three.cjs
  threeFiles = new Map([
    ['/three.module.js', readFileSync(join(build, 'three.module.js'), 'utf8')],
    ['/three.core.js', readFileSync(join(build, 'three.core.js'), 'utf8')],
  ]);
  return threeFiles;
}

/**
 * Runs inside the page, as a string (a build tool would rewrite a function).
 * Fixes randomness and time, runs the code, walks what it returns and sends
 * back the triangles. Everything the walk relies on is captured before the
 * submitted code runs, so the code cannot swap it out from under the walk.
 */
const RUN_SOURCE = String.raw`
(function (args) {
  var THREE = window.__sceneThree;
  if (!THREE) return { error: 'internal', message: 'three.js did not load.' };
  var Object3D = THREE.Object3D, Matrix4 = THREE.Matrix4, Color = THREE.Color;
  var getHex = Color.prototype.getHex;
  var updateMatrix = Object3D.prototype.updateMatrix;
  var isArray = Array.isArray;
  var F32 = Float32Array;

  // ---- fixed randomness and time ----
  var seed = args.seed | 0;
  function random() {
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  Math.random = random;
  var T = args.time;
  var RealDate = Date;
  var FixedDate = function () {
    if (!new.target) return new RealDate(T).toString();
    return arguments.length ? Reflect.construct(RealDate, Array.prototype.slice.call(arguments), new.target) : new RealDate(T);
  };
  FixedDate.prototype = RealDate.prototype;
  FixedDate.now = function () { return T; };
  FixedDate.UTC = RealDate.UTC;
  FixedDate.parse = RealDate.parse;
  window.Date = FixedDate;
  try { Object.defineProperty(performance, 'now', { value: function () { return 0; } }); } catch (e) {}
  try {
    Object.defineProperty(crypto, 'getRandomValues', { value: function (a) {
      for (var i = 0; i < a.length; i++) a[i] = Math.floor(random() * 4294967296);
      return a;
    } });
    Object.defineProperty(crypto, 'randomUUID', { value: function () { return '00000000-0000-4000-8000-000000000000'; } });
  } catch (e) {}
  window.alert = window.confirm = window.prompt = function () {};

  // ---- run the code ----
  var build, root;
  try {
    build = (new Function('THREE', args.source + '\n;return typeof buildScene === "function" ? buildScene : undefined;'))(THREE);
  } catch (e) {
    return { error: 'threw', message: String((e && e.message) || e).slice(0, 300) };
  }
  if (typeof build !== 'function') return { error: 'no-object', message: 'missing' };
  try {
    root = build(THREE);
  } catch (e) {
    return { error: 'threw', message: String((e && e.message) || e).slice(0, 300) };
  }
  if (!(root instanceof Object3D)) {
    var what;
    if (root === undefined) what = 'nothing';
    else if (root === null) what = 'null';
    else if (typeof root === 'object' && typeof root.then === 'function') what = 'promise';
    else if (isArray(root)) what = 'an array';
    else if (typeof root === 'number') what = 'a number';
    else if (typeof root === 'string') what = 'a string';
    else if (typeof root === 'boolean') what = 'true or false';
    else if (typeof root === 'function') what = 'a function';
    else what = 'a plain object';
    return { error: 'no-object', message: what };
  }

  // ---- walk it ----
  var out = [];
  var triangles = 0, meshes = 0, nodes = 0;
  // How the scene is organised (engineering: reuse and structure): distinct geometries and materials, names, groups.
  var geoSet = new Set(), matSet = new Set(), namedMeshes = 0, groupsN = 0, namedGroups = 0, backFaceTriangles = 0;
  var seen = new Set();
  var tooBig = null;
  var m4 = function () { return new Matrix4(); };

  function mul(a, b) { // column-major 4x4, a * b
    var r = new F32(16);
    for (var c = 0; c < 4; c++) for (var rr = 0; rr < 4; rr++) {
      r[c * 4 + rr] = a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
    }
    return r;
  }
  function colorOf(mat) {
    if (mat && mat.color && mat.color.isColor) {
      var h = getHex.call(mat.color);
      return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    }
    return null;
  }
  function opacityOf(mat) {
    if (!mat || !mat.transparent) return 1;
    var o = Number(mat.opacity);
    return isFinite(o) ? Math.max(0, Math.min(1, o)) : 1;
  }
  // Linear (working space) material colour, for multiplying with vertex or instance colours.
  function linearOf(mat) {
    if (mat && mat.color && mat.color.isColor) return [Number(mat.color.r) || 0, Number(mat.color.g) || 0, Number(mat.color.b) || 0];
    return null;
  }
  function toSrgb8(l) {
    l = l > 1 ? 1 : l > 0 ? l : 0;
    var v = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    return Math.round(v * 255);
  }
  function det3(e) {
    return e[0] * (e[5] * e[10] - e[9] * e[6]) - e[4] * (e[1] * e[10] - e[9] * e[2]) + e[8] * (e[1] * e[6] - e[5] * e[2]);
  }
  var partCounter = 0;
  function emit(node, world, mat, pos, index, start, end, partBase, label) {
    if (mat && mat.visible === false) return;
    // Writes depth but no colour: three.js draws nothing you can see.
    if (mat && mat.colorWrite === false) return;
    var count = end - start;
    if (count < 3) return;
    var nTri = Math.floor(count / 3);
    var inst = node.isInstancedMesh ? Math.max(0, Math.min(node.count | 0, (node.instanceMatrix.array.length / 16) | 0)) : 1;
    triangles += nTri * inst;
    // Drawn from the inside only (BackSide), whatever the transform: three.js corrects mirrored transforms itself.
    if (mat && mat.side === 1) backFaceTriangles += nTri * inst;
    if (triangles > args.maxTriangles) { tooBig = 'triangles'; return; }
    var g = node.geometry;
    var vcol = mat && mat.vertexColors && g.attributes && g.attributes.color && typeof g.attributes.color.getX === 'function' ? g.attributes.color : null;
    var icol = node.isInstancedMesh && node.instanceColor && node.instanceColor.array ? node.instanceColor.array : null;
    var lin = linearOf(mat) || [1, 1, 1];
    var side0 = mat && (mat.side === 1 || mat.side === 2) ? mat.side : 0;
    for (var n = 0; n < inst; n++) {
      var e = world;
      if (node.isInstancedMesh) e = mul(world, node.instanceMatrix.array.subarray(n * 16, n * 16 + 16));
      var data = new F32(nTri * 9);
      var cols = vcol || icol ? new Uint8Array(nTri * 3) : null;
      var k = 0;
      for (var t = 0; t < nTri; t++) {
        var cr = 0, cg = 0, cb = 0;
        for (var v = 0; v < 3; v++) {
          var i = start + t * 3 + v;
          var vi = index ? index.getX(i) : i;
          var x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
          var w = e[3] * x + e[7] * y + e[11] * z + e[15];
          if (!w) w = 1;
          data[k++] = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
          data[k++] = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
          data[k++] = (e[2] * x + e[6] * y + e[10] * z + e[14]) / w;
          if (vcol) { cr += vcol.getX(vi) / 3; cg += vcol.getY(vi) / 3; cb += vcol.getZ(vi) / 3; }
        }
        if (cols) {
          if (!vcol) { cr = 1; cg = 1; cb = 1; }
          if (icol) { cr *= icol[n * 3]; cg *= icol[n * 3 + 1]; cb *= icol[n * 3 + 2]; }
          cols[t * 3] = toSrgb8(cr * lin[0]);
          cols[t * 3 + 1] = toSrgb8(cg * lin[1]);
          cols[t * 3 + 2] = toSrgb8(cb * lin[2]);
        }
      }
      // A transform that mirrors the mesh swaps which side three.js treats as the front.
      var side = side0 === 2 ? 2 : det3(e) < 0 ? 1 - side0 : side0;
      out.push({
        name: label, part: partBase + n, color: colorOf(mat), opacity: opacityOf(mat), data: data, cols: cols,
        side: side, wireframe: !!(mat && mat.wireframe), unlit: !!(mat && mat.isMeshBasicMaterial),
      });
    }
  }
  // Returns how many meshes are at or under the node.
  function visit(node, parentWorld, depth, parentLabel) {
    if (tooBig) return 0;
    if (!(node instanceof Object3D)) return 0;
    if (seen.has(node)) { tooBig = 'cycle'; return 0; }
    seen.add(node);
    if (++nodes > args.maxNodes) { tooBig = 'nodes'; return 0; }
    if (depth > args.maxDepth) { tooBig = 'depth'; return 0; }
    if (node.visible === false) return 0;
    var under = 0;
    var ownName = typeof node.name === 'string' && node.name.trim() ? 1 : 0;
    if (node.matrixAutoUpdate !== false) updateMatrix.call(node);
    var local = node.matrix && node.matrix.elements && node.matrix.elements.length === 16 ? node.matrix.elements : m4().elements;
    var world = mul(parentWorld, local);
    var label = typeof node.name === 'string' && node.name.trim() ? node.name.slice(0, 100) : parentLabel;
    if (node.isMesh) {
      if (++meshes > args.maxMeshes) { tooBig = 'meshes'; return 0; }
      under = 1;
      namedMeshes += ownName;
      var g = node.geometry;
      if (g) geoSet.add(g);
      if (isArray(node.material)) { for (var mi = 0; mi < node.material.length; mi++) if (node.material[mi]) matSet.add(node.material[mi]); }
      else if (node.material) matSet.add(node.material);
      var pos = g && g.attributes && g.attributes.position;
      var partBase = partCounter;
      partCounter += node.isInstancedMesh ? Math.max(1, node.count | 0) : 1;
      if (pos && typeof pos.getX === 'function' && pos.count > 0) {
        var index = g.index && typeof g.index.getX === 'function' ? g.index : null;
        var total = index ? index.count : pos.count;
        var dr = g.drawRange || { start: 0, count: Infinity };
        var s0 = Math.max(0, dr.start | 0), s1 = Math.min(total, s0 + (isFinite(dr.count) ? dr.count : total));
        var material = node.material;
        if (isArray(material)) {
          var groups = isArray(g.groups) ? g.groups : [];
          for (var gi = 0; gi < groups.length && !tooBig; gi++) {
            var gr = groups[gi];
            var a = Math.max(s0, gr.start | 0), b = Math.min(s1, (gr.start | 0) + (isFinite(gr.count) ? gr.count : total));
            emit(node, world, material[gr.materialIndex | 0], pos, index, a, b, partBase, label);
          }
        } else {
          emit(node, world, material, pos, index, s0, s1, partBase, label);
        }
      }
    }
    var kids = node.children;
    if (isArray(kids)) for (var c = 0; c < kids.length && !tooBig; c++) under += visit(kids[c], world, depth + 1, label) || 0;
    // A group (not the returned object itself) holding two or more meshes: an assembly.
    if (!node.isMesh && depth > 0 && under >= 2) { groupsN++; namedGroups += ownName; }
    return under;
  }
  var identity = new F32([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  try {
    visit(root, identity, 0, '');
  } catch (e) {
    return { error: 'threw', message: 'Reading the scene failed: ' + String((e && e.message) || e).slice(0, 200) };
  }
  if (tooBig) return { error: 'too-big', message: tooBig };

  // ---- send it back, compactly ----
  function b64(f) {
    var bytes = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  var parts = [];
  for (var p = 0; p < out.length; p++) {
    var o = out[p];
    parts.push({
      name: o.name, part: o.part, color: o.color, opacity: o.opacity, data: b64(o.data), cols: o.cols ? b64(o.cols) : null,
      side: o.side, wireframe: o.wireframe, unlit: o.unlit,
    });
  }
  return {
    meshes: meshes, triangles: triangles, parts: parts,
    structure: { geometries: geoSet.size, materials: matSet.size, namedMeshes: namedMeshes, groups: groupsN, namedGroups: namedGroups, backFaceTriangles: backFaceTriangles },
  };
})
`;

interface RawPart {
  name: string;
  part: number;
  color: [number, number, number] | null;
  opacity: number;
  data: string;
  cols: string | null;
  side: 0 | 1 | 2;
  wireframe: boolean;
  unlit: boolean;
}

const SIDES = ['front', 'back', 'double'] as const;

function noObjectMessage(what: string): string {
  if (what === 'missing') return 'The code does not define a function called buildScene.';
  if (what === 'promise') {
    return 'buildScene did not return a 3D object: it returned a Promise. buildScene must not be async; build the scene and return it directly.';
  }
  return `buildScene did not return a 3D object (a THREE.Scene, Group or Mesh): it returned ${what}.`;
}

type RawResult =
  | { error: string; message: string }
  | { meshes: number; triangles: number; parts: RawPart[]; structure?: Omit<SceneStructure, 'meshes'> };

export interface ThreeRunnerOptions {
  /** Longest a run may take. */
  timeoutMs?: number;
  /** For tests only: keep the page open this long after the code returns, so anything it started in the background gets its chance to misbehave. */
  lingerMs?: number;
}

/** Rejects if the promise has not settled in time. Code running inside a page has no timeout of its own. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SceneBuildError(`${what} took longer than ${ms / 1000} seconds.`, 'timeout')), ms);
  });
  promise.catch(() => {});
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/** Lets a submission write `export function buildScene` as if it were a module. */
function stripExport(source: string): string {
  return source.replace(/^(\s*)export\s+(default\s+)?(?=function\s+buildScene\b)/m, '$1');
}

const LAUNCH_ARGS = ['--disable-gpu', '--disable-extensions', '--no-first-run', '--mute-audio'];

export class ThreeSceneRunner {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private readonly timeoutMs: number;
  private readonly lingerMs: number;

  constructor(options: ThreeRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? SCENE_LIMITS.runTimeoutMs;
    this.lingerMs = options.lingerMs ?? 0;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (!this.launching) {
      // Chromium's own process sandbox stays on: submissions are untrusted.
      const sandbox = process.env.GRADER_CHROMIUM_SANDBOX !== '0';
      this.launching = chromium
        .launch({ args: LAUNCH_ARGS, chromiumSandbox: sandbox })
        .then((b) => {
          this.browser = b;
          return b;
        })
        .finally(() => {
          this.launching = null;
        });
    }
    return this.launching;
  }

  /** Turns scene code into triangles. Throws SceneBuildError, with a reason a player can read, when it cannot. */
  async run(source: string): Promise<SceneData> {
    if (typeof source !== 'string') throw new SceneBuildError('The submission is not text.', 'source');
    const sourceBytes = Buffer.byteLength(source, 'utf8');
    if (sourceBytes > SCENE_LIMITS.maxSourceBytes) {
      throw new SceneBuildError(
        `The code is ${Math.round(sourceBytes / 1000)} KB; the limit is ${SCENE_LIMITS.maxSourceBytes / 1000} KB.`,
        'too-big',
      );
    }
    if (!/\bbuildScene\b/.test(source)) {
      throw new SceneBuildError('The code does not define a function called buildScene.', 'no-object');
    }
    const files = loadThree();
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      javaScriptEnabled: true,
      offline: true,
      acceptDownloads: false,
      serviceWorkers: 'block',
      locale: 'en-US',
      timezoneId: 'UTC',
      viewport: { width: 400, height: 300 },
    });
    try {
      const raw = await withTimeout(this.execute(context, files, stripExport(source)), this.timeoutMs, 'Building the scene');
      // The cap above is on the raw text; the engineering score compares the code without comments and spacing.
      return toScene(raw, codeSize(source));
    } catch (error) {
      if (error instanceof SceneBuildError) throw error;
      throw new SceneBuildError(`The scene could not be built: ${(error as Error)?.message ?? error}`, 'internal');
    } finally {
      // A page stuck in a loop can refuse to close. Do not wait on it forever:
      // drop the whole browser instead, and the next run starts a new one.
      try {
        await withTimeout(context.close(), 5000, 'Closing the page');
      } catch {
        if (this.browser === browser) this.browser = null;
        void browser.close().catch(() => {});
      }
    }
  }

  private async execute(context: BrowserContext, files: Map<string, string>, source: string): Promise<RawResult> {
    let harnessServed = false;
    await context.route('**/*', async (route) => {
      try {
        const request = route.request();
        const url = request.url();
        if (request.method() !== 'GET' || !url.startsWith(`${ORIGIN}/`)) return void (await route.abort());
        const path = url.slice(ORIGIN.length);
        const navigation = request.isNavigationRequest();
        if (path === '/index.html') {
          if (!navigation || harnessServed || request.frame().parentFrame() !== null) return void (await route.abort());
          harnessServed = true;
          await route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            headers: { 'Content-Security-Policy': CSP },
            body: HARNESS_HTML,
          });
          return;
        }
        const body = files.get(path);
        if (body === undefined || navigation || request.resourceType() !== 'script') return void (await route.abort());
        await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
      } catch {
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(this.timeoutMs);
    await page.goto(HARNESS_URL, { waitUntil: 'load' });
    const args = {
      seed: SCENE_DETERMINISM.randomSeed,
      time: SCENE_DETERMINISM.fixedTimeMs,
      source,
      maxTriangles: SCENE_LIMITS.maxTriangles,
      maxMeshes: SCENE_LIMITS.maxMeshes,
      maxNodes: SCENE_LIMITS.maxNodes,
      maxDepth: SCENE_LIMITS.maxDepth,
    };
    const raw = (await page.evaluate(`${RUN_SOURCE}(${JSON.stringify(args)})`)) as RawResult;
    if (this.lingerMs > 0) await new Promise((r) => setTimeout(r, this.lingerMs));
    return raw;
  }

  async close(): Promise<void> {
    const pending = this.launching;
    const browser = this.browser ?? (pending ? await pending.catch(() => null) : null);
    this.browser = null;
    if (browser) await withTimeout(browser.close(), 10_000, 'Closing the browser').catch(() => {});
  }
}

const TOO_BIG: Record<string, string> = {
  triangles: `The scene has more than ${SCENE_LIMITS.maxTriangles.toLocaleString('en-US')} triangles, the limit.`,
  meshes: `The scene has more than ${SCENE_LIMITS.maxMeshes.toLocaleString('en-US')} meshes, the limit.`,
  nodes: `The scene has more than ${SCENE_LIMITS.maxNodes.toLocaleString('en-US')} objects, the limit.`,
  depth: `Groups are nested more than ${SCENE_LIMITS.maxDepth} deep, the limit.`,
  cycle: 'An object in the scene contains itself, so the scene never ends.',
};

function toScene(raw: RawResult, sourceBytes: number): SceneData {
  if (!raw || typeof raw !== 'object') throw new SceneBuildError('The scene could not be read.', 'internal');
  if ('error' in raw) {
    switch (raw.error) {
      case 'threw':
        throw new SceneBuildError(`The code stopped with an error: ${raw.message}`, 'threw');
      case 'no-object':
        throw new SceneBuildError(noObjectMessage(raw.message), 'no-object');
      case 'too-big':
        throw new SceneBuildError(TOO_BIG[raw.message] ?? 'The scene is too big.', 'too-big');
      default:
        throw new SceneBuildError(`The scene could not be built: ${raw.message}`, 'internal');
    }
  }
  const meshes: SceneMesh[] = [];
  let triangles = 0;
  for (const part of raw.parts) {
    const bytes = Buffer.from(part.data, 'base64');
    const positions = new Float32Array(bytes.length / 4);
    new Uint8Array(positions.buffer).set(bytes);
    const cols = part.cols ? new Uint8Array(Buffer.from(part.cols, 'base64')) : null;
    // A corner at infinity or NaN cannot be drawn or measured: such triangles are dropped.
    const kept = dropBadTriangles(positions, cols);
    if (kept.positions.length === 0) continue;
    triangles += kept.positions.length / 9;
    meshes.push({
      name: part.name,
      color: part.color ?? [...SCENE_RENDER.defaultColor],
      // Next to invisible in three.js: treated as not there at all.
      opacity: part.opacity < SCENE_RENDER.minOpacity ? 0 : part.opacity,
      positions: kept.positions,
      part: part.part,
      side: SIDES[part.side] ?? 'front',
      wireframe: part.wireframe,
      unlit: part.unlit,
      ...(kept.cols ? { triColors: kept.cols } : {}),
    });
  }
  if (triangles === 0) {
    throw new SceneBuildError('buildScene returned a scene with no visible meshes in it.', 'no-meshes');
  }
  const structure: SceneStructure | undefined = raw.structure ? { meshes: raw.meshes, ...raw.structure } : undefined;
  return { meshes, meshCount: raw.meshes, triangleCount: triangles, sourceBytes, ...(structure ? { structure } : {}) };
}

function dropBadTriangles(p: Float32Array, cols: Uint8Array | null): { positions: Float32Array; cols: Uint8Array | null } {
  let bad = 0;
  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i]) || Math.abs(p[i]) > 1e7) bad++;
  if (bad === 0) return { positions: p, cols };
  const out: number[] = [];
  const outCols: number[] = [];
  for (let t = 0; t + 9 <= p.length; t += 9) {
    let ok = true;
    for (let k = 0; k < 9; k++) if (!Number.isFinite(p[t + k]) || Math.abs(p[t + k]) > 1e7) ok = false;
    if (!ok) continue;
    for (let k = 0; k < 9; k++) out.push(p[t + k]);
    if (cols) outCols.push(cols[(t / 9) * 3], cols[(t / 9) * 3 + 1], cols[(t / 9) * 3 + 2]);
  }
  return { positions: new Float32Array(out), cols: cols ? new Uint8Array(outCols) : null };
}
