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
  assert.deepEqual(availableModels({ OPENAI_API_KEY: ' ', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }).map(m => m.id), ['claude-haiku']);
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

// A raw SSE Response from text; when keepOpen is set the stream never closes.
function rawResponse(text, { keepOpen = false, status = 200 } = {}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      if (!keepOpen) controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
}

test('OpenAI: response.completed ends the stream even if the connection stays open', async () => {
  const chunk = d => `data: ${JSON.stringify(d)}\n\n`;
  const { text } = await collect('openai-mini', { OPENAI_API_KEY: 'ok' }, rawResponse(
    chunk({ type: 'response.created' })
    + chunk({ type: 'response.output_text.delta', delta: '<p>A' })
    + chunk({ type: 'response.output_text.delta', delta: 'B</p>' })
    + chunk({ type: 'response.completed' }),
    { keepOpen: true },
  ));
  assert.equal(text, '<p>AB</p>');
});

test('OpenAI: CRLF-separated events and a last event without a blank line', async () => {
  const chunk = d => `data: ${JSON.stringify(d)}`;
  const { text } = await collect('openai-mini', { OPENAI_API_KEY: 'ok' }, rawResponse(
    chunk({ type: 'response.output_text.delta', delta: '<p>' }) + '\r\n\r\n'
    + chunk({ type: 'response.output_text.delta', delta: 'x</p>' }),
  ));
  assert.equal(text, '<p>x</p>');
});

test('OpenAI: a non-200 answer fails fast with a plain message', async () => {
  const started = Date.now();
  await assert.rejects(collect('openai-mini', { OPENAI_API_KEY: 'ok' }, rawResponse('{"error":{"code":404}}', { status: 404, keepOpen: true })),
    { name: 'ModelError', message: 'The model service refused the request (404). Try again or pick another model.' });
  assert.ok(Date.now() - started < 1000);
});

const delta = d => ({ event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: d } });
const incomplete = reason => ({ event: 'response.incomplete', data: { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason } } } });

// Captures console.error lines while fn runs.
async function withErrorLog(fn) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try { return { result: await fn().catch(e => e), lines }; } finally { console.error = original; }
}

test('OpenAI: request carries low reasoning effort and the cap plus the reasoning allowance', async () => {
  const seen = [];
  const fetch = async (url, init) => { seen.push(init); return sseResponse([{ event: 'response.completed', data: { type: 'response.completed' } }]); };
  const model = MODELS.find(m => m.id === 'openai-mini');
  for await (const _ of generate({ model, system: 'S', user: 'U', env: { OPENAI_API_KEY: 'ok' }, fetch, maxOutputTokens: 6000 })) { /* drain */ }
  const body = JSON.parse(seen[0].body);
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.max_output_tokens, 6000 + 8000);
});

test('OpenAI: incomplete at the token cap with a complete document is accepted', async () => {
  const { text } = await collect('openai-mini', { OPENAI_API_KEY: 'ok' }, sseResponse([
    delta('<!doctype html><html><body><p>Hi</p></body>'), delta('</html>\n'), incomplete('max_output_tokens'),
  ]));
  assert.equal(text, '<!doctype html><html><body><p>Hi</p></body></html>\n');
});

test('OpenAI: incomplete at the token cap without a closing tag fails with the room message', async () => {
  const { result, lines } = await withErrorLog(() => collect('openai-mini', { OPENAI_API_KEY: 'ok' }, sseResponse([
    delta('<!doctype html><html><body><p>Hi'), incomplete('max_output_tokens'),
  ])));
  assert.equal(result.name, 'ModelError');
  assert.equal(result.message, 'The model ran out of room. Shorten the prompt or ask for less.');
  assert.ok(lines.some(l => l.includes('max_output_tokens')));
});

test('OpenAI: an error event is surfaced with its code in the log line', async () => {
  const { result, lines } = await withErrorLog(() => collect('openai-mini', { OPENAI_API_KEY: 'secret-key' }, sseResponse([
    delta('<p>'), { event: 'error', data: { type: 'error', code: 'server_error', message: 'boom USER' } },
  ])));
  assert.equal(result.message, 'The model stopped with an error. Run again.');
  assert.ok(lines.some(l => l.includes('openai-mini') && l.includes('server_error')));
  assert.ok(!lines.some(l => l.includes('secret-key') || l.includes('USER')));
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
