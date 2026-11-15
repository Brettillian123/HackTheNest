// Brief-format challenges and the category filter. Run with: node --test "web/tests/*.test.mjs"
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as api from "../js/api.js";
import * as store from "../js/store.js";

beforeEach(() => {
  store._resetForTests();
  api.configure({ mode: "mock", fetch: null, timing: { streamMs: 0, stageMs: 0, pollMs: 0 }, reset: true });
});

test("briefFields maps a brief challenge and ignores a spec one", () => {
  assert.deepEqual(api.briefFields({ format: "spec", spec: [] }), {});
  assert.deepEqual(api.briefFields(null), {});
  const b = api.briefFields({
    format: "brief",
    brief: "A page",
    requirements: [
      { id: "a", text: "Has a title", kind: "content", exact: true },
      { id: "b", text: "Works with keys", kind: "behavior" },
      { text: "Odd kind", kind: "weird", exact: "yes" },
      null,
      {},
    ],
    keyFacts: ["Sign in", "", null, " Join "],
    designNotes: ["Calm"],
  });
  assert.equal(b.format, "brief");
  assert.equal(b.brief, "A page");
  assert.deepEqual(b.requirements, [
    { id: "a", text: "Has a title", kind: "content", exact: true },
    { id: "b", text: "Works with keys", kind: "behaviour", exact: false },
    { id: "r3", text: "Odd kind", kind: "content", exact: false },
  ]);
  assert.deepEqual(b.keyFacts, ["Sign in", "Join"]);
  assert.deepEqual(b.designNotes, ["Calm"]);
});

test("requirementResults keeps only results with an id and a yes or no", () => {
  assert.equal(api.requirementResults(undefined), null);
  assert.equal(api.requirementResults([{ id: "a" }, { met: true }]), null);
  assert.deepEqual(api.requirementResults([{ id: "a", met: false }, { id: 2, passed: true }, { id: "c", met: "yes" }]), [
    { id: "a", met: false },
    { id: "2", met: true },
  ]);
});

test("mock list carries format and category; two challenges use the brief format", async () => {
  const list = await api.listChallenges();
  assert.ok(list.every((c) => c.format === "brief" || c.format === "spec"));
  const briefs = list.filter((c) => c.format === "brief").map((c) => c.slug);
  assert.ok(["harbor-landing", "split-signup"].every((s) => briefs.includes(s)), "the two mock brief challenges");
  assert.ok(list.every((c) => c.category === undefined || api.CATEGORIES.includes(c.category)));
  const c = await api.getChallenge("split-signup");
  assert.ok(c.requirements.length >= 6 && c.requirements.every((r) => api.REQUIREMENT_KINDS.includes(r.kind)));
  assert.ok(c.keyFacts.length >= 4 && c.designNotes.length >= 3);
  assert.ok(new Set(c.requirements.map((r) => r.kind)).size >= 4, "requirements across the kinds");
  // The rewritten originals are briefs too, and the grader-only pixel spec never reaches the page.
  for (const { slug } of list) {
    const d = await api.getChallenge(slug);
    assert.equal("exactSpec" in d, false, `${slug}: no exactSpec`);
  }
  assert.equal((await api.getChallenge("login-card")).format, "brief");
});

test("mockDetailFields keeps the spec path for entries that still have one (fixture)", () => {
  const spec = [{ group: "Page", items: [{ label: "Background", value: "#F3F4F6" }] }];
  const s = api.mockDetailFields({ slug: "fixture-spec", spec, exactSpec: spec });
  assert.deepEqual(s, { spec });
  assert.notEqual(s.spec[0], spec[0], "a copy, not the same object");
  const b = api.mockDetailFields({ slug: "fixture-brief", brief: "A card", requirements: [{ id: "r1", text: "A heading", kind: "content" }], keyFacts: ["Hi"], designNotes: ["Calm"], exactSpec: spec });
  assert.equal(b.format, "brief");
  assert.equal("exactSpec" in b, false);
  assert.equal("spec" in b, false);
});

test("a brief challenge marked on the brief returns per-requirement results; the other does not", async () => {
  const a = (await api.run({ slug: "harbor-landing", prompt: "A calm landing page for Harbor" })).run.result;
  assert.equal(a.intentGraded, true);
  const ids = (await api.getChallenge("harbor-landing")).requirements.map((r) => r.id);
  assert.deepEqual(a.requirements.map((r) => r.id), ids);
  assert.ok(a.requirements.every((r) => typeof r.met === "boolean"));
  const b = (await api.run({ slug: "split-signup", prompt: "A sign-up page" })).run.result;
  assert.equal(b.intentGraded, false);
  assert.equal(b.requirements, undefined);
  const s = (await api.run({ slug: "login-card", prompt: "A card" })).run.result;
  assert.equal(s.intentGraded, false, "a rewritten original is marked against the example in mock mode");
});

test("filterByCategory: all, one category, and classic for entries with none", () => {
  const list = [{ slug: "a", category: "forms" }, { slug: "b", category: "apps" }, { slug: "c" }, { slug: "d", category: "unknown" }];
  const slugs = (cat) => api.filterByCategory(list, cat).map((c) => c.slug);
  assert.deepEqual(slugs("all"), ["a", "b", "c", "d"]);
  assert.deepEqual(slugs("forms"), ["a"]);
  assert.deepEqual(slugs("marketing"), []);
  assert.deepEqual(slugs("classic"), ["c", "d"]);
  assert.deepEqual(slugs("nonsense"), ["a", "b", "c", "d"], "an unknown filter shows everything");
  assert.deepEqual(["Components", "Marketing and content", "App screens and data", "Forms, commerce and documents", "", "Other"].map(api.normCategory), ["components", "marketing", "apps", "forms", undefined, undefined]);
  assert.equal(api.formatOf({ requirements: [] }), "brief");
  assert.equal(api.formatOf({ requirements: [], spec: [] }), "spec");
  assert.deepEqual(api.CATEGORY_FILTERS, ["all", "components", "marketing", "apps", "forms", "classic"]);
});
