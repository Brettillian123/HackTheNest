import type { Block, BlockRole, RGB, Rect, TextStyle } from './types';

/**
 * Turns what the page says is there into what a person can actually see.
 *
 * The page's own styles cannot be trusted for that: something else may be
 * drawn on top, text may sit over a positioned background, and two pages can
 * split the same lines of text into different elements. So the screenshot
 * has the last word on visibility and background colour, and text that reads
 * as one paragraph is treated as one block however it was built.
 */

/** Block as reported by the in-page extractor, before the screenshot is consulted. */
export interface RawBlock {
  kind: 'text' | 'box' | 'image';
  rect: Rect;
  behind: RGB;
  /** The colour behind could not be worked out from styles (a gradient or picture is involved). */
  sample: boolean;
  text?: string;
  textStyle?: TextStyle;
  /** For text: each line it is drawn on, already cut to what clipping lets show. */
  lines?: Rect[];
  /** What the markup says the thing is. A naming hint for feedback only. */
  role?: BlockRole | null;
  /** The opacity the element and its ancestors multiply to (1 = none). */
  alpha?: number;
  /** A filter, blend mode or opacity changes this element's colours on screen. */
  altered?: boolean;
  /** For text: the colour named by the styles must be checked against the screenshot (form fields). */
  checkColor?: boolean;
  box?: {
    background: RGB;
    /** The box has a fill of its own that differs from what is behind it. */
    fill: boolean;
    sampleBackground: boolean;
    hasBorder: boolean;
    borderColor: RGB | null;
    /** Width of the widest visible border side, in px. */
    borderWidth: number;
    /** Share of the box's area painted by its visible borders, 0 to 1. */
    borderShare: number;
    radius: number;
    shadow: boolean;
    /** The border is drawn in shades of its colour (inset, outset, groove, ridge): look for any edge that stands out. */
    sampleBorder?: boolean;
  };
}

/** Two colours closer than this on every channel count as the same paint. */
const SAME_PAINT = 12;

interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function clip(rect: Rect, width: number, height: number, grow = 0): Area | null {
  const x0 = Math.max(0, Math.floor(rect.x) - grow);
  const y0 = Math.max(0, Math.floor(rect.y) - grow);
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w) + grow);
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h) + grow);
  return x1 <= x0 || y1 <= y0 ? null : { x0, y0, x1, y1 };
}

function gap(pixels: Uint8Array, i: number, c: RGB): number {
  return Math.max(Math.abs(pixels[i] - c[0]), Math.abs(pixels[i + 1] - c[1]), Math.abs(pixels[i + 2] - c[2]));
}

/** Counts colours in coarse bins and returns the average colour of the fullest bin. */
class ColorTally {
  private readonly bins = new Map<number, { n: number; r: number; g: number; b: number }>();

  add(r: number, g: number, b: number): void {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = this.bins.get(key);
    if (bin) {
      bin.n++;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    } else {
      this.bins.set(key, { n: 1, r, g, b });
    }
  }

  dominant(): RGB | null {
    let bestKey = -1;
    let best: { n: number; r: number; g: number; b: number } | null = null;
    for (const [key, bin] of this.bins) {
      // Ties go to the lower key, so the answer never depends on scan order.
      if (!best || bin.n > best.n || (bin.n === best.n && key < bestKey)) {
        best = bin;
        bestKey = key;
      }
    }
    return best ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)] : null;
  }

  /**
   * The colour a person would name for the area. Where one paint clearly
   * covers it, that paint. Where none does (a gradient, a photo), the average
   * colour: otherwise a change too small to see could swing the answer from
   * one end of a gradient to the other. Between the two it blends smoothly.
   */
  typical(): RGB | null {
    const top = this.dominant();
    if (!top) return null;
    let n = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let topN = 0;
    const topKey = ((top[0] >> 3) << 10) | ((top[1] >> 3) << 5) | (top[2] >> 3);
    for (const [key, bin] of this.bins) {
      n += bin.n;
      r += bin.r;
      g += bin.g;
      b += bin.b;
      if (key === topKey) topN = bin.n;
    }
    const share = topN / n;
    const k = share >= 0.6 ? 1 : share <= 0.25 ? 0 : (share - 0.25) / 0.35;
    if (k === 1) return top;
    return [
      Math.round(k * top[0] + (1 - k) * (r / n)),
      Math.round(k * top[1] + (1 - k) * (g / n)),
      Math.round(k * top[2] + (1 - k) * (b / n)),
    ];
  }
}

/**
 * The most common colour inside a rectangle of the screenshot, or (with
 * 'around') in a thin ring just outside it.
 */
export function dominantColor(
  pixels: Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  where: 'inside' | 'around' = 'inside',
): RGB {
  const ring = where === 'around';
  const area = clip(rect, width, height, ring ? 3 : 0);
  if (!area) return [255, 255, 255];
  const { x0, y0, x1, y1 } = area;
  // At most about 4,000 samples inside, on a fixed grid; every pixel of a ring.
  const stepX = ring ? 1 : Math.max(1, Math.floor((x1 - x0) / 64));
  const stepY = ring ? 1 : Math.max(1, Math.floor((y1 - y0) / 64));
  const tally = new ColorTally();
  for (let y = y0; y < y1; y += stepY) {
    const edgeRow = y - y0 < 2 || y1 - 1 - y < 2;
    for (let x = x0; x < x1; x += stepX) {
      if (ring && !edgeRow && x - x0 >= 2 && x1 - 1 - x >= 2) continue;
      const i = (y * width + x) * 4;
      tally.add(pixels[i], pixels[i + 1], pixels[i + 2]);
    }
  }
  return tally.typical() ?? [255, 255, 255];
}

/**
 * Looks at the screenshot where a piece of text should be. Returns the
 * colour behind the text (the most common colour there that is not the
 * text's own), and whether any text can be seen at all. Text that is
 * covered, clipped away, or the same colour as its background leaves a
 * uniform patch: nothing to read.
 */
export function inspectText(
  pixels: Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  textColor: RGB,
): { behind: RGB; visible: boolean } {
  const area = clip(rect, width, height);
  if (!area) return { behind: [255, 255, 255], visible: false };
  const { x0, y0, x1, y1 } = area;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 20000)));

  const tally = new ColorTally();
  let samples = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      samples++;
      if (gap(pixels, i, textColor) > SAME_PAINT) tally.add(pixels[i], pixels[i + 1], pixels[i + 2]);
    }
  }
  const behind = tally.dominant();
  // Every pixel is the text's own colour: there is nothing to read it against.
  if (!behind) return { behind: textColor, visible: false };

  let ink = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      if (gap(pixels, (y * width + x) * 4, behind) > SAME_PAINT) ink++;
    }
  }
  return { behind, visible: ink >= Math.max(3, Math.ceil(samples * 0.003)) };
}

/**
 * Whether the patch where a text should be holds colours that are neither
 * the text's, its background's, nor a blend of the two (the soft edges of
 * letters). Then something else is drawn there, over or under the text (a
 * picture, a gradient, a panel), and only the text's own ink can say what
 * shows. Plain text on a plain background never needs that check.
 */
export function needsInkCheck(pixels: Uint8Array, width: number, height: number, rect: Rect, textColor: RGB): boolean {
  const area = clip(rect, width, height);
  if (!area) return false;
  const look = inspectText(pixels, width, height, rect, textColor);
  const b = look.behind;
  const d = [textColor[0] - b[0], textColor[1] - b[1], textColor[2] - b[2]];
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const { x0, y0, x1, y1 } = area;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 20000)));
  let samples = 0;
  let odd = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      samples++;
      const p = [pixels[i] - b[0], pixels[i + 1] - b[1], pixels[i + 2] - b[2]];
      const a = dd > 0 ? Math.min(1, Math.max(0, (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / dd)) : 0;
      const off = Math.max(Math.abs(p[0] - a * d[0]), Math.abs(p[1] - a * d[1]), Math.abs(p[2] - a * d[2]));
      if (off > 2 * SAME_PAINT) odd++;
    }
  }
  return odd >= Math.max(3, Math.ceil(samples * 0.01));
}

/**
 * Share of a text's lines where its own glyphs can be seen, from two
 * screenshots of the page: as it is, and with every piece of text made
 * see-through (`bare`). A pixel that differs between the two is the text's
 * own ink, whatever it is drawn over (a photo, a gradient) and whatever is
 * drawn over it (a picture, a panel, with or without pointer-events). Each
 * line is cut into cells about half a line tall and half a letter wide; a
 * cell counts when any of its pixels show ink, so the answer is the share of
 * the text's area that a reader can actually see.
 */
export function inkShare(
  pixels: Uint8Array,
  bare: Uint8Array,
  width: number,
  height: number,
  lines: Rect[],
  fontSize: number,
): number {
  const cell = Math.max(2, 0.6 * fontSize);
  let cells = 0;
  let inked = 0;
  for (const line of lines) {
    const area = clip(line, width, height);
    if (!area) {
      // Off the screenshot (below the captured height): nothing shows there.
      const n = Math.max(1, Math.round(line.w / cell)) * Math.max(1, Math.round(line.h / cell));
      cells += n;
      continue;
    }
    const cols = Math.max(1, Math.round((area.x1 - area.x0) / cell));
    const rows = Math.max(1, Math.round((area.y1 - area.y0) / cell));
    for (let r = 0; r < rows; r++) {
      const cy0 = area.y0 + Math.floor(((area.y1 - area.y0) * r) / rows);
      const cy1 = area.y0 + Math.floor(((area.y1 - area.y0) * (r + 1)) / rows);
      for (let c = 0; c < cols; c++) {
        const cx0 = area.x0 + Math.floor(((area.x1 - area.x0) * c) / cols);
        const cx1 = area.x0 + Math.floor(((area.x1 - area.x0) * (c + 1)) / cols);
        cells++;
        let hit = false;
        for (let y = cy0; y < cy1 && !hit; y++) {
          for (let x = cx0; x < cx1; x++) {
            const i = (y * width + x) * 4;
            if (
              Math.max(Math.abs(pixels[i] - bare[i]), Math.abs(pixels[i + 1] - bare[i + 1]), Math.abs(pixels[i + 2] - bare[i + 2])) >
              SAME_PAINT
            ) {
              hit = true;
              break;
            }
          }
        }
        if (hit) inked++;
      }
    }
  }
  return cells === 0 ? 0 : inked / cells;
}

/**
 * Text counts as seen when at least this share of it shows its own ink.
 * Fully visible text measures 0.8 to 1 (lines that mix sizes are lowest);
 * a label whose top half is hidden under a picture measures about 0.55.
 */
export const MIN_INK_SHARE = 0.7;

/**
 * Whether anything can be seen in a rectangle of the screenshot (taken a
 * couple of pixels wider, so a plain coloured button shows against what
 * surrounds it). A patch of one flat colour has nothing in it. Used for
 * links: a link nobody can see or click is not a link.
 */
export function hasInk(pixels: Uint8Array, width: number, height: number, rect: Rect): boolean {
  if (rect.w < 1 || rect.h < 1) return false;
  const area = clip(rect, width, height, 2);
  if (!area) return false;
  const { x0, y0, x1, y1 } = area;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 20000)));
  const tally = new ColorTally();
  let samples = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      samples++;
      tally.add(pixels[i], pixels[i + 1], pixels[i + 2]);
    }
  }
  const flat = tally.dominant();
  if (!flat) return false;
  let ink = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      if (gap(pixels, (y * width + x) * 4, flat) > SAME_PAINT) ink++;
    }
  }
  return ink >= Math.max(3, Math.ceil(samples * 0.003));
}

/** Share of a rectangle (or of a 3-pixel band along its inside edge) painted in one colour. */
function paintShare(pixels: Uint8Array, width: number, area: Area, color: RGB, edgeOnly: boolean): number {
  const { x0, y0, x1, y1 } = area;
  const step = edgeOnly ? 1 : Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4096)));
  let total = 0;
  let hits = 0;
  for (let y = y0; y < y1; y += step) {
    const edgeRow = y - y0 < 3 || y1 - 1 - y < 3;
    for (let x = x0; x < x1; x += step) {
      if (edgeOnly && !edgeRow && x - x0 >= 3 && x1 - 1 - x >= 3) continue;
      total++;
      if (gap(pixels, (y * width + x) * 4, color) <= SAME_PAINT) hits++;
    }
  }
  return total === 0 ? 0 : hits / total;
}

/**
 * Whether a box's fill or border actually shows in the screenshot. A box
 * hidden under something else, or wholly covered by its own children, is
 * not there as far as a person is concerned.
 */
export function boxVisible(
  pixels: Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  box: NonNullable<RawBlock['box']>,
): boolean {
  const area = clip(rect, width, height);
  if (!area) return false;
  if (box.sampleBackground) return true; // A gradient or picture: no single colour to look for.
  if (box.fill && paintShare(pixels, width, area, box.background, false) >= 0.03) return true;
  if (box.hasBorder && box.borderColor && paintShare(pixels, width, area, box.borderColor, true) >= 0.01) {
    return true;
  }
  // Only a shadow marks this box out, and a shadow has no colour to look for.
  return box.shadow && !box.fill && !box.hasBorder;
}

const gap3 = (a: RGB, b: RGB) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const rgb = (f: (i: number) => number): RGB =>
  [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(f(i))))) as RGB;

/**
 * The colours a style colour can show as when the page is tinted, faded or
 * filtered, worked out from what the colour behind it was meant to be
 * (`meant`) and what the screenshot shows there (`seen`): faded or laid
 * under an even veil (the difference from the background shrinks), darkened
 * or lightened on every channel, and, when a filter is in play, turned grey.
 */
function toned(color: RGB, meant: RGB, seen: RGB, alpha: number, filtered: boolean): RGB[] {
  const out: RGB[] = [
    rgb((i) => seen[i] + alpha * (color[i] - meant[i])),
    rgb((i) => (meant[i] >= 16 ? (color[i] * seen[i]) / meant[i] : color[i])),
    rgb((i) => (meant[i] <= 239 ? 255 - ((255 - color[i]) * (255 - seen[i])) / (255 - meant[i]) : color[i])),
  ];
  if (filtered) {
    const g = lum(color);
    const gm = lum(meant);
    out.push(rgb((i) => g + (seen[i] - gm)));
    out.push(rgb((i) => seen[i] + alpha * (g - gm)));
  }
  return out;
}

/** The average of the pixels in an area that are close to a colour: the colour as the screen shows it. */
function meanNear(pixels: Uint8Array, width: number, area: Area, color: RGB, edgeOnly: boolean): RGB {
  const { x0, y0, x1, y1 } = area;
  const step = edgeOnly ? 1 : Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4096)));
  let n = 0;
  const sum = [0, 0, 0];
  for (let y = y0; y < y1; y += step) {
    const edgeRow = y - y0 < 3 || y1 - 1 - y < 3;
    for (let x = x0; x < x1; x += step) {
      if (edgeOnly && !edgeRow && x - x0 >= 3 && x1 - 1 - x >= 3) continue;
      const i = (y * width + x) * 4;
      if (gap(pixels, i, color) > SAME_PAINT) continue;
      n++;
      sum[0] += pixels[i];
      sum[1] += pixels[i + 1];
      sum[2] += pixels[i + 2];
    }
  }
  return n === 0 ? color : [Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)];
}

/** Whether the colours on screen around a block differ from what its styles name. */
function isToned(b: RawBlock, seenBehind: RGB): boolean {
  return !!b.altered || (b.alpha ?? 1) < 1 || gap3(seenBehind, b.behind) > 4;
}

/**
 * A box as it shows on screen, or null when it cannot be seen. Its colours
 * are the styles' colours when those are on screen. When the page is
 * tinted, faded or filtered (a veil over the page, greyscale, opacity), the
 * styles' colours are nowhere in the screenshot, but the box still stands
 * out from what is around it: it is found by the colour it shows instead,
 * and that colour is what is recorded.
 */
function seeBox(
  pixels: Uint8Array,
  width: number,
  height: number,
  b: RawBlock,
): { background: RGB; behind: RGB; borderColor: RGB | null } | null {
  const box = b.box!;
  const area = clip(b.rect, width, height);
  if (!area) return null;
  const around = () => dominantColor(pixels, width, height, b.rect, 'around');
  const plainBehind = () => (b.sample ? around() : b.behind);
  if (box.sampleBackground) {
    return { background: dominantColor(pixels, width, height, b.rect), behind: plainBehind(), borderColor: box.borderColor };
  }
  if (box.fill && paintShare(pixels, width, area, box.background, false) >= 0.03) {
    return { background: box.background, behind: plainBehind(), borderColor: box.borderColor };
  }
  if (!b.sample) {
    const seen = around();
    if (isToned(b, seen)) {
      const alpha = b.alpha ?? 1;
      const fills = toned(box.background, b.behind, seen, alpha, !!b.altered);
      if (box.fill) {
        for (const c of fills) {
          if (gap3(c, seen) > 3 && paintShare(pixels, width, area, c, false) >= 0.03) {
            const border = box.borderColor ? toned(box.borderColor, b.behind, seen, alpha, !!b.altered)[fills.indexOf(c)] : null;
            return {
              background: meanNear(pixels, width, area, c, false),
              behind: seen,
              borderColor: border ? meanNear(pixels, width, area, border, true) : null,
            };
          }
        }
      }
      if (box.hasBorder && box.borderColor) {
        const borders = toned(box.borderColor, b.behind, seen, alpha, !!b.altered);
        for (let k = 0; k < borders.length; k++) {
          if (gap3(borders[k], seen) > 3 && paintShare(pixels, width, area, borders[k], true) >= 0.01) {
            return {
              background: box.fill ? meanNear(pixels, width, area, fills[k], false) : seen,
              behind: seen,
              borderColor: meanNear(pixels, width, area, borders[k], true),
            };
          }
        }
      }
    }
  }
  if (box.hasBorder && box.borderColor && paintShare(pixels, width, area, box.borderColor, true) >= 0.01) {
    return { background: box.background, behind: plainBehind(), borderColor: box.borderColor };
  }
  if (box.hasBorder && box.sampleBorder) {
    // The edge's own most common colour, against what is around the box.
    const tally = new ColorTally();
    for (let y = area.y0; y < area.y1; y++) {
      const edgeRow = y - area.y0 < 2 || area.y1 - 1 - y < 2;
      for (let x = area.x0; x < area.x1; x++) {
        if (!edgeRow && x - area.x0 >= 2 && area.x1 - 1 - x >= 2) continue;
        const i = (y * width + x) * 4;
        tally.add(pixels[i], pixels[i + 1], pixels[i + 2]);
      }
    }
    const edge = tally.dominant();
    const seen = around();
    if (edge && gap3(edge, seen) > SAME_PAINT) return { background: box.background, behind: plainBehind(), borderColor: edge };
  }
  // Only a shadow marks this box out, and a shadow has no colour to look for.
  if (box.shadow && !box.fill && !box.hasBorder) {
    return { background: box.background, behind: plainBehind(), borderColor: box.borderColor };
  }
  return null;
}

/** How many sampled pixels of a rectangle are painted in one colour. */
function hits(pixels: Uint8Array, width: number, height: number, rect: Rect, color: RGB): number {
  const area = clip(rect, width, height);
  if (!area) return 0;
  const { x0, y0, x1, y1 } = area;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 20000)));
  let n = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      if (gap(pixels, (y * width + x) * 4, color) <= SAME_PAINT) n++;
    }
  }
  return n;
}

/**
 * The colour a text is drawn in on screen. The styles' colour when it shows;
 * on a tinted, faded or filtered page the toned colour that shows most; for
 * a form field whose colour shows nowhere (a placeholder drawn in the
 * browser's own grey), the colour its ink shows most.
 */
function textColor(pixels: Uint8Array, width: number, height: number, b: RawBlock, seenBehind: RGB): RGB {
  const css = b.textStyle!.color;
  const toneHere = !b.sample && isToned(b, seenBehind);
  if (!toneHere && !b.checkColor) return css;
  const own = hits(pixels, width, height, b.rect, css);
  // The styles' colour is on screen: that is the colour.
  if (own >= 3) return css;
  let best = css;
  let bestN = own;
  if (toneHere) {
    for (const c of toned(css, b.behind, seenBehind, b.alpha ?? 1, !!b.altered)) {
      if (gap3(c, seenBehind) <= SAME_PAINT) continue;
      const n = hits(pixels, width, height, b.rect, c);
      if (n > bestN) {
        best = c;
        bestN = n;
      }
    }
  }
  if (bestN >= 3) {
    const area = clip(b.rect, width, height);
    return area && best !== css ? meanNear(pixels, width, area, best, false) : best;
  }
  if (!b.checkColor) return best;
  // Nothing in the styles' colour: take the ink's own most common colour.
  const area = clip(b.rect, width, height);
  if (!area) return best;
  const tally = new ColorTally();
  for (let y = area.y0; y < area.y1; y++) {
    for (let x = area.x0; x < area.x1; x++) {
      const i = (y * width + x) * 4;
      if (gap(pixels, i, seenBehind) > 2 * SAME_PAINT) tally.add(pixels[i], pixels[i + 1], pixels[i + 2]);
    }
  }
  return tally.dominant() ?? best;
}

function sameText(a: TextStyle, b: TextStyle): boolean {
  return (
    Math.abs(a.fontSize - b.fontSize) <= 0.5 &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.fontClass === b.fontClass &&
    Math.max(Math.abs(a.color[0] - b.color[0]), Math.abs(a.color[1] - b.color[1]), Math.abs(a.color[2] - b.color[2])) <=
      SAME_PAINT
  );
}

function sameColor(a: RGB, b: RGB): boolean {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <= SAME_PAINT;
}

/**
 * Joins text blocks that read as consecutive lines of one paragraph: same
 * font, size and colour, lined up with each other, and no more than a line
 * gap apart. Four lines made with line breaks and four lines made with four
 * elements look the same, so they must become the same block.
 */
/**
 * A gap between two pieces of text on one line, in font sizes, from which a
 * reader sees two separate items rather than two words. Wider for monospace,
 * whose word space is already 0.6 of a font size. Must match the extractor.
 */
export const SPLIT_EM = { normal: 0.5, mono: 1.1 };

/**
 * Joins pieces of text that sit side by side on one line closer than a
 * reader would see as separate items: same font, size and colour, same
 * height and line, and a gap narrower than SPLIT_EM. Two inline-block spans
 * with a space between them read as the sentence a plain paragraph makes.
 */
function joinSideBySide(texts: Block[]): Block[] {
  const sorted = texts
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.rect.x - b.block.rect.x || a.block.rect.y - b.block.rect.y || a.index - b.index)
    .map(({ block }) => block);
  const rows: Block[] = [];
  for (const piece of sorted) {
    const style = piece.textStyle!;
    const q = piece.rect;
    let target: Block | null = null;
    for (const row of rows) {
      if (!sameText(row.textStyle!, style) || !sameColor(row.behind, piece.behind)) continue;
      const p = row.rect;
      // One line each, the same line.
      if (p.h > 1.6 * style.fontSize * 1.25 || q.h > 1.6 * style.fontSize * 1.25) continue;
      if (Math.abs(p.y - q.y) > 0.25 * style.fontSize || Math.abs(p.h - q.h) > 0.25 * style.fontSize) continue;
      const gapPx = q.x - (p.x + p.w);
      const limit = (style.fontClass === 'mono' ? SPLIT_EM.mono : SPLIT_EM.normal) * style.fontSize;
      if (gapPx < -1 || gapPx >= limit) continue;
      target = row;
      break;
    }
    if (!target) {
      rows.push({ ...piece, rect: { ...piece.rect } });
      continue;
    }
    const p = target.rect;
    const gapPx = q.x - (p.x + p.w);
    const x1 = Math.max(p.x + p.w, q.x + q.w);
    const y0 = Math.min(p.y, q.y);
    const y1 = Math.max(p.y + p.h, q.y + q.h);
    target.rect = { x: p.x, y: y0, w: Math.round((x1 - p.x) * 10) / 10, h: Math.round((y1 - y0) * 10) / 10 };
    target.text = `${target.text ?? ''}${gapPx > 0.12 * style.fontSize ? ' ' : ''}${piece.text ?? ''}`.trim();
  }
  return rows;
}

export function mergeTextLines(blocks: Block[]): Block[] {
  const others = blocks.filter((b) => b.kind !== 'text');
  const texts = joinSideBySide(blocks.filter((b) => b.kind === 'text'))
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.rect.y - b.block.rect.y || a.block.rect.x - b.block.rect.x || a.index - b.index)
    .map(({ block }) => block);

  const merged: Block[] = [];
  for (const line of texts) {
    const style = line.textStyle!;
    let target: Block | null = null;
    for (const para of merged) {
      const p = para.rect;
      const l = line.rect;
      if (!sameText(para.textStyle!, style) || !sameColor(para.behind, line.behind)) continue;
      const gapBelow = l.y - (p.y + p.h);
      if (gapBelow < -0.35 * style.fontSize || gapBelow > 0.75 * style.fontSize) continue;
      const overlap = Math.min(p.x + p.w, l.x + l.w) - Math.max(p.x, l.x);
      if (overlap < 0.5 * Math.min(p.w, l.w)) continue;
      const aligned =
        Math.abs(p.x - l.x) <= 3 ||
        Math.abs(p.x + p.w - (l.x + l.w)) <= 3 ||
        Math.abs(p.x + p.w / 2 - (l.x + l.w / 2)) <= 3;
      if (!aligned) continue;
      target = para;
      break;
    }
    if (!target) {
      merged.push({ ...line, rect: { ...line.rect } });
      continue;
    }
    const p = target.rect;
    const l = line.rect;
    const x0 = Math.min(p.x, l.x);
    const y0 = Math.min(p.y, l.y);
    const x1 = Math.max(p.x + p.w, l.x + l.w);
    const y1 = Math.max(p.y + p.h, l.y + l.h);
    target.rect = { x: x0, y: y0, w: Math.round((x1 - x0) * 10) / 10, h: Math.round((y1 - y0) * 10) / 10 };
    target.text = `${target.text ?? ''} ${line.text ?? ''}`.trim();
  }
  return [...others, ...merged];
}

/**
 * Checks every raw block against the screenshot and returns the blocks a
 * person can see. `bare` is a second screenshot of the same page with all
 * text made see-through, valid for the text blocks in `bare.check` (those
 * needsInkCheck picked); those count as seen only where their own ink shows.
 * Other text uses the plain test: anything but one flat colour where the
 * text should be, which is exact for plain text on a plain background.
 */
export function refineBlocks(
  raw: RawBlock[],
  pixels: Uint8Array,
  width: number,
  height: number,
  bare?: { pixels: Uint8Array; check: Set<RawBlock> },
): Block[] {
  const seen: Block[] = [];
  const withRole = <T extends Block>(block: T, role: BlockRole | null | undefined): T =>
    role ? { ...block, role } : block;
  for (const b of raw) {
    if (b.kind === 'text') {
      if (!b.text || !b.textStyle) continue;
      const look = inspectText(pixels, width, height, b.rect, b.textStyle.color);
      let visible = look.visible;
      if (bare && bare.check.has(b) && bare.pixels.length === pixels.length) {
        const share = inkShare(pixels, bare.pixels, width, height, b.lines?.length ? b.lines : [b.rect], b.textStyle.fontSize);
        visible = b.lines?.length ? share >= MIN_INK_SHARE : share > 0;
      }
      if (!visible) continue;
      const color = textColor(pixels, width, height, b, look.behind);
      const textStyle = color === b.textStyle.color ? b.textStyle : { ...b.textStyle, color };
      seen.push(withRole({ kind: 'text', rect: b.rect, behind: look.behind, text: b.text, textStyle }, b.role));
    } else if (b.kind === 'box') {
      const shown = b.box ? seeBox(pixels, width, height, b) : null;
      if (!b.box || !shown) continue;
      seen.push(withRole({
        kind: 'box',
        rect: b.rect,
        behind: shown.behind,
        boxStyle: {
          background: shown.background,
          hasBorder: b.box.hasBorder,
          borderColor: shown.borderColor,
          borderWidth: b.box.borderWidth ?? 0,
          borderShare: b.box.borderShare ?? 0,
          radius: b.box.radius,
          shadow: b.box.shadow,
        },
      }, b.role));
    } else {
      if (!clip(b.rect, width, height)) continue;
      seen.push({
        kind: 'image',
        rect: b.rect,
        behind: b.sample || b.altered ? dominantColor(pixels, width, height, b.rect, 'around') : b.behind,
      });
    }
  }
  return mergeTextLines(seen);
}
