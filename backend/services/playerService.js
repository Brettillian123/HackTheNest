// "The current player": a signed-in user (session cookie) or an anonymous player identified by
// the X-Anon-Id header (a random id made by the browser). Also the per-player daily run cap.
import { createHash } from 'node:crypto';
import { HttpError } from '../controller/http.js';
import { getSession } from './sessionService.js';

const COOKIE_NAME = 'promptdyno_session';
export const ANON_RE = /^[A-Za-z0-9_-]{16,64}$/;

function readCookie(request, name) {
  const header = typeof request.headers?.cookie === 'string' ? request.headers.cookie : '';
  const pair = header.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  if (!pair) return null;
  try { return decodeURIComponent(pair.slice(name.length + 1)); } catch { return null; }
}

function header(request, name) {
  const value = request.headers?.[name];
  return typeof value === 'string' ? value : null;
}

export function sessionUser(request) {
  const session = getSession(readCookie(request, COOKIE_NAME));
  return session ? session.user : null;
}

// Returns { user, anonId, badAnon, player } where player is
// { kind: 'user', id, username } | { kind: 'anon', id, username: null } | null.
export function resolvePlayer(request) {
  const user = sessionUser(request);
  const rawAnon = header(request, 'x-anon-id');
  const anonId = rawAnon && ANON_RE.test(rawAnon) ? rawAnon : null;
  const badAnon = rawAnon !== null && !anonId;
  let player = null;
  if (user) player = { kind: 'user', id: user.id, username: user.username };
  else if (anonId) player = { kind: 'anon', id: anonId, username: null };
  return { user, anonId, badAnon, player };
}

const BAD_ANON = 'The X-Anon-Id header must be 16 to 64 letters, digits, dashes or underscores.';

// The player or null; a malformed X-Anon-Id from a signed-out visitor is a 400.
export function optionalPlayer(request) {
  const resolved = resolvePlayer(request);
  if (!resolved.user && resolved.badAnon) throw new HttpError(400, BAD_ANON);
  return resolved.player;
}

export function requirePlayer(request) {
  const player = optionalPlayer(request);
  if (!player) throw new HttpError(400, 'Log in, or send an X-Anon-Id header to play without an account.');
  return player;
}

export function validAnonId(value) {
  return typeof value === 'string' && ANON_RE.test(value);
}

function clientIp(request) {
  const forwarded = header(request, 'x-forwarded-for');
  const ip = (forwarded && forwarded.split(',')[0].trim()) || header(request, 'x-real-ip') || request.socket?.remoteAddress || 'unknown';
  return createHash('sha256').update(`promptdyno-ip:${ip}`).digest('base64url').slice(0, 22);
}

const positive = (value, fallback) => (Number.parseInt(value, 10) > 0 ? Number.parseInt(value, 10) : fallback);

// Counts one run against today's caps (UTC day): per player (RUNS_PER_DAY, default 30), per IP for
// every player, signed in or not (RUNS_PER_IP_PER_DAY, default 10 x RUNS_PER_DAY, since a venue shares
// one network), and across everyone
// (RUNS_PER_DAY_TOTAL, default 1500). Every counter is incremented, then any one over its cap is a 429.
export async function checkDailyCap(request, player, { store, env, now }) {
  const cap = positive(env.RUNS_PER_DAY, 30);
  const ipCap = positive(env.RUNS_PER_IP_PER_DAY, cap * 10);
  const totalCap = positive(env.RUNS_PER_DAY_TOTAL, 1500);
  const at = now();
  const day = new Date(at).toISOString().slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
  const expiresAt = new Date(midnight + 86_400_000);
  const counts = {
    player: await store.incrementUsage(`run:${player.kind}:${player.id}:${day}`, expiresAt),
    ip: await store.incrementUsage(`run:ip:${clientIp(request)}:${day}`, expiresAt),
    total: await store.incrementUsage(`run:all:${day}`, expiresAt),
  };
  let message = null;
  if (counts.total > totalCap) message = 'promptdyno has reached its run limit for today. Come back tomorrow.';
  else if (counts.player > cap || counts.ip > ipCap) {
    message = player.kind === 'anon'
      ? `You have used today's ${cap} free runs. Sign up or come back tomorrow.`
      : "You have used today's runs. Come back tomorrow.";
  }
  if (message) {
    const retry = Math.max(1, Math.ceil((midnight - at) / 1000));
    throw new HttpError(429, message, { headers: { 'Retry-After': String(retry) } });
  }
}
