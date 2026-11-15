// Model providers over plain fetch (no SDKs). A provider is enabled only when its key is set.
// Public model ids match web/data/challenges.json "models"; the provider model id can be
// overridden with OPENAI_MODEL, GEMINI_MODEL or ANTHROPIC_MODEL.
//
// Sources for the defaults and request formats (checked 2026-11-15):
// - OpenAI: https://developers.openai.com/api/docs/models ("gpt-6-luna": most efficient model for
//   high-volume tasks) and https://developers.openai.com/api/docs/guides/streaming-responses
//   (Responses API, stream: true, SSE "response.output_text.delta" with "delta").
// - Gemini: https://aistudio.google.com/docs/models ("gemini-3.8-flash", stable) and
//   https://aistudio.google.com/docs/api-reference/generate-content (models.streamGenerateContent,
//   candidates[].content.parts[].text).
// - Anthropic: Messages API with stream: true (content_block_delta / text_delta); default model
//   "claude-haiku-5-5" as agreed for this project.

export const MODELS = [
  { id: 'openai-mini', label: 'OpenAI mini', provider: 'openai', keyEnv: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL', defaultModel: 'gpt-6-luna' },
  { id: 'gemini-flash', label: 'Gemini Flash', provider: 'gemini', keyEnv: 'GEMINI_API_KEY', modelEnv: 'GEMINI_MODEL', defaultModel: 'gemini-3.8-flash' },
  { id: 'claude-haiku', label: 'Claude Haiku', provider: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY', modelEnv: 'ANTHROPIC_MODEL', defaultModel: 'claude-haiku-5-5' },
];

const MAX_OUTPUT_TOKENS = 16000;
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

export function systemInstruction(viewport) {
  return [
    'You are a web page generator. Reply with exactly one complete HTML document, starting with <!doctype html> and ending with </html>, and nothing else: no explanations, no Markdown, no code fences.',
    'Put all CSS inline: in one <style> element in the head or in style attributes.',
    'Do not use JavaScript: no <script> elements and no event-handler attributes.',
    'Do not load anything external: no external stylesheets, web fonts, images, iframes or URLs. Use system fonts, and draw shapes with CSS instead of images.',
    `Design for a browser viewport of ${viewport.width} x ${viewport.height} pixels.`,
  ].join('\n');
}

export function userMessage(prompt, previousHtml) {
  if (!previousHtml) return `Build this page:\n\n${prompt}`;
  return `Here is the current page:\n\n${previousHtml}\n\nRevise it according to the instruction below and reply with the complete revised document.\n\nInstruction:\n${prompt}`;
}

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

const providers = {
  openai: {
    request: (model, key, system, user) => ({
      url: 'https://api.openai.com/v1/responses',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: { model, instructions: system, input: user, stream: true, max_output_tokens: MAX_OUTPUT_TOKENS },
    }),
    read(msg) {
      if (!msg) return null;
      if (msg.type === 'response.output_text.delta') return { text: String(msg.delta || '') };
      if (msg.type === 'error' || msg.type === 'response.failed') return { error: true };
      if (msg.type === 'response.completed' || msg.type === 'response.incomplete') return { done: true };
      return null;
    },
  },
  gemini: {
    request: (model, key, system, user) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      },
    }),
    read(msg) {
      if (!msg) return null;
      if (msg.error) return { error: true };
      const parts = msg.candidates?.[0]?.content?.parts || [];
      const text = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
      return text ? { text } : null;
    },
  },
  anthropic: {
    request: (model, key, system, user) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: { model, max_tokens: MAX_OUTPUT_TOKENS, system, messages: [{ role: 'user', content: user }], stream: true },
    }),
    read(msg) {
      if (!msg) return null;
      if (msg.type === 'content_block_delta' && msg.delta?.type === 'text_delta') return { text: String(msg.delta.text || '') };
      if (msg.type === 'error') return { error: true };
      if (msg.type === 'message_stop') return { done: true };
      return null;
    },
  },
};

// Streams the model's text. Yields strings; throws ModelError with a plain message on failure.
export async function* generate({ model, system, user, env, fetch, signal }) {
  const provider = providers[model.provider];
  const providerModel = (env[model.modelEnv] || '').trim() || model.defaultModel;
  const req = provider.request(providerModel, env[model.keyEnv].trim(), system, user);
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
  try {
    for await (const { data } of sse(res.body)) {
      const out = provider.read(parse(data));
      if (!out) continue;
      if (out.error) throw new ModelError('The model stopped with an error. Run again.');
      if (out.done) return;
      if (out.text) yield out.text;
    }
  } catch (error) {
    if (error instanceof ModelError) throw error;
    if (error?.name === 'TimeoutError' || signal?.aborted) throw new ModelError('The model took too long to answer. Run again.', 504);
    throw new ModelError('The model stream broke off. Run again.');
  }
}
