// HTTP handlers for the game: challenges, lessons, runs, attempts, leaderboards, profiles, health.
// Every handler is wrapped by guarded() (http.js), so failures become plain JSON errors.
import { HttpError, guarded, queryOf, readJson, sendJson, logError } from './http.js';
import { getDeps } from '../services/deps.js';
import { challengeData, getChallengeFile, getLesson, listChallengeFiles, listLessons, SLUG_RE } from '../services/challengeStore.js';
import { KINDS } from '../services/kinds.js';
import { MODELS, availableModels, findModel, generate, ModelError, GENERATION_TIMEOUT_MS } from '../services/models/index.js';
import { graderMode, liveGraderVersion } from '../services/grader/index.js';
import { checkDailyCap, optionalPlayer, requirePlayer, resolvePlayer, sessionUser, validAnonId } from '../services/playerService.js';
import { ID_RE, PASTED_CODE, beginRun, claim, currentAttempt, finishRun, newId, previousOutput, promptHasCode, scoreRun, startOver } from '../services/gameService.js';
import { BRACKETS, challengeStats, leaderboard, playerSummary, profile } from '../services/boardService.js';

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

function requireSlug(value) {
  if (typeof value !== 'string' || !SLUG_RE.test(value) || value.length > 64) throw new HttpError(400, 'Send a valid challenge slug.');
  const challenge = getChallengeFile(value);
  if (!challenge) throw new HttpError(404, `There is no challenge called "${value}".`);
  return challenge;
}

function summary(c, stats) {
  const s = stats?.get(c.slug) || { solvedCount: null, topScore: null, yourBest: null, yourBestPrompts: null };
  const out = { slug: c.slug, title: c.title, level: c.level, levelLabel: c.levelLabel, brief: c.brief, kind: c.kind, available: c.available, ...s };
  if (c.lesson !== undefined) out.lesson = c.lesson;
  return out;
}

async function statsOrNull(player, deps) {
  try { return await challengeStats(player, deps); }
  catch (error) { logError('Challenge stats', error); return null; }
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
  const stats = await statsOrNull(player, deps);
  sendJson(response, 200, { challenges: listChallengeFiles({ includeLessons }).map(c => summary(c, stats)), statsAvailable: Boolean(stats) });
});

const getChallenge = guarded('Get challenge', async (request, response, [slug]) => {
  const deps = getDeps();
  const challenge = requireSlug(slug);
  const player = optionalPlayer(request);
  const stats = await statsOrNull(player, deps);
  const models = modelList(deps.env);
  const detail = {
    ...summary(challenge, stats),
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

const lessons = guarded('List lessons', async (_request, response) => {
  sendJson(response, 200, { lessons: listLessons() });
});

const lesson = guarded('Get lesson', async (_request, response, [slug]) => {
  const found = getLesson(slug);
  if (!found) throw new HttpError(404, 'There is no lesson with that name.');
  sendJson(response, 200, { lesson: found });
});

// ------------------------------------------------------------------ runs

const createRun = guarded('Create run', async (request, response) => {
  const deps = getDeps();
  const player = requirePlayer(request);
  const input = await readJson(request, 16_000);
  const challenge = requireSlug(input.slug);
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) throw new HttpError(400, 'Write a prompt first, then run it.');
  if (input.prompt.length > 2000) throw new HttpError(400, 'Prompts can be at most 2000 characters.');
  if (input.model !== undefined && input.model !== null && typeof input.model !== 'string') throw new HttpError(400, 'Send the model as a model id.');
  if (!challenge.available) throw new HttpError(501, challenge.unavailableReason || 'This challenge is not playable yet.');
  const kind = KINDS[challenge.kind];
  if (challenge.kind === 'page' && promptHasCode(input.prompt, challenge.goalHtml)) throw new HttpError(400, PASTED_CODE);
  const enabled = availableModels(deps.env);
  if (!enabled.length) throw new HttpError(503, 'No model is set up on the server yet, so runs are simulated.', { code: 'no_model' });
  const model = input.model ? findModel(input.model, deps.env) : enabled[0];
  if (!model) throw new HttpError(400, `That model is not available. Pick one of: ${enabled.map(m => m.id).join(', ')}.`);
  await checkDailyCap(request, player, deps);

  const prompt = input.prompt.trim();
  const runId = newId('run');
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]);
  let finished = false;
  response.on?.('close', () => { if (!finished) controller.abort(); });

  // Nothing is saved until the model has sent its first text.
  const previous = await previousOutput(player, challenge, deps);
  const stream = generate({
    model, env: deps.env, fetch: deps.fetch, signal,
    system: kind.instruction(challenge),
    user: kind.userMessage(prompt, previous),
  });
  let first;
  try { first = await stream.next(); }
  catch (error) {
    if (error instanceof ModelError) throw new HttpError(error.status, error.message);
    throw error;
  }

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

  const cleaner = kind.cleaner();
  let status = 'done';
  try {
    if (!first.done) {
      const out = cleaner.push(first.value);
      if (out) response.write(out);
      for await (const chunk of stream) {
        const piece = cleaner.push(chunk);
        if (piece) response.write(piece);
      }
    }
  } catch (error) {
    status = controller.signal.aborted ? 'cancelled' : 'failed';
    if (!(error instanceof ModelError)) logError('Run stream', error);
  }
  const { rest, html: output } = cleaner.finish();
  if (rest && status === 'done') response.write(rest);
  if (status === 'done' && !output) status = 'failed';
  finished = true;
  await finishRun(run, { output, status }, deps);
  response.end();
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
  sendJson(response, 200, await playerSummary(player, sessionUser(request), deps));
});

// ------------------------------------------------------------------ health

const health = guarded('Health', async (_request, response) => {
  const deps = getDeps();
  let db = false;
  try {
    db = await Promise.race([deps.store.ping(), new Promise(resolve => setTimeout(() => resolve(false), 4000).unref?.())]) === true;
  } catch (error) {
    logError('Health database check', error);
  }
  const data = challengeData();
  const body = {
    ok: db && data.challenges.length > 0,
    db,
    models: availableModels(deps.env).map(m => m.id),
    grader: graderMode(deps.env),
    challenges: data.challenges.length,
    problems: data.problems,
  };
  const graderVersion = await liveGraderVersion(deps);
  if (graderVersion) body.graderVersion = graderVersion;
  sendJson(response, 200, body);
});

export const gameHandlers = {
  health, listChallenges, getChallenge, lessons, lesson, createRun, scoreRun: scoreRunHandler,
  getCurrentAttempt, startOver: startOverHandler, claim: claimHandler, leaderboards, userProfile, playersMe,
};
