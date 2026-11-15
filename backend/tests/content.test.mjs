// Brief-format challenges with acceptance statements and content: the content goes to the model with
// every page run, server-only fields never reach a response, the prompt-limit rule, and the gated
// prompt copy check.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANON, call, setup } from './helpers.mjs';
import { HIDDEN_FIELDS, computedPromptLimit, effectivePromptLimit, getChallengeFile, reloadChallenges } from '../services/challengeStore.js';
import { CONTENT_HEADING, MARKERS, pageMessage } from '../services/kinds.js';
import { PROMPT_CHECK_FALLBACK, challengeTexts } from '../services/grader/index.js';

process.env.AUTH_SECRET = 'test-secret-for-sessions-only';
delete process.env.LESSONS_DIR;
const realDir = fileURLToPath(new URL('../../web/data', import.meta.url));
const FILE = JSON.parse(readFileSync(join(realDir, 'challenges.json'), 'utf8')).challenges;
const GOAL = readFileSync(join(realDir, 'goals', 'login-card.html'), 'utf8');
const anon = { 'X-Anon-Id': ANON };
const run = (prompt, slug = 'login-card') => call('POST', '/api/runs', { body: { slug, prompt, model: 'claude-haiku' }, headers: anon });
after(() => { delete process.env.CHALLENGES_DIR; });

function hiddenKeys(value, path = '$', found = []) {
  if (Array.isArray(value)) value.forEach((v, i) => hiddenKeys(v, `${path}[${i}]`, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (HIDDEN_FIELDS.includes(k)) found.push(`${path}.${k}`);
      hiddenKeys(v, `${path}.${k}`, found);
    }
  }
  return found;
}

test('real file: 50 entries load with acceptance and content; no response carries a server-only field', async () => {
  process.env.CHALLENGES_DIR = realDir;
  const data = reloadChallenges();
  assert.equal(FILE.length, 53);
  assert.equal(data.challenges.length, 50);
  assert.deepEqual(data.problems, []);
  setup({ model: 'x' });
  const responses = [await call('GET', '/api/challenges'), await call('GET', '/api/challenges?include=lessons')];
  for (const c of FILE) responses.push(await call('GET', `/api/challenges/${c.slug}`));
  for (const res of responses) {
    assert.equal(res.status, 200);
    assert.deepEqual(hiddenKeys(res.body), []);
  }
  const listed = responses[0].body.challenges;
  assert.ok(listed.every(c => c.brief && c.acceptance.length >= 3 && c.acceptance.length <= 5 && c.content));
  const detail = responses[2].body.challenge;
  assert.deepEqual(Object.keys(detail).filter(k => k !== 'cost').sort(), ['acceptance', 'available', 'brief', 'category', 'content', 'format', 'goalUrl', 'kind', 'level', 'levelLabel', 'maxOutputTokens', 'maxPromptChars', 'models', 'simulated', 'slug', 'solvedCount', 'title', 'topScore', 'viewport', 'yourBest', 'yourBestPrompts']);
  assert.ok(getChallengeFile(FILE[0].slug).keyFacts.length > 0, 'kept on the server for intent grading');
});

test('the content block follows the prompt on first and follow-up runs; challengeTexts never holds it', async () => {
  const challenge = getChallengeFile('login-card');
  const block = `${CONTENT_HEADING}\n${MARKERS.content[0]}\n${challenge.content}\n${MARKERS.content[1]}`;
  const first = pageMessage('A calm card', null, challenge);
  const followUp = pageMessage('Make it rough', 'p'.repeat(100_000), challenge);
  for (const msg of [first, followUp]) {
    assert.ok(msg.endsWith(`${MARKERS.prompt[1]}\n\n${block}`));
    assert.ok(msg.indexOf(MARKERS.prompt[1]) < msg.indexOf(CONTENT_HEADING));
  }
  assert.ok(followUp.length <= 40_000 + 1000, 'the previous page is cut, not the prompt or the content');
  assert.equal(pageMessage('x', null, { content: null }).includes(CONTENT_HEADING), false);

  const texts = challengeTexts(challenge);
  assert.deepEqual(texts, [challenge.brief, ...challenge.acceptance]);
  assert.equal(texts.some(t => t.includes(challenge.content)), false);

  const { calls } = setup({ model: GOAL });
  assert.equal((await run('A calm sign-in card')).status, 200);
  assert.equal((await run('Make the button wider')).status, 200);
  for (const c of calls.model) assert.ok(c.body.messages[0].content.endsWith(block));
  assert.match(calls.model[0].body.system, /use that content exactly as written/);
  assert.match(calls.model[0].body.system, /layout and styling direction from the player's request/);
});

test('limit rule: brief plus acceptance only; the larger of rule and explicit wins', () => {
  const c = { brief: 'b'.repeat(2000), acceptance: ['a'.repeat(200), 'a'.repeat(200), 'a'.repeat(200)], content: 'c'.repeat(5000), keyFacts: ['k'.repeat(3000)], requirements: [{ id: 'r1', text: 'r'.repeat(500), kind: 'content', exact: true }] };
  const rule = computedPromptLimit(c.brief, [], c.acceptance); // 2600 x 1.5 + 1000 = 4900 -> 5000
  assert.equal(rule, 5000);
  assert.equal(effectivePromptLimit(c), 5000);
  assert.equal(effectivePromptLimit({ ...c, maxPromptChars: 6000 }), 6000);
  assert.equal(effectivePromptLimit({ ...c, maxPromptChars: 3500 }), 5000);
});

// ------------------------------------------------------------------ copy check
function graderWith({ health = { version: '1' }, check }) {
  const checks = [];
  const grader = async (url, init) => {
    if (url.endsWith('/health')) return Response.json(health);
    if (url.endsWith('/v1/check/prompt')) {
      checks.push({ body: JSON.parse(init.body), auth: init.headers.Authorization });
      return check();
    }
    return Response.json({ result: { total: 80 } });
  };
  return { grader, checks };
}
const svc = extra => ({ ANTHROPIC_API_KEY: 'k', GRADER_URL: 'https://grader.test', GRADER_API_KEY: 'gk', ...extra });

test('copy check: off by default, on by env or health; a refusal is a 400 that counts nothing; failures let the run through', async () => {
  const refuse = () => Response.json({ result: { ok: false, message: 'That reads like the brief. Say it your way.' } });

  const off = graderWith({ check: refuse });
  let s = setup({ env: svc(), model: GOAL, grader: off.grader });
  assert.equal((await run('A calm sign-in card')).status, 200);
  assert.equal(off.checks.length, 0, 'not sent by default');

  const on = graderWith({ check: refuse });
  s = setup({ env: svc({ GRADER_PROMPT_CHECK: 'on' }), model: GOAL, grader: on.grader });
  const refused = await run('A calm sign-in card');
  assert.deepEqual([refused.status, refused.body.error], [400, 'That reads like the brief. Say it your way.']);
  assert.equal(s.calls.model.length, 0);
  assert.deepEqual((await call('GET', '/api/attempts/current?slug=login-card', { headers: anon })).body, { attempt: null });
  const c = getChallengeFile('login-card');
  assert.deepEqual(on.checks[0].body, { prompt: 'A calm sign-in card', challengeTexts: [c.brief, ...c.acceptance] });
  assert.equal(on.checks[0].auth, 'Bearer gk');

  const bare = graderWith({ check: () => Response.json({ result: { ok: false } }) });
  setup({ env: svc({ GRADER_PROMPT_CHECK: 'on' }), model: GOAL, grader: bare.grader });
  assert.equal((await run('A calm sign-in card')).body.error, PROMPT_CHECK_FALLBACK);

  const byHealth = graderWith({ health: { version: '2', features: ['promptCheck'] }, check: refuse });
  setup({ env: svc(), model: GOAL, grader: byHealth.grader });
  assert.equal((await run('A calm sign-in card')).status, 400);
  const forcedOff = graderWith({ health: { version: '2', promptCheck: true }, check: refuse });
  setup({ env: svc({ GRADER_PROMPT_CHECK: 'off' }), model: GOAL, grader: forcedOff.grader });
  assert.equal((await run('A calm sign-in card')).status, 200);
  assert.equal(forcedOff.checks.length, 0);

  for (const check of [() => new Response('boom', { status: 500 }), () => { throw new Error('down'); }, () => new Response('not json')]) {
    const broken = graderWith({ check });
    s = setup({ env: svc({ GRADER_PROMPT_CHECK: 'on' }), model: GOAL, grader: broken.grader });
    assert.equal((await run('A calm sign-in card')).status, 200);
    assert.equal(broken.checks.length, 1);
    assert.equal(s.calls.model.length, 1);
  }
  const fine = graderWith({ check: () => Response.json({ result: { ok: true } }) });
  setup({ env: svc({ GRADER_PROMPT_CHECK: 'on' }), model: GOAL, grader: fine.grader });
  assert.equal((await run('A calm sign-in card')).status, 200);
});

test('validation: acceptance must be 3 to 5 texts and content non-empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  mkdirSync(join(dir, 'goals'));
  const base = { title: 'T', level: 1, brief: 'A brief.', requirements: [{ id: 'r1', text: 't', kind: 'content', exact: true }] };
  const entries = {
    'good-one': { acceptance: ['a', 'b', 'c'], content: 'Heading: Hi' },
    'two-acceptance': { acceptance: ['a', 'b'], content: 'x' },
    'six-acceptance': { acceptance: ['a', 'b', 'c', 'd', 'e', 'f'], content: 'x' },
    'blank-acceptance': { acceptance: ['a', ' ', 'c'], content: 'x' },
    'empty-content': { acceptance: ['a', 'b', 'c'], content: '  ' },
    'huge-content': { acceptance: ['a', 'b', 'c'], content: 'x'.repeat(10_001) },
  };
  for (const slug of Object.keys(entries)) writeFileSync(join(dir, 'goals', `${slug}.html`), '<!doctype html><p>goal</p>');
  writeFileSync(join(dir, 'challenges.json'), JSON.stringify({ challenges: Object.entries(entries).map(([slug, e]) => ({ slug, ...base, ...e })) }));
  process.env.CHALLENGES_DIR = dir;
  const data = reloadChallenges();
  assert.deepEqual(data.challenges.map(c => c.slug), ['good-one']);
  assert.equal(data.problems.length, 5);
  assert.ok(data.problems.filter(p => /acceptance must be/.test(p)).length === 3 && data.problems.filter(p => /content must be/.test(p)).length === 2);
});
