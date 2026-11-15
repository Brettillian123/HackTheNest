// MongoDB store. Mirrors MemoryStore (memoryStore.js) method for method; keep it thin.
// Every value reaching a query is a validated string, number, boolean or Date from the services,
// never a raw request object. Collections: attempts, runs, usage (indexes made lazily).
import { getDatabase } from '../config/database.js';

let indexesPromise = null;

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
