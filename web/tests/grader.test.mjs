// Full grader results, challenge kinds, lessons and the Markdown renderer, with a fake fetch.
// Run with: node --test "web/tests/*.test.mjs"
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as api from "../js/api.js";
import * as store from "../js/store.js";
import { parseMarkdown, parseInline, toDom } from "../js/markdown.js";
import { fmtScore, provisionalTag, kindTag } from "../js/ui.js";

const PROMPT = "Write a short guide to naming files, with a table of examples.";
const RUN_ID = "run_AAAAAAAAAAAAAAAA";
const ATT_ID = "att_CCCCCCCCCCCCCCCC";

beforeEach(() => {
  store._resetForTests();
  api.configure({ mode: "live", fetch: null, timing: { streamMs: 0, stageMs: 0, scoreStageMs: [0, 0, 0, 0] }, reset: true });
});

const health = (over = {}) => ({ ok: true, db: true, models: ["openai-mini"], grader: "service", graderVersion: "2.1.0", challenges: 7, problems: [], ...over });
const pageChallenge = { slug: "login-card", title: "Sign-in card", level: 1, levelLabel: "Easy", brief: "A card.", kind: "page", available: true, solvedCount: 3, topScore: 112.5, yourBest: null, yourBestPrompts: null };
const docChallenge = { slug: "file-names", title: "Naming files", level: 1, levelLabel: "Easy", brief: "Explain how to name files.", kind: "doc", available: true, lesson: "naming", solvedCount: 0, topScore: null, yourBest: null, yourBestPrompts: null };
const siteChallenge = { slug: "three-pages", title: "Three pages", level: 3, levelLabel: "Hard", brief: "A small site.", kind: "site", available: false, solvedCount: 0, topScore: null, yourBest: null, yourBestPrompts: null };
const MODELS = [{ id: "openai-mini", label: "GPT mini", available: true }];

const CRITERIA = [
  { id: "c1", name: "Header matches", group: "looks", value: 0.9, notes: ["Logo is 4px too small.", "Gap is right.", "Colour is right.", "A fourth note."] },
  { id: "c2", name: "Buttons work", group: "works", value: 1, notes: [] },
  { id: "c3", name: "Alt text", group: "engineering", value: null, notes: ["No images to check."] },
];
const fullResult = (over = {}) => ({
  total: 112.5, delta: null,
  checks: [{ label: "Card is centred", passed: true }], passedCount: 1, totalChecks: 1,
  costs: [{ points: 2.5, message: "Logo is 4px too small." }],
  rank: { before: null, after: 1 }, provisional: false, graderVersion: "2.1.0",
  pillars: [{ id: "works", label: "It works", value: 100 }, { id: "engineering", label: "Well engineered", value: 97.5 }, { id: "looks", label: "Looks like the goal", value: 95 }],
  engineering: { efficiency: 0.98, accessibility: 0.9, cleanCode: 0.95, decidedBy: "accessibility" },
  bonus: 12.5, exactMatch: true, criteria: CRITERIA,
  ...over,
});

const enc = new TextEncoder();
function streamOf(parts) {
  return new ReadableStream({ start(c) { parts.forEach((p) => c.enqueue(enc.encode(p))); c.close(); } });
}
function server(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(String(url), "http://x");
    const method = init.method || "GET";
    calls.push({ path: u.pathname, method });
    const h = routes[`${method} ${u.pathname}`];
    if (h) return h(init, u);
    return Response.json({ error: "API route not found." }, { status: 404 });
  };
  f.count = (p) => calls.filter((c) => c.path === p).length;
  return f;
}
function routes(over = {}) {
  return {
    "GET /api/health": () => Response.json(health()),
    "GET /api/auth/me": () => Response.json({ error: "Not logged in." }, { status: 401 }),
    "GET /api/challenges": () => Response.json({ challenges: [pageChallenge, docChallenge, siteChallenge], statsAvailable: true }),
    "GET /api/challenges/login-card": () => Response.json({ challenge: { ...pageChallenge, goalUrl: "/data/goals/login-card.html", viewport: { width: 1280, height: 800 }, spec: [], models: MODELS, simulated: false }, statsAvailable: true }),
    "GET /api/challenges/file-names": () => Response.json({ challenge: { ...docChallenge, goalUrl: null, viewport: { width: 1280, height: 800 }, spec: [], models: MODELS, simulated: false, criteria: ["Uses a table of examples", "Explains dates in names"] }, statsAvailable: true }),
    "GET /api/challenges/three-pages": () => Response.json({ challenge: { ...siteChallenge, goalUrl: null, viewport: { width: 1280, height: 800 }, spec: [], models: MODELS, simulated: false, unavailableReason: "Site challenges open soon." }, statsAvailable: true }),
    "GET /api/attempts/current": () => Response.json({ attempt: null }),
    ...over,
  };
}
const attempt = (over = {}) => ({ id: ATT_ID, slug: "login-card", promptCount: 1, best: 112.5, bestPromptCount: 1, open: true, startedAt: "2026-11-15T08:00:00.000Z", ...over });
const run = (over = {}) => ({ id: RUN_ID, n: 1, kind: "page", prompt: PROMPT, model: "openai-mini", status: "done", result: fullResult(), at: "2026-11-15T08:00:05.000Z", ...over });
function pageRunRoutes(result) {
  return {
    "POST /api/runs": () => new Response(streamOf(["<html><body>hi</body></html>"]), { status: 200, headers: { "X-Run-Id": RUN_ID, "X-Attempt-Id": ATT_ID, "X-Prompt-Count": "1" } }),
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": () => Response.json({ attempt: attempt(), run: run({ result }), graderResult: { total: result.total } }),
  };
}

// ---------------------------------------------------------------- results

test("a full result (112.5, criteria, pillars) passes through with one decimal", async () => {
  api.configure({ fetch: server(routes(pageRunRoutes(fullResult()))) });
  const { run: r } = await api.run({ slug: "login-card", prompt: PROMPT });
  const x = r.result;
  assert.equal(x.total, 112.5);
  assert.equal(x.bonus, 12.5);
  assert.equal(x.exactMatch, true);
  assert.equal(x.graderVersion, "2.1.0");
  assert.deepEqual(x.pillars.map((p) => [p.id, p.label, p.value]), [["works", "It works", 100], ["engineering", "Well engineered", 97.5], ["looks", "Looks like the goal", 95]]);
  assert.equal(x.engineering.decidedBy, "accessibility");
  assert.deepEqual(x.criteria.map((c) => [c.group, c.value]), [["looks", 0.9], ["works", 1], ["engineering", null]]);
  assert.equal(x.criteria[0].notes.length, 4, "all notes kept; the page shows three");
  assert.deepEqual(x.costs, [{ points: 2.5, message: "Logo is 4px too small." }]);
  assert.equal(fmtScore(x.total), "112.5");
  assert.equal(fmtScore(100), "100");
  assert.equal(fmtScore(87.04), "87");
});

test("an older result without criteria keeps the checks; a rejected one carries its reason", async () => {
  const old = { total: 82, delta: null, checks: [{ label: "Card is centred", passed: false }], passedCount: 0, totalChecks: 1, costs: [{ points: 18, message: "Card is off centre." }], rank: null, provisional: false };
  api.configure({ fetch: server(routes(pageRunRoutes(old))) });
  const a = (await api.run({ slug: "login-card", prompt: PROMPT })).run.result;
  assert.equal(a.criteria, undefined);
  assert.equal(a.pillars, undefined);
  assert.equal(a.checks.length, 1);

  api.configure({ reset: true, fetch: server(routes(pageRunRoutes({ ...old, total: 0, costs: [], rejectedReason: "The page has no body element." }))) });
  const b = (await api.run({ slug: "login-card", prompt: PROMPT })).run.result;
  assert.equal(b.total, 0);
  assert.equal(b.rejectedReason, "The page has no body element.");
});

test("a run scored by an older grader version is re-scored quietly once", async () => {
  let rescores = 0;
  const f = server(routes({
    "GET /api/attempts/current": () => Response.json({ attempt: { ...attempt(), runs: [{ ...run({ result: fullResult({ total: 90, graderVersion: "2.0.0" }) }), html: "<p>x</p>" }] } }),
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": () => { rescores++; return Response.json({ attempt: attempt(), run: run() }); },
  }));
  api.configure({ fetch: f });
  const a = await api.getAttempt("login-card");
  assert.equal(a.runs[0].result.total, 90);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(rescores, 1);
  assert.equal(a.runs[0].result.total, 112.5);
  assert.equal(a.runs[0].result.graderVersion, "2.1.0");
  await api.getAttempt("login-card");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(rescores, 1, "once");
});

test("boards: decimals pass through; more than one grader version is flagged", async () => {
  api.configure({ fetch: server(routes({
    "GET /api/leaderboards": () => Response.json({ rows: [{ rank: 1, username: "ada", promptCount: 1, score: 112.5, isYou: false }, { rank: 2, username: "bo", promptCount: 2, score: 97.5, isYou: false }], you: null, counts: { all: 2 }, kind: "score", provisional: false, graderVersions: ["2.0.0", "2.1.0"] }),
  })) });
  const lb = await api.getLeaderboard("login-card");
  assert.deepEqual(lb.rows.map((r) => r.score), [112.5, 97.5]);
  assert.deepEqual(lb.graderVersions, ["2.0.0", "2.1.0"]);
  assert.equal(api.isProvisional("versions"), true);
  assert.equal(api.isProvisional("boards"), false);
  assert.match(provisionalTag(false, true), /more than one grader version/);
  assert.equal(provisionalTag(false, false), "");
});

// ---------------------------------------------------------------- kinds

test("challenge kinds: doc and unavailable challenges are listed with their fields", async () => {
  api.configure({ fetch: server(routes()) });
  const list = await api.listChallenges();
  assert.deepEqual(list.map((c) => [c.slug, c.kind, c.available]), [["login-card", "page", true], ["file-names", "doc", true], ["three-pages", "site", false]]);
  assert.equal(list[1].lesson, "naming");
  assert.equal(list[0].topScore, 112.5);
  const doc = await api.getChallenge("file-names");
  assert.equal(doc.goalUrl, null);
  assert.deepEqual(doc.criteria, ["Uses a table of examples", "Explains dates in names"]);
  const site = await api.getChallenge("three-pages");
  assert.equal(site.available, false);
  assert.equal(site.unavailableReason, "Site challenges open soon.");
  await assert.rejects(api.run({ slug: "three-pages", prompt: PROMPT }), /Site challenges open soon/);
  assert.equal(kindTag("doc").includes("Doc"), true);
  assert.equal(kindTag("page"), "");
});

test("a doc run streams Markdown, keeps it as markdown (not html) and scores the same way", async () => {
  const md = "# Naming files\n\nUse dates first.\n";
  const f = server(routes({
    "POST /api/runs": () => new Response(streamOf([md.slice(0, 10), md.slice(10)]), { status: 200, headers: { "Content-Type": "text/markdown", "X-Run-Id": RUN_ID, "X-Attempt-Id": ATT_ID, "X-Prompt-Count": "1" } }),
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": () => Response.json({ attempt: attempt({ slug: "file-names", best: 88 }), run: run({ kind: "doc", result: fullResult({ total: 88, bonus: undefined, exactMatch: false }) }) }),
  }));
  api.configure({ fetch: f });
  const seen = [];
  const { run: r, attempt: a } = await api.run({ slug: "file-names", prompt: PROMPT, onHtml: (t) => seen.push(t) });
  assert.equal(seen.at(-1), md);
  assert.equal(r.kind, "doc");
  assert.equal(r.markdown, md);
  assert.equal(r.html, "");
  assert.equal(r.result.total, 88);
  assert.equal(a.runs[0].markdown, md);
});

test("run 501 and score 503 no_grader give plain messages", async () => {
  api.configure({ fetch: server(routes({ "POST /api/runs": () => Response.json({ error: "Site challenges are not playable yet." }, { status: 501 }) })) });
  await assert.rejects(api.run({ slug: "login-card", prompt: PROMPT }), (e) => e.status === 501 && /not playable yet/.test(e.message) && /count did not change/.test(e.userMessage));

  api.configure({ reset: true, fetch: server(routes({
    "POST /api/runs": () => new Response(streamOf(["# Hi"]), { status: 200, headers: { "X-Run-Id": RUN_ID, "X-Attempt-Id": ATT_ID, "X-Prompt-Count": "1" } }),
    "POST /api/runs/run_AAAAAAAAAAAAAAAA/score": () => Response.json({ error: "No grader for docs.", code: "no_grader" }, { status: 503 }),
  })) });
  let err;
  await api.run({ slug: "file-names", prompt: PROMPT }).catch((e) => { err = e; });
  assert.equal(err.code, "no_grader");
  assert.match(err.userMessage, /^Scoring for this kind of challenge is not connected yet/);
  assert.equal(err.attempt.pending.markdown, "# Hi", "the answer is saved and can be scored later");
});

// ---------------------------------------------------------------- lessons

test("lessons: list sorted by order, one lesson with Markdown; mock mode and errors give the empty state", async () => {
  api.configure({ fetch: server(routes({
    "GET /api/lessons": () => Response.json({ lessons: [
      { slug: "tables", title: "Tables", level: 2, minutes: 6, summary: "Ask for tables.", file: "02-tables.md", bonusChallenge: "pricing-plans", grader: "page", order: 2 },
      { slug: "naming", title: "Naming", level: 1, minutes: 4, summary: "Name things.", file: "01-naming.md", bonusChallenge: "file-names", grader: "doc", order: 1 },
    ] }),
    "GET /api/lessons/naming": () => Response.json({ lesson: { slug: "naming", title: "Naming", level: 1, minutes: 4, summary: "Name things.", file: "01-naming.md", bonusChallenge: "file-names", grader: "doc", order: 1, fields: { title: "Naming" }, markdown: "# Naming\n\n## Why\n\nText." } }),
    "GET /api/lessons/nope": () => Response.json({ error: "There is no lesson called nope." }, { status: 404 }),
  })) });
  const list = await api.listLessons();
  assert.deepEqual(list.map((l) => l.slug), ["naming", "tables"]);
  assert.deepEqual(list[0], { slug: "naming", title: "Naming", level: 1, minutes: 4, summary: "Name things.", bonusChallenge: "file-names", bonusChallenges: [], order: 1 });
  const l = await api.getLesson("naming");
  assert.equal(l.markdown, "# Naming\n\n## Why\n\nText.");
  assert.equal(l.bonusChallenge, "file-names");
  assert.deepEqual(l.fields, { title: "Naming" });
  await assert.rejects(api.getLesson("nope"), (e) => e.status === 404 && /not here/.test(e.message));

  api.configure({ mode: "mock", reset: true });
  assert.deepEqual(await api.listLessons(), []);
  await assert.rejects(api.getLesson("naming"), /being written/);
  api.configure({ mode: "live", reset: true, fetch: async () => { throw new TypeError("Failed to fetch"); } });
  assert.deepEqual(await api.listLessons(), []);
});

test("mock mode still works and includes one board score above 100", async () => {
  api.configure({ mode: "mock" });
  const lb = await api.getLeaderboard("login-card");
  assert.equal(lb.rows[0].score, 104.5);
  const { run: r } = await api.run({ slug: "login-card", prompt: "A centred white sign-in card, 400px wide, with a green button." });
  assert.equal(r.result.pillars.length, 3);
  assert.equal(r.result.engineering.decidedBy, "cleanCode");
});

// ---------------------------------------------------------------- Markdown renderer

// A tiny DOM stand-in: records what toDom builds, so the test sees every node and attribute.
function fakeDoc() {
  const mk = (type, extra) => ({ type, children: [], attrs: {}, appendChild(n) { if (n.type === "frag") this.children.push(...n.children); else this.children.push(n); return n; }, setAttribute(k, v) { this.attrs[k] = v; }, ...extra });
  return {
    createDocumentFragment: () => mk("frag"),
    createElement: (tag) => mk("el", { tag }),
    createTextNode: (text) => ({ type: "text", text }),
  };
}
function textOf(n) { return n.type === "text" ? n.text : n.children.map(textOf).join(""); }
function tags(n, out = []) { if (n.type === "el") out.push(n.tag); (n.children || []).forEach((c) => tags(c, out)); return out; }

test("markdown: headings, lists, code fences, inline code, tables, links and emphasis", () => {
  const src = "---\ntitle: X\n---\n# Title\n\nSome **bold**, *em* and `code` with a [link](https://example.com).\n\n## Steps\n\n- one\n- two\n\n1. first\n2. second\n\n```js\nconst a = 1 < 2;\n```\n\n| Name | Use |\n|---|---|\n| a | b |\n\n> quoted\n";
  const { tree, headings } = parseMarkdown(src);
  assert.deepEqual(tree.map((n) => n.tag), ["h1", "p", "h2", "ul", "ol", "pre", "table", "blockquote"], "front matter dropped");
  assert.deepEqual(headings.map((h) => [h.level, h.text, h.id]), [[1, "Title", "title"], [2, "Steps", "steps"]]);
  const p = tree[1].children;
  assert.deepEqual(p.filter((x) => typeof x !== "string").map((x) => x.tag), ["strong", "em", "code", "a"]);
  const a = p.find((x) => x.tag === "a");
  assert.deepEqual(a.attrs, { href: "https://example.com", target: "_blank", rel: "noopener" });
  assert.equal(tree[5].children[0].children[0], "const a = 1 < 2;");
  assert.equal(tree[6].children[1].children[0].children.length, 2);
  const dom = toDom(tree, fakeDoc());
  assert.deepEqual(tags(dom).slice(0, 3), ["h1", "p", "strong"]);
});

test("markdown: raw HTML and <script> come out as text, and unsafe links lose their href", () => {
  const src = "<script>alert(1)</script>\n\nHi <b onclick=\"x()\">there</b> [bad](javascript:alert(1)) [data](data:text/html,x)\n\n```\n<img src=x onerror=alert(1)>\n```";
  const { tree } = parseMarkdown(src);
  const dom = toDom(tree, fakeDoc());
  const all = tags(dom);
  assert.ok(!all.includes("script") && !all.includes("b") && !all.includes("img"), `tags: ${all}`);
  assert.ok(!all.includes("a"), "no link for javascript: or data:");
  const text = textOf(dom);
  assert.ok(text.includes("<script>alert(1)</script>"), "script shown as text");
  assert.ok(text.includes('<b onclick="x()">there</b>'));
  assert.ok(text.includes("<img src=x onerror=alert(1)>"));
  assert.deepEqual(parseInline("a `<b>` c"), ["a ", { tag: "code", children: ["<b>"] }, " c"]);
});
