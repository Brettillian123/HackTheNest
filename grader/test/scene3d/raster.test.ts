import { describe, expect, it } from 'vitest';
import { renderScene, type Camera, type RenderOptions } from '../../src/scene3d/raster';
import type { SceneData, SceneMesh } from '../../src/scene3d/types';

// Tiny pictures with no smoothing and no lighting effects, so pixels are exact.
const OPTS: RenderOptions = {
  width: 40,
  height: 40,
  supersample: 1,
  background: [0, 0, 0],
  ambient: 1,
  diffuse: 0,
  lightFromCamera: [0, 0, 1],
};
// Looking down -z from z = 5 at the origin; the view is 2 units across at z = 0.
const CAMERA: Camera = { eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fovDeg: 2 * Math.atan(1 / 5) * (180 / Math.PI), near: 0.1 };

function scene(meshes: SceneMesh[]): SceneData {
  return { meshes, meshCount: meshes.length, triangleCount: meshes.reduce((s, m) => s + m.positions.length / 9, 0), sourceBytes: 0 };
}
const mesh = (color: [number, number, number], tris: number[]): SceneMesh => ({ name: '', color, opacity: 1, positions: new Float32Array(tris) });
const px = (img: { width: number; pixels: Uint8Array }, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]];
};

function cube(size: number, color: [number, number, number]): SceneMesh {
  const s = size / 2;
  const c = [
    [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
    [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
  ];
  const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
  const tris: number[] = [];
  for (const [a, b, cc, d] of faces) tris.push(...c[a], ...c[b], ...c[cc], ...c[a], ...c[cc], ...c[d]);
  return mesh(color, tris);
}

describe('rasteriser', () => {
  it('draws one triangle where it should', () => {
    // Covers the lower-left half of the view: corners (-1,-1), (1,-1), (-1,1).
    const img = renderScene(scene([mesh([255, 0, 0], [-1, -1, 0, 1, -1, 0, -1, 1, 0])]), CAMERA, OPTS);
    expect(px(img, 5, 34)).toEqual([255, 0, 0]); // lower left: inside
    expect(px(img, 34, 5)).toEqual([0, 0, 0]); // upper right: outside
    expect(px(img, 10, 25)).toEqual([255, 0, 0]);
    expect(px(img, 30, 15)).toEqual([0, 0, 0]);
  });

  it('draws a cube as a centred square, with background around it', () => {
    // A cube of side 1 at the origin: its front face spans about 1/2 of the
    // view's width at z = 0.5, a little more (perspective).
    const img = renderScene(scene([cube(1, [0, 200, 0])]), CAMERA, OPTS);
    expect(px(img, 20, 20)).toEqual([0, 200, 0]);
    expect(px(img, 11, 20)).toEqual([0, 200, 0]);
    expect(px(img, 28, 28)).toEqual([0, 200, 0]);
    expect(px(img, 2, 2)).toEqual([0, 0, 0]);
    expect(px(img, 37, 20)).toEqual([0, 0, 0]);
    // Edges of the front face: x = 0.5 at distance 4.5 -> 0.5/4.5*5 = 0.556 of the half-width -> pixel 20 + 11.1.
    expect(px(img, 30, 20)).toEqual([0, 200, 0]);
    expect(px(img, 32, 20)).toEqual([0, 0, 0]);
  });

  it('keeps the nearer of two overlapping triangles in front, whatever the drawing order', () => {
    const near = mesh([0, 0, 255], [-1, -1, 1, 1, -1, 1, 0, 1, 1]);
    const far = mesh([255, 255, 0], [-1, -1, -1, 1, -1, -1, 0, 1, -1]);
    for (const order of [[near, far], [far, near]]) {
      const img = renderScene(scene(order), CAMERA, OPTS);
      expect(px(img, 20, 22)).toEqual([0, 0, 255]);
    }
    // The far triangle looks smaller and is hidden entirely; moved sideways, its uncovered part shows.
    const farRight = mesh([255, 255, 0], [0, -1, -1, 2, -1, -1, 1, 1, -1]);
    for (const order of [[near, farRight], [farRight, near]]) {
      const img = renderScene(scene(order), CAMERA, OPTS);
      expect(px(img, 25, 33)).toEqual([0, 0, 255]); // overlap: near wins
      expect(px(img, 36, 10)).toEqual([255, 255, 0]); // only the far one there
    }
  });

  it('shades faces by the light: a face turned away from it is darker', () => {
    const lit: RenderOptions = { ...OPTS, ambient: 0.3, diffuse: 0.7, lightFromCamera: [0, 0, 1] };
    const facing = renderScene(scene([mesh([200, 200, 200], [-1, -1, 0, 1, -1, 0, 0, 1, 0])]), CAMERA, lit);
    const tilted = renderScene(scene([mesh([200, 200, 200], [-1, -1, -0.8, 1, -1, 0.8, 0, 1, 0])]), CAMERA, lit);
    expect(px(facing, 20, 25)[0]).toBe(200);
    expect(px(tilted, 20, 25)[0]).toBeLessThan(200);
    expect(px(tilted, 20, 25)[0]).toBeGreaterThan(0);
  });
});
