/**
 * Every tunable number in the grader lives here, so calibration against human
 * rankings changes one file. Changing any value changes scores: bump
 * GRADER_VERSION when you do, so stored scores can be told apart.
 */
export const GRADER_VERSION = '0.9.2';

/** Every page is rendered at exactly this size. */
export const VIEWPORT = { width: 1280, height: 800 } as const;

/** Pages taller than this are cut off; nothing below it is graded. */
export const MAX_PAGE_HEIGHT = 6000;

/** Input limits, so one submission cannot stall the grader. */
export const MAX_HTML_BYTES = 300_000;
export const MAX_BLOCKS = 1500;
export const RENDER_TIMEOUT_MS = 10_000;

/** How much each sub-score counts toward the total. */
export const WEIGHTS = {
  // The words carry more than the look: a page that looks right but says the
  // wrong thing is not what was asked for. Layout keeps its share.
  content: 0.35,
  layout: 0.3,
  style: 0.15,
  visual: 0.2,
} as const;

/**
 * Noticed faults: the second reading of a page. A person does not average
 * over the page; they notice distinct faults, and each costs about the same
 * on a short page as on a long one.
 *
 * Two classes. HARD faults are the ones a person minds whatever the page
 * looks like: a wrong text or number, a missing or extra part, a move to
 * another place, unreadable text, a picture of something else, or a change
 * that runs through the whole page (another palette, typeface or scale).
 * Each instance costs `unit` x its amount (notice x severity), the same
 * for the tenth as for the first, until the kind's total nears `cap`.
 * SOFT faults are honest slips (a size, a grey, a weight, a radius, a few
 * pixels of movement): each soft kind costs at most its own small `cap`,
 * and all of them together at most `softCap`.
 *
 * A kind's points: sum x unit, straight up to `knee` x cap, then levelling
 * off smoothly toward `cap`. Kinds of hard fault compound toward `ceiling`:
 * the largest costs in full, each further kind a share of what is left;
 * the soft total is one more such share. `share` says which
 * sub-scores a kind of fault shows up in; each sub-score never loses more
 * than `subCeiling` of itself through this reading.
 */
export const FAULTS = {
  ceiling: 70,
  /** Kinds level off from this share of their cap. */
  knee: 0.5,
  softCap: 15,
  subCeiling: 0.8,
  kinds: {
    words: { hard: true, unit: 8, cap: 60, share: { content: 1 } },
    missing: { hard: true, unit: 13, cap: 60, share: { layout: 0.5, content: 0.2, visual: 0.3 } },
    extra: { hard: true, unit: 14, cap: 55, share: { layout: 0.6, visual: 0.4 } },
    moved: { hard: true, unit: 25, cap: 45, share: { layout: 0.7, visual: 0.3 } },
    scale: { hard: true, unit: 18, cap: 30, share: { layout: 0.6, visual: 0.4 } },
    legibility: { hard: true, unit: 14, cap: 45, share: { style: 0.4, visual: 0.3, content: 0.3 } },
    picture: { hard: true, unit: 25, cap: 40, share: { visual: 0.6, content: 0.4 } },
    theme: { hard: true, unit: 1, cap: 30, share: { style: 0.6, visual: 0.4 } },
    nudge: { hard: false, unit: 10, cap: 4, share: { layout: 0.7, visual: 0.3 } },
    size: { hard: false, unit: 3, cap: 4, share: { layout: 0.7, visual: 0.3 } },
    colour: { hard: false, unit: 4, cap: 5, share: { style: 0.5, visual: 0.5 } },
    family: { hard: false, unit: 2, cap: 4, share: { style: 0.7, visual: 0.3 } },
    weight: { hard: false, unit: 1.5, cap: 3, share: { style: 1 } },
    fontSize: { hard: false, unit: 2, cap: 4, share: { style: 0.7, layout: 0.3 } },
    decoration: { hard: false, unit: 1, cap: 2, share: { style: 1 } },
    corners: { hard: false, unit: 1, cap: 2, share: { style: 1 } },
    border: { hard: false, unit: 1.5, cap: 3, share: { style: 1 } },
    shadow: { hard: false, unit: 1, cap: 2, share: { style: 1 } },
  },
  /** A whole-page change (most of the page's text or colour affected): points at full spread. */
  theme: { typeface: 12, palette: 15, textSize: 6, background: 15 },
  /** Share of the page (by notice) a style change must reach to start being a whole-page change, and to be one in full. */
  themeFrom: 0.3,
  themeFull: 0.7,
  /** Extra content as much again as the goal costs this many points (in proportion below that). */
  extraAgain: 50,
  /** Colour differences a person comparing side by side would not see (CIEDE2000): text, boxes. */
  textColourFrom: 8,
  boxColourFrom: 4,
  /** Moves up to this many pixels are a slip (soft); the rest of a move is hard. */
  nudgePx: 40,
  /** A move of d pixels has severity 1 - exp(-(d / moveScale) ^ movePower): 6 px is a trace, 80 px is plain, 300 px is total. */
  moveScale: 140,
  movePower: 1.4,
  /** Sideways moves break alignment and read as more wrong than the same move down. */
  sidewaysFactor: 1.3,
  /** A move caused by something missing, extra or resized above it is drift: charged at this fraction. */
  driftFactor: 0.15,
  /** Colour severity: (deltaE - colourFrom) / colourSpan, to the power colourPower, at most 1. */
  colourFrom: 1.5,
  colourSpan: 28,
  colourPower: 1.3,
  /** Two blocks belong to the same moved group when they sit this close in the goal and moved alike. */
  groupGap: 24,
  /** Moves up to this many pixels that several parts share are one spacing slip, charged once. */
  slipPx: 40,
  /** A missing or extra repeated set costs one item plus this much per further copy. */
  setExtra: 0.1,
} as const;

/**
 * Tolerances. Each pair is (full credit up to here, zero credit from here);
 * credit falls in a straight line in between.
 */
export const TOL = {
  /** Position of a block's centre, in pixels. */
  position: { full: 8, zero: 240 },
  /**
   * A page-wide shift is forgiven (in the screenshot comparison) only while
   * it is small: "the page sits a few pixels low". It fades out fast, so a
   * column that lost its centring is charged as the fault it is.
   */
  shiftForgive: { full: 4, zero: 80 },
  /** Corner radius difference in pixels: full credit up to here, none from here. */
  radiusPx: { full: 2, zero: 16 },
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
  text: { color: 0.3, background: 0.15, fontSize: 0.2, bold: 0.1, family: 0.15, decoration: 0.05, letterCase: 0.05 },
  box: { background: 0.5, border: 0.2, radius: 0.2, shadow: 0.1 },
  /** Pictures and drawings: the colours their pixels show. */
  image: { color: 1 },
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
