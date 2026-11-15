/**
 * The intent scorer for single pages: does the page meet the brief, and does
 * it look like competent finished work close to the reference's look? Not:
 * is it a copy of the reference. Pure and deterministic; no AI, no
 * screenshot comparison. measure.ts measures, combine.ts combines.
 */
import { GRADER_VERSION, WEIGHTS } from '../config';
import type { CriterionResult, Feedback, GradeResult, PageSnapshot } from '../types';
import { breakdownOf, CRITERIA, criteriaOf, type IntentBreakdown, type IntentCriterionId, type IntentMeasurements, type Zone } from './combine';
import { measure, type CheckDraft } from './measure';
import { INTENT_VALUES } from './params';

export { CRITERIA, breakdownOf, criteriaOf } from './combine';
export type { IntentBreakdown, IntentCriterionId, IntentMeasurements } from './combine';
export { INTENT_VALUES } from './params';

export interface IntentChallenge { keyFacts: string[] }

export interface IntentCriterion {
  id: IntentCriterionId;
  name: string;
  group: 'works' | 'looks';
  /** 0 to 1; null when the reference has nothing this applies to. */
  value: number | null;
  /** Up to three notes, most costly first, in plain words (from the checks). */
  notes: string[];
}

/** One thing measured, with its exact figure, its zone and what it cost. */
export interface IntentCheck {
  criterion: IntentCriterionId;
  component: string;
  what: CheckDraft['what'];
  measured: string;
  zone: Zone;
  /** Points of the page total this cost, two decimals; 0 only for an exact match. */
  points: number;
  text: string;
}

export interface IntentResult {
  mode: 'intent';
  /** 0 to 100, one decimal: the four sub-scores weighted as a page's always are. */
  total: number;
  breakdown: IntentBreakdown;
  criteria: IntentCriterion[];
  criteriaFeedback: Feedback[];
  /** Every comparison made, most costly first (at most 60). Their points add up to 100 minus the total. */
  checks: IntentCheck[];
  /** The raw numbers the criteria were combined from (for fitting). */
  measurements: IntentMeasurements;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const MAX_CHECKS = 60;

export function totalOf(b: IntentBreakdown): number {
  const parts: [number | null, number][] = [[b.content, WEIGHTS.content], [b.layout, WEIGHTS.layout], [b.style, WEIGHTS.style], [b.visual, WEIGHTS.visual]];
  let s = 0, w = 0;
  for (const [x, k] of parts) if (x !== null) { s += x * k; w += k; }
  return w > 0 ? s / w : 0;
}

/** Each criterion's share of the page total, for sharing out the points lost. */
function shareOfTotal(v: Record<string, number>): Record<IntentCriterionId, number> {
  const rest = 1 - v.shareKeyFacts;
  return {
    keyFacts: WEIGHTS.content * v.shareKeyFacts,
    completeness: WEIGHTS.content * rest * (1 - v.shareNoExtras),
    noExtras: WEIGHTS.content * rest * v.shareNoExtras,
    structure: WEIGHTS.layout * v.shareStructure,
    arrangement: WEIGHTS.layout * (1 - v.shareStructure),
    readability: WEIGHTS.style * v.shareReadability,
    colour: WEIGHTS.style * (1 - v.shareReadability),
    consistency: WEIGHTS.visual,
  };
}

function verdict(c: { zone: Zone; points: number; exact: boolean }): string {
  if (c.exact && c.points === 0) return 'exactly as the reference, no points lost';
  const p = `${c.points.toFixed(2)} points lost`;
  return c.zone === 'vicinity' ? `very close, ${p}` : c.zone === 'close' ? `close, ${p}` : `far from the reference, ${p}`;
}

export function scoreIntent(reference: PageSnapshot, candidate: PageSnapshot, challenge: IntentChallenge, values: Record<string, number> = INTENT_VALUES): IntentResult {
  const { m, checks: drafts } = measure(reference, candidate, challenge.keyFacts ?? [], values);
  const c = criteriaOf(m, values);
  const breakdown = breakdownOf(c, values);
  const rawTotal = totalOf(breakdown);
  const total = round1(rawTotal);

  // The points lost (100 minus the total, gates and limiters included) are shared out over the criteria by what each
  // lost of its own share, then over each criterion's checks by their deficits; so the checks add up to the loss.
  const share = shareOfTotal(values);
  const lost = Math.max(0, 100 - rawTotal);
  const linear = CRITERIA.map((d) => (c[d.id] === null ? 0 : share[d.id] * (1 - (c[d.id] as number))));
  const sumLinear = linear.reduce((a, b) => a + b, 0);
  const all: (IntentCheck & { exact: boolean; raw: number })[] = [];
  const criteria: IntentCriterion[] = [];
  CRITERIA.forEach((def, i) => {
    const pts = sumLinear > 0 ? (lost * linear[i]) / sumLinear : 0;
    const mine = drafts.filter((d) => d.criterion === def.id);
    const sumDef = mine.reduce((a, d) => a + d.deficit, 0);
    if (pts > 0 && sumDef <= 0) {
      mine.push({ criterion: def.id, component: 'the page', what: 'alignment', measured: 'small differences', zone: 'close', exact: false, deficit: 1, say: `${def.name}: small differences from the reference` });
    }
    const denom = mine.reduce((a, d) => a + d.deficit, 0) || 1;
    const own: typeof all = [];
    for (const d of mine) {
      const raw = (pts * d.deficit) / denom;
      const points = round2(raw);
      own.push({ criterion: d.criterion, component: d.component, what: d.what, measured: d.measured, zone: d.zone, points, exact: d.exact && raw === 0, raw, text: '' });
      own[own.length - 1].text = `${d.say}: ${verdict({ zone: d.zone, points, exact: d.exact && raw === 0 })}.`;
    }
    own.sort((a, b) => b.raw - a.raw || (a.text < b.text ? -1 : 1));
    all.push(...own);
    const value = c[def.id];
    criteria.push({ ...def, value: value === null ? null : Math.round(value * 1000) / 1000, notes: own.filter((x) => x.raw > 0).slice(0, 3).map((x) => x.text) });
  });
  all.sort((a, b) => b.raw - a.raw || (a.text < b.text ? -1 : 1));
  const costly = all.filter((x) => x.raw > 0);
  const free = all.filter((x) => x.raw === 0);
  const kept = [...costly, ...free].slice(0, Math.max(MAX_CHECKS, costly.length));
  const checks: IntentCheck[] = kept.map(({ exact: _e, raw: _r, ...rest }) => rest);
  const criteriaFeedback: Feedback[] = costly.slice(0, 8).map((x) => ({ message: x.text, points: round1(x.raw) }));
  const rb: IntentBreakdown = {
    content: breakdown.content === null ? null : round1(breakdown.content),
    layout: round1(breakdown.layout), style: round1(breakdown.style), visual: round1(breakdown.visual),
  };
  return { mode: 'intent', total, breakdown: rb, criteria, criteriaFeedback, checks, measurements: m };
}

/** The intent result in the page-result shape the site layer reads, marked `mode: "intent"`, with its checks. */
export function intentGradeResult(r: IntentResult): GradeResult & { mode: 'intent'; checks: IntentCheck[]; intentMeasurements: IntentMeasurements } {
  return {
    version: GRADER_VERSION,
    total: r.total,
    breakdown: r.breakdown,
    details: { goalBlocks: 0, candidateBlocks: 0, matchedBlocks: 0, missingText: [], extraText: [], globalOffset: { dx: 0, dy: 0 }, visual: { structure: 0, color: 0 } },
    feedback: r.criteriaFeedback,
    // The intent criteria have their own names; the shape is the same.
    criteria: r.criteria as unknown as CriterionResult[],
    criteriaFeedback: r.criteriaFeedback,
    mode: 'intent',
    checks: r.checks,
    intentMeasurements: r.measurements,
  };
}
