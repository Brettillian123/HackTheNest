/**
 * Grades every attempt of the intent benchmark through gradeSite with the
 * challenge's key facts, and compares with the human bands.
 *
 *   npx tsx calibration/intent/run.ts --split train [--json calibration/intent/train.json]
 *   npx tsx calibration/intent/run.ts --split heldout     (totals and verdicts only)
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grader } from '../../src/index';
import { siteValues } from '../../src/criteria/site-model';
import { siteTotalOf, type IntentFitRecord } from '../../src/intent/model';
import { INTENT_VALUES } from '../../src/intent/params';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const split = args[args.indexOf('--split') + 1] ?? 'train';
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const showDetail = split === 'train';

interface Bands { challenges: Record<string, { split: string; attempts: Record<string, { band: [number, number] }>; order: [string, string][] }> }

async function main() {
  const bands = JSON.parse(readFileSync(join(DIR, 'bands.json'), 'utf8')) as Bands;
  const sv = siteValues();
  const grader = new Grader();
  const records: unknown[] = [];
  const orders: unknown[] = [];
  let n = 0, inBand = 0, sumD = 0, held = 0, pairs = 0, maxModelDiff = 0;
  try {
    for (const [slug, ch] of Object.entries(bands.challenges).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (ch.split !== split) continue;
      const brief = JSON.parse(readFileSync(join(DIR, slug, 'brief.json'), 'utf8')) as { keyFacts: string[] };
      const goal = await grader.prepareSite({ 'index.html': readFileSync(join(DIR, slug, 'goal.html'), 'utf8') });
      const intent = { 'index.html': { keyFacts: brief.keyFacts } };
      console.log(`\n== ${slug}`);
      const totals: Record<string, number> = {};
      const files = readdirSync(join(DIR, slug, 'attempts')).filter((f) => f.endsWith('.html')).sort();
      for (const f of files) {
        const key = f.replace(/\.html$/, '');
        const band = ch.attempts[key]?.band;
        if (!band) continue;
        const { result } = await grader.gradeSite(goal, { 'index.html': readFileSync(join(DIR, slug, 'attempts', f), 'utf8') }, { intent });
        const total = result.total;
        totals[key] = total;
        const d = total < band[0] ? band[0] - total : total > band[1] ? total - band[1] : 0;
        const verdict = d === 0 ? 'ok' : total < band[0] ? `HARSH by ${d.toFixed(1)}` : `LENIENT by ${d.toFixed(1)}`;
        n++; sumD += d; if (d === 0) inBand++;
        const page = result.pages[0]?.result as any;
        let line = `${key.padEnd(20)} [${band[0]}-${band[1]}]`.padEnd(32) + `${total.toFixed(1).padStart(6)}  ${verdict.padEnd(16)}`;
        if (showDetail) {
          const p = result.pillars;
          const crit = (page?.criteria ?? []).map((c: any) => `${c.id.slice(0, 5)} ${c.value === null ? '  -' : c.value.toFixed(2)}`).join(' ');
          line += ` W${p.works.toFixed(0)} E${p.engineering.toFixed(0)} L${p.looks.toFixed(0)} | ${crit}`;
        }
        console.log(line);
        if (page?.intentMeasurements) {
          const rec: IntentFitRecord = {
            intent: page.intentMeasurements,
            engineering: result.pillars.engineering / 100,
            pageWorksContent: sv.pageWorksContent,
            pageLooksStyle: sv.pageLooksStyle,
            worksWeight: sv.worksWeight,
            looksWeight: sv.looksWeight,
            engineeringWeight: sv.engineeringWeight,
          };
          maxModelDiff = Math.max(maxModelDiff, Math.abs(siteTotalOf(rec, INTENT_VALUES) - total));
          records.push({ domain: 'pages', set: slug, split, key, band, score: total, result: rec });
        }
      }
      for (const [hi, lo] of ch.order) {
        if (totals[hi] === undefined || totals[lo] === undefined) continue;
        pairs++;
        orders.push({ domain: 'pages', set: slug, higher: hi, lower: lo });
        if (totals[hi] > totals[lo]) held++;
        else console.log(`   order broken: ${hi} (${totals[hi]}) should beat ${lo} (${totals[lo]})`);
      }
    }
  } finally {
    await grader.close();
  }
  console.log(`\n${split}: ${inBand}/${n} in band, mean distance ${(sumD / Math.max(1, n)).toFixed(2)}, order ${held}/${pairs}`);
  console.log(`fit model reproduces the site total within ${maxModelDiff.toFixed(2)} points`);
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ records, orders }, null, 1) + '\n');
    console.log(`wrote ${jsonOut}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
