/** Typed loader for src/criteria/params.json and the list of fittable numbers. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { combineRaw, checkParams, type CombineParams } from './combine';
import type { FitModel, FitParam } from './model';

export interface Param {
  value: number;
  min?: number;
  max?: number;
  neutral?: number;
  fixed?: boolean;
  meaning?: string;
}

export interface ParamsBlock {
  about?: string;
  stub?: boolean;
  groups: Record<string, { meaning?: string; weight: Param; blend?: Param }>;
  /** Which measurements feed combine: the criteria list, the four sub-scores, or both side by side (default: criteria if present, else sub-scores). */
  inputs?: 'criteria' | 'breakdown' | 'both' | 'auto';
  criteria: Record<string, { group: string; meaning?: string; share: Param; gamma: Param }>;
  limiters?: { criterion: string; meaning?: string; strength: Param }[];
  gate?: { groups: string[]; by: string; meaning?: string; floor: Param; knee: Param } | null;
  fit?: unknown;
}

export const PARAMS_PATH = fileURLToPath(new URL('./params.json', import.meta.url));

export function loadParamsFile(path = PARAMS_PATH): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function getBlock(file: Record<string, unknown>, domain: string): ParamsBlock {
  const b = file[domain] as ParamsBlock | undefined;
  if (!b || typeof b !== 'object') throw new Error(`params: no block for domain "${domain}"`);
  if (b.stub) throw new Error(`params: the "${domain}" block is a stub; fill in its groups and criteria first`);
  return b;
}

export function toCombineParams(b: ParamsBlock): CombineParams {
  const groups: CombineParams['groups'] = {};
  for (const [g, x] of Object.entries(b.groups)) groups[g] = x.blend ? { weight: x.weight.value, blend: x.blend.value } : { weight: x.weight.value };
  const criteria: CombineParams['criteria'] = {};
  for (const [id, c] of Object.entries(b.criteria)) criteria[id] = { group: c.group, share: c.share.value, gamma: c.gamma.value };
  return {
    groups,
    criteria,
    limiters: (b.limiters ?? []).map((l) => ({ criterion: l.criterion, strength: l.strength.value })),
    gate: b.gate ? { groups: b.gate.groups, by: b.gate.by, floor: b.gate.floor.value, knee: b.gate.knee.value } : null,
  };
}

export type ParamKind = 'weight' | 'blend' | 'share' | 'gamma' | 'strength' | 'floor' | 'knee';

export interface Handle {
  name: string;
  kind: ParamKind;
  group?: string;
  param: Param;
}

/** Every number in the block, in a fixed order (fixed ones included, flagged). */
export function allHandles(b: ParamsBlock): Handle[] {
  const out: Handle[] = [];
  for (const [g, x] of Object.entries(b.groups)) {
    out.push({ name: `groups.${g}.weight`, kind: 'weight', param: x.weight });
    if (x.blend) out.push({ name: `groups.${g}.blend`, kind: 'blend', param: x.blend });
  }
  for (const [id, c] of Object.entries(b.criteria)) {
    out.push({ name: `criteria.${id}.share`, kind: 'share', group: c.group, param: c.share });
    out.push({ name: `criteria.${id}.gamma`, kind: 'gamma', param: c.gamma });
  }
  for (const l of b.limiters ?? []) out.push({ name: `limiters.${l.criterion}.strength`, kind: 'strength', param: l.strength });
  if (b.gate) {
    out.push({ name: 'gate.floor', kind: 'floor', param: b.gate.floor });
    out.push({ name: 'gate.knee', kind: 'knee', param: b.gate.knee });
  }
  return out;
}

/** The numbers a fit may move: not fixed and with both bounds. */
export function freeHandles(b: ParamsBlock): Handle[] {
  return allHandles(b).filter((h) => !h.param.fixed && h.param.min !== undefined && h.param.max !== undefined);
}

/**
 * Measurements from one grader result. `auto`: the criteria list if present,
 * else the sub-scores / 100 (named like their group). `criteria` / `breakdown`:
 * only that source. `both`: the sub-scores as stand-in criteria alongside the list.
 */
export function extractCriteria(result: unknown, inputs: ParamsBlock['inputs'] = 'auto'): Record<string, number | null> | null {
  const r = result as any;
  const crit: Record<string, number | null> = {};
  if (Array.isArray(r?.criteria)) for (const c of r.criteria) if (c && typeof c.id === 'string') crit[c.id] = typeof c.value === 'number' ? c.value : null;
  const hasCrit = Object.values(crit).some((v) => v !== null);
  const sub: Record<string, number | null> = {};
  const s = r?.breakdown ?? r?.pillars;
  if (s && typeof s === 'object') for (const [k, v] of Object.entries(s)) sub[k] = typeof v === 'number' ? v / 100 : null;
  const hasSub = Object.values(sub).some((v) => v !== null);
  let out: Record<string, number | null>;
  if (inputs === 'criteria') out = crit;
  else if (inputs === 'breakdown') out = sub;
  else if (inputs === 'both') out = { ...crit, ...sub };
  else out = hasCrit ? crit : sub;
  return (inputs === 'criteria' ? hasCrit : inputs === 'breakdown' ? hasSub : hasCrit || hasSub) ? out : null;
}

/**
 * A FitModel over combine() for one params block. Param names are the handle
 * names (e.g. `criteria.content.gamma`). `saveTo` (a params.json path) enables --write.
 */
export function makeCombineModel(
  block: ParamsBlock,
  domain: FitModel['domain'],
  saveTo?: string,
): FitModel<Record<string, number | null>> {
  const base = JSON.parse(JSON.stringify(block)) as ParamsBlock;
  const params: Record<string, FitParam> = {};
  for (const h of allHandles(base)) {
    const pr = h.param;
    params[h.name] = {
      value: pr.value, min: pr.min ?? pr.value, max: pr.max ?? pr.value,
      fixed: pr.fixed || pr.min === undefined || pr.max === undefined,
      meaning: pr.meaning ?? '', neutral: pr.neutral,
    };
  }
  const blockWith = (values: Record<string, number>): ParamsBlock => {
    const b = JSON.parse(JSON.stringify(base)) as ParamsBlock;
    for (const h of allHandles(b)) if (!h.param.fixed && values[h.name] !== undefined) h.param.value = values[h.name];
    return b;
  };
  const cache = new WeakMap<object, CombineParams>();
  return {
    domain,
    params,
    extract: (result) => extractCriteria(result, base.inputs ?? 'auto'),
    score(m, values) {
      let p = cache.get(values);
      if (!p) { p = toCombineParams(blockWith(values)); cache.set(values, p); }
      return combineRaw(m, p).total;
    },
    tidy(values) {
      const b = blockWith(values);
      normaliseShares(b);
      const out = { ...values };
      for (const h of allHandles(b)) if (out[h.name] !== undefined) out[h.name] = h.param.value;
      checkParams(toCombineParams(b));
      return out;
    },
    save: saveTo
      ? (values, note) => {
          const file = loadParamsFile(saveTo);
          const target = getBlock(file, domain);
          for (const h of freeHandles(target)) if (values[h.name] !== undefined) h.param.value = values[h.name];
          target.fit = note;
          writeFileSync(saveTo, JSON.stringify(file, null, 2) + '\n');
          return saveTo;
        }
      : undefined,
  };
}

/** Rescale the shares in each group so they sum to 1 (rounded to 4 decimals). */
export function normaliseShares(b: ParamsBlock): void {
  const byGroup: Record<string, Param[]> = {};
  for (const c of Object.values(b.criteria)) (byGroup[c.group] ??= []).push(c.share);
  for (const list of Object.values(byGroup)) {
    if (list.some((p) => p.fixed)) continue; // a group with a fixed share keeps its raw shares
    const sum = list.reduce((s, p) => s + p.value, 0);
    if (sum <= 0) continue;
    for (const p of list) p.value = Math.round((p.value / sum) * 1e4) / 1e4;
  }
}
