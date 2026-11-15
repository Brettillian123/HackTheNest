// localStorage helpers. Every call is safe when storage is missing or blocked:
// it falls back to an in-memory map for the life of the page.

const PREFIX = "pd.";
const memory = new Map();
let backend = null;

function getBackend() {
  if (backend) return backend;
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.setItem === "function") {
      const probe = PREFIX + "probe";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      backend = ls;
      return backend;
    }
  } catch {
    // Blocked or unavailable.
  }
  backend = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => { memory.set(k, String(v)); },
    removeItem: (k) => { memory.delete(k); },
  };
  return backend;
}

export function read(key, fallback = null) {
  try {
    const raw = getBackend().getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    getBackend().setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    getBackend().removeItem(PREFIX + key);
  } catch {
    // Nothing to do.
  }
}

function randomId(prefix) {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return prefix + globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    }
  } catch {
    // Fall through.
  }
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export { randomId };

// Anonymous player id, created on first use. The server's X-Anon-Id rule: 16 to 64 of A-Z a-z 0-9 _ -.
const ANON_RE = /^[A-Za-z0-9_-]{16,64}$/;
export function getAnonId() {
  let id = read("anonId");
  if (typeof id !== "string" || !ANON_RE.test(id)) {
    id = randomId("anon_").replace(/[^A-Za-z0-9_-]/g, "");
    while (id.length < 16) id += Math.random().toString(36).slice(2);
    id = id.slice(0, 64);
    write("anonId", id);
  }
  return id;
}

// Attempts and bests belong to the current player: the signed-in account ("player",
// set by api.js after a real or mock sign-in), or the anonymous player on this browser
// (unscoped keys). Keys for an account are prefixed "u.<id>.". moveAnonTo() hands anonymous ones over.
function owner() {
  const u = read("player", null);
  return u && u.id ? "u." + u.id + "." : "";
}

// The signed-in player on this browser: { id, username } or null.
export function getPlayer() {
  return read("player", null);
}
export function setPlayer(user) {
  if (user && user.id) write("player", { id: String(user.id), username: String(user.username || "") });
  else remove("player");
}

// Prompt draft per challenge.
export function getDraft(slug) {
  return read("draft." + slug, "");
}
export function setDraft(slug, text) {
  write("draft." + slug, String(text || ""));
}

// Current attempt per challenge: { id, promptCount, best, runs: [{ n, prompt, model, html, result, at }] }.
export function getAttempt(slug) {
  return read(owner() + "attempt." + slug, null);
}
export function setAttempt(slug, attempt) {
  const key = owner() + "attempt." + slug;
  if (write(key, attempt)) return true;
  // Probably over quota: keep the HTML of the latest run only and retry.
  const slim = {
    ...attempt,
    runs: attempt.runs.map((r, i) => (i === attempt.runs.length - 1 ? r : { ...r, html: "" })),
  };
  return write(key, slim);
}
export function clearAttempt(slug) {
  remove(owner() + "attempt." + slug);
}

// Best result per challenge across attempts: { score, promptCount, attemptId, when }.
export function getBest(slug) {
  return read(owner() + "best." + slug, null);
}
export function setBest(slug, best) {
  write(owner() + "best." + slug, best);
}
export function allBests() {
  return read(owner() + "bests.index", []).map((slug) => ({ slug, ...getBest(slug) })).filter((b) => b.score != null);
}
export function recordBest(slug, best) {
  setBest(slug, best);
  const index = read(owner() + "bests.index", []);
  if (!index.includes(slug)) {
    index.push(slug);
    write(owner() + "bests.index", index);
  }
}

// Moves the anonymous player's bests and attempts onto account userId.
// A best replaces the account's only when it ranks higher (higher score, then fewer prompts);
// an attempt moves only when the account has none for that challenge. Returns the number of bests moved.
export function moveAnonTo(userId) {
  const to = "u." + userId + ".";
  const slugs = read("bests.index", []);
  const index = read(to + "bests.index", []);
  let moved = 0;
  for (const slug of slugs) {
    const b = read("best." + slug, null);
    if (b && b.score != null) {
      const mine = read(to + "best." + slug, null);
      if (!mine || b.score > mine.score || (b.score === mine.score && b.promptCount < mine.promptCount)) write(to + "best." + slug, b);
      if (!index.includes(slug)) index.push(slug);
      moved++;
    }
    const a = read("attempt." + slug, null);
    if (a && !read(to + "attempt." + slug, null)) write(to + "attempt." + slug, a);
    remove("best." + slug);
    remove("attempt." + slug);
  }
  write(to + "bests.index", index);
  remove("bests.index");
  return moved;
}

// Test helper: forget the memory fallback and re-detect storage.
export function _resetForTests() {
  memory.clear();
  try {
    const ls = backend && backend !== globalThis.localStorage ? null : globalThis.localStorage;
    if (ls && typeof ls.key === "function") {
      const keys = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach((k) => ls.removeItem(k));
    }
  } catch {
    // Storage unavailable: memory was cleared above.
  }
  backend = null;
}
