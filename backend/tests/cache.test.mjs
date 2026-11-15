// Cache headers: public, player-independent routes may be cached at the edge; anything that
// carries the caller's own data stays private, no-store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANON, call, setup } from './helpers.mjs';

process.env.AUTH_SECRET = 'test-secret-for-sessions-only';
const anon = { 'X-Anon-Id': ANON };
const cc = res => String(res.headers['cache-control'] || '');

test('health and lessons are publicly cacheable; challenges, boards and the player are not', async () => {
  setup({ model: 'x' });
  const health = await call('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(cc(health), 'public, s-maxage=30, stale-while-revalidate=120');

  const lessons = await call('GET', '/api/lessons');
  assert.equal(lessons.status, 200);
  assert.equal(cc(lessons), 'public, s-maxage=300, stale-while-revalidate=3600');
  const slug = lessons.body.lessons[0]?.slug;
  if (slug) assert.equal(cc(await call('GET', `/api/lessons/${slug}`)), 'public, s-maxage=300, stale-while-revalidate=3600');
  assert.equal(cc(await call('GET', '/api/lessons/no-such-lesson')), 'no-store');

  for (const path of ['/api/challenges', '/api/challenges/login-card', '/api/leaderboards?bracket=all&period=all', '/api/players/me', '/api/attempts/current?slug=login-card']) {
    const res = await call('GET', path, { headers: anon });
    assert.equal(cc(res), 'no-store', path);
  }
});
