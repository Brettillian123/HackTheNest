/**
 * Draws every goal and attempt on its own (prepare, no grading) and writes
 * the four views as PNGs plus one contact sheet per goal (rows: goal, then
 * attempts in order; columns: 3/4 front, front, top, 3/4 back, half size).
 *
 *   npx tsx calibration/review/scenes/views.ts [goalId]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SceneGrader } from '../../../src/scene3d/index';
import { toPng } from '../../../src/scene3d/raster';
import { SETS } from './cases/index';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const OUT = join(ROOT, 'calibration', 'out', 'review', 'scenes');

async function main() {
  const only = process.argv[2];
  const grader = new SceneGrader();
  try {
    for (const set of SETS) {
      if (only && set.id !== only) continue;
      const rows: { id: string; views: { pixels: Uint8Array; width: number; height: number; name: string; png: Buffer }[] }[] = [];
      for (const item of [{ id: 'goal', code: set.goal }, ...set.attempts]) {
        try {
          const p = await grader.prepare(item.code);
          rows.push({ id: item.id, views: p.views });
          const dir = join(OUT, set.id, item.id);
          mkdirSync(dir, { recursive: true });
          for (const v of p.views) writeFileSync(join(dir, `${v.name}.png`), v.png);
          console.log(`${set.id}/${item.id}: ${p.triangleCount} tris, ${p.meshCount} meshes, ${p.sourceBytes} bytes`);
        } catch (e) {
          console.log(`${set.id}/${item.id}: ERROR ${e instanceof Error ? e.message : e}`);
        }
      }
      const w = 192, h = 144, gap = 4;
      const W = 4 * w + 3 * gap, H = rows.length * (h + gap);
      const sheet = new Uint8Array(W * H * 4).fill(255);
      rows.forEach((row, r) => {
        row.views.forEach((v, c) => {
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++)
              for (let k = 0; k < 4; k++) {
                let s = 0;
                for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += v.pixels[((2 * y + dy) * v.width + 2 * x + dx) * 4 + k];
                sheet[((r * (h + gap) + y) * W + c * (w + gap) + x) * 4 + k] = s / 4;
              }
        });
      });
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `sheet-${set.id}.png`), toPng({ width: W, height: H, pixels: sheet }));
      console.log(`sheet-${set.id}.png rows: ${rows.map((r) => r.id).join(', ')}`);
    }
  } finally {
    await grader.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
