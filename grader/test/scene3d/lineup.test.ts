import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SceneGrader, type PreparedScene, type SceneGradeResult } from '../../src/scene3d/index';
import { chair, CUBE, HOLLOW_CUBE, house, PLANES_CUBE } from './scenes';

// One test per change of the 3D audit fixes: line-up, placement charge, soft
// edge, solids, parts, what three.js draws, looks, engineering slack, messages.

let grader: SceneGrader;
let chairGoal: PreparedScene;
let houseGoal: PreparedScene;
let cubeGoal: PreparedScene;

beforeAll(async () => {
  grader = new SceneGrader({ timeoutMs: 4000 });
  chairGoal = await grader.prepare(chair());
  houseGoal = await grader.prepare(house());
  cubeGoal = await grader.prepare(CUBE);
});
afterAll(async () => {
  await grader?.close();
});

const grade = async (goal: PreparedScene, code: string): Promise<SceneGradeResult> => (await grader.grade(goal, code)).result;

describe('3D grader: line-up (turn, mirror, scale, shift)', () => {
  it('scores a chair turned 15 degrees above the same chair turned 90, both with the shape intact', async () => {
    const t15 = await grade(chairGoal, chair({ turnDeg: 15 }));
    const t90 = await grade(chairGoal, chair({ turnDeg: 90 }));
    expect(t15.pillars.works).toBeGreaterThanOrEqual(97);
    expect(t90.pillars.works).toBeGreaterThanOrEqual(97);
    expect(t15.total).toBeGreaterThan(t90.total);
    expect(t15.total).toBeGreaterThanOrEqual(90);
    expect(t90.feedback.join(' ')).toMatch(/turned about 90 degrees/);
  });

  it('lines up a mirror image and charges it a flat 10%', async () => {
    const r = await grade(chairGoal, chair({ mirror: true }));
    expect(r.pillars.works).toBeGreaterThanOrEqual(97);
    expect(r.details.placement!.mirror).toBe(true);
    expect(r.details.placement!.factor).toBeCloseTo(0.9, 2);
    expect(r.feedback.join(' ')).toMatch(/mirror image of the goal/);
  });
});

describe('3D grader: placement charge', () => {
  it('charges 100 times bigger on the same floor spot for size only, in words a person uses', async () => {
    const r = await grade(chairGoal, chair({ scale: 100 }));
    expect(r.details.placement!.offset).toBeLessThan(0.03);
    expect(r.details.placement!.factor).toBeCloseTo(0.9, 2);
    expect(r.feedback[0]).toMatch(/about 100 times bigger than the goal/);
    expect(r.feedback.join(' ')).not.toMatch(/\d{4}%/);
  });
});

describe('3D grader: soft edge', () => {
  it('keeps a local error local: a leg a little off costs far less than a missing leg', async () => {
    const off = await grade(chairGoal, chair({ legShift: 0.04 }));
    const gone = await grade(chairGoal, chair({ noLeg: true }));
    const further = await grade(chairGoal, chair({ legShift: 0.12 }));
    expect(off.pillars.works).toBeGreaterThan(90);
    expect(off.total).toBeGreaterThan(gone.total + 5);
    expect(further.total).toBeLessThanOrEqual(off.total);
  });
});

describe('3D grader: solids, not surfaces', () => {
  it('scores a hollow box, six planes and a solid box the same on shape and parts', async () => {
    for (const code of [HOLLOW_CUBE, PLANES_CUBE]) {
      const r = await grade(cubeGoal, code);
      expect(r.pillars.works).toBe(100);
      expect(r.details.parts!.credit).toBe(100);
      expect(r.feedback.join(' ')).not.toMatch(/extra material/);
      expect(r.total).toBeGreaterThanOrEqual(84);
    }
  });
});

describe('3D grader: parts are the goal\'s parts', () => {
  it('charges a floor under the chair about one extra part, and says to remove it', async () => {
    const floor = await grade(chairGoal, chair({ floor: true }));
    const gone = await grade(chairGoal, chair({ noLeg: true }));
    expect(floor.details.parts!.extra).toBe(1);
    expect(floor.pillars.works).toBeGreaterThan(60);
    // About one part's worth: within a few points of a missing leg on works.
    expect(Math.abs(floor.pillars.works - gone.pillars.works)).toBeLessThan(20);
    expect(floor.feedback.join(' ')).toMatch(/floor the goal does not have/);
  });

  it('charges a missing flush door, and a recoloured house keeps its door', async () => {
    const noDoor = await grade(houseGoal, house({ door: false }));
    const recoloured = await grade(houseGoal, house({ recolour: true }));
    const recolouredNoDoor = await grade(houseGoal, house({ recolour: true, door: false }));
    expect(noDoor.details.parts!.missing).toBe(1);
    expect(noDoor.pillars.works).toBeLessThan(97);
    expect(recoloured.details.parts!.missing).toBe(0);
    expect(recoloured.pillars.works).toBeGreaterThanOrEqual(99);
    expect(recolouredNoDoor.details.parts!.missing).toBe(1);
    expect(recoloured.feedback.join(' ')).toMatch(/colours are different throughout/);
  });
});

describe('3D grader: what three.js draws', () => {
  it('gives a wireframe model the shape but no looks credit, and says why', async () => {
    const r = await grade(chairGoal, chair({ wireframe: true }));
    expect(r.pillars.works).toBe(100);
    expect(r.pillars.looks).toBe(0);
    expect(r.feedback.join(' ')).toMatch(/wireframe/);
  });

  it('skips materials that draw nothing (colorWrite off, nearly fully transparent)', async () => {
    const hidden = chair().replace('return root;', `
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ colorWrite: false }));
  ghost.position.set(3, 0.5, 0);
  root.add(ghost);
  const faint = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.02 }));
  faint.position.set(-3, 0.5, 0);
  root.add(faint);
  return root;`);
    const r = await grade(chairGoal, hidden);
    expect(r.pillars.works).toBe(100);
    expect(r.details.placement!.factor).toBe(1);
  });
});

describe('3D grader: engineering on small models', () => {
  it('lets a 1-mesh goal be built from 6 pieces at little cost', async () => {
    const r = await grade(cubeGoal, PLANES_CUBE);
    expect(r.details.engineering!.meshes.credit).toBeGreaterThan(80);
  });
});

describe('3D grader: messages', () => {
  it('says buildScene must not be async, and names what came back', async () => {
    const a = await grade(chairGoal, chair({ async: true }));
    expect(a.total).toBe(0);
    expect(a.error).toMatch(/must not be async/);
    const n = await grade(chairGoal, 'function buildScene(THREE) { return 42; }');
    expect(n.error).toMatch(/returned a number/);
  });
});
