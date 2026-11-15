/**
 * How a site's measurements become its total. Measuring (site-grade.ts,
 * measureSite) gathers facts with no tunable number applied; this file is
 * the only place those facts and the tunable numbers meet. The numbers are
 * in site-params.json, so the fitting tool can write a fit there; their
 * bounds and meanings are below.
 *
 *   total = 100 x (0.30 works + 0.25 looks^lp + 0.45 engineering^ep x works) x broken-link factor + bonus
 *   (lp and ep depend on the reference page's block count: see sizePowerOf)
 *           at most the missing-page cap
 *
 * The three pillar weights, and engineering being the worst of efficiency,
 * accessibility and clean code, are fixed by the owner: never fitted.
 *
 * Properties the STRUCTURE keeps, for any values inside the bounds
 * (test/site-model.test.ts checks them over a grid of values):
 *   - a site against itself scores exactly 100;
 *   - a dead link never scores above the same link removed, or working;
 *   - deleting a built page, or making it unreachable, never raises the
 *     score, and an unreachable page never scores below no page at all;
 *   - more bytes or a slower load never raise the score.
 * How:
 *   - Every broken link counts one. A page that is missing or unreachable,
 *     with broken links aimed at it, has (1 - coveredLinkWeight) of one of
 *     them forgiven, because its own charge already tells the visitor finds
 *     nothing there. Forgiveness is at most one link per page, so making a
 *     link dead always adds at least coveredLinkWeight >= 0, and deleting a
 *     page whose links worked adds at least as much. (Was: "the first
 *     covered link counts differently from the rest".)
 *   - A dead link is worth nothing on its page: each page is MEASURED as it
 *     is and with its dead links' text taken out, and the model takes the
 *     lower. So a dead link can never score above that link removed. (Was:
 *     a re-score patched in after the total.)
 *   - A working link is worth what it leads to: 1 - linkFollowsContent x
 *     (1 - the target's own-content factor), between 0 and 1, so a working
 *     link is never worth less than a missing one. (Was: a fixed rule.)
 *   - An unreachable page keeps orphanCredit (< 1) of its marks and counts
 *     unreachablePageWeight (< 1) of a missing page against the cap; a page
 *     never built keeps nothing and counts one.
 *   - Efficiency only falls as a ratio rises (full < zero < worst by the
 *     bounds), and a blend of the mean and the worse of two falling things
 *     falls too.
 */
import type { Issue } from '../quality/types';
import { combineEfficiency, blendEfficiency, type EfficiencyMeasurement, type EfficiencyScore } from '../performance';
import { round1 } from '../util';
import paramsJson from './site-params.json';

// ---------------------------------------------------------------------------
// The fitting tool's shape, declared here so this object fits it structurally.
// ---------------------------------------------------------------------------

export interface FitParam {
  value: number;
  min: number;
  max: number;
  fixed?: boolean;
  meaning: string;
}

export interface FitModel<M> {
  domain: 'pages' | 'sites' | 'scenes';
  params: Record<string, FitParam>;
  /** Pull this model's measurements out of one attempt's result as the bench wrote it. */
  extract(result: unknown): M | null;
  /** Pure, deterministic. */
  score(measurements: M, values: Record<string, number>): number;
}

// ---------------------------------------------------------------------------
// Measurements: plain facts, no tunable number applied
// ---------------------------------------------------------------------------

/** One page's four parts against its goal page, 0 to 1. Content is null when neither page has text. */
export interface PageScores {
  content: number | null;
  layout: number;
  style: number;
  visual: number;
}

export interface SitePageMeasurement {
  goal: string;
  /** The submitted page that stands in for it, or null when none was built. */
  candidate: string | null;
  built: boolean;
  /** Built and reachable from the home page (a page the goal itself cannot reach counts as reachable). False when not built. */
  reachable: boolean;
  /** Words of the goal page's own content (not the header, menu and footer most pages share); 0 for a one-page goal. */
  ownWords: number;
  /** Share of that content found on the submitted page, 0 to 1; 1 when there is nothing to find. */
  ownShare: number;
  /** The page's parts as built; null when not built. */
  scores: PageScores | null;
  /** The same with the text of its dead links taken out; null when it has none. */
  scoresWithoutDeadLinks: PageScores | null;
  /** The page's own score, 0 to 100; null when not built. */
  pageTotal: number | null;
  /** Not built: share of the goal page's own words found on the reachable submitted pages (0 when it has fewer than five), and the page with most of them. */
  movedShare: number;
  movedTo: string | null;
}

export interface SiteQualityPage {
  goal: string;
  /** 0 to 1 each: credit against the goal page, from the faults listed. */
  accessibility: number;
  cleanCode: number;
  accessibilityIssues: Issue[];
  cleanCodeIssues: Issue[];
}

export interface SiteMeasurements {
  pages: SitePageMeasurement[];
  links: {
    /** Link uses on the goal's pages that lead to another goal page. */
    goalUses: number;
    /** Distinct page-to-page links in the goal, and how many work in the submission. */
    expected: number;
    found: number;
    /** For each working link, in goal order, the index of the goal page it leads to. */
    foundTo: number[];
    missing: number;
    /** Broken link uses on reachable pages not aimed at a missing or unreachable page. */
    broken: number;
    /** Per goal page: broken link uses aimed at it while it is missing or unreachable. */
    brokenCovered: number[];
    /** Dead links not charged because the goal's page has as many. */
    excused: number;
    /** Working links on reachable pages that no goal link asks for. */
    extra: number;
  };
  pagesNeverBuilt: string[];
  pagesUnreachable: string[];
  /** Blocks on the reference page (the mean over its pages); undefined counts as a small page. */
  referenceBlocks?: number;
  /** Size and each device's load time against the goal; null when no page could be compared. */
  efficiency: EfficiencyMeasurement | null;
  quality: {
    pages: SiteQualityPage[];
    /** Files no page uses or links to, beyond the goal's. */
    unusedFiles: string[];
    /** Stylesheets, images and fonts asked for that cannot load, beyond the goal's. */
    badReferences: string[];
    /** CSS rules that match nothing on any page, beyond the goal's count, and the file with most of them. */
    unusedStyles: { extra: number; file: string | null };
  };
  exact: {
    /** Every goal page built, reachable and scoring 100 on its own. */
    pagesPerfect: boolean;
    /** Every goal link works (or the goal has none). */
    linksComplete: boolean;
    /** No broken link at all, charged or covered. */
    noBrokenLinks: boolean;
  };
}

// ---------------------------------------------------------------------------
// The constants
// ---------------------------------------------------------------------------

type ParamSpec = Omit<FitParam, 'value'>;

const SPEC: Record<keyof typeof paramsJson, ParamSpec> = {
  // Owner, 2026-11-15: "engineering needs to be harder and weighted higher. And looks should be slightly less lenient".
  worksWeight: { min: 0.3, max: 0.3, fixed: true, meaning: 'Share of the total for a site that works (fixed by the owner).' },
  looksWeight: { min: 0.25, max: 0.25, fixed: true, meaning: 'Share of the total for how it looks (fixed by the owner).' },
  engineeringWeight: { min: 0.45, max: 0.45, fixed: true, meaning: 'Share of the total for engineering, earned as far as the site works (fixed by the owner).' },
  pageWorksContent: { min: 0.1, max: 0.8, meaning: "Within a page's works mark, the share for its words (the rest is layout: structure and arrangement, now that the wording is supplied)." },
  // The power on looks and engineering credit depends on the reference page's size: on a page with many blocks small
  // differences add up, so each must count for less (18 real runs judged by a person, 2026-11-15).
  looksPowerSmall: { min: 1, max: 3, meaning: 'Looks credit is raised to this power on a small reference page, so small visible differences cost a little more (owner: looks slightly less lenient).' },
  looksPowerLarge: { min: 0.1, max: 1, meaning: 'Looks credit is raised to this power on a large reference page, where many small differences add up.' },
  engineeringPowerSmall: { min: 1, max: 3, meaning: 'Engineering credit is raised to this power on a small reference page, so each accessibility, clean-code or efficiency fault costs more (owner: engineering harder).' },
  engineeringPowerLarge: { min: 0.1, max: 1, meaning: 'Engineering credit is raised to this power on a large reference page, where many small faults add up.' },
  smallPageBlocks: { min: 10, max: 50, meaning: 'Reference pages with this many blocks or fewer use the Small powers.' },
  largePageBlocks: { min: 60, max: 200, meaning: 'Reference pages with this many blocks or more use the Large powers; between the two the power moves in a straight line in log(blocks).' },
  pageLooksStyle: { min: 0.3, max: 0.6, meaning: "Within a page's looks mark, the share for colours and fonts (the rest is the screenshot)." },
  linkShare: { min: 0.1, max: 0.4, meaning: 'Share of the works mark for the links between pages.' },
  linkFollowsContent: { min: 0, max: 1, meaning: 'How far a working link is worth only what its target page carries of its own content.' },
  deadLinkPenalty: { min: 0.3, max: 0.8, meaning: 'Most of the total that broken links can take away.' },
  deadLinkScale: { min: 3, max: 30, meaning: 'Broken links it takes to reach 63% of that penalty.' },
  coveredLinkWeight: { min: 0, max: 0.5, meaning: 'What the first broken link aimed at a missing or unreachable page still counts (its page charge covers the rest of one).' },
  missingPagePoints: { min: 0, max: 80, meaning: 'Most points missing pages can cap off the total.' },
  missingPageScale: { min: 2, max: 8, meaning: 'Missing pages it takes to reach 63% of that cap.' },
  unreachablePageWeight: { min: 0.2, max: 0.9, meaning: 'How much of a missing page an unreachable page counts against the cap.' },
  ownContentFull: { min: 0.4, max: 0.8, meaning: "Share of a goal page's own content a page needs for full marks (the knee)." },
  ownContentFloor: { min: 0.1, max: 0.5, meaning: 'Share of its marks a page with none of its own content keeps.' },
  ownContentFewWords: { min: 0, max: 4, meaning: 'A goal page with this many own words or fewer is not judged on own content.' },
  ownContentManyWords: { min: 6, max: 20, meaning: 'A goal page with this many own words or more is fully judged on own content.' },
  orphanCredit: { min: 0.2, max: 0.6, meaning: 'Share of its marks an unreachable built page keeps.' },
  weakestPageDrag: { min: 0, max: 0.5, meaning: 'How far the weakest built page drags the average of the pages down.' },
  movedContentCredit: { min: 0.2, max: 0.7, meaning: 'Most of its works mark a goal page keeps when its content is on another page.' },
  movedContentMinimum: { min: 0.1, max: 0.4, meaning: "Share of a missing page's own words that must be found elsewhere to count as moved." },
  unusedFileWeight: { min: 0.4, max: 1.2, meaning: 'Most of the clean-code credit that files no page uses can cost.' },
  unusedFileScale: { min: 1, max: 8, meaning: 'Unused files it takes to reach 63% of that cost.' },
  unloadableReference: { min: 0.05, max: 0.2, meaning: 'Clean-code credit each file a page asks for that cannot load costs.' },
  unusedStyleWeight: { min: 0.1, max: 0.6, meaning: 'Most of the clean-code credit that CSS rules matching nothing can cost.' },
  unusedStyleScale: { min: 5, max: 30, meaning: 'Unused CSS rules it takes to reach 63% of that cost.' },
  ratioFull: { min: 1, max: 1.5, meaning: 'Size or load-time ratio to the goal still given full credit.' },
  ratioZero: { min: 2, max: 4, meaning: 'Ratio to the goal given no credit.' },
  ratioWorst: { min: 6, max: 20, meaning: 'Ratio to the goal at which credit reaches -1 (takes marks away).' },
  slackBytes: { min: 0, max: 8192, meaning: 'Bytes added to both sides before sizes are compared, so tiny sites are not judged on crumbs.' },
  efficiencyWorstBlend: { min: 0, max: 1, meaning: 'Efficiency is the mean of size and speed (0), the worse of the two (1), or between.' },
  bonusMax: { min: 10, max: 30, meaning: 'Most points above 100, for an exact match that is smaller and faster than the goal.' },
};

const PARAMS: Record<string, FitParam> = Object.fromEntries(
  Object.entries(SPEC).map(([name, spec]) => [name, { value: (paramsJson as Record<string, number>)[name], ...spec }]),
);

/** Today's values, from site-params.json. */
export function siteValues(): Record<string, number> {
  return { ...(paramsJson as Record<string, number>) };
}

// ---------------------------------------------------------------------------
// The combination
// ---------------------------------------------------------------------------

/** The total's inputs after the constants are applied: what feedback changes one at a time to price a fault. */
export interface Parts {
  /** Per goal page, 0 to 1: works and looks marks after any unreachable share or moved-content share. */
  works: number[];
  looks: number[];
  /** Per goal page: whether a page was built, and its own works and looks (0 to 1) before any share. */
  built: boolean[];
  ownWorks: number[];
  ownLooks: number[];
  /** Credit of the working links, and how many the goal has. */
  found: number;
  expected: number;
  /** Broken link uses not aimed at a missing or unreachable page. */
  deadCount: number;
  /** Per goal page: broken link uses aimed at it while it is missing or unreachable. */
  coveredFor: number[];
  orphaned: boolean[];
  /** Per goal page, how far it is missing for the cap: 1 never built (less moved content), unreachablePageWeight unreachable, 0 there. */
  absent: number[];
  /** -1 to 1: size and load time. */
  efficiency: number;
  /** 0 to 1 each: the mean over the compared pages. */
  accessibility: number;
  cleanCode: number;
  unusedFiles: number;
  badReferences: number;
  unusedStyles: number;
  /** Blocks on the reference page (mean over its pages); sets the looks and engineering powers. Undefined counts as small. */
  referenceBlocks?: number;
}

type V = Record<string, number>;

/** The broken-link factor for n broken link uses: 1 - penalty x (1 - e^(-n / scale)). */
export function deadFactorOf(n: number, v: V): number {
  return n <= 0 ? 1 : 1 - v.deadLinkPenalty * (1 - Math.exp(-n / v.deadLinkScale));
}

/** The most a site with m missing pages can score. */
export function missingPageCap(m: number, v: V): number {
  return m <= 0 ? Infinity : 100 - v.missingPagePoints * (1 - Math.exp(-m / v.missingPageScale));
}

/** Broken links as counted: every one counts 1; each missing or unreachable page with some aimed at it has (1 - coveredLinkWeight) of one forgiven. */
export function brokenCountOf(deadCount: number, coveredFor: number[], v: V): number {
  // Written as "the first aimed at the page counts coveredLinkWeight, the rest one each": the same number.
  return deadCount + coveredFor.reduce((a, k) => a + (k <= 0 ? 0 : v.coveredLinkWeight + (k - 1)), 0);
}

/**
 * The mean over the goal's pages, dragged down by the weakest built page:
 * x (1 - drag x (mean of the built pages' own marks - the worst one)).
 * Never lower than leaving that page out would give.
 */
export function draggedMean(values: number[], own: number[], built: boolean[], drag: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let count = 0;
  let sum = 0;
  let worst = -1;
  for (let i = 0; i < n; i++) {
    if (!built[i]) continue;
    count++;
    sum += own[i];
    if (worst < 0 || own[i] < own[worst]) worst = i;
  }
  if (count < 2) return mean;
  const d = drag * Math.max(0, sum / count - own[worst]);
  return Math.max(mean * (1 - d), mean - values[worst] / n);
}

export function worksCreditOf(p: Parts, v: V): number {
  const pagesWork = draggedMean(p.works, p.ownWorks, p.built, v.weakestPageDrag);
  return p.expected === 0 ? pagesWork : (1 - v.linkShare) * pagesWork + v.linkShare * (p.found / p.expected);
}

/**
 * The power for a reference page of `blocks` blocks: `small` at or below smallPageBlocks, `large` at or above
 * largePageBlocks, a straight line in log(blocks) between. Unknown size (undefined or not positive) counts as small.
 */
export function sizePowerOf(blocks: number | undefined, small: number, large: number, v: V): number {
  if (blocks === undefined || !(blocks > v.smallPageBlocks)) return small;
  if (blocks >= v.largePageBlocks) return large;
  const t = (Math.log(blocks) - Math.log(v.smallPageBlocks)) / (Math.log(v.largePageBlocks) - Math.log(v.smallPageBlocks));
  return small + t * (large - small);
}

export function looksPowerOf(blocks: number | undefined, v: V): number {
  return sizePowerOf(blocks, v.looksPowerSmall, v.looksPowerLarge, v);
}

export function engineeringPowerOf(blocks: number | undefined, v: V): number {
  return sizePowerOf(blocks, v.engineeringPowerSmall, v.engineeringPowerLarge, v);
}

export function looksCreditOf(p: Parts, v: V): number {
  return Math.pow(Math.max(0, draggedMean(p.looks, p.ownLooks, p.built, v.weakestPageDrag)), looksPowerOf(p.referenceBlocks, v));
}

/** Clean code: the pages' mean, times the site-wide faults. */
export function cleanCodeOf(p: Parts, v: V): number {
  const unused = Math.exp(-v.unusedFileWeight * (1 - Math.exp(-p.unusedFiles / v.unusedFileScale)));
  const refs = Math.max(0, 1 - v.unloadableReference * p.badReferences);
  const styles = Math.exp(-v.unusedStyleWeight * (1 - Math.exp(-p.unusedStyles / v.unusedStyleScale)));
  return p.cleanCode * unused * refs * styles;
}

/** Engineering: the worst of the three (fixed by the owner). */
export function engineeringOf(p: Parts, v: V): number {
  const e = Math.min(p.efficiency, p.accessibility, cleanCodeOf(p, v));
  // Steeper for each fault (owner: "engineering needs to be harder"); a negative efficiency credit is kept as it is.
  return e > 0 ? Math.pow(e, engineeringPowerOf(p.referenceBlocks, v)) : e;
}

export function deadLinkFactorOf(p: Parts, v: V): number {
  return deadFactorOf(brokenCountOf(p.deadCount, p.coveredFor, v), v);
}

/** The total before the bonus, unrounded. */
export function totalOfParts(p: Parts, v: V): number {
  const works = worksCreditOf(p, v);
  // Engineering marks are earned only as far as the site works.
  const base = 100 * (v.worksWeight * works + v.looksWeight * looksCreditOf(p, v) + v.engineeringWeight * engineeringOf(p, v) * works);
  return Math.min(Math.max(0, base) * deadLinkFactorOf(p, v), missingPageCap(p.absent.reduce((a, b) => a + b, 0), v));
}

/** What a page keeps of its marks for the own content it carries: 1 - weight x (1 - floor) x (1 - min(1, share / full)). */
export function ownFactorOf(page: SitePageMeasurement, v: V): { share: number; factor: number } {
  const weight = Math.min(1, Math.max(0, (page.ownWords - v.ownContentFewWords) / (v.ownContentManyWords - v.ownContentFewWords)));
  if (!(weight > 0)) return { share: 1, factor: 1 };
  return { share: page.ownShare, factor: 1 - weight * (1 - v.ownContentFloor) * (1 - Math.min(1, page.ownShare / v.ownContentFull)) };
}

function pillarsOf(s: PageScores, v: V): { works: number; looks: number } {
  return {
    works: s.content === null ? s.layout : v.pageWorksContent * s.content + (1 - v.pageWorksContent) * s.layout,
    looks: v.pageLooksStyle * s.style + (1 - v.pageLooksStyle) * s.visual,
  };
}

export function efficiencyOf(m: EfficiencyMeasurement, v: V): EfficiencyScore {
  return combineEfficiency(m, {
    ratio: { full: v.ratioFull, zero: v.ratioZero, worst: v.ratioWorst },
    slackBytes: v.slackBytes,
    worstBlend: v.efficiencyWorstBlend,
  });
}

/** Efficiency with one side put right (credit 1), for pricing a fault. */
export function efficiencyWith(e: EfficiencyScore, fix: 'space' | 'time', v: V): number {
  return blendEfficiency(fix === 'space' ? 1 : e.spaceCredit, fix === 'time' ? 1 : e.timeCredit, v.efficiencyWorstBlend);
}

export interface SiteCombination {
  parts: Parts;
  /** Per goal page: own content share and the factor it leaves, whether its content counts as moved, its own works and looks (0 to 1). */
  content: { share: number; factor: number }[];
  moved: boolean[];
  own: { works: number; looks: number }[];
  efficiency: EfficiencyScore | null;
  before: number;
  engineering: number;
  cleanCode: number;
  deadLinkFactor: number;
  exactMatch: boolean;
  bonus: number;
  /** One decimal place. */
  total: number;
}


/** Everything the total is made of, from the measurements and the values. Pure. */
export function combineSite(m: SiteMeasurements, v: V): SiteCombination {
  const content = m.pages.map((p) => (p.built ? ownFactorOf(p, v) : { share: 1, factor: 1 }));
  const moved = m.pages.map((p) => !p.built && p.movedTo !== null && p.movedShare >= v.movedContentMinimum);
  const own = m.pages.map((p, i) => {
    if (!p.scores) return { works: 0, looks: 0 };
    const f = content[i].factor;
    const o = pillarsOf(p.scores, v);
    let works = o.works * f;
    let looks = o.looks * f;
    if (p.scoresWithoutDeadLinks) {
      const w = pillarsOf(p.scoresWithoutDeadLinks, v);
      works = Math.min(works, w.works * f);
      looks = Math.min(looks, w.looks * f);
    }
    return { works, looks };
  });
  const shareOf = (i: number) => (m.pages[i].built && !m.pages[i].reachable ? v.orphanCredit : 1);
  let found = 0;
  for (const t of m.links.foundTo) found += 1 - v.linkFollowsContent * (1 - content[t].factor);
  const efficiency = m.efficiency ? efficiencyOf(m.efficiency, v) : null;
  const meanOf = (pick: (q: SiteQualityPage) => number) =>
    m.quality.pages.length === 0 ? 1 : m.quality.pages.reduce((sum, q) => sum + pick(q), 0) / m.quality.pages.length;
  const parts: Parts = {
    works: own.map((o, i) => (moved[i] ? v.movedContentCredit * m.pages[i].movedShare : shareOf(i) * o.works)),
    looks: own.map((o, i) => shareOf(i) * o.looks),
    built: m.pages.map((p) => p.built),
    ownWorks: own.map((o) => o.works),
    ownLooks: own.map((o) => o.looks),
    found,
    expected: m.links.expected,
    deadCount: m.links.broken,
    coveredFor: [...m.links.brokenCovered],
    orphaned: m.pages.map((p) => p.built && !p.reachable),
    absent: m.pages.map((p, i) =>
      !p.built ? 1 - (moved[i] ? v.movedContentCredit * p.movedShare : 0) : !p.reachable ? v.unreachablePageWeight : 0,
    ),
    efficiency: efficiency?.credit ?? 0,
    accessibility: meanOf((q) => q.accessibility),
    cleanCode: meanOf((q) => q.cleanCode),
    unusedFiles: m.quality.unusedFiles.length,
    badReferences: m.quality.badReferences.length,
    unusedStyles: m.quality.unusedStyles.extra,
    referenceBlocks: m.referenceBlocks,
  };
  const before = totalOfParts(parts, v);
  const cleanCode = cleanCodeOf(parts, v);
  const exactMatch =
    m.pages.length > 0 &&
    m.exact.pagesPerfect &&
    content.every((c) => c.factor >= 1 || round1(100 * c.factor) === 100) &&
    m.exact.linksComplete &&
    m.exact.noBrokenLinks;
  const bonus =
    exactMatch && efficiency?.beatsGoal && parts.accessibility === 1 && cleanCode === 1 ? v.bonusMax * efficiency.saving : 0;
  return {
    parts,
    content,
    moved,
    own,
    efficiency,
    before,
    engineering: engineeringOf(parts, v),
    cleanCode,
    deadLinkFactor: deadLinkFactorOf(parts, v),
    exactMatch,
    bonus,
    total: round1(before + bonus),
  };
}

function isMeasurements(x: unknown): x is SiteMeasurements {
  return !!x && typeof x === 'object' && Array.isArray((x as SiteMeasurements).pages) && typeof (x as SiteMeasurements).links === 'object';
}

export const sitesModel: FitModel<SiteMeasurements> = {
  domain: 'sites',
  params: PARAMS,
  extract(result: unknown): SiteMeasurements | null {
    if (!result || typeof result !== 'object') return null;
    const r = result as { measurements?: unknown; result?: { measurements?: unknown } };
    if (isMeasurements(r.measurements)) return r.measurements;
    if (r.result && isMeasurements(r.result.measurements)) return r.result.measurements;
    return null;
  },
  score(measurements: SiteMeasurements, values: Record<string, number>): number {
    return combineSite(measurements, values).total;
  },
};
