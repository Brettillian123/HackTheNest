// Leaderboards, challenge stats, profiles and player totals, computed from stored runs.
// An entry is a player's best scored run: higher score, then fewer prompts (the run's number in
// its attempt), then earlier. In a prompt bracket, only runs with that prompt number count.
// Only signed-in users appear on boards; an anonymous player still gets "you".
import { getChallengeFile, listChallengeFiles } from './challengeStore.js';
import { graderMode } from './grader/index.js';

// Stand-in (provisional) scores count only while no grader service is configured.
const withProvisional = env => graderMode(env) === 'standin';

// Challenge stats read every scored run, so they are cached per function instance for 30 s.
const STATS_TTL_MS = 30_000;
const statsCache = new WeakMap();
async function allScoresCached(store, includeProvisional, now) {
  const hit = statsCache.get(store);
  if (hit && hit.includeProvisional === includeProvisional && now() - hit.at < STATS_TTL_MS) return hit.rows;
  const rows = await store.bestScores({ includeProvisional });
  statsCache.set(store, { at: now(), includeProvisional, rows });
  return rows;
}

export const BRACKETS = { all: [1, Infinity], 1: [1, 1], 2: [2, 2], '3-5': [3, 5], '6-10': [6, 10], '11+': [11, Infinity] };
const MAX_ROWS = 100;

export function levelFor(points) {
  return 1 + Math.floor(Math.max(0, Number(points) || 0) / 100);
}

function better(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.promptCount !== b.promptCount) return a.promptCount < b.promptCount;
  return a.at < b.at;
}

function compare(a, b) {
  if (better(a, b)) return -1;
  if (better(b, a)) return 1;
  return String(a.username).localeCompare(String(b.username));
}

const ownerKey = r => `${r.ownerKind}|${r.ownerId}`;
const known = r => Boolean(getChallengeFile(r.slug));

// Best entry per owner (and per slug when bySlug) among rows in the prompt range.
function bestPer(rows, [lo, hi], bySlug) {
  const best = new Map();
  for (const r of rows) {
    if (r.n < lo || r.n > hi) continue;
    const entry = { ownerKind: r.ownerKind, ownerId: r.ownerId, username: r.username, slug: r.slug, score: r.score, promptCount: r.n, at: new Date(r.at) };
    const key = bySlug ? `${ownerKey(r)}|${r.slug}` : ownerKey(r);
    const prev = best.get(key);
    if (!prev || better(entry, prev)) best.set(key, entry);
  }
  return [...best.values()];
}

// Overall: per owner, sum of best scores (points) and average prompts of those bests.
function overallEntries(rows, range) {
  const perSlug = bestPer(rows.filter(known), BRACKETS.all, true);
  const byOwner = new Map();
  for (const e of perSlug) {
    const o = byOwner.get(ownerKey(e)) || { ownerKind: e.ownerKind, ownerId: e.ownerId, username: e.username, score: 0, prompts: 0, count: 0, at: e.at };
    o.score += e.score;
    o.prompts += e.promptCount;
    o.count += 1;
    if (e.at > o.at) o.at = e.at;
    byOwner.set(ownerKey(e), o);
  }
  return [...byOwner.values()]
    .map(o => ({ ...o, promptCount: Math.max(1, Math.round(o.prompts / o.count)) }))
    .filter(o => o.promptCount >= range[0] && o.promptCount <= range[1]);
}

function entriesFor(rows, slug, range) {
  return slug ? bestPer(rows, range, false) : overallEntries(rows, range);
}

const isOwner = (e, player) => player && e.ownerKind === player.kind && e.ownerId === player.id;

export async function leaderboard({ slug, bracket, period, player }, { store, now, env }) {
  const since = period === 'week' ? new Date(now() - 7 * 86_400_000) : null;
  const includeProvisional = withProvisional(env);
  const rows = await store.bestScores({ slug, since, includeProvisional });
  const counts = {};
  for (const name of Object.keys(BRACKETS)) counts[name] = entriesFor(rows, slug, BRACKETS[name]).length;
  const sorted = entriesFor(rows, slug, BRACKETS[bracket]).sort(compare);
  const ranked = sorted.map((e, i) => ({ rank: i + 1, username: e.username, promptCount: e.promptCount, score: e.score, isYou: Boolean(isOwner(e, player)) }));
  let you = null;
  if (player) {
    const mine = ranked.find(r => r.isYou);
    if (mine) you = { rank: mine.rank, score: mine.score, promptCount: mine.promptCount };
    else {
      const own = entriesFor(await store.bestScores({ slug, since, owner: player, includeProvisional }), slug, BRACKETS[bracket])[0];
      if (own) you = { rank: 1 + sorted.filter(e => better(e, own)).length, score: own.score, promptCount: own.promptCount };
    }
  }
  return { rows: ranked.slice(0, MAX_ROWS), you, counts, kind: slug ? 'score' : 'points', provisional: includeProvisional };
}

// Live stats per challenge slug: { solvedCount, topScore, yourBest, yourBestPrompts }.
export async function challengeStats(player, { store, env, now }) {
  const includeProvisional = withProvisional(env);
  const everyone = bestPer(await allScoresCached(store, includeProvisional, now), BRACKETS.all, true);
  const mine = player ? bestPer(await store.bestScores({ owner: player, includeProvisional }), BRACKETS.all, true) : [];
  const stats = new Map();
  for (const c of listChallengeFiles()) stats.set(c.slug, { solvedCount: 0, topScore: null, yourBest: null, yourBestPrompts: null });
  for (const e of everyone) {
    const s = stats.get(e.slug);
    if (!s) continue;
    s.solvedCount += 1;
    s.topScore = s.topScore == null ? e.score : Math.max(s.topScore, e.score);
  }
  for (const e of mine) {
    const s = stats.get(e.slug);
    if (s) Object.assign(s, { yourBest: e.score, yourBestPrompts: e.promptCount });
  }
  return stats;
}

// The rank change a new score makes on the challenge's all-time board.
export async function rankChange(player, slug, entry, { store, env }) {
  const includeProvisional = withProvisional(env);
  const others = bestPer(await store.bestScores({ slug, includeProvisional }), BRACKETS.all, false).filter(e => !isOwner(e, player));
  const prev = bestPer(await store.bestScores({ slug, owner: player, includeProvisional }), BRACKETS.all, false)[0] || null;
  const rankOf = e => 1 + others.filter(o => better(o, e)).length;
  const after = prev && better(prev, entry) ? prev : entry;
  return { before: prev ? rankOf(prev) : null, after: rankOf(after) };
}

async function bestsOf(owner, store, env) {
  return bestPer((await store.bestScores({ owner, includeProvisional: withProvisional(env) })).filter(known), BRACKETS.all, true);
}

const day = date => new Date(date).toISOString().slice(0, 10);

export async function profile(username, { store, env }) {
  const user = await store.findUserByUsername(username);
  if (!user) return null;
  const solved = (await bestsOf({ kind: 'user', id: user.id }, store, env))
    .map(e => ({ slug: e.slug, title: getChallengeFile(e.slug).title, best: e.score, promptCount: e.promptCount, when: day(e.at) }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const points = solved.reduce((s, x) => s + x.best, 0);
  return {
    username: user.username,
    joined: user.joined ? day(user.joined) : null,
    totals: {
      solved: solved.length,
      best: solved.length ? Math.max(...solved.map(s => s.best)) : 0,
      averagePrompts: solved.length ? Math.round((solved.reduce((s, x) => s + x.promptCount, 0) / solved.length) * 10) / 10 : 0,
      points,
      level: levelFor(points),
    },
    solved,
  };
}

export async function playerSummary(player, user, { store, env }) {
  const bests = {};
  let points = 0;
  if (player) {
    for (const e of await bestsOf(player, store, env)) {
      bests[e.slug] = e.score;
      points += e.score;
    }
  }
  return { user: user ? { id: user.id, username: user.username, email: user.email } : null, points, level: levelFor(points), bests };
}
