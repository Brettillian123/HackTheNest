// Credits, the daily free tier and Stripe Checkout. Stripe is a fake behind the injected fetch;
// nothing here reaches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ANON, ANON2, call, setup, signUp } from './helpers.mjs';
import { MemoryStore } from '../store/memoryStore.js';

process.env.AUTH_SECRET = 'test-secret-for-sessions-only';
const GOAL = readFileSync(new URL('../../web/data/goals/login-card.html', import.meta.url), 'utf8');
const SKILL = '---\nname: release-notes\n---\n# Release notes';
const WHSEC = 'whsec_test_signing_secret';
const ENV = { ANTHROPIC_API_KEY: 'test-model-key', STRIPE_SECRET_KEY: 'sk_test_fake_key', STRIPE_WEBHOOK_SECRET: WHSEC };
const anon = (id = ANON) => ({ 'X-Anon-Id': id });

// A fake Stripe: checkout sessions created by POST are recorded; GET returns `sessions[id]`.
function fakeStripe() {
  const stripe = { created: [], sessions: {}, gets: 0 };
  stripe.handler = async (url, init = {}) => {
    if (url === 'https://api.stripe.com/v1/checkout/sessions' && init.method === 'POST') {
      stripe.created.push({ headers: init.headers, form: new URLSearchParams(init.body) });
      return Response.json({ id: 'cs_test_created1', url: 'https://checkout.stripe.com/c/pay/cs_test_created1' });
    }
    const m = /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/([^/?]+)$/.exec(url);
    if (m && init.method === 'GET') {
      stripe.gets += 1;
      const s = stripe.sessions[decodeURIComponent(m[1])];
      return s ? Response.json(s) : Response.json({ error: { message: 'No such session' } }, { status: 404 });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  };
  return stripe;
}

function start({ env = ENV, model = GOAL } = {}) {
  const stripe = fakeStripe();
  const ctx = setup({ env, model, grader: stripe.handler, billing: true });
  return { ...ctx, stripe };
}

function session(id, userId, { pack = 'starter', credits = '20', amount = 200, paid = true, client = userId } = {}) {
  return {
    id, object: 'checkout.session', mode: 'payment', livemode: false, currency: 'usd', amount_total: amount,
    payment_status: paid ? 'paid' : 'unpaid', client_reference_id: client, metadata: { pack, credits, userId },
  };
}

const run = (slug, prompt, { headers = anon(), cookie } = {}) => call('POST', '/api/runs', { body: { slug, prompt, model: 'claude-haiku' }, headers, cookie });
const confirm = (cookie, sessionId) => call('POST', '/api/billing/confirm', { body: { sessionId }, cookie });

function signed(event, { secret = WHSEC, t = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(event);
  const v1 = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return { raw, header: `t=${t},v1=${v1}` };
}
const webhook = ({ raw, header }) => call('POST', '/api/billing/webhook', { rawBody: raw, headers: { 'Stripe-Signature': header } });
const completed = id => ({ id: 'evt_test_1', type: 'checkout.session.completed', data: { object: { id, payment_status: 'paid', amount_total: 1, metadata: { credits: '99999' } } } });

test('checkout: sign-in required, live key refused, unknown pack 400, amounts come from the server table', async () => {
  const { stripe } = start();
  assert.equal((await call('POST', '/api/billing/checkout', { body: { pack: 'starter' }, headers: anon() })).status, 401);
  const amy = await signUp('amy_buyer');

  setup({ env: { ...ENV, STRIPE_SECRET_KEY: 'sk_live_looks_real' }, model: GOAL, grader: stripe.handler, billing: true });
  const live = await call('POST', '/api/billing/checkout', { body: { pack: 'starter' }, cookie: amy.cookie });
  assert.equal(live.status, 503);
  assert.deepEqual(live.body, { error: 'Payments are not connected.', code: 'payments_off' });
  assert.equal(stripe.created.length, 0);

  start();
  const amy2 = await signUp('amy_buyer');
  const s2 = fakeStripe();
  setup({ env: ENV, model: GOAL, grader: s2.handler, billing: true });
  const unknown = await call('POST', '/api/billing/checkout', { body: { pack: 'free-money' }, cookie: amy2.cookie });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.code, 'unknown_pack');

  const ok = await call('POST', '/api/billing/checkout', { body: { pack: 'standard', price: 1, credits: 99999, amount: 1 }, cookie: amy2.cookie, headers: { Host: 'promptdyno.test' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { url: 'https://checkout.stripe.com/c/pay/cs_test_created1' });
  assert.equal(s2.created.length, 1);
  const { headers, form } = s2.created[0];
  assert.equal(headers.Authorization, 'Bearer sk_test_fake_key');
  assert.equal(headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(form.get('mode'), 'payment');
  assert.equal(form.get('line_items[0][quantity]'), '1');
  assert.equal(form.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '500');
  assert.equal(form.get('client_reference_id'), amy2.user.id);
  assert.equal(form.get('metadata[pack]'), 'standard');
  assert.equal(form.get('metadata[credits]'), '60');
  assert.equal(form.get('metadata[userId]'), amy2.user.id);
  assert.equal(form.get('success_url'), 'https://promptdyno.test/credits.html?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(form.get('cancel_url'), 'https://promptdyno.test/credits.html?cancelled=1');
});

test('confirm: grants once, repeat is a no-op, other user / unpaid / tampered sessions grant nothing', async () => {
  const { stripe, store } = start();
  const amy = await signUp('amy_pay');
  const bob = await signUp('bob_pay');
  stripe.sessions.cs_test_good = session('cs_test_good', amy.user.id);
  stripe.sessions.cs_test_unpaid = session('cs_test_unpaid', amy.user.id, { paid: false });
  stripe.sessions.cs_test_credits = session('cs_test_credits', amy.user.id, { credits: '200' });
  stripe.sessions.cs_test_amount = session('cs_test_amount', amy.user.id, { pack: 'pro', credits: '200', amount: 200 });

  assert.equal((await call('POST', '/api/billing/confirm', { body: { sessionId: 'cs_test_good' }, headers: anon() })).status, 401);
  const first = await confirm(amy.cookie, 'cs_test_good');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { credited: 20, alreadyCredited: false, credits: 20 });
  const again = await confirm(amy.cookie, 'cs_test_good');
  assert.deepEqual(again.body, { credited: 20, alreadyCredited: true, credits: 20 });

  const stolen = await confirm(bob.cookie, 'cs_test_good');
  assert.equal(stolen.status, 403);
  assert.equal(stolen.body.code, 'wrong_account');
  assert.equal(await store.getCredits(bob.user.id), 0);

  const unpaid = await confirm(amy.cookie, 'cs_test_unpaid');
  assert.equal(unpaid.status, 409);
  assert.equal(unpaid.body.code, 'not_paid');
  for (const id of ['cs_test_credits', 'cs_test_amount']) {
    const bad = await confirm(amy.cookie, id);
    assert.equal(bad.status, 400, id);
    assert.equal(bad.body.code, 'pack_mismatch');
  }
  assert.equal((await confirm(amy.cookie, 'cs_live_abc')).status, 400);
  assert.equal(await store.getCredits(amy.user.id), 20);
  assert.deepEqual((await store.getLedger(amy.user.id)).map(e => [e.delta, e.reason, e.ref]), [[20, 'purchase:starter', 'cs_test_good']]);
});

test('webhook: bad signature and old timestamp 400; a good one grants once and is idempotent with confirm', async () => {
  const { stripe, store } = start();
  const amy = await signUp('amy_hook');
  stripe.sessions.cs_test_hook = session('cs_test_hook', amy.user.id, { pack: 'standard', credits: '60', amount: 500 });

  const forged = signed(completed('cs_test_hook'), { secret: 'whsec_wrong' });
  const bad = await webhook(forged);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'bad_signature');
  const good = signed(completed('cs_test_hook'));
  assert.equal((await webhook({ raw: good.raw.replace('evt_test_1', 'evt_test_2'), header: good.header })).status, 400, 'body changed after signing');
  const old = await webhook(signed(completed('cs_test_hook'), { t: Math.floor(Date.now() / 1000) - 301 }));
  assert.equal(old.status, 400);
  assert.equal(await store.getCredits(amy.user.id), 0);
  assert.equal(stripe.gets, 0, 'nothing is fetched for an unverified event');

  const ok = await webhook(good);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { received: true, credited: true });
  assert.equal(await store.getCredits(amy.user.id), 60, 'amounts come from the fetched session, not the event');
  assert.deepEqual((await webhook(signed(completed('cs_test_hook')))).body, { received: true, credited: false });
  assert.deepEqual((await confirm(amy.cookie, 'cs_test_hook')).body, { credited: 60, alreadyCredited: true, credits: 60 });
  assert.equal(await store.getCredits(amy.user.id), 60);
  assert.equal((await webhook(signed({ id: 'evt_x', type: 'customer.created', data: { object: {} } }))).status, 200);
});

test('free tier: two Level 1 challenges a day, five prompts each; Level 2 and a new anonymous id need credits', async () => {
  const { calls } = start();
  const list = async (headers = anon()) => Object.fromEntries((await call('GET', '/api/challenges?include=lessons', { headers })).body.challenges.map(c => [c.slug, c.cost]));
  const fresh = await list();
  assert.deepEqual([fresh['login-card'], fresh['footer-columns'], fresh['nav-hero']], [0, 0, 1]);
  assert.equal(fresh['release-notes-skill'], 2);

  assert.equal((await run('login-card', 'A centred login card')).status, 200);
  assert.equal((await run('footer-columns', 'A footer with columns')).status, 200);
  const third = await run('profile-card', 'A profile card');
  assert.equal(third.status, 402);
  assert.deepEqual(third.body, { error: "Today's free challenges are used. Sign up and buy credits to keep playing.", code: 'credits_required', cost: 1, credits: null, freeChallengesLeft: 0 });
  const after = await list();
  assert.deepEqual([after['login-card'], after['profile-card']], [0, 1]);
  const me = (await call('GET', '/api/players/me', { headers: anon() })).body;
  assert.equal(me.credits, null);
  assert.deepEqual([me.free.challengesLeft, me.free.promptsPerChallenge], [0, 5]);

  // Same network, new anonymous id: the day is not reset.
  assert.equal((await run('profile-card', 'A profile card', { headers: anon(ANON2) })).status, 402);
  assert.equal((await run('nav-hero', 'A nav bar with a hero', { headers: anon('anon_test_player_0003') })).status, 402, 'Level 2 is never free');

  for (let i = 2; i <= 5; i += 1) assert.equal((await run('login-card', `Login card try ${i}`)).status, 200);
  const sixth = await run('login-card', 'Login card try 6');
  assert.equal(sixth.status, 402);
  assert.equal(calls.model.length, 6, 'the model is never called for a refused run');
  assert.equal((await list())['login-card'], 1);
});

test('paid runs: deducted exactly once, failed generation costs nothing, scoring is free, lesson costs 2', async () => {
  const { store, state } = start();
  const amy = await signUp('amy_runs');
  await store.changeCredits({ userId: amy.user.id, delta: 3, reason: 'test', ref: 'grant-1', at: new Date() });

  const r = await run('nav-hero', 'A nav bar with a hero', { cookie: amy.cookie });
  assert.equal(r.status, 200);
  assert.equal(await store.getCredits(amy.user.id), 2);
  assert.equal((await call('POST', `/api/runs/${r.headers['x-run-id']}/score`, { cookie: amy.cookie })).status, 200);
  assert.equal(await store.getCredits(amy.user.id), 2, 'scoring is free');

  state.modelText = "I'm sorry, but I can't help with that request.";
  assert.equal((await run('nav-hero', 'A nav bar with a hero', { cookie: amy.cookie })).status, 422);
  assert.equal(await store.getCredits(amy.user.id), 2, 'a discarded run is refunded');
  // A free run that fails does not use up a free challenge either.
  assert.equal((await run('login-card', 'A login card', { cookie: amy.cookie })).status, 422);
  assert.equal((await call('GET', '/api/players/me', { cookie: amy.cookie })).body.free.challengesLeft, 2);

  state.modelText = SKILL;
  const lesson = await run('release-notes-skill', 'A skill file for release notes', { cookie: amy.cookie });
  assert.equal(lesson.status, 200);
  assert.equal(await store.getCredits(amy.user.id), 0);
  const broke = await run('release-notes-skill', 'Again', { cookie: amy.cookie });
  assert.equal(broke.status, 402);
  assert.deepEqual(broke.body, { error: 'This run costs 2 credits. You have 0.', code: 'credits_required', cost: 2, credits: 0, freeChallengesLeft: 2 });
  const deltas = (await store.getLedger(amy.user.id)).map(e => [e.delta, e.reason]);
  assert.deepEqual(deltas, [[3, 'test'], [-1, 'run'], [-1, 'run'], [1, 'refund'], [-2, 'run']]);

  const summary = (await call('GET', '/api/billing/summary', { cookie: amy.cookie })).body;
  assert.equal(summary.configured, true);
  assert.equal(summary.credits, 0);
  assert.deepEqual(summary.costs, { standard: 1, lesson: 2 });
  assert.deepEqual(summary.packs, [
    { id: 'starter', credits: 20, price: 200, currency: 'usd' },
    { id: 'standard', credits: 60, price: 500, currency: 'usd' },
    { id: 'pro', credits: 200, price: 1500, currency: 'usd' },
  ]);
  assert.deepEqual(Object.keys(summary.free), ['challengesLeft', 'promptsPerChallenge', 'resetsAt']);
  assert.equal((await call('GET', '/api/billing/summary', { headers: anon() })).body.credits, null);
});

test('parallel runs with 1 credit: one is charged, the other gets 402', async () => {
  const { store, calls } = start();
  const amy = await signUp('amy_race');
  await store.changeCredits({ userId: amy.user.id, delta: 1, reason: 'test', ref: 'grant-1', at: new Date() });
  const results = await Promise.all([1, 2].map(i => run('nav-hero', `Nav bar ${i}`, { cookie: amy.cookie })));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 402]);
  assert.equal(await store.getCredits(amy.user.id), 0);
  assert.equal(calls.model.length, 1);
  assert.equal([...store.runs.values()].length, 1);
});

test('ledger store: balance never negative, a ref applies once', async () => {
  const store = new MemoryStore();
  const at = new Date();
  assert.deepEqual(await store.changeCredits({ userId: 'u1', delta: -1, reason: 'run', ref: 'r0', at }), { ok: false, duplicate: false, balance: 0 });
  assert.equal((await store.changeCredits({ userId: 'u1', delta: 2, reason: 'grant', ref: 'g1', at })).balance, 2);
  const dup = await store.changeCredits({ userId: 'u1', delta: 2, reason: 'grant', ref: 'g1', at });
  assert.deepEqual([dup.ok, dup.duplicate, dup.balance], [true, true, 2]);
  assert.equal((await store.changeCredits({ userId: 'u1', delta: -3, reason: 'run', ref: 'r1', at })).ok, false);
  const spends = await Promise.all([1, 2, 3].map(i => store.changeCredits({ userId: 'u1', delta: -1, reason: 'run', ref: `r${i + 1}`, at })));
  assert.deepEqual(spends.map(s => s.ok), [true, true, false]);
  assert.equal(await store.getCredits('u1'), 0);
  assert.equal((await store.getLedger('u1')).length, 3);
});
