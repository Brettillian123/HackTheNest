import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SceneGrader, SCENE_LIMITS, type PreparedScene, type SceneData } from '../../src/scene3d/index';
import { EMPTY, MERGED_TABLE, table, UNRELATED } from './scenes';

let grader: SceneGrader;
let goal: PreparedScene;
const GOAL = table();

beforeAll(async () => {
  grader = new SceneGrader({ timeoutMs: 4000 });
  goal = await grader.prepare(GOAL);
});
afterAll(async () => {
  await grader?.close();
});

const grade = async (code: string) => (await grader.grade(goal, code)).result;

describe('3D grader: scoring', () => {
  it('scores a scene against itself as exactly 100, with no bonus', async () => {
    const r = await grade(GOAL);
    expect(r.total).toBe(100);
    expect(r.pillars).toEqual({ works: 100, engineering: 100, looks: 100 });
    expect(r.bonus).toBe(0);
    expect(r.exactMatch).toBe(true);
    expect(r.error).toBeUndefined();
    expect(goal.views.map((v) => v.name)).toEqual(['three-quarter-front', 'front', 'top', 'three-quarter-back']);
  });

  it('gives exactly the same score with or without heavy comments and blank lines', async () => {
    const commented =
      `// A table: a top on four legs.\n/*\n * Every part is commented at length, which is good practice\n * and must not cost anything.\n */\n\n\n` +
      GOAL.replace(/\n/g, '\n\n    // explaining this line in detail, with a "quoted // thing" and a URL http://example.test\n') +
      '\n// The end.\n';
    const plain = await grade(GOAL);
    const chatty = await grade(commented);
    expect(chatty).toEqual(plain);
    expect(chatty.total).toBe(100);
  });

  it('gives the same result every run and from a fresh grader', async () => {
    const code = table({ scale: 1.1, topColor: '0x3366aa' });
    const a = await grade(code);
    const b = await grade(code);
    const fresh = new SceneGrader();
    try {
      const c = (await fresh.grade(GOAL, code)).result;
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    } finally {
      await fresh.close();
    }
  });

  it('scores the same shape, divided into meshes differently, at least 99', async () => {
    const r = await grade(table({ splitTop: true, groupLegs: true }));
    expect(r.pillars.works).toBe(100);
    expect(r.total).toBeGreaterThanOrEqual(99);
  });

  it('charges a wrong colour to looks only', async () => {
    const r = await grade(table({ topColor: '0x2255cc' }));
    expect(r.pillars.works).toBe(100);
    expect(r.pillars.looks).toBeLessThan(95);
    expect(r.total).toBeLessThan(100);
    expect(r.feedback[0]).toMatch(/Colours differ/);
  });

  it('never rises as a scene is scaled, shifted or loses parts, further and further', async () => {
    const sweeps: Record<string, string[]> = {
      scale: [1.05, 1.15, 1.3, 1.6, 2.2].map((scale) => table({ scale })),
      shrink: [0.95, 0.85, 0.7, 0.5].map((scale) => table({ scale })),
      shift: [0.03, 0.1, 0.25, 0.5, 1].map((shiftX) => table({ shiftX })),
      legs: [3, 2, 1, 0].map((legs) => table({ legs })),
    };
    for (const [name, codes] of Object.entries(sweeps)) {
      const totals: number[] = [];
      for (const code of codes) totals.push((await grade(code)).total);
      for (let i = 1; i < totals.length; i++) expect(totals[i], `${name}: ${totals.join(' > ')}`).toBeLessThanOrEqual(totals[i - 1]);
      expect(totals[totals.length - 1], name).toBeLessThan(totals[0]);
      expect(totals[0], name).toBeLessThan(100.05);
    }
    const big = await grade(table({ scale: 1.4 }));
    expect(big.feedback[0]).toMatch(/about 40% bigger than the goal: \d+ points/);
    const leg = await grade(table({ legs: 3 }));
    // The fourth leg stands at +x, +z.
    expect(leg.feedback[0]).toMatch(/A part is missing near the front right \(1 of the goal's 5 parts\)/);
  });

  it('lines a scaled or shifted correct model up first: works and looks stay at 99+, placement costs a little', async () => {
    for (const code of [table({ scale: 1.3 }), table({ scale: 0.7 }), table({ shiftX: 0.4 })]) {
      const r = await grade(code);
      expect(r.pillars.works).toBeGreaterThanOrEqual(99);
      expect(r.pillars.looks).toBeGreaterThanOrEqual(99);
      expect(r.details.placement!.factor).toBeLessThan(1);
      expect(r.details.placement!.factor).toBeGreaterThanOrEqual(0.7);
      expect(r.total).toBeLessThan(97);
      expect(r.total).toBeGreaterThan(70);
    }
  });

  it('charges stretching as a shape error, more than uniform scaling', async () => {
    const stretched = await grade(table({ stretchY: 1.3 }));
    const scaled = await grade(table({ scale: 1.3 }));
    expect(stretched.pillars.works).toBeLessThan(90);
    expect(stretched.total).toBeLessThan(scaled.total - 5);
  });

  it('counts parts the same whether the model is one merged geometry or one mesh per part', async () => {
    const merged = await grade(MERGED_TABLE);
    const separate = await grade(GOAL);
    expect(merged.details.parts).toEqual(separate.details.parts);
    expect(merged.details.parts).toEqual({ goal: 5, present: 5, missing: 0, extra: 0, credit: 100 });
    expect(merged.pillars.works).toBeGreaterThanOrEqual(99);
  });

  it('lowers the total with every part removed, by more than the part\'s share of the surface', async () => {
    const area = (s: SceneData) => {
      let sum = 0;
      for (const m of s.meshes) {
        const p = m.positions;
        for (let t = 0; t < p.length; t += 9) {
          const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
          const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
          sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
        }
      }
      return sum;
    };
    const legShare = (area(await grader.build(table({ legs: 1 }))) - area(await grader.build(table({ legs: 0 })))) / area(await grader.build(GOAL));
    let previous = 100;
    for (const legs of [3, 2, 1, 0]) {
      const r = await grade(table({ legs }));
      expect(previous - r.total, `${legs} legs`).toBeGreaterThan(100 * legShare);
      previous = r.total;
    }
  });

  it('sets engineering by the worst of the three measures', async () => {
    for (const code of [table({ segments: 64 }), table({ splitTop: true }), `${GOAL}\n// ${'padding '.repeat(200)}`]) {
      const r = await grade(code);
      const e = r.details.engineering!;
      expect(r.pillars.engineering).toBe(Math.min(e.triangles.credit, e.meshes.credit, e.sourceBytes.credit));
    }
  });

  it('charges over-tessellation to engineering only', async () => {
    const r = await grade(table({ segments: 96, heightSegments: 12 }));
    expect(r.pillars.works).toBe(100);
    expect(r.pillars.looks).toBeGreaterThanOrEqual(99.5);
    expect(r.pillars.engineering).toBeLessThan(60);
    expect(r.feedback[0]).toMatch(/times as many triangles/);
  });

  it('scores an exact match with fewer triangles above 100', async () => {
    const heavy = await grader.prepare(table({ heightSegments: 6 }));
    const { result } = await grader.grade(heavy, table());
    expect(result.exactMatch).toBe(true);
    expect(result.bonus).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(100);
  });

  it('scores an empty scene and an unrelated object near 0', async () => {
    const empty = await grade(EMPTY);
    expect(empty.total).toBe(0);
    expect(empty.error).toMatch(/no visible meshes/);
    const other = await grade(UNRELATED);
    expect(other.total).toBeLessThan(15);
    expect(other.pillars.works).toBeLessThan(10);
  });
});

describe('3D grader: broken submissions', () => {
  const cases: [string, string, RegExp][] = [
    ['throwing code', 'function buildScene(THREE) { throw new Error("boom"); }', /error: boom/],
    ['a syntax error', 'function buildScene(THREE) { return new THREE.Group( }', /error/],
    ['no return value', 'function buildScene(THREE) { new THREE.Group(); }', /did not return a 3D object/],
    ['no buildScene at all', 'const x = 1;', /does not define a function called buildScene/],
    ['too many triangles', 'function buildScene(THREE) { return new THREE.Mesh(new THREE.SphereGeometry(1, 400, 400)); }', /more than 100,000 triangles/],
    ['source too long', `function buildScene(THREE) { return new THREE.Group(); }\n//${'x'.repeat(SCENE_LIMITS.maxSourceBytes)}`, /limit is 200 KB/],
    ['a scene that contains itself', 'function buildScene(THREE) { const g = new THREE.Group(); const h = new THREE.Group(); g.children.push(h); h.children.push(g); return g; }', /contains itself/],
  ];
  for (const [name, code, reason] of cases) {
    it(`scores ${name} 0 with a reason`, async () => {
      const started = Date.now();
      const { result, candidate } = await grader.grade(goal, code);
      expect(result.total).toBe(0);
      expect(candidate).toBeNull();
      expect(result.error).toMatch(reason);
      expect(result.feedback).toEqual([result.error]);
      expect(Date.now() - started).toBeLessThan(5000);
    });
  }

  it('stops an infinite loop quickly, and the grader still works afterwards', async () => {
    const started = Date.now();
    const r = await grade('function buildScene(THREE) { while (true) {} }');
    expect(r.total).toBe(0);
    expect(r.error).toMatch(/longer than 4 seconds/);
    expect(Date.now() - started).toBeLessThan(12_000);
    expect((await grade(GOAL)).total).toBe(100);
  });

  it('refuses a goal that is unusable', async () => {
    await expect(grader.prepare(EMPTY)).rejects.toThrow(/no visible meshes/);
  });
});

describe('3D grader: determinism inside the scene', () => {
  const RANDOM = `function buildScene(THREE) {
  const g = new THREE.Group();
  const t = Date.now() % 1000 + performance.now() + new Date().getTime() % 7 + crypto.getRandomValues(new Uint8Array(1))[0];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1 + Math.random() * 0.3, 0.1 + (t % 5) * 0.05, 0.2), new THREE.MeshStandardMaterial({ color: Math.floor(Math.random() * 0xffffff) }));
    m.position.set(Math.random() * 1.2 - 0.6, Math.random() * 0.8, Math.random() * 0.8 - 0.4);
    g.add(m);
  }
  return g;
}`;
  it('makes Math.random, Date and performance.now give the same scene every run', async () => {
    const a = await grade(RANDOM);
    await new Promise((r) => setTimeout(r, 50));
    const b = await grade(RANDOM);
    expect(b).toEqual(a);
    const sceneA = await grader.build(RANDOM);
    const fresh = new SceneGrader();
    try {
      const sceneB = await fresh.build(RANDOM);
      expect(sceneB.meshes.map((m) => [m.color, Array.from(m.positions)])).toEqual(sceneA.meshes.map((m) => [m.color, Array.from(m.positions)]));
    } finally {
      await fresh.close();
    }
  });
});
