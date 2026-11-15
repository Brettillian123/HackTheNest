// Live-mode GET cache (stale-while-revalidate in sessionStorage) and parallel requests.
// Run with: node --test "web/tests/*.test.mjs"
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as api from "../js/api.js";
import * as store from "../js/store.js";

// A sessionStorage stand-in for node.
class FakeStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
globalThis.sessionStorage = new FakeStorage();

const BASE = "http://t";
const health = { ok: true, db: true, models: ["openai-mini"], grader: "service", challenges: 6, problems: [] };
const summary = (over = {}) => ({ slug: "login-card", title: "Sign-in card", level: 1, levelLabel: "Warm-up", brief: "A card.", solvedCount: 3, topScore: 88, yourBest: null, yourBestPrompts: null, ...over });
const detail = () => ({
  challenge: { ...summary(), viewport: { width: 1280, height: 800 }, spec: [], models: [{ id: "openai-mini", label: "GPT mini", available: true }] },
  statsAvailable: true,
});
const tick = () => new Promise((r) => setTimeout(r, 0));

// Fake fetch: routes by "METHOD /path", records every call in order.
function server(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(url, BASE);
    const key = `${init.method || "GET"} ${u.pathname}`;
    calls.push(key);
    const h = routes[key];
    if (!h) return Response.json({ error: "API route not found." }, { status: 404 });
    return h(u, init);
  };
  f.calls = calls;
  return f;
}

beforeEach(() => {
  store._resetForTests();
  globalThis.sessionStorage.clear();
  api.configure({ mode: "live", base: BASE, fetch: null, timing: { streamMs: 0, stageMs: 0, scoreStageMs: [0, 0, 0, 0] }, reset: true });
});

test("with health known, health refresh, account, points and challenge start together", async () => {
  let releaseAuth;
  const authGate = new Promise((r) => { releaseAuth = r; });
  const fetch = server({
    "GET /api/health": () => Response.json(health),
    "GET /api/challenges/login-card": () => Response.json(detail()),
    "GET /api/auth/me": async () => { await authGate; return Response.json({ error: "Not signed in." }, { status: 401 }); },
    "GET /api/players/me": () => Response.json({ user: null, points: 0, level: 1, bests: {} }),
  });
  api.configure({ fetch });
  // Health known from an earlier page, but stale: served at once and refreshed in the background.
  globalThis.sessionStorage.setItem("pd.swr.health", JSON.stringify({ at: Date.now() - 5 * 60e3, base: BASE, value: { reachable: true, db: true, models: ["openai-mini"], grader: "service" } }));
  const meP = api.me();
  const chP = api.getChallenge("login-card");
  await tick();
  assert.deepEqual(fetch.calls.slice().sort(), ["GET /api/auth/me", "GET /api/challenges/login-card", "GET /api/health", "GET /api/players/me"], "all four requested before the account check answered");
  releaseAuth();
  assert.equal(await meP, null);
  assert.equal((await chP).slug, "login-card");
});

test("a tab's first call asks health first, then the data", async () => {
  const fetch = server({
    "GET /api/health": () => Response.json(health),
    "GET /api/challenges": () => Response.json({ challenges: [summary()], statsAvailable: true }),
  });
  api.configure({ fetch });
  await api.listChallenges();
  assert.deepEqual(fetch.calls, ["GET /api/health", "GET /api/challenges"]);
});

test("a cached list is returned without a network call", async () => {
  const fetch = server({
    "GET /api/health": () => Response.json(health),
    "GET /api/challenges": () => Response.json({ challenges: [summary()], statsAvailable: true }),
  });
  api.configure({ fetch });
  await api.listChallenges();
  const before = fetch.calls.length;
  const again = await api.listChallenges();
  assert.equal(fetch.calls.length, before, "no new request");
  assert.equal(again[0].topScore, 88);
});

test("a stale value is returned at once while a background refresh runs", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const fetch = server({
    "GET /api/health": () => Response.json(health),
    "GET /api/challenges": async () => { await gate; return Response.json({ challenges: [summary({ topScore: 99 })], statsAvailable: true }); },
  });
  api.configure({ fetch });
  const old = { at: Date.now() - 10 * 60e3, base: BASE, value: { challenges: [summary({ topScore: 50 })], statsAvailable: true } };
  globalThis.sessionStorage.setItem("pd.swr.challenges", JSON.stringify(old));
  const list = await api.listChallenges(); // resolves while the refresh is still held
  assert.equal(list[0].topScore, 50, "stale value served");
  assert.ok(fetch.calls.includes("GET /api/challenges"), "refresh started");
  release();
  await tick();
  await tick();
  const saved = JSON.parse(globalThis.sessionStorage.getItem("pd.swr.challenges"));
  assert.equal(saved.value.challenges[0].topScore, 99, "next call is fresh");
  assert.equal((await api.listChallenges())[0].topScore, 99);
});

test("a scored run clears the cached challenge data and boards", async () => {
  const RUN = "run_AAAAAAAAAAAAAAAA";
  const ATT = "att_CCCCCCCCCCCCCCCC";
  const fetch = server({
    "GET /api/health": () => Response.json(health),
    "GET /api/challenges": () => Response.json({ challenges: [summary()], statsAvailable: true }),
    "GET /api/challenges/login-card": () => Response.json(detail()),
    "GET /api/leaderboards": () => Response.json({ rows: [], you: null, counts: {}, kind: "score" }),
    "POST /api/runs": () => new Response("<html><body>ok</body></html>", { status: 200, headers: { "Content-Type": "text/html", "X-Run-Id": RUN, "X-Attempt-Id": ATT, "X-Prompt-Count": "1" } }),
    [`POST /api/runs/${RUN}/score`]: () => Response.json({
      run: { id: RUN, n: 1, prompt: "Build a sign-in card please", model: "openai-mini", status: "done", result: { total: 82, checks: [], costs: [], provisional: false }, at: "2026-11-15T08:00:05.000Z" },
      attempt: { id: ATT, promptCount: 1, best: 82, startedAt: "2026-11-15T08:00:00.000Z" },
    }),
  });
  api.configure({ fetch });
  await api.listChallenges();
  await api.getLeaderboard("login-card");
  const ss = globalThis.sessionStorage;
  assert.ok(ss.getItem("pd.swr.challenges"));
  assert.ok([...ss.m.keys()].some((k) => k.startsWith("pd.swr.boards:")));
  await api.run({ slug: "login-card", prompt: "Build a sign-in card please" });
  assert.equal(ss.getItem("pd.swr.challenges"), null);
  assert.equal(ss.getItem("pd.swr.challenge:login-card"), null);
  assert.ok(![...ss.m.keys()].some((k) => k.startsWith("pd.swr.boards:")));
  assert.ok(ss.getItem("pd.swr.health"), "health is kept");
  const before = fetch.calls.filter((c) => c === "GET /api/challenges").length;
  await api.listChallenges();
  assert.equal(fetch.calls.filter((c) => c === "GET /api/challenges").length, before + 1, "fetched again");
});
