import { colorDistance } from './color';
import { GRADER_VERSION, LAYOUT, MATCH, MAX_PAGE_HEIGHT, SALIENCE, STYLE, TOL, WEIGHTS } from './config';
import type { Block, Breakdown, GradeResult, PageSnapshot, RGB, Rect } from './types';
import { fallingCredit, median, risingCredit, round1, wordOverlap, words } from './util';
import { compareVisual } from './visual';

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
 */

interface Pair {
  goal: number;
  candidate: number;
}

/**
 * How much a block counts. Bigger blocks matter more, but not in proportion:
 * a headline should not drown out a button. And things that stand out from
 * what is behind them matter more than things that blend in: a bright
 * button is noticed before a faint card outline.
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
  }
  const standsOut = SALIENCE.base + (1 - SALIENCE.base) * 2 * Math.min(1, contrast / SALIENCE.fullAt);
  return Math.sqrt(w * h) * standsOut;
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

/** 0 to 1: how close one rectangle is to another in place and size, after removing a page-wide shift. */
function geometryCredit(goal: Rect, candidate: Rect, dx = 0, dy = 0): number {
  const offX = Math.abs(candidate.x + candidate.w / 2 - dx - (goal.x + goal.w / 2));
  const offY = Math.abs(candidate.y + candidate.h / 2 - dy - (goal.y + goal.h / 2));
  const position =
    fallingCredit(offX, TOL.position.full, TOL.position.zero) *
    fallingCredit(offY, TOL.position.full, TOL.position.zero);
  return LAYOUT.positionShare * position + (1 - LAYOUT.positionShare) * sizeCredit(goal, candidate);
}

function colorCredit(a: RGB, b: RGB): number {
  return fallingCredit(colorDistance(a, b), TOL.color.full, TOL.color.zero);
}

/**
 * Pairs each goal block with the candidate block that is most plausibly
 * "the same thing". Text pairs mainly by its words, boxes and images by
 * where they are and what colour they are. Best pairs are taken first; ties
 * are broken by position in the list, so the pairing never varies.
 */
function matchBlocks(goal: Block[], candidate: Block[]): Pair[] {
  const options: { similarity: number; goal: number; candidate: number }[] = [];
  const goalWords = goal.map((b) => (b.kind === 'text' ? words(b.text ?? '') : []));
  const candidateWords = candidate.map((b) => (b.kind === 'text' ? words(b.text ?? '') : []));

  for (let g = 0; g < goal.length; g++) {
    const gb = goal[g];
    for (let c = 0; c < candidate.length; c++) {
      const cb = candidate[c];
      if (gb.kind !== cb.kind) continue;
      const geometry = geometryCredit(gb.rect, cb.rect);
      let similarity: number;
      if (gb.kind === 'text') {
        const text = wordOverlap(goalWords[g], candidateWords[c]);
        if (text < MATCH.minTextSimilarity) continue;
        similarity = 0.75 * text + 0.25 * geometry;
      } else if (gb.kind === 'box') {
        // A box of a wildly different size is not "the same box", whatever
        // its colour: a matching dot must not stand in for a matching panel.
        if (sizeCredit(gb.rect, cb.rect) < MATCH.minBoxSizeCredit) continue;
        const color = colorCredit(gb.boxStyle!.background, cb.boxStyle!.background);
        similarity = 0.6 * geometry + 0.4 * color;
        if (similarity < MATCH.minBoxSimilarity) continue;
      } else {
        similarity = geometry;
        if (similarity < MATCH.minImageSimilarity) continue;
      }
      options.push({ similarity, goal: g, candidate: c });
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
    pairs.push({ goal: option.goal, candidate: option.candidate });
  }
  pairs.sort((a, b) => a.goal - b.goal);
  return pairs;
}

function textStyleCredit(goal: Block, candidate: Block): number {
  const g = goal.textStyle!;
  const c = candidate.textStyle!;
  const w = STYLE.text;
  const sameWords = (goal.text ?? '').toLowerCase() === (candidate.text ?? '').toLowerCase();
  const caseOk = !sameWords || goal.text === candidate.text;
  return (
    w.color * colorCredit(g.color, c.color) +
    w.background * colorCredit(goal.behind, candidate.behind) +
    w.fontSize * risingCredit(sizeRatioExact(g.fontSize, c.fontSize), TOL.fontRatio.full, TOL.fontRatio.zero) +
    w.bold * (g.bold === c.bold ? 1 : 0) +
    w.family * (g.fontClass === c.fontClass ? 1 : 0) +
    w.decoration * ((g.italic === c.italic ? 0.5 : 0) + (g.underline === c.underline ? 0.5 : 0)) +
    w.letterCase * (caseOk ? 1 : 0)
  );
}

function sizeRatioExact(a: number, b: number): number {
  const larger = Math.max(a, b);
  return larger <= 0 ? 1 : Math.min(a, b) / larger;
}

function boxStyleCredit(goal: Block, candidate: Block): number {
  const g = goal.boxStyle!;
  const c = candidate.boxStyle!;
  const w = STYLE.box;
  let border: number;
  if (!g.hasBorder && !c.hasBorder) border = 1;
  else if (g.hasBorder && c.hasBorder) {
    border = 0.5 + 0.5 * (g.borderColor && c.borderColor ? colorCredit(g.borderColor, c.borderColor) : 1);
  } else border = 0;
  return (
    w.background * colorCredit(g.background, c.background) +
    w.border * border +
    w.radius * fallingCredit(Math.abs(g.radius - c.radius), TOL.radius.full, TOL.radius.zero) +
    w.shadow * (g.shadow === c.shadow ? 1 : 0)
  );
}

function styleCredit(goal: Block, candidate: Block): number {
  if (goal.kind === 'text') return textStyleCredit(goal, candidate);
  if (goal.kind === 'box') return boxStyleCredit(goal, candidate);
  return 1; // An image has no style the grader can read; its place and size are judged in layout.
}

function clip(text: string): string {
  return text.length > 60 ? text.slice(0, 57) + '...' : text;
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

export function score(goal: PageSnapshot, candidate: PageSnapshot): GradeResult {
  const pairs = matchBlocks(goal.blocks, candidate.blocks);
  const goalWeights = goal.blocks.map((b) => importance(b, goal.width));
  const candidateWeights = candidate.blocks.map((b) => importance(b, candidate.width));
  const goalTotal = goalWeights.reduce((sum, w) => sum + w, 0);

  // How far the whole candidate page sits from the goal: the middle value
  // of every matched block's shift, in whole pixels.
  const dx = Math.round(
    median(
      pairs.map((p) => {
        const g = goal.blocks[p.goal].rect;
        const c = candidate.blocks[p.candidate].rect;
        return c.x + c.w / 2 - (g.x + g.w / 2);
      }),
    ),
  );
  const dy = Math.round(
    median(
      pairs.map((p) => {
        const g = goal.blocks[p.goal].rect;
        const c = candidate.blocks[p.candidate].rect;
        return c.y + c.h / 2 - (g.y + g.h / 2);
      }),
    ),
  );

  // ---- layout and style, block by block ----
  let layoutSum = 0;
  let styleSum = 0;
  let matchedWeight = 0;
  const goalMatched = new Set<number>();
  const candidateMatched = new Set<number>();
  for (const pair of pairs) {
    const g = goal.blocks[pair.goal];
    const c = candidate.blocks[pair.candidate];
    const w = goalWeights[pair.goal];
    const absolute = geometryCredit(g.rect, c.rect);
    const relative = geometryCredit(g.rect, c.rect, dx, dy);
    layoutSum += w * (LAYOUT.absoluteShare * absolute + (1 - LAYOUT.absoluteShare) * relative);
    styleSum += w * styleCredit(g, c);
    matchedWeight += w;
    goalMatched.add(pair.goal);
    candidateMatched.add(pair.candidate);
  }
  let extraWeight = 0;
  for (let c = 0; c < candidate.blocks.length; c++) {
    if (!candidateMatched.has(c)) extraWeight += candidateWeights[c];
  }

  const pageBackground = colorCredit(goal.pageBackground, candidate.pageBackground);
  let layout: number;
  let style: number;
  if (goalTotal === 0) {
    // The goal is an empty page: anything on the candidate is wrong.
    layout = candidate.blocks.length === 0 ? 1 : 0;
    style = pageBackground;
  } else {
    layout = layoutSum / (goalTotal + MATCH.extraPenalty * extraWeight);
    // Credit for the page background is earned only as far as the page's
    // content is there, so an empty page gets nothing for being white.
    const coverage = matchedWeight / goalTotal;
    style =
      (1 - STYLE.pageBackgroundShare) * (styleSum / goalTotal) +
      STYLE.pageBackgroundShare * pageBackground * coverage;
  }

  // ---- content: every word on the page, as a bag ----
  const goalWords = goal.blocks.flatMap((b) => (b.kind === 'text' ? words(b.text ?? '') : []));
  const candidateWords = candidate.blocks.flatMap((b) => (b.kind === 'text' ? words(b.text ?? '') : []));
  const content = goalWords.length === 0 ? null : wordOverlap(goalWords, candidateWords);

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
  };
}
