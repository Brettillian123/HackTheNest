/**
 * 3D audit runner.
 *   npx tsx calibration/audit/run-scenes.mts shots   saves the four views of every goal and attempt, no grading
 *   npx tsx calibration/audit/run-scenes.mts grade   grades everything twice against calibration/audit/scenes.json
 * Optional third argument: only sets whose name contains it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SceneGrader, type PreparedScene } from '../../src/scene3d/index';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CAL = join(ROOT, 'calibration');
const OUT = join(CAL, 'out', 'audit', 'scenes');
const mode = process.argv[2] ?? 'shots';
const only = process.argv[3] ?? '';

interface Item { name: string; code: string; comment: string }
interface Set { name: string; goal: string; items: Item[] }

function read(file: string): Item {
  const code = readFileSync(file, 'utf8');
  return { name: file.replace(/^.*[\\/]/, '').replace(/\.js$/, ''), code, comment: /^\/\/\s*(.*)$/m.exec(code)?.[1] ?? '' };
}

function sets(): Set[] {
  const list: Set[] = [];
  for (const s of ['lamp', 'car', 'house']) {
    const dir = join(CAL, 'scenes', s);
    const files = readdirSync(join(dir, 'attempts')).filter((f) => f.endsWith('.js')).sort();
    list.push({ name: s, goal: readFileSync(join(dir, 'goal.js'), 'utf8'), items: files.map((f) => read(join(dir, 'attempts', f))) });
  }
  const edge = join(CAL, 'edge', 'scenes');
  for (const c of readdirSync(edge).sort()) {
    const dir = join(edge, c);
    const files = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'goal.js').sort();
    list.push({ name: c, goal: readFileSync(join(dir, 'goal.js'), 'utf8'), items: files.map((f) => read(join(dir, f))) });
  }
  return list.filter((s) => s.name.includes(only));
}

function save(set: string, who: string, scene: PreparedScene | null) {
  if (!scene) return;
  const dir = join(OUT, set, who);
  mkdirSync(dir, { recursive: true });
  for (const v of scene.views) writeFileSync(join(dir, `${v.name}.png`), v.png);
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function shots(grader: SceneGrader) {
  for (const s of sets()) {
    const goal = await grader.prepare(s.goal);
    save(s.name, 'goal', goal);
    console.log(`${s.name}/goal  ${goal.triangleCount} tris  ${goal.meshCount} meshes  ${goal.sourceBytes} bytes`);
    for (const it of s.items) {
      const t = performance.now();
      try {
        const p = await grader.prepare(it.code);
        save(s.name, it.name, p);
        console.log(`${s.name}/${it.name}  ${p.triangleCount} tris  ${p.meshCount} meshes  ${p.sourceBytes} bytes  ${Math.round(performance.now() - t)} ms`);
      } catch (e) {
        console.log(`${s.name}/${it.name}  REFUSED in ${Math.round(performance.now() - t)} ms: ${msg(e)}`);
      }
    }
  }
}

type Band = { band?: [number, number]; why: string; expect?: string };

async function grade(grader: SceneGrader) {
  const spec = JSON.parse(readFileSync(join(CAL, 'audit', 'scenes.json'), 'utf8')) as Record<string, unknown>;
  const lines: string[] = [];
  const log = (l: string) => {
    console.log(l);
    lines.push(l);
  };
  const totals = new Map<string, number>();
  for (const s of sets()) {
    const goal = await grader.prepare(s.goal);
    const self = await grader.grade(goal, s.goal);
    log(`${s.name}/goal-vs-itself total ${self.result.total}${self.result.total === 100 ? '' : '  NOT 100'}`);
    const bands = (spec[s.name] ?? {}) as Record<string, Band>;
    for (const it of s.items) {
      const b = bands[it.name];
      const t = performance.now();
      const { result, candidate } = await grader.grade(goal, it.code);
      const ms = Math.round(performance.now() - t);
      const again = (await grader.grade(goal, it.code)).result;
      save(s.name, it.name, candidate);
      const r = result;
      totals.set(`${s.name}/${it.name}`, r.total);
      let verdict = 'no band';
      if (b?.band) {
        const [lo, hi] = b.band;
        verdict = r.total < lo ? `HARSH by ${Math.round((lo - r.total) * 10) / 10}` : r.total > hi ? `LENIENT by ${Math.round((r.total - hi) * 10) / 10}` : 'ok';
      }
      const p = r.pillars;
      log(
        `${s.name}/${it.name} | band ${b?.band ? b.band.join('-') : '-'} | total ${r.total} | works ${p.works} eng ${p.engineering} looks ${p.looks} | bonus ${r.bonus} | ${ms} ms | ${verdict}` +
          (again.total !== r.total ? ` | NOT REPEATABLE (${again.total})` : '') +
          (ms > 15000 ? ' | SLOW (>15 s)' : ''),
      );
      if (b?.expect) log(`    expect: ${b.expect}`);
      if (r.error) log(`    error: ${r.error}`);
      for (const f of r.feedback) log(`    - ${f}`);
    }
  }
  const order = (spec.order ?? []) as [string, string][];
  for (const [a, b] of order) {
    const ta = totals.get(a);
    const tb = totals.get(b);
    if (ta === undefined || tb === undefined) continue;
    log(`order ${a} (${ta}) > ${b} (${tb}): ${ta > tb ? 'ok' : 'BROKEN'}`);
  }
  mkdirSync(join(CAL, 'out', 'audit'), { recursive: true });
  writeFileSync(join(CAL, 'out', 'audit', `scenes-grade${only ? '-' + only : ''}.txt`), lines.join('\n') + '\n');
}

const grader = new SceneGrader();
try {
  if (mode === 'grade') {
    if (!existsSync(join(CAL, 'audit', 'scenes.json'))) throw new Error('write scenes.json first');
    await grade(grader);
  } else await shots(grader);
} finally {
  await grader.close();
}
