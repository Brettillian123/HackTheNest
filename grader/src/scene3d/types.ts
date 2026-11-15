/**
 * The language-neutral form of a 3D scene: what any front end (Three.js
 * today, OpenSCAD later) turns code into, and what the renderer and the
 * scorer read. Nothing here knows how the scene was written.
 */

export type RGB = [number, number, number];

export interface SceneMesh {
  /** The mesh's name in the code, '' if none. */
  name: string;
  /** Material colour, sRGB 0 to 255. */
  color: RGB;
  /** Material opacity, 0 to 1. */
  opacity: number;
  /** Triangles in world space: 9 numbers (three x,y,z corners) per triangle. */
  positions: Float32Array;
  /**
   * Which object this came from: one number per mesh (per instance, for an
   * instanced mesh). The material groups of one mesh share it. The goal's
   * parts are its objects. Absent: each SceneMesh is its own object.
   */
  part?: number;
  /** Which faces are drawn, after a mirrored transform has been taken into account. Absent: both. */
  side?: 'front' | 'back' | 'double';
  /** Drawn as edges only (three.js `material.wireframe`). */
  wireframe?: boolean;
  /** Not lit: drawn in its flat colour (three.js MeshBasicMaterial). */
  unlit?: boolean;
  /** One sRGB colour per triangle (3 bytes each), when the colours come from the geometry (vertex colours, instance colours). */
  triColors?: Uint8Array;
}

/** How the code organised the scene (counted by the front end; absent when it cannot tell). */
export interface SceneStructure {
  /** Mesh objects counted (as meshCount). */
  meshes: number;
  /** Distinct geometry objects and material objects those meshes use: fewer than meshes means some are shared. */
  geometries: number;
  materials: number;
  /** Meshes with a name of their own. */
  namedMeshes: number;
  /** Groups (other than the returned object) holding two or more meshes, and how many of them are named. */
  groups: number;
  namedGroups: number;
  /** Triangles whose material draws only their inside (BackSide). */
  backFaceTriangles?: number;
}

export interface SceneData {
  /** How the code organised the scene (engineering: reuse and structure). */
  structure?: SceneStructure;
  meshes: SceneMesh[];
  /** Mesh objects in the scene (a mesh with several materials still counts once). */
  meshCount: number;
  triangleCount: number;
  /** Size of the code in bytes, not counting comments or spacing (see source-size.ts). */
  sourceBytes: number;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/** Why code could not be turned into a scene. `message` is plain words for the player. */
export class SceneBuildError extends Error {
  constructor(
    message: string,
    readonly kind: 'source' | 'timeout' | 'threw' | 'no-object' | 'no-meshes' | 'too-big' | 'internal',
  ) {
    super(message);
    this.name = 'SceneBuildError';
  }
}

/** Bounding box of every triangle corner; null for a scene with no triangles. */
export function sceneBounds(scene: SceneData): Bounds | null {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const mesh of scene.meshes) {
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
  }
  if (x0 === Infinity) return null;
  return { min: [x0, y0, z0], max: [x1, y1, z1] };
}
