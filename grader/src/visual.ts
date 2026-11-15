import { deltaE00, rgbToLab, type Lab } from './color';
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
 * Reads one pixel of a page as if the page were shifted by (dx, dy) and
 * continued forever in its background colour.
 */
function makeReader(snap: PageSnapshot, dx: number, dy: number) {
  const { pixels, width, height, pageBackground } = snap;
  return (x: number, y: number, out: Float32Array | number[]): void => {
    const px = x + dx;
    const py = y + dy;
    if (px < 0 || py < 0 || px >= width || py >= height) {
      out[0] = pageBackground[0];
      out[1] = pageBackground[1];
      out[2] = pageBackground[2];
      return;
    }
    const i = (py * width + px) * 4;
    out[0] = pixels[i];
    out[1] = pixels[i + 1];
    out[2] = pixels[i + 2];
  };
}

/** Brightness, averaged over scale x scale squares. A mild blur: small shifts stop mattering. */
function shrinkGray(snap: PageSnapshot, width: number, height: number, scale: number, dx: number, dy: number): Gray {
  const w = Math.floor(width / scale);
  const h = Math.floor(height / scale);
  const data = new Float32Array(w * h);
  const read = makeReader(snap, dx, dy);
  const rgb = [0, 0, 0];
  const n = scale * scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let j = 0; j < scale; j++) {
        for (let i = 0; i < scale; i++) {
          read(x * scale + i, y * scale + j, rgb);
          sum += 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
        }
      }
      data[y * w + x] = sum / n;
    }
  }
  return { data, w, h };
}

/** Mean colour of each scale x scale cell. */
function shrinkColor(snap: PageSnapshot, width: number, height: number, scale: number, dx: number, dy: number): RGB[] {
  const w = Math.floor(width / scale);
  const h = Math.floor(height / scale);
  const cells: RGB[] = new Array(w * h);
  const read = makeReader(snap, dx, dy);
  const rgb = [0, 0, 0];
  const n = scale * scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < scale; j++) {
        for (let i = 0; i < scale; i++) {
          read(x * scale + i, y * scale + j, rgb);
          r += rgb[0];
          g += rgb[1];
          b += rgb[2];
        }
      }
      cells[y * w + x] = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    }
  }
  return cells;
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
function structureScore(a: Gray, b: Gray): number {
  const { window: win, step, shift, activeVariance } = VISUAL;
  const sa = windowStats(a, win);
  const sb = windowStats(b, win);
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
function colorScore(a: RGB[], aBackground: RGB, b: RGB[], bBackground: RGB): number {
  const cache = new Map<number, Lab>();
  const lab = (c: RGB): Lab => {
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    let v = cache.get(key);
    if (!v) {
      v = rgbToLab(c);
      cache.set(key, v);
    }
    return v;
  };
  const bgA = lab(aBackground);
  const bgB = lab(bBackground);
  let total = 0;
  let weight = 0;
  for (let i = 0; i < a.length; i++) {
    const la = lab(a[i]);
    const lb = lab(b[i]);
    const same = a[i][0] === b[i][0] && a[i][1] === b[i][1] && a[i][2] === b[i][2];
    const credit = same ? 1 : fallingCredit(deltaE00(la, lb), TOL.color.full, TOL.color.zero);
    const foreground =
      deltaE00(la, bgA) > VISUAL.foregroundDelta || deltaE00(lb, bgB) > VISUAL.foregroundDelta;
    const w = foreground ? 1 : VISUAL.backgroundWeight;
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

  const grayGoal = shrinkGray(goal, width, height, VISUAL.structureScale, 0, 0);
  const grayCand = shrinkGray(candidate, width, height, VISUAL.structureScale, dx, dy);
  const structure = structureScore(grayGoal, grayCand);

  const cellsGoal = shrinkColor(goal, width, height, VISUAL.colorScale, 0, 0);
  const cellsCand = shrinkColor(candidate, width, height, VISUAL.colorScale, dx, dy);
  const color = colorScore(cellsGoal, goal.pageBackground, cellsCand, candidate.pageBackground);

  // Both must hold: right shapes in wrong colours, or right colours in
  // wrong shapes, do not look like the goal.
  return { score: Math.sqrt(structure * color), structure, color };
}
