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
  // scoreStageMs: when each stage label shows while the server scores (it reports no stages).
  timing: { streamMs: 3000, stageMs: 3000, scoreStageMs: [0, 2000, 6000, 12000] },
};

// Change mode, base URL, fetch function or mock timings (used by tests).
export function configure(next = {}) {
  if (next.mode) options.mode = next.mode;
  if (next.base != null) options.base = next.base;
  if (next.fetch !== undefined) options.fetch = next.fetch;
  if (next.timing) options.timing = { ...options.timing, ...next.timing };
  if (next.reset) {
    meCache = undefined;
    statsCache = undefined;
    warned.clear();
    simulated.clear();
    healthPromise = null;
    healthNow = null;
    provisionalSeen = false;
    boardsProvisional = false;
    boardsMixed = false;
    rescored.clear();
    liveAttempts.clear();
    realSlugs.clear();
    swrClear([""]);
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
const simulated = new Set();

// true when data of this kind came, or will come, from the mock.
export function isSimulated(kind) {
  return options.mode !== "live" || simulated.has(kind);
}

// isProvisional() / isProvisional("run"): real results come from the stand-in scorer (or the
// latest result said so). isProvisional("boards"): the boards on this page use stand-in scores.
let provisionalSeen = false;
let boardsProvisional = false;
let boardsMixed = false;
export function isProvisional(kind = "run") {
  if (options.mode !== "live") return false;
  if (kind === "boards") return boardsProvisional && !simulated.has("boards");
  if (kind === "versions") return boardsMixed && !simulated.has("boards");
  if (simulated.has("run")) return false;
  return provisionalSeen || !!(healthNow && healthNow.reachable && healthNow.grader === "standin");
}

// Messages for a run that stopped, by how far it got (the same in mock and live mode).
// A run counts as a prompt only once its page is fully generated and saved.
const CANCEL_WRITING = "Run cancelled. Your prompt count did not change.";
const CANCEL_SCORING = "Scoring cancelled. The page is saved and counts as a prompt; score it to see the result.";
const SCORE_FAILED = "Scoring failed. Your page is saved; score it again.";

function cancelledWriting() {
  const e = abortError();
  e.userMessage = CANCEL_WRITING;
  return e;
}

// The page is saved but has no score: e.attempt carries it as attempt.pending, for "Score this page".
function unscored(e, attempt) {
  const out = isAbort(e) ? abortError() : e;
  if (isAbort(e)) out.userMessage = CANCEL_SCORING;
  else if (e.status === 502) {
    out.message = SCORE_FAILED;
    out.userMessage = SCORE_FAILED;
  } else if (e.code === "no_grader") out.userMessage = e.message;
  else out.userMessage = `${e.message} Your page is saved; score it again.`;
  out.attempt = attempt;
  out.unscored = true;
  return out;
}

const warned = new Set();
function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  try {
    console.warn(`promptdyno: ${message}`);
  } catch {
    // No console.
  }
}

// Every request carries the session cookie and, for anonymous play, the browser's anonymous id.
async function apiFetch(path, init = {}) {
  const f = options.fetch || globalThis.fetch;
  if (!f) throw new TypeError("fetch is not available");
  const headers = { "X-Anon-Id": store.getAnonId(), ...(init.headers || {}) };
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

async function readBody(res) {
  try {
    return await res.clone().json();
  } catch {
    return null;
  }
}

async function readError(res) {
  const body = await readBody(res);
  return body && typeof body.error === "string" ? body.error : "";
}

async function httpError(res) {
  const text = await readError(res);
  return apiError(text || `The server could not finish the request (${res.status}). Try again in a moment.`, { status: res.status });
}

const NETWORK_DOWN = "Could not reach the server. Check your connection and try again.";

// GET (or init) a JSON endpoint. Throws AbortError, a network error (status 0) or the server's error.
async function getJson(path, init = { method: "GET" }) {
  let res;
  try {
    res = await apiFetch(path, init);
  } catch (e) {
    if (isAbort(e) || (init.signal && init.signal.aborted)) throw abortError();
    throw apiError(NETWORK_DOWN, { status: 0 });
  }
  if (!res.ok) throw await httpError(res);
  return res.json();
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------- GET cache (stale-while-revalidate)
// The last good body of each GET is kept in sessionStorage with its time. A call returns it at once;
// when it is older than its freshness it is also refreshed in the background for the next call.
// With no cache (or no storage, as in node) the call fetches. Changes clear the affected keys.

const SWR_PREFIX = "pd.swr.";
const FRESH = { health: 60e3, challenges: 300e3, lessons: 300e3, boards: 30e3, me: 30e3 };
const inflight = new Map();
let swrGen = 0;

function quiet(p) {
  p.catch(() => {});
  return p;
}

function swrRead(key) {
  try {
    const ss = globalThis.sessionStorage;
    const v = ss && JSON.parse(ss.getItem(SWR_PREFIX + key) || "null");
    return v && v.base === options.base && typeof v.at === "number" ? v : null;
  } catch {
    return null;
  }
}

function swrWrite(key, value) {
  try {
    const ss = globalThis.sessionStorage;
    if (ss) ss.setItem(SWR_PREFIX + key, JSON.stringify({ at: Date.now(), base: options.base, value }));
  } catch {
    // Storage blocked or full: the call still works, uncached.
  }
}

// Removes every cached key starting with one of the prefixes ("" clears all).
function swrClear(prefixes) {
  swrGen++;
  inflight.clear();
  try {
    const ss = globalThis.sessionStorage;
    if (!ss) return;
    const drop = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (k && k.startsWith(SWR_PREFIX) && prefixes.some((p) => k.startsWith(SWR_PREFIX + p))) drop.push(k);
    }
    drop.forEach((k) => ss.removeItem(k));
  } catch {
    // Storage blocked.
  }
}

function swrRefresh(key, fetcher) {
  if (inflight.has(key)) return inflight.get(key);
  const gen = swrGen;
  const p = fetcher().then((value) => {
    if (gen === swrGen) swrWrite(key, value);
    return value;
  });
  inflight.set(key, p);
  quiet(p.finally(() => { if (inflight.get(key) === p) inflight.delete(key); }));
  return quiet(p);
}

function swr(key, freshMs, fetcher) {
  const hit = swrRead(key);
  if (!hit) return swrRefresh(key, fetcher);
  if (!(Date.now() - hit.at < freshMs)) swrRefresh(key, fetcher);
  return Promise.resolve(hit.value);
}

function cachedGet(key, freshMs, path) {
  return swr(key, freshMs, () => getJson(path));
}

// After anything that changes the player's data (a scored run, start over, log in or out, claim).
function dropPlayerData() {
  statsCache = undefined;
  swrClear(["challenges", "challenge:", "boards:", "me"]);
}

// ---------------------------------------------------------------- server health
// One cheap call decides, for the tab, what is real: no server or no database means stored data
// (boards, profiles, attempts) comes from the mock; no model means runs are simulated.

const HEALTH_KEY = "health";
const NO_SERVER = Object.freeze({ reachable: false, db: false, models: [], grader: "standin" });
let healthPromise = null;
let healthNow = null;

function writeHealthCache(health) {
  swrWrite(HEALTH_KEY, health);
}

// true when the known health (this page or the tab's cache) already says the data is live.
// Unknown health means no request yet: a server without a database never gets stored-data calls.
function maybeLive(needDb = true) {
  const h = healthNow || (swrRead(HEALTH_KEY) || {}).value;
  return !!(h && h.reachable && (!needDb || h.db));
}

// Starts a GET together with the health check (no waterfall) when health is already known live;
// on a tab's very first call the health answer comes first. Returns { req } when the data is
// live, or null (mock mode, no server, no database).
async function whenLive(start, needDb = true) {
  if (options.mode !== "live") return null;
  const healthP = getHealth();
  const early = maybeLive(needDb) ? quiet(start()) : null;
  const h = await healthP;
  if (!(h.reachable && (!needDb || h.db))) return null;
  return { req: quiet(early || start()) };
}

async function fetchHealth() {
  try {
    const res = await apiFetch("/api/health", { method: "GET" });
    if (!res.ok) return NO_SERVER;
    const body = await res.json();
    if (!body || typeof body !== "object" || typeof body.db !== "boolean") return NO_SERVER;
    return {
      reachable: true,
      db: body.db === true,
      models: Array.isArray(body.models) ? body.models.filter((m) => typeof m === "string") : [],
      grader: body.grader === "service" ? "service" : "standin",
      graderVersion: typeof body.graderVersion === "string" ? body.graderVersion : null,
    };
  } catch {
    return NO_SERVER;
  }
}

function applyHealth(h) {
  healthNow = h;
  if (!h.reachable || !h.db) {
    ["run", "boards", "profile"].forEach((k) => simulated.add(k));
    warnOnce("health", h.reachable ? "the server has no database, using demo data." : "the server is not reachable, using demo data.");
  } else if (!h.models.length) {
    simulated.add("run");
    warnOnce("models", "no model is set up on the server, runs are simulated.");
  }
  return h;
}

function getHealth() {
  if (!healthPromise) healthPromise = swr(HEALTH_KEY, FRESH.health, fetchHealth).then(applyHealth);
  return healthPromise;
}

// true when stored things (attempts, boards, profiles, points) come from the server.
async function storedLive() {
  if (options.mode !== "live") return false;
  const h = await getHealth();
  return h.reachable && h.db;
}

// true when runs are generated and scored by the server.
async function runsLive() {
  if (!(await storedLive())) return false;
  return healthNow.models.length > 0;
}

// A run was refused with no_model: runs are simulated from now on in this tab.
function markNoModels() {
  if (!healthNow) return;
  healthNow = { ...healthNow, models: [] };
  healthPromise = Promise.resolve(healthNow);
  writeHealthCache(healthNow);
  applyHealth(healthNow);
}

// Live mode: asks once whether the server can generate pages. Returns true when runs are simulated.
export async function probeRun() {
  if (options.mode !== "live") return true;
  return !(await runsLive());
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
  // Scores run to 120 with one decimal: an exact match leaner than the goal earns a bonus.
  // One board shows it, so the above-100 and decimal states are exercised in the preview build.
  if (slug === "login-card") {
    rows[3].score = 104.5;
    rows[8].score = 97.5;
  }
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
    kind: c.kind || "page",
    available: c.available !== false,
  };
}

// Server summary -> client summary (same fields; stats can be null when nobody has played).
function fromServerSummary(s) {
  return {
    slug: s.slug,
    title: s.title,
    level: s.level,
    levelLabel: s.levelLabel,
    brief: s.brief,
    solvedCount: s.solvedCount ?? 0,
    topScore: s.topScore ?? null,
    yourBest: s.yourBest ?? null,
    yourBestPrompts: s.yourBestPrompts ?? null,
    kind: s.kind || "page",
    available: s.available !== false,
    ...(s.lesson ? { lesson: s.lesson } : {}),
  };
}

// Models that can run come first; unavailable ones are listed only when none can run.
function fromServerModels(models) {
  const list = (Array.isArray(models) ? models : []).filter((m) => m && m.id).map((m) => ({ id: m.id, label: m.label || m.id, available: m.available !== false }));
  const ready = list.filter((m) => m.available);
  return ready.length ? ready : list;
}

async function mockListChallenges() {
  const data = await challengeData();
  return Promise.all(data.challenges.map(async (c) => summary(data, c, await mockBoard(c.slug), store.getBest(c.slug))));
}

async function mockChallenge(slug) {
  const { data, c } = await findChallenge(slug);
  return {
    ...summary(data, c, await mockBoard(slug), store.getBest(slug)),
    goalUrl: (c.kind || "page") === "page" ? goalUrlFor(slug) : null,
    criteria: Array.isArray(c.criteria) ? c.criteria.slice() : [],
    unavailableReason: null,
    viewport: { ...data.viewport },
    models: data.models.map((m) => ({ ...m })),
    spec: c.spec.map((g) => ({ group: g.group, items: g.items.map((i) => ({ ...i })) })),
  };
}

export async function listChallenges() {
  const live = await whenLive(() => cachedGet("challenges", FRESH.challenges, "/api/challenges"));
  if (live) {
    try {
      const body = await live.req;
      if (body && Array.isArray(body.challenges) && body.statsAvailable) return body.challenges.map(fromServerSummary);
    } catch {
      // Falls back to demo stats below.
    }
    simulated.add("boards");
  }
  return mockListChallenges();
}

export async function getChallenge(slug) {
  const live = await whenLive(() => cachedGet(`challenge:${slug}`, FRESH.challenges, `/api/challenges/${enc(slug)}`));
  if (!live) return mockChallenge(slug);
  let body = null;
  try {
    body = await live.req;
  } catch (e) {
    if ((e.status === 404 && e.message !== "API route not found.") || e.status === 400) throw apiError(`There is no challenge called "${slug}". Pick one from the challenge list.`, { status: 404 });
  }
  const sc = body && body.challenge;
  if (!sc) {
    simulated.add("boards");
    return mockChallenge(slug);
  }
  const kind = sc.kind || "page";
  const details = {
    kind,
    available: sc.available !== false,
    unavailableReason: sc.unavailableReason || null,
    criteria: Array.isArray(sc.criteria) ? sc.criteria.map((c) => (typeof c === "string" ? c : c && (c.name || c.text || c.label) || "")).filter(Boolean) : [],
    goalUrl: kind === "page" ? goalUrlFor(slug) : null,
    viewport: sc.viewport ? { width: sc.viewport.width, height: sc.viewport.height } : { width: 1280, height: 800 },
    models: fromServerModels(sc.models),
    spec: (sc.spec || []).map((g) => ({ group: g.group, items: (g.items || []).map((i) => ({ ...i })) })),
  };
  if (body.statsAvailable) return { ...fromServerSummary(sc), ...details };
  simulated.add("boards");
  const mock = await mockChallenge(slug).catch(() => null);
  return { ...(mock || fromServerSummary(sc)), ...details };
}

// ---------------------------------------------------------------- attempts
// Mock mode, or live with no database: attempts live in this browser (store.js).
// Live with a database: the server is the source of truth. Once a challenge has real server runs,
// nothing is simulated for it.

const liveAttempts = new Map(); // slug -> the client attempt last read from the server
const realSlugs = new Set(); // challenges with real server runs in the open attempt

// Server result -> client result. Costs largest first, as the pages show them.
const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
const PILLAR_LABEL = { works: "It works", engineering: "Well engineered", looks: "Looks like the goal" };

// Every field the grader adds, passed through in one place. Totals and costs: 0 to 120, one decimal.
function fromServerResult(r) {
  if (!r) return null;
  const checks = (r.checks || []).map((x) => ({ label: String(x.label), passed: !!x.passed }));
  const out = {
    total: round1(r.total),
    delta: r.delta == null ? null : round1(r.delta),
    checks,
    passedCount: r.passedCount ?? checks.filter((x) => x.passed).length,
    totalChecks: r.totalChecks ?? checks.length,
    costs: (r.costs || []).map((c) => ({ points: round1(c.points), message: String(c.message || "") })).sort((a, b) => b.points - a.points),
    rank: r.rank && typeof r.rank === "object" ? { before: r.rank.before ?? null, after: r.rank.after ?? null } : null,
    provisional: !!r.provisional,
  };
  if (r.notice) out.notice = String(r.notice);
  if (r.graderVersion) out.graderVersion = String(r.graderVersion);
  if (Array.isArray(r.pillars)) {
    out.pillars = r.pillars.filter((x) => x && x.id).map((x) => ({ id: String(x.id), label: x.label || PILLAR_LABEL[x.id] || String(x.id), value: x.value == null ? null : round1(x.value) }));
  }
  if (r.engineering && typeof r.engineering === "object") {
    const e = r.engineering;
    out.engineering = { efficiency: e.efficiency ?? null, accessibility: e.accessibility ?? null, cleanCode: e.cleanCode ?? null, decidedBy: e.decidedBy ?? null };
  }
  if (r.bonus != null) out.bonus = round1(r.bonus);
  if (r.exactMatch != null) out.exactMatch = !!r.exactMatch;
  if (Array.isArray(r.criteria)) {
    out.criteria = r.criteria.filter((c) => c && c.name).map((c) => ({
      id: String(c.id ?? c.name),
      name: String(c.name),
      group: ["works", "looks", "engineering"].includes(c.group) ? c.group : "works",
      value: c.value == null || !Number.isFinite(Number(c.value)) ? null : Math.max(0, Math.min(1, Number(c.value))),
      notes: (Array.isArray(c.notes) ? c.notes : []).map(String),
    }));
  }
  if (r.rejectedReason) out.rejectedReason = String(r.rejectedReason);
  return out;
}

// A run: page runs keep the page in html; doc runs keep the answer in markdown (html stays "").
function fromServerRun(r, output) {
  const kind = r.kind || "page";
  const text = output ?? (kind === "doc" ? r.markdown : r.html) ?? "";
  const run = { n: r.n, kind, prompt: r.prompt, model: r.model, html: kind === "doc" ? "" : text, result: fromServerResult(r.result), at: r.at, serverId: r.id };
  if (kind === "doc") run.markdown = text;
  return run;
}

// attempt.runs holds scored runs only. attempt.pending is the latest saved page that has no score
// yet ({ n, prompt, model, html, at, serverId }) or null; it counts as a prompt.
function fromServerAttempt(a, runs, pending = null) {
  return { id: a.id, serverId: a.id, promptCount: a.promptCount, best: a.best ?? null, runs, pending, startedAt: a.startedAt };
}

async function readServerAttempt(slug, started = null) {
  const body = await (started || getJson(`/api/attempts/current?slug=${enc(slug)}`));
  const a = body && body.attempt;
  if (!a) {
    liveAttempts.delete(slug);
    realSlugs.delete(slug);
    return null;
  }
  const saved = (a.runs || []).filter((r) => r.status === "done" || r.result).sort((x, y) => x.n - y.n);
  const runs = saved.filter((r) => r.result).map((r) => fromServerRun(r));
  const last = saved[saved.length - 1];
  const pending = last && !last.result ? { n: last.n, kind: last.kind || "page", prompt: last.prompt, model: last.model, html: last.html || "", markdown: last.markdown || "", at: last.at, serverId: last.id } : null;
  const attempt = fromServerAttempt(a, runs, pending);
  if (runs.length) provisionalSeen = runs[runs.length - 1].result.provisional;
  realSlugs.add(slug);
  liveAttempts.set(slug, attempt);
  rescoreProvisional(attempt);
  return attempt;
}

// With the grader service connected, provisional results are graded again once, quietly, and
// replaced in place (the page shows the new result on its next render).
const rescored = new Set();
function needsRescore(result) {
  if (!result) return false;
  if (result.provisional) return true;
  const live = healthNow && healthNow.graderVersion;
  return !!(live && result.graderVersion && result.graderVersion !== live);
}
function rescoreProvisional(attempt) {
  if (!healthNow || healthNow.grader !== "service") return null;
  const todo = attempt.runs.filter((r) => needsRescore(r.result) && r.serverId && !rescored.has(r.serverId));
  if (!todo.length) return null;
  todo.forEach((r) => rescored.add(r.serverId));
  return (async () => {
    for (const r of todo) {
      try {
        const body = await getJson(`/api/runs/${enc(r.serverId)}/score`, { method: "POST" });
        if (!body || !body.run || !body.run.result) continue;
        r.result = fromServerResult(body.run.result);
        if (body.attempt && body.attempt.best != null) attempt.best = body.attempt.best;
        dropPlayerData();
      } catch {
        // Keeps the provisional result; the server can grade it again later.
      }
    }
    provisionalSeen = attempt.runs.length ? attempt.runs[attempt.runs.length - 1].result.provisional : false;
  })();
}

// Never cached: the player's own attempt is always read fresh (in parallel with the health check).
export async function getAttempt(slug) {
  const live = await whenLive(() => getJson(`/api/attempts/current?slug=${enc(slug)}`));
  if (!live) return store.getAttempt(slug);
  let attempt = null;
  try {
    attempt = await readServerAttempt(slug, live.req);
  } catch {
    warnOnce("attempt." + slug, `could not read the current attempt for ${slug}.`);
    attempt = null;
  }
  if (attempt) return attempt;
  // No real attempt: simulated runs (no model yet) stay on this browser.
  return (await runsLive()) ? null : store.getAttempt(slug);
}

export async function startOver(slug) {
  store.clearAttempt(slug);
  liveAttempts.delete(slug);
  if (await storedLive()) {
    try {
      await getJson("/api/attempts/start-over", { method: "POST", body: JSON.stringify({ slug }) });
    } catch (e) {
      throw apiError(e.status === 0 ? NETWORK_DOWN : "Could not start over on the server. Try again.", { status: e.status });
    }
    realSlugs.delete(slug);
    dropPlayerData();
  }
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
  const lost = 100 - total;
  return {
    total,
    checks,
    passedCount: checks.filter((x) => x.passed).length,
    totalChecks: checks.length,
    costs: split.map((s) => ({ points: s.points, message: s.fault.message })),
    pillars: [
      { id: "works", label: "It works", value: 100 },
      { id: "engineering", label: "Well engineered", value: Math.max(60, 96 - c.level * 3) },
      { id: "looks", label: "Looks like the goal", value: Math.max(0, 100 - lost) },
    ],
    engineering: { efficiency: 0.9, accessibility: 0.85, cleanCode: 0.8, decidedBy: "cleanCode" },
    activeFaults: split.map((s) => s.fault),
  };
}

// Saves a finished run into the current attempt and the best record; returns { attempt, run }.
async function commitRun(slug, prev, { prompt, model, html, result, serverIds, n: given }) {
  const attempt = prev
    ? { ...prev, runs: prev.runs.slice() }
    : { id: store.randomId("att_"), promptCount: 0, best: null, runs: [], startedAt: new Date().toISOString() };
  if (serverIds && serverIds.attemptId) attempt.serverId = serverIds.attemptId;
  const n = given || attempt.runs.length + 1;
  attempt.pending = null;
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
  attempt.promptCount = Math.max(attempt.promptCount || 0, n);
  attempt.best = Math.max(attempt.best == null ? -Infinity : attempt.best, result.total);
  store.setAttempt(slug, attempt);
  return { attempt, run };
}

function promptCountOf(a) {
  return a ? a.promptCount ?? a.runs.length : 0;
}

// Same rule as the server: the run counts once its page is fully generated and saved.
async function mockRun({ slug, prompt, model, signal, onStage, onHtml }) {
  const prev = store.getAttempt(slug);
  // Prompt count (server rule): this run is prompt n once its page is generated and saved.
  const n = promptCountOf(prev) + 1;
  // Version of the prompt: running the same prompt again builds the same page and scores the same.
  const prompts = (prev ? prev.runs.map((r) => r.prompt) : []).concat(prompt).map((t) => String(t).trim());
  const v = prompts.filter((t, i) => i === 0 || t !== prompts[i - 1]).length;
  const goal = await loadText(`data/goals/${slug}.html`);
  const grade = await mockGrade(slug, v, prompt);
  const html = applyFaults(goal, grade.activeFaults);
  try {
    await streamHtml(html, onHtml, signal, options.timing.streamMs);
  } catch (e) {
    throw isAbort(e) ? cancelledWriting() : e;
  }
  const attempt = prev
    ? { ...prev, runs: prev.runs.slice() }
    : { id: store.randomId("att_"), promptCount: 0, best: null, runs: [], startedAt: new Date().toISOString() };
  attempt.pending = { n, v, prompt, model, html, at: new Date().toISOString() };
  attempt.promptCount = n;
  store.setAttempt(slug, attempt);
  return mockScore(slug, attempt, { signal, onStage });
}

async function mockScore(slug, attempt, { signal, onStage }) {
  const p = attempt.pending;
  try {
    await walkStages(onStage, signal, options.timing.stageMs);
    throwIfAborted(signal);
  } catch (e) {
    throw unscored(e, attempt);
  }
  const { activeFaults, ...result } = await mockGrade(slug, p.v || p.n, p.prompt);
  return commitRun(slug, attempt, { prompt: p.prompt, model: p.model, html: p.html, result, n: p.n });
}

async function readHtmlStream(res, onHtml, signal) {
  if (!res.body || !res.body.getReader) {
    const text = await res.text();
    throwIfAborted(signal);
    if (onHtml) onHtml(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  // Cancel ends a stalled read at once.
  const onAbort = () => {
    try {
      reader.cancel().catch(() => {});
    } catch {
      // Already closed.
    }
  };
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (onHtml) onHtml(html);
    }
    throwIfAborted(signal);
    html += decoder.decode();
  } catch (e) {
    onAbort();
    if (isAbort(e) || (signal && signal.aborted)) throw cancelledWriting();
    const msg = "The page stopped streaming before it finished. Your prompt count did not change, so run it again.";
    throw apiError(msg, { userMessage: msg });
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }
  return html;
}

const NO_MODEL = "No model is set up on the server yet, so pages cannot be generated. Try again later.";
const SCORER_BUSY = "The scorer is busy. Run again in a minute.";
const MODEL_BUSY = "The model is busy. Run again in a moment.";

function resetText(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "Your runs reset at midnight UTC.";
  const minutes = Math.max(1, Math.ceil(s / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `Your runs reset in ${m} min.`;
  return m ? `Your runs reset in ${h} h ${m} min.` : `Your runs reset in ${h} h.`;
}

// Errors from POST /api/runs, in plain words.
async function runError(res) {
  const body = await readBody(res);
  const text = body && typeof body.error === "string" ? body.error : "";
  if (res.status === 429) {
    const lead = text || "You have used today's runs.";
    return apiError(`${lead} ${resetText(res.headers.get("Retry-After"))}`, { status: 429 });
  }
  if (res.status === 400 && text) return apiError(text, { status: 400, userMessage: `${text} Your prompt is kept and your prompt count did not change.` });
  if (res.status === 501) return apiError(text || "This kind of challenge is not playable yet.", { status: 501, userMessage: `${text || "This kind of challenge is not playable yet."} Your prompt count did not change.` });
  if (res.status === 503 && body && body.code === "no_model") return apiError(NO_MODEL, { status: 503, code: "no_model" });
  if (res.status >= 500) return apiError(text || MODEL_BUSY, { status: res.status });
  return apiError(text || `The server could not start the run (${res.status}). Try again in a moment.`, { status: res.status });
}

// Errors from POST /api/runs/:id/score.
const NO_GRADER = "Scoring for this kind of challenge is not connected yet. Your answer is saved; score it later.";
async function scoreError(res) {
  const body = await readBody(res);
  if (res.status === 503 && body && body.code === "no_grader") return apiError(NO_GRADER, { status: 503, code: "no_grader" });
  const text = body && typeof body.error === "string" ? body.error : "";
  if (res.status === 502 || res.status === 503 || res.status === 504) return apiError(SCORER_BUSY, { status: res.status });
  return apiError(text || `Scoring did not finish (${res.status}). Run again.`, { status: res.status });
}

// Scores one run. The server reports no stages, so the labels move on a timer and hold on the
// last one until the answer arrives.
async function scoreLive(runId, onStage, signal) {
  const marks = options.timing.scoreStageMs || [0];
  let shown = -1;
  const show = (i) => {
    while (shown < i && shown < STAGES.length - 1) {
      shown++;
      if (onStage) onStage({ ...STAGES[shown], index: shown, total: STAGES.length });
    }
  };
  show(0);
  const timers = [];
  for (let i = 1; i < STAGES.length; i++) timers.push(setTimeout(() => show(i), marks[Math.min(i, marks.length - 1)] || 0));
  try {
    let res;
    try {
      res = await apiFetch(`/api/runs/${enc(runId)}/score`, { method: "POST", signal });
    } catch (e) {
      if (isAbort(e) || (signal && signal.aborted)) throw abortError();
      throw apiError("Lost the connection while scoring. Check your network and run again.", { status: 0 });
    }
    if (!res.ok) throw await scoreError(res);
    let body;
    try {
      body = await res.json();
    } catch (e) {
      if (isAbort(e) || (signal && signal.aborted)) throw abortError();
      throw apiError("The scorer sent back an answer that could not be read. Run again.");
    }
    throwIfAborted(signal);
    if (!body || !body.run || !body.run.result) throw apiError("The scorer sent back no result. Run again.");
    show(STAGES.length - 1);
    return body;
  } finally {
    timers.forEach(clearTimeout);
  }
}

// The attempt after a scored run: the known runs plus this one (read again when runs are missing).
async function attemptAfter(slug, serverAttempt, run, header) {
  const prev = liveAttempts.get(slug);
  const id = (serverAttempt && serverAttempt.id) || header.attemptId || (prev && prev.id);
  let runs = null;
  if (prev && prev.id === id) runs = prev.runs.filter((r) => r.n !== run.n).concat(run);
  else if (run.n === 1) runs = [run];
  else {
    try {
      const fresh = await readServerAttempt(slug);
      if (fresh && fresh.id === id) runs = fresh.runs.filter((r) => r.n !== run.n).concat(run);
    } catch {
      runs = null;
    }
  }
  if (!runs) runs = [run];
  runs.sort((a, b) => a.n - b.n);
  const base = serverAttempt
    ? fromServerAttempt(serverAttempt, runs)
    : { id, serverId: id, promptCount: header.promptCount || run.n, best: Math.max(prev && prev.best != null ? prev.best : -Infinity, run.result.total), runs, pending: null, startedAt: prev ? prev.startedAt : run.at };
  liveAttempts.set(slug, base);
  realSlugs.add(slug);
  return base;
}

async function liveRun(args) {
  const { slug, prompt, model, signal, onStage, onHtml } = args;
  let res;
  try {
    res = await apiFetch("/api/runs", { method: "POST", body: JSON.stringify({ slug, prompt, model }), signal });
  } catch (e) {
    if (isAbort(e) || (signal && signal.aborted)) throw abortError();
    throw apiError("Could not reach the server. Check your connection and run again.", { status: 0 });
  }
  if (!res.ok) {
    const err = await runError(res);
    if (err.code === "no_model") {
      markNoModels();
      // Nothing real yet for this challenge: simulate, labelled, instead of failing.
      if (!realSlugs.has(slug)) return mockRun(args);
    }
    throw err;
  }
  realSlugs.add(slug);
  const header = {
    runId: res.headers.get("X-Run-Id"),
    attemptId: res.headers.get("X-Attempt-Id"),
    promptCount: Number(res.headers.get("X-Prompt-Count")) || null,
  };
  const html = await readHtmlStream(res, onHtml, signal);
  if (signal && signal.aborted) throw cancelledWriting();
  if (!header.runId) throw apiError("The server did not say which run this was. Run again.");
  // The page is generated and saved: it counts as a prompt from here, scored or not.
  const prev = liveAttempts.get(slug);
  const n = header.promptCount || promptCountOf(prev) + 1;
  const attempt = prev && prev.id === header.attemptId
    ? { ...prev, runs: prev.runs.slice() }
    : { id: header.attemptId, serverId: header.attemptId, promptCount: 0, best: null, runs: [], startedAt: new Date().toISOString() };
  const kind = args.kind || "page";
  attempt.pending = { n, kind, prompt, model, html: kind === "doc" ? "" : html, markdown: kind === "doc" ? html : "", at: new Date().toISOString(), serverId: header.runId };
  attempt.promptCount = n;
  liveAttempts.set(slug, attempt);
  return liveScore(slug, attempt, { signal, onStage });
}

// Scores attempt.pending on the server; on failure the page stays saved and unscored.
async function liveScore(slug, attempt, { signal, onStage }) {
  const p = attempt.pending;
  let scored;
  try {
    scored = await scoreLive(p.serverId, onStage, signal);
  } catch (e) {
    throw unscored(e, attempt);
  }
  const run = fromServerRun({ kind: p.kind, ...scored.run }, (p.kind === "doc" ? p.markdown : p.html) || undefined);
  provisionalSeen = !!(run.result && run.result.provisional);
  dropPlayerData();
  const next = await attemptAfter(slug, scored.attempt, run, { attemptId: attempt.id, promptCount: attempt.promptCount });
  return { attempt: next, run };
}

// "Score this page": scores the current attempt's saved, unscored page (attempt.pending) with the
// usual stages. Returns { attempt, run } like run().
export async function scoreRun({ slug, signal, onStage } = {}) {
  throwIfAborted(signal);
  if (await storedLive()) {
    let a = liveAttempts.get(slug);
    if (!a || !a.pending) a = await readServerAttempt(slug).catch(() => null);
    if (a && a.pending) return liveScore(slug, a, { signal, onStage });
    if (realSlugs.has(slug) || (await runsLive())) throw apiError("There is no unscored page to score. Run a prompt first.");
  }
  const local = store.getAttempt(slug);
  if (!local || !local.pending) throw apiError("There is no unscored page to score. Run a prompt first.");
  return mockScore(slug, local, { signal, onStage });
}

export async function run({ slug, prompt, model, signal, onStage, onHtml } = {}) {
  throwIfAborted(signal);
  const text = String(prompt || "");
  if (!text.trim()) throw apiError("Write a prompt first, then run it.");
  const ch = await getChallenge(slug);
  if (ch.available === false) throw apiError(ch.unavailableReason || "This challenge is not playable yet.", { status: 501 });
  const args = { slug, kind: ch.kind || "page", prompt: text, model: model || ch.models[0].id, signal, onStage, onHtml };
  if (await storedLive()) {
    if (await runsLive()) {
      if (model && !ch.models.some((m) => m.id === model)) args.model = ch.models[0].id;
      return liveRun(args);
    }
    // Never mix a real attempt with simulated runs.
    if (realSlugs.has(slug)) throw apiError(NO_MODEL, { status: 503, code: "no_model" });
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
  const mock = () => mockLeaderboard(slug, bracket, period);
  const q = new URLSearchParams({ bracket, period });
  if (slug) q.set("slug", slug);
  const [live] = await Promise.all([
    whenLive(() => cachedGet(`boards:${q}`, FRESH.boards, `/api/leaderboards?${q}`)),
    slug ? findChallenge(slug) : null,
  ]);
  if (!live) return mock();
  let body;
  try {
    body = await live.req;
  } catch (e) {
    if (e.status >= 400 && e.status < 500) throw e;
    simulated.add("boards");
    return mock();
  }
  const you = body.you || null;
  if (body.provisional) boardsProvisional = true;
  const versions = Array.isArray(body.graderVersions) ? body.graderVersions.filter(Boolean) : [];
  if (versions.length > 1) boardsMixed = true;
  const rows = (body.rows || []).map((r) => ({
    rank: r.rank,
    username: r.username,
    promptCount: r.promptCount,
    score: r.score,
    isYou: !!r.isYou,
  }));
  return {
    rows,
    you: you ? { rank: you.rank, score: you.score, promptCount: you.promptCount ?? null } : null,
    counts: body.counts || {},
    kind: body.kind || (slug ? "score" : "points"),
    provisional: !!body.provisional,
    graderVersions: versions,
  };
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
  const live = await whenLive(() => getJson(`/api/users/${enc(name)}`));
  if (!live) return mock();
  const dataP = challengeData().catch(() => ({ challenges: [] }));
  let body;
  try {
    body = await live.req;
  } catch (e) {
    if (e.status === 404) throw apiError(`There is no player called "${name}". Check the spelling.`, { status: 404 });
    if (e.status >= 400 && e.status < 500) throw e;
    simulated.add("profile");
    return mock();
  }
  const data = await dataP;
  const solved = (body.solved || []).map((s) => {
    const c = data.challenges.find((x) => x.slug === s.slug);
    return { slug: s.slug, title: s.title || (c ? c.title : s.slug), best: s.best, promptCount: s.promptCount, when: s.when ? String(s.when).slice(0, 10) : null };
  });
  const t = body.totals || {};
  const computed = profileTotals(solved);
  const totals = { solved: t.solved ?? computed.solved, best: t.best ?? computed.best, averagePrompts: t.averagePrompts ?? computed.averagePrompts };
  if (Number.isFinite(t.points)) totals.points = t.points;
  if (Number.isFinite(t.level)) totals.level = t.level;
  return { username: body.username || name, joined: body.joined ? String(body.joined).slice(0, 10) : null, totals, solved };
}

// ---------------------------------------------------------------- auth

let meCache;
// Live points and level from /api/players/me for the signed-in player; cleared after a run or claim.
let statsCache;

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
    warnOnce("auth", "the accounts endpoint is not available, using local accounts.");
    return mockFn();
  }
  return onResponse(res);
}

// Points and level for the signed-in player from /api/players/me (live with a database), or null.
async function liveStats() {
  if (statsCache !== undefined) return statsCache;
  const live = await whenLive(() => cachedGet("me", FRESH.me, "/api/players/me"));
  if (!live) return null;
  try {
    const body = await live.req;
    statsCache = body && Number.isFinite(body.points) ? { points: body.points, level: Number.isFinite(body.level) ? body.level : levelFor(body.points) } : null;
  } catch {
    statsCache = null;
  }
  return statsCache;
}

// Returns { id, username, email, points, level } or null when not logged in.
// A 401 is the normal signed-out answer; the user is kept for the life of the page.
export async function me() {
  if (options.mode !== "live") return withStats(adopt(mockAuth.me()));
  let statsP = null;
  if (meCache === undefined) {
    const before = store.getPlayer();
    let u = null;
    if (!tabFlag("pd.signedOut")) {
      // Points start with the account check, not after it.
      statsP = quiet(liveStats());
      try {
        const res = await apiFetch("/api/auth/me", { method: "GET" });
        if (await isMissingRoute(res)) {
          warnOnce("auth", "the accounts endpoint is not available, using local accounts.");
          u = mockAuth.me();
        } else {
          if (res.status === 401) tabFlag("pd.signedOut", true);
          u = res.ok ? await userFrom(res) : null;
        }
      } catch {
        u = null;
      }
    }
    adopt(u);
    // Signed in since this browser last looked (another tab, or a cookie): move anonymous runs over.
    if (u && (!before || before.id !== u.id)) claimAttempts().catch(() => {});
  }
  if (!meCache) return null;
  const stats = await (statsP || liveStats()).catch(() => null);
  return withStats(stats ? { ...meCache, ...stats } : meCache);
}

export async function login({ email, password } = {}) {
  if (!email || !password) throw apiError("Email and password are required.", { status: 400 });
  const input = { email: String(email).trim(), password: String(password) };
  if (options.mode !== "live") return adopt(mockAuth.login(input));
  const user = await liveAuth("/api/auth/login", { method: "POST", body: JSON.stringify(input) }, () => mockAuth.login(input), userFrom);
  tabFlag("pd.signedOut", false);
  dropPlayerData();
  liveAttempts.clear();
  return adopt(user);
}

export async function signup({ username, email, password } = {}) {
  validateSignup({ username, email, password });
  const input = { username: String(username).trim(), email: String(email).trim(), password: String(password) };
  if (options.mode !== "live") return adopt(mockAuth.signup(input), { isNew: true });
  const user = await liveAuth("/api/auth/signup", { method: "POST", body: JSON.stringify(input) }, () => mockAuth.signup(input), userFrom);
  tabFlag("pd.signedOut", false);
  dropPlayerData();
  liveAttempts.clear();
  return adopt(user, { isNew: true });
}

export async function logout() {
  const wasLive = options.mode === "live";
  adopt(null);
  meCache = wasLive ? null : undefined;
  dropPlayerData();
  liveAttempts.clear();
  realSlugs.clear();
  if (!wasLive) return mockAuth.logout();
  tabFlag("pd.signedOut", true);
  try {
    const res = await apiFetch("/api/auth/logout", { method: "POST" });
    if (await isMissingRoute(res)) return mockAuth.logout();
  } catch {
    // The player is signed out on this browser either way.
  }
  return { ok: true };
}

// Moves this browser's anonymous runs onto the signed-in account: on the server (live with a
// database, POST /api/attempts/claim with the X-Anon-Id header) and in this browser. Returns { moved }.
export async function claimAttempts() {
  const u = store.getPlayer();
  if (!u) throw apiError("Log in first, then claim your runs.", { status: 401 });
  const pending = Number(store.read("claim.pending." + u.id, 0)) || 0;
  store.remove("claim.pending." + u.id);
  const moved = pending + store.moveAnonTo(u.id);
  if (!(await storedLive())) return { moved };
  try {
    const res = await apiFetch("/api/attempts/claim", { method: "POST", body: JSON.stringify({ anonId: store.getAnonId() }) });
    if (!res.ok) return { moved };
    const body = await res.json().catch(() => ({}));
    dropPlayerData();
    liveAttempts.clear();
    return { moved: Math.max(moved, Number(body.moved) || 0) };
  } catch {
    return { moved };
  }
}

// ---------------------------------------------------------------- lessons
// Lessons come from the server only. In mock mode, or with no server or no lessons, the list is
// empty and the page shows its "being written" state.

function fromServerLesson(l) {
  return {
    slug: String(l.slug),
    title: String(l.title || l.slug),
    level: Number(l.level) || 1,
    minutes: Number(l.minutes) || null,
    summary: String(l.summary || ""),
    bonusChallenge: l.bonusChallenge ? String(l.bonusChallenge) : null,
    order: Number(l.order) || 0,
  };
}

export async function listLessons() {
  const live = await whenLive(() => cachedGet("lessons", FRESH.lessons, "/api/lessons"), false);
  if (!live) return [];
  try {
    const body = await live.req;
    return (Array.isArray(body && body.lessons) ? body.lessons : []).filter((l) => l && l.slug).map(fromServerLesson).sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

const NO_LESSON = "That lesson is not here. Pick one from the lessons list.";

// { slug, title, level, minutes, summary, bonusChallenge, order, fields, markdown }
export async function getLesson(slug) {
  const name = String(slug || "").trim();
  if (!name) throw apiError(NO_LESSON, { status: 404 });
  const live = await whenLive(() => cachedGet(`lesson:${name}`, FRESH.lessons, `/api/lessons/${enc(name)}`), false);
  if (!live) throw apiError("Lessons are being written. Check back soon.", { status: 404 });
  let body;
  try {
    body = await live.req;
  } catch (e) {
    if (e.status === 404 || e.status === 400) throw apiError(NO_LESSON, { status: 404 });
    throw e;
  }
  const l = body && body.lesson;
  if (!l) throw apiError(NO_LESSON, { status: 404 });
  return { ...fromServerLesson(l), fields: l.fields && typeof l.fields === "object" ? { ...l.fields } : {}, markdown: String(l.markdown || "") };
}
