/**
 * The challenge profile of a goal page: the components a person would name,
 * what kind each is, how much it matters for this challenge, and which texts
 * must be word-perfect. Built by rules from what is on screen; pure,
 * synchronous and deterministic. A challenge's author can adjust it with
 * hand-written marks (see marks.ts); nothing here calls a model.
 */
import type { PageSnapshot } from '../types';
import { buildComponents } from './classify';
import { buildUnits, segment, type Unit } from './segment';
import type { Importance, PageComponent, PageProfile } from './types';

export * from './types';
export { applyMarks } from './marks';

export function buildPageProfile(snapshot: PageSnapshot): PageProfile {
  const { roots, backdrops } = buildUnits(snapshot);
  const kidsOf = new Map<number, number[]>();
  const walk = (u: Unit) => {
    if (u.kids.length) kidsOf.set(u.idx, u.kids.map((k) => k.idx));
    u.kids.forEach(walk);
  };
  roots.forEach(walk);
  const ctx = { blocks: snapshot.blocks, snapshot };
  const tree = roots.length ? segment(ctx, roots, null, 0, true) : null;
  // The page itself is not a component; a frame around everything (an invoice sheet, a lone card) is.
  const tops = tree ? (tree.kind === 'region' && tree.container === null ? tree.children : [tree]) : [];
  const { components, weightShift } = buildComponents(snapshot, tops, backdrops, kidsOf);
  return { version: 1, source: 'rules', width: snapshot.width, height: snapshot.height, components, weightShift };
}

const IMPORTANCES: Importance[] = ['critical', 'major', 'normal', 'minor'];
const TYPES = new Set(['navigation', 'hero', 'heading', 'text', 'card-group', 'card', 'table', 'form',
  'list', 'image', 'chart', 'stats', 'footer', 'banner', 'sidebar', 'other']);

export function flattenComponents(components: PageComponent[]): PageComponent[] {
  const out: PageComponent[] = [];
  const walk = (c: PageComponent) => { out.push(c); c.children.forEach(walk); };
  components.forEach(walk);
  return out;
}

/** Throws a plain-words error if the profile does not fit the snapshot or breaks a bound. */
export function validateProfile(profile: PageProfile, snapshot: PageSnapshot): void {
  if (!profile || profile.version !== 1) throw new Error('The profile is not a version 1 page profile.');
  if (profile.source !== 'rules' && profile.source !== 'rules+marks') throw new Error(`The profile's source "${String(profile.source)}" is not 'rules' or 'rules+marks'.`);
  const n = snapshot.blocks.length;
  const owner = new Map<number, string>();
  const ids = new Set<string>();
  const names = new Set<string>();
  const check = (c: PageComponent): Set<number> => {
    if (ids.has(c.id)) throw new Error(`Two components share the id "${c.id}".`);
    ids.add(c.id);
    if (names.has(c.name)) throw new Error(`Two components share the name "${c.name}".`);
    names.add(c.name);
    if (!TYPES.has(c.type)) throw new Error(`Component ${c.id} has an unknown kind "${c.type}".`);
    if (!IMPORTANCES.includes(c.importance)) throw new Error(`Component ${c.id} has an unknown importance "${c.importance}".`);
    const sub = new Set<number>();
    for (const b of c.blocks) {
      if (!Number.isInteger(b) || b < 0 || b >= n) throw new Error(`Component ${c.id} names block ${b}, but the page has blocks 0 to ${n - 1}.`);
      if (owner.has(b)) throw new Error(`Block ${b} is in two components: ${owner.get(b)} and ${c.id}.`);
      owner.set(b, c.id);
      sub.add(b);
    }
    for (const child of c.children) for (const b of check(child)) sub.add(b);
    for (const k of c.keyTexts) {
      if (!sub.has(k)) throw new Error(`Component ${c.id} marks block ${k} as a key text, but that block is not inside it.`);
    }
    return sub;
  };
  profile.components.forEach(check);
  for (let i = 0; i < n; i++) if (!owner.has(i)) throw new Error(`Block ${i} is in no component; the profile must cover every block.`);
  checkWeightShift(profile.weightShift);
}

export function checkWeightShift(w: PageProfile['weightShift']): void {
  const keys = ['content', 'layout', 'style', 'visual'] as const;
  if (!w || typeof w !== 'object') throw new Error('The weight shift is missing.');
  let sum = 0;
  for (const k of keys) {
    const v = w[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`The weight shift for ${k} is not a number.`);
    if (v < -0.05 - 1e-9 || v > 0.05 + 1e-9) throw new Error(`The weight shift for ${k} is ${v}; each shift must be between -0.05 and +0.05.`);
    sum += v;
  }
  if (Math.abs(sum) > 1e-9) throw new Error(`The weight shifts add up to ${sum.toFixed(4)}; they must add up to 0.`);
}
