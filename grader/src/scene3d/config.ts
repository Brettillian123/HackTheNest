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
 * Size, position, turn and mirror image. Players only see pictures of the
 * goal, so before shape and looks are judged the submission is lined up with
 * it (see align.ts): turned about the up axis, mirrored if that fits better,
 * scaled uniformly and moved. What the line-up had to do is then charged a
 * little, each part with its own ceiling (a share of the total before the bonus):
 *
 *   size      0 up to scaleFree, rising in a straight line to `size` at scaleFull
 *             (both as |ln(size ratio)|, so 2x bigger and 2x smaller count alike)
 *   position  0 up to offsetFree, rising to `position` at offsetFull (distance
 *             between where the two stand, the centres of their bases, as a share
 *             of the goal's longest side)
 *   turn      0 up to turnFreeDeg, then in proportion to the angle, `turn` at 180 degrees
 *   mirror    a flat `mirror`
 *
 *   factor = 1 - (size + position + turn + mirror charges)
 */
export const SCENE_PLACEMENT = {
  scaleFree: Math.log(1.05),
  scaleFull: Math.log(2),
  offsetFree: 0.03,
  offsetFull: 0.5,
  turnFreeDeg: 3,
  size: 0.1,
  position: 0.1,
  turn: 0.2,
  mirror: 0.1,
} as const;

/**
 * Parts. The goal's parts are its own meshes (the challenge author controls
 * those); the hidden ones (nothing of them on the outside) do not count. A
 * part is present to the degree the submission has material where it is,
 * whatever the submission is built from (soft edge, as for the shape). A part
 * that sits flush on others (most of it within a voxel of another part, like
 * a door on a wall) cannot be told apart by shape, so its colour decides:
 * it is there if the submission's colour in that place matches the part's,
 * or stands out from its surroundings the way the part does in the goal.
 *
 *   weight of a part  = its linear size (bounding-box diagonal), but no part more than `maxShare` of the total
 *   share present     = sum of weight x presence / (sum of weights + extra lumps x mean part weight)
 *   parts credit      = share present squared
 *   works             = parts credit x (worksFloor + (1 - worksFloor) x shape agreement)
 *
 * A part's presence comes from the piece matched to it (match.ts), or from the
 * material in its place when no piece is (a merged or differently split build).
 */
export const SCENE_PARTS = {
  /** No part counts for more than this share of the parts' total weight (a flat saucer is not a third of a mug). */
  maxShare: 0.25,
  /** works = parts credit x (worksFloor + (1 - worksFloor) x shape agreement). */
  worksFloor: 0.4,
  /** Corners closer than this share of the scene's box diagonal count as the same point (for the submission's pieces). */
  weld: 1e-5,
  /** A goal part counts as present (in the counts reported) at this presence or more. */
  present: 0.5,
  /** A part is flush when at least this share of its outside lies within one voxel of another part. */
  flush: 0.6,
  /** A piece of the submission is an extra lump to the degree its material is far from the goal's: none at this share, fully at the next. */
  extraFrom: 0.35,
  extraFull: 0.75,
  /** ...and only when at least this many of its voxels are far (stray specks do not count). */
  extraMinVoxels: 6,
  /** At most this many pieces are looked at in a submission; the rest are ignored. */
  maxPieces: 5_000,
} as const;

/**
 * Matching the submission's pieces to the goal's parts (match.ts). Factors of a
 * matched part's credit, each 1 when right:
 *
 *   place  1 - placeMax x (move from the soft edge to placeFull of the model's size, 0 to 1)
 *   size   1 - sizeMax  x (worst |ln ratio| of its sides, from ln sizeFree to ln sizeFull)
 *   shape  1 - shapeMax x (shape agreement from shapeFull down to shapeZero)
 *   turn   1 - turnMax  x (turn / 90 degrees) x (how much the turn can be seen)
 *
 *   credit = max(floor, place x size x shape x turn)
 */
export const SCENE_MATCH = {
  /** Cells along each side of the small grid a piece's outlines are compared on, in its own box. */
  grid: 12,
  /** A side thinner than this share of the piece's longest is flat (its outline from that side is not judged across it). */
  flatShare: 0.12,
  /** Surface points per piece for its shape (every triangle at least one). */
  samples: 2000,
  /** Slack added to every side when sizes are compared, as a share of the part's longest side (thin sides are not judged to the hair). */
  thinSlack: 0.07,
  /** A piece can be a part only when its centre is within this share of the model's size (plus half the part's own size)... */
  gateMove: 0.35,
  /** ...and no side is more than this many times too big or too small. */
  gateSize: 3.5,
  sizeMax: 0.6,
  sizeFree: 1.1,
  sizeFull: 3,
  shapeMax: 0.6,
  shapeFull: 0.85,
  shapeZero: 0.45,
  turnMax: 0.15,
  placeMax: 0.75,
  placeFull: 0.22,
  floor: 0.25,
  /** Pieces considered per part (nearest first). */
  perPart: 8,
  /** Colour only breaks ties between pieces. */
  colourTieBreak: 0.03,
  /** A part that moved with the heavier part it rests on is charged for its move relative to it, plus this share of that part's charge. */
  followCharge: 0.8,
  /** A part turned but still joined to the heavier part it rests on (an arm turned at the shoulder) is charged this share of its move. */
  attachedCharge: 0.3,
  /** ...turned meaning at least this many degrees (where the turn can be seen). */
  turnedAt: 10,
  /** Objects are split into their connected lumps when the submission has fewer objects than this share of the goal's parts. */
  splitBelow: 0.75,
  /** A matched piece no side of which is more than this many times its part's is that part alone: its material does not show other parts in place. */
  soloSize: 1.3,
  maxLumps: 300,
  maxPieces: 2000,
  /**
   * A part with no piece is judged in place: material where it is, and little
   * where the goal has none around it, counted against the part's own outside
   * (none charged up to excessFrom of it, all from excessFull).
   */
  excessFrom: 0.3,
  excessFull: 1,
  /** ...and solid inside where the goal's part is solid: no credit at solidFrom of it filled, full from solidFull. */
  solidFrom: 0.3,
  solidFull: 0.8,
  /** A pose that faces another way is chosen when its parts match better by more than this share; within it, the cheaper facing. */
  facingMargin: 0.01,
  facingPerCost: 0.15,
  /** The parts re-judge the model's size when they say it is off by more than this factor, and its place past this share of its size. */
  rescaleAbove: 1.02,
  reshiftAbove: 0.01,
  /** The parts' size and place are kept unless the parts then fit worse by more than this share. */
  reposeSlack: 0.005,
  /** Only parts matched at least this well vote on size and place. */
  voteAt: 0.5,
} as const;

/** The colour test for flush parts, and the per-part colour feedback. CIEDE2000 differences. */
export const SCENE_PART_COLOR = {
  /** Same colour up to this difference... */
  matchFull: 8,
  /** ...a different colour from this one. */
  matchZero: 20,
  /** A goal part whose colour differs from its surroundings by less than this cannot be told apart by colour. */
  contrastMin: 6,
  /** The submission's contrast in that place, as a share of the goal's: none at the first, enough at the second. */
  contrastZero: 0.25,
  contrastFull: 0.6,
  /** The surroundings: pixels up to this far (in the views) around the part. */
  ringPx: 3,
  /** The submission's pixels are also tried moved by up to this many pixels each way, so a part a pixel off still counts. */
  shiftPx: 2,
  /** Parts showing fewer pixels than this, over all four views, are not colour-tested. */
  minPixels: 12,
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
  /** A see-through material more transparent than this (opacity below it) is treated as not there. */
  minOpacity: 0.1,
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
  /**
   * The goal's grid, that both are compared on: a wider margin (so a part moved
   * or grown past the goal's box still lands on it) at the same voxel size as
   * resolutions[0] with `padding` (72 x 1.6 / 1.3).
   */
  goalPadding: 0.3,
  goalResolution: 89,
  /** A surface voxel counts as matched if the other scene has surface within this many voxels (old hard edge, voxel.ts). */
  toleranceVoxels: 1,
  /**
   * The soft edge: a piece of either solid's skin gets full credit within
   * softFullVoxels of the other's skin, falling in a straight line to none
   * at softZeroShare of the goal's longest side. A local error stays local.
   */
  softFullVoxels: 1.5,
  softZeroShare: 0.08,
  /** Triangles are sampled at most this far apart, in voxels, so no voxel they cross is skipped (and filling cannot leak through). */
  sampleSpacing: 0.4,
  /** At most this many sample points per triangle; a huge triangle is sampled more coarsely. */
  maxSamplesPerTriangle: 40_000,
  /** At most this many sample points per scene. */
  maxSamplesPerScene: 4_000_000,
  /**
   * works = 1 when every surface voxel matches; 0 when only this fraction
   * matches (or less), a straight line between. Two unrelated objects of
   * similar size share some surface by chance; this keeps that from scoring.
   */
  zeroAtMatch: 0.3,
} as const;

/** Engineering: the submission's counts against the goal's, through ratioCredit. */
export const SCENE_ENGINEERING = {
  /**
   * Added to both sides of the triangle ratio, so a few dozen triangles either
   * way on a tiny model are not a big ratio (a cube from six slabs: 72 against
   * 12), while 30 to 100 times the triangles of any real model still costs in full.
   */
  triangleSlack: 64,
  /** Added to both sides of the mesh ratio: how a small model is split into meshes is mostly organisation. */
  meshSlack: 12,
  /** Added to both sides of the source-size ratio, so a few harmless lines on a tiny model barely matter. */
  sourceSlackBytes: 600,
  /**
   * Engineering credit never goes below this. A model that matches exactly but
   * is 30 to 100 times too heavy is docked hard, yet stays above models that
   * are plainly wrong.
   */
  floor: -0.5,
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
 * The line-up search (align.ts). Also: a stray piece (a box far beside a
 * correct chair, a floor) would spoil the line-up, so pieces that stretch the
 * submission's box are also tried left out; a piece left out is still
 * graded, as an extra lump.
 */
export const SCENE_ALIGN = {
  /** Voxels along the longest side of the submission's own grid. */
  candidateResolution: 64,
  /** Turns tried from each guess. */
  turns: 24,
  /** Best starts refined. */
  keep: 4,
  /** Skin points used for the first guesses, and for the final refining. */
  coarsePoints: 600,
  finePoints: 2500,
  /** Most tries per refinement. */
  coarseEvals: 160,
  fineEvals: 200,
  /** The first guesses use a soft edge this many times wider, to see a pose that is nearly right. */
  wideFactor: 2.5,
  /** The plain box line-up is kept without searching when it fits this well. */
  acceptAt: 0.995,
  /**
   * Taken off a pose's fit when choosing, so a mirror image or a turn is chosen
   * only when it fits better. In proportion to what each is charged (a mirror
   * 10%, a half turn 20%), so when a half turn and a mirror image fit equally
   * well (a model symmetric front to back) the cheaper explanation is chosen.
   */
  mirrorBias: 0.01,
  turnBias: 0.02,
  /** Leaving a piece out is tried only for scenes with at most this many pieces... */
  maxPieces: 32,
  /** ...for pieces whose removal shrinks the box diagonal by at least this share... */
  minShrink: 0.1,
  /** ...and only when the whole scene fits worse than this. */
  tryBelow: 0.97,
  /** Index into SCENE_SHAPE.resolutions of the grid the goal is compared on. */
  level: 0,
  /** Up to this many more starts are refined that face at least otherFacingDeg away from every start already taken... */
  otherFacings: 3,
  otherFacingDeg: 40,
  /** ...while their first fit is within this of the best start's. */
  otherFacingWithin: 0.08,
  /** Poses that fit within this of the best are offered to the parts, which choose the facing among them. */
  alternativeWithin: 0.03,
} as const;

/**
 * Looks: form and colour, judged apart so neither can hide the other.
 *
 *   form of a view = shading picture x (1 - outline + outline x outline overlap)
 *                    x max(0, 1 - edges x outline overlap² x (1 - edge agreement))
 *     (edges count less where the outline already differs: there the edges differ because the shape does)
 *     (the shading picture and the edges come from views drawn with every mesh
 *     in one grey, so they see shape and surface only; edge agreement is how
 *     well the hard edges of the two pictures coincide, so the facets of a
 *     coarse curve show where the goal is smooth)
 *   colour         = per goal part, 1 when its colour matches (CIEDE2000 up to
 *                    colorFull), 0 from colorZero; averaged by part size
 *   looks          = mean form x (colorFloor + (1 - colorFloor) x colour)
 */
export const SCENE_LOOKS = {
  outline: 0.3,
  edges: 1.6,
  /** A pixel is on a hard edge when the grey picture changes by at least this much (0 to 255) across it. */
  edgeStep: 28,
  /** Edges this many pixels apart still coincide. */
  edgeTolerancePx: 2,
  colorFull: 3,
  colorZero: 22,
  colorFloor: 0.3,
  /** A part's colour is judged only where its shape is in place: not at all at this in-place credit, fully from the next. */
  colorShapeFrom: 0.85,
  colorShapeFull: 0.97,
  /** The submission's colours are also read moved by up to this many pixels each way (in steps of 3), so a part slightly moved is judged on its colour, not its place. */
  colorShiftPx: 6,
  /** Grey of the shape-only views (sRGB). */
  grey: [200, 200, 200] as [number, number, number],
} as const;

/** The search for goal parts that are there but moved or the wrong size (displaced.ts). */
export const SCENE_DISPLACED = {
  /** A part with at least this credit in place is settled: it claims the material around it first and is not searched. */
  settledAt: 0.9,
  /** Furthest a part's centre may move, as a share of the goal's longest side. */
  searchShare: 0.3,
  /** Stretch along each axis tried, from ... to. */
  stretchMin: 0.6,
  stretchMax: 1.7,
  /** Credit for a moved part: about half when its surface moved this share of the model's size on average... */
  halfAt: 0.15,
  /** ...and never under this while it is within the search. */
  floor: 0.2,
  /** Of two places that fit equally, the nearer is taken: this much fit is worth moving the whole model's size. */
  moveTieBreak: 0.05,
  /** A moved part counts as found only when at least this share of it matches material there. */
  minFit: 0.75,
  /** A stretch counts as a move of this share of the model's size per unit of |ln(stretch)| (60% too long: about 0.09). */
  stretchCharge: 0.1,
  /** A part in place grew when a part resting on it moved straight away with at least this share of the gap filled. */
  filledShare: 0.8,
  /** ...and "straight away" means within about 45 degrees of the line from its centre through where they touch. */
  awayCos: 0.7,
  /** A follower (moved only because the part it rests on moved or grew) keeps this share of the movement charge. */
  followCharge: 0.25,
  /** ...when its move matches that part's at the point where they touch, within this share of the model's size... */
  followTolerance: 0.04,
  /** ...and it is not itself stretched by more than this. */
  rigidStretch: 1.12,
  /** When the parts in place and the parts found say the model's size is off by more than this factor, its size is judged again from them. */
  rescaleAbove: 1.08,
  /** At most this many times. */
  rescaleRounds: 1,
  /** ...and its place, when they say it is off by more than this share of the goal's size. */
  reshiftAbove: 0.03,
  /** Search effort: sample points per part, starts refined, tries per start, most parts searched. */
  samplePoints: 300,
  keep: 4,
  evals: 150,
  maxParts: 10,
} as const;

/**
 * Every difference costs a little (owner, 2026-11-15: "yes cost a little for
 * everything ... 1.02x off will dock you a very small amount"). The combination's
 * curves used to have a flat free zone (a size within 1.05x, a part within its
 * soft edge, a colour within 3 CIEDE2000...). Inside that zone the charge now
 * rises in a straight line from 0 to `share` of the curve's full charge at the
 * zone's edge, and from there on as before (scaled to the remaining 1 - share).
 * Applies to: whole size, whole position, whole turn, part place, part size,
 * part shape, colour, and the triangle, mesh and code-size counts (above the
 * reference only). The bonus still uses the flat curves to decide an exact match.
 */
export const SCENE_GENTLE = { share: 0.005 } as const;

/**
 * The exact-measurements report (checks.ts): a check's zone comes from the credit
 * its curve gives (1 = exact). At or above `vicinity` a person would not notice the
 * difference; at or above `close` it shows but is near; below, it is off.
 */
export const SCENE_CHECKS = { vicinity: 0.97, close: 0.8, maxChecks: 60, minPoints: 0.01 } as const;
