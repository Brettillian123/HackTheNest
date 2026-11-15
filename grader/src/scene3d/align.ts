import { SCENE_ALIGN, SCENE_SHAPE } from './config';
import { cellCenter, denseGrid, sampleField, softCredit, solidField, type Field, type Vec3 } from './solid';
import type { Bounds, SceneData } from './types';

/**
 * Lining a submission up with the goal before judging it. Players only see
 * pictures of the goal, so the grader looks for the turn about the up axis
 * (y), the one uniform scale and the shift that make the two solids overlap
 * best, and also tries the mirror image. It starts from several guesses
 * (bounding boxes, centres of mass with spread, each at 24 turns), keeps the
 * best few and refines them. Every step is plain arithmetic, so the same
 * input gives the same pose.
 *
 *   p' = scale x R(turn) x M x (p - from) + to,   M mirrors x when `mirror`
 */

export interface Pose {
  mirror: boolean;
  /** Turn about y, radians, in (-pi, pi]. */
  turn: number;
  scale: number;
  from: Vec3;
  to: Vec3;
}

export const isIdentity = (p: Pose) =>
  !p.mirror && p.turn === 0 && p.scale === 1 && p.from.every((v, k) => v === p.to[k]);

/** Moves triangle corners by a pose. A mirror image keeps its front faces in front by swapping two corners. */
export function posePositions(src: Float32Array, pose: Pose): Float32Array {
  const out = new Float32Array(src.length);
  const c = Math.cos(pose.turn), s = Math.sin(pose.turn);
  const m = pose.mirror ? -1 : 1;
  const [fx, fy, fz] = pose.from;
  const [tx, ty, tz] = pose.to;
  const k = pose.scale;
  for (let i = 0; i + 2 < src.length; i += 3) {
    const x = (src[i] - fx) * m, y = src[i + 1] - fy, z = src[i + 2] - fz;
    out[i] = k * (c * x + s * z) + tx;
    out[i + 1] = k * y + ty;
    out[i + 2] = k * (-s * x + c * z) + tz;
  }
  if (pose.mirror) {
    for (let t = 0; t + 9 <= out.length; t += 9) {
      for (let j = 0; j < 3; j++) {
        const a = out[t + 3 + j];
        out[t + 3 + j] = out[t + 6 + j];
        out[t + 6 + j] = a;
      }
    }
  }
  return out;
}

/** A copy of the scene, lined up. Counts and code size are kept. */
export function applyPose(scene: SceneData, pose: Pose): SceneData {
  if (isIdentity(pose)) return scene;
  return { ...scene, meshes: scene.meshes.map((m) => ({ ...m, positions: posePositions(m.positions, pose) })) };
}

/** A solid's skin as points, with its field, for the search. */
export interface SolidSamples {
  field: Field;
  /** Skin cell centres, x y z after each other. */
  points: Float64Array;
  centroid: Vec3;
  /** Root mean square distance of the skin from its centroid. */
  spread: number;
  bounds: Bounds;
}

export function solidSamples(lists: Float32Array[], bounds: Bounds, resolution: number, field?: Field): SolidSamples {
  const f = field ?? solidField(lists, denseGrid(bounds, resolution));
  const pts: number[] = [];
  for (let i = 0; i < f.shell.length; i++) if (f.shell[i]) pts.push(...cellCenter(f.grid, i));
  const n = pts.length / 3;
  const c: Vec3 = [0, 0, 0];
  for (let i = 0; i < pts.length; i += 3) for (let k = 0; k < 3; k++) c[k] += pts[i + k] / Math.max(1, n);
  let ss = 0;
  for (let i = 0; i < pts.length; i += 3) ss += (pts[i] - c[0]) ** 2 + (pts[i + 1] - c[1]) ** 2 + (pts[i + 2] - c[2]) ** 2;
  return { field: f, points: Float64Array.from(pts), centroid: c, spread: Math.sqrt(ss / Math.max(1, n)), bounds };
}

/** Every k-th point, so at most `max` are kept (deterministic). */
function thin(points: Float64Array, max: number): Float64Array {
  const n = points.length / 3;
  if (n <= max) return points;
  const step = n / max;
  const out = new Float64Array(max * 3);
  for (let i = 0; i < max; i++) {
    const j = Math.floor(i * step) * 3;
    out[i * 3] = points[j];
    out[i * 3 + 1] = points[j + 1];
    out[i * 3 + 2] = points[j + 2];
  }
  return out;
}

interface Params {
  mirror: boolean;
  turn: number;
  lnScale: number;
  from: Vec3;
  to: Vec3;
}

const toPose = (p: Params): Pose => ({ mirror: p.mirror, turn: wrap(p.turn), scale: Math.exp(p.lnScale), from: p.from, to: p.to });
function wrap(a: number): number {
  let t = a % (2 * Math.PI);
  if (t > Math.PI) t -= 2 * Math.PI;
  if (t <= -Math.PI) t += 2 * Math.PI;
  return Math.abs(t) < 1e-12 ? 0 : t;
}

/**
 * How well a pose lines the two solids up, 0 to 1: the mean credit of the
 * goal's skin against the submission's and of the submission's against the
 * goal's, each point credited by its distance to the other skin.
 */
function overlap(goal: SolidSamples, gPts: Float64Array, cand: SolidSamples, cPts: Float64Array, p: Params, zero: number): number {
  const full = SCENE_SHAPE.softFullVoxels;
  const c = Math.cos(p.turn), s = Math.sin(p.turn);
  const m = p.mirror ? -1 : 1;
  const k = Math.exp(p.lnScale);
  const [fx, fy, fz] = p.from;
  const [tx, ty, tz] = p.to;
  let sc = 0;
  for (let i = 0; i < cPts.length; i += 3) {
    const x = (cPts[i] - fx) * m, y = cPts[i + 1] - fy, z = cPts[i + 2] - fz;
    sc += softCredit(sampleField(goal.field, k * (c * x + s * z) + tx, k * y + ty, k * (-s * x + c * z) + tz), full, zero);
  }
  // Goal points carried back into the submission's frame; its voxels are converted to the goal's.
  const ratio = (cand.field.grid.size * k) / goal.field.grid.size;
  let sg = 0;
  for (let i = 0; i < gPts.length; i += 3) {
    const x = (gPts[i] - tx) / k, y = (gPts[i + 1] - ty) / k, z = (gPts[i + 2] - tz) / k;
    // Inverse turn, then inverse mirror.
    const rx = c * x - s * z, rz = s * x + c * z;
    sg += softCredit(sampleField(cand.field, rx * m + fx, y + fy, rz + fz) * ratio, full, zero);
  }
  return 0.5 * (sc / Math.max(1, cPts.length / 3) + sg / Math.max(1, gPts.length / 3));
}

/** Prefers no turn and no mirror when two poses fit equally well. */
const bias = (p: Params) => (p.mirror ? SCENE_ALIGN.mirrorBias : 0) + (Math.abs(wrap(p.turn)) / Math.PI) * SCENE_ALIGN.turnBias;

function refine(
  goal: SolidSamples, gPts: Float64Array, cand: SolidSamples, cPts: Float64Array,
  start: Params, zero: number, diag: number, maxEvals: number, shiftOnly = false,
): { params: Params; score: number } {
  let best = { ...start, from: start.from, to: [...start.to] as Vec3 };
  let bestScore = overlap(goal, gPts, cand, cPts, best, zero);
  const steps = [(10 * Math.PI) / 180, 0.1, 0.04 * diag, 0.04 * diag, 0.04 * diag];
  let evals = 1;
  while (evals < maxEvals && steps[0] > (0.2 * Math.PI) / 180) {
    let improved = false;
    for (let d = shiftOnly ? 2 : 0; d < 5 && evals < maxEvals; d++) {
      for (const sign of [1, -1]) {
        const trial: Params = { ...best, to: [...best.to] as Vec3 };
        if (d === 0) trial.turn += sign * steps[0];
        else if (d === 1) trial.lnScale += sign * steps[1];
        else trial.to[d - 2] += sign * steps[d];
        const sc = overlap(goal, gPts, cand, cPts, trial, zero);
        evals++;
        if (sc > bestScore + 1e-9) {
          best = trial;
          bestScore = sc;
          improved = true;
          break;
        }
      }
    }
    if (!improved) for (let i = 0; i < 5; i++) steps[i] /= 2;
  }
  return { params: best, score: bestScore };
}

export interface AlignResult {
  pose: Pose;
  /** Overlap of the solids at that pose, 0 to 1 (the narrow measure). */
  score: number;
  /** Other poses that fit nearly as well and face other ways (the chosen one first). */
  alternatives?: AlignResult[];
}

/**
 * The same pose at another scale (multiplied by `factor` about the pose's
 * centre), with only the shift searched again. Used when the model's parts
 * say its size was judged wrongly (one over-long part made the whole look bigger).
 */
export function rescalePose(goal: SolidSamples, cand: SolidSamples, pose: Pose, factor: number): AlignResult {
  const gb = goal.bounds;
  const gd = Math.hypot(gb.max[0] - gb.min[0], gb.max[1] - gb.min[1], gb.max[2] - gb.min[2]);
  const gl = Math.max(gb.max[0] - gb.min[0], gb.max[1] - gb.min[1], gb.max[2] - gb.min[2]);
  const zero = Math.max(SCENE_SHAPE.softFullVoxels + 1, (SCENE_SHAPE.softZeroShare * gl) / goal.field.grid.size);
  const start: Params = { mirror: pose.mirror, turn: pose.turn, lnScale: Math.log(pose.scale * factor), from: pose.from, to: pose.to };
  const gAll = thin(goal.points, SCENE_ALIGN.finePoints);
  const cAll = thin(cand.points, SCENE_ALIGN.finePoints);
  const coarse = refine(goal, gAll, cand, cAll, start, zero * SCENE_ALIGN.wideFactor, gd, SCENE_ALIGN.coarseEvals, true);
  const fine = refine(goal, gAll, cand, cAll, coarse.params, zero, gd, SCENE_ALIGN.fineEvals, true);
  return { pose: toPose(fine.params), score: fine.score };
}

/** Finds the pose that lines `cand` up with `goal` best. */
export function searchPose(goal: SolidSamples, cand: SolidSamples): AlignResult {
  const gb = goal.bounds, cb = cand.bounds;
  const diagOf = (b: Bounds) => Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const gd = diagOf(gb), cd = Math.max(1e-9, diagOf(cb));
  const mid = (b: Bounds): Vec3 => [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2) as Vec3;
  const gl = Math.max(gb.max[0] - gb.min[0], gb.max[1] - gb.min[1], gb.max[2] - gb.min[2]);
  const zero = Math.max(SCENE_SHAPE.softFullVoxels + 1, (SCENE_SHAPE.softZeroShare * gl) / goal.field.grid.size);
  const wide = zero * SCENE_ALIGN.wideFactor;

  const gAll = thin(goal.points, SCENE_ALIGN.finePoints);
  const cAll = thin(cand.points, SCENE_ALIGN.finePoints);

  // The plain line-up of boxes, no turn: kept outright when it already fits.
  const boxStart: Params = { mirror: false, turn: 0, lnScale: Math.log(gd / cd), from: mid(cb), to: mid(gb) };
  const boxScore = overlap(goal, gAll, cand, cAll, boxStart, zero);
  if (boxScore >= SCENE_ALIGN.acceptAt) {
    // Kept outright; but a body the same all the way round may fit as well facing other ways, which its details decide.
    const alternatives: AlignResult[] = [{ pose: toPose(boxStart), score: boxScore }];
    for (const turn of [Math.PI, Math.PI / 2, -Math.PI / 2]) {
      const r = refine(goal, gAll, cand, cAll, { ...boxStart, turn }, zero, gd, SCENE_ALIGN.fineEvals);
      if (r.score >= boxScore - SCENE_ALIGN.alternativeWithin) alternatives.push({ pose: toPose(r.params), score: r.score });
    }
    return { pose: toPose(boxStart), score: boxScore, alternatives };
  }

  const gFew = thin(goal.points, SCENE_ALIGN.coarsePoints);
  const cFew = thin(cand.points, SCENE_ALIGN.coarsePoints);
  const guesses: Params[] = [
    boxStart,
    { mirror: false, turn: 0, lnScale: Math.log(goal.spread / Math.max(1e-9, cand.spread)), from: cand.centroid, to: goal.centroid },
  ];
  const starts: { p: Params; s: number }[] = [];
  for (const g of guesses) {
    for (const mirror of [false, true]) {
      for (let a = 0; a < SCENE_ALIGN.turns; a++) {
        const p: Params = { ...g, mirror, turn: (2 * Math.PI * a) / SCENE_ALIGN.turns };
        starts.push({ p, s: overlap(goal, gFew, cand, cFew, p, wide) - bias(p) });
      }
    }
  }
  starts.sort((a, b) => b.s - a.s);
  // The best starts, plus a few more that face clearly other ways: a body that is
  // the same all the way round fits nearly as well facing backwards, and only its
  // details (judged later) can tell which facing is meant.
  const picked = starts.slice(0, SCENE_ALIGN.keep);
  const apart = (a: Params, b: Params) => a.mirror !== b.mirror || Math.abs(wrap(a.turn - b.turn)) > (SCENE_ALIGN.otherFacingDeg * Math.PI) / 180;
  const top = starts.length ? starts[0].s : 0;
  for (const st of starts.slice(SCENE_ALIGN.keep)) {
    if (picked.length >= SCENE_ALIGN.keep + SCENE_ALIGN.otherFacings) break;
    if (st.s < top - SCENE_ALIGN.otherFacingWithin) break;
    if (picked.every((q) => apart(q.p, st.p))) picked.push(st);
  }
  // The plain line-up, refined without a turn, is always on offer: the cheapest explanation.
  const refined: { params: Params; score: number }[] = [{ params: boxStart, score: boxScore }, refine(goal, gAll, cand, cAll, boxStart, zero, gd, SCENE_ALIGN.fineEvals, true)];
  for (const st of picked) {
    const coarse = refine(goal, gFew, cand, cFew, st.p, wide, gd, SCENE_ALIGN.coarseEvals);
    refined.push(refine(goal, gAll, cand, cAll, coarse.params, zero, gd, SCENE_ALIGN.fineEvals));
  }
  // A mirror image is chosen only when it fits better than every way of facing
  // without one: a symmetric model is never called a mirror image.
  const bestOf = (list: { params: Params; score: number }[]) =>
    list.reduce((a, b) => (b.score - bias(b.params) > a.score - bias(a.params) ? b : a));
  let best = bestOf(refined);
  if (best.params.mirror) {
    for (const turn of [best.params.turn, -best.params.turn, Math.PI - best.params.turn]) {
      const start: Params = { ...best.params, mirror: false, turn };
      refined.push(refine(goal, gAll, cand, cAll, start, zero, gd, SCENE_ALIGN.fineEvals));
    }
    best = bestOf(refined);
  }
  const alternatives: AlignResult[] = [];
  for (const r of [...refined].sort((a, b) => b.score - bias(b.params) - (a.score - bias(a.params)))) {
    if (r.score < best.score - SCENE_ALIGN.alternativeWithin) continue;
    if (alternatives.some((q) => !apart({ ...r.params, turn: q.pose.turn, mirror: q.pose.mirror }, r.params))) continue;
    alternatives.push({ pose: toPose(r.params), score: r.score });
  }
  return { pose: toPose(best.params), score: best.score, alternatives };
}
