// Property tests: rules that must hold for any page, checked over many
// generated pages. A failure names the seed and shows the numbers.
import { afterAll, describe, expect, it } from 'vitest';
import { Grader, type GradeResult, type PageSnapshot } from '../src/index';
import { r1, rises } from './helpers/property-format';
import {
  clone, drift, randomPage, randomSection, rng, toCjk, toHtml, words,
  type PageDesc, type RGB,
} from './helpers/random-page';

const grader = new Grader();
afterAll(() => grader.close());

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// The pairings matrix grows with the square of the seed count, so it uses
// eight seeds (still one of each edge kind) to keep the file near three minutes.
const PAIR_SEEDS = SEEDS.slice(0, 8);

const pages = new Map<number, PageDesc>(SEEDS.map((s) => [s, randomPage(s)]));
const snaps = new Map<number, Promise<PageSnapshot>>();
function goalSnap(seed: number): Promise<PageSnapshot> {
  if (!snaps.has(seed)) snaps.set(seed, grader.render(toHtml(pages.get(seed)!)));
  return snaps.get(seed)!;
}

async function grade(seed: number, html: string): Promise<GradeResult> {
  return (await grader.grade(await goalSnap(seed), html)).result;
}

function fmt(r: GradeResult): string {
  const b = r.breakdown;
  return `total ${r1(r.total)} (content ${r1(b.content)}, layout ${r1(b.layout)}, style ${r1(b.style)}, visual ${r1(b.visual)})${r.error ? ` error: ${r.error}` : ''}`;
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

// The deeper set: each property says, in a comment, what a person would expect.
const TEXT_SEEDS = SEEDS.filter((s) => pages.get(s)!.kind !== 'boxes');
const CARD_SEEDS = SEEDS.filter((s) => pages.get(s)!.sections.some((x) => x.cards.length > 0));

/** Replaces the first word of the first paragraph with a different word. */
function oneWordChanged(page: PageDesc): PageDesc | null {
  const p = clone(page);
  const s = p.sections.find((x) => x.paragraphs.length > 0);
  if (!s) return null;
  const parts = s.paragraphs[0].split(' ');
  const r = rng(page.seed + 77);
  let w = words(r, 1);
  while (w.toLowerCase() === parts[0].toLowerCase()) w = words(r, 1);
  parts[0] = w;
  s.paragraphs[0] = parts.join(' ');
  return p;
}

const snapCache = new Map<string, Promise<PageSnapshot>>();
function snapOf(html: string): Promise<PageSnapshot> {
  if (!snapCache.has(html)) snapCache.set(html, grader.render(html));
  return snapCache.get(html)!;
}
async function gradeHtml(goalHtml: string, html: string): Promise<GradeResult> {
  return (await grader.grade(await snapOf(goalHtml), html)).result;
}

describe('single pages, deeper', () => {
  // A person cannot tell px from rem, or a shorthand from its longhand: the
  // rendering is identical, so the score must be too.
  it('CSS spelling does not matter: rem units and longhand properties score at least 99', async () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      for (const [name, opts] of [['rem', { units: 'rem' }], ['longhand + sheet', { longhand: true, css: 'sheet' }]] as const) {
        const r = await grade(seed, toHtml(pages.get(seed)!, opts));
        if (r.total < 99) failures.push(`seed ${seed} ${name}: ${fmt(r)}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // A container a few pixels narrower makes a line wrap one word earlier; a
  // person sees the same page. Narrowing further never makes it closer.
  it('a slightly narrower container costs little (12 px at most 3), and narrowing never helps', async () => {
    const steps = [0, 4, 12, 40, 120];
    const { failures, results } = await monotone('narrow', (page) =>
      steps.map((d) => ({ name: `-${d}px`, html: toHtml(page, { narrowBy: d }) })), TEXT_SEEDS);
    for (const [seed, s] of results) {
      if (s[0].result.total - s[2].result.total > 3) failures.push(`seed ${seed}: 12 px narrower cost more than 3: ${fmt(s[2].result)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // Cutting a paragraph short, a tenth at a time, never helps, and the words
  // that remain are still in the right font and colour: there is no single
  // word whose removal suddenly makes the rest of the paragraph count as
  // "missing". (An earlier version also capped each step's cost; that was a
  // wrong expectation: a step that removes a whole line rightly moves
  // everything below it.)
  it('cutting a paragraph short never helps, and the style score holds while 3 or more words remain', async () => {
    const fractions = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
    const { failures, results } = await monotone('cut paragraph', (page) => {
      const s = page.sections.findIndex((x) => x.paragraphs.length > 0);
      return fractions.map((f) => {
        const p = clone(page);
        const all = page.sections[s].paragraphs[0].replace(/\.$/, '').split(' ');
        p.sections[s].paragraphs[0] = all.slice(0, Math.max(1, Math.round(all.length * f))).join(' ') + '.';
        return { name: `${Math.round(f * 100)}%`, html: toHtml(p) };
      });
    }, TEXT_SEEDS.filter((s) => pages.get(s)!.kind !== 'single'));
    for (const [seed, s] of results) {
      const page = pages.get(seed)!;
      const n = page.sections.find((x) => x.paragraphs.length > 0)!.paragraphs[0].split(' ').length;
      for (let i = 0; i < s.length; i++) {
        const kept = Math.max(1, Math.round(n * fractions[i]));
        if (kept >= 3 && s[i].result.breakdown.style < 99) {
          failures.push(`seed ${seed}: cut to ${s[i].name} (${kept} of ${n} words) and the style score fell: ${fmt(s[i].result)}`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // One wrong word in a paragraph is one small mistake, whatever the script.
  // Chinese is written without spaces, so it must not be judged as if each
  // sentence were one long word.
  it('one changed word costs at most 5, in Latin script and in Chinese', async () => {
    const failures: string[] = [];
    for (const seed of TEXT_SEEDS) {
      const page = pages.get(seed)!;
      const edited = oneWordChanged(page);
      if (!edited) continue;
      const latin = await grade(seed, toHtml(edited));
      if (latin.total < 95) failures.push(`seed ${seed} latin: ${fmt(latin)}`);
      const goal = toHtml(toCjk(page));
      const same = await gradeHtml(goal, goal);
      const cjk = await gradeHtml(goal, toHtml(toCjk(edited)));
      if (same.total !== 100 || cjk.total < 95) failures.push(`seed ${seed} chinese: self ${fmt(same)}; one word ${fmt(cjk)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // An emoji is something a person reads: swapping a rocket for a turtle in
  // the heading is a visible change to the words and must cost something.
  it('swapping an emoji in a heading costs something, and the content score sees it', async () => {
    const failures: string[] = [];
    for (const seed of TEXT_SEEDS) {
      const withEmoji = (e: string) => {
        const p = clone(pages.get(seed)!);
        const s = p.sections.find((x) => x.heading)!;
        s.heading = `${s.heading} ${e}`;
        return toHtml(p);
      };
      const goal = withEmoji('🚀');
      const r = await gradeHtml(goal, withEmoji('🐢'));
      if (!(r.total < 100) || !(r.breakdown.content! < 100)) failures.push(`seed ${seed}: ${fmt(r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // A difference nobody can see costs nothing: a card border 3 units off the
  // card's own fill, or a gradient whose end colour moved by 2 units.
  it('invisible differences are free: a border the colour of its card, a gradient stop moved 2 units', async () => {
    const failures: string[] = [];
    for (const seed of CARD_SEEDS) {
      const r = await grade(seed, toHtml(pages.get(seed)!, { cardBorder: { width: 2, color: { near: 3 } } }));
      if (r.total < 99) failures.push(`seed ${seed} near-invisible border: ${fmt(r)}`);
    }
    for (const seed of SEEDS) {
      const page = pages.get(seed)!;
      const to: RGB = drift(page.sections[0].bg, 0.5);
      const goal = toHtml(page, { gradient: { index: 0, to } });
      const r = await gradeHtml(goal, toHtml(page, { gradient: { index: 0, to: to.map((v) => (v > 127 ? v - 2 : v + 2)) as RGB } }));
      if (r.total < 99) failures.push(`seed ${seed} gradient stop moved 2 units: ${fmt(r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // Borders thickening and corners rounding, step by step, take the page
  // further from the goal each time, and the style score notices both.
  it('border width and corner radius drifting step by step never help', async () => {
    const dark: RGB = [40, 40, 40];
    const failures: string[] = [];
    for (const seed of CARD_SEEDS) {
      const page = pages.get(seed)!;
      const goal = toHtml(page, { cardBorder: { width: 1, color: dark } });
      const steps: { name: string; result: GradeResult }[] = [];
      for (const w of [1, 2, 4, 8, 16]) steps.push({ name: `border ${w}px`, result: await gradeHtml(goal, toHtml(page, { cardBorder: { width: w, color: dark } })) });
      failures.push(...rises(`seed ${seed} border width`, steps.map((s) => ({ name: s.name, total: s.result.total, text: fmt(s.result) }))));
      if (!(steps[4].result.breakdown.style < 100)) failures.push(`seed ${seed}: 16 px border instead of 1 px left style at ${fmt(steps[4].result)}`);
      const radii: { name: string; result: GradeResult }[] = [];
      for (const add of [0, 4, 12, 30, 60]) {
        const p = clone(page);
        for (const s of p.sections) for (const c of s.cards) c.radius += add;
        radii.push({ name: `radius +${add}`, result: await grade(seed, toHtml(p)) });
      }
      failures.push(...rises(`seed ${seed} radius`, radii.map((s) => ({ name: s.name, total: s.result.total, text: fmt(s.result) }))));
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // Nothing below the 6000 px cut-off is graded (it was 2400 px, which hid
  // real differences on tall model-built pages), so a change that sits
  // entirely below it cannot cost anything.
  it('a change entirely below the 6000 px cut-off costs nothing', async () => {
    const failures: string[] = [];
    for (const seed of TEXT_SEEDS.slice(0, 4)) {
      const tall = (tail: string) => {
        const p = clone(pages.get(seed)!);
        const s0 = p.sections[0];
        p.sections.push({ ...s0, heading: null, paragraphs: [], button: null, padY: 0, cards: [{ ...s0.cards[0] ?? { bg: s0.bg, fg: s0.fg, radius: 0 }, title: null, height: 6200 }] });
        p.sections.push({ ...s0, heading: tail, paragraphs: [], cards: [], button: null });
        return toHtml(p);
      };
      const goal = tall('The very end of the page');
      const r = await gradeHtml(goal, tall('Something else entirely here'));
      if (r.total !== 100) failures.push(`seed ${seed}: ${fmt(r)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
