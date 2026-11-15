// Engineering check: grades each goal against itself and lists source faults.
// Run from the grader folder: npx tsx ../challenge-pack/pages-2/forms/selfgrade.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Grader } from '../../../grader/src/index';
import { checkSource } from '../../../grader/src/quality';

const goals = resolve('../challenge-pack/pages-2/forms/goals');
async function main() {
const grader = new Grader();
try {
  for (const f of readdirSync(goals).filter((n) => n.endsWith('.html')).sort()) {
    const html = readFileSync(join(goals, f), 'utf8');
    const site = { 'index.html': html };
    const out: any = await grader.gradeSite(await grader.prepareSite(site), site);
    const s = checkSource(html);
    const faults: string[] = [];
    if (!s.hasDoctype) faults.push('no doctype');
    for (const [k, n] of Object.entries(s.parseErrors)) if (n) faults.push(`${k} x${n}`);
    if (s.duplicateIds.count) faults.push(`duplicate ids ${s.duplicateIds.examples.join(',')}`);
    if (s.obsoleteTags.count) faults.push(`obsolete tags ${s.obsoleteTags.examples.join(',')}`);
    if (s.obsoleteAttributes.count) faults.push(`obsolete attrs ${s.obsoleteAttributes.examples.join(',')}`);
    if (s.inlineStyled) faults.push(`inline styles ${s.inlineStyled}`);
    if (s.importantCount) faults.push(`!important ${s.importantCount}`);
    if (s.structure?.fakeButtons) faults.push(`fake buttons ${s.structure.fakeButtons}`);
    if (s.structure?.tablesWithoutHeaders) faults.push(`tables without th ${s.structure.tablesWithoutHeaders}`);
    console.log(`${f}: total ${(out.result?.total ?? out.total)}; faults: ${faults.length ? faults.join('; ') : 'none'}`);
    if ((out.result?.total ?? out.total) !== 100) console.log(JSON.stringify(out).slice(0, 2500));
  }
} finally {
  await grader.close();
}
}
main();
