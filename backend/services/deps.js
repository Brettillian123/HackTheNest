// Injectable dependencies for the game backend. Production uses MongoDB, global fetch,
// process.env and the clock; tests swap any of them with setDeps().
import { MongoStore } from '../store/mongoStore.js';

const defaults = () => ({
  store: new MongoStore(),
  fetch: (...args) => globalThis.fetch(...args),
  env: process.env,
  now: () => Date.now(),
});

let current = null;

export function getDeps() {
  if (!current) current = defaults();
  return current;
}

export function setDeps(partial = {}) {
  current = { ...getDeps(), ...partial };
  return current;
}

export function resetDeps() {
  current = null;
}
