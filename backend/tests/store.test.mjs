// One behavioural suite for both store implementations. The MongoDB run needs a throwaway test
// database: set TEST_MONGODB_URI (never the production URI) to run it; otherwise it is skipped.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../store/memoryStore.js';

const t0 = new Date('2026-11-10T10:00:00Z');
const later = ms => new Date(t0.getTime() + ms);
const anonOwner = { kind: 'anon', id: `anon_${Math.random().toString(36).slice(2, 14)}xx` };

function suite(name, makeStore, options = {}) {
  describe(name, options, () => {
    test('attempts, prompt counts, runs, claim, usage and best scores', async () => {
      const store = await makeStore();
      assert.equal(await store.ping(), true);
      const slug = `slug-${Math.random().toString(36).slice(2, 8)}`;
      assert.equal(await store.getOpenAttempt(anonOwner, slug), null);
      const attempt = await store.createAttempt({ _id: `att_${slug}`, slug, ownerKind: 'anon', ownerId: anonOwner.id, username: null, open: true, promptCount: 0, best: null, bestPromptCount: null, bestAt: null, createdAt: t0, updatedAt: t0 });
      assert.equal((await store.getOpenAttempt(anonOwner, slug))._id, attempt._id);
      assert.equal((await store.bumpPromptCount(attempt._id, later(1))).promptCount, 1);
      assert.equal((await store.bumpPromptCount(attempt._id, later(2))).promptCount, 2);
      for (const [n, score] of [[1, 70], [2, 90]]) {
        await store.insertRun({ _id: `run_${slug}_${n}`, attemptId: attempt._id, slug, ownerKind: 'anon', ownerId: anonOwner.id, username: null, n, prompt: 'p', model: 'm', html: '<p>', status: 'done', result: null, score: null, provisional: null, createdAt: later(n), finishedAt: null, scoredAt: null });
        await store.updateRun(`run_${slug}_${n}`, { score, result: { total: score }, scoredAt: later(n * 10) });
      }
      assert.deepEqual((await store.listRuns(attempt._id)).map(r => r.n), [1, 2]);
      assert.equal((await store.getRun(`run_${slug}_2`)).score, 90);
      assert.equal(await store.getRun('run_missing_xxxxxxx'), null);
      await store.updateAttempt(attempt._id, { best: 90 });
      assert.equal((await store.getAttempt(attempt._id)).best, 90);

      assert.deepEqual(await store.bestScores({ slug }), [], 'anonymous runs are not on boards');
      const own = await store.bestScores({ slug, owner: anonOwner });
      assert.deepEqual(own.map(r => [r.n, r.score]).sort(), [[1, 70], [2, 90]]);
      assert.deepEqual((await store.bestScores({ slug, owner: anonOwner, since: later(15) })).map(r => r.n), [2]);

      const user = { id: `u_${slug}`, username: `user_${slug.slice(5)}` };
      // The user already has an open attempt on the slug; after the claim only the newer stays open.
      await store.createAttempt({ _id: `att_${slug}_u`, slug, ownerKind: 'user', ownerId: user.id, username: user.username, open: true, promptCount: 0, best: null, bestPromptCount: null, bestAt: null, createdAt: t0, updatedAt: t0 });
      assert.deepEqual(await store.claimAnon(anonOwner.id, user, later(100)), { moved: 1 });
      assert.deepEqual(await store.claimAnon(anonOwner.id, user, later(101)), { moved: 0 });
      const userOwner = { kind: 'user', id: user.id };
      assert.equal((await store.getOpenAttempt(userOwner, slug))._id, attempt._id);
      assert.equal((await store.getAttempt(`att_${slug}_u`)).open, false);
      const board = await store.bestScores({ slug });
      assert.deepEqual(board.map(r => [r.username, r.n, r.score]).sort(), [[user.username, 1, 70], [user.username, 2, 90]]);

      assert.equal(await store.closeOpenAttempts(userOwner, slug, later(200)), 1);
      assert.equal(await store.getOpenAttempt(userOwner, slug), null);

      const key = `test:${slug}`;
      assert.equal(await store.incrementUsage(key, later(86_400_000)), 1);
      assert.equal(await store.incrementUsage(key, later(86_400_000)), 2);
    });
  });
}

suite('MemoryStore', () => new MemoryStore());

suite('MongoStore (needs TEST_MONGODB_URI)', async () => {
  process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
  const { MongoStore } = await import('../store/mongoStore.js');
  return new MongoStore();
}, { skip: !process.env.TEST_MONGODB_URI });
