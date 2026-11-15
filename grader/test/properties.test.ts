// Property tests: rules that must hold for any page, checked over many
// generated pages. A failure names the seed and shows the numbers.
import { afterAll, describe, expect, it } from 'vitest';
import { Grader, type GradeResult, type PageSnapshot, type SiteFiles } from '../src/index';
import {
  clone, drift, randomPage, randomSection, rng, toHtml, toParts, words,
  type PageDesc, type RGB,
} from './helpers/random-page';

const grader = new Grader();
afterAll(() => grader.close());

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// The pairings matrix grows with the square of the seed count, so it uses
// eight seeds (still one of each edge kind) to keep the file near three minutes.
const PAIR_SEEDS = SEEDS.slice(0, 8);
const SITE_SEEDS = [21, 22, 23];
// The slowest site properties run on two seeds for the same reason.
const SLOW_SITE_SEEDS = SITE_SEEDS.slice(0, 2);

const pages = new Map<number, PageDesc>(SEEDS.map((s) => [s, randomPage(s)]));
const snaps = new Map<number, Promise<PageSnapshot>>();
function goalSnap(seed: number): Promise<PageSnapshot> {
  if (!snaps.has(seed)) snaps.set(seed, grader.render(toHtml(pages.get(seed)!)));
  return snaps.get(seed)!;
}

async function grade(seed: number, html: string): Promise<GradeResult> {
  return (await grader.grade(await goalSnap(seed), html)).result;
}

const r1 = (n: number | null) => (n === null ? 'null' : (Math.round(n * 10) / 10).toString());
function fmt(r: GradeResult): string {
  const b = r.breakdown;
  return `total ${r1(r.total)} (content ${r1(b.content)}, layout ${r1(b.layout)}, style ${r1(b.style)}, visual ${r1(b.visual)})${r.error ? ` error: ${r.error}` : ''}`;
}

/** Steps whose totals must never rise; returns one line per rise. */
function rises(label: string, steps: { name: string; total: number; text: string }[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].total > steps[i - 1].total) {
      out.push(`${label}: ${steps[i - 1].name} -> ${steps[i].name} rose: ${steps[i - 1].text}  ->  ${steps[i].text}`);
    }
  }
  return out;
}

async function monotone(
  label: string,
  variants: (page: PageDesc) => { name: string; html: string }[],
  seeds = SEEDS,
): Promise<{ failures: string[]; results: Map<number, { name: string; result: GradeResult }[]> }> {
  const failures: string[] = [];
  const results = new Map<number, { name: string; result: GradeResult }[]>();
  for (const seed of seeds) {
    const steps: { name: string; result: GradeResult }[] = [];
    for (const v of variants(pages.get(seed)!)) steps.push({ name: v.name, result: await grade(seed, v.html) });
    results.set(seed, steps);
    failures.push(...rises(`seed ${seed} (${pages.get(seed)!.kind}) ${label}`, steps.map((s) => ({ name: s.name, total: s.result.total, text: fmt(s.result) }))));
  }
  return { failures, results };
}

// Every pairing of two different generated pages, computed once.
let matrixPromise: Promise<Map<string, GradeResult>> | null = null;
function matrix(): Promise<Map<string, GradeResult>> {
  matrixPromise ??= (async () => {
    const m = new Map<string, GradeResult>();
    for (const g of PAIR_SEEDS) for (const c of PAIR_SEEDS) if (g !== c) m.set(`${g}:${c}`, await grade(g, toHtml(pages.get(c)!)));
    return m;
  })();
  return matrixPromise;
}

/** One small edit: one paragraph's text replaced (or the heading, or one box's colour). */
function smallEdit(page: PageDesc): PageDesc {
  const p = clone(page);
  const r = rng(page.seed + 999);
  for (const s of p.sections) {
    if (s.paragraphs.length) {
      const n = s.paragraphs[0].split(' ').length;
      s.paragraphs[0] = words(r, n) + '.';
      return p;
    }
  }
  for (const s of p.sections) {
    if (s.heading) {
      s.heading = words(r, s.heading.split(' ').length);
      return p;
    }
  }
  const card = p.sections[0].cards[0];
  card.bg = drift(card.bg, 0.15);
  return p;
}

describe('single pages', () => {
  it('covers the edge kinds', () => {
    const kinds = new Set(SEEDS.map((s) => pages.get(s)!.kind));
    expect([...kinds].sort()).toEqual(['boxes', 'long', 'normal', 'single']);
  });

  it('identity: every page scores 100 against itself', async () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const r = await grade(seed, toHtml(pages.get(seed)!));
      const b = r.breakdown;
      const ok = r.total === 100 && (b.content === 100 || (b.content === null && pages.get(seed)!.kind === 'boxes')) &&
        b.layout === 100 && b.style === 100 && b.visual === 100;
      if (!ok) failures.push(`seed ${seed}: ${fmt(r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('bounds: every pairing gives finite parts within 0 to 100', async () => {
    const failures: string[] = [];
    for (const [key, r] of await matrix()) {
      const vals = [r.total, r.breakdown.layout, r.breakdown.style, r.breakdown.visual, ...(r.breakdown.content === null ? [] : [r.breakdown.content])];
      if (!vals.every((v) => Number.isFinite(v) && v >= 0 && v <= 100) || r.error) failures.push(`goal:candidate ${key}: ${fmt(r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('unrelated is worse than close: a one-edit copy beats every other page', async () => {
    const m = await matrix();
    const failures: string[] = [];
    for (const g of PAIR_SEEDS) {
      const close = await grade(g, toHtml(smallEdit(pages.get(g)!)));
      for (const c of PAIR_SEEDS) {
        if (c === g) continue;
        const other = m.get(`${g}:${c}`)!;
        if (!(close.total > other.total)) {
          failures.push(`goal seed ${g} (${pages.get(g)!.kind}): one-edit copy ${fmt(close)} <= unrelated seed ${c} ${fmt(other)}`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('symmetry of nonsense: two unrelated pages score under 60 both ways', async () => {
    const m = await matrix();
    const failures: string[] = [];
    for (const [key, r] of m) if (r.total >= 60) failures.push(`goal:candidate ${key}: ${fmt(r)}`);
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('removing content never helps: dropping sections from the end', async () => {
    const { failures } = await monotone('remove sections', (page) => {
      const out = [];
      for (let keep = page.sections.length; keep >= 0; keep--) {
        const p = clone(page);
        p.sections = p.sections.slice(0, keep);
        out.push({ name: `${keep} sections`, html: toHtml(p) });
      }
      return out;
    });
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('adding junk never helps: 0, 1, 2, 4 extra sections', async () => {
    const { failures } = await monotone('add junk', (page) => {
      const r = rng(page.seed + 4242);
      const theme = { bg: page.bg, fg: page.fg, card: [200, 200, 200] as RGB, cardFg: [20, 20, 20] as RGB, dark: false };
      const junk = [0, 1, 2, 3].map(() => {
        const s = randomSection(r, theme, page.kind !== 'boxes');
        s.paragraphs = s.paragraphs.slice(0, 1);
        return s;
      });
      return [0, 1, 2, 4].map((n) => {
        const p = clone(page);
        p.sections.push(...junk.slice(0, n));
        return { name: `+${n} sections`, html: toHtml(p) };
      });
    });
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('moving further never helps: shifting down 0 to 400 px, and 6 px costs at most 1', async () => {
    const shifts = [0, 6, 20, 60, 150, 400];
    const { failures, results } = await monotone('shift', (page) =>
      shifts.map((dy) => ({ name: `${dy}px`, html: toHtml(page, { shiftY: dy }) })),
    );
    for (const [seed, steps] of results) {
      if (steps[0].result.total - steps[1].result.total > 1) {
        failures.push(`seed ${seed}: 6 px shift cost more than 1: ${fmt(steps[0].result)} -> ${fmt(steps[1].result)}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('drifting colour never helps, and the first barely visible step costs at most 1', async () => {
    const ts = [0, 0.015, 0.08, 0.2, 0.45, 0.8];
    const targets = new Map<number, string>();
    const { failures, results } = await monotone('colour drift', (page) => {
      const withButton = page.sections.findIndex((s) => s.button);
      const useButton = withButton >= 0 && page.seed % 2 === 1;
      targets.set(page.seed, useButton ? `button in section ${withButton}` : 'section 0 background');
      return ts.map((t) => {
        const p = clone(page);
        if (useButton) p.sections[withButton].button!.bg = drift(page.sections[withButton].button!.bg, t);
        else p.sections[0].bg = drift(page.sections[0].bg, t);
        return { name: `t=${t}`, html: toHtml(p) };
      });
    });
    for (const [seed, steps] of results) {
      if (steps[0].result.total - steps[1].result.total > 1) {
        failures.push(`seed ${seed} (${targets.get(seed)}): first step cost more than 1: ${fmt(steps[0].result)} -> ${fmt(steps[1].result)}`);
      }
    }
    const named = failures.map((f) => {
      const seed = Number(/seed (\d+)/.exec(f)?.[1]);
      return f.includes('first step') ? f : `${f}  [target: ${targets.get(seed)}]`;
    });
    expect(named, named.join('\n')).toEqual([]);
  });

  it('shrinking text never helps: font scale 1, 0.95, 0.8, 0.6, 0.4', async () => {
    const { failures } = await monotone('font scale', (page) =>
      [1, 0.95, 0.8, 0.6, 0.4].map((k) => ({ name: `x${k}`, html: toHtml(page, { fontScale: k }) })),
    );
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('markup does not matter: divs, class names and grid rows score at least 99', async () => {
    const failures: string[] = [];
    const variants = [
      { name: 'divs + inline', opts: { markup: 'plain', css: 'inline' } },
      { name: 'semantic + class sheet', opts: { markup: 'semantic', css: 'sheet', classPrefix: 'zz' } },
      { name: 'divs + class sheet + grid rows', opts: { markup: 'plain', css: 'sheet', rows: 'grid', classPrefix: 'k' } },
    ] as const;
    for (const seed of SEEDS) {
      for (const v of variants) {
        const r = await grade(seed, toHtml(pages.get(seed)!, v.opts));
        if (r.total < 99) failures.push(`seed ${seed} (${pages.get(seed)!.kind}) ${v.name}: ${fmt(r)}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------- sites

const PAGE_FILES = ['index.html', 'about.html', 'contact.html'];
const LABELS = ['Home', 'About', 'Contact'];

interface SiteOpts {
  pages?: number[]; // which of the three pages to include
  dropLinks?: number; // how many nav links to remove, in a fixed order
  extraCss?: string;
}

function buildSite(seed: number, o: SiteOpts = {}): SiteFiles {
  const descs = [0, 1, 2].map((i) => randomPage(seed * 10 + i));
  const parts = descs.map((d, i) => toParts(d, { css: 'sheet', classPrefix: `p${i}` }));
  const linkOrder: [number, number][] = [];
  for (let from = 0; from < 3; from++) for (let to = 0; to < 3; to++) if (from !== to) linkOrder.push([from, to]);
  const dropped = new Set(linkOrder.slice(0, o.dropLinks ?? 0).map(([f, t]) => `${f}:${t}`));
  const css =
    `nav.site-nav{display:flex;gap:24px;padding:16px 40px;background:#1f2937;font-family:Arial, Helvetica, sans-serif}\n` +
    `nav.site-nav a{color:#ffffff;text-decoration:none;font-size:16px;font-weight:700}\n` +
    parts.map((p) => p.css).join('\n') + (o.extraCss ?? '');
  const files: SiteFiles = { 'site.css': css };
  for (const i of o.pages ?? [0, 1, 2]) {
    const links = [0, 1, 2]
      .filter((t) => t !== i && !dropped.has(`${i}:${t}`))
      .map((t) => `<a href="${PAGE_FILES[t]}">${LABELS[t]}</a>`)
      .join('');
    files[PAGE_FILES[i]] =
      `<!doctype html><html><head><meta charset="utf-8"><title>${LABELS[i]}</title><link rel="stylesheet" href="site.css"></head>` +
      `<body class="${parts[i].bodyClass}"><nav class="site-nav">${links}</nav>${parts[i].body}</body></html>`;
  }
  return files;
}

function unusedCss(bytes: number): string {
  let s = '\n';
  for (let i = 0; s.length < bytes; i++) s += `.unused-rule-${i}{color:#${(i * 2654435761 >>> 8).toString(16).padStart(6, '0').slice(0, 6)};margin:${i % 9}px;padding:2px}\n`;
  return s;
}

type SiteResult = Awaited<ReturnType<Grader['gradeSite']>>['result'];
function sfmt(r: SiteResult): string {
  const p = r.pillars;
  return `total ${r1(r.total)} (works ${r1(p.works)}, engineering ${r1(p.engineering)}, looks ${r1(p.looks)}, bonus ${r1(r.bonus)}, links ${r1(r.links.score)})${r.error ? ` error: ${r.error}` : ''}`;
}

describe('sites', () => {
  const prepared = new Map<number, ReturnType<Grader['prepareSite']>>();
  const goal = (seed: number) => {
    if (!prepared.has(seed)) prepared.set(seed, grader.prepareSite(buildSite(seed)));
    return prepared.get(seed)!;
  };
  const all: { label: string; r: SiteResult }[] = [];
  const gradeS = async (seed: number, label: string, files: SiteFiles) => {
    const r = (await grader.gradeSite(await goal(seed), files)).result;
    all.push({ label: `seed ${seed} ${label}`, r });
    return r;
  };

  it('identity: 100, pillars 100/100/100, bonus 0', async () => {
    const failures: string[] = [];
    for (const seed of SITE_SEEDS) {
      const r = await gradeS(seed, 'identity', buildSite(seed));
      const p = r.pillars;
      if (!(r.total === 100 && p.works === 100 && p.engineering === 100 && p.looks === 100 && r.bonus === 0)) failures.push(`seed ${seed}: ${sfmt(r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('unused CSS never helps: total and engineering never rise, works and looks stay 100', async () => {
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      const steps: { name: string; r: SiteResult }[] = [];
      for (const kb of [0, 2, 20, 200]) steps.push({ name: `+${kb} KB`, r: await gradeS(seed, `+${kb} KB css`, buildSite(seed, { extraCss: unusedCss(kb * 1024) })) });
      failures.push(...rises(`seed ${seed} unused css (total)`, steps.map((s) => ({ name: s.name, total: s.r.total, text: sfmt(s.r) }))));
      failures.push(...rises(`seed ${seed} unused css (engineering)`, steps.map((s) => ({ name: s.name, total: s.r.pillars.engineering, text: sfmt(s.r) }))));
      for (const s of steps) if (s.r.pillars.works !== 100 || s.r.pillars.looks !== 100) failures.push(`seed ${seed} ${s.name}: works/looks not 100: ${sfmt(s.r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('removing pages never helps', async () => {
    const failures: string[] = [];
    for (const seed of SITE_SEEDS) {
      const steps: { name: string; r: SiteResult }[] = [];
      for (const keep of [[0, 1, 2], [0, 1], [0]]) steps.push({ name: `${keep.length} pages`, r: await gradeS(seed, `${keep.length} pages`, buildSite(seed, { pages: keep })) });
      failures.push(...rises(`seed ${seed} remove pages`, steps.map((s) => ({ name: s.name, total: s.r.total, text: sfmt(s.r) }))));
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('removing nav links never helps: links score and total never rise', async () => {
    const failures: string[] = [];
    for (const seed of SLOW_SITE_SEEDS) {
      const steps: { name: string; r: SiteResult }[] = [];
      for (let drop = 0; drop <= 6; drop++) steps.push({ name: `-${drop} links`, r: await gradeS(seed, `-${drop} links`, buildSite(seed, { dropLinks: drop })) });
      failures.push(...rises(`seed ${seed} remove links (total)`, steps.map((s) => ({ name: s.name, total: s.r.total, text: sfmt(s.r) }))));
      failures.push(...rises(`seed ${seed} remove links (links.score)`, steps.map((s) => ({ name: s.name, total: s.r.links.score ?? 0, text: sfmt(s.r) }))));
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('bounds: every site total within 0 to 120, engineering within -100 to 100', () => {
    expect(all.length).toBeGreaterThan(0);
    const failures = all
      .filter(({ r }) => !(Number.isFinite(r.total) && r.total >= 0 && r.total <= 120 && Number.isFinite(r.pillars.engineering) && r.pillars.engineering >= -100 && r.pillars.engineering <= 100))
      .map(({ label, r }) => `${label}: ${sfmt(r)}`);
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
