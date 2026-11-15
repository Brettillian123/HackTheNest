/**
 * Renders HTML files to PNG screenshots with the grader's own renderer, so
 * you see exactly what the grader sees.
 *
 *   npx tsx src/shot.ts <out-folder> <file.html> [more.html ...]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Renderer } from './render';

const [outDir, ...files] = process.argv.slice(2);
if (!outDir || files.length === 0) {
  console.error('usage: npx tsx src/shot.ts <out-folder> <file.html> [more.html ...]');
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });
const renderer = new Renderer();
let failed = false;
try {
  for (const file of files) {
    try {
      const snap = await renderer.render(readFileSync(file, 'utf8'));
      const out = join(outDir, basename(file).replace(/\.html?$/i, '') + '.png');
      writeFileSync(out, snap.png);
      const texts = snap.blocks.filter((b) => b.kind === 'text').length;
      console.log(`ok   ${file} -> ${out}  ${snap.width}x${snap.height}  ${snap.blocks.length} blocks, ${texts} text`);
    } catch (error) {
      failed = true;
      console.log(`FAIL ${file}: ${(error as Error).message.split('\n')[0]}`);
    }
  }
} finally {
  await renderer.close();
}
process.exit(failed ? 1 : 0);
