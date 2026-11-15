// Brief-format challenges (brief + requirements + keyFacts + designNotes, no pixel spec) next to the
// old spec format, the category filter, exactSpec never leaving the server, and intent grading.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, setup } from './helpers.mjs';
import { computedPromptLimit, getChallengeFile, reloadChallenges } from '../services/challengeStore.js';
import { gradeRun } from '../services/grader/index.js';

const realDir = fileURLToPath(new URL('../../web/data', import.meta.url));
const FILE = JSON.parse(readFileSync(join(realDir, 'challenges.json'), 'utf8')).challenges;
delete process.env.LESSONS_DIR;
after(() => { delete process.env.CHALLENGES_DIR; });

test('real file: every entry loads, category filter, brief and spec detail shapes', async () => {
  process.env.CHALLENGES_DIR = realDir;
  reloadChallenges();
  setup({ model: 'x' });
  const list = (await call('GET', '/api/challenges')).body.challenges;
  assert.equal(list.length, FILE.length);
  assert.ok(FILE.length >= 50);
  const brief = list.find(c => c.slug === 'contact-form');
  assert.equal(brief.format, 'brief');
  assert.equal(brief.category, 'Forms, commerce and documents');
  assert.equal(list.filter(c => c.format === 'spec').length, FILE.filter(c => !c.requirements).length);
  const comps = (await call('GET', '/api/challenges?category=components')).body.challenges;
  assert.equal(comps.length, FILE.filter(c => c.category === 'Components').length);
  assert.ok(comps.length > 0 && comps.every(c => c.category === 'Components'));
  assert.equal((await call('GET', '/api/challenges?category=nothing-like-this')).body.challenges.length, 0);

  const detail = (await call('GET', '/api/challenges/contact-form')).body.challenge;
  const entry = FILE.find(c => c.slug === 'contact-form');
  assert.equal(detail.brief, entry.brief);
  assert.deepEqual(detail.requirements, entry.requirements);
  assert.deepEqual(detail.keyFacts, entry.keyFacts);
  assert.deepEqual(detail.designNotes, entry.designNotes);
  assert.equal('spec' in detail, false);
  // The rewritten originals are briefs; their grader-only exactSpec stays on the server.
  // (The spec format is covered by the fixture test below.)
  const orig = (await call('GET', '/api/challenges/login-card')).body.challenge;
  assert.equal(orig.format, 'brief');
  assert.ok(orig.requirements.length > 0);
  assert.equal('exactSpec' in orig, false);
  assert.equal('spec' in orig, false);
});

test('both shapes load from one file; exactSpec never appears; bad entries are reported; the limit rule', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'briefs-'));
  mkdirSync(join(dir, 'goals'));
  for (const slug of ['old-one', 'new-one', 'bad-one']) writeFileSync(join(dir, 'goals', `${slug}.html`), '<!doctype html><p>goal</p>');
  const requirements = [
    { id: 'r1', text: 'The page has one heading, "Hello there"', kind: 'content', exact: true },
    { id: 'r2', text: 'Calm and clean', kind: 'style', exact: false },
  ];
  const brief = 'A small welcome card. '.repeat(100);
  const keyFacts = ['Hello there', 'Sign up'];
  const designNotes = ['calm', 'one accent colour'];
  const secret = [{ group: 'Secret', items: [{ label: 'Card width', value: 'EXACT-SPEC-480px' }] }];
  writeFileSync(join(dir, 'challenges.json'), JSON.stringify({ challenges: [
    { slug: 'old-one', title: 'Old', level: 1, brief: 'Old brief', spec: [{ group: 'Box', items: [{ label: 'Width', value: '400px' }] }] },
    { slug: 'new-one', title: 'New', level: 2, category: 'Components', brief, requirements, keyFacts, designNotes, exactSpec: secret, maxPromptChars: 2000 },
    { slug: 'bad-one', title: 'Bad', level: 1, brief: 'x', requirements: [{ id: 'r1', text: 't', kind: 'colour', exact: true }] },
  ] }));
  process.env.CHALLENGES_DIR = dir;
  reloadChallenges();
  setup({ model: 'x' });

  const list = await call('GET', '/api/challenges');
  assert.deepEqual(list.body.challenges.map(c => [c.slug, c.format]), [['old-one', 'spec'], ['new-one', 'brief']]);
  const detail = await call('GET', '/api/challenges/new-one');
  for (const res of [list, detail, await call('GET', '/api/challenges?include=lessons')]) {
    assert.doesNotMatch(res.text, /exactSpec|EXACT-SPEC/);
  }
  assert.deepEqual(getChallengeFile('new-one').exactSpec, secret, 'kept on the server only');
  const health = (await call('GET', '/api/health')).body;
  assert.ok(health.problems.some(p => /bad-one/.test(p) && /kind must be one of/.test(p)));

  // Rule: brief + requirement texts + key facts + design notes, x 1.5 + 1000, up to the next 500.
  const count = brief.length + requirements.reduce((n, r) => n + r.text.length, 0) + keyFacts.join('').length + designNotes.join('').length;
  const expected = Math.min(12000, Math.max(2000, Math.ceil((count * 1.5 + 1000) / 500) * 500));
  assert.equal(computedPromptLimit(brief, [], [...requirements.map(r => r.text), ...keyFacts, ...designNotes]), expected);
  assert.ok(expected > 2000);
  assert.equal(detail.body.challenge.maxPromptChars, expected, 'larger of the rule and the explicit 2000');
});

// ------------------------------------------------------------------ intent grading
const okResult = { result: { total: 80, pillars: { works: 90, engineering: 80, looks: 70 } } };
const page = { kind: 'page', goalHtml: '<p>goal</p>', keyFacts: ['Hello there', 'Sign up'] };

function fakeGrader({ health = { version: '1.0.0' }, refuseIntent = false } = {}) {
  const grades = [];
  const healthCalls = [];
  const fetch = async (url, init = {}) => {
    if (String(url).endsWith('/health')) { healthCalls.push(url); return Response.json(health); }
    const body = JSON.parse(init.body);
    grades.push(body);
    if (refuseIntent && 'intent' in body) return Response.json({ error: 'unknown field intent' }, { status: 400 });
    return Response.json(okResult);
  };
  return { fetch, grades, healthCalls };
}
const env = extra => ({ GRADER_URL: 'https://grader.test', GRADER_API_KEY: 'k', ...extra });

test('intent: not sent by default (old grader health), sent with GRADER_INTENT=on or a health feature', async () => {
  const plain = fakeGrader();
  const r1 = await gradeRun({ challenge: page, output: '<p>x</p>', env: env(), fetch: plain.fetch });
  assert.equal('intent' in plain.grades[0], false);
  assert.equal(r1.intentGraded, false);

  const on = fakeGrader();
  const r2 = await gradeRun({ challenge: page, output: '<p>x</p>', env: env({ GRADER_INTENT: 'on' }), fetch: on.fetch });
  assert.deepEqual(on.grades[0].intent, { 'index.html': { keyFacts: ['Hello there', 'Sign up'] } });
  assert.equal(r2.intentGraded, true);

  for (const health of [{ version: '2', intent: true }, { version: '2', features: ['intent'] }]) {
    const auto = fakeGrader({ health });
    const r = await gradeRun({ challenge: page, output: '<p>x</p>', env: env(), fetch: auto.fetch });
    assert.ok(auto.grades[0].intent);
    assert.equal(r.intentGraded, true);
  }

  const off = fakeGrader({ health: { version: '2', intent: true } });
  await gradeRun({ challenge: page, output: '<p>x</p>', env: env({ GRADER_INTENT: 'off' }), fetch: off.fetch });
  assert.equal('intent' in off.grades[0], false);

  const noFacts = fakeGrader();
  await gradeRun({ challenge: { kind: 'page', goalHtml: 'g' }, output: 'c', env: env({ GRADER_INTENT: 'on' }), fetch: noFacts.fetch });
  assert.equal('intent' in noFacts.grades[0], false);
  assert.equal(noFacts.healthCalls.length, 0, 'no health call for a challenge without keyFacts');
});

test('intent: a 400 with intent is retried once without it, and not sent again from this instance', async () => {
  const g = fakeGrader({ refuseIntent: true });
  const r = await gradeRun({ challenge: page, output: '<p>x</p>', env: env({ GRADER_INTENT: 'on' }), fetch: g.fetch });
  assert.equal(g.grades.length, 2);
  assert.ok(g.grades[0].intent);
  assert.equal('intent' in g.grades[1], false);
  assert.equal(r.total, 80);
  assert.equal(r.intentGraded, false);
  assert.equal(r.provisional, false);
  await gradeRun({ challenge: page, output: '<p>x</p>', env: env({ GRADER_INTENT: 'on' }), fetch: g.fetch });
  assert.equal(g.grades.length, 3);
  assert.equal('intent' in g.grades[2], false);
});
