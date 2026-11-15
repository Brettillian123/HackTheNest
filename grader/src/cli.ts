/**
 * Grades one page against a goal from the command line.
 *
 *   npm run grade -- <goal.html> <candidate.html> [--json]
 */
import { readFileSync } from 'node:fs';
import { Grader } from './index';

const args = process.argv.slice(2);
const json = args.includes('--json');
const [goalPath, candidatePath] = args.filter((a) => !a.startsWith('--'));
if (!goalPath || !candidatePath) {
  console.error('usage: npm run grade -- <goal.html> <candidate.html> [--json]');
  process.exit(2);
}

const grader = new Grader();
try {
  const { result } = await grader.grade(readFileSync(goalPath, 'utf8'), readFileSync(candidatePath, 'utf8'));
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const show = (v: number | null) => (v === null ? 'n/a' : v.toFixed(1));
    console.log(`total    ${result.total.toFixed(1)} / 100   (rules ${result.version})`);
    console.log(`content  ${show(result.breakdown.content)}`);
    console.log(`layout   ${show(result.breakdown.layout)}`);
    console.log(`style    ${show(result.breakdown.style)}`);
    console.log(`visual   ${show(result.breakdown.visual)}`);
    if (result.error) console.log(`error    ${result.error}`);
    if (result.details.missingText.length) console.log(`missing  ${result.details.missingText.join(' | ')}`);
    if (result.details.extraText.length) console.log(`extra    ${result.details.extraText.join(' | ')}`);
  }
} finally {
  await grader.close();
}
