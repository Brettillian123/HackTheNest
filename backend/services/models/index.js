// Model providers over plain fetch (no SDKs). A provider is enabled only when its key is set.
// Public model ids match web/data/challenges.json "models"; the provider model id can be
// overridden with OPENAI_MODEL or ANTHROPIC_MODEL.
//
// Sources for the defaults and request formats (checked 2026-11-15):
// - OpenAI: https://developers.openai.com/api/docs/models ("gpt-6-luna": most efficient model for
//   high-volume tasks) and https://developers.openai.com/api/docs/guides/streaming-responses
//   (Responses API, stream: true, SSE "response.output_text.delta" with "delta").
// - Anthropic: Messages API with stream: true (content_block_delta / text_delta); default model
//   "claude-haiku-5-5" as agreed for this project.

export const MODELS = [
  { id: 'openai-mini', label: 'OpenAI mini', provider: 'openai', keyEnv: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL', defaultModel: 'gpt-6-luna' },
  { id: 'claude-haiku', label: 'Claude Haiku', provider: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY', modelEnv: 'ANTHROPIC_MODEL', defaultModel: 'claude-haiku-5-5' },
];

// Fallback only: each challenge carries its own maxOutputTokens (challengeStore.js, default per kind).
const MAX_OUTPUT_TOKENS = 6000;
export const GENERATION_TIMEOUT_MS = 50_000;

export class ModelError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ModelError';
    this.status = status;
  }
}

export function availableModels(env) {
  return MODELS.filter(m => typeof env[m.keyEnv] === 'string' && env[m.keyEnv].trim());
}

export function findModel(id, env) {
  return availableModels(env).find(m => m.id === id) || null;
}

// The fixed instructions per challenge kind live in ../kinds.js.
export { pageInstruction as systemInstruction } from '../kinds.js';

// Yields { event, data } from a server-sent events body.
async function* sse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = done ? '' : parts.pop();
      for (const part of parts) {
        let event = 'message';
        const data = [];
        for (const line of part.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (data.length) yield { event, data: data.join('\n') };
      }
      if (done) return;
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

function parse(data) {
  try { return JSON.parse(data); } catch { return null; }
}

// OpenAI reasoning models count reasoning tokens inside max_output_tokens
// (https://developers.openai.com/api/docs/guides/reasoning), so the page budget gets a fixed
// allowance on top, and effort is kept low ("reasoning": { "effort": "low" }).
export const OPENAI_REASONING_ALLOWANCE = 8000;
export const OPENAI_REASONING_EFFORT = 'low';

// A short, safe label for the server log: an error type/code only, never a message or prompt.
function code(value) {
  return typeof value === 'string' && /^[\w.-]{1,64}$/.test(value) ? value : 'unknown';
}

const providers = {
  openai: {
    request: (model, key, system, user, maxTokens) => ({
      url: 'https://api.openai.com/v1/responses',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: {
        model, instructions: system, input: user, stream: true,
        max_output_tokens: maxTokens + OPENAI_REASONING_ALLOWANCE,
        reasoning: { effort: OPENAI_REASONING_EFFORT },
      },
    }),
    read(msg) {
      if (!msg) return null;
      if (msg.type === 'response.output_text.delta') return { text: String(msg.delta || '') };
      if (msg.type === 'error') return { error: code(msg.code || msg.error?.code || msg.error?.type) };
      if (msg.type === 'response.failed') return { error: code(msg.response?.error?.code) };
      if (msg.type === 'response.incomplete') return { incomplete: code(msg.response?.incomplete_details?.reason) };
      if (msg.type === 'response.completed') return { done: true };
      return null;
    },
  },
  anthropic: {
    request: (model, key, system, user, maxTokens) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }], stream: true },
    }),
    read(msg) {
      if (!msg) return null;
      if (msg.type === 'content_block_delta' && msg.delta?.type === 'text_delta') return { text: String(msg.delta.text || '') };
      if (msg.type === 'error') return { error: code(msg.error?.type) };
      if (msg.type === 'message_stop') return { done: true };
      return null;
    },
  },
};

// Streams the model's text. Yields strings; throws ModelError with a plain message on failure.
// The system instruction and the player's (delimited) text travel in separate fields; error
// messages are fixed sentences and never include the instruction, keys or the provider's reply.
export async function* generate({ model, system, user, env, fetch, signal, maxOutputTokens = MAX_OUTPUT_TOKENS }) {
  const provider = providers[model.provider];
  const providerModel = (env[model.modelEnv] || '').trim() || model.defaultModel;
  const req = provider.request(providerModel, env[model.keyEnv].trim(), system, user, maxOutputTokens);
  let res;
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
  } catch (error) {
    if (error?.name === 'TimeoutError' || signal?.aborted) throw new ModelError('The model took too long to answer. Run again.', 504);
    throw new ModelError('Could not reach the model service. Try again in a moment.');
  }
  if (!res.ok) {
    console.error(`Model ${model.id}: provider answered ${res.status}`);
    if (res.status === 429) throw new ModelError('The model service is busy. Try again in a minute.', 503);
    throw new ModelError(`The model service refused the request (${res.status}). Try again or pick another model.`);
  }
  if (!res.body) throw new ModelError('The model service sent an empty answer. Run again.');
  let tail = ''; // the last characters seen, enough to spot a closing </html>
  try {
    for await (const { data } of sse(res.body)) {
      const out = provider.read(parse(data));
      if (!out) continue;
      if (out.error) {
        console.error(`Model ${model.id}: stream error event (${out.error})`);
        throw new ModelError('The model stopped with an error. Run again.');
      }
      if (out.incomplete) {
        // A finished document that only ran out of room after </html> is still a page.
        if (/<\/html\s*>/i.test(tail)) return;
        console.error(`Model ${model.id}: response incomplete (${out.incomplete})`);
        if (out.incomplete === 'max_output_tokens') throw new ModelError('The model ran out of room. Shorten the prompt or ask for less.');
        throw new ModelError('The model stopped before finishing. Run again.');
      }
      if (out.text) {
        tail = (tail + out.text).slice(-64);
        yield out.text;
      }
      if (out.done) return;
    }
  } catch (error) {
    if (error instanceof ModelError) throw error;
    if (error?.name === 'TimeoutError' || signal?.aborted) throw new ModelError('The model took too long to answer. Run again.', 504);
    throw new ModelError('The model stream broke off. Run again.');
  }
}
