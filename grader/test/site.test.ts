import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERF, SITE } from '../src/config';
import { Grader, type SiteFiles } from '../src/index';
import { estimateLoadMs, type PageStats } from '../src/performance';
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
    expect(result.fidelity).toBe(100);
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
    expect(result.fidelity).toBe(100);
    expect(result.efficiency!.score).toBe(100);
    expect(result.pages.map((p) => [p.goal, p.candidate, p.total])).toEqual([
      ['index.html', 'index.html', 100],
      ['about.html', 'about.html', 100],
      ['pricing.html', 'pricing.html', 100],
    ]);
    expect(result.links).toEqual({ score: 100, expected: 6, found: 6, missing: [], broken: [] });
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
    expect(result.fidelity).toBe(100);
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
    expect(result.fidelity).toBe(100);
    // Three copies of the CSS is a bigger site than one shared file, but well inside the allowance.
    expect(result.efficiency!.space.bytes).toBeGreaterThan(result.efficiency!.space.referenceBytes);
    expect(result.total).toBeGreaterThan(97);
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
    expect(result.links.broken).toEqual([
      'about.html -> prices.html',
      'index.html -> prices.html',
      'pricing.html -> prices.html',
    ]);
    expect(result.links.found).toBe(4);
    expect(result.links.score).toBeLessThan(60);
    expect(result.pages.every((p) => p.total === 100)).toBe(true);
    expect(result.total).toBeLessThan(95);
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
    expect(result.fidelity).toBe(100);
    expect(result.efficiency!.space.credit).toBe(0);
    expect(result.efficiency!.time.checks.some((c) => !c.passed)).toBe(true);
    expect(result.efficiency!.score).toBeLessThan(40);
    // The most efficiency can take off is its share of the total.
    expect(result.total).toBeGreaterThanOrEqual(100 * (1 - PERF.qualityShare));
    expect(result.total).toBeLessThan(90);
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
    expect(result.total).toBe(100);
    const home = candidate!.page('index.html')!;
    expect(home.snapshot.blocks.filter((b) => b.kind === 'text').map((b) => b.text)).toContain('Still here');
    // The page and its stylesheet were served. The script was not, nor the framed page, nor anything outside.
    expect(home.stats.files).toEqual(['index.html', 'site.css']);
    expect(home.stats.blockedRequests).toBeGreaterThanOrEqual(4);
    // A link that climbs out of the site resolves back inside it, to a file that is not there.
    expect(home.linksTo).toContain('Windows/win.ini');
    expect(result.links.broken).toContain('index.html -> Windows/win.ini');
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
    expect(result.fidelity).toBe(100);
  });
});
