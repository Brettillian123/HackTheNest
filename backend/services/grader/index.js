// Grader adapter: scores a run's output through the per-kind table in ../kinds.js.
//
// HOW TO SWITCH TO THE REAL GRADER: set two environment variables (Vercel project settings):
//   GRADER_URL      base URL of the grader service, e.g. http://64.177.10.74:8080 (plain http is fine)
//   GRADER_API_KEY  the same key the grader service was started with
// With both set, runs are scored by the grader service (grader/service/README.md) and results are
// final (provisional: false). Without them, page runs get the stand-in scorer (standin.js) and are
// marked provisional; kinds without a stand-in (doc) cannot be scored. No code changes are needed.
import { KINDS } from '../kinds.js';
import { standinScore } from './standin.js';

// 45 s fits under the function's maxDuration of 60 s with room for the response.
const BUDGET_MS = 45_000;
const HEALTH_TIMEOUT_MS = 2_000;
const HEALTH_TTL_MS = 60_000;

export const round1 = n => Math.round(Number(n) * 10) / 10;

export function graderMode(env) {
  return env.GRADER_URL && env.GRADER_API_KEY ? 'service' : 'standin';
}

const PILLARS = { works: 'It works', engineering: 'Well engineered', looks: 'Looks like the goal' };
const GROUPS = new Set(['works', 'looks', 'engineering']);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : null);

function mapCosts(list) {
  return (Array.isArray(list) ? list : [])
    .map(f => (typeof f === 'string' ? { points: 0, message: f } : { points: round1(num(f?.points) ?? 0), message: str(f?.message) || '' }))
    .filter(c => c.message)
    .sort((a, b) => b.points - a.points);
}

function mapCriteria(list) {
  if (!Array.isArray(list)) return undefined;
  return list.filter(c => c && typeof c === 'object' && (typeof c.id === 'string' || typeof c.name === 'string')).slice(0, 50).map(c => ({
    id: str(c.id, 100) || str(c.name, 100),
    name: str(c.name, 200) || str(c.id, 200),
    group: GROUPS.has(c.group) ? c.group : null,
    value: num(c.value) === null ? null : Math.max(0, Math.min(1, c.value)),
    notes: Array.isArray(c.notes) ? c.notes.filter(n => typeof n === 'string').slice(0, 5).map(n => n.slice(0, 500)) : [],
  }));
}

// Maps the grader service's result to the shape the site renders. Every field beyond `total` is
// read defensively: absent, null or malformed fields are left out. A result with an `error` is an
// ungradable submission: total 0 and the reason in `rejectedReason`.
export function mapServiceResult(result) {
  const rejectedReason = str(result.error);
  const total = rejectedReason ? 0 : round1(Math.max(0, Math.min(120, num(result.total) ?? 0)));
  const pillars = Object.entries(PILLARS)
    .filter(([key]) => num(result.pillars?.[key]) !== null)
    .map(([id, label]) => ({ id, label, value: round1(result.pillars[id]) }));
  const checks = pillars.map(p => ({ label: p.label, passed: p.value >= 90 }));
  const criteriaFeedback = mapCosts(result.criteriaFeedback);
  const costs = criteriaFeedback.length ? criteriaFeedback : mapCosts(result.feedback);
  if (rejectedReason && !costs.length) costs.push({ points: 0, message: rejectedReason });
  const out = { total, checks, passedCount: checks.filter(c => c.passed).length, totalChecks: checks.length, costs, provisional: false };
  if (pillars.length) out.pillars = pillars;
  if (result.engineering && typeof result.engineering === 'object') {
    const e = result.engineering;
    out.engineering = { efficiency: num(e.efficiency), accessibility: num(e.accessibility), cleanCode: num(e.cleanCode), decidedBy: str(e.decidedBy, 50) };
  }
  if (num(result.bonus) !== null) out.bonus = round1(result.bonus);
  if (typeof result.exactMatch === 'boolean') out.exactMatch = result.exactMatch;
  const criteria = mapCriteria(result.criteria);
  if (criteria) out.criteria = criteria;
  if (str(result.version, 50)) out.graderVersion = result.version;
  if (rejectedReason) out.rejectedReason = rejectedReason;
  return out;
}

// The grader answered but sent no numeric total and no error: nothing is stored (502).
export class GraderRejected extends Error {
  constructor(message) { super(message); this.name = 'GraderRejected'; }
}
// The grader could not be reached, timed out or stayed busy.
export class GraderUnavailable extends Error {
  constructor(message) { super(message); this.name = 'GraderUnavailable'; }
}
// No grader is configured and this kind has no stand-in.
export class GraderMissing extends Error {
  constructor(message) { super(message); this.name = 'GraderMissing'; }
}

const baseUrl = env => String(env.GRADER_URL).replace(/\/+$/, '');

async function callService({ route, body, env, fetch, now }) {
  const started = now();
  const budget = Number(env.GRADER_TIMEOUT_MS) > 0 ? Number(env.GRADER_TIMEOUT_MS) : BUDGET_MS;
  const url = `${baseUrl(env)}${route}`;
  const payload = JSON.stringify(body);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const left = budget - (now() - started);
    if (left < 1000) break;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GRADER_API_KEY}` },
        body: payload,
        signal: AbortSignal.timeout(left),
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new GraderUnavailable('The grader did not answer in time.');
      throw new GraderUnavailable('Could not reach the grader.');
    }
    if (res.status === 503 && attempt === 0) {
      const raw = res.headers.get('retry-after');
      const header = raw == null || raw === '' ? NaN : Number(raw);
      const wait = (Number.isFinite(header) && header >= 0 ? header : 5) * 1000;
      if (budget - (now() - started) - wait < 1000) throw new GraderUnavailable('The grader is busy.');
      await new Promise(resolve => setTimeout(resolve, wait));
      continue;
    }
    if (!res.ok) {
      console.error(`Grader service answered ${res.status}`);
      throw new GraderUnavailable(res.status === 503 ? 'The grader is busy.' : `The grader could not score this page (${res.status}).`);
    }
    let parsed;
    try { parsed = await res.json(); } catch { throw new GraderUnavailable('The grader sent an answer that could not be read.'); }
    const result = parsed?.result;
    if (!result || typeof result !== 'object') throw new GraderUnavailable('The grader sent an answer that could not be read.');
    if (!str(result.error) && num(result.total) === null) {
      console.error('Grader service sent no total');
      throw new GraderRejected('The grader could not score this page.');
    }
    return { ...mapServiceResult(result), raw: result };
  }
  throw new GraderUnavailable('The grader did not answer in time.');
}

// Scores one run's output. Returns { total, checks, passedCount, totalChecks, costs, provisional,
// ...service fields, raw?, notice? }. If the service fails and the kind has a stand-in, the stand-in
// score is used and `notice` says why.
export async function gradeRun({ challenge, output, env, fetch, now = Date.now }) {
  const kind = KINDS[challenge.kind || 'page'];
  // Output the grader would only reject (a workflow plan that is not JSON) is scored 0 here, as the grader would.
  const invalid = kind.validate ? kind.validate(output) : null;
  if (invalid) return { ...mapServiceResult({ total: 0, error: invalid }), raw: { total: 0, error: invalid } };
  if (graderMode(env) === 'standin') {
    if (!kind.standin) throw new GraderMissing('This challenge is scored by the grader service, which is not set up yet.');
    return kind.standin(challenge, output);
  }
  try {
    return await callService({ route: kind.graderRoute, body: kind.gradeBody(challenge, output), env, fetch, now });
  } catch (error) {
    if (!(error instanceof GraderUnavailable) || !kind.standin) throw error;
    console.error(`Grader fallback: ${error.message}`);
    return { ...kind.standin(challenge, output), notice: `${error.message} This is a provisional score from the quick checker; score again later for a full grade.` };
  }
}

// Kept for single-page callers and tests.
export function gradePage({ goalHtml, html, env, fetch, now = Date.now }) {
  return gradeRun({ challenge: { kind: 'page', goalHtml }, output: html, env, fetch, now });
}

export { standinScore };

// The live grader's version from its /health (no key), cached per instance for 60 s; null when
// unreachable or not configured.
const healthCache = new WeakMap();
export async function liveGraderVersion({ env, fetch, now = Date.now }) {
  if (graderMode(env) !== 'service') return null;
  const url = `${baseUrl(env)}/health`;
  const perFetch = healthCache.get(fetch) || new Map();
  healthCache.set(fetch, perFetch);
  const hit = perFetch.get(url);
  if (hit && now() - hit.at < HEALTH_TTL_MS) return hit.version;
  let version = null;
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (res.ok) version = str((await res.json())?.version, 50);
  } catch {
    version = null;
  }
  perFetch.set(url, { at: now(), version });
  return version;
}
