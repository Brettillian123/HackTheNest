// Grades each goal against itself as a one-page site and lists source faults.
// Run from the grader folder: npx tsx ../challenge-pack/pages-2/apps/selfgrade.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Grader } from '../../../grader/src/index';
import { checkSource } from '../../../grader/src/quality/source-checks';

const goals = resolve(process.cwd(), '..', 'challenge-pack', 'pages-2', 'apps', 'goals');

async function main(): Promise<void> {
  const grader = new Grader();
  try {
    for (const f of readdirSync(goals).filter((n) => n.endsWith('.html')).sort()) {
      const html = readFileSync(join(goals, f), 'utf8');
      const goal = await grader.prepareSite({ 'index.html': html });
      const { result } = await grader.gradeSite(goal, { 'index.html': html });
      const facts: any = checkSource(html);
      const faults = Object.entries(facts).filter(([, v]) =>
        (typeof v === 'number' && v > 0) ||
        (Array.isArray(v) && v.length > 0) ||
        (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) ||
        v === true);
      console.log(`${f}: total ${result.total}`);
      console.log('  source facts: ' + JSON.stringify(Object.fromEntries(faults)).slice(0, 800));
    }
  } finally {
    await grader.close();
  }
}

main();
