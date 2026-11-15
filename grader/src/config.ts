/**
 * Every tunable number in the grader lives here, so calibration against human
 * rankings changes one file. Changing any value changes scores: bump
 * GRADER_VERSION when you do, so stored scores can be told apart.
 */
export const GRADER_VERSION = '0.3.0';

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
  /** Two text blocks are "the same text" only above this word overlap. */
  minTextSimilarity: 0.5,
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

/**
 * What a site's total is made of. A site has to work and be well built
 * before it has to be pretty: something good-looking that does not work is
 * useless.
 *
 *   works        - the right content, in the right structure, with working links
 *   engineering  - size and load time against the goal
 *   looks        - colours, fonts and the look of the screenshot
 *
 *   total = 100 x (works x W + looks x L + engineering x E x works) + bonus
 *
 * Engineering marks are earned only as far as the site works, so a blank
 * page gets nothing for being small and fast. `works` must stay at least
 * as large as `engineering`, or a negative engineering credit could push a
 * total below zero.
 */
export const SITE_WEIGHTS = {
  works: 0.4,
  engineering: 0.35,
  looks: 0.25,
} as const;

/** Within one page: how "works" and "looks" are built from the four parts. */
export const PAGE_PILLARS = {
  works: { content: 0.45, layout: 0.55 },
  looks: { style: 0.45, visual: 0.55 },
} as const;

/** Multi-page sites. */
export const SITE = {
  maxFiles: 40,
  maxTotalBytes: 1_500_000,
  /** At most this many goal pages are graded. */
  maxPages: 12,
  /** Total rendering time one submission may use, in milliseconds. A normal page takes under one second. */
  renderBudgetMs: 45_000,
  /** Share of the "works" score given to the links between pages, when the goal has any. */
  linkShare: 0.25,
  /**
   * A goal page with no same-named page in the submission is paired with
   * the submitted page that looks most like it, if that page scores at
   * least this. File names are not what a visitor sees.
   */
  pageMatchMinimum: 35,
} as const;

/**
 * Code quality: "space" is the size of the site, "time" is how long each
 * page would take to load on a few simulated devices. Nothing is timed for
 * real (a stopwatch gives a different answer every run); load time is
 * worked out from counts with the constants below, so it is the same every
 * time. The constants are stand-ins for hardware, chosen to be plausible,
 * not measured.
 */
export const PERF = {
  /**
   * Submission / goal ratio, for size and for each device's load time.
   * Full credit up to `full`; none at `zero`; past that the credit goes
   * negative and takes marks from the rest of the score, reaching -1 at
   * `worst`. A site several times heavier than it needs to be is not a
   * slightly worse answer, it is a bad one.
   */
  ratio: { full: 1.15, zero: 3, worst: 10 },
  /**
   * Bytes added to both sides before sizes are compared, so that on a tiny
   * site a few hundred bytes either way is not a large ratio.
   */
  slackBytes: 2048,
  /** A device check "passes" when the submission is within this factor of the goal. */
  passRatio: 2,
  /**
   * Most points a site can earn above 100. Only a site that matches the
   * goal exactly on every page and link, and is no bigger than the goal and
   * no slower on any device, can earn them, in proportion to how far under
   * the goal's size and load times it comes.
   */
  bonusMax: 20,
  /** Work a reference desktop does, before a device's slowdown is applied. */
  cost: {
    parseMsPerKb: 0.1,
    styleMsPerThousandMatches: 0.05,
    layoutMsPerElement: 0.02,
    paintMsPerMegapixel: 2,
  },
  /** Each device is one check, like a test case: different devices punish different waste. */
  devices: [
    { name: 'Budget phone on slow 3G', kbps: 400, roundTripMs: 400, cpuSlowdown: 6 },
    { name: 'Mid-range phone on 4G', kbps: 4000, roundTripMs: 150, cpuSlowdown: 4 },
    { name: 'Old laptop on home Wi-Fi', kbps: 20000, roundTripMs: 40, cpuSlowdown: 2.5 },
    { name: 'Desktop on fibre', kbps: 100000, roundTripMs: 10, cpuSlowdown: 1 },
  ],
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
