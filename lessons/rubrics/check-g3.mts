// Proof for the lesson 6 and 7 workflow bonus challenges (group 3): run from the grader folder with
//   npx tsx ../lessons/rubrics/check-g3.mts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeWorkflow } from '../../grader/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));

type Step = { id: string; dependsOn: string[]; changes: string[]; proof: string };
type Plan = { steps: Step[]; loops: { maxRounds?: number }[] };
type Case = {
  slug: string;
  removeStep: string; // step id to drop
  stage: string; // stage name the top feedback line must name
  collide: [string, string]; // second step is given the first step's changes
  breakWith: { proofOf: string } | 'loop-cap';
};

const cases: Case[] = [
  { slug: 'docs-refresh-plan', removeStep: 'index', stage: 'index', collide: ['core-docs', 'cli-docs'], breakWith: { proofOf: 'index' } },
  { slug: 'data-migration-plan', removeStep: 'rehearse', stage: 'rehearse', collide: ['write-up', 'write-down'], breakWith: { proofOf: 'verify' } },
  { slug: 'release-pipeline-plan', removeStep: 'approve', stage: 'approval', collide: ['tests', 'docs'], breakWith: { proofOf: 'publish' } },
  { slug: 'benchmark-tuning-loop', removeStep: 'held-out', stage: 'held-out-check', collide: ['baseline', 'metric-check'], breakWith: 'loop-cap' },
];

let passed = 0;
let total = 0;
function line(ok: boolean, slug: string, check: string, detail: string) {
  total++;
  if (ok) passed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${slug}  ${check}  ${detail}`);
}

for (const c of cases) {
  const rubric = JSON.parse(readFileSync(join(here, `${c.slug}.json`), 'utf8'));
  const refText = readFileSync(join(here, `${c.slug}.reference.json`), 'utf8');
  const fresh = (): Plan => JSON.parse(refText);
  const grade = (plan: Plan | string) => gradeWorkflow({ rubric, candidate: typeof plan === 'string' ? plan : JSON.stringify(plan) });
  const msgs = (r: ReturnType<typeof grade>) => r.feedback.map((f) => f.message);
  const all = (r: ReturnType<typeof grade>) => (r.error ? `error: ${r.error} | ` : '') + msgs(r).join(' | ');

  const full = grade(refText);
  line(full.total === 100, c.slug, 'reference', `${full.total}${full.total === 100 ? '' : ' | ' + all(full)}`);

  // Remove one required stage; steps that waited on it now wait on what it waited on.
  const p1 = fresh();
  const gone = p1.steps.find((s) => s.id === c.removeStep)!;
  p1.steps = p1.steps.filter((s) => s.id !== c.removeStep);
  for (const s of p1.steps) {
    if (s.dependsOn.includes(c.removeStep)) s.dependsOn = [...new Set([...s.dependsOn.filter((d) => d !== c.removeStep), ...gone.dependsOn])];
  }
  const r1 = grade(p1);
  const top1 = msgs(r1)[0] ?? '(no feedback)';
  line(r1.total < 100 && (top1.includes(`"${c.stage}"`) || top1.includes(`'${c.stage}'`)), c.slug, 'stage removed', `${r1.total} | ${top1}`);

  // Two parallel steps change the same file.
  const p2 = fresh();
  const a = p2.steps.find((s) => s.id === c.collide[0])!;
  const b = p2.steps.find((s) => s.id === c.collide[1])!;
  b.changes = [...a.changes];
  const r2 = grade(p2);
  const hit2 = msgs(r2).find((m) => m.includes('can run at the same time'));
  line(r2.total < 100 && !!hit2, c.slug, 'shared file', `${r2.total} | ${hit2 ?? all(r2)}`);

  // Loop cap removed, or a step's proof emptied for a plan with no loop.
  const p3 = fresh();
  let want: string;
  if (c.breakWith === 'loop-cap') {
    delete p3.loops[0].maxRounds;
    want = 'no cap';
  } else {
    p3.steps.find((s) => s.id === (c.breakWith as { proofOf: string }).proofOf)!.proof = '';
    want = 'has no proof';
  }
  const r3 = grade(p3);
  const hit3 = msgs(r3).find((m) => m.includes(want));
  line(r3.total < 100 && !!hit3, c.slug, c.breakWith === 'loop-cap' ? 'cap removed' : 'proof emptied', `${r3.total} | ${hit3 ?? all(r3)}`);

  const r4 = grade('');
  line(r4.total === 0, c.slug, 'empty', `${r4.total}`);
}

console.log(`\n${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
