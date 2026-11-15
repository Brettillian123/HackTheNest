import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SceneGrader, type PreparedScene, type SceneGradeResult } from '../../src/scene3d/index';
import { chair, CUBE, house } from './scenes';

// One test per change of the second pass on the 3D grader: displaced parts,
// missing parts cost more, the turn charge, the engineering floor, colour per
// part, coarse curves, and feedback that names what is wrong.

let grader: SceneGrader;
let chairGoal: PreparedScene;
let houseGoal: PreparedScene;
let cubeGoal: PreparedScene;
let cylGoal: PreparedScene;

const cylinder = (segments: number) => `function buildScene(THREE) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, ${segments}), new THREE.MeshStandardMaterial({ color: 0x3366cc }));
  m.position.y = 0.5;
  return m;
}`;

beforeAll(async () => {
  grader = new SceneGrader({ timeoutMs: 4000 });
  chairGoal = await grader.prepare(chair());
  houseGoal = await grader.prepare(house());
  cubeGoal = await grader.prepare(CUBE);
  cylGoal = await grader.prepare(cylinder(32));
});
afterAll(async () => {
  await grader?.close();
});

const grade = async (goal: PreparedScene, code: string): Promise<SceneGradeResult> => (await grader.grade(goal, code)).result;
const text = (r: SceneGradeResult) => r.feedback.join(' ');

describe('3D second pass: a part moved or the wrong size is not missing', () => {
  it('finds a moved leg, says where it sits, and charges more the further it moved', async () => {
    const near = await grade(chairGoal, chair({ legShift: 0.15 }));
    const far = await grade(chairGoal, chair({ legShift: 0.3 }));
    const gone = await grade(chairGoal, chair({ noLeg: true }));
    expect(near.details.parts!.missing).toBe(0);
    expect(text(near)).toMatch(/sits too far (left|right)/);
    expect(text(near)).not.toMatch(/missing|extra part/);
    expect(far.total).toBeLessThanOrEqual(near.total);
    expect(near.total).toBeGreaterThan(gone.total);
  });

  it('keeps every part of a house with over-tall walls present, with one part line and nothing extra', async () => {
    const tall = house().replace('BoxGeometry(2.4, 1.6, 2)', 'BoxGeometry(2.4, 2.0, 2)').replace('walls.position.y = 0.8', 'walls.position.y = 1.0').replace('roof.position.y = 2.05', 'roof.position.y = 2.45');
    const r = await grade(houseGoal, tall);
    expect(r.details.parts!.missing).toBe(0);
    expect(text(r)).toMatch(/too tall|sits too/);
    expect(text(r)).not.toMatch(/extra part|missing/);
  });
});

describe('3D second pass: missing parts cost more', () => {
  it('squares the parts share (third pass: was the cube)', async () => {
    const gone = await grade(chairGoal, chair({ noLeg: true }));
    expect(gone.details.parts!.missing).toBe(1);
    expect(gone.details.parts!.credit).toBeLessThan(78);
  });
});

describe('3D second pass: facing the wrong way', () => {
  it('charges 20% at 180 degrees and in proportion below', async () => {
    const back = await grade(chairGoal, chair({ turnDeg: 180 }));
    const side = await grade(chairGoal, chair({ turnDeg: 90 }));
    expect(back.details.placement!.factor).toBeCloseTo(0.8, 2);
    expect(side.details.placement!.factor).toBeCloseTo(0.9, 1);
    expect(text(back)).toMatch(/turned about 180 degrees from the goal's facing: 20 points/);
  });
});

describe('3D second pass: engineering floor', () => {
  it('keeps an exact but hugely heavy model near 47, not below plainly wrong ones', async () => {
    const heavy = cubeHeavy();
    const r = await grade(cubeGoal, heavy);
    expect(r.pillars.engineering).toBe(-50);
    expect(r.total).toBeGreaterThan(45);
    expect(r.total).toBeLessThan(50);
  });
});

function cubeHeavy() {
  return CUBE.replace('BoxGeometry(1, 1, 1)', 'BoxGeometry(1, 1, 1, 60, 60, 60)');
}

describe('3D second pass: colour judged per part', () => {
  it('drops looks to about a third when every colour is wrong, and barely for one part a shade off', async () => {
    const all = await grade(houseGoal, house({ recolour: true }));
    const shade = await grade(houseGoal, house().replace('0x8e2c1d', '0x9a3626'));
    expect(all.pillars.looks).toBeGreaterThan(20);
    expect(all.pillars.looks).toBeLessThan(50);
    expect(text(all)).toMatch(/colours are different throughout/);
    expect(shade.pillars.looks).toBeGreaterThanOrEqual(90);
    expect(text(shade)).not.toMatch(/throughout/);
  });
});

describe('3D second pass: coarse curves', () => {
  it('sees the facets of a six-sided cylinder in the looks, and says so', async () => {
    const coarse = await grade(cylGoal, cylinder(6));
    const fine = await grade(cylGoal, cylinder(48));
    expect(coarse.pillars.looks).toBeLessThan(85);
    expect(fine.pillars.looks).toBeGreaterThanOrEqual(97);
    expect(text(coarse)).toMatch(/faceted|coarse/);
  });
});

describe('3D second pass: feedback names the fault once', () => {
  it('says the door is missing without a second shape line or a view name', async () => {
    const r = await grade(houseGoal, house({ door: false }));
    expect(text(r)).toMatch(/missing/);
    expect(text(r)).not.toMatch(/shape differs/);
    expect(text(r)).not.toMatch(/most in the (top|front|three-quarter)/);
  });
});
