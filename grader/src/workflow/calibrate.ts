/**
 * Band agreement for the workflow calibration set:
 *   npx tsx src/workflow/calibrate.ts
 * Grades calibration/workflow/<challenge>/reference.json and attempts/*.json
 * against the challenge rubric and prints each score beside its human band.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeWorkflow } from './index';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../calibration/workflow');
const bands = JSON.parse(fs.readFileSync(path.join(root, 'bands.json'), 'utf8')) as Record<string, Record<string, { band: [number, number] }>>;

let inside = 0;
let count = 0;
const rows: string[] = [];
for (const challenge of fs.readdirSync(root).filter((d) => fs.statSync(path.join(root, d)).isDirectory()).sort()) {
  const dir = path.join(root, challenge);
  const rubric = JSON.parse(fs.readFileSync(path.join(dir, 'rubric.json'), 'utf8'));
  const files: [string, string][] = [['reference', path.join(dir, 'reference.json')]];
  const attempts = path.join(dir, 'attempts');
  if (fs.existsSync(attempts)) for (const f of fs.readdirSync(attempts).sort()) if (f.endsWith('.json')) files.push([f.replace(/\.json$/, ''), path.join(attempts, f)]);
  for (const [name, file] of files) {
    const r = gradeWorkflow({ rubric, candidate: fs.readFileSync(file, 'utf8') });
    const band = bands[challenge]?.[name]?.band;
    const ok = band ? r.total >= band[0] && r.total <= band[1] : false;
    const miss = band ? (ok ? 0 : r.total < band[0] ? r.total - band[0] : r.total - band[1]) : NaN;
    count++;
    if (ok) inside++;
    const crit = r.criteria.map((c) => `${c.id}=${c.value.toFixed(2)}`).join(' ');
    rows.push(`${challenge.padEnd(22)} ${name.padEnd(24)} ${r.total.toFixed(1).padStart(5)}  ${band ? `${band[0]}-${band[1]}`.padEnd(7) : 'no band'} ${ok ? 'in ' : `off ${miss > 0 ? '+' : ''}${miss.toFixed(1)}`}  ${r.error ?? crit}`);
  }
}
console.log(rows.join('\n'));
console.log(`\n${inside} of ${count} inside their bands`);
