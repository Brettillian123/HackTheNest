/**
 * Grades the advanced single-page sets (dashboard, article, checkout) against
 * the human bands in pages-advanced.json.
 *
 *   npx tsx calibration/audit/run-pages-advanced.mts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grader } from '../../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const setsDir = join(here, '..', 'sets');
const bands = JSON.parse(readFileSync(join(here, 'pages-advanced.json'), 'utf8'));
const SETS = ['dashboard', 'article', 'checkout'];
const ATTEMPTS = ['rebuild-detailed', 'rebuild-vague', 'near', 'wrong-data', 'missing-section', 'restyled', 'rearranged', 'lorem'];

const f = (v: number | null) => (v === null ? '  n/a' : v.toFixed(1).padStart(5));
const grader = new Grader();
let ok = 0, total = 0, orderFails = 0;
try {
  for (const set of SETS) {
    const goalHtml = readFileSync(join(setsDir, set, 'goal.html'), 'utf8');
    const goal = await grader.render(goalHtml);
    const self = (await grader.grade(goal, goalHtml)).result.total;
    console.log(`\n== ${set}   goal vs itself: ${self.toFixed(2)} ${self === 100 ? 'ok' : 'NOT 100'}`);
    const scores: Record<string, number> = {};
    for (const a of ATTEMPTS) {
      const html = readFileSync(join(setsDir, set, a + '.html'), 'utf8');
      const { result } = await grader.grade(goal, html);
      const [lo, hi] = bands[set][a].band as [number, number];
      const t = result.total;
      scores[a] = t;
      const verdict = t < lo ? `HARSH by ${(lo - t).toFixed(1)}` : t > hi ? `LENIENT by ${(t - hi).toFixed(1)}` : 'ok';
      total++; if (verdict === 'ok') ok++;
      const b = result.breakdown;
      console.log(`${set.padEnd(9)} ${a.padEnd(16)} band ${String(lo).padStart(2)}-${String(hi).padEnd(3)} total ${f(t)} | content ${f(b.content)} layout ${f(b.layout)} style ${f(b.style)} visual ${f(b.visual)} | ${verdict}`);
      for (const line of (result.feedback ?? []).slice(0, 3)) console.log(`      - (${line.points.toFixed(1)}) ${line.message}`);
    }
    for (const [a, b] of bands.order[set] as [string, string][]) {
      if (!(scores[a] > scores[b])) { orderFails++; console.log(`  ORDER FAIL: ${a} (${scores[a].toFixed(1)}) should beat ${b} (${scores[b].toFixed(1)})`); }
    }
  }
} finally {
  await grader.close();
}
console.log(`\n${ok}/${total} attempts inside the human band; ${orderFails} order failures`);
