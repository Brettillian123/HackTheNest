// HTTP handlers for the game: challenges, lessons, runs, attempts, leaderboards, profiles, health.
// Every handler is wrapped by guarded() (http.js), so failures become plain JSON errors.
import { HttpError, guarded, queryOf, readJson, sendJson, logError } from './http.js';
import { getDeps } from '../services/deps.js';
import { challengeData, getChallengeFile, getLesson, listChallengeFiles, listLessons, PROMPT_LIMITS, SLUG_RE } from '../services/challengeStore.js';
import { KINDS, NO_PAGE, isRefusal, leakChecker } from '../services/kinds.js';
import { MODELS, availableModels, findModel, generate, ModelError, GENERATION_TIMEOUT_MS } from '../services/models/index.js';
import { graderMode, liveGraderVersion } from '../services/grader/index.js';
import { checkDailyCap, optionalPlayer, requirePlayer, resolvePlayer, sessionUser, validAnonId } from '../services/playerService.js';
import { ID_RE, PASTED_CODE, beginRun, claim, currentAttempt, finishRun, newId, previousOutput, promptHasCode, scoreRun, startOver } from '../services/gameService.js';
import { BRACKETS, challengeStats, leaderboard, playerSummary, profile } from '../services/boardService.js';
import { costFor, freeStatus, limitsOn, publicFree, reserveRun } from '../services/billingService.js';

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

function requireSlug(value) {
  if (typeof value !== 'string' || !SLUG_RE.test(value) || value.length > 64) throw new HttpError(400, 'Send a valid challenge slug.');
  const challenge = getChallengeFile(value);
  if (!challenge) throw new HttpError(404, `There is no challenge called "${value}".`);
  return challenge;
}

function summary(c, stats, cost) {
  const s = stats?.get(c.slug) || { solvedCount: null, topScore: null, yourBest: null, yourBestPrompts: null };
  const out = { slug: c.slug, title: c.title, level: c.level, levelLabel: c.levelLabel, brief: c.brief, kind: c.kind, available: c.available, maxPromptChars: c.maxPromptChars, maxOutputTokens: c.maxOutputTokens, ...s };
  if (c.lesson !== undefined) out.lesson = c.lesson;
  if (cost !== undefined) out.cost = cost;
  return out;
}

async function statsOrNull(player, deps) {
  try { return await challengeStats(player, deps); }
  catch (error) { logError('Challenge stats', error); return null; }
}

// Today's free-tier counters for the cost labels, or null when they could not be read (every run is
// then labelled with its credit cost).
async function freeOrNull(request, player, deps) {
  if (!limitsOn(deps.env)) return null;
  try { return await freeStatus(request, player, deps); }
  catch (error) { logError('Free tier status', error); return null; }
}

function modelList(env) {
  const labels = new Map(challengeData().models.map(m => [m.id, m.label]));
  const available = new Set(availableModels(env).map(m => m.id));
  return MODELS.map(m => ({ id: m.id, label: labels.get(m.id) || m.label, available: available.has(m.id) }));
}

// ------------------------------------------------------------------ challenges and lessons

const listChallenges = guarded('List challenges', async (request, response) => {
  const deps = getDeps();
  const player = optionalPlayer(request);
  const includeLessons = queryOf(request).get('include') === 'lessons';
  const [stats, free] = await Promise.all([statsOrNull(player, deps), freeOrNull(request, player, deps)]);
  sendJson(response, 200, { challenges: listChallengeFiles({ includeLessons }).map(c => summary(c, stats, costFor(c, free, deps.env))), statsAvailable: Boolean(stats) });
});

const getChallenge = guarded('Get challenge', async (request, response, [slug]) => {
  const deps = getDeps();
  const challenge = requireSlug(slug);
  const player = optionalPlayer(request);
  const [stats, free] = await Promise.all([statsOrNull(player, deps), freeOrNull(request, player, deps)]);
  const models = modelList(deps.env);
  const detail = {
    ...summary(challenge, stats, costFor(challenge, free, deps.env)),
    goalUrl: challenge.kind === 'page' ? `/data/goals/${challenge.slug}.html` : null,
    viewport: { ...challenge.viewport },
    spec: challenge.spec,
    models,
    simulated: !models.some(m => m.available),
  };
  if (!challenge.available) detail.unavailableReason = challenge.unavailableReason;
  if (challenge.criteria) detail.criteria = challenge.criteria;
  sendJson(response, 200, { challenge: detail, statsAvailable: Boolean(stats) });
});

// Public, player-independent responses: the CDN may cache them. Player-specific routes
// (challenges and boards carry yourBest / you) keep the default private no-store.
export const LESSON_CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' };
export const HEALTH_CACHE = { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' };

const lessons = guarded('List lessons', async (_request, response) => {
  sendJson(response, 200, { lessons: listLessons() }, LESSON_CACHE);
});

const lesson = guarded('Get lesson', async (_request, response, [slug]) => {
  const found = getLesson(slug);
  if (!found) throw new HttpError(404, 'There is no lesson with that name.');
  sendJson(response, 200, { lesson: found }, LESSON_CACHE);
});

// ------------------------------------------------------------------ runs

// The request body cap follows the largest prompt limit among the loaded challenges: up to 3 bytes
// a character plus room for the slug and model id.
function bodyLimit() {
  const most = Math.max(PROMPT_LIMITS.ruleMin, ...listChallengeFiles({ includeLessons: true }).map(c => c.maxPromptChars || 0));
  return most * 3 + 1000;
}

// Text gathered before anything is sent, so a refusal or leaked instructions can still get a 422.
const HOLD_CHARS = 400;

const createRun = guarded('Create run', async (request, response) => {
  const deps = getDeps();
  const player = requirePlayer(request);
  const input = await readJson(request, bodyLimit());
  const challenge = requireSlug(input.slug);
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) throw new HttpError(400, 'Write a prompt first, then run it.');
  if (input.prompt.length > challenge.maxPromptChars) throw new HttpError(400, `This challenge allows prompts up to ${challenge.maxPromptChars} characters.`);
  if (input.model !== undefined && input.model !== null && typeof input.model !== 'string') throw new HttpError(400, 'Send the model as a model id.');
  if (!challenge.available) throw new HttpError(501, challenge.unavailableReason || 'This challenge is not playable yet.');
  const kind = KINDS[challenge.kind];
  if (challenge.kind === 'page' && promptHasCode(input.prompt, challenge.goalHtml)) throw new HttpError(400, PASTED_CODE);
  const enabled = availableModels(deps.env);
  if (!enabled.length) throw new HttpError(503, 'No model is set up on the server yet, so runs are simulated.', { code: 'no_model' });
  const model = input.model ? findModel(input.model, deps.env) : enabled[0];
  if (!model) throw new HttpError(400, `That model is not available. Pick one of: ${enabled.map(m => m.id).join(', ')}.`);
  const prompt = input.prompt.trim();
  const runId = newId('run');
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
  let finished = false;
  response.on?.('close', () => { if (!finished) controller.abort(); });

  // Nothing is saved until the model's reply has been checked. The cap check and the previous
  // output are independent reads, made together.
  const [, previous] = await Promise.all([checkDailyCap(request, player, deps), previousOutput(player, challenge, deps)]);
  // The free prompt or the credits are reserved before the model is called (402 when neither is
  // possible) and given back unless the run ends fully generated and saved.
  const reservation = await reserveRun(request, player, challenge, runId, deps);
  let saved = false;
  try {
    const system = kind.instruction(challenge);
    const stream = generate({
      model, env: deps.env, fetch: deps.fetch, signal, maxOutputTokens: challenge.maxOutputTokens,
      system,
      user: kind.userMessage(prompt, previous),
    });
    const cleaner = kind.cleaner(challenge);
    const leak = leakChecker(system);
    const reject = message => { finished = true; controller.abort(); return new HttpError(422, message); };

    // 1. Hold the reply until there is cleaned output and enough text to judge it, or until it ends
    //    (a workflow plan is always held to the end so it can be checked as JSON).
    let raw = '';
    let pending = '';
    let ended = false;
    try {
      for (;;) {
        const step = await stream.next();
        if (step.done) { ended = true; break; }
        raw += step.value;
        pending += cleaner.push(step.value);
        if (!kind.bufferAll && pending && raw.length >= HOLD_CHARS) break;
      }
    } catch (error) {
      if (error instanceof ModelError) throw new HttpError(error.status, error.message);
      throw error;
    }
    let final = null;
    if (ended) { final = cleaner.finish(); pending += final.rest; }
    // A refusal, leaked instructions or no usable output: 422 and the prompt is not counted.
    if (leak.leaks(raw) || (ended && (!final.html || isRefusal(raw))) || !pending) throw reject(NO_PAGE);
    const invalid = ended && kind.validate ? kind.validate(final.html) : null;
    if (invalid) throw reject(invalid);

    // 2. Save the run and stream the rest.
    const { attempt, run } = await beginRun({ player, challenge, prompt, model: model.id, runId }, deps);
    response.writeHead(200, {
      'Content-Type': kind.streamType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      'X-Run-Id': runId,
      'X-Attempt-Id': attempt._id,
      // The prompt count this run will have if it completes (a failed or cancelled run is discarded).
      'X-Prompt-Count': String(run.n),
    });
    response.write(pending);

    let status = 'done';
    if (!ended) {
      try {
        for await (const chunk of stream) {
          raw += chunk;
          // Instructions showing up later stop the run; it is discarded and not counted.
          if (leak.leaks(raw.slice(-(chunk.length + leak.window)))) { status = 'failed'; controller.abort(); break; }
          const piece = cleaner.push(chunk);
          if (piece) response.write(piece);
        }
      } catch (error) {
        status = controller.signal.aborted ? 'cancelled' : 'failed';
        if (!(error instanceof ModelError)) logError('Run stream', error);
      }
      final = cleaner.finish();
      if (final.rest && status === 'done') response.write(final.rest);
    }
    const output = final.html;
    if (status === 'done' && !output) status = 'failed';
    finished = true;
    await finishRun(run, { output, status }, deps);
    saved = status === 'done';
    response.end();
  } finally {
    if (!saved) {
      try { await reservation.release(); }
      catch (error) { logError('Release run reservation', error); }
    }
  }
});

const scoreRunHandler = guarded('Score run', async (request, response, [runId]) => {
  const deps = getDeps();
  const player = requirePlayer(request);
  if (!ID_RE.test(runId || '') || !runId.startsWith('run_')) throw new HttpError(400, 'Send a valid run id.');
  sendJson(response, 200, await scoreRun({ player, runId }, deps));
});

// ------------------------------------------------------------------ attempts

const getCurrentAttempt = guarded('Current attempt', async (request, response) => {
  const deps = getDeps();
  const player = requirePlayer(request);
  const challenge = requireSlug(queryOf(request).get('slug'));
  sendJson(response, 200, { attempt: await currentAttempt(player, challenge.slug, deps) });
});

const startOverHandler = guarded('Start over', async (request, response) => {
  const deps = getDeps();
  const player = requirePlayer(request);
  const input = await readJson(request, 4_000);
  const challenge = requireSlug(input.slug);
  const closed = await startOver(player, challenge.slug, deps);
  sendJson(response, 200, { ok: true, closed });
});

const claimHandler = guarded('Claim attempts', async (request, response) => {
  const deps = getDeps();
  const { user, anonId: headerAnon, badAnon } = resolvePlayer(request);
  if (!user) throw new HttpError(401, 'Log in first, then claim your runs.');
  const input = await readJson(request, 4_000);
  const anonId = headerAnon || (input.anonId !== undefined ? input.anonId : null);
  if (badAnon || !validAnonId(anonId)) throw new HttpError(400, 'Send the X-Anon-Id header of the runs to claim.');
  sendJson(response, 200, await claim(user, anonId, deps));
});

// ------------------------------------------------------------------ boards and players

const leaderboards = guarded('Leaderboards', async (request, response) => {
  const deps = getDeps();
  const query = queryOf(request);
  const slugParam = query.get('slug');
  const slug = slugParam ? requireSlug(slugParam).slug : null;
  const bracket = query.get('bracket') || 'all';
  const period = query.get('period') || 'all';
  if (!Object.hasOwn(BRACKETS, bracket)) throw new HttpError(400, 'Unknown bracket. Use all, 1, 2, 3-5, 6-10 or 11+.');
  if (period !== 'week' && period !== 'all') throw new HttpError(400, 'Unknown period. Use week or all.');
  const player = optionalPlayer(request);
  sendJson(response, 200, await leaderboard({ slug, bracket, period, player }, deps));
});

const userProfile = guarded('Profile', async (_request, response, [username]) => {
  const deps = getDeps();
  if (!USERNAME_RE.test(username || '')) throw new HttpError(404, 'There is no player with that name.');
  const found = await profile(username, deps);
  if (!found) throw new HttpError(404, 'There is no player with that name.');
  sendJson(response, 200, found);
});

const playersMe = guarded('Player summary', async (request, response) => {
  const deps = getDeps();
  const player = optionalPlayer(request);
  const user = sessionUser(request);
  const [base, credits, free] = await Promise.all([
    playerSummary(player, user, deps),
    player?.kind === 'user' ? deps.store.getCredits(player.id) : null,
    freeStatus(request, player, deps),
  ]);
  sendJson(response, 200, { ...base, credits, free: publicFree(free) });
});

// ------------------------------------------------------------------ health

const health = guarded('Health', async (_request, response) => {
  const deps = getDeps();
  // The database ping and the grader version are independent: asked together.
  const dbCheck = (async () => {
    try {
      return await Promise.race([deps.store.ping(), new Promise(resolve => setTimeout(() => resolve(false), 4000).unref?.())]) === true;
    } catch (error) {
      logError('Health database check', error);
      return false;
    }
  })();
  const [db, graderVersion] = await Promise.all([dbCheck, liveGraderVersion(deps)]);
  const data = challengeData();
  const body = {
    ok: db && data.challenges.length > 0,
    db,
    models: availableModels(deps.env).map(m => m.id),
    grader: graderMode(deps.env),
    challenges: data.challenges.length,
    problems: data.problems,
  };
  if (graderVersion) body.graderVersion = graderVersion;
  sendJson(response, 200, body, HEALTH_CACHE);
});

export const gameHandlers = {
  health, listChallenges, getChallenge, lessons, lesson, createRun, scoreRun: scoreRunHandler,
  getCurrentAttempt, startOver: startOverHandler, claim: claimHandler, leaderboards, userProfile, playersMe,
};
