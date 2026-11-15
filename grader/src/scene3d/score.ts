import { deltaE00, labOf, type Lab } from '../color';
import { ratioCredit, ratioSaving } from '../performance';
import type { PageSnapshot } from '../types';
import { round1, risingCredit } from '../util';
import { compareVisual } from '../visual';
import { applyPose, isIdentity, posePositions, searchPose, solidSamples, type Pose, type SolidSamples } from './align';
import {
  SCENE_ALIGN,
  SCENE_ENGINEERING,
  SCENE_FEEDBACK,
  SCENE_LOOKS,
  SCENE_MATCH,
  SCENE_PART_COLOR,
  SCENE_PARTS,
  SCENE_PLACEMENT,
  SCENE_RENDER,
  SCENE_SHAPE,
  SCENE_VERSION,
  SCENE_VIEWS,
  SCENE_WEIGHTS,
} from './config';
import { boundsOfLists, connectedPieces, diagonalOf, type Alignment } from './parts';
import { camerasFor, frameOf, renderScene, toPng, type Frame } from './raster';
import {
  cellCenter,
  denseGrid,
  distanceField,
  fillEnclosed,
  sampleTriangles,
  shellOf,
  softCredit,
  solidField,
  surfaceGrid,
  type Dense,
  type Field,
  type Vec3,
} from './solid';
import { cleanExcess, combineScene, sceneValues, type PartMeasure, type SceneCombination, type SceneMeasurements } from './model';
import { buildChecks, noteOf, type SceneCheck } from './checks';
import { boxOf, describe, matchParts, type Descriptor, type GoalPartRef, type MatchResult, type PartMatch } from './match';
import { sceneBounds, type Bounds, type RGB, type SceneData, type SceneMesh } from './types';

/**
 * Renders and scores triangle lists. Knows nothing of the language a scene
 * was written in: any front end that produces SceneData can be graded here.
 *
 * The submission is first lined up with the goal (align.ts: turn about the
 * up axis, mirror image, uniform scale, shift), because players only see
 * pictures of the goal and cannot know its exact size, position or facing.
 * Solids are compared, not surfaces (solid.ts). Then:
 *
 *   works        = parts credit x (0.4 + 0.6 x shape agreement)   (0 to 1)
 *   looks        = form (grey views: shading, outline, hard edges) x colour (per goal part) (0 to 1)
 *   engineering  = the worst of triangles, meshes and code size   (-1 to 1)
 *   placement    = 1 minus small charges for size, position, turn and mirror image
 *
 *   total = placement x 100 x (0.40 works + 0.25 looks + 0.35 engineering x works) + bonus
 */

export interface SceneView {
  name: string;
  png: Buffer;
  width: number;
  height: number;
  /** Raw RGBA pixels of the same picture. */
  pixels: Uint8Array;
}

export interface PreparedScene {
  triangleCount: number;
  meshCount: number;
  sourceBytes: number;
  /** Bounding box of every triangle, as built (before any lining up); null only for a scene with nothing in it. */
  bounds: Bounds | null;
  /** The four views, drawn from the cameras of `frame` (for a graded submission: after lining it up with the goal). */
  views: SceneView[];
  /** The sphere the cameras were placed from: the goal's, for a graded submission. */
  frame: Frame;
  /** The triangles as built. */
  scene: SceneData;
  /** For a graded submission: how it was lined up with the goal. */
  alignment?: Alignment & { turnDeg: number; mirror: boolean };
}

export interface EngineeringMeasure {
  value: number;
  reference: number;
  ratio: number;
  /** -100 to 100. */
  credit: number;
}

export interface SceneDetails {
  shape: {
    /** 0 to 100: soft agreement of both solids' outsides. Counts are skin voxels. */
    match: number;
    goalVoxels: number;
    candidateVoxels: number;
    missing: number;
    extra: number;
    voxelSize: number;
  } | null;
  parts: { goal: number; present: number; missing: number; extra: number; credit: number } | null;
  placement: {
    /** Submission size / goal size. */
    scaleRatio: number;
    /** Distance between where the two stand (base centres), as a share of the goal's longest side. */
    offset: number;
    /** How far the submission had to be turned about the up axis, degrees (0 to 180). */
    turnDeg: number;
    mirror: boolean;
    /** What the total before the bonus was multiplied by. */
    factor: number;
  } | null;
  /** Per view: score (form), structure (grey shading), color (the per-part colour agreement, the same for every view), outline and edge agreement; 0 to 100. */
  views: { name: string; score: number; structure: number; color: number; outline: number; edges: number }[];
  engineering: { triangles: EngineeringMeasure; meshes: EngineeringMeasure; sourceBytes: EngineeringMeasure } | null;
  /** Width (x), height (y) and depth (z) of each scene, as built. */
  size: { goal: [number, number, number]; candidate: [number, number, number] | null };
}

export interface SceneCriterion {
  id: string;
  name: string;
  group: 'works' | 'looks' | 'engineering';
  value: number | null;
  notes: string[];
  /** Points of the total this criterion cost: the sum of its checks. */
  points?: number;
}

export interface SceneGradeResult {
  version: string;
  /** The leaderboard score, one decimal. 0 to 100, or up to 100 + bonus for an exact match that beats the goal. */
  total: number;
  /** works and looks 0 to 100 (judged after lining up); engineering -100 to 100. */
  pillars: { works: number; engineering: number; looks: number };
  bonus: number;
  /** works and looks both exact, and size and position right: the condition for the bonus. */
  exactMatch: boolean;
  details: SceneDetails;
  /** What cost points, most costly first, in plain words. */
  feedback: string[];
  /** Every fact the total was combined from (model.ts); the fit tool reads it. */
  measurements?: SceneMeasurements;
  /** The named criteria, each 0 to 1 (null when the goal does not ask for it), with notes naming the parts. */
  criteria?: SceneCriterion[];
  /** At most eight lines, grouped by criterion, weakest first. */
  criteriaFeedback?: string[];
  /** The exact measurements: one entry per difference found, costliest first (at most 60); their points add up to 100 + bonus - total. */
  checks?: SceneCheck[];
  /** Set only when the submission could not be graded at all; the total is then 0. */
  error?: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Draws a scene's four views from the cameras of a frame (with `ids`, also which object each pixel shows). */
export function drawViews(scene: SceneData, frame: Frame, ids?: Int32Array[]): SceneView[] {
  return camerasFor(frame).map(({ name, camera }) => {
    const idBuf = ids ? new Int32Array(SCENE_RENDER.width * SCENE_RENDER.height) : undefined;
    const image = renderScene(scene, camera, undefined, idBuf);
    if (ids && idBuf) ids.push(idBuf);
    return { name, width: image.width, height: image.height, pixels: image.pixels, png: toPng(image) };
  });
}

/** Builds a prepared scene, drawn from its own frame. */
export function prepareScene(scene: SceneData): PreparedScene {
  const bounds = sceneBounds(scene);
  const frame = frameOf(bounds);
  return {
    triangleCount: scene.triangleCount,
    meshCount: scene.meshCount,
    sourceBytes: scene.sourceBytes,
    bounds,
    views: drawViews(scene, frame),
    frame,
    scene,
  };
}

const extentOf = (b: Bounds): [number, number, number] => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const visibleLists = (s: SceneData) => s.meshes.filter((m) => m.opacity > 0).map((m) => m.positions);

// ---------------------------------------------------------------- the goal, worked out once

interface GoalPart {
  name: string;
  weight: number;
  /** Its linear size before the cap on one part's share. */
  rawWeight: number;
  /** Cells of the goal's skin this part makes. */
  cells: Int32Array;
  center: Vec3;
  /** Width, height and depth of the part's outside cells. */
  extent: Vec3;
  flush: boolean;
  /** Pixels showing the part, over the four views: view x pixel count + pixel index. */
  pixels: Int32Array;
  ring: Int32Array;
  color: RGB | null;
  ringColor: RGB | null;
  /** For matching pieces to it. */
  desc: Descriptor;
  /** Parts it touches, and where. */
  touch: { j: number; at: Vec3 }[];
  /** Cells around it where the goal has no material: judging it in place, material there counts against it. */
  around: Int32Array;
  /** Cells inside the goal's solid within the part's box (a sample): judged in place, the submission must be solid there too. */
  inner: Int32Array;
  /** Soft edge for judging it in place (voxels): no wider than its own thickness. */
  zeroHere: number;
  /** Its material's colour (area-weighted). */
  meshColor: RGB | null;
  /** Whether its name is shared with another part (then it is named with where it is). */
  sharedName: boolean;
}

interface GoalModel {
  grid: Dense;
  field: Field;
  samples: SolidSamples;
  shellCells: Int32Array;
  /** Distance (voxels) at which credit reaches 0. */
  zero: number;
  parts: GoalPart[];
  refs: GoalPartRef[];
  /** The goal's views drawn in one grey, and their hard edges. */
  greyViews: SceneView[];
  greyEdges: EdgeSet[];
  /** Its own faults (what a submission is compared against): shares of triangles. */
  clean: CleanFacts;
}

const goalModels = new WeakMap<PreparedScene, GoalModel>();

const PIX = SCENE_RENDER.width * SCENE_RENDER.height;

/** Mean colour of some pixels of the views, optionally all moved by (dx, dy) pixels (kept inside the picture). */
function meanColor(views: SceneView[], pixels: Int32Array, dx = 0, dy = 0): RGB | null {
  if (pixels.length === 0) return null;
  let r = 0, g = 0, b = 0;
  const W = SCENE_RENDER.width, H = SCENE_RENDER.height;
  for (const code of pixels) {
    const v = Math.floor(code / PIX);
    let j = code - v * PIX;
    if (dx || dy) {
      const x = Math.min(W - 1, Math.max(0, (j % W) + dx));
      const y = Math.min(H - 1, Math.max(0, Math.floor(j / W) + dy));
      j = y * W + x;
    }
    const i = j * 4;
    const px = views[v].pixels;
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
  }
  const n = pixels.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

const dE = (a: RGB, b: RGB) => deltaE00(labOf(a) as Lab, labOf(b) as Lab);

function goalModel(goal: PreparedScene): GoalModel {
  const cached = goalModels.get(goal);
  if (cached) return cached;
  const bounds = goal.bounds!;
  // A wider margin than the submission's own grid, so a part moved or grown past the goal's box is still seen (same voxel size).
  const grid = denseGrid(bounds, SCENE_SHAPE.goalResolution, SCENE_SHAPE.goalPadding);
  const field = solidField(visibleLists(goal.scene), grid);
  const samples = solidSamples([], bounds, 0, field);
  const shell: number[] = [];
  for (let i = 0; i < field.shell.length; i++) if (field.shell[i]) shell.push(i);
  const zero = Math.max(SCENE_SHAPE.softFullVoxels + 1, (SCENE_SHAPE.softZeroShare * Math.max(...extentOf(bounds))) / grid.size);

  // Parts: the goal's own objects.
  const groups = new Map<number, { name: string; lists: Float32Array[]; meshes: SceneMesh[] }>();
  goal.scene.meshes.forEach((m, i) => {
    if (m.opacity <= 0) return;
    const id = m.part ?? i;
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { name: m.name ?? '', lists: [], meshes: [] }));
    g.lists.push(m.positions);
    g.meshes.push(m);
  });
  const N = field.shell.length;
  const count = new Uint16Array(N);
  const raw: { id: number; name: string; weight: number; surface: Int32Array; cells: Int32Array; lists: Float32Array[]; meshes: SceneMesh[] }[] = [];
  for (const [id, g] of groups) {
    const surf = surfaceGrid(g.lists, grid);
    const surface: number[] = [];
    const cells: number[] = [];
    for (let i = 0; i < N; i++) {
      if (!surf[i]) continue;
      surface.push(i);
      if (count[i] < 65535) count[i]++;
      // Part of the outside, give or take a voxel: what anyone can see.
      if (field.dist[i] <= SCENE_SHAPE.softFullVoxels) cells.push(i);
    }
    const b = boundsOfLists(g.lists);
    raw.push({ id, name: g.name, weight: b ? diagonalOf(b) : 0, surface: Int32Array.from(surface), cells: Int32Array.from(cells), lists: g.lists, meshes: g.meshes });
  }

  // Which object each pixel of the goal's views shows.
  const ids: Int32Array[] = [];
  drawViews(goal.scene, goal.frame, ids);
  const pixelsOf = new Map<number, number[]>();
  ids.forEach((buf, v) => {
    for (let i = 0; i < buf.length; i++) {
      const id = buf[i];
      if (id < 0) continue;
      let list = pixelsOf.get(id);
      if (!list) pixelsOf.set(id, (list = []));
      list.push(v * PIX + i);
    }
  });

  const [, ny, nz] = grid.dims;
  const own = new Uint8Array(N);
  const parts: GoalPart[] = [];
  const surfaces: Int32Array[] = [];
  for (const p of raw) {
    if (p.cells.length === 0 || p.weight <= 0) continue; // hidden inside the model: nobody can see it
    for (const c of p.surface) own[c] = 1;
    let flushCells = 0;
    for (const c of p.cells) {
      const z = c % nz, y = ((c - z) / nz) % ny, x = (c - z - y * nz) / (ny * nz);
      let near = false;
      for (let dx = -1; dx <= 1 && !near; dx++) {
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dz = -1; dz <= 1 && !near; dz++) {
            const xx = x + dx, yy = y + dy, zz = z + dz;
            if (xx < 0 || yy < 0 || zz < 0 || xx >= grid.dims[0] || yy >= ny || zz >= nz) continue;
            const u = (xx * ny + yy) * nz + zz;
            if (count[u] - own[u] >= 1) near = true;
          }
        }
      }
      if (near) flushCells++;
    }
    for (const c of p.surface) own[c] = 0;
    const flush = flushCells / p.cells.length >= SCENE_PARTS.flush;
    const pixels = Int32Array.from(pixelsOf.get(p.id) ?? []);
    let ring = new Int32Array(0);
    if (flush && pixels.length) {
      const set = new Set<number>();
      const R = SCENE_PART_COLOR.ringPx;
      const W = SCENE_RENDER.width, H = SCENE_RENDER.height;
      for (const code of pixels) {
        const v = Math.floor(code / PIX);
        const i = code - v * PIX;
        const x = i % W, y = (i - x) / W;
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const id = ids[v][yy * W + xx];
            if (id >= 0 && id !== p.id) set.add(v * PIX + yy * W + xx);
          }
        }
      }
      ring = Int32Array.from([...set].sort((a, b) => a - b));
    }
    let cx = 0, cy = 0, cz = 0;
    const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const c of p.cells) {
      const q = cellCenter(grid, c);
      cx += q[0];
      cy += q[1];
      cz += q[2];
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], q[k]);
        hi[k] = Math.max(hi[k], q[k]);
      }
    }
    const n = p.cells.length;
    const desc = describe(p.lists, meshColorOf(p.meshes))!;
    // Its thickness, in voxels: the soft edge for judging it in place is no wider.
    const thick = Math.max(1, desc.pext[2] / grid.size);
    surfaces.push(p.surface);
    parts.push({
      desc,
      touch: [],
      around: aroundCells(grid, field, desc, thick),
      inner: innerCells(grid, field, desc),
      zeroHere: Math.min(zero, SCENE_SHAPE.softFullVoxels + Math.min(thick, 1)),
      meshColor: desc.color,
      sharedName: false,
      name: p.name,
      weight: p.weight,
      rawWeight: p.weight,
      cells: p.cells,
      center: [cx / n, cy / n, cz / n],
      extent: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
      flush,
      pixels,
      ring,
      color: meanColor(goal.views, pixels),
      ringColor: meanColor(goal.views, ring),
    });
  }
  // No part counts for more than a quarter of the whole.
  const capped = cappedWeights(parts.map((p) => p.weight));
  parts.forEach((p, i) => (p.weight = capped[i]));
  touchingParts(grid, surfaces).forEach((list, i) => (parts[i].touch = list));
  const names = parts.map((p) => tidyName(p.name));
  parts.forEach((p, i) => (p.sharedName = !!names[i] && names.filter((n) => n === names[i]).length > 1));
  const refs: GoalPartRef[] = parts.map((p) => ({ desc: p.desc, weight: p.weight, touch: p.touch }));
  const greyViews = drawViews(greyOf(goal.scene), goal.frame);
  const model: GoalModel = { grid, field, samples, shellCells: Int32Array.from(shell), zero, parts, refs, greyViews, greyEdges: greyViews.map(edgeSet), clean: { ...cleanFacts(goal.scene), buried: goalBuried(goal.scene, grid, field.shell) } };
  goalModels.set(goal, model);
  return model;
}

/** Weights with none over `maxShare` of the total (the cap is applied until it holds). */
function cappedWeights(raw: number[]): number[] {
  const n = raw.length;
  if (n === 0) return [];
  const share = Math.max(SCENE_PARTS.maxShare, 1 / n);
  let w = raw.slice();
  for (let it = 0; it < 400; it++) {
    const cap = share * w.reduce((s, x) => s + x, 0);
    const next = raw.map((x) => Math.min(x, cap));
    const done = next.every((x, i) => Math.abs(x - w[i]) <= 1e-12 * (1 + x));
    w = next;
    if (done) break;
  }
  return w;
}

/** Which parts touch (surface cells within two voxels), and where: the mean of the first part's cells near the second. */
function touchingParts(grid: Dense, surfaces: Int32Array[]): { j: number; at: Vec3 }[][] {
  const out: { j: number; at: Vec3 }[][] = surfaces.map(() => []);
  if (surfaces.length > 80) return out;
  const [nx, ny, nz] = grid.dims;
  const N = nx * ny * nz;
  const R = 2;
  surfaces.forEach((cells, j) => {
    const mask = new Uint8Array(N);
    for (const c of cells) {
      const z = c % nz, y = ((c - z) / nz) % ny, x = (c - z - y * nz) / (ny * nz);
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= nx) continue;
        for (let dy = -R; dy <= R; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= ny) continue;
          for (let dz = -R; dz <= R; dz++) {
            const zz = z + dz;
            if (zz >= 0 && zz < nz) mask[(xx * ny + yy) * nz + zz] = 1;
          }
        }
      }
    }
    surfaces.forEach((other, i) => {
      if (i === j) return;
      const s: Vec3 = [0, 0, 0];
      let n = 0;
      for (const c of other) {
        if (!mask[c]) continue;
        const q = cellCenter(grid, c);
        s[0] += q[0];
        s[1] += q[1];
        s[2] += q[2];
        n++;
      }
      if (n) out[i].push({ j, at: [s[0] / n, s[1] / n, s[2] / n] });
    });
  });
  out.forEach((l) => l.sort((a, b) => a.j - b.j));
  return out;
}

/** Cells in a part's box, grown by a few voxels, where the goal has no material and no skin nearby. */
function aroundCells(grid: Dense, field: Field, desc: Descriptor, thick: number): Int32Array {
  const [nx, ny, nz] = grid.dims;
  const r = Math.max(5, Math.min(thick + 3, 8));
  const lo = [0, 1, 2].map((k) => Math.max(0, Math.floor((desc.lo[k] - grid.origin[k]) / grid.size - r)));
  const hi = [0, 1, 2].map((k, i) => Math.min(grid.dims[i] - 1, Math.floor((desc.hi[k] - grid.origin[k]) / grid.size + r)));
  const out: number[] = [];
  const near = SCENE_SHAPE.softFullVoxels + 0.5;
  for (let x = lo[0]; x <= hi[0]; x++) {
    for (let y = lo[1]; y <= hi[1]; y++) {
      for (let z = lo[2]; z <= hi[2]; z++) {
        const c = (x * ny + y) * nz + z;
        if (!field.occ[c] && field.dist[c] > near) out.push(c);
      }
    }
  }
  void nx;
  return Int32Array.from(out);
}

/** Cells deep inside the goal's solid within a part's box (every k-th, at most a few thousand). */
function innerCells(grid: Dense, field: Field, desc: Descriptor): Int32Array {
  const [, ny, nz] = grid.dims;
  const lo = [0, 1, 2].map((k) => Math.max(0, Math.ceil((desc.lo[k] - grid.origin[k]) / grid.size)));
  const hi = [0, 1, 2].map((k) => Math.min(grid.dims[k] - 1, Math.floor((desc.hi[k] - grid.origin[k]) / grid.size)));
  const all: number[] = [];
  const deep = SCENE_SHAPE.softFullVoxels + 0.5;
  for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
    const c = (x * ny + y) * nz + z;
    if (field.occ[c] && field.dist[c] > deep) all.push(c);
  }
  const step = Math.max(1, Math.ceil(all.length / 4000));
  return Int32Array.from(all.filter((_, i) => i % step === 0));
}

/** Area-weighted colour of some meshes (their vertex colours when they have them). */
function meshColorOf(meshes: SceneMesh[]): RGB | null {
  let r = 0, g = 0, b = 0, w = 0;
  for (const m of meshes) {
    const p = m.positions;
    for (let t = 0, k = 0; t + 9 <= p.length; t += 9, k++) {
      const a = triangleArea(p, t);
      if (!(a > 0)) continue;
      const tc = m.triColors;
      const c = tc && tc.length >= 3 * k + 3 ? [tc[3 * k], tc[3 * k + 1], tc[3 * k + 2]] : m.color;
      r += a * c[0];
      g += a * c[1];
      b += a * c[2];
      w += a;
    }
  }
  if (w > 0) return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
  return meshes[0]?.color ?? null;
}

function snapshot(view: SceneView): PageSnapshot {
  return {
    width: view.width,
    height: view.height,
    pageBackground: [...SCENE_RENDER.background],
    blocks: [],
    pixels: view.pixels,
    png: view.png,
  };
}

function measure(value: number, reference: number, slack: number): EngineeringMeasure & { raw: number; rawRatio: number } {
  const ratio = (value + slack) / (reference + slack);
  const credit = ratioCredit(ratio);
  return { value, reference, ratio: r2(ratio), credit: round1(credit * 100), raw: credit, rawRatio: ratio };
}

/** Rises from 0 at `free` to 1 at `full`, in a straight line. */
const ramp = (value: number, free: number, full: number) => Math.min(1, Math.max(0, (value - free) / (full - free)));

/** A zero result for a submission that could not be graded. */
export function failedResult(goal: PreparedScene, reason: string): SceneGradeResult {
  return {
    version: SCENE_VERSION,
    total: 0,
    pillars: { works: 0, engineering: 0, looks: 0 },
    bonus: 0,
    exactMatch: false,
    details: {
      shape: null,
      parts: null,
      placement: null,
      views: [],
      engineering: null,
      size: { goal: goal.bounds ? extentOf(goal.bounds) : [0, 0, 0], candidate: null },
    },
    feedback: [reason],
    measurements: {
      version: 1,
      failed: true,
      parts: [],
      extras: [],
      shapeMatch: 0,
      whole: { scaleRatio: 1, offset: 0, turnDeg: 0, mirror: false },
      viewParts: [],
      wire: 0,
      counts: { triangles: [0, goal.triangleCount], meshes: [0, goal.meshCount], sourceBytes: [0, goal.sourceBytes] },
      reuse: null,
      clean: { duplicate: [0, 0], degenerate: [0, 0], flipped: [0, 0], buried: [0, 0] },
      structure: null,
    },
    criteria: [],
    criteriaFeedback: [reason],
    checks: [{ criterion: 'parts', component: 'the model', what: 'missing', measured: 'could not be built', zone: 'off', points: 100, text: `The model could not be built or graded (${reason}): 100.00 points lost.` }],
    error: reason,
  };
}

/** Where a model stands: the centre of the bottom of its box. */
const baseOf = (b: Bounds): Vec3 => [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2];

/** Lines the submission up: on the whole scene, or without one piece that stretches its box, whichever fits clearly better. */
function lineUp(goal: GoalModel, pieces: Float32Array[], candBox: Bounds, goalParts: number): { pose: Pose; coreBox: Bounds; leftOut: number; alternatives: Pose[] } {
  const res = SCENE_ALIGN.candidateResolution;
  const all = searchPose(goal.samples, solidSamples(pieces, candBox, res));
  const alts = (r: { pose: Pose; alternatives?: { pose: Pose }[] }) => (r.alternatives?.length ? r.alternatives.map((a) => a.pose) : [r.pose]);
  let best = { pose: all.pose, coreBox: candBox, leftOut: -1, value: all.score, alternatives: alts(all) };
  if (all.score < SCENE_ALIGN.tryBelow && pieces.length >= 2 && pieces.length <= SCENE_ALIGN.maxPieces) {
    const diag = diagonalOf(candBox);
    const charge = (goalParts / (goalParts + 1)) ** 2;
    for (let i = 0; i < pieces.length; i++) {
      const rest = pieces.filter((_, j) => j !== i);
      const box = boundsOfLists(rest);
      if (!box || diagonalOf(box) > diag * (1 - SCENE_ALIGN.minShrink)) continue;
      const r = searchPose(goal.samples, solidSamples(rest, box, res));
      const value = r.score * charge;
      if (value > best.value + 1e-9) best = { pose: r.pose, coreBox: box, leftOut: i, value, alternatives: alts(r) };
    }
  }
  return best;
}

interface PieceInfo {
  cells: Int32Array;
  outside: number;
  /** 0 to 1: how much this piece is a lump the goal does not have. */
  extra: number;
  center: Vec3;
  bounds: Bounds;
}

/** A piece of the submission as a person would see it: one object, or one connected lump of a merged object. */
interface PieceSrc {
  lists: Float32Array[];
  color: RGB | null;
}

/** The submission's pieces: its objects, or (when it has fewer objects than the goal has parts) their connected lumps. */
function piecesOf(scene: SceneData, goalParts: number, diag: number): PieceSrc[] {
  const groups = new Map<string, SceneMesh[]>();
  scene.meshes.forEach((m, i) => {
    if (m.opacity <= 0) return;
    const key = m.part !== undefined ? `p${m.part}` : `i${i}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(m);
  });
  const objects = [...groups.values()];
  const split = objects.length < SCENE_MATCH.splitBelow * goalParts;
  const out: PieceSrc[] = [];
  for (const ms of objects) {
    const color = meshColorOf(ms);
    if (!split) {
      out.push({ lists: ms.map((m) => m.positions), color });
      continue;
    }
    const lumps = connectedPieces({ meshes: ms, meshCount: ms.length, triangleCount: 0, sourceBytes: 0 }, diag, SCENE_PARTS.maxPieces);
    const ranked = lumps
      .map((l) => ({ l, d: diagonalOf(boundsOfLists([l]) ?? { min: [0, 0, 0], max: [0, 0, 0] }) }))
      .sort((a, b) => b.d - a.d)
      .slice(0, SCENE_MATCH.maxLumps);
    for (const r of ranked) out.push({ lists: [r.l], color });
  }
  return out.slice(0, SCENE_MATCH.maxPieces);
}

interface PosedMatch {
  match: MatchResult;
  posed: Float32Array[][];
}

/** Matches the submission's pieces, lined up by a pose, to the goal's parts. */
function matchAt(gm: GoalModel, pieces: PieceSrc[], pose: Pose, longest: number): PosedMatch {
  const posed = pieces.map((pc) => pc.lists.map((l) => (isIdentity(pose) ? l : posePositions(l, pose))));
  const boxes = posed.map((l) => boxOf(l));
  const fullShare = (SCENE_SHAPE.softFullVoxels * gm.grid.size) / longest;
  const match = matchParts(gm.refs, boxes, (ks) => describe(ks.flatMap((k) => posed[k]), pieces[ks[0]].color), longest, fullShare, 2 * gm.grid.size);
  return { match, posed };
}

/** Shape and parts of the submission at one pose. */
interface Evaluation {
  pose: Pose;
  coreBox: Bounds;
  views: SceneView[];
  /** Which object each pixel of `views` shows. */
  viewIds: Int32Array[];
  /** Share of triangles in pieces wholly inside the solid (none of them on its outside). */
  buried: number;
  pieces: PieceInfo[];
  match: number;
  shapeCredit: number;
  /** Each part judged in place from the solids (material where it is, little where it is not). */
  inPlaceShape: number[];
  presence: number[];
  /** Whether a piece was matched to each part. */
  matched: boolean[];
  partMatch: MatchResult;
  partsCredit: number;
  works: number;
  missingCells: number[];
  extraCells: number[];
  cVoxels: number;
}

function evaluate(gm: GoalModel, goal: PreparedScene, candidateScene: SceneData, rawPieces: Float32Array[], pose: Pose, coreBox: Bounds, pm: PosedMatch): Evaluation {
  const grid = gm.grid;
  const full = SCENE_SHAPE.softFullVoxels;
  const credit = (d: number) => softCredit(d, full, gm.zero);
  const aligned = applyPose(candidateScene, pose);
  const viewIds: Int32Array[] = [];
  const views = drawViews(aligned, goal.frame, viewIds);

  // ---- the submission's solid on the goal's grid, piece by piece ----
  const budget = { left: SCENE_SHAPE.maxSamplesPerScene };
  const placed = rawPieces.map((raw) => {
    const p = isIdentity(pose) ? raw : posePositions(raw, pose);
    const cells = new Set<number>();
    const out = new Set<number>();
    sampleTriangles(p, grid, budget, (c) => cells.add(c), (k) => out.add(k));
    const b = boundsOfLists([p])!;
    return { cells: Int32Array.from(cells), outside: out.size, bounds: b, tris: Math.floor(raw.length / 9) };
  });
  const N = gm.field.shell.length;
  const occ = new Uint8Array(N);
  for (const pc of placed) for (const c of pc.cells) occ[c] = 1;
  fillEnclosed(occ, grid);
  const cShell = shellOf(occ, grid);
  const buried = buriedShare(placed, cShell);
  const cDist = distanceField(cShell, grid);

  // A matched piece's material belongs to its part (it is not extra), with the part's credit.
  const claimCredit = new Float32Array(N);
  const claimed = new Uint8Array(N);
  const goalBoost = new Float32Array(N);
  const budget2 = { left: SCENE_SHAPE.maxSamplesPerScene };
  // A piece that is its part's size (not a merged lump that also covers other parts) speaks only for its own part.
  const ownOnly = new Uint8Array(N);
  pm.match.parts.forEach((m, i) => {
    if (m.piece < 0) return;
    // A piece much bigger than its part (a merged hat matched to its crown) also shows the parts it covers.
    const solo = !!m.judgement && Math.max(...m.judgement.size.ratios) <= SCENE_MATCH.soloSize;
    for (const l of m.group.flatMap((k) => pm.posed[k])) {
      sampleTriangles(l, grid, budget2, (c) => {
        claimed[c] = 1;
        if (solo) ownOnly[c] = 1;
        if (claimCredit[c] < m.credit) claimCredit[c] = m.credit;
      });
    }
    for (const c of gm.parts[i].cells) goalBoost[c] = Math.max(goalBoost[c], m.credit);
  });


  // ---- each part judged in place: material where it is (soft edge no wider than the part),
  // and not much where the goal has none around it (a solid block does not make every shelf) ----
  // Judged against the skin that no matched piece of the right size accounts for: a book left out is
  // not "there" because its neighbours and the shelf are.
  const freeSkin = new Uint8Array(N);
  let anyOwn = false;
  for (let c = 0; c < N; c++) {
    if (!cShell[c]) continue;
    if (ownOnly[c]) anyOwn = true;
    else freeSkin[c] = 1;
  }
  const fDist = anyOwn ? distanceField(freeSkin, grid) : cDist;
  const inPlaceShape = gm.parts.map((part) => {
    let cover = 0;
    for (const c of part.cells) cover += softCredit(fDist[c], full, part.zeroHere);
    cover /= Math.max(1, part.cells.length);
    let filled = 0;
    for (const c of part.around) if (occ[c]) filled++;
    // Measured against the part's own size: a slab over thin tubes is many times their material.
    const excess = filled / Math.max(1, part.cells.length);
    // ...and solid where the goal's part is solid (crossed cut-outs enclose nothing).
    let solid = 1;
    if (part.inner.length >= 8) {
      let inside = 0;
      for (const c of part.inner) if (occ[c]) inside++;
      solid = ramp(inside / part.inner.length, SCENE_MATCH.solidFrom, SCENE_MATCH.solidFull);
    }
    // Covered all but a voxel's worth counts as covered.
    return Math.min(1, cover / 0.97) * (1 - ramp(excess, SCENE_MATCH.excessFrom, SCENE_MATCH.excessFull)) * solid;
  });
  const inPlace = gm.parts.map((part, i) => (part.flush ? inPlaceShape[i] * colorTest(part, views) : inPlaceShape[i]));

  // ---- parts: the matched piece's credit, or the part judged in place when that is better ----
  const matched = pm.match.parts.map((m) => m.piece >= 0);
  // A part with a piece is judged by its piece; one without, in place.
  const presence = gm.parts.map((_, i) => (matched[i] ? pm.match.parts[i].credit : inPlace[i]));

  // ---- extra lumps: material far from the goal that no matched part claims ----
  const farAt = (full + gm.zero) / 2;
  const pieces: PieceInfo[] = placed.map((pc) => {
    let far = pc.outside;
    let near = 0;
    // Material inside the goal's solid is where the goal has material, even if no one can see it.
    for (const c of pc.cells) {
      if (!gm.field.occ[c] && gm.field.dist[c] > farAt && !claimed[c]) far++;
      else near++;
    }
    const total = far + near;
    const share = total ? far / total : 0;
    const extra = far >= SCENE_PARTS.extraMinVoxels ? ramp(share, SCENE_PARTS.extraFrom, SCENE_PARTS.extraFull) : 0;
    const b = pc.bounds;
    return { cells: pc.cells, outside: pc.outside, extra, center: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], bounds: b };
  });
  const owner = new Int32Array(N).fill(-1);
  pieces.forEach((pc, k) => {
    for (const c of pc.cells) {
      // Where pieces overlap, the one that belongs claims the cell.
      if (owner[c] < 0 || pieces[owner[c]].extra > pc.extra) owner[c] = k;
    }
  });

  // ---- shape: soft agreement of both outsides; a matched part earns its credit where it is ----
  let sumG = 0;
  const missingCells: number[] = [];
  for (const c of gm.shellCells) {
    const f = Math.max(credit(cDist[c]), goalBoost[c]);
    sumG += f;
    if (f < 0.5) missingCells.push(c);
  }
  let sumC = 0, weightC = 0, cVoxels = 0;
  const extraCells: number[] = [];
  for (let c = 0; c < N; c++) {
    if (!cShell[c]) continue;
    cVoxels++;
    const w = owner[c] >= 0 ? 1 - pieces[owner[c]].extra : 1;
    const f = Math.max(credit(gm.field.dist[c]), claimCredit[c]);
    sumC += w * f;
    weightC += w;
    if (f < 0.5 && w > 0.5) extraCells.push(c);
  }
  for (const pc of pieces) weightC += (1 - pc.extra) * pc.outside;
  const nG = gm.shellCells.length;
  const match = nG + weightC > 0 ? (sumG + sumC) / (nG + weightC) : 1;
  const shapeCredit = risingCredit(match, 1, SCENE_SHAPE.zeroAtMatch);

  // ---- parts credit: the weighted mean of the parts' credits, squared ----
  const totalWeight = gm.parts.reduce((s, p) => s + p.weight, 0);
  const meanWeight = gm.parts.length ? totalWeight / gm.parts.length : 0;
  // An extra lump weighs like a part of its size, at most one average part, however large its surface.
  const extraWeight = pieces.reduce((s, p) => s + p.extra * Math.min(meanWeight, diagonalOf(p.bounds)), 0);
  const presentWeight = gm.parts.reduce((s, p, i) => s + p.weight * presence[i], 0);
  const share = totalWeight > 0 ? presentWeight / (totalWeight + extraWeight) : 1;
  const partsCredit = share * share;
  const works = partsCredit * (SCENE_PARTS.worksFloor + (1 - SCENE_PARTS.worksFloor) * shapeCredit);
  return {
    pose, coreBox, views, viewIds, buried, pieces, match, shapeCredit, inPlaceShape, presence, matched, partMatch: pm.match, partsCredit, works,
    missingCells, extraCells, cVoxels,
  };
}

/**
 * Where the matched parts say the model is: its size from the parts' sizes and
 * its place from theirs (weighted medians, so one odd part does not move it).
 * null when they agree with the pose.
 */
function poseFromParts(gm: GoalModel, pm: PosedMatch, pose: Pose, goalBox: Bounds): Pose | null {
  const longest = Math.max(...extentOf(goalBox), 1e-9);
  const pairs: { m: PartMatch; w: number; i: number }[] = [];
  pm.match.parts.forEach((m, i) => {
    if (m.piece >= 0 && m.judgement && m.credit >= SCENE_MATCH.voteAt) pairs.push({ m, w: gm.parts[i].weight * m.credit, i });
  });
  // Only when most of the model speaks: a few odd parts are not a reason to resize all of it.
  const total = gm.parts.reduce((a, p) => a + p.weight, 0);
  if (pairs.length < 3 || pairs.reduce((a, x) => a + gm.parts[x.i].weight, 0) < 0.5 * total) return null;
  const median = (list: { v: number; w: number }[]) => {
    const sorted = [...list].sort((a, b) => a.v - b.v);
    const half = sorted.reduce((s, x) => s + x.w, 0) / 2;
    let acc = 0;
    for (const x of sorted) {
      acc += x.w;
      if (acc >= half) return x.v;
    }
    return 0;
  };
  const logS = median(pairs.map(({ m, w }) => {
    const r = m.judgement!.size.ratios;
    // A part's size is read along its main sides (a thin disc says nothing about its thickness).
    const axes = [0, 1];
    return { v: -axes.reduce((s, a) => s + Math.log(r[a]), 0) / axes.length, w };
  }));
  const s = Math.abs(logS) > Math.log(SCENE_MATCH.rescaleAbove) ? Math.exp(logS) : 1;
  const o: Vec3 = [0, 1, 2].map((k) => (goalBox.min[k] + goalBox.max[k]) / 2) as Vec3;
  const t = [0, 1, 2].map((k) =>
    median(pairs.map(({ m, w, i }) => {
      const cg = gm.parts[i].desc.center[k];
      const cp = cg + m.judgement!.delta[k];
      return { v: cg - (s * (cp - o[k]) + o[k]), w };
    })),
  ) as Vec3;
  if (s === 1 && Math.hypot(...t) <= SCENE_MATCH.reshiftAbove * longest) return null;
  return { ...pose, scale: pose.scale * s, to: [0, 1, 2].map((k) => s * (pose.to[k] - o[k]) + o[k] + t[k]) as Vec3 };
}

/** A copy of a scene with every mesh in one grey: what is left is shape and surface. */
const greyOf = (scene: SceneData): SceneData => ({
  ...scene,
  meshes: scene.meshes.map((m) => ({ ...m, color: [...SCENE_LOOKS.grey] as RGB, triColors: undefined })),
});

/** Hard edges of a picture: pixels where it changes by at least `edgeStep` across. */
function edgeMap(view: SceneView): Uint8Array {
  const W = view.width, H = view.height, px = view.pixels;
  const L = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return (px[i] + px[i + 1] + px[i + 2]) / 3;
  };
  const out = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const d = Math.max(Math.abs(L(x + 1, y) - L(x - 1, y)), Math.abs(L(x, y + 1) - L(x, y - 1)));
      if (d >= SCENE_LOOKS.edgeStep) out[y * W + x] = 1;
    }
  }
  return out;
}

/** A mask grown by `r` pixels each way. */
function dilate(mask: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const tmp = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      for (let dx = Math.max(0, x - r); dx <= Math.min(W - 1, x + r); dx++) tmp[y * W + dx] = 1;
    }
  }
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!tmp[y * W + x]) continue;
      for (let dy = Math.max(0, y - r); dy <= Math.min(H - 1, y + r); dy++) out[dy * W + x] = 1;
    }
  }
  return out;
}

interface EdgeSet {
  edges: Uint8Array;
  near: Uint8Array;
  count: number;
}

function edgeSet(view: SceneView): EdgeSet {
  const edges = edgeMap(view);
  let count = 0;
  for (const e of edges) count += e;
  return { edges, near: dilate(edges, view.width, view.height, SCENE_LOOKS.edgeTolerancePx), count };
}

/**
 * The share of the second picture's hard edges that the first has too (within
 * a pixel or two): facets where the goal is smooth lower it; a surface smoother
 * than the goal's does not (missing outline is judged by the outline). Also how
 * many more edges the second has.
 */
function edgeAgreement(g: EdgeSet, c: EdgeSet): { score: number; ratio: number } {
  if (c.count === 0) return { score: 1, ratio: 1 / (g.count + 1) };
  let cHit = 0;
  for (let i = 0; i < g.edges.length; i++) if (c.edges[i] && g.near[i]) cHit++;
  return { score: cHit / c.count, ratio: (c.count + 1) / (g.count + 1) };
}

/**
 * Each goal part's colour against the submission's in the same place:
 * CIEDE2000, the best of small shifts, over the pixels where the submission
 * shows something (where it shows nothing, that is a shape difference, judged
 * elsewhere). null when the submission covers less than half the part's pixels.
 */
function partColorDiff(part: GoalPart, views: SceneView[]): number | null {
  const C = SCENE_PART_COLOR;
  const covered: number[] = [];
  for (const code of part.pixels) {
    const v = Math.floor(code / PIX);
    if (!isBackground(views[v].pixels, (code - v * PIX) * 4)) covered.push(code);
  }
  if (covered.length < Math.max(C.minPixels, 0.5 * part.pixels.length)) return null;
  const px = Int32Array.from(covered);
  let d = Infinity;
  for (let dy = -SCENE_LOOKS.colorShiftPx; dy <= SCENE_LOOKS.colorShiftPx; dy += 3) {
    for (let dx = -SCENE_LOOKS.colorShiftPx; dx <= SCENE_LOOKS.colorShiftPx; dx += 3) d = Math.min(d, dE(meanColor(views, px, dx, dy)!, part.color!));
  }
  return d;
}

/**
 * Every fact the total depends on (model.ts combines them with its constants).
 * The same work as scoreScene, which puts these on its result.
 */
export function measureScene(goal: PreparedScene, candidateScene: SceneData): SceneMeasurements {
  return scoreScene(goal, candidateScene).result.measurements!;
}

/** Scores a submission's triangles against a prepared goal. */
export function scoreScene(goal: PreparedScene, candidateScene: SceneData): { result: SceneGradeResult; candidate: PreparedScene } {
  const goalBox = goal.bounds!;
  // Only what can be seen: an invisible mesh does not move where the model stands.
  const visibleOnly = { ...candidateScene, meshes: candidateScene.meshes.filter((m) => m.opacity > 0) };
  const candBox = sceneBounds(visibleOnly) ?? sceneBounds(candidateScene)!;
  const gm = goalModel(goal);

  // ---- line up on the solids; among the poses that fit about as well, the parts choose
  // which way the model faces (a snowman's face tells front from back); then the parts
  // say whether its size or place was judged wrongly (one odd part pulled the line-up) ----
  const rawPieces = connectedPieces(candidateScene, diagonalOf(candBox), SCENE_PARTS.maxPieces);
  const first = lineUp(gm, rawPieces, candBox, Math.max(1, gm.parts.length));
  const longestG = Math.max(...extentOf(goalBox), 1e-9);
  const pieceSrc = piecesOf(candidateScene, gm.parts.length, diagonalOf(candBox));
  // The facing whose parts match best; of facings that match about equally well (a symmetric
  // model), the one that costs least (no mirror image, the smallest turn), then the solids' choice.
  const facings = first.alternatives.map((pose) => ({ pose, pm: matchAt(gm, pieceSrc, pose, longestG) }));
  const cost = (p: Pose) => (p.mirror ? SCENE_PLACEMENT.mirror : 0) + SCENE_PLACEMENT.turn * ramp((Math.abs(p.turn) * 180) / Math.PI, SCENE_PLACEMENT.turnFreeDeg, 180);
  // A facing that costs more (a turn, a mirror image) is taken only when its parts match clearly
  // better: by facingMargin, plus facingPerCost for every unit of extra charge.
  const better = (x: (typeof facings)[number], y: (typeof facings)[number]) => {
    const extra = cost(x.pose) - cost(y.pose);
    const need = SCENE_MATCH.facingMargin + SCENE_MATCH.facingPerCost * Math.max(0, extra);
    if (extra <= 0) return x.pm.match.value >= y.pm.match.value * (1 - SCENE_MATCH.facingMargin) - 1e-12 && (extra < -1e-9 || x.pm.match.value > y.pm.match.value + 1e-12);
    return x.pm.match.value > y.pm.match.value * (1 + need) + 1e-12;
  };
  let pick = facings[0];
  for (const x of facings) if (better(x, pick)) pick = x;
  const pose0 = pick.pose;
  const pm0 = pick.pm;
  let ev = evaluate(gm, goal, candidateScene, rawPieces, pose0, first.coreBox, pm0);
  // Up to two rounds: kept each time the parts fit about as well there or better (the solids alone
  // shift or stretch a model to hide a missing part).
  let curPose = pose0, curPm = pm0, moved = false;
  for (let round = 0; round < 2; round++) {
    const next = poseFromParts(gm, curPm, curPose, goalBox);
    if (!next) break;
    const pm = matchAt(gm, pieceSrc, next, longestG);
    if (pm.match.value < curPm.match.value * (1 - SCENE_MATCH.reposeSlack) - 1e-9) break;
    curPose = next;
    curPm = pm;
    moved = true;
  }
  if (moved) ev = evaluate(gm, goal, candidateScene, rawPieces, curPose, first.coreBox, curPm);
  const { pose, coreBox, presence, pieces } = ev;

  // ---- what lining up took ----
  // The size: what the line-up had to scale by, or the boxes' ratio, whichever is nearer
  // the goal's (a block exactly the goal's size is not "bigger" because it was fitted smaller).
  const poseRatio = 1 / pose.scale;
  const boxRatio = diagonalOf(coreBox) / Math.max(1e-9, diagonalOf(goalBox));
  const scaleRatio = Math.abs(Math.log(boxRatio)) < Math.abs(Math.log(poseRatio)) ? boxRatio : poseRatio;
  const turnDeg = (Math.abs(pose.turn) * 180) / Math.PI;
  const longestGoal = Math.max(...extentOf(goalBox), 1e-9);
  const gBase = baseOf(goalBox);
  // Where the model stands: the point of the submission the line-up put on the goal's base, against the goal's base.
  const back = unposePoint(gBase, pose);
  const offsetVec: Vec3 = [(back[0] - gBase[0]) * pose.scale, (back[1] - gBase[1]) * pose.scale, (back[2] - gBase[2]) * pose.scale];
  const offset = Math.hypot(...offsetVec) / longestGoal;
  // The charges for size, place, turn and mirror image are applied in model.ts.

  const candidate: PreparedScene = {
    triangleCount: candidateScene.triangleCount,
    meshCount: candidateScene.meshCount,
    sourceBytes: candidateScene.sourceBytes,
    bounds: candBox,
    views: ev.views,
    frame: goal.frame,
    scene: candidateScene,
    alignment: { from: pose.from, to: pose.to, scale: pose.scale, turnDeg: r2(turnDeg), mirror: pose.mirror },
  };
  // A part is missing only when no piece could be it and nothing in its place shows it.
  const missingParts = gm.parts.filter((_, i) => !ev.matched[i] && presence[i] < SCENE_PARTS.present);
  const extraPieces = pieces.filter((p) => p.extra >= 0.5);

  // ---- looks: form (grey views: shading, outline, hard edges) and colour (per goal part) ----
  const greyViews = drawViews(greyOf(applyPose(candidateScene, pose)), goal.frame);
  const views = gm.greyViews.map((g, i) => {
    const c = greyViews[i];
    const v = compareVisual(snapshot(g), snapshot(c));
    const outline = outlineOverlap(g, c);
    const edge = edgeAgreement(gm.greyEdges[i], edgeSet(c));
    const L = SCENE_LOOKS;
    const score = v.score * (1 - L.outline + L.outline * outline) * Math.max(0, 1 - L.edges * outline * outline * (1 - edge.score));
    return { name: g.name, score, shading: v.score, outline, edges: edge.score, edgeRatio: edge.ratio };
  });
  const colors: { part: GoalPart; weight: number; agree: number; diff: number }[] = [];
  const colourOf: { diff: number | null; weight: number }[] = gm.parts.map(() => ({ diff: null, weight: 0 }));
  gm.parts.forEach((p, i) => {
    // A matched part is judged by its own material's colour, wherever it is.
    const pmatch = ev.partMatch.parts[i];
    if (pmatch.piece >= 0) {
      const pc = pieceSrc[pmatch.piece].color;
      if (!pc || !p.meshColor) return;
      const diff = dE(pc, p.meshColor);
      colourOf[i] = { diff, weight: 1 };
      colors.push({ part: p, weight: p.weight, agree: 1 - ramp(diff, SCENE_LOOKS.colorFull, SCENE_LOOKS.colorZero), diff });
      return;
    }
    // Otherwise colour is judged where the part's shape is in place; a moved or missing part is judged by its shape.
    const geo = ev.inPlaceShape[i];
    // A part already counted missing is not charged again for its colour.
    if (!p.color || p.pixels.length < SCENE_PART_COLOR.minPixels || geo < 0.5 || presence[i] < SCENE_PARTS.present) return;
    const diff = partColorDiff(p, ev.views);
    if (diff === null) return;
    colourOf[i] = { diff, weight: ramp(geo, SCENE_LOOKS.colorShapeFrom, SCENE_LOOKS.colorShapeFull) };
    colors.push({ part: p, weight: p.weight * ramp(geo, SCENE_LOOKS.colorShapeFrom, SCENE_LOOKS.colorShapeFull), agree: 1 - ramp(diff, SCENE_LOOKS.colorFull, SCENE_LOOKS.colorZero), diff });
  });
  // Parts whose colour cannot be judged (not in place, hidden, tiny) count as agreeing: their shape is judged elsewhere.
  const wire = wireShare(candidateScene);

  // ---- every fact the total depends on; the constants are applied in model.ts ----
  const fullShare = (SCENE_SHAPE.softFullVoxels * gm.grid.size) / longestG;
  const parts: PartMeasure[] = gm.parts.map((p, i) => {
    const pmatch = ev.partMatch.parts[i];
    const j = pmatch.judgement;
    const matchedHere = pmatch.piece >= 0 && !!j;
    const ratios = j ? j.size.ratios : ([1, 1, 1] as Vec3);
    const sizeAxis = [0, 1, 2].reduce((a, b) => (Math.abs(Math.log(ratios[b])) > Math.abs(Math.log(ratios[a])) + 1e-12 ? b : a), 0);
    // The side most off, as a plain ratio of the lined-up piece's side to the part's (no thin-side slack): for the report.
    const pd = pmatch.pieceDesc;
    const sideOf = (d: Descriptor) => (j && j.size.frame === 'principal' ? d.pext : d.sortedExt)[sizeAxis];
    const plain = pd && j ? sideOf(pd) / Math.max(1e-9, sideOf(p.desc)) : NaN;
    const sizeRatio = Number.isFinite(plain) && plain > 0 ? plain : ratios.reduce((a, b) => (Math.abs(Math.log(b)) > Math.abs(Math.log(a)) + 1e-12 ? b : a), 1);
    const pc = matchedHere ? pieceSrc[pmatch.piece].color : null;
    return {
      label: labelOf(p, goalBox),
      weight: p.rawWeight,
      matched: matchedHere,
      move: matchedHere ? pmatch.move : 0,
      fullShare,
      sizeErr: j ? j.size.err : 0,
      shape: j ? j.shape : 1,
      turnDeg: j ? j.turn.deg : 0,
      turnSeen: j ? j.turn.seen : 0,
      sizeRatio,
      inPlace: matchedHere ? ev.inPlaceShape[i] : presence[i],
      colourDiff: colourOf[i].diff,
      colourWeight: colourOf[i].weight,
      ...(matchedHere && j ? { delta: [j.delta[0], j.delta[1], j.delta[2]] as [number, number, number], sizeAxis } : {}),
      ...(pc && p.meshColor && colourOf[i].diff !== null ? { colours: [[pc[0], pc[1], pc[2]], [p.meshColor[0], p.meshColor[1], p.meshColor[2]]] as [[number, number, number], [number, number, number]] } : {}),
    };
  });
  const objectsOf = (sc: SceneData) => new Set(sc.meshes.map((m, i) => m.part ?? -1 - i)).size;
  const cs = candidateScene.structure, gs = goal.scene.structure;
  const cClean = { ...cleanFacts(candidateScene), buried: ev.buried };
  const measurements: SceneMeasurements = {
    version: 1,
    parts,
    extras: pieces.filter((pc) => pc.extra > 0).map((pc) => ({ extra: pc.extra, size: diagonalOf(pc.bounds) })),
    shapeMatch: ev.match,
    whole: { scaleRatio, offset, turnDeg, mirror: pose.mirror },
    viewParts: views.map((v) => ({ shading: v.shading, outline: v.outline, edges: v.edges })),
    wire,
    counts: {
      triangles: [candidate.triangleCount, goal.triangleCount],
      meshes: [candidate.meshCount, goal.meshCount],
      sourceBytes: [candidate.sourceBytes, goal.sourceBytes],
    },
    reuse: cs && gs ? { objects: [objectsOf(candidateScene), objectsOf(goal.scene)], geometries: [cs.geometries, gs.geometries], materials: [cs.materials, gs.materials] } : null,
    clean: {
      duplicate: [cClean.duplicate, gm.clean.duplicate],
      degenerate: [cClean.degenerate, gm.clean.degenerate],
      flipped: [cClean.flipped, gm.clean.flipped],
      buried: [cClean.buried, gm.clean.buried],
    },
    structure: cs && gs
      ? { meshes: [cs.meshes, gs.meshes], named: [cs.namedMeshes / Math.max(1, cs.meshes), gs.namedMeshes / Math.max(1, gs.meshes)], groups: [cs.groups, gs.groups] }
      : null,
    longest: longestG,
  };
  const comb = combineScene(measurements, sceneValues());
  const checks = buildChecks(measurements, sceneValues());
  const { looks, engineering, placement, charges, bonus, base, exactMatch } = comb;
  const works = comb.works;
  const form = comb.form;
  const colorFactor = comb.colorFactor;
  const color = comb.colour;
  const saving = comb.saving;
  const total = round1(comb.total);

  // For the feedback: the count measures as before (their words), the new ones by their credit.
  const triangles = measure(candidate.triangleCount, goal.triangleCount, SCENE_ENGINEERING.triangleSlack);
  const meshes = measure(candidate.meshCount, goal.meshCount, SCENE_ENGINEERING.meshSlack);
  const source = measure(candidate.sourceBytes, goal.sourceBytes, SCENE_ENGINEERING.sourceSlackBytes);
  const criteria = withChecks(buildCriteria(measurements, comb, cClean), checks.all, checks.byCriterion);
  const softWorst = (['reuse', 'cleanGeometry', 'structure'] as const)
    .map((id) => ({ id, credit: id === 'reuse' ? comb.reuse.credit : id === 'cleanGeometry' ? comb.clean.credit : comb.structure.credit }))
    .filter((x) => x.credit < 1)
    .sort((a, b) => a.credit - b.credit)[0];
  const soft = softWorst ? { credit: softWorst.credit, text: criteria.find((c) => c.id === softWorst.id)?.notes[0] ?? '' } : undefined;

  // The core of the submission (without a left-out stray piece), after lining up, for the proportions line.
  const coreAligned = boundsOfLists(corePieces(rawPieces, coreBox).map((p) => posePositions(p, pose)));

  const feedback = buildFeedback({
    goal,
    goalBox,
    alignedBox: coreAligned ?? goalBox,
    shapeMatch: ev.match,
    missingAt: centroidOf(ev.missingCells, gm.grid),
    extraAt: centroidOf(ev.extraCells, gm.grid),
    missingShare: gm.shellCells.length ? ev.missingCells.length / gm.shellCells.length : 0,
    extraShare: ev.cVoxels ? ev.extraCells.length / ev.cVoxels : 0,
    parts: gm.parts,
    presence,
    matched: ev.matched,
    partMatch: ev.partMatch,
    extraPieces,
    works,
    looks,
    wire,
    form,
    colorFactor,
    colors,
    engineering,
    views,
    candidate,
    measures: { triangles, meshes, source },
    base,
    placement,
    charges,
    scaleRatio,
    turnDeg,
    mirror: pose.mirror,
    offset,
    offsetVec,
    bonus,
    saving,
    soft,
  });

  const strip = (m: EngineeringMeasure, k: keyof SceneCombination['counts']): EngineeringMeasure => ({
    value: m.value,
    reference: m.reference,
    ratio: r2(comb.counts[k].ratio),
    credit: round1(comb.counts[k].credit * 100),
  });
  return {
    candidate,
    result: {
      version: SCENE_VERSION,
      total,
      pillars: { works: round1(works * 100), engineering: round1(engineering * 100), looks: round1(looks * 100) },
      bonus: round1(bonus),
      exactMatch,
      details: {
        shape: {
          match: round1(ev.match * 100),
          goalVoxels: gm.shellCells.length,
          candidateVoxels: ev.cVoxels,
          missing: ev.missingCells.length,
          extra: ev.extraCells.length,
          voxelSize: gm.grid.size,
        },
        parts: {
          goal: gm.parts.length,
          present: gm.parts.length - missingParts.length,
          missing: missingParts.length,
          extra: extraPieces.length,
          credit: round1(comb.partsCredit * 100),
        },
        placement: { scaleRatio: r3(scaleRatio), offset: r3(offset), turnDeg: round1(turnDeg), mirror: pose.mirror, factor: r3(placement) },
        views: views.map((v) => ({
          name: v.name,
          score: round1(v.score * 100),
          structure: round1(v.shading * 100),
          color: round1(color * 100),
          outline: round1(v.outline * 100),
          edges: round1(v.edges * 100),
        })),
        engineering: { triangles: strip(triangles, 'triangles'), meshes: strip(meshes, 'meshes'), sourceBytes: strip(source, 'sourceBytes') },
        size: { goal: extentOf(goalBox), candidate: extentOf(candBox) },
      },
      feedback,
      measurements,
      criteria,
      criteriaFeedback: criteriaFeedbackOf(checks.shown),
      checks: checks.shown,
    },
  };
}

/** The point of the submission that a pose carries to `p`. */
function unposePoint(p: Vec3, pose: Pose): Vec3 {
  const c = Math.cos(pose.turn), s = Math.sin(pose.turn);
  const x = (p[0] - pose.to[0]) / pose.scale, y = (p[1] - pose.to[1]) / pose.scale, z = (p[2] - pose.to[2]) / pose.scale;
  const rx = c * x - s * z, rz = s * x + c * z;
  return [rx * (pose.mirror ? -1 : 1) + pose.from[0], y + pose.from[1], rz + pose.from[2]];
}

/** The pieces inside a box (the core of the submission, without a left-out stray piece). */
function corePieces(rawPieces: Float32Array[], box: Bounds): Float32Array[] {
  return rawPieces.filter((p) => {
    const b = boundsOfLists([p]);
    return b && b.min.every((v, k) => v >= box.min[k] - 1e-9) && b.max.every((v, k) => v <= box.max[k] + 1e-9);
  });
}

/**
 * Is a flush part there, by colour? 1 when the submission's colour where the
 * part is matches the part's, or stands out from its own surroundings the
 * way the part stands out in the goal; 0 when neither.
 */
function colorTest(part: GoalPart, views: SceneView[]): number {
  const C = SCENE_PART_COLOR;
  if (!part.color || !part.ringColor || part.pixels.length < C.minPixels || part.ring.length < C.minPixels) return 1;
  const goalContrast = dE(part.color, part.ringColor);
  if (goalContrast < C.contrastMin) return 1;
  // A part a pixel or two off still counts: the best of small shifts.
  let best = 0;
  for (let dy = -C.shiftPx; dy <= C.shiftPx && best < 1; dy++) {
    for (let dx = -C.shiftPx; dx <= C.shiftPx && best < 1; dx++) {
      const here = meanColor(views, part.pixels, dx, dy)!;
      const around = meanColor(views, part.ring, dx, dy)!;
      const same = 1 - ramp(dE(here, part.color), C.matchFull, C.matchZero);
      const stands = ramp(dE(here, around) / goalContrast, C.contrastZero, C.contrastFull);
      best = Math.max(best, same, stands);
    }
  }
  return best;
}

const isBackground = (px: Uint8Array, i: number) => {
  const bg = SCENE_RENDER.background;
  return Math.abs(px[i] - bg[0]) <= 6 && Math.abs(px[i + 1] - bg[1]) <= 6 && Math.abs(px[i + 2] - bg[2]) <= 6;
};

/** Overlap (intersection over union) of what the model covers in two pictures. 1 when both are empty. */
function outlineOverlap(a: SceneView, b: SceneView): number {
  let both = 0, either = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    const ia = !isBackground(a.pixels, i), ib = !isBackground(b.pixels, i);
    if (ia && ib) both++;
    if (ia || ib) either++;
  }
  return either ? both / either : 1;
}

function triangleArea(p: Float32Array, t: number): number {
  const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
  const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

/** Share of the visible surface (by area) drawn as wireframe. */
function wireShare(scene: SceneData): number {
  let wire = 0, all = 0;
  for (const m of scene.meshes) {
    if (m.opacity <= 0) continue;
    let a = 0;
    for (let t = 0; t + 9 <= m.positions.length; t += 9) a += triangleArea(m.positions, t);
    all += a;
    if (m.wireframe) wire += a;
  }
  return all > 0 ? wire / all : 0;
}

function centroidOf(cells: number[], g: Dense): Vec3 | null {
  if (cells.length === 0) return null;
  const s: Vec3 = [0, 0, 0];
  for (const c of cells) {
    const q = cellCenter(g, c);
    for (let k = 0; k < 3; k++) s[k] += q[k] / cells.length;
  }
  return s;
}

/** What the extra triangles are, for the engineering line: curved parts, flat faces cut up, or parts built twice. */
function heavyKind(scene: SceneData): 'curved' | 'flat' | 'twice' {
  const seen = new Set<string>();
  let dup = 0, total = 0, curved = 0;
  const b = sceneBounds(scene);
  const q = b ? Math.max(diagonalOf(b), 1e-9) * 1e-4 : 1e-4;
  for (const m of scene.meshes) {
    if (m.opacity <= 0) continue;
    const p = m.positions;
    const normals = new Set<string>();
    const n = p.length / 9;
    for (let t = 0; t + 9 <= p.length; t += 9) {
      const corners = [0, 3, 6].map((o) => `${Math.round(p[t + o] / q)},${Math.round(p[t + o + 1] / q)},${Math.round(p[t + o + 2] / q)}`).sort();
      const key = corners.join('|');
      if (seen.has(key)) dup++;
      else seen.add(key);
      const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
      const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      normals.add(`${Math.round((nx / l) * 20)},${Math.round((ny / l) * 20)},${Math.round((nz / l) * 20)}`);
    }
    total += n;
    if (normals.size > 24) curved += n;
  }
  if (total && dup / total >= 0.3) return 'twice';
  return total && curved / total >= 0.5 ? 'curved' : 'flat';
}

// ---------------------------------------------------------------- feedback

const VIEW_LABEL: Record<string, string> = {
  'three-quarter-front': 'three-quarter front view',
  front: 'front view',
  top: 'top view',
  'three-quarter-back': 'three-quarter back view',
};

const pct = (fraction: number) => `${Math.max(1, Math.round(fraction * 100))}%`;
const points = (cost: number) => {
  const p = Math.round(cost);
  return p <= 1 ? (cost >= 0.5 ? '1 point' : 'under 1 point') : `${p} points`;
};

/** "9 times as many triangles as" or "40% more triangles than". */
function many(ratio: number, noun: string): string {
  if (ratio >= 1.95) return `${Math.round(ratio)} times as many ${noun} as`;
  return `${pct(ratio - 1)} more ${noun} than`;
}

/** "3 times as long as" or "40% longer than". */
function longer(ratio: number): string {
  if (ratio >= 1.95) return `${Math.round(ratio)} times as long as`;
  return `${pct(ratio - 1)} longer than`;
}

/** A count in words a person uses: "about 100", "about 2.5". */
function times(r: number): string {
  if (r >= 10) return `${Math.round(r)}`;
  return `${Math.round(r * 10) / 10}`;
}

/** Where a point sits within a box, in words ("near the top front left"); "in the middle" for the centre. */
function placeWords(at: [number, number, number], box: Bounds): string {
  const words: string[] = [];
  const frac = (k: number) => {
    const span = box.max[k] - box.min[k];
    return span > 1e-9 ? (at[k] - box.min[k]) / span : 0.5;
  };
  const y = frac(1), z = frac(2), x = frac(0);
  if (y > 0.62) words.push('top');
  else if (y < 0.38) words.push('bottom');
  if (z > 0.62) words.push('front');
  else if (z < 0.38) words.push('back');
  if (x > 0.62) words.push('right');
  else if (x < 0.38) words.push('left');
  return words.length ? `near the ${words.join(' ')}` : 'in the middle';
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** A mesh name as words: "front_door2" -> "front door", "eyeL" -> "left eye". */
const tidyName = (name: string) => {
  const words = name.replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s*\d+$/, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const end = /^(.*\S)\s+(l|r|left|right)$/.exec(words);
  if (end) return `${end[2].startsWith('l') ? 'left' : 'right'} ${end[1]}`;
  const start = /^(l|r)\s+(.*)$/.exec(words);
  if (start) return `${start[1] === 'l' ? 'left' : 'right'} ${start[2]}`;
  return words;
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How a part is named to the player: "the saucer", "the book near the top right", "the part near the bottom". */
function labelOf(p: GoalPart, box: Bounds): string {
  const n = tidyName(p.name);
  if (!n) return `the part ${placeWords(p.center, box)}`;
  return p.sharedName ? `the ${n} ${placeWords(p.center, box)}` : `the ${n}`;
}

/** Several parts named, the same names counted together: "the saucer", "2 books near the top". */
function labelList(parts: GoalPart[], box: Bounds): string[] {
  const counts = new Map<string, { k: number; part: GoalPart }>();
  for (const p of parts) {
    const l = labelOf(p, box);
    const c = counts.get(l);
    if (c) c.k++;
    else counts.set(l, { k: 1, part: p });
  }
  return [...counts].map(([l, { k, part }]) => {
    if (k === 1) return l;
    const n = tidyName(part.name);
    const where = placeWords(part.center, box);
    return n ? `${k} ${n}s${part.sharedName ? ` ${where}` : ''}` : `${k} parts ${where}`;
  });
}

/** Up to three descriptions of some goal parts, then how many more. */
function describeParts(parts: GoalPart[], box: Bounds): string[] {
  const out = labelList(parts, box);
  if (out.length > 3) return [...out.slice(0, 3), `${out.length - 3} more`];
  return out;
}

interface FeedbackInput {
  goal: PreparedScene;
  goalBox: Bounds;
  alignedBox: Bounds;
  shapeMatch: number;
  missingAt: Vec3 | null;
  extraAt: Vec3 | null;
  missingShare: number;
  extraShare: number;
  parts: GoalPart[];
  presence: number[];
  matched: boolean[];
  partMatch: MatchResult;
  extraPieces: PieceInfo[];
  works: number;
  looks: number;
  wire: number;
  form: number;
  colorFactor: number;
  colors: { part: GoalPart; weight: number; agree: number; diff: number }[];
  engineering: number;
  views: { name: string; score: number; shading: number; outline: number; edges: number; edgeRatio: number }[];
  candidate: PreparedScene;
  measures: Record<'triangles' | 'meshes' | 'source', EngineeringMeasure & { raw: number }>;
  base: number;
  placement: number;
  charges: { size: number; position: number; turn: number; mirror: number };
  scaleRatio: number;
  turnDeg: number;
  mirror: boolean;
  offset: number;
  offsetVec: Vec3;
  bonus: number;
  saving: number;
  /** The weakest of the new engineering measures, when below 1: its credit and its line. */
  soft?: { credit: number; text: string };
}

/** What is most wrong with a matched part, in one sentence, from what was measured; null when nothing much. */
function partFault(f: FeedbackInput, i: number, box: Bounds): string | null {
  const m = f.partMatch.parts[i];
  const j = m.judgement;
  if (!j) return null;
  const p = f.parts[i];
  const name = capital(labelOf(p, box));
  const carried = f.partMatch.parts.filter((q) => q.carrier === i).length;
  const tail = carried === 1 ? ', and the part on it moved with it' : carried > 1 ? ', and the parts on it moved with it' : '';
  const losses: { k: 'place' | 'size' | 'shape' | 'turn'; v: number }[] = [
    { k: 'place', v: 1 - m.placeF },
    { k: 'size', v: 1 - j.sizeF },
    { k: 'shape', v: 1 - j.shapeF },
    { k: 'turn', v: 1 - j.turnF },
  ];
  const top = losses.reduce((a, b) => (b.v > a.v + 1e-12 ? b : a));
  if (top.v < 0.02) return null;
  const longest = Math.max(...extentOf(box));
  if (top.k === 'place') {
    const s = j.delta;
    const big = Math.max(...s.map(Math.abs));
    const dirs: [string, string][] = [
      ['too far right', 'too far left'],
      ['too high', 'too low'],
      ['too far forward', 'too far back'],
    ];
    const where = [0, 1, 2].filter((a) => Math.abs(s[a]) >= 0.5 * big).map((a) => (s[a] > 0 ? dirs[a][0] : dirs[a][1]));
    return `${name} sits ${listWords(where)}, by about ${pct(Math.hypot(...s) / longest)} of the model's size${tail}.`;
  }
  if (top.k === 'turn') return `${name} is at a different angle from the goal's, about ${Math.round(j.turn.deg / 5) * 5} degrees off${tail}.`;
  if (top.k === 'shape') return `${name} is a different shape from the goal's${tail}.`;
  // Size: the side that is most off, measured.
  const pd = m.pieceDesc;
  const gd = p.desc;
  const ratioOf = (pe: number, ge: number, gmax: number) => {
    const eps = ge >= 0.2 * gmax ? 0 : SCENE_MATCH.thinSlack * gmax;
    return (pe + eps) / Math.max(1e-9, ge + eps);
  };
  let word: string;
  let r: number;
  if (pd && j.turn.deg * j.turn.seen < 15) {
    const gmax = Math.max(...gd.ext);
    const rs = [0, 1, 2].map((k) => ratioOf(pd.ext[k], gd.ext[k], gmax));
    const axis = [0, 1, 2].reduce((a, b) => (Math.abs(Math.log(rs[b])) > Math.abs(Math.log(rs[a])) + 1e-12 ? b : a), 0);
    r = rs[axis];
    const longAxis = [0, 1, 2].reduce((a, b) => (gd.ext[b] > gd.ext[a] ? b : a), 0);
    const words: [string, string][] = [['too wide', 'too narrow'], ['too tall', 'too short'], ['too deep', 'too shallow']];
    word = axis === longAxis && axis !== 1 ? (r > 1 ? 'too long' : 'too short') : r > 1 ? words[axis][0] : words[axis][1];
  } else {
    const rs = j.size.ratios;
    const axis = [0, 1, 2].reduce((a, b) => (Math.abs(Math.log(rs[b])) > Math.abs(Math.log(rs[a])) + 1e-12 ? b : a), 0);
    r = rs[axis];
    word = axis === 0 ? (r > 1 ? 'too long' : 'too short') : r > 1 ? 'too thick' : 'too thin';
  }
  const amount = r >= 1.95 ? `about ${times(r)} times` : `about ${pct(Math.abs(r - 1))}`;
  return r >= 1.95 ? `${name} is ${amount} as big as the goal's along one side (${word})${tail}.` : `${name} is ${amount} ${word}${tail}.`;
}

/**
 * How coarse a scene's curves are: the median angle between neighbouring faces
 * that bend gently (between 2 and 80 degrees: flat joins and box corners are
 * not curves). 0 when it has no curves.
 */
function curveAngle(scene: SceneData): number {
  const angles: number[] = [];
  const b = sceneBounds(scene);
  const q = b ? Math.max(diagonalOf(b), 1e-9) * 1e-5 : 1e-5;
  for (const m of scene.meshes) {
    if (m.opacity <= 0) continue;
    const p = m.positions;
    const seen = new Map<string, [number, number, number]>();
    for (let t = 0; t + 9 <= p.length && angles.length < 200_000; t += 9) {
      const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
      const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (!(l > 0)) continue;
      const n: [number, number, number] = [nx / l, ny / l, nz / l];
      const key = (o: number) => `${Math.round(p[t + o] / q)},${Math.round(p[t + o + 1] / q)},${Math.round(p[t + o + 2] / q)}`;
      const k = [key(0), key(3), key(6)];
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const e = k[i] < k[j] ? `${k[i]}|${k[j]}` : `${k[j]}|${k[i]}`;
        const other = seen.get(e);
        if (!other) {
          seen.set(e, n);
          continue;
        }
        const deg = (Math.acos(Math.max(-1, Math.min(1, Math.abs(other[0] * n[0] + other[1] * n[1] + other[2] * n[2])))) * 180) / Math.PI;
        if (deg > 2 && deg < 80) angles.push(deg);
      }
    }
  }
  if (!angles.length) return 0;
  angles.sort((x, y) => x - y);
  return angles[Math.floor(angles.length / 2)];
}

function buildFeedback(f: FeedbackInput): string[] {
  const items: { cost: number; text: string }[] = [];
  const goalBox = f.goalBox;

  // ---- placement: what lining up took ----
  const c = f.charges;
  if (f.base * c.turn > 0.5) {
    items.push({ cost: f.base * c.turn, text: `The model is turned about ${Math.round(f.turnDeg)} degrees from the goal's facing: ${points(f.base * c.turn)}.` });
  }
  if (f.base * c.mirror > 0.5) {
    items.push({ cost: f.base * c.mirror, text: `The model is a mirror image of the goal: ${points(f.base * c.mirror)}.` });
  }
  if (f.base * c.size > 0.5) {
    const cost = f.base * c.size;
    const r = f.scaleRatio;
    const text =
      r >= 1.95
        ? `The model is about ${times(r)} times bigger than the goal: ${points(cost)}.`
        : r > 1
          ? `The model is about ${pct(r - 1)} bigger than the goal: ${points(cost)}.`
          : r <= 1 / 1.95
            ? `The model is about ${times(1 / r)} times smaller than the goal: ${points(cost)}.`
            : `The model is about ${pct(1 - r)} smaller than the goal: ${points(cost)}.`;
    items.push({ cost, text });
  }
  if (f.base * c.position > 0.5) {
    const cost = f.base * c.position;
    const longest = Math.max(...extentOf(goalBox));
    const dirs: [string, string][] = [
      ['to the right', 'to the left'],
      ['too high', 'too low'],
      ['too far forward', 'too far back'],
    ];
    const where = [0, 1, 2]
      .filter((k) => Math.abs(f.offsetVec[k]) / longest > SCENE_FEEDBACK.shift / 2)
      .map((k) => (f.offsetVec[k] > 0 ? dirs[k][0] : dirs[k][1]));
    const dir = where.length ? ` (${where.join(' and ')})` : '';
    const text =
      f.offset >= 1.5
        ? `The model stands about ${times(f.offset)} times the goal's size from where the goal stands${dir}: ${points(cost)}.`
        : `The model stands about ${pct(f.offset)} of the goal's size from where the goal stands${dir}: ${points(cost)}.`;
    items.push({ cost, text });
  }

  // ---- works: shape and parts (judged after lining up) ----
  const worksCost = (1 - f.works) * (100 * SCENE_WEIGHTS.works + 100 * SCENE_WEIGHTS.engineering * Math.max(0, f.engineering)) * f.placement;
  // Curves too coarse: only when the goal has curves, the submission's curves bend clearly more from face to face, and the facets show.
  const facetsShow = f.views.reduce((s, v) => s + v.edgeRatio, 0) / Math.max(1, f.views.length) > 1.1;
  const goalBend = curveAngle(f.goal.scene);
  const candBend = goalBend > 0 ? curveAngle(f.candidate.scene) : 0;
  void facetsShow;
  const coarse = f.candidate.triangleCount < 0.6 * f.goal.triangleCount && candBend > Math.max(15, 1.5 * goalBend);
  const missing = f.parts.filter((_, i) => !f.matched[i] && f.presence[i] < SCENE_PARTS.present);
  // Matched parts worth a line: not those that only moved with the part they rest on.
  const faulty = f.parts
    .map((p, i) => ({ i, loss: p.weight * (1 - f.partMatch.parts[i].credit) }))
    .filter(({ i }) => f.matched[i] && f.partMatch.parts[i].carrier < 0 && f.partMatch.parts[i].credit < 0.95)
    .sort((a, b) => b.loss - a.loss || a.i - b.i);
  const faultLines = faulty.map(({ i }) => partFault(f, i, goalBox)).filter((t): t is string => !!t).slice(0, 3);
  if (worksCost > 0.05) {
    const lines: string[] = [];
    if (missing.length) {
      const n = missing.length;
      const total = f.parts.length;
      if (n === 1) {
        const p = missing[0];
        lines.push(tidyName(p.name) ? `${capital(labelOf(p, goalBox))} is missing (1 of the goal's ${total} parts).` : `A part is missing ${placeWords(p.center, goalBox)} (1 of the goal's ${total} parts).`);
      } else {
        lines.push(`${n} parts are missing: ${listWords(describeParts(missing, goalBox))} (${n} of the goal's ${total} parts).`);
      }
    }
    lines.push(...faultLines);
    // A part judged in place that is there but not the right shape (only when nothing above explains the shape).
    let worst = -1;
    f.parts.forEach((_, i) => {
      if (f.matched[i]) return;
      if (f.presence[i] >= SCENE_PARTS.present && f.presence[i] < 0.85 && (worst < 0 || f.presence[i] < f.presence[worst])) worst = i;
    });
    if (worst >= 0 && !missing.length && !faultLines.length) {
      lines.push(coarse ? 'Curves are too coarse: curved parts need more segments to match the goal.' : `${capital(labelOf(f.parts[worst], goalBox))} does not match the goal's shape.`);
    }
    if (f.extraPieces.length) {
      const g = extentOf(goalBox);
      const floors = f.extraPieces.filter((p) => {
        const e = extentOf(p.bounds);
        return e[1] < 0.05 * Math.max(e[0], e[2]) && Math.max(e[0], e[2]) > Math.max(g[0], g[2]) && p.bounds.max[1] <= goalBox.min[1] + 0.05 * g[1];
      });
      if (floors.length) lines.push('There is a floor the goal does not have: remove it.');
      const rest = f.extraPieces.filter((p) => !floors.includes(p));
      if (rest.length) {
        const where = [...new Set(rest.map((p) => placeWords(p.center, goalBox)))].slice(0, 3);
        lines.push(
          rest.length === 1
            ? `There is an extra part ${where[0]} that the goal does not have.`
            : `There are ${rest.length} extra parts the goal does not have, ${listWords(where)}.`,
        );
      }
    }
    // Proportions: after lining up, is any direction still off? Only when no part line says why.
    if (!missing.length && !faultLines.length) {
      const g = extentOf(goalBox);
      const a = extentOf(f.alignedBox);
      const longest = Math.max(g[0], g[1], g[2]);
      const names: [string, string][] = [
        ['wider', 'narrower'],
        ['taller', 'shorter'],
        ['deeper (front to back)', 'shallower (front to back)'],
      ];
      const others = ['height and depth', 'width and depth', 'width and height'];
      const axes = [0, 1, 2].filter((k) => g[k] >= longest * 0.02);
      let worstAxis = -1;
      let worstRel = 1;
      for (const k of axes) {
        const rest = axes.filter((j) => j !== k);
        if (rest.length === 0) continue;
        const rel = a[k] / g[k] / (rest.reduce((s, j) => s + a[j] / g[j], 0) / rest.length);
        if (Math.abs(Math.log(rel)) > Math.abs(Math.log(worstRel))) {
          worstRel = rel;
          worstAxis = k;
        }
      }
      if (worstAxis >= 0 && Math.abs(worstRel - 1) > SCENE_FEEDBACK.sizeRatio && f.turnDeg < 30) {
        const word = worstRel > 1 ? names[worstAxis][0] : names[worstAxis][1];
        lines.push(`The model's proportions are off: about ${pct(Math.abs(worstRel - 1))} ${word} than the goal, compared with its ${others[worstAxis]}.`);
      }
    }
    if (lines.length === 0 && coarse) lines.push('Curves are too coarse: curved parts need more segments to match the goal.');
    if (lines.length === 0) {
      if (f.missingShare > SCENE_FEEDBACK.material && f.missingAt) lines.push(`Some of the shape is missing ${placeWords(f.missingAt, goalBox)}.`);
      if (f.extraShare > SCENE_FEEDBACK.material && f.extraAt) lines.push(`There is extra material ${placeWords(f.extraAt, goalBox)} that the goal does not have.`);
    }
    if (f.works < 0.25) lines.unshift('The shape is very different from the goal.');
    lines.forEach((text, i) => items.push({ cost: worksCost - i * 0.001, text }));
  }

  const shapeExplained = missing.length > 0 || faultLines.length > 0 || f.extraPieces.length > 0;
  // ---- looks: colour and form, each named for what it is ----
  const scale = 100 * SCENE_WEIGHTS.looks * f.placement;
  if (f.wire > 0.01) {
    const looksCost = (1 - f.looks) * scale;
    items.push({
      cost: Math.max(looksCost, 0.06) + 0.002,
      text:
        f.wire > 0.9
          ? 'The model is drawn as wireframe (material.wireframe), which shows only its edges: no credit for looks.'
          : `${pct(f.wire)} of the model is drawn as wireframe (material.wireframe), which shows only edges: no looks credit for that share.`,
    });
  } else {
    const colorCost = (1 - f.colorFactor) * f.form * scale;
    if (colorCost > 0.5) {
      const off = f.colors.filter((x) => x.agree < 0.5 && x.weight >= 0.999 * x.part.weight);
      const offWeight = off.reduce((s, x) => s + x.weight, 0);
      const allWeight = f.colors.reduce((s, x) => s + x.weight, 0);
      let text: string;
      if (off.length >= 2 && offWeight >= 0.6 * allWeight) text = 'The colours are different throughout.';
      else {
        const list = off.length ? off : f.colors.filter((x) => x.agree < 0.95 && x.weight >= 0.999 * x.part.weight).sort((a, b) => a.agree - b.agree).slice(0, 3);
        const where = describeParts(list.map((x) => x.part), goalBox);
        const slight = !off.length;
        const what = slight ? 'a slightly different colour' : 'a different colour';
        const one = where[0] ?? 'one part';
        text = list.length <= 1 ? `Colours differ from the goal: ${one} is ${what}.` : `Colours differ from the goal: ${list.length} parts are ${what}, ${listWords(where)}.`;
      }
      items.push({ cost: colorCost, text });
    }
    const formCost = (1 - f.form) * scale;
    if (formCost > 0.5) {
      const L = SCENE_LOOKS;
      const loss = (k: 'outline' | 'edges' | 'shading') =>
        f.views.reduce((s, v) => s + (k === 'outline' ? L.outline * (1 - v.outline) : k === 'edges' ? L.edges * (1 - v.edges) : 1 - v.shading), 0);
      const worstView = (k: 'outline' | 'edges' | 'shading') =>
        f.views.reduce((a, b) => (b[k] < a[k] ? b : a));
      const ranked = (['edges', 'outline', 'shading'] as const).map((k) => ({ k, v: loss(k) })).sort((a, b) => b.v - a.v);
      const top = ranked[0].k;
      const more = f.views.reduce((s, v) => s + v.edgeRatio, 0) / f.views.length;
      let text = '';
      if (top === 'edges' && coarse) {
        text = 'Curved parts look faceted: there are hard edges and flat bands where the goal is smooth; use more segments.';
      } else if (top === 'edges' && more > 1.1) {
        text = coarse
          ? 'Curved parts look faceted: there are hard edges and flat bands where the goal is smooth; use more segments.'
          : `The surfaces show edges and shading the goal does not have, most in the ${VIEW_LABEL[worstView('edges').name] ?? worstView('edges').name}.`;
      } else if (top === 'edges' && !shapeExplained) {
        text = `Some of the goal's edges and corners are missing or in other places, most in the ${VIEW_LABEL[worstView('edges').name] ?? worstView('edges').name}.`;
      } else if (top === 'outline' && !shapeExplained) {
        text = `The outline differs from the goal, most in the ${VIEW_LABEL[worstView('outline').name] ?? worstView('outline').name}.`;
      } else if (top === 'shading' && !shapeExplained) {
        text = `The surfaces are lit differently from the goal's (faces turned or shown from the other side), most in the ${VIEW_LABEL[worstView('shading').name] ?? worstView('shading').name}.`;
      }
      if (text) items.push({ cost: formCost, text });
    }
  }

  // ---- engineering: only the worst measure sets the score, so only it is named ----
  const engCost = (1 - f.engineering) * 100 * SCENE_WEIGHTS.engineering * f.works * f.placement;
  if (engCost > 0.05) {
    const keys = ['triangles', 'meshes', 'source'] as const;
    const worst = keys.reduce((a, b) => (f.measures[b].raw < f.measures[a].raw ? b : a));
    const m = f.measures[worst];
    let text: string;
    if (f.soft && f.soft.text && f.soft.credit < m.raw) {
      text = f.soft.text;
    } else if (worst === 'triangles') {
      const kind = heavyKind(f.candidate.scene);
      const why =
        kind === 'twice'
          ? 'some of it is built more than once, in the same place'
          : kind === 'curved'
            ? 'curved shapes need fewer segments'
            : 'the extra triangles are on flat faces, which need only a few each';
      text = `Uses ${many(m.value / Math.max(1, m.reference), 'triangles')} the goal (${m.value.toLocaleString('en-US')} against ${m.reference.toLocaleString('en-US')}); ${why}.`;
    } else if (worst === 'meshes') {
      text = `Uses ${many(m.value / Math.max(1, m.reference), 'meshes')} the goal (${m.value} against ${m.reference}).`;
    } else {
      text = `The code is ${longer(m.value / Math.max(1, m.reference))} the goal's (${m.value.toLocaleString('en-US')} bytes against ${m.reference.toLocaleString('en-US')}, not counting comments and spacing).`;
    }
    items.push({ cost: engCost, text });
  }

  items.sort((a, b) => b.cost - a.cost);
  const lines = items.slice(0, SCENE_FEEDBACK.maxLines).map((i) => i.text);
  if (f.bonus > 0) {
    lines.push(`Matches the goal exactly while using about ${pct(f.saving)} less on average: ${round1(f.bonus)} bonus points.`);
  }
  if (lines.length === 0) lines.push('Matches the goal.');
  return lines;
}

// ---------------------------------------------------------------- clean geometry

/** Shares of a scene's visible triangles that are built twice, have no area, face inside out, or sit in parts nobody can see inside the rest. */
interface CleanFacts {
  duplicate: number;
  degenerate: number;
  flipped: number;
  buried: number;
}

function cleanFacts(scene: SceneData): Omit<CleanFacts, 'buried'> {
  const b = sceneBounds(scene);
  const diag = b ? Math.max(diagonalOf(b), 1e-9) : 1;
  const q = diag * 1e-4;
  const tiny = (diag * 1e-6) ** 2;
  const seen = new Set<string>();
  let total = 0, dup = 0, deg = 0;
  scene.meshes.forEach((m) => {
    if (m.opacity <= 0) return;
    const p = m.positions;
    const n = Math.floor(p.length / 9);
    total += n;
    for (let t = 0; t + 9 <= p.length; t += 9) {
      const key = [0, 3, 6].map((o) => `${Math.round(p[t + o] / q)},${Math.round(p[t + o + 1] / q)},${Math.round(p[t + o + 2] / q)}`).sort().join('|');
      if (seen.has(key)) dup++;
      else seen.add(key);
      if (triangleArea(p, t) <= tiny) deg++;
    }
  });
  // Faces drawn only from the inside (a BackSide material), as the front end counted them.
  const flip = scene.structure?.backFaceTriangles ?? 0;
  const t = Math.max(1, total);
  return { duplicate: dup / t, degenerate: deg / t, flipped: Math.min(1, flip / t) };
}

/** Share of triangles in pieces of which no cell is on the solid's outside: wholly inside the rest, so nobody can see them. */
function buriedShare(placed: { cells: Int32Array; outside: number; tris: number }[], shell: Uint8Array): number {
  let all = 0, buried = 0;
  for (const pc of placed) {
    all += pc.tris;
    if (pc.outside > 0 || pc.cells.length === 0) continue;
    let onSkin = false;
    for (const c of pc.cells) if (shell[c]) { onSkin = true; break; }
    if (!onSkin) buried += pc.tris;
  }
  return all ? buried / all : 0;
}

/** The same for the goal, on its own grid. */
function goalBuried(scene: SceneData, grid: Dense, shell: Uint8Array): number {
  const b = sceneBounds(scene);
  if (!b) return 0;
  const budget = { left: SCENE_SHAPE.maxSamplesPerScene };
  const placed = connectedPieces(scene, diagonalOf(b), SCENE_PARTS.maxPieces).map((p) => {
    const cells = new Set<number>();
    let outside = 0;
    sampleTriangles(p, grid, budget, (c) => cells.add(c), () => outside++);
    return { cells: Int32Array.from(cells), outside, tris: Math.floor(p.length / 9) };
  });
  return buriedShare(placed, shell);
}

// ---------------------------------------------------------------- named criteria

const CRITERION_NAMES: Record<string, [string, SceneCriterion['group']]> = {
  parts: ['Every part is there', 'works'],
  proportions: ['Each part is the right size and shape', 'works'],
  placement: ['Each part is in its place', 'works'],
  facing: ['Facing the right way', 'works'],
  colour: ['Colour', 'looks'],
  surface: ['Surface and outline', 'looks'],
  triangles: ['Triangles', 'engineering'],
  meshes: ['Meshes', 'engineering'],
  codeSize: ['Code size', 'engineering'],
  reuse: ['Geometry and materials reused', 'engineering'],
  cleanGeometry: ['Clean geometry', 'engineering'],
  structure: ['Parts named and grouped', 'engineering'],
};

const MAX_NOTES = 4;

/** The criteria a player sees, each 0 to 1, with notes that name the parts. */
function buildCriteria(m: SceneMeasurements, c: SceneCombination, cClean: CleanFacts): SceneCriterion[] {
  void cClean;
  const v = sceneValues();
  const w = c.weights;
  const out: SceneCriterion[] = [];
  const add = (id: string, value: number | null, notes: { loss: number; text: string }[]) => {
    const [name, group] = CRITERION_NAMES[id];
    const sorted = notes.sort((a, b) => b.loss - a.loss).slice(0, MAX_NOTES).map((n) => n.text);
    out.push({ id, name, group, value: value === null ? null : r3(Math.min(1, Math.max(0, value))), notes: sorted });
  };
  const wmean = (vals: { w: number; x: number }[]) => {
    const sw = vals.reduce((s, a) => s + a.w, 0);
    return sw > 0 ? vals.reduce((s, a) => s + a.w * a.x, 0) / sw : null;
  };
  const matched = m.parts.map((p, i) => ({ p, i, f: c.factors[i] })).filter((x) => x.f);

  // ---- works ----
  const totalW = w.reduce((s, x) => s + x, 0);
  const meanW = w.length ? totalW / w.length : 0;
  const extraW = m.extras.reduce((s, e) => s + e.extra * Math.min(meanW, e.size), 0);
  const found = totalW > 0 ? m.parts.reduce((s, p, i) => s + w[i] * (p.matched ? 1 : p.inPlace), 0) / (totalW + extraW) : 1;
  const partNotes: { loss: number; text: string }[] = [];
  m.parts.forEach((p, i) => {
    if (!p.matched && p.inPlace < SCENE_PARTS.present) partNotes.push({ loss: w[i], text: `Parts: ${p.label} is missing.` });
  });
  const extras = m.extras.filter((e) => e.extra >= 0.5).length;
  if (extras) partNotes.push({ loss: meanW * extras, text: `Parts: ${extras === 1 ? 'a piece' : `${extras} pieces`} the goal does not have.` });
  add('parts', found, partNotes);

  const propNotes: { loss: number; text: string }[] = [];
  for (const { p, i, f } of matched) {
    if (f!.size < 0.97) {
      const r = p.sizeRatio;
      const text = r >= 1.95 ? `about ${times(r)} times too big along one side` : r > 1 ? `about ${pct(r - 1)} too big along one side` : r <= 1 / 1.95 ? `about ${times(1 / r)} times too small along one side` : `about ${pct(1 - r)} too small along one side`;
      propNotes.push({ loss: w[i] * (1 - f!.size), text: `Proportions: ${p.label} is ${text}.` });
    }
    if (f!.shape < 0.97) propNotes.push({ loss: w[i] * (1 - f!.shape), text: `Proportions: ${p.label} is a different shape from the goal's.` });
  }
  add('proportions', wmean(matched.map(({ i, f }) => ({ w: w[i], x: f!.size * f!.shape }))), propNotes);

  const placeNotes: { loss: number; text: string }[] = [];
  for (const { p, i, f } of matched) {
    if (f!.place < 0.97) placeNotes.push({ loss: w[i] * (1 - f!.place), text: `Placement: ${p.label} is about ${pct(p.move)} of the model's size out of its place.` });
  }
  const wh = m.whole;
  if (c.charges.size > 0) {
    const r = wh.scaleRatio;
    const how = r >= 1.95 ? `${times(r)} times bigger` : r > 1 ? `${pct(r - 1)} bigger` : r <= 1 / 1.95 ? `${times(1 / r)} times smaller` : `${pct(1 - r)} smaller`;
    placeNotes.push({ loss: totalW * c.charges.size * 4, text: `Placement: the whole model is about ${how} than the goal.` });
  }
  if (c.charges.position > 0) placeNotes.push({ loss: totalW * c.charges.position * 4, text: `Placement: the whole model stands about ${pct(wh.offset)} of the goal's size away from where the goal stands.` });
  const meanPlace = wmean(matched.map(({ i, f }) => ({ w: w[i], x: f!.place }))) ?? 1;
  add('placement', meanPlace * (1 - c.charges.size - c.charges.position), placeNotes);

  const faceNotes: { loss: number; text: string }[] = [];
  if (c.charges.turn > 0) faceNotes.push({ loss: totalW * c.charges.turn * 4, text: `Facing: the whole model is turned about ${Math.round(wh.turnDeg)} degrees from the goal's facing.` });
  if (wh.mirror) faceNotes.push({ loss: totalW * c.charges.mirror * 4, text: 'Facing: the model is a mirror image of the goal (left and right swapped).' });
  for (const { p, i, f } of matched) {
    if (f!.turn < 0.97) faceNotes.push({ loss: w[i] * (1 - f!.turn), text: `Facing: ${p.label} is at a different angle, about ${Math.round(p.turnDeg / 5) * 5} degrees off.` });
  }
  const turnMax = v['place.turn'] + v['place.mirror'];
  const meanTurn = wmean(matched.map(({ i, f }) => ({ w: w[i], x: f!.turn }))) ?? 1;
  add('facing', (1 - (c.charges.turn + c.charges.mirror) / turnMax) * meanTurn, faceNotes);

  // ---- looks ----
  const colourNotes: { loss: number; text: string }[] = [];
  m.parts.forEach((p, i) => {
    const a = c.colourAgree[i];
    if (a === null || a >= 0.9 || p.colourWeight <= 0) return;
    colourNotes.push({ loss: w[i] * p.colourWeight * (1 - a), text: `Colour: ${p.label} is a different colour from the goal's (difference ${Math.round(p.colourDiff!)}; up to ${Math.round(v['looks.colorFull'])} looks the same).` });
  });
  add('colour', c.colour, colourNotes);

  const surfNotes: { loss: number; text: string }[] = [];
  if (m.viewParts.length) {
    const worstOutline = m.viewParts.reduce((a, x, i) => (x.outline < m.viewParts[a].outline ? i : a), 0);
    if (m.viewParts[worstOutline].outline < 0.9) surfNotes.push({ loss: 1 - m.viewParts[worstOutline].outline, text: `Surface: the outline differs most in the ${SCENE_VIEWS[worstOutline]?.label ?? 'views'} (${pct(m.viewParts[worstOutline].outline)} overlap).` });
    const worstEdges = m.viewParts.reduce((a, x, i) => (x.edges < m.viewParts[a].edges ? i : a), 0);
    if (m.viewParts[worstEdges].edges < 0.85) surfNotes.push({ loss: 1 - m.viewParts[worstEdges].edges, text: `Surface: hard edges show where the goal is smooth (${SCENE_VIEWS[worstEdges]?.label ?? 'views'}): curves need enough segments.` });
  }
  if (m.wire > 0.01) surfNotes.push({ loss: m.wire * 2, text: `Surface: ${pct(m.wire)} of the model is drawn as wireframe, which shows only edges.` });
  add('surface', c.form * (1 - m.wire), surfNotes);

  // ---- engineering ----
  const countNote = (label: string, noun: string, [cv, gv]: [number, number], cc: { ratio: number; credit: number }) =>
    cc.credit < 1 ? [{ loss: 1 - cc.credit, text: `${label}: ${cv.toLocaleString('en-US')} ${noun} against the goal's ${gv.toLocaleString('en-US')} (${many(cv / Math.max(1, gv), noun)} the goal).` }] : [];
  add('triangles', Math.max(0, c.counts.triangles.credit), countNote('Triangles', 'triangles', m.counts.triangles, c.counts.triangles));
  add('meshes', Math.max(0, c.counts.meshes.credit), countNote('Meshes', 'meshes', m.counts.meshes, c.counts.meshes));
  add('codeSize', Math.max(0, c.counts.sourceBytes.credit), countNote('Code size', 'bytes', m.counts.sourceBytes, c.counts.sourceBytes));

  const reuseNotes: { loss: number; text: string }[] = [];
  if (m.reuse && c.reuse.value !== null && c.reuse.value < 0.97) {
    const r = m.reuse;
    for (const [kind, word] of [['geometries', 'shape'], ['materials', 'material']] as const) {
      const [cv, gv] = r[kind];
      if (gv < r.objects[1] && cv / Math.max(1, r.objects[0]) > gv / Math.max(1, r.objects[1]) + 0.05) {
        reuseNotes.push({ loss: cv / Math.max(1, r.objects[0]), text: `Reuse: ${cv} ${kind} for ${r.objects[0]} objects, where the goal shares ${gv} among ${r.objects[1]}: make a ${word} once and reuse it for every copy.` });
      }
    }
  }
  add('reuse', c.reuse.value, reuseNotes);

  const x = cleanExcess(m.clean);
  const cleanNotes: { loss: number; text: string }[] = [];
  if (x.duplicate > 0.01) cleanNotes.push({ loss: x.duplicate, text: `Clean geometry: about ${pct(m.clean.duplicate[0])} of the triangles are built twice, in the same place.` });
  if (x.buried > 0.01) cleanNotes.push({ loss: x.buried, text: `Clean geometry: about ${pct(m.clean.buried[0])} of the triangles are in parts hidden inside the model, which nobody can see.` });
  if (x.flipped > 0.01) cleanNotes.push({ loss: x.flipped, text: `Clean geometry: about ${pct(m.clean.flipped[0])} of the triangles face inside out (a negative scale or a back-side material), so their outsides are not drawn.` });
  if (x.degenerate > 0.01) cleanNotes.push({ loss: x.degenerate, text: `Clean geometry: about ${pct(m.clean.degenerate[0])} of the triangles have no area.` });
  add('cleanGeometry', c.clean.value, cleanNotes);

  const structNotes: { loss: number; text: string }[] = [];
  if (m.structure && c.structure.value !== null && c.structure.value < 0.97) {
    const s = m.structure;
    if (s.named[1] > 0 && s.named[0] < s.named[1] - 0.05) structNotes.push({ loss: s.named[1] - s.named[0], text: `Structure: ${pct(s.named[0])} of the meshes are named, where the goal names ${pct(s.named[1])}: give each part a name (mesh.name).` });
    if (s.groups[1] > 0 && s.groups[0] < s.groups[1] && s.meshes[0] >= 3) structNotes.push({ loss: 0.5, text: `Structure: ${s.groups[0]} groups of parts, where the goal has ${s.groups[1]}: put each assembly (a wheel and its hub, a leg set) in a THREE.Group.` });
  }
  add('structure', c.structure.value, structNotes);
  return out;
}

const NOTE_PREFIX: Record<string, string> = {
  parts: 'Parts', proportions: 'Proportions', placement: 'Placement', facing: 'Facing', colour: 'Colour', surface: 'Surface',
  triangles: 'Triangles', meshes: 'Meshes', codeSize: 'Code size', reuse: 'Reuse', cleanGeometry: 'Clean geometry', structure: 'Structure',
};

/** Each criterion's notes are its costliest checks (above 0.01 points), and its points their sum. */
function withChecks(criteria: SceneCriterion[], checks: SceneCheck[], byCriterion: Record<string, number>): SceneCriterion[] {
  return criteria.map((c) => ({
    ...c,
    points: byCriterion[c.id] ?? 0,
    notes: checks.filter((k) => k.criterion === c.id && k.points > 0.01).slice(0, MAX_NOTES).map((k) => noteOf(NOTE_PREFIX[c.id] ?? c.name, k)),
  }));
}

/** At most eight lines: the costliest checks (above 0.01 points), costliest first, worded as the criteria's notes. */
function criteriaFeedbackOf(checks: SceneCheck[]): string[] {
  return checks.filter((k) => k.points > 0.01).slice(0, 8).map((k) => noteOf(NOTE_PREFIX[k.criterion] ?? k.criterion, k));
}
