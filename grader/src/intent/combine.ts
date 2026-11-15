/**
 * Combining: raw measurements (plain numbers, see measure.ts) to the eight
 * criteria (0 to 1) and the four sub-scores. Pure arithmetic; every constant
 * comes from `values` (params.json), so `npm run fit -- --model intent` can
 * move them.
 */

export type IntentCriterionId =
  | 'keyFacts' | 'completeness' | 'structure' | 'noExtras'
  | 'arrangement' | 'readability' | 'consistency' | 'colour';

export const CRITERIA: { id: IntentCriterionId; name: string; group: 'works' | 'looks' }[] = [
  { id: 'keyFacts', name: 'Key facts', group: 'works' },
  { id: 'completeness', name: 'Everything asked for', group: 'works' },
  { id: 'structure', name: 'Counts and order', group: 'works' },
  { id: 'noExtras', name: 'Nothing unasked', group: 'works' },
  { id: 'arrangement', name: 'Arrangement and placement', group: 'looks' },
  { id: 'readability', name: 'Readability', group: 'looks' },
  { id: 'consistency', name: 'Consistency and type', group: 'looks' },
  { id: 'colour', name: 'Colour families', group: 'looks' },
];

/** [contrast ratio, ratio required, font size px, off the page 0 or 1] for one text block that might be a fault. */
export type ReadRow = [number, number, number, number];
/** [size spread, gap spread, edge spread, share of items in another text style] for one group of like items. */
export type GroupRow = [number, number, number, number];
/** [hue difference in degrees, chroma of the reference colour, chroma of the submission's, lightness difference]. */
export type ColourRow = [number, number, number, number];

export interface IntentMeasurements {
  keyFacts: { total: number; found: number };
  /** One per reference component (top two levels): weight, share of its words missing, same kind of thing. */
  completeness: { weight: number; miss: number; compatible: boolean }[];
  structure: { orderHeld: number; orderTotal: number; counts: { ref: number; cand: number }[] };
  noExtras: { wordRatio: number; compRatio: number };
  arrangement: {
    relHeld: number;
    relTotal: number;
    /** One per matched component: weight, centre distance as a share of the page, |ln size ratio|. */
    place: { weight: number; d: number; s: number }[];
  };
  /**
   * Text blocks that might be faults. Each of the submission's carries the reference's block with the same words, if any
   * (only what is worse than the reference counts); `ref` holds the reference's possible faults whose words the submission
   * does not use (reworded, they still excuse the same number of faults).
   */
  readability: { cand: { row: ReadRow; ref: ReadRow | null }[]; ref: ReadRow[]; candOverlaps: number; refOverlaps: number };
  consistency: {
    candGroups: GroupRow[];
    refGroups: GroupRow[];
    familiesCand: number;
    familiesRef: number;
    sizesCand: number;
    sizesRef: number;
    headingRatioCand: number | null;
    headingRatioRef: number | null;
    bodyClassSame: boolean | null;
    headClassSame: boolean | null;
  };
  colour: { weight: number; row: ColourRow }[];
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);

export type Zone = 'vicinity' | 'close' | 'off';

/**
 * Three zones, continuous and monotone, nothing short of exact free: a tiny slope to `vicEdge` at `vic` (the vicinity),
 * a gentle one to `edge` at `close`, then steep to 0 at `far` x close.
 */
export function closeness(d: number, vic: number, close: number, edge: number, far: number, vicEdge = 1): number {
  if (!(d > 0)) return 1;
  if (d <= vic) return 1 - (1 - vicEdge) * (d / vic);
  const e = Math.min(vicEdge, edge);
  if (d <= close) return vicEdge - (vicEdge - e) * ((d - vic) / Math.max(1e-9, close - vic));
  return e * clamp01(1 - (d - close) / ((far - 1) * close));
}
export const zoneOf = (d: number, vic: number, close: number): Zone => (!(d > vic) ? 'vicinity' : d <= close ? 'close' : 'off');

/** Wording: free up to `vic` of the words missing, gentle to `edge` at `close`, then down to 0 with all missing. */
export function wordCredit(miss: number, vic: number, close: number, edge: number, vicEdge = 1): number {
  if (!(miss > 0)) return 1;
  if (miss <= vic) return 1 - (1 - vicEdge) * (miss / Math.max(1e-9, vic));
  const e = Math.min(vicEdge, edge);
  if (miss <= close) return vicEdge - (vicEdge - e) * ((miss - vic) / Math.max(1e-9, close - vic));
  return e * clamp01((1 - miss) / (1 - close));
}

const wmean = (items: { w: number; v: number }[]): number | null => {
  let sw = 0, s = 0;
  for (const it of items) { sw += it.w; s += it.w * it.v; }
  return sw > 0 ? s / sw : null;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const mix = (a: number | null, b: number | null, share: number): number | null =>
  a === null ? b : b === null ? a : share * a + (1 - share) * b;

export function readSeverity(r: ReadRow, v: Record<string, number>): number {
  const [ratio, required, size, off] = r;
  const contrast = required > v.contrastZero ? clamp01((required - ratio) / (required - v.contrastZero)) : 0;
  const small = clamp01((v.sizeFull - size) / (v.sizeFull - v.sizeZero));
  return Math.max(contrast, small, off);
}

export function groupDeviation(rows: GroupRow[], v: Record<string, number>): number {
  if (!rows.length) return 0;
  let s = 0;
  for (const [a, b, c, d] of rows) s += (clamp01(a / v.cvZero) + clamp01(b / v.cvZero) + clamp01(c / v.cvZero) + clamp01(d)) / 4;
  return s / rows.length;
}

export function colourCredit(row: ColourRow, v: Record<string, number>): number {
  const [hue, ca, cb, light] = row;
  const nc = v.neutralChroma;
  let h: number;
  if (ca < nc && cb < nc) h = 0;
  else if (ca >= nc && cb >= nc) h = hue;
  // One neutral, one coloured: as far apart as the colour is from neutral.
  else h = 180 * clamp01((Math.max(ca, cb) - nc) / nc);
  return closeness(h, v.hueVicinity, v.hueClose, v.hueEdge, v.farMult, v.vicinityEdge) * closeness(light, v.lightVicinity, v.lightClose, v.lightEdge, v.farMult, v.vicinityEdge);
}

/** The eight criteria, 0 to 1, or null when the reference has nothing the criterion applies to. */
export function criteriaOf(m: IntentMeasurements, v: Record<string, number>): Record<IntentCriterionId, number | null> {
  const keyFacts = m.keyFacts.total > 0 ? m.keyFacts.found / m.keyFacts.total : null;

  const completeness = wmean(m.completeness.map((c) => ({
    w: c.weight,
    v: wordCredit(c.miss, v.wordVicinity, v.wordClose, v.wordEdge, v.vicinityEdge) * (c.compatible ? 1 : v.typeMismatchCredit),
  })));

  const order = m.structure.orderTotal > 0 ? m.structure.orderHeld / m.structure.orderTotal : null;
  const counts = mean(m.structure.counts.map((c) => clamp01(1 - (v.countCost * Math.abs(c.cand - c.ref)) / Math.max(1, c.ref))));
  const structure = mix(order, counts, v.orderShare);

  const room = (r: number) => (r <= v.extrasFull ? 1 : clamp01(1 - (r - v.extrasFull) / (v.extrasZero - v.extrasFull)));
  const noExtras = (room(m.noExtras.wordRatio) + room(m.noExtras.compRatio)) / 2;

  const rel = m.arrangement.relTotal > 0 ? m.arrangement.relHeld / m.arrangement.relTotal : null;
  const place = wmean(m.arrangement.place.map((p) => ({
    w: p.weight,
    v: closeness(p.d, v.placeVicinity, v.placeClose, v.placeEdge, v.farMult, v.vicinityEdge) * closeness(p.s, v.sizeVicinity, v.sizeClose, v.sizeEdge, v.farMult, v.vicinityEdge),
  })));
  const arrangement = mix(rel, place, v.relationShare);

  const rd = m.readability;
  const candSev = rd.cand.reduce((a, x) => a + Math.max(0, readSeverity(x.row, v) - (x.ref ? readSeverity(x.ref, v) : 0)), 0) + rd.candOverlaps;
  const refSev = rd.ref.reduce((a, r) => a + readSeverity(r, v), 0) + rd.refOverlaps;
  const readability = clamp01(1 - v.faultCost * Math.max(0, candSev - refSev));

  const c = m.consistency;
  const groups = c.candGroups.length || c.refGroups.length
    ? clamp01(1 - Math.max(0, groupDeviation(c.candGroups, v) - groupDeviation(c.refGroups, v)))
    : null;
  const famAllow = Math.max(v.familiesFree, c.familiesRef);
  const families = clamp01(1 - 0.5 * Math.max(0, c.familiesCand - famAllow));
  const sizeAllow = Math.max(v.sizesFree, c.sizesRef);
  const sizeZero = Math.max(v.sizesZero, sizeAllow + 1);
  const sizes = c.sizesCand <= sizeAllow ? 1 : clamp01(1 - (c.sizesCand - sizeAllow) / (sizeZero - sizeAllow));
  const refHier = c.headingRatioRef !== null && c.headingRatioRef >= v.headingRatio;
  const hier = !refHier ? 1 : c.headingRatioCand !== null && c.headingRatioCand >= v.headingRatio ? 1 : 0;
  const cls = (same: boolean | null) => (same === null ? 1 : same ? 1 : v.typeClassCredit);
  const type = (families + sizes + hier + cls(c.bodyClassSame) + cls(c.headClassSame)) / 5;
  const consistency = mix(groups, type, v.consGroupShare);

  const colour = wmean(m.colour.map((it) => ({ w: it.weight, v: colourCredit(it.row, v) })));

  return { keyFacts, completeness, structure, noExtras, arrangement, readability, consistency, colour };
}

export interface IntentBreakdown { content: number | null; layout: number; style: number; visual: number }

/** Sub-scores 0 to 100 from the criteria: each criterion's credit is value ^ gamma, then a share-weighted mean. */
export function breakdownOf(c: Record<IntentCriterionId, number | null>, v: Record<string, number>): IntentBreakdown {
  const credit = (id: IntentCriterionId, gamma: string) => (c[id] === null ? null : Math.pow(c[id] as number, v[gamma]));
  const part = (items: [number | null, number][], empty: number | null): number | null => {
    const r = wmean(items.filter(([x]) => x !== null).map(([x, w]) => ({ v: x as number, w })));
    return r === null ? empty : 100 * r;
  };
  const rest = 1 - v.shareKeyFacts;
  const content = part([
    [credit('keyFacts', 'gammaKeyFacts'), v.shareKeyFacts],
    [credit('completeness', 'gammaCompleteness'), rest * (1 - v.shareNoExtras)],
    [credit('noExtras', 'gammaNoExtras'), rest * v.shareNoExtras],
  ], null);
  const layout = part([
    [credit('structure', 'gammaStructure'), v.shareStructure],
    [credit('arrangement', 'gammaArrangement'), 1 - v.shareStructure],
  ], 100) as number;
  const style = part([
    [credit('readability', 'gammaReadability'), v.shareReadability],
    [credit('colour', 'gammaColour'), 1 - v.shareReadability],
  ], 100) as number;
  const visual = part([[credit('consistency', 'gammaConsistency'), 1]], 100) as number;
  // Works is limited by what is missing: a page without the asked-for facts and parts does not do the job, however well built.
  const limit = Math.pow(c.keyFacts ?? 1, v.limitKeyFacts) * Math.pow(c.completeness ?? 1, v.limitCompleteness);
  // Looks are judged on what is there: a tidy page of the wrong content earns only part of its looks.
  const gate = v.gateFloor + (1 - v.gateFloor) * Math.min(1, (c.completeness ?? 1) / v.gateKnee);
  return { content: content === null ? null : content * limit, layout: layout * limit, style: style * gate, visual: visual * gate };
}
