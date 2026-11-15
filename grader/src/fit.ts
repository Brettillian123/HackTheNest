/**
 * npm run fit -- --from <bench.json> [--model pages] [--cv] [--holdout set,set] [--prior 4] [--write]
 *
 * Fits the non-fixed constants of a FitModel (src/criteria/model.ts; registry in
 * src/criteria/models.ts) to the human score bands recorded by
 * `npm run bench -- --json <file>`. Plain, deterministic numerical fitting:
 * coordinate descent with shrinking steps from fixed starting points. No model
 * of language, no network, no randomness. Same input, same stdout, byte for byte
 * (timing goes to stderr). See calibration/FIT.md.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FitModel } from './criteria/model';
import { getModel } from './criteria/models';

export interface Attempt<M = unknown> {
  set: string;
  split: string;
  key: string;
  band: [number, number];
  m: M;
  graderScore: number | null;
}

/** Indices into an attempt list: attempt `hi` must score above attempt `lo`. */
export interface OrderPair { hi: number; lo: number }
export interface OrderRef { set: string; higher: string; lower: string }

export interface FitOptions {
  prior?: number;      // weight of the pull back to neutral values
  orderCost?: number;  // cost of one violated order pair, in points squared
  maxSweeps?: number;
}

export const DEFAULT_PRIOR = 4;
const DEFAULT_ORDER_COST = 100;

type Values = Record<string, number>;

// ---------------------------------------------------------------- data

export function loadBench<M>(file: string, model: FitModel<M>): { attempts: Attempt<M>[]; orders: OrderRef[]; skipped: number } {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const attempts: Attempt<M>[] = [];
  let skipped = 0;
  for (const r of j.records ?? []) {
    if (r.domain !== model.domain || !Array.isArray(r.band)) continue;
    const m = r.result ? model.extract(r.result) : null;
    if (m === null) { skipped++; continue; }
    attempts.push({ set: r.set, split: r.split ?? 'train', key: r.key, band: [r.band[0], r.band[1]], m, graderScore: typeof r.score === 'number' ? r.score : null });
  }
  const orders = (j.orders ?? []).filter((o: any) => o.domain === model.domain).map((o: any) => ({ set: o.set, higher: o.higher, lower: o.lower }));
  return { attempts, orders, skipped };
}

/** Order pairs whose both ends are in `list`, as indices into `list`. */
export function pairsFor(list: Attempt<any>[], orders: OrderRef[]): OrderPair[] {
  const idx = new Map<string, number>();
  list.forEach((a, i) => idx.set(`${a.set}|${a.key}`, i));
  const out: OrderPair[] = [];
  for (const o of orders) {
    const hi = idx.get(`${o.set}|${o.higher}`);
    const lo = idx.get(`${o.set}|${o.lower}`);
    if (hi !== undefined && lo !== undefined) out.push({ hi, lo });
  }
  return out;
}

// ---------------------------------------------------------------- scoring

export function bandDistance(score: number, band: [number, number]): number {
  return score < band[0] ? band[0] - score : score > band[1] ? score - band[1] : 0;
}

export interface Stats { n: number; inBand: number; meanD: number; ordersHeld: number; ordersTotal: number; scores: number[] }

export function statsFromScores(scores: number[], list: Attempt<any>[], pairs: OrderPair[]): Stats {
  let inBand = 0, sumD = 0;
  scores.forEach((s, i) => { const d = bandDistance(s, list[i].band); if (d === 0) inBand++; sumD += d; });
  const held = pairs.filter((p) => scores[p.hi] > scores[p.lo]).length;
  return { n: list.length, inBand, meanD: list.length ? sumD / list.length : 0, ordersHeld: held, ordersTotal: pairs.length, scores };
}

/** Stats with published scores (rounded to one decimal, as the grader shows them). */
export function evaluate<M>(model: FitModel<M>, values: Values, list: Attempt<M>[], pairs: OrderPair[]): Stats {
  const v = { ...values };
  return statsFromScores(list.map((a) => Math.round(model.score(a.m, v) * 10) / 10), list, pairs);
}

function lossOf<M>(model: FitModel<M>, values: Values, list: Attempt<M>[], pairs: OrderPair[], orderCost: number): number {
  if (list.length === 0) return 0;
  const s = list.map((a) => model.score(a.m, values));
  let sum = 0;
  for (let i = 0; i < list.length; i++) { const d = bandDistance(s[i], list[i].band); sum += d * d; }
  for (const pr of pairs) {
    const gap = s[pr.lo] - s[pr.hi];
    if (gap >= 0) sum += orderCost + gap * gap;
  }
  return sum / list.length;
}

// ---------------------------------------------------------------- fitting

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function currentValues(model: FitModel<any>): Values {
  const v: Values = {};
  for (const [k, p] of Object.entries(model.params)) v[k] = p.value;
  return v;
}

export function neutralValues(model: FitModel<any>): Values {
  const v: Values = {};
  for (const [k, p] of Object.entries(model.params)) v[k] = p.fixed ? p.value : p.neutral ?? p.value;
  return v;
}

export interface FitResult { values: Values; loss: number; startLoss: number }

/**
 * Fit the free params of `model` on `list`. Fixed params are never touched.
 * Returns fitted values rounded to 4 decimals (tidied by the model if it can).
 */
export function fit<M>(model: FitModel<M>, list: Attempt<M>[], pairs: OrderPair[], opts: FitOptions = {}): FitResult {
  const prior = opts.prior ?? DEFAULT_PRIOR;
  const orderCost = opts.orderCost ?? DEFAULT_ORDER_COST;
  const maxSweeps = opts.maxSweeps ?? 300;
  const names = Object.keys(model.params).filter((k) => !model.params[k].fixed && model.params[k].max > model.params[k].min);
  const ps = names.map((k) => model.params[k]);
  const lo = ps.map((p) => p.min), hi = ps.map((p) => p.max);
  const neutral = ps.map((p) => p.neutral ?? p.value);
  const clampI = (i: number, v: number) => (v < lo[i] ? lo[i] : v > hi[i] ? hi[i] : v);
  const base = neutralValues(model);

  const f = (x: number[]): number => {
    const v: Values = { ...base };
    names.forEach((k, i) => { v[k] = x[i]; });
    let pen = 0;
    x.forEach((xi, i) => { pen += ((xi - neutral[i]) / (hi[i] - lo[i])) ** 2; });
    return lossOf(model, v, list, pairs, orderCost) + prior * pen;
  };

  // Fixed starting points: neutral, the current values, and three spread variants.
  const starts = [
    neutral,
    ps.map((p) => p.value),
    neutral.map((n, i) => n - 0.3 * (n - lo[i])),
    neutral.map((n, i) => n + 0.3 * (hi[i] - n)),
    neutral.map((n, i) => (i % 2 ? n + 0.3 * (hi[i] - n) : n - 0.3 * (n - lo[i]))),
  ];
  const seen = new Set<string>();

  let best = neutral.slice();
  let bestF = Infinity;
  const startLoss = f(neutral);
  for (const s0 of starts) {
    const key = JSON.stringify(s0);
    if (seen.has(key)) continue;
    seen.add(key);
    let x = s0.map((v, i) => clampI(i, v));
    let fx = f(x);
    const step = names.map((_, i) => (hi[i] - lo[i]) / 4);
    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      let improved = false;
      for (let i = 0; i < x.length; i++) {
        for (const dir of [1, -1]) {
          const v = clampI(i, x[i] + dir * step[i]);
          if (v === x[i]) continue;
          const y = x.slice(); y[i] = v;
          const fy = f(y);
          if (fy < fx - 1e-12) { x = y; fx = fy; improved = true; break; }
        }
      }
      if (!improved) {
        let done = true;
        for (let i = 0; i < step.length; i++) { step[i] /= 2; if (step[i] > 1e-4 * (hi[i] - lo[i])) done = false; }
        if (done) break;
      }
    }
    // Polish: snap each value back to neutral when that costs nothing (keeps unused params exactly neutral).
    for (let i = 0; i < x.length; i++) {
      if (x[i] === neutral[i]) continue;
      const y = x.slice(); y[i] = neutral[i];
      const fy = f(y);
      if (fy <= fx + 1e-9) { x = y; fx = fy; }
    }
    if (fx < bestF - 1e-12) { bestF = fx; best = x; }
  }

  let values: Values = { ...base };
  names.forEach((k, i) => { values[k] = round4(best[i]); });
  if (model.tidy) values = model.tidy(values);
  return { values, loss: bestF, startLoss };
}

export interface CvSet { set: string; neutral: Stats; fitted: Stats; values: Values }
export interface CvResult { sets: CvSet[]; n: number; neutral: { inBand: number; meanD: number; held: number }; fitted: { inBand: number; meanD: number; held: number }; orders: number }

/** Leave-one-set-out: for each set, fit on the others and score it. */
export function crossValidate<M>(model: FitModel<M>, train: Attempt<M>[], orders: OrderRef[], opts: FitOptions = {}): CvResult {
  const neutral = neutralValues(model);
  const sets = [...new Set(train.map((a) => a.set))].sort();
  const out: CvSet[] = [];
  const t = { n: 0, inN: 0, dN: 0, hN: 0, inF: 0, dF: 0, hF: 0, o: 0 };
  for (const s of sets) {
    const fitOn = train.filter((a) => a.set !== s);
    const test = train.filter((a) => a.set === s);
    const testPairs = pairsFor(test, orders);
    const r = fit(model, fitOn, pairsFor(fitOn, orders), opts);
    const sn = evaluate(model, neutral, test, testPairs);
    const sf = evaluate(model, r.values, test, testPairs);
    out.push({ set: s, neutral: sn, fitted: sf, values: r.values });
    t.n += test.length; t.inN += sn.inBand; t.dN += sn.meanD * test.length; t.hN += sn.ordersHeld;
    t.inF += sf.inBand; t.dF += sf.meanD * test.length; t.hF += sf.ordersHeld; t.o += sn.ordersTotal;
  }
  return {
    sets: out, n: t.n, orders: t.o,
    neutral: { inBand: t.inN, meanD: t.n ? t.dN / t.n : 0, held: t.hN },
    fitted: { inBand: t.inF, meanD: t.n ? t.dF / t.n : 0, held: t.hF },
  };
}

// ---------------------------------------------------------------- CLI

const fmtStats = (s: Stats) =>
  `${String(s.inBand).padStart(4)}/${String(s.n).padEnd(4)} ${(s.n ? (100 * s.inBand) / s.n : 0).toFixed(1).padStart(5)}%  ${s.meanD.toFixed(2).padStart(6)}   ${s.ordersHeld}/${s.ordersTotal}`;

function graderStats(list: Attempt<any>[], pairs: OrderPair[]): Stats | null {
  if (list.some((a) => a.graderScore === null)) return null;
  return statsFromScores(list.map((a) => a.graderScore!), list, pairs);
}

function parseArgs(argv: string[]) {
  const a: { from?: string; model: string; cv: boolean; holdout: string[]; write: boolean; prior: number } =
    { model: 'pages', cv: false, holdout: [], write: false, prior: DEFAULT_PRIOR };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--from') a.from = argv[++i];
    else if (k === '--model' || k === '--domain') a.model = argv[++i];
    else if (k === '--cv') a.cv = true;
    else if (k === '--holdout') a.holdout = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--write') a.write = true;
    else if (k === '--prior') a.prior = Number(argv[++i]);
    else throw new Error(`unknown option ${k}`);
  }
  if (!a.from) throw new Error('usage: npm run fit -- --from <bench.json> [--model pages] [--cv] [--holdout set,set] [--prior 4] [--write]');
  return a;
}

function main() {
  const t0 = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const model = getModel(args.model);
  if (args.write && !model.save) throw new Error(`model "${args.model}" cannot save; --write refused`);
  const { attempts, orders, skipped } = loadBench(args.from!, model);
  const isHeld = (a: Attempt<any>) => a.split === 'heldout' || args.holdout.includes(a.set);
  const train = attempts.filter((a) => !isHeld(a));
  const held = attempts.filter(isHeld);
  const trainPairs = pairsFor(train, orders);
  const heldPairs = pairsFor(held, orders);
  const out: string[] = [];
  const p = (s = '') => out.push(s);

  const nFree = Object.values(model.params).filter((x) => !x.fixed).length;
  p(`fit: model ${args.model} (domain ${model.domain}), data ${basename(args.from!)}, prior ${args.prior}`);
  p(`train ${train.length} attempts in ${new Set(train.map((a) => a.set)).size} sets, ${trainPairs.length} order pairs; held out ${held.length}; no measurements ${skipped}`);
  p(`params: ${Object.keys(model.params).length} (${nFree} free, ${Object.keys(model.params).length - nFree} fixed)`);
  p();

  const now = currentValues(model);
  const neutral = neutralValues(model);
  const fitted = fit(model, train, trainPairs, { prior: args.prior });
  const rows: [string, Stats | null][] = [
    ['grader as run', graderStats(train, trainPairs)],
    ['params file now', evaluate(model, now, train, trainPairs)],
    ['neutral params', evaluate(model, neutral, train, trainPairs)],
    ['fitted', evaluate(model, fitted.values, train, trainPairs)],
  ];
  p('TRAIN (fitted on)       in-band          mean d   order');
  for (const [name, s] of rows) p(`  ${name.padEnd(20)}${s ? fmtStats(s) : 'n/a'}`);
  if (held.length) {
    const g = graderStats(held, heldPairs);
    p('HELD OUT (never fitted on)');
    p(`  ${'grader as run'.padEnd(20)}${g ? fmtStats(g) : 'n/a'}`);
    p(`  ${'neutral params'.padEnd(20)}${fmtStats(evaluate(model, neutral, held, heldPairs))}`);
    p(`  ${'fitted'.padEnd(20)}${fmtStats(evaluate(model, fitted.values, held, heldPairs))}`);
  }
  p(`loss (mean d^2 + order + prior): neutral ${fitted.startLoss.toFixed(3)} -> fitted ${fitted.loss.toFixed(3)}`);
  p();

  p('Parameters (fitted value, [min, max], neutral; * = differs from the file now):');
  for (const [k, pr] of Object.entries(model.params)) {
    const v = fitted.values[k];
    const tag = pr.fixed ? 'fixed' : `[${pr.min}, ${pr.max}] neutral ${pr.neutral ?? pr.value}`;
    const moved = !pr.fixed && Math.abs(v - pr.value) > 1e-9 ? '  *' : '';
    p(`  ${k.padEnd(32)} ${v.toFixed(4).padStart(7)}  ${tag}${moved}`);
  }
  p();

  const fs = evaluate(model, fitted.values, train, trainPairs).scores;
  const misses = train.map((a, i) => ({ a, s: fs[i], d: bandDistance(fs[i], a.band) }))
    .filter((m) => m.d > 0)
    .sort((x, y) => y.d - x.d || (x.a.set + x.a.key < y.a.set + y.a.key ? -1 : 1))
    .slice(0, 10);
  p('Ten worst misses after fitting (train):');
  for (const m of misses) {
    const dir = m.s < m.a.band[0] ? 'harsh' : 'lenient';
    p(`  ${m.a.set.padEnd(16)} ${m.a.key.padEnd(36)} [${m.a.band[0]}-${m.a.band[1]}]`.padEnd(64) + `${m.s.toFixed(1).padStart(6)}  ${dir} by ${m.d.toFixed(1)}`);
  }
  if (!misses.length) p('  none');

  let cvNote: unknown = undefined;
  if (args.cv) {
    p();
    p('LEAVE-ONE-SET-OUT (fit on the other sets, score the held-out set):');
    p('  held-out set         n   neutral: in   mean d   order   | fitted: in   mean d   order');
    const perSet: Record<string, unknown> = {};
    const cell = (s: Stats) => `${String(s.inBand).padStart(9)}   ${s.meanD.toFixed(2).padStart(6)}   ${`${s.ordersHeld}/${s.ordersTotal}`.padStart(5)}`;
    const cv = crossValidate(model, train, orders, { prior: args.prior });
    for (const c of cv.sets) {
      p(`  ${c.set.padEnd(18)} ${String(c.neutral.n).padStart(4)}   ${cell(c.neutral)}   | ${cell(c.fitted)}`);
      perSet[c.set] = { n: c.neutral.n, neutral: { inBand: c.neutral.inBand, meanD: +c.neutral.meanD.toFixed(3) }, fitted: { inBand: c.fitted.inBand, meanD: +c.fitted.meanD.toFixed(3) } };
    }
    const t = { n: cv.n, inN: cv.neutral.inBand, oN: cv.neutral.held, inF: cv.fitted.inBand, oF: cv.fitted.held, oT: cv.orders };
    const mdN = cv.neutral.meanD, mdF = cv.fitted.meanD;
    p(`  ${'overall'.padEnd(18)} ${String(t.n).padStart(4)}   ${String(t.inN).padStart(9)}   ${mdN.toFixed(2).padStart(6)}   ${`${t.oN}/${t.oT}`.padStart(5)}   | ${String(t.inF).padStart(9)}   ${mdF.toFixed(2).padStart(6)}   ${`${t.oF}/${t.oT}`.padStart(5)}`);
    const better = mdF < mdN - 1e-9 && t.inF >= t.inN && t.oF >= t.oN;
    p(`  verdict: leave-one-set-out ${better ? 'BETTER than neutral (fit may be adopted)' : 'NOT better than neutral on every count (do not adopt)'}`);
    cvNote = { n: t.n, neutral: { inBand: t.inN, meanD: +mdN.toFixed(3) }, fitted: { inBand: t.inF, meanD: +mdF.toFixed(3) }, perSet };
  }

  p();
  if (args.write) {
    const sb = evaluate(model, now, train, trainPairs), sa = evaluate(model, fitted.values, train, trainPairs);
    const free: Values = {};
    for (const [k, pr] of Object.entries(model.params)) if (!pr.fixed) free[k] = fitted.values[k];
    const where = model.save!(free, {
      date: new Date().toISOString().slice(0, 10),
      from: basename(args.from!),
      prior: args.prior,
      train: { n: sa.n, before: { inBand: sb.inBand, meanD: +sb.meanD.toFixed(3) }, after: { inBand: sa.inBand, meanD: +sa.meanD.toFixed(3) } },
      ...(cvNote ? { leaveOneSetOut: cvNote } : {}),
    });
    p(`wrote fitted values to ${basename(where)}`);
  } else {
    p('(nothing written; add --write to save the fitted values)');
  }

  process.stdout.write(out.join('\n') + '\n');
  process.stderr.write(`fit time: ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { process.stderr.write(`${(e as Error).message}\n`); process.exit(1); }
}
