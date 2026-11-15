import { ratioCredit, ratioSaving } from '../performance';
import type { PageSnapshot } from '../types';
import { round1, risingCredit } from '../util';
import { compareVisual } from '../visual';
import {
  SCENE_ALIGN,
  SCENE_ENGINEERING,
  SCENE_FEEDBACK,
  SCENE_PARTS,
  SCENE_PLACEMENT,
  SCENE_RENDER,
  SCENE_SHAPE,
  SCENE_VERSION,
  SCENE_WEIGHTS,
} from './config';
import {
  alignmentFor,
  alignPositions,
  applyAlignment,
  boundsOfLists,
  centerOfBox,
  connectedPieces,
  diagonalOf,
  type Alignment,
} from './parts';
import { camerasFor, frameOf, renderScene, toPng, type Frame } from './raster';
import { sceneBounds, type Bounds, type SceneData } from './types';
import {
  centerOf,
  compareShapes,
  coverage,
  gridFor,
  voxelize,
  voxelizePositions,
  type Grid,
  type ShapeComparison,
} from './voxel';

/**
 * Renders and scores triangle lists. Knows nothing of the language a scene
 * was written in: any front end that produces SceneData can be graded here.
 *
 * The submission is first lined up with the goal (bounding-box centre and
 * diagonal; no rotation, no stretching), because players only see pictures
 * of the goal and cannot know its exact size or position. Then:
 *
 *   works        = shape agreement x parts credit                 (0 to 1)
 *   looks        = the four views compared as pictures            (0 to 1)
 *   engineering  = the worst of triangles, meshes and code size   (-1 to 1)
 *   placement    = 1, down to 1 - SCENE_PLACEMENT.maxPenalty, for how far off size and position were
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
  /** For a graded submission: how it was moved and scaled to line up with the goal. */
  alignment?: Alignment;
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
    /** 0 to 100: share of both surfaces that line up, averaged over the grid resolutions. Counts below are for the finest grid. */
    match: number;
    goalVoxels: number;
    candidateVoxels: number;
    missing: number;
    extra: number;
    voxelSize: number;
  } | null;
  parts: { goal: number; present: number; missing: number; extra: number; credit: number } | null;
  placement: {
    /** Submission size / goal size (box diagonals). */
    scaleRatio: number;
    /** Distance between the box centres, as a share of the goal's diagonal. */
    offset: number;
    /** What the total before the bonus was multiplied by. */
    factor: number;
  } | null;
  views: { name: string; score: number; structure: number; color: number }[];
  engineering: { triangles: EngineeringMeasure; meshes: EngineeringMeasure; sourceBytes: EngineeringMeasure } | null;
  /** Width (x), height (y) and depth (z) of each scene, as built. */
  size: { goal: [number, number, number]; candidate: [number, number, number] | null };
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
  /** Set only when the submission could not be graded at all; the total is then 0. */
  error?: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Draws a scene's four views from the cameras of a frame. */
export function drawViews(scene: SceneData, frame: Frame): SceneView[] {
  return camerasFor(frame).map(({ name, camera }) => {
    const image = renderScene(scene, camera);
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

interface GoalShape {
  /** One grid per resolution, finest first. */
  levels: { grid: Grid; voxels: Set<number> }[];
  /** The goal's parts, as voxel sets on the finest grid. */
  parts: { voxels: Set<number>; center: [number, number, number] | null }[];
}

// The goal's grids, voxels and parts depend only on the goal, so they are worked out once.
const goalShapes = new WeakMap<PreparedScene, GoalShape>();
function goalShape(goal: PreparedScene): GoalShape {
  let cached = goalShapes.get(goal);
  if (!cached) {
    const levels = SCENE_SHAPE.resolutions.map((res) => {
      const grid = gridFor(goal.bounds!, res);
      return { grid, voxels: voxelize(goal.scene, grid) };
    });
    const fine = levels[0].grid;
    const budget = { left: SCENE_SHAPE.maxSamplesPerScene };
    const parts = connectedPieces(goal.scene, diagonalOf(goal.bounds!)).map((piece) => {
      const voxels = voxelizePositions([piece], fine, budget);
      return { voxels, center: centerOf(voxels, fine) };
    });
    cached = { levels, parts };
    goalShapes.set(goal, cached);
  }
  return cached;
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
    error: reason,
  };
}

/** Scores a submission's triangles against a prepared goal. */
export function scoreScene(goal: PreparedScene, candidateScene: SceneData): { result: SceneGradeResult; candidate: PreparedScene } {
  const goalBox = goal.bounds!;
  const candBox = sceneBounds(candidateScene)!;
  const goalDiag = diagonalOf(goalBox);

  const gs = goalShape(goal);
  const fine = gs.levels[0].grid;

  // ---- placement: line the submission up, and note how far off it was ----
  // Lined up on the whole scene's box; or, if leaving out one piece that sets
  // an edge of the box matches the goal clearly better, on the rest
  // (a stray extra piece then costs as an extra part, not as a misalignment).
  const rawPieces = connectedPieces(candidateScene, diagonalOf(candBox), SCENE_PARTS.maxPieces);
  let alignment = alignmentFor(candBox, goalBox);
  let placeBox = candBox;
  if (rawPieces.length >= 2 && rawPieces.length <= SCENE_ALIGN.maxPieces) {
    const level = gs.levels[Math.min(SCENE_ALIGN.level, gs.levels.length - 1)];
    const tryMatch = (a: Alignment) =>
      compareShapes(level.voxels, voxelizePositions(rawPieces.map((p) => alignPositions(p, a)), level.grid), level.grid).match;
    let best = tryMatch(alignment) + SCENE_ALIGN.minGain;
    for (let i = 0; i < rawPieces.length; i++) {
      const b = boundsOfLists([rawPieces[i]]);
      if (!b || ![0, 1, 2].some((k) => b.min[k] === candBox.min[k] || b.max[k] === candBox.max[k])) continue;
      const rest = boundsOfLists(rawPieces.filter((_, j) => j !== i));
      if (!rest) continue;
      const a = alignmentFor(rest, goalBox);
      const m = tryMatch(a);
      if (m > best) {
        best = m;
        alignment = a;
        placeBox = rest;
      }
    }
  }
  const aligned = applyAlignment(candidateScene, alignment);
  const scaleRatio = 1 / alignment.scale;
  const gc = centerOfBox(goalBox);
  const cc = centerOfBox(placeBox);
  const offsetVec: [number, number, number] = [cc[0] - gc[0], cc[1] - gc[1], cc[2] - gc[2]];
  const offset = Math.hypot(...offsetVec) / goalDiag;
  const scaleTerm = ramp(Math.abs(Math.log(scaleRatio)), SCENE_PLACEMENT.scaleFree, SCENE_PLACEMENT.scaleFull);
  const offsetTerm = ramp(offset, SCENE_PLACEMENT.offsetFree, SCENE_PLACEMENT.offsetFull);
  const placement = 1 - SCENE_PLACEMENT.maxPenalty * Math.min(1, scaleTerm + offsetTerm);

  const candidate: PreparedScene = {
    triangleCount: candidateScene.triangleCount,
    meshCount: candidateScene.meshCount,
    sourceBytes: candidateScene.sourceBytes,
    bounds: candBox,
    views: drawViews(aligned, goal.frame),
    frame: goal.frame,
    scene: candidateScene,
    alignment,
  };

  // ---- works: shape agreement x parts ----
  const budget = { left: SCENE_SHAPE.maxSamplesPerScene };
  const pieces = rawPieces.map((piece) => voxelizePositions([alignPositions(piece, alignment)], fine, budget));
  const fineCand = new Set<number>();
  for (const p of pieces) for (const k of p) fineCand.add(k);
  const levels = gs.levels.map(({ grid, voxels }, i) =>
    compareShapes(voxels, i === 0 ? fineCand : voxelize(aligned, grid), grid),
  );
  const shape: ShapeComparison = levels[0];
  const match = levels.reduce((s, l) => s + l.match, 0) / levels.length;
  const shapeCredit = risingCredit(match, 1, SCENE_SHAPE.zeroAtMatch);

  const missingParts = gs.parts.filter((part) => coverage(part.voxels, fineCand) < SCENE_PARTS.present);
  const present = gs.parts.length - missingParts.length;
  const extraPieces = pieces.filter((p) => {
    const outside = Math.round((1 - coverage(p, gs.levels[0].voxels)) * p.size);
    return p.size > 0 && outside >= SCENE_PARTS.extraMinVoxels && outside / p.size >= SCENE_PARTS.extraOutside;
  });
  const partsCredit = gs.parts.length === 0 ? 1 : present / (gs.parts.length + SCENE_PARTS.extraWeight * extraPieces.length);
  const works = shapeCredit * partsCredit;

  // ---- looks: the four views ----
  const views = goal.views.map((g, i) => {
    const v = compareVisual(snapshot(g), snapshot(candidate.views[i]));
    return { name: g.name, ...v };
  });
  const looks = views.reduce((s, v) => s + v.score, 0) / views.length;

  // ---- engineering: the worst of triangles, meshes, code size ----
  const triangles = measure(candidate.triangleCount, goal.triangleCount, SCENE_ENGINEERING.triangleSlack);
  const meshes = measure(candidate.meshCount, goal.meshCount, SCENE_ENGINEERING.meshSlack);
  const source = measure(candidate.sourceBytes, goal.sourceBytes, SCENE_ENGINEERING.sourceSlackBytes);
  const measures = [triangles, meshes, source];
  const engineering = Math.min(...measures.map((m) => m.raw));

  // ---- total and bonus ----
  const exactMatch = works >= SCENE_WEIGHTS.exact && looks >= SCENE_WEIGHTS.exact && placement === 1;
  const noneWorse = measures.every((m) => m.rawRatio <= 1);
  const saving = measures.reduce((s, m) => s + ratioSaving(m.rawRatio), 0) / measures.length;
  const bonus = exactMatch && noneWorse && saving > 0 ? SCENE_WEIGHTS.bonusMax * saving : 0;
  const base =
    100 * (SCENE_WEIGHTS.works * works + SCENE_WEIGHTS.looks * looks + SCENE_WEIGHTS.engineering * engineering * works);
  const total = round1(base * placement + bonus);

  const feedback = buildFeedback({
    goalBox,
    candBox,
    // The box the scene was lined up on (without a left-out stray piece), after lining up.
    alignedBox: {
      min: [0, 1, 2].map((k) => (placeBox.min[k] - alignment.from[k]) * alignment.scale + alignment.to[k]) as [number, number, number],
      max: [0, 1, 2].map((k) => (placeBox.max[k] - alignment.from[k]) * alignment.scale + alignment.to[k]) as [number, number, number],
    },
    shape,
    shapeCredit,
    partsCredit,
    goalParts: gs.parts.length,
    missingParts: missingParts.map((p) => p.center),
    extraParts: extraPieces.map((p) => centerOf(p, fine)),
    works,
    looks,
    engineering,
    views,
    measures: { triangles, meshes, source },
    base,
    placement,
    scaleRatio,
    scaleTerm,
    offset,
    offsetTerm,
    offsetVec,
    bonus,
    saving,
  });

  const strip = (m: EngineeringMeasure): EngineeringMeasure => ({ value: m.value, reference: m.reference, ratio: m.ratio, credit: m.credit });
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
          match: round1(match * 100),
          goalVoxels: shape.goalVoxels,
          candidateVoxels: shape.candidateVoxels,
          missing: shape.missing,
          extra: shape.extra,
          voxelSize: fine.size,
        },
        parts: {
          goal: gs.parts.length,
          present,
          missing: missingParts.length,
          extra: extraPieces.length,
          credit: round1(partsCredit * 100),
        },
        placement: { scaleRatio: r3(scaleRatio), offset: r3(offset), factor: r3(placement) },
        views: views.map((v) => ({
          name: v.name,
          score: round1(v.score * 100),
          structure: round1(v.structure * 100),
          color: round1(v.color * 100),
        })),
        engineering: { triangles: strip(triangles), meshes: strip(meshes), sourceBytes: strip(source) },
        size: { goal: extentOf(goalBox), candidate: extentOf(candBox) },
      },
      feedback,
    },
  };
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

interface FeedbackInput {
  goalBox: Bounds;
  candBox: Bounds;
  alignedBox: Bounds;
  shape: ShapeComparison;
  shapeCredit: number;
  partsCredit: number;
  goalParts: number;
  missingParts: ([number, number, number] | null)[];
  extraParts: ([number, number, number] | null)[];
  works: number;
  looks: number;
  engineering: number;
  views: { name: string; score: number; structure: number; color: number }[];
  measures: Record<'triangles' | 'meshes' | 'source', EngineeringMeasure & { raw: number }>;
  base: number;
  placement: number;
  scaleRatio: number;
  scaleTerm: number;
  offset: number;
  offsetTerm: number;
  offsetVec: [number, number, number];
  bonus: number;
  saving: number;
}

function buildFeedback(f: FeedbackInput): string[] {
  const items: { cost: number; text: string }[] = [];
  const goalBox = f.goalBox;

  // ---- placement: size and position, charged after everything else ----
  const placementCost = f.base * (1 - f.placement);
  const terms = f.scaleTerm + f.offsetTerm;
  if (placementCost > 0.05 && terms > 0) {
    if (f.scaleTerm > 0) {
      const cost = (placementCost * f.scaleTerm) / terms;
      const text =
        f.scaleRatio > 1
          ? `The model is about ${pct(f.scaleRatio - 1)} bigger than the goal: ${points(cost)}.`
          : `The model is about ${pct(1 - f.scaleRatio)} smaller than the goal: ${points(cost)}.`;
      items.push({ cost, text });
    }
    if (f.offsetTerm > 0) {
      const cost = (placementCost * f.offsetTerm) / terms;
      const dirs: [string, string][] = [
        ['to the right', 'to the left'],
        ['too high', 'too low'],
        ['too far forward', 'too far back'],
      ];
      const longest = Math.max(...extentOf(goalBox));
      const parts = [0, 1, 2]
        .filter((k) => Math.abs(f.offsetVec[k]) / longest > SCENE_FEEDBACK.shift / 2)
        .map((k) => (f.offsetVec[k] > 0 ? dirs[k][0] : dirs[k][1]));
      const where = parts.length ? parts.join(' and ') : 'away from where the goal is';
      items.push({ cost, text: `The model sits ${where}, off by about ${pct(f.offset)} of the goal's size: ${points(cost)}.` });
    }
  }

  // ---- works: shape and parts (judged after lining up) ----
  const worksCost = (1 - f.works) * (100 * SCENE_WEIGHTS.works + 100 * SCENE_WEIGHTS.engineering * Math.max(0, f.engineering)) * f.placement;
  if (worksCost > 0.05) {
    const lines: string[] = [];
    // Proportions: after uniform scaling, is any direction still off?
    const g = extentOf(goalBox);
    const a = extentOf(f.alignedBox);
    const longest = Math.max(g[0], g[1], g[2]);
    const names: [string, string][] = [
      ['wider', 'narrower'],
      ['taller', 'shorter'],
      ['deeper (front to back)', 'shallower (front to back)'],
    ];
    // Each direction against the other two: a model stretched 30% taller reads as "30% taller compared with its width and depth".
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
    if (worstAxis >= 0 && Math.abs(worstRel - 1) > SCENE_FEEDBACK.sizeRatio) {
      const word = worstRel > 1 ? names[worstAxis][0] : names[worstAxis][1];
      lines.push(`The model is about ${pct(Math.abs(worstRel - 1))} ${word} than the goal, compared with its ${others[worstAxis]}.`);
    }
    if (f.missingParts.length) {
      const where = f.missingParts.map((c) => (c ? placeWords(c, goalBox) : 'somewhere'));
      const n = f.missingParts.length;
      lines.push(
        n === 1
          ? `A part is missing ${where[0]} (1 of the goal's ${f.goalParts} parts).`
          : `${n} parts are missing, ${listWords(where)} (${n} of the goal's ${f.goalParts} parts).`,
      );
    }
    if (f.extraParts.length) {
      const where = f.extraParts.map((c) => (c ? placeWords(c, goalBox) : 'somewhere'));
      const n = f.extraParts.length;
      lines.push(
        n === 1
          ? `There is an extra part ${where[0]} that the goal does not have.`
          : `There are ${n} extra parts the goal does not have, ${listWords(where)}.`,
      );
    }
    if (lines.length === 0) {
      const missingShare = f.shape.goalVoxels ? f.shape.missing / f.shape.goalVoxels : 0;
      const extraShare = f.shape.candidateVoxels ? f.shape.extra / f.shape.candidateVoxels : 0;
      if (missingShare > SCENE_FEEDBACK.material && f.shape.missingAt) {
        lines.push(`Some of the shape is missing ${placeWords(f.shape.missingAt, goalBox)}.`);
      }
      if (extraShare > SCENE_FEEDBACK.material && f.shape.extraAt) {
        lines.push(`There is extra material ${placeWords(f.shape.extraAt, goalBox)} that the goal does not have.`);
      }
    }
    if (lines.length === 0 || f.works < 0.25) {
      lines.unshift(f.works < 0.25 ? 'The shape is very different from the goal.' : 'The shape differs from the goal in places.');
    }
    lines.forEach((text, i) => items.push({ cost: worksCost - i * 0.001, text }));
  }

  // ---- looks: colour and appearance ----
  const looksCost = (1 - f.looks) * 100 * SCENE_WEIGHTS.looks * f.placement;
  if (looksCost > 0.05) {
    const worstColor = f.views.reduce((a, b) => (b.color < a.color ? b : a));
    if (worstColor.color < SCENE_FEEDBACK.color) {
      items.push({ cost: looksCost, text: `Colours differ most in the ${VIEW_LABEL[worstColor.name] ?? worstColor.name}.` });
    } else if (f.works >= 0.995) {
      const worst = f.views.reduce((a, b) => (b.score < a.score ? b : a));
      items.push({ cost: looksCost, text: `It looks slightly different from the goal in the ${VIEW_LABEL[worst.name] ?? worst.name}.` });
    }
  }

  // ---- engineering: only the worst measure sets the score, so only it is named ----
  const engCost = (1 - f.engineering) * 100 * SCENE_WEIGHTS.engineering * f.works * f.placement;
  if (engCost > 0.05) {
    const text: Record<keyof FeedbackInput['measures'], (m: EngineeringMeasure) => string> = {
      triangles: (m) => `Uses ${many(m.value / Math.max(1, m.reference), 'triangles')} the goal (${m.value.toLocaleString('en-US')} against ${m.reference.toLocaleString('en-US')}); curved shapes need fewer segments.`,
      meshes: (m) => `Uses ${many(m.value / Math.max(1, m.reference), 'meshes')} the goal (${m.value} against ${m.reference}).`,
      source: (m) => `The code is ${longer(m.value / Math.max(1, m.reference))} the goal's (${m.value.toLocaleString('en-US')} bytes against ${m.reference.toLocaleString('en-US')}, not counting comments and spacing).`,
    };
    const keys = ['triangles', 'meshes', 'source'] as const;
    const worst = keys.reduce((a, b) => (f.measures[b].raw < f.measures[a].raw ? b : a));
    items.push({ cost: engCost, text: text[worst](f.measures[worst]) });
  }

  items.sort((a, b) => b.cost - a.cost);
  const lines = items.slice(0, SCENE_FEEDBACK.maxLines).map((i) => i.text);
  if (f.bonus > 0) {
    lines.push(`Matches the goal exactly while using about ${pct(f.saving)} less on average: ${round1(f.bonus)} bonus points.`);
  }
  if (lines.length === 0) lines.push('Matches the goal.');
  return lines;
}
