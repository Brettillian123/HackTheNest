/**
 * Every tunable number in the grader lives here, so calibration against human
 * rankings changes one file. Changing any value changes scores: bump
 * GRADER_VERSION when you do, so stored scores can be told apart.
 */
export const GRADER_VERSION = '0.6.0';

/** Every page is rendered at exactly this size. */
export const VIEWPORT = { width: 1280, height: 800 } as const;

/** Pages taller than this are cut off; nothing below it is graded. */
export const MAX_PAGE_HEIGHT = 2400;

/** Input limits, so one submission cannot stall the grader. */
export const MAX_HTML_BYTES = 300_000;
export const MAX_BLOCKS = 1500;
export const RENDER_TIMEOUT_MS = 10_000;

/** How much each sub-score counts toward the total. */
export const WEIGHTS = {
  content: 0.25,
  layout: 0.3,
  style: 0.2,
  visual: 0.25,
} as const;

/**
 * Tolerances. Each pair is (full credit up to here, zero credit from here);
 * credit falls in a straight line in between.
 */
export const TOL = {
  /** Position of a block's centre, in pixels. */
  position: { full: 8, zero: 240 },
  /** Size ratio (smaller / larger) of a block's width or height. */
  sizeRatio: { full: 0.9, zero: 0.4 },
  /** Colour difference, CIEDE2000. Under about 2 is invisible to most people. */
  color: { full: 3, zero: 35 },
  /** Font size ratio (smaller / larger). */
  fontRatio: { full: 0.92, zero: 0.5 },
  /** Corner radius, as a fraction of half the shorter side. */
  radius: { full: 0.1, zero: 0.6 },
  /** Border width ratio, (thinner + 1 px) / (thicker + 1 px): 1 px against 2 px is close, 1 px against 16 px is not. */
  borderWidthRatio: { full: 0.7, zero: 0.2 },
} as const;

/**
 * Content: single words say whether the right words are there; pairs of
 * neighbouring words say whether they are in the right order. Without the
 * pairs, "dog bites man" and "man bites dog" would score the same.
 */
export const CONTENT = {
  words: 0.6,
  wordPairs: 0.4,
} as const;

export const MATCH = {
  /**
   * Two text blocks are surely "the same text" from this similarity (word
   * overlap, or the share of one's neighbouring-word pairs found in the
   * other, so a paragraph cut short is still that paragraph). Below it the
   * pairing fades out smoothly, reaching nothing at `textFadeFrom`.
   */
  minTextSimilarity: 0.5,
  textFadeFrom: 0.3,
  /** A text needs this many neighbouring-word pairs before "cut short" can pair it. */
  minPairsForContainment: 2,
  /** Minimum combined similarity for two boxes or two images to pair up. */
  minBoxSimilarity: 0.4,
  /** Two boxes pair up only if their sizes are at least this alike (0 to 1). */
  minBoxSizeCredit: 0.25,
  minImageSimilarity: 0.3,
  /** How much an extra block in the candidate costs, relative to a missing one. */
  extraPenalty: 0.5,
} as const;

/**
 * How much a block's contrast with what is behind it (CIEDE2000) changes
 * its weight, as a multiple of its size. A block nobody can see counts
 * nothing, so there is no cliff where an invisible box suddenly counts:
 *   contrast <= `invisible`             -> 0
 *   `invisible` to `baseAt`             -> rises in a straight line to `base`
 *   `baseAt` to `fullAt`                -> rises in a straight line to 2 - `base`
 *   contrast >= `fullAt`                -> 2 - `base`
 * A box with a shadow counts as at least `baseAt`: the shadow shows even
 * when the fill does not. Images always count 2 - `base`.
 */
export const SALIENCE = {
  invisible: 2,
  baseAt: 6,
  base: 0.5,
  fullAt: 50,
} as const;

export const LAYOUT = {
  /** Share of the layout credit judged on absolute position and size. */
  absoluteShare: 0.5,
  /** Within one block: position versus size. */
  positionShare: 0.6,
} as const;

export const STYLE = {
  /** Share of the style score given to the page background colour. */
  pageBackgroundShare: 0.15,
  text: { color: 0.3, background: 0.2, fontSize: 0.2, bold: 0.1, family: 0.1, decoration: 0.05, letterCase: 0.05 },
  box: { background: 0.5, border: 0.2, radius: 0.2, shadow: 0.1 },
} as const;

export const VISUAL = {
  /** Screenshots are shrunk by this factor before structure is compared. */
  structureScale: 4,
  /** Window size and step, in shrunk pixels. */
  window: 8,
  step: 4,
  /** A window may slide this many shrunk pixels to find its best match. */
  shift: 2,
  /** Brightness variance above which a window counts as having content. */
  activeVariance: 6,
  /** A window's weight is its contrast (standard deviation of brightness), up to this. */
  contrastCap: 40,
  /** Screenshots are shrunk by this factor before colour is compared. */
  colorScale: 16,
  /** A cell this far (CIEDE2000) from the page background counts as foreground. */
  foregroundDelta: 4,
  /**
   * Weight of a cell that is plain background in both pages. Kept low so a
   * small card on a big empty page is judged on the card, not the emptiness.
   */
  backgroundWeight: 0.05,
} as const;
