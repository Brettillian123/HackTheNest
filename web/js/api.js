// promptdyno data client. One interface for every page.
// Mock mode reads web/mock and web/data; live mode calls /api/* and falls back to mock
// for any endpoint that does not exist yet (404 route not found, or no network).

import { API_MODE, API_BASE } from "./config.js";
import * as store from "./store.js";

// ---------------------------------------------------------------- options

const options = {
  mode: API_MODE,
  base: API_BASE,
  fetch: null,
  timing: { streamMs: 3000, stageMs: 3000, pollMs: 1000, jobTimeoutMs: 90000 },
};

// Change mode, base URL, fetch function or mock timings (used by tests).
export function configure(next = {}) {
  if (next.mode) options.mode = next.mode;
  if (next.base != null) options.base = next.base;
  if (next.fetch !== undefined) options.fetch = next.fetch;
  if (next.timing) options.timing = { ...options.timing, ...next.timing };
  if (next.reset) {
    meCache = undefined;
    warned.clear();
    routes.clear();
    simulated.clear();
  }
  return { mode: options.mode, base: options.base, timing: { ...options.timing } };
}

export const STAGES = [
  { id: "render", label: "Rendering" },
  { id: "layout", label: "Checking layout" },
  { id: "compare", label: "Comparing to goal" },
  { id: "score", label: "Scoring" },
];

export const BRACKETS = ["all", "1", "2", "3-5", "6-10", "11+"];
const BRACKET_RANGE = {
  all: [1, Infinity],
  "1": [1, 1],
  "2": [2, 2],
  "3-5": [3, 5],
  "6-10": [6, 10],
  "11+": [11, Infinity],
};

// ---------------------------------------------------------------- errors

function apiError(message, extra = {}) {
  const e = new Error(message);
  Object.assign(e, extra);
  return e;
}

function abortError() {
  const e = new Error("Run cancelled.");
  e.name = "AbortError";
  return e;
}

function isAbort(e) {
  return e && e.name === "AbortError";
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw abortError();
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError());
    if (ms <= 0) return void Promise.resolve().then(resolve);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ---------------------------------------------------------------- files

const cache = new Map();

function assetUrl(rel) {
  return new URL("../" + rel, import.meta.url);
}

async function loadText(rel) {
  const url = assetUrl(rel);
  if (url.protocol === "file:") {
    const fs = await import("node:fs/promises");
    return fs.readFile(url, "utf8");
  }
  const f = options.fetch || globalThis.fetch;
  if (!f) throw apiError(`Could not load ${rel}. Reload the page.`);
  const res = await f(url.href);
  if (!res.ok) throw apiError(`Could not load ${rel} (${res.status}). Reload the page.`);
  return res.text();
}

function loadJson(rel) {
  if (!cache.has(rel)) {
    const p = loadText(rel).then(JSON.parse);
    p.catch(() => cache.delete(rel));
    cache.set(rel, p);
  }
  return cache.get(rel);
}

function goalUrlFor(slug) {
  const url = assetUrl(`data/goals/${slug}.html`);
  return url.protocol === "file:" ? url.href : url.pathname;
}

// ---------------------------------------------------------------- live helpers

// Which kinds of data on screen were simulated (mock) rather than real.
// Kinds: "run" (generation and scoring), "boards" (leaderboards and challenge stats), "profile".
const SIM_KIND = { generate: "run", score: "run", leaderboards: "boards", users: "profile" };
const simulated = new Set();

// true when data of this kind came, or will come, from the mock.
export function isSimulated(kind) {
  return options.mode !== "live" || simulated.has(kind);
}

const warned = new Set();
function warnOnce(name) {
  if (SIM_KIND[name]) simulated.add(SIM_KIND[name]);
  if (warned.has(name) || tabMissing().has(name)) return;
  warned.add(name);
  try {
    console.warn(`promptdyno: live endpoint for ${name} is not available, using mock data.`);
  } catch {
    // No console.
  }
}

class Fallback extends Error {}

async function apiFetch(path, init = {}) {
  const f = options.fetch || globalThis.fetch;
  if (!f) throw new TypeError("fetch is not available");
  const headers = { ...(init.headers || {}) };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return f(options.base + path, { credentials: "include", ...init, headers });
}

// A 404 from a route that does not exist yet (router text, or a static server page).
async function isMissingRoute(res) {
  if (res.status !== 404) return false;
  const type = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
  if (!type.includes("json")) return true;
  try {
    const body = await res.clone().json();
    return !body || body.error === "API route not found.";
  } catch {
    return true;
  }
}

async function readError(res) {
  try {
    const body = await res.clone().json();
    if (body && typeof body.error === "string") return body.error;
  } catch {
    // Not JSON.
  }
  return "";
}

async function httpError(res) {
  const text = await readError(res);
  const byStatus = {
    429: "You have used your free runs. Sign up to keep playing.",
    503: "The grader is busy. Run again in 5 s.",
    504: "Grading took too long. Run again.",
    413: "The page is too large to grade. Ask the model for a smaller page.",
  };
  const message = byStatus[res.status] || text || `The server could not finish the request (${res.status}). Try again in a moment.`;
  return apiError(message, { status: res.status });
}

// name -> Promise<boolean>: true once the route is known to be missing (or the server unreachable)
// on this page, so later calls go straight to the mock instead of making another failing request.
const routes = new Map();

// Routes found missing (a 404 from the server's router) are remembered for the browser tab,
// so each missing endpoint costs one failed request per visit, not one per page.
function tabMissing() {
  try {
    const ss = globalThis.sessionStorage;
    return ss ? new Set(JSON.parse(ss.getItem("pd.missing") || "[]")) : new Set();
  } catch {
    return new Set();
  }
}
function rememberMissing(name) {
  try {
    const ss = globalThis.sessionStorage;
    if (!ss) return;
    const set = tabMissing();
    set.add(name);
    ss.setItem("pd.missing", JSON.stringify([...set]));
  } catch {
    // Storage blocked: the page-level memory still applies.
  }
}

// Calls a live endpoint; falls back to mockFn when the route is missing or the network fails.
async function live(name, path, init, mockFn, onResponse) {
  let settle = null;
  if (!routes.has(name) && tabMissing().has(name)) routes.set(name, Promise.resolve(true));
  if (routes.has(name)) {
    if (await routes.get(name)) {
      warnOnce(name);
      return mockFn();
    }
  } else {
    routes.set(name, new Promise((r) => { settle = r; }));
  }
  const known = (missing) => { if (settle) { settle(missing); settle = null; } };
  let res;
  try {
    res = await apiFetch(path, init);
  } catch (e) {
    if (isAbort(e)) { known(false); routes.delete(name); throw abortError(); }
    known(true);
    warnOnce(name);
    return mockFn();
  }
  if (await isMissingRoute(res)) {
    known(true);
    warnOnce(name);
    rememberMissing(name);
    return mockFn();
  }
  known(false);
  return onResponse(res);
}

// Live mode: asks once whether the server can generate pages. Returns true when runs are simulated.
export async function probeRun() {
  if (options.mode !== "live") return true;
  if (simulated.has("run")) return true;
  return live("generate", "/api/generate", { method: "GET" }, () => true, async () => false);
}

// ---------------------------------------------------------------- deterministic mock data

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function challengeData() {
  return loadJson("data/challenges.json");
}

async function findChallenge(slug) {
  const data = await challengeData();
  const c = data.challenges.find((x) => x.slug === slug);
  if (!c) throw apiError(`There is no challenge called "${slug}". Pick one from the challenge list.`, { status: 404 });
  return { data, c };
}

const boardCache = new Map();

// Players and top score per challenge: easy ones are solved more and score higher. Every prompt bracket filled.
// Others only; "you" is merged later.
const BOARD_SHAPE = {
  "login-card": { players: 44, top: 98 },
  "footer-columns": { players: 38, top: 97 },
  "nav-hero": { players: 31, top: 95 },
  "blog-header": { players: 26, top: 94 },
  "pricing-plans": { players: 19, top: 92 },
  "product-grid": { players: 14, top: 90 },
};
async function mockBoard(slug) {
  if (boardCache.has(slug)) return boardCache.get(slug);
  const { c } = await findChallenge(slug);
  const { usernames } = await loadJson("mock/users.json");
  const r = rng(hash(slug));
  const pool = usernames.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const ranges = [[1, 1], [2, 2], [3, 5], [6, 10], [11, 18]];
  const ceilings = [92, 95, 97, 98, 98];
  const shape = BOARD_SHAPE[slug] || { players: 40, top: 98 };
  const rows = pool.slice(0, shape.players).map((username, i) => {
    const b = i % 5;
    const [lo, hi] = ranges[b];
    const promptCount = lo + Math.floor(r() * (hi - lo + 1));
    const score = Math.round(ceilings[b] - 6 - r() * 24 - (c.level - 1) * 2);
    const daysAgo = r() < 0.5 ? Math.floor(r() * 7) : 8 + Math.floor(r() * 50);
    return { username, promptCount, score, daysAgo };
  });
  // A few strong runs so the top of every board sits at its shape's top score, never 100.
  rows[3].score = shape.top;
  rows[8].score = shape.top - 1;
  rows[2].score = shape.top - 2;
  rows[1].score = shape.top - 4;
  rows[0].score = shape.top - 7;
  rows[3].daysAgo = 2;
  rows[2].daysAgo = 1;
  boardCache.set(slug, rows);
  return rows;
}

function better(a, b) {
  // true when a ranks above b: higher score, then fewer prompts.
  return a.score > b.score || (a.score === b.score && a.promptCount < b.promptCount);
}

function rankAmong(rows, entry) {
  return 1 + rows.filter((r) => better(r, entry)).length;
}

function sortRows(rows) {
  // Exact ties: you first, so a board rank always matches rankAmong() (1 + players strictly better).
  return rows.slice().sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : !!b.isYou - !!a.isYou || a.username.localeCompare(b.username)));
}

function youName() {
  const u = store.getPlayer();
  return (u && u.username) || "You";
}

// ---------------------------------------------------------------- challenges

function summary(data, c, others, best) {
  const scores = others.map((r) => r.score);
  if (best) scores.push(best.score);
  return {
    slug: c.slug,
    title: c.title,
    level: c.level,
    levelLabel: data.levels[String(c.level)],
    brief: c.brief,
    solvedCount: others.length + (best ? 1 : 0),
    topScore: scores.length ? Math.max(...scores) : null,
    yourBest: best ? best.score : null,
    yourBestPrompts: best ? best.promptCount : null,
  };
}

async function liveStats(slug) {
  // Live stats come from the leaderboard endpoint; null means use mock.
  return live(
    "leaderboards",
    `/api/leaderboards/${encodeURIComponent(slug)}?b=all`,
    { method: "GET" },
    () => null,
    async (res) => {
      if (!res.ok) { simulated.add("boards"); return null; }
      const body = await res.json();
      return (body.rows || []).map((r) => ({ username: r.username, promptCount: r.promptCount, score: r.score }));
    },
  );
}

export async function listChallenges() {
  const data = await challengeData();
  return Promise.all(
    data.challenges.map(async (c) => {
      let others = null;
      if (options.mode === "live") others = await liveStats(c.slug);
      if (!others) others = await mockBoard(c.slug);
      return summary(data, c, others, store.getBest(c.slug));
    }),
  );
}

export async function getChallenge(slug) {
  const { data, c } = await findChallenge(slug);
  let others = null;
  if (options.mode === "live") others = await liveStats(slug);
  if (!others) others = await mockBoard(slug);
  return {
    ...summary(data, c, others, store.getBest(slug)),
    goalUrl: goalUrlFor(slug),
    viewport: { ...data.viewport },
    models: data.models.map((m) => ({ ...m })),
    spec: c.spec.map((g) => ({ group: g.group, items: g.items.map((i) => ({ ...i })) })),
  };
}

// ---------------------------------------------------------------- attempts

export async function getAttempt(slug) {
  return store.getAttempt(slug);
}

export async function startOver(slug) {
  store.clearAttempt(slug);
  return null;
}

// Every mock fault has one fixed cost, so the same fault costs the same on every run.
function faultCost(f) {
  return f.weight + Math.ceil(f.weight / 4);
}

// Which faults are still in the page on version n of the prompt: version n fixes the n biggest
// faults. Harder challenges always keep a few; a very short prompt keeps them all.
// The score is 100 minus the costs of the faults left, so the costs always add up.
function activeFaults(faults, n, level, prompt) {
  const all = faults.slice().sort((a, b) => faultCost(b) - faultCost(a));
  const floor = Math.min(all.length, Math.max(1, level));
  const k = prompt.trim().length < 25 ? all.length : Math.max(floor, all.length - n);
  return all.slice(all.length - k).map((f) => ({ fault: f, points: faultCost(f) }));
}

function applyFaults(html, faults) {
  return faults.reduce((out, f) => out.replace(f.find, f.replace), html);
}

async function streamHtml(html, onHtml, signal, totalMs) {
  const chunks = 30;
  const size = Math.ceil(html.length / chunks);
  for (let end = size; ; end += size) {
    await sleep(totalMs / chunks, signal);
    const part = html.slice(0, Math.min(end, html.length));
    if (onHtml) onHtml(part);
    if (end >= html.length) break;
  }
}

async function walkStages(onStage, signal, totalMs, from = 0) {
  for (let i = from; i < STAGES.length; i++) {
    throwIfAborted(signal);
    if (onStage) onStage({ ...STAGES[i], index: i, total: STAGES.length });
    await sleep(totalMs / STAGES.length, signal);
  }
}

async function mockGrade(slug, n, prompt) {
  const { c } = await findChallenge(slug);
  const faults = await loadJson("mock/faults.json");
  const list = faults.challenges[slug] || [];
  const split = activeFaults(list, n, c.level, prompt);
  const total = 100 - split.reduce((s, x) => s + x.points, 0);
  const failed = new Set(split.map((s) => s.fault.check));
  const checks = [
    ...list.map((f) => ({ label: f.check, passed: !failed.has(f.check) })),
    ...faults.alwaysPass.map((label) => ({ label, passed: true })),
  ];
  return {
    total,
    checks,
    passedCount: checks.filter((x) => x.passed).length,
    totalChecks: checks.length,
    costs: split.map((s) => ({ points: s.points, message: s.fault.message })),
    activeFaults: split.map((s) => s.fault),
  };
}

// Saves a finished run into the current attempt and the best record; returns { attempt, run }.
async function commitRun(slug, prev, { prompt, model, html, result, serverIds }) {
  const attempt = prev
    ? { ...prev, runs: prev.runs.slice() }
    : { id: store.randomId("att_"), promptCount: 0, best: null, runs: [], startedAt: new Date().toISOString() };
  if (serverIds && serverIds.attemptId) attempt.serverId = serverIds.attemptId;
  const n = attempt.runs.length + 1;
  const last = attempt.runs[attempt.runs.length - 1];
  result.delta = last && last.result ? result.total - last.result.total : null;

  const prevBest = store.getBest(slug);
  const entry = { score: result.total, promptCount: n };
  const improved = !prevBest || better(entry, prevBest);
  if (result.rank === undefined) {
    let others = null;
    try {
      others = await mockBoard(slug);
    } catch {
      others = null;
    }
    if (others) {
      const after = improved ? entry : prevBest;
      result.rank = { before: prevBest ? rankAmong(others, prevBest) : null, after: rankAmong(others, after) };
    } else {
      result.rank = null;
    }
  }
  if (improved) {
    store.recordBest(slug, { ...entry, attemptId: attempt.id, when: new Date().toISOString() });
  }

  const run = { n, prompt, model, html, result, at: new Date().toISOString() };
  if (serverIds && serverIds.runId) run.serverId = serverIds.runId;
  attempt.runs.push(run);
  attempt.promptCount = attempt.runs.length;
  attempt.best = Math.max(attempt.best == null ? -Infinity : attempt.best, result.total);
  store.setAttempt(slug, attempt);
  return { attempt, run };
}

async function mockRun({ slug, prompt, model, signal, onStage, onHtml }) {
  const prev = store.getAttempt(slug);
  // Version of the prompt: running the same prompt again builds the same page and scores the same.
  const prompts = (prev ? prev.runs.map((r) => r.prompt) : []).concat(prompt).map((t) => String(t).trim());
  const n = prompts.filter((t, i) => i === 0 || t !== prompts[i - 1]).length;
  const goal = await loadText(`data/goals/${slug}.html`);
  const grade = await mockGrade(slug, n, prompt);
  const html = applyFaults(goal, grade.activeFaults);
  await streamHtml(html, onHtml, signal, options.timing.streamMs);
  await walkStages(onStage, signal, options.timing.stageMs);
  throwIfAborted(signal);
  const { activeFaults, ...result } = grade;
  return commitRun(slug, prev, { prompt, model, html, result });
}

async function readHtmlStream(res, onHtml, signal) {
  if (!res.body || !res.body.getReader) {
    const text = await res.text();
    if (onHtml) onHtml(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (onHtml) onHtml(html);
    }
    html += decoder.decode();
  } catch (e) {
    try {
      reader.cancel();
    } catch {
      // Already closed.
    }
    if (isAbort(e) || (signal && signal.aborted)) throw abortError();
    throw apiError("The page stopped streaming before it finished. Run again.");
  }
  return html;
}

function mapGraderResult(r) {
  const costs = (r.feedback || [])
    .map((f) => (typeof f === "string" ? { points: 0, message: f } : { points: Math.round(Number(f.points) || 0), message: String(f.message || "") }))
    .filter((f) => f.message)
    .sort((a, b) => b.points - a.points);
  let checks;
  if (Array.isArray(r.checks)) {
    checks = r.checks.map((x) => ({ label: String(x.label), passed: !!x.passed }));
  } else {
    const names = { works: "Page works", engineering: "Clean code", looks: "Looks like the goal" };
    checks = Object.entries(names)
      .filter(([k]) => r.pillars && typeof r.pillars[k] === "number")
      .map(([k, label]) => ({ label, passed: r.pillars[k] >= 90 }));
  }
  return {
    total: Math.round(Number(r.total) || 0),
    checks,
    passedCount: checks.filter((x) => x.passed).length,
    totalChecks: checks.length,
    costs,
    rank: r.rank && typeof r.rank === "object" ? { before: r.rank.before ?? null, after: r.rank.after ?? null } : undefined,
  };
}

async function pollJob(jobId, onStage, signal) {
  const started = Date.now();
  const thresholds = [0, 2000, 6000, 12000];
  let shown = -1;
  const show = (i) => {
    while (shown < i) {
      shown++;
      if (onStage) onStage({ ...STAGES[shown], index: shown, total: STAGES.length });
    }
  };
  try {
    for (;;) {
      const elapsed = Date.now() - started;
      show(Math.min(2, thresholds.filter((t) => elapsed >= t).length - 1));
      if (elapsed > options.timing.jobTimeoutMs) throw apiError("Grading took too long. Run again.");
      const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "GET", signal });
      if (!res.ok) throw await httpError(res);
      const job = await res.json();
      if (job.status === "done" && job.result) {
        show(3);
        return job.result;
      }
      if (job.status === "error") throw apiError(job.error || "Grading failed. Run again.");
      if (job.status === "cancelled") throw abortError();
      await sleep(options.timing.pollMs, signal);
    }
  } catch (e) {
    if (isAbort(e) || (signal && signal.aborted)) {
      apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => {});
      throw abortError();
    }
    if (e instanceof TypeError) throw apiError("Lost the connection while grading. Check your network and run again.");
    throw e;
  }
}

async function liveRun(args) {
  const { slug, prompt, model, signal, onStage, onHtml } = args;
  if (routes.has("generate") && (await routes.get("generate"))) {
    warnOnce("generate");
    throw new Fallback();
  }
  const prev = store.getAttempt(slug);
  const body = { challenge: slug, prompt, model, anonId: store.getAnonId() };
  if (prev) body.attemptId = prev.serverId || prev.id;

  let res;
  try {
    res = await apiFetch("/api/generate", { method: "POST", body: JSON.stringify(body), signal });
  } catch (e) {
    if (isAbort(e) || (signal && signal.aborted)) throw abortError();
    warnOnce("generate");
    throw new Fallback();
  }
  if (await isMissingRoute(res)) {
    warnOnce("generate");
    throw new Fallback();
  }
  if (!res.ok) throw await httpError(res);
  const attemptId = res.headers.get("X-Attempt-Id");
  const runId = res.headers.get("X-Run-Id");
  const html = await readHtmlStream(res, onHtml, signal);
  throwIfAborted(signal);

  const n = (prev ? prev.runs.length : 0) + 1;
  let result;
  let scoreRes = null;
  try {
    scoreRes = runId ? await apiFetch(`/api/runs/${encodeURIComponent(runId)}/score`, { method: "POST", signal }) : null;
  } catch (e) {
    if (isAbort(e) || (signal && signal.aborted)) throw abortError();
    scoreRes = null;
  }
  if (!scoreRes || (await isMissingRoute(scoreRes))) {
    warnOnce("score");
    await walkStages(onStage, signal, options.timing.stageMs);
    const { activeFaults, ...grade } = await mockGrade(slug, n, prompt);
    result = grade;
  } else {
    if (!scoreRes.ok) throw await httpError(scoreRes);
    const { jobId } = await scoreRes.json();
    result = mapGraderResult(await pollJob(jobId, onStage, signal));
  }
  throwIfAborted(signal);
  return commitRun(slug, prev, { prompt, model, html, result, serverIds: { attemptId, runId } });
}

export async function run({ slug, prompt, model, signal, onStage, onHtml } = {}) {
  throwIfAborted(signal);
  const text = String(prompt || "");
  if (!text.trim()) throw apiError("Write a prompt first, then run it.");
  const ch = await getChallenge(slug);
  const args = { slug, prompt: text, model: model || ch.models[0].id, signal, onStage, onHtml };
  if (options.mode === "live") {
    try {
      return await liveRun(args);
    } catch (e) {
      if (!(e instanceof Fallback)) throw e;
    }
  }
  return mockRun(args);
}

// ---------------------------------------------------------------- leaderboards

async function mockLeaderboard(slug, bracket, period) {
  const [lo, hi] = BRACKET_RANGE[bracket];
  const inWindow = (r) => period !== "week" || r.daysAgo <= 7;
  let entries;
  if (slug) {
    const others = (await mockBoard(slug)).filter(inWindow).map((r) => ({ ...r, isYou: false }));
    const best = store.getBest(slug);
    entries = others;
    if (best) entries.push({ username: youName(), promptCount: best.promptCount, score: best.score, daysAgo: 0, isYou: true });
  } else {
    const data = await challengeData();
    const byUser = new Map();
    for (const c of data.challenges) {
      for (const r of (await mockBoard(c.slug)).filter(inWindow)) {
        const u = byUser.get(r.username) || { username: r.username, score: 0, prompts: 0, count: 0, isYou: false };
        u.score += r.score;
        u.prompts += r.promptCount;
        u.count++;
        byUser.set(r.username, u);
      }
    }
    const mine = store.allBests();
    if (mine.length) {
      byUser.set("\u0000you", {
        username: youName(),
        score: mine.reduce((s, b) => s + b.score, 0),
        prompts: mine.reduce((s, b) => s + b.promptCount, 0),
        count: mine.length,
        isYou: true,
      });
    }
    entries = [...byUser.values()].map((u) => ({
      username: u.username,
      score: u.score,
      promptCount: Math.max(1, Math.round(u.prompts / u.count)),
      avgPrompts: Math.round((u.prompts / u.count) * 10) / 10,
      isYou: u.isYou,
    }));
  }
  const rows = sortRows(entries.filter((r) => r.promptCount >= lo && r.promptCount <= hi)).map((r, i) => ({
    rank: i + 1,
    username: r.username,
    promptCount: r.promptCount,
    score: r.score,
    isYou: !!r.isYou,
    ...(r.avgPrompts != null ? { avgPrompts: r.avgPrompts } : {}),
  }));
  const y = rows.find((r) => r.isYou);
  return { rows, you: y ? { rank: y.rank, score: y.score, promptCount: y.promptCount } : null };
}

export async function getLeaderboard(slug = null, { bracket = "all", period = "all" } = {}) {
  if (!BRACKET_RANGE[bracket]) throw apiError(`Unknown prompt filter "${bracket}". Use all, 1, 2, 3-5, 6-10 or 11+.`);
  if (period !== "week" && period !== "all") throw apiError(`Unknown period "${period}". Use week or all.`);
  if (slug) await findChallenge(slug);
  const mock = () => mockLeaderboard(slug, bracket, period);
  if (options.mode !== "live") return mock();
  const q = new URLSearchParams({ b: bracket, period, anonId: store.getAnonId() });
  return live("leaderboards", `/api/leaderboards/${encodeURIComponent(slug || "overall")}?${q}`, { method: "GET" }, mock, async (res) => {
    if (!res.ok) throw await httpError(res);
    const body = await res.json();
    const meRow = body.me || null;
    const rows = (body.rows || []).map((r) => ({
      rank: r.rank,
      username: r.username,
      promptCount: r.promptCount,
      score: r.score,
      isYou: !!(r.isYou || (meRow && meRow.rank === r.rank)),
    }));
    return { rows, you: meRow ? { rank: meRow.rank, score: meRow.score, promptCount: meRow.promptCount ?? null } : null };
  });
}

// ---------------------------------------------------------------- profiles

function profileTotals(solved) {
  return {
    solved: solved.length,
    best: solved.length ? Math.max(...solved.map((s) => s.best)) : 0,
    averagePrompts: solved.length ? Math.round((solved.reduce((s, x) => s + x.promptCount, 0) / solved.length) * 10) / 10 : 0,
  };
}

async function mockProfile(username) {
  const data = await challengeData();
  const user = store.getPlayer();
  if (user && user.username === username) {
    const acc = store.read("mock.user", null);
    const solved = store.allBests().map((b) => {
      const c = data.challenges.find((x) => x.slug === b.slug);
      return { slug: b.slug, title: c ? c.title : b.slug, best: b.score, promptCount: b.promptCount, when: String(b.when || "").slice(0, 10) };
    });
    const joined = acc && acc.id === user.id ? String(acc.joined || "").slice(0, 10) : null;
    return { username, joined, totals: profileTotals(solved), solved };
  }
  const solved = [];
  for (const c of data.challenges) {
    const row = (await mockBoard(c.slug)).find((r) => r.username === username);
    if (row) solved.push({ slug: c.slug, title: c.title, best: row.score, promptCount: row.promptCount, when: isoDaysAgo(row.daysAgo) });
  }
  if (!solved.length) throw apiError(`There is no player called "${username}". Check the spelling.`, { status: 404 });
  const { joinedDaysAgo } = await loadJson("mock/users.json");
  const span = joinedDaysAgo.max - joinedDaysAgo.min;
  const oldest = Math.max(...solved.map((s) => Math.round((Date.now() - Date.parse(s.when)) / 86400000)));
  const joined = isoDaysAgo(Math.max(oldest, joinedDaysAgo.min + (hash(username) % span)));
  return { username, joined, totals: profileTotals(solved), solved };
}

export async function getProfile(username) {
  const name = String(username || "").trim();
  if (!name) throw apiError("No player name given. Open a profile from the leaderboard.");
  const mock = () => mockProfile(name);
  if (options.mode !== "live") return mock();
  const data = await challengeData();
  return live("users", `/api/users/${encodeURIComponent(name)}`, { method: "GET" }, mock, async (res) => {
    if (res.status === 404) throw apiError(`There is no player called "${name}". Check the spelling.`, { status: 404 });
    if (!res.ok) throw await httpError(res);
    const body = await res.json();
    const solved = (body.solved || []).map((s) => {
      const c = data.challenges.find((x) => x.slug === s.slug);
      return { slug: s.slug, title: s.title || (c ? c.title : s.slug), best: s.best, promptCount: s.promptCount, when: s.when || null };
    });
    const t = body.totals || {};
    const computed = profileTotals(solved);
    return {
      username: body.username || name,
      joined: body.joined || null,
      totals: { solved: t.solved ?? computed.solved, best: t.best ?? computed.best, averagePrompts: t.averagePrompts ?? computed.averagePrompts },
      solved,
    };
  });
}

// ---------------------------------------------------------------- auth

let meCache;

// Usernames: 3 to 20 letters, digits or underscores (the sign-up form uses the same rule).
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

// Points are the sum of the player's best score on each challenge.
// Level: one level per 100 points, starting at Lv 1 (0-99 is Lv 1, 100-199 Lv 2, ...).
export function levelFor(points) {
  return 1 + Math.floor(Math.max(0, Number(points) || 0) / 100);
}

// { points, level, solved } for the current player on this browser (signed in or anonymous).
export function playerStats() {
  const bests = store.allBests();
  const points = bests.reduce((s, b) => s + (Number(b.score) || 0), 0);
  return { points, level: levelFor(points), solved: bests.length };
}

function withStats(u) {
  if (!u) return null;
  const { points, level } = playerStats();
  return { ...u, points: Number.isFinite(u.points) ? u.points : points, level: Number.isFinite(u.level) ? u.level : level };
}

function pwHash(email, password) {
  return hash(email + "\u0000" + password).toString(36);
}

function validateSignup({ username, email, password }) {
  // Trimmed first, as the server does.
  if (!USERNAME_RE.test(String(username || "").trim())) throw apiError("Usernames are 3 to 20 letters, digits or underscores.", { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase())) throw apiError("Enter a valid email address.", { status: 400 });
  const p = String(password || "");
  if (p.length < 8 || p.length > 128) throw apiError("Passwords are 8 to 128 characters.", { status: 400 });
}

function publicUser(u) {
  return u ? { id: u.id, username: u.username, email: u.email } : null;
}

// A 401 from /api/auth/me is remembered for the tab, so a signed-out visitor is asked once per
// visit (the browser logs every 401 as a failed request). Signing in or out updates it.
function tabFlag(key, on) {
  try {
    const ss = globalThis.sessionStorage;
    if (!ss) return false;
    if (on === undefined) return ss.getItem(key) === "1";
    if (on) ss.setItem(key, "1");
    else ss.removeItem(key);
  } catch {
    // Storage blocked.
  }
  return false;
}

// Marks user as the player on this browser (null clears it); scores and attempts follow it.
function adopt(user, { isNew = false } = {}) {
  store.setPlayer(user);
  meCache = user;
  // A new account takes this browser's anonymous scores; claimAttempts() reports them.
  if (user && isNew) store.write("claim.pending." + user.id, store.moveAnonTo(user.id));
  return user;
}

// Mock accounts live in this browser only. Messages match the real server's.
const mockAuth = {
  me() {
    return publicUser(store.read("mock.user", null));
  },
  signup({ username, email, password }) {
    const accounts = store.read("mock.accounts", {});
    const key = email.trim().toLowerCase();
    const name = username.trim();
    if (accounts[key] || Object.values(accounts).some((a) => a.username.toLowerCase() === name.toLowerCase())) {
      throw apiError("That username or email is already registered.", { status: 409 });
    }
    const user = { id: store.randomId("u_"), username: name, email: key, joined: new Date().toISOString() };
    accounts[key] = { ...user, pw: pwHash(key, password) };
    store.write("mock.accounts", accounts);
    store.write("mock.user", user);
    return publicUser(user);
  },
  login({ email, password }) {
    const accounts = store.read("mock.accounts", {});
    const key = email.trim().toLowerCase();
    const acc = accounts[key];
    if (!acc || acc.pw !== pwHash(key, password)) throw apiError("Email or password is incorrect.", { status: 401 });
    const { pw, ...user } = acc;
    store.write("mock.user", user);
    return publicUser(user);
  },
  logout() {
    store.remove("mock.user");
    return { ok: true };
  },
};

const AUTH_DOWN = "Accounts are not available right now. You can keep playing, and your scores stay on this browser.";
const AUTH_UNREACHABLE = "Could not reach the server. Check your connection and try again. You can keep playing meanwhile.";

// Server errors are { error } JSON. 400, 401 and 409 carry a message meant for the player;
// 5xx messages are about the database, so the player gets a plain one instead.
async function authError(res) {
  const text = await readError(res);
  if (res.status >= 500) return apiError(AUTH_DOWN, { status: res.status });
  return apiError(text || `The server could not finish the request (${res.status}). Try again in a moment.`, { status: res.status });
}

async function userFrom(res) {
  if (!res.ok) throw await authError(res);
  const body = await res.json();
  return publicUser(body && body.user);
}

// Live auth call: a missing route (local dev, no server) uses mock auth; a network failure
// is reported to the player instead of quietly signing them in to a local account.
async function liveAuth(path, init, mockFn, onResponse) {
  let res;
  try {
    res = await apiFetch(path, init);
  } catch (e) {
    if (isAbort(e)) throw abortError();
    throw apiError(AUTH_UNREACHABLE, { status: 0 });
  }
  if (await isMissingRoute(res)) {
    warnOnce("auth");
    return mockFn();
  }
  return onResponse(res);
}

// Returns { id, username, email, points, level } or null when not logged in.
// A 401 is the normal signed-out answer; the result is kept for the life of the page.
export async function me() {
  if (options.mode !== "live") return withStats(adopt(mockAuth.me()));
  if (meCache !== undefined) return withStats(meCache);
  if (tabFlag("pd.signedOut")) return withStats(adopt(null));
  let u = null;
  try {
    u = await live("auth", "/api/auth/me", { method: "GET" }, () => mockAuth.me(), async (res) => {
      if (res.status === 401) tabFlag("pd.signedOut", true);
      if (!res.ok) return null;
      return userFrom(res);
    });
  } catch {
    u = null;
  }
  return withStats(adopt(u));
}

export async function login({ email, password } = {}) {
  if (!email || !password) throw apiError("Email and password are required.", { status: 400 });
  const input = { email: String(email).trim(), password: String(password) };
  if (options.mode !== "live") return adopt(mockAuth.login(input));
  const user = await liveAuth("/api/auth/login", { method: "POST", body: JSON.stringify(input) }, () => mockAuth.login(input), userFrom);
  tabFlag("pd.signedOut", false);
  return adopt(user);
}

export async function signup({ username, email, password } = {}) {
  validateSignup({ username, email, password });
  const input = { username: String(username).trim(), email: String(email).trim(), password: String(password) };
  if (options.mode !== "live") return adopt(mockAuth.signup(input), { isNew: true });
  const user = await liveAuth("/api/auth/signup", { method: "POST", body: JSON.stringify(input) }, () => mockAuth.signup(input), userFrom);
  tabFlag("pd.signedOut", false);
  return adopt(user, { isNew: true });
}

export async function logout() {
  const wasLive = options.mode === "live";
  adopt(null);
  meCache = wasLive ? null : undefined;
  if (!wasLive) return mockAuth.logout();
  tabFlag("pd.signedOut", true);
  try {
    return await live("auth", "/api/auth/logout", { method: "POST" }, () => mockAuth.logout(), async (res) => {
      if (!res.ok) throw await authError(res);
      return { ok: true };
    });
  } catch {
    // The player is signed out on this browser either way.
    return { ok: true };
  }
}

// Moves this browser's anonymous runs onto the signed-in account (in this browser; the
// server has no claim endpoint yet, so a missing one is not an error). Returns { moved }.
export async function claimAttempts() {
  const u = store.getPlayer();
  if (!u) throw apiError("Log in first, then claim your runs.", { status: 401 });
  const pending = Number(store.read("claim.pending." + u.id, 0)) || 0;
  store.remove("claim.pending." + u.id);
  const moved = pending + store.moveAnonTo(u.id);
  if (options.mode !== "live") return { moved };
  return live("attempts/claim", "/api/attempts/claim", { method: "POST", body: JSON.stringify({ anonId: store.getAnonId() }) }, () => ({ moved }), async (res) => {
    if (!res.ok) return { moved };
    const body = await res.json().catch(() => ({}));
    return { moved: Math.max(moved, Number(body.moved) || 0) };
  }).catch(() => ({ moved }));
}
