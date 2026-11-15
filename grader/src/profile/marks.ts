/**
 * Marks a challenge's author writes by hand next to the goal page, after
 * looking at the overlay, to tweak the rules' profile slightly:
 *
 *   { "components": { "the pricing cards": { "importance": "critical" },
 *                     "c5": { "importance": "minor" } },
 *     "keyTexts": { "add": ["$49", "Start free trial"], "drop": ["Learn more"] },
 *     "weightShift": { "content": 0.03, "visual": -0.03 } }
 *
 * Components are found by name or id, key texts by their visible words.
 * Anything unknown or out of bounds is a plain-words error. Pure: the input
 * profile is never changed.
 */
import type { PageSnapshot } from '../types';
import type { Importance, PageComponent, PageProfile, ProfileMarks } from './types';
import { checkWeightShift, flattenComponents, validateProfile } from './index';

const IMPORTANCES: Importance[] = ['critical', 'major', 'normal', 'minor'];
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function blocksWithText(snapshot: PageSnapshot, text: string): number[] {
  const want = norm(text);
  const exact: number[] = [];
  const loose: number[] = [];
  snapshot.blocks.forEach((b, i) => {
    if (b.kind !== 'text' || !b.text) return;
    const t = norm(b.text);
    if (t === want) exact.push(i);
    else if (t.toLowerCase() === want.toLowerCase()) loose.push(i);
  });
  return exact.length ? exact : loose;
}

/**
 * Applies an author's marks to a profile. `snapshot` (the goal's) is needed
 * only to find key texts by their words; marks without key texts work
 * without it.
 */
export function applyMarks(profile: PageProfile, marks: ProfileMarks, snapshot?: PageSnapshot): PageProfile {
  if (!marks || typeof marks !== 'object' || Array.isArray(marks)) throw new Error('The marks must be a JSON object.');
  for (const k of Object.keys(marks)) {
    if (!['components', 'keyTexts', 'weightShift'].includes(k)) throw new Error(`The marks have an unknown entry "${k}"; use components, keyTexts or weightShift.`);
  }
  const out: PageProfile = structuredClone(profile);
  const all = flattenComponents(out.components);
  const find = (key: string): PageComponent => {
    const hit = all.find((c) => c.name === key) ?? all.find((c) => c.id === key);
    if (!hit) throw new Error(`The marks name a component "${key}", but the page has no component with that name or id.`);
    return hit;
  };

  for (const [key, mark] of Object.entries(marks.components ?? {})) {
    const c = find(key);
    if (!mark || typeof mark !== 'object') throw new Error(`The mark for "${key}" must be an object.`);
    for (const f of Object.keys(mark)) {
      if (f !== 'importance' && f !== 'name') throw new Error(`The mark for "${key}" has an unknown field "${f}"; use importance or name.`);
    }
    if (mark.importance !== undefined) {
      if (!IMPORTANCES.includes(mark.importance)) throw new Error(`The importance "${String(mark.importance)}" for "${key}" is not one of ${IMPORTANCES.join(', ')}.`);
      c.importance = mark.importance;
    }
    if (mark.name !== undefined) {
      const name = typeof mark.name === 'string' ? norm(mark.name) : '';
      if (!name) throw new Error(`The new name for "${key}" is empty.`);
      if (all.some((o) => o !== c && o.name === name)) throw new Error(`The new name "${name}" for "${key}" is already used by another component.`);
      c.name = name;
    }
  }

  const add = marks.keyTexts?.add ?? [];
  const drop = marks.keyTexts?.drop ?? [];
  if (add.length || drop.length) {
    if (!snapshot) throw new Error('Key-text marks need the goal snapshot to find texts by their words.');
    const owner = new Map<number, PageComponent[]>(); // block -> the components it is inside, outermost first
    const walk = (c: PageComponent, path: PageComponent[]) => {
      const p = [...path, c];
      for (const b of c.blocks) owner.set(b, p);
      c.children.forEach((k) => walk(k, p));
    };
    out.components.forEach((c) => walk(c, []));
    for (const text of add) {
      const hits = typeof text === 'string' ? blocksWithText(snapshot, text) : [];
      if (!hits.length) throw new Error(`The marks add the key text "${String(text)}", but no text on the page reads that.`);
      for (const b of hits) for (const c of owner.get(b) ?? []) if (!c.keyTexts.includes(b)) c.keyTexts.push(b);
    }
    for (const text of drop) {
      const hits = typeof text === 'string' ? blocksWithText(snapshot, text).filter((b) => all.some((c) => c.keyTexts.includes(b))) : [];
      if (!hits.length) throw new Error(`The marks drop the key text "${String(text)}", but it is not a key text on this page.`);
      for (const c of all) c.keyTexts = c.keyTexts.filter((b) => !hits.includes(b));
    }
    for (const c of all) c.keyTexts.sort((a, b) => a - b);
  }

  if (marks.weightShift !== undefined) {
    const w = marks.weightShift;
    if (!w || typeof w !== 'object') throw new Error('The weight shift mark must be an object.');
    for (const k of Object.keys(w)) {
      if (!['content', 'layout', 'style', 'visual'].includes(k)) throw new Error(`The weight shift names "${k}"; use content, layout, style or visual.`);
    }
    const shift = { content: w.content ?? 0, layout: w.layout ?? 0, style: w.style ?? 0, visual: w.visual ?? 0 };
    checkWeightShift(shift);
    out.weightShift = shift;
  }

  out.source = 'rules+marks';
  if (snapshot) validateProfile(out, snapshot);
  return out;
}
