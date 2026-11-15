import { PNG } from 'pngjs';
import { SCENE_RENDER, SCENE_VIEWS } from './config';
import type { Bounds, RGB, SceneData } from './types';

/**
 * A small software rasteriser: z-buffer, perspective camera, flat shading
 * from one directional light plus ambient, a fixed background. Plain
 * JavaScript arithmetic, so the same scene gives the same pixels on every
 * machine. Faces are drawn the way three.js would draw them: a single-sided
 * material shows only the faces turned towards the camera (or away, for a
 * back-side material), and an unlit material (MeshBasicMaterial) is drawn in
 * its flat colour.
 */

export type Vec3 = [number, number, number];

export interface Camera {
  eye: Vec3;
  target: Vec3;
  up: Vec3;
  fovDeg: number;
  near: number;
}

export interface Image {
  width: number;
  height: number;
  /** RGBA, width * height * 4 bytes. */
  pixels: Uint8Array;
}

export interface RenderOptions {
  width: number;
  height: number;
  supersample: number;
  background: RGB;
  ambient: number;
  diffuse: number;
  lightFromCamera: Vec3;
}

export const DEFAULT_RENDER: RenderOptions = {
  width: SCENE_RENDER.width,
  height: SCENE_RENDER.height,
  supersample: SCENE_RENDER.supersample,
  background: SCENE_RENDER.background,
  ambient: SCENE_RENDER.ambient,
  diffuse: SCENE_RENDER.diffuse,
  lightFromCamera: SCENE_RENDER.lightFromCamera,
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l: number) => {
  const v = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

/** Where a scene's cameras look from: a sphere round the thing being judged. */
export interface Frame {
  center: Vec3;
  radius: number;
}

/** The sphere round a bounding box. A scene with no extent gets a unit sphere. */
export function frameOf(bounds: Bounds | null): Frame {
  if (!bounds) return { center: [0, 0, 0], radius: 1 };
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const radius = Math.hypot(bounds.max[0] - center[0], bounds.max[1] - center[1], bounds.max[2] - center[2]);
  return { center, radius: radius > 1e-9 ? radius : 1 };
}

/** The four fixed viewpoints, placed from a frame. */
export function camerasFor(frame: Frame): { name: string; label: string; camera: Camera }[] {
  const half = ((SCENE_RENDER.fovDeg / 2) * Math.PI) / 180;
  const distance = (frame.radius / Math.sin(half)) * SCENE_RENDER.distanceFactor;
  return SCENE_VIEWS.map((v) => {
    const d = normalize(v.from);
    const eye: Vec3 = [
      frame.center[0] + d[0] * distance,
      frame.center[1] + d[1] * distance,
      frame.center[2] + d[2] * distance,
    ];
    return {
      name: v.name,
      label: v.label,
      camera: { eye, target: frame.center, up: v.up, fovDeg: SCENE_RENDER.fovDeg, near: distance * 0.01 },
    };
  });
}

/**
 * Draws a scene from one camera. With `ids`, also fills it (width x height)
 * with the number of the object (`part`, or the mesh's index) seen at each
 * pixel, -1 for background.
 */
export function renderScene(scene: SceneData, camera: Camera, options: RenderOptions = DEFAULT_RENDER, ids?: Int32Array): Image {
  const ss = Math.max(1, Math.floor(options.supersample));
  const W = options.width * ss;
  const H = options.height * ss;
  const color = new Float32Array(W * H * 3);
  const depth = new Float64Array(W * H); // 1 / distance; 0 = nothing drawn yet
  const idBuf = ids ? new Int32Array(W * H).fill(-1) : null;
  let currentId = -1;
  const bg = options.background.map(toLinear);
  for (let i = 0; i < W * H; i++) {
    color[i * 3] = bg[0];
    color[i * 3 + 1] = bg[1];
    color[i * 3 + 2] = bg[2];
  }

  const f = normalize(sub(camera.target, camera.eye));
  let r = normalize(cross(f, camera.up));
  if (r[0] === 0 && r[1] === 0 && r[2] === 0) r = normalize(cross(f, [0, 0, 1]));
  const u = cross(r, f);
  const lc = normalize(options.lightFromCamera);
  // Light direction in world space; z in the camera frame points at the viewer (-f).
  const light = normalize([
    lc[0] * r[0] + lc[1] * u[0] - lc[2] * f[0],
    lc[0] * r[1] + lc[1] * u[1] - lc[2] * f[1],
    lc[0] * r[2] + lc[1] * u[2] - lc[2] * f[2],
  ]);
  const focal = H / 2 / Math.tan(((camera.fovDeg / 2) * Math.PI) / 180);
  const near = camera.near;
  const eye = camera.eye;

  // Scratch space for one clipped polygon (at most 4 corners after one plane).
  const cam: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const sx = new Float64Array(4);
  const sy = new Float64Array(4);
  const iz = new Float64Array(4);

  for (let mi = 0; mi < scene.meshes.length; mi++) {
    const mesh = scene.meshes[mi];
    if (mesh.opacity <= 0) continue;
    currentId = mesh.part ?? mi;
    // A see-through material is drawn as its colour faded towards the background.
    const fade = (rgb: readonly number[]) => rgb.map((c, k) => toLinear(c) * mesh.opacity + bg[k] * (1 - mesh.opacity));
    let base = fade(mesh.color);
    const side = mesh.side ?? 'double';
    const tc = mesh.triColors;
    const p = mesh.positions;
    for (let t = 0; t + 9 <= p.length; t += 9) {
      const ax = p[t], ay = p[t + 1], az = p[t + 2];
      const e1: Vec3 = [p[t + 3] - ax, p[t + 4] - ay, p[t + 5] - az];
      const e2: Vec3 = [p[t + 6] - ax, p[t + 7] - ay, p[t + 8] - az];
      let n = cross(e1, e2);
      const len = Math.hypot(n[0], n[1], n[2]);
      if (!(len > 0)) continue;
      n = [n[0] / len, n[1] / len, n[2] / len];
      // The winding says which side is the front (counter-clockwise, as in three.js).
      const facing = n[0] * (eye[0] - ax) + n[1] * (eye[1] - ay) + n[2] * (eye[2] - az);
      if ((side === 'front' && facing <= 0) || (side === 'back' && facing >= 0)) continue;
      // Face the viewer: the side you see is the side that is lit.
      if (facing < 0) n = [-n[0], -n[1], -n[2]];
      if (tc) base = fade([tc[(t / 9) * 3], tc[(t / 9) * 3 + 1], tc[(t / 9) * 3 + 2]]);
      const shade = mesh.unlit ? 1 : options.ambient + options.diffuse * Math.max(0, dot(n, light));
      const cr = base[0] * shade, cg = base[1] * shade, cb = base[2] * shade;

      for (let v = 0; v < 3; v++) {
        const d: Vec3 = [p[t + v * 3] - eye[0], p[t + v * 3 + 1] - eye[1], p[t + v * 3 + 2] - eye[2]];
        cam[v][0] = dot(d, r);
        cam[v][1] = dot(d, u);
        cam[v][2] = dot(d, f);
      }
      // Clip against the near plane (Sutherland-Hodgman, one plane).
      const poly: number[][] = [];
      for (let v = 0; v < 3; v++) {
        const a = cam[v];
        const b = cam[(v + 1) % 3];
        const ain = a[2] >= near;
        const bin = b[2] >= near;
        if (ain) poly.push(a);
        if (ain !== bin) {
          const s = (near - a[2]) / (b[2] - a[2]);
          poly.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, near]);
        }
      }
      if (poly.length < 3) continue;
      for (let k = 0; k < poly.length; k++) {
        const q = poly[k];
        sx[k] = W / 2 + (q[0] / q[2]) * focal;
        sy[k] = H / 2 - (q[1] / q[2]) * focal;
        iz[k] = 1 / q[2];
      }
      for (let k = 1; k + 1 < poly.length; k++) {
        fillTriangle(sx[0], sy[0], iz[0], sx[k], sy[k], iz[k], sx[k + 1], sy[k + 1], iz[k + 1], cr, cg, cb);
      }
    }
  }

  function fillTriangle(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    cr: number, cg: number, cb: number,
  ) {
    let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0 || !Number.isFinite(area)) return;
    if (area < 0) {
      // Swap two corners so the edge tests below all have the same sign.
      let tx = x1; x1 = x2; x2 = tx;
      tx = y1; y1 = y2; y2 = tx;
      tx = z1; z1 = z2; z2 = tx;
      area = -area;
    }
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const w0 = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
        if (w0 < 0) continue;
        const w1 = (x0 - x2) * (py - y2) - (px - x2) * (y0 - y2);
        if (w1 < 0) continue;
        const w2 = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0);
        if (w2 < 0) continue;
        const z = (w0 * z0 + w1 * z1 + w2 * z2) / area;
        const i = y * W + x;
        if (z > depth[i]) {
          depth[i] = z;
          color[i * 3] = cr;
          color[i * 3 + 1] = cg;
          color[i * 3 + 2] = cb;
          if (idBuf) idBuf[i] = currentId;
        }
      }
    }
  }

  // Shrink the supersampled picture: average in linear light, then back to sRGB.
  const out = new Uint8Array(options.width * options.height * 4);
  const n = ss * ss;
  for (let y = 0; y < options.height; y++) {
    for (let x = 0; x < options.width; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const k = ((y * ss + j) * W + x * ss + i) * 3;
          sr += color[k];
          sg += color[k + 1];
          sb += color[k + 2];
        }
      }
      const o = (y * options.width + x) * 4;
      out[o] = toSrgb(sr / n);
      out[o + 1] = toSrgb(sg / n);
      out[o + 2] = toSrgb(sb / n);
      out[o + 3] = 255;
    }
  }
  if (ids && idBuf) {
    const c = Math.floor(ss / 2);
    for (let y = 0; y < options.height; y++) {
      for (let x = 0; x < options.width; x++) ids[y * options.width + x] = idBuf[(y * ss + c) * W + x * ss + c];
    }
  }
  return { width: options.width, height: options.height, pixels: out };
}

export function toPng(image: Image): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.pixels.buffer, image.pixels.byteOffset, image.pixels.byteLength);
  return PNG.sync.write(png);
}
