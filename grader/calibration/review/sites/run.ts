// Grades every review case against its band, checks order, self-grades, repeat-grades and probes.
//   npx tsx calibration/review/sites/run.ts > calibration/review/sites/run-output.txt
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grader, type PreparedSite, type SiteGradeResult } from '../../../src/index';
import { readSite } from '../../../src/calibrate-sites';

const here = dirname(fileURLToPath(import.meta.url));
const bands = JSON.parse(readFileSync(join(here, 'bands.json'), 'utf8'));
const f1 = (n: number) => n.toFixed(1);

function line(name: string, r: SiteGradeResult, ms: number, band?: [number, number, string]) {
  const e = r.engineering;
  let verdict = '';
  if (band) {
    const [lo, hi] = band;
    verdict = r.total < lo ? `HARSH by ${f1(lo - r.total)}` : r.total > hi ? `LENIENT by ${f1(r.total - hi)}` : 'ok';
  }
  console.log(`\n${name}${band ? `  band ${band[0]}-${band[1]}` : ''}  TOTAL ${f1(r.total)}  ${verdict}  (${(ms / 1000).toFixed(1)} s)`);
  console.log(`  works ${f1(r.pillars.works)}  looks ${f1(r.pillars.looks)}  engineering ${f1(r.pillars.engineering)}  bonus ${f1(r.bonus)}  exact ${r.exactMatch}`);
  if (e) console.log(`  eng: efficiency ${f1(e.efficiency)}  accessibility ${f1(e.accessibility)}  cleanCode ${f1(e.cleanCode)}  decidedBy ${e.decidedBy}`);
  if (r.efficiency) console.log(`  size ${(r.efficiency.space.bytes / 1024).toFixed(1)} KB vs ${(r.efficiency.space.referenceBytes / 1024).toFixed(1)} KB (credit ${f1(r.efficiency.space.credit)})`);
  const L = r.links;
  console.log(`  links: score ${L.score === null ? 'n/a' : f1(L.score)}  found ${L.found}/${L.expected}  broken ${L.broken.length}  missing ${L.missing.length}  orphaned [${L.orphaned.join(', ')}]  factor ${L.deadLinkFactor.toFixed(3)}`);
  if (L.broken.length) console.log(`    broken: ${L.broken.slice(0, 8).join(' | ')}${L.broken.length > 8 ? ' ...' : ''}`);
  console.log(`  pages: ${r.pages.map((p) => `${p.goal}${p.candidate && p.candidate !== p.goal ? `=>${p.candidate}` : ''}${p.orphaned ? '(orphan)' : ''}${p.movedTo ? `(moved:${p.movedTo})` : ''} ${f1(p.total)}`).join('; ')}`);
  for (const f of r.feedback) console.log(`  - [${f1(f.points)}] ${f.message}`);
  if (r.error) console.log(`  ERROR: ${r.error}`);
  return verdict;
}

const grader = new Grader();
const totals: Record<string, number> = {};
const verdicts: Record<string, string> = {};
const times: number[] = [];
async function grade(goal: PreparedSite, dir: string) {
  const t = Date.now();
  const { result } = await grader.gradeSite(goal, readSite(dir));
  const ms = Date.now() - t;
  times.push(ms);
  return { result, ms };
}

try {
  console.log('=== BANDED CASES ===');
  for (const set of ['restaurant', 'portfolio', 'conference']) {
    const goal = await grader.prepareSite(readSite(join(here, 'cases', set, 'goal')));
    const self = await grade(goal, join(here, 'cases', set, 'goal'));
    console.log(`\n### ${set}: goal against itself ${f1(self.result.total)} (bonus ${self.result.bonus})`);
    const dir = join(here, 'cases', set, 'attempts');
    for (const name of readdirSync(dir).sort()) {
      if (!statSync(join(dir, name)).isDirectory()) continue;
      const key = `${set}/${name}`;
      const a = await grade(goal, join(dir, name));
      const b = await grade(goal, join(dir, name));
      verdicts[key] = line(key, a.result, a.ms, bands.bands[key]);
      totals[key] = a.result.total;
      if (JSON.stringify(a.result) !== JSON.stringify(b.result)) console.log(`  REPEAT DIFFERS: ${a.result.total} vs ${b.result.total}`);
    }
  }

  console.log('\n=== ORDER CHECKS ===');
  let held = 0;
  for (const [hi, lo] of bands.order) {
    const ok = totals[hi] > totals[lo];
    if (ok) held++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${hi} (${f1(totals[hi])}) > ${lo} (${f1(totals[lo])})`);
  }

  console.log('\n=== PROBES (not banded) ===');
  const probeTotals: Record<string, number> = {};
  for (const set of ['probe-3', 'probe-10', 'probe-size']) {
    const goal = await grader.prepareSite(readSite(join(here, 'probes', set, 'goal')));
    const self = await grade(goal, join(here, 'probes', set, 'goal'));
    console.log(`\n### ${set}: goal against itself ${f1(self.result.total)}`);
    const dir = join(here, 'probes', set, 'attempts');
    for (const name of readdirSync(dir).sort()) {
      const a = await grade(goal, join(dir, name));
      probeTotals[`${set}/${name}`] = a.result.total;
      line(`${set}/${name}`, a.result, a.ms);
    }
  }
  console.log('\n=== MONOTONIC DEAD LINKS (cost must never fall) ===');
  for (const kind of ['dead-home', 'dead-everywhere']) {
    const seq = [1, 2, 4, 8].map((k) => probeTotals[`probe-10/${kind}-${k}`]);
    const mono = seq.every((v, i) => i === 0 || v <= seq[i - 1]);
    console.log(`  ${kind}: ${seq.map(f1).join(' -> ')}  ${mono ? 'ok' : 'FAIL (rises)'}`);
  }

  const n = Object.keys(verdicts).length;
  const inBand = Object.values(verdicts).filter((v) => v === 'ok').length;
  const outs = Object.entries(verdicts).filter(([, v]) => v !== 'ok').map(([k, v]) => ({ k, v, d: Number(v.split(' by ')[1]) }));
  console.log(`\n=== SUMMARY ===\n  in band ${inBand}/${n}; order held ${held}/${bands.order.length}`);
  if (outs.length) console.log(`  outside: mean distance ${f1(outs.reduce((s, o) => s + o.d, 0) / outs.length)}, worst ${f1(Math.max(...outs.map((o) => o.d)))}`);
  for (const o of outs.sort((a, b) => b.d - a.d)) console.log(`    ${o.k}: ${o.v}`);
  times.sort((a, b) => a - b);
  console.log(`  time per grade: median ${(times[Math.floor(times.length / 2)] / 1000).toFixed(1)} s, max ${(times[times.length - 1] / 1000).toFixed(1)} s over ${times.length} grades`);
} finally {
  await grader.close();
}
