import { describe, expect, it } from 'vitest';
import { combineScene, sceneValues } from '../../src/scene3d/model';
import { prepareScene, scoreScene } from '../../src/scene3d/score';
import type { SceneCheck } from '../../src/scene3d/checks';
import type { RGB, SceneData, SceneMesh } from '../../src/scene3d/types';

// The exact-measurements report (checks): one check per difference, with the
// figure, a zone and the points it cost; the points add up to what was lost.
// Small models built from boxes (no browser needed).

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

function sceneOf(boxes: Box[]): SceneData {
  const meshes = boxes.map((b, i) => boxMesh(b, i));
  const triangleCount = meshes.reduce((s, m) => s + m.positions.length / 9, 0);
  return { meshes, meshCount: meshes.length, triangleCount, sourceBytes: 400 + 60 * boxes.length };
}

const GREY: RGB = [120, 120, 120], RED: RGB = [200, 40, 40], BLUE: RGB = [40, 70, 200];
const PLINTH: Box = { name: 'plinth', at: [0, 0.1, 0], size: [2, 0.2, 2], color: GREY };
const BAR: Box = { name: 'bar', at: [0, 0.25, 0], size: [0.4, 0.1, 0.1], color: RED };
const POST: Box = { name: 'post', at: [0.6, 0.3, 0.6], size: [0.1, 0.2, 0.1], color: BLUE };
const MODEL = [PLINTH, BAR, POST];
const longBar = (k: number): Box => ({ ...BAR, size: [BAR.size[0] * k, BAR.size[1], BAR.size[2]] });

const goal = prepareScene(sceneOf(MODEL));
const grade = (boxes: Box[]) => scoreScene(goal, sceneOf(boxes)).result;
const barSize = (checks: SceneCheck[]) => checks.find((c) => c.component === 'the bar' && c.what === 'size');

/** The sums rule: per criterion and in all, the points are what was lost (within 0.1). */
function expectSums(boxes: Box[]) {
  const r = grade(boxes);
  const comb = combineScene(r.measurements!, sceneValues());
  const all = r.checks!.reduce((s, c) => s + c.points, 0);
  expect(Math.abs(all - (100 + r.bonus - r.total))).toBeLessThanOrEqual(0.1);
  expect(Math.abs(all - (100 - comb.base * comb.placement))).toBeLessThanOrEqual(0.011);
  for (const crit of r.criteria!) {
    const sum = r.checks!.filter((c) => c.criterion === crit.id).reduce((s, c) => s + c.points, 0);
    expect(Math.abs(sum - (crit.points ?? 0))).toBeLessThanOrEqual(0.011);
  }
  expect(r.checks!.length).toBeLessThanOrEqual(60);
  return r;
}

describe('3D checks: the exact-measurements report', () => {
  it('the reference against itself scores 100 with no costly checks', () => {
    const r = grade(MODEL);
    expect(r.total).toBe(100);
    expect(r.checks!.filter((c) => c.points > 0)).toEqual([]);
    expect(r.criteriaFeedback).toEqual([]);
  });

  it('a part 1.02 times too long is a vicinity check with a small loss', () => {
    const r = grade([PLINTH, longBar(1.02), POST]);
    const c = barSize(r.checks!);
    expect(c).toBeDefined();
    expect(c!.zone).toBe('vicinity');
    expect(c!.points).toBeGreaterThan(0);
    expect(c!.points).toBeLessThan(0.3);
    expect(c!.measured).toMatch(/^1\.02 times the reference's length$/);
    expect(c!.text).toMatch(/very close/);
  });

  it('the same part 3 times too long is an off check that names the figure', () => {
    const r = grade([PLINTH, longBar(3), POST]);
    const c = barSize(r.checks!);
    expect(c).toBeDefined();
    expect(c!.zone).toBe('off');
    expect(c!.measured).toMatch(/^3(\.0)? times the reference's length$/);
    expect(c!.text).toMatch(/far from the reference, \d+\.\d\d points lost\.$/);
    expect(c!.points).toBeGreaterThan(barSize(grade([PLINTH, longBar(1.02), POST]).checks!)!.points);
    // The notes and the feedback are built from the costliest checks.
    const prop = r.criteria!.find((x) => x.id === 'proportions')!;
    expect(prop.notes.some((n) => n.includes('3 times the reference'))).toBe(true);
  });

  it('a missing part is a missing check', () => {
    const r = grade([PLINTH, BAR]);
    const c = r.checks!.find((x) => x.what === 'missing');
    expect(c).toBeDefined();
    expect(c!.component).toBe('the post');
    expect(c!.zone).toBe('off');
    expect(c!.points).toBeGreaterThan(1);
    expect(c!.text).toMatch(/^The post is missing: far from the reference, \d+\.\d\d points lost\.$/);
  });

  it('the points add up, per criterion and in all', () => {
    expectSums([PLINTH, longBar(1.02), POST]);
    expectSums([PLINTH, longBar(3), POST]);
    expectSums([PLINTH, BAR]);
    expectSums([PLINTH, { ...BAR, color: BLUE, at: [0.2, 0.25, 0.1] }, { ...POST, size: [0.15, 0.2, 0.1] }]);
  });
});
