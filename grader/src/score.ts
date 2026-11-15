import { chroma, colorDistance, colorName, contrastRatio, deltaE00, labOf, lightness, type Lab } from './color';
import { CONTENT, FAULTS, GRADER_VERSION, LAYOUT, MATCH, MAX_PAGE_HEIGHT, SALIENCE, STYLE, TOL, VIEWPORT, WEIGHTS } from './config';
import type { Block, Breakdown, Feedback, GradeResult, PageSnapshot, RGB, Rect } from './types';
import { clamp01, fallingCredit, median, risingCredit, round1, wordOverlap, wordPairs, words } from './util';
import { compareVisual, differenceCentre, regionColours, regionShapeSimilarity } from './visual';
import { measureCriteria, subScoresFromCriteria } from './criteria/measure';
import { buildPageProfile, type PageProfile } from './profile/index';

/**
 * Scores a candidate page against a goal page. Pure arithmetic on two
 * snapshots: no browser, no clock, no randomness. The same two snapshots
 * always give the same result.
 *
 * It answers four questions a person would ask, each from 0 to 100:
 *   content - is the right text there, and nothing extra?
 *   layout  - is everything in the right place, at the right size?
 *   style   - are the colours, fonts, borders and corners right?
 *   visual  - at a glance, does it look like the goal?
 *
 * Each is read two ways. The proportional reading averages over the page
 * by weight. The noticed-faults reading lists the faults a person would
 * notice (a wrong price, a missing card, pale text, a column that lost its
 * centring), each costing about the same on a short page as on a long one.
 * The total, and each part, is the lower of the two readings.
 *
 * Alongside the score it keeps a ledger of where every lost point went, and
 * turns the largest entries into plain sentences for the player.
 */

interface Pair {
  goal: number;
  candidate: number;
  /**
   * 0 to 1: how sure the pairing is. Text that shares too few words with
   * the goal's fades out of its pair smoothly (see MATCH.textFadeFrom)
   * instead of dropping out at one word, so cutting a paragraph short never
   * makes its place and font suddenly count for nothing.
   */
  trust: number;
}

/**
 * How much a block counts. Bigger blocks matter more, but not in proportion:
 * a headline should not drown out a button. And things that stand out from
 * what is behind them matter more than things that blend in: a bright
 * button is noticed before a faint card outline. A block nobody can see
 * counts nothing, and its weight fades in smoothly (see SALIENCE), so a
 * colour change too small to see never makes a block suddenly count.
 */
function importance(block: Block, pageWidth: number): number {
  const w = Math.max(0, Math.min(block.rect.w, pageWidth));
  const h = Math.max(0, Math.min(block.rect.h, MAX_PAGE_HEIGHT));
  // Bullets, ticks and arrows are decoration: they count for little.
  return Math.sqrt(w * h) * standsOut(contrastOf(block)) * (isSymbolText(block) ? 0.25 : 1);
}

function contrastOf(block: Block): number {
  if (block.kind === 'text') return colorDistance(block.textStyle!.color, block.behind);
  if (block.kind === 'box') {
    const box = block.boxStyle!;
    let contrast = colorDistance(box.background, block.behind);
    if (box.hasBorder && box.borderColor) contrast = Math.max(contrast, colorDistance(box.borderColor, block.behind));
    if (box.shadow) contrast = Math.max(contrast, SALIENCE.baseAt);
    return contrast;
  }
  return SALIENCE.fullAt;
}

/** Block weights of a page; a goal's are worked out once and kept with it. */
const weightCache = new WeakMap<PageSnapshot, number[]>();
function weightsOf(page: PageSnapshot): number[] {
  let w = weightCache.get(page);
  if (!w) {
    w = page.blocks.map((b) => importance(b, page.width));
    weightCache.set(page, w);
  }
  return w;
}

/** Weight multiplier for a contrast: 0 when invisible, `base` at `baseAt`, 2 - `base` from `fullAt`. */
function standsOut(contrast: number): number {
  const { invisible, baseAt, base, fullAt } = SALIENCE;
  if (contrast <= invisible) return 0;
  if (contrast < baseAt) return (base * (contrast - invisible)) / (baseAt - invisible);
  const top = 2 - base;
  return base + (top - base) * Math.min(1, (contrast - baseAt) / (fullAt - baseAt));
}

function sizeRatio(a: number, b: number): number {
  // A few pixels either way is not a different size (to this reading; the
  // noticed-faults reading still charges a little for it).
  if (Math.abs(a - b) <= 4) return 1;
  const larger = Math.max(a, b);
  return larger <= 0 ? 1 : Math.min(a, b) / larger;
}

/** 0 to 1: how close two rectangles are in width and height. */
function sizeCredit(goal: Rect, candidate: Rect): number {
  return (
    (risingCredit(sizeRatio(goal.w, candidate.w), TOL.sizeRatio.full, TOL.sizeRatio.zero) +
      risingCredit(sizeRatio(goal.h, candidate.h), TOL.sizeRatio.full, TOL.sizeRatio.zero)) /
    2
  );
}

/** 0 to 1: how close one rectangle's centre is to another's, after removing a page-wide shift. */
const positionCreditAt = (goal: Rect, candidate: Rect, dx = 0, dy = 0) => positionCredit(goal, candidate, dx, dy);
function positionCredit(goal: Rect, candidate: Rect, dx = 0, dy = 0): number {
  const offX = candidate.x + candidate.w / 2 - dx - (goal.x + goal.w / 2);
  const offY = candidate.y + candidate.h / 2 - dy - (goal.y + goal.h / 2);
  return offsetCredit(offX, offY);
}

function offsetCredit(ox: number, oy: number): number {
  return fallingCredit(Math.abs(ox), TOL.position.full, TOL.position.zero) * fallingCredit(Math.abs(oy), TOL.position.full, TOL.position.zero);
}

/** 0 to 1: how close one rectangle is to another in place and size, after removing a page-wide shift. */
function geometryCredit(goal: Rect, candidate: Rect, dx = 0, dy = 0): number {
  return (
    LAYOUT.positionShare * positionCredit(goal, candidate, dx, dy) +
    (1 - LAYOUT.positionShare) * sizeCredit(goal, candidate)
  );
}

function colorCredit(a: RGB, b: RGB): number {
  return fallingCredit(seenColourDistance(a, b), TOL.color.full, TOL.color.zero);
}

/** How many neighbouring-word pairs of the shorter text appear in the longer one: 1 for a text cut short. */
function pairContainment(a: string[], b: string[]): number {
  const pa = wordPairs([a]);
  const pb = wordPairs([b]);
  if (Math.min(pa.length, pb.length) < MATCH.minPairsForContainment) return 0;
  const [small, large] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const counts = new Map<string, number>();
  for (const p of large) counts.set(p, (counts.get(p) ?? 0) + 1);
  let shared = 0;
  for (const p of small) {
    const left = counts.get(p) ?? 0;
    if (left > 0) {
      shared++;
      counts.set(p, left - 1);
    }
  }
  return shared / small.length;
}

/** 0 to 1: how much two texts are the same text. The full words agree, or one is the other cut short. */
function textSimilarity(a: string[], b: string[]): number {
  return Math.max(wordOverlap(a, b), pairContainment(a, b));
}

/**
 * Pairs each goal block with the candidate block that is most plausibly
 * "the same thing". Text pairs mainly by its words, boxes and images by
 * where they are and how big they are. A box's colour only breaks ties: a
 * card that is there in another colour is a colour fault, not a missing
 * card. Best pairs are taken first; ties are broken by position in the
 * list, so the pairing never varies.
 */
/** The words of the text inside each box: what a person reads it as ("the card with 'Team'"); kept per page. */
const labelCache = new WeakMap<PageSnapshot, string[][]>();
function labelsOf(page: PageSnapshot): string[][] {
  let v = labelCache.get(page);
  if (!v) {
    const texts = page.blocks.map((b, i) => i).filter((i) => page.blocks[i].kind === 'text');
    v = page.blocks.map((b) => (b.kind === 'box' ? texts.filter((t) => insideRect(page.blocks[t].rect, b.rect)).flatMap((t) => words(page.blocks[t].text ?? '')) : []));
    labelCache.set(page, v);
  }
  return v;
}

function matchBlocks(goalPage: PageSnapshot, candidatePage: PageSnapshot, goalWords: string[][], candidateWords: string[][]): Pair[] {
  const goal = goalPage.blocks;
  const candidate = candidatePage.blocks;
  const options: { similarity: number; trust: number; goal: number; candidate: number }[] = [];
  const goalLabels = labelsOf(goalPage);
  const candLabels = labelsOf(candidatePage);

  // Anchors: texts that appear exactly once on each page, word for word.
  // Each block is looked for where its nearest anchor says that part of the
  // page went, so a table that moved up keeps its own rows: the fifth 'Paid'
  // pairs with the fifth 'Paid', not with whichever one now sits in its place.
  const key = (b: Block) => (b.kind === 'text' ? (b.text ?? '').trim().toLowerCase() : '');
  const count = (blocks: Block[]) => {
    const m = new Map<string, number[]>();
    blocks.forEach((b, i) => {
      const k = key(b);
      if (k) m.set(k, [...(m.get(k) ?? []), i]);
    });
    return m;
  };
  const gc = count(goal);
  const cc = count(candidate);
  const anchors: { i: number; x: number; y: number; dx: number; dy: number }[] = [];
  for (const [k, gi] of gc) {
    const ci = cc.get(k);
    if (gi.length !== 1 || !ci || ci.length !== 1) continue;
    const a = goal[gi[0]].rect;
    const b = candidate[ci[0]].rect;
    anchors.push({ i: gi[0], x: a.x + a.w / 2, y: a.y + a.h / 2, dx: b.x + b.w / 2 - (a.x + a.w / 2), dy: b.y + b.h / 2 - (a.y + a.h / 2) });
  }
  const shiftFor = (r: Rect, self: number) => {
    let best: (typeof anchors)[number] | null = null;
    let bestD = Infinity;
    const x = r.x + r.w / 2;
    const y = r.y + r.h / 2;
    for (const a of anchors) {
      if (a.i === self) continue; // a block is placed by its neighbours, not by itself
      const d = Math.abs(a.y - y) * 2 + Math.abs(a.x - x);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best ?? { dx: 0, dy: 0 };
  };

  for (let g = 0; g < goal.length; g++) {
    const gb = goal[g];
    const at = shiftFor(gb.rect, g);
    // Position is judged both where the block was and where its part of the page went; the better counts.
    const positionCredit = (a: Rect, b: Rect) => Math.max(positionCreditAt(a, b), positionCreditAt(a, b, at.dx, at.dy));
    const geometryCredit = (a: Rect, b: Rect) => LAYOUT.positionShare * positionCredit(a, b) + (1 - LAYOUT.positionShare) * sizeCredit(a, b);
    for (let c = 0; c < candidate.length; c++) {
      const cb = candidate[c];
      if (gb.kind !== cb.kind) continue;
      let similarity: number;
      let trust = 1;
      if (gb.kind === 'text') {
        const text = textSimilarity(goalWords[g], candidateWords[c]);
        if (text <= MATCH.textFadeFrom) continue;
        // A short value (a price, a count) is the same value only near where its part of the page went.
        if (Math.min(goalWords[g].length, candidateWords[c].length) <= 3 && /\p{N}/u.test(gb.text ?? '') && positionCredit(gb.rect, cb.rect) < 0.2) continue;
        trust = risingCredit(text, MATCH.minTextSimilarity, MATCH.textFadeFrom);
        // Sharing a word or two is not enough to call a button and a link the same thing: a partial
        // match must at least be the same sort of thing (both in a button-like box, or neither) and near its place.
        if (trust < 1 && (factsOf(goalPage).pill[g] !== factsOf(candidatePage).pill[c] || positionCredit(gb.rect, cb.rect) < 0.5)) continue;
        // The same words at a very different size are another piece of text (a menu item and the page title that repeats it).
        const font = risingCredit(sizeRatioExact(gb.textStyle!.fontSize, cb.textStyle!.fontSize), TOL.fontRatio.full, TOL.fontRatio.zero);
        similarity = 0.7 * text + 0.18 * geometryCredit(gb.rect, cb.rect) + 0.12 * font;
      } else if (gb.kind === 'box') {
        // A box of a wildly different size is not "the same box", whatever
        // its colour: a matching dot must not stand in for a matching panel.
        const size = sizeCredit(gb.rect, cb.rect);
        if (size < MATCH.minBoxSizeCredit) continue;
        const pos = positionCredit(gb.rect, cb.rect);
        const color = colorCredit(gb.boxStyle!.background, cb.boxStyle!.background);
        const gl = goalLabels[g];
        const cl = candLabels[c];
        if (gl.length > 0 && cl.length > 0) {
          // Boxes holding text are known by what they say: the card with 'Team' moved is still that card.
          const label = wordOverlap(gl, cl);
          if (size < 0.4 || (label < 0.5 && pos < 0.3)) continue;
          similarity = 0.4 * label + 0.3 * pos + 0.15 * size + 0.15 * color;
        } else {
          if (size < 0.5 || (pos < 0.3 && !(color >= 0.8 && size >= 0.8))) continue;
          similarity = 0.5 * pos + 0.3 * size + 0.2 * color;
        }
        if (similarity < MATCH.minBoxSimilarity) continue;
      } else {
        const size = sizeCredit(gb.rect, cb.rect);
        const pos = positionCredit(gb.rect, cb.rect);
        const color = fallingCredit(pictureDistance(goalPage, g, candidatePage, c), TOL.color.full, TOL.color.zero);
        if (size < 0.5 || (pos < 0.3 && !(color >= 0.8 && size >= 0.8))) continue;
        similarity = 0.5 * pos + 0.3 * size + 0.2 * color;
        if (similarity < MATCH.minImageSimilarity) continue;
      }
      options.push({ similarity, trust, goal: g, candidate: c });
    }
  }

  options.sort((a, b) => b.similarity - a.similarity || a.goal - b.goal || a.candidate - b.candidate);
  const goalTaken = new Uint8Array(goal.length);
  const candidateTaken = new Uint8Array(candidate.length);
  const pairs: Pair[] = [];
  for (const option of options) {
    if (goalTaken[option.goal] || candidateTaken[option.candidate]) continue;
    goalTaken[option.goal] = 1;
    candidateTaken[option.candidate] = 1;
    pairs.push({ goal: option.goal, candidate: option.candidate, trust: option.trust });
  }
  // Words that are on screen are not missing: a text left over on both sides that says exactly the same
  // thing (a price that went with its course to another place) is that text, moved.
  const sayG = goalWords.map((w) => w.join(' '));
  const sayC = candidateWords.map((w) => w.join(' '));
  const leftG = goal.map((_, i) => i).filter((i) => !goalTaken[i] && goal[i].kind === 'text' && goalWords[i].length > 0);
  const leftC = candidate.map((_, i) => i).filter((i) => !candidateTaken[i] && candidate[i].kind === 'text' && candidateWords[i].length > 0);
  const same: { d: number; goal: number; candidate: number }[] = [];
  // ...but only when it moved the way the nearest thing paired around it moved (it went along with its
  // course): a price that turns up beside another dish has been given to the wrong item, not moved.
  const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const movedAlong = (g: number, c: number) => {
    const a = centre(goal[g].rect);
    const b = centre(candidate[c].rect);
    let best: Pair | null = null;
    let bestD = Infinity;
    for (const p of pairs) {
      if (goal[p.goal].kind !== 'text') continue;
      const q = centre(goal[p.goal].rect);
      const d = Math.abs(q.x - a.x) + 2 * Math.abs(q.y - a.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best || bestD > 400) return false;
    const q0 = centre(goal[best.goal].rect);
    const q1 = centre(candidate[best.candidate].rect);
    const tol = Math.max(40, 0.15 * Math.hypot(b.x - a.x, b.y - a.y));
    return Math.abs(b.x - a.x - (q1.x - q0.x)) <= tol && Math.abs(b.y - a.y - (q1.y - q0.y)) <= tol;
  };
  for (const g of leftG) {
    const sg = sayG[g];
    for (const c of leftC) {
      if (sayC[c] !== sg || !movedAlong(g, c)) continue;
      const a = goal[g].rect;
      const b = candidate[c].rect;
      same.push({ d: Math.abs(a.x - b.x) + Math.abs(a.y - b.y), goal: g, candidate: c });
    }
  }
  same.sort((a, b) => a.d - b.d || a.goal - b.goal || a.candidate - b.candidate);
  for (const s of same) {
    if (goalTaken[s.goal] || candidateTaken[s.candidate]) continue;
    goalTaken[s.goal] = 1;
    candidateTaken[s.candidate] = 1;
    pairs.push({ goal: s.goal, candidate: s.candidate, trust: 1 });
  }
  pairs.sort((a, b) => a.goal - b.goal);
  return pairs;
}

/**
 * Text that changed its words but kept its place: "shows $94 where the goal
 * shows $49". Pairs unmatched goal text with unmatched candidate text at
 * about the same place and font size. Used only to name one changed value
 * as one fault, instead of a missing text plus an extra text.
 */
function changedText(goal: PageSnapshot, candidate: PageSnapshot, goalFree: number[], candFree: number[], dx: number, dy: number, goalWords: string[][], candidateWords: string[][]): Pair[] {
  const options: { d: number; goal: number; candidate: number }[] = [];
  // A text that plainly is some other text of the other page (a heading of another section, another
  // product's price) did not change into this one: it is that other text, missing here or moved.
  const canonG = goalWords.map(canonical);
  const canonC = candidateWords.map(canonical);
  const gFree = new Set(goalFree);
  const cFree = new Set(candFree);
  const freeCanonG = canonG.map((w, i) => (gFree.has(i) ? w : []));
  const freeCanonC = canonC.map((w, i) => (cFree.has(i) ? w : []));
  const elsewhere = (words: string[], self: number, other: string[][]) => words.length > 0 && other.some((w, i) => i !== self && w.length > 0 && textSimilarity(words, w) >= 0.6);
  const isElsewhereC = new Map(candFree.map((c) => [c, elsewhere(canonC[c], -1, freeCanonG)]));
  const isElsewhereG = new Map(goalFree.map((g) => [g, elsewhere(canonG[g], -1, freeCanonC)]));
  const pillG = factsOf(goal).pill;
  const pillC = factsOf(candidate).pill;
  for (const g of goalFree) {
    const gb = goal.blocks[g];
    if (gb.kind !== 'text') continue;
    for (const c of candFree) {
      const cb = candidate.blocks[c];
      if (cb.kind !== 'text') continue;
      if (pillG[g] !== pillC[c]) continue;
      if (isElsewhereC.get(c) || isElsewhereG.get(g)) continue;
      const fs = sizeRatioExact(gb.textStyle!.fontSize, cb.textStyle!.fontSize);
      if (fs < 0.7) continue;
      const ox = Math.min(Math.abs(cb.rect.x - gb.rect.x), Math.abs(cb.rect.x - dx - gb.rect.x));
      const oy = Math.min(Math.abs(cb.rect.y - gb.rect.y), Math.abs(cb.rect.y - dy - gb.rect.y));
      const reach = Math.max(24, 1.5 * gb.textStyle!.fontSize);
      if (ox > Math.max(reach, 40, 0.5 * gb.rect.w) || oy > reach) continue;
      options.push({ d: ox + oy, goal: g, candidate: c });
    }
  }
  options.sort((a, b) => a.d - b.d || a.goal - b.goal || a.candidate - b.candidate);
  const gt = new Set<number>();
  const ct = new Set<number>();
  const out: Pair[] = [];
  for (const o of options) {
    if (gt.has(o.goal) || ct.has(o.candidate)) continue;
    gt.add(o.goal);
    ct.add(o.candidate);
    out.push({ goal: o.goal, candidate: o.candidate, trust: 0 });
  }
  return out;
}

function sizeRatioExact(a: number, b: number): number {
  const larger = Math.max(a, b);
  return larger <= 0 ? 1 : Math.min(a, b) / larger;
}

/** Style credit of a pair, attribute by attribute; each value is that attribute's weight times its credit. */
type StyleParts = Record<string, { weight: number; credit: number }>;

function textStyleParts(goal: Block, candidate: Block): StyleParts {
  const g = goal.textStyle!;
  const c = candidate.textStyle!;
  const w = STYLE.text;
  const sameWords = (goal.text ?? '').toLowerCase() === (candidate.text ?? '').toLowerCase();
  const caseOk = !sameWords || goal.text === candidate.text;
  return {
    color: { weight: w.color, credit: colorCredit(g.color, c.color) },
    background: { weight: w.background, credit: colorCredit(goal.behind, candidate.behind) },
    fontSize: {
      weight: w.fontSize,
      credit: risingCredit(sizeRatioExact(g.fontSize, c.fontSize), TOL.fontRatio.full, TOL.fontRatio.zero),
    },
    bold: { weight: w.bold, credit: g.bold === c.bold ? 1 : 0 },
    family: { weight: w.family, credit: g.fontClass === c.fontClass ? 1 : 0 },
    decoration: { weight: w.decoration, credit: (g.italic === c.italic ? 0.5 : 0) + (g.underline === c.underline ? 0.5 : 0) },
    letterCase: { weight: w.letterCase, credit: caseOk ? 1 : 0 },
  };
}

/**
 * 0 to 1: how plainly a box's border shows as a border. A border nobody
 * can tell from the box's fill, or from what is around it, is not there as
 * far as a person is concerned; it fades in as it becomes visible, the same
 * way a block's weight does.
 */
function borderPresence(block: Block): number {
  const box = block.boxStyle!;
  if (!box.hasBorder || !box.borderColor) return 0;
  const contrast = Math.min(colorDistance(box.borderColor, box.background), colorDistance(box.borderColor, block.behind));
  return risingCredit(contrast, SALIENCE.baseAt, SALIENCE.invisible);
}

/** Corner radius in pixels. */
function radiusPx(block: Block): number {
  return (block.boxStyle!.radius * Math.min(block.rect.w, block.rect.h)) / 2;
}

function boxStyleParts(goal: Block, candidate: Block): StyleParts {
  const g = goal.boxStyle!;
  const c = candidate.boxStyle!;
  const w = STYLE.box;
  const pg = borderPresence(goal);
  const pc = borderPresence(candidate);
  const both = Math.min(pg, pc);
  const neither = 1 - Math.max(pg, pc);
  const borderColor = g.borderColor && c.borderColor ? colorCredit(g.borderColor, c.borderColor) : 1;
  const widthRatio = (Math.min(g.borderWidth, c.borderWidth) + 1) / (Math.max(g.borderWidth, c.borderWidth) + 1);
  const borderWidth = risingCredit(widthRatio, TOL.borderWidthRatio.full, TOL.borderWidthRatio.zero);
  // The colour a box shows is its fill and, as far as its borders cover it
  // (all of it, for a triangle drawn with borders), its border colour.
  const share = (both * (g.borderShare + c.borderShare)) / 2;
  const fill = colorCredit(g.background, c.background);
  // Corners are judged both as a share of the box and in pixels: 10 px
  // corners on a big card are plainly rounded, whatever share they are.
  const radius = Math.min(
    fallingCredit(Math.abs(g.radius - c.radius), TOL.radius.full, TOL.radius.zero),
    fallingCredit(Math.abs(radiusPx(goal) - radiusPx(candidate)), TOL.radiusPx.full, TOL.radiusPx.zero),
  );
  return {
    background: { weight: w.background, credit: share > 0 ? (1 - share) * fill + share * borderColor : fill },
    border: { weight: w.border, credit: neither + both * (0.5 * borderWidth + 0.5 * borderColor) },
    radius: { weight: w.radius, credit: radius },
    shadow: { weight: w.shadow, credit: g.shadow === c.shadow ? 1 : 0 },
  };
}

/** The colours a picture or drawing shows, read from the screenshot; kept per page. */
const pictureCache = new WeakMap<PageSnapshot, Map<number, RGB[]>>();
function pictureColours(page: PageSnapshot, index: number): RGB[] {
  let m = pictureCache.get(page);
  if (!m) {
    m = new Map();
    pictureCache.set(page, m);
  }
  let v = m.get(index);
  if (!v) {
    v = regionColours(page, page.blocks[index].rect);
    m.set(index, v);
  }
  return v;
}

/** How far apart two pictures' colours are (CIEDE2000, the mean over their quarters). */
function pictureDistance(goal: PageSnapshot, g: number, candidate: PageSnapshot, c: number): number {
  const a = pictureColours(goal, g);
  const b = pictureColours(candidate, c);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += colorDistance(a[i], b[i]);
  return sum / a.length;
}

function styleParts(goal: PageSnapshot, g: number, candidate: PageSnapshot, c: number): StyleParts | null {
  const gb = goal.blocks[g];
  const cb = candidate.blocks[c];
  if (gb.kind === 'text') return textStyleParts(gb, cb);
  if (gb.kind === 'box') return boxStyleParts(gb, cb);
  // A picture or drawing: its colours, from the screenshot. A chart turning red is a colour change.
  return { color: { weight: STYLE.image.color, credit: fallingCredit(pictureDistance(goal, g, candidate, c), TOL.color.full, TOL.color.zero) } };
}

function styleCredit(parts: StyleParts | null): number {
  if (!parts) return 1;
  let sum = 0;
  for (const k in parts) sum += parts[k].weight * parts[k].credit;
  return sum;
}

function clip(text: string, max = 60): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

/** Unmatched text, in reading order, for telling the player what is missing or extra. */
function unmatchedText(blocks: Block[], taken: Set<number>): string[] {
  return blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block, index }) => block.kind === 'text' && !taken.has(index))
    .sort((a, b) => a.block.rect.y - b.block.rect.y || a.block.rect.x - b.block.rect.x || a.index - b.index)
    .slice(0, 8)
    .map(({ block }) => clip(block.text ?? ''));
}

// ---------------------------------------------------------------------------
// What a person notices first. Judged from what is on screen only (never
// from the tags), so the same look built another way is noticed the same.
// ---------------------------------------------------------------------------

interface PageFacts {
  /** The page's body text size: the font size most of its words are in. */
  body: number;
  /** Text blocks sitting in a small filled or bordered box: they look like a button or a tag. */
  pill: Uint8Array;
  /** Small filled or bordered boxes holding one or two short texts. */
  pillBox: Uint8Array;
  /** The first short text near the top left: what a person reads as the logo. */
  logo: number;
}

const factsCache = new WeakMap<PageSnapshot, PageFacts>();
function factsOf(page: PageSnapshot): PageFacts {
  const hit = factsCache.get(page);
  if (hit) return hit;
  const blocks = page.blocks;
  const sized: { fs: number; n: number }[] = [];
  for (const b of blocks) if (b.kind === 'text') sized.push({ fs: b.textStyle!.fontSize, n: Math.max(1, words(b.text ?? '').length) });
  sized.sort((a, b) => a.fs - b.fs);
  const totalWords = sized.reduce((s, x) => s + x.n, 0);
  let body = 16;
  let acc = 0;
  for (const x of sized) {
    acc += x.n;
    if (acc >= totalWords / 2) {
      body = x.fs;
      break;
    }
  }
  const pill = new Uint8Array(blocks.length);
  const pillBox = new Uint8Array(blocks.length);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== 'box' || b.rect.h > 72 || b.rect.w > 420 || b.rect.h < 10) continue;
    const filled = standsOut(colorDistance(b.boxStyle!.background, b.behind)) >= 0.5 || borderPresence(b) > 0.5;
    if (!filled) continue;
    const inside: number[] = [];
    for (let j = 0; j < blocks.length && inside.length <= 2; j++) {
      if (blocks[j].kind === 'text' && insideRect(blocks[j].rect, b.rect)) inside.push(j);
    }
    if (inside.length === 0 || inside.length > 2) continue;
    if (inside.some((j) => words(blocks[j].text ?? '').length > 5)) continue;
    pillBox[i] = 1;
    for (const j of inside) pill[j] = 1;
  }
  let logo = -1;
  let best = Infinity;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== 'text' || b.rect.y > 100 || b.rect.x > page.width / 3 || words(b.text ?? '').length > 3) continue;
    const key = b.rect.y + b.rect.x;
    if (key < best) {
      best = key;
      logo = i;
    }
  }
  const facts = { body, pill, pillBox, logo };
  factsCache.set(page, facts);
  return facts;
}

/** 0 to 1: how plainly a block shows against what is behind it. */
function visibility(block: Block): number {
  return Math.min(1, standsOut(contrastOf(block)));
}

/** On-screen size against the viewport (not against the page): 1 for a block as big as the screen. */
function screenSize(rect: Rect): number {
  const w = Math.min(Math.max(0, rect.w), VIEWPORT.width);
  const h = Math.min(Math.max(0, rect.h), 2 * VIEWPORT.height);
  return Math.sqrt(w * h) / Math.sqrt(VIEWPORT.width * VIEWPORT.height);
}

/**
 * How much a person notices a block, 0 to 1.5, from what is on screen:
 * text by its size against the page's body text, boldness, whether it sits
 * in a button-like box, whether it holds a number, and whether it is a
 * short label in the page header; boxes and pictures by their size on
 * screen. Faint things are noticed less.
 */
function notice(page: PageSnapshot, index: number): number {
  const b = page.blocks[index];
  const facts = factsOf(page);
  if (b.kind === 'text') {
    const r = b.textStyle!.fontSize / Math.max(1, facts.body);
    const n = words(b.text ?? '').length;
    let v = 0.3 + 0.45 * clamp01((r - 1.05) / 0.5) + 0.35 * clamp01((r - 1.6) / 0.8);
    if (b.textStyle!.bold) v += 0.15;
    if (facts.pill[index]) v += 0.35;
    if (/\p{N}/u.test(b.text ?? '') && n <= 6) v += 0.3;
    if (b.rect.y < 100 && n <= 4) v += 0.3;
    if (index === facts.logo) v += 0.3; // the name in the top-left corner is read first

    return Math.min(1.5, v) * visibility(b);
  }
  const base = Math.min(1.5, 1.3 * screenSize(b.rect) + (facts.pillBox[index] ? 0.15 : 0));
  return b.kind === 'image' ? base : base * visibility(b);
}

// ---------------------------------------------------------------------------
// Movement: one cause, one charge.
// ---------------------------------------------------------------------------

interface Link {
  goal: number;
  candidate: number;
  /** Where a text joined from several pieces sits, when it was joined. */
  gRect?: Rect;
  cRect?: Rect;
}

interface MoveGroup {
  members: number[]; // indices into links
  goalBox: Rect;
  candBox: Rect;
  ox: number;
  oy: number;
  /** The move a person would charge this group for, after taking away its neighbours' move. */
  incX: number;
  incY: number;
  /** Moved into space something missing left, or out of the way of something extra. */
  explained: boolean;
  /** The group it is judged against (around it or above it), or -1 for the page itself. */
  ref: number;
  /** A neighbour (a link index) that grew or shrank by about this group's move and pushed it along, or -1. */
  cause: number;
}

interface Motion {
  groups: MoveGroup[];
  groupOf: number[];
  /** Per link: the offset this block is charged for in layout. */
  effX: number[];
  effY: number[];
  /** How much larger the page is drawn across (x) and down (y), and how sure that reading is (0 to 1). */
  scale: { x: number; y: number; fx: number; fy: number };
  /** The middle move of all paired blocks. */
  pageShift: { x: number; y: number };
}

/** How far a block moved, judged by whichever of its edges (or centre) moved least: text in a smaller font that kept its left edge has not moved. */
function edgeOffset(g: Rect, c: Rect): { x: number; y: number } {
  const pick = (a: number, b: number, m: number) => (Math.abs(a) <= Math.abs(b) ? (Math.abs(a) <= Math.abs(m) ? a : m) : Math.abs(b) <= Math.abs(m) ? b : m);
  return {
    x: pick(c.x - g.x, c.x + c.w - (g.x + g.w), c.x + c.w / 2 - (g.x + g.w / 2)),
    y: pick(c.y - g.y, c.y + c.h - (g.y + g.h), c.y + c.h / 2 - (g.y + g.h / 2)),
  };
}

function near(a: Rect, b: Rect, gap: number): boolean {
  return a.x - gap <= b.x + b.w && b.x - gap <= a.x + a.w && a.y - gap <= b.y + b.h && b.y - gap <= a.y + a.h;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.w <= outer.x + outer.w + 1 && inner.y + inner.h <= outer.y + outer.h + 1;
}

/**
 * Splits the paired blocks into groups that moved together (they sit close
 * together and moved alike), then charges each group only for its move
 * relative to the group above it (or around it): when one thing is
 * missing, extra or taller, everything below it moves, but it has not moved
 * relative to its neighbours. A group that moved into the space something
 * missing left (or out of the way of something extra) moved because of
 * that, and is charged lightly.
 */
function analyseMotion(goal: PageSnapshot, candidate: PageSnapshot, links: Link[], missing: number[], extra: number[]): Motion {
  const n = links.length;
  const G = links.map((l) => l.gRect ?? goal.blocks[l.goal].rect);
  const C = links.map((l) => l.cRect ?? candidate.blocks[l.candidate].rect);
  const off = links.map((_, i) => edgeOffset(G[i], C[i]));
  const pageShift = { x: median(off.map((o) => o.x)), y: median(off.map((o) => o.y)) };
  // The whole page drawn larger or smaller (zoomed, or stretched to the
  // window) moves every block by an amount that grows across the page. That
  // is one fault, charged once; the blocks are judged after taking it away.
  const scale = { x: 1, y: 1, fx: 0, fy: 0 };
  if (n >= 6) {
    for (const axis of ['x', 'y'] as const) {
      const gs = G.map((r) => (axis === 'x' ? r.x + r.w / 2 : r.y + r.h / 2));
      const cs = C.map((r) => (axis === 'x' ? r.x + r.w / 2 : r.y + r.h / 2));
      const gm = gs.reduce((s, v) => s + v, 0) / n;
      const cm = cs.reduce((s, v) => s + v, 0) / n;
      let sxy = 0;
      let sxx = 0;
      for (let i = 0; i < n; i++) {
        sxy += (gs[i] - gm) * (cs[i] - cm);
        sxx += (gs[i] - gm) ** 2;
      }
      if (sxx <= 0) continue;
      const a = sxy / sxx;
      let fit = 0;
      let shift = 0;
      for (let i = 0; i < n; i++) {
        fit += (cs[i] - cm - a * (gs[i] - gm)) ** 2;
        shift += (cs[i] - cm - (gs[i] - gm)) ** 2;
      }
      if (shift <= 0) continue;
      // Only a real change of size counts: the things themselves must have grown or shrunk alike
      // (boxes wider, for across; text larger, for down). Things closing up after a missing section is not a zoom.
      const ratios: number[] = [];
      links.forEach((l, i) => {
        const gb = goal.blocks[l.goal];
        const cb = candidate.blocks[l.candidate];
        if (axis === 'x' && gb.kind !== 'text' && G[i].w > 0) ratios.push(C[i].w / G[i].w);
        if (axis === 'y' && gb.kind === 'text' && cb.kind === 'text') ratios.push(cb.textStyle!.fontSize / gb.textStyle!.fontSize);
      });
      const grown = ratios.length > 0 ? median(ratios) : 1;
      const consistent = clamp01(1 - Math.abs(grown - a) / (0.5 * Math.abs(a - 1) + 1e-9));
      let f = clamp01((Math.abs(a - 1) - 0.03) / 0.04) * clamp01((0.7 - fit / shift) / 0.4) * consistent;
      // Down the page, only a true zoom counts: the page must also be drawn
      // as much larger or smaller across. Text that merely got smaller is a
      // font fault (and smaller text never earns the cheaper zoom charge).
      if (axis === 'y') f *= scale.fx * clamp01(1 - Math.abs(scale.x - a) / 0.05);
      if (f <= 0) continue;
      if (axis === 'x') Object.assign(scale, { x: a, fx: f });
      else Object.assign(scale, { y: a, fy: f });
      for (let i = 0; i < n; i++) off[i][axis] -= f * (a - 1) * (gs[i] - gm);
    }
  }
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const tol = Math.max(4, 0.1 * Math.max(Math.hypot(off[i].x, off[i].y), Math.hypot(off[j].x, off[j].y)));
      if (Math.abs(off[i].x - off[j].x) > tol || Math.abs(off[i].y - off[j].y) > tol) continue;
      if (!near(G[i], G[j], FAULTS.groupGap)) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(i);
  }
  const groups: MoveGroup[] = [];
  const groupOf = new Array<number>(n).fill(-1);
  for (const members of byRoot.values()) {
    let goalBox = G[members[0]];
    let candBox = C[members[0]];
    for (const m of members) {
      goalBox = union(goalBox, G[m]);
      candBox = union(candBox, C[m]);
    }
    for (const m of members) groupOf[m] = groups.length;
    groups.push({
      members,
      goalBox,
      candBox,
      ox: median(members.map((m) => off[m].x)),
      oy: median(members.map((m) => off[m].y)),
      incX: 0,
      incY: 0,
      explained: false,
      ref: -1,
      cause: -1,
    });
  }
  const inGroup = new Uint8Array(n);
  // A neighbour before the group (to its left for a move across, above it for a move down) whose
  // far edge moved by about the group's move, mostly because it grew or shrank: the sidebar is
  // 34 pixels wider, so everything to its right sits 34 pixels further right. One cause, not a move.
  const resizedNeighbour = (g: MoveGroup): number => {
    let best = -1;
    let bestArea = 0;
    for (const axis of ['x', 'y'] as const) {
      const o = axis === 'x' ? g.ox : g.oy;
      if (Math.abs(o) < 3) continue;
      const tol = Math.max(4, 0.2 * Math.abs(o));
      // The neighbour explains a move along one direction only; a group that also moved the other way is not explained.
      if (Math.abs(axis === 'x' ? g.incY : g.incX) > tol) continue;
      for (let j = 0; j < n; j++) {
        // Only a box or a picture has a size of its own; text is as wide as its words and its column make it.
        if (inGroup[j] || goal.blocks[links[j].goal].kind === 'text') continue;
        const gr = G[j];
        const cr = C[j];
        let before: boolean;
        let farMove: number;
        let nearMove: number;
        if (axis === 'x') {
          before = gr.x + gr.w <= g.goalBox.x + 4 && gr.y < g.goalBox.y + g.goalBox.h && g.goalBox.y < gr.y + gr.h;
          farMove = cr.x + cr.w - (gr.x + gr.w);
          nearMove = cr.x - gr.x;
        } else {
          before = gr.y + gr.h <= g.goalBox.y + 4 && gr.x < g.goalBox.x + g.goalBox.w && g.goalBox.x < gr.x + gr.w;
          farMove = cr.y + cr.h - (gr.y + gr.h);
          nearMove = cr.y - gr.y;
        }
        if (!before || Math.abs(farMove - o) > tol) continue;
        const growth = farMove - nearMove;
        if (Math.sign(growth) !== Math.sign(o) || Math.abs(growth) < 0.5 * Math.abs(o)) continue;
        const a = gr.w * gr.h;
        if (a > bestArea) {
          bestArea = a;
          best = j;
        }
      }
    }
    return best;
  };
  const area = (r: Rect) => r.w * r.h;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    let container = -1;
    let above = -1;
    for (let hi = 0; hi < groups.length; hi++) {
      if (hi === gi) continue;
      const h = groups[hi];
      if (contains(h.goalBox, g.goalBox) && area(h.goalBox) > area(g.goalBox)) {
        if (container < 0 || area(h.goalBox) < area(groups[container].goalBox)) container = hi;
      } else if (h.goalBox.y + h.goalBox.h <= g.goalBox.y + 4 && h.goalBox.x < g.goalBox.x + g.goalBox.w && g.goalBox.x < h.goalBox.x + h.goalBox.w) {
        if (above < 0 || h.goalBox.y + h.goalBox.h > groups[above].goalBox.y + groups[above].goalBox.h) above = hi;
      }
    }
    g.ref = container >= 0 ? container : above;
    if (container >= 0) {
      g.incX = g.ox - groups[container].ox;
      g.incY = g.oy - groups[container].oy;
    } else if (above >= 0) {
      const h = groups[above];
      // Across, a block is judged against the one above it only if that one is about as wide: a full-width footer under a column that moved has not moved.
      g.incX = g.goalBox.w <= 1.1 * h.goalBox.w ? g.ox - h.ox : g.ox;
      g.incY = g.oy - (h.candBox.y + h.candBox.h - (h.goalBox.y + h.goalBox.h));
    } else {
      g.incX = g.ox;
      g.incY = g.oy;
    }
    // A thing that is where the goal has it on the page has not moved, whatever its neighbours did:
    // it is charged for the smaller of its move against its neighbours and its move on the page.
    if (Math.hypot(g.ox, g.oy) < Math.hypot(g.incX, g.incY)) {
      g.incX = g.ox;
      g.incY = g.oy;
    }
    // The ground it moved across, in goal and in candidate coordinates.
    const moved = { x: g.goalBox.x + g.incX, y: g.goalBox.y + g.incY, w: g.goalBox.w, h: g.goalBox.h };
    const swept = union(g.goalBox, moved);
    // A move across, in a row that lost or gained a member, is the row spreading out again (three cards
    // where the goal has four sit further apart): the missing or extra member is the cause.
    const sameRow = (r: Rect, box: Rect) => Math.min(r.y + r.h, box.y + box.h) - Math.max(r.y, box.y) >= 0.5 * Math.min(r.h, box.h);
    const across = Math.abs(g.incX) > 2 * Math.abs(g.incY);
    g.explained =
      (Math.abs(g.incX) > 0.5 || Math.abs(g.incY) > 0.5) &&
      (missing.some((m) => intersects(goal.blocks[m].rect, swept) || (across && goal.blocks[m].kind !== 'text' && sameRow(goal.blocks[m].rect, g.goalBox))) ||
        extra.some((e) => intersects(candidate.blocks[e].rect, union(g.candBox, g.goalBox)) || (across && candidate.blocks[e].kind !== 'text' && sameRow(candidate.blocks[e].rect, g.candBox))));
    if (!g.explained && (Math.abs(g.incX) > 0.5 || Math.abs(g.incY) > 0.5)) {
      for (const m of g.members) inGroup[m] = 1;
      g.cause = resizedNeighbour(g);
      for (const m of g.members) inGroup[m] = 0;
      g.explained = g.cause >= 0;
    }
  }
  const effX: number[] = [];
  const effY: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = groups[groupOf[i]];
    const k = g.explained ? FAULTS.driftFactor : 1;
    effX.push(off[i].x - g.ox + k * g.incX);
    effY.push(off[i].y - g.oy + k * g.incY);
  }
  return { groups, groupOf, effX, effY, scale, pageShift };
}

/** Severity of a move of d pixels, 0 to 1. */
function moveSeverity(d: number): number {
  return 1 - Math.exp(-Math.pow(Math.max(0, d) / FAULTS.moveScale, FAULTS.movePower));
}

/** 0 to 1: how plainly two colours differ, starting where a person comparing them side by side would see it. */
function colourSeverity(deltaE: number, from: number = FAULTS.colourFrom): number {
  return Math.pow(clamp01((deltaE - from) / FAULTS.colourSpan), FAULTS.colourPower);
}

/**
 * A colour as a person sees it on a page, in Lab. Two things the plain Lab numbers overstate:
 * a faint tint (a slate grey against a plain grey) reads as grey, so low chroma is shrunk smoothly
 * (c * c / (c + 12): a tint of 13 counts as about 7, a strong colour of 80 as about 70); and in dark
 * tones both tint and shade are hard to tell apart (near-black navy against near-black grey), so
 * chroma is scaled down below lightness 55 and lightness differences are compressed below 30.
 * Everything is continuous: no cliff anywhere.
 */
function seenLab(rgb: RGB): Lab {
  const [L, A, B] = labOf(rgb);
  const c = Math.hypot(A, B);
  const Ls = L < 30 ? 30 - (30 - L) * 0.65 : L;
  if (c === 0) return [Ls, 0, 0];
  const dark = 0.45 + 0.55 * clamp01((L - 12) / 43);
  const k = ((c / (c + 12)) * dark);
  return [Ls, A * k, B * k];
}

/** How differently two colours look on a page (CIEDE2000 on seenLab): near-neutral dark tones read as close whatever their hue angle. */
function seenColourDistance(a: RGB, b: RGB): number {
  if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) return 0;
  return deltaE00(seenLab(a), seenLab(b));
}

/** Chroma as a person sees it (seenLab): a faint tint counts for little. */
function seenChroma(rgb: RGB): number {
  const l = seenLab(rgb);
  return Math.hypot(l[1], l[2]);
}

/** 0 to 1: how much of a whole-page palette change a colour pair is; smooth from 5 (unseen) to 25 (a clearly different colour). */
function paletteShare(de: number): number {
  const s = clamp01((de - 5) / 20);
  return s * s * (3 - 2 * s);
}

/**
 * The screenshot comparison as a person reads it. Its structure part matches small windows of pixels,
 * so any text drawn again (a pixel of size, another line break) scores near zero in those windows even
 * when the page reads the same at a glance: half the windows matching is a page that looks largely alike.
 * 1 - (1 - s)^2 keeps the order (a page that differs still scores lower) and leaves 0 and 1 where they are.
 */
function seenVisual(v: { score: number; structure: number; color: number }): { score: number; structure: number; color: number } {
  const structure = 1 - Math.pow(1 - clamp01(v.structure), 2);
  return { score: Math.sqrt(structure * v.color), structure, color: v.color };
}

/** A colour that a person reads as colour: chromatic on either side, or a plain change between light and dark. */
function carriesColour(a: RGB, b: RGB): boolean {
  return seenChroma(a) > 8 || seenChroma(b) > 8 || Math.abs(lightness(a) - lightness(b)) > 40;
}

/** Text made only of bullets, ticks, stars, arrows or dots: decoration, not words. */
function isSymbolText(block: Block): boolean {
  return block.kind === 'text' && !/[\p{L}\p{N}]/u.test(block.text ?? '');
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** Words with the way they are written taken out: month names as numbers, no leading zeros, no zero cents. */
function canonical(list: string[]): string[] {
  const out: string[] = [];
  for (const w of list) {
    const m = MONTHS.findIndex((name) => w === name || (w.length === 3 && name.startsWith(w)));
    if (m >= 0) out.push(String(m + 1));
    else if (/^\d+$/.test(w)) {
      if (/^0+$/.test(w)) continue;
      out.push(String(Number(w)));
    } else out.push(w);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Noticed faults.
// ---------------------------------------------------------------------------

type FaultKind = keyof typeof FAULTS.kinds;
type Sub = 'content' | 'layout' | 'style' | 'visual';

interface Fault {
  kind: FaultKind;
  /** notice x severity */
  amount: number;
  goal: number;
  candidate: number;
  /** For a group: its goal (or candidate) blocks. */
  blocks?: number[];
  /** Copies in a repeated set. */
  copies?: number;
  move?: MoveGroup;
  /** Missing or extra boxes that are only outlines (their fill is what is behind them). */
  outline?: boolean;
  /** A move that is one side of a swap (sides that traded places). */
  mirrored?: boolean;
  /** For a whole-page change: which one. */
  theme?: 'typeface' | 'palette' | 'textSize' | 'background';
}

/**
 * A box that is gone but whose place still shows the same colours (a table
 * cell's frame, where the attempt draws one line per row) is barely missed
 * by the eye: 0.2 when its area looks the same, 1 when it plainly differs.
 */
function lookAlike(page: PageSnapshot, index: number, other: PageSnapshot, sx: number, sy: number): number {
  const r = page.blocks[index].rect;
  const here = regionColours(page, r);
  const there = regionColours(other, { x: r.x + sx, y: r.y + sy, w: r.w, h: r.h });
  let d = 0;
  for (let i = 0; i < here.length; i++) d += colorDistance(here[i], there[i]) / here.length;
  return 0.2 + 0.8 * clamp01((d - 2) / 8);
}

/** Groups unmatched blocks that sit together (a card and its text), then repeated look-alike groups into sets. */
function clusters(page: PageSnapshot, free: number[], other: PageSnapshot, sx: number, sy: number): { blocks: number[]; single: number[]; box: Rect; sev: number; copies: number; outline: boolean }[] {
  const vis = free.filter((i) => notice(page, i) > 0 || page.blocks[i].kind === 'image');
  const parent = vis.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < vis.length; i++) {
    for (let j = i + 1; j < vis.length; j++) {
      if (near(page.blocks[vis[i]].rect, page.blocks[vis[j]].rect, 48)) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }
  const byRoot = new Map<number, number[]>();
  vis.forEach((_, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(vis[i]);
  });
  const raw = [...byRoot.values()].map((blocks) => {
    let box = page.blocks[blocks[0]].rect;
    let v = 0;
    const kinds: Record<string, number> = {};
    for (const b of blocks) {
      box = union(box, page.blocks[b].rect);
      // Bullets, ticks, stars and arrows are decoration, not words: they count as a small mark.
      const symbol = isSymbolText(page.blocks[b]);
      v = Math.max(v, page.blocks[b].kind === 'image' ? 1 : visibility(page.blocks[b]) * (page.blocks[b].kind === 'box' ? lookAlike(page, b, other, sx, sy) : symbol ? 0.4 : 1));
      const kind = symbol ? 'mark' : page.blocks[b].kind;
      kinds[kind] = (kinds[kind] ?? 0) + 1;
    }
    // Something with words in it that is missing takes away part of what the page says; a picture or a
    // decoration without words costs mostly by how much of the screen it filled.
    let sev = Math.min(1.6, ((kinds.text ? 0.25 : 0.12) + 1.2 * screenSize(box)) * v);
    // Only outlines (boxes whose fill is the same as what is behind them): a person misses the lines, not a section,
    // so they are noticed by how much of their area the lines paint.
    const outline = blocks.every((b) => page.blocks[b].kind === 'box' && standsOut(colorDistance(page.blocks[b].boxStyle!.background, page.blocks[b].behind)) < 0.5);
    if (outline) sev *= Math.min(1, 0.1 + 2 * Math.max(...blocks.map((b) => page.blocks[b].boxStyle!.borderShare)));
    return { blocks, box, sev, outline, sign: `${kinds.text ?? 0}/${kinds.box ?? 0}/${kinds.image ?? 0}/${kinds.mark ?? 0}` };
  });
  // Look-alike groups (same make-up, sizes within a quarter) are one repeated set.
  const out: { blocks: number[]; single: number[]; box: Rect; sev: number; copies: number; outline: boolean }[] = [];
  const used = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    if (used[i]) continue;
    const set = [i];
    for (let j = i + 1; j < raw.length; j++) {
      if (used[j] || raw[j].sign !== raw[i].sign || raw[j].outline !== raw[i].outline) continue;
      const a = raw[i].box;
      const b = raw[j].box;
      if (sizeRatioExact(a.w, b.w) >= 0.75 && sizeRatioExact(a.h, b.h) >= 0.75) set.push(j);
    }
    for (const s of set) used[s] = 1;
    const top = set.reduce((a, s) => (raw[s].sev > raw[a].sev ? s : a), set[0]);
    const sev = raw[top].sev * (1 + FAULTS.setExtra * (set.length - 1));
    out.push({ blocks: set.flatMap((s) => raw[s].blocks), single: raw[top].blocks, box: set.map((s) => raw[s].box).reduce(union), sev, copies: set.length, outline: raw[i].outline });
  }
  return out;
}

/** A slip in plain body text is read past more easily than one in a heading, a price or a button. */
function plainText(n: number): number {
  return n * (0.7 + 0.3 * clamp01((n - 0.3) / 0.3));
}

function multisetDiff(a: string[], b: string[]): string[] {
  const counts = new Map<string, number>();
  for (const v of b) counts.set(v, (counts.get(v) ?? 0) + 1);
  const out: string[] = [];
  for (const v of a) {
    const left = counts.get(v) ?? 0;
    if (left > 0) counts.set(v, left - 1);
    else out.push(v);
  }
  return out;
}

interface Piece {
  gw: string[];
  cw: string[];
  joined: boolean;
  gRect: Rect;
  cRect: Rect;
  /** The neighbouring pieces joined to this one. */
  gExtra: number[];
  cExtra: number[];
}

/**
 * The same words, split differently: a piece of text that lacks words which sit, as a piece of
 * their own, right next to it (or has words the goal keeps as a neighbouring piece) is the same
 * text. Those neighbours are joined to it, in reading order, and are neither missing nor extra;
 * the joined text is placed where all its pieces together sit.
 */
function joinSplitText(
  goal: PageSnapshot,
  candidate: PageSnapshot,
  links: Pair[],
  goalFree: number[],
  candFree: number[],
  goalWords: string[][],
  candidateWords: string[][],
  joined: Set<string>,
): Map<Pair, Piece> {
  const pieces = new Map<Pair, Piece>();
  const freeG = goalFree.filter((i) => goal.blocks[i].kind === 'text' && goalWords[i].length > 0);
  const freeC = candFree.filter((i) => candidate.blocks[i].kind === 'text' && candidateWords[i].length > 0);
  const reach = (b: Block) => Math.max(40, 4 * b.textStyle!.fontSize);
  // A neighbour: close by, or on the same line (a footer written as one line where the goal has two spans at its ends).
  const neighbour = (a: Rect, b: Block) => near(a, b.rect, reach(b)) || Math.min(a.y + a.h, b.rect.y + b.rect.h) - Math.max(a.y, b.rect.y) > 0.5 * Math.min(a.h, b.rect.h);
  // Most of a piece's words (as written or in another way: 03/11 for 3 November) are among the words its neighbour lacks.
  // Words as meant (see canonical), worked out once per block. Lacks and surpluses below are already in this form.
  const cg = goalWords.map(canonical);
  const cc = candidateWords.map(canonical);
  const within = (c: string[], lack: string[]) => c.length > 0 && c.length - multisetDiff(c, lack).length >= Math.max(1, 0.6 * c.length);
  const take = (lack: string[], c: string[]) => multisetDiff(lack, c);
  // Reading order: left to right along a line, then down.
  const ordered = (page: PageSnapshot, list: number[], wordsOf: string[][]) =>
    [...list]
      .sort((a, b) => {
        const ra = page.blocks[a].rect;
        const rb = page.blocks[b].rect;
        const sameLine = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y) > 0.5 * Math.min(ra.h, rb.h);
        return sameLine ? ra.x - rb.x : ra.y - rb.y;
      })
      .flatMap((i) => wordsOf[i]);
  for (const p of links) {
    if (goal.blocks[p.goal].kind !== 'text') continue;
    const gList = [p.goal];
    const cList = [p.candidate];
    let lack = multisetDiff(cg[p.goal], cc[p.candidate]);
    for (const j of freeC) {
      if (lack.length === 0) break;
      if (joined.has(`c${j}`) || !neighbour(candidate.blocks[p.candidate].rect, candidate.blocks[j])) continue;
      if (!within(cc[j], lack)) continue;
      joined.add(`c${j}`);
      lack = take(lack, cc[j]);
      cList.push(j);
    }
    let surplus = multisetDiff(cList.flatMap((i) => cc[i]), cg[p.goal]);
    for (const i of freeG) {
      if (surplus.length === 0) break;
      if (joined.has(`g${i}`) || !neighbour(goal.blocks[p.goal].rect, goal.blocks[i])) continue;
      if (!within(cg[i], surplus)) continue;
      joined.add(`g${i}`);
      surplus = take(surplus, cg[i]);
      gList.push(i);
    }
    pieces.set(p, {
      gw: gList.length > 1 ? ordered(goal, gList, goalWords) : goalWords[p.goal],
      cw: cList.length > 1 ? ordered(candidate, cList, candidateWords) : candidateWords[p.candidate],
      joined: gList.length > 1 || cList.length > 1,
      gRect: gList.map((i) => goal.blocks[i].rect).reduce(union),
      cRect: cList.map((i) => candidate.blocks[i].rect).reduce(union),
      gExtra: gList.slice(1),
      cExtra: cList.slice(1),
    });
  }
  return pieces;
}

function findFaults(
  goal: PageSnapshot,
  candidate: PageSnapshot,
  pairs: Pair[],
  changed: Pair[],
  goalFree: number[],
  candFree: number[],
  motion: Motion,
  links: Link[],
  goalWords: string[][],
  candidateWords: string[][],
  content: number | null,
  pieceWords: Map<Pair, Piece>,
): Fault[] {
  const faults: Fault[] = [];
  const add = (f: Fault) => {
    if (f.amount > 1e-9) faults.push(f);
  };

  // Words: each changed text is one fault, costing by how noticeable it is and how much changed.
  // When most of the page's text is wrong (placeholder text, another language) the page says nothing,
  // which is worse than its faults one by one.
  const spread = 1 + 2 * (1 - (content ?? 1)) ** 2;
  for (const p of [...pairs, ...changed]) {
    if (goal.blocks[p.goal].kind !== 'text' || isSymbolText(goal.blocks[p.goal])) continue;
    const { gw, cw, joined: wasJoined } = pieceWords.get(p)!;
    const cg = canonical(gw);
    const cc = canonical(cw);
    let wrong = Math.max(multisetDiff(cg, cc).length, multisetDiff(cc, cg).length);
    // The same words in another order ("pesche con burrata") say something else: wrong by how much of the order is lost.
    if (wrong === 0 && !wasJoined && gw.length > 1) {
      const order = wordOverlap(wordPairs([gw]), wordPairs([cw]));
      if (order < 1) wrong = Math.max(0.5, (1 - order) * gw.length * 0.5);
    }
    // The same words written another way (a date as 03/11/2026, a price without its cents) is one small slip.
    if (wrong === 0 && (multisetDiff(gw, cw).length > 0 || multisetDiff(cw, gw).length > 0)) wrong = 0.5;
    // A wrong number (a price, a total, a date) changes what the page means: it costs more than other words.
    const value = [...multisetDiff(cg, cc), ...multisetDiff(cc, cg)].some((w) => /\p{N}/u.test(w)) ? 1.15 : 1;
    if (wrong > 0) add({ kind: 'words', amount: spread * value * plainText(notice(goal, p.goal)) * Math.min(4, Math.sqrt(wrong)), goal: p.goal, candidate: p.candidate });
  }

  // Missing and extra things, a group (a card with its text) or a repeated set at a time. What a missing
  // group said is missing content: it costs by its words too, at least as much as having changed them.
  const textAmount = (page: PageSnapshot, blocks: number[], wordsOf: string[][]) => {
    let s = 0;
    for (const b of blocks) if (page.blocks[b].kind === 'text' && !isSymbolText(page.blocks[b])) s += plainText(notice(page, b)) * Math.min(8, Math.pow(Math.max(1, wordsOf[b].length), 0.6));
    return Math.min(4, s);
  };
  const extraFaults: Fault[] = [];
  // One copy of a repeated thing (a card of a row of cards) gone while two or more like it are there is a
  // smaller fault than a part of the page gone: what it was is still plain from the others.
  const matchedGoal = new Set(pairs.map((p) => p.goal));
  const ofASet = (blocks: number[]) => {
    let big = -1;
    for (const b of blocks) if (goal.blocks[b].kind !== 'text' && (big < 0 || goal.blocks[b].rect.w * goal.blocks[b].rect.h > goal.blocks[big].rect.w * goal.blocks[big].rect.h)) big = b;
    if (big < 0) return false;
    const r = goal.blocks[big].rect;
    if (r.w * r.h < 2500) return false;
    let alike = 0;
    for (const m of matchedGoal) {
      const o = goal.blocks[m];
      if (o.kind === goal.blocks[big].kind && sizeRatioExact(o.rect.w, r.w) >= 0.8 && sizeRatioExact(o.rect.h, r.h) >= 0.8) alike++;
    }
    return alike >= 2;
  };
  for (const c of clusters(goal, goalFree, candidate, motion.pageShift.x, motion.pageShift.y)) {
    const amount = (c.sev + 0.35 * textAmount(goal, c.single, goalWords) * (1 + FAULTS.setExtra * (c.copies - 1))) * (ofASet(c.single) ? 0.75 : 1);
    add({ kind: 'missing', amount, goal: c.blocks[0], candidate: -1, blocks: c.blocks, copies: c.copies, outline: c.outline });
  }
  for (const c of clusters(candidate, candFree, goal, -motion.pageShift.x, -motion.pageShift.y)) {
    const f: Fault = { kind: 'extra', amount: 0.6 * c.sev + 0.3 * textAmount(candidate, c.single, candidateWords) * (1 + FAULTS.setExtra * (c.copies - 1)), goal: -1, candidate: c.blocks[0], blocks: c.blocks, copies: c.copies, outline: c.outline };
    extraFaults.push(f);
    add(f);
  }
  // Extra content costs by how much there is against the goal: as much again as the goal is a broken page.
  {
    const gw = weightsOf(goal);
    const cw = weightsOf(candidate);
    const goalTotal = gw.reduce((s, w) => s + w, 0);
    const extraW = extraFaults.reduce((s, f) => s + f.blocks!.reduce((t, b) => t + cw[b], 0), 0);
    const have = extraFaults.reduce((s, f) => s + f.amount, 0) * FAULTS.kinds.extra.unit;
    const want = goalTotal > 0 ? FAULTS.extraAgain * Math.min(1.2, extraW / goalTotal) : 0;
    if (want > have && have > 0) for (const f of extraFaults) f.amount *= want / have;
  }

  // Moves, one per group that moved relative to its neighbours. Groups that
  // moved the same way against the same neighbour (the cells of a table
  // inside a frame that stayed put) are one move.
  const merged: MoveGroup[] = [];
  for (const g of motion.groups) {
    const agree = (a: number, b: number) => Math.abs(a - b) <= Math.max(4, 0.1 * Math.max(Math.abs(a), Math.abs(b)));
    // Groups pushed along by the same neighbour, and groups that share one small move (a spacing
    // slip) whatever they are judged against, are one fault. A large move of separate parts is
    // seen part by part.
    const slip = (m: MoveGroup) => Math.hypot(m.incX, m.incY) <= FAULTS.slipPx;
    const into = merged.find(
      (m) =>
        (g.cause >= 0 && m.cause === g.cause) ||
        (m.cause === g.cause && m.explained === g.explained && agree(m.incX, g.incX) && agree(m.incY, g.incY) && (m.ref === g.ref || (slip(g) && agree(m.ox, g.ox) && agree(m.oy, g.oy)))),
    );
    if (into) {
      into.members = into.members.concat(g.members);
      into.goalBox = union(into.goalBox, g.goalBox);
      into.candBox = union(into.candBox, g.candBox);
      if (Math.hypot(g.incX, g.incY) > Math.hypot(into.incX, into.incY)) Object.assign(into, { incX: g.incX, incY: g.incY });
    } else merged.push({ ...g, members: [...g.members] });
  }
  // Two look-alike things that traded places are one fault, not two moves.
  const swapped = new Set<MoveGroup>();
  for (let i = 0; i < merged.length; i++) {
    for (let j = i + 1; j < merged.length; j++) {
      const a = merged[i];
      const b = merged[j];
      if (swapped.has(a) || swapped.has(b)) continue;
      const tol = Math.max(8, 0.15 * Math.hypot(a.incX, a.incY));
      if (Math.hypot(a.incX, a.incY) < 20 || Math.abs(a.incX + b.incX) > tol || Math.abs(a.incY + b.incY) > tol) continue;
      if (sizeRatioExact(a.goalBox.w, b.goalBox.w) < 0.6 || sizeRatioExact(a.goalBox.h, b.goalBox.h) < 0.6) continue;
      swapped.add(a.goalBox.w * a.goalBox.h <= b.goalBox.w * b.goalBox.h ? a : b);
    }
  }
  // Two sides that traded places (a picture and its text mirrored) are one fault a boss would ask to swap
  // back, whatever their sizes: each side now stands where the other stood, across from each other.
  const mirrored = new Set<MoveGroup>();
  const overlap = (p0: number, p1: number, q0: number, q1: number) => Math.max(0, Math.min(p1, q1) - Math.max(p0, q0));
  for (const a of merged) {
    for (const b of merged) {
      if (a === b || a.incX <= 40 || b.incX >= -40) continue;
      const vy = overlap(a.goalBox.y, a.goalBox.y + a.goalBox.h, b.goalBox.y, b.goalBox.y + b.goalBox.h);
      if (vy < 0.5 * Math.min(a.goalBox.h, b.goalBox.h)) continue;
      // a moved right into where b was, b moved left into where a was.
      const aNow = a.goalBox.x + a.incX;
      const bNow = b.goalBox.x + b.incX;
      if (overlap(aNow, aNow + a.goalBox.w, b.goalBox.x, b.goalBox.x + b.goalBox.w) < 0.5 * Math.min(a.goalBox.w, b.goalBox.w)) continue;
      if (overlap(bNow, bNow + b.goalBox.w, a.goalBox.x, a.goalBox.x + a.goalBox.w) < 0.5 * Math.min(a.goalBox.w, b.goalBox.w)) continue;
      mirrored.add(a);
      mirrored.add(b);
    }
  }
  // Whatever moved along with one of the two sides is part of the same swap.
  for (const g of merged) {
    if (mirrored.has(g)) continue;
    for (const m of [...mirrored]) {
      const tol = Math.max(16, 0.15 * Math.abs(m.incX));
      const vy = overlap(g.goalBox.y, g.goalBox.y + g.goalBox.h, m.goalBox.y - 40, m.goalBox.y + m.goalBox.h + 40);
      if (Math.abs(g.incX - m.incX) <= tol && Math.abs(g.incY - m.incY) <= tol && vy > 0) {
        mirrored.add(g);
        break;
      }
    }
  }
  for (const g of merged) {
    const d = Math.hypot(FAULTS.sidewaysFactor * g.incX, g.incY) * (g.explained ? FAULTS.driftFactor : 1) * (swapped.has(g) ? 0.25 : 1);
    if (d <= 0.5) continue;
    let geo = Math.min(1.5, 1.3 * screenSize(g.goalBox));
    let lead = links[g.members[0]].goal;
    let leadNotice = -1;
    for (const m of g.members) {
      const v = notice(goal, links[m].goal);
      if (v > leadNotice) {
        leadNotice = v;
        lead = links[m].goal;
      }
    }
    geo = Math.max(geo, 0.5 * leadNotice);
    // When the whole page is drawn at another size, what is left of the moves mostly comes with it: part of that one fault.
    // Sides that traded places are one fault between them: each side carries a share of it.
    const zoomed = (1 - 0.75 * Math.max(motion.scale.fx, motion.scale.fy)) * (mirrored.has(g) ? 0.4 : 1);
    // The first few pixels of a move are a slip; what goes beyond is a move to another place.
    const slipPart = zoomed * geo * moveSeverity(Math.min(d, FAULTS.nudgePx));
    const whole = zoomed * geo * moveSeverity(d);
    const base = { goal: lead, candidate: links[g.members[0]].candidate, blocks: g.members.map((m) => links[m].goal), move: g, mirrored: mirrored.has(g) };
    add({ kind: 'nudge', amount: slipPart, ...base });
    add({ kind: 'moved', amount: whole - slipPart, ...base });
  }

  // The whole page drawn larger or smaller: one fault.
  const sc = motion.scale;
  const scaleAmount = 1.5 * (sc.fx * moveSeverity(Math.abs(sc.x - 1) * 600) + sc.fy * moveSeverity(Math.abs(sc.y - 1) * 600));
  add({ kind: 'scale', amount: scaleAmount, goal: -1, candidate: -1 });
  const kx = 1 + sc.fx * (sc.x - 1);
  const ky = 1 + sc.fy * (sc.y - 1);

  // Size, style and legibility, pair by pair. Alongside, how much of the page (by notice) has each
  // whole-page change: another typeface, another palette, text larger or smaller throughout.
  const themeWeight = { text: 0, styled: 0, family: 0, colour: 0, palette: 0, larger: 0, smaller: 0 };
  for (const p of pairs) {
    const g = goal.blocks[p.goal];
    const c = candidate.blocks[p.candidate];
    const t = p.trust;
    const nv = notice(goal, p.goal);
    // A text block's size follows from its words and font, judged on their own; boxes and pictures have a size of their own.
    if (t >= 0.5 && g.kind !== 'text') {
      // A page drawn wider cannot make a full-width band wider than the window.
      const gw = Math.min(g.rect.w * kx, Math.max(g.rect.w, candidate.width));
      const gh = g.rect.h * ky;
      const dw = Math.abs(gw - c.rect.w);
      const dh = Math.abs(gh - c.rect.h);
      // A box paired with one of a very different shape (a table row with a cell) is a different build, not a resized box.
      const shapeOff = Math.min(sizeRatioExact(gw, c.rect.w), sizeRatioExact(gh, c.rect.h)) < 0.5;
      if ((dw > 4 || dh > 4) && !shapeOff) {
        // Inside a tenth either way nobody sees a different size.
        const lr = Math.max(0, Math.max(Math.abs(Math.log((c.rect.w + 1) / (gw + 1))), Math.abs(Math.log((c.rect.h + 1) / (gh + 1)))) - 0.1);
        const sev = 1 - Math.exp(-Math.pow(lr / 0.25, 1.5));
        add({ kind: 'size', amount: nv * sev, goal: p.goal, candidate: p.candidate });
      }
    }
    if (g.kind === 'text') {
      const gs = g.textStyle!;
      const cs = c.textStyle!;
      // Text that has become hard to read (the goal's is clear, this is pale) is a fault of its own, and it is that fault, not a colour slip.
      const gc = contrastRatio(gs.color, g.behind);
      const cc = contrastRatio(cs.color, c.behind);
      // Only text that is hard to read in itself counts (contrast under about 2.5 to 1), not a shade paler than the goal.
      const legible = cc < gc ? clamp01(Math.log(gc / cc) / Math.log(2)) * clamp01((2.5 - cc) / 1.0) : 0;
      if (legible > 0) {
        // Judged by the goal's look, since this text no longer stands out to be noticed.
        const seen = Math.min(1.5, notice(goal, p.goal) / Math.max(visibility(g), 1e-6));
        add({ kind: 'legibility', amount: t * Math.max(seen, 0.3) * legible, goal: p.goal, candidate: p.candidate });
      }
      const de = seenColourDistance(gs.color, cs.color);
      add({ kind: 'colour', amount: t * nv * (1 - legible) * colourSeverity(de, FAULTS.textColourFrom), goal: p.goal, candidate: p.candidate });
      if (isSymbolText(g)) continue;
      themeWeight.text += t * nv;
      // The palette is judged on what carries colour (an accent, a coloured heading, a dark band), not on every grey line of text.
      if (carriesColour(gs.color, cs.color)) {
        themeWeight.colour += t * nv;
        themeWeight.palette += t * nv * paletteShare(de);
      }
      if (t < 0.5) continue;
      if (gs.fontClass !== cs.fontClass) {
        add({ kind: 'family', amount: nv, goal: p.goal, candidate: p.candidate });
        themeWeight.family += nv;
      }
      themeWeight.styled += nv;
      if (gs.bold !== cs.bold) add({ kind: 'weight', amount: nv, goal: p.goal, candidate: p.candidate });
      const lr0 = Math.log(cs.fontSize / (gs.fontSize * ky));
      // A pixel either way on body text is not a different size.
      const lr = Math.max(0, Math.abs(lr0) - 0.07);
      add({ kind: 'fontSize', amount: nv * (1 - Math.exp(-Math.pow(lr / 0.15, 1.5))), goal: p.goal, candidate: p.candidate });
      if (lr0 > 0.12) themeWeight.larger += nv;
      if (lr0 < -0.12) themeWeight.smaller += nv;
      const caseOff = (g.text ?? '').toLowerCase() === (c.text ?? '').toLowerCase() && g.text !== c.text;
      if (gs.italic !== cs.italic || gs.underline !== cs.underline || caseOff) add({ kind: 'decoration', amount: nv, goal: p.goal, candidate: p.candidate });
    } else if (g.kind === 'box') {
      const parts = boxStyleParts(g, c);
      const gb = g.boxStyle!;
      const cb = c.boxStyle!;
      let de = seenColourDistance(gb.background, cb.background);
      if (gb.borderColor && cb.borderColor && Math.min(borderPresence(g), borderPresence(c)) > 0.5) {
        de = Math.max(de, 0.5 * seenColourDistance(gb.borderColor, cb.borderColor));
      }
      // A box's fill counts as noticed by its size, whether or not it stands out.
      const area = Math.min(1.5, 1.3 * screenSize(g.rect) + (factsOf(goal).pillBox[p.goal] ? 0.15 : 0));
      const seen = Math.max(nv, area * 0.8);
      add({ kind: 'colour', amount: seen * colourSeverity(de, FAULTS.boxColourFrom), goal: p.goal, candidate: p.candidate });
      if (carriesColour(gb.background, cb.background)) {
        themeWeight.colour += t * seen;
        themeWeight.palette += t * seen * paletteShare(de);
      }
      add({ kind: 'border', amount: nv * (1 - parts.border.credit), goal: p.goal, candidate: p.candidate });
      add({ kind: 'corners', amount: nv * clamp01((Math.abs(radiusPx(g) - radiusPx(c)) - 1.5) / 10), goal: p.goal, candidate: p.candidate });
      if (gb.shadow !== cb.shadow) add({ kind: 'shadow', amount: nv, goal: p.goal, candidate: p.candidate });
    } else {
      add({ kind: 'colour', amount: nv * colourSeverity(pictureDistance(goal, p.goal, candidate, p.candidate), FAULTS.boxColourFrom), goal: p.goal, candidate: p.candidate });
      // A picture is judged by what it shows: the shapes in it, not only its colours.
      const sameShape = regionShapeSimilarity(goal, g.rect, candidate, c.rect);
      const wrong = clamp01((0.85 - sameShape) / 0.4);
      if (t >= 0.5 && wrong > 0) add({ kind: 'picture', amount: Math.min(1, 1.6 * screenSize(g.rect)) * wrong, goal: p.goal, candidate: p.candidate });
    }
  }

  // Changes that run through the whole page: one fault each, at its full cost once most of the page has it.
  const spread01 = (part: number, whole: number) => (whole > 0 ? clamp01((part / whole - FAULTS.themeFrom) / (FAULTS.themeFull - FAULTS.themeFrom)) : 0);
  const themes: [NonNullable<Fault['theme']>, number][] = [
    ['typeface', FAULTS.theme.typeface * spread01(themeWeight.family, themeWeight.styled)],
    ['palette', FAULTS.theme.palette * spread01(themeWeight.palette, themeWeight.colour)],
    ['textSize', FAULTS.theme.textSize * spread01(Math.max(themeWeight.larger, themeWeight.smaller), themeWeight.styled)],
    // The page background: the biggest colour area there is.
    ['background', FAULTS.theme.background * colourSeverity(seenColourDistance(goal.pageBackground, candidate.pageBackground), FAULTS.boxColourFrom)],
  ];
  for (const [theme, amount] of themes) add({ kind: 'theme', amount, goal: -1, candidate: -1, theme });
  return faults;
}

interface FaultReading {
  total: number;
  sub: Record<Sub, number>;
  charge: Partial<Record<FaultKind, number>>;
  sums: Partial<Record<FaultKind, number>>;
}

/** Reference pages with more blocks than this get a fault allowance that grows with the square root of their size, up to 3. */
const FAULT_EASE_BLOCKS = 20;

/**
 * `ease` (1 or more) is the allowance for a large reference page: the same number of small faults is a smaller
 * share of a page with more on it, so every kind's amount is divided by it.
 */
function readFaults(faults: Fault[], subWeight: Record<Sub, number>, ease = 1): FaultReading {
  const sums: Partial<Record<FaultKind, number>> = {};
  for (const f of faults) sums[f.kind] = (sums[f.kind] ?? 0) + f.amount;
  const charge: Partial<Record<FaultKind, number>> = {};
  // Hard kinds cost their instances in full up to near their cap; soft kinds are each small, and
  // together bounded. Hard kinds and the soft total add up, levelling off toward the ceiling.
  // Kinds of hard fault compound: the largest costs in full, each further kind a share of what is left
  // (a page wrong in many ways at once is plainly far off, but not further off than nothing at all).
  let left = 1;
  let soft = 0;
  let raw = 0;
  for (const kind of Object.keys(sums) as FaultKind[]) {
    const spec = FAULTS.kinds[kind];
    const c = levelOff((sums[kind]! * spec.unit) / ease, FAULTS.knee * spec.cap, spec.cap);
    charge[kind] = c;
    raw += c;
    if (spec.hard) left *= 1 - c / FAULTS.ceiling;
    else soft += c;
  }
  const softTotal = levelOff(soft, FAULTS.knee * FAULTS.softCap, FAULTS.softCap);
  left *= 1 - softTotal / FAULTS.ceiling;
  const loss = FAULTS.ceiling * (1 - left);
  // Each kind's charge, scaled so the charges add up to what the reading takes off.
  const lost: Record<Sub, number> = { content: 0, layout: 0, style: 0, visual: 0 };
  for (const kind of Object.keys(charge) as FaultKind[]) {
    const c = raw > 0 ? (charge[kind]! * loss) / raw : 0;
    charge[kind] = c;
    for (const [s, v] of Object.entries(FAULTS.kinds[kind].share) as [Sub, number][]) lost[s] += v * c;
  }
  // Each sub-score levels off the same way, short of 0: a sub-score reaches 0 only through its averaged reading.
  const S = FAULTS.subCeiling;
  const sub = {} as Record<Sub, number>;
  for (const s of ['content', 'layout', 'style', 'visual'] as Sub[]) {
    sub[s] = subWeight[s] > 0 ? 1 - S * (1 - Math.exp(-lost[s] / (100 * subWeight[s]) / S)) : 1;
  }
  return { total: 100 - loss, sub, charge, sums };
}

/** Straight up to `knee`, then levelling off smoothly toward `cap`: never falls, never passes `cap`. */
function levelOff(s: number, knee: number, cap: number): number {
  if (s <= knee) return s;
  return knee + (cap - knee) * (1 - Math.exp(-(s - knee) / Math.max(1e-9, cap - knee)));
}

// ---------------------------------------------------------------------------
// The ledger: where every lost point went.
// ---------------------------------------------------------------------------

type Topic =
  | 'missing'
  | 'extra'
  | 'words'
  | 'position'
  | 'size'
  | 'color'
  | 'background'
  | 'fontSize'
  | 'bold'
  | 'family'
  | 'decoration'
  | 'letterCase'
  | 'border'
  | 'radius'
  | 'shadow'
  | 'pageBackground'
  | 'order'
  | 'look';

interface Entry {
  topic: Topic;
  /** Goal block index, or -1. */
  goal: number;
  /** Candidate block index, or -1. */
  candidate: number;
  /** Points of the page total, before the visual share is added. */
  points: number;
  /** Points that came from layout and style: how the visual share is divided. */
  visible: number;
}

class Ledger {
  private readonly entries = new Map<string, Entry>();

  add(topic: Topic, goal: number, candidate: number, points: number, visible: boolean): void {
    if (!(points > 0)) return;
    const key = `${topic}:${goal}:${candidate}`;
    let e = this.entries.get(key);
    if (!e) {
      e = { topic, goal, candidate, points: 0, visible: 0 };
      this.entries.set(key, e);
    }
    e.points += points;
    if (visible) e.visible += points;
  }

  list(): Entry[] {
    return [...this.entries.values()];
  }
}

/** A goal's profile, built once per goal snapshot when the caller does not pass one. */
const profileCache = new WeakMap<PageSnapshot, PageProfile>();
function profileOf(goal: PageSnapshot): PageProfile {
  let p = profileCache.get(goal);
  if (!p) {
    try {
      p = buildPageProfile(goal);
    } catch {
      // A goal the rules cannot split is judged as one component.
      const blocks = goal.blocks.map((_, i) => i);
      p = {
        version: 1, source: 'rules', width: goal.width, height: goal.height,
        components: blocks.length ? [{ id: 'c1', type: 'other', name: 'the page', rect: { x: 0, y: 0, w: goal.width, h: goal.height }, blocks, children: [], importance: 'normal', keyTexts: [] }] : [],
        weightShift: { content: 0, layout: 0, style: 0, visual: 0 },
      };
    }
    profileCache.set(goal, p);
  }
  return p;
}

/**
 * A picture built from different elements but looking the same is the same
 * picture: an avatar drawn as a circle with two shapes inside it on one page
 * and as one SVG on the other. A box with no text in it that holds other
 * boxes (a drawing made of boxes) is read as one picture when the other
 * page has a picture of about its size near its place and no such drawing
 * there; the boxes inside it are its strokes, not separate things. Both are
 * then compared as pictures, by what the screenshot shows.
 */
function drawingsAsPictures(page: PageSnapshot, other: PageSnapshot): PageSnapshot {
  const blocks = page.blocks;
  const drop = new Set<number>();
  const replace = new Map<number, Block>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== 'box' || drop.has(i)) continue;
    const inside = blocks.map((_, j) => j).filter((j) => j !== i && contains(b.rect, blocks[j].rect));
    if (inside.length === 0 || inside.some((j) => blocks[j].kind !== 'box')) continue;
    const near = (r: Rect) =>
      sizeCredit(b.rect, r) >= 0.6 && Math.hypot(r.x + r.w / 2 - (b.rect.x + b.rect.w / 2), r.y + r.h / 2 - (b.rect.y + b.rect.h / 2)) <= 1.5 * Math.max(b.rect.w, b.rect.h);
    const picture = other.blocks.some((o) => o.kind === 'image' && near(o.rect));
    const drawing = other.blocks.some((o, k) => o.kind === 'box' && near(o.rect) && other.blocks.some((q, m) => m !== k && contains(o.rect, q.rect)));
    if (!picture || drawing) continue;
    replace.set(i, { kind: 'image', rect: b.rect, behind: b.behind, ...(b.role ? { role: b.role } : {}) });
    for (const j of inside) drop.add(j);
  }
  if (replace.size === 0) return page;
  return { ...page, blocks: blocks.flatMap((b, i) => (drop.has(i) ? [] : [replace.get(i) ?? b])) };
}

export function score(goal0: PageSnapshot, candidate0: PageSnapshot, profile?: PageProfile): GradeResult {
  const goal = drawingsAsPictures(goal0, candidate0);
  const candidate = drawingsAsPictures(candidate0, goal0);
  // A profile is read from the goal's blocks: a goal read with a drawing as one picture needs its own.
  if (goal !== goal0) profile = profileOf(goal);
  const goalWords = goal.blocks.map((b) => (b.kind === 'text' ? words(b.text ?? '') : []));
  const candidateWords = candidate.blocks.map((b) => (b.kind === 'text' ? words(b.text ?? '') : []));
  // Pairing reads words the way they are meant: a date as 03/11/2026 is the date 3 November 2026.
  const pairs = matchBlocks(goal, candidate, goalWords.map(canonical), candidateWords.map(canonical));
  const goalWeights = weightsOf(goal);
  const candidateWeights = weightsOf(candidate);
  const goalTotal = goalWeights.reduce((sum, w) => sum + w, 0);
  const candidateTotal = candidateWeights.reduce((sum, w) => sum + w, 0);

  // How far the whole candidate page sits from the goal: the middle value
  // of every sure pair's shift, in whole pixels.
  const sure = pairs.filter((p) => p.trust === 1);
  const dx = Math.round(
    median(
      sure.map((p) => {
        const g = goal.blocks[p.goal].rect;
        const c = candidate.blocks[p.candidate].rect;
        return c.x + c.w / 2 - (g.x + g.w / 2);
      }),
    ),
  );
  const dy = Math.round(
    median(
      sure.map((p) => {
        const g = goal.blocks[p.goal].rect;
        const c = candidate.blocks[p.candidate].rect;
        return c.y + c.h / 2 - (g.y + g.h / 2);
      }),
    ),
  );

  const goalMatched = new Set<number>(pairs.map((p) => p.goal));
  const candidateMatched = new Set<number>(pairs.map((p) => p.candidate));
  const goalFree0 = goal.blocks.map((_, i) => i).filter((i) => !goalMatched.has(i));
  const candFree0 = candidate.blocks.map((_, i) => i).filter((i) => !candidateMatched.has(i));
  const changed = changedText(goal, candidate, goalFree0, candFree0, dx, dy, goalWords, candidateWords);
  const changedGoal = new Set(changed.map((p) => p.goal));
  const changedCand = new Set(changed.map((p) => p.candidate));
  const joined = new Set<string>();
  const pieces = joinSplitText(goal, candidate, [...pairs, ...changed], goalFree0.filter((i) => !changedGoal.has(i)), candFree0.filter((i) => !changedCand.has(i)), goalWords, candidateWords, joined);
  const goalFree = goalFree0.filter((i) => !changedGoal.has(i) && !joined.has(`g${i}`));
  const candFree = candFree0.filter((i) => !changedCand.has(i) && !joined.has(`c${i}`));

  // Movement: every pair, plus text that changed in place, since its place still counts.
  const links: Link[] = [...pairs, ...changed].map((p) => {
    const piece = pieces.get(p);
    return piece?.joined ? { goal: p.goal, candidate: p.candidate, gRect: piece.gRect, cRect: piece.cRect } : { goal: p.goal, candidate: p.candidate };
  });
  const motion = analyseMotion(goal, candidate, links, goalFree, candFree);

  // ---- layout and style, block by block ----
  // A matched pair counts at the larger of its two weights, so a faint goal
  // block matched by a bold candidate block (or the reverse) cannot hide a
  // difference anyone can see. Against itself both weights are equal. A pair
  // that is only partly sure counts as matched only that far; the rest of it
  // counts as a missing goal block plus an extra candidate block. A block is
  // charged for its move relative to its neighbours, not for the drift that
  // something else caused (see analyseMotion).
  let layoutSum = 0;
  let styleSum = 0;
  let matchedWeight = 0;
  let matchedGoalWeight = 0;
  let fadedExtra = 0;
  const pairInfo: { pair: Pair; w: number; pos: number; size: number; style: StyleParts | null }[] = [];
  pairs.forEach((pair, i) => {
    const g = goal.blocks[pair.goal];
    const c = candidate.blocks[pair.candidate];
    const t = pair.trust;
    const w = Math.max(goalWeights[pair.goal], candidateWeights[pair.candidate]);
    matchedGoalWeight += t * goalWeights[pair.goal];
    const pos = offsetCredit(motion.effX[i], motion.effY[i]);
    const size = sizeCredit(links[i].gRect ?? g.rect, links[i].cRect ?? c.rect);
    const layoutCredit = LAYOUT.positionShare * pos + (1 - LAYOUT.positionShare) * size;
    const parts = styleParts(goal, pair.goal, candidate, pair.candidate);
    layoutSum += t * w * layoutCredit;
    styleSum += t * w * styleCredit(parts);
    matchedWeight += t * w;
    // Pieces joined to this text count as matched with it, at its credit.
    const piece = pieces.get(pair);
    if (piece?.joined) {
      const wj = Math.max(piece.gExtra.reduce((s, k) => s + goalWeights[k], 0), piece.cExtra.reduce((s, k) => s + candidateWeights[k], 0));
      matchedGoalWeight += t * piece.gExtra.reduce((s, k) => s + goalWeights[k], 0);
      layoutSum += t * wj * layoutCredit;
      styleSum += t * wj * styleCredit(parts);
      matchedWeight += t * wj;
    }
    fadedExtra += (1 - t) * candidateWeights[pair.candidate];
    // A joined text's size cannot be put in words from one of its pieces: the feedback leaves it out.
    pairInfo.push({ pair, w, pos, size: piece?.joined ? 1 : size, style: parts });
  });
  let extraWeight = 0;
  for (const c of candFree0) if (!joined.has(`c${c}`)) extraWeight += candidateWeights[c];
  extraWeight += fadedExtra;

  const pageBackground = colorCredit(goal.pageBackground, candidate.pageBackground);
  let layout: number;
  let style: number;
  // What the page should have: every matched pair at its pair weight, plus
  // every goal block that found no match at its own weight.
  const expectedTotal = matchedWeight + (goalTotal - matchedGoalWeight);
  // Nothing visible on the goal: anything visible on the candidate is wrong,
  // in proportion to how much of a screen it fills, so one stray word costs
  // a little and a page of junk costs everything.
  const emptyReference = Math.sqrt(goal.width * VIEWPORT.height);
  if (goalTotal === 0) {
    layout = Math.max(0, 1 - candidateTotal / emptyReference);
    style = pageBackground;
  } else {
    layout = layoutSum / (expectedTotal + MATCH.extraPenalty * extraWeight);
    // Credit for the page background is earned only as far as the page's
    // content is there, so an empty page gets nothing for being white.
    const coverage = matchedWeight / expectedTotal;
    style =
      (1 - STYLE.pageBackgroundShare) * (styleSum / expectedTotal) +
      STYLE.pageBackgroundShare * pageBackground * coverage;
  }

  // ---- content: are the right words there, in the right order? ----
  // Single words are counted across the whole page. Pairs of neighbouring
  // words are counted inside each piece of text, so scrambled sentences
  // lose marks but the order of separate blocks on the page (which layout
  // already judges) does not matter here.
  // Text split differently from the goal's is read as joined (see joinSplitText).
  const goalJoined = goalWords.map((w, i) => (joined.has(`g${i}`) ? [] : w));
  const candJoined = candidateWords.map((w, i) => (joined.has(`c${i}`) ? [] : w));
  for (const [p, piece] of pieces) {
    if (!piece.joined) continue;
    goalJoined[p.goal] = piece.gw;
    candJoined[p.candidate] = piece.cw;
  }
  const goalTexts = goalJoined.filter((_, i) => goal.blocks[i].kind === 'text');
  const candidateTexts = candJoined.filter((_, i) => candidate.blocks[i].kind === 'text');
  const allGoalWords = goalTexts.flat();
  let content: number | null = null;
  if (allGoalWords.length > 0) {
    const single = wordOverlap(allGoalWords, candidateTexts.flat());
    const goalPairs = wordPairs(goalTexts);
    content =
      goalPairs.length === 0
        ? single
        : CONTENT.words * single + CONTENT.wordPairs * wordOverlap(goalPairs, wordPairs(candidateTexts));
  }

  // ---- visual: the screenshots ----
  // A page that is right but sits a few pixels low still looks right, so the
  // candidate is compared after sliding it back by the page-wide shift. That
  // forgiveness runs out fast: a page that lost its centring is not forgiven.
  // How far the forgiveness reaches grows with the page: 76 px on a 900 px page is a small slip a person
  // barely sees (and the layout score charges it), while a page half its own height out of place is not forgiven.
  const forgiveAlong = (d: number, size: number) =>
    fallingCredit(Math.abs(d), Math.max(TOL.shiftForgive.full, 0.03 * size), Math.max(TOL.shiftForgive.zero, 0.3 * size));
  const forgiven = forgiveAlong(dx, goal.width) * forgiveAlong(dy, goal.height);
  let visual = seenVisual(compareVisual(goal, candidate, dx, dy));
  if (forgiven < 1) {
    const unshifted = seenVisual(compareVisual(goal, candidate, 0, 0));
    const mix = (a: number, b: number) => forgiven * a + (1 - forgiven) * b;
    visual = {
      score: mix(visual.score, unshifted.score),
      structure: mix(visual.structure, unshifted.structure),
      color: mix(visual.color, unshifted.color),
    };
  }

  // ---- the proportional total ----
  const parts: [number, number | null][] = [
    [WEIGHTS.content, content],
    [WEIGHTS.layout, layout],
    [WEIGHTS.style, style],
    [WEIGHTS.visual, visual.score],
  ];
  // Looks without the words are worth little: the look's credit counts in full once half the content is
  // right, and falls smoothly to half when none of it is.
  const looks = content === null ? 1 : 0.5 + 0.5 * Math.sqrt(Math.min(1, content / 0.5));
  let weighted = 0;
  let weightSum = 0;
  for (const [w, value] of parts) {
    if (value === null) continue; // A goal with no text is not graded on text.
    weighted += w * value * (w === WEIGHTS.content ? 1 : looks);
    weightSum += w;
  }
  const proportional = weightSum === 0 ? 0 : (weighted / weightSum) * 100;

  // ---- the noticed faults, and the lower of the two readings ----
  const subWeight: Record<Sub, number> = {
    content: content === null || weightSum === 0 ? 0 : WEIGHTS.content / weightSum,
    layout: weightSum === 0 ? 0 : WEIGHTS.layout / weightSum,
    style: weightSum === 0 ? 0 : WEIGHTS.style / weightSum,
    visual: weightSum === 0 ? 0 : WEIGHTS.visual / weightSum,
  };
  const faults =
    goalTotal === 0 && goal.blocks.length === 0
      ? []
      : findFaults(goal, candidate, pairs, changed, goalFree, candFree, motion, links, goalWords, candidateWords, content, pieces);
  const reading = readFaults(faults, subWeight, Math.min(3, Math.max(1, Math.sqrt(goal.blocks.length / FAULT_EASE_BLOCKS))));
  const total = Math.max(0, Math.min(100, proportional, reading.total));
  const lower = (a: number, s: Sub) => Math.min(a, reading.sub[s]);

  const breakdown: Breakdown = {
    content: content === null ? null : round1(lower(content, 'content') * 100),
    layout: round1(lower(layout, 'layout') * 100),
    style: round1(lower(style, 'style') * 100),
    visual: round1(lower(visual.score, 'visual') * 100),
  };

  // ---- feedback: the same arithmetic, entry by entry ----
  let feedback: Feedback[] = [];
  if (round1(total) < 100 && weightSum > 0) {
    const ctx: Context = { goal, candidate, dx, dy, pairs, goalWords, candidateWords, links, scale: motion.scale };
    // The noticed faults first, at what they cost.
    const faultLines = describeFaults(faults, reading, ctx);
    const faultPoints = faultLines.reduce((s, l) => s + l.points, 0);
    let lines = faultLines;
    const remainder = 100 - total - faultPoints;
    if (remainder > 0.05) {
      // The proportional reading was lower: what it found beyond the noticed faults.
      const covered = new Set<string>(joined);
      for (const f of faults) {
        if (f.goal >= 0) covered.add(`g${f.goal}`);
        if (f.candidate >= 0) covered.add(`c${f.candidate}`);
        for (const b of f.blocks ?? []) covered.add(f.kind === 'extra' ? `c${b}` : `g${b}`);
      }
      const ledger = proportionalLedger(goal, candidate, pairInfo, goalFree0, candFree0, goalWeights, candidateWeights, {
        weightSum, layout, style, content, visual: visual.score, goalTotal, candidateTotal, expectedTotal, extraWeight, pageBackground,
      }, goalWords, candidateWords);
      const rest = ledger.filter((e) => !(e.goal >= 0 && covered.has(`g${e.goal}`)) && !(e.candidate >= 0 && covered.has(`c${e.candidate}`)));
      const restSum = rest.reduce((s, e) => s + e.points, 0);
      if (restSum > 0) {
        for (const e of rest) e.points = (e.points * remainder) / restSum;
        lines = lines.concat(describe(rest, ctx));
      } else if (faultPoints > 0) {
        // Nothing else was found: the averaged reading weighs the same faults more heavily, so they carry its points.
        for (const l of lines) l.points *= (100 - total) / faultPoints;
      } else {
        lines.push({ message: sentence({ topic: 'look', goal: -1, candidate: -1, points: remainder, visible: 0 }, ctx).text, points: remainder, order: 1e9 });
      }
    }
    feedback = finish(lines);
  }

  // ---- the twelve criteria, per component of the goal ----
  const measured = measureCriteria({
    goal, candidate, profile: profile ?? profileOf(goal), pairs, changed, pieces, goalFree, candFree, faults,
    scale: motion.scale, pageShift: motion.pageShift, likeness: visual.score, goalWords, candidateWords,
  });

  return {
    version: GRADER_VERSION,
    total: round1(total),
    breakdown,
    details: {
      goalBlocks: goal.blocks.length,
      candidateBlocks: candidate.blocks.length,
      matchedBlocks: pairs.length,
      missingText: unmatchedText(goal.blocks, goalMatched),
      extraText: unmatchedText(candidate.blocks, candidateMatched),
      globalOffset: { dx, dy },
      visual: { structure: round1(visual.structure * 100), color: round1(visual.color * 100) },
    },
    feedback,
    criteria: measured.criteria,
    components: measured.components,
    criteriaBreakdown: subScoresFromCriteria(measured.criteria),
    criteriaFeedback: measured.criteriaFeedback,
  };
}

// Measurements the criteria reuse (src/criteria/measure.ts).
export type { Fault, Pair, Piece };
export {
  borderPresence, boxStyleParts, canonical, colourSeverity, edgeOffset, groupName, insideRect, isSymbolText, lookAlike,
  moveSeverity, multisetDiff, nameOf, notice, pictureDistance, placeWords, radiusPx, screenSize, standsOut, visibility,
};
export { subScoresFromCriteria } from './criteria/measure';

interface Readings {
  weightSum: number;
  layout: number;
  style: number;
  content: number | null;
  visual: number;
  goalTotal: number;
  candidateTotal: number;
  expectedTotal: number;
  extraWeight: number;
  pageBackground: number;
}

/** Where the proportional reading's points went, entry by entry, adding up to 100 minus its total. */
function proportionalLedger(
  goal: PageSnapshot,
  candidate: PageSnapshot,
  pairInfo: { pair: Pair; w: number; pos: number; size: number; style: StyleParts | null }[],
  goalUnmatched: number[],
  candUnmatched: number[],
  goalWeights: number[],
  candidateWeights: number[],
  r: Readings,
  goalWords: string[][],
  candidateWords: string[][],
): Entry[] {
  const ledger = new Ledger();
  const scale = (w: number) => (100 * w) / r.weightSum;
  const F = { content: scale(WEIGHTS.content), layout: scale(WEIGHTS.layout), style: scale(WEIGHTS.style) };
  if (r.goalTotal === 0) {
    const share = r.candidateTotal > 0 ? (F.layout * (1 - r.layout)) / r.candidateTotal : 0;
    candidate.blocks.forEach((_, c) => ledger.add('extra', -1, c, share * candidateWeights[c], true));
    ledger.add('pageBackground', -1, -1, F.style * (1 - r.style), true);
  } else {
    const D = r.expectedTotal + MATCH.extraPenalty * r.extraWeight;
    const S = (1 - STYLE.pageBackgroundShare) / r.expectedTotal;
    const B = (STYLE.pageBackgroundShare * r.pageBackground) / r.expectedTotal;
    for (const info of pairInfo) {
      const { pair, w } = info;
      const t = pair.trust;
      ledger.add('position', pair.goal, pair.candidate, (F.layout * t * w * LAYOUT.positionShare * (1 - info.pos)) / D, true);
      ledger.add('size', pair.goal, pair.candidate, (F.layout * t * w * (1 - LAYOUT.positionShare) * (1 - info.size)) / D, true);
      if (info.style) {
        for (const [k, part] of Object.entries(info.style)) {
          const topic = (goal.blocks[pair.goal].kind === 'image' ? 'background' : k) as Topic;
          ledger.add(topic, pair.goal, pair.candidate, F.style * S * t * w * part.weight * (1 - part.credit), true);
        }
      }
      const gw = goalWeights[pair.goal];
      const cw = candidateWeights[pair.candidate];
      const faded = (F.layout * (1 - t) * (gw + MATCH.extraPenalty * cw)) / D + F.style * (S + B) * (1 - t) * gw;
      ledger.add('words', pair.goal, pair.candidate, faded, true);
    }
    for (const g of goalUnmatched) ledger.add('missing', g, -1, (F.layout * goalWeights[g]) / D + F.style * (S + B) * goalWeights[g], true);
    for (const c of candUnmatched) ledger.add('extra', -1, c, (F.layout * MATCH.extraPenalty * candidateWeights[c]) / D, true);
    // A page background too close to the goal's to notice is not a fault a person would name.
    if (seenColourDistance(goal.pageBackground, candidate.pageBackground) >= FAULTS.boxColourFrom)
      ledger.add('pageBackground', -1, -1, F.style * STYLE.pageBackgroundShare * (1 - r.pageBackground), true);
  }
  if (r.content !== null && r.content < 1) {
    const loss = F.content * (1 - r.content);
    const diffs: { topic: Topic; goal: number; candidate: number; n: number }[] = [];
    for (const { pair } of pairInfo) {
      if (goal.blocks[pair.goal].kind !== 'text') continue;
      const n = wordDiff(goalWords[pair.goal], candidateWords[pair.candidate]);
      if (n > 0) diffs.push({ topic: 'words', goal: pair.goal, candidate: pair.candidate, n });
    }
    for (const g of goalUnmatched) if (goal.blocks[g].kind === 'text') diffs.push({ topic: 'missing', goal: g, candidate: -1, n: 2 * goalWords[g].length });
    for (const c of candUnmatched) if (candidate.blocks[c].kind === 'text') diffs.push({ topic: 'extra', goal: -1, candidate: c, n: 2 * candidateWords[c].length });
    const n = diffs.reduce((sum, d) => sum + d.n, 0);
    if (n === 0) ledger.add('order', -1, -1, loss, false);
    for (const d of diffs) ledger.add(d.topic, d.goal, d.candidate, (loss * d.n) / n, false);
  }
  const visualLoss = scale(WEIGHTS.visual) * (1 - r.visual);
  const entries = ledger.list();
  const visibleSum = entries.reduce((sum, e) => sum + e.visible, 0);
  if (visualLoss > 0) {
    if (visibleSum > 0) for (const e of entries) e.points += (visualLoss * e.visible) / visibleSum;
    else entries.push({ topic: 'look', goal: -1, candidate: -1, points: visualLoss, visible: 0 });
  }
  return entries;
}

/** Words and neighbouring-word pairs in one text but not the other, counted both ways. */
function wordDiff(a: string[], b: string[]): number {
  const diff = (x: string[], y: string[]) => x.length + y.length - 2 * (x.length - multisetDiff(x, y).length);
  return diff(a, b) + diff(wordPairs([a]), wordPairs([b]));
}

// ---------------------------------------------------------------------------
// Plain words.
// ---------------------------------------------------------------------------

interface Context {
  goal: PageSnapshot;
  candidate: PageSnapshot;
  dx: number;
  dy: number;
  pairs: Pair[];
  goalWords: string[][];
  candidateWords: string[][];
  links: Link[];
  scale: Motion['scale'];
}

interface Line {
  message: string;
  points: number;
  order: number;
}

const MAX_FEEDBACK = 6;

function quote(text: string): string {
  return `'${clip(text.replace(/\s+/g, ' ').trim(), 40)}'`;
}

function where(rect: Rect, page: PageSnapshot): string {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const height = Math.min(Math.max(page.height, 1), MAX_PAGE_HEIGHT);
  const v = cy < height / 3 ? 'top' : cy < (2 * height) / 3 ? 'middle' : 'bottom';
  const h = rect.w > page.width * 0.6 ? '' : cx < page.width / 3 ? ' left' : cx > (2 * page.width) / 3 ? ' right' : '';
  return v === 'middle' && h ? `middle${h}` : `${v}${h}`;
}

/** "near the top", or "down the whole page" for things spread over most of it. */
function placeWords(rect: Rect, page: PageSnapshot): string {
  const height = Math.min(Math.max(page.height, 1), MAX_PAGE_HEIGHT);
  return rect.h > 0.5 * height ? 'down the whole page' : `near the ${where(rect, page)}`;
}

function insideRect(inner: Rect, outer: Rect): boolean {
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}

const ROLE_NAMES: Record<string, string> = {
  heading: 'heading',
  button: 'button',
  link: 'link',
  field: 'form field',
  label: 'label',
  cell: 'table cell',
  listitem: 'list item',
  quote: 'quote',
  code: 'code',
  caption: 'caption',
};

/** What a person would call a block: "the heading 'Pricing'", "the button 'Buy'", "the blue box near the top". */
function nameOf(page: PageSnapshot, index: number): { name: string; kind: string } {
  const block = page.blocks[index];
  const facts = factsOf(page);
  if (block.kind === 'text') {
    const q = quote(block.text ?? '');
    const fs = block.textStyle!.fontSize;
    const n = words(block.text ?? '').length;
    const holder = page.blocks.findIndex((b, i) => facts.pillBox[i] === 1 && insideRect(block.rect, b.rect));
    if (block.role && ROLE_NAMES[block.role] && block.role !== 'heading') return { name: `the ${ROLE_NAMES[block.role]} ${q}`, kind: ROLE_NAMES[block.role] };
    // One or two letters in a small coloured square: a logo mark near the top left, a badge elsewhere; not a button.
    if (holder >= 0 && (block.text ?? '').trim().length <= 2) {
      const r = block.rect;
      return r.y < 100 && r.x < page.width / 3 ? { name: `the logo mark ${q}`, kind: 'logo mark' } : { name: `the badge ${q}`, kind: 'badge' };
    }
    if (holder >= 0) {
      const filled = standsOut(colorDistance(page.blocks[holder].boxStyle!.background, page.blocks[holder].behind)) >= 0.5;
      if (filled && fs >= 0.95 * facts.body) return { name: `the button ${q}`, kind: 'button' };
      return { name: `the tag ${q}`, kind: 'tag' };
    }
    if (index === facts.logo && fs >= facts.body && fs < 2 * facts.body) return { name: `the logo ${q}`, kind: 'logo' };
    if ((fs >= 1.4 * facts.body && fs >= 20 && n <= 12) || block.role === 'heading') return { name: `the heading ${q}`, kind: 'heading' };
    return { name: `the text ${q}`, kind: 'text' };
  }
  if (block.kind === 'image') return { name: `the picture near the ${where(block.rect, page)}`, kind: 'picture' };
  const label = page.blocks
    .filter((b) => b.kind === 'text' && insideRect(b.rect, block.rect))
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)[0];
  const colour = colorName(block.boxStyle!.background);
  if (facts.pillBox[index] && label) {
    const filled = standsOut(colorDistance(block.boxStyle!.background, block.behind)) >= 0.5;
    if (block.role === 'cell') return { name: `the table cell ${quote(label.text ?? '')}`, kind: 'table cell' };
    if (filled && label.textStyle!.fontSize >= 0.95 * facts.body) return { name: `the button ${quote(label.text ?? '')}`, kind: 'button' };
    return { name: `the tag ${quote(label.text ?? '')}`, kind: 'tag' };
  }
  if (block.rect.w >= page.width * 0.9) return { name: `the ${colour} section ${placeWords(block.rect, page)}`, kind: 'section' };
  // A panel that holds most of the page (a white sheet on a grey page) is named as what it is, not by a word inside it.
  if (block.rect.w * block.rect.h >= 0.3 * page.width * Math.min(page.height, MAX_PAGE_HEIGHT)) return { name: `the ${colour} panel that holds the page's content`, kind: 'panel' };
  if (label) return { name: `the box with ${quote(label.text ?? '')}`, kind: 'box' };
  return { name: `the ${colour} box near the ${where(block.rect, page)}`, kind: 'box' };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function colours(goal: RGB, candidate: RGB): string {
  const g = colorName(goal);
  const c = colorName(candidate);
  if (g !== c) return `is ${c} where the goal's is ${g}`;
  const dl = lightness(candidate) - lightness(goal);
  if (Math.abs(dl) >= 5) return g === 'white' || g === 'black' ? `is ${dl > 0 ? 'lighter' : 'darker'} than the goal's` : `is a ${dl > 0 ? 'lighter' : 'darker'} ${g} than the goal's`;
  return `is a different shade of ${g} from the goal's`;
}

function pixels(n: number): string {
  const r = n >= 30 ? Math.round(n / 10) * 10 : Math.max(5, Math.round(n / 5) * 5);
  return `about ${r} pixels`;
}

/** Offsets within about a third of each other land in the same bucket, so they can be reported together. */
function bucket(offset: number): number {
  return Math.round(Math.log(Math.abs(offset)) / Math.log(1.4));
}

function offsetOf(g: Rect, c: Rect): { ox: number; oy: number } {
  return { ox: c.x + c.w / 2 - (g.x + g.w / 2), oy: c.y + c.h / 2 - (g.y + g.h / 2) };
}

function offsetWords(ox: number, oy: number): { text: string; key: string } {
  const parts: string[] = [];
  const keys: string[] = [];
  if (Math.abs(oy) >= 2.5) {
    parts.push(`${pixels(Math.abs(oy))} too ${oy > 0 ? 'low' : 'high'}`);
    keys.push(`${oy > 0 ? 'd' : 'u'}${bucket(oy)}`);
  }
  if (Math.abs(ox) >= 2.5) {
    parts.push(`${pixels(Math.abs(ox))} too far ${ox > 0 ? 'right' : 'left'}`);
    keys.push(`${ox > 0 ? 'r' : 'l'}${bucket(ox)}`);
  }
  if (parts.length === 0) return { text: 'is slightly out of place', key: 'x' };
  return { text: parts.join(' and '), key: keys.join(',') };
}

function sizeWords(g: Rect, c: Rect): string {
  const rw = c.w / Math.max(1, g.w);
  const rh = c.h / Math.max(1, g.h);
  const wOff = Math.abs(Math.log(rw));
  const hOff = Math.abs(Math.log(rh));
  if (wOff >= hOff) return `is ${rw > 1 ? 'wider' : 'narrower'} than the goal's (about ${Math.round(c.w)} pixels wide instead of ${Math.round(g.w)})`;
  return `is ${rh > 1 ? 'taller' : 'less tall'} than the goal's (about ${Math.round(c.h)} pixels high instead of ${Math.round(g.h)})`;
}

const FAMILY: Record<string, string> = { serif: 'a serif', sans: 'a sans-serif', mono: 'a monospace', other: 'an unusual' };

function wordList(list: string[]): string {
  const shown = list.slice(0, 3).map((w) => `'${w}'`);
  return shown.join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');
}

function missingWords(a: string[], b: string[]): string[] {
  return [...new Set(multisetDiff(a, b))];
}

function plural(kind: string, n: number): string {
  if (n === 1) return kind;
  if (kind === 'box') return 'boxes';
  if (kind === 'text') return 'pieces of text';
  return `${kind}s`;
}

/** "the button 'Buy'" for one block; "3 boxes" for several alike; "the part with 'Pricing'" for a mixed group. */
function groupName(page: PageSnapshot, blocks: number[]): { name: string; count: number } {
  // A label inside another member is part of that member.
  const top = blocks.filter((b) => !blocks.some((o) => o !== b && page.blocks[o].kind !== 'text' && insideRect(page.blocks[b].rect, page.blocks[o].rect) && page.blocks[o].rect.w * page.blocks[o].rect.h > page.blocks[b].rect.w * page.blocks[b].rect.h));
  if (top.length === 1) return { name: nameOf(page, top[0]).name, count: 1 };
  // A form field with its label is named by the label: "the form field 'Password'", not by its hint.
  const label = blocks.find((b) => page.blocks[b].role === 'label');
  if (label !== undefined && blocks.some((b) => page.blocks[b].role === 'field' || page.blocks[b].kind === 'box')) return { name: `the form field ${quote(page.blocks[label].text ?? '')}`, count: 1 };
  // Many cells of a table are part of the table.
  const cells = top.filter((b) => page.blocks[b].role === 'cell');
  const namedCell = cells.find((b) => (page.blocks[b].text ?? '').trim().length > 0);
  if (cells.length >= 4 && cells.length >= 0.6 * top.length) return { name: `part of the table (${cells.length} cells${namedCell !== undefined ? `, such as ${quote(page.blocks[namedCell].text ?? '')}` : ''})`, count: 1 };
  const kinds = new Set(top.map((b) => nameOf(page, b).kind));
  if (kinds.size === 1) return { name: `${top.length} ${plural([...kinds][0], top.length)}`, count: top.length };
  let lead = blocks[0];
  // Named after its biggest text (its heading), then the most noticeable.
  const rank = (b: number) => page.blocks[b].textStyle!.fontSize * 10 + notice(page, b);
  for (const b of blocks) if (page.blocks[b].kind === 'text' && (page.blocks[lead].kind !== 'text' || rank(b) > rank(lead))) lead = b;
  let box = page.blocks[blocks[0]].rect;
  for (const b of blocks) box = union(box, page.blocks[b].rect);
  const what = box.w >= 0.6 * page.width && box.h >= 150 ? 'section' : 'part';
  if (page.blocks[lead].kind === 'text') return { name: `the ${what} with ${quote(page.blocks[lead].text ?? '')}`, count: top.length };
  return { name: `the ${what} near the ${where(box, page)}`, count: top.length };
}

/** 'is' or 'are', by how the subject reads: '3 boxes are', 'the part with ... is'. */
function verb(subject: string, one: string, many: string): string {
  return /^\d/.test(subject) ? many : one;
}

/** The noticed faults as sentences, cause first; a fault that runs through the whole page is one line. */
function describeFaults(faults: Fault[], reading: FaultReading, ctx: Context): Line[] {
  const { goal, candidate } = ctx;
  const lost = 100 - reading.total;
  const chargeSum = Object.values(reading.charge).reduce((s, v) => s + (v ?? 0), 0);
  if (lost <= 0 || chargeSum <= 0) return [];
  const pointsOf = (f: Fault) => ((lost * reading.charge[f.kind]!) / chargeSum) * (f.amount / reading.sums[f.kind]!);
  const lines: Line[] = [];
  let order = 0;
  const push = (message: string, points: number) => lines.push({ message, points, order: order++ });
  const byKind = new Map<FaultKind, Fault[]>();
  for (const f of [...faults].sort((a, b) => b.amount - a.amount || a.goal - b.goal || a.candidate - b.candidate)) {
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind)!.push(f);
  }
  const sumPoints = (list: Fault[]) => list.reduce((s, f) => s + pointsOf(f), 0);
  const textCount = goal.blocks.filter((b) => b.kind === 'text').length;

  // Drift that something missing or extra caused is part of that fault's cost, not a line of its own.
  let drift = 0;
  const causes = [...(byKind.get('missing') ?? []), ...(byKind.get('extra') ?? [])];
  // Moves a neighbour's change of size caused: one line per neighbour, with that neighbour's own size fault.
  const pushedBy = new Map<number, Fault[]>();
  // A move's slip part and its further part are one move: one entry per moved group, carrying both.
  const moveReps = new Map<MoveGroup, Fault>();
  const moveExtra = new Map<Fault, number>();
  for (const f of [...(byKind.get('moved') ?? []), ...(byKind.get('nudge') ?? [])]) {
    const rep = moveReps.get(f.move!);
    if (!rep) moveReps.set(f.move!, f);
    else moveExtra.set(rep, (moveExtra.get(rep) ?? 0) + pointsOf(f));
  }
  const movePoints = (f: Fault) => pointsOf(f) + (moveExtra.get(f) ?? 0);
  const moves = [...moveReps.values()].filter((f) => {
    if (f.move!.cause >= 0) {
      const g = ctx.links[f.move!.cause].goal;
      if (!pushedBy.has(g)) pushedBy.set(g, []);
      pushedBy.get(g)!.push(f);
      return false;
    }
    if (f.move!.explained && causes.length > 0) {
      drift += movePoints(f);
      return false;
    }
    return true;
  });
  const causePoints = new Map<Fault, number>();
  const causeSum = causes.reduce((s, f) => s + f.amount, 0);
  for (const f of causes) causePoints.set(f, pointsOf(f) + (causeSum > 0 ? (drift * f.amount) / causeSum : 0));

  const spanOf = (page: PageSnapshot, blocks: number[]) => blocks.map((b) => page.blocks[b].rect).reduce(union);
  for (const f of byKind.get('missing') ?? []) {
    if (f.outline) {
      const n = f.blocks!.length;
      push(`${n === 1 ? 'A box' : `${n} boxes`} ${placeWords(spanOf(goal, f.blocks!), goal)} ${n === 1 ? 'has' : 'have'} lost the lines drawn around ${n === 1 ? 'it' : 'them'}`, causePoints.get(f)!);
      continue;
    }
    const g = groupName(goal, f.blocks!);
    const copies = f.copies ?? 1;
    const name = copies > 1 && !/^\d/.test(g.name) ? `${capital(g.name)} and ${copies - 1} more like it` : capital(g.name);
    push(`${name} ${copies > 1 || /^\d/.test(name) ? 'are' : 'is'} missing`, causePoints.get(f)!);
  }
  for (const f of byKind.get('extra') ?? []) {
    const blocks = f.blocks!;
    if (f.outline) {
      const n = blocks.length;
      push(`${n === 1 ? 'A box' : `${n} boxes`} ${placeWords(spanOf(candidate, blocks), candidate)} ${n === 1 ? 'has' : 'have'} lines drawn around ${n === 1 ? 'it' : 'them'} that the goal does not have`, causePoints.get(f)!);
      continue;
    }
    const marks = blocks.filter((b) => isSymbolText(candidate.blocks[b]));
    if (marks.length > 0 && blocks.every((b) => isSymbolText(candidate.blocks[b]) || candidate.blocks[b].kind === 'box')) push(`Extra marks the goal does not have, such as ${quote(candidate.blocks[marks[0]].text ?? '')}`, causePoints.get(f)!);
    else if (blocks.length === 1 && candidate.blocks[blocks[0]].kind === 'text') push(`Extra text the goal does not have: ${quote(candidate.blocks[blocks[0]].text ?? '')}`, causePoints.get(f)!);
    else {
      const g = groupName(candidate, blocks);
      const first = blocks.find((b) => candidate.blocks[b].kind === 'text');
      if (g.count === 1 && candidate.blocks[blocks[0]].kind === 'image') push(`An extra picture near the ${where(candidate.blocks[blocks[0]].rect, candidate)} that the goal does not have`, causePoints.get(f)!);
      else if (first !== undefined) push(`Extra content the goal does not have: ${/^\d/.test(g.name) ? g.name + ' such as ' : ''}${quote(candidate.blocks[first].text ?? '')}`, causePoints.get(f)!);
      else push(`An extra ${colorName(candidate.blocks[blocks[0]].boxStyle?.background ?? candidate.pageBackground)} box near the ${where(candidate.blocks[blocks[0]].rect, candidate)} that the goal does not have`, causePoints.get(f)!);
    }
  }

  const words = byKind.get('words') ?? [];
  if (words.length >= 6 && words.length >= 0.4 * textCount) {
    const sample = words[0];
    push(
      `Most of the text says something different from the goal (${words.length} pieces of text, such as ${quote(candidate.blocks[sample.candidate].text ?? '')} where the goal says ${quote(goal.blocks[sample.goal].text ?? '')})`,
      sumPoints(words),
    );
  } else {
    for (const f of words) {
      const gt = goal.blocks[f.goal].text ?? '';
      const ct = candidate.blocks[f.candidate].text ?? '';
      const subject = capital(nameOf(goal, f.goal).name);
      const gw = ctx.goalWords[f.goal];
      const cw = ctx.candidateWords[f.candidate];
      if (gw.length <= 8 && cw.length <= 8) {
        const kind = nameOf(goal, f.goal).kind;
        push(`The ${kind} says ${quote(ct)} where the goal says ${quote(gt)}`, pointsOf(f));
        continue;
      }
      const lostW = missingWords(gw, cw);
      const added = missingWords(cw, gw);
      const bits: string[] = [];
      if (lostW.length) bits.push(`missing ${wordList(lostW)}`);
      if (added.length) bits.push(`has ${wordList(added)} where the goal does not`);
      if (bits.length === 0) push(`${subject} has its words in a different order from the goal's`, pointsOf(f));
      else push(`${subject} has different words from the goal's: ${bits.join('; ')}`, pointsOf(f));
    }
  }

  // Colour: one line when it runs through the page.
  // Whole-page changes: one line each, carrying the slips of the same kind that make it up.
  const themes = byKind.get('theme') ?? [];
  const themeOf = (t: Fault['theme']) => themes.find((f) => f.theme === t);
  const lg = lightness(goal.pageBackground);
  const lc = lightness(candidate.pageBackground);
  const bg = themeOf('background');
  if (bg) {
    if (Math.abs(lg - lc) >= 35) {
      // A dark page where the goal is light: the colours that changed with it are part of that one change.
      const withIt = [...(byKind.get('colour') ?? []), ...themes.filter((f) => f.theme === 'palette')];
      push(`The page background is ${lc < lg ? 'dark' : 'light'} where the goal's is ${lc < lg ? 'light' : 'dark'}`, pointsOf(bg) + sumPoints(withIt));
      byKind.delete('colour');
      byKind.set('theme', themes.filter((f) => f.theme !== 'palette'));
    } else push(`The page background ${colours(goal.pageBackground, candidate.pageBackground)}`, pointsOf(bg));
  }
  const typeface = themeOf('typeface');
  const familyAll = byKind.get('family') ?? [];
  if (typeface && familyAll.length > 0) {
    const f = familyAll[0];
    push(`The page uses ${FAMILY[candidate.blocks[f.candidate].textStyle!.fontClass]} font where the goal uses ${FAMILY[goal.blocks[f.goal].textStyle!.fontClass]} one (${familyAll.length} pieces of text)`, pointsOf(typeface) + sumPoints(familyAll));
    byKind.delete('family');
  }
  const textSize = themeOf('textSize');
  const sizeAll = byKind.get('fontSize') ?? [];
  if (textSize && sizeAll.length > 0) {
    const smaller = sizeAll.filter((f) => candidate.blocks[f.candidate].textStyle!.fontSize < goal.blocks[f.goal].textStyle!.fontSize).length;
    push(`The text is ${smaller >= sizeAll.length / 2 ? 'smaller' : 'larger'} than the goal's throughout (${sizeAll.length} pieces of text)`, pointsOf(textSize) + sumPoints(sizeAll));
    byKind.delete('fontSize');
  }
  const palette = (byKind.get('theme') ?? []).find((f) => f.theme === 'palette');
  const colour = byKind.get('colour') ?? [];
  if (palette || colour.length > 0) {
    const blockFaults = colour.filter((f) => f.goal >= 0);
    const greyed = blockFaults.filter((f) => {
      const [gc, cc] = faultColours(f, ctx);
      return chroma(gc) > 15 && chroma(cc) < 6;
    });
    const darker = blockFaults.filter((f) => {
      const [gc, cc] = faultColours(f, ctx);
      // A tint is a shade a person sees, not a step of a lightness unit or two.
      return lightness(cc) < lightness(gc) - 4;
    });
    const all = sumPoints(colour) + (palette ? pointsOf(palette) : 0);
    if (colour.length >= 3 && greyed.length >= 0.5 * blockFaults.length && greyed.length >= 3) push('The page is in shades of grey where the goal has colour', all);
    else if (colour.length >= 5 && darker.length >= 0.8 * colour.length && lc < lg - 4) push('The whole page is darker than the goal, as if tinted', all);
    else if (palette && blockFaults.length === 0) push("The page's colours differ from the goal's", all);
    else if (palette || (colour.length >= 6 && blockFaults.length >= 5)) {
      const [gc, cc] = faultColours(blockFaults[0], ctx);
      const on = nameOf(goal, blockFaults[0].goal).name;
      if (colorName(cc) === colorName(gc)) push(`Colours across the page are slightly off: for example, ${on} ${colours(gc, cc)}`, all);
      else push(`Colours across the page differ from the goal's: ${colorName(cc)} where the goal uses ${colorName(gc)}, for example on ${on}`, all);
    } else {
      for (const f of colour) {
        const b = goal.blocks[f.goal];
        const subject = capital(nameOf(goal, f.goal).name);
        const [gc, cc] = faultColours(f, ctx);
        if (b.kind === 'image') push(`The colours of ${nameOf(goal, f.goal).name} differ from the goal's (${colorName(cc)} where the goal's is ${colorName(gc)})`, pointsOf(f));
        else push(`${subject} ${colours(gc, cc)}`, pointsOf(f));
      }
    }
  }

  for (const f of byKind.get('picture') ?? []) push(`${capital(nameOf(goal, f.goal).name)} shows something different from the goal's`, pointsOf(f));

  const legible = byKind.get('legibility') ?? [];
  if (legible.length >= 3) push(`The text is pale and hard to read where the goal's is clear (${legible.length} pieces of text)`, sumPoints(legible));
  else for (const f of legible) push(`${capital(nameOf(goal, f.goal).name)} is hard to read against its background`, pointsOf(f));

  const family = byKind.get('family') ?? [];
  if (family.length >= 3) {
    const f = family[0];
    push(`The text uses ${FAMILY[candidate.blocks[f.candidate].textStyle!.fontClass]} font where the goal uses ${FAMILY[goal.blocks[f.goal].textStyle!.fontClass]} one (${family.length} pieces of text)`, sumPoints(family));
  } else {
    for (const f of family) {
      push(`${capital(nameOf(goal, f.goal).name)} uses ${FAMILY[candidate.blocks[f.candidate].textStyle!.fontClass]} font where the goal uses ${FAMILY[goal.blocks[f.goal].textStyle!.fontClass]} one`, pointsOf(f));
    }
  }

  const weight = byKind.get('weight') ?? [];
  if (weight.length >= 3) {
    const bold = weight.filter((f) => goal.blocks[f.goal].textStyle!.bold);
    const many = bold.length >= weight.length / 2 ? bold : weight.filter((f) => !goal.blocks[f.goal].textStyle!.bold);
    push(`${many.length} pieces of text ${bold.length >= weight.length / 2 ? 'should be bold' : 'should not be bold'}, such as ${nameOf(goal, many[0].goal).name}`, sumPoints(weight));
  } else for (const f of weight) push(`${capital(nameOf(goal, f.goal).name)} ${goal.blocks[f.goal].textStyle!.bold ? 'should be bold' : 'should not be bold'}`, pointsOf(f));

  const sizes = byKind.get('fontSize') ?? [];
  const sizeLine = (f: Fault) => {
    const gs = goal.blocks[f.goal].textStyle!.fontSize;
    const cs = candidate.blocks[f.candidate].textStyle!.fontSize;
    return `${capital(nameOf(goal, f.goal).name)} is noticeably ${cs < gs ? 'smaller' : 'larger'} than the goal's (${cs} px text instead of ${gs} px)`;
  };
  if (sizes.length >= 4) {
    const smaller = sizes.filter((f) => candidate.blocks[f.candidate].textStyle!.fontSize < goal.blocks[f.goal].textStyle!.fontSize).length;
    push(`The text is generally ${smaller >= sizes.length / 2 ? 'smaller' : 'larger'} than the goal's (${sizes.length} pieces of text)`, sumPoints(sizes));
  } else for (const f of sizes) push(sizeLine(f), pointsOf(f));

  const deco = byKind.get('decoration') ?? [];
  for (const f of deco) {
    const gs = goal.blocks[f.goal].textStyle!;
    const cs = candidate.blocks[f.candidate].textStyle!;
    const subject = capital(nameOf(goal, f.goal).name);
    if (gs.italic !== cs.italic) push(`${subject} ${gs.italic ? 'should be in italics' : 'should not be in italics'}`, pointsOf(f));
    else if (gs.underline !== cs.underline) push(`${subject} ${gs.underline ? 'should be underlined' : 'should not be underlined'}`, pointsOf(f));
    else push(`${subject} uses different capital letters from the goal's`, pointsOf(f));
  }

  const corners = byKind.get('corners') ?? [];
  if (corners.length >= 3) {
    const rounder = corners.filter((f) => radiusPx(candidate.blocks[f.candidate]) > radiusPx(goal.blocks[f.goal])).length;
    push(`Corners are ${rounder >= corners.length / 2 ? 'more rounded' : 'sharper'} than the goal's throughout (${corners.length} boxes)`, sumPoints(corners));
  } else for (const f of corners) push(`The corners of ${nameOf(goal, f.goal).name} are ${radiusPx(candidate.blocks[f.candidate]) > radiusPx(goal.blocks[f.goal]) ? 'more rounded' : 'sharper'} than the goal's`, pointsOf(f));

  for (const f of byKind.get('border') ?? []) {
    const e: Entry = { topic: 'border', goal: f.goal, candidate: f.candidate, points: 0, visible: 0 };
    push(sentence(e, ctx).text, pointsOf(f));
  }
  for (const f of byKind.get('shadow') ?? []) push(`${capital(nameOf(goal, f.goal).name)} ${goal.blocks[f.goal].boxStyle!.shadow ? 'should have a shadow' : 'should not have a shadow'}`, pointsOf(f));

  for (const f of byKind.get('scale') ?? []) {
    const { x, y, fx, fy } = ctx.scale;
    const bits: string[] = [];
    const pct = (a: number) => `about ${Math.max(1, Math.round(Math.abs(a - 1) * 100))}%`;
    if (fx > 0 && fy > 0 && Math.abs(x - y) < 0.05) bits.push(`Everything is drawn ${pct((x + y) / 2)} ${x < 1 ? 'smaller' : 'larger'} than the goal`);
    else {
      if (fx > 0) bits.push(`The content is ${pct(x)} ${x < 1 ? 'narrower' : 'wider'} than the goal's`);
      if (fy > 0) bits.push(`The content is ${pct(y)} ${y < 1 ? 'shorter' : 'taller'} than the goal's`);
    }
    push(bits.join('; ') || 'The page is drawn at a different size from the goal', pointsOf(f));
  }

  // Moves: the cause, once per group.
  const linked = ctx.links.length;
  // Sides that traded places: one line for the swap.
  const swapMoves = moves.filter((f) => f.mirrored);
  if (swapMoves.length > 0) {
    const pts = swapMoves.reduce((s, f) => s + movePoints(f), 0);
    const texts = swapMoves.flatMap((f) => f.blocks!.filter((b) => goal.blocks[b].kind === 'text'));
    const lead = texts.sort((a, b) => goal.blocks[b].textStyle!.fontSize - goal.blocks[a].textStyle!.fontSize)[0];
    const hasPicture = swapMoves.some((f) => f.blocks!.some((b) => goal.blocks[b].kind === 'image'));
    push(lead !== undefined ? `The part with ${quote(goal.blocks[lead].text ?? '')} and ${hasPicture ? 'the picture' : 'what sits'} beside it have swapped sides` : 'Two parts of the page have swapped sides', pts);
  }
  for (const f of moves) {
    if (f.mirrored) continue;
    const g = f.move!;
    const o = offsetWords(g.incX, g.incY);
    const pageW = goal.width;
    const gcx = g.goalBox.x + g.goalBox.w / 2;
    const ccx = gcx + g.incX;
    const sideSwap = g.goalBox.w < 0.5 * pageW && Math.abs(g.incX) >= 0.3 * pageW && (gcx - pageW / 2) * (ccx - pageW / 2) < 0;
    const gn = groupName(goal, f.blocks!);
    if (sideSwap) {
      const side = (x: number) => (x < pageW / 2 ? 'left' : 'right');
      const what = g.goalBox.h >= 300 ? 'column' : 'part';
      const lead = f.blocks!.find((b) => goal.blocks[b].kind === 'text');
      const label = lead !== undefined ? ` with ${quote(goal.blocks[lead].text ?? '')}` : '';
      push(`The ${what}${label} is on the ${side(ccx)} where the goal has it on the ${side(gcx)}`, movePoints(f));
    } else if (g.members.length >= 0.8 * linked && linked >= 3) push(o.key === 'x' ? 'Everything is slightly out of place' : `Everything sits ${o.text}`, movePoints(f));
    else if (o.key === 'x') push(`${capital(gn.name)} ${verb(gn.name, 'is', 'are')} slightly out of place`, movePoints(f));
    else push(`${capital(gn.name)} ${verb(gn.name, 'sits', 'sit')} ${o.text}`, movePoints(f));
  }
  if (moves.length === 0 && drift > 0 && causes.length === 0) push('Some things moved', drift);

  const sizeFaults = byKind.get('size') ?? [];
  const sizeTaken = new Set<Fault>();
  for (const [g, list] of pushedBy) {
    const link = ctx.links.find((l) => l.goal === g)!;
    const gr = goal.blocks[g].rect;
    const cr = candidate.blocks[link.candidate].rect;
    const own = sizeFaults.find((f) => f.goal === g);
    if (own) sizeTaken.add(own);
    const dw = cr.w - gr.w;
    const dh = cr.h - gr.h;
    const across = Math.abs(list[0].move!.ox) >= Math.abs(list[0].move!.oy);
    const d = across ? dw : dh;
    const change = across ? (d > 0 ? 'wider' : 'narrower') : d > 0 ? 'taller' : 'shorter';
    const push2 = across ? (d > 0 ? 'to its right sits further right' : 'to its right sits further left') : d > 0 ? 'below it sits lower' : 'below it sits higher';
    const pts = list.reduce((s, f) => s + movePoints(f), 0) + (own ? pointsOf(own) : 0);
    push(`${capital(nameOf(goal, g).name)} is ${pixels(Math.abs(d))} ${change} than the goal's, so what is ${push2}`, pts);
  }

  for (const f of sizeFaults) {
    if (sizeTaken.has(f)) continue;
    push(`${capital(nameOf(goal, f.goal).name)} ${sizeWords(goal.blocks[f.goal].rect, candidate.blocks[f.candidate].rect)}`, pointsOf(f));
  }
  return lines;
}

/** The goal and candidate colours behind a colour fault. */
function faultColours(f: Fault, ctx: Context): [RGB, RGB] {
  if (f.goal < 0) return [ctx.goal.pageBackground, ctx.candidate.pageBackground];
  const g = ctx.goal.blocks[f.goal];
  const c = ctx.candidate.blocks[f.candidate];
  if (g.kind === 'text') return [g.textStyle!.color, c.textStyle!.color];
  if (g.kind === 'box') return [g.boxStyle!.background, c.boxStyle!.background];
  const a = pictureColours(ctx.goal, f.goal);
  const b = pictureColours(ctx.candidate, f.candidate);
  let worst = 0;
  for (let i = 1; i < a.length; i++) if (colorDistance(a[i], b[i]) > colorDistance(a[worst], b[worst])) worst = i;
  return [a[worst], b[worst]];
}

function sentence(e: Entry, ctx: Context): { text: string; group?: string } {
  const { goal, candidate } = ctx;
  const g = e.goal >= 0 ? goal.blocks[e.goal] : null;
  const c = e.candidate >= 0 ? candidate.blocks[e.candidate] : null;
  const gName = e.goal >= 0 ? nameOf(goal, e.goal).name : '';
  const subject = capital(gName);
  switch (e.topic) {
    case 'missing':
      return { text: `${subject} is missing` };
    case 'extra': {
      if (c!.kind === 'text') return { text: `Extra text the goal does not have: ${quote(c!.text ?? '')}` };
      if (c!.kind === 'image') return { text: `An extra picture near the ${where(c!.rect, candidate)} that the goal does not have` };
      return { text: `An extra ${colorName(c!.boxStyle!.background)} box near the ${where(c!.rect, candidate)} that the goal does not have` };
    }
    case 'words': {
      const gw = ctx.goalWords[e.goal];
      const cw = ctx.candidateWords[e.candidate];
      const lost = missingWords(gw, cw);
      const added = missingWords(cw, gw);
      const bits: string[] = [];
      if (lost.length) bits.push(`missing ${wordList(lost)}`);
      if (added.length) bits.push(`has ${wordList(added)} where the goal does not`);
      if (bits.length === 0) return { text: `${subject} has its words in a different order from the goal's` };
      return { text: `${subject} has different words from the goal's: ${bits.join('; ')}` };
    }
    case 'position': {
      const off = offsetOf(g!.rect, c!.rect);
      const o = offsetWords(off.ox, off.oy);
      if (o.key === 'x') return { text: `${subject} is slightly out of place` };
      return { text: `${subject} sits ${o.text}`, group: `position:${o.key}` };
    }
    case 'size':
      return { text: `${subject} ${sizeWords(g!.rect, c!.rect)}` };
    case 'color':
      return { text: `${subject} ${colours(g!.textStyle!.color, c!.textStyle!.color)}` };
    case 'background':
      if (g!.kind === 'box') return { text: `${subject} ${colours(g!.boxStyle!.background, c!.boxStyle!.background)}` };
      if (g!.kind === 'image') return { text: `The colours of ${gName} differ from the goal's` };
      return { text: `The background behind ${gName} ${colours(g!.behind, c!.behind)}` };
    case 'fontSize': {
      const gs = g!.textStyle!.fontSize;
      const cs = c!.textStyle!.fontSize;
      return { text: `${subject} is noticeably ${cs < gs ? 'smaller' : 'larger'} than the goal's (${cs} px text instead of ${gs} px)` };
    }
    case 'bold':
      return { text: `${subject} ${g!.textStyle!.bold ? 'should be bold' : 'should not be bold'}` };
    case 'family':
      return { text: `${subject} uses ${FAMILY[c!.textStyle!.fontClass]} font where the goal uses ${FAMILY[g!.textStyle!.fontClass]} one` };
    case 'decoration': {
      const gs = g!.textStyle!;
      const cs = c!.textStyle!;
      if (gs.italic !== cs.italic) return { text: `${subject} ${gs.italic ? 'should be in italics' : 'should not be in italics'}` };
      return { text: `${subject} ${gs.underline ? 'should be underlined' : 'should not be underlined'}` };
    }
    case 'letterCase':
      return { text: `${subject} uses different capital letters from the goal's` };
    case 'border': {
      const pg = borderPresence(g!);
      const pc = borderPresence(c!);
      if (pg > pc + 0.5) return { text: `${subject} is missing the goal's border` };
      if (pc > pg + 0.5) return { text: `${subject} has a border the goal does not have` };
      const gb = g!.boxStyle!;
      const cb = c!.boxStyle!;
      const colourLoss = gb.borderColor && cb.borderColor ? 1 - colorCredit(gb.borderColor, cb.borderColor) : 0;
      const ratio = (Math.min(gb.borderWidth, cb.borderWidth) + 1) / (Math.max(gb.borderWidth, cb.borderWidth) + 1);
      const widthLoss = 1 - risingCredit(ratio, TOL.borderWidthRatio.full, TOL.borderWidthRatio.zero);
      if (widthLoss > colourLoss) {
        return { text: `The border of ${gName} is ${cb.borderWidth > gb.borderWidth ? 'thicker' : 'thinner'} than the goal's (${cb.borderWidth} px instead of ${gb.borderWidth} px)` };
      }
      if (colourLoss > 0) return { text: `The border of ${gName} ${colours(gb.borderColor!, cb.borderColor!)}` };
      return { text: `The border of ${gName} is fainter or stronger than the goal's` };
    }
    case 'radius':
      return { text: `The corners of ${gName} are ${radiusPx(c!) > radiusPx(g!) ? 'more rounded' : 'sharper'} than the goal's` };
    case 'shadow':
      return { text: `${subject} ${g!.boxStyle!.shadow ? 'should have a shadow' : 'should not have a shadow'}` };
    case 'pageBackground': {
      const lg = lightness(goal.pageBackground);
      const lc = lightness(candidate.pageBackground);
      if (Math.abs(lg - lc) >= 35) return { text: `The page background is ${lc < lg ? 'dark' : 'light'} where the goal's is ${lc < lg ? 'light' : 'dark'}` };
      return { text: `The page background ${colours(goal.pageBackground, candidate.pageBackground)}` };
    }
    case 'order':
      return { text: 'Some of the text is split up or ordered differently from the goal' };
    case 'look': {
      const at = differenceCentre(goal, candidate, ctx.dx, ctx.dy);
      if (!at) return { text: 'The page looks a little different from the goal at a glance' };
      return { text: `Something looks different near the ${where({ x: at.x, y: at.y, w: 0, h: 0 }, goal)} of the page` };
    }
  }
}

/** Proportional-ledger entries as lines. Entries that read the same are counted together. */
function describe(entries: Entry[], ctx: Context): Line[] {
  const merged = new Map<string, { text: string; points: number; count: number; firstOrder: number; members: Entry[] }>();
  const sorted = [...entries].sort(
    (a, b) => b.points - a.points || a.topic.localeCompare(b.topic) || a.goal - b.goal || a.candidate - b.candidate,
  );
  sorted.forEach((e, order) => {
    if (e.points < 0.05) return;
    const s = sentence(e, ctx);
    const key = s.group ?? `text:${s.text}`;
    const m = merged.get(key);
    if (m) {
      m.points += e.points;
      m.count++;
      m.members.push(e);
    } else merged.set(key, { text: s.text, points: e.points, count: 1, firstOrder: 1000 + order, members: [e] });
  });
  const totalPairs = ctx.pairs.length;
  return [...merged.values()].map((m) => {
    let text = m.text;
    if (m.count > 1 && m.members[0].topic === 'position') {
      const g = groupName(ctx.goal, m.members.map((e) => e.goal));
      let ox = 0;
      let oy = 0;
      for (const e of m.members) {
        const o = offsetOf(ctx.goal.blocks[e.goal].rect, ctx.candidate.blocks[e.candidate].rect);
        ox += o.ox / m.count;
        oy += o.oy / m.count;
      }
      const tail = offsetWords(ox, oy).text;
      const still = tail.startsWith('is ');
      const rest = still ? tail.slice(3) : tail;
      text = m.count >= 0.8 * totalPairs && totalPairs >= 3 ? `Everything ${still ? 'is' : 'sits'} ${rest}` : `${capital(g.name)} ${still ? verb(g.name, 'is', 'are') : verb(g.name, 'sits', 'sit')} ${rest}`;
    }
    return { message: text, points: m.points, order: m.firstOrder };
  });
}

/** Lines that read the same are merged; the costliest come first, at most six. */
function finish(lines: Line[]): Feedback[] {
  const merged = new Map<string, Line>();
  for (const l of lines) {
    const m = merged.get(l.message);
    if (m) m.points += l.points;
    else merged.set(l.message, { ...l });
  }
  const out = [...merged.values()];
  out.sort((a, b) => b.points - a.points || a.order - b.order);
  return out
    .slice(0, MAX_FEEDBACK)
    .map((f) => ({ message: f.message, points: round1(f.points) }))
    .filter((f) => f.points > 0);
}


