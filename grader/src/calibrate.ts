/**
 * Grades every calibration set and writes a page a person can check by eye:
 * each attempt's screenshot next to the goal, with its score.
 *
 *   npm run calibrate
 *
 * Sets live in calibration/sets/<name>/: goal.html plus attempts. The bands
 * and orderings a person expects are in calibration/expected.json.
 * The report is written to calibration/out/report.html.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRADER_VERSION } from './config';
import { Grader } from './index';
import type { GradeResult } from './types';

export interface Expected {
  [set: string]: {
    /** attempt name -> [lowest acceptable total, highest acceptable total] */
    bands: Record<string, [number, number]>;
    /** Each list must score in strictly falling order. */
    order: string[][];
    /**
     * Attempts the grader still puts outside a person's band. Their bands
     * (and any ordering that names them) are reported, not enforced, until
     * a general rule brings them in. A band is never edited to fit.
     */
    pending?: string[];
  };
}

export interface SetReport {
  name: string;
  goalPng: Buffer;
  attempts: { name: string; result: GradeResult; png: Buffer | null }[];
}

const here = dirname(fileURLToPath(import.meta.url));
export const CALIBRATION_DIR = join(here, '..', 'calibration');

export function loadExpected(): Expected {
  return JSON.parse(readFileSync(join(CALIBRATION_DIR, 'expected.json'), 'utf8')) as Expected;
}

export async function gradeSets(grader: Grader): Promise<SetReport[]> {
  const setsDir = join(CALIBRATION_DIR, 'sets');
  const reports: SetReport[] = [];
  for (const name of readdirSync(setsDir).sort()) {
    const dir = join(setsDir, name);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.html') && f !== 'goal.html')
      .sort();
    const goal = await grader.render(readFileSync(join(dir, 'goal.html'), 'utf8'));
    const attempts: SetReport['attempts'] = [];
    for (const file of files) {
      const { result, candidate } = await grader.grade(goal, readFileSync(join(dir, file), 'utf8'));
      attempts.push({ name: file.replace(/\.html$/, ''), result, png: candidate ? candidate.png : null });
    }
    attempts.sort((a, b) => b.result.total - a.result.total || a.name.localeCompare(b.name));
    reports.push({ name, goalPng: goal.png, attempts });
  }
  return reports;
}

/**
 * Every way the scores disagree with what a person expects. Empty means they
 * agree. With `which: 'pending'`, only the disagreements that involve an
 * attempt listed as pending (reported, not enforced); by default, only the
 * enforced ones.
 */
export function checkExpected(reports: SetReport[], expected: Expected, which: 'enforced' | 'pending' = 'enforced'): string[] {
  const problems: string[] = [];
  for (const report of reports) {
    const rules = expected[report.name];
    if (!rules) continue;
    const pending = new Set(rules.pending ?? []);
    const keep = (...names: string[]) => (which === 'pending') === names.some((n) => pending.has(n));
    const totals = new Map(report.attempts.map((a) => [a.name, a.result.total]));
    for (const [attempt, [low, high]] of Object.entries(rules.bands)) {
      const total = totals.get(attempt);
      if (total === undefined) {
        if (which === 'enforced') problems.push(`${report.name}/${attempt}: no such attempt`);
      } else if ((total < low || total > high) && keep(attempt)) {
        problems.push(`${report.name}/${attempt}: scored ${total}, expected ${low} to ${high}`);
      }
    }
    for (const chain of rules.order) {
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = totals.get(chain[i]);
        const b = totals.get(chain[i + 1]);
        if (a === undefined || b === undefined) {
          if (which === 'enforced') problems.push(`${report.name}: order names a missing attempt (${chain[i]}, ${chain[i + 1]})`);
        } else if (!(a > b) && keep(chain[i], chain[i + 1])) {
          problems.push(`${report.name}: ${chain[i]} (${a}) should score above ${chain[i + 1]} (${b})`);
        }
      }
    }
  }
  return problems;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** What cost the attempt points, as a list for the report. */
function feedbackList(result: GradeResult): string {
  const items = result.feedback ?? [];
  if (result.error) return `<ul class="fb"><li>${escapeHtml(result.error)}</li></ul>`;
  if (items.length === 0) return '';
  return `<ul class="fb">${items.map((f) => `<li><b>-${f.points.toFixed(1)}</b> ${escapeHtml(f.message)}</li>`).join('')}</ul>`;
}

function cell(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(1);
}

function toHtml(reports: SetReport[], expected: Expected, problems: string[]): string {
  const img = (png: Buffer | null) =>
    png ? `<img src="data:image/png;base64,${png.toString('base64')}">` : '<div class="none">not rendered</div>';
  const sections = reports
    .map((report) => {
      const bands = expected[report.name]?.bands ?? {};
      const cards = report.attempts
        .map((a) => {
          const band = bands[a.name];
          const inBand = !band || (a.result.total >= band[0] && a.result.total <= band[1]);
          const b = a.result.breakdown;
          return `<figure class="${inBand ? '' : 'bad'}">${img(a.png)}<figcaption><b>${a.name}</b>
<span class="total">${a.result.total.toFixed(1)}</span>
<span class="band">${band ? `expected ${band[0]} to ${band[1]}` : 'no expectation set'}</span>
<span class="parts">content ${cell(b.content)} · layout ${cell(b.layout)} · style ${cell(b.style)} · visual ${cell(b.visual)}</span>
${feedbackList(a.result)}</figcaption></figure>`;
        })
        .join('\n');
      return `<section><h2>${report.name}</h2><div class="grid"><figure class="goal">${img(report.goalPng)}<figcaption><b>goal</b><span class="total">100.0</span><span class="band">the target</span></figcaption></figure>
${cards}</div></section>`;
    })
    .join('\n');
  const summary =
    problems.length === 0
      ? '<p class="ok">Every score is inside its expected band and every ordering holds.</p>'
      : `<p class="warn">${problems.length} disagreement(s) with the expected ranking:</p><ul>${problems
          .map((p) => `<li>${p}</li>`)
          .join('')}</ul>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Grader calibration</title><style>
body{font-family:Arial,Helvetica,sans-serif;margin:24px;background:#f3f4f6;color:#111827}
h1{margin:0 0 4px}h2{margin:32px 0 12px;text-transform:capitalize}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
figure{margin:0;background:#fff;border:2px solid #d1d5db;border-radius:8px;overflow:hidden}
figure.goal{border-color:#2563eb}figure.bad{border-color:#dc2626}
figure img{display:block;width:100%;border-bottom:1px solid #e5e7eb}
.none{padding:40px;text-align:center;color:#6b7280}
figcaption{padding:10px 12px;display:grid;grid-template-columns:1fr auto;gap:2px 8px;font-size:14px}
.total{font-size:22px;font-weight:700;text-align:right}
.band,.parts{grid-column:1 / -1;color:#4b5563;font-size:12px}
.ok{color:#047857}.warn{color:#b91c1c}
.fb{grid-column:1 / -1;margin:6px 0 0;padding-left:18px;font-size:12px;color:#374151}.fb b{color:#b91c1c}
</style></head><body><h1>Grader calibration</h1>
<p>Grading rules version ${GRADER_VERSION}. Attempts are sorted best first. Check by eye: does each score match how close the attempt looks to the goal? A red border means the score is outside the band a person set for it.</p>
${summary}
${sections}
</body></html>`;
}

function printTable(reports: SetReport[]): void {
  for (const report of reports) {
    console.log(`\n${report.name}`);
    console.log('  attempt                     total  content layout style  visual');
    for (const a of report.attempts) {
      const b = a.result.breakdown;
      console.log(
        `  ${a.name.padEnd(27)} ${a.result.total.toFixed(1).padStart(5)}  ${cell(b.content).padStart(7)} ${cell(
          b.layout,
        ).padStart(6)} ${cell(b.style).padStart(5)}  ${cell(b.visual).padStart(6)}`,
      );
      for (const f of a.result.feedback ?? []) console.log(`      -${f.points.toFixed(1).padStart(4)}  ${f.message}`);
    }
  }
}

async function main(): Promise<void> {
  const grader = new Grader();
  try {
    const expected = loadExpected();
    const reports = await gradeSets(grader);
    const problems = checkExpected(reports, expected);
    printTable(reports);
    const outDir = join(CALIBRATION_DIR, 'out');
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, 'report.html');
    writeFileSync(out, toHtml(reports, expected, problems));
    console.log(`\nreport: ${out}`);
    if (problems.length > 0) {
      console.log(`\n${problems.length} disagreement(s) with the expected ranking:`);
      for (const p of problems) console.log(`  - ${p}`);
      process.exitCode = 1;
    } else {
      console.log('\nEvery score is inside its expected band and every ordering holds.');
    }
  } finally {
    await grader.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
