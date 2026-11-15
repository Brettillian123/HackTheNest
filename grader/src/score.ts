import { colorDistance, colorName, lightness } from './color';
import { CONTENT, GRADER_VERSION, LAYOUT, MATCH, MAX_PAGE_HEIGHT, SALIENCE, STYLE, TOL, VIEWPORT, WEIGHTS } from './config';
import type { Block, Breakdown, Feedback, GradeResult, PageSnapshot, RGB, Rect } from './types';
import { fallingCredit, median, risingCredit, round1, wordOverlap, wordPairs, words } from './util';
import { compareVisual, differenceCentre } from './visual';

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
  let contrast: number = SALIENCE.fullAt;
  if (block.kind === 'text') contrast = colorDistance(block.textStyle!.color, block.behind);
  else if (block.kind === 'box') {
    const box = block.boxStyle!;
    contrast = colorDistance(box.background, block.behind);
    if (box.hasBorder && box.borderColor) contrast = Math.max(contrast, colorDistance(box.borderColor, block.behind));
    if (box.shadow) contrast = Math.max(contrast, SALIENCE.baseAt);
  }
  return Math.sqrt(w * h) * standsOut(contrast);
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
  // A few pixels either way is not a different size.
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
function positionCredit(goal: Rect, candidate: Rect, dx = 0, dy = 0): number {
  const offX = Math.abs(candidate.x + candidate.w / 2 - dx - (goal.x + goal.w / 2));
  const offY = Math.abs(candidate.y + candidate.h / 2 - dy - (goal.y + goal.h / 2));
  return (
    fallingCredit(offX, TOL.position.full, TOL.position.zero) * fallingCredit(offY, TOL.position.full, TOL.position.zero)
  );
}

/** 0 to 1: how close one rectangle is to another in place and size, after removing a page-wide shift. */
function geometryCredit(goal: Rect, candidate: Rect, dx = 0, dy = 0): number {
  return (
    LAYOUT.positionShare * positionCredit(goal, candidate, dx, dy) +
    (1 - LAYOUT.positionShare) * sizeCredit(goal, candidate)
  );
}

function colorCredit(a: RGB, b: RGB): number {
  return fallingCredit(colorDistance(a, b), TOL.color.full, TOL.color.zero);
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
 * where they are and what colour they are. Best pairs are taken first; ties
 * are broken by position in the list, so the pairing never varies.
 */
function matchBlocks(goal: Block[], candidate: Block[], goalWords: string[][], candidateWords: string[][]): Pair[] {
  const options: { similarity: number; trust: number; goal: number; candidate: number }[] = [];

  for (let g = 0; g < goal.length; g++) {
    const gb = goal[g];
    for (let c = 0; c < candidate.length; c++) {
      const cb = candidate[c];
      if (gb.kind !== cb.kind) continue;
      let similarity: number;
      let trust = 1;
      if (gb.kind === 'text') {
        const text = textSimilarity(goalWords[g], candidateWords[c]);
        if (text <= MATCH.textFadeFrom) continue;
        trust = risingCredit(text, MATCH.minTextSimilarity, MATCH.textFadeFrom);
        similarity = 0.75 * text + 0.25 * geometryCredit(gb.rect, cb.rect);
      } else if (gb.kind === 'box') {
        // A box of a wildly different size is not "the same box", whatever
        // its colour: a matching dot must not stand in for a matching panel.
        if (sizeCredit(gb.rect, cb.rect) < MATCH.minBoxSizeCredit) continue;
        const color = colorCredit(gb.boxStyle!.background, cb.boxStyle!.background);
        similarity = 0.6 * geometryCredit(gb.rect, cb.rect) + 0.4 * color;
        if (similarity < MATCH.minBoxSimilarity) continue;
      } else {
        similarity = geometryCredit(gb.rect, cb.rect);
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
  pairs.sort((a, b) => a.goal - b.goal);
  return pairs;
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
  return {
    background: { weight: w.background, credit: share > 0 ? (1 - share) * fill + share * borderColor : fill },
    border: { weight: w.border, credit: neither + both * (0.5 * borderWidth + 0.5 * borderColor) },
    radius: { weight: w.radius, credit: fallingCredit(Math.abs(g.radius - c.radius), TOL.radius.full, TOL.radius.zero) },
    shadow: { weight: w.shadow, credit: g.shadow === c.shadow ? 1 : 0 },
  };
}

function styleParts(goal: Block, candidate: Block): StyleParts | null {
  if (goal.kind === 'text') return textStyleParts(goal, candidate);
  if (goal.kind === 'box') return boxStyleParts(goal, candidate);
  return null; // An image has no style the grader can read; its place and size are judged in layout.
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

export function score(goal: PageSnapshot, candidate: PageSnapshot): GradeResult {
  const goalWords = goal.blocks.map((b) => (b.kind === 'text' ? words(b.text ?? '') : []));
  const candidateWords = candidate.blocks.map((b) => (b.kind === 'text' ? words(b.text ?? '') : []));
  const pairs = matchBlocks(goal.blocks, candidate.blocks, goalWords, candidateWords);
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

  // ---- layout and style, block by block ----
  // A matched pair counts at the larger of its two weights, so a faint goal
  // block matched by a bold candidate block (or the reverse) cannot hide a
  // difference anyone can see. Against itself both weights are equal. A pair
  // that is only partly sure counts as matched only that far; the rest of it
  // counts as a missing goal block plus an extra candidate block.
  let layoutSum = 0;
  let styleSum = 0;
  let matchedWeight = 0;
  let matchedGoalWeight = 0;
  let fadedExtra = 0;
  const goalMatched = new Set<number>();
  const candidateMatched = new Set<number>();
  const pairInfo: { pair: Pair; w: number; layout: number; abs: number; rel: number; style: StyleParts | null }[] = [];
  for (const pair of pairs) {
    const g = goal.blocks[pair.goal];
    const c = candidate.blocks[pair.candidate];
    const t = pair.trust;
    const w = Math.max(goalWeights[pair.goal], candidateWeights[pair.candidate]);
    matchedGoalWeight += t * goalWeights[pair.goal];
    const absolute = geometryCredit(g.rect, c.rect);
    const relative = geometryCredit(g.rect, c.rect, dx, dy);
    const layoutCredit = LAYOUT.absoluteShare * absolute + (1 - LAYOUT.absoluteShare) * relative;
    const parts = styleParts(g, c);
    layoutSum += t * w * layoutCredit;
    styleSum += t * w * styleCredit(parts);
    matchedWeight += t * w;
    fadedExtra += (1 - t) * candidateWeights[pair.candidate];
    goalMatched.add(pair.goal);
    candidateMatched.add(pair.candidate);
    pairInfo.push({ pair, w, layout: layoutCredit, abs: absolute, rel: relative, style: parts });
  }
  let extraWeight = 0;
  for (let c = 0; c < candidate.blocks.length; c++) {
    if (!candidateMatched.has(c)) extraWeight += candidateWeights[c];
  }
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
  const goalTexts = goalWords.filter((_, i) => goal.blocks[i].kind === 'text');
  const candidateTexts = candidateWords.filter((_, i) => candidate.blocks[i].kind === 'text');
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
  // A page that is right but sits a little low still looks right, so the
  // candidate is compared after sliding it back by the page-wide shift. That
  // forgiveness runs out exactly as position credit does: a small shift is
  // fully forgiven, a large one not at all.
  let visual = compareVisual(goal, candidate, dx, dy);
  const forgiven =
    fallingCredit(Math.abs(dx), TOL.position.full, TOL.position.zero) *
    fallingCredit(Math.abs(dy), TOL.position.full, TOL.position.zero);
  if (forgiven < 1) {
    const unshifted = compareVisual(goal, candidate, 0, 0);
    const mix = (a: number, b: number) => forgiven * a + (1 - forgiven) * b;
    visual = {
      score: mix(visual.score, unshifted.score),
      structure: mix(visual.structure, unshifted.structure),
      color: mix(visual.color, unshifted.color),
    };
  }

  // ---- total ----
  const parts: [number, number | null][] = [
    [WEIGHTS.content, content],
    [WEIGHTS.layout, layout],
    [WEIGHTS.style, style],
    [WEIGHTS.visual, visual.score],
  ];
  let weighted = 0;
  let weightSum = 0;
  for (const [w, value] of parts) {
    if (value === null) continue; // A goal with no text is not graded on text.
    weighted += w * value;
    weightSum += w;
  }
  const total = weightSum === 0 ? 0 : (weighted / weightSum) * 100;

  const breakdown: Breakdown = {
    content: content === null ? null : round1(content * 100),
    layout: round1(layout * 100),
    style: round1(style * 100),
    visual: round1(visual.score * 100),
  };

  // ---- feedback: the same arithmetic, entry by entry ----
  let feedback: Feedback[] = [];
  if (round1(total) < 100 && weightSum > 0) {
    const ledger = new Ledger();
    const scale = (w: number) => (100 * w) / weightSum;
    const F = { content: scale(WEIGHTS.content), layout: scale(WEIGHTS.layout), style: scale(WEIGHTS.style) };
    const goalUnmatched = goal.blocks.map((_, i) => i).filter((i) => !goalMatched.has(i));
    const candUnmatched = candidate.blocks.map((_, i) => i).filter((i) => !candidateMatched.has(i));

    // Layout and style.
    if (goalTotal === 0) {
      const share = candidateTotal > 0 ? (F.layout * (1 - layout)) / candidateTotal : 0;
      candidate.blocks.forEach((_, c) => ledger.add('extra', -1, c, share * candidateWeights[c], true));
      ledger.add('pageBackground', -1, -1, F.style * (1 - style), true);
    } else {
      const D = expectedTotal + MATCH.extraPenalty * extraWeight;
      const S = (1 - STYLE.pageBackgroundShare) / expectedTotal;
      const B = (STYLE.pageBackgroundShare * pageBackground) / expectedTotal; // per unit of missing goal weight
      for (const info of pairInfo) {
        const { pair, w } = info;
        const t = pair.trust;
        const g = goal.blocks[pair.goal];
        const c = candidate.blocks[pair.candidate];
        // Position versus size, inside both the absolute and the shifted geometry.
        const posAbs = positionCredit(g.rect, c.rect);
        const posRel = positionCredit(g.rect, c.rect, dx, dy);
        const size = sizeCredit(g.rect, c.rect);
        const posLoss =
          LAYOUT.positionShare * (LAYOUT.absoluteShare * (1 - posAbs) + (1 - LAYOUT.absoluteShare) * (1 - posRel));
        const sizeLoss = (1 - LAYOUT.positionShare) * (1 - size);
        // A block that kept an edge where the goal's is (left-aligned text in
        // a smaller font) has not moved: its centre moved because its size did.
        const keptEdge = (a0: number, a1: number, b0: number, b1: number) =>
          Math.abs(a0 - b0) <= TOL.position.full || Math.abs(a1 - b1) <= TOL.position.full;
        const sizeOnly =
          keptEdge(g.rect.x, g.rect.x + g.rect.w, c.rect.x - dx, c.rect.x + c.rect.w - dx) &&
          keptEdge(g.rect.y, g.rect.y + g.rect.h, c.rect.y - dy, c.rect.y + c.rect.h - dy) &&
          (g.rect.w !== c.rect.w || g.rect.h !== c.rect.h) &&
          dx === 0 &&
          dy === 0;
        ledger.add(sizeOnly ? 'size' : 'position', pair.goal, pair.candidate, (F.layout * t * w * posLoss) / D, true);
        ledger.add('size', pair.goal, pair.candidate, (F.layout * t * w * sizeLoss) / D, true);
        if (info.style) {
          for (const [k, part] of Object.entries(info.style)) {
            ledger.add(k as Topic, pair.goal, pair.candidate, F.style * S * t * w * part.weight * (1 - part.credit), true);
          }
        }
        // The unsure part of the pair counts as missing plus extra.
        const gw = goalWeights[pair.goal];
        const cw = candidateWeights[pair.candidate];
        const faded =
          (F.layout * (1 - t) * (gw + MATCH.extraPenalty * cw)) / D + F.style * (S + B) * (1 - t) * gw;
        ledger.add('words', pair.goal, pair.candidate, faded, true);
      }
      for (const g of goalUnmatched) {
        ledger.add('missing', g, -1, (F.layout * goalWeights[g]) / D + F.style * (S + B) * goalWeights[g], true);
      }
      for (const c of candUnmatched) {
        ledger.add('extra', -1, c, (F.layout * MATCH.extraPenalty * candidateWeights[c]) / D, true);
      }
      ledger.add('pageBackground', -1, -1, F.style * STYLE.pageBackgroundShare * (1 - pageBackground), true);
    }

    // Content: shared out by how many words (and word pairs) each thing gets wrong.
    if (content !== null && content < 1) {
      const loss = F.content * (1 - content);
      const diffs: { topic: Topic; goal: number; candidate: number; n: number }[] = [];
      for (const { pair } of pairInfo) {
        if (goal.blocks[pair.goal].kind !== 'text') continue;
        const n = wordDiff(goalWords[pair.goal], candidateWords[pair.candidate]);
        if (n > 0) diffs.push({ topic: 'words', goal: pair.goal, candidate: pair.candidate, n });
      }
      for (const g of goalUnmatched) {
        if (goal.blocks[g].kind === 'text') diffs.push({ topic: 'missing', goal: g, candidate: -1, n: 2 * goalWords[g].length });
      }
      for (const c of candUnmatched) {
        if (candidate.blocks[c].kind === 'text') {
          diffs.push({ topic: 'extra', goal: -1, candidate: c, n: 2 * candidateWords[c].length });
        }
      }
      const n = diffs.reduce((sum, d) => sum + d.n, 0);
      if (n === 0) ledger.add('order', -1, -1, loss, false);
      for (const d of diffs) ledger.add(d.topic, d.goal, d.candidate, (loss * d.n) / n, false);
    }

    // Visual: shared out in proportion to what layout and style found, since
    // that is what the eye sees. What they did not find is reported on its own.
    const visualLoss = scale(WEIGHTS.visual) * (1 - visual.score);
    const entries = ledger.list();
    const visibleSum = entries.reduce((sum, e) => sum + e.visible, 0);
    if (visualLoss > 0) {
      if (visibleSum > 0) for (const e of entries) e.points += (visualLoss * e.visible) / visibleSum;
      else entries.push({ topic: 'look', goal: -1, candidate: -1, points: visualLoss, visible: 0 });
    }
    feedback = describe(entries, { goal, candidate, dx, dy, pairs, goalWords, candidateWords });
  }

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
  };
}

/** Words and neighbouring-word pairs in one text but not the other, counted both ways. */
function wordDiff(a: string[], b: string[]): number {
  const diff = (x: string[], y: string[]) => {
    const counts = new Map<string, number>();
    for (const v of x) counts.set(v, (counts.get(v) ?? 0) + 1);
    let shared = 0;
    for (const v of y) {
      const left = counts.get(v) ?? 0;
      if (left > 0) {
        shared++;
        counts.set(v, left - 1);
      }
    }
    return x.length + y.length - 2 * shared;
  };
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

function inside(inner: Rect, outer: Rect): boolean {
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}

/** What a person would call a block: "the heading 'Pricing'", "the orange button 'Buy'", "the blue box near the top". */
function nameOf(page: PageSnapshot, index: number): { name: string; kind: string } {
  const block = page.blocks[index];
  const texts = page.blocks.filter((b) => b.kind === 'text');
  if (block.kind === 'text') {
    const sizes = texts.map((b) => b.textStyle!.fontSize);
    const typical = median(sizes);
    const fs = block.textStyle!.fontSize;
    const inButton = page.blocks.some((b) => b.kind === 'box' && isButton(page, b) && inside(block.rect, b.rect));
    if (inButton) return { name: `the button ${quote(block.text ?? '')}`, kind: 'button' };
    if (fs >= 1.4 * typical && fs >= 20) return { name: `the heading ${quote(block.text ?? '')}`, kind: 'heading' };
    return { name: `the text ${quote(block.text ?? '')}`, kind: 'text' };
  }
  if (block.kind === 'image') return { name: `the image near the ${where(block.rect, page)}`, kind: 'image' };
  const label = page.blocks
    .filter((b) => b.kind === 'text' && inside(b.rect, block.rect))
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)[0];
  const colour = colorName(block.boxStyle!.background);
  if (isButton(page, block) && label) return { name: `the button ${quote(label.text ?? '')}`, kind: 'button' };
  if (block.rect.w >= page.width * 0.9) return { name: `the ${colour} section near the ${where(block.rect, page)}`, kind: 'section' };
  if (label) return { name: `the box with ${quote(label.text ?? '')}`, kind: 'box' };
  return { name: `the ${colour} box near the ${where(block.rect, page)}`, kind: 'box' };
}

function isButton(page: PageSnapshot, box: Block): boolean {
  if (box.kind !== 'box' || box.rect.h > 80 || box.rect.w > 400) return false;
  const labels = page.blocks.filter((b) => b.kind === 'text' && inside(b.rect, box.rect));
  return labels.length === 1 && words(labels[0].text ?? '').length <= 5;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function colours(goal: RGB, candidate: RGB): string {
  const g = colorName(goal);
  const c = colorName(candidate);
  if (g !== c) return `is ${c} where the goal's is ${g}`;
  const dl = lightness(candidate) - lightness(goal);
  if (Math.abs(dl) >= 5) return `is a ${dl > 0 ? 'lighter' : 'darker'} ${g} than the goal's`;
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
  if (Math.abs(oy) >= TOL.position.full) {
    parts.push(`${pixels(Math.abs(oy))} too ${oy > 0 ? 'low' : 'high'}`);
    keys.push(`${oy > 0 ? 'd' : 'u'}${bucket(oy)}`);
  }
  if (Math.abs(ox) >= TOL.position.full) {
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
  const counts = new Map<string, number>();
  for (const v of b) counts.set(v, (counts.get(v) ?? 0) + 1);
  const out: string[] = [];
  for (const v of a) {
    const left = counts.get(v) ?? 0;
    if (left > 0) counts.set(v, left - 1);
    else if (!out.includes(v)) out.push(v);
  }
  return out;
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
      if (c!.kind === 'image') return { text: `An extra image near the ${where(c!.rect, candidate)} that the goal does not have` };
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
      if (o.key === 'x') return { text: `${subject} ${o.text}` };
      return { text: `${subject} sits ${o.text}`, group: `position:${o.key}` };
    }
    case 'size':
      return { text: `${subject} ${sizeWords(g!.rect, c!.rect)}` };
    case 'color':
      return { text: `${subject} ${colours(g!.textStyle!.color, c!.textStyle!.color)}` };
    case 'background':
      if (g!.kind === 'box') return { text: `${subject} ${colours(g!.boxStyle!.background, c!.boxStyle!.background)}` };
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
      return { text: `The corners of ${gName} are ${c!.boxStyle!.radius > g!.boxStyle!.radius ? 'more rounded' : 'sharper'} than the goal's` };
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

/** The costliest entries as sentences, most costly first. Entries that read the same are counted together. */
function describe(entries: Entry[], ctx: Context): Feedback[] {
  // Same thing wrong with several blocks in the same way ("sits 40 pixels
  // too low") reads as one item.
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
    } else merged.set(key, { text: s.text, points: e.points, count: 1, firstOrder: order, members: [e] });
  });
  const totalPairs = ctx.pairs.length;
  const out = [...merged.values()].map((m) => {
    let text = m.text;
    if (m.count > 1 && m.members[0].topic === 'position') {
      // A label inside a box that moved with it is part of that box.
      m.members = m.members.filter(
        (e) => !m.members.some((o) => o !== e && o.goal !== e.goal && ctx.goal.blocks[o.goal].kind === 'box' && inside(ctx.goal.blocks[e.goal].rect, ctx.goal.blocks[o.goal].rect)),
      );
      m.count = m.members.length;
      // Describe the group by its members' average offset.
      let ox = 0;
      let oy = 0;
      for (const e of m.members) {
        const o = offsetOf(ctx.goal.blocks[e.goal].rect, ctx.candidate.blocks[e.candidate].rect);
        ox += o.ox / m.count;
        oy += o.oy / m.count;
      }
      const tail = `sits ${offsetWords(ox, oy).text}`;
      const kinds = new Set(m.members.map((e) => nameOf(ctx.goal, e.goal).kind));
      const noun = kinds.size === 1 ? plural([...kinds][0]) : 'things';
      text = m.count >= 0.8 * totalPairs && totalPairs >= 3 ? `Everything ${tail}` : `${m.count} ${noun} ${tail.replace(/^sits/, 'sit')}`;
    }
    return { message: text, points: m.points, order: m.firstOrder };
  });
  out.sort((a, b) => b.points - a.points || a.order - b.order);
  return out
    .slice(0, MAX_FEEDBACK)
    .map((f) => ({ message: f.message, points: round1(f.points) }))
    .filter((f) => f.points > 0);
}

function plural(kind: string): string {
  return kind === 'box' ? 'boxes' : kind === 'text' ? 'pieces of text' : `${kind}s`;
}
