// Proof for the second group of bonus-challenge rubrics (lessons 4, 5 and 8).
// Run from the grader folder with
//   npx tsx ../lessons/rubrics/check-g2.mts
import { existsSync, readFileSync } from 'node:fs';
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
  { slug: 'mcp-local-server-setup', kind: 'readme', ref: 'reference.md', remove: 'Remove', change: ['claude mcp list', 'claude mcp ls', 'the list command'] },
  { slug: 'mcp-tool-allowlist', kind: 'readme', ref: 'reference.md', remove: 'Red flags', change: ['mcp__tickets__tickets_delete', 'mcp__tickets__delete', 'the rule mcp__tickets__tickets_delete'] },
  { slug: 'weather-tool-repair', kind: 'mcp-tools', ref: 'reference.json', remove: 'weather_forecast', change: ['1 to 7', 'up to a week of', 'the allowed number of days'] },
  { slug: 'calendar-booking-tools', kind: 'mcp-tools', ref: 'reference.json', remove: 'calendar_cancel_booking', change: ['10 minutes', 'a short time', 'how long a hold lasts'] },
  { slug: 'claim-check-sorting', kind: 'readme', ref: 'reference.md', remove: 'Sources', change: ['returns None', 'returns nothing useful', 'what list.sort() returns'] },
  { slug: 'source-conflict-report', kind: 'readme', ref: 'reference.md', remove: 'Decision', change: ['60 requests per minute', '90 requests per minute', 'the limit to use, 60 requests per minute'] },
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
  const rubricPath = join(here, `${c.slug}.json`);
  const refPath = join(here, `${c.slug}.${c.ref}`);
  if (!existsSync(rubricPath) || !existsSync(refPath)) {
    line(false, c.slug, 'files', 'rubric or reference missing');
    continue;
  }
  const rubric = JSON.parse(readFileSync(rubricPath, 'utf8'));
  const ref = readFileSync(refPath, 'utf8');
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
  if (!ref.includes(from)) throw new Error(`${c.slug}: reference has no "${from}"`);
  const changed = grade(ref.split(from).join(to));
  const t2 = top(changed);
  line(changed.total < 100 && t2.toLowerCase().includes(label.toLowerCase()), c.slug, `fact changed (${from} -> ${to})`, `${changed.total} | ${t2}`);

  // Empty document.
  const empty = grade('');
  line(empty.total === 0 && !!empty.error, c.slug, 'empty', `${empty.total} | ${empty.error ?? '(no reason)'}`);
}

console.log(`\n${passed}/${total} checks passed`);
process.exitCode = passed === total ? 0 : 1;
