import { describe, expect, it } from 'vitest';
import { combineScene, sceneParams, sceneValues, scenesModel, type SceneMeasurements } from '../../src/scene3d/model';
import { measureScene, prepareScene, scoreScene } from '../../src/scene3d/score';
import type { RGB, SceneData, SceneMesh } from '../../src/scene3d/types';

// The 3D combination (model.ts): whatever its constants are inside their bounds,
// a model against itself scores 100, and losing a part, moving a part further
// or adding triangles never raises the total. Checked over corners of the
// bounds on three small models built from boxes (no browser needed).

type Box = { name: string; at: [number, number, number]; size: [number, number, number]; color: RGB };

function boxMesh(b: Box, part: number): SceneMesh {
  const [cx, cy, cz] = b.at;
  const [hx, hy, hz] = b.size.map((s) => s / 2);
  const v = (i: number): [number, number, number] => [cx + (i & 1 ? hx : -hx), cy + (i & 2 ? hy : -hy), cz + (i & 4 ? hz : -hz)];
  const faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const pos: number[] = [];
  for (const [a, b2, c, d] of faces) for (const t of [a, b2, c, a, c, d]) pos.push(...v(t));
  return { name: b.name, color: b.color, opacity: 1, positions: new Float32Array(pos), part };
}

function sceneOf(boxes: Box[], extraTriangles = 0): SceneData {
  const meshes = boxes.map((b, i) => boxMesh(b, i));
  const triangleCount = meshes.reduce((s, m) => s + m.positions.length / 9, 0) + extraTriangles;
  return { meshes, meshCount: meshes.length, triangleCount, sourceBytes: 400 + 60 * boxes.length };
}

const BROWN: RGB = [150, 100, 50], GREY: RGB = [60, 60, 60], WHITE: RGB = [240, 240, 240], RED: RGB = [200, 40, 40];

const MODELS: Record<string, Box[]> = {
  table: [
    { name: 'top', at: [0, 0.75, 0], size: [1.2, 0.08, 0.8], color: BROWN },
    ...[[-0.52, -0.32], [0.52, -0.32], [-0.52, 0.32], [0.52, 0.32]].map(([x, z], i) => ({ name: `leg${i}`, at: [x, 0.355, z] as [number, number, number], size: [0.08, 0.71, 0.08] as [number, number, number], color: GREY })),
  ],
  tower: [
    { name: 'base', at: [0, 0.25, 0], size: [0.8, 0.5, 0.8], color: WHITE },
    { name: 'middle', at: [0, 0.75, 0], size: [0.55, 0.5, 0.55], color: WHITE },
    { name: 'head', at: [0, 1.15, 0], size: [0.35, 0.3, 0.35], color: WHITE },
    { name: 'nose', at: [0, 1.15, 0.25], size: [0.06, 0.06, 0.15], color: RED },
  ],
  bench: [
    { name: 'seat', at: [0, 0.45, 0], size: [1.6, 0.08, 0.4], color: BROWN },
    { name: 'leftSide', at: [-0.7, 0.2, 0], size: [0.08, 0.42, 0.4], color: GREY },
    { name: 'rightSide', at: [0.7, 0.2, 0], size: [0.08, 0.42, 0.4], color: GREY },
  ],
};

/** Corners of the bounds: all low, all high, each free constant alone at either end, and 24 mixed corners (fixed seed). */
function corners(): Record<string, number>[] {
  const params = sceneParams();
  const now = sceneValues();
  const free = Object.keys(params).filter((k) => !params[k].fixed && params[k].max > params[k].min);
  const out: Record<string, number>[] = [now];
  const at = (pick: (k: string, i: number) => 'min' | 'max' | null) => {
    const v = { ...now };
    free.forEach((k, i) => {
      const p = pick(k, i);
      if (p) v[k] = params[k][p];
    });
    return v;
  };
  out.push(at(() => 'min'), at(() => 'max'));
  for (const k of free) out.push(at((x) => (x === k ? 'min' : null)), at((x) => (x === k ? 'max' : null)));
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let n = 0; n < 24; n++) out.push(at(() => (rnd() < 0.5 ? 'min' : 'max')));
  return out;
}

const CORNERS = corners();
const clone = (m: SceneMeasurements): SceneMeasurements => JSON.parse(JSON.stringify(m));
const r1 = (x: number) => Math.round(x * 10) / 10;

describe('3D combination: properties over the corners of its bounds', () => {
  for (const [name, boxes] of Object.entries(MODELS)) {
    describe(name, () => {
      const goal = prepareScene(sceneOf(boxes));
      const self = measureScene(goal, goal.scene);
      // An imperfect build: every part 20% wider and the whole a little to the right, same colours.
      const off = sceneOf(boxes.map((b) => ({ ...b, at: [b.at[0] * 1.1 + 0.05, b.at[1], b.at[2]] as [number, number, number], size: [b.size[0] * 1.2, b.size[1], b.size[2]] as [number, number, number] })));
      const imperfect = measureScene(goal, off);

      it('the grader total is the combination at the constants in use', () => {
        const res = scoreScene(goal, off).result;
        expect(r1(scenesModel.score(res.measurements!, sceneValues()))).toBe(res.total);
        expect(res.criteria!.map((c) => c.id)).toEqual(['parts', 'proportions', 'placement', 'facing', 'colour', 'surface', 'triangles', 'meshes', 'codeSize', 'reuse', 'cleanGeometry', 'structure']);
      });

      it('a model against itself scores exactly 100 at every corner', () => {
        for (const v of CORNERS) expect(r1(combineScene(self, v).total)).toBe(100);
      });

      it('losing a part never raises the total', () => {
        for (const base of [self, imperfect]) {
          for (let i = 0; i < base.parts.length; i++) {
            const lost = clone(base);
            lost.parts[i] = { ...lost.parts[i], matched: false, inPlace: 0 };
            for (const v of CORNERS) expect(combineScene(lost, v).total).toBeLessThanOrEqual(combineScene(base, v).total + 1e-9);
          }
        }
        // And for real: the build with a part left out, measured.
        const fewer = measureScene(goal, sceneOf(boxes.slice(0, -1).map((b) => ({ ...b, size: [b.size[0] * 1.2, b.size[1], b.size[2]] as [number, number, number] }))));
        const all = measureScene(goal, sceneOf(boxes.map((b) => ({ ...b, size: [b.size[0] * 1.2, b.size[1], b.size[2]] as [number, number, number] }))));
        for (const v of CORNERS) expect(combineScene(fewer, v).total).toBeLessThanOrEqual(combineScene(all, v).total + 1e-9);
      });

      it('moving a part further from its place never raises the total', () => {
        for (const base of [self, imperfect]) {
          for (let i = 0; i < base.parts.length; i++) {
            if (!base.parts[i].matched) continue;
            for (const v of CORNERS) {
              let last = Infinity;
              for (const move of [0, 0.02, 0.05, 0.1, 0.2, 0.4, 0.8]) {
                const m = clone(base);
                m.parts[i].move = Math.max(m.parts[i].move, move);
                const t = combineScene(m, v).total;
                expect(t).toBeLessThanOrEqual(last + 1e-9);
                last = t;
              }
            }
          }
        }
      });

      it('more triangles never raise the total (bonus included)', () => {
        for (const base of [self, imperfect]) {
          const g = base.counts.triangles[1];
          for (const v of CORNERS) {
            let last = Infinity;
            for (const f of [0.3, 0.6, 1, 1.5, 3, 10, 40]) {
              const m = clone(base);
              m.counts.triangles = [Math.round(g * f), g];
              const t = combineScene(m, v).total;
              expect(t).toBeLessThanOrEqual(last + 1e-9);
              last = t;
            }
          }
        }
      });
    });
  }
});
