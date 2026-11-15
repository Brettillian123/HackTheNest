/**
 * The twelve named criteria, measured per component of the goal page.
 *
 * Every leaf decision the scorer makes about a pair of blocks, a missing
 * block or an extra block is put down to the goal component the block
 * belongs to (from the goal's profile), and lands in exactly one criterion
 * of that component:
 *   a missing component       -> its completeness, nothing else
 *   a changed key text        -> its component's keyFacts
 *   other changed words       -> wording
 *   a component that moved    -> its placement (not its pieces' spacing,
 *                                 not the placement of what follows it)
 *   a piece moved inside it   -> its spacing (judged against its own box)
 *   order or grouping changed -> structure (the moved items are not charged
 *                                 again in placement or spacing)
 * Page criteria are importance-weighted means over the components they
 * apply to; noExtras and likeness are page-wide. Pure arithmetic, no AI.
 */
import { colorDistance, colorName, contrastRatio } from '../color';
import { FAULTS } from '../config';
import { flattenComponents, IMPORTANCE_WEIGHT, type PageComponent, type PageProfile } from '../profile/index';
import type { Breakdown, ComponentResult, CriterionId, CriterionResult, Feedback, PageSnapshot, Rect } from '../types';
import { clamp01, round1, wordOverlap, wordPairs } from '../util';
import { regionShapeSimilarity } from '../visual';
import * as K from '../score';

export const CRITERIA: { id: CriterionId; name: string; short: string; group: 'works' | 'looks' }[] = [
  { id: 'completeness', name: 'Completeness', short: 'Completeness', group: 'works' },
  { id: 'keyFacts', name: 'Key facts', short: 'Key facts', group: 'works' },
  { id: 'wording', name: 'Wording', short: 'Wording', group: 'works' },
  { id: 'structure', name: 'Structure', short: 'Structure', group: 'works' },
  { id: 'noExtras', name: 'Nothing extra', short: 'Extras', group: 'works' },
  { id: 'placement', name: 'Placement and size', short: 'Placement', group: 'looks' },
  { id: 'spacing', name: 'Spacing inside components', short: 'Spacing', group: 'looks' },
  { id: 'colour', name: 'Colour', short: 'Colour', group: 'looks' },
  { id: 'typography', name: 'Typography', short: 'Typography', group: 'looks' },
  { id: 'shape', name: 'Corners, borders and shadows', short: 'Shape', group: 'looks' },
  { id: 'pictures', name: 'Pictures', short: 'Pictures', group: 'looks' },
  { id: 'likeness', name: 'Overall likeness', short: 'Likeness', group: 'looks' },
];

/** Which sub-score each criterion belongs to. */
export const CRITERION_SUB: Record<CriterionId, keyof Breakdown> = {
  completeness: 'content', keyFacts: 'content', wording: 'content', noExtras: 'content',
  structure: 'layout', placement: 'layout', spacing: 'layout',
  colour: 'style', typography: 'style', shape: 'style',
  pictures: 'visual', likeness: 'visual',
};

/** Each sub-score as the plain mean of its criteria (0 to 100, one decimal). A pure function. */
export function subScoresFromCriteria(criteria: CriterionResult[]): Breakdown {
  const mean = (sub: keyof Breakdown): number | null => {
    const vals = criteria.filter((c) => CRITERION_SUB[c.id] === sub && c.value !== null).map((c) => c.value as number);
    return vals.length ? round1((100 * vals.reduce((s, v) => s + v, 0)) / vals.length) : null;
  };
  return { content: mean('content'), layout: mean('layout') ?? 100, style: mean('style') ?? 100, visual: mean('visual') ?? 100 };
}

export interface MeasureInput {
  goal: PageSnapshot;
  candidate: PageSnapshot;
  profile: PageProfile;
  pairs: K.Pair[];
  changed: K.Pair[];
  pieces: Map<K.Pair, K.Piece>;
  /** Goal blocks found nowhere in the candidate. */
  goalFree: number[];
  /** Candidate blocks the goal does not have. */
  candFree: number[];
  faults: K.Fault[];
  scale: { x: number; y: number; fx: number; fy: number };
  pageShift: { x: number; y: number };
  /** The screenshot comparison, 0 to 1. */
  likeness: number;
  goalWords: string[][];
  candidateWords: string[][];
}

export interface MeasureOutput {
  criteria: CriterionResult[];
  components: ComponentResult[];
  criteriaFeedback: Feedback[];
}

interface Partner {
  c: number;
  trust: number;
  changed: boolean;
  /** False for a piece joined to another text: it is there, but judged with that text. */
  main: boolean;
  gRect: Rect;
  cRect: Rect;
  gw: string[];
  cw: string[];
  joined: boolean;
}

interface Item {
  credit: number;
  weight: number;
  msg?: string;
  /** What kind of slip, for merging page-wide ones into one note. */
  tag?: string;
}

interface Note {
  crit: CriterionId;
  comp: string;
  loss: number;
  best: number;
  msg: string;
  tag?: string;
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const quote = (t: string) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return `'${s.length > 40 ? s.slice(0, 37) + '...' : s}'`;
};
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const vOverlap = (a: Rect, b: Rect) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
const hOverlap = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
/** Side by side: they share most of a line and do not sit over each other. */
const inRow = (a: Rect, b: Rect) => vOverlap(a, b) > 0.5 * Math.min(a.h, b.h) && hOverlap(a, b) < 0.5 * Math.min(a.w, b.w);
/** One under the other. */
const stacked = (a: Rect, b: Rect) => vOverlap(a, b) <= 0;
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  // Of the two middle values, the smaller move: when half the pieces stayed, the thing stayed.
  return s.length === 0 ? 0 : s.length % 2 ? s[m] : Math.abs(s[m - 1]) <= Math.abs(s[m]) ? s[m - 1] : s[m];
};
/** Positions of one longest rising run through the values (a few pixels back counts as level; the first found, so always the same). */
function longestRising(v: number[]): Set<number> {
  const len = v.map(() => 1);
  const prev = v.map(() => -1);
  for (let i = 0; i < v.length; i++) {
    for (let j = 0; j < i; j++) {
      if (v[j] < v[i] + 8 && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
    }
  }
  let end = 0;
  for (let i = 1; i < v.length; i++) if (len[i] > len[end]) end = i;
  const out = new Set<number>();
  for (let i = end; i >= 0; i = prev[i]) out.add(i);
  return out;
}
const pick = (arr: number[]) => arr.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
/** "the pricing cards" reads as many, "the sign-up form" as one. */
const plural = (name: string) => /^the\b/.test(name) && /[^s']s$/.test(name.split(/\s+/).pop() ?? '') && !/\bwith\b|'/.test(name);
const be = (name: string) => (plural(name) ? 'are' : 'is');
const it = (name: string) => (plural(name) ? 'them' : 'it');
const FAMILY: Record<string, string> = { serif: 'a serif', sans: 'a sans-serif', mono: 'a monospace', other: 'an unusual' };

function sizeSeverity(g: Rect, c: Rect): number {
  const lr = Math.max(0, Math.max(Math.abs(Math.log((c.w + 1) / (g.w + 1))), Math.abs(Math.log((c.h + 1) / (g.h + 1)))) - 0.1);
  return 1 - Math.exp(-Math.pow(lr / 0.25, 1.5));
}

/**
 * How far a piece moved inside its component's box. Judged against the box
 * held at its top-left, its bottom-right, or stretched to its new size
 * (whichever fits best), by whichever of the piece's edges or centre fits
 * best: a component drawn wider or zoomed, with its pieces spread to fit,
 * is a fault of its size (placement), not of its spacing.
 */
function relativeOffset(g: Rect, c: Rect, gBox: Rect, cBox: Rect): { x: number; y: number } {
  const axis = (g0: number, gl: number, c0: number, cl: number, b0: number, bl: number, d0: number, dl: number) => {
    const r = bl > 0 ? dl / bl : 1;
    let best = Infinity;
    for (const [ge, ce] of [[g0, c0], [g0 + gl, c0 + cl], [g0 + gl / 2, c0 + cl / 2]]) {
      for (const expected of [d0 + (ge - b0), d0 + dl - (b0 + bl - ge), d0 + r * (ge - b0)]) {
        const off = ce - expected;
        if (Math.abs(off) < Math.abs(best)) best = off;
      }
    }
    return best;
  };
  return { x: axis(g.x, g.w, c.x, c.w, gBox.x, gBox.w, cBox.x, cBox.w), y: axis(g.y, g.h, c.y, c.h, gBox.y, gBox.h, cBox.y, cBox.h) };
}

/**
 * How differently two boxes' edges look on screen (mean CIEDE2000 of pixels
 * sampled across each edge, from 8 px outside to 3 px inside, each box read
 * at its own place and size). Near 0 when a border or shadow is drawn
 * another way but looks the same.
 */
function edgeDifference(a: PageSnapshot, ra: Rect, b: PageSnapshot, rb: Rect): number {
  const px = (p: PageSnapshot, x: number, y: number): [number, number, number] => {
    const xi = Math.min(p.width - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(p.height - 1, Math.max(0, Math.round(y)));
    const o = (yi * p.width + xi) * 4;
    return [p.pixels[o], p.pixels[o + 1], p.pixels[o + 2]];
  };
  const depths = [-8, -5, -3, -1, 0, 1, 2, 3];
  let sum = 0;
  let n = 0;
  for (let s = 1; s <= 9; s++) {
    const t = s / 10;
    for (const d of depths) {
      const at = (r: Rect, side: number): [number, number] =>
        side === 0 ? [r.x + t * r.w, r.y + d] : side === 1 ? [r.x + t * r.w, r.y + r.h - 1 - d] : side === 2 ? [r.x + d, r.y + t * r.h] : [r.x + r.w - 1 - d, r.y + t * r.h];
      for (let side = 0; side < 4; side++) {
        const [x1, y1] = at(ra, side);
        const [x2, y2] = at(rb, side);
        sum += colorDistance(px(a, x1, y1), px(b, x2, y2));
        n++;
      }
    }
  }
  return n ? sum / n : 0;
}

function pixels(n: number): string {
  const r = n >= 30 ? Math.round(n / 10) * 10 : Math.max(5, Math.round(n / 5) * 5);
  return `about ${r} pixels`;
}

function offsetText(ox: number, oy: number): string {
  const parts: string[] = [];
  if (Math.abs(oy) >= 2.5) parts.push(`${pixels(Math.abs(oy))} too ${oy > 0 ? 'low' : 'high'}`);
  if (Math.abs(ox) >= 2.5) parts.push(`${pixels(Math.abs(ox))} too far ${ox > 0 ? 'right' : 'left'}`);
  return parts.length ? parts.join(' and ') : 'slightly out of place';
}

function sizeText(g: Rect, c: Rect): string {
  const rw = c.w / Math.max(1, g.w);
  const rh = c.h / Math.max(1, g.h);
  if (Math.abs(Math.log(rw)) >= Math.abs(Math.log(rh))) return `is ${rw > 1 ? 'wider' : 'narrower'} than in the goal (about ${Math.round(c.w)} pixels wide instead of ${Math.round(g.w)})`;
  return `is ${rh > 1 ? 'taller' : 'shorter'} than in the goal (about ${Math.round(c.h)} pixels high instead of ${Math.round(g.h)})`;
}

function colourText(g: [number, number, number], c: [number, number, number]): string {
  const a = colorName(g);
  const b = colorName(c);
  return a !== b ? `is ${b} where the goal has ${a}` : `is a different shade of ${a} from the goal's`;
}

/** How wrong a text's words are against the goal's. */
function textDiff(gw: string[], cw: string[], joined: boolean): { wrong: number; numeric: boolean; rewritten: boolean } {
  const cg = K.canonical(gw);
  const cc = K.canonical(cw);
  const lost = K.multisetDiff(cg, cc);
  const added = K.multisetDiff(cc, cg);
  let wrong = Math.max(lost.length, added.length);
  if (wrong === 0 && !joined && gw.length > 1) {
    const order = wordOverlap(wordPairs([gw]), wordPairs([cw]));
    if (order < 1) wrong = Math.max(0.5, (1 - order) * gw.length * 0.5);
  }
  const rewritten = wrong === 0 && (K.multisetDiff(gw, cw).length > 0 || K.multisetDiff(cw, gw).length > 0);
  const numeric = [...lost, ...added].some((w) => /\p{N}/u.test(w));
  return { wrong, numeric, rewritten };
}

export function measureCriteria(input: MeasureInput): MeasureOutput {
  const { goal, candidate, profile, goalWords } = input;
  const nG = goal.blocks.length;

  // ---- the components and who owns each block ----
  const flat = flattenComponents(profile.components);
  const owner = new Array<PageComponent | null>(nG).fill(null);
  const parentOf = new Map<PageComponent, PageComponent | null>();
  const walk = (c: PageComponent, p: PageComponent | null) => {
    parentOf.set(c, p);
    for (const b of c.blocks) if (b >= 0 && b < nG) owner[b] = c;
    c.children.forEach((k) => walk(k, c));
  };
  profile.components.forEach((c) => walk(c, null));
  const tops = [...profile.components];
  // Blocks the profile left out (it should not) are one more component, so nothing goes unjudged.
  const stray = owner.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
  if (stray.length) {
    let rect = goal.blocks[stray[0]].rect;
    for (const b of stray) rect = union(rect, goal.blocks[b].rect);
    const rest: PageComponent = { id: 'rest', type: 'other', name: 'the rest of the page', rect, blocks: stray, children: [], importance: 'minor', keyTexts: [] };
    flat.push(rest);
    tops.push(rest);
    parentOf.set(rest, null);
    for (const b of stray) owner[b] = rest;
  }
  const keySet = new Set<number>();
  for (const c of flat) for (const k of c.keyTexts) keySet.add(k);
  const subtree = new Map<PageComponent, number[]>();
  const collect = (c: PageComponent): number[] => {
    const all = [...c.blocks, ...c.children.flatMap(collect)].filter((b) => b >= 0 && b < nG);
    subtree.set(c, all);
    return all;
  };
  tops.forEach(collect);

  // ---- what each goal block was paired with ----
  const partner = new Array<Partner | null>(nG).fill(null);
  for (const p of [...input.pairs, ...input.changed]) {
    const piece = input.pieces.get(p);
    const isChanged = input.changed.includes(p);
    const gb = goal.blocks[p.goal];
    const cb = candidate.blocks[p.candidate];
    partner[p.goal] = {
      c: p.candidate,
      trust: isChanged ? 0 : p.trust,
      changed: isChanged,
      main: true,
      gRect: piece?.joined ? piece.gRect : gb.rect,
      cRect: piece?.joined ? piece.cRect : cb.rect,
      gw: piece?.gw ?? goalWords[p.goal],
      cw: piece?.cw ?? input.candidateWords[p.candidate],
      joined: !!piece?.joined,
    };
    if (piece?.joined) {
      for (const g of piece.gExtra) {
        partner[g] = { c: p.candidate, trust: isChanged ? 0 : p.trust, changed: isChanged, main: false, gRect: goal.blocks[g].rect, cRect: piece.cRect, gw: piece.gw, cw: piece.cw, joined: true };
      }
    }
  }

  const itemW = (g: number): number => {
    const b = goal.blocks[g];
    if (b.kind === 'text') {
      if (K.isSymbolText(b)) return 0.1 * K.notice(goal, g);
      return K.notice(goal, g) * Math.min(3, Math.sqrt(Math.max(1, goalWords[g].length)));
    }
    if (b.kind === 'image') return 0.3 + 1.3 * K.screenSize(b.rect);
    return (0.12 + 1.3 * K.screenSize(b.rect)) * K.visibility(b);
  };
  const W = goal.blocks.map((_, i) => itemW(i));
  const keyBoost = (g: number) => (keySet.has(g) ? 2 : 1);

  // ---- present, and where each present component is ----
  const present = new Map<PageComponent, boolean>();
  for (const c of flat) {
    const all = subtree.get(c) ?? [];
    const total = all.reduce((s, b) => s + W[b], 0);
    const found = all.reduce((s, b) => s + (partner[b] ? W[b] : 0), 0);
    present.set(c, found > 0 || (total === 0 && (all.length === 0 || all.some((b) => partner[b]))));
  }
  interface Geo { gBox: Rect; cBox: Rect; cAll: Rect; gAll: Rect; off: { x: number; y: number }; gFrame: Rect | null; cFrame: Rect | null }
  const geo = new Map<PageComponent, Geo>();
  for (const c of flat) {
    if (!present.get(c)) continue;
    let gBox: Rect | null = null;
    let cBox: Rect | null = null;
    let gFrame: Rect | null = null;
    let cFrame: Rect | null = null;
    // Where it went: the middle move of its paired pieces, so one piece paired far away (a repeated price) does not drag the whole component.
    const members = (subtree.get(c) ?? []).filter((b) => partner[b]);
    if (!members.length) continue;
    const offs = members.map((b) => K.edgeOffset(partner[b]!.gRect, partner[b]!.cRect));
    const off = { x: median(offs.map((o) => o.x)), y: median(offs.map((o) => o.y)) };
    const tol = Math.max(24, 0.25 * Math.hypot(off.x, off.y));
    let inliers = members.filter((_, i) => Math.abs(offs[i].x - off.x) <= tol && Math.abs(offs[i].y - off.y) <= tol);
    if (!inliers.length) inliers = members;
    for (const b of inliers) {
      const p = partner[b]!;
      gBox = gBox ? union(gBox, p.gRect) : p.gRect;
      cBox = cBox ? union(cBox, p.cRect) : p.cRect;
    }
    // Its size is the size of its frame: its own box or picture that covers it. A group's size follows from its members, text's from its words and font.
    let frameArea = 0;
    for (const b of c.blocks) {
      const p = partner[b];
      const r = goal.blocks[b].rect;
      if (!p || !p.main || p.trust < 0.5 || goal.blocks[b].kind === 'text' || r.w * r.h < 0.8 * c.rect.w * c.rect.h || r.w * r.h <= frameArea) continue;
      frameArea = r.w * r.h;
      gFrame = p.gRect;
      cFrame = p.cRect;
    }
    const cAll = members.map((b) => partner[b]!.cRect).reduce(union);
    const gAll = members.map((b) => partner[b]!.gRect).reduce(union);
    if (gBox && cBox) geo.set(c, { gBox, cBox, cAll, gAll, off, gFrame, cFrame });
  }

  // Candidate blocks nobody asked for, that a person can see: they push things along.
  const extraRects = input.candFree.filter((c) => K.notice(candidate, c) > 0 || candidate.blocks[c].kind === 'image').map((c) => candidate.blocks[c].rect);

  // ---- per component, criterion by criterion ----
  const values = new Map<PageComponent, Partial<Record<CriterionId, number>>>();
  const notes: Note[] = [];
  const restructuredComp = new Set<PageComponent>();
  const restructuredBlock = new Set<number>();
  type Bag = Partial<Record<CriterionId, Item[]>>;
  const bags = new Map<PageComponent, Bag>();
  const push = (c: PageComponent, crit: CriterionId, item: Item) => {
    let bag = bags.get(c);
    if (!bag) bags.set(c, (bag = {}));
    (bag[crit] ??= []).push(item);
  };
  const isFrame = (c: PageComponent, b: number) => {
    const r = goal.blocks[b].rect;
    const cr = c.rect;
    return goal.blocks[b].kind === 'box' && r.w * r.h >= 0.8 * cr.w * cr.h;
  };
  const subjectOf = (c: PageComponent, g: number) =>
    c.blocks.length === 1 && c.children.length === 0 ? c.name : isFrame(c, g) ? `the box of ${c.name}` : `${K.nameOf(goal, g).name} in ${c.name}`;

  // Structure first: what changed order or grouping is not charged again for where it went.
  for (const c of flat) {
    if (!present.get(c)) continue;
    const items: { gR: Rect; cR: Rect; name: string; comp?: PageComponent; block?: number }[] = [];
    for (const k of c.children) {
      const gk = geo.get(k);
      if (present.get(k) && gk) items.push({ gR: gk.gBox, cR: gk.cBox, name: k.name, comp: k });
    }
    const own = c.blocks.filter((b) => partner[b]?.main && partner[b]!.trust >= 0.5 && !isFrame(c, b) && W[b] > 0);
    for (const b of own) {
      const p = partner[b]!;
      // A box that holds other items is their background, not an item in the order.
      if (goal.blocks[b].kind === 'box' && items.some((it) => K.insideRect(it.gR, p.gRect)) ) continue;
      if (goal.blocks[b].kind === 'box' && own.some((o) => o !== b && K.insideRect(partner[o]!.gRect, p.gRect))) continue;
      items.push({ gR: p.gRect, cR: p.cRect, name: K.nameOf(goal, b).name, block: b });
    }
    if (items.length < 2) continue;
    const rows = (rects: Rect[]) => {
      const order = rects.map((_, i) => i).sort((i, j) => rects[i].y - rects[j].y || rects[i].x - rects[j].x || i - j);
      const row = new Array<number>(rects.length).fill(0);
      let r = -1;
      let lead = -1;
      for (const i of order) {
        if (lead < 0 || !(vOverlap(rects[lead], rects[i]) > 0.5 * Math.min(rects[lead].h, rects[i].h))) {
          r++;
          lead = i;
        }
        row[i] = r;
      }
      return row;
    };
    const gRow = rows(items.map((it) => it.gR));
    const cRow = rows(items.map((it) => it.cR));
    // Order: goal rows must come in the same sequence down the candidate (order inside a row is placement).
    const seq = items.map((_, i) => i).sort((i, j) => cRow[i] - cRow[j] || items[i].cR.x - items[j].cR.x || i - j);
    const n = seq.length;
    const len = new Array<number>(n).fill(1);
    const prev = new Array<number>(n).fill(-1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        if (gRow[seq[j]] <= gRow[seq[i]] && len[j] + 1 > len[i]) {
          len[i] = len[j] + 1;
          prev[i] = j;
        }
      }
    }
    let end = 0;
    for (let i = 1; i < n; i++) if (len[i] > len[end]) end = i;
    const kept = new Set<number>();
    for (let i = end; i >= 0; i = prev[i]) kept.add(seq[i]);
    const faulty = new Map<number, string>();
    for (let i = 0; i < n; i++) if (!kept.has(i)) faulty.set(i, `${items[i].name} comes in a different order within ${c.name} than in the goal`);
    // What traded places with an item out of order moved because of that one change: not charged again for where it went.
    const swappedAlong: number[] = [];
    if (kept.size < n) for (let i = 0; i < n; i++) if (kept.has(i) && gRow[i] !== cRow[i]) swappedAlong.push(i);
    // Inside a row, the order of a component's own pieces (the columns of a table row, a label and its value) is
    // structure too; whole components side by side that traded places are placement (the sidebar on the other side).
    const byRow = new Map<number, number[]>();
    items.forEach((it, i) => {
      if (it.block !== undefined && !faulty.has(i)) byRow.set(gRow[i], [...(byRow.get(gRow[i]) ?? []), i]);
    });
    for (const list of byRow.values()) {
      const same = list.filter((i) => cRow[i] === cRow[list[0]]).sort((a, b) => items[a].gR.x - items[b].gR.x || a - b);
      if (same.length < 2) continue;
      const xs = same.map((i) => items[i].cR.x);
      const keep = longestRising(xs);
      if (keep.size === same.length) continue;
      same.forEach((i, k) => {
        if (!keep.has(k)) faulty.set(i, `${items[i].name} comes in a different order within ${c.name} than in the goal`);
        else swappedAlong.push(i);
      });
    }
    // Grouping: neighbours side by side that are now stacked, or the other way round.
    const gOrder = items.map((_, i) => i).sort((i, j) => gRow[i] - gRow[j] || items[i].gR.x - items[j].gR.x || i - j);
    for (let k = 1; k < gOrder.length; k++) {
      const a = gOrder[k - 1];
      const b = gOrder[k];
      if (faulty.has(b)) continue;
      if (inRow(items[a].gR, items[b].gR) && stacked(items[a].cR, items[b].cR)) faulty.set(b, `the parts of ${c.name} are stacked; the goal has them side by side`);
      else if (stacked(items[a].gR, items[b].gR) && inRow(items[a].cR, items[b].cR)) faulty.set(b, `the parts of ${c.name} are side by side; the goal stacks them`);
    }
    for (let i = 0; i < n; i++) {
      const msg = faulty.get(i);
      push(c, 'structure', { credit: msg ? 0 : 1, weight: 1, msg, tag: msg });
      if (msg && items[i].comp) restructuredComp.add(items[i].comp!);
      if (msg && items[i].block !== undefined) restructuredBlock.add(items[i].block!);
    }
    // A component whose parts were rearranged is placed by its first part that kept its place, not by the middle of the rearranged ones.
    if (faulty.size || swappedAlong.length) {
      const anchor = gOrder.find((i) => !faulty.has(i) && !swappedAlong.includes(i));
      const gc = geo.get(c);
      if (anchor !== undefined && gc) gc.off = K.edgeOffset(items[anchor].gR, items[anchor].cR);
    }
    for (const i of swappedAlong) {
      if (items[i].comp) restructuredComp.add(items[i].comp!);
      if (items[i].block !== undefined) restructuredBlock.add(items[i].block!);
    }
  }

  // Typeface across the page, to say it once when it runs through everything.
  const fam = { wrong: 0, all: 0, g: new Map<string, number>(), c: new Map<string, number>() };
  const ky = 1 + input.scale.fy * (input.scale.y - 1);

  for (const c of flat) {
    const isPresent = present.get(c)!;
    // Completeness: own blocks only, so a missing part counts once, in the component it belongs to.
    const ownW = c.blocks.reduce((s, b) => s + W[b], 0);
    if (!isPresent) {
      if (ownW > 0) push(c, 'completeness', { credit: 0, weight: 1, msg: `${c.name} ${be(c.name)} missing`, tag: 'absent' });
      continue;
    }
    if (ownW > 0) {
      const missing: number[] = [];
      const missingItems: Item[] = [];
      for (const b of c.blocks) {
        if (W[b] <= 0) continue;
        if (partner[b]) {
          push(c, 'completeness', { credit: 1, weight: W[b] });
          continue;
        }
        // A box gone whose place still shows the same colours (a frame drawn another way) is barely missed.
        const looks = goal.blocks[b].kind === 'box' ? clamp01((K.lookAlike(goal, b, candidate, input.pageShift.x, input.pageShift.y) - 0.2) / 0.8) : 1;
        if (looks < 1) push(c, 'completeness', { credit: 1, weight: W[b] * (1 - looks) });
        if (looks > 0) {
          missing.push(b);
          const item: Item = { credit: 0, weight: W[b] * looks };
          missingItems.push(item);
          push(c, 'completeness', item);
        }
      }
      if (missing.length) {
        const msg = `${c.name} ${be(c.name)} missing ${K.groupName(goal, missing).name}`;
        for (const it of missingItems) it.msg = msg;
      }
    }

    // Key facts and wording.
    for (const b of c.blocks) {
      const p = partner[b];
      const block = goal.blocks[b];
      if (!p || !p.main || block.kind !== 'text' || K.isSymbolText(block)) continue;
      const d = textDiff(p.gw, p.cw, p.joined);
      const len = Math.max(1, p.gw.length, p.cw.length);
      const shown = quote(p.cw.join(' ') ? (candidate.blocks[p.c].text ?? p.cw.join(' ')) : '');
      const wanted = quote(block.text ?? p.gw.join(' '));
      if (keySet.has(b)) {
        const credit = d.wrong === 0 ? (d.rewritten ? 0.75 : 1) : d.numeric ? 0 : Math.max(0, 0.5 * (1 - d.wrong / len));
        push(c, 'keyFacts', { credit, weight: 1, msg: credit < 1 ? `${c.name} shows ${shown} where the goal shows ${wanted}` : undefined });
      } else {
        const credit = d.wrong === 0 ? (d.rewritten ? 0.9 : 1) : 1 - Math.min(1, d.wrong / len);
        push(c, 'wording', { credit, weight: W[b], msg: credit < 1 ? `${c.name} says ${shown} where the goal says ${wanted}` : undefined });
      }
    }

    // Placement: the component's box as a whole, against what it is placed by.
    const me = geo.get(c);
    if (me) {
      const parent = parentOf.get(c) ?? null;
      const sibs = parent ? parent.children : tops;
      const xs = [me.off.x];
      const ys = [me.off.y];
      const pg = parent ? geo.get(parent) : undefined;
      if (pg) {
        xs.push(me.off.x - pg.off.x);
        ys.push(me.off.y - pg.off.y);
      }
      // What sits above it: when that grew, shrank, is missing, or something extra came in between, this one moved along.
      let above: PageComponent | null = null;
      for (const s of sibs) {
        const gs = geo.get(s);
        if (s === c || !gs || !present.get(s)) continue;
        const r = gs.gBox;
        if (r.y + r.h <= me.gBox.y + 4 && hOverlap(r, me.gBox) > 0 && (!above || r.y + r.h > geo.get(above)!.gBox.y + geo.get(above)!.gBox.h)) above = s;
      }
      const gTopRef = above ? geo.get(above)!.gAll.y + geo.get(above)!.gAll.h : 0;
      const cTopRef = above ? geo.get(above)!.cAll.y + geo.get(above)!.cAll.h : 0;
      const moveRef = cTopRef - gTopRef;
      let gap = 0;
      for (const s of sibs) {
        if (present.get(s) || s === c) continue;
        const r = s.rect;
        if (r.y >= gTopRef - 4 && r.y + r.h <= me.gBox.y + 4 && hOverlap(r, me.gBox) > 0) gap += r.h;
      }
      let extraH = 0;
      {
        let lo = Infinity;
        let hi = -Infinity;
        for (const r of extraRects) {
          if (r.y >= cTopRef - 4 && r.y + r.h <= me.cBox.y + 4 && hOverlap(r, me.cBox) > 0) {
            lo = Math.min(lo, r.y);
            hi = Math.max(hi, r.y + r.h);
          }
        }
        if (hi > lo) extraH = hi - lo;
      }
      ys.push(me.off.y - moveRef);
      if (gap > 0) ys.push(me.off.y - moveRef + gap);
      if (extraH > 0) ys.push(me.off.y - moveRef - extraH);
      // A row that lost or gained a member spreads out again: the missing or extra member is the cause.
      let rowGap = 0;
      for (const s of sibs) if (!present.get(s) && s !== c && vOverlap(s.rect, me.gBox) > 0.5 * Math.min(s.rect.h, me.gBox.h)) rowGap += s.rect.w;
      for (const r of extraRects) if (vOverlap(r, me.cBox) > 0.5 * Math.min(r.h, me.cBox.h) && hOverlap(r, me.cBox) <= 0) rowGap = Math.max(rowGap, r.w);
      if (rowGap > 0) for (const base of [...xs]) xs.push(base + rowGap, base - rowGap, base + rowGap / 2, base - rowGap / 2);
      const incX = pick(xs);
      const incY = pick(ys);
      const moveSev = restructuredComp.has(c) ? 0 : K.moveSeverity(Math.hypot(FAULTS.sidewaysFactor * incX, incY));
      // A group's size follows from its members, and text's from its words and font: only a component with a box or picture of its own has a size.
      let sizeSev = 0;
      if (me.gFrame && me.cFrame) {
        // Missing content inside it lets it be that much smaller, extra content that much larger: those are completeness and extras.
        const span = (rects: Rect[], axis: 'x' | 'y') => {
          if (!rects.length) return 0;
          const lo = Math.min(...rects.map((r) => (axis === 'x' ? r.x : r.y)));
          const hi = Math.max(...rects.map((r) => (axis === 'x' ? r.x + r.w : r.y + r.h)));
          return hi - lo;
        };
        const lost = (subtree.get(c) ?? []).filter((b) => !partner[b] && W[b] > 0).map((b) => goal.blocks[b].rect);
        const gained = extraRects.filter((r) => K.insideRect(r, me.cFrame!));
        const fit = (gv: number, cv: number, minus: number, plus: number) => (cv < gv - minus ? cv + minus : cv > gv + plus ? cv - plus : gv);
        // A column that runs to the foot of the page is as tall as the page: its height follows what is beside it.
        const toFoot = Math.abs(me.gFrame.y + me.gFrame.h - goal.height) < 4 && Math.abs(me.cFrame.y + me.cFrame.h - candidate.height) < 4;
        const adjusted = { ...me.cFrame, w: fit(me.gFrame.w, me.cFrame.w, span(lost, 'x'), span(gained, 'x')), h: toFoot ? me.gFrame.h : fit(me.gFrame.h, me.cFrame.h, span(lost, 'y'), span(gained, 'y')) };
        sizeSev = sizeSeverity(me.gFrame, adjusted);
      }
      const credit = (1 - moveSev) * (1 - 0.6 * sizeSev);
      let msg: string | undefined;
      if (credit < 1) {
        const W2 = goal.width;
        const gx = me.gBox.x + me.gBox.w / 2;
        const cx = me.cBox.x + me.cBox.w / 2;
        if (moveSev >= 0.6 * sizeSev) {
          if (me.gBox.w < 0.6 * W2 && gx < W2 / 2 - 0.1 * W2 && cx > W2 / 2 + 0.1 * W2) msg = `${c.name} ${be(c.name)} on the right; the goal has ${it(c.name)} on the left`;
          else if (me.gBox.w < 0.6 * W2 && gx > W2 / 2 + 0.1 * W2 && cx < W2 / 2 - 0.1 * W2) msg = `${c.name} ${be(c.name)} on the left; the goal has ${it(c.name)} on the right`;
          else msg = `${c.name} ${plural(c.name) ? 'sit' : 'sits'} ${offsetText(incX, incY)}`;
        } else msg = `${c.name} ${sizeText(me.gFrame!, me.cFrame!)}`;
      }
      push(c, 'placement', { credit, weight: 1, msg });

      // Spacing: each own piece against the component's own box, so a component that moved as a whole is not charged here.
      for (const b of c.blocks) {
        const p = partner[b];
        if (!p || !p.main || p.trust < 0.5 || W[b] <= 0 || isFrame(c, b) || restructuredBlock.has(b)) continue;
        const { x: rx, y: ry } = relativeOffset(p.gRect, p.cRect, me.gBox, me.cBox);
        const ms = K.moveSeverity(Math.hypot(FAULTS.sidewaysFactor * rx, ry));
        const ss = goal.blocks[b].kind !== 'text' ? sizeSeverity(p.gRect, p.cRect) : 0;
        const cr = (1 - ms) * (1 - 0.6 * ss);
        const subject = K.nameOf(goal, b).name;
        push(c, 'spacing', {
          credit: cr,
          weight: p.trust * W[b] * keyBoost(b),
          msg: cr < 1 ? (ms >= 0.6 * ss ? `inside ${c.name}, ${subject} sits ${offsetText(rx, ry)}` : `inside ${c.name}, ${subject} ${sizeText(p.gRect, p.cRect)}`) : undefined,
        });
      }
    }

    // Colour, typography, shape and pictures: pair by pair, own blocks only.
    for (const b of c.blocks) {
      const p = partner[b];
      if (!p || !p.main || p.changed) continue;
      const g = goal.blocks[b];
      const k = candidate.blocks[p.c];
      const t = p.trust;
      const nv = K.notice(goal, b);
      const subject = subjectOf(c, b);
      if (g.kind === 'text') {
        const gs = g.textStyle!;
        const cs = k.textStyle!;
        const gc = contrastRatio(gs.color, g.behind);
        const cc = contrastRatio(cs.color, k.behind);
        const legible = cc < gc ? clamp01(Math.log(gc / cc) / Math.log(2)) * clamp01((2.5 - cc) / 1.0) : 0;
        const sev = K.colourSeverity(colorDistance(gs.color, cs.color), FAULTS.textColourFrom);
        const credit = 1 - Math.max(legible, sev * (1 - legible));
        const seen = legible > 0 ? Math.max(0.3, Math.min(1.5, nv / Math.max(K.visibility(g), 1e-6))) : nv;
        push(c, 'colour', {
          credit,
          weight: t * seen * keyBoost(b) * (K.isSymbolText(g) ? 0.25 : 1),
          msg: credit < 1 ? (legible >= sev ? `${subject} is hard to read against what is behind it` : `the text colour of ${subject} ${colourText(gs.color, cs.color)}`) : undefined,
        });
        if (K.isSymbolText(g) || t < 0.5) continue;
        const famOff = gs.fontClass !== cs.fontClass;
        fam.all += nv;
        fam.g.set(gs.fontClass, (fam.g.get(gs.fontClass) ?? 0) + nv);
        fam.c.set(cs.fontClass, (fam.c.get(cs.fontClass) ?? 0) + nv);
        if (famOff) fam.wrong += nv;
        const lr = Math.max(0, Math.abs(Math.log(cs.fontSize / (gs.fontSize * ky))) - 0.07);
        const sizeSev = 1 - Math.exp(-Math.pow(lr / 0.15, 1.5));
        const caseOff = (g.text ?? '').toLowerCase() === (k.text ?? '').toLowerCase() && g.text !== k.text;
        const decor = gs.italic !== cs.italic || gs.underline !== cs.underline || caseOff ? 1 : 0;
        const bold = gs.bold !== cs.bold ? 1 : 0;
        const parts = [0.5 * (famOff ? 1 : 0), 0.25 * bold, 0.5 * sizeSev, 0.15 * decor];
        const credit2 = 1 - Math.min(1, parts.reduce((s, v) => s + v, 0));
        let msg: string | undefined;
        let tag: string | undefined;
        if (credit2 < 1) {
          const worst = parts.indexOf(Math.max(...parts));
          if (worst === 0) {
            msg = `${subject} is in ${FAMILY[cs.fontClass]} typeface where the goal uses ${FAMILY[gs.fontClass].replace(/^an? /, '')}`;
            tag = 'family';
          } else if (worst === 2) msg = `${subject} is ${cs.fontSize > gs.fontSize ? 'larger' : 'smaller'} than in the goal (${Math.round(cs.fontSize)} pixels instead of ${Math.round(gs.fontSize)})`;
          else if (worst === 1) msg = `${subject} is ${cs.bold ? 'bold' : 'not bold'} where the goal's is ${gs.bold ? 'bold' : 'not'}`;
          else msg = `${subject} is ${caseOff ? 'in different capitals' : gs.italic !== cs.italic ? (cs.italic ? 'in italics' : 'not in italics') : cs.underline ? 'underlined' : 'not underlined'} where the goal's is not`;
        }
        push(c, 'typography', { credit: credit2, weight: nv * keyBoost(b), msg, tag });
      } else if (g.kind === 'box') {
        const gb = g.boxStyle!;
        const cb = k.boxStyle!;
        // A box with no fill of its own shows what is behind it: that colour is not this box's.
        const filled = (bl: typeof g) => K.standsOut(colorDistance(bl.boxStyle!.background, bl.behind)) >= 0.5;
        let de = filled(g) || filled(k) ? colorDistance(gb.background, cb.background) : 0;
        if (gb.borderColor && cb.borderColor && Math.min(K.borderPresence(g), K.borderPresence(k)) > 0.5) de = Math.max(de, 0.5 * colorDistance(gb.borderColor, cb.borderColor));
        const area = Math.min(1.5, 1.3 * K.screenSize(g.rect));
        const seen = filled(g) || filled(k) ? Math.max(nv, area * 0.8) : nv;
        const sev = K.colourSeverity(de, FAULTS.boxColourFrom);
        push(c, 'colour', { credit: 1 - sev, weight: t * seen, msg: sev > 0 ? `the background of ${subject} ${colourText(gb.background, cb.background)}` : undefined });
        if (t < 0.5) continue;
        const parts = K.boxStyleParts(g, k);
        // A border that shows more or less only because the colours around it changed is a colour change, not a shape change.
        const drawn = (s: typeof gb) => s.hasBorder && s.borderWidth > 0;
        const sameBorder = drawn(gb) === drawn(cb) && (!drawn(gb) || (Math.min(gb.borderWidth, cb.borderWidth) + 1) / (Math.max(gb.borderWidth, cb.borderWidth) + 1) >= 0.7);
        let border = sameBorder ? 0 : 1 - parts.border.credit;
        let shadow = gb.shadow !== cb.shadow ? 1 : 0;
        // A border drawn with a shadow (or the other way round) that looks the same on screen is the same look built another way.
        // (Judged on the pixels along its edges, inside and out, where borders and shadows are drawn.)
        if ((shadow || border > 0) && edgeDifference(goal, g.rect, candidate, k.rect) < 3) {
          border = 0;
          shadow = 0;
        }
        const corners = clamp01((Math.abs(K.radiusPx(g) - K.radiusPx(k)) - 1.5) / 10);
        const sp = [0.5 * border, 0.5 * corners, 0.4 * shadow];
        const credit = 1 - Math.min(1, sp.reduce((s, v) => s + v, 0));
        let msg: string | undefined;
        if (credit < 1) {
          const worst = sp.indexOf(Math.max(...sp));
          if (worst === 0) msg = `${subject} ${K.borderPresence(k) > K.borderPresence(g) + 0.3 ? 'has a border the goal does not' : K.borderPresence(g) > K.borderPresence(k) + 0.3 ? 'has no border where the goal has one' : 'has a different border from the goal'}`;
          else if (worst === 1) msg = `the corners of ${subject} are ${K.radiusPx(k) > K.radiusPx(g) ? 'more rounded' : 'squarer'} than in the goal`;
          else msg = `${subject} ${cb.shadow ? 'has a shadow the goal does not' : 'has no shadow where the goal has one'}`;
        }
        push(c, 'shape', { credit, weight: Math.max(nv, K.notice(candidate, p.c)), msg });
      } else {
        const colSev = K.colourSeverity(K.pictureDistance(goal, b, candidate, p.c), FAULTS.boxColourFrom);
        const same = regionShapeSimilarity(goal, g.rect, candidate, k.rect);
        const wrong = clamp01((0.85 - same) / 0.4);
        const credit = (1 - colSev) * (1 - wrong);
        push(c, 'pictures', {
          credit,
          weight: 0.3 + 1.3 * K.screenSize(g.rect),
          msg: credit < 1 ? (wrong >= colSev ? `the picture in ${c.name} shows something different from the goal's` : `the picture in ${c.name} has other colours than the goal's`) : undefined,
        });
      }
    }
  }

  // ---- each component's values, and the notes with what each cost ----
  const absentTop = (c: PageComponent): boolean => {
    const p = parentOf.get(c);
    return !present.get(c) && (!p || present.get(p)!);
  };
  const ancestorAbsent = (c: PageComponent): PageComponent => {
    let cur = c;
    for (let p = parentOf.get(cur); p && !present.get(p); p = parentOf.get(p)) cur = p;
    return cur;
  };
  const rawLoss = new Map<CriterionId, number>();
  for (const c of flat) {
    const bag = bags.get(c) ?? {};
    const vals: Partial<Record<CriterionId, number>> = {};
    const iw = IMPORTANCE_WEIGHT[c.importance] ?? 1;
    for (const [crit, items] of Object.entries(bag) as [CriterionId, Item[]][]) {
      const sw = items.reduce((s, it) => s + it.weight, 0);
      if (!(sw > 0)) continue;
      vals[crit] = items.reduce((s, it) => s + it.weight * it.credit, 0) / sw;
      for (const it of items) {
        if (it.credit >= 1) continue;
        const loss = (iw * it.weight * (1 - it.credit)) / sw;
        if (loss <= 0) continue;
        // A missing component inside a missing component is told as the outer one missing.
        const target = !present.get(c) && !absentTop(c) ? ancestorAbsent(c) : c;
        const msg = target === c ? it.msg : `${target.name} ${be(target.name)} missing`;
        const key = `${crit}|${target.id}|${it.tag === 'family' ? 'family' : ''}`;
        let note = notes.find((n) => `${n.crit}|${n.comp}|${n.tag === 'family' ? 'family' : ''}` === key);
        if (!note) notes.push((note = { crit, comp: target.id, loss: 0, best: 0, msg: msg ?? '', tag: it.tag }));
        note.loss += loss;
        if (loss > note.best && msg) {
          note.best = loss;
          note.msg = msg;
        }
      }
    }
    values.set(c, vals);
  }

  // ---- the page's criteria ----
  const pageValue = new Map<CriterionId, number | null>();
  const norm = new Map<CriterionId, number>();
  for (const { id } of CRITERIA) {
    if (id === 'noExtras' || id === 'likeness') continue;
    let sw = 0;
    let s = 0;
    for (const c of flat) {
      const v = values.get(c)?.[id];
      if (v === undefined) continue;
      const iw = IMPORTANCE_WEIGHT[c.importance] ?? 1;
      sw += iw;
      s += iw * v;
    }
    pageValue.set(id, sw > 0 ? s / sw : null);
    norm.set(id, sw);
  }
  for (const n of notes) n.loss /= norm.get(n.crit) || 1;

  // The page background is the biggest colour area there is: a fifth of the colour criterion.
  {
    const de = colorDistance(goal.pageBackground, candidate.pageBackground);
    const bg = 1 - K.colourSeverity(de, FAULTS.boxColourFrom);
    const comp = pageValue.get('colour');
    pageValue.set('colour', comp === null || comp === undefined ? bg : 0.8 * comp + 0.2 * bg);
    if (comp !== null && comp !== undefined) for (const n of notes) if (n.crit === 'colour') n.loss *= 0.8;
    if (bg < 1) notes.push({ crit: 'colour', comp: 'page', loss: (comp === null || comp === undefined ? 1 : 0.2) * (1 - bg), best: 0, msg: `the page background ${colourText(goal.pageBackground, candidate.pageBackground)}` });
  }

  // A typeface change that runs through most of the page is one note.
  if (fam.all > 0 && fam.wrong / fam.all >= 0.6) {
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'sans';
    const famNotes = notes.filter((n) => n.crit === 'typography' && n.tag === 'family');
    const loss = famNotes.reduce((s, n) => s + n.loss, 0);
    for (const n of famNotes) notes.splice(notes.indexOf(n), 1);
    notes.push({ crit: 'typography', comp: 'page', loss, best: 0, msg: `the whole page is in ${FAMILY[top(fam.c)]} typeface where the goal uses ${FAMILY[top(fam.g)].replace(/^an? /, '')}` });
  }

  // A colour change in most components is one change of palette: said once, with the plainest example.
  {
    const col = notes.filter((n) => n.crit === 'colour' && n.comp !== 'page');
    const sum = col.reduce((s, n) => s + n.loss, 0);
    if (col.length >= 4 && sum >= 0.3) {
      const worst = [...col].sort((a, b) => b.loss - a.loss || a.msg.localeCompare(b.msg))[0];
      for (const n of col) notes.splice(notes.indexOf(n), 1);
      notes.push({ crit: 'colour', comp: 'page', loss: sum, best: 0, msg: `the colours are changed throughout the page; for example, ${worst.msg}` });
    }
  }

  // Nothing extra: page-wide, from the extra parts found (each costs by how much a person notices it).
  {
    const extras = input.faults.filter((f) => f.kind === 'extra');
    const sum = extras.reduce((s, f) => s + f.amount, 0);
    const v = Math.exp(-0.7 * Math.max(0, sum - 0.02));
    pageValue.set('noExtras', v);
    for (const f of extras) {
      const blocks = f.blocks ?? [f.candidate];
      let box = candidate.blocks[blocks[0]].rect;
      for (const b of blocks) box = union(box, candidate.blocks[b].rect);
      const cx = box.x + box.w / 2 - input.pageShift.x;
      const cy = box.y + box.h / 2 - input.pageShift.y;
      let home: PageComponent | null = null;
      for (const c of flat) {
        const r = c.rect;
        if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h && (!home || r.w * r.h < home.rect.w * home.rect.h)) home = c;
      }
      const name = K.groupName(candidate, blocks).name;
      notes.push({
        crit: 'noExtras',
        comp: home?.id ?? 'page',
        loss: sum > 0 ? ((1 - v) * f.amount) / sum : 0,
        best: 0,
        msg: home ? `there is an extra ${name.replace(/^the /, '')} in ${home.name} that the goal does not have` : `there is an extra ${name.replace(/^the /, '')}${/ near the | down the /.test(name) ? '' : ' ' + K.placeWords(box, candidate)} that the goal does not have`,
      });
    }
  }

  // The same slip in several look-alike components (each card of a row) is one note.
  {
    const nameOf = new Map(flat.map((c) => [c.id, c.name]));
    const groups = new Map<string, Note[]>();
    for (const n of notes) {
      const name = nameOf.get(n.comp);
      if (!name || !n.msg.includes(name)) continue;
      const shape = `${n.crit}|${n.msg.split(name).join('#').replace(/'[^']*'/g, 'Q').replace(/near the [a-z ]+/g, 'near').replace(/\d+/g, 'N')}`;
      groups.set(shape, [...(groups.get(shape) ?? []), n]);
    }
    for (const list of groups.values()) {
      if (list.length < 3) continue;
      list.sort((a, b) => b.loss - a.loss || a.msg.localeCompare(b.msg));
      const head = list[0];
      head.msg = `${head.msg} (and the same in ${list.length - 1} more like it)`;
      for (const n of list.slice(1)) {
        head.loss += n.loss;
        notes.splice(notes.indexOf(n), 1);
      }
    }
  }

  // Screenshots within a point and a half of each other look the same to a person.
  const likeness = clamp01(input.likeness / 0.985);
  pageValue.set('likeness', likeness);
  if (likeness < 0.95) notes.push({ crit: 'likeness', comp: 'page', loss: 0.5 * (1 - likeness), best: 0, msg: 'the page as a whole looks different from the goal at a glance' });

  // ---- report ----
  const criteria: CriterionResult[] = CRITERIA.map(({ id, name, group }) => {
    const v = pageValue.get(id);
    const value = v === null || v === undefined ? null : round4(clamp01(v));
    const mine = notes.filter((n) => n.crit === id && n.msg && n.loss > 1e-4).sort((a, b) => b.loss - a.loss || a.msg.localeCompare(b.msg));
    return { id, name, group, value, notes: value === null || value >= 1 ? [] : mine.slice(0, 3).map((n) => capital(n.msg)) };
  });
  const components: ComponentResult[] = flat.map((c) => {
    const vals = values.get(c) ?? {};
    const out: Partial<Record<CriterionId, number>> = {};
    for (const { id } of CRITERIA) if (vals[id] !== undefined) out[id] = round4(clamp01(vals[id]!));
    return { id: c.id, name: c.name, type: c.type, importance: c.importance, present: present.get(c)!, criteria: out };
  });
  const shortOf = new Map(CRITERIA.map((c) => [c.id, c.short]));
  const valueOf = new Map(criteria.map((c) => [c.id, c.value]));
  const top = notes
    .filter((n) => n.msg && n.loss > 1e-3 && (valueOf.get(n.crit) ?? 1) < 1)
    .sort((a, b) => b.loss - a.loss || a.msg.localeCompare(b.msg))
    .slice(0, 8);
  const critOrder: CriterionId[] = [];
  for (const n of top) if (!critOrder.includes(n.crit)) critOrder.push(n.crit);
  const criteriaFeedback: Feedback[] = critOrder.flatMap((crit) =>
    top.filter((n) => n.crit === crit).map((n) => ({ message: `${shortOf.get(crit)}: ${n.msg}`, points: Math.max(0.1, round1((100 / 12) * n.loss)) })),
  );
  return { criteria, components, criteriaFeedback };
}
