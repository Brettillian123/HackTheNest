/**
 * Grades every review attempt against its goal, checks bands and order, then
 * runs the consistency probes. Writes run-output.txt next to this file and
 * the graded (lined-up) views under calibration/out/review/scenes/graded/.
 *
 *   npx tsx calibration/review/scenes/run.ts [--no-probes]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SceneGrader, type PreparedScene, type SceneGradeResult } from '../../../src/scene3d/index';
import { toPng } from '../../../src/scene3d/raster';
import { SETS } from './cases/index';
import { rocketGoal } from './cases/rocket';
import { snowmanGoal } from './cases/snowman';
import { bookshelfGoal } from './cases/bookshelf';
import { sub } from './cases/lib';
import { SETS as _ } from './cases/index';

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, '..', '..', '..');
const OUT = join(ROOT, 'calibration', 'out', 'review', 'scenes', 'graded');
const bands = JSON.parse(readFileSync(join(HERE, 'bands.json'), 'utf8')) as {
  bands: Record<string, { band: [number, number]; why: string }>;
  order: [string, string][];
};

const lines: string[] = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function sheet(rows: (PreparedScene | null)[]): Buffer {
  const w = 192, h = 144, gap = 4, W = 4 * w + 3 * gap, H = rows.length * (h + gap);
  const px = new Uint8Array(W * H * 4).fill(255);
  rows.forEach((row, r) =>
    row?.views.forEach((v, c) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          for (let k = 0; k < 4; k++) {
            let s = 0;
            for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += v.pixels[((2 * y + dy) * v.width + 2 * x + dx) * 4 + k];
            px[((r * (h + gap) + y) * W + c * (w + gap) + x) * 4 + k] = s / 4;
          }
    }),
  );
  return toPng({ width: W, height: H, pixels: px });
}

function brief(r: SceneGradeResult): string {
  const p = r.pillars, d = r.details;
  const pl = d.placement ? ` scale ${d.placement.scaleRatio.toFixed(2)} off ${d.placement.offset.toFixed(2)} turn ${Math.round(d.placement.turnDeg)}${d.placement.mirror ? ' MIRROR' : ''} factor ${d.placement.factor.toFixed(2)}` : '';
  const parts = d.parts ? ` parts ${d.parts.present}/${d.parts.goal} miss ${d.parts.missing} extra ${d.parts.extra} credit ${d.parts.credit}` : '';
  const shape = d.shape ? ` shape ${d.shape.match}` : '';
  const eng = d.engineering ? ` eng[tri ${d.engineering.triangles.credit} mesh ${d.engineering.meshes.credit} src ${d.engineering.sourceBytes.credit}]` : '';
  return `total ${f1(r.total)} | works ${f1(p.works)} eng ${f1(p.engineering)} looks ${f1(p.looks)} bonus ${f1(r.bonus)} |${shape}${parts}${pl}${eng}`;
}

async function main() {
  const probes = !process.argv.includes('--no-probes');
  const grader = new SceneGrader();
  const totals: Record<string, number> = {};
  let inBand = 0, count = 0;
  const outside: number[] = [];
  const slow: string[] = [];
  try {
    log('# Review run');
    for (const set of SETS) {
      const goal = await grader.prepare(set.goal);
      log(`\n## ${set.id}: goal ${goal.triangleCount} triangles, ${goal.meshCount} meshes, ${goal.sourceBytes} bytes`);
      const self = await grader.grade(goal, set.goal);
      log(`self: ${brief(self.result)}${self.result.total === 100 ? '  (exactly 100: ok)' : '  NOT 100'}`);
      const graded: (PreparedScene | null)[] = [goal];
      for (const a of set.attempts) {
        const key = `${set.id}/${a.id}`;
        const t0 = performance.now();
        const { result, candidate } = await grader.grade(goal, a.code);
        const ms = performance.now() - t0;
        const again = await grader.grade(goal, a.code);
        graded.push(candidate);
        if (candidate) {
          const dir = join(OUT, set.id, a.id);
          mkdirSync(dir, { recursive: true });
          for (const v of candidate.views) writeFileSync(join(dir, `${v.name}.png`), v.png);
        }
        totals[key] = result.total;
        const b = bands.bands[key];
        let verdict = 'no band';
        if (b) {
          count++;
          const [lo, hi] = b.band;
          if (result.total < lo) { verdict = `HARSH by ${f1(lo - result.total)}`; outside.push(lo - result.total); }
          else if (result.total > hi) { verdict = `LENIENT by ${f1(result.total - hi)}`; outside.push(result.total - hi); }
          else { verdict = 'ok'; inBand++; }
        }
        if (ms > 5000) slow.push(`${key} ${Math.round(ms)} ms`);
        const same = again.result.total === result.total && JSON.stringify(again.result.feedback) === JSON.stringify(result.feedback);
        log(`\n${key}  band ${b ? b.band.join('-') : '?'}  ${verdict}  ${Math.round(ms)} ms${same ? '' : `  NOT REPEATABLE (second run ${again.result.total})`}`);
        log(`  ${a.note}`);
        log(`  ${brief(result)}`);
        if (result.error) log(`  ERROR: ${result.error}`);
        for (const fb of result.feedback) log(`  - ${fb}`);
      }
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `sheet-${set.id}.png`), sheet(graded));
    }

    log('\n## Order checks');
    let held = 0;
    for (const [hi, lo] of bands.order) {
      const ok = totals[hi] > totals[lo];
      if (ok) held++;
      log(`${ok ? 'held  ' : 'BROKEN'} ${hi} ${f1(totals[hi])} > ${lo} ${f1(totals[lo])}`);
    }
    const mean = outside.length ? outside.reduce((s, v) => s + v, 0) / outside.length : 0;
    log(`\n## Summary\nin band ${inBand}/${count}; outside: ${outside.length}, mean distance ${f1(mean)}, worst ${f1(Math.max(0, ...outside))}; order ${held}/${bands.order.length}`);
    log(`grades over 5 s: ${slow.length ? slow.join('; ') : 'none'}`);

    if (probes) {
      const run = async (label: string, goal: PreparedScene, code: string) => {
        const t0 = performance.now();
        const { result } = await grader.grade(goal, code);
        const ms = performance.now() - t0;
        if (ms > 5000) log(`  (over 5 s: ${Math.round(ms)} ms)`);
        log(`${label.padEnd(26)} ${brief(result)}`);
        log(`${''.padEnd(26)} feedback: ${result.feedback.join(' | ')}`);
        return result;
      };
      const tail = (code: string, ret: string, extra: string) => sub(code, [ret, extra + '\n  ' + ret]);
      const snow = await grader.prepare(snowmanGoal);
      const shelf = await grader.prepare(bookshelfGoal);
      const rocket = await grader.prepare(rocketGoal);

      log('\n## Probe: remove parts (snowman)');
      for (const names of [['armR'], ['armR', 'nose'], ['armR', 'nose', 'crown']])
        await run(`snowman -${names.join(',')}`, snow, tail(snowmanGoal, 'return snowman;', names.map((n) => `snowman.remove(snowman.getObjectByName('${n}'));`).join(' ')));
      log('\n## Probe: remove parts (bookshelf books)');
      for (const names of [['book8'], ['book8', 'book7'], ['book8', 'book7', 'book6']])
        await run(`bookshelf -${names.join(',')}`, shelf, tail(bookshelfGoal, 'return shelf;', names.map((n) => `shelf.remove(shelf.getObjectByName('${n}'));`).join(' ')));

      log('\n## Probe: move the hat sideways (snowman height 2.67)');
      for (const d of [0.05, 0.1, 0.2, 0.4, 0.6, 0.9])
        await run(`hat +x ${d}`, snow, tail(snowmanGoal, 'return snowman;', `for (const n of ['brim', 'crown']) snowman.getObjectByName(n).position.x += ${d};`));
      log('\n## Probe: move the nose cone up (rocket height 3.0)');
      for (const d of [0.05, 0.1, 0.2, 0.4, 0.6])
        await run(`nose +y ${d}`, rocket, tail(rocketGoal, 'return rocket;', `rocket.getObjectByName('nose').position.y += ${d};`));

      log('\n## Probe: scale the head (snowman)');
      for (const s of [0.5, 0.7, 0.85, 1.15, 1.4, 2])
        await run(`head x${s}`, snow, tail(snowmanGoal, 'return snowman;', `snowman.getObjectByName('head').scale.setScalar(${s});`));

      log('\n## Probe: triangle count (rocket, segments multiplied)');
      for (const k of [1, 2, 4, 8, 16, 32, 64]) {
        const code = sub(rocketGoal, [', 32)', `, ${32 * k})`], [', 24)', `, ${24 * k})`], ['BoxGeometry(0.3, 0.6, 0.04)', `BoxGeometry(0.3, 0.6, 0.04, 1, ${k}, 1)`]);
        await run(`segments x${k}`, rocket, code);
      }

      for (const [name, goal, code, ret] of [['rocket', rocket, rocketGoal, 'return rocket;'], ['snowman', snow, snowmanGoal, 'return snowman;']] as const) {
        log(`\n## Probe: turn the ${name} about the up axis`);
        for (let deg = 0; deg <= 180; deg += 15)
          await run(`${name} turn ${deg}`, goal, tail(code, ret, `${ret.slice(7, -1)}.rotation.y = ${deg} * Math.PI / 180;`));
      }
    }
  } finally {
    await grader.close();
  }
  writeFileSync(join(HERE, 'run-output.txt'), lines.join('\n') + '\n');
}

void _;
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
