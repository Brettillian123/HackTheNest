import { GRADER_VERSION, PERF, SITE, VIEWPORT } from './config';
import { scoreEfficiency, type Efficiency, type PageStats } from './performance';
import { isTimeout, type Renderer } from './render';
import { score } from './score';
import { linkTarget, normalizeFiles, pagesOf, type SiteFiles } from './site';
import { GraderInputError, type GradeResult, type PageSnapshot } from './types';
import { round1 } from './util';

/**
 * Grades a whole site: every page against the goal's page, the links
 * between pages, and how heavy the site is.
 *
 *   fidelity   = how well the pages and links match the goal (0 to 100)
 *   efficiency = size and estimated load time against the goal's (0 to 100)
 *   total      = fidelity x (1 - share + share x efficiency)
 *
 * Efficiency only ever takes marks off: like a coding judge, speed and size
 * count for nothing unless the answer is right.
 */

export interface RenderedPage {
  path: string;
  snapshot: PageSnapshot;
  stats: PageStats;
  /** Other files of the site this page links to. */
  linksTo: string[];
}

/** A site that has been checked and rendered. Prepare a goal once and reuse it. */
export class PreparedSite {
  constructor(
    readonly files: Map<string, string>,
    readonly pages: RenderedPage[],
  ) {}

  page(path: string): RenderedPage | undefined {
    return this.pages.find((p) => p.path === path);
  }
}

export interface SitePageResult {
  /** The goal page. */
  goal: string;
  /** The submitted page it was compared with, or null if the submission has no such page. */
  candidate: string | null;
  /** 0 to 100; 0 when the page is missing. */
  total: number;
  result: GradeResult | null;
}

export interface SiteLinks {
  /** 0 to 100, or null when the goal's pages do not link to each other. */
  score: number | null;
  /** Links between pages in the goal, and how many of them the submission has. */
  expected: number;
  found: number;
  /** Goal links the submission lacks, as "from -> to" in the goal's file names. */
  missing: string[];
  /** Links in the submission that lead to a file it does not contain. */
  broken: string[];
}

export interface SiteGradeResult {
  version: string;
  /** 0 to 100, one decimal place. */
  total: number;
  /** How well the pages and links match the goal, before efficiency. */
  fidelity: number;
  /** Size and estimated load time against the goal; null when no page could be compared. */
  efficiency: Efficiency | null;
  pages: SitePageResult[];
  links: SiteLinks;
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
 * is simply missing that page). Pages render one at a time.
 */
export async function prepareSite(renderer: Renderer, files: SiteFiles, strict: boolean): Promise<PreparedSite> {
  const map = normalizeFiles(files);
  const limit = strict ? SITE.maxPages : SITE.maxPages * 2;
  const pages: RenderedPage[] = [];
  const deadline = Date.now() + SITE.renderBudgetMs;
  for (const path of pagesOf(map).slice(0, limit)) {
    // A submission gets a fixed amount of rendering time in all. Pages it
    // does not get to count as missing. An ordinary site uses a small
    // fraction of it; only a site built to stall the grader runs out.
    if (!strict && Date.now() > deadline) break;
    let rendered: { snapshot: PageSnapshot; stats: PageStats } | null = null;
    let failure: unknown = null;
    // Twice, because a render can fail through no fault of the page: see Grader.grade.
    for (let attempt = 0; attempt < 2 && !rendered; attempt++) {
      try {
        rendered = await renderer.renderSitePage(map, path);
      } catch (error) {
        failure = error;
        if (error instanceof GraderInputError || isTimeout(error)) break;
      }
    }
    if (!rendered) {
      if (strict) throw failure instanceof Error ? failure : new Error(`Page "${path}" could not be rendered.`);
      continue;
    }
    pages.push({ path, ...rendered, linksTo: distinctTargets(rendered.stats.links, path) });
  }
  return new PreparedSite(map, pages);
}

function failed(goal: PreparedSite, reason: string): SiteGradeResult {
  return {
    version: GRADER_VERSION,
    total: 0,
    fidelity: 0,
    efficiency: null,
    pages: goal.pages.map((p) => ({ goal: p.path, candidate: null, total: 0, result: null })),
    links: { score: null, expected: 0, found: 0, missing: [], broken: [] },
    error: reason,
  };
}

/** Scores a rendered submission against a rendered goal. Pure arithmetic: no browser involved. */
export function scoreSite(goal: PreparedSite, candidate: PreparedSite): SiteGradeResult {
  // ---- pair each goal page with a submitted page ----
  const paired = new Map<string, { page: RenderedPage; result: GradeResult }>();
  const used = new Set<string>();

  // First by file name, ignoring case.
  for (const g of goal.pages) {
    const same = candidate.pages.find((c) => !used.has(c.path) && c.path.toLowerCase() === g.path.toLowerCase());
    if (same) {
      paired.set(g.path, { page: same, result: score(g.snapshot, same.snapshot) });
      used.add(same.path);
    }
  }

  // Then by look: a visitor does not see file names. Best pairs first; ties
  // go to the earlier page, so the pairing never varies.
  const options: { total: number; g: number; c: number; result: GradeResult }[] = [];
  goal.pages.forEach((g, gi) => {
    if (paired.has(g.path)) return;
    candidate.pages.forEach((c, ci) => {
      if (used.has(c.path)) return;
      const result = score(g.snapshot, c.snapshot);
      if (result.total >= SITE.pageMatchMinimum) options.push({ total: result.total, g: gi, c: ci, result });
    });
  });
  options.sort((a, b) => b.total - a.total || a.g - b.g || a.c - b.c);
  for (const option of options) {
    const g = goal.pages[option.g];
    const c = candidate.pages[option.c];
    if (paired.has(g.path) || used.has(c.path)) continue;
    paired.set(g.path, { page: c, result: option.result });
    used.add(c.path);
  }

  const pages: SitePageResult[] = goal.pages.map((g) => {
    const match = paired.get(g.path);
    return match
      ? { goal: g.path, candidate: match.page.path, total: match.result.total, result: match.result }
      : { goal: g.path, candidate: null, total: 0, result: null };
  });
  const pageMean = pages.length === 0 ? 0 : pages.reduce((sum, p) => sum + p.total, 0) / pages.length;

  // ---- links between pages ----
  const goalPaths = new Set(goal.pages.map((p) => p.path));
  let expected = 0;
  let found = 0;
  const missing: string[] = [];
  for (const g of goal.pages) {
    for (const target of g.linksTo) {
      if (!goalPaths.has(target)) continue;
      expected++;
      const from = paired.get(g.path)?.page;
      const to = paired.get(target)?.page;
      if (from && to && from.linksTo.includes(to.path)) found++;
      else missing.push(`${g.path} -> ${target}`);
    }
  }
  const broken: string[] = [];
  let submittedLinks = 0;
  for (const { page } of paired.values()) {
    for (const target of page.linksTo) {
      submittedLinks++;
      if (!candidate.files.has(target)) broken.push(`${page.path} -> ${target}`);
    }
  }
  broken.sort();
  const linkCredit =
    expected === 0 ? null : Math.max(0, found / expected - 0.5 * (broken.length / Math.max(1, submittedLinks)));

  const fidelity =
    linkCredit === null ? pageMean : (1 - SITE.linkShare) * pageMean + SITE.linkShare * linkCredit * 100;

  // ---- efficiency: size and estimated load time, against the goal ----
  let efficiency: Efficiency | null = null;
  if (paired.size > 0) {
    const pairs: { candidate: PageStats; goal: PageStats }[] = [];
    const goalFilesUsed = new Set<string>();
    for (const g of goal.pages) {
      const match = paired.get(g.path);
      if (!match) continue;
      pairs.push({ candidate: match.page.stats, goal: g.stats });
      for (const file of g.stats.files) goalFilesUsed.add(file);
    }
    let bytes = 0;
    for (const text of candidate.files.values()) bytes += Buffer.byteLength(text, 'utf8');
    let referenceBytes = 0;
    for (const file of goalFilesUsed) referenceBytes += Buffer.byteLength(goal.files.get(file) ?? '', 'utf8');
    efficiency = scoreEfficiency(pairs, VIEWPORT.width, bytes, referenceBytes);
  }

  const share = PERF.qualityShare;
  const total = fidelity * (1 - share + share * ((efficiency?.score ?? 0) / 100));

  return {
    version: GRADER_VERSION,
    total: round1(total),
    fidelity: round1(fidelity),
    efficiency,
    pages,
    links: {
      score: linkCredit === null ? null : round1(linkCredit * 100),
      expected,
      found,
      missing,
      broken,
    },
  };
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
