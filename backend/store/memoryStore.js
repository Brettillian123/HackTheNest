// In-memory store with the same behaviour as MongoStore (mongoStore.js). Used by tests and
// as the reference for the MongoDB version: keep the two in step, method for method.
// Documents are copied in and out, as a database would.
const copy = value => (value == null ? value : structuredClone(value));

function isBetter(a, b) {
  // Higher score first, then earlier.
  return a.score > b.score || (a.score === b.score && a.scoredAt < b.scoredAt);
}

export class MemoryStore {
  constructor() {
    this.users = [];
    this.userIndexes = new Set();
    this.attempts = new Map();
    this.runs = new Map();
    this.usage = new Map();
    this.credits = new Map();
    this.free = new Map();
  }

  // ---------------------------------------------------------------- credits
  // One document per user: { _id: userId, balance, ledger: [{ userId, delta, reason, ref, at }] }.
  // The balance and its ledger entry change together in one step, as one MongoDB document update.

  async getCredits(userId) {
    return this.credits.get(String(userId))?.balance ?? 0;
  }

  async getLedger(userId) {
    return copy(this.credits.get(String(userId))?.ledger || []);
  }

  // Adds `delta` (negative to spend) and writes the ledger entry, or does nothing. `ref` is unique per
  // user: a repeated ref is a no-op returning { ok: true, duplicate: true, entry: <the first one> }.
  // A change that would take the balance below zero is refused: { ok: false, balance }.
  async changeCredits({ userId, delta, reason, ref, at }) {
    const id = String(userId);
    const doc = this.credits.get(id) || { _id: id, balance: 0, ledger: [] };
    const existing = doc.ledger.find(e => e.ref === ref);
    if (existing) return { ok: true, duplicate: true, balance: doc.balance, entry: copy(existing) };
    if (!Number.isInteger(delta) || delta === 0 || doc.balance + delta < 0) return { ok: false, duplicate: false, balance: doc.balance };
    const entry = { userId: id, delta, reason: String(reason), ref: String(ref), at };
    doc.balance += delta;
    doc.ledger.push(entry);
    this.credits.set(id, doc);
    return { ok: true, duplicate: false, balance: doc.balance, entry: copy(entry) };
  }

  // ---------------------------------------------------------------- free tier
  // One document per key and day: { _id: key, n: distinct challenges, s: { slug: prompts }, expiresAt }.

  async getFreeUse(key) {
    const doc = this.free.get(String(key));
    return doc ? { n: doc.n, s: { ...doc.s } } : null;
  }

  // Counts one free prompt on `slug` if the key stays within the limits; returns true when counted.
  async claimFreeUse(key, slug, { maxChallenges, maxPrompts, expiresAt }) {
    const doc = this.free.get(String(key)) || { _id: String(key), n: 0, s: {}, expiresAt };
    if (Object.hasOwn(doc.s, slug)) {
      if (doc.s[slug] >= maxPrompts) return false;
      doc.s[slug] += 1;
    } else {
      if (doc.n >= maxChallenges) return false;
      doc.n += 1;
      doc.s[slug] = 1;
    }
    this.free.set(String(key), doc);
    return true;
  }

  // Gives back one claimed prompt (the run was discarded); a challenge left at 0 prompts is freed too.
  async releaseFreeUse(key, slug) {
    const doc = this.free.get(String(key));
    if (!doc || !Object.hasOwn(doc.s, slug)) return;
    doc.s[slug] -= 1;
    if (doc.s[slug] <= 0) {
      delete doc.s[slug];
      doc.n -= 1;
    }
  }

  async ping() {
    return true;
  }

  // A minimal MongoDB `Db` stand-in for userService (users collection only).
  database() {
    const store = this;
    const users = {
      async createIndex(spec, options = {}) {
        if (options.unique) store.userIndexes.add(Object.keys(spec)[0]);
        return options.name;
      },
      async insertOne(document) {
        for (const field of store.userIndexes) {
          if (store.users.some(u => u[field] === document[field])) {
            throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000, name: 'MongoServerError' });
          }
        }
        store.users.push({ ...document });
        return { acknowledged: true, insertedId: document._id };
      },
      async findOne(query) {
        const found = store.users.find(u => Object.entries(query).every(([k, v]) => u[k] === v));
        return found ? { ...found } : null;
      },
    };
    return { collection: name => (name === 'users' ? users : null) };
  }

  async findUserByUsername(username) {
    const found = this.users.find(u => u.username === username);
    return found ? { id: found._id.toString(), username: found.username, joined: found._id.getTimestamp() } : null;
  }

  async getOpenAttempt(owner, slug) {
    for (const a of this.attempts.values()) {
      if (a.ownerKind === owner.kind && a.ownerId === owner.id && a.slug === slug && a.open) return copy(a);
    }
    return null;
  }

  async getAttempt(id) {
    return copy(this.attempts.get(id) || null);
  }

  // At most one open attempt per (owner, challenge), like the unique partial index in MongoDB.
  async createAttempt(doc) {
    for (const a of this.attempts.values()) {
      if (doc.open && a.open && a.ownerKind === doc.ownerKind && a.ownerId === doc.ownerId && a.slug === doc.slug) {
        throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000, name: 'MongoServerError' });
      }
    }
    this.attempts.set(doc._id, copy(doc));
    return copy(doc);
  }

  async updateAttempt(id, fields) {
    const a = this.attempts.get(id);
    if (a) Object.assign(a, copy(fields));
  }

  // Adds 1 to the prompt count and returns the attempt after the change.
  async bumpPromptCount(id, at) {
    const a = this.attempts.get(id);
    if (!a) return null;
    a.promptCount += 1;
    a.updatedAt = at;
    return copy(a);
  }

  async closeOpenAttempts(owner, slug, at) {
    let closed = 0;
    for (const a of this.attempts.values()) {
      if (a.ownerKind === owner.kind && a.ownerId === owner.id && a.slug === slug && a.open) {
        a.open = false;
        a.updatedAt = at;
        closed += 1;
      }
    }
    return closed;
  }

  async insertRun(doc) {
    this.runs.set(doc._id, copy(doc));
    return copy(doc);
  }

  async getRun(id) {
    return copy(this.runs.get(id) || null);
  }

  async updateRun(id, fields) {
    const r = this.runs.get(id);
    if (r) Object.assign(r, copy(fields));
  }

  async deleteRun(id) {
    this.runs.delete(id);
  }

  async listRuns(attemptId) {
    return [...this.runs.values()].filter(r => r.attemptId === attemptId).sort((a, b) => a.n - b.n).map(copy);
  }

  // Moves an anonymous player's attempts and runs to a user. Afterwards the user keeps at most
  // one open attempt per challenge (the most recently updated). Returns { moved } (attempts).
  async claimAnon(anonId, user, at) {
    let moved = 0;
    for (const a of this.attempts.values()) {
      if (a.ownerKind === 'anon' && a.ownerId === anonId) {
        Object.assign(a, { ownerKind: 'user', ownerId: user.id, username: user.username, updatedAt: a.updatedAt });
        moved += 1;
      }
    }
    for (const r of this.runs.values()) {
      if (r.ownerKind === 'anon' && r.ownerId === anonId) Object.assign(r, { ownerKind: 'user', ownerId: user.id, username: user.username });
    }
    const open = [...this.attempts.values()]
      .filter(a => a.ownerKind === 'user' && a.ownerId === user.id && a.open)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const kept = new Set();
    for (const a of open) {
      if (kept.has(a.slug)) Object.assign(a, { open: false, updatedAt: at });
      else kept.add(a.slug);
    }
    return { moved };
  }

  // Adds 1 to a usage counter and returns the new count.
  async incrementUsage(key, expiresAt) {
    const entry = this.usage.get(key) || { count: 0, expiresAt };
    entry.count += 1;
    this.usage.set(key, entry);
    return entry.count;
  }

  // Best scored run per (owner, challenge, prompt number). Filters: slug, since (Date),
  // owner ({kind,id}); without an owner only signed-in users are included. includeProvisional:
  // false leaves out stand-in scores.
  async bestScores({ slug = null, since = null, owner = null, includeProvisional = true } = {}) {
    const best = new Map();
    for (const r of this.runs.values()) {
      if (r.score == null) continue;
      if (!includeProvisional && r.provisional === true) continue;
      if (owner ? r.ownerKind !== owner.kind || r.ownerId !== owner.id : r.ownerKind !== 'user') continue;
      if (slug && r.slug !== slug) continue;
      if (since && r.scoredAt < since) continue;
      const key = `${r.ownerKind}|${r.ownerId}|${r.slug}|${r.n}`;
      const prev = best.get(key);
      if (!prev || isBetter(r, prev)) best.set(key, r);
    }
    return [...best.values()].map(r => ({
      ownerKind: r.ownerKind, ownerId: r.ownerId, username: r.username, slug: r.slug, n: r.n, score: r.score, at: new Date(r.scoredAt), graderVersion: r.graderVersion ?? null,
    }));
  }
}
