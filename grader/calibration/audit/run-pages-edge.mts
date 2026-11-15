/**
 * Grades every single-page edge case against the human bands in pages-edge.json.
 *   npx tsx calibration/audit/run-pages-edge.mts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Grader } from '../../src/index';

const here = 'calibration';
const bands = JSON.parse(readFileSync(join(here, 'audit/pages-edge.json'), 'utf8')) as Record<string, Record<string, { band: [number, number] }>>;
const root = join(here, 'edge/pages');
const RANKS: [string, string, string][] = [
  ['content-cards', 'swapped-two', 'missing-one'],
  ['own-whole', 'no-icons', 'no-pricing'],
  ['own-whole', 'no-pricing', 'lorem'],
  ['own-whole', 'no-pricing', 'unstyled'],
];
const f = (v: number | null) => (v === null ? '  n/a' : v.toFixed(1).padStart(5));
const grader = new Grader();
const totals: Record<string, number> = {};
let ok = 0, n = 0, problems = 0;
try {
  for (const c of readdirSync(root).sort()) {
    const goalHtml = readFileSync(join(root, c, 'goal.html'), 'utf8');
    const goal = await grader.render(goalHtml);
    const self = (await grader.grade(goal, goalHtml)).result.total;
    if (self !== 100) { problems++; console.log(`SELF ${c} goal vs itself = ${self}`); }
    for (const a of Object.keys(bands[c] ?? {})) {
      const html = readFileSync(join(root, c, a + '.html'), 'utf8');
      const { result } = await grader.grade(goal, html);
      const again = (await grader.grade(goal, html)).result.total;
      if (again !== result.total) { problems++; console.log(`NONDET ${c}/${a} ${result.total} vs ${again}`); }
      const [lo, hi] = bands[c][a].band;
      const t = result.total;
      totals[`${c}/${a}`] = t;
      const verdict = t < lo ? `HARSH by ${(lo - t).toFixed(1)}` : t > hi ? `LENIENT by ${(t - hi).toFixed(1)}` : 'ok';
      n++; if (verdict === 'ok') ok++;
      const b = result.breakdown;
      console.log(`${c.padEnd(17)} ${a.padEnd(18)} [${lo}-${hi}] total ${f(t)} | C ${f(b.content)} L ${f(b.layout)} S ${f(b.style)} V ${f(b.visual)} | ${verdict}`);
      for (const fb of result.feedback.slice(0, 2)) console.log(`      - ${fb.message} (${fb.points})`);
    }
  }
  for (const [c, hi, lo] of RANKS) {
    const a = totals[`${c}/${hi}`], b = totals[`${c}/${lo}`];
    console.log(`RANK ${c}: ${hi} ${a} > ${lo} ${b} ${a > b ? 'ok' : 'WRONG ORDER'}`);
  }
  const ta = totals['layout-tall/diff-above-cut'], tb = totals['layout-tall/diff-below-cut'];
  console.log(`RANK layout-tall: above ${ta} ~ below ${tb} (gap ${Math.abs(ta - tb).toFixed(1)})`);
  console.log(`\n${ok}/${n} inside band; self/determinism problems: ${problems}`);
} finally {
  await grader.close();
}
