import { GRADER_VERSION, VIEWPORT } from './config';
import { SITE } from './site-config';
import { measureEfficiency, type Efficiency, type EfficiencyMeasurement, type EfficiencyScore, type PageStats } from './performance';
import {
  brokenCountOf,
  combineSite,
  deadFactorOf as modelDeadFactorOf,
  draggedMean as modelDraggedMean,
  efficiencyOf,
  efficiencyWith,
  looksCreditOf,
  missingPageCap as modelMissingPageCap,
  siteValues,
  totalOfParts,
  worksCreditOf,
  type PageScores,
  type Parts,
  type SiteCombination,
  type SiteMeasurements,
  type SitePageMeasurement,
} from './criteria/site-model';
import { isTimeout, type PageQuality, type Renderer } from './render';
import { accessibilityIssues, compareIssues, scoreQuality, structureIssues, validityIssues, type QualityPart, type QualityResult } from './quality/index';
import { ACCESSIBILITY_RULES, VALIDITY_RULES } from './quality/config';
import type { Issue } from './quality/types';
import { score } from './score';
import { intentGradeResult, scoreIntent } from './intent/index';
import {
  classifyLink,
  isPage,
  isPlainText,
  linkTarget,
  normalizeFiles,
  normalizeLabel,
  pageReferences,
  pagesOf,
  sourceLinks,
  stylesheetReferences,
  titleAndHeading,
  type LinkKind,
  type Reference,
  type SiteFiles,
} from './site';
import { GraderInputError, type GradeResult, type PageSnapshot } from './types';
import { round1 } from './util';

/**
 * Grades a whole site: every page against the goal's page, the links
 * between pages, and how well the site is built.
 *
 *   works        = right content, right structure, working links   (0 to 1)
 *   looks        = colours, fonts, the look of the screenshots       (0 to 1)
 *   engineering  = the worst of three credits, each against the goal's:  (-1 to 1)
 *                    size and estimated load time (-1 to 1), accessibility
 *                    (0 to 1) and clean code (0 to 1)
 *
 *   total = 100 x (0.40 works + 0.25 looks + 0.35 engineering x works) x broken-link factor + bonus
 *
 * Like a coding judge, speed and size count for nothing unless the answer
 * is right, and an answer far over the limits is marked down hard. The
 * weights are SITE_WEIGHTS in site-config.ts.
 *
 * The goal is the reference solution: a submission is never charged for a
 * fault the goal has too, so a site graded against itself always scores
 * exactly 100.
 *
 * Pages. Each goal page is paired with the submitted page a visitor would
 * take for it: the same file name, the same menu label, title or heading,
 * or failing those the same look. Works and looks are averaged over the
 * goal's pages, then the weakest built page drags the average down
 * (SITE.weakestPageDrag): a broken page is the first thing a visitor sees
 * on it. A goal page with no page of its own whose words are on other
 * pages keeps part of its works marks (SITE.movedContentCredit).
 *
 * Links. Each link on a goal page is an intent: on this page, a link with
 * this label leads to that page. The submission's link with the same label
 * on the paired page works if it leads to the paired page, and is broken if
 * it leads nowhere, off the site, to a file that is not there, or to another
 * page. With no such link at all, it is missing (links are SITE.linkShare of
 * works). Broken links take a share of the whole total (SITE.deadLinkPenalty,
 * SITE.deadLinkScale), counted by use: one costs the same on any size of site.
 *
 * A page has to carry its own content (SITE.ownContent): a page with only the
 * header, menu and footer every page shares keeps a quarter of its marks.
 *
 * A page nobody can reach keeps SITE.orphanCredit of its marks. Missing and
 * unreachable pages also cap the total, whatever the size of the site
 * (SITE.missingPageCap).
 *
 * One fault, one charge, as far as it is one fault: of the broken links
 * meant for a page that was never built or cannot be reached, the page's
 * charge covers one (it counts SITE.coveredLinkWeight of a broken link); the
 * others are still dead ends and count in full. So breaking a link never
 * pays, and deleting the page they lead to never pays either.
 *
 * A link is worth what it leads to: a working link to a page that carries
 * little of its own content earns only that page's own-content share.
 *
 * Two steps, nothing hidden between them: measureSite gathers every fact
 * with no tunable number applied, and criteria/site-model.ts combines them
 * with the values in criteria/site-params.json (the SITE and PERF copies of
 * those values are read from the same file). The result carries both the
 * measurements and the named criteria a player can act on.
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

/** One visible link on a page: where it leads and the label a visitor reads. */
interface LinkUse {
  href: string;
  /** Normalised label; '' when unknown. */
  label: string;
  /** The label as written, for feedback. */
  text: string;
  kind: LinkKind;
  path?: string;
}

interface Identity {
  /** Each distinct label of the links that lead to the page, as words. */
  label: Set<string>[];
  title: Set<string>;
  heading: Set<string>;
  name: Set<string>;
}

/** A site that has been checked and rendered. Prepare a goal once and reuse it. */
export class PreparedSite {
  private byPath: Map<string, RenderedPage> | null = null;
  private wordSets = new Map<string, Set<string>>();
  private useLists = new Map<string, LinkUse[]>();
  /** Facts that depend only on this site, worked out once (a prepared goal is graded many times). */
  facts: SiteFacts | null = null;

  constructor(
    readonly files: Map<string, string>,
    readonly pages: RenderedPage[],
    /** Pages of the site that were not rendered: over the page limit, or out of rendering time. */
    readonly skipped: string[] = [],
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

  /** The visible links of a page, in page order, each with its label from the HTML. */
  uses(page: RenderedPage): LinkUse[] {
    let list = this.useLists.get(page.path);
    if (!list) {
      const labels = new Map<string, string[]>();
      for (const l of sourceLinks(this.files.get(page.path) ?? '')) {
        const queue = labels.get(l.href) ?? [];
        queue.push(l.label);
        labels.set(l.href, queue);
      }
      list = page.stats.links.map((href) => {
        const text = labels.get(href)?.shift() ?? '';
        const c = classifyLink(href, page.path);
        return { href, label: normalizeLabel(text), text, kind: c.kind, path: c.path };
      });
      this.useLists.set(page.path, list);
    }
    return list;
  }
}

interface FailedReference extends Reference {
  /** The page that asked for it. */
  page: string;
}

interface SiteFacts {
  home: string | undefined;
  /** Pages reachable from the site's own home page. */
  reach: Set<string>;
  /** Link uses on the reachable pages that lead to a file of the site (there or not). */
  linkUses: number;
  /** Per page, how many visible links lead to a file the site does not contain. */
  deadUses: Map<string, number>;
  /** Files that are not pages, that no rendered page loads or links to. */
  unused: string[];
  /** Stylesheets, images and fonts asked for that the site does not contain, by target. */
  failed: Map<string, FailedReference>;
  /** Per page: what a visitor knows it by. */
  identity: Map<string, Identity>;
  /** Per token of the identities: how many pages have it. */
  tokenPages: Map<string, number>;
  /** Per page, its own words: words of three letters or more that no other page of the site has. */
  ownWords: Map<string, string[]>;
  /**
   * Per page, the content it carries itself: words of three letters or more
   * that at most half of the site's pages have, so not the header, menu and
   * footer every page shares.
   */
  pageContent: Map<string, string[]>;
  /** Per page, the name a visitor knows it by, for feedback: "home", "about", "Dev Patel", "FAQ". */
  names: Map<string, string>;
}

/** Common words that say nothing about what a page is for. */
const COMMON = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'was', 'were', 'this', 'that', 'these', 'from', 'have', 'has', 'not', 'but',
  'all', 'can', 'will', 'its', 'any', 'more', 'about', 'into', 'out', 'who', 'what', 'how', 'why', 'when', 'where', 'here', 'there', 'they',
  'their', 'them', 'his', 'her', 'she', 'him', 'one', 'also', 'than', 'then', 'just', 'each', 'very', 'over',
]);

/**
 * How much of a goal page's own content a submitted page carries, and what
 * that leaves of its marks (SITE.ownContent). A page with only the site's
 * header, menu and footer has not been built, however much of the goal
 * page those shared parts cover. Not used for a one-page goal, which has
 * nothing shared to stand in for content.
 */
function ownContentOf(goal: PreparedSite, g: string, candidate: PreparedSite, c: RenderedPage): { ownWords: number; share: number } {
  if (goal.pages.length < 2) return { ownWords: 0, share: 1 };
  const own = factsOf(goal).pageContent.get(g) ?? [];
  if (own.length === 0) return { ownWords: 0, share: 1 };
  const words = candidate.words(c);
  let found = 0;
  for (const w of own) if (words.has(w)) found++;
  // The goal's own words, or failing those as much text of its own (the
  // goal's content put in other words): a page that says the same thing
  // differently has still been built.
  const volume = (factsOf(candidate).pageContent.get(c.path)?.length ?? 0) / own.length;
  return { ownWords: own.length, share: Math.max(found / own.length, Math.min(1, volume)) };
}

/**
 * The name of each page for feedback: the part of its title that is not the
 * site's name, or failing that its main heading, or failing that its file
 * name. The home page is "home". One word is written in lower case unless
 * it is an abbreviation ("about", "FAQ"); longer names are kept as written.
 */
function namesOf(site: PreparedSite, home: string | undefined): Map<string, string> {
  const n = site.pages.length;
  const bare = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const info = site.pages.map((p) => {
    const th = titleAndHeading(site.files.get(p.path) ?? '');
    return { path: p.path, heading: th.heading, words: th.title.split(/\s+/).filter(Boolean) };
  });
  // Words in the titles of more than half the pages are the site's name.
  const count = new Map<string, number>();
  for (const i of info) for (const w of new Set(i.words.map(bare))) count.set(w, (count.get(w) ?? 0) + 1);
  const names = new Map<string, string>();
  for (const i of info) {
    if (i.path === home) {
      names.set(i.path, 'home');
      continue;
    }
    const own = i.words.filter((w) => bare(w) !== '' && (n < 2 || (count.get(bare(w)) ?? 0) <= n / 2));
    let pick = own.join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}).!?]+$/gu, '').trim();
    // Too little left to name it by ("Topic D" less "Topic"): the main heading says it better.
    if (pick.length < 3) pick = i.heading;
    if (!pick || pick.length > 32 || pick.split(/\s+/).length > 5 || /\bpage\b/i.test(pick)) pick = pageName(i.path);
    if (!/\s/.test(pick) && pick !== pick.toUpperCase()) pick = pick.toLowerCase();
    names.set(i.path, pick);
  }
  return names;
}

/** Share of a goal page's own words that a submitted page has (0 to 1); 0 when the goal page has too few to tell. */
function contentShare(goal: PreparedSite, g: string, candidate: PreparedSite, c: RenderedPage): number {
  const own = factsOf(goal).ownWords.get(g) ?? [];
  if (own.length < 5) return 0;
  const words = candidate.words(c);
  let found = 0;
  for (const w of own) if (words.has(w)) found++;
  return found / own.length;
}

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'for', 'in', 'on', 'our', 'your', 'my', 'us', 'we', 'page', 'at', 'by', 'with', 'html', 'htm']);
const tokens = (text: string) => new Set(normalizeLabel(text).split(' ').filter((t) => t && !STOP.has(t)));

function nameTokens(path: string): Set<string> {
  const parts = path.split('/');
  let base = parts.pop()!.replace(/\.html?$/i, '');
  if (base.toLowerCase() === 'index') base = parts.length > 0 ? parts[parts.length - 1] : 'home';
  return tokens(base);
}

function factsOf(site: PreparedSite): SiteFacts {
  if (site.facts) return site.facts;
  const home = homeOf(site);
  const reach = reachableFrom(site, home);
  const deadUses = new Map<string, number>();
  const used = new Set<string>();
  const labelsTo = new Map<string, Map<string, Set<string>>>();
  let linkUses = 0;
  for (const p of site.pages) {
    let dead = 0;
    for (const file of p.stats.files) used.add(file);
    for (const u of site.uses(p)) {
      if (u.kind === 'site') {
        used.add(u.path!);
        if (!site.files.has(u.path!)) dead++;
        if (reach.has(p.path)) linkUses++;
      }
      const to = u.kind === 'site' ? u.path! : u.kind === 'self' && !u.href.trim().startsWith('#') ? p.path : null;
      if (to !== null && u.label) {
        const map = labelsTo.get(to) ?? new Map<string, Set<string>>();
        const words = tokens(u.label);
        if (words.size > 0) map.set([...words].join(' '), words);
        labelsTo.set(to, map);
      }
    }
    deadUses.set(p.path, dead);
  }
  const rendered = new Set(site.pages.map((p) => p.path));
  const unused = [...site.files.keys()].filter((f) => !isPage(f) && !used.has(f) && !rendered.has(f)).sort();

  // References that cannot load, from the pages a visitor reaches and the stylesheets they load.
  const failed = new Map<string, FailedReference>();
  for (const p of site.pages) {
    if (!reach.has(p.path)) continue;
    const refs = [...pageReferences(site.files.get(p.path) ?? '', p.path)];
    for (const file of p.stats.files) if (/\.css$/i.test(file)) refs.push(...stylesheetReferences(site.files.get(file) ?? '', file));
    for (const ref of refs) {
      if (!ref.outside && site.files.has(ref.target)) continue;
      if (!failed.has(ref.target)) failed.set(ref.target, { ...ref, page: p.path });
    }
  }

  const identity = new Map<string, Identity>();
  const tokenPages = new Map<string, number>();
  for (const p of site.pages) {
    const th = titleAndHeading(site.files.get(p.path) ?? '');
    const id: Identity = { label: [...(labelsTo.get(p.path)?.values() ?? [])], title: tokens(th.title), heading: tokens(th.heading), name: nameTokens(p.path) };
    identity.set(p.path, id);
    for (const t of new Set([...id.label.flatMap((l) => [...l]), ...id.title, ...id.heading, ...id.name])) tokenPages.set(t, (tokenPages.get(t) ?? 0) + 1);
  }
  // Each page's own words: the ones no other page of the site has.
  const ownWords = new Map<string, string[]>();
  const pagesWith = new Map<string, number>();
  for (const p of site.pages) for (const w of site.words(p)) pagesWith.set(w, (pagesWith.get(w) ?? 0) + 1);
  for (const p of site.pages) {
    ownWords.set(p.path, [...site.words(p)].filter((w) => w.length >= 3 && !/^\d+$/.test(w) && pagesWith.get(w) === 1));
  }
  const half = Math.max(1, site.pages.length / 2);
  const pageContent = new Map<string, string[]>();
  for (const p of site.pages) {
    pageContent.set(p.path, [...site.words(p)].filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !COMMON.has(w) && (pagesWith.get(w) ?? 0) <= half));
  }
  site.facts = { home, reach, linkUses, deadUses, unused, failed, identity, tokenPages, ownWords, pageContent, names: namesOf(site, home) };
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
  /** Set ("intent") when the page was graded by the brief's intent (scoreIntent) instead of by likeness to the goal page. */
  mode?: 'intent';
  /** Set when the page has no page of its own but its words are on another submitted page (that page). */
  movedTo?: string;
  /**
   * Set when the submitted page carries too little of the goal page's own
   * content (the words not shared with most other pages): the share found,
   * 0 to 1. Its marks, and `total`, were scaled down for it (SITE.ownContent).
   */
  ownContent?: number;
}

export interface SiteLinks {
  /** 0 to 100, or null when the goal's pages do not link to each other. */
  score: number | null;
  /** Links between pages in the goal, and how many of them the submission has. */
  expected: number;
  found: number;
  /** Goal links the submission lacks, as "from -> to" in the goal's file names. */
  missing: string[];
  /** Broken link uses on the reachable submitted pages, as "page -> where it leads", one entry per use. */
  broken: string[];
  /** Dead links that are not charged because the goal's matching page has as many dead links of its own. */
  excused: string[];
  /** Submitted pages that match a reachable goal page but that no link leads to from the home page. */
  orphaned: string[];
  /** What the total before the bonus was multiplied by for broken links: 1 when there are none, down to 1 - SITE.deadLinkPenalty. */
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
  /** 0 to 100: badly written code the goal does not have: per page, averaged, then files no page uses and references that cannot load. */
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
  /** True when every page scores 100 and is reachable, every link is present, and no link is broken: the condition for the bonus. */
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
  /** The named criteria a player can act on, each 0 to 1 with notes that name the page and the thing. */
  criteria: SiteCriterion[];
  /** At most SITE.feedbackMax lines from the criteria' notes, worst criterion first, each fault said once. */
  criteriaFeedback: string[];
  /** Every fact the total was combined from (criteria/site-model.ts); null when the submission could not be graded. */
  measurements: SiteMeasurements | null;
  /** Set only when the submission could not be graded at all; the total is then 0. */
  error?: string;
}

/** One named criterion for the player. */
export interface SiteCriterion {
  id: 'pages' | 'navigation' | 'content' | 'layout' | 'style' | 'likeness' | 'size' | 'speed' | 'accessibility' | 'cleanCode';
  name: string;
  group: 'works' | 'looks' | 'engineering';
  /** 0 to 1, or null when there is nothing to judge it on. */
  value: number | null;
  notes: string[];
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
 * an error (a broken goal), and so is a goal with more than SITE.maxPages
 * pages; without it, the page is left out (a submission is simply missing
 * that page) and pages past the limit or the time budget are listed in
 * `skipped`. Pages render SITE.renderConcurrency at a time, each in its own
 * browser context; the order of the result never depends on which finishes
 * first.
 */
export async function prepareSite(renderer: Renderer, files: SiteFiles, strict: boolean): Promise<PreparedSite> {
  const map = normalizeFiles(files);
  const all = pagesOf(map);
  if (strict && all.length > SITE.maxPages) {
    throw new GraderInputError(`The goal has ${all.length} pages; at most ${SITE.maxPages} can be graded. Split it into smaller challenges.`);
  }
  const limit = strict ? SITE.maxPages : SITE.maxPages * 2;
  const paths = all.slice(0, limit);
  const slots: (RenderedPage | null)[] = paths.map(() => null);
  const outOfTime = new Set<number>();
  const deadline = Date.now() + SITE.renderBudgetMs;
  let next = 0;
  let fatal: unknown = null;

  const worker = async () => {
    while (next < paths.length && fatal === null) {
      // A submission gets a fixed amount of rendering time in all. Pages it
      // does not get to count as missing, and the feedback says why.
      if (!strict && Date.now() > deadline) {
        while (next < paths.length) outOfTime.add(next++);
        return;
      }
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
  const skipped = [...all.slice(limit), ...[...outOfTime].sort((a, b) => a - b).map((i) => paths[i])];
  return new PreparedSite(
    map,
    slots.filter((p): p is RenderedPage => p !== null),
    skipped,
  );
}

/**
 * The site's home page: index.html if it has one, which is what a visitor
 * arriving at the site gets. Without one there is no fixed way in, so the
 * home page is the page from which a visitor can reach the most pages,
 * then the one most pages link to, then the first by name.
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
    criteria: [],
    criteriaFeedback: [`The site could not be graded: ${reason}`],
    measurements: null,
    error: reason,
  };
}

// ---------------------------------------------------------------------------
// Pairing goal pages with submitted pages
// ---------------------------------------------------------------------------

/** Share of words two pages have in common (0 to 1). */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}

function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 4) return false;
  let common = 0;
  while (common < shorter && a[common] === b[common]) common++;
  return common === shorter || (common >= 5 && common >= 0.6 * shorter);
}

/**
 * How alike two sets of words are, 0 to 1, with words that most pages of a
 * site share (the site's name, "route" on thirteen route pages) counting
 * for little. A word that starts another ("config", "configuration") matches it.
 */
function tokenSimilarity(a: Set<string>, b: Set<string>, wa: (t: string) => number, wb: (t: string) => number): number | null {
  if (a.size === 0 || b.size === 0) return null;
  let sumA = 0;
  let sumB = 0;
  for (const t of a) sumA += wa(t);
  for (const t of b) sumB += wb(t);
  if (sumA <= 0 || sumB <= 0) return null;
  let matched = 0;
  for (const t of a) {
    let best = 0;
    for (const u of b) if (tokenMatch(t, u)) best = Math.max(best, (wa(t) + wb(u)) / 2);
    matched += best;
  }
  return Math.min(1, (2 * matched) / (sumA + sumB));
}

const IDENTITY_WEIGHTS = { label: 0.35, title: 0.25, heading: 0.2, name: 0.2 } as const;

/** 0 to 1: how sure a visitor would be that two pages are the same page, from its menu label, title, heading and file name. */
function identityOf(goal: PreparedSite, g: string, candidate: PreparedSite, c: string): number {
  const gf = factsOf(goal);
  const cf = factsOf(candidate);
  const weight = (facts: SiteFacts, n: number) => (t: string) => Math.log((n + 1) / (facts.tokenPages.get(t) ?? 1));
  const wa = weight(gf, goal.pages.length);
  const wb = weight(cf, candidate.pages.length);
  const a = gf.identity.get(g)!;
  const b = cf.identity.get(c)!;
  let sum = 0;
  let total = 0;
  for (const key of ['label', 'title', 'heading', 'name'] as const) {
    let s: number | null = null;
    if (key === 'label') {
      for (const x of a.label) for (const y of b.label) {
        const v = tokenSimilarity(x, y, wa, wb);
        if (v !== null && (s === null || v > s)) s = v;
      }
    } else s = tokenSimilarity(a[key], b[key], wa, wb);
    if (s === null) continue;
    sum += IDENTITY_WEIGHTS[key] * s;
    total += IDENTITY_WEIGHTS[key];
  }
  return total === 0 ? 0 : sum / total;
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

/** How much a pair's identity counts against its look (0 to 100) when choosing the pairing. */
const IDENTITY_PULL = 50;
/** The same for the share of a goal page's own words found on the submitted page. */
const CONTENT_PULL = 30;

/**
 * Pairs each goal page with at most one submitted page, the way a visitor
 * would: by what the page is called in the menu, its title and heading,
 * its file name, and how it looks. The pairing with the most evidence over
 * the whole site wins.
 *
 *   - A page with the goal page's file name is always a candidate.
 *   - A pair a visitor would recognise by name, label, title or heading
 *     (identity at least SITE.pairIdentityMinimum) may pair however
 *     different the pages look; the page then earns what its look gives.
 *   - Otherwise a pair needs a look-alike score of SITE.pageMatchMinimum,
 *     and is refused when the evidence says it is a different page: a
 *     sibling built from the same template does not stand in for a page
 *     that is missing.
 *
 * The home page is fixed: a visitor arriving at the site gets index.html.
 */
/** Optional ways of grading: `intent` names the pages (by goal path) graded by the brief's intent instead of by likeness. */
export interface SiteGradeOptions {
  intent?: Record<string, { keyFacts: string[] }>;
}

/** The page scorer for one goal page: the intent scorer when the options ask for it, else the likeness scorer. */
function pageScorer(path: string, opts: SiteGradeOptions | undefined): (g: PageSnapshot, c: PageSnapshot) => GradeResult {
  const challenge = opts?.intent?.[path];
  return challenge ? (g, c) => intentGradeResult(scoreIntent(g, c, challenge)) : score;
}

function pairPages(goal: PreparedSite, candidate: PreparedSite, opts?: SiteGradeOptions): Map<string, { page: RenderedPage; result: GradeResult }> {
  const G = goal.pages;
  const C = candidate.pages;
  const paired = new Map<string, { page: RenderedPage; result: GradeResult }>();
  const cache = new Map<string, GradeResult>();
  const compare = (gi: number, ci: number): GradeResult => {
    const key = `${gi}:${ci}`;
    let r = cache.get(key);
    if (!r) {
      r = pageScorer(G[gi].path, opts)(G[gi].snapshot, C[ci].snapshot);
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

  const identity = G.map((g) => C.map((c) => identityOf(goal, g.path, candidate, c.path)));
  const strongG = identity.map((row) => row.map((v) => v >= SITE.pairIdentityMinimum));
  // The words on the page: a goal page whose own words are found mostly on
  // one submitted page, which in turn has more of them than of any other
  // goal page's, is that page however it looks.
  const content = G.map((g) => C.map((c) => contentShare(goal, g.path, candidate, c)));
  const mutualContent = (gi: number, ci: number) => {
    const v = content[gi][ci];
    if (v < SITE.pairContentMinimum) return false;
    return content[gi].every((x, j) => j === ci || x < v) && content.every((row, i) => i === gi || row[ci] < v);
  };
  const weights: number[][] = G.map(() => C.map(() => 0));
  const allowed: boolean[][] = G.map(() => C.map(() => false));
  G.forEach((g, gi) => {
    if (gi === pinnedG) return;
    const own = nameOf.get(gi);
    C.forEach((c, ci) => {
      if (ci === pinnedC) return;
      // A tiny, fixed tie-break: earlier pages first, so the pairing never varies.
      const order = 1e-9 * (gi * C.length + ci);
      const id = identity[gi][ci];
      const evidence = IDENTITY_PULL * id + CONTENT_PULL * content[gi][ci];
      if (own === ci) {
        weights[gi][ci] = compare(gi, ci).total + evidence + 0.001 - order;
        allowed[gi][ci] = true;
        return;
      }
      const owner = ownerOf.get(ci);
      const recognised = id >= SITE.pairIdentityMinimum || mutualContent(gi, ci);
      let worthComparing = recognised || (own === undefined && owner === undefined);
      if (!worthComparing) {
        // A same-named pair is questioned only when another page has more in common with it.
        const shared = overlap(goal.words(g), candidate.words(c));
        worthComparing =
          (own !== undefined && (shared > overlap(goal.words(g), candidate.words(C[own])) || id > identity[gi][own])) ||
          (owner !== undefined && (shared > overlap(goal.words(G[owner]), candidate.words(c)) || id > identity[owner][ci]));
      }
      if (!worthComparing) return;
      const total = compare(gi, ci).total;
      if (!recognised) {
        if (total < SITE.pageMatchMinimum) return;
        // Looks alike, but the evidence names a different page for one of them.
        const elsewhere = strongG[gi].some((s, j) => s && j !== ci) || strongG.some((row, i) => i !== gi && row[ci]);
        if (id < SITE.pairIdentityContradiction && elsewhere) return;
      }
      weights[gi][ci] = total + evidence - order;
      allowed[gi][ci] = true;
    });
  });
  bestAssignment(weights).forEach((ci, gi) => {
    if (ci >= 0 && allowed[gi][ci]) paired.set(G[gi].path, { page: C[ci], result: compare(gi, ci) });
  });
  return paired;
}

// ---------------------------------------------------------------------------
// Measuring, then combining. The combination, with every tunable number it
// uses, is criteria/site-model.ts; nothing here applies one.
// ---------------------------------------------------------------------------

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
        ? compareIssues(
            accessibilityIssues(c.dom, candidate.snapshot, { dom: g.dom, snapshot: goal.snapshot }),
            accessibilityIssues(g.dom, goal.snapshot, { dom: g.dom, snapshot: goal.snapshot }),
            ACCESSIBILITY_RULES,
          )
        : NO_ISSUES,
    validity:
      g?.source && c?.source
        ? compareIssues([...validityIssues(c.source), ...structureIssues(c.source, g.source).validity], validityIssues(g.source), VALIDITY_RULES)
        : NO_ISSUES,
  };
}

/** Today's values of the combination's constants (criteria/site-params.json). */
const VALUES = siteValues();

/** The mean over the goal's pages dragged down by the weakest built page, with today's values. */
export function draggedMean(values: number[], own: number[], built: boolean[]): number {
  return modelDraggedMean(values, own, built, VALUES.weakestPageDrag);
}

/** What k broken links aimed at one missing or unreachable page count as, with today's values. */
export function coveredCount(k: number): number {
  return brokenCountOf(0, [k], VALUES);
}

/** The most a site with m missing pages can score, with today's values. */
export function missingPageCap(m: number): number {
  return modelMissingPageCap(m, VALUES);
}

/** The broken-link factor for n broken link uses, with today's values. */
export function deadFactorOf(n: number): number {
  return modelDeadFactorOf(n, VALUES);
}

function pageScoresOf(b: GradeResult['breakdown']): PageScores {
  return { content: b.content === null ? null : b.content / 100, layout: b.layout / 100, style: b.style / 100, visual: b.visual / 100 };
}

/** Why a link that should lead to a page does not. */
type BrokenWhy = 'nowhere' | 'outside' | 'no-file' | 'wrong-page';

interface BrokenLink {
  /** Submitted page the link is on, and the goal page that is. */
  page: string;
  goalPage: string | null;
  href: string;
  /** The link's label as written, '' if unknown. */
  text: string;
  why: BrokenWhy;
  /** For a dead file, the file; for a wrong page, the submitted page it opens. */
  target?: string;
  /** The goal page it should lead to, when known. */
  intended?: string;
  /** The goal page, never built or unreachable, whose charge covers this link: it is not counted again. */
  coveredBy?: string;
}

/** What measuring found besides the numbers: the evidence feedback and criteria name. */
interface SiteEvidence {
  results: (GradeResult | null)[];
  orphanedGoals: Set<string>;
  orphanedCandidates: string[];
  candidateHome: string | undefined;
  brokenLinks: BrokenLink[];
  brokenPairs: Set<string>;
  missingLinks: { from: string; to: string }[];
  broken: string[];
  excused: string[];
  pairs: { candidate: PageStats; goal: PageStats }[];
  bytes: number;
  referenceBytes: number;
  extraPages: PageStats[];
  quality: { goal: string; result: QualityResult }[];
  unusedFiles: string[];
  badReferences: FailedReference[];
  unusedStyles: UnusedStyles;
  unpairedCandidates: number;
}

/**
 * Every fact a site's total depends on, against the goal, as plain numbers
 * and small lists, with no tunable constant applied (criteria/site-model.ts
 * combines them). Pure arithmetic: no browser involved.
 */
export function measureSite(goal: PreparedSite, candidate: PreparedSite): SiteMeasurements {
  return measureWithEvidence(goal, candidate).measurements;
}

function measureWithEvidence(goal: PreparedSite, candidate: PreparedSite, opts?: SiteGradeOptions): { measurements: SiteMeasurements; evidence: SiteEvidence } {
  const paired = pairPages(goal, candidate, opts);
  const goalOf = new Map<string, string>();
  for (const [g, { page }] of paired) goalOf.set(page.path, g);

  // ---- reachability: a page nobody can get to is not there for a visitor ----
  const goalFacts = factsOf(goal);
  const candidateFacts = factsOf(candidate);
  const goalHome = goalFacts.home;
  const goalReach = goalFacts.reach;
  const candidateHome = (goalHome && paired.get(goalHome)?.page.path) ?? candidateFacts.home;
  const candidateReach = reachableFrom(candidate, candidateHome);
  const orphanedGoals = new Set<string>();
  for (const g of goal.pages) {
    const match = paired.get(g.path);
    if (match && goalReach.has(g.path) && !candidateReach.has(match.page.path)) orphanedGoals.add(g.path);
  }
  // The pairs whose links and size count: an orphaned page's links cannot be
  // followed, and it is left out of the efficiency comparison.
  const live = new Map([...paired].filter(([g]) => !orphanedGoals.has(g)));

  // ---- content moved to another page: a goal page with no page of its own ----
  // Its own words are the ones no other goal page has; the share of them
  // found on the submission's reachable pages (the model decides what counts).
  const moved = new Map<string, { share: number; to: string }>();
  for (const g of goal.pages) {
    if (paired.has(g.path)) continue;
    const others = new Set<string>();
    for (const o of goal.pages) if (o !== g) for (const w of goal.words(o)) others.add(w);
    const own = [...goal.words(g)].filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !others.has(w));
    if (own.length < 5) continue;
    let foundWords = 0;
    const perPage = new Map<string, number>();
    const reachable = candidate.pages.filter((c) => candidateReach.has(c.path));
    for (const w of own) {
      let seen = false;
      for (const c of reachable) {
        if (!candidate.words(c).has(w)) continue;
        seen = true;
        perPage.set(c.path, (perPage.get(c.path) ?? 0) + 1);
      }
      if (seen) foundWords++;
    }
    if (foundWords === 0) continue;
    const to = [...perPage].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    moved.set(g.path, { share: foundWords / own.length, to });
  }

  // A page has to carry its own content, not only the parts every page shares.
  const content = goal.pages.map((g) => {
    const match = paired.get(g.path);
    return match ? ownContentOf(goal, g.path, candidate, match.page) : null;
  });

  // ---- links: each goal link is an intent, judged on the paired page ----
  const goalPaths = new Set(goal.pages.map((p) => p.path));
  const brokenLinks: BrokenLink[] = [];
  const brokenPairs = new Set<string>();
  const foundPairs = new Set<string>();
  const consumed = new Map<string, boolean[]>();
  let goalUses = 0;
  for (const g of goal.pages) for (const u of goal.uses(g)) if (u.kind === 'site' && goalPaths.has(u.path!)) goalUses++;
  for (const g of goal.pages) {
    const from = live.get(g.path)?.page;
    if (!from) continue;
    const cUses = candidate.uses(from);
    const taken = cUses.map(() => false);
    consumed.set(from.path, taken);
    for (const u of goal.uses(g)) {
      if (u.kind !== 'site' || !goalPaths.has(u.path!)) continue;
      const T = u.path!;
      const key = `${g.path}\u0000${T}`;
      const partner = paired.get(T);
      const to = live.get(T)?.page;
      let vi = -1;
      if (u.label) vi = cUses.findIndex((v, i) => !taken[i] && v.label === u.label);
      if (vi >= 0) {
        taken[vi] = true;
        const v = cUses[vi];
        // A link to a page that was never built goes with that page.
        if (!partner) {
          const deadEnd = v.kind === 'nothing' || (v.kind === 'site' && !candidate.files.has(v.path!));
          if (deadEnd && goalReach.has(g.path)) {
            brokenLinks.push({
              page: from.path,
              goalPage: g.path,
              href: v.href,
              text: v.text || u.text,
              why: v.kind === 'nothing' ? 'nowhere' : 'no-file',
              target: v.kind === 'site' ? v.path : undefined,
              intended: T,
              coveredBy: T,
            });
          }
          continue;
        }
        if (v.kind === 'site' && v.path === partner.page.path) {
          if (to) foundPairs.add(key);
          continue;
        }
        if (!goalReach.has(g.path)) continue;
        const why: BrokenWhy =
          v.kind === 'nothing' ? 'nowhere' : v.kind === 'outside' ? 'outside' : v.kind === 'site' && !candidate.files.has(v.path!) ? 'no-file' : 'wrong-page';
        const target = v.kind === 'site' ? v.path : v.kind === 'self' ? from.path : undefined;
        brokenLinks.push({
          page: from.path,
          goalPage: g.path,
          href: v.href,
          text: v.text || u.text,
          why,
          target,
          intended: T,
          coveredBy: orphanedGoals.has(T) ? T : undefined,
        });
        brokenPairs.add(key);
      } else if (to && from.linksTo.includes(to.path)) {
        foundPairs.add(key);
      }
    }
  }
  let expected = 0;
  let found = 0;
  const foundTo: number[] = [];
  const goalIndex = new Map(goal.pages.map((g, i) => [g.path, i]));
  const missingLinks: { from: string; to: string }[] = [];
  for (const g of goal.pages) {
    for (const target of g.linksTo) {
      if (!goalPaths.has(target)) continue;
      expected++;
      const key = `${g.path}\u0000${target}`;
      if (foundPairs.has(key)) {
        found++;
        foundTo.push(goalIndex.get(target)!);
      } else missingLinks.push({ from: g.path, to: target });
    }
  }

  // Links to files the submission does not contain, on every reachable page,
  // that were not judged above. A page matched to a goal page with dead
  // links of its own may have as many without charge.
  const excused: string[] = [];
  // A dead file named like a goal page that was never built or cannot be
  // reached (any letter case) is a link meant for that page.
  const chargedPage = new Map<string, string>();
  for (const g of goal.pages) {
    const match = paired.get(g.path);
    if (match && !orphanedGoals.has(g.path)) continue;
    chargedPage.set(g.path.toLowerCase(), g.path);
    if (match) chargedPage.set(match.page.path.toLowerCase(), g.path);
  }
  let extra = 0;
  for (const page of candidate.pages) {
    if (!candidateReach.has(page.path)) continue;
    const taken = consumed.get(page.path);
    const g = goalOf.get(page.path);
    let allowance = g === undefined ? 0 : (goalFacts.deadUses.get(g) ?? 0);
    candidate.uses(page).forEach((v, i) => {
      if (taken?.[i] || v.kind !== 'site') return;
      if (candidate.files.has(v.path!)) {
        extra++;
        return;
      }
      if (allowance > 0) {
        allowance--;
        excused.push(`${page.path} -> ${v.path}`);
        return;
      }
      const meant = chargedPage.get(v.path!.toLowerCase());
      brokenLinks.push({ page: page.path, goalPage: g ?? null, href: v.href, text: v.text, why: 'no-file', target: v.path, intended: meant, coveredBy: meant });
    });
  }
  extra = Math.max(0, extra - found);
  const describeTarget = (b: BrokenLink) => (b.why === 'no-file' || b.why === 'wrong-page' ? (b.target ?? b.href) : b.href.trim() || '(empty)');
  const broken = brokenLinks.map((b) => `${b.page} -> ${describeTarget(b)}`).sort();
  excused.sort();
  const brokenCovered = goal.pages.map(() => 0);
  let deadCount = 0;
  for (const b of brokenLinks) {
    if (b.coveredBy === undefined) deadCount++;
    else brokenCovered[goalIndex.get(b.coveredBy)!]++;
  }

  // ---- engineering: size and estimated load time, against the goal ----
  // Like with like: the files loaded by the goal's compared pages, against
  // the files loaded by their submitted pages and by any other page a
  // visitor can reach. A file no page loads is not downloaded by anyone; it
  // is a clean-code fault instead.
  let efficiency: EfficiencyMeasurement | null = null;
  const pairs: { candidate: PageStats; goal: PageStats }[] = [];
  let bytes = 0;
  let referenceBytes = 0;
  const extraPages: PageStats[] = [];
  if (live.size > 0) {
    const goalFilesUsed = new Set<string>();
    const candidateFilesUsed = new Set<string>();
    for (const g of goal.pages) {
      const match = live.get(g.path);
      if (!match) continue;
      pairs.push({ candidate: match.page.stats, goal: g.stats });
      for (const file of g.stats.files) goalFilesUsed.add(file);
      for (const file of match.page.stats.files) candidateFilesUsed.add(file);
    }
    for (const c of candidate.pages) {
      if (goalOf.has(c.path) || !candidateReach.has(c.path)) continue;
      extraPages.push(c.stats);
      for (const file of c.stats.files) candidateFilesUsed.add(file);
    }
    for (const file of candidateFilesUsed) bytes += Buffer.byteLength(candidate.files.get(file) ?? '', 'utf8');
    for (const file of goalFilesUsed) referenceBytes += Buffer.byteLength(goal.files.get(file) ?? '', 'utf8');
    efficiency = measureEfficiency(pairs, VIEWPORT.width, bytes, referenceBytes, extraPages);
  }

  // ---- engineering: accessibility and clean code, page by page, against the goal ----
  const quality: { goal: string; result: QualityResult }[] = [];
  for (const g of goal.pages) {
    const match = live.get(g.path);
    if (match) quality.push({ goal: g.path, result: pageQuality(g, match.page) });
  }

  // ---- clean code of the site as a whole: unused files, references that cannot load ----
  const goalUnused = [...goalFacts.unused];
  const unusedFiles: string[] = [];
  for (const file of candidateFacts.unused) {
    const same = goalUnused.indexOf(file);
    if (same >= 0) goalUnused.splice(same, 1);
    else unusedFiles.push(file);
  }
  unusedFiles.splice(0, Math.min(unusedFiles.length, goalUnused.length));
  // A page the goal does not have that no visitor can reach is a stray file
  // too, unless the goal has unreachable pages of its own.
  const strayPages = candidate.pages.filter((c) => !goalOf.has(c.path) && !candidateReach.has(c.path)).map((c) => c.path);
  const goalStray = goal.pages.filter((g) => !goalReach.has(g.path)).length;
  unusedFiles.push(...strayPages.slice(goalStray));
  const badReferences = [...candidateFacts.failed.values()].filter((r) => !goalFacts.failed.has(r.target));
  const unusedStyles = unusedStylesOf(goal, candidate);

  // A link that leads nowhere is worth nothing on its page: each page is
  // also measured with its dead links' text taken out.
  const deadTexts = new Map<string, Set<string>>();
  for (const b of brokenLinks) {
    const text = normalizeLabel(b.text);
    // A link to the wrong page still takes the visitor somewhere.
    if (!text || b.why === 'wrong-page') continue;
    const set = deadTexts.get(b.page) ?? new Set<string>();
    set.add(text);
    deadTexts.set(b.page, set);
  }
  const results = goal.pages.map((g) => paired.get(g.path)?.result ?? null);
  const pages: SitePageMeasurement[] = goal.pages.map((g, i) => {
    const match = paired.get(g.path);
    if (!match) {
      const mv = moved.get(g.path);
      return {
        goal: g.path,
        candidate: null,
        built: false,
        reachable: false,
        ownWords: 0,
        ownShare: 0,
        scores: null,
        scoresWithoutDeadLinks: null,
        pageTotal: null,
        movedShare: mv?.share ?? 0,
        movedTo: mv?.to ?? null,
      };
    }
    let without: PageScores | null = null;
    const texts = deadTexts.get(match.page.path);
    if (texts) {
      const blocks = match.page.snapshot.blocks.filter((b) => !(b.kind === 'text' && b.text && texts.has(normalizeLabel(b.text))));
      if (blocks.length !== match.page.snapshot.blocks.length) {
        without = pageScoresOf(pageScorer(g.path, opts)(g.snapshot, { ...match.page.snapshot, blocks }).breakdown);
      }
    }
    return {
      goal: g.path,
      candidate: match.page.path,
      built: true,
      reachable: !orphanedGoals.has(g.path),
      ownWords: content[i]!.ownWords,
      ownShare: content[i]!.share,
      scores: pageScoresOf(match.result.breakdown),
      scoresWithoutDeadLinks: without,
      pageTotal: match.result.total,
      movedShare: 0,
      movedTo: null,
    };
  });

  const measurements: SiteMeasurements = {
    pages,
    links: {
      goalUses,
      expected,
      found,
      foundTo,
      missing: missingLinks.length,
      broken: deadCount,
      brokenCovered,
      excused: excused.length,
      extra,
    },
    pagesNeverBuilt: pages.filter((p) => !p.built).map((p) => p.goal),
    pagesUnreachable: pages.filter((p) => p.built && !p.reachable).map((p) => p.goal),
    referenceBlocks: goal.pages.length ? goal.pages.reduce((a, g) => a + g.snapshot.blocks.length, 0) / goal.pages.length : undefined,
    efficiency,
    quality: {
      pages: quality.map((q) => ({
        goal: q.goal,
        accessibility: q.result.accessibility.credit,
        cleanCode: q.result.validity.credit,
        accessibilityIssues: q.result.accessibility.issues,
        cleanCodeIssues: q.result.validity.issues,
      })),
      unusedFiles: [...unusedFiles],
      badReferences: badReferences.map((r) => r.target),
      unusedStyles: { extra: unusedStyles.extra, file: unusedStyles.file },
    },
    exact: {
      pagesPerfect: pages.length > 0 && pages.every((p) => p.built && p.reachable && p.pageTotal === 100),
      linksComplete: expected === 0 || found === expected,
      noBrokenLinks: brokenLinks.length === 0,
    },
  };
  const evidence: SiteEvidence = {
    results,
    orphanedGoals,
    orphanedCandidates: goal.pages.filter((g) => orphanedGoals.has(g.path)).map((g) => paired.get(g.path)!.page.path).sort(),
    candidateHome,
    brokenLinks,
    brokenPairs,
    missingLinks,
    broken,
    excused,
    pairs,
    bytes,
    referenceBytes,
    extraPages,
    quality,
    unusedFiles,
    badReferences,
    unusedStyles,
    unpairedCandidates: candidate.pages.filter((c) => !goalOf.has(c.path)).length,
  };
  return { measurements, evidence };
}

/** Scores a rendered submission against a rendered goal: measureSite, then the site model. Pure arithmetic: no browser involved. */
export function scoreSite(goal: PreparedSite, candidate: PreparedSite, values: Record<string, number> = VALUES, opts?: SiteGradeOptions): SiteGradeResult {
  const { measurements: m, evidence: ev } = measureWithEvidence(goal, candidate, opts);
  const c = combineSite(m, values);
  const { parts } = c;

  const pages: SitePageResult[] = m.pages.map((p, i) => {
    const result = ev.results[i];
    if (!p.built || !result) {
      if (!c.moved[i]) return { goal: p.goal, candidate: null, total: 0, result: null };
      return { goal: p.goal, candidate: null, total: round1(100 * values.movedContentCredit * p.movedShare), result: null, movedTo: p.movedTo! };
    }
    const f = c.content[i];
    const thin = { ...(f.factor < 1 ? { ownContent: Math.round(f.share * 1000) / 1000 } : {}), ...(opts?.intent?.[p.goal] ? { mode: 'intent' as const } : {}) };
    if (!p.reachable) {
      return { goal: p.goal, candidate: p.candidate, total: round1(result.total * f.factor * values.orphanCredit), result, orphaned: true, ...thin };
    }
    return { goal: p.goal, candidate: p.candidate, total: f.factor < 1 ? round1(result.total * f.factor) : result.total, result, ...thin };
  });

  const engineering = c.engineering;
  const decidedBy: SiteEngineering['decidedBy'] =
    parts.efficiency === engineering ? 'efficiency' : parts.accessibility === engineering ? 'accessibility' : 'cleanCode';
  const total = c.total;

  const feedback =
    total >= 100
      ? []
      : buildFeedback({
          goal,
          candidate,
          pages,
          own: c.own,
          parts,
          before: c.before,
          values,
          missingLinks: ev.missingLinks,
          brokenLinks: ev.brokenLinks,
          brokenPairs: ev.brokenPairs,
          efficiency: c.efficiency,
          pairs: ev.pairs,
          bytes: ev.bytes,
          referenceBytes: ev.referenceBytes,
          extraPages: ev.extraPages,
          quality: ev.quality,
          unusedFiles: ev.unusedFiles,
          badReferences: ev.badReferences,
          unusedStyles: ev.unusedStyles,
          candidateHome: ev.candidateHome,
          unpairedCandidates: ev.unpairedCandidates,
          content: c.content,
        });
  const criteria = buildCriteria({ goal, candidate, m, c, values, ev, pages });

  return {
    version: GRADER_VERSION,
    total,
    pillars: {
      works: round1(worksCreditOf(parts, values) * 100),
      engineering: round1(engineering * 100),
      looks: round1(looksCreditOf(parts, values) * 100),
    },
    bonus: round1(c.bonus),
    exactMatch: c.exactMatch,
    engineering: {
      efficiency: round1(parts.efficiency * 100),
      accessibility: round1(parts.accessibility * 100),
      cleanCode: round1(c.cleanCode * 100),
      decidedBy,
    },
    efficiency: c.efficiency ? c.efficiency.report : null,
    pages,
    links: {
      score: m.links.expected === 0 ? null : round1((parts.found / m.links.expected) * 100),
      expected: m.links.expected,
      found: m.links.found,
      missing: ev.missingLinks.map((l) => `${l.from} -> ${l.to}`),
      broken: ev.broken,
      excused: ev.excused,
      orphaned: ev.orphanedCandidates,
      deadLinkFactor: c.deadLinkFactor,
    },
    feedback,
    criteria,
    criteriaFeedback: criteriaFeedbackOf(criteria),
    measurements: m,
  };
}

// ---------------------------------------------------------------------------
// Feedback: what cost the most, in plain words, the cause first
// ---------------------------------------------------------------------------

/** "pricing.html" -> "pricing", "index.html" -> "home", "docs/index.html" -> "docs", "about-us.html" -> "about us". */
export function pageName(path: string): string {
  const parts = path.split('/');
  let base = parts.pop()!.replace(/\.html?$/i, '');
  if (base.toLowerCase() === 'index') base = parts.length > 0 ? parts[parts.length - 1] : 'home';
  return base.replace(/[-_]+/g, ' ').trim() || path;
}

/** "the about page", or "page 01" for a page whose name already says page. Names from `names` (see namesOf) when given. */
function thePageOf(path: string, names?: Map<string, string>): string {
  const name = names?.get(path) ?? pageName(path);
  return /\bpage\b/i.test(name) ? name : `the ${name} page`;
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const possessive = (s: string) => `${s}'s`;

const times = (ratio: number) => (ratio < 1.95 ? ratio.toFixed(1) : String(Math.round(ratio)));
const listOf = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const lowerFirst = (s: string) => (/^(?!I\s)[A-Z](?:[a-z]|\s)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
/** "the about, contact and pricing pages", or the single-page form. */
function thePagesOf(paths: string[], names?: Map<string, string>): string {
  if (paths.length === 1) return thePageOf(paths[0], names);
  return `the ${listOf(paths.map((p) => names?.get(p) ?? pageName(p)))} pages`;
}

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
  /** The combination's constants (criteria/site-model.ts). */
  values: Record<string, number>;
  missingLinks: { from: string; to: string }[];
  brokenLinks: BrokenLink[];
  brokenPairs: Set<string>;
  efficiency: EfficiencyScore | null;
  pairs: { candidate: PageStats; goal: PageStats }[];
  bytes: number;
  referenceBytes: number;
  extraPages: PageStats[];
  /** Accessibility and clean-code results of each compared pair, by goal page. */
  quality: { goal: string; result: QualityResult }[];
  unusedFiles: string[];
  badReferences: FailedReference[];
  unusedStyles: UnusedStyles;
  candidateHome: string | undefined;
  unpairedCandidates: number;
  /** Per goal page: the share of its own content found on its paired page, and what that left of its marks. */
  content: ({ share: number; factor: number } | null)[];
}

function buildFeedback(f: FeedbackInput): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  const { parts, pages } = f;
  const names = factsOf(f.goal).names;
  const thePage = (path: string) => thePageOf(path, names);
  const thePages = (paths: string[]) => thePagesOf(paths, names);
  // What the total would gain if this one thing were put right: the same
  // arithmetic as the total, with that part changed.
  const gain = (change: Partial<Parts>) => totalOfParts({ ...parts, ...change }, f.values) - f.before;
  const add = (message: string, points: number) => {
    const rounded = round1(points);
    if (rounded >= 0.1) items.push({ message, points: rounded });
  };
  const indexOf = new Map(pages.map((p, i) => [p.goal, i]));
  const goalNameOf = (candidatePath: string) => {
    const p = pages.find((x) => x.candidate === candidatePath);
    return p ? p.goal : candidatePath;
  };
  /** Page i put right: built, perfect, reachable. */
  const fixPages = (list: number[], base: Partial<Parts> = {}): Partial<Parts> => {
    const works = [...(base.works ?? parts.works)];
    const looks = [...(base.looks ?? parts.looks)];
    const built = [...(base.built ?? parts.built)];
    const ownWorks = [...(base.ownWorks ?? parts.ownWorks)];
    const ownLooks = [...(base.ownLooks ?? parts.ownLooks)];
    const coveredFor = [...(base.coveredFor ?? parts.coveredFor)];
    const orphaned = [...(base.orphaned ?? parts.orphaned)];
    const absent = [...(base.absent ?? parts.absent)];
    for (const i of list) {
      works[i] = 1;
      looks[i] = 1;
      built[i] = true;
      ownWorks[i] = 1;
      ownLooks[i] = 1;
      coveredFor[i] = 0;
      orphaned[i] = false;
      absent[i] = 0;
    }
    return { ...base, works, looks, built, ownWorks, ownLooks, coveredFor, orphaned, absent };
  };
  /** What a broken link does, in a few words; `plural` for several links at once. */
  const whatItDoes = (b: BrokenLink, plural = false) => {
    const s = plural ? '' : 's';
    if (b.why === 'nowhere') return `go${plural ? '' : 'es'} nowhere`;
    if (b.why === 'outside') return `leave${s} the site (${b.href.length > 40 ? `${b.href.slice(0, 37)}...` : b.href})`;
    if (b.why === 'no-file') return `lead${s} to ${b.target}, which is not in the site`;
    // A page that stands in for no goal page is named by its file.
    const opened = goalNameOf(b.target ?? '');
    const what = pages.some((p) => p.candidate === b.target) ? thePage(opened) : (b.target ?? b.href);
    return `open${s} ${what}${b.intended ? ` instead of ${thePage(b.intended)}` : ''}`;
  };

  // Missing links go with the page they lead to or from when that page is
  // missing or unreachable: putting the page right puts them right. Links
  // that are there but broken are told once, as broken.
  const missingPage = (path: string) => pages[indexOf.get(path)!]?.candidate === null;
  const orphanPage = (path: string) => pages[indexOf.get(path)!]?.orphaned === true;
  const linksWith = new Map<string, number>();
  const byFrom = new Map<string, string[]>();
  let brokenMissing = 0;
  for (const l of f.missingLinks) {
    const owner = missingPage(l.to) ? l.to : missingPage(l.from) ? l.from : orphanPage(l.to) ? l.to : orphanPage(l.from) ? l.from : null;
    if (owner !== null) linksWith.set(owner, (linksWith.get(owner) ?? 0) + 1);
    else if (f.brokenPairs.has(`${l.from}\u0000${l.to}`)) brokenMissing++;
    else byFrom.set(l.from, [...(byFrom.get(l.from) ?? []), l.to]);
  }

  // A page that is empty, or is not HTML at all, is the first thing to say about it.
  const homeGoal = f.candidateHome ? goalNameOf(f.candidateHome) : undefined;
  const folded = new Set<number>();
  pages.forEach((p, i) => {
    if (p.candidate === null) return;
    const page = f.candidate.page(p.candidate);
    if (!page) return;
    const plain = isPlainText(f.candidate.files.get(page.path) ?? '');
    const empty = f.candidate.words(page).size === 0;
    if (!plain && !empty) return;
    let message = plain
      ? `${capital(thePage(p.goal))} is plain text, not an HTML page: it has no menu, links or styles`
      : `${capital(thePage(p.goal))} is empty`;
    const list = [i];
    // Said once: its own section-by-section faults would say the same again.
    folded.add(i);
    let links = (linksWith.get(p.goal) ?? 0) + (byFrom.get(p.goal)?.length ?? 0);
    if (p.goal === homeGoal) {
      const orphans = pages.map((q, j) => (q.orphaned ? j : -1)).filter((j) => j >= 0);
      if (orphans.length > 0) {
        message += `, so visitors cannot reach ${thePages(orphans.map((j) => pages[j].goal))}`;
        for (const j of orphans) {
          list.push(j);
          folded.add(j);
          links += linksWith.get(pages[j].goal) ?? 0;
        }
      }
    }
    byFrom.delete(p.goal);
    add(message, gain({ ...fixPages(list), found: Math.min(parts.expected, parts.found + links) }));
  });

  // Pages that carry little of their own content: copies of another page,
  // pictures with no text, or the shared header and menu with nothing else.
  // Said once for all of them, before anything about their sections.
  const thin = pages
    .map((p, i) => i)
    .filter((i) => !folded.has(i) && pages[i].candidate !== null && !pages[i].orphaned && (f.content[i]?.factor ?? 1) < f.values.ownContentFloor + 0.5 * (1 - f.values.ownContentFloor));
  if (thin.length > 0) {
    const copies = new Map<string, number[]>();
    const pictures: number[] = [];
    const stubs: number[] = [];
    for (const i of thin) {
      const page = f.candidate.page(pages[i].candidate!)!;
      const words = f.candidate.words(page);
      const others = f.candidate.pages.filter((c) => c.path !== page.path && words.size > 0 && overlap(words, f.candidate.words(c)) >= 0.9);
      const source = others.find((c) => c.path === f.candidateHome) ?? others[0];
      const shot = page.snapshot;
      const pictured = shot.blocks.filter((b) => b.kind === 'image').reduce((s, b) => s + b.rect.w * b.rect.h, 0);
      if (source) copies.set(source.path, [...(copies.get(source.path) ?? []), i]);
      else if (pictured >= 0.25 * Math.max(1, shot.width * Math.min(shot.height, 2000))) pictures.push(i);
      else stubs.push(i);
    }
    const goalsOf = (list: number[]) => list.map((i) => pages[i].goal);
    for (const [source, list] of copies) {
      const verb = list.length === 1 ? 'is a copy' : 'are copies';
      add(`${capital(thePages(goalsOf(list)))} ${verb} of ${thePage(goalNameOf(source))}`, gain(fixPages(list)));
    }
    if (pictures.length > 0) {
      const subject = capital(thePages(goalsOf(pictures)));
      const said =
        pictures.length === 1
          ? 'is a picture with no text of its own: a visitor cannot read, select or use it'
          : 'are pictures with no text of their own: a visitor cannot read, select or use them';
      add(`${subject} ${said}`, gain(fixPages(pictures)));
    }
    if (stubs.length > 0) {
      const none = stubs.every((i) => (f.content[i]?.share ?? 1) < 0.1);
      const amount = none ? 'none' : 'little';
      const message =
        stubs.length === 1
          ? `${capital(thePage(pages[stubs[0]].goal))} has its heading and menu but ${amount} of its own content`
          : stubs.length > 3
            ? `${stubs.length} pages have their heading and menu but ${amount} of their own content`
            : `${capital(thePages(goalsOf(stubs)))} have their heading and menu but ${amount} of their own content`;
      add(message, gain(fixPages(stubs)));
    }
    for (const i of thin) folded.add(i);
  }

  pages.forEach((p, i) => {
    if (folded.has(i)) return;
    if (p.candidate === null) {
      let message: string;
      if (p.movedTo) {
        // The file it is on: the player may never have meant it as any goal page.
        message = `${capital(possessive(thePage(p.goal)))} content is on ${p.movedTo}, not on a page of its own`;
      } else if (f.candidate.skipped.length > 0) {
        message = `${capital(thePage(p.goal))} was not found among the pages graded: the site has more pages than can be graded (${f.candidate.skipped.length} left out)`;
      } else if (f.unpairedCandidates > 0) {
        message = `${capital(thePage(p.goal))} is missing: no page has its menu label, title or heading, or looks enough like it`;
      } else {
        message = `${capital(thePage(p.goal))} was never made`;
      }
      add(message, gain({ ...fixPages([i]), found: parts.found + (linksWith.get(p.goal) ?? 0) }));
    } else if (p.orphaned) {
      const works = [...parts.works];
      const looks = [...parts.looks];
      const coveredFor = [...parts.coveredFor];
      const orphaned = [...parts.orphaned];
      const absent = [...parts.absent];
      works[i] = f.own[i].works;
      looks[i] = f.own[i].looks;
      coveredFor[i] = 0;
      orphaned[i] = false;
      absent[i] = 0;
      // The broken links meant for it are the reason, told here once.
      const meant = f.brokenLinks.filter((b) => b.coveredBy === p.goal);
      let message = `Nothing links to ${thePage(p.goal)}, so visitors cannot reach it`;
      if (meant.length > 0) {
        const ways = [...new Set(meant.map((b) => whatItDoes(b, meant.length > 1)))];
        const said = ways.slice(0, 2).join('; ') + (ways.length > 2 ? '; ...' : '');
        const subject = meant.length === 1 ? 'the link meant for it' : `the ${meant.length} links meant for it`;
        // "open the about page instead of the pricing page": the page is already named.
        message = `Nothing reaches ${thePage(p.goal)}: ${subject} ${said.replace(` instead of ${thePage(p.goal)}`, '')}`;
      }
      add(message, gain({ works, looks, coveredFor, orphaned, absent, found: parts.found + (linksWith.get(p.goal) ?? 0) }));
    }
  });

  // The same link missing from several pages (a menu item left out) is one fault, said once.
  const labelOf = (from: string, to: string) => {
    const page = f.goal.page(from);
    const use = page ? f.goal.uses(page).find((u) => u.kind === 'site' && u.path === to && u.text) : undefined;
    return use?.text ?? '';
  };
  const byTo = new Map<string, string[]>();
  for (const [from, tos] of byFrom) for (const to of tos) byTo.set(to, [...(byTo.get(to) ?? []), from]);
  for (const [to, froms] of byTo) {
    if (froms.length < 2) continue;
    const label = labelOf(froms[0], to);
    const linking = f.goal.pages.filter((g) => g.linksTo.includes(to)).length;
    const link = label ? `"${label}" link` : 'link';
    const message =
      froms.length === linking && linking > 2
        ? `The ${link} to ${thePage(to)} is missing on every page`
        : `The ${link} to ${thePage(to)} is missing on ${thePages(froms)}`;
    add(message, gain({ found: parts.found + froms.length }));
    for (const from of froms) {
      const rest = (byFrom.get(from) ?? []).filter((t) => t !== to);
      if (rest.length > 0) byFrom.set(from, rest);
      else byFrom.delete(from);
    }
  }

  for (const [from, tos] of byFrom) {
    const message =
      tos.length === 1
        ? `${capital(thePage(from))} has no link to ${thePage(tos[0])}`
        : `${capital(thePage(from))} has no links to ${thePages(tos)}`;
    add(message, gain({ found: parts.found + tos.length }));
  }

  // Links covered by a missing or unreachable page are told with that page.
  const charged = f.brokenLinks.filter((b) => b.coveredBy === undefined);
  if (charged.length > 0) {
    const describe = (b: BrokenLink) => {
      const where = possessive(thePage(b.goalPage ?? b.page));
      const label = b.text ? `"${b.text.length > 30 ? `${b.text.slice(0, 27)}...` : b.text}" link` : `link to ${b.target ?? b.href}`;
      return `${where} ${label} ${whatItDoes(b)}`;
    };
    const shown = [...new Set(charged.map(describe))];
    const n = charged.length;
    const head = n === 1 ? '1 link is broken' : `${n} links are broken`;
    const list = shown.slice(0, 3).join('; ') + (shown.length > 3 ? '; ...' : '');
    add(`${head}: ${list}`, gain({ deadCount: 0, found: Math.min(parts.expected, parts.found + brokenMissing) }));
  }

  if (f.unusedFiles.length > 0) {
    const names = f.unusedFiles.slice(0, 3).join(', ') + (f.unusedFiles.length > 3 ? ', ...' : '');
    add(
      f.unusedFiles.length === 1
        ? `${names} is in the site but no page ${isPage(names) ? 'links to' : 'uses'} it`
        : `${f.unusedFiles.length} files are in the site but no page uses or links to them: ${names}`,
      gain({ unusedFiles: 0 }),
    );
  }
  if (f.badReferences.length > 0) {
    const say = (r: FailedReference) =>
      r.outside
        ? `${r.from} asks for ${r.target.length > 50 ? `${r.target.slice(0, 47)}...` : r.target}, an outside address that never loads`
        : `${r.from} asks for ${r.target}, which is not in the site`;
    const n = f.badReferences.length;
    const shown = f.badReferences.slice(0, 2).map(say).join('; ') + (n > 2 ? '; ...' : '');
    add(n === 1 ? capital(shown) : `${n} files the pages ask for cannot load: ${shown}`, gain({ badReferences: 0 }));
  }

  if (f.unusedStyles.extra > 0) {
    const file = f.unusedStyles.file;
    const n = file ? f.unusedStyles.byFile[file].unused : f.unusedStyles.extra;
    add(
      file ? `${n === 1 ? '1 CSS rule' : `${n} CSS rules`} in ${file} style nothing on any page: remove them` : `${n} CSS rules style nothing on any page: remove them`,
      gain({ unusedStyles: 0 }),
    );
  }

  const e = f.efficiency;
  if (e) {
    if (e.spaceRatio > f.values.ratioFull) {
      const plain = f.referenceBytes > 0 ? f.bytes / f.referenceBytes : e.spaceRatio;
      add(`The site is ${times(Math.max(plain, 1))} times the size of the goal`, gain({ efficiency: efficiencyWith(e, 'space', f.values) }));
    }
    if (e.worstDevice && e.worstDevice.ratio > f.values.ratioFull) {
      const device = lowerFirst(e.worstDevice.name);
      const article = /^[aeiou]/i.test(device) ? 'an' : 'a';
      add(
        `Pages load about ${times(e.worstDevice.ratio)} times slower than the goal's on ${article} ${device}`,
        gain({ efficiency: efficiencyWith(e, 'time', f.values) }),
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
      const fixed = efficiencyOf(measureEfficiency(fewer, VIEWPORT.width, f.bytes, f.referenceBytes, f.extraPages), f.values);
      const requests = extra === 1 ? '1 request' : `${extra} requests`;
      add(
        `Pages wait on ${requests}${goalBlocked === 0 ? '' : ' more than the goal'} that cannot load (files not in the site, or at outside addresses)`,
        gain({ efficiency: fixed.credit }),
      );
    }
  }

  // A fault on several pages is one fault, said once: "On every page: ...".
  const builtCount = pages.filter((p) => p.candidate !== null && !p.orphaned).length;
  const where = (goals: string[]) =>
    goals.length === 1 ? `On ${thePage(goals[0])}: ` : goals.length === builtCount && goals.length > 2 ? 'On every page: ' : `On ${thePages(goals)}: `;

  // Accessibility and clean-code problems. Fixing one raises that page's
  // credit (credit = e^-(sum of costs)), and so the site's mean; it gains
  // points only as far as that credit is the worst of the three.
  const n = f.quality.length;
  const qualityGroups = new Map<string, { key: 'accessibility' | 'cleanCode'; text: string; goals: string[]; delta: number }>();
  for (const { goal: goalPath, result } of f.quality) {
    for (const [key, part] of [['accessibility', result.accessibility], ['cleanCode', result.validity]] as const) {
      for (const issue of part.issues) {
        const fixed = Math.min(1, part.credit * Math.exp(issue.cost ?? 0));
        const text = lowerFirst(issue.message).replace(/\.$/, '');
        const id = `${key}\u0000${text}`;
        const group = qualityGroups.get(id) ?? { key, text, goals: [], delta: 0 };
        if (!group.goals.includes(goalPath)) group.goals.push(goalPath);
        group.delta += (fixed - part.credit) / n;
        qualityGroups.set(id, group);
      }
    }
  }
  for (const group of qualityGroups.values()) {
    const change: Partial<Parts> = group.key === 'accessibility' ? { accessibility: Math.min(1, parts.accessibility + group.delta) } : { cleanCode: Math.min(1, parts.cleanCode + group.delta) };
    add(where(group.goals) + group.text, gain(change));
  }

  // A link the site-wide lines already name as missing is not named again page by page.
  const missingLabels = new Map<string, string[]>();
  for (const l of f.missingLinks) {
    const label = labelOf(l.from, l.to).toLowerCase();
    if (label) missingLabels.set(l.from, [...(missingLabels.get(l.from) ?? []), label]);
  }
  const saysMissingLink = (goalPath: string, message: string) => {
    if (!/\blinks?\b/i.test(message)) return false;
    const m = message.toLowerCase();
    return (missingLabels.get(goalPath) ?? []).some((label) => m.includes(`'${label}'`) || m.includes(`"${label}"`));
  };
  /** Pages i put right in themselves, keeping any unreachable-page charge. */
  const fixLooks = (list: number[]): Partial<Parts> => {
    const fixed = fixPages(list);
    for (const i of list) {
      const share = pages[i].orphaned ? f.values.orphanCredit : 1;
      fixed.works![i] = share;
      fixed.looks![i] = share;
      fixed.coveredFor![i] = parts.coveredFor[i];
      fixed.orphaned![i] = parts.orphaned[i];
      fixed.absent![i] = parts.absent[i];
    }
    return fixed;
  };

  // The worst problems on each page, priced at what they cost the site.
  const pageGroups = new Map<string, { goals: string[]; idx: number[]; points: number }>();
  pages.forEach((p, i) => {
    if (!p.result || p.result.total >= 100 || folded.has(i)) return;
    const whole = gain(fixLooks([i]));
    if (!(whole > 0)) return;
    const lost = 100 - p.result.total;
    const ownItems = pageFeedbackOf(p.result);
    if (ownItems.length === 0) {
      add(where([p.goal]) + describePage(p.result.breakdown), whole);
      return;
    }
    // A link drawn as a button is still a link: say so when the goal page has no real buttons.
    const goalHtml = f.goal.files.get(p.goal) ?? '';
    const noButtons = !/<button\b|<input\b[^>]*type\s*=\s*["']?(button|submit|reset)/i.test(goalHtml);
    for (const item of ownItems) {
      const message = noButtons ? item.message.replace(/\b([Bb])utton(s?)\b/g, (_m, b: string, s: string) => `${b === 'B' ? 'L' : 'l'}ink${s}`) : item.message;
      if (saysMissingLink(p.goal, message)) continue;
      const text = lowerFirst(message);
      const group = pageGroups.get(text) ?? { goals: [], idx: [], points: 0 };
      if (group.idx.includes(i)) continue;
      group.goals.push(p.goal);
      group.idx.push(i);
      group.points += Math.min(whole, (item.points * whole) / lost);
      pageGroups.set(text, group);
    }
  });
  for (const [text, group] of pageGroups) {
    const points = group.idx.length === 1 ? group.points : Math.min(group.points, gain(fixLooks(group.idx)));
    add(where(group.goals) + text, points);
  }

  items.sort((a, b) => b.points - a.points || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
  return items.slice(0, SITE.feedbackMax);
}

// ---------------------------------------------------------------------------
// Styles nothing uses
// ---------------------------------------------------------------------------

interface UnusedStyles {
  /** CSS rules of the submission that match nothing on any of its pages, beyond the goal's count. */
  extra: number;
  /** The file with the most of them. */
  file: string | null;
  /** Per file of the submission, its rules that match nothing, and its rules in all. */
  byFile: Record<string, { unused: number; rules: number }>;
}

/** The class names, ids and tag names used on any page of a site. */
function usedTokens(site: PreparedSite): { classes: Set<string>; ids: Set<string>; tags: Set<string> } {
  const classes = new Set<string>();
  const ids = new Set<string>();
  const tags = new Set<string>();
  for (const p of site.pages) {
    const html = site.files.get(p.path) ?? '';
    for (const m of html.matchAll(/<([a-zA-Z][\w-]*)/g)) tags.add(m[1].toLowerCase());
    for (const m of html.matchAll(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) for (const c of (m[1] ?? m[2] ?? m[3]).split(/\s+/)) if (c) classes.add(c);
    for (const m of html.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) ids.add((m[1] ?? m[2] ?? m[3]).trim());
  }
  return { classes, ids, tags };
}

/**
 * Whether a selector can match nothing on any page: it needs a class, id or
 * tag no page has. Pseudo-classes and attribute tests are not judged, so a
 * rule is only ever called unused when it plainly is.
 */
function selectorUnused(selector: string, used: ReturnType<typeof usedTokens>): boolean {
  const plain = selector
    .replace(/::?[\w-]+\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/::?[\w-]+/g, '');
  for (const m of plain.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (!used.classes.has(m[1])) return true;
  for (const m of plain.matchAll(/#(-?[_a-zA-Z][\w-]*)/g)) if (!used.ids.has(m[1])) return true;
  for (const m of plain.matchAll(/(?:^|[\s>+~(])([a-zA-Z][\w-]*)/g)) if (!used.tags.has(m[1].toLowerCase())) return true;
  return false;
}

/** Per stylesheet of a site (a .css file a page loads, or a page's own <style> blocks): its rules, and those that match nothing on any page. */
function styleRules(site: PreparedSite): Record<string, { unused: number; rules: number }> {
  const used = usedTokens(site);
  const sheets = new Map<string, string>();
  for (const p of site.pages) {
    const html = site.files.get(p.path) ?? '';
    const own = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
    if (own.trim()) sheets.set(p.path, own);
    for (const file of p.stats.files) if (/\.css$/i.test(file) && !sheets.has(file)) sheets.set(file, site.files.get(file) ?? '');
  }
  const out: Record<string, { unused: number; rules: number }> = {};
  for (const [file, css] of sheets) {
    let rules = 0;
    let unused = 0;
    const text = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@(?:-[\w]+-)?keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '');
    for (const m of text.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const selector = m[1].trim();
      if (!selector || selector.startsWith('@')) continue;
      rules++;
      if (selector.split(',').every((s) => s.trim() !== '' && selectorUnused(s.trim(), used))) unused++;
    }
    if (rules > 0) out[file] = { unused, rules };
  }
  return out;
}

/** CSS rules of the submission that match nothing on any of its pages, beyond as many as the goal has. */
function unusedStylesOf(goal: PreparedSite, candidate: PreparedSite): UnusedStyles {
  const byFile = styleRules(candidate);
  const count = (r: Record<string, { unused: number }>) => Object.values(r).reduce((a, x) => a + x.unused, 0);
  const extra = Math.max(0, count(byFile) - count(goalStyleRules(goal)));
  let file: string | null = null;
  for (const [f, r] of Object.entries(byFile).sort(([a], [b]) => (a < b ? -1 : 1))) if (r.unused > 0 && (file === null || r.unused > byFile[file].unused)) file = f;
  return { extra, file, byFile };
}

/** A prepared goal is graded many times: its stylesheet facts are worked out once. */
const goalStyleCache = new WeakMap<PreparedSite, Record<string, { unused: number; rules: number }>>();
function goalStyleRules(goal: PreparedSite): Record<string, { unused: number; rules: number }> {
  let r = goalStyleCache.get(goal);
  if (!r) {
    r = styleRules(goal);
    goalStyleCache.set(goal, r);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Named criteria: what the player can act on
// ---------------------------------------------------------------------------

interface CriteriaInput {
  goal: PreparedSite;
  candidate: PreparedSite;
  m: SiteMeasurements;
  c: SiteCombination;
  values: Record<string, number>;
  ev: SiteEvidence;
  pages: SitePageResult[];
}

const CRITERIA: { id: SiteCriterion['id']; name: string; group: SiteCriterion['group'] }[] = [
  { id: 'pages', name: 'Pages', group: 'works' },
  { id: 'navigation', name: 'Navigation', group: 'works' },
  { id: 'content', name: 'Content', group: 'works' },
  { id: 'layout', name: 'Layout', group: 'works' },
  { id: 'style', name: 'Style', group: 'looks' },
  { id: 'likeness', name: 'Likeness', group: 'looks' },
  { id: 'size', name: 'Size', group: 'engineering' },
  { id: 'speed', name: 'Speed', group: 'engineering' },
  { id: 'accessibility', name: 'Accessibility', group: 'engineering' },
  { id: 'cleanCode', name: 'Clean code', group: 'engineering' },
];

/** A part of a page below this (0 to 1) gets a note. */
const NOTE_BELOW = 0.85;

function buildCriteria(x: CriteriaInput): SiteCriterion[] {
  const { goal, candidate, m, c, values, ev } = x;
  const names = factsOf(goal).names;
  const thePage = (path: string) => thePageOf(path, names);
  const thePages = (paths: string[]) => thePagesOf(paths, names);
  const seen = m.pages.filter((p) => p.built && p.reachable).map((p) => p.goal);
  const where = (goals: string[]) => (goals.length === seen.length && goals.length > 2 ? 'on every page' : `on ${thePages(goals)}`);
  const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const notes = new Map<SiteCriterion['id'], string[]>(CRITERIA.map((k) => [k.id, []]));
  const note = (id: SiteCriterion['id'], text: string) => {
    const list = notes.get(id)!;
    const name = CRITERIA.find((k) => k.id === id)!.name;
    const line = `${name}: ${text}`;
    if (!list.includes(line)) list.push(line);
  };
  const values01 = new Map<SiteCriterion['id'], number | null>();

  // ---- pages: every page built, with its own content ----
  const never = m.pages.filter((p, i) => !p.built && !c.moved[i]).map((p) => p.goal);
  if (never.length > 0) note('pages', `${thePages(never)} ${never.length === 1 ? 'was' : 'were'} never built`);
  m.pages.forEach((p, i) => {
    if (c.moved[i]) note('pages', `${possessive(thePage(p.goal))} content is on ${p.movedTo}, not on a page of its own`);
  });
  const thin = m.pages.map((_, i) => i).filter((i) => m.pages[i].built && c.content[i].factor < 1);
  const none = thin.filter((i) => c.content[i].share < 0.1).map((i) => m.pages[i].goal);
  const part = thin.filter((i) => c.content[i].share >= 0.1);
  if (none.length > 0) {
    note('pages', none.length === 1 ? `${thePage(none[0])} has its heading and menu but none of its own content` : `${thePages(none)} have their heading and menu but none of their own content`);
  }
  for (const i of part) note('pages', `${thePage(m.pages[i].goal)} carries only ${pct(c.content[i].share)} of its own content`);
  values01.set('pages', mean(m.pages.map((p, i) => (p.built ? c.content[i].factor : c.moved[i] ? values.movedContentCredit * p.movedShare : 0))));

  // ---- navigation: every link leads where it should; every page can be reached ----
  const goalNameOf = (candidatePath: string) => m.pages.find((p) => p.candidate === candidatePath)?.goal;
  const whatItDoes = (b: BrokenLink, plural: boolean) => {
    const s = plural ? '' : 's';
    if (b.why === 'nowhere') return `go${plural ? '' : 'es'} nowhere`;
    if (b.why === 'outside') return `leave${s} the site`;
    if (b.why === 'no-file') return b.intended && m.pagesNeverBuilt.includes(b.intended) ? `open${s} a page that does not exist` : `lead${s} to ${b.target}, which is not in the site`;
    const opened = b.target ? goalNameOf(b.target) : undefined;
    return `open${s} ${opened ? thePage(opened) : (b.target ?? b.href)}${b.intended ? ` instead of ${thePage(b.intended)}` : ''}`;
  };
  const brokenGroups = new Map<string, { label: string; b: BrokenLink; on: string[] }>();
  for (const b of ev.brokenLinks) {
    const label = b.text ? `the "${b.text.length > 30 ? `${b.text.slice(0, 27)}...` : b.text}" link` : `a link to ${b.target ?? b.href}`;
    const key = `${label}\u0000${b.why}\u0000${b.target ?? ''}\u0000${b.intended ?? ''}`;
    const group = brokenGroups.get(key) ?? { label, b, on: [] };
    const on = b.goalPage ?? b.page;
    if (!group.on.includes(on)) group.on.push(on);
    brokenGroups.set(key, group);
  }
  // Links aimed at a page that was never built are one fault per page, said once.
  const toMissing = new Map<string, { n: number; on: string[]; label: string }>();
  for (const [key, g] of brokenGroups) {
    const target = g.b.intended;
    if (!target || !m.pagesNeverBuilt.includes(target) || g.b.why === 'outside' || g.b.why === 'wrong-page') continue;
    const t = toMissing.get(target) ?? { n: 0, on: [], label: g.label };
    t.n += ev.brokenLinks.filter((b) => b.intended === target && b.why === g.b.why && b.text === g.b.text).length;
    for (const on of g.on) if (!t.on.includes(on)) t.on.push(on);
    toMissing.set(target, t);
    brokenGroups.delete(key);
  }
  for (const [target, t] of toMissing) {
    note('navigation', t.n === 1 ? `${t.label} ${where(t.on)} opens a page that does not exist (${thePage(target)} was never built)` : `${t.n} links ${where(t.on)} lead to ${thePage(target)}, which was never built`);
  }
  for (const g of brokenGroups.values()) note('navigation', `${g.label} ${where(g.on)} ${whatItDoes(g.b, false)}`);
  for (const p of m.pagesUnreachable) note('navigation', `nothing links to ${thePage(p)}, so visitors cannot reach it`);
  const gone = new Set([...m.pagesNeverBuilt, ...m.pagesUnreachable]);
  const missingTo = new Map<string, string[]>();
  for (const l of ev.missingLinks) {
    if (gone.has(l.to) || gone.has(l.from) || ev.brokenPairs.has(`${l.from}\u0000${l.to}`)) continue;
    missingTo.set(l.to, [...(missingTo.get(l.to) ?? []), l.from]);
  }
  for (const [to, froms] of missingTo) {
    const page = goal.page(froms[0]);
    const label = page ? goal.uses(page).find((u) => u.kind === 'site' && u.path === to && u.text)?.text : undefined;
    note('navigation', `the ${label ? `"${label}" ` : ''}link to ${thePage(to)} is missing ${where(froms)}`);
  }
  const builtCount = m.pages.filter((p) => p.built).length;
  values01.set(
    'navigation',
    (m.links.expected > 0 ? m.links.found / m.links.expected : 1) * c.deadLinkFactor * (builtCount > 0 ? seen.length / builtCount : 1),
  );

  // ---- the four parts of each page ----
  const partOf = (id: SiteCriterion['id'], pick: (s: PageScores) => number | null, say: string) => {
    const list: { goal: string; v: number }[] = [];
    for (const p of m.pages) {
      if (!p.scores) continue;
      const v = pick(p.scores);
      if (v !== null) list.push({ goal: p.goal, v });
    }
    values01.set(id, mean(list.map((l) => l.v)));
    const weak = list.filter((l) => l.v < NOTE_BELOW).sort((a, b) => a.v - b.v);
    if (weak.length === 0) return;
    if (weak.length === seen.length && weak.length > 2) note(id, `on every page, ${say}`);
    else for (const w of weak.slice(0, 4)) note(id, `on ${thePage(w.goal)}, ${say} (${pct(w.v)} alike)`);
  };
  partOf('content', (s) => s.content, 'the text differs from the goal');
  partOf('layout', (s) => s.layout, 'things are in different places or sizes');
  partOf('style', (s) => s.style, 'the colours and fonts differ from the goal');
  partOf('likeness', (s) => s.visual, 'the page looks different side by side');

  // ---- size and speed ----
  const e = c.efficiency;
  values01.set('size', e ? clamp(e.spaceCredit) : null);
  values01.set('speed', e ? clamp(e.timeCredit) : null);
  if (e && e.spaceRatio > values.ratioFull) {
    const plain = ev.referenceBytes > 0 ? ev.bytes / ev.referenceBytes : e.spaceRatio;
    const used = new Set<string>();
    for (const pair of ev.pairs) for (const f of pair.candidate.files) used.add(f);
    for (const s of ev.extraPages) for (const f of s.files) used.add(f);
    let worst: { file: string; extra: number } | null = null;
    for (const file of [...used].sort()) {
      const extra = Buffer.byteLength(candidate.files.get(file) ?? '', 'utf8') - Buffer.byteLength(goal.files.get(file) ?? '', 'utf8');
      if (extra > 0 && (!worst || extra > worst.extra)) worst = { file, extra };
    }
    let text = `the site is ${times(Math.max(plain, 1))} times the goal's size`;
    if (worst) {
      const styles = ev.unusedStyles.byFile[worst.file];
      text += styles && styles.unused > 0 ? `, most of the extra in ${worst.file}, where ${styles.unused} of ${styles.rules} CSS rules style nothing` : `, most of the extra in ${worst.file}`;
    }
    note('size', text);
  }
  if (e?.worstDevice && e.worstDevice.ratio > values.ratioFull) {
    const device = lowerFirst(e.worstDevice.name);
    note('speed', `pages load about ${times(e.worstDevice.ratio)} times slower than the goal's on ${/^[aeiou]/i.test(device) ? 'an' : 'a'} ${device}`);
  }

  // ---- accessibility and clean code ----
  const issueNotes = (id: 'accessibility' | 'cleanCode', pick: (q: QualityResult) => QualityPart) => {
    const groups = new Map<string, string[]>();
    for (const q of ev.quality) {
      for (const issue of pick(q.result).issues) {
        const text = lowerFirst(issue.message).replace(/\.$/, '');
        groups.set(text, [...(groups.get(text) ?? []), q.goal]);
      }
    }
    for (const [text, goals] of groups) note(id, `${where(goals)}, ${text}`);
  };
  values01.set('accessibility', c.parts.accessibility);
  issueNotes('accessibility', (q) => q.accessibility);
  values01.set('cleanCode', c.cleanCode);
  issueNotes('cleanCode', (q) => q.validity);
  if (ev.unusedFiles.length > 0) {
    const shown = ev.unusedFiles.slice(0, 3).join(', ') + (ev.unusedFiles.length > 3 ? ', ...' : '');
    note('cleanCode', ev.unusedFiles.length === 1 ? `${shown} is in the site but no page uses or links to it` : `${ev.unusedFiles.length} files are in the site but no page uses or links to them: ${shown}`);
  }
  for (const r of ev.badReferences.slice(0, 3)) {
    note('cleanCode', r.outside ? `${r.from} asks for ${r.target.length > 50 ? `${r.target.slice(0, 47)}...` : r.target}, an outside address that never loads` : `${r.from} asks for ${r.target}, which is not in the site`);
  }
  if (ev.unusedStyles.extra > 0 && ev.unusedStyles.file) {
    const s = ev.unusedStyles.byFile[ev.unusedStyles.file];
    note('cleanCode', `${s ? s.unused : ev.unusedStyles.extra} CSS rules in ${ev.unusedStyles.file} style nothing on any page`);
  }

  return CRITERIA.map((k) => {
    const v = values01.get(k.id) ?? null;
    return { ...k, value: v === null ? null : Math.round(clamp(v) * 1000) / 1000, notes: notes.get(k.id)! };
  });
}

/** At most SITE.feedbackMax lines: the weakest criteria first, each criterion's notes together, nothing said twice. */
function criteriaFeedbackOf(criteria: SiteCriterion[]): string[] {
  const order = criteria
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => k.notes.length > 0)
    .sort((a, b) => (a.k.value ?? 1) - (b.k.value ?? 1) || a.i - b.i);
  // At most three lines per criterion first, so one criterion cannot crowd out the rest; then the others, in the same order.
  const first: string[] = [];
  const rest: string[] = [];
  for (const { k } of order) k.notes.forEach((line, i) => (i < 3 ? first : rest).push(line));
  const chosen = new Set([...first, ...rest].filter((line, i, all) => all.indexOf(line) === i).slice(0, SITE.feedbackMax));
  // Back in criterion order, each criterion's lines together.
  return order.flatMap(({ k }) => k.notes).filter((line, i, all) => chosen.has(line) && all.indexOf(line) === i);
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
  opts?: SiteGradeOptions,
): Promise<SiteGradeOutput> {
  const preparedGoal = goal instanceof PreparedSite ? goal : await prepareSite(renderer, goal, true);
  let candidate: PreparedSite;
  try {
    candidate = await prepareSite(renderer, candidateFiles, false);
  } catch (error) {
    const reason = error instanceof GraderInputError ? error.message : 'The site could not be rendered.';
    return { result: failed(preparedGoal, reason), candidate: null };
  }
  return { result: scoreSite(preparedGoal, candidate, VALUES, opts), candidate };
}
