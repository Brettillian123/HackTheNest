import { SCENE_MATCH } from './config';
import type { Vec3 } from './solid';
import type { RGB } from './types';

/**
 * Finding the goal's parts the way a person does: piece by piece.
 *
 * Model output builds an object from separate pieces (one mesh per part, or
 * the connected lumps of a merged mesh). After the whole model is lined up,
 * each goal part is matched to one piece of the submission, as one best
 * overall assignment, on where the piece is, how big it is and what shape it
 * is (each compared in its own box, so a part turned in place still matches).
 * A matched part earns a smooth credit: full when it is in place, the right
 * size and the right shape; less the further off it sits, the more it is
 * turned, stretched or misshapen; never under `floor` while it is clearly
 * there. A part with no piece that could be it is judged elsewhere (score.ts).
 */

const G = SCENE_MATCH.grid;

export interface Descriptor {
  /** Centre of the bounding box. */
  center: Vec3;
  lo: Vec3;
  hi: Vec3;
  /** Width, height, depth. */
  ext: Vec3;
  /** Box diagonal. */
  diag: number;
  /** Extents sorted, longest first. */
  sortedExt: Vec3;
  /** Principal axes (longest spread first) and the extents along them. */
  axes: [Vec3, Vec3, Vec3];
  pext: Vec3;
  /** Surface points (world). */
  points: Float64Array;
  /** Its outlines along each axis, on a small grid over its own box: world axes (longest first) and principal axes. */
  sigW: Uint8Array[];
  sigP: Uint8Array[];
  color: RGB | null;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Boxes of some triangle lists, without anything else (for a first, cheap look). */
export function boxOf(lists: Float32Array[]): { lo: Vec3; hi: Vec3; center: Vec3; ext: Vec3; diag: number; sortedExt: Vec3 } | null {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of lists) {
    for (let i = 0; i + 2 < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p[i + k];
        if (!Number.isFinite(v)) continue;
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
    }
  }
  if (lo[0] === Infinity) return null;
  const ext: Vec3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  return {
    lo, hi, ext,
    center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    diag: Math.hypot(...ext),
    sortedExt: [...ext].sort((a, b) => b - a) as Vec3,
  };
}

/** Eigenvectors of a symmetric 3 x 3 matrix (Jacobi), largest eigenvalue first. */
function eigen(m: number[][]): { values: Vec3; vectors: [Vec3, Vec3, Vec3] } {
  const a = m.map((r) => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 32; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i] || i - j);
  const vectors = order.map((i) => {
    const vec: Vec3 = [v[0][i], v[1][i], v[2][i]];
    // A fixed sign: the largest component positive.
    const big = [0, 1, 2].reduce((x, y) => (Math.abs(vec[y]) > Math.abs(vec[x]) + 1e-12 ? y : x), 0);
    return (vec[big] < 0 ? vec.map((x) => -x) : vec) as Vec3;
  }) as [Vec3, Vec3, Vec3];
  return { values: order.map((i) => a[i][i]) as Vec3, vectors };
}

/** The radical inverse of n in a base: a fixed, evenly spread number in [0, 1). */
function halton(n: number, base: number): number {
  let f = 1, r = 0;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

/** Surface points of some triangle lists, by area (every triangle at least one). */
function surfacePoints(lists: Float32Array[]): Float64Array {
  let total = 0;
  const areas: number[] = [];
  for (const p of lists) {
    for (let t = 0; t + 9 <= p.length; t += 9) {
      const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
      const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
      const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      const ok = Number.isFinite(a) ? a : 0;
      areas.push(ok);
      total += ok;
    }
  }
  const out: number[] = [];
  let k = 0;
  for (const p of lists) {
    for (let t = 0; t + 9 <= p.length; t += 9) {
      const a = areas[k++];
      const want = total > 0 ? Math.max(1, Math.round((a / total) * SCENE_MATCH.samples)) : 1;
      // Spread over the triangle by a fixed low-discrepancy sequence (different for every
      // triangle), so long thin triangles side by side do not leave the same gaps.
      for (let i = 0; i < want; i++) {
        let u = halton(k * 7919 + i + 1, 2), v = halton(k * 7919 + i + 1, 3);
        if (u + v > 1) {
          u = 1 - u;
          v = 1 - v;
        }
        const w = 1 - u - v;
        const x = w * p[t] + u * p[t + 3] + v * p[t + 6];
        const y = w * p[t + 1] + u * p[t + 4] + v * p[t + 7];
        const z = w * p[t + 2] + u * p[t + 5] + v * p[t + 8];
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) out.push(x, y, z);
      }
    }
  }
  return Float64Array.from(out);
}

/**
 * A piece's outline seen along each axis of a frame, on a small grid over its
 * own box: three filled silhouettes (a closed surface covers its whole outline).
 */
function signature(points: Float64Array, origin: Vec3, axes: Vec3[], lo: number[], hi: number[]): Uint8Array[] {
  const out = [new Uint8Array(G * G), new Uint8Array(G * G), new Uint8Array(G * G)];
  // A side far thinner than the piece is flat: a disc and a thin cylinder have the same outline from the side.
  const spans = [0, 1, 2].map((k) => hi[k] - lo[k]);
  const flat = spans.map((v) => v < SCENE_MATCH.flatShare * Math.max(...spans));
  const mark = (sil: Uint8Array, u: number, v: number, fu: boolean, fv: boolean) => {
    for (let a = fu ? 0 : u; a <= (fu ? G - 1 : u); a++) for (let b = fv ? 0 : v; b <= (fv ? G - 1 : v); b++) sil[a * G + b] = 1;
  };
  for (let i = 0; i < points.length; i += 3) {
    const d: Vec3 = [points[i] - origin[0], points[i + 1] - origin[1], points[i + 2] - origin[2]];
    const c = [0, 1, 2].map((k) => {
      const span = hi[k] - lo[k];
      const q = span > 1e-9 ? (dot(d, axes[k]) - lo[k]) / span : 0.5;
      return Math.min(G - 1, Math.max(0, Math.floor(q * G)));
    });
    mark(out[0], c[1], c[2], flat[1], flat[2]);
    mark(out[1], c[0], c[2], flat[0], flat[2]);
    mark(out[2], c[0], c[1], flat[0], flat[1]);
  }
  return out;
}

/** Everything the match looks at for one piece or part. */
export function describe(lists: Float32Array[], color: RGB | null): Descriptor | null {
  const box = boxOf(lists);
  if (!box) return null;
  const points = surfacePoints(lists);
  const n = points.length / 3;
  const mean: Vec3 = [0, 0, 0];
  for (let i = 0; i < points.length; i += 3) for (let k = 0; k < 3; k++) mean[k] += points[i + k] / Math.max(1, n);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < points.length; i += 3) {
    const d = [points[i] - mean[0], points[i + 1] - mean[1], points[i + 2] - mean[2]];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a][b] += (d[a] * d[b]) / Math.max(1, n);
  }
  const { vectors } = eigen(cov);
  // Extents along the principal axes, from the corners themselves.
  const plo = [Infinity, Infinity, Infinity], phi = [-Infinity, -Infinity, -Infinity];
  for (const p of lists) {
    for (let i = 0; i + 2 < p.length; i += 3) {
      const d: Vec3 = [p[i] - mean[0], p[i + 1] - mean[1], p[i + 2] - mean[2]];
      if (!d.every(Number.isFinite)) continue;
      for (let k = 0; k < 3; k++) {
        const v = dot(d, vectors[k]);
        if (v < plo[k]) plo[k] = v;
        if (v > phi[k]) phi[k] = v;
      }
    }
  }
  const pext = [0, 1, 2].map((k) => Math.max(0, phi[k] - plo[k])) as Vec3;
  // The principal frame, longest extent first.
  const porder = [0, 1, 2].sort((a, b) => pext[b] - pext[a] || a - b);
  const axesP = porder.map((k) => vectors[k]) as [Vec3, Vec3, Vec3];
  const sp = signature(points, mean, axesP, porder.map((k) => plo[k]), porder.map((k) => phi[k]));
  // The world frame as it is (the line-up has already turned the model).
  const worder = [0, 1, 2];
  const unit: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const sw = signature(points, [0, 0, 0], worder.map((k) => unit[k]), worder.map((k) => box.lo[k]), worder.map((k) => box.hi[k]));
  return {
    center: box.center, lo: box.lo, hi: box.hi, ext: box.ext, diag: box.diag, sortedExt: box.sortedExt,
    axes: axesP, pext: porder.map((k) => pext[k]) as Vec3, points,
    sigW: sw, sigP: sp, color,
  };
}

/** Overlap (intersection over union) of two silhouettes; the second flipped along its first and/or second grid axis. */
function iou(a: Uint8Array, b: Uint8Array, flipU: boolean, flipV: boolean): number {
  let both = 0, either = 0;
  for (let u = 0; u < G; u++) {
    const bu = flipU ? G - 1 - u : u;
    for (let v = 0; v < G; v++) {
      const x = a[u * G + v], y = b[bu * G + (flipV ? G - 1 - v : v)];
      if (x && y) both++;
      if (x || y) either++;
    }
  }
  return either ? both / either : 1;
}

/** Agreement of the three outlines: half the worst, half the mean (one very different view counts). */
function outlines(a: Uint8Array[], b: Uint8Array[], flip: number, perm: number[] = [0, 1, 2]): number {
  const f = [(flip & 1) !== 0, (flip & 2) !== 0, (flip & 4) !== 0];
  // Silhouette k is seen along axis k; its grid axes are the other two, in order. With the second
  // piece's axes renamed by `perm`, its silhouette along perm[k] is compared, transposed when the order swaps.
  const one = (k: number) => {
    const [u, v] = [0, 1, 2].filter((x) => x !== k);
    const [pu, pv] = [perm[u], perm[v]];
    const sil = b[perm[k]];
    const t = pu > pv ? transpose(sil) : sil;
    return iou(a[k], t, f[u], f[v]);
  };
  const v = [one(0), one(1), one(2)];
  return 0.5 * Math.min(...v) + 0.5 * (v[0] + v[1] + v[2]) / 3;
}

function transpose(s: Uint8Array): Uint8Array {
  const out = new Uint8Array(G * G);
  for (let u = 0; u < G; u++) for (let v = 0; v < G; v++) out[v * G + u] = s[u * G + v];
  return out;
}

const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/** 0 to 1: the same shape, each in its own box (the better of the world frame and the principal frame, which may face and be ordered either way). */
export function shapeAgreement(p: Descriptor, g: Descriptor): number {
  let best = outlines(p.sigW, g.sigW, 0);
  for (const perm of PERMS) for (let flip = 0; flip < 8 && best < 0.999; flip++) best = Math.max(best, outlines(p.sigP, g.sigP, flip, perm));
  return best;
}

/** Ratios of a piece's extents to a part's (longest first), with a little slack on thin sides; and the worst |log|. */
export function sizeRatios(pe: Vec3, ge: Vec3): { ratios: Vec3; err: number } {
  const eps = SCENE_MATCH.thinSlack * Math.max(ge[0], 1e-9);
  const ratios = [0, 1, 2].map((k) => (pe[k] + eps) / (ge[k] + eps)) as Vec3;
  return { ratios, err: Math.max(...ratios.map((r) => Math.abs(Math.log(r)))) };
}

/** The better of the world-frame and principal-frame size comparisons. */
export function sizeOf(p: Descriptor, g: Descriptor): { ratios: Vec3; err: number; frame: 'world' | 'principal' } {
  const w = sizeRatios(p.sortedExt, g.sortedExt);
  const q = sizeRatios(p.pext, g.pext);
  return q.err < w.err - 1e-9 ? { ...q, frame: 'principal' } : { ...w, frame: 'world' };
}

/** How far a piece is turned from a part, degrees, weighted by how much a turn can be seen (none for a ball). */
export function turnOf(p: Descriptor, g: Descriptor): { deg: number; seen: number } {
  const ramp = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
  const ratio = (e: Vec3, i: number, j: number) => (e[i] + 1e-9) / (e[j] + 1e-9);
  // A rod shows the turn of its long axis; a slab, of the axis through its face.
  const rod = Math.min(ramp(ratio(g.pext, 0, 1), 1.3, 2.5), ramp(ratio(p.pext, 0, 1), 1.3, 2.5));
  const slab = Math.min(ramp(ratio(g.pext, 1, 2), 1.3, 2.5), ramp(ratio(p.pext, 1, 2), 1.3, 2.5));
  const angle = (a: Vec3, b: Vec3) => (Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180) / Math.PI;
  const r = rod * angle(p.axes[0], g.axes[0]);
  const s = slab * angle(p.axes[2], g.axes[2]);
  return r >= s ? { deg: angle(p.axes[0], g.axes[0]), seen: rod } : { deg: angle(p.axes[2], g.axes[2]), seen: slab };
}

const ramp = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));

export interface PairJudgement {
  /** Shift of the piece's centre from the part's (goal frame). */
  delta: Vec3;
  size: { ratios: Vec3; err: number; frame: 'world' | 'principal' };
  shape: number;
  turn: { deg: number; seen: number };
  /** The factors, 0 to 1 each. */
  sizeF: number;
  shapeF: number;
  turnF: number;
}

/** Whether a piece could be a part at all: near enough and of a broadly similar size. */
export function gate(p: { center: Vec3; sortedExt: Vec3 }, g: Descriptor, longest: number): boolean {
  const d = Math.hypot(p.center[0] - g.center[0], p.center[1] - g.center[1], p.center[2] - g.center[2]);
  if (d > SCENE_MATCH.gateMove * longest + 0.5 * g.diag) return false;
  // The longest side of any box is at least that of a turned copy over the square root of 3.
  const big = Math.log((p.sortedExt[0] + 1e-9) / (g.sortedExt[0] + 1e-9));
  return Math.abs(big) <= Math.log(SCENE_MATCH.gateSize * 1.8);
}

export function judge(p: Descriptor, g: Descriptor): PairJudgement | null {
  const size = sizeOf(p, g);
  if (size.err > Math.log(SCENE_MATCH.gateSize)) return null;
  const M = SCENE_MATCH;
  const shape = shapeAgreement(p, g);
  const turn = turnOf(p, g);
  return {
    delta: [p.center[0] - g.center[0], p.center[1] - g.center[1], p.center[2] - g.center[2]],
    size,
    shape,
    turn,
    sizeF: 1 - M.sizeMax * ramp(size.err, Math.log(M.sizeFree), Math.log(M.sizeFull)),
    shapeF: 1 - M.shapeMax * ramp(M.shapeFull - shape, 0, M.shapeFull - M.shapeZero),
    turnF: 1 - M.turnMax * Math.min(1, turn.deg / 90) * turn.seen,
  };
}

/** Credit for an effective move (share of the model's size). */
export function placeFactor(move: number, fullShare: number): number {
  return 1 - SCENE_MATCH.placeMax * ramp(move, fullShare, SCENE_MATCH.placeFull);
}

export const creditOf = (j: PairJudgement, move: number, fullShare: number) =>
  Math.max(SCENE_MATCH.floor, placeFactor(move, fullShare) * j.sizeF * j.shapeF * j.turnF);

/**
 * The best assignment of rows to columns (each used at most once), maximising
 * the total value; a row may stay unassigned (value 0). Values below 0 mean
 * "not allowed". Hungarian method, O(n^2 m). Returns the column of each row or -1.
 */
export function assign(value: number[][], cols: number): number[] {
  const n = value.length;
  if (n === 0) return [];
  const m = cols + n; // a "nothing" column for every row
  const BIG = 1e6;
  const cost = (i: number, j: number) => {
    if (j >= cols) return 0;
    const v = value[i][j];
    return v < 0 ? BIG : -v;
  };
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity);
    const used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j] - 1e-12) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta - 1e-12) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= cols; j++) if (p[j] > 0 && value[p[j] - 1][j - 1] >= 0) out[p[j] - 1] = j - 1;
  return out;
}

/** Whether two surfaces come within `tol` of each other. */
export function touching(a: Descriptor, b: Descriptor, tol: number): boolean {
  for (let k = 0; k < 3; k++) if (a.lo[k] - tol > b.hi[k] || b.lo[k] - tol > a.hi[k]) return false;
  const cell = Math.max(tol, 1e-9);
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const set = new Set<string>();
  for (let i = 0; i < a.points.length; i += 3) set.add(key(a.points[i], a.points[i + 1], a.points[i + 2]));
  for (let i = 0; i < b.points.length; i += 3) {
    const x = Math.floor(b.points[i] / cell), y = Math.floor(b.points[i + 1] / cell), z = Math.floor(b.points[i + 2] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (set.has(`${x + dx},${y + dy},${z + dz}`)) return true;
    }
  }
  return false;
}

export interface GoalPartRef {
  desc: Descriptor;
  weight: number;
  /** Goal parts this one touches, and where (a point of this part near the other). */
  touch: { j: number; at: Vec3 }[];
}

export interface PartMatch {
  /** Index of the piece matched to this part, or -1. */
  piece: number;
  credit: number;
  judgement: PairJudgement | null;
  /** The move charged, as a share of the model's size (after a carrier's move and an attachment are allowed for). */
  move: number;
  /** Index of the heavier part this one moved with, or -1. */
  carrier: number;
  /** Still touching the heavier part it touches in the goal. */
  attached: boolean;
  placeF: number;
  /** The matched piece, lined up (all its pieces, when it is built from several). */
  pieceDesc: Descriptor | null;
  /** The pieces that make it. */
  group: number[];
}

export interface MatchResult {
  parts: PartMatch[];
  /** Sum of weight x credit over the matched parts. */
  value: number;
}

/**
 * Matches pieces to the goal's parts. `pieceBoxes` are cheap boxes of every
 * piece; `describePiece` builds a full descriptor on demand (only for pieces
 * that could be some part).
 */
export function matchParts(
  parts: GoalPartRef[],
  pieceBoxes: ({ center: Vec3; sortedExt: Vec3; lo: Vec3; hi: Vec3 } | null)[],
  describePieces: (ks: number[]) => Descriptor | null,
  longest: number,
  fullShare: number,
  touchTol: number,
): MatchResult {
  const M = SCENE_MATCH;
  // Candidates per part: pieces that pass the gate, nearest first, at most `perPart`.
  const cand = parts.map((g) => {
    const list: { k: number; d: number }[] = [];
    pieceBoxes.forEach((b, k) => {
      if (b && gate(b, g.desc, longest)) list.push({ k, d: Math.hypot(b.center[0] - g.desc.center[0], b.center[1] - g.desc.center[1], b.center[2] - g.desc.center[2]) });
    });
    return list.sort((a, b) => a.d - b.d || a.k - b.k).slice(0, M.perPart).map((x) => x.k);
  });
  const used = [...new Set(cand.flat())].sort((a, b) => a - b);
  const col = new Map<number, number>();
  used.forEach((k, j) => col.set(k, j));
  const descs = new Map<number, Descriptor | null>();
  for (const k of used) descs.set(k, describePieces([k]));
  const judgements = parts.map(() => new Map<number, PairJudgement>());
  const value = parts.map((g, i) => {
    const row = new Array<number>(used.length).fill(-1);
    for (const k of cand[i]) {
      const d = descs.get(k);
      if (!d) continue;
      const j = judge(d, g.desc);
      if (!j) continue;
      judgements[i].set(k, j);
      const move = Math.hypot(...j.delta) / longest;
      const colour = d.color && g.desc.color ? 1 - ramp(colourDistance(d.color, g.desc.color), 10, 120) : 1;
      row[col.get(k)!] = g.weight * (creditOf(j, move, fullShare) + M.colourTieBreak * colour);
    }
    return row;
  });
  const chosen = assign(value, used.length).map((j) => (j >= 0 ? used[j] : -1));

  // A part built from several pieces (a top made of two halves): pieces no part took that lie
  // within a matched part's place (moved with it) join its piece, when that matches it better.
  const group = parts.map((_, i) => (chosen[i] >= 0 ? [chosen[i]] : []));
  const partDesc = parts.map((_, i) => (chosen[i] >= 0 ? descs.get(chosen[i]) ?? null : null));
  const taken = new Set(chosen.filter((k) => k >= 0));
  const joins = parts.map(() => [] as number[]);
  pieceBoxes.forEach((b, k) => {
    if (!b || taken.has(k)) return;
    let best = -1;
    parts.forEach((g, i) => {
      const j = chosen[i] >= 0 ? judgements[i].get(chosen[i]) : undefined;
      if (!j) return;
      const pad = 0.1 * g.desc.diag + touchTol;
      // Within the part's place, or that place moved as its piece moved.
      const within = (sh: number) => [0, 1, 2].every((a) => b.lo[a] >= g.desc.lo[a] + sh * j.delta[a] - pad && b.hi[a] <= g.desc.hi[a] + sh * j.delta[a] + pad);
      const inside = within(0) || within(1);
      if (inside && (best < 0 || parts[i].weight > parts[best].weight)) best = i;
    });
    if (best >= 0) joins[best].push(k);
  });
  joins.forEach((ks, i) => {
    if (!ks.length) return;
    const ids = [chosen[i], ...ks];
    const d = describePieces(ids);
    const j = d ? judge(d, parts[i].desc) : null;
    const old = judgements[i].get(chosen[i])!;
    if (!d || !j) return;
    const cr = (x: PairJudgement) => creditOf(x, Math.hypot(...x.delta) / longest, fullShare);
    if (cr(j) > cr(old) + 1e-9) {
      judgements[i].set(chosen[i], j);
      partDesc[i] = d;
      group[i] = ids;
    }
  });

  // Each matched part's move, allowing for the part it rests on (heaviest first, so carriers are settled first).
  const out: PartMatch[] = parts.map(() => ({ piece: -1, credit: 0, judgement: null, move: 0, carrier: -1, attached: false, placeF: 1, pieceDesc: null, group: [] as number[] }));
  const order = parts.map((_, i) => i).sort((a, b) => parts[b].weight - parts[a].weight || a - b);
  const shiftOf = (i: number): Vec3 => out[i].judgement?.delta ?? [0, 0, 0];
  for (const i of order) {
    const k = chosen[i];
    if (k < 0) continue;
    const j = judgements[i].get(k)!;
    const pd = partDesc[i]!;
    // Its own move, less what its change of size explains (a shorter part on the same base is not also "lower").
    const ownShift = j.delta.map((d, a) => Math.sign(d) * Math.max(0, Math.abs(d) - Math.abs(pd.ext[a] - parts[i].desc.ext[a]) / 2)) as Vec3;
    const own = Math.hypot(...ownShift) / longest;
    let move = own, carrier = -1, attached = false;
    for (const { j: t, at } of parts[i].touch) {
      if (parts[t].weight <= parts[i].weight) continue;
      const jt = out[t].judgement;
      if (chosen[t] >= 0 && jt) {
        // Where the heavier part's surface went at the point they touch: its shift, plus its growth about its centre.
        const qd = partDesc[t]!;
        const gt = parts[t].desc;
        const expected = [0, 1, 2].map((a) => jt.delta[a] + ((qd.ext[a] + 1e-9) / (gt.ext[a] + 1e-9) - 1) * (at[a] - gt.center[a])) as Vec3;
        const rel = Math.hypot(j.delta[0] - expected[0], j.delta[1] - expected[1], j.delta[2] - expected[2]) / longest;
        const viaCarrier = rel + M.followCharge * out[t].move;
        if (Math.hypot(...expected) / longest > fullShare && viaCarrier < move - 1e-12) {
          move = viaCarrier;
          carrier = t;
        }
        if (!attached && touching(pd, qd, touchTol)) attached = true;
      }
    }
    // A part still joined to what it rests on (an arm turned at the shoulder) is charged less for its move.
    if (attached && carrier < 0 && j.turn.deg * j.turn.seen >= M.turnedAt) move *= M.attachedCharge;
    const placeF = placeFactor(move, fullShare);
    out[i] = { piece: k, credit: Math.max(M.floor, placeF * j.sizeF * j.shapeF * j.turnF), judgement: j, move, carrier, attached, placeF, pieceDesc: pd, group: group[i] };
  }
  const total = out.reduce((s, m, i) => s + (m.piece >= 0 ? parts[i].weight * m.credit : 0), 0);
  return { parts: out, value: total };
}

/** A rough colour distance (sRGB, Euclidean): only to break ties between pieces. */
function colourDistance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
