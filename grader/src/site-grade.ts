import { GRADER_VERSION, VIEWPORT } from './config';
import { PAGE_PILLARS, PERF, SITE, SITE_WEIGHTS } from './site-config';
import { scoreEfficiency, type Efficiency, type EfficiencyScore, type PageStats } from './performance';
import { isTimeout, type PageQuality, type Renderer } from './render';
import { accessibilityIssues, compareIssues, scoreQuality, validityIssues, type QualityResult } from './quality/index';
import { ACCESSIBILITY_RULES, VALIDITY_RULES } from './quality/config';
import type { Issue } from './quality/types';
import { score } from './score';
import { linkTarget, normalizeFiles, pagesOf, type SiteFiles } from './site';
import { GraderInputError, type GradeResult, type PageSnapshot } from './types';
import { round1 } from './util';

/**
 * Grades a whole site: every page against the goal's page, the links
 * between pages, and how heavy the site is.
 *
 *   works        = right content, right structure, working links   (0 to 1)
 *   looks        = colours, fonts, the look of the screenshots       (0 to 1)
 *   engineering  = the worst of three credits, each against the goal's:  (-1 to 1)
 *                    size and estimated load time (-1 to 1), accessibility
 *                    (0 to 1) and clean code (0 to 1)
 *
 *   total = 100 x (0.40 works + 0.25 looks + 0.35 engineering x works) + bonus
 *
 * Like a coding judge, speed and size count for nothing unless the answer
 * is right, and an answer far over the limits is marked down hard. A site
 * that matches the goal exactly, has no accessibility or clean-code
 * problems the goal does not have, and beats the goal on size and speed
 * scores above 100. The weights are SITE_WEIGHTS in site-config.ts.
 *
 * Accessibility and clean code are worked out per compared pair of pages
 * (src/quality) and averaged over the pairs; the worst of the three
 * engineering credits is the one that counts.
 *
 * The goal is the reference solution: a submission is never charged for a
 * fault the goal has too. A dead link the goal also has, a page the goal
 * itself leaves unreachable, files the goal asks for from outside, files
 * the goal carries but never loads: none of these cost anything, so a site
 * graded against itself always scores exactly 100.
 *
 * A visitor gets around a site by following its links from the home page,
 * so two link faults cost a lot, because both are easy to ask for in a
 * prompt:
 *
 *   - A page nobody can reach keeps only half its marks. If a goal page can
 *     be reached from the goal's home page, its submitted page must be
 *     reachable from the submission's home page too, by visible links, any
 *     number of steps; if not, it keeps SITE.orphanCredit of its works and
 *     looks, its links count for nothing, and its size is not compared. A
 *     page that was never built keeps nothing.
 *   - Dead links take up to 40% off the total: the total before the bonus
 *     is multiplied by 1 - SITE.deadLinkPenalty x (dead links on the
 *     reachable pages / links on the goal's reachable pages, at most 1),
 *     not counting dead links the goal has too.
 */

export interface RenderedPage {
  path: string;
  snapshot: PageSnapshot;
  stats: PageStats;
  /** Facts for the accessibility and clean-code checks; missing or partly null if they could not be gathered. */
  quality?: PageQuality;
  /** Other files of the site this page links to. */
  linksTo: string[];
}

/** A site that has been checked and rendered. Prepare a goal once and reuse it. */
export class PreparedSite {
  private byPath: Map<string, RenderedPage> | null = null;
  private wordSets = new Map<string, Set<string>>();
  /** Facts that depend only on this site, worked out once (a prepared goal is graded many times). */
  facts: SiteFacts | null = null;

  constructor(
    readonly files: Map<string, string>,
    readonly pages: RenderedPage[],
  ) {}

  page(path: string): RenderedPage | undefined {
    this.byPath ??= new Map(this.pages.map((p) => [p.path, p]));
    return this.byPath.get(path);
  }

  /** The words a visitor can read on a page, lower-cased. */
  words(page: RenderedPage): Set<string> {
    let set = this.wordSets.get(page.path);
    if (!set) {
      set = new Set<string>();
      for (const block of page.snapshot.blocks) {
        if (block.kind !== 'text' || !block.text) continue;
        for (const word of block.text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (word) set.add(word);
      }
      this.wordSets.set(page.path, set);
    }
    return set;
  }
}

interface SiteFacts {
  home: string | undefined;
  /** Pages reachable from the site's own home page. */
  reach: Set<string>;
  /** Per page, the links that lead to a file the site does not contain. */
  dead: Map<string, string[]>;
  /** Bytes of the files no rendered page loads. */
  unusedBytes: number;
  /** Links on the pages reachable from the home page, counting each page's distinct targets once. */
  links: number;
}

function factsOf(site: PreparedSite): SiteFacts {
  if (site.facts) return site.facts;
  const home = homeOf(site);
  const dead = new Map<string, string[]>();
  const used = new Set<string>();
  for (const p of site.pages) {
    dead.set(p.path, p.linksTo.filter((t) => !site.files.has(t)));
    for (const file of p.stats.files) used.add(file);
  }
  let unusedBytes = 0;
  for (const [path, text] of site.files) if (!used.has(path)) unusedBytes += Buffer.byteLength(text, 'utf8');
  const reach = reachableFrom(site, home);
  let links = 0;
  for (const path of reach) links += site.page(path)!.linksTo.length;
  site.facts = { home, reach, dead, unusedBytes, links };
  return site.facts;
}

/** One thing that cost the site points, in plain words. */
export interface FeedbackItem {
  message: string;
  /** Roughly how many points of the total it cost, one decimal place. */
  points: number;
}

export interface SitePageResult {
  /** The goal page. */
  goal: string;
  /** The submitted page it was compared with, or null if the submission has no such page. */
  candidate: string | null;
  /** 0 to 100; 0 when the page is missing, the page's own total x SITE.orphanCredit when it is orphaned. */
  total: number;
  /** The page's own comparison with the goal page; kept for an orphaned page, so the player can see the page itself. */
  result: GradeResult | null;
  /**
   * Set (true) when the submitted page exists but cannot be reached from the
   * home page by following links. It then keeps SITE.orphanCredit of its marks.
   */
  orphaned?: boolean;
}

export interface SiteLinks {
  /** 0 to 100, or null when the goal's pages do not link to each other. */
  score: number | null;
  /** Links between pages in the goal, and how many of them the submission has. */
  expected: number;
  found: number;
  /** Goal links the submission lacks, as "from -> to" in the goal's file names. */
  missing: string[];
  /** Links on the reachable submitted pages that lead to a file the submission does not contain, and that the goal does not have either. */
  broken: string[];
  /** Dead links that are not charged because the goal's matching page has as many dead links of its own. */
  excused: string[];
  /** Submitted pages that match a reachable goal page but that no link leads to from the home page. */
  orphaned: string[];
  /** What the total before the bonus was multiplied by for dead links: 1 when there are none, down to 1 - SITE.deadLinkPenalty. */
  deadLinkFactor: number;
}

export interface SitePillars {
  /** 0 to 100: the right content, in the right structure, with working links. */
  works: number;
  /** -100 to 100: the worst of the three engineering credits (see SiteEngineering). Negative means far heavier than the goal. */
  engineering: number;
  /** 0 to 100: colours, fonts and the look of the screenshots. */
  looks: number;
}

/** The three engineering credits, each x100, one decimal. The lowest one is `pillars.engineering`. */
export interface SiteEngineering {
  /** -100 to 100: size and estimated load time against the goal (0 when no page could be compared). */
  efficiency: number;
  /** 0 to 100: accessibility problems the goal does not have, averaged over the compared pages. */
  accessibility: number;
  /** 0 to 100: badly written HTML the goal does not have, averaged over the compared pages. */
  cleanCode: number;
  /** Which credit was the lowest and so decided the engineering pillar (the first of them on a tie). */
  decidedBy: 'efficiency' | 'accessibility' | 'cleanCode';
}

export interface SiteGradeResult {
  version: string;
  /**
   * The leaderboard score, one decimal place. 0 to 100 for most sites; up
   * to 100 + the bonus for a site that matches the goal exactly and is
   * smaller and faster than it.
   */
  total: number;
  pillars: SitePillars;
  /**
   * Points earned above 100 for beating the goal on size and speed, both.
   * 0 unless every page and link matches exactly and the site is no bigger
   * than the goal and no slower on any device.
   */
  bonus: number;
  /** True when every page scores 100 and is reachable, every link is present, and no link is dead: the condition for the bonus. */
  exactMatch: boolean;
  /** The three engineering credits and which one decided; null when the submission could not be graded. */
  engineering: SiteEngineering | null;
  /** Size and estimated load time against the goal; null when no page could be compared. */
  efficiency: Efficiency | null;
  pages: SitePageResult[];
  links: SiteLinks;
  /**
   * What cost the most points, most costly first, at most SITE.feedbackMax.
   * Each line's points are what the total would gain if that one thing were
   * put right, worked out with the same arithmetic as the total. Empty for
   * a site that scores 100 or more.
   */
  feedback: FeedbackItem[];
  /** Set only when the submission could not be graded at all; the total is then 0. */
  error?: string;
}

export interface SiteGradeOutput {
  result: SiteGradeResult;
  /** The submission as rendered; each page's `snapshot.png` is its screenshot. Null if it could not be read. */
  candidate: PreparedSite | null;
}

function distinctTargets(links: string[], from: string): string[] {
  const seen = new Set<string>();
  for (const href of links) {
    const target = linkTarget(href, from);
    if (target !== null) seen.add(target);
  }
  return [...seen].sort();
}

/**
 * Checks and renders a site. With `strict`, a page that will not render is
 * an error (a broken goal); without it, the page is left out (a submission
 * is simply missing that page). Pages render SITE.renderConcurrency at a
 * time, each in its own browser context; the order of the result never
 * depends on which finishes first.
 */
export async function prepareSite(renderer: Renderer, files: SiteFiles, strict: boolean): Promise<PreparedSite> {
  const map = normalizeFiles(files);
  const limit = strict ? SITE.maxPages : SITE.maxPages * 2;
  const paths = pagesOf(map).slice(0, limit);
  const slots: (RenderedPage | null)[] = paths.map(() => null);
  const deadline = Date.now() + SITE.renderBudgetMs;
  let next = 0;
  let fatal: unknown = null;

  const worker = async () => {
    while (next < paths.length && fatal === null) {
      // A submission gets a fixed amount of rendering time in all. Pages it
      // does not get to count as missing. An ordinary site uses a small
      // fraction of it; only a site built to stall the grader runs out.
      if (!strict && Date.now() > deadline) return;
      const index = next++;
      const path = paths[index];
      let rendered: { snapshot: PageSnapshot; stats: PageStats; quality: PageQuality } | null = null;
      let failure: unknown = null;
      // Twice, because a render can fail through no fault of the page: see
      // Grader.grade. A page that timed out is not given a second go.
      for (let attempt = 0; attempt < 2 && !rendered; attempt++) {
        try {
          rendered = await renderer.renderSitePage(map, path);
        } catch (error) {
          failure = error;
          if (error instanceof GraderInputError || isTimeout(error)) break;
        }
      }
      if (!rendered) {
        if (strict) fatal = failure instanceof Error ? failure : new Error(`Page "${path}" could not be rendered.`);
        continue;
      }
      slots[index] = { path, ...rendered, linksTo: distinctTargets(rendered.stats.links, path) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(SITE.renderConcurrency, paths.length) }, worker));
  if (fatal !== null) throw fatal;
  return new PreparedSite(
    map,
    slots.filter((p): p is RenderedPage => p !== null),
  );
}

/**
 * The site's home page: index.html if it has one, which is what a visitor
 * arriving at the site gets. Without one there is no fixed way in, so the
 * home page is the page from which a visitor can reach the most pages,
 * then the one most pages link to, then the first by name. Picking simply
 * the first by name would make "about.html" the home page of a site whose
 * home is "start.html", and charge a submission for links it was never
 * asked to have.
 */
function homeOf(site: PreparedSite): string | undefined {
  if (site.page('index.html')) return 'index.html';
  const incoming = new Map<string, number>();
  for (const p of site.pages) for (const t of p.linksTo) incoming.set(t, (incoming.get(t) ?? 0) + 1);
  let best: { path: string; reach: number; incoming: number } | undefined;
  for (const p of site.pages) {
    const option = { path: p.path, reach: reachableFrom(site, p.path).size, incoming: incoming.get(p.path) ?? 0 };
    if (!best || option.reach > best.reach || (option.reach === best.reach && option.incoming > best.incoming)) best = option;
  }
  return best?.path;
}

/**
 * The pages a visitor can get to: the home page and every page reached from
 * it by following visible links through the site's pages, any number of steps.
 */
function reachableFrom(site: PreparedSite, home: string | undefined): Set<string> {
  const seen = new Set<string>();
  if (home === undefined || !site.page(home)) return seen;
  const queue = [home];
  seen.add(home);
  while (queue.length > 0) {
    const page = site.page(queue.shift()!)!;
    for (const target of page.linksTo) {
      if (seen.has(target) || !site.page(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return seen;
}

function failed(goal: PreparedSite, reason: string): SiteGradeResult {
  return {
    version: GRADER_VERSION,
    total: 0,
    pillars: { works: 0, engineering: 0, looks: 0 },
    bonus: 0,
    exactMatch: false,
    engineering: null,
    efficiency: null,
    pages: goal.pages.map((p) => ({ goal: p.path, candidate: null, total: 0, result: null })),
    links: { score: null, expected: 0, found: 0, missing: [], broken: [], excused: [], orphaned: [], deadLinkFactor: 1 },
    feedback: [{ message: `The site could not be graded: ${reason}`, points: 100 }],
    error: reason,
  };
}

// ---------------------------------------------------------------------------
// Pairing goal pages with submitted pages
// ---------------------------------------------------------------------------

/** Share of words two pages have in common (0 to 1). Cheap; used only to decide which pairs are worth comparing. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}

/**
 * Best assignment of rows to columns: the largest total weight, each row
 * and column used at most once (the Hungarian method). Returns, per row,
 * its column or -1. Deterministic for the same weights.
 */
function bestAssignment(weights: number[][]): number[] {
  const rows = weights.length;
  const cols = rows === 0 ? 0 : weights[0].length;
  if (rows === 0 || cols === 0) return weights.map(() => -1);
  if (rows > cols) {
    const flipped = Array.from({ length: cols }, (_, j) => weights.map((row) => row[j]));
    const byCol = bestAssignment(flipped);
    const out = weights.map(() => -1);
    byCol.forEach((row, col) => {
      if (row >= 0) out[row] = col;
    });
    return out;
  }
  const n = rows;
  const m = cols;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Number.POSITIVE_INFINITY;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = -weights[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] !== 0) out[p[j] - 1] = j - 1;
  return out;
}

/**
 * Pairs each goal page with at most one submitted page.
 *
 * A visitor does not see file names, so the pairing that makes the pages
 * look most like the goal's, summed over the site, wins. A page with the
 * goal page's name is always a candidate, at any score, and wins ties; any
 * other pairing must score at least SITE.pageMatchMinimum. The one fixed
 * pair is the home page: a visitor arriving at the site gets index.html,
 * so when goal and submission both have one they are paired.
 *
 * Comparing two pages is slow, so a same-named pair is only questioned
 * when another page shares more of its words: that is what a site whose
 * pages were given each other's names looks like.
 */
function pairPages(goal: PreparedSite, candidate: PreparedSite): Map<string, { page: RenderedPage; result: GradeResult }> {
  const G = goal.pages;
  const C = candidate.pages;
  const paired = new Map<string, { page: RenderedPage; result: GradeResult }>();
  const cache = new Map<string, GradeResult>();
  const compare = (gi: number, ci: number): GradeResult => {
    const key = `${gi}:${ci}`;
    let r = cache.get(key);
    if (!r) {
      r = score(G[gi].snapshot, C[ci].snapshot);
      cache.set(key, r);
    }
    return r;
  };

  // Same names: exactly first, then ignoring case.
  const nameOf = new Map<number, number>();
  const ownerOf = new Map<number, number>();
  for (const exact of [true, false]) {
    G.forEach((g, gi) => {
      if (nameOf.has(gi)) return;
      const ci = C.findIndex(
        (c, i) => !ownerOf.has(i) && (exact ? c.path === g.path : c.path.toLowerCase() === g.path.toLowerCase()),
      );
      if (ci >= 0) {
        nameOf.set(gi, ci);
        ownerOf.set(ci, gi);
      }
    });
  }

  // The home page is fixed.
  let pinnedG = -1;
  let pinnedC = -1;
  if (factsOf(goal).home === 'index.html') {
    const gi = G.findIndex((g) => g.path === 'index.html');
    const ci = C.findIndex((c) => c.path === 'index.html');
    if (gi >= 0 && ci >= 0) {
      pinnedG = gi;
      pinnedC = ci;
      paired.set(G[gi].path, { page: C[ci], result: compare(gi, ci) });
    }
  }

  const weights: number[][] = G.map(() => C.map(() => 0));
  const allowed: boolean[][] = G.map(() => C.map(() => false));
  G.forEach((g, gi) => {
    if (gi === pinnedG) return;
    const own = nameOf.get(gi);
    C.forEach((c, ci) => {
      if (ci === pinnedC) return;
      // A tiny, fixed tie-break: earlier pages first, so the pairing never varies.
      const order = 1e-9 * (gi * C.length + ci);
      if (own === ci) {
        weights[gi][ci] = compare(gi, ci).total + 0.001 - order;
        allowed[gi][ci] = true;
        return;
      }
      const owner = ownerOf.get(ci);
      let worthComparing = own === undefined && owner === undefined;
      if (!worthComparing) {
        const shared = overlap(goal.words(g), candidate.words(c));
        worthComparing =
          (own !== undefined && shared > overlap(goal.words(g), candidate.words(C[own]))) ||
          (owner !== undefined && shared > overlap(goal.words(G[owner]), candidate.words(c)));
      }
      if (!worthComparing) return;
      const total = compare(gi, ci).total;
      if (total < SITE.pageMatchMinimum) return;
      weights[gi][ci] = total - order;
      allowed[gi][ci] = true;
    });
  });
  bestAssignment(weights).forEach((ci, gi) => {
    if (ci >= 0 && allowed[gi][ci]) paired.set(G[gi].path, { page: C[ci], result: compare(gi, ci) });
  });
  return paired;
}

// ---------------------------------------------------------------------------
// The total, as a function of its parts (also used to price each fault)
// ---------------------------------------------------------------------------

interface Parts {
  /** Per goal page, 0 to 1: its works and looks marks, after any orphan share. */
  works: number[];
  looks: number[];
  found: number;
  expected: number;
  deadLinkFactor: number;
  /** -1 to 1: size and load time. */
  efficiency: number;
  /** 0 to 1 each: the mean over the compared pages. */
  accessibility: number;
  cleanCode: number;
}

/** The engineering credit: the worst of the three. */
function engineeringOf(p: Parts): number {
  return Math.min(p.efficiency, p.accessibility, p.cleanCode);
}

const NO_ISSUES = { credit: 1, issues: [] as Issue[] };

/**
 * Accessibility and clean-code credit of a submitted page against its goal
 * page. A part whose facts could not be gathered on either page counts as
 * having no problems the goal does not have.
 */
function pageQuality(goal: RenderedPage, candidate: RenderedPage): QualityResult {
  const g = goal.quality;
  const c = candidate.quality;
  if (g?.dom && g.source && c?.dom && c.source) {
    return scoreQuality({ dom: c.dom, source: c.source }, { dom: g.dom, source: g.source }, candidate.snapshot, goal.snapshot);
  }
  return {
    accessibility:
      g?.dom && c?.dom
        ? compareIssues(accessibilityIssues(c.dom, candidate.snapshot), accessibilityIssues(g.dom, goal.snapshot), ACCESSIBILITY_RULES)
        : NO_ISSUES,
    validity: g?.source && c?.source ? compareIssues(validityIssues(c.source), validityIssues(g.source), VALIDITY_RULES) : NO_ISSUES,
  };
}

function worksCreditOf(p: Parts): number {
  const n = p.works.length;
  const pagesWork = n === 0 ? 0 : p.works.reduce((a, b) => a + b, 0) / n;
  // A site whose links do not work does not work, however good each page is.
  return p.expected === 0 ? pagesWork : (1 - SITE.linkShare) * pagesWork + SITE.linkShare * (p.found / p.expected);
}

function looksCreditOf(p: Parts): number {
  const n = p.looks.length;
  return n === 0 ? 0 : p.looks.reduce((a, b) => a + b, 0) / n;
}

/** The total before the bonus, unrounded. */
function totalOf(p: Parts): number {
  const works = worksCreditOf(p);
  // Engineering marks are earned only as far as the site works: being small
  // and fast is worth nothing if it is not the site that was asked for. A
  // negative engineering credit (a site several times too heavy) takes
  // marks away, again in proportion.
  const base =
    100 * (SITE_WEIGHTS.works * works + SITE_WEIGHTS.looks * looksCreditOf(p) + SITE_WEIGHTS.engineering * engineeringOf(p) * works);
  // A visitor who follows a dead link finds nothing: the whole total pays for it.
  return Math.max(0, base) * p.deadLinkFactor;
}

function pagePillars(b: GradeResult['breakdown']): { works: number; looks: number } {
  const { works, looks } = PAGE_PILLARS;
  return {
    works: (b.content === null ? b.layout : works.content * b.content + works.layout * b.layout) / 100,
    looks: (looks.style * b.style + looks.visual * b.visual) / 100,
  };
}

/** Scores a rendered submission against a rendered goal. Pure arithmetic: no browser involved. */
export function scoreSite(goal: PreparedSite, candidate: PreparedSite): SiteGradeResult {
  const paired = pairPages(goal, candidate);
  const goalOf = new Map<string, string>();
  for (const [g, { page }] of paired) goalOf.set(page.path, g);

  // ---- reachability: a page nobody can get to is not there for a visitor ----
  const goalFacts = factsOf(goal);
  const candidateFacts = factsOf(candidate);
  const goalHome = goalFacts.home;
  const goalReach = goalFacts.reach;
  const candidateReach = reachableFrom(candidate, (goalHome && paired.get(goalHome)?.page.path) ?? candidateFacts.home);
  const orphanedGoals = new Set<string>();
  for (const g of goal.pages) {
    const match = paired.get(g.path);
    if (match && goalReach.has(g.path) && !candidateReach.has(match.page.path)) orphanedGoals.add(g.path);
  }
  // The pairs whose links and size count: an orphaned page's links cannot be
  // followed, and it is left out of the efficiency comparison.
  const live = new Map([...paired].filter(([g]) => !orphanedGoals.has(g)));

  const pages: SitePageResult[] = goal.pages.map((g) => {
    const match = paired.get(g.path);
    if (!match) return { goal: g.path, candidate: null, total: 0, result: null };
    if (orphanedGoals.has(g.path)) {
      const total = round1(match.result.total * SITE.orphanCredit);
      return { goal: g.path, candidate: match.page.path, total, result: match.result, orphaned: true };
    }
    return { goal: g.path, candidate: match.page.path, total: match.result.total, result: match.result };
  });
  // Each page's four parts, regrouped: does it work (content, layout) and
  // does it look right (style, visual). A missing page scores 0 on both; an
  // orphaned page keeps SITE.orphanCredit of what it would have scored.
  const own = pages.map((p) => (p.result ? pagePillars(p.result.breakdown) : { works: 0, looks: 0 }));
  const shareOf = (i: number) => (pages[i].orphaned ? SITE.orphanCredit : 1);

  // ---- links between pages ----
  const goalPaths = new Set(goal.pages.map((p) => p.path));
  let expected = 0;
  let found = 0;
  const missingLinks: { from: string; to: string }[] = [];
  for (const g of goal.pages) {
    for (const target of g.linksTo) {
      if (!goalPaths.has(target)) continue;
      expected++;
      // A link on a page nobody can open cannot be followed.
      const from = live.get(g.path)?.page;
      const to = live.get(target)?.page;
      if (from && to && from.linksTo.includes(to.path)) found++;
      else missingLinks.push({ from: g.path, to: target });
    }
  }

  // Dead links: on every reachable submitted page, links to a file the
  // submission does not contain. A page matched to a goal page that has dead
  // links of its own may have as many without charge.
  const broken: string[] = [];
  const excused: string[] = [];
  for (const page of candidate.pages) {
    if (!candidateReach.has(page.path)) continue;
    const dead = candidateFacts.dead.get(page.path) ?? [];
    const g = goalOf.get(page.path);
    const goalDead = g === undefined ? [] : (goalFacts.dead.get(g) ?? []);
    // Dead links the goal has by the same name are excused first.
    const ordered = [...dead.filter((t) => goalDead.includes(t)), ...dead.filter((t) => !goalDead.includes(t))];
    ordered.forEach((target, i) => (i < goalDead.length ? excused : broken).push(`${page.path} -> ${target}`));
  }
  broken.sort();
  excused.sort();
  // The share is out of the links the goal's reachable pages have, not the
  // submission's: otherwise padding a site with extra working links (or an
  // extra page full of them) would water its dead links down.
  const deadShare = broken.length === 0 ? 0 : Math.min(1, broken.length / Math.max(1, goalFacts.links));
  const deadLinkFactor = 1 - SITE.deadLinkPenalty * deadShare;

  // ---- engineering: size and estimated load time, against the goal ----
  // The goal's size is that of the files its compared pages load, plus the
  // files it carries that no page loads: those are the goal's own choice.
  let efficiency: EfficiencyScore | null = null;
  const pairs: { candidate: PageStats; goal: PageStats }[] = [];
  let bytes = 0;
  let referenceBytes = 0;
  if (live.size > 0) {
    const goalFilesUsed = new Set<string>();
    for (const g of goal.pages) {
      const match = live.get(g.path);
      if (!match) continue;
      pairs.push({ candidate: match.page.stats, goal: g.stats });
      for (const file of g.stats.files) goalFilesUsed.add(file);
    }
    for (const text of candidate.files.values()) bytes += Buffer.byteLength(text, 'utf8');
    for (const file of goalFilesUsed) referenceBytes += Buffer.byteLength(goal.files.get(file) ?? '', 'utf8');
    referenceBytes += goalFacts.unusedBytes;
    efficiency = scoreEfficiency(pairs, VIEWPORT.width, bytes, referenceBytes);
  }

  // ---- engineering: accessibility and clean code, page by page, against the goal ----
  const quality: { goal: string; result: QualityResult }[] = [];
  for (const g of goal.pages) {
    const match = live.get(g.path);
    if (match) quality.push({ goal: g.path, result: pageQuality(g, match.page) });
  }
  const meanOf = (pick: (q: QualityResult) => number) =>
    quality.length === 0 ? 1 : quality.reduce((sum, q) => sum + pick(q.result), 0) / quality.length;

  const parts: Parts = {
    works: own.map((o, i) => shareOf(i) * o.works),
    looks: own.map((o, i) => shareOf(i) * o.looks),
    found,
    expected,
    deadLinkFactor,
    efficiency: efficiency?.credit ?? 0,
    accessibility: meanOf((q) => q.accessibility.credit),
    cleanCode: meanOf((q) => q.validity.credit),
  };
  const before = totalOf(parts);
  const engineering = engineeringOf(parts);
  const decidedBy: SiteEngineering['decidedBy'] =
    parts.efficiency === engineering ? 'efficiency' : parts.accessibility === engineering ? 'accessibility' : 'cleanCode';

  // Above 100: only for a site that matches the goal exactly, has no
  // accessibility or clean-code problem the goal does not have, and is no
  // worse than it on size or on any device, then in proportion to how far
  // under the goal's size and load times it comes.
  const exactMatch =
    pages.length > 0 &&
    pages.every((p) => p.total === 100 && !p.orphaned) &&
    (expected === 0 || found === expected) &&
    broken.length === 0;
  const bonus =
    exactMatch && efficiency?.beatsGoal && parts.accessibility === 1 && parts.cleanCode === 1
      ? PERF.bonusMax * efficiency.saving
      : 0;
  const total = round1(before + bonus);

  const feedback =
    total >= 100
      ? []
      : buildFeedback({
          goal,
          candidate,
          pages,
          own,
          parts,
          before,
          missingLinks,
          broken,
          efficiency,
          pairs,
          bytes,
          referenceBytes,
          quality,
          unpairedCandidates: candidate.pages.filter((c) => !goalOf.has(c.path)).length,
        });

  return {
    version: GRADER_VERSION,
    total,
    pillars: {
      works: round1(worksCreditOf(parts) * 100),
      engineering: round1(engineering * 100),
      looks: round1(looksCreditOf(parts) * 100),
    },
    bonus: round1(bonus),
    exactMatch,
    engineering: {
      efficiency: round1(parts.efficiency * 100),
      accessibility: round1(parts.accessibility * 100),
      cleanCode: round1(parts.cleanCode * 100),
      decidedBy,
    },
    efficiency: efficiency ? efficiency.report : null,
    pages,
    links: {
      score: expected === 0 ? null : round1((found / expected) * 100),
      expected,
      found,
      missing: missingLinks.map((l) => `${l.from} -> ${l.to}`),
      broken,
      excused,
      orphaned: goal.pages.filter((g) => orphanedGoals.has(g.path)).map((g) => paired.get(g.path)!.page.path).sort(),
      deadLinkFactor,
    },
    feedback,
  };
}

// ---------------------------------------------------------------------------
// Feedback: what cost the most, in plain words
// ---------------------------------------------------------------------------

/** "pricing.html" -> "pricing", "index.html" -> "home", "docs/index.html" -> "docs", "about-us.html" -> "about us". */
export function pageName(path: string): string {
  const parts = path.split('/');
  let base = parts.pop()!.replace(/\.html?$/i, '');
  if (base.toLowerCase() === 'index') base = parts.length > 0 ? parts[parts.length - 1] : 'home';
  return base.replace(/[-_]+/g, ' ').trim() || path;
}

const times = (ratio: number) => (ratio < 1.95 ? ratio.toFixed(1) : String(Math.round(ratio)));
const listOf = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** The per-page feedback another part of the grader may attach to a page result; read defensively. */
function pageFeedbackOf(result: GradeResult): FeedbackItem[] {
  const raw = (result as unknown as { feedback?: unknown }).feedback;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is FeedbackItem =>
      !!f &&
      typeof (f as FeedbackItem).message === 'string' &&
      typeof (f as FeedbackItem).points === 'number' &&
      Number.isFinite((f as FeedbackItem).points) &&
      (f as FeedbackItem).points > 0,
  );
}

/** A short description of what is most wrong with a page, from its four parts, for when it has no feedback of its own. */
function describePage(b: GradeResult['breakdown']): string {
  const parts: [number, string][] = [
    [b.content ?? 100, 'the text differs from the goal'],
    [b.layout, 'things are in different places or sizes'],
    [b.style, 'the colours and fonts differ'],
    [b.visual, 'it looks different side by side'],
  ];
  const worst = parts.filter(([v]) => v < 90).sort((x, y) => x[0] - y[0]).slice(0, 2).map(([, text]) => text);
  return worst.length === 0 ? 'it differs a little from the goal page' : worst.join(', and ');
}

interface FeedbackInput {
  goal: PreparedSite;
  candidate: PreparedSite;
  pages: SitePageResult[];
  own: { works: number; looks: number }[];
  parts: Parts;
  before: number;
  missingLinks: { from: string; to: string }[];
  broken: string[];
  efficiency: EfficiencyScore | null;
  pairs: { candidate: PageStats; goal: PageStats }[];
  bytes: number;
  referenceBytes: number;
  /** Accessibility and clean-code results of each compared pair, by goal page. */
  quality: { goal: string; result: QualityResult }[];
  unpairedCandidates: number;
}

function buildFeedback(f: FeedbackInput): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  const { parts, pages } = f;
  // What the total would gain if this one thing were put right: the same
  // arithmetic as the total, with that part changed.
  const gain = (change: Partial<Parts>) => totalOf({ ...parts, ...change }) - f.before;
  const add = (message: string, points: number) => {
    const rounded = round1(points);
    if (rounded >= 0.1) items.push({ message, points: rounded });
  };
  const indexOf = new Map(pages.map((p, i) => [p.goal, i]));
  const name = (goalPath: string) => pageName(goalPath);

  // Missing links go with the page they lead to or from when that page is
  // missing or unreachable: putting the page right puts them right.
  const missingPage = (path: string) => pages[indexOf.get(path)!]?.candidate === null;
  const orphanPage = (path: string) => pages[indexOf.get(path)!]?.orphaned === true;
  const linksWith = new Map<string, number>();
  const byFrom = new Map<string, string[]>();
  for (const l of f.missingLinks) {
    const owner = missingPage(l.to) ? l.to : missingPage(l.from) ? l.from : orphanPage(l.to) ? l.to : orphanPage(l.from) ? l.from : null;
    if (owner !== null) linksWith.set(owner, (linksWith.get(owner) ?? 0) + 1);
    else byFrom.set(l.from, [...(byFrom.get(l.from) ?? []), l.to]);
  }

  pages.forEach((p, i) => {
    const works = [...parts.works];
    const looks = [...parts.looks];
    if (p.candidate === null) {
      works[i] = 1;
      looks[i] = 1;
      const message =
        f.unpairedCandidates > 0
          ? `The ${name(p.goal)} page is missing: none of the pages looks enough like it`
          : `The ${name(p.goal)} page was never made`;
      add(message, gain({ works, looks, found: parts.found + (linksWith.get(p.goal) ?? 0) }));
    } else if (p.orphaned) {
      works[i] = f.own[i].works;
      looks[i] = f.own[i].looks;
      add(
        `Nothing links to the ${name(p.goal)} page, so visitors cannot reach it`,
        gain({ works, looks, found: parts.found + (linksWith.get(p.goal) ?? 0) }),
      );
    }
  });

  for (const [from, tos] of byFrom) {
    const targets = tos.map((t) => `the ${name(t)}`);
    const message =
      tos.length === 1
        ? `The ${name(from)} page has no link to ${targets[0]} page`
        : `The ${name(from)} page has no links to ${listOf(targets)} pages`;
    add(message, gain({ found: parts.found + tos.length }));
  }

  if (f.broken.length > 0) {
    const targets = [...new Set(f.broken.map((b) => b.slice(b.indexOf(' -> ') + 4)))].sort();
    const shown = targets.slice(0, 3).join(', ') + (targets.length > 3 ? ', ...' : '');
    const message =
      f.broken.length === 1
        ? `1 link leads to a page that does not exist: ${shown}`
        : `${f.broken.length} links lead to pages that do not exist: ${shown}`;
    add(message, gain({ deadLinkFactor: 1 }));
  }

  const e = f.efficiency;
  if (e) {
    if (e.spaceRatio > PERF.ratio.full) {
      add(`The site is ${times(e.spaceRatio)} times the size of the goal`, gain({ efficiency: 0.5 + 0.5 * e.timeCredit }));
    }
    if (e.worstDevice && e.worstDevice.ratio > PERF.ratio.full) {
      const device = lowerFirst(e.worstDevice.name);
      const article = /^[aeiou]/i.test(device) ? 'an' : 'a';
      add(
        `Pages load about ${times(e.worstDevice.ratio)} times slower than the goal's on ${article} ${device}`,
        gain({ efficiency: 0.5 * e.spaceCredit + 0.5 }),
      );
    }
    let extra = 0;
    let goalBlocked = 0;
    const fewer = f.pairs.map((pair) => {
      extra += Math.max(0, pair.candidate.blockedRequests - pair.goal.blockedRequests);
      goalBlocked += pair.goal.blockedRequests;
      return {
        candidate: { ...pair.candidate, blockedRequests: Math.min(pair.candidate.blockedRequests, pair.goal.blockedRequests) },
        goal: pair.goal,
      };
    });
    if (extra > 0) {
      const fixed = scoreEfficiency(fewer, VIEWPORT.width, f.bytes, f.referenceBytes);
      const files = extra === 1 ? '1 file' : `${extra} files`;
      add(
        goalBlocked === 0
          ? `The site asks for ${files} from outside addresses, or that it does not contain`
          : `The site asks for ${files} more than the goal from outside addresses, or that it does not contain`,
        gain({ efficiency: fixed.credit }),
      );
    }
  }

  // Accessibility and clean-code problems, page by page. Fixing one raises
  // that page's credit (credit = e^-(sum of costs)), and so the site's mean;
  // it gains points only as far as that credit is the worst of the three.
  const n = f.quality.length;
  for (const { goal: goalPath, result } of f.quality) {
    for (const [key, part] of [['accessibility', result.accessibility], ['cleanCode', result.validity]] as const) {
      for (const issue of part.issues) {
        const fixed = Math.min(1, part.credit * Math.exp(issue.cost ?? 0));
        const message = `On the ${name(goalPath)} page: ${lowerFirst(issue.message).replace(/\.$/, '')}`;
        add(message, gain({ [key]: parts[key] + (fixed - part.credit) / n }));
      }
    }
  }

  // The worst problems on each page, priced at what they cost the site.
  pages.forEach((p, i) => {
    if (!p.result || p.result.total >= 100) return;
    const share = p.orphaned ? SITE.orphanCredit : 1;
    const works = [...parts.works];
    const looks = [...parts.looks];
    works[i] = share;
    looks[i] = share;
    const whole = gain({ works, looks });
    if (!(whole > 0)) return;
    const lost = 100 - p.result.total;
    const own = pageFeedbackOf(p.result);
    const prefix = `On the ${name(p.goal)} page: `;
    if (own.length === 0) {
      add(prefix + describePage(p.result.breakdown), whole);
      return;
    }
    for (const item of own) add(prefix + lowerFirst(item.message), Math.min(whole, (item.points * whole) / lost));
  });

  items.sort((a, b) => b.points - a.points || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
  return items.slice(0, SITE.feedbackMax);
}

/**
 * Grades a submitted site against a goal. A submission that cannot be read
 * or rendered scores 0 with a reason; it never throws. A goal that cannot
 * be prepared does throw: that is a broken challenge.
 */
export async function gradeSite(
  renderer: Renderer,
  goal: SiteFiles | PreparedSite,
  candidateFiles: SiteFiles,
): Promise<SiteGradeOutput> {
  const preparedGoal = goal instanceof PreparedSite ? goal : await prepareSite(renderer, goal, true);
  let candidate: PreparedSite;
  try {
    candidate = await prepareSite(renderer, candidateFiles, false);
  } catch (error) {
    const reason = error instanceof GraderInputError ? error.message : 'The site could not be rendered.';
    return { result: failed(preparedGoal, reason), candidate: null };
  }
  return { result: scoreSite(preparedGoal, candidate), candidate };
}
