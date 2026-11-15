import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { globsOverlap, gradeWorkflow, workflowRubricProblem, type WorkflowGradeResult } from '../../src/workflow/index';

const root = path.resolve(__dirname, '../../calibration/workflow');
const load = (challenge: string, file: string) => JSON.parse(fs.readFileSync(path.join(root, challenge, file), 'utf8'));
const SITE = 'three-page-site-plan';
const LOOP = 'fix-loop-plan';
const RESEARCH = 'verified-research';
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const value = (r: WorkflowGradeResult, id: string) => r.criteria.find((c) => c.id === id)!.value;
const step = (plan: any, id: string) => plan.steps.find((s: any) => s.id === id);

describe('workflow grader: reference and determinism', () => {
  for (const ch of [SITE, LOOP, RESEARCH]) {
    it(`${ch} reference scores exactly 100`, () => {
      const r = gradeWorkflow({ rubric: load(ch, 'rubric.json'), candidate: fs.readFileSync(path.join(root, ch, 'reference.json'), 'utf8') });
      expect(r.error).toBeUndefined();
      expect(r.total).toBe(100);
      expect(r.feedback).toEqual([]);
    });
  }

  it('same input, same output', () => {
    const rubric = load(SITE, 'rubric.json');
    const text = fs.readFileSync(path.join(root, SITE, 'attempts', 'a3-shared-stylesheet.json'), 'utf8');
    expect(gradeWorkflow({ rubric, candidate: text })).toEqual(gradeWorkflow({ rubric, candidate: text }));
  });

  it('accepts a ```json fence and an already-parsed object alike', () => {
    const rubric = load(SITE, 'rubric.json');
    const ref = load(SITE, 'reference.json');
    expect(gradeWorkflow({ rubric, candidate: '```json\n' + JSON.stringify(ref) + '\n```' }).total).toBe(100);
    expect(gradeWorkflow({ rubric, candidate: ref }).total).toBe(100);
  });
});

describe('workflow grader: each criterion moves with exactly its fault', () => {
  const others = (r: WorkflowGradeResult, id: string) => r.criteria.filter((c) => c.id !== id).every((c) => c.value === 1);
  const cases: [string, string, string, (p: any) => void][] = [
    ['stages', SITE, 'a step is removed', (p) => {
      p.steps = p.steps.filter((s: any) => s.id !== 'styles');
      step(p, 'review').dependsOn = ['home', 'projects', 'contact'];
    }],
    ['order', SITE, 'a page no longer waits for the plan', (p) => { step(p, 'contact').dependsOn = []; }],
    ['loops', LOOP, 'the loop cap is above the limit', (p) => { p.loops[0].maxRounds = 9; }],
    ['safety', SITE, 'two parallel steps change one file', (p) => { step(p, 'home').changes.push('site/styles.css'); }],
    ['proof', SITE, 'a proof is removed', (p) => { step(p, 'home').proof = ''; }],
    ['economy', SITE, 'a budget is removed', (p) => { delete step(p, 'home').budget; }],
    ['clarity', SITE, 'the goal is removed', (p) => { p.goal = ''; }],
  ];
  for (const [id, ch, what, mutate] of cases) {
    it(`${id}: ${what}`, () => {
      const plan = load(ch, 'reference.json');
      mutate(plan);
      const r = gradeWorkflow({ rubric: load(ch, 'rubric.json'), candidate: plan });
      expect(value(r, id)).toBeLessThan(1);
      expect(others(r, id)).toBe(true);
      expect(r.total).toBeLessThan(100);
      expect(r.feedback.length).toBeGreaterThan(0);
    });
  }

  it('names the step and the file for a collision', () => {
    const plan = load(SITE, 'reference.json');
    step(plan, 'home').changes.push('site/**');
    const r = gradeWorkflow({ rubric: load(SITE, 'rubric.json'), candidate: plan });
    expect(r.feedback[0].message).toMatch(/'home'.*same time.*site/);
  });

  it('flags a loop with no exit test and no cap', () => {
    const plan = load(LOOP, 'reference.json');
    plan.loops[0].until = '';
    delete plan.loops[0].maxRounds;
    const r = gradeWorkflow({ rubric: load(LOOP, 'rubric.json'), candidate: plan });
    const text = r.feedback.map((f) => f.message).join('\n');
    expect(text).toMatch(/'fix-loop' has no exit test/);
    expect(text).toMatch(/'fix-loop' has no cap on rounds/);
  });

  it('a circular exit test is caught', () => {
    const plan = load(LOOP, 'reference.json');
    plan.loops[0].until = 'until the fix step is done';
    const r = gradeWorkflow({ rubric: load(LOOP, 'rubric.json'), candidate: plan });
    expect(r.criteria.find((c) => c.id === 'loops')!.notes.join(' ')).toMatch(/restates the loop/);
  });
});

describe('workflow grader: fairness properties', () => {
  it('adding a missing proof never lowers the score', () => {
    for (const [ch, file] of [[SITE, 'a7-bloated.json'], [SITE, 'a8-vague.json'], [LOOP, 'b7-bloated.json']]) {
      const rubric = load(ch, 'rubric.json');
      let plan = load(ch, path.join('attempts', file));
      let last = gradeWorkflow({ rubric, candidate: plan }).total;
      for (const s of plan.steps) {
        if (s.proof && !/make sure|looks good|^done$|finished/i.test(s.proof)) continue;
        plan = clone(plan);
        step(plan, s.id).proof = `notes/${s.id}.md exists and lists what was done`;
        const next = gradeWorkflow({ rubric, candidate: plan }).total;
        expect(next).toBeGreaterThanOrEqual(last);
        last = next;
      }
    }
  });

  it('a renamed and reordered but equivalent plan scores the same', () => {
    for (const ch of [SITE, LOOP, RESEARCH]) {
      const rubric = load(ch, 'rubric.json');
      const ref = load(ch, 'reference.json');
      const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
      const map = new Map<string, string>(ref.steps.map((s: any, i: number) => [s.id, `${names[i]}-task`]));
      const renamed = clone(ref);
      for (const s of renamed.steps) {
        s.id = map.get(s.id);
        s.dependsOn = s.dependsOn.map((d: string) => map.get(d));
      }
      for (const l of renamed.loops ?? []) l.steps = l.steps.map((d: string) => map.get(d));
      renamed.steps.reverse();
      expect(gradeWorkflow({ rubric, candidate: renamed }).total).toBe(gradeWorkflow({ rubric, candidate: ref }).total);
    }
  });
});

describe('workflow grader: glob overlap', () => {
  const cases: [string, string, boolean][] = [
    ['src/**', 'src/site/a.ts', true],
    ['src/*.ts', 'src/site/a.ts', false],
    ['src/*.ts', 'src/a.ts', true],
    ['site', 'site/index.html', true],
    ['site/', 'site/a/b.css', true],
    ['site/index.html', 'site/menu.html', false],
    ['**/*.css', 'site/styles.css', true],
    ['*.md', 'docs/a.md', false],
    ['src/{a,b}.ts', 'src/b.ts', true],
    ['site/*.html', 'site/styles.css', false],
    ['./site\\index.html', 'site/index.html', true],
    ['tests/held_out/**', 'tests/held_out', true],
    ['tests/visible/**', 'tests/held_out/**', false],
    ['src/**/test_*.py', 'src/**/*_a.py', true],
    ['a?c.txt', 'abc.txt', true],
    ['Site/Index.HTML', 'site/index.html', true],
  ];
  for (const [a, b, want] of cases) {
    it(`${a} vs ${b}: ${want}`, () => {
      expect(globsOverlap(a, b)).toBe(want);
      expect(globsOverlap(b, a)).toBe(want);
    });
  }
});

describe('workflow grader: bad input', () => {
  const rubric = load(SITE, 'rubric.json');
  const quick = (candidate: unknown) => {
    const t = performance.now();
    const r = gradeWorkflow({ rubric, candidate });
    expect(performance.now() - t).toBeLessThan(1000);
    return r;
  };

  it('not JSON scores 0 with a reason', () => {
    const r = quick('Here is your plan: {steps: oops');
    expect(r.total).toBe(0);
    expect(r.error).toMatch(/not valid JSON/);
  });

  it('wrong shape names the first thing wrong', () => {
    expect(quick('[]').error).toMatch(/must be a JSON object/);
    expect(quick('{"goal":"x","steps":"a,b"}').error).toMatch(/"steps" must be a list/);
    expect(quick({ goal: 'x', steps: [{ id: 'a', files: ['x'] }] }).error).toMatch(/"files".*"changes"/);
    expect(quick({ goal: 'x', steps: [{ id: 'a', budget: '10 tool calls' }] }).error).toMatch(/budget/);
    expect(quick({ goal: 'x', steps: [{ title: 'no id' }] }).error).toMatch(/Step 1 has no "id"/);
    expect(quick({ goal: 'x', steps: [{ id: 'a' }], loops: [{ id: 'l', exitTest: 'x' }] }).error).toMatch(/"exitTest".*"until"/);
  });

  it('10,000 steps neither throws nor takes a second', () => {
    const steps = Array.from({ length: 10_000 }, (_, i) => ({ id: `s${i}`, title: 'Do', owner: 'a', dependsOn: i ? [`s${i - 1}`] : [], changes: ['x'], proof: 'x' }));
    const r = quick(JSON.stringify({ goal: 'g', steps }));
    expect(r.total).toBe(0);
    expect(r.error).toMatch(/at most 500/);
  });

  it('500 parallel steps on one file stay fast', () => {
    const steps = Array.from({ length: 500 }, (_, i) => ({ id: `step-${i}`, title: 'Build part', owner: `w${i}`, dependsOn: [], changes: ['src/**', `src/p${i}.ts`], proof: 'npm test passes' }));
    const r = quick({ goal: 'Build every part so npm test passes', steps });
    expect(r.criteria.find((c) => c.id === 'safety')!.value).toBeLessThan(0.01);
    expect(r.feedback.length).toBeLessThanOrEqual(8);
  });

  it('a self-dependency is a cycle, not a crash', () => {
    const plan = load(SITE, 'reference.json');
    step(plan, 'home').dependsOn.push('home');
    const r = quick(plan);
    expect(r.error).toBeUndefined();
    expect(r.feedback.map((f) => f.message).join('\n')).toMatch(/'home' depends on itself/);
  });

  it('deeply nested JSON and huge strings are handled', () => {
    const deep = '['.repeat(200_000) + ']'.repeat(200_000);
    expect(quick(deep).total).toBe(0);
    const nestedInside = JSON.stringify({ goal: 'g', steps: [{ id: 'a', extra: JSON.parse('['.repeat(1000) + ']'.repeat(1000)) }] });
    expect(quick(nestedInside).error).toBeUndefined();
    expect(quick('x'.repeat(3_000_000)).error).toMatch(/longer than/);
    const plan = load(SITE, 'reference.json');
    step(plan, 'home').title = 'y'.repeat(1_000_000);
    step(plan, 'home').changes = ['a/'.repeat(100_000)];
    expect(quick(plan).error).toBeUndefined();
  });

  it('a malformed rubric is a plain-words error for the author', () => {
    expect(workflowRubricProblem({ stages: [] })).toMatch(/^Rubric: "stages"/);
    const bad = clone(rubric);
    bad.before.push(['plan', 'nope']);
    expect(workflowRubricProblem(bad)).toMatch(/"nope", which is not a stage/);
    const cyc = clone(rubric);
    cyc.before.push(['fix', 'plan']);
    expect(workflowRubricProblem(cyc)).toMatch(/cycle/);
    const r = gradeWorkflow({ rubric: bad, candidate: load(SITE, 'reference.json') });
    expect(r.total).toBe(0);
    expect(r.error).toMatch(/^Rubric:/);
  });
});

describe('workflow grader: feedback', () => {
  it('at most eight lines, most costly first, adding up to no more than what was lost', () => {
    const rubric = load(SITE, 'rubric.json');
    const r = gradeWorkflow({ rubric, candidate: fs.readFileSync(path.join(root, SITE, 'attempts', 'a7-bloated.json'), 'utf8') });
    expect(r.feedback.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < r.feedback.length; i++) expect(r.feedback[i - 1].points).toBeGreaterThanOrEqual(r.feedback[i].points);
    const sum = r.feedback.reduce((a, f) => a + f.points, 0);
    expect(sum).toBeLessThanOrEqual(100 - r.total + 0.5);
  });
});
