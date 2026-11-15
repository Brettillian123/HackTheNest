import { SCENE_PARTS } from './config';
import type { Bounds, SceneData } from './types';

/**
 * Parts and placement: language-neutral steps on a triangle list.
 *
 * A part is a connected piece of surface: triangles that share a corner
 * position belong together, whichever mesh they came from. So a leg is one
 * part whether it is its own mesh or merged into one big geometry, and two
 * seat halves that meet along a face are one piece.
 */

/** Splits every visible triangle of a scene into connected pieces, each as its own triangle list. */
export function connectedPieces(scene: SceneData, diagonal: number, maxPieces = Infinity): Float32Array[] {
  const q = Math.max(diagonal, 1e-9) * SCENE_PARTS.weld;
  const ids = new Map<string, number>();
  const parent: number[] = [];
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const idOf = (x: number, y: number, z: number): number => {
    const key = `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = parent.length;
      parent.push(id);
      ids.set(key, id);
    }
    return id;
  };
  const lists = scene.meshes.filter((m) => m.opacity > 0).map((m) => m.positions);
  const corner: number[] = []; // first corner id of each triangle, in order
  for (const p of lists) {
    for (let t = 0; t + 9 <= p.length; t += 9) {
      const a = idOf(p[t], p[t + 1], p[t + 2]);
      const b = idOf(p[t + 3], p[t + 4], p[t + 5]);
      const c = idOf(p[t + 6], p[t + 7], p[t + 8]);
      const ra = find(a), rb = find(b), rc = find(c);
      // Join to the smaller id, so the result does not depend on hashing.
      const root = Math.min(ra, rb, rc);
      parent[ra] = root;
      parent[rb] = root;
      parent[rc] = root;
      corner.push(a);
    }
  }
  // Group triangles by their piece, pieces in order of first appearance.
  const order = new Map<number, number[]>();
  let k = 0;
  for (const p of lists) {
    for (let t = 0; t + 9 <= p.length; t += 9) {
      const root = find(corner[k++]);
      let list = order.get(root);
      if (!list) {
        if (order.size >= maxPieces) continue;
        list = [];
        order.set(root, list);
      }
      for (let i = 0; i < 9; i++) list.push(p[t + i]);
    }
  }
  return [...order.values()].map((l) => new Float32Array(l));
}

export const centerOfBox = (b: Bounds): [number, number, number] => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
];

export const diagonalOf = (b: Bounds) => Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);

/** How a submission was lined up with the goal: p' = (p - from) x scale + to. */
export interface Alignment {
  from: [number, number, number];
  to: [number, number, number];
  /** Goal diagonal / submission diagonal. */
  scale: number;
}

/** Lines a scene's bounding-box centre and diagonal up with the goal's. Translation and one uniform scale only. */
export function alignmentFor(candidate: Bounds, goal: Bounds): Alignment {
  const dc = diagonalOf(candidate);
  const dg = diagonalOf(goal);
  return { from: centerOfBox(candidate), to: centerOfBox(goal), scale: dc > 1e-9 ? dg / dc : 1 };
}

/** A copy of the scene, moved and scaled. Counts and source size are kept: they describe the code, not the placement. */
export function applyAlignment(scene: SceneData, a: Alignment): SceneData {
  return {
    ...scene,
    meshes: scene.meshes.map((m) => {
      const p = m.positions;
      const out = new Float32Array(p.length);
      for (let i = 0; i < p.length; i += 3) {
        out[i] = (p[i] - a.from[0]) * a.scale + a.to[0];
        out[i + 1] = (p[i + 1] - a.from[1]) * a.scale + a.to[1];
        out[i + 2] = (p[i + 2] - a.from[2]) * a.scale + a.to[2];
      }
      return { ...m, positions: out };
    }),
  };
}

/** Bounding box of several triangle lists; null when they are empty. */
export function boundsOfLists(lists: Float32Array[]): Bounds | null {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of lists) {
    for (let i = 0; i + 2 < p.length; i += 3) {
      if (p[i] < x0) x0 = p[i];
      if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < y0) y0 = p[i + 1];
      if (p[i + 1] > y1) y1 = p[i + 1];
      if (p[i + 2] < z0) z0 = p[i + 2];
      if (p[i + 2] > z1) z1 = p[i + 2];
    }
  }
  return x0 === Infinity ? null : { min: [x0, y0, z0], max: [x1, y1, z1] };
}

/** One triangle list, moved and scaled. */
export function alignPositions(p: Float32Array, a: Alignment): Float32Array {
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    out[i] = (p[i] - a.from[0]) * a.scale + a.to[0];
    out[i + 1] = (p[i + 1] - a.from[1]) * a.scale + a.to[1];
    out[i + 2] = (p[i + 2] - a.from[2]) * a.scale + a.to[2];
  }
  return out;
}
