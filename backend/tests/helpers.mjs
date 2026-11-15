// Test helpers: fake request/response objects that drive the real router end to end, an
// in-memory store wired in place of MongoDB, and fake fetch responses for models and the grader.
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { handleApiRequest } from '../route/api.js';
import { setDatabaseOverride } from '../config/database.js';
import { setDeps } from '../services/deps.js';
import { MemoryStore } from '../store/memoryStore.js';

export const ANON = 'anon_test_player_0001';
export const ANON2 = 'anon_test_player_0002';

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.headersSent = false;
    this.chunks = [];
    this.writesBeforeHeaders = 0;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) {
    this.statusCode = status;
    for (const [k, v] of Object.entries(headers)) this.headers[k.toLowerCase()] = v;
    this.headersSent = true;
    return this;
  }
  write(chunk) {
    if (!this.headersSent) this.writesBeforeHeaders += 1;
    this.headersSent = true;
    this.chunks.push(String(chunk));
    return true;
  }
  end(chunk) {
    if (chunk !== undefined && chunk !== null) this.write(chunk);
    this.headersSent = true;
    this.writableEnded = true;
    this.emit('finish');
    this.emit('close');
    this.resolveDone();
    return this;
  }
}

export async function call(method, path, { body, headers = {}, cookie, rawBody } = {}) {
  const request = new PassThrough();
  request.method = method;
  request.url = path;
  request.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (cookie) request.headers.cookie = cookie;
  request.socket = { encrypted: false, remoteAddress: headers['x-test-ip'] || '127.0.0.1' };
  if (rawBody !== undefined) request.end(rawBody);
  else if (body !== undefined) request.end(JSON.stringify(body));
  else request.end();
  const response = new FakeResponse();
  await handleApiRequest(request, response, path.split('?')[0]);
  await response.done;
  const text = response.chunks.join('');
  let json = null;
  if (String(response.headers['content-type'] || '').includes('json')) json = JSON.parse(text);
  return { status: response.statusCode, headers: response.headers, text, body: json, writesBeforeHeaders: response.writesBeforeHeaders };
}

export function cookieFrom(res) {
  const header = res.headers['set-cookie'];
  return header ? header.split(';')[0] : null;
}

// A server-sent events Response, split into small chunks.
export function sseResponse(events, { status = 200 } = {}) {
  const text = events.map(e => `${e.event ? `event: ${e.event}\n` : ''}data: ${JSON.stringify(e.data)}\n\n`).join('');
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < text.length; i += 37) controller.enqueue(encoder.encode(text.slice(i, i + 37)));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
}

// Anthropic-style stream of the given text in pieces.
export function anthropicStream(text) {
  const events = [{ event: 'message_start', data: { type: 'message_start' } }];
  for (let i = 0; i < text.length; i += 50) {
    events.push({ event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 50) } } });
  }
  events.push({ event: 'message_stop', data: { type: 'message_stop' } });
  return sseResponse(events);
}

// Wires a fresh in-memory store and fake dependencies. `model` is the text the fake model returns
// (or a function of the request body); `grader` handles grader-service calls.
export function setup({ env = { ANTHROPIC_API_KEY: 'test-model-key' }, model, grader, now } = {}) {
  const store = new MemoryStore();
  setDatabaseOverride(store.database());
  const calls = { model: [], grader: [] };
  const state = { modelText: model };
  const fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://api.anthropic.com/') || u.startsWith('https://api.openai.com/') || u.startsWith('https://generativelanguage.googleapis.com/')) {
      const body = JSON.parse(init.body);
      calls.model.push({ url: u, body, headers: init.headers });
      const text = typeof state.modelText === 'function' ? state.modelText(body) : state.modelText;
      if (text instanceof Response) return text;
      return anthropicStream(text);
    }
    if (grader) {
      calls.grader.push({ url: u, init });
      return grader(u, init, calls.grader.length);
    }
    throw new Error(`Unexpected fetch to ${u}`);
  };
  const deps = setDeps({ store, fetch, env, now: now || (() => Date.now()) });
  return { store, calls, state, deps };
}

export async function signUp(username, email = `${username.toLowerCase()}@example.com`) {
  const res = await call('POST', '/api/auth/signup', { body: { username, email, password: 'password123' } });
  if (res.status !== 201) throw new Error(`Sign-up failed: ${res.status} ${res.text}`);
  return { cookie: cookieFrom(res), user: res.body.user };
}
