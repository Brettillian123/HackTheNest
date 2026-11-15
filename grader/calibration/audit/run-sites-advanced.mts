/**
 * Advanced multi-page audit: docs and shop sets.
 *
 *   npx tsx calibration/audit/run-sites-advanced.mts shots   # screenshots only, no grading
 *   npx tsx calibration/audit/run-sites-advanced.mts grade   # grade every attempt against sites-advanced.json
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSite } from '../../src/calibrate-sites';
import { Grader, Renderer } from '../../src/index';
import { prepareSite } from '../../src/site-grade';

const here = dirname(fileURLToPath(import.meta.url));
const SITES = join(here, '..', 'sites');
const OUT = join(here, '..', 'out', 'audit', 'sites-advanced');
const SETS = ['docs', 'shop'];
const mode = process.argv[2];

async function shots(): Promise<void> {
  const renderer = new Renderer();
  try {
    for (const set of SETS) {
      const dirs: [string, string][] = [['goal', join(SITES, set, 'goal')]];
      for (const a of readdirSync(join(SITES, set, 'attempts')).sort()) dirs.push([a, join(SITES, set, 'attempts', a)]);
      for (const [name, dir] of dirs) {
        const site = await prepareSite(renderer, readSite(dir), false);
        const out = join(OUT, set, name);
        mkdirSync(out, { recursive: true });
        for (const p of site.pages) writeFileSync(join(out, p.path.replace(/\//g, '__') + '.png'), p.snapshot.png);
        console.log(`${set}/${name}: ${site.pages.map((p) => p.path).join(', ')}`);
      }
    }
  } finally {
    await renderer.close();
  }
}

type Expect = { band: [number, number]; why: string };

async function grade(): Promise<void> {
  const expected = JSON.parse(readFileSync(join(here, 'sites-advanced.json'), 'utf8'));
  const grader = new Grader();
  const lines: string[] = [];
  const log = (s: string) => { lines.push(s); console.log(s); };
  const totals: Record<string, Record<string, number>> = {};
  try {
    for (const set of SETS) {
      totals[set] = {};
      let t = Date.now();
      const goalFiles = readSite(join(SITES, set, 'goal'));
      const goal = await grader.prepareSite(goalFiles);
      log(`\n${set}  (goal prepared in ${Date.now() - t} ms)`);
      t = Date.now();
      const self = (await grader.gradeSite(goal, goalFiles)).result;
      log(`  goal vs itself: ${self.total.toFixed(1)} ${self.total === 100 ? 'ok' : 'NOT 100'}  (${Date.now() - t} ms)`);
      for (const name of readdirSync(join(SITES, set, 'attempts')).sort()) {
        const e: Expect = expected[set][name];
        t = Date.now();
        const r = (await grader.gradeSite(goal, readSite(join(SITES, set, 'attempts', name)))).result;
        const ms = Date.now() - t;
        totals[set][name] = r.total;
        const [lo, hi] = e.band;
        const verdict = r.total < lo ? `HARSH by ${(lo - r.total).toFixed(1)}` : r.total > hi ? `LENIENT by ${(r.total - hi).toFixed(1)}` : 'ok';
        const g = r.engineering;
        log(
          `  ${name.padEnd(17)} band ${String(lo).padStart(3)}-${String(hi).padEnd(3)} total ${r.total.toFixed(1).padStart(5)}  ` +
            `w/e/l ${r.pillars.works.toFixed(1)} / ${r.pillars.engineering.toFixed(1)} / ${r.pillars.looks.toFixed(1)}  ` +
            `eng: eff ${g ? g.efficiency.toFixed(1) : '-'} a11y ${g ? g.accessibility.toFixed(1) : '-'} clean ${g ? g.cleanCode.toFixed(1) : '-'} by ${g?.decidedBy ?? '-'}  ` +
            `${verdict}  (${ms} ms)`,
        );
        const l = r.links;
        log(
          `      links: ${l.found}/${l.expected} found, score ${l.score === null ? 'n/a' : l.score.toFixed(1)}, broken ${l.broken.length}, orphaned [${l.orphaned.join(', ')}], dead factor ${l.deadLinkFactor.toFixed(3)}` +
            `  pages: ${r.pages.map((p) => `${p.goal}${p.candidate && p.candidate !== p.goal ? '=' + p.candidate : ''} ${p.total.toFixed(0)}`).join(', ')}`,
        );
        for (const f of r.feedback.slice(0, 4)) log(`      -${f.points.toFixed(1).padStart(5)}  ${f.message}`);
      }
    }
    log('\norder checks:');
    for (const [set, pairs] of Object.entries(expected.order ?? {}) as [string, [string, string][]][]) {
      for (const [better, worse] of pairs) {
        const a = totals[set][better], b = totals[set][worse];
        log(`  ${set}: ${better} (${a.toFixed(1)}) > ${worse} (${b.toFixed(1)})  ${a > b ? 'ok' : 'WRONG ORDER'}`);
      }
    }
  } finally {
    await grader.close();
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'grade.txt'), lines.join('\n') + '\n');
}

if (mode === 'shots') await shots();
else if (mode === 'grade') await grade();
else console.log('usage: run-sites-advanced.mts shots|grade');
