import { deltaE00, labOf, type Lab } from './color';
import { TOL, VISUAL } from './config';
import type { PageSnapshot, RGB } from './types';
import { clamp01, fallingCredit } from './util';

export interface VisualResult {
  /** 0 to 1: the two screenshots look alike. */
  score: number;
  /** 0 to 1: shapes, edges and text sit in the same places. */
  structure: number;
  /** 0 to 1: the same colours cover the same areas. */
  color: number;
}

interface Gray {
  data: Float32Array;
  w: number;
  h: number;
}

/**
 * Shrinks a page shifted by (dx, dy), and continued forever in its
 * background colour, two ways in one pass over its pixels:
 *   gray  - brightness averaged over grayScale x grayScale squares. A mild
 *           blur: small shifts stop mattering.
 *   cells - mean colour of each colorScale x colorScale cell.
 * Every square is summed row by row, left to right, so the sums are exactly
 * those of adding up each square on its own.
 */
function shrink(
  snap: PageSnapshot,
  width: number,
  height: number,
  grayScale: number,
  colorScale: number,
  dx: number,
  dy: number,
): { gray: Gray; cells: RGB[] } {
  const gw = Math.floor(width / grayScale);
  const gh = Math.floor(height / grayScale);
  const cw = Math.floor(width / colorScale);
  const chh = Math.floor(height / colorScale);
  const graySum = new Float64Array(gw * gh);
  const r = new Float64Array(cw * chh);
  const g = new Float64Array(cw * chh);
  const b = new Float64Array(cw * chh);
  const { pixels, width: pw, height: ph, pageBackground: bg } = snap;
  const bgGray = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  // Every colour cell is whole gray squares (colorScale is a multiple of
  // grayScale), and the colour grid never reaches past the gray grid.
  for (let y = 0; y < gh * grayScale; y++) {
    const py = y + dy;
    const rowIn = py >= 0 && py < ph;
    const grayRow = Math.floor(y / grayScale) * gw;
    const cy = Math.floor(y / colorScale);
    const colorRow = cy < chh ? cy * cw : -1;
    const rowBase = py * pw;
    for (let gx = 0; gx < gw; gx++) {
      const x0 = gx * grayScale;
      let acc = graySum[grayRow + gx];
      let sr = 0;
      let sg = 0;
      let sb = 0;
      const first = x0 + dx;
      if (rowIn && first >= 0 && first + grayScale <= pw) {
        // The whole square is on the page: no edge checks needed.
        for (let k = (rowBase + first) * 4, end = k + grayScale * 4; k < end; k += 4) {
          const pr = pixels[k];
          const pg = pixels[k + 1];
          const pb = pixels[k + 2];
          acc += 0.299 * pr + 0.587 * pg + 0.114 * pb;
          sr += pr;
          sg += pg;
          sb += pb;
        }
      } else for (let i = 0; i < grayScale; i++) {
        const px = x0 + i + dx;
        if (!rowIn || px < 0 || px >= pw) {
          acc += bgGray;
          sr += bg[0];
          sg += bg[1];
          sb += bg[2];
        } else {
          const k = (rowBase + px) * 4;
          const pr = pixels[k];
          const pg = pixels[k + 1];
          const pb = pixels[k + 2];
          acc += 0.299 * pr + 0.587 * pg + 0.114 * pb;
          sr += pr;
          sg += pg;
          sb += pb;
        }
      }
      graySum[grayRow + gx] = acc;
      if (colorRow >= 0) {
        const cx = Math.floor(x0 / colorScale);
        if (cx < cw) {
          r[colorRow + cx] += sr;
          g[colorRow + cx] += sg;
          b[colorRow + cx] += sb;
        }
      }
    }
  }
  const gn = grayScale * grayScale;
  const data = new Float32Array(gw * gh);
  for (let i = 0; i < data.length; i++) data[i] = graySum[i] / gn;
  const cn = colorScale * colorScale;
  const cells: RGB[] = new Array(cw * chh);
  for (let i = 0; i < cells.length; i++) cells[i] = [Math.round(r[i] / cn), Math.round(g[i] / cn), Math.round(b[i] / cn)];
  return { gray: { data, w: gw, h: gh }, cells };
}

interface Prepared {
  gray: Gray;
  stats: WindowStats;
  cells: RGB[];
  labs: Lab[];
  /** Whether each colour cell stands out from the page's own background. */
  foreground: Uint8Array;
}

/**
 * Everything worked out from one screenshot at one size and shift. A goal is
 * graded against many submissions, so its share is kept with the snapshot
 * and worked out once. Pure: the same inputs always give the same arrays.
 */
const preparedCache = new WeakMap<PageSnapshot, Map<string, Prepared>>();
function prepare(snap: PageSnapshot, width: number, height: number, dx: number, dy: number): Prepared {
  const key = `${width}x${height}@${dx},${dy}`;
  let byKey = preparedCache.get(snap);
  const hit = byKey?.get(key);
  if (hit) return hit;
  const { gray, cells } = shrink(snap, width, height, VISUAL.structureScale, VISUAL.colorScale, dx, dy);
  const labs = cells.map(labOf);
  const bg = labOf(snap.pageBackground);
  const foreground = Uint8Array.from(labs, (l) => (deltaE00(l, bg) > VISUAL.foregroundDelta ? 1 : 0));
  const prepared: Prepared = { gray, stats: windowStats(gray, VISUAL.window), cells, labs, foreground };
  if (!byKey) {
    byKey = new Map();
    preparedCache.set(snap, byKey);
  }
  if (byKey.size >= 6) byKey.delete(byKey.keys().next().value!);
  byKey.set(key, prepared);
  return prepared;
}

// SSIM's two stabilising constants. The second is the standard value for
// noisy photographs divided by nine: rendered pages have no noise, and the
// standard value treats faint detail and no detail as nearly the same.
const C1 = (0.01 * 255) ** 2;
const C2 = (0.01 * 255) ** 2;

interface WindowStats {
  mean: Float64Array;
  variance: Float64Array;
  cols: number;
  rows: number;
}

/** Mean and variance of every window position (step 1), so shifted windows are cheap to look up. */
function windowStats(img: Gray, win: number): WindowStats {
  const cols = img.w - win + 1;
  const rows = img.h - win + 1;
  const mean = new Float64Array(Math.max(0, cols * rows));
  const variance = new Float64Array(Math.max(0, cols * rows));
  if (cols <= 0 || rows <= 0) return { mean, variance, cols: 0, rows: 0 };

  // Summed-area tables of values and squared values.
  const W = img.w + 1;
  const sum = new Float64Array(W * (img.h + 1));
  const sq = new Float64Array(W * (img.h + 1));
  for (let y = 0; y < img.h; y++) {
    let rowSum = 0;
    let rowSq = 0;
    for (let x = 0; x < img.w; x++) {
      const v = img.data[y * img.w + x];
      rowSum += v;
      rowSq += v * v;
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rowSum;
      sq[(y + 1) * W + x + 1] = sq[y * W + x + 1] + rowSq;
    }
  }
  const n = win * win;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = y * W + x;
      const b = (y + win) * W + x;
      const s = sum[b + win] - sum[b] - sum[a + win] + sum[a];
      const q = sq[b + win] - sq[b] - sq[a + win] + sq[a];
      const m = s / n;
      mean[y * cols + x] = m;
      variance[y * cols + x] = Math.max(0, q / n - m * m);
    }
  }
  return { mean, variance, cols, rows };
}

/** Structural similarity (SSIM, Wang et al. 2004) of one window in each image. */
function ssimAt(
  a: Gray,
  sa: WindowStats,
  ax: number,
  ay: number,
  b: Gray,
  sb: WindowStats,
  bx: number,
  by: number,
  win: number,
): number {
  const ma = sa.mean[ay * sa.cols + ax];
  const mb = sb.mean[by * sb.cols + bx];
  const va = sa.variance[ay * sa.cols + ax];
  const vb = sb.variance[by * sb.cols + bx];
  let cross = 0;
  for (let j = 0; j < win; j++) {
    const ra = (ay + j) * a.w + ax;
    const rb = (by + j) * b.w + bx;
    for (let i = 0; i < win; i++) cross += a.data[ra + i] * b.data[rb + i];
  }
  const cov = cross / (win * win) - ma * mb;
  return ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
}

/**
 * How well shapes, edges and text line up. Only windows with something in
 * them count, so two mostly-empty pages cannot score well on emptiness.
 * Each window may slide a few pixels to find its match, because a person
 * does not notice a few pixels.
 */
function structureScore(a: Gray, sa: WindowStats, b: Gray, sb: WindowStats): number {
  const { window: win, step, shift, activeVariance } = VISUAL;
  if (sa.cols === 0 || sa.rows === 0) return 1;

  let total = 0;
  let count = 0;
  const bestMatch = (
    from: Gray,
    sFrom: WindowStats,
    to: Gray,
    sTo: WindowStats,
    x: number,
    y: number,
  ): number => {
    let best = -1;
    for (let dy = -shift; dy <= shift; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= sTo.rows) continue;
      for (let dx = -shift; dx <= shift; dx++) {
        const tx = x + dx;
        if (tx < 0 || tx >= sTo.cols) continue;
        const v = ssimAt(from, sFrom, x, y, to, sTo, tx, ty, win);
        if (v > best) best = v;
      }
    }
    return clamp01(best);
  };

  // A window counts in proportion to its contrast (capped): bold text and
  // hard edges are what the eye goes to, a faint shadow much less. Without
  // this, faint detail on the goal would hand an empty page easy credit,
  // because faint detail and no detail are measurably close.
  const weightOf = (variance: number) => Math.min(Math.sqrt(variance), VISUAL.contrastCap);

  for (let y = 0; y < sa.rows; y += step) {
    for (let x = 0; x < sa.cols; x += step) {
      const i = y * sa.cols + x;
      if (sa.variance[i] > activeVariance) {
        const w = weightOf(sa.variance[i]);
        total += w * bestMatch(a, sa, b, sb, x, y);
        count += w;
      }
      if (sb.variance[i] > activeVariance) {
        const w = weightOf(sb.variance[i]);
        total += w * bestMatch(b, sb, a, sa, x, y);
        count += w;
      }
    }
  }
  return count === 0 ? 1 : total / count;
}

/**
 * Whether the same colours cover the same areas, on a coarse grid. Cells
 * that are plain background in both pages count for little, so a page is
 * not rewarded for being mostly empty in the same colour.
 */
function colorScore(a: Prepared, b: Prepared): number {
  let total = 0;
  let weight = 0;
  for (let i = 0; i < a.cells.length; i++) {
    const ca = a.cells[i];
    const cb = b.cells[i];
    const same = ca[0] === cb[0] && ca[1] === cb[1] && ca[2] === cb[2];
    const credit = same ? 1 : fallingCredit(deltaE00(a.labs[i], b.labs[i]), TOL.color.full, TOL.color.zero);
    // Plain background in both pages counts for little, but only while it is
    // the same colour: a recoloured band or a dark page where the goal is
    // light is a colour difference anyone sees, and counts in full.
    const w = a.foreground[i] || b.foreground[i] || credit < 1 ? 1 : VISUAL.backgroundWeight;
    total += w * credit;
    weight += w;
  }
  return weight === 0 ? 1 : total / weight;
}

/**
 * Compares two screenshots the way an eye does at a glance. The candidate
 * is first slid by (dx, dy), the page-wide shift found from matching blocks:
 * a page that is right but sits a little low still looks right. The shift
 * itself is charged for in the layout score.
 */
export function compareVisual(goal: PageSnapshot, candidate: PageSnapshot, dx = 0, dy = 0): VisualResult {
  const width = Math.min(goal.width, candidate.width);
  const height = Math.max(goal.height, candidate.height);
  const g = prepare(goal, width, height, 0, 0);
  const c = prepare(candidate, width, height, dx, dy);
  const structure = structureScore(g.gray, g.stats, c.gray, c.stats);
  const color = colorScore(g, c);

  // Both must hold: right shapes in wrong colours, or right colours in
  // wrong shapes, do not look like the goal.
  return { score: Math.sqrt(structure * color), structure, color };
}

/**
 * The mean colour of a rectangle of the screenshot, as a 2 x 2 grid of
 * quarter colours (so a chart whose bars turn red, or a picture flipped
 * dark-for-light, both show). Sampled on a grid of at most about 40 x 40
 * points, so a big picture costs no more than a small one.
 */
export function regionColours(snap: PageSnapshot, rect: { x: number; y: number; w: number; h: number }): RGB[] {
  const { pixels, width, height } = snap;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
  const out: RGB[] = [];
  for (let qy = 0; qy < 2; qy++) {
    for (let qx = 0; qx < 2; qx++) {
      const ax = x0 + Math.floor(((x1 - x0) * qx) / 2);
      const bx = x0 + Math.floor(((x1 - x0) * (qx + 1)) / 2);
      const ay = y0 + Math.floor(((y1 - y0) * qy) / 2);
      const by = y0 + Math.floor(((y1 - y0) * (qy + 1)) / 2);
      const sx = Math.max(1, Math.floor((bx - ax) / 20));
      const sy = Math.max(1, Math.floor((by - ay) / 20));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = ay; y < by; y += sy) {
        for (let x = ax; x < bx; x += sx) {
          const k = (y * width + x) * 4;
          r += pixels[k];
          g += pixels[k + 1];
          b += pixels[k + 2];
          n++;
        }
      }
      out.push(n === 0 ? [...snap.pageBackground] as RGB : [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
    }
  }
  return out;
}

const SHAPE_GRID = 12;

/** A small greyscale version of a region (SHAPE_GRID x SHAPE_GRID cells of mean brightness), and its spread. */
function regionShape(snap: PageSnapshot, rect: { x: number; y: number; w: number; h: number }): { cells: Float64Array; sd: number } {
  const { pixels, width, height } = snap;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil(rect.x + rect.w)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil(rect.y + rect.h)));
  const n = SHAPE_GRID;
  const cells = new Float64Array(n * n);
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const ax = x0 + Math.floor(((x1 - x0) * cx) / n);
      const bx = Math.max(ax + 1, x0 + Math.floor(((x1 - x0) * (cx + 1)) / n));
      const ay = y0 + Math.floor(((y1 - y0) * cy) / n);
      const by = Math.max(ay + 1, y0 + Math.floor(((y1 - y0) * (cy + 1)) / n));
      const sx = Math.max(1, Math.floor((bx - ax) / 6));
      const sy = Math.max(1, Math.floor((by - ay) / 6));
      let sum = 0;
      let k = 0;
      for (let y = ay; y < by && y < height; y += sy) {
        for (let x = ax; x < bx && x < width; x += sx) {
          const p = (y * width + x) * 4;
          sum += 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
          k++;
        }
      }
      cells[cy * n + cx] = k > 0 ? sum / k : 0;
    }
  }
  let mean = 0;
  for (const v of cells) mean += v / cells.length;
  let varSum = 0;
  for (let i = 0; i < cells.length; i++) {
    cells[i] -= mean;
    varSum += cells[i] * cells[i];
  }
  return { cells, sd: Math.sqrt(varSum / cells.length) };
}

/**
 * 0 to 1: whether two regions show the same shapes, from a small greyscale
 * version of each (the correlation of their brightness patterns). A different
 * drawing in the same colours scores low; the same picture at another size
 * scores near 1. Two plain regions show the same thing.
 */
export function regionShapeSimilarity(a: PageSnapshot, ra: { x: number; y: number; w: number; h: number }, b: PageSnapshot, rb: { x: number; y: number; w: number; h: number }): number {
  const sa = regionShape(a, ra);
  const sb = regionShape(b, rb);
  const flat = 4;
  if (sa.sd < flat && sb.sd < flat) return 1;
  if (sa.sd < flat || sb.sd < flat) return clamp01(Math.min(sa.sd, sb.sd) / flat) * 0.5;
  let cov = 0;
  for (let i = 0; i < sa.cells.length; i++) cov += sa.cells[i] * sb.cells[i];
  // The same drawing in light on dark is still the same drawing.
  return clamp01(Math.abs(cov / sa.cells.length / (sa.sd * sb.sd)));
}

/**
 * Where on the goal page the two screenshots differ most, as the centre of
 * the cells whose colour differs visibly (weighted by how much), in page
 * pixels. Null when nothing differs visibly. Used only to tell the player
 * where to look; it does not affect the score.
 */
export function differenceCentre(goal: PageSnapshot, candidate: PageSnapshot, dx = 0, dy = 0): { x: number; y: number } | null {
  const width = Math.min(goal.width, candidate.width);
  const height = Math.max(goal.height, candidate.height);
  const g = prepare(goal, width, height, 0, 0);
  const c = prepare(candidate, width, height, dx, dy);
  const cols = Math.floor(width / VISUAL.colorScale);
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let i = 0; i < g.cells.length; i++) {
    const d = deltaE00(g.labs[i], c.labs[i]);
    if (d <= TOL.color.full) continue;
    sx += d * ((i % cols) + 0.5) * VISUAL.colorScale;
    sy += d * (Math.floor(i / cols) + 0.5) * VISUAL.colorScale;
    sw += d;
  }
  return sw === 0 ? null : { x: sx / sw, y: sy / sw };
}
