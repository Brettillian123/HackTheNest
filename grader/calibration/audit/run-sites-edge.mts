/**
 * Multi-page edge cases.
 *   npx tsx calibration/audit/run-sites-edge.mts shots   screenshots only, no grading
 *   npx tsx calibration/audit/run-sites-edge.mts grade   grade every attempt twice
 * Cases are in calibration/edge/sites (written by sites-edge-gen.mts); human
 * bands are in calibration/audit/sites-edge.json.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSite } from '../../src/calibrate-sites';
import { Grader, Renderer, type SiteFiles } from '../../src/index';
import { prepareSite } from '../../src/site-grade';

const here = dirname(fileURLToPath(import.meta.url));
const CASES = join(here, '..', 'edge', 'sites');
const OUT = join(here, '..', 'out', 'audit', 'sites-edge');
const mode = process.argv[2];

function load(dir: string): SiteFiles {
  const files = readSite(dir);
  if (files['__extra.json'] !== undefined) {
    const extra = JSON.parse(files['__extra.json']) as Record<string, string>;
    delete files['__extra.json'];
    Object.assign(files, extra);
  }
  return files;
}

function listCases(): { name: string; attempts: string[] }[] {
  return readdirSync(CASES)
    .sort()
    .filter((n) => statSync(join(CASES, n)).isDirectory())
    .map((name) => ({
      name,
      attempts: readdirSync(join(CASES, name))
        .sort()
        .filter((a) => a !== 'goal' && statSync(join(CASES, name, a)).isDirectory()),
    }));
}

async function shots(): Promise<void> {
  const renderer = new Renderer();
  try {
    for (const c of listCases()) {
      for (const attempt of ['goal', ...c.attempts]) {
        const dir = join(OUT, c.name, attempt);
        mkdirSync(dir, { recursive: true });
        try {
          const site = await prepareSite(renderer, load(join(CASES, c.name, attempt)), false);
          for (const p of site.pages) writeFileSync(join(dir, p.path.replace(/[\\/]/g, '__') + '.png'), p.snapshot.png);
          console.log(`${c.name}/${attempt}: ${site.pages.map((p) => p.path).join(', ')}`);
        } catch (e) {
          console.log(`${c.name}/${attempt}: could not render: ${(e as Error).message}`);
        }
      }
    }
  } finally {
    await renderer.close();
  }
}

interface Human {
  band?: [number, number];
  expect?: string;
  why: string;
}

async function grade(): Promise<void> {
  const bands = JSON.parse(readFileSync(join(here, 'sites-edge.json'), 'utf8')) as Record<string, Record<string, Human>>;
  const grader = new Grader();
  const lines: string[] = [];
  const log = (s: string) => {
    console.log(s);
    lines.push(s);
  };
  try {
    for (const c of listCases()) {
      const goal = await grader.prepareSite(load(join(CASES, c.name, 'goal')));
      for (const attempt of c.attempts) {
        const human = bands[c.name]?.[attempt];
        const files = load(join(CASES, c.name, attempt));
        const t0 = Date.now();
        const { result: r } = await grader.gradeSite(goal, files);
        const t1 = Date.now();
        const { result: r2 } = await grader.gradeSite(goal, files);
        const t2 = Date.now();
        const ms = [t1 - t0, t2 - t1];
        let verdict = 'n/a';
        if (human?.band) {
          const [lo, hi] = human.band;
          verdict = r.total < lo ? `HARSH by ${(lo - r.total).toFixed(1)}` : r.total > hi ? `LENIENT by ${(r.total - hi).toFixed(1)}` : 'ok';
        } else if (human?.expect) verdict = r.error ? 'refused' : 'graded';
        const e = r.engineering;
        const l = r.links;
        log(
          `${c.name}/${attempt}  band ${human?.band ? human.band.join('-') : 'expect'}  total ${r.total.toFixed(1)}` +
            (r2.total !== r.total ? ` (SECOND RUN ${r2.total.toFixed(1)}: NOT DETERMINISTIC)` : ' (repeat same)') +
            `  works ${r.pillars.works.toFixed(1)} / eng ${r.pillars.engineering.toFixed(1)} / looks ${r.pillars.looks.toFixed(1)}` +
            (r.bonus ? `  bonus ${r.bonus.toFixed(1)}` : '') +
            (e ? `  [eff ${e.efficiency.toFixed(1)} a11y ${e.accessibility.toFixed(1)} clean ${e.cleanCode.toFixed(1)} by ${e.decidedBy}]` : '  [no engineering]') +
            `  links ${l.found}/${l.expected} broken ${l.broken.length} orphaned ${l.orphaned.length} deadFactor ${l.deadLinkFactor.toFixed(3)}` +
            `  ${verdict}  ${ms.map((m) => `${(m / 1000).toFixed(1)}s`).join('/')}${ms.some((m) => m > 15000) ? ' SLOW' : ''}`,
        );
        if (l.broken.length) log(`    broken: ${l.broken.join(', ')}`);
        if (l.orphaned.length) log(`    orphaned: ${l.orphaned.join(', ')}`);
        log(`    pages: ${r.pages.map((p) => `${p.goal}${p.candidate && p.candidate !== p.goal ? `=>${p.candidate}` : p.candidate ? '' : '=>MISSING'} ${p.total.toFixed(1)}${p.orphaned ? ' (orphan)' : ''}`).join('; ')}`);
        for (const f of r.feedback.slice(0, 3)) log(`    -${f.points.toFixed(1)}  ${f.message}`);
        if (r.error) log(`    ERROR: ${r.error}`);
      }
    }
  } finally {
    await grader.close();
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'grade-output.txt'), lines.join('\n') + '\n');
}

if (mode === 'shots') await shots();
else if (mode === 'grade') {
  if (!existsSync(join(here, 'sites-edge.json'))) throw new Error('write sites-edge.json first');
  await grade();
} else console.log('usage: run-sites-edge.mts shots|grade');
