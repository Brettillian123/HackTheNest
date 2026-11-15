/**
 * Builds and shows a goal page's challenge profile.
 *
 *   npx tsx src/profile/cli.ts <goal.html> [--out profile.json] [--overlay overlay.png] [--marks marks.json]
 *
 * Prints the component tree. --marks applies the author's hand-written marks
 * (see marks.ts); the profile and overlay then show the result.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Renderer } from '../render';
import { applyMarks, buildPageProfile, validateProfile, type PageComponent } from './index';
import { drawOverlay } from './overlay';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const k = args.indexOf(name);
  return k >= 0 ? args[k + 1] : undefined;
};
const file = args.find((a, k) => !a.startsWith('--') && (k === 0 || !args[k - 1].startsWith('--')));
if (!file) {
  console.error('usage: npx tsx src/profile/cli.ts <goal.html> [--out profile.json] [--overlay overlay.png] [--marks marks.json]');
  process.exit(2);
}

const renderer = new Renderer();
try {
  const snap = await renderer.render(readFileSync(file, 'utf8'));
  let profile = buildPageProfile(snap);
  const marksFile = opt('--marks');
  if (marksFile) profile = applyMarks(profile, JSON.parse(readFileSync(marksFile, 'utf8')), snap);
  validateProfile(profile, snap);
  const show = (c: PageComponent, depth: number) => {
    const keys = c.keyTexts.map((i) => JSON.stringify((snap.blocks[i].text ?? '').slice(0, 30))).join(', ');
    console.log(`${'  '.repeat(depth)}${c.id} ${c.type} ${c.importance} "${c.name}"${keys ? '  keys: ' + keys : ''}`);
    c.children.forEach((k) => show(k, depth + 1));
  };
  profile.components.forEach((c) => show(c, 0));
  const ws = profile.weightShift;
  if (ws.content || ws.layout || ws.style || ws.visual) console.log('weight shift', JSON.stringify(ws));
  const out = opt('--out');
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(profile, null, 2) + '\n');
  }
  const overlay = opt('--overlay');
  if (overlay) {
    mkdirSync(dirname(overlay), { recursive: true });
    writeFileSync(overlay, drawOverlay(snap.png, profile));
  }
} finally {
  await renderer.close();
}
