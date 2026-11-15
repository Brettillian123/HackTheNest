/**
 * Grades every attempt under calibration/scenes/<set>/attempts against that
 * set's goal.js and writes calibration/out/scene-report.html, one
 * self-contained file with every view embedded. Each view is also saved as
 * a PNG under calibration/out/scenes/.
 *
 *   npx tsx src/scene3d/calibrate.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SceneGrader, type PreparedScene, type SceneGradeResult } from './index';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCENES = join(ROOT, 'calibration', 'scenes');
const OUT = join(ROOT, 'calibration', 'out');
const PNG_DIR = join(OUT, 'scenes');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function savePngs(set: string, who: string, scene: PreparedScene | null): string[] {
  if (!scene) return [];
  const dir = join(PNG_DIR, set, who);
  mkdirSync(dir, { recursive: true });
  return scene.views.map((v) => {
    writeFileSync(join(dir, `${v.name}.png`), v.png);
    // Embedded, so the report is one file that can be sent anywhere; the PNG files are kept as well.
    return `data:image/png;base64,${v.png.toString('base64')}`;
  });
}

interface Row {
  name: string;
  comment: string;
  result: SceneGradeResult;
  pngs: string[];
  ms: number;
}

async function main() {
  const grader = new SceneGrader();
  const sections: string[] = [];
  try {
    for (const set of readdirSync(SCENES)) {
      const dir = join(SCENES, set);
      const goal = await grader.prepare(readFileSync(join(dir, 'goal.js'), 'utf8'));
      const goalPngs = savePngs(set, 'goal', goal);
      const rows: Row[] = [];
      for (const file of readdirSync(join(dir, 'attempts')).filter((f) => f.endsWith('.js')).sort()) {
        const code = readFileSync(join(dir, 'attempts', file), 'utf8');
        const comment = /^\/\/\s*(.*)$/m.exec(code)?.[1] ?? '';
        const started = performance.now();
        const { result, candidate } = await grader.grade(goal, code);
        const ms = performance.now() - started;
        const name = file.replace(/\.js$/, '');
        rows.push({ name, comment, result, pngs: savePngs(set, name, candidate), ms });
        const p = result.pillars;
        console.log(
          `${set}/${name.padEnd(18)} total ${String(result.total).padStart(5)}  works ${String(p.works).padStart(5)}  eng ${String(p.engineering).padStart(6)}  looks ${String(p.looks).padStart(5)}  ${Math.round(ms)} ms  | ${result.feedback[0] ?? ''}`,
        );
      }
      sections.push(section(set, goal, goalPngs, rows));
    }
  } finally {
    await grader.close();
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'scene-report.html'), page(sections.join('\n')));
  console.log(`Wrote ${join(OUT, 'scene-report.html')}`);
}

function images(pngs: string[]): string {
  return pngs.map((src) => `<img src="${src}" width="192" height="144" alt="">`).join('');
}

function section(set: string, goal: PreparedScene, goalPngs: string[], rows: Row[]): string {
  const body = rows
    .map((r) => {
      const p = r.result.pillars;
      return `<tr>
  <td><b>${esc(r.name)}</b><br><small>${esc(r.comment)}</small><br><small>${Math.round(r.ms)} ms</small></td>
  <td class="n">${r.result.total}</td><td class="n">${p.works}</td><td class="n">${p.engineering}</td><td class="n">${p.looks}</td><td class="n">${r.result.bonus}</td>
  <td>${r.pngs.length ? images(r.pngs) : '<i>no views</i>'}</td>
  <td><ul>${r.result.feedback.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></td>
</tr>`;
    })
    .join('\n');
  return `<h2>${esc(set)}</h2>
<p>Goal: ${goal.triangleCount} triangles, ${goal.meshCount} meshes, ${goal.sourceBytes} bytes of code (without comments and spacing).</p>
<div class="goal">${images(goalPngs)}</div>
<table><thead><tr><th>Attempt</th><th>Total</th><th>Works</th><th>Engineering</th><th>Looks</th><th>Bonus</th><th>Views (3/4 front, front, top, 3/4 back)</th><th>Feedback</th></tr></thead>
<tbody>${body}</tbody></table>`;
}

function page(content: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>3D calibration</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px;vertical-align:top}
td.n{text-align:right;font-variant-numeric:tabular-nums}img{margin:1px;border:1px solid #ddd}ul{margin:0;padding-left:18px;max-width:320px}.goal img{width:288px;height:216px}</style>
</head><body><h1>3D grader calibration</h1>${content}</body></html>`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
