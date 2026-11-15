// MongoDB store. Mirrors MemoryStore (memoryStore.js) method for method; keep it thin.
// Every value reaching a query is a validated string, number, boolean or Date from the services,
// never a raw request object. Collections: attempts, runs, usage, credits, free_use (indexes made lazily).
import { getDatabase } from '../config/database.js';

let indexesPromise = null;

// The field path of one challenge in a free_use document.
function freeField(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(slug)) throw new Error('Invalid challenge slug for the free tier.');
  return `s.${slug}`;
}

async function db() {
  const database = await getDatabase();
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      database.collection('attempts').createIndex({ ownerKind: 1, ownerId: 1, slug: 1, open: 1 }, { name: 'attempt_owner_slug_open' }),
      database.collection('attempts').createIndex({ ownerKind: 1, ownerId: 1, slug: 1 }, { name: 'attempt_one_open', unique: true, partialFilterExpression: { open: true } }),
      database.collection('runs').createIndex({ attemptId: 1, n: 1 }, { name: 'run_attempt_n' }),
      database.collection('runs').createIndex({ ownerKind: 1, ownerId: 1 }, { name: 'run_owner' }),
      database.collection('runs').createIndex({ slug: 1, ownerKind: 1, score: -1 }, { name: 'run_slug_score' }),
      database.collection('usage').createIndex({ expiresAt: 1 }, { name: 'usage_ttl', expireAfterSeconds: 0 }),
      database.collection('free_use').createIndex({ expiresAt: 1 }, { name: 'free_use_ttl', expireAfterSeconds: 0 }),
    ]).catch(error => {
      indexesPromise = null;
      throw error;
    });
  }
  await indexesPromise;
  return database;
}

export class MongoStore {
  async ping() {
    const database = await getDatabase();
    await database.command({ ping: 1 });
    return true;
  }

  async findUserByUsername(username) {
    const found = await (await getDatabase()).collection('users').findOne({ username: String(username) });
    return found ? { id: found._id.toString(), username: found.username, joined: found._id.getTimestamp() } : null;
  }

  async getOpenAttempt(owner, slug) {
    return (await db()).collection('attempts').findOne({ ownerKind: String(owner.kind), ownerId: String(owner.id), slug: String(slug), open: true });
  }

  async getAttempt(id) {
    return (await db()).collection('attempts').findOne({ _id: String(id) });
  }

  async createAttempt(doc) {
    await (await db()).collection('attempts').insertOne({ ...doc });
    return doc;
  }

  async updateAttempt(id, fields) {
    await (await db()).collection('attempts').updateOne({ _id: String(id) }, { $set: fields });
  }

  async bumpPromptCount(id, at) {
    return (await db()).collection('attempts').findOneAndUpdate(
      { _id: String(id) },
      { $inc: { promptCount: 1 }, $set: { updatedAt: at } },
      { returnDocument: 'after' },
    );
  }

  async closeOpenAttempts(owner, slug, at) {
    const result = await (await db()).collection('attempts').updateMany(
      { ownerKind: String(owner.kind), ownerId: String(owner.id), slug: String(slug), open: true },
      { $set: { open: false, updatedAt: at } },
    );
    return result.modifiedCount;
  }

  async insertRun(doc) {
    await (await db()).collection('runs').insertOne({ ...doc });
    return doc;
  }

  async getRun(id) {
    return (await db()).collection('runs').findOne({ _id: String(id) });
  }

  async updateRun(id, fields) {
    await (await db()).collection('runs').updateOne({ _id: String(id) }, { $set: fields });
  }

  async deleteRun(id) {
    await (await db()).collection('runs').deleteOne({ _id: String(id) });
  }

  async listRuns(attemptId) {
    return (await db()).collection('runs').find({ attemptId: String(attemptId) }).sort({ n: 1 }).toArray();
  }

  async claimAnon(anonId, user, at) {
    const database = await db();
    const from = { ownerKind: 'anon', ownerId: String(anonId) };
    const to = { ownerKind: 'user', ownerId: String(user.id), username: String(user.username) };
    const moved = await database.collection('attempts').updateMany(from, { $set: to });
    await database.collection('runs').updateMany(from, { $set: to });
    const open = await database.collection('attempts')
      .find({ ownerKind: 'user', ownerId: String(user.id), open: true })
      .sort({ updatedAt: -1 })
      .toArray();
    const kept = new Set();
    const close = [];
    for (const a of open) {
      if (kept.has(a.slug)) close.push(a._id);
      else kept.add(a.slug);
    }
    if (close.length) await database.collection('attempts').updateMany({ _id: { $in: close } }, { $set: { open: false, updatedAt: at } });
    return { moved: moved.modifiedCount };
  }

  // ---------------------------------------------------------------- credits
  // One document per user: { _id: userId, balance, ledger: [{ userId, delta, reason, ref, at }] }.
  // The balance and its ledger entry change in one single-document update, which MongoDB applies
  // atomically: no balance change without its entry, a ref is applied at most once, and a spend only
  // matches while the balance covers it, so the balance never goes below zero.

  async getCredits(userId) {
    const doc = await (await db()).collection('credits').findOne({ _id: String(userId) }, { projection: { balance: 1 } });
    return doc?.balance ?? 0;
  }

  async getLedger(userId) {
    const doc = await (await db()).collection('credits').findOne({ _id: String(userId) }, { projection: { ledger: 1 } });
    return doc?.ledger || [];
  }

  async changeCredits({ userId, delta, reason, ref, at }) {
    const id = String(userId);
    const entry = { userId: id, delta, reason: String(reason), ref: String(ref), at };
    const credits = (await db()).collection('credits');
    const filter = { _id: id, 'ledger.ref': { $ne: entry.ref } };
    if (delta < 0) filter.balance = { $gte: -delta };
    const valid = Number.isInteger(delta) && delta !== 0;
    // A grant may create the document (upsert). Two first grants racing to create it: the loser gets
    // a duplicate key error and tries again against the document that now exists.
    for (let tries = 0; valid && tries < 3; tries += 1) {
      try {
        const doc = await credits.findOneAndUpdate(filter, { $inc: { balance: delta }, $push: { ledger: entry } }, { upsert: delta > 0, returnDocument: 'after', projection: { balance: 1 } });
        if (doc) return { ok: true, duplicate: false, balance: doc.balance, entry };
        break;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const found = await credits.findOne({ _id: id, 'ledger.ref': entry.ref }, { projection: { _id: 1 } });
        if (found) break;
      }
    }
    const current = await credits.findOne({ _id: id }, { projection: { balance: 1, ledger: { $elemMatch: { ref: entry.ref } } } });
    const existing = current?.ledger?.[0];
    if (existing) return { ok: true, duplicate: true, balance: current.balance, entry: existing };
    return { ok: false, duplicate: false, balance: current?.balance ?? 0 };
  }

  // ---------------------------------------------------------------- free tier
  // One document per key and day: { _id: key, n: distinct challenges, s: { slug: prompts }, expiresAt }.
  // Slugs are checked against SLUG_RE before they get here; the guard below keeps field paths safe.

  async getFreeUse(key) {
    const doc = await (await db()).collection('free_use').findOne({ _id: String(key) });
    return doc ? { n: doc.n || 0, s: { ...(doc.s || {}) } } : null;
  }

  async claimFreeUse(key, slug, { maxChallenges, maxPrompts, expiresAt }) {
    const field = freeField(slug);
    const free = (await db()).collection('free_use');
    for (let tries = 0; tries < 2; tries += 1) {
      const more = await free.updateOne({ _id: String(key), [field]: { $exists: true, $lt: maxPrompts } }, { $inc: { [field]: 1 } });
      if (more.modifiedCount) return true;
      try {
        const added = await free.updateOne(
          { _id: String(key), [field]: { $exists: false }, n: { $lt: maxChallenges } },
          { $inc: { n: 1, [field]: 1 }, $setOnInsert: { expiresAt } },
          { upsert: true },
        );
        return added.modifiedCount + added.upsertedCount > 0;
      } catch (error) {
        // The document exists but did not match (limits reached), or a parallel first claim made it.
        if (error?.code !== 11000) throw error;
      }
    }
    return false;
  }

  async releaseFreeUse(key, slug) {
    const field = freeField(slug);
    const free = (await db()).collection('free_use');
    await free.updateOne({ _id: String(key), [field]: { $gte: 1 } }, { $inc: { [field]: -1 } });
    await free.updateOne({ _id: String(key), [field]: { $lte: 0 } }, { $unset: { [field]: '' }, $inc: { n: -1 } });
  }

  async incrementUsage(key, expiresAt) {
    const doc = await (await db()).collection('usage').findOneAndUpdate(
      { _id: String(key) },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: 'after' },
    );
    return doc.count;
  }

  async bestScores({ slug = null, since = null, owner = null, includeProvisional = true } = {}) {
    const match = { score: { $ne: null } };
    if (!includeProvisional) match.provisional = { $ne: true };
    if (owner) Object.assign(match, { ownerKind: String(owner.kind), ownerId: String(owner.id) });
    else match.ownerKind = 'user';
    if (slug) match.slug = String(slug);
    if (since) match.scoredAt = { $gte: since };
    const rows = await (await db()).collection('runs').aggregate([
      { $match: match },
      { $sort: { score: -1, scoredAt: 1 } },
      { $group: {
        _id: { ownerKind: '$ownerKind', ownerId: '$ownerId', slug: '$slug', n: '$n' },
        username: { $first: '$username' },
        graderVersion: { $first: '$graderVersion' },
        score: { $first: '$score' },
        at: { $first: '$scoredAt' },
      } },
    ]).toArray();
    return rows.map(r => ({ ...r._id, username: r.username, score: r.score, at: r.at, graderVersion: r.graderVersion ?? null }));
  }
}
