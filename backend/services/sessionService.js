import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Sessions are signed, self-contained tokens (HMAC-SHA256), so any serverless function instance
// can read a token another instance made. Nothing is kept in memory.
// Token: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload part)).
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// Keeps tokens well under the cookie size limit: an email longer than any valid address (254) is
// left out of the token, and the session then reports email: null.
const MAX_EMAIL = 254;
const MAX_TOKEN = 2048;
let processSecret;

// AUTH_SECRET when set; otherwise a key derived from MONGODB_URI (same on every instance);
// otherwise (local, no env) a random secret for this process only.
function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.MONGODB_URI) return createHash('sha256').update(`promptdyno-session:${process.env.MONGODB_URI}`).digest();
  if (!processSecret) processSecret = randomBytes(32);
  return processSecret;
}

function sign(part) {
  return createHmac('sha256', secret()).update(part).digest('base64url');
}

export function createSession(user) {
  const email = typeof user.email === 'string' && user.email.length <= MAX_EMAIL ? user.email : null;
  const payload = { sub: String(user.id), u: String(user.username).slice(0, 64), e: email, exp: Date.now() + SESSION_TTL_MS };
  const part = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${part}.${sign(part)}`;
}

export function getSession(token) {
  if (!token || typeof token !== 'string' || token.length > MAX_TOKEN) return null;
  const [part, signature, extra] = token.split('.');
  if (!part || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(part));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); }
  catch { return null; }
  if (!payload || typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
  return { user: { id: payload.sub, username: payload.u, email: payload.e ?? null }, expiresAt: payload.exp };
}

// Tokens are self-contained, so there is nothing to delete; the controller clears the cookie.
export function deleteSession(_token) {}
