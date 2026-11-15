import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sseResponse } from './helpers.mjs';
import { MODELS, availableModels, generate } from '../services/models/index.js';
import { reloadChallenges } from '../services/challengeStore.js';

async function collect(modelId, env, response) {
  const seen = [];
  const fetch = async (url, init) => { seen.push({ url, init }); return response; };
  const model = MODELS.find(m => m.id === modelId);
  let text = '';
  for await (const piece of generate({ model, system: 'SYS', user: 'USER', env, fetch })) text += piece;
  return { text, request: seen[0] };
}

test('providers are enabled only by their keys', () => {
  assert.deepEqual(availableModels({}), []);
  assert.deepEqual(availableModels({ OPENAI_API_KEY: ' ', GEMINI_API_KEY: 'g' }).map(m => m.id), ['gemini-flash']);
});

test('OpenAI: Responses API request and streamed text deltas', async () => {
  const { text, request } = await collect('openai-mini', { OPENAI_API_KEY: 'ok', OPENAI_MODEL: 'custom-mini' }, sseResponse([
    { event: 'response.created', data: { type: 'response.created' } },
    { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: '<p>Hi' } },
    { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: '</p>' } },
    { event: 'response.completed', data: { type: 'response.completed' } },
  ]));
  assert.equal(text, '<p>Hi</p>');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.init.headers.Authorization, 'Bearer ok');
  const body = JSON.parse(request.init.body);
  assert.deepEqual([body.model, body.instructions, body.input, body.stream], ['custom-mini', 'SYS', 'USER', true]);
});

test('Gemini: streamGenerateContent request and candidate text', async () => {
  const { text, request } = await collect('gemini-flash', { GEMINI_API_KEY: 'gk' }, sseResponse([
    { data: { candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: '<h1>' }] } }] } },
    { data: { candidates: [{ content: { parts: [{ text: 'Hello</h1>' }] } }] } },
  ]));
  assert.equal(text, '<h1>Hello</h1>');
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
  assert.equal(request.init.headers['x-goog-api-key'], 'gk');
  const body = JSON.parse(request.init.body);
  assert.equal(body.systemInstruction.parts[0].text, 'SYS');
  assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'USER' }] }]);
});

test('Anthropic: an error event becomes a plain error', async () => {
  await assert.rejects(collect('claude-haiku', { ANTHROPIC_API_KEY: 'ak' }, sseResponse([
    { event: 'content_block_delta', data: { type: 'content_block_delta', delta: { type: 'text_delta', text: '<p>' } } },
    { event: 'error', data: { type: 'error', error: { type: 'overloaded_error' } } },
  ])), { name: 'ModelError', message: 'The model stopped with an error. Run again.' });
});

test('bad challenge entries are skipped and reported, not fatal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-challenges-'));
  mkdirSync(join(dir, 'goals'));
  writeFileSync(join(dir, 'goals', 'good-one.html'), '<html><body><h1>Good</h1></body></html>');
  writeFileSync(join(dir, 'challenges.json'), JSON.stringify({
    levels: { 1: 'Easy' },
    challenges: [
      { slug: 'good-one', title: 'Good', level: 1, brief: 'Fine.', spec: [] },
      { slug: 'Bad Slug', title: 'x', level: 1, brief: '' },
      { slug: 'no-goal', title: 'No goal', level: 1, brief: 'Missing file.' },
      { slug: 'good-one', title: 'Again', level: 1, brief: 'Duplicate.' },
      { slug: 'no-level', title: 'No level', brief: 'x' },
    ],
  }));
  process.env.CHALLENGES_DIR = dir;
  try {
    const data = reloadChallenges();
    assert.deepEqual(data.challenges.map(c => c.slug), ['good-one']);
    assert.equal(data.challenges[0].levelLabel, 'Easy');
    assert.equal(data.problems.length, 4);
    assert.ok(data.problems.some(p => p.includes('goals/no-goal.html is missing')));
  } finally {
    delete process.env.CHALLENGES_DIR;
    reloadChallenges();
  }
});
