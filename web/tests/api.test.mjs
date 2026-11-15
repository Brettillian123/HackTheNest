// Run with: node --test web/tests/
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as api from "../js/api.js";
import * as store from "../js/store.js";
import { modeFor } from "../js/config.js";

const FAST = { streamMs: 0, stageMs: 0, pollMs: 0 };
const faults = JSON.parse(readFileSync(new URL("../mock/faults.json", import.meta.url), "utf8"));
const PROMPT = "Build a centred sign-in card, 400px wide, white, with a green Sign in button.";
const ORIGINAL = ["login-card", "footer-columns", "nav-hero", "blog-header", "pricing-plans", "product-grid"];

beforeEach(() => {
  store._resetForTests();
  api.configure({ mode: "mock", fetch: null, timing: FAST, reset: true });
});

test("listChallenges returns at least 6 challenges over three levels", async () => {
  const list = await api.listChallenges();
  assert.ok(list.length >= 6);
  assert.deepEqual([...new Set(list.map((c) => c.level))].sort(), [1, 2, 3]);
  for (const c of list) {
    for (const k of ["slug", "title", "levelLabel", "brief"]) assert.equal(typeof c[k], "string", k);
    assert.ok(c.solvedCount > 0);
    assert.ok(c.topScore >= 90 && c.topScore <= 120, `top score ${c.topScore}`); // scores run to 120 since the bonus rule
    assert.equal(c.yourBest, null);
  }
});

test("getChallenge has goal, viewport, models and a factual spec", async () => {
  for (const { slug } of await api.listChallenges()) {
    const c = await api.getChallenge(slug);
    assert.equal(c.slug, slug);
    assert.deepEqual(c.viewport, { width: 1280, height: 800 });
    assert.ok(c.models.length >= 1 && c.models.every((m) => m.id && m.label));
    const goalPath = fileURLToPath(c.goalUrl);
    assert.ok(existsSync(goalPath), `goal file for ${slug}`);
    const goal = readFileSync(goalPath, "utf8");
    assert.ok(!/<script/i.test(goal), "no scripts in goal");
    if (c.format === "brief") {
      // A brief challenge has no spec; every key fact is an exact text on the example page.
      assert.equal(c.spec, undefined, `${slug}: no spec on a brief challenge`);
      assert.equal("exactSpec" in c, false, `${slug}: the grader-only spec never reaches the page`);
      assert.ok(c.brief.trim() && c.requirements.length >= 6 && c.designNotes.length >= 3, `${slug}: brief fields`);
      assert.ok(c.requirements.every((r) => api.REQUIREMENT_KINDS.includes(r.kind)), `${slug}: requirement kinds`);
      if (ORIGINAL.includes(slug)) assert.ok(c.keyFacts.length > 0, `${slug}: rewritten original has key facts`);
      // Compared with the page's text: entities decoded, runs of white space as one space.
      const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", hellip: "…", middot: "·", times: "×", pound: "£", euro: "€" };
      const flat = (t) => t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m).replace(/\s+/g, " ");
      // The page text: tags removed (a line break counts as a space), so a fact split by <br> or <em> still counts.
      // Text a player sees in attributes (placeholder, value, alt, aria-label, title) counts too.
      const attrText = [...goal.matchAll(/\s(?:placeholder|value|alt|aria-label|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2]);
      const text = flat([goal.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""), ...attrText].join(" \n "));
      for (const k of c.keyFacts) assert.ok(text.includes(flat(k)), `${slug}: key fact "${k}" not in example`);
      for (const f of faults.challenges[slug] || []) assert.ok(goal.includes(f.find), `${slug}: fault "${f.check}" does not match`);
      continue;
    }
    assert.equal(c.format, "spec");
    const groups = c.spec.map((g) => g.group);
    assert.ok(groups.length >= 2, `${slug}: at least two spec groups`);
    assert.ok(groups.every((g) => typeof g === "string" && g.trim()), `${slug}: group names`);
    assert.equal(new Set(groups).size, groups.length, `${slug}: unique group names`);
    for (const g of c.spec) {
      assert.ok(g.items.length > 0);
      for (const it of g.items) {
        assert.ok(typeof it.label === "string" && it.label.trim(), "label");
        assert.ok(typeof it.value === "string" && it.value.trim(), `value for ${it.label}`);
      }
    }
    // Every colour named in the spec appears in the goal page.
    const colours = JSON.stringify(c.spec).match(/#[0-9A-F]{6}/g) || [];
    for (const col of colours) assert.ok(goal.includes(col), `${slug}: ${col} not in goal`);
    // Every mock fault edits something that really is in the goal.
    for (const f of faults.challenges[slug] || []) assert.ok(goal.includes(f.find), `${slug}: fault "${f.check}" does not match`);
  }
  await assert.rejects(api.getChallenge("nope"), /no challenge/);
});

test("a full mock run streams html, walks four stages and returns a consistent result", async () => {
  const html = [];
  const stages = [];
  const { attempt, run } = await api.run({
    slug: "login-card",
    prompt: PROMPT,
    model: "openai-mini",
    onHtml: (h) => html.push(h),
    onStage: (s) => stages.push(s),
  });
  assert.ok(html.length > 5, "several html chunks");
  for (let i = 1; i < html.length; i++) assert.ok(html[i].length >= html[i - 1].length);
  assert.match(html.at(-1), /<\/html>\s*$/);
  assert.deepEqual(stages.map((s) => s.label), ["Rendering", "Checking layout", "Comparing to goal", "Scoring"]);
  assert.deepEqual(stages.map((s) => s.index), [0, 1, 2, 3]);
  assert.ok(stages.every((s) => s.total === 4 && s.id));
  const r = run.result;
  assert.ok(r.total > 0 && r.total < 100);
  assert.equal(r.delta, null);
  assert.equal(r.passedCount, r.checks.filter((c) => c.passed).length);
  assert.equal(r.totalChecks, r.checks.length);
  assert.equal(r.checks.length - r.passedCount, r.costs.length, "one failed check per cost");
  assert.ok(r.rank && r.rank.before === null && r.rank.after >= 1);
  assert.equal(run.html, html.at(-1));
  assert.equal(attempt.promptCount, 1);
  assert.equal(attempt.best, r.total);
});

test("a mock run on a challenge with no fault data streams, grades and returns a consistent result", async () => {
  assert.equal(faults.challenges["profile-card"], undefined, "profile-card has no fault data");
  const html = [];
  const stages = [];
  const { attempt, run } = await api.run({ slug: "profile-card", prompt: PROMPT, onHtml: (h) => html.push(h), onStage: (s) => stages.push(s) });
  assert.ok(html.length > 5, "several html chunks");
  assert.match(html.at(-1), /<\/html>\s*$/i);
  assert.equal(stages.length, 4);
  const r = run.result;
  assert.ok(r.total > 0 && r.total < 100, `total ${r.total}`);
  assert.equal(r.costs.reduce((s, c) => s + c.points, 0), 100 - r.total);
  assert.equal(r.passedCount, r.checks.filter((c) => c.passed).length);
  assert.equal(r.checks.length - r.passedCount, r.costs.length, "one failed check per cost");
  assert.equal(run.html, html.at(-1));
  assert.equal(attempt.promptCount, 1);
  const goal = readFileSync(fileURLToPath((await api.getChallenge("profile-card")).goalUrl), "utf8");
  assert.notEqual(run.html, goal, "the faults changed the page");
});

test("costs are largest first and sum to 100 minus the total on every run", async () => {
  for (const slug of ["login-card", "pricing-plans", "nav-hero"]) {
    for (let i = 0; i < 6; i++) {
      const prompt = i === 2 ? "make it" : PROMPT + " take " + i;
      const { run } = await api.run({ slug, prompt });
      const r = run.result;
      const sum = r.costs.reduce((s, c) => s + c.points, 0);
      assert.equal(sum, 100 - r.total, `${slug} run ${i + 1}`);
      for (let j = 1; j < r.costs.length; j++) assert.ok(r.costs[j - 1].points >= r.costs[j].points);
      assert.ok(r.costs.every((c) => c.points > 0 && c.message));
      assert.ok(r.total < 100);
    }
  }
});

test("continuing raises promptCount and scores improve; startOver resets", async () => {
  const totals = [];
  for (let i = 1; i <= 4; i++) {
    const { attempt, run } = await api.run({ slug: "blog-header", prompt: PROMPT + " round " + i });
    assert.equal(attempt.promptCount, i);
    assert.equal(run.n, i);
    if (i > 1) assert.equal(run.result.delta, run.result.total - totals.at(-1));
    totals.push(run.result.total);
  }
  assert.ok(totals.at(-1) > totals[0] + 10, `scores ${totals}`);
  const saved = await api.getAttempt("blog-header");
  assert.equal(saved.runs.length, 4);
  assert.ok(saved.runs.every((r) => r.prompt && r.html && r.result));
  assert.equal(saved.best, Math.max(...totals));

  await api.startOver("blog-header");
  assert.equal(await api.getAttempt("blog-header"), null);
  const { attempt } = await api.run({ slug: "blog-header", prompt: PROMPT });
  assert.equal(attempt.promptCount, 1);
  assert.notEqual(attempt.id, saved.id);
  const c = (await api.listChallenges()).find((x) => x.slug === "blog-header");
  assert.equal(c.yourBest, Math.max(...totals), "best survives start over");
});

test("abort rejects with AbortError and saves nothing", async () => {
  const ctrl = new AbortController();
  api.configure({ timing: { streamMs: 400 } });
  const p = api.run({ slug: "nav-hero", prompt: PROMPT, signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 50);
  await assert.rejects(p, (e) => e.name === "AbortError" && typeof e.message === "string");
  assert.equal(await api.getAttempt("nav-hero"), null);

  const done = new AbortController();
  done.abort();
  await assert.rejects(api.run({ slug: "nav-hero", prompt: PROMPT, signal: done.signal }), { name: "AbortError" });
  await assert.rejects(api.run({ slug: "nav-hero", prompt: "  " }), /Write a prompt/);
});

test("every leaderboard bracket returns only matching rows, ranked", async () => {
  const ranges = { all: [1, Infinity], "1": [1, 1], "2": [2, 2], "3-5": [3, 5], "6-10": [6, 10], "11+": [11, Infinity] };
  for (const slug of ["login-card", "product-grid", null]) {
    for (const period of ["all", "week"]) {
      for (const [bracket, [lo, hi]] of Object.entries(ranges)) {
        const { rows } = await api.getLeaderboard(slug, { bracket, period });
        if (slug && period === "all") assert.ok(rows.length > 0, `${slug} ${bracket} has rows`);
        for (const r of rows) assert.ok(r.promptCount >= lo && r.promptCount <= hi, `${slug} ${bracket} ${r.promptCount}`);
        rows.forEach((r, i) => assert.equal(r.rank, i + 1));
        for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].score >= rows[i].score);
      }
    }
  }
  const all = await api.getLeaderboard("login-card", { bracket: "all", period: "all" });
  assert.ok(all.rows.length >= 35 && all.rows.length <= 45);
  assert.ok(all.rows[0].score >= 95 && all.rows[0].score <= 120); // an exact match can earn a bonus over 100
  assert.equal(all.you, null);
  await assert.rejects(api.getLeaderboard("login-card", { bracket: "4" }), /Unknown prompt filter/);
});

test("your best appears on the leaderboard and in your profile after signing up", async () => {
  await api.run({ slug: "footer-columns", prompt: PROMPT });
  await api.run({ slug: "footer-columns", prompt: PROMPT + " again" });
  const board = await api.getLeaderboard("footer-columns", { bracket: "2" });
  assert.ok(board.you && board.you.promptCount === 2);
  assert.equal(board.rows.filter((r) => r.isYou).length, 1);
  const other = await api.getLeaderboard("footer-columns", { bracket: "1" });
  assert.equal(other.you, null);

  await api.signup({ username: "tester_1", email: "t1@example.com", password: "longenough" });
  const p = await api.getProfile("tester_1");
  assert.equal(p.totals.solved, 1);
  assert.equal(p.solved[0].slug, "footer-columns");
  assert.equal(p.solved[0].promptCount, 2);
  const name = board.rows[0].isYou ? board.rows[1].username : board.rows[0].username;
  const q = await api.getProfile(name);
  assert.ok(q.totals.solved >= 1 && q.solved.every((s) => s.title && s.best && s.when));
  await assert.rejects(api.getProfile("nobody_here_xyz"), /no player/);
});

test("mock auth round trip and claim", async () => {
  assert.equal(await api.me(), null);
  await assert.rejects(api.claimAttempts(), /Log in first/);
  await assert.rejects(api.signup({ username: "x", email: "a@b.co", password: "longenough" }), /3 to 20/);
  await assert.rejects(api.signup({ username: "okname", email: "bad", password: "longenough" }), /valid email/);
  await assert.rejects(api.signup({ username: "okname", email: "a@b.co", password: "short" }), /8 to 128/);
  await api.run({ slug: "login-card", prompt: PROMPT });

  const u = await api.signup({ username: "okname", email: "A@b.co", password: "longenough" });
  assert.deepEqual(Object.keys(u).sort(), ["email", "id", "username"]);
  assert.equal((await api.me()).username, "okname");
  assert.deepEqual(await api.claimAttempts(), { moved: 1 });
  assert.deepEqual(await api.logout(), { ok: true });
  assert.equal(await api.me(), null);
  await assert.rejects(api.signup({ username: "other", email: "a@b.co", password: "longenough" }), /already registered/); // server wording
  await assert.rejects(api.login({ email: "a@b.co", password: "wrongpassword" }), /Email or password is incorrect/); // server wording
  await assert.rejects(api.login({ email: "z@b.co", password: "longenough" }), /Email or password is incorrect/); // server wording
  assert.equal((await api.login({ email: "a@b.co", password: "longenough" })).username, "okname");
  assert.equal((await api.me()).username, "okname");
});

test("live mode falls back to mock when endpoints are missing, and warns once", async () => {
  const calls = [];
  const notFound = async (url) => {
    calls.push(String(url));
    return new Response("<h1>Not found</h1>", { status: 404, headers: { "content-type": "text/html" } });
  };
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(m);
  try {
    api.configure({ mode: "live", fetch: notFound });
    const { run } = await api.run({ slug: "login-card", prompt: PROMPT });
    assert.equal(run.result.costs.reduce((s, c) => s + c.points, 0), 100 - run.result.total);
    await api.run({ slug: "login-card", prompt: PROMPT + " more" });
    assert.ok((await api.getLeaderboard("login-card")).rows.length > 0);
    assert.equal(await api.me(), null);
    // Real contract: one /api/health call decides; no run is sent to a server that is not there.
    assert.equal(calls.filter((c) => c.includes("/api/health")).length, 1);
    assert.ok(!calls.some((c) => c.includes("/api/runs")));
    assert.equal(warns.filter((w) => w.includes("not reachable")).length, 1);
  } finally {
    console.warn = orig;
  }
});

test("usernames are 3 to 20 characters, the same rule as the sign-up form", async () => {
  assert.ok(api.USERNAME_RE.test("abc") && api.USERNAME_RE.test("a".repeat(20)));
  assert.ok(!api.USERNAME_RE.test("ab") && !api.USERNAME_RE.test("a".repeat(21)) && !api.USERNAME_RE.test("bad name"));
  await assert.rejects(api.signup({ username: "a".repeat(21), email: "u21@example.test", password: "longenough" }), /3 to 20/);
  const u = await api.signup({ username: "b".repeat(20), email: "u20@example.test", password: "longenough" });
  assert.equal(u.username, "b".repeat(20));
  const form = readFileSync(new URL("../js/auth-pages.js", import.meta.url), "utf8");
  assert.match(form, /USERNAME_RE = api\.USERNAME_RE/, "sign-up form uses the api rule");
});

test("me() and playerStats() give real points and level for signed-in and anonymous players", async () => {
  assert.deepEqual(api.playerStats(), { points: 0, level: 1, solved: 0 });
  assert.equal(api.levelFor(0), 1);
  assert.equal(api.levelFor(99), 1);
  assert.equal(api.levelFor(100), 2);
  assert.equal(api.levelFor(250), 3);
  const a = (await api.run({ slug: "login-card", prompt: PROMPT })).run.result.total;
  const b = (await api.run({ slug: "nav-hero", prompt: PROMPT })).run.result.total;
  assert.deepEqual(api.playerStats(), { points: a + b, level: api.levelFor(a + b), solved: 2 });
  await api.signup({ username: "stats_1", email: "stats@example.test", password: "longenough" });
  const m = await api.me();
  assert.equal(m.points, a + b, "points are the sum of bests, claimed at sign-up");
  assert.equal(m.level, api.levelFor(a + b));
  assert.ok(m.level >= 2);
});

test("your best belongs to the current player, not to whoever used this browser before", async () => {
  await api.signup({ username: "first_p", email: "first@example.test", password: "longenough" });
  const mine = (await api.run({ slug: "product-grid", prompt: PROMPT })).run.result.total;
  assert.equal((await api.getChallenge("product-grid")).yourBest, mine);
  await api.logout();
  assert.equal((await api.getChallenge("product-grid")).yourBest, null, "signed out: not tried");
  assert.equal(await api.getAttempt("product-grid"), null);
  const anon = (await api.run({ slug: "product-grid", prompt: "short one" })).run.result.total;
  assert.notEqual(anon, mine);
  assert.equal((await api.getChallenge("product-grid")).yourBest, anon, "the anonymous run only");
  assert.equal((await api.login({ email: "first@example.test", password: "longenough" })).username, "first_p");
  assert.equal((await api.getChallenge("product-grid")).yourBest, mine, "the account keeps its own best");
  assert.deepEqual(await api.claimAttempts(), { moved: 1 });
  assert.equal((await api.getChallenge("product-grid")).yourBest, Math.max(mine, anon), "claim keeps the better best");
});

// ---------------------------------------------------------------- live auth against the real server's shapes
// Shapes from backend/controller/authController.js on origin/main: success { user: { id, username, email } }
// (201 sign-up, 200 log-in and me), errors { error } with 400, 401, 409, 502/503; logout 200 { ok: true }.
function fakeServer(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(String(url), "http://x").pathname;
    calls.push({ path: u, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null, credentials: init.credentials });
    const h = routes[`${init.method || "GET"} ${u}`];
    if (h) return h(init);
    return Response.json({ error: "API route not found." }, { status: 404 });
  };
  f.calls = calls;
  return f;
}
const SRV_USER = { id: "665f1c2ab3d4e5f6a7b8c9d0", username: "test_raptor", email: "test@example.test" };

test("config: live on a real host, mock on local hosts and node, query overrides", () => {
  assert.equal(modeFor(undefined), "mock");
  assert.equal(modeFor({ hostname: "localhost", search: "" }), "mock");
  assert.equal(modeFor({ hostname: "127.0.0.1", search: "" }), "mock");
  assert.equal(modeFor({ hostname: "[::1]", search: "" }), "mock");
  assert.equal(modeFor({ hostname: "promptdyno.vercel.app", search: "" }), "live");
  assert.equal(modeFor({ hostname: "localhost", search: "?live=1" }), "live");
  assert.equal(modeFor({ hostname: "promptdyno.vercel.app", search: "?mock=1" }), "mock");
});

test("live sign-up sends the server's fields with cookies and adopts anonymous scores", async () => {
  const best = (await api.run({ slug: "login-card", prompt: PROMPT })).run.result.total;
  const fetch = fakeServer({
    "POST /api/auth/signup": () => Response.json({ user: SRV_USER }, { status: 201 }),
    "GET /api/auth/me": () => Response.json({ user: SRV_USER }),
  });
  api.configure({ mode: "live", fetch, reset: true });
  const u = await api.signup({ username: " test_raptor ", email: " test@example.test ", password: "longenough" });
  assert.deepEqual(u, SRV_USER);
  const call = fetch.calls.find((c) => c.path === "/api/auth/signup");
  assert.deepEqual(call.body, { username: "test_raptor", email: "test@example.test", password: "longenough" });
  assert.equal(call.credentials, "include");
  assert.equal((await api.getChallenge("login-card")).yourBest, best, "scores now belong to the account");
  assert.deepEqual(await api.claimAttempts(), { moved: 1 }, "no claim endpoint is not an error");
  const m = await api.me();
  assert.equal(m.username, "test_raptor");
  assert.equal(m.points, best);
});

test("live auth errors: 400, 401, 409 show the server's message; 503 and no network show a plain one", async () => {
  const fetch = fakeServer({
    "POST /api/auth/signup": (init) => {
      const b = JSON.parse(init.body);
      if (b.email === "dup@example.test") return Response.json({ error: "That username or email is already registered." }, { status: 409 });
      if (b.email === "down@example.test") return Response.json({ error: "Could not connect to MongoDB. Check the URI, Atlas IP access list, and cluster status." }, { status: 503 });
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    },
    "POST /api/auth/login": () => Response.json({ error: "Email or password is incorrect." }, { status: 401 }),
  });
  api.configure({ mode: "live", fetch, reset: true });
  await assert.rejects(api.signup({ username: "okname", email: "dup@example.test", password: "longenough" }), (e) => e.status === 409 && /already registered/.test(e.message));
  await assert.rejects(api.signup({ username: "okname", email: "bad@example.test", password: "longenough" }), (e) => e.status === 400 && /valid email/.test(e.message));
  await assert.rejects(api.signup({ username: "okname", email: "down@example.test", password: "longenough" }), (e) => e.status === 503 && /not available right now/.test(e.message) && !/MongoDB/.test(e.message));
  await assert.rejects(api.login({ email: "a@example.test", password: "wrongpassword" }), (e) => e.status === 401 && /incorrect/.test(e.message));
  assert.equal(store.getPlayer(), null);
  api.configure({ mode: "live", fetch: async () => { throw new TypeError("Failed to fetch"); }, reset: true });
  await assert.rejects(api.login({ email: "a@example.test", password: "longenough" }), /Could not reach the server/);
  assert.equal(await api.me(), null, "unreachable server: signed out, no throw");
  assert.ok((await api.listChallenges()).length >= 6, "pages still load from the mock");
  assert.ok((await api.run({ slug: "nav-hero", prompt: PROMPT })).run.result.total > 0, "and still play");
});

test("live me(): 401 is signed out, asked once per page; logout clears the player", async () => {
  let meCalls = 0;
  const fetch = fakeServer({
    "GET /api/auth/me": () => { meCalls++; return Response.json({ error: "Not logged in." }, { status: 401 }); },
    "POST /api/auth/login": () => Response.json({ user: SRV_USER }),
    "POST /api/auth/logout": () => Response.json({ ok: true }),
  });
  api.configure({ mode: "live", fetch, reset: true });
  assert.equal(await api.me(), null);
  assert.equal(await api.me(), null);
  assert.equal(meCalls, 1);
  assert.equal((await api.login({ email: "test@example.test", password: "longenough" })).id, SRV_USER.id);
  assert.equal(store.getPlayer().id, SRV_USER.id);
  assert.equal((await api.me()).username, "test_raptor");
  assert.deepEqual(await api.logout(), { ok: true });
  assert.equal(store.getPlayer(), null);
  assert.equal(await api.me(), null);
});

test("simulated data is flagged in mock mode and after a live fallback, not when real", async () => {
  assert.equal(api.isSimulated("run"), true);
  // Real contract: health says the database is up but no model key is set.
  const fetch = fakeServer({
    "GET /api/health": () => Response.json({ ok: true, db: true, models: [], grader: "standin", challenges: 6, problems: [] }),
    "GET /api/leaderboards": () => Response.json({ rows: [{ rank: 1, username: "real_one", promptCount: 1, score: 90, isYou: false }], you: null, counts: { all: 1 }, kind: "score" }),
    "GET /api/users/someone_real": () => Response.json({ error: "Could not reach the database." }, { status: 503 }),
  });
  api.configure({ mode: "live", fetch, reset: true });
  assert.equal(api.isSimulated("boards"), false);
  const lb = await api.getLeaderboard("login-card");
  assert.equal(lb.rows[0].username, "real_one");
  assert.equal(api.isSimulated("boards"), false, "real board data");
  assert.equal(await api.probeRun(), true, "no model: runs are simulated");
  assert.equal(api.isSimulated("run"), true);
  await api.getProfile("someone_real").catch(() => {});
  assert.equal(api.isSimulated("profile"), true, "a server error falls back to labelled demo data");
  await api.run({ slug: "login-card", prompt: PROMPT });
  assert.equal(fetch.calls.filter((c) => c.path === "/api/runs").length, 0, "no run is sent while no model is set up");
  assert.equal(fetch.calls.filter((c) => c.path === "/api/health").length, 1, "health is asked once");
});
