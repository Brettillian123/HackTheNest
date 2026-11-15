/**
 * Workflow grader scoring. Seven named criteria, each 0 to 1:
 *   works: stages, order, loops (multiplied: a plan missing a piece does not run)
 *   looks: clarity
 *   engineering: safety, proof, economy (the weakest counts)
 * total = 100 x (0.40 works + 0.25 looks + 0.35 engineering x works).
 * Every fault carries a weight inside its criterion; feedback points share
 * out (100 - total) by criterion, then by weight, so the shown and hidden
 * points add up to what was lost.
 */
import { analyse, firstOverlap, globsOverlap, longestPathNodes, type GraphInfo } from './graph';
import type { Plan, Step, WorkflowCriterion, WorkflowCriterionId, WorkflowFeedback, WorkflowGradeResult, WorkflowGroup, WorkflowRubric } from './types';

export const WORKFLOW_GRADER_VERSION = 'workflow-1';
export const WORKFLOW_WEIGHTS = { works: 0.4, looks: 0.25, engineering: 0.35 };
const IMPORTANCE_WEIGHT = { critical: 1.5, major: 1.25, normal: 1, minor: 0.75 } as const;

const NAMES: Record<WorkflowCriterionId, [string, WorkflowGroup]> = {
  stages: ['Required stages', 'works'],
  order: ['Order and dependencies', 'works'],
  loops: ['Loops', 'works'],
  safety: ['One owner per file', 'engineering'],
  proof: ['Proof and review', 'engineering'],
  economy: ['Economy', 'engineering'],
  clarity: ['Clarity', 'looks'],
};

interface Fault {
  criterion: WorkflowCriterionId;
  message: string;
  weight: number;
}

const q = (s: string): string => `'${s.length > 48 ? `${s.slice(0, 45)}...` : s}'`;
const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const round1 = (x: number): number => Math.round(x * 10) / 10;
const listNames = (ids: string[], max = 3): string => ids.slice(0, max).map(q).join(', ') + (ids.length > max ? ` and ${ids.length - max} more` : '');

// ------------------------------------------------------- checkable text

const STOP = new Set(
  'a an the it its is are be been to of in on for and or until when once then we they all each every this that loop step steps round rounds has have no not'.split(' '),
);
const DONE_WORDS = new Set('done finished finish finishes complete completed ready over stop stops end ends good fine ok okay better right correct happy satisfied works working perfect'.split(' '));
const SIGNAL =
  /\d|`|%|>=|<=|\b(pass(es|ed|ing)?|fail(s|ed|ing|ures?)?|tests?|score[sd]?|exit code|errors?|warnings?|zero|improv(es|ed|ement)|progress|equals?|match(es)?|returns?|count|threshold|below|above|at least|at most|exists?|lists?|shows?|contains?|screenshots?|outputs?|reports?|logs?|builds?|compiles?|lint|diffs?|benchmark|accuracy|held.?out|visible|checks?|cites?|sources?|links?|verified|url|run|runs|commands?|files?|saved|opens?|renders?)\b/;
const PATH = /[\w-]+\.[a-z0-9]{1,5}\b|[\w-]+\/[\w*.-]/i;

type Checkable = 'empty' | 'circular' | 'vague' | 'ok';

/** Can a person or script check this text? `own` holds the words of the thing it describes, for spotting circular exit tests. */
export function checkable(text: string, own?: Set<string>): Checkable {
  const t = text.trim();
  if (!t) return 'empty';
  const lower = t.toLowerCase();
  if (own) {
    const content = words(lower).filter((w) => !STOP.has(w) && !own.has(w));
    if (!/\d/.test(lower) && (content.length === 0 || content.every((w) => DONE_WORDS.has(w)))) return 'circular';
  }
  if (SIGNAL.test(lower) || PATH.test(t)) return 'ok';
  return 'vague';
}

// ------------------------------------------------------- the scorer

interface Ctx {
  plan: Plan;
  rubric: WorkflowRubric;
  steps: Step[];
  /** Index of the first step with each id. */
  byId: Map<string, number>;
  g: GraphInfo;
  stageSteps: Map<string, number[]>;
  unknownDeps: [number, string][];
  duplicateIds: string[];
  missing: Map<string, Set<string>>;
}

const kindOf = (s: Step): string => s.kind ?? 'work';

function matchesStage(s: Step, m: WorkflowRubric['stages'][number]['match']): boolean {
  if (m.kind && kindOf(s) !== m.kind) return false;
  if (m.titleAny) {
    const text = ` ${words(`${s.id} ${s.title} ${s.owner}`).join(' ')} `;
    if (!m.titleAny.some((e) => text.includes(` ${words(e).join(' ')}`))) return false;
  }
  if (m.changesAny && !firstOverlap(s.changes, m.changesAny)) return false;
  if (m.readsAny && !firstOverlap(s.reads ?? [], m.readsAny)) return false;
  return true;
}

function build(plan: Plan, rubric: WorkflowRubric, missing: Map<string, Set<string>>): Ctx {
  const steps = plan.steps;
  const byId = new Map<string, number>();
  const duplicateIds: string[] = [];
  steps.forEach((s, i) => {
    if (byId.has(s.id)) duplicateIds.push(s.id);
    else byId.set(s.id, i);
  });
  const edges: number[][] = steps.map(() => []);
  const unknownDeps: [number, string][] = [];
  steps.forEach((s, i) => {
    const seen = new Set<number>();
    for (const d of s.dependsOn) {
      const j = byId.get(d);
      if (j === undefined) unknownDeps.push([i, d]);
      else if (!seen.has(j)) {
        seen.add(j);
        edges[j].push(i);
      }
    }
  });
  const g = analyse(steps.length, edges);
  const stageSteps = new Map<string, number[]>();
  for (const st of rubric.stages) {
    const hits: number[] = [];
    steps.forEach((s, i) => {
      if (matchesStage(s, st.match)) hits.push(i);
    });
    stageSteps.set(st.name, hits);
  }
  return { plan, rubric, steps, byId, g, stageSteps, unknownDeps, duplicateIds, missing };
}

/** Steps whose cycle no declared loop covers. */
function unmarkedCycles(c: Ctx): number[][] {
  const loopSets = (c.plan.loops ?? []).map((l) => new Set(l.steps));
  return c.g.cycles.filter((cyc) => !loopSets.some((set) => cyc.every((i) => set.has(c.steps[i].id))));
}

function cycleMessage(c: Ctx, cyc: number[]): string {
  const ids = cyc.map((i) => c.steps[i].id);
  if (ids.length === 1) return `Step ${q(ids[0])} depends on itself: remove its own id from dependsOn`;
  return `Steps ${listNames(ids, 4)} wait on each other in a cycle no loop declares: break the cycle, or declare it in loops with an until test and maxRounds`;
}

function scoreStages(c: Ctx, faults: Fault[]): number {
  let total = 0;
  let met = 0;
  const lost: [string, number][] = [];
  for (const st of c.rubric.stages) {
    const w = IMPORTANCE_WEIGHT[st.importance ?? 'normal'];
    total += w;
    if ((c.stageSteps.get(st.name) ?? []).length) met += w;
    else lost.push([st.name, w]);
  }
  const frac = total ? met / total : 1;
  for (const [name, w] of lost) faults.push({ criterion: 'stages', message: `The plan has no step for the stage ${q(name)}: add one`, weight: w });
  // Each missing stage costs 2.5 times its share: a plan missing a piece of the job does not do the job.
  return 1 - 2.5 * (1 - frac);
}

function scoreOrder(c: Ctx, faults: Fault[], cycles: number[][]): number {
  // Orderings that name a missing stage are left out: the missing stage is marked under stages.
  const before = (c.rubric.before ?? []).filter(([a, b]) => (c.stageSteps.get(a) ?? []).length && (c.stageSteps.get(b) ?? []).length);
  let held = 0;
  for (const [a, b] of before) {
    const as = c.stageSteps.get(a) ?? [];
    const bs = c.stageSteps.get(b) ?? [];
    // Every step of B waits for at least one step of A (a step that is in both counts as met).
    // "At least one" keeps a broad stage match (a final fix step that also touches a page) from
    // breaking orderings that the plan really keeps.
    // A B-step that runs before some A-step is a broad match from upstream (a test-loading step
    // that also says "visible") and is ignored, as long as some real B-step comes after A.
    let bad: [number, number] | null = null;
    let after = 0;
    for (const y of bs) {
      if (as.includes(y)) continue;
      if (as.some((x) => c.g.reaches(x, y))) after++;
      else if (!as.some((x) => c.g.reaches(y, x)) && !bad) bad = [as[0], y];
    }
    if (!bad && !after && bs.some((y) => !as.includes(y))) {
      const y = bs.find((s) => !as.includes(s))!;
      bad = [as[0], y];
    }
    if (!bad) held++;
    else {
      const [x, y] = bad;
      faults.push({
        criterion: 'order',
        message: `Step ${q(c.steps[y].id)} can start before ${q(c.steps[x].id)} finishes, but ${q(a)} must come before ${q(b)}: add ${q(c.steps[x].id)} to its dependsOn`,
        weight: 1 / before.length,
      });
    }
  }
  const frac = before.length ? held / before.length : 1;
  const u = c.unknownDeps.length;
  for (const [i, d] of c.unknownDeps.slice(0, 5)) {
    faults.push({ criterion: 'order', message: `Step ${q(c.steps[i].id)} depends on ${q(d)}, which is not a step id: fix the id or remove it`, weight: 0.15 });
  }
  for (const cyc of cycles) faults.push({ criterion: 'order', message: cycleMessage(c, cyc), weight: 0.3 });
  // Each broken ordering costs twice its share.
  return Math.max(0, 1 - 2 * (1 - frac)) * Math.max(0.4, 1 - 0.15 * u) * Math.max(0.3, 1 - 0.3 * cycles.length);
}

function loopOwnWords(c: Ctx, loop: NonNullable<Plan['loops']>[number]): Set<string> {
  const own = new Set(words(loop.id));
  for (const id of loop.steps) {
    for (const w of words(id)) own.add(w);
    const i = c.byId.get(id);
    if (i !== undefined) for (const w of words(c.steps[i].title)) own.add(w);
  }
  return own;
}

/** Quality of one declared loop against an optional rubric loop: exit test, cap, held-out, unknown ids. */
function loopQuality(c: Ctx, loop: NonNullable<Plan['loops']>[number], need: NonNullable<WorkflowRubric['loops']>[number] | null, faults: Fault[], weight: number): number {
  let v = 1;
  const add = (factor: number, message: string) => {
    v *= factor;
    faults.push({ criterion: 'loops', message, weight: weight * (1 - factor) });
  };
  // A cap without an exit test wastes rounds; an exit test without a cap may never end; with
  // neither the loop is a runaway. Each costs more when the other is missing too.
  const exit = checkable(loop.until, loopOwnWords(c, loop));
  const capped = Number.isFinite(loop.maxRounds) && loop.maxRounds >= 1;
  const exitOk = exit === 'ok';
  if (exit === 'empty') add(capped ? 0.6 : 0.4, `The loop ${q(loop.id)} has no exit test: set until to something a script can check, like "all 20 visible tests pass"`);
  else if (exit === 'circular') add(capped ? 0.65 : 0.45, `The loop ${q(loop.id)} ends when ${q(loop.until)}, which only restates the loop: name a test result or a number`);
  else if (exit === 'vague') add(capped ? 0.75 : 0.55, `The loop ${q(loop.id)} exit test ${q(loop.until)} cannot be checked: name a test result or a number`);
  if (!capped) add(exitOk ? 0.7 : 0.6, `The loop ${q(loop.id)} has no cap on rounds: set maxRounds${need ? ` to ${need.maxRoundsAtMost} or less` : ''}`);
  else if (need && loop.maxRounds > need.maxRoundsAtMost) add(0.7, `The loop ${q(loop.id)} allows ${loop.maxRounds} rounds; this job allows at most ${need.maxRoundsAtMost}: lower maxRounds`);
  const unknown = loop.steps.filter((id) => !c.byId.has(id));
  for (const id of unknown.slice(0, 3)) add(0.8, `The loop ${q(loop.id)} lists ${q(id)}, which is not a step id`);
  if (!loop.steps.length) add(0.5, `The loop ${q(loop.id)} lists no steps: name the step ids that repeat`);
  if (need?.needsHeldOut && !loop.heldOut?.trim()) add(0.8, `The loop ${q(loop.id)} has no held-out check: say in heldOut what it is checked on at the end that it never tuned against`);
  if (need?.heldOutPaths?.length) {
    const inside = loop.steps.map((id) => c.byId.get(id)).filter((i): i is number => i !== undefined);
    let leak: string | null = null;
    for (const i of inside) {
      const s = c.steps[i];
      const hit = firstOverlap([...s.changes, ...(s.reads ?? [])], need.heldOutPaths);
      if (hit) {
        leak = `Step ${q(s.id)} is inside the loop ${q(loop.id)} and sees \`${hit[0]}\`, the held-out set: keep held-out files away from every step that tunes`;
        break;
      }
    }
    if (!leak) {
      for (let j = 0; j < c.steps.length && !leak; j++) {
        if (inside.includes(j)) continue;
        const hit = firstOverlap(c.steps[j].reads ?? [], need.heldOutPaths);
        if (hit && inside.some((i) => c.g.reaches(j, i))) {
          leak = `Step ${q(c.steps[j].id)} reads \`${hit[0]}\`, the held-out set, before the loop ${q(loop.id)}: move that read after the loop`;
        }
      }
    }
    if (leak) add(0.6, leak);
  }
  return v;
}

function scoreLoops(c: Ctx, faults: Fault[], cycles: number[][]): number {
  const declared = c.plan.loops ?? [];
  const used = new Set<number>();
  const needs = c.rubric.loops ?? [];
  let sum = 0;
  const credited = new Set<number[]>();
  for (const need of needs) {
    let best = -1;
    let bestCover = 0;
    declared.forEach((l, k) => {
      const set = new Set(l.steps);
      const cover = need.stages.filter((st) => (c.stageSteps.get(st) ?? []).some((i) => set.has(c.steps[i].id))).length;
      if (cover > bestCover && !used.has(k)) {
        best = k;
        bestCover = cover;
      }
    });
    const w = 1 / needs.length;
    if (best < 0) {
      // The steps already wait on each other in a cycle: the loop is there, only undeclared
      // (no exit test, no cap). That cycle is counted here once, not again below.
      const cyc = cycles.find((cy) => need.stages.every((st) => (c.stageSteps.get(st) ?? []).some((i) => cy.includes(i))));
      if (cyc) credited.add(cyc);
      const credit = cyc ? 0.5 : 0;
      sum += credit;
      faults.push({
        criterion: 'loops',
        message: `The plan declares no loop for ${q(need.name)}: add one to loops with the steps for ${need.stages.map(q).join(' and ')}, an until test and maxRounds of ${need.maxRoundsAtMost} or less`,
        weight: w * (1 - credit),
      });
      continue;
    }
    used.add(best);
    const loop = declared[best];
    const coverFrac = bestCover / need.stages.length;
    let v = 0.5 + 0.5 * coverFrac;
    if (coverFrac < 1) {
      const lacking = need.stages.filter((st) => !(c.stageSteps.get(st) ?? []).some((i) => loop.steps.includes(c.steps[i].id)));
      faults.push({ criterion: 'loops', message: `The loop ${q(loop.id)} should repeat a step for ${lacking.map(q).join(' and ')} too: add it to the loop's steps`, weight: w * (1 - v) });
    }
    v *= loopQuality(c, loop, need, faults, w * v);
    sum += v;
  }
  let value = needs.length ? sum / needs.length : 1;
  declared.forEach((l, k) => {
    if (!used.has(k)) value *= loopQuality(c, l, null, faults, value);
  });
  for (const cyc of cycles) {
    if (credited.has(cyc)) continue;
    value *= 0.7;
    faults.push({ criterion: 'loops', message: cycleMessage(c, cyc), weight: 0.3 });
  }
  return value;
}

function scoreSafety(c: Ctx, faults: Fault[]): number {
  const n = c.steps.length;
  const changing = c.steps.map((s, i) => (s.changes.length ? i : -1)).filter((i) => i >= 0);
  let pairs = 0;
  for (let x = 0; x < changing.length; x++) {
    for (let y = x + 1; y < changing.length; y++) {
      const i = changing[x];
      const j = changing[y];
      if (!c.g.parallel(i, j)) continue;
      const hit = firstOverlap(c.steps[i].changes, c.steps[j].changes);
      if (!hit) continue;
      pairs++;
      if (pairs <= 6) {
        const file = hit[0] === hit[1] ? `\`${hit[0]}\`` : `\`${hit[0]}\` and \`${hit[1]}\``;
        faults.push({
          criterion: 'safety',
          message: `Steps ${q(c.steps[i].id)} and ${q(c.steps[j].id)} can run at the same time and both change ${file}: give the file one owner or make one depend on the other`,
          weight: 1,
        });
      }
    }
  }
  void n;
  return 1 / (1 + 2 * pairs);
}

function scoreProof(c: Ctx, faults: Fault[]): number {
  const n = c.steps.length;
  let sum = 0;
  c.steps.forEach((s) => {
    const k = checkable(s.proof);
    const v = k === 'ok' ? 1 : k === 'empty' ? 0 : 0.2;
    sum += v;
    if (k === 'empty') faults.push({ criterion: 'proof', message: `Step ${q(s.id)} has no proof: name the command, test or file that shows it is done`, weight: 1 / n });
    else if (k !== 'ok') faults.push({ criterion: 'proof', message: `Step ${q(s.id)} proof ${q(s.proof)} cannot be checked: name a command, a test or a file`, weight: 0.8 / n });
  });
  const stepMean = sum / n;
  const reviewOf = c.rubric.reviewOf ?? [];
  const reviews = c.steps.map((s, i) => (kindOf(s) === 'review' ? i : -1)).filter((i) => i >= 0);
  let factorSum = 0;
  let counted = 0;
  for (const st of reviewOf) {
    const targets = c.stageSteps.get(st) ?? [];
    if (!targets.length) continue;
    counted++;
    if (!reviews.length) {
      factorSum += 0.35;
      faults.push({
        criterion: 'proof',
        message: `No review step checks ${q(st)}: add a step with kind "review" that depends on ${listNames(targets.map((i) => c.steps[i].id))}`,
        weight: 0.65,
      });
      continue;
    }
    // A step of the stage that comes after the review (the fix it leads to) needs no review.
    const covered = (t: number, r: number): boolean => t === r || c.g.reaches(t, r) || c.g.reaches(r, t);
    let bestFrac = -1;
    let bestR = reviews[0];
    for (const r of reviews) {
      const f = targets.filter((t) => covered(t, r)).length / targets.length;
      if (f > bestFrac) {
        bestFrac = f;
        bestR = r;
      }
    }
    if (bestFrac >= 1) {
      factorSum += 1;
      continue;
    }
    const v = 0.35 + 0.5 * bestFrac;
    factorSum += v;
    const lacking = targets.filter((t) => !covered(t, bestR)).map((i) => c.steps[i].id);
    faults.push({
      criterion: 'proof',
      message: `The review ${q(c.steps[bestR].id)} does not depend on ${listNames(lacking)}, so it cannot check ${q(st)}: add ${lacking.length > 1 ? 'them' : 'it'} to its dependsOn`,
      weight: 1 - v,
    });
  }
  const reviewFactor = counted ? factorSum / counted : 1;
  return stepMean * reviewFactor;
}

function scoreEconomy(c: Ctx, faults: Fault[]): number {
  const r = c.rubric;
  const lim = r.limits ?? {};
  let v = 1;
  const add = (factor: number, message: string) => {
    const f = clamp01(factor);
    v *= f;
    faults.push({ criterion: 'economy', message, weight: 1 - f });
  };
  const n = c.steps.length;
  if (lim.maxSteps && n > lim.maxSteps) add(lim.maxSteps / n, `The plan has ${n} steps; this job needs at most ${lim.maxSteps}: merge or drop steps that do not change or prove anything new`);
  const owners = new Set(c.steps.map((s) => words(s.owner).join('')).filter(Boolean));
  if (lim.maxOwners && owners.size > lim.maxOwners) add(lim.maxOwners / owners.size, `The plan uses ${owners.size} owners; this job needs at most ${lim.maxOwners}: give related steps to the same agent`);
  if (lim.maxParallel && c.g.maxWidth > lim.maxParallel) add(lim.maxParallel / c.g.maxWidth, `Up to ${c.g.maxWidth} steps run at once; this job allows ${lim.maxParallel}: chain or merge some of them`);

  // Longest chain against the shortest the rubric's orderings allow (+2 steps of slack for a
  // planning step or a loop's second step).
  const names = r.stages.map((s) => s.name);
  const sEdges: number[][] = names.map(() => []);
  for (const [a, b] of r.before ?? []) sEdges[names.indexOf(a)].push(names.indexOf(b));
  let minChain = Math.max(1, longestPathNodes(names.length, sEdges));
  if ((r.reviewOf ?? []).length) minChain = Math.max(minChain, 2);
  const allowed = minChain + 2;
  if (c.g.longestChain > allowed) {
    add(allowed / c.g.longestChain, `The longest chain of dependencies is ${c.g.longestChain} steps where the job's order needs about ${minChain}: steps that do not use each other's output should not wait for each other`);
  }

  // Stages the rubric says can run side by side.
  const groups = r.parallel ?? [];
  if (groups.length) {
    let fracSum = 0;
    let worst: string | null = null;
    for (const group of groups) {
      let ok = 0;
      let total = 0;
      for (let x = 0; x < group.length; x++) {
        for (let y = x + 1; y < group.length; y++) {
          const as = c.stageSteps.get(group[x]) ?? [];
          const bs = c.stageSteps.get(group[y]) ?? [];
          if (!as.length || !bs.length) continue;
          total++;
          // Met when some step of one can run beside some step of the other.
          const met = as.some((i) => bs.some((j) => c.g.parallel(i, j)));
          if (met) ok++;
          else if (!worst) {
            const pair = as.flatMap((i) => bs.filter((j) => j !== i).map((j) => [i, j] as [number, number]))[0] ?? [as[0], bs[0]];
            const [i, j] = c.g.reaches(pair[0], pair[1]) ? pair : [pair[1], pair[0]];
            worst = `Step ${q(c.steps[j].id)} waits for ${q(c.steps[i].id)}, but ${q(group[x])} and ${q(group[y])} can run at the same time: let both depend on the step before them instead`;
          }
        }
      }
      fracSum += total ? ok / total : 1;
    }
    const frac = fracSum / groups.length;
    if (frac < 1) add(0.5 + 0.5 * frac, worst ?? 'Stages that could run at the same time are chained');
  }

  // Budgets on work steps.
  const work = c.steps.filter((s) => kindOf(s) === 'work');
  const unbudgeted = work.filter((s) => !s.budget || !((s.budget.toolCalls ?? 0) > 0 || (s.budget.minutes ?? 0) > 0));
  if (work.length && unbudgeted.length) {
    const factor = 0.6 + 0.4 * (1 - unbudgeted.length / work.length);
    add(factor, `${unbudgeted.length === 1 ? 'Step' : 'Steps'} ${listNames(unbudgeted.map((s) => s.id))} ${unbudgeted.length === 1 ? 'has' : 'have'} no budget: give each work step toolCalls or minutes`);
  }

  // Steps that change nothing, prove nothing and feed nothing.
  const dead = c.steps.filter((s, i) => !s.changes.length && !s.proof.trim() && c.g.dependents[i] === 0);
  if (dead.length) add(Math.max(0.4, 1 - 0.2 * dead.length), `${dead.length === 1 ? 'Step' : 'Steps'} ${listNames(dead.map((s) => s.id))} change nothing, prove nothing and nothing depends on them: remove them`);
  return v;
}

const GENERIC_TITLE = /^(step|task|part|phase|stage|item|todo|misc|stuff|work|do it|thing)s?\s*\d*$/i;
const END_SIGNAL = /\d|:|\b(that|which|with|where|so|until|when|pass(es)?|every|all|each|and|lists?|shows?|has|have|ready|published|deployed|merged|verified|live|done)\b/i;

function scoreClarity(c: Ctx, faults: Fault[]): number {
  const add = (weight: number, message: string) => faults.push({ criterion: 'clarity', message, weight });
  const goal = c.plan.goal.trim();
  const gw = words(goal).length;
  let goalV = 1;
  if (!goal) {
    goalV = 0;
    add(0.3, 'The plan has no goal: add one sentence saying what done looks like');
  } else if (gw < 5) {
    goalV = 0.5;
    add(0.15, `The goal ${q(goal)} is too short to say when the job is done: say what exists or passes at the end`);
  } else if (!END_SIGNAL.test(goal)) {
    goalV = 0.75;
    add(0.075, `The goal ${q(goal)} does not say when the job is done: name what exists or passes at the end`);
  }

  const n = c.steps.length;
  let titleSum = 0;
  let titleFaults = 0;
  for (const s of c.steps) {
    const t = s.title.trim();
    let v = 1;
    if (!t) v = 0;
    else if (GENERIC_TITLE.test(t)) v = 0.3;
    else if (words(t).length === 1) v = 0.8;
    titleSum += v;
    if (v < 1 && titleFaults < 4) {
      titleFaults++;
      add((0.3 * (1 - v)) / n, !t ? `Step ${q(s.id)} has no title: say what the step does, like "Build the home page"` : `Step ${q(s.id)} title ${q(t)} does not say what is done: write it as an action, like "Build the home page"`);
    }
  }
  const titleV = titleSum / n;

  let idV = 1;
  for (const d of [...new Set(c.duplicateIds)].slice(0, 3)) {
    idV -= 0.25;
    add(0.05, `More than one step has the id ${q(d)}: ids must be unique`);
  }
  for (const s of c.steps) {
    if (!/[a-z]{3}/i.test(s.id) || s.id.length > 40) {
      idV -= 0.1;
      add(0.02, `The id ${q(s.id)} is hard to read: use a short name like "build-home"`);
    }
  }
  idV = clamp01(idV);

  let ownerV = 1;
  const noOwner = c.steps.filter((s) => !s.owner.trim());
  if (noOwner.length) {
    ownerV -= 0.6 * (noOwner.length / n) + 0.2;
    add(0.2 * (0.6 * (noOwner.length / n) + 0.2), `${noOwner.length === 1 ? 'Step' : 'Steps'} ${listNames(noOwner.map((s) => s.id))} ${noOwner.length === 1 ? 'has' : 'have'} no owner: name the agent or person who does it`);
  }
  const spellings = new Map<string, Set<string>>();
  for (const s of c.steps) {
    const key = words(s.owner).join('');
    if (!key) continue;
    if (!spellings.has(key)) spellings.set(key, new Set());
    spellings.get(key)!.add(s.owner.trim());
  }
  for (const set of spellings.values()) {
    if (set.size > 1) {
      ownerV -= 0.2;
      const [a, b] = [...set];
      add(0.04, `The owner ${q(a)} is also written ${q(b)}: use one spelling for each owner`);
    }
  }
  ownerV = clamp01(ownerV);
  return 0.3 * goalV + 0.3 * titleV + 0.2 * idV + 0.2 * ownerV;
}

export function totalFrom(v: Record<WorkflowCriterionId, number>): { total: number; works: number; looks: number; engineering: number } {
  const works = v.stages * v.order * v.loops;
  const looks = v.clarity;
  const engineering = Math.min(v.safety, v.proof, v.economy);
  const total = 100 * (WORKFLOW_WEIGHTS.works * works + WORKFLOW_WEIGHTS.looks * looks + WORKFLOW_WEIGHTS.engineering * engineering * works);
  return { total, works, looks, engineering };
}

export function scorePlan(plan: Plan, rubric: WorkflowRubric, missing: Map<string, Set<string>>): WorkflowGradeResult {
  const c = build(plan, rubric, missing);
  const faults: Fault[] = [];
  const cycles = unmarkedCycles(c);
  const values: Record<WorkflowCriterionId, number> = {
    stages: clamp01(scoreStages(c, faults)),
    order: clamp01(scoreOrder(c, faults, cycles)),
    loops: clamp01(scoreLoops(c, faults, cycles)),
    safety: clamp01(scoreSafety(c, faults)),
    proof: clamp01(scoreProof(c, faults)),
    economy: clamp01(scoreEconomy(c, faults)),
    clarity: clamp01(scoreClarity(c, faults)),
  };
  const t = totalFrom(values);
  const total = round1(t.total);

  // Share the lost points by criterion (what fixing it alone would gain), then by fault weight.
  const ids = Object.keys(NAMES) as WorkflowCriterionId[];
  const gains = new Map<WorkflowCriterionId, number>();
  for (const id of ids) {
    if (values[id] >= 1) continue;
    gains.set(id, Math.max(0, totalFrom({ ...values, [id]: 1 }).total - t.total));
  }
  const gainSum = [...gains.values()].reduce((a, b) => a + b, 0);
  const lost = 100 - t.total;
  const feedback: (WorkflowFeedback & { order: number })[] = [];
  let order = 0;
  for (const id of ids) {
    const share = gainSum > 0 ? ((gains.get(id) ?? 0) / gainSum) * lost : 0;
    const mine = faults.filter((f) => f.criterion === id && f.weight > 0);
    const wsum = mine.reduce((a, f) => a + f.weight, 0);
    for (const f of mine) feedback.push({ message: f.message, points: wsum > 0 ? (share * f.weight) / wsum : 0, order: order++ });
  }
  feedback.sort((a, b) => b.points - a.points || a.order - b.order);

  const criteria: WorkflowCriterion[] = ids.map((id) => ({
    id,
    name: NAMES[id][0],
    group: NAMES[id][1],
    value: Math.round(values[id] * 1000) / 1000,
    notes: faults
      .filter((f) => f.criterion === id)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map((f) => f.message),
  }));
  return {
    version: WORKFLOW_GRADER_VERSION,
    total,
    pillars: { works: round3(t.works), looks: round3(t.looks), engineering: round3(t.engineering) },
    criteria,
    feedback: feedback
      .filter((f) => f.points >= 0.05)
      .slice(0, 8)
      .map((f) => ({ message: f.message, points: round1(f.points) })),
  };
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export { globsOverlap };
