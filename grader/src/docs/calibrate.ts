/**
 * Grades every calibration attempt under `calibration/docs/` and compares it
 * with the human band written for it beforehand.
 *
 *   npx tsx src/docs/calibrate.ts            # the agreement table
 *   npx tsx src/docs/calibrate.ts --verbose  # plus each attempt's criteria and feedback
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeDoc, type DocKind, type DocRubric } from './index';

const ROOT = fileURLToPath(new URL('../../calibration/docs/', import.meta.url));

const KIND_OF: Record<string, DocKind> = {
  'agent-instructions': 'instructions',
  'release-notes-skill': 'skill',
  'order-lookup-tools': 'mcp-tools',
};

interface Band {
  challenge: string;
  attempt: string;
  band: [number, number];
  why: string;
}

export interface CalibrationRow {
  challenge: string;
  attempt: string;
  band: [number, number];
  total: number;
  inside: boolean;
  /** Distance outside the band (0 when inside). */
  off: number;
}

export function kindOf(challenge: string): DocKind {
  return KIND_OF[challenge] ?? 'instructions';
}

export function loadChallenge(challenge: string): { kind: DocKind; rubric: DocRubric; reference: string } {
  const dir = join(ROOT, challenge);
  const rubric = JSON.parse(readFileSync(join(dir, 'rubric.json'), 'utf8')) as DocRubric;
  const refPath = existsSync(join(dir, 'reference.md')) ? join(dir, 'reference.md') : join(dir, 'reference.json');
  return { kind: kindOf(challenge), rubric, reference: readFileSync(refPath, 'utf8') };
}

export function challenges(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function calibrate(verbose = false, out: (line: string) => void = () => {}): CalibrationRow[] {
  const bands = (JSON.parse(readFileSync(join(ROOT, 'bands.json'), 'utf8')) as { bands: Band[] }).bands;
  const rows: CalibrationRow[] = [];
  for (const challenge of challenges()) {
    const { kind, rubric, reference } = loadChallenge(challenge);
    const ref = gradeDoc({ kind, rubric, candidate: reference });
    out(`\n${challenge} (${kind}): reference ${ref.total}`);
    if (verbose && ref.total < 100) for (const f of ref.feedback) out(`    ref -${f.points} ${f.message}`);
    for (const b of bands.filter((x) => x.challenge === challenge)) {
      const text = readFileSync(join(ROOT, challenge, 'attempts', b.attempt), 'utf8');
      const r = gradeDoc({ kind, rubric, candidate: text });
      const off = r.total < b.band[0] ? b.band[0] - r.total : r.total > b.band[1] ? r.total - b.band[1] : 0;
      rows.push({ challenge, attempt: b.attempt, band: b.band, total: r.total, inside: off === 0, off: Math.round(off * 10) / 10 });
      out(`  ${off === 0 ? 'in ' : 'OUT'} ${b.attempt.padEnd(28)} ${String(r.total).padStart(5)}  band ${b.band[0]}-${b.band[1]}${off ? `  (off by ${off.toFixed(1)})` : ''}`);
      if (verbose) {
        out(`      works ${r.pillars.works} looks ${r.pillars.looks} eng ${r.pillars.engineering} | ${r.criteria.map((c) => `${c.id} ${c.value}`).join(', ')}`);
        for (const f of r.feedback) out(`      -${f.points} ${f.message}`);
        if (r.error) out(`      error: ${r.error}`);
      }
    }
  }
  const inside = rows.filter((r) => r.inside).length;
  const worst = rows.reduce((a, r) => (r.off > (a?.off ?? -1) ? r : a), rows[0]);
  out(`\n${inside}/${rows.length} attempts inside their bands. Worst: ${worst ? `${worst.challenge}/${worst.attempt} ${worst.total} vs ${worst.band[0]}-${worst.band[1]} (off ${worst.off})` : 'none'}.`);
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  calibrate(process.argv.includes('--verbose'), (line) => console.log(line));
}
