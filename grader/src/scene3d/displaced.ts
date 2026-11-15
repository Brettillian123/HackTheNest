import { SCENE_DISPLACED } from './config';
import { cellCenter, distanceField, sampleField, softCredit, type Dense, type Field, type Vec3 } from './solid';

/**
 * A goal part with no material in its place may still be there: moved, or the
 * wrong size. Before it is called missing, it is looked for nearby: moved by up
 * to `searchShare` of the model's size and stretched along each axis (within
 * `stretchMin`..`stretchMax`), against the submission's skin that no other part
 * has claimed. Found, it is present but displaced: its credit falls with how
 * far its surface had to move (full inside the soft edge, about half at
 * `halfAt` of the model's size, never under `floor` within the search), and
 * the material it claims is not extra.
 *
 * A part that only moved because the part it rests on moved or grew (the
 * shade on top of an over-long arm) is a follower: the fault is the other
 * part's, so it is charged only lightly and not reported on its own.
 */

export interface SearchPart {
  cells: Int32Array;
  center: Vec3;
  weight: number;
  flush: boolean;
}

export interface Placement {
  /** Shift of the part's centre, world units. */
  shift: Vec3;
  /** Log of the stretch along x, y, z, about the part's centre. */
  logK: Vec3;
}

export interface FoundPart {
  index: number;
  /** 0 to 1: how well the moved part matches material there. */
  fit: number;
  /** Mean distance its surface moved, as a share of the model's longest side. */
  moved: number;
  placement: Placement;
  /** Final credit for the part (fit x the movement charge, or the light charge for a follower). */
  credit: number;
  /** Index of the part whose change explains this one's move, or -1. */
  follows: number;
}

export interface DisplacedResult {
  found: FoundPart[];
  /** Candidate skin cells claimed by a found (moved) part: index into `found`, -1 for none. */
  claimedBy: Int16Array;
  /** Candidate skin cells claimed by any part, in place or found. */
  claimed: Uint8Array;
  /**
   * Parts in place that grew: another part resting on them was found moved
   * straight away from them with the gap filled by material. Part index ->
   * how far its far side moved (world units).
   */
  grown: Map<number, Vec3>;
}

const apply = (p: Vec3, c: Vec3, t: Placement): Vec3 => [
  c[0] + t.shift[0] + Math.exp(t.logK[0]) * (p[0] - c[0]),
  c[1] + t.shift[1] + Math.exp(t.logK[1]) * (p[1] - c[1]),
  c[2] + t.shift[2] + Math.exp(t.logK[2]) * (p[2] - c[2]),
];

/** Credit for a part's movement: 1 within the soft edge, about half at `halfAt`, `floor` at least. */
export function movementCredit(moved: number, fullShare: number): number {
  const D = SCENE_DISPLACED;
  if (moved <= fullShare) return 1;
  const v = 1 - (0.5 * (moved - fullShare)) / Math.max(1e-9, D.halfAt - fullShare);
  return Math.max(D.floor, v);
}

/** Marks candidate skin cells within `r` cells of a list of world points. */
function claimAround(points: Vec3[], grid: Dense, skin: Uint8Array, r: number, mark: (cell: number) => void) {
  const [nx, ny, nz] = grid.dims;
  for (const p of points) {
    const x = Math.floor((p[0] - grid.origin[0]) / grid.size);
    const y = Math.floor((p[1] - grid.origin[1]) / grid.size);
    const z = Math.floor((p[2] - grid.origin[2]) / grid.size);
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= nx) continue;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= ny) continue;
        for (let dz = -r; dz <= r; dz++) {
          const zz = z + dz;
          if (zz < 0 || zz >= nz) continue;
          const u = (xx * ny + yy) * nz + zz;
          if (skin[u]) mark(u);
        }
      }
    }
  }
}

/** Every k-th cell centre, at most `max`, relative to nothing (world points). */
function samplePoints(grid: Dense, cells: Int32Array, max: number): Vec3[] {
  const n = cells.length;
  const m = Math.min(n, max);
  const out: Vec3[] = [];
  for (let k = 0; k < m; k++) out.push(cellCenter(grid, cells[Math.floor((k * n) / m)]));
  return out;
}

/**
 * Looks for the goal's parts that are not in place. `inPlace` is each part's
 * credit where the goal has it; parts at `settledAt` or more claim the
 * material around them first. Parts are searched largest first.
 */
export function findDisplaced(
  grid: Dense,
  parts: SearchPart[],
  inPlace: number[],
  skin: Uint8Array,
  longest: number,
  full: number,
  zero: number,
  /** The submission's filled solid on the grid. */
  solid: Uint8Array,
): DisplacedResult {
  const D = SCENE_DISPLACED;
  const N = skin.length;
  const claimed = new Uint8Array(N);
  const claimedBy = new Int16Array(N).fill(-1);
  const R = Math.ceil(full) + 1;
  const pointsOf = parts.map((p) => samplePoints(grid, p.cells, D.samplePoints));
  const allPointsOf = (i: number) => Array.from(parts[i].cells, (c) => cellCenter(grid, c));
  parts.forEach((p, i) => {
    if (inPlace[i] >= D.settledAt) claimAround(allPointsOf(i), grid, skin, R, (u) => (claimed[u] = 1));
  });
  const order = parts
    .map((p, i) => i)
    // A flush part (a door on a wall) fits on any flat surface: only its colour can tell where it is, so it is not looked for.
    .filter((i) => inPlace[i] < D.settledAt && !parts[i].flush && parts[i].cells.length > 0)
    .sort((a, b) => parts[b].weight - parts[a].weight || a - b)
    .slice(0, D.maxParts);
  const found: FoundPart[] = [];
  const fullShare = (full * grid.size) / longest;
  const S = D.searchShare * longest;
  const kMin = Math.log(D.stretchMin), kMax = Math.log(D.stretchMax);

  for (const i of order) {
    const free = new Uint8Array(N);
    let any = false;
    for (let c = 0; c < N; c++) if (skin[c] && !claimed[c]) (free[c] = 1), (any = true);
    if (!any) break;
    const field: Field = { grid, dist: distanceField(free, grid), shell: free, occ: free };
    const pts = pointsOf[i];
    const c = parts[i].center;
    // How far its surface moved, plus how much it was stretched (so shrinking a small part onto something else is not free).
    const movedOf = (t: Placement) => {
      let s = 0;
      for (const p of pts) {
        const q = apply(p, c, t);
        s += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      }
      return s / pts.length / longest + D.stretchCharge * Math.max(...t.logK.map(Math.abs));
    };
    const fitOf = (t: Placement) => {
      let s = 0;
      for (const p of pts) {
        const q = apply(p, c, t);
        s += softCredit(sampleField(field, q[0], q[1], q[2]), full, zero);
      }
      return s / pts.length;
    };
    // Find where the part is (best fit; of equal fits, the smaller move); what the move costs is charged after.
    const value = (t: Placement) => fitOf(t) - D.moveTieBreak * movedOf(t);
    const starts: { t: Placement; v: number }[] = [];
    const steps = [-1, -0.5, 0, 0.5, 1];
    for (const a of steps) for (const b of steps) for (const d of steps) {
      if (Math.hypot(a, b, d) > 1.0001) continue;
      const t: Placement = { shift: [a * S, b * S, d * S], logK: [0, 0, 0] };
      starts.push({ t, v: fitOf(t) });
    }
    starts.sort((x, y) => y.v - x.v);
    let best: { t: Placement; v: number } | null = null;
    for (const st of starts.slice(0, D.keep)) {
      let t = st.t;
      let v = value(t);
      const step = [S / 4, S / 4, S / 4, 0.2, 0.2, 0.2];
      let evals = 0;
      while (evals < D.evals && step[0] > grid.size * 0.25) {
        let improved = false;
        for (let k = 0; k < 6 && !improved; k++) {
          for (const sign of [1, -1]) {
            const trial: Placement = { shift: [...t.shift] as Vec3, logK: [...t.logK] as Vec3 };
            if (k < 3) trial.shift[k] += sign * step[k];
            else trial.logK[k - 3] = Math.min(kMax, Math.max(kMin, trial.logK[k - 3] + sign * step[k]));
            if (Math.hypot(...trial.shift) > S) continue;
            const tv = value(trial);
            evals++;
            if (tv > v + 1e-9) {
              t = trial;
              v = tv;
              improved = true;
              break;
            }
          }
        }
        if (!improved) for (let k = 0; k < 6; k++) step[k] /= 2;
      }
      if (!best || v > best.v + 1e-9) best = { t, v };
    }
    if (!best) continue;
    const fit = fitOf(best.t);
    const moved = movedOf(best.t);
    const credit = fit * movementCredit(moved, fullShare);
    // Found whole somewhere else, it is there (its material is not extra), even if a sliver of it overlaps its old place.
    if (fit < D.minFit || (credit <= inPlace[i] && moved <= fullShare)) continue;
    const idx = found.length;
    found.push({ index: i, fit, moved, placement: best.t, credit, follows: -1 });
    claimAround(allPointsOf(i).map((p) => apply(p, c, best!.t)), grid, skin, R, (u) => {
      claimed[u] = 1;
      if (claimedBy[u] < 0) claimedBy[u] = idx;
    });
  }

  const grown = markFollowers(grid, parts, inPlace, found, longest, fullShare, solid);
  return { found, claimedBy, claimed, grown };
}

/** Parts that touch (cells within two voxels), and where: the mean of the touching cells of the second. */
function contacts(grid: Dense, parts: SearchPart[]): Map<string, Vec3> {
  const [nx, ny, nz] = grid.dims;
  const owners = new Map<number, number[]>();
  parts.forEach((p, i) => {
    for (const c of p.cells) {
      let l = owners.get(c);
      if (!l) owners.set(c, (l = []));
      l.push(i);
    }
  });
  const out = new Map<string, Vec3>();
  const sums = new Map<string, [number, number, number, number]>();
  parts.forEach((p, j) => {
    for (const c of p.cells) {
      const z = c % nz, y = ((c - z) / nz) % ny, x = (c - z - y * nz) / (ny * nz);
      const near = new Set<number>();
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
        const xx = x + dx, yy = y + dy, zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
        for (const i of owners.get((xx * ny + yy) * nz + zz) ?? []) if (i !== j) near.add(i);
      }
      if (!near.size) continue;
      const q = cellCenter(grid, c);
      for (const i of near) {
        const key = `${i},${j}`;
        const s = sums.get(key) ?? [0, 0, 0, 0];
        s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; s[3]++;
        sums.set(key, s);
      }
    }
  });
  for (const [k, s] of sums) out.set(k, [s[0] / s[3], s[1] / s[3], s[2] / s[3]]);
  return out;
}

/** Share of points along a segment that fall in the solid. */
function filledAlong(grid: Dense, solid: Uint8Array, a: Vec3, b: Vec3): number {
  const [nx, ny, nz] = grid.dims;
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / grid.size));
  let inside = 0;
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const x = Math.floor((a[0] + (b[0] - a[0]) * t - grid.origin[0]) / grid.size);
    const y = Math.floor((a[1] + (b[1] - a[1]) * t - grid.origin[1]) / grid.size);
    const z = Math.floor((a[2] + (b[2] - a[2]) * t - grid.origin[2]) / grid.size);
    if (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && solid[(x * ny + y) * nz + z]) inside++;
  }
  return inside / (n + 1);
}

function markFollowers(
  grid: Dense, parts: SearchPart[], inPlace: number[], found: FoundPart[], longest: number, fullShare: number, solid: Uint8Array,
): Map<number, Vec3> {
  const grown = new Map<number, Vec3>();
  if (!found.length) return grown;
  const D = SCENE_DISPLACED;
  const touch = contacts(grid, parts);
  const placementOf = new Map<number, Placement>();
  parts.forEach((_, i) => {
    if (inPlace[i] >= D.settledAt) placementOf.set(i, { shift: [0, 0, 0], logK: [0, 0, 0] });
  });
  for (const f of found) placementOf.set(f.index, f.placement);
  const rigid = (t: Placement) => t.logK.every((k) => Math.abs(k) < Math.log(D.rigidStretch));
  const tol = D.followTolerance * longest;
  let changed = true;
  // A follower may itself carry others (an arm carrying a shade): repeat until nothing changes.
  while (changed) {
    changed = false;
    for (const f of found) {
      if (f.follows >= 0 || !rigid(f.placement) || f.moved <= fullShare) continue;
      const j = f.index;
      for (const [i, ti] of placementOf) {
        if (i === j) continue;
        const q = touch.get(`${i},${j}`);
        if (!q) continue;
        const fi = found.find((g) => g.index === i);
        const qj = apply(q, parts[j].center, f.placement);
        if (!fi) {
          // A part in place that grew: j moved straight away from it and the gap is filled with material.
          if (grown.has(i) || f.follows >= 0) continue;
          // The model stands on its base: of two parts that drifted apart, the lower one stayed and the upper one was carried.
          if (parts[j].center[1] <= parts[i].center[1]) continue;
          const d: Vec3 = [qj[0] - q[0], qj[1] - q[1], qj[2] - q[2]];
          // Straight away from the part below: along the line from its centre through where they touch.
          const ci = parts[i].center;
          const out: Vec3 = [q[0] - ci[0], q[1] - ci[1], q[2] - ci[2]];
          const cos = (d[0] * out[0] + d[1] * out[1] + d[2] * out[2]) / Math.max(1e-12, Math.hypot(...d) * Math.hypot(...out));
          if (cos < D.awayCos) continue;
          if (filledAlong(grid, solid, q, qj) < D.filledShare) continue;
          grown.set(i, d);
          f.follows = i;
        } else {
          // Only a part that changed (moved or grew) can carry another along.
          const qi = apply(q, parts[i].center, ti);
          const di = [qi[0] - q[0], qi[1] - q[1], qi[2] - q[2]];
          if (Math.hypot(...di) <= tol) continue;
          if (Math.hypot(qj[0] - qi[0], qj[1] - qi[1], qj[2] - qi[2]) > tol) continue;
          f.follows = i;
        }
        f.credit = Math.max(f.credit, f.fit * (1 - D.followCharge * (1 - movementCredit(f.moved, fullShare))));
        changed = true;
        break;
      }
    }
  }
  return grown;
}
