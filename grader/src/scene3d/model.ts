/**
 * The 3D score, split in two:
 *
 *   measureScene (score.ts)  every fact the total depends on: per goal part
 *                            whether a piece was found and how far off it is,
 *                            the whole model's size, place and facing, the
 *                            shape agreement, the view comparisons, the counts.
 *   combineScene (here)      turns those facts into the total with the
 *                            constants below, each with bounds and a meaning,
 *                            so `npm run fit -- --model scenes` can tune them
 *                            against human judgement (calibration/FIT.md).
 *
 * With the constants at their starting values (config.ts) the total is exactly
 * what the grader gave before the split. Fixed by the owner and never fitted:
 * the three pillar weights (works 0.40, looks 0.25, engineering 0.35 x works)
 * and that engineering is the weakest of its measures.
 *
 * Whatever the constants are inside their bounds, by construction:
 *  - a model against itself scores 100 (every factor is 1 when nothing is off);
 *  - a part lost, a part moved further, or more triangles never raise the total
 *    (every curve is monotone and the pillars only add).
 *
 * The measuring step still uses config.ts for its own decisions (which piece is
 * which part, which facing is chosen); only the combination reads these values.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FitModel, FitParam } from '../criteria/model';
import { GENERAL_RATIO, ratioSaving } from '../performance';
import { risingCredit } from '../util';
import { SCENE_ENGINEERING, SCENE_GENTLE, SCENE_LOOKS, SCENE_MATCH, SCENE_PARTS, SCENE_PLACEMENT, SCENE_SHAPE, SCENE_WEIGHTS } from './config';

// ---------------------------------------------------------------- what is measured

/** One goal part, as found in the submission. */
export interface PartMeasure {
  /** How the part is named to the player ("the saucer"). */
  label: string;
  /** Its linear size (bounding-box diagonal), before any cap. */
  weight: number;
  /** A piece of the submission was matched to it. */
  matched: boolean;
  /** Matched: the move charged (share of the model's size) and the soft edge below which a move is free. */
  move: number;
  fullShare: number;
  /** Matched: worst |ln| of its sides' size ratios, outline agreement (0 to 1), turn in degrees and how much a turn shows (0 to 1). */
  sizeErr: number;
  shape: number;
  turnDeg: number;
  turnSeen: number;
  /** Matched: the side most off, as a ratio (for the notes). */
  sizeRatio: number;
  /** Not matched: how much of it is in its place, 0 to 1 (material there, not too much around, solid inside). */
  inPlace: number;
  /** Colour difference (CIEDE2000) from the goal's part, null when its colour is not judged; and how much it counts (1 matched, the in-place share otherwise). */
  colourDiff: number | null;
  colourWeight: number;
  /** For the exact report only (never read by the combination): matched, the shift of its centre from the goal part's in the goal's units (x right, y up, z front). */
  delta?: [number, number, number];
  /** Which side the size ratio is about: 0 longest (length), 1 middle (width), 2 shortest (thickness). */
  sizeAxis?: number;
  /** Matched with a judged colour: the submission's and the goal's colours. */
  colours?: [[number, number, number], [number, number, number]];
}

export interface SceneMeasurements {
  version: 1;
  /** The submission could not be graded: the total is 0. */
  failed?: boolean;
  parts: PartMeasure[];
  /** Pieces the goal does not have: how much each is an extra lump (0 to 1) and its size (diagonal). */
  extras: { extra: number; size: number }[];
  /** Soft agreement of both solids' outsides, 0 to 1. */
  shapeMatch: number;
  /** What lining the whole model up took. */
  whole: { scaleRatio: number; offset: number; turnDeg: number; mirror: boolean };
  /** Per view, grey pictures: shading similarity, outline overlap, hard-edge agreement (0 to 1 each). */
  /** (Not called `views`: the bench drops fields of that name.) */
  viewParts: { shading: number; outline: number; edges: number }[];
  /** Share of the surface drawn as wireframe. */
  wire: number;
  /** Submission and goal counts. */
  counts: { triangles: [number, number]; meshes: [number, number]; sourceBytes: [number, number] };
  /** Objects (instances count one each) and the distinct geometries and materials they use, submission and goal; null when the front end could not tell. */
  reuse: { objects: [number, number]; geometries: [number, number]; materials: [number, number] } | null;
  /** Shares of triangles: built twice, zero area, turned inside out, buried (a part nobody can see, inside the rest); submission and goal. */
  clean: { duplicate: [number, number]; degenerate: [number, number]; flipped: [number, number]; buried: [number, number] };
  /** Meshes, named share of them, groups of two or more meshes; submission and goal; null when the front end could not tell. */
  structure: { meshes: [number, number]; named: [number, number]; groups: [number, number] } | null;
  /** For the exact report only: the goal's longest side, in its own units. */
  longest?: number;
}

// ---------------------------------------------------------------- the constants

const P = SCENE_PLACEMENT, M = SCENE_MATCH, E = SCENE_ENGINEERING, L = SCENE_LOOKS, W = SCENE_WEIGHTS;

const param = (value: number, min: number, max: number, meaning: string, fixed = false): FitParam => ({ value, min, max, meaning, ...(fixed ? { fixed } : {}) });

/** Every constant of the combination, with its starting value (today's), bounds and meaning. */
export function defaultParams(): Record<string, FitParam> {
  return {
    'weight.works': param(W.works, W.works, W.works, 'Share of the total for works (owner, fixed).', true),
    'weight.looks': param(W.looks, W.looks, W.looks, 'Share of the total for looks (owner, fixed).', true),
    'weight.engineering': param(W.engineering, W.engineering, W.engineering, 'Share for engineering, scaled by works (owner, fixed).', true),
    'bonus.max': param(W.bonusMax, W.bonusMax, W.bonusMax, 'Most points an exact match that is lighter than the goal earns (fixed).', true),
    'bonus.exact': param(W.exact, W.exact, W.exact, 'Works and looks at or above this count as exact (fixed).', true),

    'place.scaleFree': param(P.scaleFree, 0, Math.log(1.2), 'Size off by less than this (|ln ratio|) costs nothing.'),
    'place.scaleFull': param(P.scaleFull, Math.log(1.5), Math.log(4), 'Size off by this much (|ln ratio|) costs the full size charge.'),
    'place.size': param(P.size, 0.03, 0.2, 'Most the whole model being the wrong size costs (share of the total).'),
    'place.offsetFree': param(P.offsetFree, 0, 0.1, 'Standing off by less than this share of the goal\'s size costs nothing.'),
    'place.offsetFull': param(P.offsetFull, 0.25, 1, 'Standing off by this share costs the full position charge.'),
    'place.position': param(P.position, 0.03, 0.2, 'Most standing in the wrong place costs.'),
    'place.turnFreeDeg': param(P.turnFreeDeg, 0, 10, 'A turn of fewer degrees costs nothing.'),
    'place.turn': param(P.turn, 0.08, 0.3, 'What a half turn costs (in proportion to the angle).'),
    'place.mirror': param(P.mirror, 0.03, 0.2, 'What a mirror image costs.'),

    'part.placeMax': param(M.placeMax, 0.5, 0.9, 'Most a part out of its place loses of its credit.'),
    'part.placeFull': param(M.placeFull, 0.15, 0.35, 'A part this far off (share of the model\'s size) loses all of placeMax.'),
    'part.sizeMax': param(M.sizeMax, 0.4, 0.8, 'Most a part of the wrong size loses.'),
    'part.sizeFree': param(M.sizeFree, 1, 1.25, 'A part\'s sides off by less than this factor cost nothing.'),
    'part.sizeFull': param(M.sizeFull, 2, 4, 'A side off by this factor loses all of sizeMax.'),
    'part.shapeMax': param(M.shapeMax, 0.4, 0.8, 'Most a part of the wrong shape loses.'),
    'part.shapeFull': param(M.shapeFull, 0.75, 0.95, 'Outline agreement at or above this is the right shape.'),
    'part.shapeZero': param(M.shapeZero, 0.3, 0.6, 'Outline agreement at or below this loses all of shapeMax.'),
    'part.turnMax': param(M.turnMax, 0.05, 0.3, 'Most a part turned 90 degrees loses (where a turn shows).'),
    'part.floor': param(M.floor, 0.1, 0.4, 'A part that is clearly there earns at least this.'),
    'part.maxShare': param(SCENE_PARTS.maxShare, 0.15, 0.4, 'No part counts for more than this share of all parts.'),
    'part.power': param(2, 1.5, 2.5, 'Parts credit = share present to this power (2: losing a part hurts more than in proportion).'),
    'works.floor': param(SCENE_PARTS.worksFloor, 0.25, 0.6, 'Share of works earned by the parts alone; the rest needs the shape to agree.'),
    'works.zeroAtMatch': param(SCENE_SHAPE.zeroAtMatch, 0.2, 0.45, 'Shape agreement at or below this earns no shape credit.'),

    'looks.outline': param(L.outline, 0.15, 0.45, 'How much the outline overlap counts in each view.'),
    'looks.edges': param(L.edges, 0.8, 2.4, 'How much hard edges where the goal is smooth cost.'),
    'looks.colorFull': param(L.colorFull, 1, 6, 'A part\'s colour within this difference (CIEDE2000) is right.'),
    'looks.colorZero': param(L.colorZero, 15, 30, 'A colour this different earns nothing.'),
    'looks.colorFloor': param(L.colorFloor, 0.15, 0.5, 'Share of looks kept when every colour is wrong.'),

    'eng.triangleSlack': param(E.triangleSlack, 32, 128, 'Added to both triangle counts, so a few dozen either way on a tiny model do not matter.'),
    'eng.meshSlack': param(E.meshSlack, 6, 24, 'Added to both mesh counts.'),
    'eng.sourceSlack': param(E.sourceSlackBytes, 300, 1200, 'Added to both code sizes (bytes).'),
    'eng.ratioFull': param(GENERAL_RATIO.full, 1.05, 1.3, 'Up to this many times the goal\'s count is as good as the goal.'),
    'eng.ratioZero': param(GENERAL_RATIO.zero, 2, 4, 'At this many times the credit is 0.'),
    'eng.ratioWorst': param(GENERAL_RATIO.worst, 6, 15, 'At this many times the credit is -1 (takes marks off).'),
    'eng.floor': param(E.floor, -0.7, -0.3, 'Engineering never goes below this.'),
    'eng.reuse': param(0.15, 0, 0.4, 'Most not sharing geometry and materials where the goal does costs engineering.'),
    'eng.clean': param(0.3, 0, 0.5, 'Most faces built twice, buried, inside out or of zero area (beyond the goal\'s) cost engineering.'),
    'eng.structure': param(0.1, 0, 0.3, 'Most not naming and grouping parts where the goal does costs engineering.'),
  };
}

/** Where fitted values are kept (written only when a fit is adopted). */
export const SCENE_PARAMS_PATH = fileURLToPath(new URL('./params.json', import.meta.url));

function loadParams(): Record<string, FitParam> {
  const params = defaultParams();
  if (existsSync(SCENE_PARAMS_PATH)) {
    const file = JSON.parse(readFileSync(SCENE_PARAMS_PATH, 'utf8')) as { values?: Record<string, number> };
    for (const [k, v] of Object.entries(file.values ?? {})) {
      const p = params[k];
      if (p && !p.fixed && typeof v === 'number' && v >= p.min && v <= p.max) params[k] = { ...p, value: v, neutral: p.value };
    }
  }
  return params;
}

let cached: Record<string, FitParam> | null = null;
/** The constants the grader uses now: config.ts, with any adopted fit on top. */
export function sceneParams(): Record<string, FitParam> {
  return (cached ??= loadParams());
}
export function sceneValues(): Record<string, number> {
  const v: Record<string, number> = {};
  for (const [k, p] of Object.entries(sceneParams())) v[k] = p.value;
  return v;
}

// ---------------------------------------------------------------- the combination

const ramp = (value: number, free: number, full: number) => Math.min(1, Math.max(0, (value - free) / (full - free)));

/**
 * A ramp whose free zone is a very gentle slope: 0 at 0, `g` at `free`, then the
 * ramp scaled to 1 - g (so 1 at `full`). With g = 0 it is the plain ramp.
 */
export function softRamp(value: number, free: number, full: number, g: number): number {
  if (!(g > 0) || !(free > 0)) return ramp(value, free, full);
  if (value <= 0) return 0;
  if (value <= free) return (g * value) / free;
  return g + (1 - g) * ramp(value, free, full);
}

function ratioCreditOf(ratio: number, full: number, zero: number, worst: number, g = 0): number {
  if (!(ratio > 1)) return 1;
  if (!(ratio > full)) return 1 - (g * (ratio - 1)) / (full - 1);
  if (ratio <= zero) return (1 - g) * (1 - (ratio - full) / (zero - full));
  if (ratio >= worst) return -1;
  return -Math.log(ratio / zero) / Math.log(worst / zero);
}

/** Weights with none over `maxShare` of the total (the cap is applied until it holds). */
export function cappedWeights(raw: number[], maxShare: number): number[] {
  const n = raw.length;
  if (n === 0) return [];
  const share = Math.max(maxShare, 1 / n);
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

export interface CountCredit {
  ratio: number;
  credit: number;
}

/** A new engineering measure: its value (0 to 1, null when the goal does not ask for it) and its credit. */
export interface SoftCredit {
  value: number | null;
  credit: number;
}

export interface SceneCombination {
  /** Unrounded total (the grader rounds it to one decimal). */
  total: number;
  works: number;
  looks: number;
  engineering: number;
  placement: number;
  charges: { size: number; position: number; turn: number; mirror: number };
  /** Part weights after the cap. */
  weights: number[];
  /** Per part: its credit (presence) and, when matched, its factors. */
  presence: number[];
  factors: ({ place: number; size: number; shape: number; turn: number } | null)[];
  share: number;
  partsCredit: number;
  shapeCredit: number;
  form: number;
  viewScores: number[];
  colour: number;
  colourAgree: (number | null)[];
  colorFactor: number;
  counts: { triangles: CountCredit; meshes: CountCredit; sourceBytes: CountCredit };
  reuse: SoftCredit;
  clean: SoftCredit;
  structure: SoftCredit;
  base: number;
  bonus: number;
  saving: number;
  exactMatch: boolean;
}

/** Sharing where the goal shares: per geometry and material, the submission's shared share against the goal's. */
export function reuseValue(r: SceneMeasurements['reuse']): number | null {
  if (!r) return null;
  const vals: number[] = [];
  for (const kind of ['geometries', 'materials'] as const) {
    const [cObj, gObj] = r.objects;
    const [c, g] = r[kind];
    if (gObj < 2 || g >= gObj) continue; // the goal does not share these: nothing asked
    const sG = 1 - g / gObj;
    const sC = cObj >= 2 ? 1 - Math.min(c, cObj) / cObj : sG;
    vals.push(Math.min(1, (sC + 0.1) / (sG + 0.1)));
  }
  return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
}

/** What the submission has beyond the goal of each fault, as a share of its triangles. */
export function cleanExcess(c: SceneMeasurements['clean']): { duplicate: number; degenerate: number; flipped: number; buried: number } {
  const over = ([a, b]: [number, number], slack = 0) => Math.max(0, a - b - slack);
  // Zero-area triangles: a cone's tip makes many harmless ones, so only a clear excess counts.
  return { duplicate: over(c.duplicate), degenerate: over(c.degenerate, 0.25), flipped: over(c.flipped), buried: over(c.buried) };
}

export function cleanValue(c: SceneMeasurements['clean']): number {
  const x = cleanExcess(c);
  return 1 - Math.min(1, (x.duplicate + x.degenerate + x.flipped + x.buried) / 0.5);
}

/** Naming and grouping where the goal names and groups. */
export function structureValue(s: SceneMeasurements['structure']): number | null {
  if (!s) return null;
  const vals: number[] = [];
  const [cN, gN] = s.named;
  if (gN > 0) vals.push(Math.min(1, (cN + 0.1) / (gN + 0.1)));
  const [cG, gG] = s.groups;
  if (gG > 0 && s.meshes[0] >= 3) vals.push(Math.min(1, (cG + 0.5) / (gG + 0.5)));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** The total from the measurements: pure and deterministic. */
export function combineScene(m: SceneMeasurements, v: Record<string, number>, gentle: number = SCENE_GENTLE.share): SceneCombination {
  const c = combineWith(m, v, gentle);
  if (!(gentle > 0)) return c;
  // An exact match (the bonus) is still decided on the flat curves: a difference too small
  // to notice costs a little, but does not take away the bonus for beating the goal.
  const flat = combineWith(m, v, 0);
  if (flat.exactMatch === c.exactMatch) return c;
  const bonus = flat.exactMatch && c.saving > 0 && [c.counts.triangles.ratio, c.counts.meshes.ratio, c.counts.sourceBytes.ratio].every((r) => r <= 1) ? v['bonus.max'] * c.saving : 0;
  return { ...c, exactMatch: flat.exactMatch, bonus, total: m.failed ? 0 : Math.max(0, c.base * c.placement + bonus) };
}

function combineWith(m: SceneMeasurements, v: Record<string, number>, g: number): SceneCombination {
  const slope = g; // (`g` is shadowed below by the goal's count)
  // ---- placement: what lining the whole model up took ----
  const wh = m.whole;
  const charges = {
    size: v['place.size'] * softRamp(Math.abs(Math.log(wh.scaleRatio)), v['place.scaleFree'], v['place.scaleFull'], g),
    position: v['place.position'] * softRamp(wh.offset, v['place.offsetFree'], v['place.offsetFull'], g),
    turn: v['place.turn'] * softRamp(wh.turnDeg, v['place.turnFreeDeg'], 180, g),
    mirror: wh.mirror ? v['place.mirror'] : 0,
  };
  // Exactly 1 when nothing is off (the exact-match test reads it on the flat curves).
  const placement = 1 - (charges.size + charges.position + charges.turn + charges.mirror);

  // ---- parts: each matched part's credit, or how much of it is in place ----
  const weights = cappedWeights(m.parts.map((p) => p.weight), v['part.maxShare']);
  const factors = m.parts.map((p) => {
    if (!p.matched) return null;
    return {
      place: 1 - v['part.placeMax'] * softRamp(p.move, p.fullShare, v['part.placeFull'], g),
      size: 1 - v['part.sizeMax'] * softRamp(p.sizeErr, Math.log(v['part.sizeFree']), Math.log(v['part.sizeFull']), g),
      shape: 1 - v['part.shapeMax'] * softRamp(1 - p.shape, 1 - v['part.shapeFull'], 1 - v['part.shapeZero'], g),
      turn: 1 - v['part.turnMax'] * Math.min(1, p.turnDeg / 90) * p.turnSeen,
    };
  });
  const presence = m.parts.map((p, i) => {
    const f = factors[i];
    return f ? Math.max(v['part.floor'], f.place * f.size * f.shape * f.turn) : p.inPlace;
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const meanWeight = weights.length ? totalWeight / weights.length : 0;
  const extraWeight = m.extras.reduce((s, p) => s + p.extra * Math.min(meanWeight, p.size), 0);
  const presentWeight = weights.reduce((s, w, i) => s + w * presence[i], 0);
  const share = totalWeight > 0 ? presentWeight / (totalWeight + extraWeight) : 1;
  const power = v['part.power'];
  const partsCredit = power === 2 ? share * share : share ** power;
  const shapeCredit = risingCredit(m.shapeMatch, 1, v['works.zeroAtMatch']);
  const works = partsCredit * (v['works.floor'] + (1 - v['works.floor']) * shapeCredit);

  // ---- looks: form in grey views, colour per part ----
  const viewScores = m.viewParts.map((x) => x.shading * (1 - v['looks.outline'] + v['looks.outline'] * x.outline) * Math.max(0, 1 - v['looks.edges'] * x.outline * x.outline * (1 - x.edges)));
  const form = viewScores.reduce((s, x) => s + x, 0) / viewScores.length;
  const colourAgree = m.parts.map((p) => (p.colourDiff === null ? null : 1 - softRamp(p.colourDiff, v['looks.colorFull'], v['looks.colorZero'], g)));
  let lost = 0;
  m.parts.forEach((p, i) => {
    const a = colourAgree[i];
    if (a !== null) lost += weights[i] * p.colourWeight * (1 - a);
  });
  const colour = totalWeight > 0 ? 1 - lost / totalWeight : 1;
  const colorFactor = v['looks.colorFloor'] + (1 - v['looks.colorFloor']) * colour;
  const looks = form * colorFactor * (1 - m.wire);

  // ---- engineering: the weakest of its measures, never under the floor ----
  const count = ([c, g]: [number, number], slack: number): CountCredit => {
    const ratio = (c + slack) / (g + slack);
    return { ratio, credit: ratioCreditOf(ratio, v['eng.ratioFull'], v['eng.ratioZero'], v['eng.ratioWorst'], slope) };
  };
  const counts = {
    triangles: count(m.counts.triangles, v['eng.triangleSlack']),
    meshes: count(m.counts.meshes, v['eng.meshSlack']),
    sourceBytes: count(m.counts.sourceBytes, v['eng.sourceSlack']),
  };
  const soft = (value: number | null, strength: number): SoftCredit => ({ value, credit: value === null ? 1 : 1 - strength * (1 - value) });
  const reuse = soft(reuseValue(m.reuse), v['eng.reuse']);
  const clean = soft(cleanValue(m.clean), v['eng.clean']);
  const structure = soft(structureValue(m.structure), v['eng.structure']);
  const engineering = Math.max(v['eng.floor'], Math.min(counts.triangles.credit, counts.meshes.credit, counts.sourceBytes.credit, reuse.credit, clean.credit, structure.credit));

  // ---- total and bonus ----
  const exact = v['bonus.exact'];
  const exactMatch = works >= exact && looks >= exact && placement === 1;
  const ratios = [counts.triangles.ratio, counts.meshes.ratio, counts.sourceBytes.ratio];
  const noneWorse = ratios.every((r) => r <= 1);
  const saving = ratios.reduce((s, r) => s + ratioSaving(r), 0) / ratios.length;
  const bonus = exactMatch && noneWorse && saving > 0 ? v['bonus.max'] * saving : 0;
  const base = 100 * (v['weight.works'] * works + v['weight.looks'] * looks + v['weight.engineering'] * engineering * works);
  const total = m.failed ? 0 : Math.max(0, base * placement + bonus);
  return {
    total, works, looks, engineering, placement, charges, weights, presence, factors, share, partsCredit, shapeCredit,
    form, viewScores, colour, colourAgree, colorFactor, counts, reuse, clean, structure, base, bonus, saving, exactMatch,
  };
}

// ---------------------------------------------------------------- the fit model

export const scenesModel: FitModel<SceneMeasurements> = {
  domain: 'scenes',
  get params() {
    return sceneParams();
  },
  extract(result: unknown): SceneMeasurements | null {
    const m = (result as { measurements?: SceneMeasurements } | null)?.measurements;
    return m && m.version === 1 ? m : null;
  },
  score(m: SceneMeasurements, values: Record<string, number>): number {
    return combineScene(m, values).total;
  },
  save(values: Record<string, number>, note: unknown): string {
    writeFileSync(SCENE_PARAMS_PATH, JSON.stringify({ values, fit: note }, null, 2) + '\n');
    cached = null;
    return SCENE_PARAMS_PATH;
  },
};
