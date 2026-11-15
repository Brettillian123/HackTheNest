/**
 * Every tunable number of the 3D grader, in one place.
 *
 * Changing any of these changes scores, so bump GRADER_VERSION in
 * src/config.ts when one changes and re-run the calibration (npx tsx src/scene3d/calibrate.ts).
 */

import { GRADER_VERSION } from '../config';

/**
 * Reported with every result, so old and new scores are never mixed up. The
 * same as the page and site grader's version: one version for the whole grader.
 */
export const SCENE_VERSION = GRADER_VERSION;

/**
 * Size and position. Players only see pictures of the goal, so before shape
 * and looks are judged the submission is moved and uniformly scaled so its
 * bounding-box centre and bounding-box diagonal match the goal's (no
 * rotation, no stretching). How far off it was is then charged modestly:
 *
 *   scaleTerm  = 0 up to scaleFree, rising in a straight line to 1 at scaleFull
 *                (both as |ln(size ratio)|, so 2x bigger and 2x smaller count alike)
 *   offsetTerm = 0 up to offsetFree, rising to 1 at offsetFull
 *                (centre distance as a share of the goal's box diagonal)
 *   factor     = 1 - maxPenalty x min(1, scaleTerm + offsetTerm)
 *
 * The total before the bonus is multiplied by the factor, so placement alone
 * can never take more than maxPenalty of it.
 */
export const SCENE_PLACEMENT = {
  scaleFree: Math.log(1.05),
  scaleFull: Math.log(2),
  offsetFree: 0.03,
  offsetFull: 0.5,
  maxPenalty: 0.3,
} as const;

/**
 * Parts. The goal's parts are its separate connected pieces of surface
 * (corners at the same position are joined, so a leg is one part whether it
 * is its own mesh or merged into a bigger geometry).
 *
 *   parts credit = parts present / (goal parts + extraWeight x extra parts)
 *   works        = shape agreement x parts credit
 */
export const SCENE_PARTS = {
  /** Corners closer than this share of the scene's box diagonal count as the same point. */
  weld: 1e-5,
  /** A goal part is present when at least this share of its surface voxels has submission material nearby. */
  present: 0.5,
  /** A piece of the submission is an extra part when at least this share of it is away from the goal's material... */
  extraOutside: 0.5,
  /** ...and at least this many of its surface voxels are (stray specks do not count). */
  extraMinVoxels: 6,
  /** Weight of one extra part, against 1 for a goal part. */
  extraWeight: 0.5,
  /** At most this many pieces are looked at in a submission; the rest are ignored. */
  maxPieces: 5_000,
} as const;

/** What a submission may be, at most. Anything over a cap scores 0 with a reason. */
export const SCENE_LIMITS = {
  /** Source code size in bytes (UTF-8). */
  maxSourceBytes: 200_000,
  /** Triangles in the whole scene, after instancing is expanded. */
  maxTriangles: 100_000,
  /** Meshes in the scene. */
  maxMeshes: 2_000,
  /** Objects visited while walking the scene (meshes, groups, everything). */
  maxNodes: 20_000,
  /** Deepest nesting of groups that is walked. */
  maxDepth: 64,
  /** Longest the scene code may run, including loading three.js into the page. */
  runTimeoutMs: 8_000,
} as const;

/** What the code sees instead of real randomness and real time. */
export const SCENE_DETERMINISM = {
  /** Seed for Math.random and crypto.getRandomValues. */
  randomSeed: 0x5eed1234,
  /** What Date.now() and new Date() return: 2026-01-01T00:00:00Z. */
  fixedTimeMs: Date.UTC(2026, 0, 1),
} as const;

/** The pictures the scene is drawn into. */
export const SCENE_RENDER = {
  /** Size of each view, in pixels. */
  width: 384,
  height: 288,
  /** Each view is drawn this many times larger and shrunk, which smooths jagged edges. */
  supersample: 2,
  /** Vertical field of view of every camera, in degrees. */
  fovDeg: 40,
  /** Camera distance, as a multiple of the distance at which the goal's bounding sphere just fits. */
  distanceFactor: 1.15,
  /** The background colour of every view (sRGB). */
  background: [236, 239, 243] as [number, number, number],
  /** Light that reaches every surface, 0 to 1. */
  ambient: 0.35,
  /** Strength of the one directional light, 0 to 1. */
  diffuse: 0.65,
  /**
   * Direction the light comes from, in the camera's own frame (x right,
   * y up, z towards the viewer): upper left, slightly behind the viewer.
   * Tied to the camera so every view is lit the same way.
   */
  lightFromCamera: [-0.45, 0.75, 0.5] as [number, number, number],
  /** Colour of a mesh whose material has no colour (sRGB). */
  defaultColor: [200, 200, 200] as [number, number, number],
} as const;

/**
 * The four viewpoints, as directions from the goal's centre to the camera
 * (Three.js convention: y is up, the front faces +z). `up` is the camera's
 * up direction.
 */
export const SCENE_VIEWS: { name: string; label: string; from: [number, number, number]; up: [number, number, number] }[] = [
  { name: 'three-quarter-front', label: 'three-quarter front view', from: [1, 0.75, 1.25], up: [0, 1, 0] },
  { name: 'front', label: 'front view', from: [0, 0.12, 1], up: [0, 1, 0] },
  { name: 'top', label: 'top view', from: [0, 1, 0], up: [0, 0, -1] },
  { name: 'three-quarter-back', label: 'three-quarter back view', from: [-1, 0.75, -1.25], up: [0, 1, 0] },
];

/** How the solid shape is compared. */
export const SCENE_SHAPE = {
  /**
   * Voxels along the longest side of the goal's (padded) bounding box. The
   * shape is compared at each of these and the results averaged: the fine
   * grid catches small errors, the coarse ones give partial credit to a
   * shape that is close but not exact (slightly too big, slightly moved),
   * so credit falls off gradually instead of all at once.
   */
  resolutions: [72, 36, 18] as readonly number[],
  /** The grid reaches this fraction of the goal's size past each side of its bounding box. */
  padding: 0.15,
  /** A surface voxel counts as matched if the other scene has surface within this many voxels. */
  toleranceVoxels: 1,
  /** Triangles are sampled at most this far apart, in voxels, so no voxel they cross is skipped. */
  sampleSpacing: 0.5,
  /** At most this many sample points per triangle; a huge triangle is sampled more coarsely. */
  maxSamplesPerTriangle: 40_000,
  /** At most this many sample points per scene. */
  maxSamplesPerScene: 4_000_000,
  /**
   * works = 1 when every surface voxel matches; 0 when only this fraction
   * matches (or less), a straight line between. Two unrelated objects of
   * similar size share some surface by chance; this keeps that from scoring.
   */
  zeroAtMatch: 0.25,
} as const;

/** Engineering: the submission's counts against the goal's, through ratioCredit. */
export const SCENE_ENGINEERING = {
  /** Added to both sides of the triangle ratio, so a 12- vs 14-triangle difference is not a big ratio. */
  triangleSlack: 24,
  /** Added to both sides of the mesh ratio, for the same reason. */
  meshSlack: 1,
  /** Added to both sides of the source-size ratio, so comments and spacing barely matter. */
  sourceSlackBytes: 300,
} as const;

/** The total, mirroring the site grader so scores mean the same thing. */
export const SCENE_WEIGHTS = {
  works: 0.4,
  looks: 0.25,
  engineering: 0.35,
  /** Most points the bonus can add, for an exact match that beats the goal. */
  bonusMax: 20,
  /**
   * works and looks at or above this count as exact (for the bonus). The
   * picture comparison carries rounding noise of about 1e-6 on identical
   * pictures, and edges where two faces meet can differ by a pixel.
   */
  exact: 0.995,
} as const;

/** When feedback mentions something. */
export const SCENE_FEEDBACK = {
  /** A size difference along one axis is mentioned past this fraction (0.08 = 8%). */
  sizeRatio: 0.08,
  /** A shift is mentioned past this fraction of the goal's largest dimension. */
  shift: 0.06,
  /** Missing or extra material is mentioned past this fraction of the goal's surface. */
  material: 0.03,
  /** A view's colours are mentioned when its colour match is under this. */
  color: 0.97,
  /** At most this many lines of feedback. */
  maxLines: 6,
} as const;

/**
 * A stray piece (a box floating beside a correct chair) would stretch the
 * bounding box and spoil the lining up. So the grader also tries lining up
 * without each piece that sets an edge of the box, and keeps the one that
 * matches the goal's shape best, if it is clearly better. The piece left out
 * is still graded, as an extra part.
 */
export const SCENE_ALIGN = {
  /** Only scenes with at most this many pieces get the extra tries. */
  maxPieces: 32,
  /** A try must beat lining up on the whole scene by this much shape agreement (0 to 1) to be kept. */
  minGain: 0.05,
  /** Index into SCENE_SHAPE.resolutions of the grid the tries are compared on. */
  level: 1,
} as const;
