// Grader adapter: picks the scorer for a run.
//
// HOW TO SWITCH TO THE REAL GRADER: set two environment variables (Vercel project settings):
//   GRADER_URL      base URL of the grader service, e.g. https://grader.example.com
//   GRADER_API_KEY  the same key the grader service was started with
// With both set, runs are scored by POST {GRADER_URL}/v1/grade/site (grader/service/README.md)
// and results are final (provisional: false). Without them, the stand-in scorer in standin.js
// is used and results are marked provisional. No code changes are needed either way.
import { standinScore } from './standin.js';

// 45 s fits under the function's maxDuration of 60 s with room for the response.
const BUDGET_MS = 45_000;

export function graderMode(env) {
  return env.GRADER_URL && env.GRADER_API_KEY ? 'service' : 'standin';
}

const PILLARS = { works: 'Page works', engineering: 'Clean code', looks: 'Looks like the goal' };

// Maps the grader service's result to the shape the site renders.
export function mapServiceResult(result) {
  const costs = (Array.isArray(result.feedback) ? result.feedback : [])
    .map(f => (typeof f === 'string' ? { points: 0, message: f } : { points: Math.round(Number(f?.points) || 0), message: String(f?.message || '') }))
    .filter(c => c.message)
    .sort((a, b) => b.points - a.points);
  const checks = Object.entries(PILLARS)
    .filter(([key]) => typeof result.pillars?.[key] === 'number')
    .map(([key, label]) => ({ label, passed: result.pillars[key] >= 90 }));
  const total = Math.max(0, Math.min(100, Math.round(Number(result.total) || 0)));
  return { total, checks, passedCount: checks.filter(c => c.passed).length, totalChecks: checks.length, costs, provisional: false };
}

// The grader answered but could not grade (an error field or no numeric total): nothing is stored.
export class GraderRejected extends Error {
  constructor(message) {
    super(message);
    this.name = 'GraderRejected';
  }
}

class GraderUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'GraderUnavailable';
  }
}

async function callService({ goalHtml, html, env, fetch, now }) {
  const started = now();
  const budget = Number(env.GRADER_TIMEOUT_MS) > 0 ? Number(env.GRADER_TIMEOUT_MS) : BUDGET_MS;
  const url = `${String(env.GRADER_URL).replace(/\/+$/, '')}/v1/grade/site`;
  const body = JSON.stringify({ goal: { 'index.html': goalHtml }, candidate: { 'index.html': html } });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const left = budget - (now() - started);
    if (left < 1000) break;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GRADER_API_KEY}` },
        body,
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
    if (!parsed?.result) throw new GraderUnavailable('The grader sent an answer that could not be read.');
    if (parsed.result.error || typeof parsed.result.total !== 'number' || !Number.isFinite(parsed.result.total)) {
      console.error('Grader service could not grade the page');
      throw new GraderRejected('The grader could not score this page.');
    }
    return mapServiceResult(parsed.result);
  }
  throw new GraderUnavailable('The grader did not answer in time.');
}

// Scores one page. Returns { total, checks, passedCount, totalChecks, costs, provisional, notice? }.
// If the service fails, the stand-in score is used and `notice` says why, in plain words.
export async function gradePage({ goalHtml, html, env, fetch, now = Date.now }) {
  if (graderMode(env) === 'standin') return standinScore(goalHtml, html);
  try {
    return await callService({ goalHtml, html, env, fetch, now });
  } catch (error) {
    if (!(error instanceof GraderUnavailable)) throw error;
    console.error(`Grader fallback: ${error.message}`);
    return { ...standinScore(goalHtml, html), notice: `${error.message} This is a provisional score from the quick checker; run again later for a full grade.` };
  }
}
