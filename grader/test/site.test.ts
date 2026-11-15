import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gradeSiteSets } from '../src/calibrate-sites';
import { PERF, SITE } from '../src/site-config';
import { Grader, type SiteFiles } from '../src/index';
import { estimateLoadMs, ratioCredit, ratioSaving, type PageStats } from '../src/performance';
import { linkTarget, normalizeFiles, pagesOf, pathOfUrl } from '../src/site';

// ---- a three-page site with a shared stylesheet ----
const CSS =
  'body{margin:0;font-family:Arial,sans-serif;background:#f3f4f6;color:#111827}' +
  'nav{background:#111827;padding:16px 40px}nav a{color:#fff;margin-right:24px;text-decoration:none;font-size:16px}' +
  'main{padding:40px}h1{font-size:36px;margin:0 0 16px}p{font-size:16px;line-height:24px;margin:0 0 12px;max-width:600px}' +
  '.card{background:#fff;border:1px solid #d1d5db;border-radius:8px;padding:20px;width:280px;margin-top:20px}' +
  '.price{font-size:28px;font-weight:700;color:#1d4ed8}';

const nav = (about = 'about.html', pricing = 'pricing.html') =>
  `<nav><a href="index.html">Home</a><a href="${about}">About</a><a href="${pricing}">Pricing</a></nav>`;

const doc = (title: string, body: string, head = '<link rel="stylesheet" href="site.css">') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;

const HOME = '<main><h1>Tidewater Bikes</h1><p>Hand-built city bikes, made to order in Michigan.</p></main>';
const ABOUT =
  '<main><h1>About us</h1><p>We are four friends who started welding frames in a garage in 2019.</p>' +
  '<p>Every bike is built by one person from start to finish.</p></main>';
const PRICING =
  '<main><h1>Pricing</h1><div class="card"><p>The Commuter</p><p class="price">$890</p></div>' +
  '<div class="card"><p>The Tourer</p><p class="price">$1,240</p></div></main>';

const GOAL: SiteFiles = {
  'index.html': doc('Home', nav() + HOME),
  'about.html': doc('About', nav() + ABOUT),
  'pricing.html': doc('Pricing', nav() + PRICING),
  'site.css': CSS,
};

let grader: Grader;
beforeAll(() => {
  grader = new Grader();
});
afterAll(async () => {
  await grader.close();
});

describe('site files', () => {
  it('tidies paths and puts index.html first', () => {
    const files = normalizeFiles({ './b.html': 'b', 'css\\a.css': 'a', '/index.html': 'i', 'a.html': 'a' });
    expect([...files.keys()].sort()).toEqual(['a.html', 'b.html', 'css/a.css', 'index.html']);
    expect(pagesOf(files)).toEqual(['index.html', 'a.html', 'b.html']);
  });

  it.each([
    [{ '../secret.html': 'x' }, /not a valid file path/],
    [{ 'a/../../b.html': 'x' }, /not a valid file path/],
    [{ 'C:/Windows/win.html': 'x' }, /not a valid file path/],
    [{ 'a.html?x=1': 'x' }, /not a valid file path/],
    [{ 'a.html': 'x', './a.html': 'y' }, /two files/],
    [{ 'style.css': 'x' }, /no \.html page/],
    [{}, /no files/],
    [{ 'a.html': 5 as unknown as string }, /not text/],
  ])('refuses %j', (files, message) => {
    expect(() => normalizeFiles(files as SiteFiles)).toThrow(message);
  });

  it('works out where a link leads', () => {
    expect(linkTarget('about.html', 'index.html')).toBe('about.html');
    expect(linkTarget('/pricing.html#plans', 'docs/a.html')).toBe('pricing.html');
    expect(linkTarget('../index.html', 'docs/a.html')).toBe('index.html');
    expect(linkTarget('b.html?x=1', 'docs/a.html')).toBe('docs/b.html');
    expect(linkTarget('./', 'docs/a.html')).toBe('docs/index.html');
    expect(linkTarget('#top', 'index.html')).toBeNull();
    expect(linkTarget('index.html', 'index.html')).toBeNull();
    expect(linkTarget('https://example.com/a.html', 'index.html')).toBeNull();
    expect(linkTarget('mailto:a@example.com', 'index.html')).toBeNull();
    expect(linkTarget('//example.com/a.html', 'index.html')).toBeNull();
    expect(pathOfUrl('http://grader.invalid/')).toBe('index.html');
    expect(pathOfUrl('file:///C:/Windows/win.ini')).toBeNull();
  });

  it('accepts only the plain form of an address', () => {
    expect(pathOfUrl('http://grader.invalid/a/b.html')).toBe('a/b.html');
    expect(pathOfUrl('http://grader.invalid//index.html')).toBeNull();
    expect(pathOfUrl('http://grader.invalid///a.html')).toBeNull();
    expect(pathOfUrl('http://user@grader.invalid/index.html')).toBeNull();
    expect(pathOfUrl('http://grader.invalid:8080/index.html')).toBeNull();
    expect(pathOfUrl('https://grader.invalid/index.html')).toBeNull();
    expect(linkTarget('.//index.html', 'about.html')).toBeNull();
  });
});

describe('findings from the site review, each fixed at its cause', () => {
  it('does not count links nobody can see or click', async () => {
    const hiddenNav =
      '<a href="index.html"></a><a href="about.html"></a><a href="pricing.html"></a>' +
      '<a href="about.html" style="color:#f3f4f6">About</a><a href="pricing.html" style="display:none">Pricing</a>' +
      '<a href="about.html" style="position:absolute;left:-9999px">About</a>';
    const hidden: SiteFiles = {
      'index.html': doc('Home', hiddenNav + HOME),
      'about.html': doc('About', hiddenNav + ABOUT),
      'pricing.html': doc('Pricing', hiddenNav + PRICING),
      'site.css': CSS,
    };
    const { result, candidate } = await grader.gradeSite(GOAL, hidden);
    expect(candidate!.page('index.html')!.linksTo).toEqual([]);
    expect(result.links.found).toBe(0);
    expect(result.links.score).toBe(0);

    const blank = (inner: string) => `<!doctype html><html><body>${inner}</body></html>`;
    const empties = '<a href="index.html"></a><a href="about.html"></a><a href="pricing.html"></a>';
    const withEmptyLinks: SiteFiles = {
      'index.html': blank(empties), 'about.html': blank(empties), 'pricing.html': blank(empties),
    };
    expect((await grader.gradeSite(GOAL, withEmptyLinks)).result.total).toBeLessThan(3);
  });

  it('counts a link wrapped round a block, and a plain coloured button', async () => {
    const cardLink =
      '<a href="about.html" style="text-decoration:none"><div style="padding:20px;background:#fff">Read our story</div></a>' +
      '<a href="pricing.html" style="display:block;width:120px;height:40px;background:#1d4ed8;margin:20px"></a>';
    const site: SiteFiles = { ...GOAL, 'index.html': doc('Home', cardLink + HOME) };
    const prepared = await grader.prepareSite(site);
    expect(prepared.page('index.html')!.linksTo).toEqual(['about.html', 'pricing.html']);
  });

  it('is not stalled by pages that frame themselves or each other', async () => {
    const framing: SiteFiles = { ...GOAL };
    for (const name of ['index.html', 'about.html', 'pricing.html', 'x1.html', 'x2.html']) {
      const bomb =
        `<iframe src=".//${name}"></iframe><iframe src=".//${name}"></iframe>` +
        `<iframe src="${name}?1"></iframe><iframe src="index.html"></iframe><iframe src="about.html?2"></iframe>` +
        `<object data="pricing.html"></object><embed src="x1.html">`;
      framing[name] = doc('Home', nav() + HOME + bomb);
    }
    const started = Date.now();
    const { result, candidate } = await grader.gradeSite(GOAL, framing);
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(candidate!.pages.map((p) => p.path)).toEqual(['index.html', 'about.html', 'pricing.html', 'x1.html', 'x2.html']);
    // No page was ever served into a frame.
    for (const p of candidate!.pages) expect(p.stats.files).toEqual([p.path, 'site.css'].sort());
    expect(result.pages[0].candidate).toBe('index.html');
    expect(result.total).toBeGreaterThan(0);
  });

  it('survives file names that match built-in property names', async () => {
    const odd: SiteFiles = {
      ...GOAL,
      'index.html': doc(
        'Home',
        nav() + HOME,
        '<link rel="stylesheet" href="site.css"><link rel="stylesheet" href="a.constructor">' +
          '<link rel="stylesheet" href="b.__proto__"><link rel="stylesheet" href="toString">',
      ),
      'a.constructor': 'h1{color:red}',
      'b.__proto__': 'h1{color:red}',
      toString: 'h1{color:red}',
      'c.hasOwnProperty': 'x',
    };
    const { result, candidate } = await grader.gradeSite(GOAL, odd);
    expect(result.error).toBeUndefined();
    expect(result.pillars.works).toBe(100);
    expect(result.pillars.looks).toBe(100);
    expect(candidate!.page('index.html')!.stats.files).toEqual(['index.html', 'site.css']);
    expect(candidate!.page('index.html')!.stats.blockedRequests).toBe(3);
  });

  it('does not count speculative requests, which load at no fixed moment', async () => {
    let hints = '<link rel="prefetch" href="extra.css">';
    for (let i = 0; i < 20; i++) hints += `<link rel="prefetch" href="missing-${i}.css">`;
    const hinted: SiteFiles = {
      ...GOAL,
      'index.html': doc('Home', nav() + HOME, '<link rel="stylesheet" href="site.css">' + hints),
      'extra.css': '.x{color:red}',
    };
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const { result, candidate } = await grader.gradeSite(GOAL, hinted);
      const stats = candidate!.page('index.html')!.stats;
      expect(stats.files).toEqual(['index.html', 'site.css']);
      expect(stats.blockedRequests).toBe(0);
      seen.add(JSON.stringify(result));
    }
    expect(seen.size).toBe(1);
  });
});

describe('load-time model', () => {
  const base: PageStats = {
    files: ['index.html'], requests: 1, bytes: 20_000, blockedRequests: 0,
    elements: 100, maxDepth: 8, cssRules: 40, height: 800, links: [],
  };
  it('gives a bigger number for more of anything, on every device', () => {
    for (const device of PERF.devices) {
      const t = estimateLoadMs(base, 1280, device);
      expect(t).toBeGreaterThan(0);
      for (const more of [
        { bytes: 40_000 }, { requests: 3 }, { blockedRequests: 2 }, { elements: 400 },
        { maxDepth: 30 }, { cssRules: 400 }, { height: 2400 },
      ]) {
        expect(estimateLoadMs({ ...base, ...more }, 1280, device)).toBeGreaterThan(t);
      }
    }
  });

  it('makes slower devices slower, and makes devices disagree about what hurts', () => {
    const times = PERF.devices.map((d) => estimateLoadMs(base, 1280, d));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // Extra bytes hurt the slow network most; extra elements hurt the slow CPU most.
    const [phone3g, , laptop] = PERF.devices;
    const heavy = { ...base, bytes: 200_000 };
    const busy = { ...base, elements: 3000, cssRules: 800 };
    const hurt = (s: PageStats, d: (typeof PERF.devices)[number]) =>
      estimateLoadMs(s, 1280, d) / estimateLoadMs(base, 1280, d);
    expect(hurt(heavy, phone3g)).toBeGreaterThan(hurt(heavy, laptop));
    expect(hurt(busy, laptop)).toBeGreaterThan(hurt(busy, phone3g));
  });
});

describe('grading a site', () => {
  it('scores a site against itself as 100 on everything', async () => {
    const { result } = await grader.gradeSite(GOAL, GOAL);
    expect(result.total).toBe(100);
    expect(result.pillars).toEqual({ works: 100, engineering: 100, looks: 100 });
    expect(result.bonus).toBe(0);
    expect(result.exactMatch).toBe(true);
    expect(result.efficiency!.score).toBe(100);
    expect(result.efficiency!.beatsGoal).toBe(false);
    expect(result.pages.map((p) => [p.goal, p.candidate, p.total])).toEqual([
      ['index.html', 'index.html', 100],
      ['about.html', 'about.html', 100],
      ['pricing.html', 'pricing.html', 100],
    ]);
    expect(result.links).toEqual({ score: 100, expected: 6, found: 6, missing: [], broken: [], excused: [], orphaned: [], deadLinkFactor: 1 });
    expect(result.feedback).toEqual([]);
    expect(result.efficiency!.time.checks.map((c) => c.passed)).toEqual([true, true, true, true]);
    expect(result.efficiency!.time.checks.map((c) => c.device)).toEqual(PERF.devices.map((d) => d.name));
  });

  it('gives the identical result every time, with a prepared goal or raw files', async () => {
    const partial: SiteFiles = { ...GOAL, 'pricing.html': doc('Pricing', nav() + '<main><h1>Pricing</h1></main>') };
    const prepared = await grader.prepareSite(GOAL);
    const a = (await grader.gradeSite(prepared, partial)).result;
    const b = (await grader.gradeSite(prepared, partial)).result;
    const c = (await grader.gradeSite(GOAL, partial)).result;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    expect(a.total).toBeLessThan(95);
    expect(a.total).toBeGreaterThan(60);
  });

  it('pairs pages by how they look when the file names differ', async () => {
    const renamed: SiteFiles = {
      'index.html': doc('Home', nav('about-us.html', 'plans.html') + HOME),
      'about-us.html': doc('About', nav('about-us.html', 'plans.html') + ABOUT),
      'plans.html': doc('Pricing', nav('about-us.html', 'plans.html') + PRICING),
      'site.css': CSS,
    };
    const { result } = await grader.gradeSite(GOAL, renamed);
    expect(result.pages.map((p) => p.candidate)).toEqual(['index.html', 'about-us.html', 'plans.html']);
    expect(result.pillars.works).toBe(100);
    expect(result.pillars.looks).toBe(100);
    expect(result.links.found).toBe(6);
  });

  it('does not care whether the CSS is shared or written into each page', async () => {
    const inline = (title: string, body: string) => doc(title, body, `<style>${CSS}</style>`);
    const inlined: SiteFiles = {
      'index.html': inline('Home', nav() + HOME),
      'about.html': inline('About', nav() + ABOUT),
      'pricing.html': inline('Pricing', nav() + PRICING),
    };
    const { result } = await grader.gradeSite(GOAL, inlined);
    expect(result.pillars.works).toBe(100);
    expect(result.pillars.looks).toBe(100);
    // Three copies of the CSS is a bigger site than one shared file, but well inside the allowance.
    expect(result.efficiency!.space.bytes).toBeGreaterThan(result.efficiency!.space.referenceBytes);
    expect(result.efficiency!.space.ratio).toBeGreaterThan(1);
    // Fewer files per page makes it faster, but faster and bigger is not "better on size and speed".
    expect(result.exactMatch).toBe(true);
    expect(result.efficiency!.time.checks.every((c) => c.ratio < 1)).toBe(true);
    expect(result.efficiency!.beatsGoal).toBe(false);
    expect(result.bonus).toBe(0);
    expect(result.total).toBeLessThan(100);
    expect(result.total).toBeGreaterThan(95);
  });

  it('charges for a missing page and for the links that went with it', async () => {
    const twoPages: SiteFiles = {
      'index.html': doc('Home', '<nav><a href="index.html">Home</a><a href="about.html">About</a></nav>' + HOME),
      'about.html': doc('About', '<nav><a href="index.html">Home</a><a href="about.html">About</a></nav>' + ABOUT),
      'site.css': CSS,
    };
    const { result } = await grader.gradeSite(GOAL, twoPages);
    expect(result.pages[2]).toEqual({ goal: 'pricing.html', candidate: null, total: 0, result: null });
    expect(result.links.expected).toBe(6);
    expect(result.links.found).toBe(2);
    expect(result.links.missing).toContain('index.html -> pricing.html');
    expect(result.total).toBeGreaterThan(40);
    expect(result.total).toBeLessThan(70);
  });

  it('reports links that lead nowhere', async () => {
    const brokenNav = nav('about.html', 'prices.html');
    const broken: SiteFiles = {
      'index.html': doc('Home', brokenNav + HOME),
      'about.html': doc('About', brokenNav + ABOUT),
      'pricing.html': doc('Pricing', brokenNav + PRICING),
      'site.css': CSS,
    };
    const { result } = await grader.gradeSite(GOAL, broken);
    // Nothing leads to pricing.html any more, so it is orphaned: its own dead
    // link cannot be followed by anyone, and its links count for nothing.
    expect(result.links.broken).toEqual(['about.html -> prices.html', 'index.html -> prices.html']);
    expect(result.links.orphaned).toEqual(['pricing.html']);
    expect(result.links.found).toBe(2);
    expect(result.links.score).toBeLessThan(60);
    // Two dead links, against the goal's six links.
    expect(result.links.deadLinkFactor).toBeCloseTo(1 - (SITE.deadLinkPenalty * 2) / 6, 10);
    // Each page on its own is perfect; the orphaned one keeps half its marks.
    expect(result.pages.every((p) => p.result!.total === 100)).toBe(true);
    expect(result.pages[2].orphaned).toBe(true);
    expect(result.pages[2].total).toBe(100 * SITE.orphanCredit);
    expect(result.total).toBeLessThan(70);
  });

  it('marks down a site that looks right but is bloated, device by device', async () => {
    const junkCss = Array.from({ length: 1500 }, (_, i) => `.unused-${i} .x-${i} > p{color:#${(i % 900) + 100};margin:${i % 7}px}`).join('');
    const wrap = (inner: string) => '<div>'.repeat(12) + inner + '</div>'.repeat(12);
    const padding = `<!-- ${'padding '.repeat(15000)} -->`;
    const bloated: SiteFiles = {
      'index.html': doc('Home', nav() + wrap(HOME) + padding),
      'about.html': doc('About', nav() + wrap(ABOUT) + padding),
      'pricing.html': doc('Pricing', nav() + wrap(PRICING) + padding),
      'site.css': CSS + junkCss,
    };
    const { result } = await grader.gradeSite(GOAL, bloated);
    expect(result.pillars.works).toBe(100);
    expect(result.pillars.looks).toBe(100);
    // Over ten times the goal's size: the worst space credit, which takes marks away.
    expect(result.efficiency!.space.credit).toBe(-100);
    expect(result.efficiency!.time.checks.some((c) => !c.passed)).toBe(true);
    expect(result.efficiency!.score).toBeLessThan(40);
    expect(result.pillars.engineering).toBeLessThan(0);
    // The most engineering can take off is its weight: 100 x (0.40 + 0.25 - 0.35) = 30.
    expect(result.total).toBeGreaterThanOrEqual(30);
    expect(result.total).toBeLessThan(60);
    for (const check of result.efficiency!.time.checks) expect(check.estimatedMs).toBeGreaterThan(check.referenceMs);
  });

  it('gives no marks for being small and fast when the site is wrong', async () => {
    const blank: SiteFiles = { 'index.html': '<!doctype html><html><body></body></html>' };
    const { result } = await grader.gradeSite(GOAL, blank);
    expect(result.efficiency!.score).toBe(100);
    expect(result.total).toBeLessThan(3);
  });

  it('grades a one-page challenge as a site with one file', async () => {
    const one: SiteFiles = { 'index.html': doc('Home', HOME, `<style>${CSS}</style>`) };
    const { result } = await grader.gradeSite(one, one);
    expect(result.total).toBe(100);
    expect(result.links.score).toBeNull();
  });

  it('scores an unreadable submission 0 with a reason, without throwing', async () => {
    const tooMany: SiteFiles = Object.fromEntries(
      Array.from({ length: SITE.maxFiles + 1 }, (_, i) => [`p${i}.html`, '<p>x</p>']),
    );
    for (const [files, reason] of [
      [tooMany, /more than/],
      [{ '../x.html': '<p>x</p>' }, /not a valid file path/],
      [{ 'site.css': 'p{}' }, /no \.html page/],
      [null as unknown as SiteFiles, /must be an object/],
    ] as [SiteFiles, RegExp][]) {
      const { result, candidate } = await grader.gradeSite(GOAL, files);
      expect(candidate).toBeNull();
      expect(result.total).toBe(0);
      expect(result.error).toMatch(reason);
    }
  });

  it('throws for a goal that is not a valid site', async () => {
    await expect(grader.prepareSite({ 'site.css': 'p{}' })).rejects.toThrow(/no \.html page/);
  });
});

describe('ratio credit and saving', () => {
  it('gives the intended values at the corners of the curve', () => {
    expect(ratioCredit(0.5)).toBe(1);
    expect(ratioCredit(1)).toBe(1);
    expect(ratioCredit(1.15)).toBe(1);
    expect(ratioCredit(2.075)).toBeCloseTo(0.5, 10);
    expect(ratioCredit(3)).toBe(0);
    expect(ratioCredit(10)).toBe(-1);
    expect(ratioCredit(50)).toBe(-1);
    // Log scale between 3x and 10x: their geometric mean is half way.
    expect(ratioCredit(Math.sqrt(30))).toBeCloseTo(-0.5, 6);

    expect(ratioSaving(0.5)).toBe(0.5);
    expect(ratioSaving(1)).toBe(0);
    expect(ratioSaving(1.15)).toBe(0);
    expect(ratioSaving(2.075)).toBe(0);
    expect(ratioSaving(3)).toBe(0);
    expect(ratioSaving(10)).toBe(0);
    expect(ratioSaving(50)).toBe(0);
  });

  it('never gives more credit for a bigger ratio', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let ratio = 0.1; ratio <= 60; ratio += 0.01) {
      const credit = ratioCredit(ratio);
      expect(credit).toBeLessThanOrEqual(previous);
      previous = credit;
    }
  });
});

describe('pages nobody can reach, and links that lead nowhere', () => {
  const twoLinkNav = '<nav><a href="index.html">Home</a><a href="about.html">About</a></nav>';
  // GOAL, except that the home and about pages send their Pricing link to a
  // file that is not there: the same pixels, but nothing leads to pricing.html.
  const soonNav = nav('about.html', 'pricing-soon.html');
  const UNLINKED: SiteFiles = {
    ...GOAL,
    'index.html': doc('Home', soonNav + HOME),
    'about.html': doc('About', soonNav + ABOUT),
  };

  it('keeps half the marks of a page that was built but cannot be reached', async () => {
    const { 'pricing.html': _pricing, ...deletedFiles } = UNLINKED;
    const unlinked = (await grader.gradeSite(GOAL, UNLINKED)).result;
    const deleted = (await grader.gradeSite(GOAL, deletedFiles)).result;
    const linked = (await grader.gradeSite(GOAL, GOAL)).result;
    for (const pillar of ['works', 'looks'] as const) {
      expect(unlinked.pillars[pillar]).toBeGreaterThan(deleted.pillars[pillar]);
      expect(unlinked.pillars[pillar]).toBeLessThan(linked.pillars[pillar]);
    }
    // Every other page is perfect: looks = 100 x (n - 1 + 0.5) / n for n = 3.
    expect(Math.abs(unlinked.pillars.looks - (100 * (3 - 1 + SITE.orphanCredit)) / 3)).toBeLessThanOrEqual(0.1);
    expect(unlinked.pages[2].orphaned).toBe(true);
    expect(unlinked.pages[2].result!.total).toBe(100);
    expect(unlinked.pages[2].total).toBe(50);
    expect(unlinked.links.orphaned).toEqual(['pricing.html']);
    expect(unlinked.exactMatch).toBe(false);
    expect(deleted.pages[2]).toEqual({ goal: 'pricing.html', candidate: null, total: 0, result: null });
  });

  it('does not orphan a page reached only through another page', async () => {
    const chain: SiteFiles = { ...GOAL, 'index.html': doc('Home', twoLinkNav + HOME) };
    const { result } = await grader.gradeSite(GOAL, chain);
    expect(result.links.orphaned).toEqual([]);
    expect(result.pages.some((p) => p.orphaned)).toBe(false);
  });

  it('does not orphan a page reached only through a page the goal does not have', async () => {
    const extraNav = '<nav><a href="index.html">Home</a><a href="about.html">About</a><a href="extra.html">Extra</a></nav>';
    const via: SiteFiles = {
      ...GOAL,
      'index.html': doc('Home', extraNav + HOME),
      'about.html': doc('About', twoLinkNav + ABOUT),
      'extra.html': doc('Extra', twoLinkNav + '<main><a href="pricing.html">See pricing</a></main>'),
    };
    const { result } = await grader.gradeSite(GOAL, via);
    expect(result.links.orphaned).toEqual([]);
    expect(result.pages[2].orphaned).toBeUndefined();
  });

  it('orphans a page linked only by an invisible or empty link', async () => {
    const hiddenLinks = '<a href="pricing.html"></a><a href="pricing.html" style="display:none">Pricing</a>';
    const hidden: SiteFiles = {
      ...GOAL,
      'index.html': doc('Home', twoLinkNav + hiddenLinks + HOME),
      'about.html': doc('About', twoLinkNav + ABOUT),
    };
    const { result } = await grader.gradeSite(GOAL, hidden);
    expect(result.pages[2].orphaned).toBe(true);
    expect(result.links.orphaned).toEqual(['pricing.html']);
  });

  it('finds the home page of a site with no index.html by its links, not by its name', async () => {
    const homeNav = '<nav><a href="about.html">About</a><a href="pricing.html">Pricing</a></nav>';
    const back = '<nav><a href="start.html">Home</a></nav>';
    const goal: SiteFiles = {
      'start.html': doc('Home', homeNav + HOME),
      'about.html': doc('About', back + ABOUT),
      'pricing.html': doc('Pricing', back + PRICING),
      'site.css': CSS,
    };
    // The about page forgot its Home link: one missing link, and no page becomes unreachable.
    const { result } = await grader.gradeSite(goal, { ...goal, 'about.html': doc('About', '<nav></nav>' + ABOUT) });
    expect(result.links.missing).toEqual(['about.html -> start.html']);
    expect(result.links.orphaned).toEqual([]);
  });

  it('does not ask for a link the goal itself leaves out', async () => {
    const goalUnlinked: SiteFiles = {
      'index.html': doc('Home', twoLinkNav + HOME),
      'about.html': doc('About', twoLinkNav + ABOUT),
      'pricing.html': doc('Pricing', twoLinkNav + PRICING),
      'site.css': CSS,
    };
    const { result } = await grader.gradeSite(goalUnlinked, goalUnlinked);
    expect(result.total).toBe(100);
    expect(result.links.orphaned).toEqual([]);
  });

  it('takes the dead-link share off the whole total, and only for reachable pages', async () => {
    expect((await grader.gradeSite(GOAL, GOAL)).result.links.deadLinkFactor).toBe(1);

    // The same files, with and without the one file a link on the home page leads to.
    const notes = '<a href="notes.txt">Notes</a>';
    const working: SiteFiles = { ...GOAL, 'index.html': doc('Home', nav() + notes + HOME), 'notes.txt': 'x' };
    const { 'notes.txt': _notes, ...dead } = working;
    const ok = (await grader.gradeSite(GOAL, working)).result;
    const bad = (await grader.gradeSite(GOAL, dead)).result;
    expect(ok.links.deadLinkFactor).toBe(1);
    expect(bad.links.broken).toEqual(['index.html -> notes.txt']);
    // One dead link, against the goal's six links (2 + 2 + 2).
    const factor = 1 - SITE.deadLinkPenalty / 6;
    expect(bad.links.deadLinkFactor).toBeCloseTo(factor, 10);
    expect(Math.abs(bad.total - ok.total * factor)).toBeLessThanOrEqual(0.1);

    // A dead link on a page nobody can reach is not counted.
    const orphanWithDead: SiteFiles = {
      ...GOAL,
      'index.html': doc('Home', twoLinkNav + HOME),
      'about.html': doc('About', twoLinkNav + ABOUT),
      'pricing.html': doc('Pricing', nav() + '<a href="gone.html">Gone</a>' + PRICING),
    };
    const orphaned = (await grader.gradeSite(GOAL, orphanWithDead)).result;
    expect(orphaned.links.orphaned).toEqual(['pricing.html']);
    expect(orphaned.links.broken).toEqual([]);
    expect(orphaned.links.deadLinkFactor).toBe(1);
  });
});

describe('what the owner asked for', () => {
  // The goal with spare bytes that change nothing on screen: comments in the
  // CSS and in each page. GOAL itself is then the same site, only leaner.
  const spareComment = `<!-- ${'notes for the designer '.repeat(40)} -->`;
  const PADDED_GOAL: SiteFiles = {
    'index.html': doc('Home', nav() + HOME + spareComment),
    'about.html': doc('About', nav() + ABOUT + spareComment),
    'pricing.html': doc('Pricing', nav() + PRICING + spareComment),
    'site.css': `/* ${'old rules kept for reference '.repeat(40)} */\n` + CSS,
  };

  it('scores a bloated site that looks perfect below a lean one whose colours and spacing are off', async () => {
    const junkCss = Array.from({ length: 1500 }, (_, i) => `.unused-${i} .x-${i} > p{color:#${(i % 900) + 100};margin:${i % 7}px}`).join('');
    const padding = `<!-- ${'padding '.repeat(15000)} -->`;
    const bloated: SiteFiles = {
      'index.html': doc('Home', nav() + HOME + padding),
      'about.html': doc('About', nav() + ABOUT + padding),
      'pricing.html': doc('Pricing', nav() + PRICING + padding),
      'site.css': CSS + junkCss,
    };
    const offCss = CSS.replace('#f3f4f6', '#fdf6e3')
      .replace('nav{background:#111827;padding:16px 40px}', 'nav{background:#7c2d12;padding:22px 48px}')
      .replace('main{padding:40px}', 'main{padding:52px}')
      .replace('color:#1d4ed8', 'color:#15803d');
    const offSite: SiteFiles = { ...GOAL, 'site.css': offCss };
    const bloatedResult = (await grader.gradeSite(GOAL, bloated)).result;
    const offResult = (await grader.gradeSite(GOAL, offSite)).result;
    expect(offResult.pillars.looks).toBeLessThan(100);
    expect(bloatedResult.pillars.looks).toBe(100);
    expect(bloatedResult.total).toBeLessThan(offResult.total);
  });

  it('lets a pixel-exact site that is smaller and faster than the goal score above 100', async () => {
    const { result } = await grader.gradeSite(PADDED_GOAL, GOAL);
    expect(result.exactMatch).toBe(true);
    expect(result.efficiency!.space.ratio).toBeLessThan(1);
    expect(result.efficiency!.time.checks.every((c) => c.ratio <= 1)).toBe(true);
    expect(result.efficiency!.beatsGoal).toBe(true);
    expect(result.bonus).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(100);
    expect(result.total).toBeLessThanOrEqual(100 + PERF.bonusMax);
  });

  it('gives no bonus to a leaner site that is not an exact match', async () => {
    const recoloured: SiteFiles = { ...GOAL, 'site.css': CSS.replace('color:#1d4ed8', 'color:#dc2626') };
    const { result } = await grader.gradeSite(PADDED_GOAL, recoloured);
    expect(result.efficiency!.space.ratio).toBeLessThan(1);
    expect(result.exactMatch).toBe(false);
    expect(result.bonus).toBe(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('never goes below 0, even for a correct-looking site over ten times too heavy everywhere', async () => {
    // Unused stylesheets that are not in the site: invisible, but each one is
    // a request every device has to wait for.
    const missing = Array.from({ length: 100 }, (_, i) => `<link rel="stylesheet" href="gone-${i}.css">`).join('');
    const padding = `<!-- ${'padding '.repeat(15000)} -->`;
    const head = '<link rel="stylesheet" href="site.css">' + missing;
    const heavy: SiteFiles = {
      'index.html': doc('Home', nav() + HOME + padding, head),
      'about.html': doc('About', nav() + ABOUT + padding, head),
      'pricing.html': doc('Pricing', nav() + PRICING + padding, head),
      'site.css': CSS,
    };
    const { result } = await grader.gradeSite(GOAL, heavy);
    expect(result.pillars.works).toBe(100);
    expect(result.efficiency!.space.ratio).toBeGreaterThan(10);
    for (const check of result.efficiency!.time.checks) expect(check.ratio).toBeGreaterThan(10);
    expect(result.pillars.engineering).toBe(-100);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(35);
  });

  it('ranks the bikes calibration site set as intended', async () => {
    const sets = await gradeSiteSets(grader);
    const bikes = sets.find((s) => s.name === 'bikes')!;
    const total = (name: string) => bikes.attempts.find((a) => a.name === name)!.result.total;
    expect(total('bloated')).toBeLessThan(total('slightly-off'));
    expect(total('lean-exact')).toBeGreaterThan(100);
    expect(total('same-site-other-names')).toBe(100);
    expect(total('blank')).toBeLessThan(3);
    expect(total('inline-css')).toBeLessThan(100);
    // A page nobody can reach, and links that lead nowhere, cost a lot.
    expect(total('orphan-page')).toBeLessThan(80);
    expect(total('orphan-page')).toBeLessThanOrEqual(total('same-site-other-names') - 15);
    expect(total('broken-links')).toBeLessThan(70);
    expect(total('broken-links')).toBeLessThan(total('orphan-page'));
    // Never building a page costs more than building it and forgetting to link it.
    expect(total('missing-page')).toBeLessThan(total('orphan-page'));
  }, 240_000);

  it('gives no bonus and no exact match to a leaner pixel-exact site with one dead link', async () => {
    // The home page's own Home link points at a file that is not there: same pixels, every goal link still present.
    const deadHome: SiteFiles = {
      ...GOAL,
      'index.html': doc('Home', nav().replace('href="index.html"', 'href="home.html"') + HOME),
    };
    const { result } = await grader.gradeSite(PADDED_GOAL, deadHome);
    expect(result.links.broken).toEqual(['index.html -> home.html']);
    expect(result.links.score).toBe(100);
    expect(result.pages.every((p) => p.total === 100)).toBe(true);
    expect(result.exactMatch).toBe(false);
    expect(result.bonus).toBe(0);
    expect(result.total).toBeLessThan(100);
  });
});

describe('the goal is the reference: nothing it does itself is charged', () => {
  const twoLinkNav = '<nav><a href="index.html">Home</a><a href="about.html">About</a></nav>';
  const notes = `<!-- ${'notes '.repeat(8000)} -->`;
  const FAULTY: Record<string, SiteFiles> = {
    'a dead link': { ...GOAL, 'index.html': doc('Home', nav() + '<a href="soon.html">Soon</a>' + HOME) },
    'a page nothing links to': {
      ...GOAL,
      'index.html': doc('Home', twoLinkNav + HOME),
      'about.html': doc('About', twoLinkNav + ABOUT),
    },
    'outside requests': {
      ...GOAL,
      'index.html': doc('Home', nav() + HOME, '<link rel="stylesheet" href="site.css"><link rel="stylesheet" href="https://cdn.example.com/a.css">'),
    },
    'a large file no page loads': { ...GOAL, 'notes.txt': notes },
    'no index.html': {
      'start.html': doc('Home', nav('about.html', 'pricing.html').replace('index.html', 'start.html') + HOME),
      'about.html': doc('About', nav().replace('index.html', 'start.html') + ABOUT),
      'pricing.html': doc('Pricing', nav().replace('index.html', 'start.html') + PRICING),
      'site.css': CSS,
    },
  };

  it.each(Object.keys(FAULTY))('scores a goal with %s exactly 100 against itself', async (fault) => {
    const { result } = await grader.gradeSite(FAULTY[fault], FAULTY[fault]);
    expect(result.total).toBe(100);
    expect(result.pillars).toEqual({ works: 100, engineering: 100, looks: 100 });
    expect(result.links.broken).toEqual([]);
    expect(result.feedback).toEqual([]);
  });

  it('charges a dead link the goal does not have, and not one it does', async () => {
    const goal = FAULTY['a dead link'];
    const fixed = (await grader.gradeSite(goal, GOAL)).result;
    const extra = (await grader.gradeSite(goal, { ...goal, 'about.html': doc('About', nav() + '<a href="gone.html">Gone</a>' + ABOUT) })).result;
    expect(fixed.links.deadLinkFactor).toBe(1);
    expect(extra.links.broken).toEqual(['about.html -> gone.html']);
    expect(extra.links.excused).toEqual(['index.html -> soon.html']);
    expect(extra.links.deadLinkFactor).toBeLessThan(1);
  });

  it('counts dead links on a reachable page the goal does not have', async () => {
    const extraNav = nav() + '<a href="extra.html">Extra</a>';
    const site: SiteFiles = {
      ...GOAL,
      'index.html': doc('Home', extraNav + HOME),
      'extra.html': doc('Extra', '<a href="index.html">Home</a><a href="gone.html">Gone</a>'),
    };
    const { result } = await grader.gradeSite(GOAL, site);
    expect(result.links.broken).toEqual(['extra.html -> gone.html']);
    expect(result.links.deadLinkFactor).toBeLessThan(1);
  });
});

describe('dead links cannot be watered down', () => {
  it('scores a site with a dead link no higher after adding a page full of working links', async () => {
    const dead = '<a href="gone.html">Gone</a>';
    const withDead: SiteFiles = { ...GOAL, 'index.html': doc('Home', nav() + dead + HOME) };
    const padded: SiteFiles = {
      ...withDead,
      'index.html': doc('Home', nav() + dead + '<a href="links.html">More</a>' + HOME),
      'links.html': doc('Links', nav() + '<a href="site.css">Styles</a>'),
    };
    const a = (await grader.gradeSite(GOAL, withDead)).result;
    const b = (await grader.gradeSite(GOAL, padded)).result;
    expect(b.links.deadLinkFactor).toBe(a.links.deadLinkFactor);
    expect(b.total).toBeLessThanOrEqual(a.total);
  });
});

describe('pairing pages', () => {
  it('pairs two nearly identical pages the right way round when their names are swapped', async () => {
    const plan = (price: string) => `<main><h1>Plans</h1><div class="card"><p>The Commuter</p><p class="price">${price}</p></div></main>`;
    const goal: SiteFiles = {
      'index.html': doc('Home', nav('a.html', 'b.html') + HOME),
      'a.html': doc('A', nav('a.html', 'b.html') + plan('$890')),
      'b.html': doc('B', nav('a.html', 'b.html') + plan('$990')),
      'site.css': CSS,
    };
    const swapped: SiteFiles = {
      'index.html': doc('Home', nav('b.html', 'a.html') + HOME),
      'a.html': doc('B', nav('b.html', 'a.html') + plan('$990')),
      'b.html': doc('A', nav('b.html', 'a.html') + plan('$890')),
      'site.css': CSS,
    };
    const { result } = await grader.gradeSite(goal, swapped);
    expect(result.pages.map((p) => p.candidate)).toEqual(['index.html', 'b.html', 'a.html']);
    expect(result.total).toBe(100);
  });

  it('pairs by look when two pages were given each other\'s names', async () => {
    const swappedNav = nav('pricing.html', 'about.html');
    const swapped: SiteFiles = {
      'index.html': doc('Home', swappedNav + HOME),
      'about.html': doc('Pricing', swappedNav + PRICING),
      'pricing.html': doc('About', swappedNav + ABOUT),
      'site.css': CSS,
    };
    const { result } = await grader.gradeSite(GOAL, swapped);
    expect(result.pages.map((p) => p.candidate)).toEqual(['index.html', 'pricing.html', 'about.html']);
    expect(result.links.found).toBe(6);
    expect(result.total).toBe(100);
  });

  it('prefers the exact file name over one that differs only in case', async () => {
    const site: SiteFiles = { ...GOAL, 'About.html': doc('Other', nav() + '<main><h1>Something else</h1></main>') };
    const { result } = await grader.gradeSite(GOAL, site);
    expect(result.pages[1].candidate).toBe('about.html');
    expect(result.pages[1].total).toBe(100);
  });
});

describe('feedback', () => {
  const twoLinkNav = '<nav><a href="index.html">Home</a><a href="about.html">About</a></nav>';
  const grade = async (files: SiteFiles) => (await grader.gradeSite(GOAL, files)).result;

  it('puts each known mistake at the top, with points that add up to what it cost', async () => {
    const { 'pricing.html': _p, ...missing } = GOAL;
    const cases: [SiteFiles, RegExp][] = [
      [missing, /^The pricing page was never made$/],
      [{ ...GOAL, 'index.html': doc('Home', twoLinkNav + HOME), 'about.html': doc('About', twoLinkNav + ABOUT) }, /^Nothing links to the pricing page/],
      [
        { ...GOAL, 'index.html': doc('Home', nav('about.html', 'prices.html') + HOME), 'about.html': doc('About', nav('about.html', 'prices.html') + ABOUT), 'pricing.html': doc('Pricing', nav('about.html', 'prices.html') + PRICING) },
        /^Nothing links to the pricing page|links lead to pages that do not exist: prices\.html$/,
      ],
      [{ ...GOAL, 'site.css': CSS + `/* ${'x'.repeat(60_000)} */` }, /^The site is \d+ times the size of the goal$/],
    ];
    for (const [files, top] of cases) {
      const r = await grade(files);
      expect(r.feedback.length).toBeGreaterThan(0);
      expect(r.feedback.length).toBeLessThanOrEqual(SITE.feedbackMax);
      expect(r.feedback[0].message, JSON.stringify(r.feedback)).toMatch(top);
      // Most costly first; no line costs more than the site lost.
      for (let i = 1; i < r.feedback.length; i++) expect(r.feedback[i].points).toBeLessThanOrEqual(r.feedback[i - 1].points);
      expect(r.feedback[0].points).toBeLessThanOrEqual(100 - r.total + 0.1);
    }
  });

  it('names a missing link between two pages that are both there', async () => {
    // The About entry on the home page is plain text styled like the links: it looks the same but goes nowhere.
    const span = '<span style="color:#fff;margin-right:24px;text-decoration:none;font-size:16px">About</span>';
    const r = await grade({ ...GOAL, 'index.html': doc('Home', nav().replace('<a href="about.html">About</a>', span) + HOME) });
    expect(r.links.missing).toEqual(['index.html -> about.html']);
    const line = r.feedback.find((f) => f.message === 'The home page has no link to the about page');
    expect(line, JSON.stringify(r.feedback)).toBeDefined();
    // One of six goal links is worth 100 x (0.40 + 0.35) x 0.25 / 6, about 3.1 points.
    expect(Math.abs(line!.points - (100 * (0.4 + 0.35) * SITE.linkShare) / 6)).toBeLessThanOrEqual(0.3);
  });

  it('names dead links, and gives none for a perfect site', async () => {
    const notes = '<a href="notes.txt">Notes</a>';
    const r = await grade({ ...GOAL, 'index.html': doc('Home', nav() + notes + HOME) });
    expect(r.feedback.map((f) => f.message)).toContain('1 link leads to a page that does not exist: notes.txt');
    expect((await grade(GOAL)).feedback).toEqual([]);
  });

  it('is identical on every run', async () => {
    const partial: SiteFiles = { ...GOAL, 'pricing.html': doc('Pricing', twoLinkNav + '<main><h1>Pricing</h1></main>') };
    const a = await grade(partial);
    const b = await grade(partial);
    expect(a.feedback.length).toBeGreaterThan(0);
    expect(JSON.stringify(b.feedback)).toBe(JSON.stringify(a.feedback));
    expect(a.feedback.some((f) => f.message.startsWith('On the pricing page: '))).toBe(true);
  });
});

describe('site safety', () => {
  let server: Server;
  let hits = 0;
  let origin = '';

  beforeAll(async () => {
    server = createServer((_req, res) => {
      hits++;
      res.end('x');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('serves only the submitted files: nothing from the network or the disk', async () => {
    const attack: SiteFiles = {
      'index.html': doc(
        'Home',
        `<h1>Still here</h1><img src="${origin}/a.png"><iframe src="${origin}/b.html"></iframe>` +
          '<iframe src="file:///C:/Windows/win.ini"></iframe><iframe src="other.html"></iframe>' +
          '<link rel="stylesheet" href="file:///C:/Windows/win.ini"><a href="../../../Windows/win.ini">up</a>' +
          '<script src="evil.js"></script><script>document.body.innerHTML="pwned"</script>',
        `<link rel="stylesheet" href="${origin}/c.css"><link rel="stylesheet" href="site.css">` +
          `<style>@import url("${origin}/d.css");body{background:url("${origin}/e.png")}</style>`,
      ),
      'other.html': doc('Other', '<p>Framed page</p>', ''),
      'evil.js': 'document.body.innerHTML = "pwned"',
      'site.css': CSS,
    };
    const { result, candidate } = await grader.gradeSite(attack, attack);
    expect(hits).toBe(0);
    // Graded against itself it scores 100: its one link is dead (see the end
    // of this test), but the goal has the same dead link, so it costs nothing.
    expect(result.links.deadLinkFactor).toBe(1);
    expect(result.total).toBe(100);
    expect(result.feedback).toEqual([]);
    const home = candidate!.page('index.html')!;
    expect(home.snapshot.blocks.filter((b) => b.kind === 'text').map((b) => b.text)).toContain('Still here');
    // The page and its stylesheet were served. The script was not, nor the framed page, nor anything outside.
    expect(home.stats.files).toEqual(['index.html', 'site.css']);
    expect(home.stats.blockedRequests).toBeGreaterThanOrEqual(4);
    // A link that climbs out of the site resolves back inside it, to a file that is not there.
    expect(home.linksTo).toContain('Windows/win.ini');
    expect(result.links.broken).toEqual([]);
    expect(result.links.excused).toContain('index.html -> Windows/win.ini');
  });

  it('counts outside requests against load time, so leaning on a CDN is not free', async () => {
    const withCdn: SiteFiles = {
      ...GOAL,
      'index.html': doc(
        'Home',
        nav() + HOME,
        '<link rel="stylesheet" href="site.css"><link rel="stylesheet" href="https://fonts.example.com/a.css">' +
          '<link rel="stylesheet" href="https://cdn.example.com/b.css">',
      ),
    };
    const { result, candidate } = await grader.gradeSite(GOAL, withCdn);
    expect(candidate!.page('index.html')!.stats.blockedRequests).toBe(2);
    const checks = result.efficiency!.time.checks;
    expect(checks.every((c) => c.estimatedMs > c.referenceMs)).toBe(true);
    expect(result.pillars.works).toBe(100);
    expect(result.pillars.looks).toBe(100);
  });
});
