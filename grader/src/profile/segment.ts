/**
 * Breaks a page's blocks into a tree of regions by what is on screen:
 * containers (a box holding other blocks), bands and columns found with
 * recursive X-Y cuts, and runs of look-alike siblings made into groups.
 * Only rectangles and looks are used, never block order or markup, so two
 * pages that look the same give the same tree.
 */
import type { Block, PageSnapshot, Rect } from '../types';

/** A block and the blocks drawn inside it. */
export interface Unit {
  idx: number;
  rect: Rect;
  kids: Unit[];
}

export interface Node {
  kind: 'leaf' | 'group' | 'region';
  /** The box that frames this node, if any. */
  container: number | null;
  /** Blocks of this node that are in none of its children. */
  own: number[];
  children: Node[];
  rect: Rect;
  /** A region with no frame of its own: its children move up into its parent. */
  flatten?: boolean;
  /** For groups: how the items sit. */
  axis?: 'x' | 'y';
}

const MAX_DEPTH = 3;
const TOL = 1;

export function area(r: Rect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function union(rects: Rect[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function contains(outer: Rect, inner: Rect, tol = TOL): boolean {
  return inner.x >= outer.x - tol && inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
}

/** Reading-order key that never depends on block order. */
function geoCompare(blocks: Block[], a: number, b: number): number {
  const ra = blocks[a].rect, rb = blocks[b].rect;
  return (Math.round(ra.y) - Math.round(rb.y)) || (Math.round(ra.x) - Math.round(rb.x)) ||
    (area(rb) - area(ra)) || (kindRank(blocks[a]) - kindRank(blocks[b])) ||
    ((blocks[a].text ?? '') < (blocks[b].text ?? '') ? -1 : (blocks[a].text ?? '') > (blocks[b].text ?? '') ? 1 : 0) || a - b;
}

function kindRank(b: Block): number {
  return b.kind === 'box' ? 0 : b.kind === 'image' ? 1 : 2;
}

export function allBlocks(u: Unit): number[] {
  const out = [u.idx];
  for (const k of u.kids) out.push(...allBlocks(k));
  return out;
}

export interface SegmentContext {
  blocks: Block[];
  snapshot: PageSnapshot;
}

/**
 * Builds the containment forest: each block goes inside the smallest box
 * that holds it. A box covering the whole page is a backdrop, not a frame:
 * it is returned apart so the same page with or without a wrapper gives the
 * same tree.
 */
export function buildUnits(snapshot: PageSnapshot): { roots: Unit[]; backdrops: number[] } {
  const blocks = snapshot.blocks;
  const n = blocks.length;
  const backdrops: number[] = [];
  const isBackdrop = (i: number) => {
    const b = blocks[i];
    return b.kind === 'box' && b.rect.x <= 2 && b.rect.y <= 2 &&
      b.rect.w >= snapshot.width * 0.98 && b.rect.h >= snapshot.height * 0.95;
  };
  // Larger first; identical rectangles fall back to a geometry key so the
  // order does not depend on markup order.
  const order = [...Array(n).keys()].sort((a, b) => (area(blocks[b].rect) - area(blocks[a].rect)) ||
    (kindRank(blocks[a]) - kindRank(blocks[b])) || geoCompare(blocks, a, b));
  const units = new Map<number, Unit>();
  const roots: Unit[] = [];
  const placed: number[] = [];
  for (const i of order) {
    if (isBackdrop(i)) { backdrops.push(i); continue; }
    const u: Unit = { idx: i, rect: blocks[i].rect, kids: [] };
    units.set(i, u);
    let parent: Unit | null = null;
    let best = Infinity;
    for (const j of placed) {
      if (blocks[j].kind !== 'box') continue;
      const r = blocks[j].rect;
      if (!contains(r, blocks[i].rect)) continue;
      const a = area(r);
      if (a < best) { best = a; parent = units.get(j)!; }
    }
    if (!parent) {
      // A badge or label hanging over a card's edge still belongs to the card.
      for (const j of placed) {
        if (blocks[j].kind !== 'box') continue;
        const r = blocks[j].rect, me = blocks[i].rect;
        const ov = Math.max(0, overlap1(r.x, r.x + r.w, me.x, me.x + me.w)) * Math.max(0, overlap1(r.y, r.y + r.h, me.y, me.y + me.h));
        const a = area(r);
        if (ov >= area(me) * 0.5 && a > area(me) * 4 && a < best) { best = a; parent = units.get(j)!; }
      }
    }
    if (parent) parent.kids.push(u); else roots.push(u);
    placed.push(i);
  }
  const sortRec = (list: Unit[]) => {
    list.sort((a, b) => geoCompare(blocks, a.idx, b.idx));
    for (const u of list) sortRec(u.kids);
  };
  sortRec(roots);
  backdrops.sort((a, b) => geoCompare(blocks, a, b));
  return { roots, backdrops };
}

/**
 * A small drawn piece that is not content of its own: a select arrow, a tick,
 * password dots, a list marker, a checkbox square. Such pieces never decide
 * whether something reads as one thing.
 */
export function isMark(b: Block): boolean {
  if (b.kind === 'text') return !/[\p{L}\p{N}]/u.test(b.text ?? '');
  return b.rect.w <= 18 && b.rect.h <= 18;
}

function textCount(ctx: SegmentContext, u: Unit): number {
  return allBlocks(u).filter((i) => ctx.blocks[i].kind === 'text' && !isMark(ctx.blocks[i])).length;
}

/** A thing read as one: a text, an image, a box with at most one text in it (a button, a field, a badge). */
export function isChip(ctx: SegmentContext, u: Unit): boolean {
  const b = ctx.blocks[u.idx];
  if (b.kind !== 'box') return true;
  const all = allBlocks(u);
  return textCount(ctx, u) <= 1 && all.filter((i) => !isMark(ctx.blocks[i])).length <= 4;
}

function isContainer(ctx: SegmentContext, u: Unit): boolean {
  return ctx.blocks[u.idx].kind === 'box' && u.kids.length > 0 && !isChip(ctx, u);
}

function overlap1(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/** One row, or a column of lines where at most one line holds several things side by side. */
function isSimple(ctx: SegmentContext, units: Unit[]): boolean {
  if (!units.every((u) => isChip(ctx, u))) return false;
  // Ticks, bullets and arrows beside a line do not make it a second column.
  const real = units.filter((u) => !(isMark(ctx.blocks[u.idx]) && u.kids.length === 0));
  const sorted = [...real].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const lines: Unit[][] = [];
  let end = -Infinity;
  for (const u of sorted) {
    if (lines.length && u.rect.y < end - 2) {
      lines[lines.length - 1].push(u);
      end = Math.max(end, u.rect.y + u.rect.h);
    } else {
      lines.push([u]);
      end = u.rect.y + u.rect.h;
    }
  }
  let multi = 0;
  for (const line of lines) {
    const byX = [...line].sort((a, b) => a.rect.x - b.rect.x);
    for (let i = 1; i < byX.length; i++) {
      if (byX[i].rect.x < byX[i - 1].rect.x + byX[i - 1].rect.w - 2) return false;
    }
    if (line.length > 1) multi++;
  }
  return lines.length === 1 || multi <= 1;
}

interface Gap { at: number; size: number }

function gapsAlong(rects: Rect[], axis: 'x' | 'y'): { order: number[]; gaps: Gap[] } {
  const s = (r: Rect) => (axis === 'y' ? r.y : r.x);
  const e = (r: Rect) => (axis === 'y' ? r.y + r.h : r.x + r.w);
  const order = [...rects.keys()].sort((a, b) => s(rects[a]) - s(rects[b]) || e(rects[a]) - e(rects[b]) || a - b);
  const gaps: Gap[] = [];
  let maxEnd = -Infinity;
  for (let k = 0; k < order.length; k++) {
    const r = rects[order[k]];
    if (k > 0 && s(r) >= maxEnd - TOL) gaps.push({ at: k, size: Math.max(0, s(r) - maxEnd) });
    maxEnd = Math.max(maxEnd, e(r));
  }
  return { order, gaps };
}

function cutWith(units: Unit[], rects: Rect[]): Unit[][] | null {
  const ys = gapsAlong(rects, 'y');
  const xs = gapsAlong(rects, 'x');
  const maxY = ys.gaps.length ? Math.max(...ys.gaps.map((g) => g.size)) : -1;
  const maxX = xs.gaps.length ? Math.max(...xs.gaps.map((g) => g.size)) : -1;
  if (maxY < 0 && maxX < 0) return null;
  // Bands first: columns only when their gap is clearly the wider one.
  const use = maxY >= 0 && maxY * 1.5 >= maxX ? ys : xs;
  const max = use === ys ? maxY : maxX;
  const threshold = Math.min(max, 64, max * 0.6);
  const cuts = new Set(use.gaps.filter((g) => g.size >= threshold - 0.01).map((g) => g.at));
  const pieces: Unit[][] = [];
  let cur: Unit[] = [];
  use.order.forEach((ui, k) => {
    if (cuts.has(k) && cur.length) { pieces.push(cur); cur = []; }
    cur.push(units[ui]);
  });
  if (cur.length) pieces.push(cur);
  return pieces.length > 1 ? pieces : null;
}

/** Splits units into bands or columns at their clearest gaps. */
function cut(ctx: SegmentContext, units: Unit[]): Unit[][] | null {
  const direct = cutWith(units, units.map((u) => u.rect));
  if (direct) return direct;
  // A wide background band that something overlaps (cards hanging over a
  // hero): measure the band by what is drawn in it instead.
  const span = union(units.map((u) => u.rect));
  const rects = units.map((u) => {
    if (ctx.blocks[u.idx].kind !== 'box' || u.kids.length === 0 || u.rect.w < span.w * 0.9) return u.rect;
    const crossed = units.some((o) => o !== u && overlap1(o.rect.y, o.rect.y + o.rect.h, u.rect.y, u.rect.y + u.rect.h) > 0);
    return crossed ? union(u.kids.map((k) => k.rect)) : u.rect;
  });
  return cutWith(units, rects);
}

/** Do two pieces look alike: cards of one row, rows of one table, items of one list? */
function similar(ctx: SegmentContext, a: Unit[], b: Unit[]): boolean {
  const ra = union(a.map((u) => u.rect)), rb = union(b.map((u) => u.rect));
  const ratio = (p: number, q: number) => (Math.max(p, q) <= 0 ? 1 : Math.min(p, q) / Math.max(p, q));
  if (a.length === 1 && b.length === 1) {
    const ua = a[0], ub = b[0];
    const ba = ctx.blocks[ua.idx], bb = ctx.blocks[ub.idx];
    if (ba.kind !== bb.kind) return false;
    if (isContainer(ctx, ua) !== isContainer(ctx, ub)) return false;
    if (isContainer(ctx, ua)) {
      const ta = textCount(ctx, ua), tb = textCount(ctx, ub);
      return ratio(ra.w, rb.w) >= 0.8 && ratio(ra.h, rb.h) >= 0.75 && Math.abs(ta - tb) <= Math.max(1, 0.3 * Math.max(ta, tb));
    }
    if (ba.kind === 'text') {
      const words = (t?: string) => (t ?? '').trim().split(/\s+/).length;
      if (words(ba.text) > 6 || words(bb.text) > 6) return false;
      return ba.textStyle?.fontSize === bb.textStyle?.fontSize && ratio(ra.h, rb.h) >= 0.7;
    }
    return ratio(ra.w, rb.w) >= 0.8 && ratio(ra.h, rb.h) >= 0.7 && textCount(ctx, ua) === textCount(ctx, ub);
  }
  if (a.length !== b.length) return false;
  // Rows: the same number of things, lined up in the same columns.
  const xa = a.map((u) => u.rect.x).sort((p, q) => p - q);
  const xb = b.map((u) => u.rect.x).sort((p, q) => p - q);
  const aligned = xa.filter((x, i) => Math.abs(x - xb[i]) <= 6).length;
  if (aligned >= Math.ceil(a.length * 0.8) && ratio(ra.w, rb.w) >= 0.8) return true;
  if (ratio(ra.w, rb.w) < 0.85 || ratio(ra.h, rb.h) < 0.75) return false;
  // Tiles: the same parts at the same places within each piece.
  const rel = (p: Unit[], r: Rect) => p.map((u) => ({ x: u.rect.x - r.x, x1: r.x + r.w - (u.rect.x + u.rect.w), y: u.rect.y - r.y, k: ctx.blocks[u.idx].kind }))
    .sort((m, q) => m.y - q.y || m.x - q.x);
  const pa = rel(a, ra), pb = rel(b, rb);
  const same = pa.filter((m, i) => m.k === pb[i].k && (Math.abs(m.x - pb[i].x) <= 6 || Math.abs(m.x1 - pb[i].x1) <= 6) && Math.abs(m.y - pb[i].y) <= 6).length;
  return same >= Math.ceil(a.length * 0.75);
}

function isPlain(ctx: SegmentContext, n: Node): boolean {
  if (n.kind !== 'leaf' || n.container !== null) return false;
  // A large block of its own (a picture, a column of details) is a part, not a caption.
  const big = n.rect.w >= 150 && n.rect.h >= 150 && (n.own.length >= 3 || n.own.some((i) => ctx.blocks[i].kind === 'image'));
  return !big;
}

export function segment(ctx: SegmentContext, units: Unit[], container: Unit | null, depth: number, root = false): Node {
  const cIdx = container ? container.idx : null;
  const ownAll = (): number[] => [...(cIdx !== null ? [cIdx] : []), ...units.flatMap(allBlocks)];
  const frame = (): Rect => (container ? container.rect : union(units.map((u) => u.rect)));
  const leaf = (): Node => ({ kind: 'leaf', container: cIdx, own: ownAll(), children: [], rect: frame() });

  if (units.length === 0) return leaf();
  if (!container && units.length === 1) {
    const u = units[0];
    if (isContainer(ctx, u)) return segment(ctx, u.kids, u, depth + (root ? 0 : 1));
    return leaf();
  }
  if (!root && (depth >= MAX_DEPTH || isSimple(ctx, units))) return leaf();
  const pieces = cut(ctx, units);
  if (!pieces) return leaf();

  const nodes: Node[] = [];
  const push = (n: Node) => {
    if (n.kind === 'region' && n.flatten) nodes.push(...n.children);
    else nodes.push(n);
  };
  let i = 0;
  while (i < pieces.length) {
    let j = i + 1;
    while (j < pieces.length && similar(ctx, pieces[j - 1], pieces[j]) && similar(ctx, pieces[i], pieces[j])) j++;
    const containerRun = pieces[i].every((u) => isContainer(ctx, u));
    if (j - i >= (containerRun ? 2 : 3)) {
      push(makeGroup(ctx, pieces.slice(i, j), depth));
      i = j;
    } else {
      push(segment(ctx, pieces[i], null, depth));
      i++;
    }
  }

  if (root) return { kind: 'region', container: null, own: [], children: attachTitles(ctx, nodes), rect: frame() };

  const structured = nodes.filter((n) => !isPlain(ctx, n));
  if (structured.length === 0) return leaf();
  const plains = nodes.filter((n) => isPlain(ctx, n));
  const above = (p: Node, s: Node) => p.rect.y + p.rect.h <= s.rect.y + 4;
  const plainTexts = plains.reduce((s, n) => s + n.own.filter((k) => ctx.blocks[k].kind === 'text').length, 0);
  if (structured.length === 1 && plains.length <= 2 && plainTexts <= 3 && plains.every((p) => above(p, structured[0]))) {
    const s = structured[0];
    if (!(cIdx !== null && s.container !== null)) {
      const own = [...(cIdx !== null ? [cIdx] : []), ...plains.flatMap((p) => p.own), ...s.own];
      const rect = container ? container.rect : union([s.rect, ...plains.map((p) => p.rect)]);
      return { ...s, container: cIdx ?? s.container, own, rect };
    }
  }
  return {
    kind: 'region',
    container: cIdx,
    own: cIdx !== null ? [cIdx] : [],
    children: nodes,
    rect: frame(),
    flatten: cIdx === null,
  };
}

/**
 * On the page itself, a short heading sitting right above a group, table or
 * framed part (closer to it than to what comes before) is that part's title.
 */
function attachTitles(ctx: SegmentContext, nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i], next = nodes[i + 1];
    const texts = n.own.filter((k) => ctx.blocks[k].kind === 'text');
    const titleLike = n.kind === 'leaf' && n.container === null && texts.length >= 1 && texts.length <= 2 && texts.length === n.own.length &&
      texts.every((k) => (ctx.blocks[k].text ?? '').trim().split(/\s+/).length <= 8);
    if (titleLike && next && next.kind !== 'region' && !isPlain(ctx, next) && n.rect.y + n.rect.h <= next.rect.y + 4) {
      const prev = out[out.length - 1];
      const before = prev ? n.rect.y - (prev.rect.y + prev.rect.h) : Infinity;
      const after = next.rect.y - (n.rect.y + n.rect.h);
      // Closer to what follows by a clear margin; a page title just under a bar stays apart.
      if (after * 1.5 <= before) {
        nodes[i + 1] = { ...next, own: [...n.own, ...next.own], rect: union([n.rect, next.rect]) };
        continue;
      }
    }
    out.push(n);
  }
  return out;
}

function makeGroup(ctx: SegmentContext, pieces: Unit[][], depth: number): Node {
  let items = pieces.map((p) => segment(ctx, p, null, depth + 1));
  // Look-alike sections that each hold their own titled group (menu sections)
  // stay separate parts.
  if (items.every((n) => n.kind === 'group') && items.some((n) => n.own.length > 0)) {
    return { kind: 'region', container: null, own: [], children: items, rect: union(items.map((n) => n.rect)), flatten: true };
  }
  // A grid: rows of cards become one group of cards.
  if (items.every((n) => n.kind === 'group' && n.container === null && n.own.length === 0)) {
    items = items.flatMap((n) => n.children);
  }
  const rects = items.map((n) => n.rect);
  const ys = rects.map((r) => r.y);
  const axis: 'x' | 'y' = Math.max(...ys) - Math.min(...ys) < Math.min(...rects.map((r) => r.h)) * 0.5 ? 'x' : 'y';
  return { kind: 'group', container: null, own: [], children: items, rect: union(rects), axis };
}
