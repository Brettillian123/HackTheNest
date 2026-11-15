import type { Block, RGB, Rect, TextStyle } from './types';

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
  box?: {
    background: RGB;
    /** The box has a fill of its own that differs from what is behind it. */
    fill: boolean;
    sampleBackground: boolean;
    hasBorder: boolean;
    borderColor: RGB | null;
    radius: number;
    shadow: boolean;
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
  return tally.dominant() ?? [255, 255, 255];
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
export function mergeTextLines(blocks: Block[]): Block[] {
  const others = blocks.filter((b) => b.kind !== 'text');
  const texts = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.kind === 'text')
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

/** Checks every raw block against the screenshot and returns the blocks a person can see. */
export function refineBlocks(raw: RawBlock[], pixels: Uint8Array, width: number, height: number): Block[] {
  const seen: Block[] = [];
  for (const b of raw) {
    if (b.kind === 'text') {
      if (!b.text || !b.textStyle) continue;
      const look = inspectText(pixels, width, height, b.rect, b.textStyle.color);
      if (!look.visible) continue;
      seen.push({ kind: 'text', rect: b.rect, behind: look.behind, text: b.text, textStyle: b.textStyle });
    } else if (b.kind === 'box') {
      if (!b.box || !boxVisible(pixels, width, height, b.rect, b.box)) continue;
      seen.push({
        kind: 'box',
        rect: b.rect,
        behind: b.sample ? dominantColor(pixels, width, height, b.rect, 'around') : b.behind,
        boxStyle: {
          background: b.box.sampleBackground ? dominantColor(pixels, width, height, b.rect) : b.box.background,
          hasBorder: b.box.hasBorder,
          borderColor: b.box.borderColor,
          radius: b.box.radius,
          shadow: b.box.shadow,
        },
      });
    } else {
      if (!clip(b.rect, width, height)) continue;
      seen.push({
        kind: 'image',
        rect: b.rect,
        behind: b.sample ? dominantColor(pixels, width, height, b.rect, 'around') : b.behind,
      });
    }
  }
  return mergeTextLines(seen);
}
