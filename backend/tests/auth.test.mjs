import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, cookieFrom, setup } from './helpers.mjs';

process.env.AUTH_SECRET = 'test-secret-for-sessions-only';

test('a token made by one module instance verifies in a freshly imported one', async () => {
  const a = await import('../services/sessionService.js?instance=login');
  const b = await import('../services/sessionService.js?instance=me');
  assert.notEqual(a, b);
  const token = a.createSession({ id: 'u1', username: 'ada', email: 'ada@example.com' });
  const session = b.getSession(token);
  assert.deepEqual(session.user, { id: 'u1', username: 'ada', email: 'ada@example.com' });
  assert.ok(session.expiresAt > Date.now());
});

test('tampered, malformed and expired tokens are refused', async t => {
  const s = await import('../services/sessionService.js');
  const token = s.createSession({ id: 'u1', username: 'ada', email: 'ada@example.com' });
  const [part, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'u2', u: 'eve', e: 'e@x.io', exp: Date.now() + 1e6 })).toString('base64url');
  assert.equal(s.getSession(`${forged}.${sig}`), null);
  assert.equal(s.getSession(`${part}.${sig}x`), null);
  assert.equal(s.getSession('garbage'), null);
  assert.equal(s.getSession(null), null);
  assert.equal(s.getSession(`${token}.extra`), null);
  const realNow = Date.now();
  t.mock.method(Date, 'now', () => realNow + 25 * 3600 * 1000);
  assert.equal(s.getSession(token), null);
});

test('existing auth routes keep their original shapes', async () => {
  setup();
  const signup = await call('POST', '/api/auth/signup', { body: { username: 'ada_l', email: 'Ada@Example.com', password: 'password123' } });
  assert.equal(signup.status, 201);
  assert.deepEqual(Object.keys(signup.body), ['user']);
  assert.deepEqual(Object.keys(signup.body.user).sort(), ['email', 'id', 'username']);
  assert.equal(signup.body.user.email, 'ada@example.com');
  assert.match(signup.headers['set-cookie'], /^promptdyno_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=86400$/);

  const dup = await call('POST', '/api/auth/signup', { body: { username: 'ada_l', email: 'other@example.com', password: 'password123' } });
  assert.equal(dup.status, 409);
  assert.deepEqual(dup.body, { error: 'That username or email is already registered.' });

  const badSignup = await call('POST', '/api/auth/signup', { body: { username: 'x', email: 'a@b.co', password: 'password123' } });
  assert.equal(badSignup.status, 400);
  const missing = await call('POST', '/api/auth/signup', { body: { username: 'abc' } });
  assert.equal(missing.status, 400);
  const notJson = await call('POST', '/api/auth/login', { rawBody: '{oops' });
  assert.deepEqual([notJson.status, notJson.body], [400, { error: 'Send a valid JSON request.' }]);

  const wrong = await call('POST', '/api/auth/login', { body: { email: 'ada@example.com', password: 'nope-nope' } });
  assert.deepEqual([wrong.status, wrong.body], [401, { error: 'Email or password is incorrect.' }]);
  const login = await call('POST', '/api/auth/login', { body: { email: 'ada@example.com', password: 'password123' } });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body, { user: signup.body.user });

  // "me" runs in a different function instance on Vercel: the signed cookie is enough.
  const me = await call('GET', '/api/auth/me', { cookie: cookieFrom(login) });
  assert.deepEqual([me.status, me.body], [200, { user: signup.body.user }]);
  const anon = await call('GET', '/api/auth/me');
  assert.deepEqual([anon.status, anon.body], [401, { error: 'Not logged in.' }]);

  const logout = await call('POST', '/api/auth/logout', { cookie: cookieFrom(login) });
  assert.deepEqual([logout.status, logout.body], [200, { ok: true }]);
  assert.match(logout.headers['set-cookie'], /^promptdyno_session=; .*Max-Age=0$/);
});

test('unknown routes answer the original JSON 404', async () => {
  setup();
  for (const [method, path] of [['GET', '/api/nope'], ['DELETE', '/api/runs'], ['GET', '/api/runs/x/score/more']]) {
    const res = await call(method, path);
    assert.deepEqual([res.status, res.body], [404, { error: 'API route not found.' }]);
  }
});
