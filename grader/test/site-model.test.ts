import { describe, expect, it } from 'vitest';
import { looksPowerOf, engineeringPowerOf, sitesModel, siteValues, type PageScores, type SiteMeasurements, type SitePageMeasurement } from '../src/criteria/site-model';
import { SITE, SITE_WEIGHTS } from '../src/site-config';

/**
 * The site model's structure keeps its promises for any constants inside
 * their bounds: checked on small hand-made sites over a grid of values
 * (every corner of the bounds at once, today's values, and seeded points
 * where each constant sits at its minimum, middle or maximum).
 */

const params = sitesModel.params;
const names = Object.keys(params);

function grid(): Record<string, number>[] {
  const pick = (which: (p: (typeof params)[string]) => number) => Object.fromEntries(names.map((n) => [n, params[n].fixed ? params[n].value : which(params[n])]));
  const out = [siteValues(), pick((p) => p.min), pick((p) => p.max), pick((p) => (p.min + p.max) / 2)];
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let k = 0; k < 40; k++) {
    out.push(
      pick((p) => {
        const r = rand();
        return r < 0.35 ? p.min : r < 0.7 ? p.max : p.min + (p.max - p.min) * rand();
      }),
    );
  }
  return out;
}
const GRID = grid();

const S = (content: number | null, layout: number, style: number, visual: number): PageScores => ({ content, layout, style, visual });

function page(goal: string, scores: PageScores, extra: Partial<SitePageMeasurement> = {}): SitePageMeasurement {
  return {
    goal,
    candidate: goal,
    built: true,
    reachable: true,
    ownWords: 20,
    ownShare: 1,
    scores,
    scoresWithoutDeadLinks: null,
    pageTotal: 90,
    movedShare: 0,
    movedTo: null,
    ...extra,
  };
}

interface Bytes {
  bytes: number;
  ref: number;
  ms: number[];
  refMs: number[];
}

/** A small site: pages, the goal's links as [from, to] page indices with whether each works, and the size. */
function site(pages: SitePageMeasurement[], links: { from: number; to: number; works: boolean }[], size: Bytes, quality = 1): SiteMeasurements {
  const found = links.filter((l) => l.works);
  const m: SiteMeasurements & { testLinks?: unknown } = {
    pages,
    links: {
      goalUses: links.length,
      expected: links.length,
      found: found.length,
      foundTo: found.map((l) => l.to),
      missing: links.length - found.length,
      broken: 0,
      brokenCovered: pages.map(() => 0),
      excused: 0,
      extra: 0,
    },
    pagesNeverBuilt: [],
    pagesUnreachable: [],
    efficiency: {
      bytes: size.bytes,
      referenceBytes: size.ref,
      devices: size.ms.map((ms, i) => ({ name: `d${i}`, estimatedMs: ms, referenceMs: size.refMs[i] })),
    },
    quality: {
      pages: pages.map((p) => ({ goal: p.goal, accessibility: quality, cleanCode: quality, accessibilityIssues: [], cleanCodeIssues: [] })),
      unusedFiles: [],
      badReferences: [],
      unusedStyles: { extra: 0, file: null },
    },
    exact: {
      pagesPerfect: pages.every((p) => p.built && p.reachable && p.pageTotal === 100),
      linksComplete: found.length === links.length,
      noBrokenLinks: true,
    },
  };
  m.testLinks = links;
  return m;
}

const clone = (m: SiteMeasurements): SiteMeasurements => JSON.parse(JSON.stringify(m));
const score = (m: SiteMeasurements, v: Record<string, number>) => sitesModel.score(m, v);
const allLinks = (n: number) => {
  const out: { from: number; to: number; works: boolean }[] = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) out.push({ from: a, to: b, works: true });
  return out;
};

const SIZE: Bytes = { bytes: 12000, ref: 10000, ms: [900, 300, 80], refMs: [800, 280, 70] };

/** The base sites every property is checked on. */
const SITES: { name: string; site: SiteMeasurements }[] = [
  { name: 'three good pages', site: site([page('index.html', S(0.95, 0.9, 0.9, 0.85)), page('about.html', S(0.9, 0.85, 0.9, 0.8)), page('contact.html', S(0.92, 0.88, 0.85, 0.86))], allLinks(3), SIZE) },
  {
    name: 'one weak page',
    site: site([page('index.html', S(0.9, 0.9, 0.9, 0.9)), page('a.html', S(0.3, 0.4, 0.5, 0.3)), page('b.html', S(0.85, 0.8, 0.8, 0.8)), page('c.html', S(0.8, 0.7, 0.9, 0.7))], allLinks(4), SIZE, 0.8),
  },
  {
    name: 'thin page, heavy site',
    site: site(
      [page('index.html', S(0.8, 0.85, 0.7, 0.75)), page('docs.html', S(0.6, 0.7, 0.7, 0.6), { ownShare: 0.2 }), page('faq.html', S(null, 0.6, 0.8, 0.7), { ownWords: 4, ownShare: 0.3 })],
      allLinks(3),
      { bytes: 40000, ref: 10000, ms: [3000, 900, 200], refMs: [800, 280, 70] },
      0.6,
    ),
  },
  { name: 'two pages', site: site([page('index.html', S(0.7, 0.6, 0.6, 0.5)), page('b.html', S(0.95, 0.9, 0.95, 0.9))], allLinks(2), SIZE) },
  {
    name: 'partial links',
    site: site(
      [page('index.html', S(0.9, 0.8, 0.8, 0.8)), page('b.html', S(0.5, 0.6, 0.4, 0.5)), page('c.html', S(0.99, 0.95, 0.95, 0.9))],
      allLinks(3).map((l, i) => ({ ...l, works: i % 2 === 0 })),
      SIZE,
    ),
  },
];

type Link = { from: number; to: number; works: boolean };
const linksOf = (m: SiteMeasurements): Link[] => (m as unknown as { testLinks: Link[] }).testLinks;

/** Sets which goal links work, and the counts that follow from it. */
function setLinks(m: SiteMeasurements, links: Link[]) {
  (m as unknown as { testLinks: Link[] }).testLinks = links;
  const found = links.filter((l) => l.works);
  m.links.foundTo = found.map((l) => l.to);
  m.links.found = found.length;
  m.links.missing = links.length - found.length;
  m.exact.linksComplete = found.length === links.length;
}

/** A working link (index k) removed (missing), made dead, or left working. */
function linkVariant(base: SiteMeasurements, k: number, kind: 'working' | 'removed' | 'dead', without: PageScores): SiteMeasurements {
  const m = clone(base);
  if (kind === 'working') return m;
  const links = linksOf(m).map((l, i) => (i === k ? { ...l, works: false } : l));
  setLinks(m, links);
  const from = links[k].from;
  if (kind === 'removed') {
    m.pages[from].scores = without;
  } else {
    m.links.broken++;
    m.pages[from].scoresWithoutDeadLinks = without;
    m.exact.noBrokenLinks = false;
  }
  return m;
}

/** Page i never built: links to it are dead ends aimed at a missing page, links from it are gone. */
function deleted(base: SiteMeasurements, i: number): SiteMeasurements {
  const m = clone(base);
  dropPage(m, i);
  m.pages[i] = { ...m.pages[i], candidate: null, built: false, reachable: false, scores: null, scoresWithoutDeadLinks: null, pageTotal: null, ownWords: 0, ownShare: 0 };
  m.pagesNeverBuilt = [m.pages[i].goal];
  return m;
}

/** Page i built but unreachable: the links to it are broken (aimed at an unreachable page), its own links cannot be followed. */
function unreachable(base: SiteMeasurements, i: number): SiteMeasurements {
  const m = clone(base);
  dropPage(m, i);
  m.pages[i].reachable = false;
  m.pagesUnreachable = [m.pages[i].goal];
  return m;
}

/** The links to page i become dead ends aimed at it (the ones that worked, and the missing ones a visitor would click are not counted); its own links stop counting; it leaves the quality mean. */
function dropPage(m: SiteMeasurements, i: number) {
  const links = linksOf(m);
  m.links.brokenCovered[i] += links.filter((l) => l.to === i && l.works).length;
  setLinks(m, links.map((l) => (l.to === i || l.from === i ? { ...l, works: false } : l)));
  if (m.links.brokenCovered[i] > 0) m.exact.noBrokenLinks = false;
  m.exact.pagesPerfect = false;
  m.quality.pages = m.quality.pages.filter((q) => q.goal !== m.pages[i].goal);
}

describe('site model: structure', () => {
  it('lists every constant with its value inside its bounds, and fixes the pillar weights', () => {
    for (const [name, p] of Object.entries(params)) {
      expect(p.min, name).toBeLessThanOrEqual(p.value);
      expect(p.value, name).toBeLessThanOrEqual(p.max);
      expect(p.meaning.length, name).toBeGreaterThan(10);
    }
    expect(params.worksWeight).toMatchObject({ value: SITE_WEIGHTS.works, fixed: true });
    expect(params.looksWeight).toMatchObject({ value: SITE_WEIGHTS.looks, fixed: true });
    expect(params.engineeringWeight).toMatchObject({ value: SITE_WEIGHTS.engineering, fixed: true });
    expect(params.deadLinkPenalty.value).toBe(SITE.deadLinkPenalty);
  });

  it('reads its measurements back from a bench record', () => {
    const m = SITES[0].site;
    expect(sitesModel.extract({ result: { measurements: m } })).toBe(m);
    expect(sitesModel.extract({ measurements: m })).toBe(m);
    expect(sitesModel.extract({ total: 3 })).toBeNull();
  });

  it('a site against itself scores exactly 100, whatever the constants', () => {
    const n = 3;
    const pages = ['index.html', 'a.html', 'b.html'].map((g) => page(g, S(1, 1, 1, 1), { pageTotal: 100 }));
    const self = site(pages, allLinks(n), { bytes: 5000, ref: 5000, ms: [700, 200], refMs: [700, 200] });
    for (const v of GRID) expect(score(self, v)).toBe(100);
  });

  it('a dead link never scores above the same link removed, or working', () => {
    let checked = 0;
    for (const { name, site: base } of SITES) {
      linksOf(base).forEach((l, idx) => {
        if (!l.works) return;
        const as = base.pages[l.from].scores!;
        for (const shift of [-0.05, 0.05]) {
          const without = S(as.content === null ? null : Math.min(1, Math.max(0, as.content + shift)), as.layout, as.style, Math.min(1, as.visual + shift / 2));
          const working = linkVariant(base, idx, 'working', without);
          const removed = linkVariant(base, idx, 'removed', without);
          const dead = linkVariant(base, idx, 'dead', without);
          for (const v of GRID) {
            const d = score(dead, v);
            expect(d, `${name} ${idx} dead vs removed`).toBeLessThanOrEqual(score(removed, v));
            expect(d, `${name} ${idx} dead vs working`).toBeLessThanOrEqual(score(working, v));
            checked++;
          }
        }
      });
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('a dead link aimed at a missing page never scores above no link at all', () => {
    for (const { name, site: base } of SITES) {
      const gone = deleted(base, 1);
      const dead = clone(gone);
      dead.links.brokenCovered[1]++;
      for (const v of GRID) expect(score(dead, v), name).toBeLessThanOrEqual(score(gone, v));
    }
  });

  it('deleting a built page never raises the score; making it unreachable never raises it; unreachable never scores below never built', () => {
    for (const { name, site: base } of SITES) {
      for (let i = 1; i < base.pages.length; i++) {
        const gone = deleted(base, i);
        const hidden = unreachable(base, i);
        for (const v of GRID) {
          const full = score(base, v);
          expect(score(gone, v), `${name} delete ${i}`).toBeLessThanOrEqual(full);
          expect(score(hidden, v), `${name} unreachable ${i}`).toBeLessThanOrEqual(full);
          expect(score(hidden, v), `${name} unreachable vs never built ${i}`).toBeGreaterThanOrEqual(score(gone, v));
        }
      }
    }
  });

  it('adding weight (bytes, requests) never raises the score', () => {
    const perfect = site(['index.html', 'a.html'].map((g) => page(g, S(1, 1, 1, 1), { pageTotal: 100 })), allLinks(2), { bytes: 6000, ref: 8000, ms: [600, 200], refMs: [700, 250] });
    const bases = [...SITES.map((s) => s.site), perfect];
    for (const base of bases) {
      for (const factor of [1.1, 1.5, 3, 12]) {
        const heavier = clone(base);
        heavier.efficiency!.bytes *= factor;
        const slower = clone(base);
        slower.efficiency!.devices[0].estimatedMs *= factor;
        const both = clone(heavier);
        for (const d of both.efficiency!.devices) d.estimatedMs *= factor;
        for (const v of GRID) {
          const s = score(base, v);
          expect(score(heavier, v)).toBeLessThanOrEqual(s);
          expect(score(slower, v)).toBeLessThanOrEqual(s);
          expect(score(both, v)).toBeLessThanOrEqual(s);
        }
      }
    }
  });
});

describe('site model: powers follow the reference size', () => {
  it('uses the Small power at the small size, the Large at the large size, and one strictly between', () => {
    const v = siteValues();
    expect(looksPowerOf(v.smallPageBlocks, v)).toBe(v.looksPowerSmall);
    expect(looksPowerOf(v.largePageBlocks, v)).toBe(v.looksPowerLarge);
    expect(engineeringPowerOf(v.smallPageBlocks, v)).toBe(v.engineeringPowerSmall);
    expect(engineeringPowerOf(v.largePageBlocks, v)).toBe(v.engineeringPowerLarge);
    const l = looksPowerOf(Math.sqrt(v.smallPageBlocks * v.largePageBlocks), v);
    const e = engineeringPowerOf(Math.sqrt(v.smallPageBlocks * v.largePageBlocks), v);
    expect(l).toBeLessThan(v.looksPowerSmall);
    expect(l).toBeGreaterThan(v.looksPowerLarge);
    expect(e).toBeLessThan(v.engineeringPowerSmall);
    expect(e).toBeGreaterThan(v.engineeringPowerLarge);
  });
});
