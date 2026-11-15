// Grader integration round: one-decimal totals above 100, stored grader results and versions,
// version drift, ungradable submissions, generation constraints, challenge kinds (doc), lessons.
// All grader traffic is a fake fetch in the shapes of grader/service/README.md.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANON, call, setup, signUp, sseResponse } from './helpers.mjs';
import { reloadChallenges } from '../services/challengeStore.js';
import { mapServiceResult } from '../services/grader/index.js';
import { sanitizeHtml } from '../services/models/sanitize.js';
import { pageInstruction } from '../services/kinds.js';

process.env.AUTH_SECRET = 'test-secret-for-sessions-only';
const anon = { 'X-Anon-Id': ANON };
const PAGE = '<!doctype html><html><body><h1>Hello</h1></body></html>';
const run = (prompt, { slug = 'login-card', headers = anon, cookie } = {}) => call('POST', '/api/runs', { body: { slug, prompt, model: 'claude-haiku' }, headers, cookie });
const score = (id, { headers = anon, cookie } = {}) => call('POST', `/api/runs/${id}/score`, { headers, cookie });

// A data folder with the real challenges plus a doc, a site and a marked page challenge.
const dataDir = mkdtempSync(join(tmpdir(), 'pd-data-'));
cpSync(fileURLToPath(new URL('../../web/data', import.meta.url)), dataDir, { recursive: true });
const realData = JSON.parse(JSON.stringify(await import('../../web/data/challenges.json', { with: { type: 'json' } }).then(m => m.default)));
mkdirSync(join(dataDir, 'rubrics'), { recursive: true });
writeFileSync(join(dataDir, 'rubrics', 'readme-doc.json'), JSON.stringify({ criteria: [{ id: 'install', must: 'Says how to install' }] }));
writeFileSync(join(dataDir, 'goals', 'marked-page.html'), '<!doctype html><html><body><h1>Marked</h1></body></html>');
realData.challenges.push(
  { slug: 'readme-doc', title: 'A README', level: 1, brief: 'Write a README.', kind: 'doc', docKind: 'readme' },
  { slug: 'nodoc-yet', title: 'Missing rubric', level: 1, brief: 'x', kind: 'doc' },
  { slug: 'three-pages', title: 'Small site', level: 2, brief: 'Three pages.', kind: 'site' },
  { slug: 'marked-page', title: 'Marked page', level: 1, brief: 'x', marks: { exact: ['Marked'] } },
);
writeFileSync(join(dataDir, 'challenges.json'), JSON.stringify(realData));

// A lessons folder (default place: <data folder>/lessons) in the shape of grader/INTEGRATION.md section 6.
const lessonsDir = join(dataDir, 'lessons');
mkdirSync(lessonsDir, { recursive: true });
writeFileSync(join(lessonsDir, 'index.json'), JSON.stringify([
  { slug: 'skills', title: 'Skills', level: 2, minutes: 25, summary: 'Write a skill.', file: '03-skills.md', bonusChallenge: 'skill-doc', grader: 'doc', order: 3 },
  { slug: 'project-instructions', title: 'Project instructions', level: 1, minutes: 20, summary: 'Write CLAUDE.md.', file: '01-project-instructions.md', bonusChallenge: 'agents-md', grader: 'doc', order: 1 },
  { slug: 'Bad Slug', title: 'x', file: 'x.md', order: 9 },
]));
writeFileSync(join(lessonsDir, '01-project-instructions.md'), '---\ntitle: Project instructions a model actually follows\nslug: project-instructions\nlevel: 1\nminutes: 20\nbonusChallenge: agents-md\n---\n\n# Project instructions\n\nBody text.\n');
writeFileSync(join(lessonsDir, '03-skills.md'), '# Skills\n\nNo front matter here.\n');
writeFileSync(join(lessonsDir, 'challenges.json'), JSON.stringify({ challenges: [
  { slug: 'agents-md', title: 'AGENTS.md for a repo', level: 1, brief: 'Write one.', kind: 'doc', criteria: ['Names the test command.'] },
  { slug: 'skill-plan', title: 'A plan', level: 2, brief: 'Plan it.', kind: 'workflow', lesson: 'skills' },
] }));

process.env.CHALLENGES_DIR = dataDir;
delete process.env.LESSONS_DIR;
reloadChallenges();
after(() => { delete process.env.CHALLENGES_DIR; });

// ------------------------------------------------------------------ 1, 2: totals and result fields

const fullResult = (total, extra = {}) => ({
  version: '0.7.0', total, bonus: 4.2, exactMatch: false,
  pillars: { works: 100, engineering: 88.4, looks: 97.25 },
  engineering: { efficiency: 95, accessibility: 88.4, cleanCode: 100, decidedBy: 'accessibility' },
  feedback: [{ message: 'Old-style line.', points: 3 }],
  criteriaFeedback: [{ message: 'Typography: the heading is 24px, not 28px.', points: 1.25 }, { message: 'Colour: the button is darker.', points: 2.5 }],
  criteria: [{ id: 'typography', name: 'Typography', group: 'looks', value: 0.8, notes: ['Heading size'] }, { id: 'links', name: 'Links', group: 'works', value: null, notes: [] }, 'junk', { id: 'x', group: 'other', value: 7, notes: 'bad' }],
  measurements: { bytes: 1234, huge: 'x'.repeat(100) },
  ...extra,
});

test('mapping: totals keep one decimal up to 120; new fields are read defensively', () => {
  const r = mapServiceResult(fullResult(112.34));
  assert.equal(r.total, 112.3);
  assert.equal(mapServiceResult({ total: 150 }).total, 120);
  assert.deepEqual(r.pillars, [{ id: 'works', label: 'It works', value: 100 }, { id: 'engineering', label: 'Well engineered', value: 88.4 }, { id: 'looks', label: 'Looks like the goal', value: 97.3 }]);
  assert.deepEqual(r.engineering, { efficiency: 95, accessibility: 88.4, cleanCode: 100, decidedBy: 'accessibility' });
  assert.deepEqual([r.bonus, r.exactMatch, r.graderVersion], [4.2, false, '0.7.0']);
  assert.deepEqual(r.costs.map(c => c.points), [2.5, 1.3], 'criteriaFeedback is preferred, one decimal');
  assert.deepEqual(r.criteria, [
    { id: 'typography', name: 'Typography', group: 'looks', value: 0.8, notes: ['Heading size'] },
    { id: 'links', name: 'Links', group: 'works', value: null, notes: [] },
    { id: 'x', name: 'x', group: null, value: 1, notes: [] },
  ]);
  const odd = mapServiceResult({ total: 50, pillars: null, engineering: 5, criteria: 'x', criteriaFeedback: [], feedback: 'nope', bonus: 'b', exactMatch: 'yes', version: 7 });
  assert.deepEqual(odd, { total: 50, checks: [], passedCount: 0, totalChecks: 0, costs: [], provisional: false });
});

test('scores above 100 with decimals: stored, delta, boards, points and tie-breaks have no float noise', async () => {
  const totals = [112.34, 101.2, 100.1, 0.2, 100.3];
  let i = 0;
  setup({ model: PAGE, env: { ANTHROPIC_API_KEY: 'k', GRADER_URL: 'http://grader.test:8080', GRADER_API_KEY: 'k' }, grader: (url) => url.endsWith('/health') ? Response.json({ ok: true, version: '0.7.0' }) : Response.json({ result: fullResult(totals[i++]) }) });
  const amy = await signUp('dec_amy');
  const bob = await signUp('dec_bob');
  const r1 = await run('one', { cookie: amy.cookie, headers: {} });
  assert.equal((await score(r1.headers['x-run-id'], { cookie: amy.cookie, headers: {} })).body.run.result.total, 112.3);
  const r2 = await run('two', { cookie: amy.cookie, headers: {} });
  const s2 = (await score(r2.headers['x-run-id'], { cookie: amy.cookie, headers: {} })).body;
  assert.deepEqual([s2.run.result.total, s2.run.result.delta, s2.attempt.best], [101.2, -11.1, 112.3]);
  // amy: 100.1 on another challenge -> points 112.3 + 100.1 = 212.4; bob: 0.2 then 100.3 there.
  const r3 = await run('three', { slug: 'nav-hero', cookie: amy.cookie, headers: {} });
  await score(r3.headers['x-run-id'], { cookie: amy.cookie, headers: {} });
  for (const p of ['four', 'five']) {
    const r = await run(p, { slug: 'nav-hero', cookie: bob.cookie, headers: { 'X-Forwarded-For': '10.1.1.1' } });
    await score(r.headers['x-run-id'], { cookie: bob.cookie, headers: {} });
  }
  const board = (await call('GET', '/api/leaderboards?slug=nav-hero')).body;
  assert.deepEqual(board.rows.map(r => [r.username, r.score, r.promptCount]), [['dec_bob', 100.3, 2], ['dec_amy', 100.1, 1]]);
  assert.deepEqual(board.graderVersions, ['0.7.0']);
  const overall = (await call('GET', '/api/leaderboards')).body;
  assert.deepEqual(overall.rows.map(r => [r.username, r.score]), [['dec_amy', 212.4], ['dec_bob', 100.3]]);
  const me = (await call('GET', '/api/players/me', { cookie: amy.cookie })).body;
  assert.deepEqual([me.points, me.level, me.bests['login-card']], [212.4, 3, 112.3]);
});

test('the raw grader result is stored and sent only for single runs, without measurements', async () => {
  setup({ model: PAGE, service: true, grader: () => Response.json({ result: fullResult(97.5) }) });
  const r1 = await run('one');
  const s1 = (await score(r1.headers['x-run-id'])).body;
  assert.equal(s1.run.graderResult.version, '0.7.0');
  assert.equal(s1.run.graderResult.measurements, undefined);
  assert.equal(s1.run.result.graderVersion, '0.7.0');
  assert.equal(s1.run.result.criteria.length, 3);
  const r2 = await run('two');
  await score(r2.headers['x-run-id']);
  const current = (await call('GET', '/api/attempts/current?slug=login-card', { headers: anon })).body.attempt;
  assert.equal(current.runs[0].graderResult, undefined);
  assert.equal(current.runs[1].graderResult.total, 97.5);
  assert.equal(current.runs[1].graderResult.measurements, undefined);
  const board = await call('GET', '/api/leaderboards?slug=login-card', { headers: anon });
  assert.doesNotMatch(board.text, /measurements|criteria|graderResult/);
});

// ------------------------------------------------------------------ 3, 4: versions and rejections

test('health passes through the grader version; a run from an older version is graded again', async () => {
  let clock = Date.parse('2026-11-15T10:00:00Z');
  const { state, calls } = setup({ model: PAGE, service: true, now: () => clock });
  const health = (await call('GET', '/api/health')).body;
  assert.equal(health.graderVersion, '0.6.0');
  const { cookie } = await signUp('drift_u');
  const r = await run('page', { cookie, headers: {} });
  const first = (await score(r.headers['x-run-id'], { cookie, headers: {} })).body.run.result;
  assert.equal(first.graderVersion, '0.6.0');
  const gradesBefore = calls.grader.filter(c => c.url.endsWith('/v1/grade/site')).length;
  assert.equal((await score(r.headers['x-run-id'], { cookie, headers: {} })).body.run.result.graderVersion, '0.6.0', 'same version: saved result');
  state.graderVersion = '0.7.0';
  clock += 61_000; // the health cache lasts 60 s
  const again = (await score(r.headers['x-run-id'], { cookie, headers: {} })).body.run.result;
  assert.equal(again.graderVersion, '0.7.0');
  assert.equal(calls.grader.filter(c => c.url.endsWith('/v1/grade/site')).length, gradesBefore + 1);
  assert.deepEqual((await call('GET', '/api/leaderboards?slug=login-card')).body.graderVersions, ['0.7.0']);
  // Unreachable grader: no graderVersion in health.
  setup({ env: { GRADER_URL: 'https://down.test', GRADER_API_KEY: 'k' }, grader: async () => { throw new TypeError('fetch failed'); } });
  assert.equal((await call('GET', '/api/health')).body.graderVersion, undefined);
});

test('an ungradable submission is stored as 0 with the grader\'s reason', async () => {
  const { store } = setup({ model: PAGE, service: true, grader: () => Response.json({ result: { version: '0.6.0', total: 0, error: 'There is no HTML file in the submission.' } }) });
  const r = await run('page');
  const s = await score(r.headers['x-run-id']);
  assert.equal(s.status, 200);
  assert.deepEqual([s.body.run.result.total, s.body.run.result.rejectedReason], [0, 'There is no HTML file in the submission.']);
  assert.equal((await store.getRun(r.headers['x-run-id'])).score, 0);
});

// ------------------------------------------------------------------ 6: generation constraints and clean-up

test('the model is told the grader\'s rendering constraints', async () => {
  const text = pageInstruction({ width: 1280, height: 800 });
  for (const phrase of [/1280 x 800/, /JavaScript turned off/, /network turned off/, /one self-contained HTML file/, /CSS inline/, /inline <svg> or data: URIs/, /no web fonts, CDNs/, /remote images/, /Arial, Georgia, Courier New/]) {
    assert.match(text, phrase);
  }
  const { calls } = setup({ model: PAGE });
  await run('page');
  assert.equal(calls.model[0].body.system, text);
});

test('clean-up keeps inline SVG and data: images, and drops anything remote', () => {
  const svg = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>'
    + '<path d="M0 0L10 10" fill="url(#g)" stroke="url(https://evil.example/a)"/><circle cx="5" cy="5" r="2"/><text x="1" y="9">Hi</text>'
    + '<use href="https://evil.example/s.svg#a"/><use href="#g"/><foreignObject><div>x</div></foreignObject><image href="https://evil.example/i.png"/>'
    + '<animate attributeName="href" to="javascript:alert(1)"/><script>alert(1)</script></svg>';
  const clean = sanitizeHtml(svg);
  assert.match(clean, /^<svg viewbox="0 0 10 10" xmlns="http:\/\/www\.w3\.org\/2000\/svg"><defs><lineargradient id="g"><stop offset="0" stop-color="#f00" \/><\/lineargradient><\/defs>/);
  assert.match(clean, /<path d="M0 0L10 10" fill="url\(#g\)" \/><circle cx="5" cy="5" r="2" \/><text x="1" y="9">Hi<\/text>/);
  assert.match(clean, /<use href="#g" \/>/);
  for (const bad of [/evil\.example/, /foreignobject/i, /<image/, /animate/, /javascript/, /<script/]) assert.doesNotMatch(clean, bad);
  assert.equal(sanitizeHtml(clean), clean);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const data = `<img src="${png}" alt="dot"><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="><div style="background:url(${png}) no-repeat">a</div><style>.b{background-image:url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")}</style>`;
  const kept = sanitizeHtml(data);
  assert.equal(kept.split(png).length - 1, 2);
  assert.match(kept, /src="data:image\/svg\+xml;base64,PHN2Zz48L3N2Zz4="/);
  assert.match(kept, /url\("data:image\/svg\+xml,%3Csvg%3E%3C\/svg%3E"\)/);
  const big = `<img src="data:image/png;base64,${'A'.repeat(210_000)}">`;
  assert.doesNotMatch(sanitizeHtml(big), /src=/, 'oversized data URLs are dropped');
  assert.doesNotMatch(sanitizeHtml('<img src="https://evil.example/x.png"><p style="background:url(//evil.example/y.png)">p</p>'), /evil/);
});

// ------------------------------------------------------------------ 7: kinds

test('kinds: listing shows kind and availability; unbuilt kinds answer 501', async () => {
  setup({ model: PAGE });
  const list = (await call('GET', '/api/challenges')).body.challenges;
  const bySlug = Object.fromEntries(list.map(c => [c.slug, c]));
  assert.deepEqual([bySlug['login-card'].kind, bySlug['login-card'].available], ['page', true]);
  assert.deepEqual([bySlug['readme-doc'].kind, bySlug['readme-doc'].available], ['doc', true]);
  assert.deepEqual([bySlug['three-pages'].kind, bySlug['three-pages'].available], ['site', false]);
  assert.equal(bySlug['nodoc-yet'].available, false);
  assert.equal(bySlug['agents-md'], undefined, 'lesson challenges are not in the main list');
  const detail = (await call('GET', '/api/challenges/three-pages')).body.challenge;
  assert.deepEqual([detail.goalUrl, detail.unavailableReason], [null, 'Multi-page site challenges are not playable yet.']);
  const res = await run('three pages', { slug: 'three-pages' });
  assert.deepEqual([res.status, res.body], [501, { error: 'Multi-page site challenges are not playable yet.' }]);
  assert.equal((await run('x', { slug: 'nodoc-yet' })).status, 501);
  const health = (await call('GET', '/api/health')).body;
  assert.ok(health.problems.some(p => p.includes('rubrics/nodoc-yet.json is missing')));
});

test('doc kind: Markdown stream, stored as text, graded at /v1/grade/doc with the rubric', async () => {
  const md = '```markdown\n# Install\n\nRun `npm ci`.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n```';
  const graded = [];
  const { calls } = setup({
    model: md, service: true,
    grader: (url, init) => { graded.push({ url, body: JSON.parse(init.body) }); return Response.json({ result: { version: '0.8.0', total: 88.8, pillars: { works: 90, engineering: 80, looks: 95 }, criteria: [], feedback: [] } }); },
  });
  const r = await run('Write a README for a CLI tool', { slug: 'readme-doc' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'text/markdown; charset=utf-8');
  assert.equal(r.text, '# Install\n\nRun `npm ci`.\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.match(calls.model[0].body.system, /one Markdown document/);
  const s = await score(r.headers['x-run-id']);
  assert.equal(s.body.run.result.total, 88.8);
  assert.equal(graded[0].url, 'https://grader.test/v1/grade/doc');
  assert.deepEqual(graded[0].body, { kind: 'readme', rubric: { criteria: [{ id: 'install', must: 'Says how to install' }] }, candidate: r.text });
  const current = (await call('GET', '/api/attempts/current?slug=readme-doc', { headers: anon })).body.attempt;
  assert.deepEqual([current.runs[0].kind, current.runs[0].markdown, current.runs[0].html], ['doc', r.text, undefined]);
  // A follow-up includes the previous document.
  await run('Add a usage section', { slug: 'readme-doc' });
  assert.match(calls.model[1].body.messages[0].content, /Here is the current document[\s\S]*<<<PREVIOUS_OUTPUT>>>\n# Install/);
});

test('doc kind without a grader service cannot be scored (503 no_grader); marks go next to the goal', async () => {
  setup({ model: 'Some text.' });
  const r = await run('Write it', { slug: 'readme-doc' });
  const s = await score(r.headers['x-run-id']);
  assert.deepEqual([s.status, s.body.code], [503, 'no_grader']);
  const bodies = [];
  setup({ model: PAGE, service: true, grader: (url, init) => { bodies.push(JSON.parse(init.body)); return Response.json({ result: { total: 70 } }); } });
  const m = await run('page', { slug: 'marked-page' });
  await score(m.headers['x-run-id']);
  assert.deepEqual(bodies[0].marks, { exact: ['Marked'] });
  const p = await run('page');
  await score(p.headers['x-run-id']);
  assert.equal('marks' in bodies[1], false);
});

// ------------------------------------------------------------------ 8: lessons

test('lessons: list sorted by order, one lesson with parsed front matter, bonus challenges on request', async () => {
  setup({ model: PAGE });
  const list = (await call('GET', '/api/lessons')).body.lessons;
  assert.deepEqual(list.map(l => [l.slug, l.order]), [['project-instructions', 1], ['skills', 3]]);
  const one = (await call('GET', '/api/lessons/project-instructions')).body.lesson;
  assert.deepEqual([one.title, one.fields.title, one.fields.minutes, one.fields.bonusChallenge], ['Project instructions', 'Project instructions a model actually follows', 20, 'agents-md']);
  assert.ok(one.markdown.startsWith('# Project instructions'));
  assert.deepEqual((await call('GET', '/api/lessons/skills')).body.lesson.fields, {});
  assert.equal((await call('GET', '/api/lessons/nope')).status, 404);
  const withLessons = (await call('GET', '/api/challenges?include=lessons')).body.challenges;
  const agents = withLessons.find(c => c.slug === 'agents-md');
  assert.deepEqual([agents.lesson, agents.kind, agents.available], ['project-instructions', 'doc', false]);
  assert.equal(withLessons.find(c => c.slug === 'skill-plan').lesson, 'skills');
  assert.deepEqual((await call('GET', '/api/challenges/agents-md')).body.challenge.criteria, ['Names the test command.']);
  assert.ok((await call('GET', '/api/health')).body.problems.some(p => p.startsWith('Lesson "Bad Slug"')));
});

test('lessons: LESSONS_DIR overrides the default; an absent folder gives an empty list and 404s', async () => {
  process.env.LESSONS_DIR = join(tmpdir(), 'pd-no-such-lessons-folder');
  reloadChallenges();
  try {
    setup({ model: PAGE });
    assert.deepEqual((await call('GET', '/api/lessons')).body, { lessons: [] });
    assert.equal((await call('GET', '/api/lessons/skills')).status, 404);
    assert.equal((await call('GET', '/api/challenges?include=lessons')).body.challenges.some(c => c.lesson), false);
  } finally {
    delete process.env.LESSONS_DIR;
    reloadChallenges();
  }
});
