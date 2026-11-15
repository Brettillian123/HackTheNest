import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Renderer } from '../../src/render';
import type { PageSnapshot } from '../../src/types';
import {
  applyMarks, buildPageProfile, flattenComponents, IMPORTANCE_WEIGHT, validateProfile,
  type PageComponent, type PageProfile,
} from '../../src/profile';

const CAL = join(__dirname, '..', '..', 'calibration');
const GOALS: Record<string, string> = {
  landing: 'sets/landing/goal.html', profile: 'sets/profile/goal.html', dashboard: 'sets/dashboard/goal.html',
  article: 'sets/article/goal.html', checkout: 'sets/checkout/goal.html', menu: 'review/pages/menu/goal.html',
  signup: 'review/pages/signup/goal.html', invoice: 'review/pages/invoice/goal.html', product: 'review/pages/product/goal.html',
};
const BUILD_DIR = join(CAL, 'edge', 'pages');
const BUILDS = readdirSync(BUILD_DIR).filter((d) => d.startsWith('build-'));

const goals: Record<string, PageSnapshot> = {};
const builds: Record<string, Record<string, PageSnapshot>> = {};
let renderer: Renderer;

beforeAll(async () => {
  renderer = new Renderer();
  for (const [name, file] of Object.entries(GOALS)) goals[name] = await renderer.render(readFileSync(join(CAL, file), 'utf8'));
  for (const b of BUILDS) {
    builds[b] = {};
    for (const f of readdirSync(join(BUILD_DIR, b)).filter((x) => x.endsWith('.html'))) {
      builds[b][f] = await renderer.render(readFileSync(join(BUILD_DIR, b, f), 'utf8'));
    }
  }
}, 600_000);

afterAll(async () => {
  await renderer?.close();
});

function sameTree(a: PageComponent[], b: PageComponent[], path = ''): string | null {
  if (a.length !== b.length) return `${path || 'top'}: ${a.length} components vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const p = `${path}/${a[i].id}`;
    if (a[i].type !== b[i].type) return `${p}: ${a[i].type} vs ${b[i].type}`;
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      if (Math.abs(a[i].rect[k] - b[i].rect[k]) > 4) return `${p}: rect ${k} ${a[i].rect[k]} vs ${b[i].rect[k]}`;
    }
    const sub = sameTree(a[i].children, b[i].children, p);
    if (sub) return sub;
  }
  return null;
}

describe('page profile', () => {
  it('keeps the importance weights slight', () => {
    expect(IMPORTANCE_WEIGHT).toEqual({ critical: 1.5, major: 1.25, normal: 1, minor: 0.75 });
  });

  it('is deterministic, quick and valid on all nine goals, with rule weights left at zero', () => {
    for (const [name, snap] of Object.entries(goals)) {
      const t0 = performance.now();
      const a = buildPageProfile(snap);
      expect(performance.now() - t0, name).toBeLessThan(1000);
      const b = buildPageProfile(snap);
      expect(JSON.stringify(b), name).toBe(JSON.stringify(a));
      expect(() => validateProfile(a, snap), name).not.toThrow();
      expect(a.source).toBe('rules');
      expect(a.weightShift).toEqual({ content: 0, layout: 0, style: 0, visual: 0 });
      const all = flattenComponents(a.components);
      const raised = all.filter((c) => c.importance === 'critical' || c.importance === 'major').length;
      expect(raised, name).toBeLessThanOrEqual(Math.max(1, Math.floor(all.length / 3)));
    }
  });

  it('finds the parts a person would name', () => {
    const top = (name: string) => buildPageProfile(goals[name]).components.map((c) => c.type);
    expect(top('landing')).toEqual(['navigation', 'hero', 'card-group', 'footer']);
    expect(top('checkout')).toEqual(['navigation', 'hero', 'card-group', 'table', 'form', 'footer']);
    expect(top('dashboard')).toEqual(['sidebar', 'navigation', 'heading', 'stats', 'chart', 'table']);
    expect(top('signup')).toEqual(['hero', 'form']);
    expect(top('menu')[0]).toBe('navigation');
    expect(top('product')).not.toContain('hero');
    const checkout = buildPageProfile(goals.checkout);
    expect(checkout.components[2].name).toBe('the pricing cards');
    expect(checkout.components[4].name).toBe('the sign-up form');
  });

  it('gives the same tree for pages that look the same but are built differently', () => {
    for (const b of BUILDS) {
      const files = Object.keys(builds[b]);
      const base = buildPageProfile(builds[b]['goal.html']);
      for (const f of files) {
        const other = buildPageProfile(builds[b][f]);
        expect(sameTree(base.components, other.components), `${b}/${f}`).toBeNull();
      }
    }
  });

  it('rejects broken profiles', () => {
    const snap = goals.landing;
    const good = buildPageProfile(snap);
    const broken = (fn: (p: PageProfile) => void) => {
      const p = structuredClone(good);
      fn(p);
      return () => validateProfile(p, snap);
    };
    expect(broken((p) => p.components[0].blocks.push(snap.blocks.length + 3))).toThrow(/names block/);
    expect(broken((p) => p.components[1].blocks.push(p.components[0].blocks[0]))).toThrow(/two components/);
    expect(broken((p) => { p.components[0].blocks = p.components[0].blocks.slice(1); })).toThrow(/no component/);
    expect(broken((p) => { p.weightShift = { content: 0.08, layout: 0, style: 0, visual: -0.08 }; })).toThrow(/between -0.05 and \+0.05/);
    expect(broken((p) => { p.weightShift = { content: 0.05, layout: 0, style: 0, visual: 0 }; })).toThrow(/add up to 0/);
    expect(broken((p) => p.components[0].keyTexts.push(p.components[1].blocks[0]))).toThrow(/not inside it/);
  });
});

describe('author marks', () => {
  it('applies importance, names, key texts and a weight shift without changing the input', () => {
    const snap = goals.checkout;
    const rules = buildPageProfile(snap);
    const before = JSON.stringify(rules);
    const marked = applyMarks(rules, {
      components: { 'the pricing cards': { importance: 'critical' }, c6: { importance: 'normal', name: 'the page footer' } },
      keyTexts: { add: ['Compare plans'], drop: ['Most popular'] },
      weightShift: { content: 0.03, visual: -0.03 },
    }, snap);
    expect(JSON.stringify(rules)).toBe(before);
    expect(marked.source).toBe('rules+marks');
    const byName = (n: string) => flattenComponents(marked.components).find((c) => c.name === n)!;
    expect(byName('the pricing cards').importance).toBe('critical');
    expect(byName('the page footer').importance).toBe('normal');
    const compare = snap.blocks.findIndex((b) => b.text === 'Compare plans');
    const popular = snap.blocks.findIndex((b) => b.text === 'Most popular');
    expect(marked.components[3].keyTexts).toContain(compare);
    expect(flattenComponents(marked.components).some((c) => c.keyTexts.includes(popular))).toBe(false);
    expect(marked.weightShift).toEqual({ content: 0.03, layout: 0, style: 0, visual: -0.03 });
    expect(() => validateProfile(marked, snap)).not.toThrow();
  });

  it('rejects unknown names and texts and out-of-bounds values in plain words', () => {
    const snap = goals.checkout;
    const rules = buildPageProfile(snap);
    expect(() => applyMarks(rules, { components: { 'the testimonials': { importance: 'major' } } }, snap)).toThrow(/no component with that name or id/);
    expect(() => applyMarks(rules, { keyTexts: { add: ['Buy now'] } }, snap)).toThrow(/no text on the page reads that/);
    expect(() => applyMarks(rules, { keyTexts: { drop: ['Audit log'] } }, snap)).toThrow(/not a key text/);
    expect(() => applyMarks(rules, { components: { c1: { importance: 'huge' as never } } }, snap)).toThrow(/not one of/);
    expect(() => applyMarks(rules, { weightShift: { content: 0.1, visual: -0.1 } }, snap)).toThrow(/between -0.05 and \+0.05/);
    expect(() => applyMarks(rules, { weightShift: { content: 0.04 } }, snap)).toThrow(/add up to 0/);
    expect(() => applyMarks(rules, { components: { c1: { name: 'the footer' } } }, snap)).toThrow(/already used/);
    expect(() => applyMarks(rules, { extra: 1 } as never, snap)).toThrow(/unknown entry/);
  });
});
