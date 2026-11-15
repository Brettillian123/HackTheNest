// Proof for the lesson 1-3 extra bonus-challenge rubrics: run from the grader folder with
//   npx tsx ../lessons/rubrics/check-g1.mts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeDoc } from '../../grader/src/docs/index.ts';

const here = dirname(fileURLToPath(import.meta.url));

type Case = {
  slug: string;
  kind: 'instructions' | 'readme' | 'skill' | 'mcp-tools';
  ref: string;
  remove: string; // section heading (Markdown) or tool name (mcp-tools)
  change: [string, string, string]; // from, to, fact label expected in the top feedback line
};

const cases: Case[] = [
  { slug: 'claude-md-for-a-monorepo', kind: 'instructions', ref: 'reference.md', remove: 'Rules', change: ['pnpm --filter api test', 'pnpm test', 'the API test command'] },
  { slug: 'agents-md-with-checkable-rules', kind: 'instructions', ref: 'reference.md', remove: 'Ask first', change: ['golangci-lint run', 'go vet ./...', 'the lint command'] },
  { slug: 'readme-for-a-web-service', kind: 'readme', ref: 'reference.md', remove: 'Configuration', change: ['CACHE_TTL_SECONDS', 'CACHE_TTL', 'the CACHE_TTL_SECONDS setting'] },
  { slug: 'spec-for-a-feature', kind: 'readme', ref: 'reference.md', remove: 'Open questions', change: ['date,amount,category,note', 'date,category,amount,note', 'the column order'] },
  { slug: 'pr-description-skill', kind: 'skill', ref: 'reference.md', remove: 'Rules', change: ['git diff --stat main...HEAD', 'git diff HEAD', 'the diff command'] },
  { slug: 'deploy-staging-skill', kind: 'skill', ref: 'reference.md', remove: 'If something fails', change: ['npm run smoke:staging', 'npm test', 'the smoke-test command'] },
];
function removeSection(md: string, heading: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) throw new Error(`No "## ${heading}" heading`);
  let end = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
  if (end < 0) end = lines.length;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}

function removeTool(json: string, name: string): string {
  const list = JSON.parse(json) as { name: string }[];
  return JSON.stringify(list.filter((t) => t.name !== name), null, 2);
}

let passed = 0;
let total = 0;
function line(ok: boolean, slug: string, check: string, detail: string) {
  total++;
  if (ok) passed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${slug}  ${check}  ${detail}`);
}

for (const c of cases) {
  const rubric = JSON.parse(readFileSync(join(here, `${c.slug}.json`), 'utf8'));
  const ref = readFileSync(join(here, `${c.slug}.${c.ref}`), 'utf8');
  const grade = (candidate: string) => gradeDoc({ kind: c.kind, rubric, candidate });
  const top = (r: ReturnType<typeof grade>) => r.feedback[0]?.message ?? '(no feedback)';

  const full = grade(ref);
  line(full.total === 100, c.slug, 'reference', `${full.total}${full.total === 100 ? '' : ' | ' + full.feedback.map((f) => f.message).join(' | ')}`);

  // Removed section (or tool): the top line must name it or a fact that lived in it.
  const removed = grade(c.kind === 'mcp-tools' ? removeTool(ref, c.remove) : removeSection(ref, c.remove));
  const names = [c.remove, ...rubric.keyFacts.filter((f: { section?: string }) => f.section === c.remove).map((f: { label: string }) => f.label)].map((s: string) => s.toLowerCase());
  const t1 = top(removed);
  line(removed.total < 100 && names.some((n: string) => t1.toLowerCase().includes(n)), c.slug, `without ${c.remove}`, `${removed.total} | ${t1}`);

  // Changed key fact.
  const [from, to, label] = c.change;
  const changed = grade(ref.split(from).join(to));
  const t2 = top(changed);
  line(changed.total < 100 && t2.toLowerCase().includes(label.toLowerCase()), c.slug, `fact changed (${from} -> ${to})`, `${changed.total} | ${t2}`);

  // Empty document.
  const empty = grade('');
  line(empty.total === 0 && !!empty.error, c.slug, 'empty', `${empty.total} | ${empty.error ?? '(no reason)'}`);
}

console.log(`\n${passed}/${total} checks passed`);
process.exitCode = passed === total ? 0 : 1;
