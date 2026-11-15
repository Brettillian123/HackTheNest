/**
 * Tunable numbers for multi-page sites. The single-page numbers are in
 * config.ts. Changing any value changes scores: bump GRADER_VERSION in
 * config.ts when you do, so stored scores can be told apart.
 */

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
  /**
   * Dead links cost the whole score: the total before the bonus is
   * multiplied by 1 - deadLinkPenalty x (dead links on the reachable pages
   * / links on the goal's reachable pages, at most 1). The goal's count is
   * used so that extra working links cannot water dead ones down. As many
   * dead links as the goal has are 40% off. Working links are easy
   * to ask for in a prompt, so leaving them broken is the player's fault.
   */
  deadLinkPenalty: 0.4,
  /**
   * A page that was built but cannot be reached from the home page by
   * following links keeps this share of its works and looks marks. A page
   * that was never built keeps none.
   */
  orphanCredit: 0.5,
  /**
   * Pages of one site rendered at the same time. Each page gets its own
   * browser context, so this changes how fast a grade is, never its score.
   * Kept small: the grader shares the machine.
   */
  renderConcurrency: 3,
  /** At most this many lines of feedback are given for a site. */
  feedbackMax: 8,
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
