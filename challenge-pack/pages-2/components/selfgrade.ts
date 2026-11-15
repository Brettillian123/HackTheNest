// Grades each goal against itself as a one-page site and lists source faults.
// Run from the grader folder: npx tsx ../challenge-pack/pages-2/components/selfgrade.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Grader } from '../../../grader/src/index';
import { checkSource } from '../../../grader/src/quality';

const SLUGS = ['alert-stack', 'empty-state', 'checkout-steps', 'tabbed-panel', 'settings-toggles', 'comment-thread', 'data-table-paged', 'modal-over-page'];

async function main() {
const grader = new Grader();
try {
  for (const slug of SLUGS) {
    const html = readFileSync(join(__dirname, 'goals', `${slug}.html`), 'utf8');
    const goal = await grader.prepareSite({ 'index.html': html });
    const out = await grader.gradeSite(goal, { 'index.html': html });
    const f = checkSource(html);
    const faults: string[] = [];
    if (!f.hasDoctype) faults.push('no doctype');
    for (const [k, n] of Object.entries(f.parseErrors)) if (n) faults.push(`parse ${k} x${n}`);
    if (f.duplicateIds.count) faults.push(`duplicate ids ${f.duplicateIds.examples.join(',')}`);
    if (f.obsoleteTags.count) faults.push(`obsolete tags ${f.obsoleteTags.examples.join(',')}`);
    if (f.obsoleteAttributes.count) faults.push(`obsolete attributes ${f.obsoleteAttributes.examples.join(',')}`);
    if (f.inlineStyled) faults.push(`inline styles x${f.inlineStyled}`);
    if (f.importantCount) faults.push(`!important x${f.importantCount}`);
    console.log(`${slug}: total ${out.result.total}  faults: ${faults.length ? faults.join('; ') : 'none'}`);
  }
} finally {
  await grader.close();
}
}

main();
