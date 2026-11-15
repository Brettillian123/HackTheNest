/**
 * Grades the six real model runs against their references and prints each
 * band, total, pillars, the page's four sub-scores and every feedback line.
 *   npx tsx calibration/real-runs/run.ts [--json out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grader } from '../../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, '..', '..', '..', 'challenge-pack');
export const REFERENCES: Record<string, string> = {
  'login-card': join(pack, 'pages-live', 'goals', 'login-card.html'),
  'profile-card': join(pack, 'pages', 'goals', 'profile-card.html'),
  'harbor-landing': join(pack, 'pages', 'goals', 'harbor-landing.html'),
};
export const BANDS = JSON.parse(readFileSync(join(here, 'bands.json'), 'utf8')) as Record<
  string,
  Record<string, { band: [number, number] }>
>;

export interface RunRow {
  run: string;
  band: [number, number];
  total: number;
  pillars: unknown;
  scores: unknown;
  verdict: string;
  feedback: string[];
}

export async function gradeRealRuns(grader: Grader): Promise<RunRow[]> {
  const rows: RunRow[] = [];
  for (const [slug, runs] of Object.entries(BANDS)) {
    const goal = await grader.prepareSite({ 'index.html': readFileSync(REFERENCES[slug], 'utf8') });
    for (const [name, { band }] of Object.entries(runs)) {
      const html = readFileSync(join(here, slug, `${name}.html`), 'utf8');
      const { result } = await grader.gradeSite(goal, { 'index.html': html });
      const t = result.total;
      const verdict = t < band[0] ? `LOW by ${(band[0] - t).toFixed(1)}` : t > band[1] ? `HIGH by ${(t - band[1]).toFixed(1)}` : 'in band';
      rows.push({
        run: `${slug}/${name}`,
        band,
        total: t,
        pillars: result.pillars,
        scores: result.measurements?.pages[0]?.scores ?? null,
        verdict,
        feedback: result.feedback.map((f) => `${f.points} ${f.message}`),
      });
    }
  }
  return rows;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase().replace(/\//g, '\\');
if (isMain || process.argv[1]?.endsWith('run.ts')) {
  const grader = new Grader();
  try {
    const rows = await gradeRealRuns(grader);
    for (const r of rows) {
      console.log(`\n${r.run}  band ${r.band.join('-')}  total ${r.total}  ${r.verdict}`);
      console.log(`  pillars ${JSON.stringify(r.pillars)}`);
      console.log(`  page ${JSON.stringify(r.scores)}`);
      for (const f of r.feedback) console.log(`  - ${f}`);
    }
    const j = process.argv.indexOf('--json');
    if (j > 0) writeFileSync(process.argv[j + 1] ?? join(here, 'run.json'), JSON.stringify(rows, null, 2));
  } finally {
    await grader.close();
  }
}
