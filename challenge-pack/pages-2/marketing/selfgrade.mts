// Grades each goal against itself and lists source faults.
// Run from the grader folder: npx tsx ../challenge-pack/pages-2/marketing/selfgrade.mts
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grader } from '../../../grader/src/index';
import { checkSource } from '../../../grader/src/quality/source-checks';

const goals = join(dirname(fileURLToPath(import.meta.url)), 'goals');
const grader = new Grader();
try {
  for (const f of readdirSync(goals).filter((n) => n.endsWith('.html')).sort()) {
    const html = readFileSync(join(goals, f), 'utf8');
    const site = { 'index.html': html };
    const goal = await grader.prepareSite(site);
    const { result } = await grader.gradeSite(goal, site);
    const s = checkSource(html);
    const faults: string[] = [];
    if (!s.hasDoctype) faults.push('no doctype');
    for (const [k, n] of Object.entries(s.parseErrors)) faults.push(`parse ${k} x${n}`);
    if (s.duplicateIds.count) faults.push(`duplicate ids ${s.duplicateIds.examples.join(',')}`);
    if (s.obsoleteTags.count) faults.push(`obsolete tags ${s.obsoleteTags.examples.join(',')}`);
    if (s.obsoleteAttributes.count) faults.push(`obsolete attrs ${s.obsoleteAttributes.examples.join(',')}`);
    if (s.inlineStyled) faults.push(`inline styles ${s.inlineStyled}`);
    if (s.importantCount) faults.push(`!important ${s.importantCount}`);
    if (s.structure?.tablesWithoutHeaders) faults.push('table without th');
    if (s.structure?.fakeButtons) faults.push(`fake buttons ${s.structure.fakeButtons}`);
    console.log(`${f}: total ${result.total}; faults: ${faults.length ? faults.join('; ') : 'none'}`);
    if (result.total !== 100) console.log(JSON.stringify(result, (k, v) => (typeof v === 'string' && v.length > 300 ? v.slice(0, 300) : v)).slice(0, 3000));
  }
} finally {
  await grader.close();
}
