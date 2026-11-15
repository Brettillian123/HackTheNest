/**
 * combine: turns named criteria (each 0..1, or null when not measured) into a
 * score from 0 to 100. Small on purpose, so every constant can be explained:
 *
 *  - groups have FIXED weights (owner's choice, never fitted);
 *  - inside a group each criterion has a share (shares of the criteria present
 *    are renormalised, so a null criterion gives its share to the others) and
 *    a curve `value ** gamma` (gamma > 1: every slip costs more, the first ones
 *    most; gamma < 1: small slips cost less, big ones more);
 *  - a group's value is (1 - blend) x that mean + blend x its weakest
 *    criterion (blend 0 = plain mean, the default);
 *  - up to four limiters multiply the whole total by `1 - s * (1 - value ** gamma)`;
 *  - one optional gate scales the listed groups' credit by
 *    `min(1, floor + (1 - floor) * by / knee)`, where `by` is a criterion's raw
 *    value or, when no such criterion is present, a group's value.
 *
 * All ones give exactly 100; all zeros give 0; raising any criterion never
 * lowers the total. `lost` says how many points each criterion cost and sums
 * to 100 - total. Pure and deterministic.
 */

export interface CombineParams {
  /** blend: 0 = plain mean of the group's criteria, 1 = the weakest one decides. */
  groups: Record<string, { weight: number; blend?: number }>;
  criteria: Record<string, { group: string; share: number; gamma: number }>;
  limiters?: { criterion: string; strength: number }[];
  gate?: { groups: string[]; by: string; floor: number; knee: number } | null;
}

export interface CombineResult {
  total: number;
  groups: Record<string, number>;
  lost: Record<string, number>;
}

export const GAMMA_MIN = 0.4;
export const GAMMA_MAX = 3;
export const MAX_LIMITERS = 4;

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

function cleanValue(v: number | null | undefined): number | null {
  if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) return null;
  return clamp(v, 0, 1);
}

/** Throws on a params object that breaks the shape's rules. */
export function checkParams(p: CombineParams): void {
  for (const [id, c] of Object.entries(p.criteria)) {
    if (!p.groups[c.group]) throw new Error(`criterion ${id}: unknown group ${c.group}`);
    if (!(c.share >= 0)) throw new Error(`criterion ${id}: share must be >= 0`);
    if (!(c.gamma >= GAMMA_MIN && c.gamma <= GAMMA_MAX)) throw new Error(`criterion ${id}: gamma ${c.gamma} outside ${GAMMA_MIN}..${GAMMA_MAX}`);
  }
  for (const [g, w] of Object.entries(p.groups)) {
    if (!(w.weight >= 0)) throw new Error(`group ${g}: weight must be >= 0`);
    if (w.blend !== undefined && !(w.blend >= 0 && w.blend <= 1)) throw new Error(`group ${g}: blend outside 0..1`);
  }
  const lim = p.limiters ?? [];
  if (lim.length > MAX_LIMITERS) throw new Error(`at most ${MAX_LIMITERS} limiters`);
  for (const l of lim) {
    if (!p.criteria[l.criterion]) throw new Error(`limiter: unknown criterion ${l.criterion}`);
    if (!(l.strength >= 0 && l.strength <= 1)) throw new Error(`limiter ${l.criterion}: strength outside 0..1`);
  }
  if (p.gate) {
    const g = p.gate;
    if (!(g.floor >= 0 && g.floor <= 1)) throw new Error('gate: floor outside 0..1');
    if (!(g.knee > 0 && g.knee <= 1)) throw new Error('gate: knee outside (0, 1]');
    for (const gg of g.groups) if (!p.groups[gg]) throw new Error(`gate: unknown group ${gg}`);
    if (!p.criteria[g.by] && !p.groups[g.by]) throw new Error(`gate: unknown criterion or group ${g.by}`);
    if (g.groups.includes(g.by)) throw new Error('gate: a group cannot gate itself');
    if (p.criteria[g.by] && g.groups.includes(p.criteria[g.by].group)) throw new Error('gate: gating criterion cannot sit in a gated group');
  }
}

/** Same as combine but with the total unrounded (used by the fitter). */
export function combineRaw(values: Record<string, number | null>, p: CombineParams): CombineResult {
  // Present criteria per group.
  const byGroup: Record<string, { id: string; share: number; curved: number }[]> = {};
  for (const g of Object.keys(p.groups)) byGroup[g] = [];
  const curvedOf: Record<string, number> = {};
  for (const [id, c] of Object.entries(p.criteria)) {
    const v = cleanValue(values[id]);
    if (v === null) continue;
    const curved = v ** c.gamma;
    curvedOf[id] = curved;
    byGroup[c.group].push({ id, share: c.share, curved });
  }

  // Group values: (1 - blend) x share-weighted mean + blend x weakest criterion
  // (renormalised shares; equal split if all shares are 0; the weakest is taken
  // over criteria with a share, so a share-0 criterion only acts as a limiter).
  const groupVal: Record<string, number> = {};
  const normShare: Record<string, number> = {};
  const groupLoss: Record<string, Record<string, number>> = {}; // per criterion, sums to 1 - group value
  for (const [g, list] of Object.entries(byGroup)) {
    if (list.length === 0) continue;
    const sum = list.reduce((s, x) => s + x.share, 0);
    const b = p.groups[g].blend ?? 0;
    let mean = 0;
    for (const x of list) {
      const sh = sum > 0 ? x.share / sum : 1 / list.length;
      normShare[x.id] = sh;
      mean += sh * x.curved;
    }
    let weakest: { id: string; curved: number } | null = null;
    for (const x of list) if (normShare[x.id] > 0 && (weakest === null || x.curved < weakest.curved)) weakest = x;
    const minVal = weakest ? weakest.curved : 1;
    groupVal[g] = clamp((1 - b) * mean + b * minVal, 0, 1);
    const gl: Record<string, number> = {};
    for (const x of list) gl[x.id] = (1 - b) * normShare[x.id] * (1 - x.curved);
    if (weakest && b > 0) gl[weakest.id] += b * (1 - minVal);
    groupLoss[g] = gl;
  }

  // Fixed weights over the groups that have something measured.
  const presentGroups = Object.keys(groupVal);
  const sumW = presentGroups.reduce((s, g) => s + p.groups[g].weight, 0);

  // Gate.
  let gateFactor = 1;
  let gateBy: { kind: 'criterion' | 'group'; id: string } | null = null;
  if (p.gate) {
    const g = p.gate;
    const cv = p.criteria[g.by] ? cleanValue(values[g.by]) : null;
    let byVal: number | null = null;
    if (cv !== null) { byVal = cv; gateBy = { kind: 'criterion', id: g.by }; }
    else if (groupVal[g.by] !== undefined) { byVal = groupVal[g.by]; gateBy = { kind: 'group', id: g.by }; }
    if (byVal !== null) gateFactor = Math.min(1, g.floor + (1 - g.floor) * byVal / g.knee);
  }
  const gated = new Set(p.gate ? p.gate.groups : []);

  const lostRaw: Record<string, number> = {};
  const addLost = (id: string, pts: number) => { if (pts !== 0) lostRaw[id] = (lostRaw[id] ?? 0) + pts; };
  // Spread points over a group's criteria in proportion to what each lost there.
  const spreadOverGroup = (g: string, pts: number) => {
    const list = byGroup[g];
    const losses = list.map((x) => groupLoss[g][x.id]);
    const tot = losses.reduce((s, x) => s + x, 0);
    if (tot > 0) list.forEach((x, i) => addLost(x.id, pts * losses[i] / tot));
    else if (list.length) list.forEach((x) => addLost(x.id, pts / list.length));
  };

  let S = 0;
  for (const g of presentGroups) {
    const wn = sumW > 0 ? p.groups[g].weight / sumW : 1 / presentGroups.length;
    const G = groupVal[g];
    const f = gated.has(g) ? gateFactor : 1;
    S += wn * G * f;
    for (const x of byGroup[g]) addLost(x.id, 100 * wn * groupLoss[g][x.id]);
    const gatePts = 100 * wn * G * (1 - f);
    if (gatePts > 0 && gateBy) {
      if (gateBy.kind === 'criterion') addLost(gateBy.id, gatePts);
      else spreadOverGroup(gateBy.id, gatePts);
    }
  }
  S = clamp(S, 0, 1);

  // Limiters.
  const factors: { id: string; factor: number }[] = [];
  for (const l of p.limiters ?? []) {
    const curved = curvedOf[l.criterion];
    if (curved === undefined) continue;
    factors.push({ id: l.criterion, factor: clamp(1 - l.strength * (1 - curved), 0, 1) });
  }
  const L = factors.reduce((s, x) => s * x.factor, 1);
  const limPts = 100 * S * (1 - L);
  if (limPts > 0) {
    const zeros = factors.filter((x) => x.factor === 0);
    if (zeros.length) zeros.forEach((x) => addLost(x.id, limPts / zeros.length));
    else {
      const logs = factors.map((x) => -Math.log(x.factor));
      const tot = logs.reduce((s, x) => s + x, 0);
      factors.forEach((x, i) => addLost(x.id, limPts * logs[i] / tot));
    }
  }

  const total = clamp(100 * S * L, 0, 100);
  return { total, groups: groupVal, lost: lostRaw };
}

/** The score: total rounded to one decimal, `lost` summing to 100 - total. */
export function combine(values: Record<string, number | null>, p: CombineParams): CombineResult {
  const raw = combineRaw(values, p);
  const total = Math.round(raw.total * 10) / 10;
  const target = 100 - total;
  const sum = Object.values(raw.lost).reduce((s, x) => s + x, 0);
  const lost: Record<string, number> = {};
  for (const [id, pts] of Object.entries(raw.lost)) lost[id] = sum > 0 ? pts * target / sum : 0;
  return { total, groups: raw.groups, lost };
}
