import { describe, it, expect } from 'vitest';
import { combine, type CombineParams } from '../src/criteria/combine';
import { makeCombineModel, getBlock, loadParamsFile, toCombineParams, type ParamsBlock } from '../src/criteria/params';
import { getModel } from '../src/criteria/models';
import { fit, evaluate, pairsFor, type Attempt } from '../src/fit';

const P: CombineParams = {
  groups: { a: { weight: 0.5 }, b: { weight: 0.3 }, c: { weight: 0.2 } },
  criteria: {
    x: { group: 'a', share: 0.6, gamma: 1.8 },
    y: { group: 'a', share: 0.4, gamma: 0.5 },
    z: { group: 'b', share: 1, gamma: 1 },
    w: { group: 'c', share: 0.5, gamma: 2.5 },
    v: { group: 'c', share: 0.5, gamma: 0.7 },
  },
  limiters: [{ criterion: 'x', strength: 0.6 }, { criterion: 'z', strength: 0.3 }],
  gate: { groups: ['c'], by: 'x', floor: 0.3, knee: 0.7 },
};
const ids = Object.keys(P.criteria);
const grid = [0, 0.2, 0.5, 0.8, 1];

// Deterministic pseudo-random (LCG, fixed seed) for data generation only.
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

describe('combine', () => {
  it('all ones give exactly 100 and all zeros give 0', () => {
    expect(combine(Object.fromEntries(ids.map((k) => [k, 1])), P).total).toBe(100);
    expect(combine(Object.fromEntries(ids.map((k) => [k, 0])), P).total).toBe(0);
    const pages = toCombineParams(getBlock(loadParamsFile(), 'pages'));
    expect(combine({ content: 1, layout: 1, style: 1, visual: 1 }, pages).total).toBe(100);
    expect(combine({ content: 0, layout: 0, style: 0, visual: 0 }, pages).total).toBe(0);
  });

  it('is monotone in every criterion over a fixed grid', () => {
    const rnd = lcg(7);
    for (let t = 0; t < 300; t++) {
      const base: Record<string, number> = Object.fromEntries(ids.map((k) => [k, grid[Math.floor(rnd() * grid.length)]]));
      for (const k of ids) {
        let prev = -1;
        for (const g of grid) {
          const s = combine({ ...base, [k]: g }, P).total;
          expect(s).toBeGreaterThanOrEqual(prev);
          prev = s;
        }
      }
    }
  });

  it('lost sums to 100 - total', () => {
    const rnd = lcg(11);
    for (let t = 0; t < 200; t++) {
      const vals = Object.fromEntries(ids.map((k) => [k, rnd()]));
      const r = combine(vals, P);
      const sum = Object.values(r.lost).reduce((s, x) => s + x, 0);
      expect(sum).toBeCloseTo(100 - r.total, 9);
      for (const x of Object.values(r.lost)) expect(x).toBeGreaterThanOrEqual(0);
    }
  });

  it('a null criterion gives its share to the others', () => {
    const full = combine({ x: 1, y: 0.5, z: 1, w: 1, v: 1 }, P).total;
    const nullY = combine({ x: 1, y: null, z: 1, w: 1, v: 1 }, P);
    expect(nullY.total).toBe(100);
    expect(full).toBeLessThan(100);
    expect(nullY.lost.y).toBeUndefined();
    // A whole group missing: its fixed weight spreads over the others.
    expect(combine({ x: 1, y: 1, z: null, w: 1, v: 1 }, P).total).toBe(100);
  });
});

function makeBlock(): ParamsBlock {
  const p = (value: number, min: number, max: number, extra: object = {}) => ({ value, min, max, neutral: value, ...extra });
  return {
    groups: { a: { weight: { value: 0.6, fixed: true } }, b: { weight: { value: 0.4, fixed: true } } },
    criteria: {
      x: { group: 'a', share: p(0.5, 0.05, 0.95), gamma: p(1, 0.4, 3) },
      y: { group: 'a', share: p(0.5, 0.05, 0.95), gamma: p(1, 0.4, 3) },
      z: { group: 'b', share: p(1, 0.05, 1), gamma: p(1, 0.4, 3) },
    },
    limiters: [{ criterion: 'x', strength: p(0, 0, 1) }],
    gate: null,
  };
}

function synthetic(truth: ParamsBlock): Attempt<Record<string, number | null>>[] {
  const tp = toCombineParams(truth);
  const rnd = lcg(42);
  const out: Attempt<Record<string, number | null>>[] = [];
  for (let i = 0; i < 80; i++) {
    const m = { x: rnd(), y: rnd(), z: rnd() };
    const s = combine(m, tp).total;
    out.push({ set: `s${i % 4}`, split: 'train', key: `k${i}`, band: [s - 0.5, s + 0.5], m, graderScore: null });
  }
  return out;
}

describe('fit', () => {
  it('recovers a known balance and never moves fixed weights', () => {
    const truth = makeBlock();
    truth.criteria.x.gamma.value = 2;
    truth.criteria.x.share.value = 0.7;
    truth.criteria.y.share.value = 0.3;
    truth.limiters![0].strength.value = 0.5;
    const data = synthetic(truth);
    const model = makeCombineModel(makeBlock(), 'pages');
    const r = fit(model, data, [], { prior: 0.01 });
    expect(r.values['groups.a.weight']).toBe(0.6);
    expect(r.values['groups.b.weight']).toBe(0.4);
    expect(r.values['criteria.x.gamma']).toBeCloseTo(2, 0);
    expect(Math.abs(r.values['criteria.x.share'] - 0.7)).toBeLessThan(0.08);
    expect(Math.abs(r.values['limiters.x.strength'] - 0.5)).toBeLessThan(0.1);
    const s = evaluate(model, r.values, data, []);
    expect(s.inBand / s.n).toBeGreaterThan(0.9);
  });

  it('same input gives the same output twice', () => {
    const truth = makeBlock();
    truth.criteria.z.gamma.value = 0.6;
    const data = synthetic(truth);
    const orders = [{ set: 's0', higher: 'k0', lower: 'k4' }];
    const model = makeCombineModel(makeBlock(), 'pages');
    const a = fit(model, data, pairsFor(data, orders));
    const b = fit(makeCombineModel(makeBlock(), 'pages'), data, pairsFor(data, orders));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the pages model is registered and its fixed weights are the owner\'s', () => {
    const m = getModel('pages');
    expect(m.params['groups.content.weight']).toMatchObject({ value: 0.35, fixed: true });
    expect(m.params['groups.visual.weight']).toMatchObject({ value: 0.2, fixed: true });
    expect(m.score({ content: 1, layout: 1, style: 1, visual: 1 }, Object.fromEntries(Object.entries(m.params).map(([k, p]) => [k, p.value])))).toBeCloseTo(100, 9);
  });
});
