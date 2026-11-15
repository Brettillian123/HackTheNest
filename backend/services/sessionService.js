import { randomBytes } from 'node:crypto';

const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createSession(user) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function deleteSession(token) {
  if (token) sessions.delete(token);
}
