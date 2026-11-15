// Credits and billing (Stripe Checkout, test mode), the 402 for runs, cost and maxPromptChars
// passthrough, lesson challenges, and Markdown <details>. Run with: node --test "web/tests/*.test.mjs"
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as api from "../js/api.js";
import * as store from "../js/store.js";
import { parseMarkdown, toDom } from "../js/markdown.js";

const USER = { id: "665f1c2ab3d4e5f6a7b8c9d0", username: "test_raptor", email: "test@example.test" };

beforeEach(() => {
  store._resetForTests();
  api.configure({ mode: "live", fetch: null, timing: { streamMs: 0, stageMs: 0, scoreStageMs: [0, 0, 0, 0] }, reset: true });
});

// Routes keyed "METHOD /path"; unknown routes get the router's 404.
function server(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(String(url), "http://x");
    const method = init.method || "GET";
    calls.push({ path: u.pathname, method, body: init.body ? JSON.parse(init.body) : null });
    const h = routes[`${method} ${u.pathname}`];
    if (h) return h(init, u);
    return Response.json({ error: "API route not found." }, { status: 404 });
  };
  f.calls = calls;
  f.count = (path) => calls.filter((c) => c.path === path).length;
  return f;
}

const health = () => Response.json({ ok: true, db: true, models: ["openai-mini"], grader: "service" });
const summary = (over = {}) => ({ slug: "login-card", title: "Sign-in card", level: 1, levelLabel: "Warm-up", brief: "A card.", solvedCount: 3, topScore: 88, yourBest: null, yourBestPrompts: null, cost: 0, maxPromptChars: 1200, ...over });
const billingBody = (over = {}) => ({
  configured: true,
  packs: [{ id: "small", credits: 20, price: 200, currency: "usd" }, { id: "medium", credits: 60, price: 500, currency: "usd" }],
  credits: 7,
  free: { challengesLeft: 1, promptsPerChallenge: 5, resetsAt: "2026-11-16T00:00:00.000Z" },
  costs: { standard: 1, lesson: 2 },
  ...over,
});

test("billing summary maps packs, credits, free allowance and costs; checkout returns Stripe's url", async () => {
  const f = server({
    "GET /api/health": health,
    "GET /api/billing/summary": () => Response.json(billingBody()),
    "POST /api/billing/checkout": () => Response.json({ url: "https://checkout.stripe.com/c/pay/cs_test_123" }),
  });
  api.configure({ fetch: f });
  const b = await api.getBilling();
  assert.equal(b.configured, true);
  assert.deepEqual(b.packs[1], { id: "medium", credits: 60, price: 500, currency: "usd" });
  assert.equal(b.credits, 7);
  assert.deepEqual(b.free, { challengesLeft: 1, promptsPerChallenge: 5, resetsAt: "2026-11-16T00:00:00.000Z" });
  assert.deepEqual(b.costs, { standard: 1, lesson: 2 });
  assert.equal(b.demo, false);
  const { url } = await api.startCheckout("medium");
  assert.equal(url, "https://checkout.stripe.com/c/pay/cs_test_123");
  assert.deepEqual(f.calls.find((c) => c.path === "/api/billing/checkout").body, { pack: "medium" });
});

test("checkout 401 and 503 payments_off give one plain line; anonymous credits are null", async () => {
  let status = 401;
  const f = server({
    "GET /api/health": health,
    "GET /api/billing/summary": () => Response.json(billingBody({ credits: null, configured: false })),
    "POST /api/billing/checkout": () => Response.json(status === 503 ? { error: "off", code: "payments_off" } : { error: "Log in first." }, { status }),
  });
  api.configure({ fetch: f });
  const b = await api.getBilling();
  assert.equal(b.credits, null);
  assert.equal(b.configured, false);
  await assert.rejects(api.startCheckout("small"), (e) => e.status === 401 && e.message === "Log in to buy credits.");
  status = 503;
  await assert.rejects(api.startCheckout("small"), (e) => e.code === "payments_off" && e.message === "Payments are not connected yet.");
});

test("confirm credits once and clears the cached player and billing data", async () => {
  let credits = 7;
  let credited = false;
  const f = server({
    "GET /api/health": health,
    "GET /api/billing/summary": () => Response.json(billingBody({ credits })),
    "POST /api/billing/confirm": () => {
      const again = credited;
      if (!credited) { credits += 60; credited = true; }
      return Response.json({ credited: again ? 0 : 60, alreadyCredited: again, credits });
    },
  });
  api.configure({ fetch: f });
  globalThis.sessionStorage = memoryStorage();
  try {
    assert.equal((await api.getBilling()).credits, 7);
    assert.equal((await api.getBilling()).credits, 7, "cached");
    assert.equal(f.count("/api/billing/summary"), 1);
    assert.deepEqual(await api.confirmCheckout("cs_test_123"), { credited: 60, alreadyCredited: false, credits: 67 });
    assert.equal((await api.getBilling()).credits, 67, "the cache was cleared");
    assert.deepEqual(await api.confirmCheckout("cs_test_123"), { credited: 0, alreadyCredited: true, credits: 67 });
  } finally {
    delete globalThis.sessionStorage;
  }
});

test("a 402 from POST /api/runs carries code, cost, credits and free challenges left", async () => {
  const f = server({
    "GET /api/health": health,
    "GET /api/challenges/nav-hero": () => Response.json({ challenge: { ...summary({ slug: "nav-hero", level: 2, cost: 1 }), viewport: { width: 1280, height: 800 }, spec: [], models: [{ id: "openai-mini", label: "GPT mini", available: true }] }, statsAvailable: true }),
    "GET /api/attempts/current": () => Response.json({ attempt: null }),
    "POST /api/runs": () => Response.json({ error: "You need 1 credit for this prompt.", code: "credits_required", cost: 1, credits: 0, freeChallengesLeft: 0 }, { status: 402 }),
  });
  api.configure({ fetch: f });
  const ch = await api.getChallenge("nav-hero");
  assert.equal(ch.cost, 1);
  await assert.rejects(api.run({ slug: "nav-hero", prompt: "A nav bar and a hero." }), (e) => {
    assert.equal(e.status, 402);
    assert.equal(e.code, "credits_required");
    assert.equal(e.message, "You need 1 credit for this prompt.");
    assert.equal(e.cost, 1);
    assert.equal(e.credits, 0);
    assert.equal(e.freeChallengesLeft, 0);
    return true;
  });
  assert.equal(f.count("/api/runs/x/score"), 0);
});

test("cost and maxPromptChars pass through the list and the detail; lessons carry their three challenges", async () => {
  const bonus = [
    { slug: "a1", title: "One", level: 1, kind: "doc", cost: 2, available: true },
    { slug: "a2", title: "Two", level: 2, kind: "doc", cost: 2, available: true },
    { slug: "a3", title: "Three", level: 3, kind: "workflow", cost: 2, available: false, unavailableReason: "Coming soon" },
  ];
  const f = server({
    "GET /api/health": health,
    "GET /api/challenges": () => Response.json({ challenges: [summary()], statsAvailable: true }),
    "GET /api/challenges/login-card": () => Response.json({ challenge: { ...summary(), viewport: { width: 1280, height: 800 }, spec: [], models: [{ id: "openai-mini", label: "GPT mini" }] }, statsAvailable: true }),
    "GET /api/lessons": () => Response.json({ lessons: [{ slug: "l1", title: "L1", level: 1, order: 1, bonusChallenge: "a1", bonusChallenges: bonus }] }),
  });
  api.configure({ fetch: f });
  const [row] = await api.listChallenges();
  assert.equal(row.cost, 0);
  assert.equal(row.maxPromptChars, 1200);
  const ch = await api.getChallenge("login-card");
  assert.equal(ch.maxPromptChars, 1200);
  assert.equal(ch.cost, 0);
  const [lesson] = await api.listLessons();
  assert.equal(lesson.bonusChallenges.length, 3);
  assert.deepEqual(lesson.bonusChallenges[2], { slug: "a3", title: "Three", level: 3, kind: "workflow", cost: 2, available: false, unavailableReason: "Coming soon" });
});

test("mock checkout round trip: back to credits.html as paid, credited once, clearly a demo", async () => {
  api.configure({ mode: "mock", reset: true });
  await assert.rejects(api.startCheckout("standard"), (e) => e.status === 401);
  await api.signup({ username: "buyer_one", email: "buyer@example.test", password: "password123" });
  const b = await api.getBilling();
  assert.equal(b.demo, true);
  assert.equal(b.configured, true);
  assert.deepEqual(b.packs.map((p) => [p.credits, p.price]), [[20, 200], [60, 500], [200, 1500]]);
  assert.equal(b.free.challengesLeft, 2);
  const start = b.credits;
  assert.ok(start > 0 && start < 20, "a small demo balance");
  const { url } = await api.startCheckout("standard");
  assert.match(url, /^credits\.html\?mock_paid=standard&session_id=mock_standard_/);
  const sid = new URLSearchParams(url.split("?")[1]).get("session_id");
  assert.deepEqual(await api.confirmCheckout(sid), { credited: 60, alreadyCredited: false, credits: start + 60 });
  assert.deepEqual(await api.confirmCheckout(sid), { credited: 0, alreadyCredited: true, credits: start + 60 });
  assert.equal((await api.me()).credits, start + 60);
  const [first] = (await api.listChallenges()).filter((c) => c.level === 1);
  assert.equal(first.cost, 0, "Level 1 is free while free challenges are left");
});

function fakeDoc() {
  const mk = (type, extra) => ({ type, children: [], attrs: {}, appendChild(n) { if (n.type === "frag") this.children.push(...n.children); else this.children.push(n); return n; }, setAttribute(k, v) { this.attrs[k] = v; }, ...extra });
  return { createDocumentFragment: () => mk("frag"), createElement: (tag) => mk("el", { tag }), createTextNode: (text) => ({ type: "text", text }) };
}
function tags(n, out = []) { if (n.type === "el") out.push(n.tag); (n.children || []).forEach((c) => tags(c, out)); return out; }
function textOf(n) { return n.type === "text" ? n.text : n.children.map(textOf).join(""); }

test("markdown: <details> is a real collapsible block with Markdown inside; other tags stay text", () => {
  const src = "Intro\n\n<details>\n<summary>Show the **answer**</summary>\n\n- one\n- `two`\n\n</details>\n\nAfter <b>bold</b> and <div>x</div>\n\n<details>\nnever closed";
  const { tree } = parseMarkdown(src);
  assert.deepEqual(tree.map((n) => n.tag), ["p", "details", "p", "p", "p"]);
  const det = tree[1];
  assert.equal(det.children[0].tag, "summary");
  assert.deepEqual(det.children[0].children.map((c) => (typeof c === "string" ? c : c.tag)), ["Show the ", "strong"]);
  assert.equal(det.children[1].tag, "ul");
  const dom = toDom(tree, fakeDoc());
  const all = tags(dom);
  assert.ok(all.includes("details") && all.includes("summary") && all.includes("code"));
  assert.ok(!all.includes("b") && !all.includes("div"), `tags: ${all}`);
  const text = textOf(dom);
  assert.ok(text.includes("<b>bold</b>") && text.includes("<div>x</div>"));
  assert.ok(text.includes("<details>"), "an unclosed <details> stays text");
});

function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
