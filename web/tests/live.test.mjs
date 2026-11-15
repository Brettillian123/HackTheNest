// Live mode against the real server contract (backend/README.md), with a fake fetch.
// Run with: node --test "web/tests/*.test.mjs"
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as api from "../js/api.js";
import * as store from "../js/store.js";

const PROMPT = "Build a centred sign-in card, 400px wide, white, with a green Sign in button.";
const ANON_RE = /^[A-Za-z0-9_-]{16,64}$/;
const RUN_ID = "run_AAAAAAAAAAAAAAAA";
const RUN_ID_2 = "run_BBBBBBBBBBBBBBBB";
const ATT_ID = "att_CCCCCCCCCCCCCCCC";
const USER = { id: "665f1c2ab3d4e5f6a7b8c9d0", username: "test_raptor", email: "test@example.test" };

beforeEach(() => {
  store._resetForTests();
  api.configure({ mode: "live", fetch: null, timing: { streamMs: 0, stageMs: 0, scoreStageMs: [0, 2000, 6000, 12000] }, reset: true });
});

// ---------------------------------------------------------------- server shapes

const health = (over = {}) => ({ ok: true, db: true, models: ["openai-mini"], grader: "service", challenges: 6, problems: [], ...over });
const summary = (over = {}) => ({ slug: "login-card", title: "Sign-in card", level: 1, levelLabel: "Warm-up", brief: "A centred sign-in card.", solvedCount: 3, topScore: 88, yourBest: null, yourBestPrompts: null, ...over });
const challenge = () => ({
  challenge: {
    ...summary(),
    goalUrl: "/data/goals/login-card.html",
    viewport: { width: 1280, height: 800 },
    spec: [{ group: "Page", items: [{ label: "Background", value: "#F3F4F6" }] }],
    models: [{ id: "gemini-flash", label: "Gemini Flash", available: false }, { id: "openai-mini", label: "GPT mini", available: true }],
    simulated: false,
  },
  statsAvailable: true,
});
const result = (over = {}) => ({
  total: 82,
  delta: null,
  checks: [{ label: "Card is centred", passed: true }, { label: "Button colour", passed: false }, { label: "Card width", passed: false }],
  passedCount: 1,
  totalChecks: 3,
  costs: [{ points: 6, message: "Card is 360px wide, not 400px." }, { points: 12, message: "Button is blue, not green." }],
  rank: { before: null, after: 2 },
  provisional: false,
  ...over,
});
const attempt = (over = {}) => ({ id: ATT_ID, slug: "login-card", promptCount: 1, best: 82, bestPromptCount: 1, open: true, startedAt: "2026-11-15T08:00:00.000Z", ...over });
const serverRun = (over = {}) => ({ id: RUN_ID, n: 1, prompt: PROMPT, model: "openai-mini", status: "done", result: result(), at: "2026-11-15T08:00:05.000Z", ...over });

const enc = new TextEncoder();
function htmlStream(parts, { close = true } = {}) {
  return new ReadableStream({
    start(c) {
      parts.forEach((p) => c.enqueue(enc.encode(p)));
      if (close) c.close();
    },
  });
}
function runResponse(stream, { runId = RUN_ID, count = 1 } = {}) {
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "X-Run-Id": runId, "X-Attempt-Id": ATT_ID, "X-Prompt-Count": String(count) } });
}
// A fetch that never answers until the request is aborted.
function hang(init) {
  return new Promise((_, reject) => {
    const fail = () => reject(new DOMException("The operation was aborted.", "AbortError"));
    if (init.signal && init.signal.aborted) return fail();
    if (init.signal) init.signal.addEventListener("abort", fail, { once: true });
  });
}

// Routes keyed "METHOD /path" (query ignored); unknown routes get the router's 404.
function server(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(String(url), "http://x");
    const method = init.method || "GET";
    calls.push({ path: u.pathname, query: u.searchParams, method, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null, credentials: init.credentials });
    const h = routes[`${method} ${u.pathname}`];
    if (h) return h(init, u);
    return Response.json({ error: "API route not found." }, { status: 404 });
  };
  f.calls = calls;
  f.count = (path) => calls.filter((c) => c.path === path).length;
  return f;
}

function baseRoutes(over = {}) {
  return {
    "GET /api/health": () => Response.json(health()),
    "GET /api/auth/me": () => Response.json({ error: "Not logged in." }, { status: 401 }),
    "GET /api/challenges": () => Response.json({ challenges: [summary(), summary({ slug: "nav-hero", title: "Nav and hero", level: 2, levelLabel: "Core" })], statsAvailable: true }),
    "GET /api/challenges/login-card": () => Response.json(challenge()),
    "GET /api/attempts/current": () => Response.json({ attempt: null }),
    ...over,
  };
}

// ---------------------------------------------------------------- runs

test("a live run streams the page, then scores it while the stages move, and returns the client shapes", async () => {
  let scored = 0;
  const fetch = server(baseRoutes({
    "POST /api/runs": () => runResponse(htmlStream(["<!doctype html><html><body>", "<h1>Hi</h1></body></html>"])),
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": () => { scored++; return Response.json({ attempt: attempt(), run: serverRun() }); },
  }));
  api.configure({ fetch });
  assert.equal(await api.getAttempt("login-card"), null);
  const html = [];
  const stages = [];
  const { attempt: a, run } = await api.run({ slug: "login-card", prompt: PROMPT, model: "openai-mini", onHtml: (h) => html.push(h), onStage: (s) => stages.push(s) });

  const post = fetch.calls.find((c) => c.path === "/api/runs");
  assert.deepEqual(post.body, { slug: "login-card", prompt: PROMPT, model: "openai-mini" });
  assert.equal(post.credentials, "include");
  assert.match(post.headers["X-Anon-Id"], ANON_RE, "anonymous id fits the server rule");
  assert.equal(html.at(-1), "<!doctype html><html><body><h1>Hi</h1></body></html>");
  assert.equal(scored, 1);
  assert.deepEqual(stages.map((s) => s.label), ["Rendering", "Checking layout", "Comparing to goal", "Scoring"], "all stages, last one when the answer arrives");
  assert.ok(stages.every((s, i) => s.index === i && s.total === 4));

  assert.equal(run.n, 1);
  assert.equal(run.html, html.at(-1));
  assert.equal(run.serverId, RUN_ID);
  assert.equal(run.result.total, 82);
  assert.equal(run.result.delta, null);
  assert.deepEqual(run.result.costs.map((c) => c.points), [12, 6], "largest cost first");
  assert.equal(run.result.passedCount, 1);
  assert.equal(run.result.totalChecks, 3);
  assert.deepEqual(run.result.rank, { before: null, after: 2 });
  assert.equal(a.serverId, ATT_ID);
  assert.equal(a.promptCount, 1);
  assert.equal(a.best, 82);
  assert.equal(a.runs.length, 1);
  assert.equal(api.isSimulated("run"), false);
  assert.equal(api.isProvisional(), false, "full grader, final result");
  assert.equal(store.getAttempt("login-card"), null, "nothing simulated is saved on this browser");
});

test("a second run continues the server attempt; getAttempt reads the server; a failed run is discarded", async () => {
  const current = {
    ...attempt({ promptCount: 1 }),
    runs: [
      { ...serverRun(), html: "<p>one</p>" },
      { ...serverRun({ id: "run_DDDDDDDDDDDDDDDD", n: 2, status: "failed", result: null }), html: "" },
    ],
  };
  const fetch = server(baseRoutes({
    "GET /api/attempts/current": (init, u) => { assert.equal(u.searchParams.get("slug"), "login-card"); return Response.json({ attempt: current }); },
    "POST /api/runs": () => runResponse(htmlStream(["<p>three</p>"]), { runId: RUN_ID_2, count: 2 }),
    "POST /api/runs/run_BBBBBBBBBBBBBBBB/score": () => Response.json({
      attempt: attempt({ promptCount: 2, best: 90, bestPromptCount: 2 }),
      run: serverRun({ id: RUN_ID_2, n: 2, result: result({ total: 90, delta: 8, provisional: true, notice: "The grader was busy, so the stand-in scored this run." }) }),
    }),
  }));
  api.configure({ fetch });
  store.setAttempt("login-card", { id: "att_local", promptCount: 5, best: 50, runs: [] });
  const a0 = await api.getAttempt("login-card");
  assert.equal(a0.serverId, ATT_ID, "the server is the source of truth, not this browser");
  assert.equal(a0.promptCount, 1, "a failed run does not count (server rule)");
  assert.equal(a0.pending, null, "a failed run is not offered for scoring");
  assert.deepEqual(a0.runs.map((r) => r.n), [1]);
  assert.equal(a0.runs[0].html, "<p>one</p>");

  const { attempt: a, run } = await api.run({ slug: "login-card", prompt: PROMPT + " more" });
  assert.equal(run.n, 2);
  assert.equal(run.result.delta, 8);
  assert.equal(run.result.provisional, true);
  assert.match(run.result.notice, /stand-in/);
  assert.deepEqual(a.runs.map((r) => r.n), [1, 2]);
  assert.equal(a.promptCount, 2);
  assert.equal(a.best, 90);
  assert.equal(api.isProvisional(), true, "a provisional result shows the quiet note");
});

test("cancel during the stream stops at once and asks for no score", async () => {
  const fetch = server(baseRoutes({
    "POST /api/runs": () => runResponse(htmlStream(["<html><body>"], { close: false })),
  }));
  api.configure({ fetch });
  const ctrl = new AbortController();
  const p = api.run({ slug: "login-card", prompt: PROMPT, signal: ctrl.signal, onHtml: () => setTimeout(() => ctrl.abort(), 5) });
  await assert.rejects(p, { name: "AbortError" });
  assert.equal(fetch.calls.filter((c) => c.path.endsWith("/score")).length, 0);
});

test("cancel during scoring rejects with AbortError after the stages hold on the last one", async () => {
  const stages = [];
  const fetch = server(baseRoutes({
    "POST /api/runs": () => runResponse(htmlStream(["<p>x</p>"])),
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": (init) => hang(init),
  }));
  api.configure({ fetch, timing: { scoreStageMs: [0, 1, 2, 3] } });
  const ctrl = new AbortController();
  const p = api.run({
    slug: "login-card", prompt: PROMPT, signal: ctrl.signal,
    onStage: (s) => { stages.push(s.label); if (s.index === 3) setTimeout(() => ctrl.abort(), 20); },
  });
  await assert.rejects(p, { name: "AbortError" });
  assert.deepEqual(stages, ["Rendering", "Checking layout", "Comparing to goal", "Scoring"], "held on Scoring until cancelled");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(stages.length, 4, "no stage after cancel");
});

test("429 says the daily cap is reached and when it resets", async () => {
  const fetch = server(baseRoutes({
    "POST /api/runs": () => Response.json({ error: "You have used today's 30 free runs. Sign up or come back tomorrow." }, { status: 429, headers: { "Retry-After": "3700" } }),
  }));
  api.configure({ fetch });
  await assert.rejects(api.run({ slug: "login-card", prompt: PROMPT }), (e) => e.status === 429 && /30 free runs/.test(e.message) && /reset in 1 h 2 min/.test(e.message));
  assert.equal(store.getAttempt("login-card"), null, "no simulated run instead");
});

test("503 no_model: simulated (labelled) when nothing is real yet, a plain error once the challenge has real runs", async () => {
  const fetch = server(baseRoutes({
    "POST /api/runs": () => Response.json({ error: "No model is set up on the server yet, so runs are simulated.", code: "no_model" }, { status: 503 }),
  }));
  api.configure({ fetch });
  const { run } = await api.run({ slug: "login-card", prompt: PROMPT });
  assert.ok(run.result.total > 0, "fell back to a simulated run");
  assert.equal(api.isSimulated("run"), true);
  assert.equal(await api.probeRun(), true);

  // Same server, but this challenge already has real runs on it.
  api.configure({ reset: true, fetch: server(baseRoutes({
    "GET /api/attempts/current": () => Response.json({ attempt: { ...attempt(), runs: [{ ...serverRun(), html: "<p>one</p>" }] } }),
    "POST /api/runs": () => Response.json({ error: "No model is set up on the server yet, so runs are simulated.", code: "no_model" }, { status: 503 }),
  })) });
  store._resetForTests();
  assert.equal((await api.getAttempt("login-card")).runs.length, 1);
  await assert.rejects(api.run({ slug: "login-card", prompt: PROMPT }), (e) => e.code === "no_model" && /No model is set up/.test(e.message));
  assert.equal(store.getAttempt("login-card"), null, "never mixed with simulated runs");
});

test("scorer busy and network down give plain messages", async () => {
  api.configure({ fetch: server(baseRoutes({
    "POST /api/runs": () => runResponse(htmlStream(["<p>x</p>"])),
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": () => new Response("<html>Gateway timeout</html>", { status: 504 }),
  })) });
  await assert.rejects(api.run({ slug: "login-card", prompt: PROMPT }), /scorer is busy/);

  const routes = baseRoutes();
  const f = server(routes);
  const down = async (url, init) => { if (String(url).endsWith("/api/runs")) throw new TypeError("Failed to fetch"); return f(url, init); };
  api.configure({ reset: true, fetch: down });
  await assert.rejects(api.run({ slug: "login-card", prompt: PROMPT }), (e) => e.status === 0 && /Could not reach the server/.test(e.message));
});

// ---------------------------------------------------------------- health-driven fallbacks

test("health is asked once per page; no database means demo data for stored things and simulated runs", async () => {
  const fetch = server(baseRoutes({ "GET /api/health": () => Response.json(health({ ok: false, db: false })) }));
  api.configure({ fetch });
  const list = await api.listChallenges();
  assert.ok(list.length >= 6, "challenges from the bundled data");
  assert.equal(api.isSimulated("boards"), true);
  assert.equal(api.isSimulated("profile"), true);
  assert.equal(await api.probeRun(), true);
  assert.ok((await api.getLeaderboard("login-card")).rows.length > 0);
  await api.run({ slug: "login-card", prompt: PROMPT });
  assert.ok(store.getAttempt("login-card"), "simulated attempt stays on this browser");
  assert.equal(api.isProvisional(), false, "simulated runs show the preview note, not the provisional one");
  assert.equal(fetch.count("/api/health"), 1);
  for (const p of ["/api/challenges", "/api/leaderboards", "/api/runs", "/api/attempts/current"]) assert.equal(fetch.count(p), 0, p);
});

test("no models: runs are simulated, but challenges, boards and profiles are real", async () => {
  const fetch = server(baseRoutes({
    "GET /api/health": () => Response.json(health({ models: [] })),
    "GET /api/leaderboards": (init, u) => {
      assert.equal(u.searchParams.get("slug"), "login-card");
      assert.equal(u.searchParams.get("bracket"), "3-5");
      assert.equal(u.searchParams.get("period"), "week");
      return Response.json({ rows: [{ rank: 1, username: "real_one", promptCount: 4, score: 91, isYou: false }, { rank: 2, username: "test_raptor", promptCount: 3, score: 80, isYou: true }], you: { rank: 2, score: 80, promptCount: 3 }, counts: { "3-5": 2 }, kind: "score" });
    },
    "GET /api/users/real_one": () => Response.json({ username: "real_one", joined: "2026-11-14T10:00:00.000Z", totals: { solved: 1, best: 91, averagePrompts: 4, points: 91, level: 1 }, solved: [{ slug: "login-card", title: "Sign-in card", best: 91, promptCount: 4, when: "2026-11-14T11:00:00.000Z" }] }),
    "GET /api/users/nobody_here": () => Response.json({ error: "There is no player with that name." }, { status: 404 }),
  }));
  api.configure({ fetch });
  const list = await api.listChallenges();
  assert.deepEqual(list.map((c) => c.slug), ["login-card", "nav-hero"], "from the server");
  assert.equal(list[0].topScore, 88);
  const c = await api.getChallenge("login-card");
  assert.deepEqual(c.models.map((m) => m.id), ["openai-mini"], "only models that can run");
  assert.equal(c.solvedCount, 3);
  const lb = await api.getLeaderboard("login-card", { bracket: "3-5", period: "week" });
  assert.deepEqual(lb.you, { rank: 2, score: 80, promptCount: 3 });
  assert.equal(lb.rows.filter((r) => r.isYou).length, 1);
  const p = await api.getProfile("real_one");
  assert.equal(p.joined, "2026-11-14");
  assert.deepEqual(p.solved[0], { slug: "login-card", title: "Sign-in card", best: 91, promptCount: 4, when: "2026-11-14" });
  assert.equal(p.totals.solved, 1);
  await assert.rejects(api.getProfile("nobody_here"), (e) => e.status === 404 && /no player/.test(e.message));
  assert.equal(api.isSimulated("boards"), false);
  assert.equal(api.isSimulated("profile"), false);
  assert.equal(await api.probeRun(), true);
  assert.equal(api.isSimulated("run"), true);
  await api.run({ slug: "login-card", prompt: PROMPT });
  assert.equal(fetch.count("/api/runs"), 0);
});

test("stand-in grader: real runs carry the provisional note; an unreachable server falls back to mock", async () => {
  api.configure({ fetch: server(baseRoutes({ "GET /api/health": () => Response.json(health({ grader: "standin" })) })) });
  assert.equal(await api.probeRun(), false);
  assert.equal(api.isProvisional(), true);
  assert.equal(api.isSimulated("run"), false);

  api.configure({ reset: true, fetch: async () => { throw new TypeError("Failed to fetch"); } });
  assert.equal(await api.probeRun(), true);
  assert.equal(api.isProvisional(), false);
  assert.ok((await api.listChallenges()).length >= 6);
  assert.equal(api.isSimulated("boards"), true);
});

// ---------------------------------------------------------------- accounts

test("log in then claim moves anonymous runs on the server; nav points come from /api/players/me", async () => {
  const fetch = server(baseRoutes({
    "POST /api/auth/login": () => Response.json({ user: USER }),
    "POST /api/attempts/claim": () => Response.json({ moved: 2 }),
    "GET /api/players/me": () => Response.json({ user: USER, points: 172, level: 2, bests: { "login-card": 90, "nav-hero": 82 } }),
  }));
  api.configure({ fetch });
  const anon = store.getAnonId();
  assert.equal((await api.login({ email: USER.email, password: "longenough" })).id, USER.id);
  assert.deepEqual(await api.claimAttempts(), { moved: 2 });
  const claim = fetch.calls.find((c) => c.path === "/api/attempts/claim");
  assert.equal(claim.method, "POST");
  assert.equal(claim.headers["X-Anon-Id"], anon);
  assert.equal(claim.credentials, "include");
  const m = await api.me();
  assert.equal(m.username, USER.username);
  assert.equal(m.points, 172);
  assert.equal(m.level, 2);
});

test("a sign-in seen by me() (another tab or a cookie) claims this browser's anonymous runs once", async () => {
  const fetch = server(baseRoutes({
    "GET /api/auth/me": () => Response.json({ user: USER }),
    "POST /api/attempts/claim": () => Response.json({ moved: 1 }),
    "GET /api/players/me": () => Response.json({ user: USER, points: 90, level: 1, bests: {} }),
  }));
  api.configure({ fetch });
  assert.equal((await api.me()).points, 90);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(fetch.count("/api/attempts/claim"), 1);
  api.configure({ reset: true, fetch });
  await api.me();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(fetch.count("/api/attempts/claim"), 1, "same player on the next page: no new claim");
});

test("start over closes the server attempt", async () => {
  const fetch = server(baseRoutes({ "POST /api/attempts/start-over": () => Response.json({ ok: true, closed: 1 }) }));
  api.configure({ fetch });
  assert.equal(await api.startOver("login-card"), null);
  assert.deepEqual(fetch.calls.find((c) => c.path === "/api/attempts/start-over").body, { slug: "login-card" });
});

test("the anonymous id always fits the server's X-Anon-Id rule", () => {
  store.write("anonId", "bad id!");
  assert.match(store.getAnonId(), ANON_RE);
  store.write("anonId", "short");
  assert.match(store.getAnonId(), ANON_RE);
  const id = store.getAnonId();
  assert.equal(store.getAnonId(), id, "kept once valid");
});

// ---------------------------------------------------------------- follow-up contract: page code, unscored runs, prompt count

const CANCEL_WRITING = "Run cancelled. Your prompt count did not change.";
const CANCEL_SCORING = "Scoring cancelled. The page is saved and counts as a prompt; score it to see the result.";
const SCORE_FAILED = "Scoring failed. Your page is saved; score it again.";

test("400 for page code in the prompt shows the server's message and counts nothing", async () => {
  const msg = "Describe the page in your own words. Prompts cannot contain page code.";
  const fetch = server(baseRoutes({ "POST /api/runs": () => Response.json({ error: msg }, { status: 400 }) }));
  api.configure({ fetch });
  await assert.rejects(api.run({ slug: "login-card", prompt: "<div><p>copied</p></div>" }), (e) => e.status === 400 && e.message === msg && e.userMessage.startsWith(msg) && !e.attempt);
  assert.equal(fetch.calls.filter((c) => c.path.endsWith("/score")).length, 0);
  assert.equal(store.getAttempt("login-card"), null);
});

test("502 from the scorer keeps the page saved and unscored; scoreRun scores it without generating again", async () => {
  let fail = true;
  const fetch = server(baseRoutes({
    "POST /api/runs": () => runResponse(htmlStream(["<p>saved page</p>"])),
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": () => (fail ? Response.json({ error: "The grader could not grade this page." }, { status: 502 }) : Response.json({ attempt: attempt(), run: serverRun() })),
  }));
  api.configure({ fetch });
  let err;
  await api.run({ slug: "login-card", prompt: PROMPT }).catch((e) => { err = e; });
  assert.equal(err.message, SCORE_FAILED);
  assert.equal(err.userMessage, SCORE_FAILED);
  assert.equal(err.attempt.promptCount, 1, "the generated page counts");
  assert.deepEqual([err.attempt.pending.n, err.attempt.pending.serverId, err.attempt.pending.html], [1, RUN_ID, "<p>saved page</p>"]);
  assert.equal(err.attempt.runs.length, 0);

  fail = false;
  const stages = [];
  const { attempt: a, run } = await api.scoreRun({ slug: "login-card", onStage: (s) => stages.push(s.label) });
  assert.equal(fetch.count("/api/runs"), 1, "not generated again");
  assert.equal(stages.at(-1), "Scoring");
  assert.equal(run.result.total, 82);
  assert.equal(run.html, "<p>saved page</p>");
  assert.equal(a.pending, null);
  assert.deepEqual(a.runs.map((r) => r.n), [1]);
});

test("live prompt count: cancel while writing changes nothing; cancel while scoring keeps the page as a prompt", async () => {
  api.configure({ fetch: server(baseRoutes({ "POST /api/runs": () => runResponse(htmlStream(["<p>"], { close: false })) })) });
  const c1 = new AbortController();
  await assert.rejects(api.run({ slug: "login-card", prompt: PROMPT, signal: c1.signal, onHtml: () => setTimeout(() => c1.abort(), 5) }), (e) => e.name === "AbortError" && e.userMessage === CANCEL_WRITING && !e.attempt);

  api.configure({ reset: true, fetch: server(baseRoutes({
    "POST /api/runs": () => runResponse(htmlStream(["<p>x</p>"])),
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": (init) => hang(init),
  })) });
  const c2 = new AbortController();
  await assert.rejects(api.run({ slug: "login-card", prompt: PROMPT, signal: c2.signal, onStage: () => setTimeout(() => c2.abort(), 5) }),
    (e) => e.name === "AbortError" && e.userMessage === CANCEL_SCORING && e.attempt.promptCount === 1 && e.attempt.pending.n === 1);
});

test("mock mode follows the same prompt-count rule and can score a saved page later", async () => {
  api.configure({ mode: "mock", timing: { streamMs: 200, stageMs: 200 } });
  const c1 = new AbortController();
  setTimeout(() => c1.abort(), 30);
  await assert.rejects(api.run({ slug: "login-card", prompt: PROMPT, signal: c1.signal }), (e) => e.userMessage === CANCEL_WRITING);
  assert.equal(await api.getAttempt("login-card"), null, "nothing saved, count unchanged");

  api.configure({ timing: { streamMs: 0 } });
  const c2 = new AbortController();
  let err;
  await api.run({ slug: "login-card", prompt: PROMPT, signal: c2.signal, onStage: () => setTimeout(() => c2.abort(), 5) }).catch((e) => { err = e; });
  assert.equal(err.userMessage, CANCEL_SCORING);
  const saved = await api.getAttempt("login-card");
  assert.equal(saved.promptCount, 1);
  assert.equal(saved.pending.n, 1);
  assert.equal(saved.runs.length, 0);

  api.configure({ timing: { stageMs: 0 } });
  const { attempt: a, run } = await api.scoreRun({ slug: "login-card" });
  assert.equal(run.n, 1);
  assert.equal(a.pending, null);
  assert.equal(a.promptCount, 1);
  const next = await api.run({ slug: "login-card", prompt: PROMPT + " more" });
  assert.equal(next.run.n, 2);
  assert.equal(next.attempt.promptCount, 2);
  await assert.rejects(api.scoreRun({ slug: "login-card" }), /no unscored page/);
});

test("getAttempt offers the latest unscored page for scoring", async () => {
  const fetch = server(baseRoutes({
    "GET /api/attempts/current": () => Response.json({ attempt: { ...attempt({ promptCount: 2, best: 82 }), runs: [{ ...serverRun(), html: "<p>one</p>" }, { ...serverRun({ id: RUN_ID_2, n: 2, result: null }), html: "<p>two</p>" }] } }),
    "POST /api/runs/run_BBBBBBBBBBBBBBBB/score": () => Response.json({ attempt: attempt({ promptCount: 2, best: 90 }), run: serverRun({ id: RUN_ID_2, n: 2, result: result({ total: 90, delta: 8 }) }) }),
  }));
  api.configure({ fetch });
  const a = await api.getAttempt("login-card");
  assert.deepEqual(a.runs.map((r) => r.n), [1]);
  assert.deepEqual([a.pending.n, a.pending.html, a.pending.serverId], [2, "<p>two</p>", RUN_ID_2]);
  const { attempt: b, run } = await api.scoreRun({ slug: "login-card" });
  assert.equal(run.result.delta, 8);
  assert.equal(run.html, "<p>two</p>");
  assert.deepEqual(b.runs.map((r) => r.n), [1, 2]);
  assert.equal(b.best, 90);
});

test("provisional results are graded again once, quietly, when the grader service is connected", async () => {
  let rescores = 0;
  const current = () => Response.json({ attempt: { ...attempt(), runs: [{ ...serverRun({ result: result({ total: 70, provisional: true }) }), html: "<p>one</p>" }] } });
  const fetch = server(baseRoutes({
    "GET /api/attempts/current": current,
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": () => { rescores++; return Response.json({ attempt: attempt({ best: 85 }), run: serverRun({ result: result({ total: 85 }) }) }); },
  }));
  api.configure({ fetch });
  const a = await api.getAttempt("login-card");
  assert.equal(a.runs[0].result.total, 70, "shown at once");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(rescores, 1);
  assert.equal(a.runs[0].result.total, 85, "replaced in place");
  assert.equal(a.runs[0].result.provisional, false);
  assert.equal(a.best, 85);
  assert.equal(api.isProvisional(), false);
  await api.getAttempt("login-card");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(rescores, 1, "once per run");

  api.configure({ reset: true, fetch: server(baseRoutes({
    "GET /api/health": () => Response.json(health({ grader: "standin" })),
    "GET /api/attempts/current": current,
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": () => { rescores++; return Response.json({}); },
  })) });
  await api.getAttempt("login-card");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(rescores, 1, "no re-grade while only the stand-in exists");
  assert.equal(api.isProvisional(), true);
});

test("a board built from stand-in scores is flagged provisional", async () => {
  api.configure({ fetch: server(baseRoutes({
    "GET /api/leaderboards": () => Response.json({ rows: [{ rank: 1, username: "real_one", promptCount: 1, score: 90, isYou: false }], you: null, counts: { all: 1 }, kind: "score", provisional: true }),
  })) });
  assert.equal(api.isProvisional("boards"), false);
  const lb = await api.getLeaderboard("login-card");
  assert.equal(lb.provisional, true);
  assert.equal(api.isProvisional("boards"), true);
  api.configure({ mode: "mock", reset: true });
  await api.getLeaderboard("login-card");
  assert.equal(api.isProvisional("boards"), false, "never in mock mode");
});

test("each 429 cap shows the server's own message and when it resets", async () => {
  const caps = [
    ["You have used today's 30 runs. Come back tomorrow.", "120", /reset in 2 min/],
    ["This network has used today's 30 runs. Come back tomorrow.", "7200", /reset in 2 h\./],
    ["The site has used today's runs for everyone. Come back tomorrow.", "", /midnight UTC/],
  ];
  for (const [msg, retry, when] of caps) {
    const headers = retry ? { "Retry-After": retry } : {};
    api.configure({ reset: true, fetch: server(baseRoutes({ "POST /api/runs": () => Response.json({ error: msg }, { status: 429, headers }) })) });
    await assert.rejects(api.run({ slug: "login-card", prompt: PROMPT }), (e) => e.status === 429 && e.message.startsWith(msg) && when.test(e.message));
  }
});
