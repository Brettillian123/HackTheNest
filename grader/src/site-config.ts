/**
 * Tunable numbers for multi-page sites. The single-page numbers are in
 * config.ts. Changing any value changes scores: bump GRADER_VERSION in
 * config.ts when you do, so stored scores can be told apart.
 *
 * The numbers that combine a site's measurements into its total live in
 * criteria/site-params.json (written by the fitting tool, bounds and
 * meanings in criteria/site-model.ts); the copies below are read from it so
 * there is one source. Everything else here is about measuring.
 */
import P from './criteria/site-params.json';

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
  works: P.worksWeight,
  engineering: P.engineeringWeight,
  looks: P.looksWeight,
} as const;

/** Within one page: how "works" and "looks" are built from the four parts. */
export const PAGE_PILLARS = {
  // "Works" leans on the words: an unstyled page with every word right
  // still works for a visitor; where things sit is mostly a look problem.
  works: { content: P.pageWorksContent, layout: 1 - P.pageWorksContent },
  looks: { style: P.pageLooksStyle, visual: 1 - P.pageLooksStyle },
} as const;

/** Multi-page sites. */
export const SITE = {
  maxFiles: 40,
  maxTotalBytes: 1_500_000,
  /**
   * At most this many goal pages are graded; a goal with more is an error
   * for the challenge author. A submission may have twice as many.
   */
  maxPages: 20,
  /** Total rendering time one submission may use, in milliseconds. A normal page takes under one second. */
  renderBudgetMs: 45_000,
  /** Share of the "works" score given to the links between pages, when the goal has any. */
  linkShare: P.linkShare,
  /**
   * A goal page with no same-named page in the submission is paired with
   * the submitted page that looks most like it, if that page scores at
   * least this. File names are not what a visitor sees.
   */
  pageMatchMinimum: 35,
  /**
   * Broken links cost the whole score: the total before the bonus is
   * multiplied by 1 - deadLinkPenalty x (1 - e^(-n / deadLinkScale)), where
   * n is the number of broken link uses on the reachable pages. Every use
   * counts: twelve product cards that all lead nowhere are twelve broken
   * links. One dead link costs the same on a small site and a large one:
   * about 7% for one, 13% for two, 24% for four, 38% for eight, never more
   * than deadLinkPenalty. Working links are easy to ask for in a prompt, so
   * leaving them broken is the player's fault.
   */
  deadLinkPenalty: P.deadLinkPenalty,
  deadLinkScale: P.deadLinkScale,
  /**
   * Of the broken links meant for a page that was never built or cannot be
   * reached, one counts as this much of a broken link in n above (the page's
   * own charge covers most of it, but the visitor still hits a dead end);
   * the others count in full. Charging fewer would let a dead link score
   * above a working one next to it, or deleting the page score above
   * building it.
   */
  coveredLinkWeight: P.coveredLinkWeight,
  /**
   * A missing page is a fault whatever the size of the site. The total is at
   * most 100 - missingPageCap.points x (1 - e^(-m / missingPageCap.scale)),
   * where m counts each page never built as 1 (less the share of its
   * content found on other pages x movedContentCredit) and each page built
   * but unreachable as missingPageCap.unreachable. About 13 points for one
   * missing page, 24 for two, 8 for one unreachable page.
   */
  missingPageCap: { points: P.missingPagePoints, scale: P.missingPageScale, unreachable: P.unreachablePageWeight },
  /**
   * A page has to carry its own content: its own words are those of three
   * letters or more that at most half of the goal's pages have (the header,
   * menu and footer every page shares are not a page's own). A paired page's
   * works and looks marks are multiplied by
   *   1 - (1 - floor) x (1 - min(1, share / full))
   * where share is the part of the goal page's own words found on it, or,
   * if more, its own words (those at most half the submission's pages have)
   * as a share of the goal page's count: the content put in other words. A goal
   * page with `fewWords` own words or fewer is not judged on this, and one
   * with `manyWords` or more fully; in between, in proportion.
   */
  ownContent: { full: P.ownContentFull, floor: P.ownContentFloor, fewWords: P.ownContentFewWords, manyWords: P.ownContentManyWords },
  /**
   * A page that was built but cannot be reached from the home page by
   * following links keeps this share of its works and looks marks. A page
   * that was never built keeps none.
   */
  orphanCredit: P.orphanCredit,
  /**
   * The weakest page drags the site: after averaging, works and looks are
   * multiplied by 1 - weakestPageDrag x (mean of the built pages - the worst
   * built page), both 0 to 1. Never by more than leaving that page out
   * would cost.
   */
  weakestPageDrag: P.weakestPageDrag,
  /**
   * A goal page with no page of its own in the submission, whose words are
   * found on the submission's other pages, keeps up to this share of its
   * works marks, in proportion to the share of its own words found.
   */
  movedContentCredit: P.movedContentCredit,
  /**
   * A goal page is paired with a differently named submitted page when the
   * visitor's evidence says it is the same page: the label of the links
   * that lead to it, its title, its main heading, its file name (0 to 1).
   * At or above this it may be paired however different it looks.
   */
  pairIdentityMinimum: 0.45,
  /**
   * A goal page whose own words (those no other goal page has) are found,
   * at least this share of them, on one submitted page that has more of
   * them than of any other goal page's, is paired with it however it looks.
   */
  pairContentMinimum: 0.15,
  /** Below this, a pair that only looks alike is refused: a sibling built from the same template is not the same page. */
  pairIdentityContradiction: 0.15,
  /**
   * Clean-code faults of the site as a whole, as factors on the clean-code
   * credit. A file no page loads or links to: the first costs about a fifth
   * of the credit, more cost less each (cost = weight x (1 - e^(-n/scale)),
   * credit x e^-cost). A stylesheet, image or font a page asks for that is
   * not in the site, or is at an outside address: each distinct one costs a
   * tenth of the credit, down to zero. Nothing the goal does itself is charged.
   */
  unusedFile: { weight: P.unusedFileWeight, scale: P.unusedFileScale },
  unloadableReference: P.unloadableReference,
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
  ratio: { full: P.ratioFull, zero: P.ratioZero, worst: P.ratioWorst },
  /**
   * Bytes added to both sides before sizes are compared, so that on a tiny
   * site a few hundred bytes either way is not a large ratio.
   */
  slackBytes: P.slackBytes,
  /** A device check "passes" when the submission is within this factor of the goal. */
  passRatio: 2,
  /** Files a browser fetches at the same time: the files a page asks for cost one round trip per batch of this many. */
  parallelRequests: 6,
  /**
   * Most points a site can earn above 100. Only a site that matches the
   * goal exactly on every page and link, and is no bigger than the goal and
   * no slower on any device, can earn them, in proportion to how far under
   * the goal's size and load times it comes.
   */
  bonusMax: P.bonusMax,
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
