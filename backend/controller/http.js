// Small HTTP helpers shared by the game controllers.

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

// Reads a JSON object body, refusing anything over `limit` bytes.
export function readJson(request, limit = 16_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    let failed = false;
    request.setEncoding('utf8');
    request.on('data', chunk => {
      if (failed) return;
      body += chunk;
      if (Buffer.byteLength(body) > limit) {
        failed = true;
        reject(new HttpError(413, 'Request is too large.'));
      }
    });
    request.on('end', () => {
      if (failed) return;
      let value;
      try { value = JSON.parse(body || '{}'); }
      catch { return reject(new HttpError(400, 'Send a valid JSON request.')); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return reject(new HttpError(400, 'Send a JSON object.'));
      resolve(value);
    });
    request.on('error', () => { if (!failed) { failed = true; reject(new HttpError(400, 'Could not read the request.')); } });
  });
}

export function queryOf(request) {
  try { return new URL(request.url || '/', 'http://localhost').searchParams; }
  catch { return new URLSearchParams(); }
}

// Logs one line without stack traces, bodies or secrets.
export function logError(where, error) {
  const code = error && (error.code || error.cause?.code);
  console.error(`${where}: ${error?.name || 'Error'}${code ? ` (${code})` : ''}`);
}

function isDatabaseError(error) {
  const name = error?.name || '';
  return /^Mongo/.test(name) || /MONGODB_URI is not configured/.test(error?.message || '');
}

// Wraps a handler so every failure becomes a plain JSON error.
export function guarded(where, handler) {
  return async (request, response, params) => {
    try {
      await handler(request, response, params);
    } catch (error) {
      if (response.headersSent) {
        logError(where, error);
        try { response.end(); } catch { /* already closed */ }
        return;
      }
      if (error instanceof HttpError) {
        const { headers = {}, ...extra } = error.extra;
        return sendJson(response, error.status, { error: error.message, ...extra }, headers);
      }
      logError(where, error);
      if (isDatabaseError(error)) return sendJson(response, 503, { error: 'The database is not available right now. Try again in a moment.' });
      return sendJson(response, 500, { error: 'Something went wrong on the server. Try again in a moment.' });
    }
  };
}
