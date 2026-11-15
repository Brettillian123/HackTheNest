// Credits, the daily free tier and Stripe Checkout (test mode only, plain fetch, no SDK).
//
// Rules (backend/README.md "Credits and payments"):
// - Free tier: each player may play up to FREE.challengesPerDay distinct Level 1 non-lesson challenges
//   per UTC day, with up to FREE.promptsPerChallenge prompts on each. Anonymous players are also
//   counted by network (hashed IP), so a new anonymous id does not reset the day.
// - Any other run costs COSTS.standard credit, or COSTS.lesson for a lesson bonus challenge. Only
//   signed-in players hold credits.
// - A run's free prompt or credits are reserved before the model is called and given back if the run
//   is discarded (failed, refused or cancelled), so only fully generated, saved runs cost anything.
// - Credits are bought in the PACKS below. The client only ever sends a pack id. Credits are granted
//   only from a Checkout Session fetched from Stripe with the secret key, once per session id.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../controller/http.js';
import { clientIp } from './playerService.js';

// Prices in cents.
export const PACKS = Object.freeze({
  starter: Object.freeze({ id: 'starter', credits: 20, price: 200, currency: 'usd' }),
  standard: Object.freeze({ id: 'standard', credits: 60, price: 500, currency: 'usd' }),
  pro: Object.freeze({ id: 'pro', credits: 200, price: 1500, currency: 'usd' }),
});
export const COSTS = Object.freeze({ standard: 1, lesson: 2 });
export const FREE = Object.freeze({ challengesPerDay: 2, promptsPerChallenge: 5, level: 1 });

const STRIPE_API = 'https://api.stripe.com/v1';
const SESSION_RE = /^cs_test_[A-Za-z0-9]{1,250}$/;
const SIGNATURE_TOLERANCE_S = 300;
const WEBHOOK_BODY_LIMIT = 1_000_000;

// BILLING_LIMITS=off turns the free tier and charges off (local development and tests only).
export const limitsOn = env => env.BILLING_LIMITS !== 'off';
export const isLessonChallenge = challenge => challenge.lesson !== undefined;
export const runCost = challenge => (isLessonChallenge(challenge) ? COSTS.lesson : COSTS.standard);
export const freeEligible = challenge => challenge.level === FREE.level && !isLessonChallenge(challenge);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function dayOf(at) {
  const day = new Date(at).toISOString().slice(0, 10);
  const resetsAt = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
  return { day, resetsAt: new Date(resetsAt), expiresAt: new Date(resetsAt + 86_400_000) };
}

// The free-tier counters a run is checked against: the player's, and for an anonymous player (or a
// visitor with no id) the network's too.
function freeKeys(request, player, day) {
  const keys = [];
  if (player) keys.push(`free:${player.kind}:${player.id}:${day}`);
  if (!player || player.kind === 'anon') keys.push(`free:ip:${clientIp(request)}:${day}`);
  return keys;
}

// Today's free-tier counters for this player: { docs, challengesLeft, promptsPerChallenge, resetsAt }.
export async function freeStatus(request, player, { store, now }) {
  const { day, resetsAt } = dayOf(now());
  const docs = (await Promise.all(freeKeys(request, player, day).map(key => store.getFreeUse(key)))).map(d => d || { n: 0, s: {} });
  const used = Math.max(0, ...docs.map(d => d.n));
  return { docs, challengesLeft: Math.max(0, FREE.challengesPerDay - used), promptsPerChallenge: FREE.promptsPerChallenge, resetsAt: resetsAt.toISOString() };
}

export function publicFree(status) {
  return { challengesLeft: status.challengesLeft, promptsPerChallenge: status.promptsPerChallenge, resetsAt: status.resetsAt };
}

// The credits the next run on this challenge would cost the player right now (0 when free).
// `status` is freeStatus() or null when it could not be read.
export function costFor(challenge, status, env) {
  if (!limitsOn(env)) return 0;
  if (freeEligible(challenge) && status) {
    const fits = status.docs.every(d => (Object.hasOwn(d.s, challenge.slug) ? d.s[challenge.slug] < FREE.promptsPerChallenge : d.n < FREE.challengesPerDay));
    if (fits) return 0;
  }
  return runCost(challenge);
}

const ANON_NEEDS_CREDITS = "Today's free challenges are used. Sign up and buy credits to keep playing.";

// Reserves the run before the model is called: a free prompt if the free tier allows it, otherwise
// the run's credits (signed-in players only). Throws 402 when neither is possible. Returns
// { kind: 'off' | 'free' | 'paid', cost, release } where release() gives the reservation back; the
// caller calls it when the run is discarded and never once the run is saved.
export async function reserveRun(request, player, challenge, runId, deps) {
  const { store, env, now } = deps;
  const none = async () => {};
  if (!limitsOn(env)) return { kind: 'off', cost: 0, release: none };
  const at = now();
  if (freeEligible(challenge)) {
    const { day, expiresAt } = dayOf(at);
    const claimed = [];
    let fits = true;
    for (const key of freeKeys(request, player, day)) {
      if (await store.claimFreeUse(key, challenge.slug, { maxChallenges: FREE.challengesPerDay, maxPrompts: FREE.promptsPerChallenge, expiresAt })) claimed.push(key);
      else { fits = false; break; }
    }
    const giveBack = async () => { for (const key of claimed) await store.releaseFreeUse(key, challenge.slug); };
    if (fits) return { kind: 'free', cost: 0, release: giveBack };
    await giveBack();
  }
  const cost = runCost(challenge);
  const needCredits = async (message, credits) => {
    const status = await freeStatus(request, player, deps);
    return new HttpError(402, message, { code: 'credits_required', cost, credits, freeChallengesLeft: status.challengesLeft });
  };
  if (player.kind !== 'user') throw await needCredits(ANON_NEEDS_CREDITS, null);
  const spent = await store.changeCredits({ userId: player.id, delta: -cost, reason: 'run', ref: `run:${runId}`, at: new Date(at) });
  if (!spent.ok || spent.duplicate) throw await needCredits(`This run costs ${plural(cost, 'credit')}. You have ${spent.balance}.`, spent.balance);
  return {
    kind: 'paid',
    cost,
    release: () => store.changeCredits({ userId: player.id, delta: cost, reason: 'refund', ref: `refund:${runId}`, at: new Date(now()) }),
  };
}

// ------------------------------------------------------------------ Stripe

// Only a test-mode secret key is ever used, so a live key cannot charge anyone by accident.
export function paymentsConfigured(env) {
  return typeof env.STRIPE_SECRET_KEY === 'string' && env.STRIPE_SECRET_KEY.startsWith('sk_test_');
}

function requirePayments(env) {
  if (!paymentsConfigured(env)) throw new HttpError(503, 'Payments are not connected.', { code: 'payments_off' });
}

export function packList() {
  return Object.values(PACKS).map(p => ({ id: p.id, credits: p.credits, price: p.price, currency: p.currency }));
}

function siteUrl(request, env) {
  if (typeof env.SITE_URL === 'string' && env.SITE_URL.trim()) return env.SITE_URL.trim().replace(/\/+$/, '');
  const host = typeof request.headers?.host === 'string' ? request.headers.host : '';
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) throw new HttpError(400, 'Could not work out the site address.');
  return `https://${host}`;
}

async function stripeCall(deps, method, path, form = null) {
  const init = { method, headers: { Authorization: `Bearer ${deps.env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(15_000) };
  if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = form.toString();
  }
  let response;
  try { response = await deps.fetch(`${STRIPE_API}${path}`, init); }
  catch { throw new HttpError(502, 'Could not reach the payment service. Try again in a moment.'); }
  let body = null;
  try { body = await response.json(); } catch { /* not JSON */ }
  if (response.status === 404) throw new HttpError(404, 'There is no payment with that id.');
  if (!response.ok || !body || typeof body !== 'object') throw new HttpError(502, 'The payment service did not accept the request. Try again in a moment.');
  return body;
}

export async function createCheckout(request, user, packId, deps) {
  requirePayments(deps.env);
  if (typeof packId !== 'string' || !Object.hasOwn(PACKS, packId)) throw new HttpError(400, 'Unknown credit pack.', { code: 'unknown_pack' });
  const pack = PACKS[packId];
  const site = siteUrl(request, deps.env);
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', pack.currency);
  form.set('line_items[0][price_data][unit_amount]', String(pack.price));
  form.set('line_items[0][price_data][product_data][name]', `promptdyno ${pack.credits} credits`);
  form.set('client_reference_id', user.id);
  form.set('metadata[pack]', pack.id);
  form.set('metadata[credits]', String(pack.credits));
  form.set('metadata[userId]', user.id);
  form.set('success_url', `${site}/credits.html?session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${site}/credits.html?cancelled=1`);
  const session = await stripeCall(deps, 'POST', '/checkout/sessions', form);
  if (typeof session.url !== 'string' || !session.url.startsWith('https://')) throw new HttpError(502, 'The payment service did not return a checkout page.');
  return { url: session.url };
}

// Why a fetched Checkout Session may not be credited to `userId`, or null when it may.
function sessionProblem(session, userId) {
  const meta = session.metadata && typeof session.metadata === 'object' ? session.metadata : {};
  if (!userId || session.client_reference_id !== userId || meta.userId !== userId) return { status: 403, error: 'This payment belongs to another account.', code: 'wrong_account' };
  if (session.payment_status !== 'paid') return { status: 409, error: 'This payment is not complete yet.', code: 'not_paid' };
  const pack = typeof meta.pack === 'string' && Object.hasOwn(PACKS, meta.pack) ? PACKS[meta.pack] : null;
  const matches = pack && session.livemode !== true && session.mode === 'payment' && meta.credits === String(pack.credits)
    && session.amount_total === pack.price && String(session.currency).toLowerCase() === pack.currency;
  if (!matches) return { status: 400, error: 'This payment does not match a credit pack.', code: 'pack_mismatch' };
  return null;
}

// Credits a checked session once (ref = the session id). Returns { credited, alreadyCredited, credits, balance }.
async function grantSession(session, userId, { store, now }) {
  const pack = PACKS[session.metadata.pack];
  const result = await store.changeCredits({ userId, delta: pack.credits, reason: `purchase:${pack.id}`, ref: session.id, at: new Date(now()) });
  if (!result.ok) throw new Error('Credit grant was refused.');
  return { credited: pack.credits, alreadyCredited: result.duplicate, credits: result.balance };
}

async function fetchSession(sessionId, deps) {
  const session = await stripeCall(deps, 'GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (session.id !== sessionId) throw new HttpError(502, 'The payment service returned a different payment.');
  return session;
}

export async function confirmCheckout(user, sessionId, deps) {
  requirePayments(deps.env);
  if (typeof sessionId !== 'string' || !SESSION_RE.test(sessionId)) throw new HttpError(400, 'Send a valid checkout session id.');
  const session = await fetchSession(sessionId, deps);
  const problem = sessionProblem(session, user.id);
  if (problem) throw new HttpError(problem.status, problem.error, { code: problem.code });
  return grantSession(session, user.id, deps);
}

// Reads the raw request bytes. On Vercel's Node runtime the stream is unread when the handler starts
// (req.body is a lazy getter), so the stream is read here. A pre-read buffer (req.rawBody, or a Buffer
// or string req.body) is used when a platform has already consumed the stream. Returns null when only
// a parsed object is left, since its exact bytes (needed for the signature) are gone.
export async function readRawBody(request, limit = WEBHOOK_BODY_LIMIT) {
  if (Buffer.isBuffer(request.rawBody)) return request.rawBody;
  if (typeof request.rawBody === 'string') return Buffer.from(request.rawBody, 'utf8');
  if (typeof request.on === 'function' && request.readable && !request.readableEnded) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let failed = false;
      request.on('data', chunk => {
        if (failed) return;
        const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += piece.length;
        if (size > limit) { failed = true; reject(new HttpError(413, 'Request is too large.')); return; }
        chunks.push(piece);
      });
      request.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
      request.on('error', () => { if (!failed) { failed = true; reject(new HttpError(400, 'Could not read the request.')); } });
    });
  }
  const body = request.body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  return null;
}

// Stripe-Signature: "t=<unix seconds>,v1=<hex HMAC-SHA256 of '<t>.<raw body>'>" (more v1 entries allowed).
export function verifySignature(raw, header, secret, nowMs) {
  if (typeof header !== 'string' || !secret) return { ok: false, error: 'Invalid signature.' };
  let t = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!t || !/^\d{1,12}$/.test(t) || !signatures.length) return { ok: false, error: 'Invalid signature.' };
  if (Math.abs(nowMs / 1000 - Number(t)) > SIGNATURE_TOLERANCE_S) return { ok: false, error: 'The signature timestamp is too old.' };
  const expected = createHmac('sha256', secret).update(`${t}.`).update(raw).digest();
  const ok = signatures.some(sig => /^[0-9a-f]{64}$/i.test(sig) && timingSafeEqual(Buffer.from(sig, 'hex'), expected));
  return ok ? { ok: true } : { ok: false, error: 'Invalid signature.' };
}

// Handles one webhook request. Returns the JSON body for a 200; throws HttpError otherwise.
export async function handleWebhook(request, deps) {
  const { env, now } = deps;
  if (!paymentsConfigured(env) || typeof env.STRIPE_WEBHOOK_SECRET !== 'string' || !env.STRIPE_WEBHOOK_SECRET) {
    throw new HttpError(503, 'Payments are not connected.', { code: 'payments_off' });
  }
  const raw = await readRawBody(request);
  if (!raw) throw new HttpError(400, 'The raw request body is not available, so the signature cannot be checked.', { code: 'raw_body_unavailable' });
  const header = request.headers?.['stripe-signature'];
  const check = verifySignature(raw, typeof header === 'string' ? header : null, env.STRIPE_WEBHOOK_SECRET, now());
  if (!check.ok) throw new HttpError(400, check.error, { code: 'bad_signature' });
  let event;
  try { event = JSON.parse(raw.toString('utf8')); }
  catch { throw new HttpError(400, 'Send a valid JSON event.'); }
  const object = event?.data?.object;
  if (event?.type !== 'checkout.session.completed' || object?.payment_status !== 'paid') return { received: true, credited: false };
  if (typeof object.id !== 'string' || !SESSION_RE.test(object.id)) return { received: true, credited: false };
  // Amounts and owner come from the session as Stripe returns it now, not from the event body.
  const session = await fetchSession(object.id, deps);
  const userId = typeof session.client_reference_id === 'string' ? session.client_reference_id : null;
  if (sessionProblem(session, userId)) return { received: true, credited: false };
  const granted = await grantSession(session, userId, deps);
  return { received: true, credited: !granted.alreadyCredited };
}

export async function billingSummary(request, player, deps) {
  const [credits, status] = await Promise.all([
    player?.kind === 'user' ? deps.store.getCredits(player.id) : null,
    freeStatus(request, player, deps),
  ]);
  return { configured: paymentsConfigured(deps.env), packs: packList(), credits, free: publicFree(status), costs: { ...COSTS } };
}
