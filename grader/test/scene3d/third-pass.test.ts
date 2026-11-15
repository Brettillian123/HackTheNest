import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SceneGrader, type PreparedScene, type SceneGradeResult } from '../../src/scene3d/index';
import { denseGrid, sampleTriangles } from '../../src/scene3d/solid';
import { table } from './scenes';

// One test (or more) per decision of the third pass on the 3D grader: parts found
// piece by piece, the in-place fallback that a block cannot fool, works that does
// not collapse, the details choosing the facing, sampling by area, and feedback
// that comes from what was found.

interface SnowmanOptions {
  /** Turn of the whole snowman about the up axis, degrees. */
  turnDeg?: number;
  /** Both arms raised nearly straight up instead of out. */
  armsUp?: boolean;
  /** Length factor of both arms. */
  armLength?: number;
  /** Leaves out the left eye. */
  noEyeL?: boolean;
  /** Raises the head and everything on it. */
  headUp?: number;
  /** Segments of the balls. */
  segments?: number;
}

function snowman(o: SnowmanOptions = {}): string {
  const up = o.headUp ?? 0;
  const seg = o.segments ?? 24;
  const len = 0.6 * (o.armLength ?? 1);
  // An arm starts at the shoulder and points along (cos a, sin a); its centre is half its length out.
  const a = o.armsUp ? 1.35 : 0.3;
  return `function buildScene(THREE) {
  const s = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff8c1a });
  const brown = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
  const ball = (name, r, y) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, ${seg}, ${Math.round(seg * 0.66)}), white); m.name = name; m.position.y = y; s.add(m); };
  ball('base', 0.5, 0.5);
  ball('middle', 0.36, 1.18);
  ball('head', 0.26, ${1.7 + up});
  for (const [name, x] of [['eyeL', -0.09], ['eyeR', 0.09]]) {
    if (name === 'eyeL' && ${!!o.noEyeL}) continue;
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), black);
    e.name = name; e.position.set(x, ${1.78 + up}, 0.22); s.add(e);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 12), orange);
  nose.name = 'nose'; nose.rotation.x = Math.PI / 2; nose.position.set(0, ${1.7 + up}, 0.35); s.add(nose);
  for (const [name, y] of [['button1', 1.3], ['button2', 1.12]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), black);
    b.name = name; b.position.set(0, y, Math.sqrt(0.36 * 0.36 - (y - 1.18) * (y - 1.18))); s.add(b);
  }
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, ${len}, 8), brown);
    arm.name = side < 0 ? 'armL' : 'armR';
    arm.rotation.z = -side * (Math.PI / 2 - ${a});
    arm.position.set(side * (0.32 + ${len / 2} * Math.cos(${a})), 1.22 + ${len / 2} * Math.sin(${a}), 0);
    s.add(arm);
  }
  s.rotation.y = ${((o.turnDeg ?? 0) * Math.PI) / 180};
  return s;
}`;
}

/** One box the size of the default table's bounding box. */
const TABLE_BLOCK = `function buildScene(THREE) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.79, 0.8), new THREE.MeshStandardMaterial({ color: 0x996633 }));
  m.position.y = 0.395;
  return m;
}`;

/** A tall thin cylinder, `k` times the goal's segments around and along. */
const tower = (k: number) => `function buildScene(THREE) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2, ${8 * k}, ${k}), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  m.position.y = 1;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, ${8 * k}), new THREE.MeshStandardMaterial({ color: 0xcc2222 }));
  cap.position.y = 2.25;
  const g = new THREE.Group(); g.add(m, cap);
  return g;
}`;

let grader: SceneGrader;
let snowGoal: PreparedScene;
let tableGoal: PreparedScene;
let towerGoal: PreparedScene;

beforeAll(async () => {
  grader = new SceneGrader({ timeoutMs: 4000 });
  snowGoal = await grader.prepare(snowman());
  tableGoal = await grader.prepare(table());
  towerGoal = await grader.prepare(tower(1));
});
afterAll(async () => {
  await grader?.close();
});

const grade = async (goal: PreparedScene, code: string): Promise<SceneGradeResult> => (await grader.grade(goal, code)).result;
const text = (r: SceneGradeResult) => r.feedback.join(' ');

describe('3D third pass, decision 1: parts are found piece by piece', () => {
  it('calls raised arms "at a different angle", not missing, and charges them a little', async () => {
    const r = await grade(snowGoal, snowman({ armsUp: true }));
    expect(r.details.parts!.missing).toBe(0);
    expect(text(r)).toMatch(/arm is at a different angle/);
    expect(text(r)).not.toMatch(/missing/);
    expect(r.total).toBeGreaterThan(75);
    expect(r.total).toBeLessThan(99);
  }, 60_000);

  it('keeps the eyes and nose found when the head they sit on is moved up', async () => {
    const r = await grade(snowGoal, snowman({ headUp: 0.25 }));
    expect(r.details.parts!.missing).toBe(0);
    expect(text(r)).toMatch(/head sits too high/);
    expect(text(r)).not.toMatch(/eye|nose|missing/);
  }, 60_000);
});

describe('3D third pass, decision 2: a part with no piece is judged in place, and a block cannot fool it', () => {
  it('does not count the legs of a table as present in one block the size of the table', async () => {
    const r = await grade(tableGoal, TABLE_BLOCK);
    expect(r.details.parts!.present).toBeLessThanOrEqual(1);
    expect(r.total).toBeLessThan(40);
  }, 60_000);
});

describe('3D third pass, decision 3: works does not collapse', () => {
  it('lands a table with the right parts and clumsy proportions in the middle of the scale', async () => {
    const clumsy = table()
      .replace('BoxGeometry(1.2, 0.08, 0.8)', 'BoxGeometry(1.05, 0.14, 0.9)')
      .replace('CylinderGeometry(0.04, 0.04, 0.71', 'CylinderGeometry(0.07, 0.07, 0.62')
      .replace('leg.position.set(x, 0.355, z)', 'leg.position.set(x * 0.9, 0.31, z)')
      .replace('top.position.set(0, 0.75, 0)', 'top.position.set(0, 0.69, 0)');
    const r = await grade(tableGoal, clumsy);
    expect(r.details.parts!.missing).toBe(0);
    expect(r.total).toBeGreaterThan(45);
    expect(r.total).toBeLessThan(80);
  }, 60_000);

  it('falls by similar steps as the legs are removed one at a time', async () => {
    const totals: number[] = [100];
    for (const legs of [3, 2, 1]) totals.push((await grade(tableGoal, table({ legs }))).total);
    const steps = totals.slice(1).map((t, i) => totals[i] - t);
    for (const s of steps) expect(s, totals.join(' > ')).toBeGreaterThan(0);
    expect(Math.max(...steps) / Math.min(...steps), totals.join(' > ')).toBeLessThan(2.5);
  }, 60_000);
});

describe('3D third pass, decision 4: the details decide which way the model faces', () => {
  it('reports no part missing for a correct snowman facing backwards', async () => {
    const r = await grade(snowGoal, snowman({ turnDeg: 180 }));
    expect(r.details.parts!.missing).toBe(0);
    expect(text(r)).not.toMatch(/missing/);
    expect(text(r)).toMatch(/turned about 180 degrees/);
  }, 60_000);

  it('changes smoothly as the snowman is turned in 15-degree steps', async () => {
    const totals: number[] = [];
    for (let deg = 0; deg <= 180; deg += 15) totals.push((await grade(snowGoal, snowman({ turnDeg: deg }))).total);
    for (let i = 1; i < totals.length; i++) expect(Math.abs(totals[i] - totals[i - 1]), totals.join(' ')).toBeLessThan(6);
  }, 120_000);
});

describe('3D third pass, decision 5: sampling by area', () => {
  it('samples every triangle of a long thin sliver, even when the budget is tight', () => {
    const grid = denseGrid({ min: [0, 0, 0], max: [10, 10, 10] }, 50);
    // Many slivers 10 units long and almost no width, then one small triangle far away.
    const tris: number[] = [];
    for (let i = 0; i < 200; i++) tris.push(0, 0, i * 0.001, 10, 0.001, i * 0.001, 10, 0, i * 0.001);
    tris.push(5, 9, 9, 5.1, 9, 9, 5, 9.1, 9);
    const cells = new Set<number>();
    sampleTriangles(new Float32Array(tris), grid, { left: 2000 }, (c) => cells.add(c));
    const [, ny, nz] = grid.dims;
    const at = (x: number, y: number, z: number) => {
      const i = Math.floor((x - grid.origin[0]) / grid.size), j = Math.floor((y - grid.origin[1]) / grid.size), k = Math.floor((z - grid.origin[2]) / grid.size);
      return (i * ny + j) * nz + k;
    };
    expect(cells.has(at(5, 9, 9))).toBe(true);
    // The sliver is sampled along its whole length (every unit of it, give or take a cell).
    for (let x = 0.5; x < 10; x += 1) {
      const near = [-1, 0, 1].some((d) => cells.has(at(x + d * grid.size, 0, 0)));
      expect(near, `x ${x}`).toBe(true);
    }
  });

  it('scores a tall model at 16 times the segments no lower in works than at 8 times, with nothing missing', async () => {
    const r8 = await grade(towerGoal, tower(8));
    const r16 = await grade(towerGoal, tower(16));
    expect(r16.details.parts!.missing).toBe(0);
    expect(r16.pillars.works).toBeGreaterThanOrEqual(r8.pillars.works - 0.5);
    expect(r16.pillars.works).toBeGreaterThan(95);
  }, 60_000);
});

describe('3D third pass, decision 6: feedback from what was found', () => {
  it('names the missing eye', async () => {
    const r = await grade(snowGoal, snowman({ noEyeL: true }));
    expect(text(r)).toMatch(/The left eye is missing/);
  }, 60_000);

  it('gives a measured size for short arms, not a stock number', async () => {
    const r = await grade(snowGoal, snowman({ armLength: 0.6 }));
    expect(r.details.parts!.missing).toBe(0);
    expect(text(r)).toMatch(/arm is about (3[5-9]|4[0-5])% too short/);
  }, 60_000);

  it('never calls a box model coarse or a symmetric block a mirror image', async () => {
    const r = await grade(tableGoal, TABLE_BLOCK);
    expect(text(r)).not.toMatch(/coarse|faceted|mirror image/);
  }, 60_000);
});
