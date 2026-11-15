/**
 * npx tsx calibration/fit/variants.ts <bench.json> [only-variant-id]
 * Builds each candidate form of the pages combination, fits it and scores it
 * leave-one-set-out. Prints a markdown table (stdout) and each variant's
 * fitted-on-all values (stderr). Deterministic.
 */
import { makeCombineModel, type ParamsBlock, type Param } from '../../src/criteria/params';
import { loadBench, crossValidate, fit, evaluate, pairsFor, currentValues } from '../../src/fit';

const [file, only, priorArg] = process.argv.slice(2);
const PRIOR = priorArg ? Number(priorArg) : 4;

const W = { content: 0.35, layout: 0.3, style: 0.15, visual: 0.2 } as const;
const GROUP_OF: Record<string, keyof typeof W> = {
  completeness: 'content', keyFacts: 'content', wording: 'content', noExtras: 'content',
  structure: 'layout', placement: 'layout', spacing: 'layout',
  colour: 'style', typography: 'style', shape: 'style',
  pictures: 'visual', likeness: 'visual',
};
const free = (value: number, min: number, max: number, meaning = ''): Param => ({ value, min, max, neutral: value, meaning });
const fixed = (value: number, meaning = ''): Param => ({ value, fixed: true, meaning });

interface Spec {
  id: string;
  what: string;
  inputs: ParamsBlock['inputs'];
  standIns?: 'only' | 'free-share' | 'none';
  criteria?: string[];           // twelve-criteria members used in the groups
  limiterOnly?: string[];        // criteria present only as limiters (share 0)
  critGamma?: boolean;           // criteria gammas free
  critShare?: boolean;           // criteria shares free
  blend?: boolean;               // per-group mean/weakest blend free
  limiters?: string[];
  gate?: boolean;
  gammaRange?: [number, number]; // bounds for the stand-in curves (default 0.4..3)
}

function build(s: Spec): ParamsBlock {
  const b: ParamsBlock = { inputs: s.inputs, groups: {}, criteria: {}, limiters: [], gate: null };
  for (const [g, w] of Object.entries(W)) {
    b.groups[g] = { weight: fixed(w) };
    if (s.blend) b.groups[g].blend = free(0, 0, 1);
  }
  if (s.standIns && s.standIns !== 'none') {
    for (const g of Object.keys(W)) {
      b.criteria[g] = {
        group: g,
        share: s.standIns === 'free-share' ? free(1, 0.05, 6) : fixed(1),
        gamma: free(1, s.gammaRange?.[0] ?? 0.4, s.gammaRange?.[1] ?? 3),
      };
    }
  }
  for (const c of s.criteria ?? []) {
    b.criteria[c] = { group: GROUP_OF[c], share: s.critShare ? free(1, 0.05, 3) : fixed(1), gamma: s.critGamma ? free(1, 0.4, 3) : fixed(1) };
  }
  for (const c of s.limiterOnly ?? []) {
    if (!b.criteria[c]) b.criteria[c] = { group: GROUP_OF[c], share: fixed(0), gamma: free(1, 0.4, 3) };
  }
  for (const c of s.limiters ?? []) b.limiters!.push({ criterion: c, strength: free(0, 0, 1) });
  if (s.gate) b.gate = { groups: ['style', 'visual'], by: 'content', floor: free(1, 0.2, 1), knee: free(1, 0.3, 1) };
  return b;
}

const ALL = Object.keys(GROUP_OF);
const SPECS: Spec[] = [
  { id: 'A0', what: 'four sub-scores, curves + content gate', inputs: 'breakdown', standIns: 'only', gate: true },
  { id: 'A1', what: 'four sub-scores + limiters completeness, keyFacts', inputs: 'both', standIns: 'only', limiterOnly: ['completeness', 'keyFacts'], limiters: ['completeness', 'keyFacts'], gate: true },
  { id: 'A2', what: 'four sub-scores + limiters completeness, keyFacts, noExtras, colour', inputs: 'both', standIns: 'only', limiterOnly: ['completeness', 'keyFacts', 'noExtras', 'colour'], limiters: ['completeness', 'keyFacts', 'noExtras', 'colour'], gate: true },
  { id: 'B0', what: 'twelve criteria, plain mean, curves, 2 limiters, gate', inputs: 'criteria', criteria: ALL, critGamma: true, limiters: ['completeness', 'keyFacts'], gate: true },
  { id: 'B1', what: 'twelve criteria, mean/weakest blend, curves, 2 limiters, gate', inputs: 'criteria', criteria: ALL, critGamma: true, blend: true, limiters: ['completeness', 'keyFacts'], gate: true },
  { id: 'B2', what: 'twelve criteria, free shares, no curves, blend, 2 limiters, gate', inputs: 'criteria', criteria: ALL, critShare: true, blend: true, limiters: ['completeness', 'keyFacts'], gate: true },
  { id: 'C0', what: 'sub-scores beside the twelve (stand-in share free), blend, 4 limiters, gate', inputs: 'both', standIns: 'free-share', criteria: ALL, blend: true, limiters: ['completeness', 'keyFacts', 'noExtras', 'colour'], gate: true },
  { id: 'C1', what: 'sub-scores beside the twelve, stand-in share free, blend, gate (no limiters)', inputs: 'both', standIns: 'free-share', criteria: ALL, blend: true, gate: true },
];

const extra = process.env.FIT_VARIANTS ? (JSON.parse(process.env.FIT_VARIANTS) as Spec[]) : [];
const out: string[] = [];
out.push(`| id | variant | free | fitted in | fitted d | LOSO in | LOSO d | LOSO order |`);
out.push(`|---|---|---|---|---|---|---|---|`);
for (const s of [...SPECS, ...extra]) {
  if (only && !only.split(',').includes(s.id)) continue;
  const t0 = Date.now();
  const model = makeCombineModel(build(s), 'pages');
  const { attempts, orders } = loadBench(file, model);
  const train = attempts.filter((a) => a.split !== 'heldout');
  const pairs = pairsFor(train, orders);
  const nFree = Object.values(model.params).filter((p) => !p.fixed).length;
  const all = fit(model, train, pairs, { prior: PRIOR });
  const sAll = evaluate(model, all.values, train, pairs);
  const cv = crossValidate(model, train, orders, { prior: PRIOR });
  out.push(`| ${s.id} | ${s.what} | ${nFree} | ${sAll.inBand}/${sAll.n} | ${sAll.meanD.toFixed(2)} | ${cv.fitted.inBand}/${cv.n} | ${cv.fitted.meanD.toFixed(2)} | ${cv.fitted.held}/${cv.orders} |`);
  const moved = Object.entries(all.values).filter(([k, v]) => !model.params[k].fixed && Math.abs(v - (model.params[k].neutral ?? model.params[k].value)) > 1e-9).map(([k, v]) => `${k}=${v}`);
  process.stderr.write(`${s.id} (${((Date.now() - t0) / 1000).toFixed(0)} s): ${moved.join(', ') || 'all neutral'}\n`);
  process.stderr.write(`${s.id} LOSO per set: ${cv.sets.map((c) => `${c.set} ${c.fitted.inBand}/${c.fitted.n} d ${c.fitted.meanD.toFixed(2)}`).join('; ')}\n`);
  void currentValues;
}
process.stdout.write(out.join('\n') + '\n');
