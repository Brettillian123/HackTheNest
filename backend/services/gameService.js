// Attempts and runs. An attempt is a chain of runs by one player on one challenge. A run adds 1 to
// the attempt's prompt count only once its output has been fully generated and saved; a run that
// fails or is cancelled mid-stream is discarded. "Start over" closes the open attempt; the next run
// opens a new one.
import { randomBytes } from 'node:crypto';
import { HttpError } from '../controller/http.js';
import { rankChange } from './boardService.js';
import { getChallengeFile } from './challengeStore.js';
import { KINDS } from './kinds.js';
import { GraderMissing, GraderRejected, GraderUnavailable, gradeRun, graderMode, liveGraderVersion, round1 } from './grader/index.js';

export const ID_RE = /^(att|run)_[A-Za-z0-9_-]{16}$/;

// Prompt-pasting rule (page challenges): thresholds in one place.
export const PROMPT_RULES = { maxSharedRun: 120, maxTags: 5, maxCssBlocks: 5 };
export const PASTED_CODE = 'Describe the page in your own words. Prompts cannot contain page code.';

// true when the prompt contains code copied from the goal or looks like page code.
export function promptHasCode(prompt, goalHtml) {
  if ((prompt.match(/<\/?[a-zA-Z][^<>]*>/g) || []).length > PROMPT_RULES.maxTags) return true;
  if ((prompt.match(/[^{}]+\{[^{}]*\}/g) || []).length > PROMPT_RULES.maxCssBlocks) return true;
  const p = prompt.replace(/\s+/g, '');
  const g = goalHtml.replace(/\s+/g, '');
  const size = PROMPT_RULES.maxSharedRun + 1;
  for (let i = 0; i + size <= p.length; i += 1) {
    if (g.includes(p.slice(i, i + size))) return true;
  }
  return false;
}

export function newId(prefix) {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

export function publicAttempt(a) {
  return { id: a._id, slug: a.slug, promptCount: a.promptCount, best: a.best, bestPromptCount: a.bestPromptCount, open: a.open, startedAt: new Date(a.createdAt).toISOString() };
}

// The grader's raw result without its bulky measurements (sent only for single runs).
function trimRaw(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { measurements, ...rest } = raw;
  return rest;
}

export function publicRun(r, { withOutput = false, withRaw = false } = {}) {
  const out = { id: r._id, n: r.n, kind: r.kind || 'page', prompt: r.prompt, model: r.model, status: r.status, result: r.result || null, at: new Date(r.createdAt).toISOString() };
  if (withOutput) {
    if ((r.kind || 'page') === 'page') out.html = r.html;
    else out.markdown = r.markdown ?? null;
  }
  if (withRaw) out.graderResult = trimRaw(r.graderRaw);
  return out;
}

const outputOf = run => (run[KINDS[run.kind || 'page']?.outputField || 'html'] || '');

// The player's open attempt on the challenge, created if needed. Two parallel first runs may race
// to create it; the loser of the race (duplicate key) reads the winner's attempt.
async function openAttempt(player, slug, { store }, at) {
  const found = await store.getOpenAttempt(player, slug);
  if (found) return found;
  try {
    return await store.createAttempt({
      _id: newId('att'), slug, ownerKind: player.kind, ownerId: player.id, username: player.username,
      open: true, promptCount: 0, best: null, bestPromptCount: null, bestAt: null, createdAt: at, updatedAt: at,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const winner = await store.getOpenAttempt(player, slug);
    if (!winner) throw error;
    return winner;
  }
}

// The last finished output of the open attempt, for follow-up runs.
export async function previousOutput(player, challenge, { store }) {
  const open = await store.getOpenAttempt(player, challenge.slug);
  if (!open) return null;
  const runs = await store.listRuns(open._id);
  const last = [...runs].reverse().find(r => r.status === 'done' && outputOf(r));
  return last ? outputOf(last) : null;
}

// Saves a new run in "generating" state. Its n is provisional (prompt count + 1) until it finishes.
export async function beginRun({ player, challenge, prompt, model, runId }, deps) {
  const at = new Date(deps.now());
  const attempt = await openAttempt(player, challenge.slug, deps, at);
  const run = await deps.store.insertRun({
    _id: runId, attemptId: attempt._id, slug: challenge.slug, kind: challenge.kind, ownerKind: player.kind, ownerId: player.id, username: player.username,
    n: attempt.promptCount + 1, prompt, model, [KINDS[challenge.kind].outputField]: '', status: 'generating', result: null, score: null, provisional: null,
    graderVersion: null, graderRaw: null, createdAt: at, finishedAt: null, scoredAt: null,
  });
  return { attempt, run };
}

// A finished output counts as a prompt; anything else is discarded.
export async function finishRun(run, { output, status }, { store, now }) {
  if (status !== 'done') {
    await store.deleteRun(run._id);
    return null;
  }
  const at = new Date(now());
  const attempt = await store.bumpPromptCount(run.attemptId, at);
  await store.updateRun(run._id, { [KINDS[run.kind || 'page'].outputField]: output, status, n: attempt ? attempt.promptCount : run.n, finishedAt: at });
  return attempt;
}

function owns(doc, player) {
  return doc && doc.ownerKind === player.kind && doc.ownerId === player.id;
}

// A saved result is graded again (and replaced) when it is provisional while the grader service
// is configured, or when it came from a grader version other than the live one.
async function needsRegrade(run, deps) {
  if (!run.result || graderMode(deps.env) !== 'service') return false;
  if (run.result.provisional === true) return true;
  if (typeof run.graderVersion !== 'string') return false;
  const live = await liveGraderVersion(deps);
  return Boolean(live && live !== run.graderVersion);
}

export async function scoreRun({ player, runId }, deps) {
  const { store, env, fetch, now } = deps;
  const run = await store.getRun(runId);
  if (!owns(run, player)) throw new HttpError(404, 'There is no run with that id.');
  const attempt = await store.getAttempt(run.attemptId);
  if (run.result && !(await needsRegrade(run, deps))) {
    return { attempt: attempt ? publicAttempt(attempt) : null, run: publicRun(run, { withRaw: true }) };
  }
  if (run.status === 'generating') throw new HttpError(409, 'This run is still generating. Score it when the page has finished.');
  const output = outputOf(run);
  if (run.status !== 'done' || !output) throw new HttpError(409, 'This run did not finish, so it cannot be scored. Run again.');
  const challenge = getChallengeFile(run.slug);
  if (!challenge) throw new HttpError(404, 'That challenge no longer exists.');

  let grade;
  try { grade = await gradeRun({ challenge, output, env, fetch, now }); }
  catch (error) {
    if (error instanceof GraderRejected) throw new HttpError(502, 'The grader could not score this page. Try scoring it again.');
    if (error instanceof GraderMissing) throw new HttpError(503, error.message, { code: 'no_grader' });
    if (error instanceof GraderUnavailable) throw new HttpError(503, `${error.message} Try scoring again in a minute.`);
    throw error;
  }
  const { raw = null, notice, ...mapped } = grade;
  const total = round1(mapped.total);
  const runs = await store.listRuns(run.attemptId);
  const previous = runs.filter(r => r.n < run.n && r.result).pop();
  const at = new Date(now());
  let rank = null;
  if (!mapped.provisional) {
    try { rank = await rankChange(player, run.slug, { score: total, promptCount: run.n, at }, deps); }
    catch { rank = null; }
  }
  const result = {
    ...mapped,
    total,
    delta: previous ? round1(total - previous.result.total) : null,
    rank,
  };
  if (notice) result.notice = notice;
  await store.updateRun(run._id, {
    result, score: total, provisional: mapped.provisional, graderVersion: mapped.graderVersion ?? null, graderRaw: raw, scoredAt: at,
  });

  if (attempt) {
    // Recomputed from the attempt's runs, so a replaced score is reflected too.
    const scored = runs.map(r => (r._id === run._id ? { ...r, score: total } : r)).filter(r => r.score != null);
    const top = scored.reduce((best, r) => (!best || r.score > best.score || (r.score === best.score && r.n < best.n) ? r : best), null);
    if (top && (attempt.best !== top.score || attempt.bestPromptCount !== top.n)) {
      const fields = { best: top.score, bestPromptCount: top.n, bestAt: at, updatedAt: at };
      await store.updateAttempt(attempt._id, fields);
      Object.assign(attempt, fields);
    }
  }
  return { attempt: attempt ? publicAttempt(attempt) : null, run: publicRun({ ...run, result, graderRaw: raw }, { withRaw: true }) };
}

export async function currentAttempt(player, slug, { store }) {
  const attempt = await store.getOpenAttempt(player, slug);
  if (!attempt) return null;
  const runs = await store.listRuns(attempt._id);
  return { ...publicAttempt(attempt), runs: runs.map((r, i) => publicRun(r, { withOutput: true, withRaw: i === runs.length - 1 })) };
}

export async function startOver(player, slug, { store, now }) {
  return store.closeOpenAttempts(player, slug, new Date(now()));
}

export async function claim(user, anonId, { store, now }) {
  return store.claimAnon(anonId, { id: user.id, username: user.username }, new Date(now()));
}
