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
const PROMPT_CHECK_TIMEOUT_MS = 5_000;
export const PROMPT_CHECK_FALLBACK = 'Write the prompt in your own words.';

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
  constructor(message, status = null) { super(message); this.name = 'GraderUnavailable'; this.status = status; }
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
      throw new GraderUnavailable(res.status === 503 ? 'The grader is busy.' : `The grader could not score this page (${res.status}).`, res.status);
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
// Intent grading: for a challenge with keyFacts, the grade request may carry
// `intent: { "index.html": { keyFacts } }`. Older graders reject unknown top-level fields, so it is
// sent only when GRADER_INTENT=on, or when the grader's /health reports `intent: true` or a
// `features` list with "intent" (GRADER_INTENT=off never sends it). A 400 to a request with intent
// is retried once without it, and this instance stops sending it to that grader.
const intentRefused = new WeakMap();
const intentSetting = env => String(env.GRADER_INTENT || '').trim().toLowerCase();

async function intentEnabled({ env, fetch, now }) {
  if (intentSetting(env) === 'off') return false;
  if (intentRefused.get(fetch)?.has(baseUrl(env))) return false;
  if (intentSetting(env) === 'on') return true;
  return (await liveGraderHealth({ env, fetch, now })).intent;
}

function rememberIntentRefused(env, fetch) {
  const set = intentRefused.get(fetch) || new Set();
  set.add(baseUrl(env));
  intentRefused.set(fetch, set);
}

// Every result says whether intent grading was used (`intentGraded`), so the two styles are not mixed.
export async function gradeRun({ challenge, output, env, fetch, now = Date.now }) {
  const kind = KINDS[challenge.kind || 'page'];
  // Output the grader would only reject (a workflow plan that is not JSON) is scored 0 here, as the grader would.
  const invalid = kind.validate ? kind.validate(output) : null;
  if (invalid) return { ...mapServiceResult({ total: 0, error: invalid }), raw: { total: 0, error: invalid }, intentGraded: false };
  if (graderMode(env) === 'standin') {
    if (!kind.standin) throw new GraderMissing('This challenge is scored by the grader service, which is not set up yet.');
    return { ...kind.standin(challenge, output), intentGraded: false };
  }
  const body = kind.gradeBody(challenge, output);
  const intent = kind.intent ? kind.intent(challenge) : null;
  try {
    if (intent && await intentEnabled({ env, fetch, now })) {
      try {
        return { ...(await callService({ route: kind.graderRoute, body: { ...body, intent }, env, fetch, now })), intentGraded: true };
      } catch (error) {
        if (!(error instanceof GraderUnavailable && error.status === 400)) throw error;
        console.error('Grader refused intent (400): retrying without it, and not sending it again from this instance');
        rememberIntentRefused(env, fetch);
      }
    }
    return { ...(await callService({ route: kind.graderRoute, body, env, fetch, now })), intentGraded: false };
  } catch (error) {
    if (!(error instanceof GraderUnavailable) || !kind.standin) throw error;
    console.error(`Grader fallback: ${error.message}`);
    return { ...kind.standin(challenge, output), intentGraded: false, notice: `${error.message} This is a provisional score from the quick checker; score again later for a full grade.` };
  }
}

// Kept for single-page callers and tests.
export function gradePage({ goalHtml, html, env, fetch, now = Date.now }) {
  return gradeRun({ challenge: { kind: 'page', goalHtml }, output: html, env, fetch, now });
}

export { standinScore };

// The live grader's /health (no key), cached per instance for 60 s: { version, intent, promptCheck }.
// version is null and the flags false when unreachable or not configured; all read defensively.
const healthCache = new WeakMap();
export async function liveGraderHealth({ env, fetch, now = Date.now }) {
  if (graderMode(env) !== 'service') return { version: null, intent: false, promptCheck: false };
  const url = `${baseUrl(env)}/health`;
  const perFetch = healthCache.get(fetch) || new Map();
  healthCache.set(fetch, perFetch);
  const hit = perFetch.get(url);
  if (hit && now() - hit.at < HEALTH_TTL_MS) return hit.info;
  const info = { version: null, intent: false, promptCheck: false };
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (res.ok) {
      const body = await res.json();
      info.version = str(body?.version, 50);
      info.intent = body?.intent === true || (Array.isArray(body?.features) && body.features.includes('intent'));
      info.promptCheck = body?.promptCheck === true || (Array.isArray(body?.features) && body.features.includes('promptCheck'));
    }
  } catch { /* unreachable: defaults */ }
  perFetch.set(url, { at: now(), info });
  return info;
}

export async function liveGraderVersion(deps) {
  return (await liveGraderHealth(deps)).version;
}

// Copy check (prepared, gated): before a run, POST /v1/check/prompt { prompt, challengeTexts } asks the
// grader whether the prompt mostly copies the challenge's brief or acceptance statements (never the
// content, which the model gets anyway). Sent only with GRADER_PROMPT_CHECK=on, or when the grader's
// /health reports `promptCheck: true` or a `features` list with "promptCheck" (off never sends it).
// Returns the refusal message when the grader says `ok: false`, else null. Any error, timeout or
// unreadable answer lets the run go ahead.
const promptCheckSetting = env => String(env.GRADER_PROMPT_CHECK || '').trim().toLowerCase();

export function challengeTexts(challenge) {
  return [challenge.brief, ...(challenge.acceptance || [])].filter(t => typeof t === 'string' && t.trim());
}

export async function checkPromptCopy({ prompt, challenge, env, fetch, now = Date.now }) {
  if (graderMode(env) !== 'service' || promptCheckSetting(env) === 'off') return null;
  try {
    if (promptCheckSetting(env) !== 'on' && !(await liveGraderHealth({ env, fetch, now })).promptCheck) return null;
    const res = await fetch(`${baseUrl(env)}/v1/check/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GRADER_API_KEY}` },
      body: JSON.stringify({ prompt, challengeTexts: challengeTexts(challenge) }),
      signal: AbortSignal.timeout(PROMPT_CHECK_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const result = (await res.json())?.result;
    if (result?.ok !== false) return null;
    return str(result.message, 500)?.trim() || PROMPT_CHECK_FALLBACK;
  } catch (error) {
    console.error(`Prompt copy check skipped: ${error?.name || 'error'}`);
    return null;
  }
}
