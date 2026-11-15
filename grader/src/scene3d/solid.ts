import { SCENE_SHAPE } from './config';
import type { Bounds } from './types';

/**
 * Solids on a dense voxel grid. A scene's surfaces are marked on the grid,
 * everything they enclose is filled, and only the outer skin of the result
 * (the voxels you could touch from outside) is compared. So a solid box, a
 * hollow box and six thin planes forming a closed cube are the same solid,
 * and faces hidden inside a model never count. An open shape (a single
 * plane, an open cone) encloses nothing and stays a surface.
 */

export type Vec3 = [number, number, number];

export interface Dense {
  origin: Vec3;
  /** Edge length of one voxel, in scene units. */
  size: number;
  dims: Vec3;
}

/** A grid over a box, `resolution` voxels along its longest side plus padding on every side. */
export function denseGrid(bounds: Bounds, resolution: number, padding: number = SCENE_SHAPE.padding): Dense {
  const ext = [0, 1, 2].map((k) => bounds.max[k] - bounds.min[k]);
  const longest = Math.max(ext[0], ext[1], ext[2], 1e-6);
  const pad = longest * padding;
  const size = (longest + 2 * pad) / resolution;
  const dims = [0, 1, 2].map((k) => Math.max(3, Math.ceil((ext[k] + 2 * pad) / size))) as Vec3;
  // Centre the grid on the box, so a box and its mirror image fall on the grid alike.
  const origin = [0, 1, 2].map((k) => (bounds.min[k] + bounds.max[k]) / 2 - (dims[k] * size) / 2) as Vec3;
  return { origin, size, dims };
}

export const cellCount = (g: Dense) => g.dims[0] * g.dims[1] * g.dims[2];

/** Sampling budget shared between calls. */
export interface Budget {
  left: number;
}

/**
 * Calls `inside(cellIndex)` for every grid cell some triangles pass through
 * (repeats possible), and `outside(key)` for every sample that lands off the
 * grid, with a key naming its off-grid voxel.
 */
export function sampleTriangles(
  p: Float32Array,
  g: Dense,
  budget: Budget,
  inside: (cell: number) => void,
  outside?: (key: number) => void,
): void {
  const [ox, oy, oz] = g.origin;
  const inv = 1 / g.size;
  const [nx, ny, nz] = g.dims;
  // Samples go by area: a row of points along the triangle's longest edge every
  // `spacing` voxels, and as many rows across as its height needs. A long thin
  // sliver costs a row or two, not its longest edge squared. When the budget is
  // tight, the spacing of the whole list widens so every triangle gets its share.
  const T = Math.floor(p.length / 9);
  const plan = new Float64Array(T * 2);
  let need = 0;
  for (let k = 0, t = 0; k < T; k++, t += 9) {
    const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
    const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
    const wx = p[t + 6] - p[t + 3], wy = p[t + 7] - p[t + 4], wz = p[t + 8] - p[t + 5];
    const longest = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(wx, wy, wz)) * inv;
    const area = (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2) * inv * inv;
    const height = longest > 1e-12 ? (2 * area) / longest : 0;
    plan[2 * k] = Number.isFinite(longest) ? longest : 0;
    plan[2 * k + 1] = Number.isFinite(height) ? height : 0;
    need += (plan[2 * k] / SCENE_SHAPE.sampleSpacing + 2) * (plan[2 * k + 1] / SCENE_SHAPE.sampleSpacing + 2);
  }
  const left = Math.max(budget.left, 4 * T);
  const spacing = SCENE_SHAPE.sampleSpacing * Math.max(1, Math.sqrt(need / left));
  const visit = (fx: number, fy: number, fz: number) => {
    const x = Math.floor(fx), y = Math.floor(fy), z = Math.floor(fz);
    if (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz) inside((x * ny + y) * nz + z);
    else if (outside) {
      // Off-grid voxels, clamped far out so the key stays a safe integer.
      const cxk = Math.max(-4096, Math.min(4095, x)) + 4096;
      const cyk = Math.max(-4096, Math.min(4095, y)) + 4096;
      const czk = Math.max(-4096, Math.min(4095, z)) + 4096;
      outside((cxk * 8192 + cyk) * 8192 + czk);
    }
  };
  let used = 0;
  for (let k = 0, t = 0; k < T; k++, t += 9) {
    const P = [
      [(p[t] - ox) * inv, (p[t + 1] - oy) * inv, (p[t + 2] - oz) * inv],
      [(p[t + 3] - ox) * inv, (p[t + 4] - oy) * inv, (p[t + 5] - oz) * inv],
      [(p[t + 6] - ox) * inv, (p[t + 7] - oy) * inv, (p[t + 8] - oz) * inv],
    ];
    if (!P.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]) && Number.isFinite(q[2]))) continue;
    // The longest edge runs from a to b; c is the far corner.
    const len = (i: number, j: number) => Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1], P[j][2] - P[i][2]);
    const e = [len(0, 1), len(1, 2), len(2, 0)];
    const top = e[0] >= e[1] && e[0] >= e[2] ? 0 : e[1] >= e[2] ? 1 : 2;
    const a = P[top], b = P[(top + 1) % 3], c = P[(top + 2) % 3];
    let nl = Math.max(1, Math.ceil(plan[2 * k] / spacing));
    let nh = Math.max(1, Math.ceil(plan[2 * k + 1] / spacing));
    const cap = SCENE_SHAPE.maxSamplesPerTriangle;
    if ((nl + 1) * (nh + 1) > cap) {
      const f = Math.sqrt(cap / ((nl + 1) * (nh + 1)));
      nl = Math.max(1, Math.floor(nl * f));
      nh = Math.max(1, Math.floor(nh * f));
    }
    // Rows from the long edge (t = 0) to the far corner (t = 1); along each row, from side to side.
    for (let j = 0; j <= nh; j++) {
      const tt = j / nh;
      const sx = a[0] + (c[0] - a[0]) * tt, sy = a[1] + (c[1] - a[1]) * tt, sz = a[2] + (c[2] - a[2]) * tt;
      const ex = b[0] + (c[0] - b[0]) * tt, ey = b[1] + (c[1] - b[1]) * tt, ez = b[2] + (c[2] - b[2]) * tt;
      const m = Math.max(1, Math.ceil(nl * (1 - tt)));
      for (let i = 0; i <= m; i++) {
        const s = i / m;
        visit(sx + (ex - sx) * s, sy + (ey - sy) * s, sz + (ez - sz) * s);
        used++;
      }
    }
  }
  budget.left = Math.max(0, budget.left - used);
}

/** Marks every cell some triangle lists pass through with 1. */
export function surfaceGrid(lists: Float32Array[], g: Dense, budget: Budget = { left: SCENE_SHAPE.maxSamplesPerScene }): Uint8Array {
  const occ = new Uint8Array(cellCount(g));
  for (const p of lists) sampleTriangles(p, g, budget, (c) => (occ[c] = 1));
  return occ;
}

/**
 * Fills every empty cell that cannot be reached from the grid's border
 * through empty cells (face to face): what the surfaces enclose. Filled
 * cells get 2. Works in place.
 */
export function fillEnclosed(occ: Uint8Array, g: Dense): void {
  const [nx, ny, nz] = g.dims;
  const N = nx * ny * nz;
  const reached = new Uint8Array(N);
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  const push = (i: number) => {
    if (!occ[i] && !reached[i]) {
      reached[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) push((x * ny + y) * nz + z);
      }
    }
  }
  const sx = ny * nz;
  while (head < tail) {
    const i = queue[head++];
    const z = i % nz;
    const y = ((i - z) / nz) % ny;
    const x = (i - z - y * nz) / sx;
    if (x > 0) push(i - sx);
    if (x < nx - 1) push(i + sx);
    if (y > 0) push(i - nz);
    if (y < ny - 1) push(i + nz);
    if (z > 0) push(i - 1);
    if (z < nz - 1) push(i + 1);
  }
  for (let i = 0; i < N; i++) if (!occ[i] && !reached[i]) occ[i] = 2;
}

/** The outer skin of a filled grid: occupied cells with an empty neighbour (face to face) or on the border. */
export function shellOf(occ: Uint8Array, g: Dense): Uint8Array {
  const [nx, ny, nz] = g.dims;
  const out = new Uint8Array(occ.length);
  const sx = ny * nz;
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        const i = (x * ny + y) * nz + z;
        if (!occ[i]) continue;
        if (
          x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1 ||
          !occ[i - sx] || !occ[i + sx] || !occ[i - nz] || !occ[i + nz] || !occ[i - 1] || !occ[i + 1]
        ) {
          out[i] = 1;
        }
      }
    }
  }
  return out;
}

const INF = 1e20;

/** One-dimensional squared distance transform (Felzenszwalb and Huttenlocher). */
function dt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    if (f[q] >= INF) continue;
    if (f[v[k]] >= INF) {
      v[k] = q;
      continue;
    }
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  if (f[v[0]] >= INF) {
    for (let q = 0; q < n; q++) d[q] = INF;
    return;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Distance (in voxels) from every cell to the nearest marked cell; a large number when nothing is marked. */
export function distanceField(marked: Uint8Array, g: Dense): Float32Array {
  const [nx, ny, nz] = g.dims;
  const N = nx * ny * nz;
  const D = new Float64Array(N);
  for (let i = 0; i < N; i++) D[i] = marked[i] ? 0 : INF;
  const m = Math.max(nx, ny, nz);
  const f = new Float64Array(m);
  const d = new Float64Array(m);
  const v = new Int32Array(m);
  const zz = new Float64Array(m + 1);
  // along z
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      const base = (x * ny + y) * nz;
      for (let q = 0; q < nz; q++) f[q] = D[base + q];
      dt1(f, nz, d, v, zz);
      for (let q = 0; q < nz; q++) D[base + q] = d[q];
    }
  }
  // along y
  for (let x = 0; x < nx; x++) {
    for (let z = 0; z < nz; z++) {
      for (let q = 0; q < ny; q++) f[q] = D[(x * ny + q) * nz + z];
      dt1(f, ny, d, v, zz);
      for (let q = 0; q < ny; q++) D[(x * ny + q) * nz + z] = d[q];
    }
  }
  // along x
  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) {
      for (let q = 0; q < nx; q++) f[q] = D[(q * ny + y) * nz + z];
      dt1(f, nx, d, v, zz);
      for (let q = 0; q < nx; q++) D[(q * ny + y) * nz + z] = d[q];
    }
  }
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = D[i] >= INF / 2 ? 1e9 : Math.sqrt(D[i]);
  return out;
}

/** A solid's skin and the distance to it, on one grid. */
export interface Field {
  grid: Dense;
  /** Distance in voxels to the nearest skin cell. */
  dist: Float32Array;
  /** Skin cells. */
  shell: Uint8Array;
  /** Occupied cells (surface 1, filled inside 2). */
  occ: Uint8Array;
}

/** Builds the solid of some triangle lists on a grid: fill, skin, distance. */
export function solidField(lists: Float32Array[], g: Dense): Field {
  const occ = surfaceGrid(lists, g);
  fillEnclosed(occ, g);
  const shell = shellOf(occ, g);
  return { grid: g, shell, occ, dist: distanceField(shell, g) };
}

/** Distance (voxels of the field's grid) at a world point, read between cells; 1e9 off the grid. */
export function sampleField(F: Field, x: number, y: number, z: number): number {
  const g = F.grid;
  const [nx, ny, nz] = g.dims;
  const u = (x - g.origin[0]) / g.size - 0.5;
  const v = (y - g.origin[1]) / g.size - 0.5;
  const w = (z - g.origin[2]) / g.size - 0.5;
  const i = Math.floor(u), j = Math.floor(v), k = Math.floor(w);
  if (i < 0 || j < 0 || k < 0 || i + 1 >= nx || j + 1 >= ny || k + 1 >= nz) return 1e9;
  const fu = u - i, fv = v - j, fw = w - k;
  const D = F.dist;
  const i00 = (i * ny + j) * nz + k;
  const i10 = i00 + ny * nz;
  const c000 = D[i00], c001 = D[i00 + 1], c010 = D[i00 + nz], c011 = D[i00 + nz + 1];
  const c100 = D[i10], c101 = D[i10 + 1], c110 = D[i10 + nz], c111 = D[i10 + nz + 1];
  const c00 = c000 + (c001 - c000) * fw, c01 = c010 + (c011 - c010) * fw;
  const c10 = c100 + (c101 - c100) * fw, c11 = c110 + (c111 - c110) * fw;
  const c0 = c00 + (c01 - c00) * fv, c1 = c10 + (c11 - c10) * fv;
  return c0 + (c1 - c0) * fu;
}

/** World position of a cell's centre. */
export function cellCenter(g: Dense, cell: number): Vec3 {
  const [, ny, nz] = g.dims;
  const z = cell % nz;
  const y = ((cell - z) / nz) % ny;
  const x = (cell - z - y * nz) / (ny * nz);
  return [g.origin[0] + (x + 0.5) * g.size, g.origin[1] + (y + 0.5) * g.size, g.origin[2] + (z + 0.5) * g.size];
}

/** Credit for a distance (voxels): 1 within `full`, 0 from `zero` on, a straight line between. */
export function softCredit(d: number, full: number, zero: number): number {
  if (d <= full) return 1;
  if (d >= zero) return 0;
  return 1 - (d - full) / (zero - full);
}
