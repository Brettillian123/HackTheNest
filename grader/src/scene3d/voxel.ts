import { SCENE_SHAPE } from './config';
import type { Bounds, SceneData } from './types';

/**
 * Judges the solid shape, not how it was cut into meshes: the surfaces of
 * both scenes are marked on one voxel grid laid over the goal, and the two
 * sets of marked voxels are compared with a small tolerance. A table built
 * as five boxes and as one merged geometry mark the same voxels.
 */

export interface Grid {
  origin: [number, number, number];
  /** Edge length of one voxel, in scene units. */
  size: number;
  /** Voxels along each axis inside the grid (material outside it still counts, as extra). */
  dims: [number, number, number];
}

// Voxel coordinates are kept in [-OFFSET, OFFSET); material further out is
// clamped to the edge, which still counts as extra.
const OFFSET = 1024;
const SPAN = OFFSET * 2;

const keyOf = (x: number, y: number, z: number) => ((x + OFFSET) * SPAN + (y + OFFSET)) * SPAN + (z + OFFSET);
const clampCoord = (v: number) => (v < -OFFSET ? -OFFSET : v >= OFFSET ? OFFSET - 1 : v);

/** The grid over the goal's bounding box, padded on every side. */
export function gridFor(bounds: Bounds, resolution: number): Grid {
  const ext = [0, 1, 2].map((k) => bounds.max[k] - bounds.min[k]);
  const longest = Math.max(ext[0], ext[1], ext[2], 1e-6);
  const pad = longest * SCENE_SHAPE.padding;
  const size = (longest + 2 * pad) / resolution;
  const origin = [0, 1, 2].map((k) => bounds.min[k] - pad) as [number, number, number];
  const dims = [0, 1, 2].map((k) => Math.max(1, Math.ceil((ext[k] + 2 * pad) / size))) as [number, number, number];
  return { origin, size, dims };
}

/** Marks every voxel a scene's surfaces pass through. */
export function voxelize(scene: SceneData, grid: Grid): Set<number> {
  return voxelizePositions(
    scene.meshes.filter((m) => m.opacity > 0).map((m) => m.positions),
    grid,
  );
}

/** Sampling budget shared between several calls, so splitting a scene into pieces costs no more than the whole. */
export interface Budget {
  left: number;
}

/** Marks every voxel some triangles pass through (9 numbers per triangle). */
export function voxelizePositions(
  lists: Float32Array[],
  grid: Grid,
  shared: Budget = { left: SCENE_SHAPE.maxSamplesPerScene },
): Set<number> {
  const set = new Set<number>();
  const { origin, size } = grid;
  const inv = 1 / size;
  for (const p of lists) {
    for (let t = 0; t + 9 <= p.length && shared.left > 0; t += 9) {
      const budget = shared.left;
      // Corners in voxel units.
      const ax = (p[t] - origin[0]) * inv, ay = (p[t + 1] - origin[1]) * inv, az = (p[t + 2] - origin[2]) * inv;
      const bx = (p[t + 3] - origin[0]) * inv, by = (p[t + 4] - origin[1]) * inv, bz = (p[t + 5] - origin[2]) * inv;
      const cx = (p[t + 6] - origin[0]) * inv, cy = (p[t + 7] - origin[1]) * inv, cz = (p[t + 8] - origin[2]) * inv;
      const longest = Math.max(
        Math.hypot(bx - ax, by - ay, bz - az),
        Math.hypot(cx - bx, cy - by, cz - bz),
        Math.hypot(ax - cx, ay - cy, az - cz),
      );
      let n = Math.max(1, Math.ceil(longest / SCENE_SHAPE.sampleSpacing));
      // (n + 1)(n + 2) / 2 samples; a huge triangle is sampled more coarsely.
      const cap = Math.min(SCENE_SHAPE.maxSamplesPerTriangle, budget);
      if (((n + 1) * (n + 2)) / 2 > cap) n = Math.max(1, Math.floor(Math.sqrt(2 * cap)) - 2);
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n - i; j++) {
          const u = i / n;
          const v = j / n;
          const w = 1 - u - v;
          const x = Math.floor(w * ax + u * bx + v * cx);
          const y = Math.floor(w * ay + u * by + v * cy);
          const z = Math.floor(w * az + u * bz + v * cz);
          set.add(keyOf(clampCoord(x), clampCoord(y), clampCoord(z)));
        }
      }
      shared.left -= ((n + 1) * (n + 2)) / 2;
    }
  }
  return set;
}

export interface ShapeComparison {
  /** 0 to 1: share of both scenes' surface that the other scene also has, within the tolerance. */
  match: number;
  goalVoxels: number;
  candidateVoxels: number;
  /** Goal surface voxels with no candidate surface nearby. */
  missing: number;
  /** Candidate surface voxels with no goal surface nearby. */
  extra: number;
  /** Mean position (scene units) of the missing and extra voxels; null when there are none. */
  missingAt: [number, number, number] | null;
  extraAt: [number, number, number] | null;
}

function decode(key: number): [number, number, number] {
  const z = (key % SPAN) - OFFSET;
  const rest = Math.floor(key / SPAN);
  const y = (rest % SPAN) - OFFSET;
  const x = Math.floor(rest / SPAN) - OFFSET;
  return [x, y, z];
}

/** For each voxel of `from`, whether `to` has a voxel within the tolerance. Returns the unmatched ones. */
function unmatched(from: Set<number>, to: Set<number>): number[] {
  const r = SCENE_SHAPE.toleranceVoxels;
  const out: number[] = [];
  for (const key of from) {
    if (to.has(key)) continue;
    const [x, y, z] = decode(key);
    let found = false;
    for (let dx = -r; dx <= r && !found; dx++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dz = -r; dz <= r && !found; dz++) {
          if (to.has(keyOf(clampCoord(x + dx), clampCoord(y + dy), clampCoord(z + dz)))) found = true;
        }
      }
    }
    if (!found) out.push(key);
  }
  return out;
}

function centroid(keys: number[], grid: Grid): [number, number, number] | null {
  if (keys.length === 0) return null;
  let sx = 0, sy = 0, sz = 0;
  for (const k of keys) {
    const [x, y, z] = decode(k);
    sx += x;
    sy += y;
    sz += z;
  }
  const n = keys.length;
  return [
    grid.origin[0] + (sx / n + 0.5) * grid.size,
    grid.origin[1] + (sy / n + 0.5) * grid.size,
    grid.origin[2] + (sz / n + 0.5) * grid.size,
  ];
}

export function compareShapes(goal: Set<number>, candidate: Set<number>, grid: Grid): ShapeComparison {
  const missing = unmatched(goal, candidate);
  const extra = unmatched(candidate, goal);
  const total = goal.size + candidate.size;
  const match = total === 0 ? 1 : (goal.size - missing.length + candidate.size - extra.length) / total;
  return {
    match,
    goalVoxels: goal.size,
    candidateVoxels: candidate.size,
    missing: missing.length,
    extra: extra.length,
    missingAt: centroid(missing, grid),
    extraAt: centroid(extra, grid),
  };
}

/** Share (0 to 1) of `from`'s voxels that have a voxel of `to` within the tolerance. 1 for an empty `from`. */
export function coverage(from: Set<number>, to: Set<number>): number {
  return from.size === 0 ? 1 : 1 - unmatched(from, to).length / from.size;
}

/** Mean position (scene units) of a set of voxels; null when empty. */
export function centerOf(voxels: Set<number>, grid: Grid): [number, number, number] | null {
  return centroid([...voxels], grid);
}
