/**
 * Review runner for single pages.
 *   npx tsx calibration/review/pages/run.ts   (from the grader folder)
 * Writes calibration/out/review/pages/run.txt and results.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grader } from '../../../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'out', 'review', 'pages');
mkdirSync(outDir, { recursive: true });
const bands = JSON.parse(readFileSync(join(here, 'bands.json'), 'utf8'));
const manifest: { group: string; goal: string; attempt: string; label: string }[] = JSON.parse(readFileSync(join(here, 'probes', 'manifest.json'), 'utf8'));
const read = (p: string) => readFileSync(join(here, p), 'utf8');
const lines: string[] = [];
const log = (s = '') => { lines.push(s); console.log(s); };
const f1 = (v: number | null) => (v === null ? ' n/a' : v.toFixed(1).padStart(5));

const g = new Grader();
const results: Record<string, any> = {};
const goals: Record<string, any> = {};
const times: number[] = [];
let nondet = 0;
async function gradeOnce(goalKey: string, html: string) {
  if (!goals[goalKey]) goals[goalKey] = await g.render(read(goalKey));
  const t0 = Date.now();
  const { result } = await g.grade(goals[goalKey], html);
  times.push(Date.now() - t0);
  return result;
}

try {
  log('=== Self checks (goal vs itself must be exactly 100) ===');
  for (const k of ['menu', 'signup', 'invoice', 'product']) {
    const r = await gradeOnce(`${k}/goal.html`, read(`${k}/goal.html`));
    log(`${k.padEnd(8)} ${r.total.toFixed(2)} ${r.total === 100 ? 'ok' : 'FAIL'}`);
  }
  log('\n=== Banded attempts ===');
  let inside = 0, outside: number[] = [];
  for (const [key, [lo, hi, why]] of Object.entries(bands.attempts) as [string, [number, number, string]][]) {
    const [goal] = key.split('/');
    const html = read(key + '.html');
    const r = await gradeOnce(`${goal}/goal.html`, html);
    const r2 = await gradeOnce(`${goal}/goal.html`, html);
    if (r2.total !== r.total) nondet++;
    const v = r.total < lo ? `HARSH by ${(lo - r.total).toFixed(1)}` : r.total > hi ? `LENIENT by ${(r.total - hi).toFixed(1)}` : 'ok';
    if (v === 'ok') inside++; else outside.push(r.total < lo ? lo - r.total : r.total - hi);
    results[key] = { total: r.total, b: r.breakdown, band: [lo, hi], verdict: v, feedback: r.feedback };
    const b = r.breakdown;
    log(`\n${key.padEnd(28)} band ${lo}-${hi}  total ${r.total.toFixed(1)}  [c${f1(b.content)} l${f1(b.layout)} s${f1(b.style)} v${f1(b.visual)}]  ${v}${r2.total !== r.total ? `  NONDETERMINISTIC (${r2.total})` : ''}`);
    log(`   why: ${why}`);
    for (const fb of r.feedback) log(`   - (${fb.points}) ${fb.message}`);
  }
  log('\n=== Order checks ===');
  let held = 0;
  for (const [a, b] of bands.order as [string, string][]) {
    const ok = results[a].total > results[b].total;
    if (ok) held++;
    log(`${ok ? 'ok  ' : 'FAIL'} ${a} (${results[a].total.toFixed(1)}) > ${b} (${results[b].total.toFixed(1)})`);
  }
  log('\n=== Consistency probes ===');
  let grp = '';
  for (const p of manifest) {
    if (p.group !== grp) { grp = p.group; log(`\n[${grp}]`); }
    const r = await gradeOnce(p.goal, read(p.attempt));
    const b = r.breakdown;
    log(`  ${p.label.padEnd(32)} ${r.total.toFixed(1).padStart(5)}  cost ${(100 - r.total).toFixed(1).padStart(5)}  [c${f1(b.content)} l${f1(b.layout)} s${f1(b.style)} v${f1(b.visual)}]`);
    for (const fb of r.feedback) log(`      - (${fb.points}) ${fb.message}`);
  }
  const n = Object.keys(bands.attempts).length;
  log('\n=== Summary ===');
  log(`inside band ${inside}/${n}; outside ${outside.length}, mean distance ${(outside.reduce((s, x) => s + x, 0) / Math.max(1, outside.length)).toFixed(1)}, worst ${Math.max(0, ...outside).toFixed(1)}`);
  log(`order checks held ${held}/${bands.order.length}`);
  log(`repeat grades differing: ${nondet}`);
  const ts = [...times].sort((a, b) => a - b);
  log(`time per grade: median ${ts[Math.floor(ts.length / 2)]} ms, max ${ts[ts.length - 1]} ms, n=${ts.length}`);
} finally {
  await g.close();
  writeFileSync(join(outDir, 'run.txt'), lines.join('\n'));
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 1));
}
