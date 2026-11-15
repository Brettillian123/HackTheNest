// The real lessons in web/data/lessons (copied from lessons/) and their bonus challenges, with the
// doc and workflow kinds run and scored against a fake grader in the shapes of grader/service/README.md.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ANON, call, setup } from './helpers.mjs';
import { reloadChallenges } from '../services/challengeStore.js';

process.env.AUTH_SECRET = 'test-secret-for-sessions-only';
const dataDir = fileURLToPath(new URL('../../web/data', import.meta.url));
process.env.CHALLENGES_DIR = dataDir;
delete process.env.LESSONS_DIR;
reloadChallenges();
after(() => { delete process.env.CHALLENGES_DIR; });

const anon = { 'X-Anon-Id': ANON };
const run = (slug, prompt) => call('POST', '/api/runs', { body: { slug, prompt, model: 'claude-haiku' }, headers: anon });
const score = id => call('POST', `/api/runs/${id}/score`, { headers: anon });
const rubric = slug => JSON.parse(readFileSync(`${dataDir}/rubrics/${slug}.json`, 'utf8'));

test('real lessons: 8 load in order, each with its bonus challenge linked and the right kind', async () => {
  setup({ model: 'x' });
  const lessons = (await call('GET', '/api/lessons')).body.lessons;
  assert.equal(lessons.length, 8);
  assert.deepEqual(lessons.map(l => l.order), [1, 2, 3, 4, 5, 6, 7, 8]);
  const all = (await call('GET', '/api/challenges?include=lessons')).body.challenges;
  const bonus = all.filter(c => c.lesson);
  assert.equal(bonus.length, 8);
  for (const l of lessons) {
    const c = bonus.find(b => b.slug === l.bonusChallenge);
    assert.ok(c, `${l.slug} links to ${l.bonusChallenge}`);
    assert.deepEqual([c.lesson, c.kind], [l.slug, l.grader]);
    const one = (await call('GET', `/api/lessons/${l.slug}`)).body.lesson;
    assert.equal(one.fields.bonusChallenge, l.bonusChallenge);
    assert.ok(one.markdown.startsWith('# '));
  }
  assert.deepEqual(bonus.filter(c => c.kind === 'workflow').map(c => c.slug).sort(), ['fix-loop-plan', 'three-page-site-plan']);
  assert.deepEqual(bonus.filter(c => c.available).map(c => c.slug).sort(), ['fix-loop-plan', 'release-notes-skill', 'three-page-site-plan']);
  const problems = (await call('GET', '/api/health')).body.problems;
  assert.equal(problems.some(p => p.includes('bonus challenge')), false);
});

test('a bonus challenge without a rubric is listed as unavailable with a plain reason, and runs answer 501', async () => {
  setup({ model: 'x' });
  const c = (await call('GET', '/api/challenges/agents-md-for-a-repo')).body.challenge;
  assert.deepEqual([c.available, c.unavailableReason], [false, 'The grader rubric for this challenge has not been written yet.']);
  assert.equal((await run('agents-md-for-a-repo', 'Write it')).status, 501);
});

test('doc: release-notes-skill runs as Markdown and is graded at /v1/grade/doc with kind "skill"', async () => {
  const graded = [];
  setup({
    model: '---\nname: release-notes\n---\n# Release notes',
    service: true,
    grader: (url, init) => { graded.push({ url, body: JSON.parse(init.body) }); return Response.json({ result: { version: '1.0.0', kind: 'skill', total: 86.5, pillars: { works: 88.3, looks: 100, engineering: 84.7 }, criteria: [{ id: 'keyFacts', name: 'Key facts', group: 'works', value: 0.883, notes: [] }], feedback: [{ message: 'The Steps section is missing git log.', points: 5.8 }], words: 127 } }); },
  });
  const r = await run('release-notes-skill', 'Write the skill');
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'text/markdown; charset=utf-8');
  const s = await score(r.headers['x-run-id']);
  assert.equal(graded[0].url, 'https://grader.test/v1/grade/doc');
  assert.deepEqual(graded[0].body, { kind: 'skill', rubric: rubric('release-notes-skill'), candidate: r.text });
  assert.equal(s.body.run.result.total, 86.5);
  assert.deepEqual(s.body.run.result.costs, [{ points: 5.8, message: 'The Steps section is missing git log.' }]);
});

test('workflow: the plan streams as text, is stored in markdown, and is graded at /v1/grade/workflow', async () => {
  const plan = { goal: 'parse_price', steps: [{ id: 'build', title: 'Build', owner: 'builder', dependsOn: [], changes: ['src/price.py'], proof: 'pytest', budget: { toolCalls: 20 } }], loops: [] };
  const graded = [];
  const { calls } = setup({
    model: '```json\n' + JSON.stringify(plan) + '\n```',
    service: true,
    grader: (url, init) => { graded.push({ url, body: JSON.parse(init.body) }); return Response.json({ result: { version: 'workflow-1', total: 80, pillars: { works: 80, looks: 90, engineering: 70 }, criteria: [], feedback: [] } }); },
  });
  const r = await run('fix-loop-plan', 'Plan the fix loop');
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'text/plain; charset=utf-8');
  assert.deepEqual(JSON.parse(r.text), plan);
  assert.match(calls.model[0].body.system, /plan as one JSON object/);
  const s = await score(r.headers['x-run-id']);
  assert.equal(graded[0].url, 'https://grader.test/v1/grade/workflow');
  assert.deepEqual(graded[0].body, { rubric: rubric('fix-loop-plan'), candidate: r.text });
  assert.equal(s.body.run.result.total, 80);
  const current = (await call('GET', '/api/attempts/current?slug=fix-loop-plan', { headers: anon })).body.attempt;
  assert.equal(current.runs.at(-1).markdown, r.text);

  // A reply that is not JSON scores 0 with a plain reason and never reaches the grader.
  setup({ model: 'Here is my plan: step one, build it.', service: true, grader: () => { throw new Error('grader must not be called'); } });
  const bad = await run('three-page-site-plan', 'Plan the site');
  const sb = await score(bad.headers['x-run-id']);
  assert.equal(sb.body.run.result.total, 0);
  assert.match(sb.body.run.result.rejectedReason, /not.*valid JSON/);
});
