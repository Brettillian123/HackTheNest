/**
 * Reading the candidate plan and checking the rubric. Each returns the first
 * thing wrong in plain words, or the cleaned value. Missing optional content
 * (no proof, no title, no cap) is not a shape error: the scorer marks it down
 * and says so. Wrong types and the sketch's old field names are shape errors.
 */
import type { Budget, Loop, Plan, RubricLoop, RubricStage, Step, StepKind, WorkflowRubric } from './types';
import { longestPathNodes } from './graph';

export const LIMITS = {
  textChars: 2_000_000,
  steps: 500,
  loops: 50,
  listEntries: 200,
  stringChars: 4000,
};

const KINDS: StepKind[] = ['work', 'review', 'research', 'decision'];
const IMPORTANCE = ['critical', 'major', 'normal', 'minor'];

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };

const fail = (error: string): Err => ({ ok: false, error });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const kindOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v === 'string' ? 'text' : typeof v);
const clip = (s: string): string => (s.length > LIMITS.stringChars ? s.slice(0, LIMITS.stringChars) : s);
const show = (s: string): string => (s.length > 40 ? `${s.slice(0, 37)}...` : s);

/** Old or common names a model may use instead of the final ones. */
const STEP_ALIASES: [string, string][] = [
  ['files', 'changes'],
  ['writes', 'changes'],
  ['depends', 'dependsOn'],
  ['deps', 'dependsOn'],
  ['dependencies', 'dependsOn'],
  ['needs', 'dependsOn'],
  ['depends_on', 'dependsOn'],
  ['name', 'title'],
  ['agent', 'owner'],
];
const LOOP_ALIASES: [string, string][] = [
  ['exitTest', 'until'],
  ['exit', 'until'],
  ['exitWhen', 'until'],
  ['max', 'maxRounds'],
  ['maxIterations', 'maxRounds'],
  ['cap', 'maxRounds'],
  ['rounds', 'maxRounds'],
];

/** Text from a model: JSON, optionally inside one ```json fence. Objects pass through. */
export function parseCandidate(candidate: unknown): Ok<unknown> | Err {
  if (typeof candidate !== 'string') {
    if (candidate === undefined || candidate === null) return fail('No plan was given.');
    return { ok: true, value: candidate };
  }
  if (candidate.length > LIMITS.textChars) return fail(`The plan is longer than ${LIMITS.textChars.toLocaleString('en-US')} characters.`);
  let text = candidate.replace(/^﻿/, '').trim();
  if (!text) return fail('The plan is empty: the model returned no text.');
  const fence = /^```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(text);
  if (fence) text = fence[1].trim();
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const msg = e instanceof RangeError ? 'it is nested too deeply to read' : String((e as Error).message ?? e).slice(0, 120);
    return fail(`The plan is not valid JSON (${msg}). Ask the model for JSON only, with no text around it.`);
  }
}

function stringList(v: unknown, where: string, example: string): Ok<string[]> | Err {
  if (v === undefined || v === null) return { ok: true, value: [] };
  if (!Array.isArray(v)) return fail(`${where} must be a list, like ${example}; got ${kindOf(v)}.`);
  if (v.length > LIMITS.listEntries) return fail(`${where} has more than ${LIMITS.listEntries} entries.`);
  const out: string[] = [];
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string') return fail(`${where} must hold only text; entry ${i + 1} is ${kindOf(v[i])}.`);
    out.push(clip(v[i] as string));
  }
  return { ok: true, value: out };
}

function optText(v: unknown, where: string): Ok<string> | Err {
  if (v === undefined || v === null) return { ok: true, value: '' };
  if (typeof v !== 'string') return fail(`${where} must be text; got ${kindOf(v)}.`);
  return { ok: true, value: clip(v) };
}

export interface ReadPlan {
  plan: Plan;
  /** Fields the plan left out, by step id: "changes", "title"... */
  missing: Map<string, Set<string>>;
}

/** Check the shape of a parsed plan. */
export function readPlan(raw: unknown): Ok<ReadPlan> | Err {
  if (!isObj(raw)) return fail(`The plan must be a JSON object with "goal" and "steps"; got ${kindOf(raw)}.`);
  const goal = optText(raw.goal, 'The goal');
  if (!goal.ok) return goal;
  if (raw.steps === undefined) return fail('The plan has no "steps" list.');
  if (!Array.isArray(raw.steps)) return fail(`"steps" must be a list of step objects; got ${kindOf(raw.steps)}.`);
  if (raw.steps.length === 0) return fail('The "steps" list is empty.');
  if (raw.steps.length > LIMITS.steps) return fail(`The plan has ${raw.steps.length} steps; the grader reads at most ${LIMITS.steps}.`);
  const missing = new Map<string, Set<string>>();
  const steps: Step[] = [];
  for (let i = 0; i < raw.steps.length; i++) {
    const s = raw.steps[i];
    const at = `Step ${i + 1}`;
    if (!isObj(s)) return fail(`${at} must be an object; got ${kindOf(s)}.`);
    if (typeof s.id !== 'string' || !s.id.trim()) return fail(`${at} has no "id" (text, unique, like "build-home").`);
    const id = clip(s.id.trim());
    const where = `Step '${show(id)}'`;
    for (const [alias, real] of STEP_ALIASES) {
      if (alias in s && !(real in s)) return fail(`${where} has "${alias}"; this grader reads "${real}". Use the field names from the lesson.`);
    }
    const title = optText(s.title, `${where}: "title"`);
    if (!title.ok) return title;
    const owner = optText(s.owner, `${where}: "owner"`);
    if (!owner.ok) return owner;
    const proof = optText(s.proof, `${where}: "proof"`);
    if (!proof.ok) return proof;
    const dependsOn = stringList(s.dependsOn, `${where}: "dependsOn"`, '["plan"]');
    if (!dependsOn.ok) return dependsOn;
    const changes = stringList(s.changes, `${where}: "changes"`, '["site/index.html"]');
    if (!changes.ok) return changes;
    const reads = stringList(s.reads, `${where}: "reads"`, '["PLAN.md"]');
    if (!reads.ok) return reads;
    let budget: Budget | undefined;
    if (s.budget !== undefined && s.budget !== null) {
      if (!isObj(s.budget)) return fail(`${where}: "budget" must be an object like {"toolCalls": 30} or {"minutes": 10}; got ${kindOf(s.budget)}.`);
      budget = {};
      for (const key of ['toolCalls', 'minutes'] as const) {
        const v = s.budget[key];
        if (v === undefined || v === null) continue;
        if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`${where}: budget.${key} must be a number; got ${kindOf(v)}.`);
        budget[key] = v;
      }
    }
    let kind: StepKind | undefined;
    if (s.kind !== undefined && s.kind !== null) {
      if (typeof s.kind !== 'string' || !KINDS.includes(s.kind as StepKind)) return fail(`${where}: "kind" must be one of ${KINDS.join(', ')}; got ${JSON.stringify(String(s.kind)).slice(0, 40)}.`);
      kind = s.kind as StepKind;
    }
    const gaps = new Set<string>();
    for (const key of ['title', 'owner', 'proof', 'dependsOn', 'changes']) if (s[key] === undefined || s[key] === null) gaps.add(key);
    if (!missing.has(id)) missing.set(id, gaps);
    steps.push({ id, title: title.value, owner: owner.value, dependsOn: dependsOn.value, changes: changes.value, reads: reads.value, proof: proof.value, budget, kind });
  }
  const loops: Loop[] = [];
  if (raw.loops !== undefined && raw.loops !== null) {
    if (!Array.isArray(raw.loops)) return fail(`"loops" must be a list; got ${kindOf(raw.loops)}.`);
    if (raw.loops.length > LIMITS.loops) return fail(`The plan has more than ${LIMITS.loops} loops.`);
    for (let i = 0; i < raw.loops.length; i++) {
      const l = raw.loops[i];
      const at = `Loop ${i + 1}`;
      if (!isObj(l)) return fail(`${at} must be an object; got ${kindOf(l)}.`);
      if (typeof l.id !== 'string' || !l.id.trim()) return fail(`${at} has no "id".`);
      const id = clip(l.id.trim());
      const where = `Loop '${show(id)}'`;
      for (const [alias, real] of LOOP_ALIASES) {
        if (alias in l && !(real in l)) return fail(`${where} has "${alias}"; this grader reads "${real}". Use the field names from the lesson.`);
      }
      const ls = stringList(l.steps, `${where}: "steps"`, '["grade", "fix"]');
      if (!ls.ok) return ls;
      const until = optText(l.until, `${where}: "until"`);
      if (!until.ok) return until;
      const heldOut = optText(l.heldOut, `${where}: "heldOut"`);
      if (!heldOut.ok) return heldOut;
      let maxRounds = NaN;
      if (l.maxRounds !== undefined && l.maxRounds !== null) {
        if (typeof l.maxRounds !== 'number' || !Number.isFinite(l.maxRounds)) return fail(`${where}: "maxRounds" must be a number; got ${kindOf(l.maxRounds)}.`);
        maxRounds = l.maxRounds;
      }
      loops.push({ id, steps: ls.value, until: until.value, maxRounds, heldOut: heldOut.value });
    }
  }
  return { ok: true, value: { plan: { goal: goal.value, steps, loops }, missing } };
}

/** Check a rubric; errors are written for the challenge author. */
export function readRubric(raw: unknown): Ok<WorkflowRubric> | Err {
  const r = (msg: string): Err => fail(`Rubric: ${msg}`);
  if (!isObj(raw)) return r(`must be an object with a "stages" list; got ${kindOf(raw)}.`);
  if (!Array.isArray(raw.stages) || raw.stages.length === 0) return r('"stages" must be a non-empty list of {name, match}.');
  const names = new Set<string>();
  const stages: RubricStage[] = [];
  for (let i = 0; i < raw.stages.length; i++) {
    const s = raw.stages[i];
    const at = `stages[${i}]`;
    if (!isObj(s)) return r(`${at} must be an object.`);
    if (typeof s.name !== 'string' || !s.name.trim()) return r(`${at} has no name.`);
    if (names.has(s.name)) return r(`two stages are called '${s.name}'; names must be unique.`);
    names.add(s.name);
    if (!isObj(s.match)) return r(`stage '${s.name}' has no "match" object.`);
    const m = s.match;
    const known = ['titleAny', 'changesAny', 'readsAny', 'kind'];
    for (const k of Object.keys(m)) if (!known.includes(k)) return r(`stage '${s.name}' match has "${k}"; use ${known.join(', ')}.`);
    if (!known.some((k) => m[k] !== undefined)) return r(`stage '${s.name}' match is empty; give titleAny, changesAny, readsAny or kind.`);
    for (const k of ['titleAny', 'changesAny', 'readsAny']) {
      const v = m[k];
      if (v === undefined) continue;
      if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== 'string' || !x.trim())) return r(`stage '${s.name}' match.${k} must be a non-empty list of non-empty text.`);
    }
    if (m.kind !== undefined && !KINDS.includes(m.kind as StepKind)) return r(`stage '${s.name}' match.kind must be one of ${KINDS.join(', ')}.`);
    if (s.importance !== undefined && !IMPORTANCE.includes(s.importance as string)) return r(`stage '${s.name}' importance must be one of ${IMPORTANCE.join(', ')}.`);
    stages.push(s as unknown as RubricStage);
  }
  const need = (name: unknown, where: string): Err | null =>
    typeof name === 'string' && names.has(name) ? null : r(`${where} names ${JSON.stringify(name)}, which is not a stage.`);
  const before: [string, string][] = [];
  if (raw.before !== undefined) {
    if (!Array.isArray(raw.before)) return r('"before" must be a list of [stageA, stageB] pairs.');
    for (let i = 0; i < raw.before.length; i++) {
      const p = raw.before[i];
      if (!Array.isArray(p) || p.length !== 2) return r(`before[${i}] must be a pair [stageA, stageB].`);
      const e = need(p[0], `before[${i}]`) ?? need(p[1], `before[${i}]`);
      if (e) return e;
      if (p[0] === p[1]) return r(`before[${i}] puts '${p[0]}' before itself.`);
      before.push([p[0], p[1]]);
    }
    const idx = [...names];
    const edges: number[][] = idx.map(() => []);
    for (const [a, b] of before) edges[idx.indexOf(a)].push(idx.indexOf(b));
    if (longestPathNodes(idx.length, edges) < 0) return r('"before" contains a cycle, so no plan could satisfy it.');
  }
  if (raw.parallel !== undefined) {
    if (!Array.isArray(raw.parallel)) return r('"parallel" must be a list of stage-name lists.');
    for (let i = 0; i < raw.parallel.length; i++) {
      const g = raw.parallel[i];
      if (!Array.isArray(g) || g.length < 2) return r(`parallel[${i}] must list at least two stages.`);
      for (const n of g) {
        const e = need(n, `parallel[${i}]`);
        if (e) return e;
      }
    }
  }
  const loops: RubricLoop[] = [];
  if (raw.loops !== undefined) {
    if (!Array.isArray(raw.loops)) return r('"loops" must be a list.');
    for (let i = 0; i < raw.loops.length; i++) {
      const l = raw.loops[i];
      if (!isObj(l) || typeof l.name !== 'string' || !l.name.trim()) return r(`loops[${i}] must be an object with a name.`);
      if (!Array.isArray(l.stages) || l.stages.length === 0) return r(`loop '${l.name}' must list its stages.`);
      for (const n of l.stages) {
        const e = need(n, `loop '${l.name}'`);
        if (e) return e;
      }
      if (typeof l.maxRoundsAtMost !== 'number' || !Number.isInteger(l.maxRoundsAtMost) || l.maxRoundsAtMost < 1) return r(`loop '${l.name}' maxRoundsAtMost must be a whole number of at least 1.`);
      if (l.needsHeldOut !== undefined && typeof l.needsHeldOut !== 'boolean') return r(`loop '${l.name}' needsHeldOut must be true or false.`);
      if (l.heldOutPaths !== undefined && (!Array.isArray(l.heldOutPaths) || l.heldOutPaths.some((x) => typeof x !== 'string' || !x.trim()))) return r(`loop '${l.name}' heldOutPaths must be a list of paths.`);
      loops.push(l as unknown as RubricLoop);
    }
  }
  if (raw.reviewOf !== undefined) {
    if (!Array.isArray(raw.reviewOf)) return r('"reviewOf" must be a list of stage names.');
    for (const n of raw.reviewOf) {
      const e = need(n, 'reviewOf');
      if (e) return e;
    }
  }
  if (raw.limits !== undefined) {
    if (!isObj(raw.limits)) return r('"limits" must be an object.');
    for (const [k, v] of Object.entries(raw.limits)) {
      if (!['maxSteps', 'maxOwners', 'maxParallel'].includes(k)) return r(`limits has "${k}"; use maxSteps, maxOwners or maxParallel.`);
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return r(`limits.${k} must be a whole number of at least 1.`);
    }
  }
  return {
    ok: true,
    value: {
      stages,
      before,
      parallel: (raw.parallel as string[][] | undefined) ?? [],
      loops,
      reviewOf: (raw.reviewOf as string[] | undefined) ?? [],
      limits: (raw.limits as WorkflowRubric['limits']) ?? {},
    },
  };
}
