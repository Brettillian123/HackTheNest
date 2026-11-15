// Leaderboards, challenge stats, profiles and player totals, computed from stored runs.
// An entry is a player's best scored run: higher score, then fewer prompts (the run's number in
// its attempt), then earlier. In a prompt bracket, only runs with that prompt number count.
// Only signed-in users appear on boards; an anonymous player still gets "you".
// Provisional (stand-in) scores never count here, in any configuration. Scores are one-decimal
// numbers from 0 to 120 (the grader can give more than 100); sums are rounded to one decimal.
import { allChallengeFiles, getChallengeFile } from './challengeStore.js';
import { graderMode, round1 } from './grader/index.js';

export const BRACKETS = { all: [1, Infinity], 1: [1, 1], 2: [2, 2], '3-5': [3, 5], '6-10': [6, 10], '11+': [11, Infinity] };
const MAX_ROWS = 100;
const FINAL = { includeProvisional: false };

export function levelFor(points) {
  return 1 + Math.floor(Math.max(0, Number(points) || 0) / 100);
}

// Challenge stats read every scored run, so they are cached per function instance for 30 s.
const STATS_TTL_MS = 30_000;
const statsCache = new WeakMap();
async function allScoresCached(store, now) {
  const hit = statsCache.get(store);
  if (hit && now() - hit.at < STATS_TTL_MS) return hit.rows;
  const rows = await store.bestScores({ ...FINAL });
  statsCache.set(store, { at: now(), rows });
  return rows;
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
    const entry = {
      ownerKind: r.ownerKind, ownerId: r.ownerId, username: r.username, slug: r.slug, score: round1(r.score), promptCount: r.n, at: new Date(r.at),
      versions: new Set(typeof r.graderVersion === 'string' ? [r.graderVersion] : []),
    };
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
    const o = byOwner.get(ownerKey(e)) || { ownerKind: e.ownerKind, ownerId: e.ownerId, username: e.username, score: 0, prompts: 0, count: 0, at: e.at, versions: new Set() };
    o.score += e.score;
    o.prompts += e.promptCount;
    o.count += 1;
    for (const v of e.versions) o.versions.add(v);
    if (e.at > o.at) o.at = e.at;
    byOwner.set(ownerKey(e), o);
  }
  return [...byOwner.values()]
    .map(o => ({ ...o, score: round1(o.score), promptCount: Math.max(1, Math.round(o.prompts / o.count)) }))
    .filter(o => o.promptCount >= range[0] && o.promptCount <= range[1]);
}

function entriesFor(rows, slug, range) {
  return slug ? bestPer(rows, range, false) : overallEntries(rows, range);
}

const isOwner = (e, player) => player && e.ownerKind === player.kind && e.ownerId === player.id;

export async function leaderboard({ slug, bracket, period, player }, { store, now, env }) {
  const since = period === 'week' ? new Date(now() - 7 * 86_400_000) : null;
  const rows = await store.bestScores({ slug, since, ...FINAL });
  const counts = {};
  for (const name of Object.keys(BRACKETS)) counts[name] = entriesFor(rows, slug, BRACKETS[name]).length;
  const sorted = entriesFor(rows, slug, BRACKETS[bracket]).sort(compare);
  const shown = sorted.slice(0, MAX_ROWS);
  const ranked = shown.map((e, i) => ({ rank: i + 1, username: e.username, promptCount: e.promptCount, score: e.score, isYou: Boolean(isOwner(e, player)) }));
  let you = null;
  if (player) {
    const mineAt = sorted.findIndex(e => isOwner(e, player));
    if (mineAt >= 0) you = { rank: mineAt + 1, score: sorted[mineAt].score, promptCount: sorted[mineAt].promptCount };
    else {
      const own = entriesFor(await store.bestScores({ slug, since, owner: player, ...FINAL }), slug, BRACKETS[bracket])[0];
      if (own) you = { rank: 1 + sorted.filter(e => better(e, own)).length, score: own.score, promptCount: own.promptCount };
    }
  }
  const graderVersions = [...new Set(shown.flatMap(e => [...e.versions]))].sort();
  return { rows: ranked, you, counts, kind: slug ? 'score' : 'points', provisional: graderMode(env) === 'standin', graderVersions };
}

// Live stats per challenge slug: { solvedCount, topScore, yourBest, yourBestPrompts }.
export async function challengeStats(player, { store, now }) {
  const everyone = bestPer(await allScoresCached(store, now), BRACKETS.all, true);
  const mine = player ? bestPer(await store.bestScores({ owner: player, ...FINAL }), BRACKETS.all, true) : [];
  const stats = new Map();
  for (const c of allChallengeFiles()) stats.set(c.slug, { solvedCount: 0, topScore: null, yourBest: null, yourBestPrompts: null });
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

// The rank change a new (final) score makes on the challenge's all-time board.
export async function rankChange(player, slug, entry, { store }) {
  const others = bestPer(await store.bestScores({ slug, ...FINAL }), BRACKETS.all, false).filter(e => !isOwner(e, player));
  const prev = bestPer(await store.bestScores({ slug, owner: player, ...FINAL }), BRACKETS.all, false)[0] || null;
  const rankOf = e => 1 + others.filter(o => better(o, e)).length;
  const after = prev && better(prev, entry) ? prev : entry;
  return { before: prev ? rankOf(prev) : null, after: rankOf(after) };
}

async function bestsOf(owner, store) {
  return bestPer((await store.bestScores({ owner, ...FINAL })).filter(known), BRACKETS.all, true);
}

const day = date => new Date(date).toISOString().slice(0, 10);

export async function profile(username, { store }) {
  const user = await store.findUserByUsername(username);
  if (!user) return null;
  const solved = (await bestsOf({ kind: 'user', id: user.id }, store))
    .map(e => ({ slug: e.slug, title: getChallengeFile(e.slug).title, best: e.score, promptCount: e.promptCount, when: day(e.at) }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const points = round1(solved.reduce((s, x) => s + x.best, 0));
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

export async function playerSummary(player, user, { store }) {
  const bests = {};
  let points = 0;
  if (player) {
    for (const e of await bestsOf(player, store)) {
      bests[e.slug] = e.score;
      points += e.score;
    }
  }
  points = round1(points);
  return { user: user ? { id: user.id, username: user.username, email: user.email } : null, points, level: levelFor(points), bests };
}
