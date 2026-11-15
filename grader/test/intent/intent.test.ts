import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Grader, Renderer } from '../../src/index';
import { scoreIntent, type IntentResult } from '../../src/intent/index';
import { closeness, wordCredit } from '../../src/intent/combine';
import type { PageSnapshot } from '../../src/types';

// ---- a small page of our own, built from a few knobs ----
interface Look {
  font: string; accent: string; page: string; ink: string; gap: number; pad: number; top: number;
  heroAlign: 'center' | 'right'; heroWidth: number; cardWidths: [number, number, number];
  footerInk: string; titleSizes: [number, number, number]; titleWeights: [number, number, number]; buttonBg: string;
  bannerW?: number; bannerPad?: number; heroShift?: number;
}
const BASE: Look = {
  font: 'Arial, sans-serif', accent: '#2563eb', page: '#f8fafc', ink: '#0f172a', gap: 24, pad: 24, top: 0,
  heroAlign: 'center', heroWidth: 720, cardWidths: [320, 320, 320], footerInk: '#475569', titleSizes: [20, 20, 20], titleWeights: [700, 700, 700], buttonBg: '#2563eb',
};
interface Content { cards: { title: string; price: string; text: string }[]; banner: boolean; nav: string[] }
const CONTENT: Content = {
  nav: ['Plans', 'Support', 'Login'],
  banner: true,
  cards: [
    { title: 'Starter', price: '$9', text: 'One rider, unlimited city trips and a basic lock included.' },
    { title: 'Commuter', price: '$29', text: 'Daily rides, priority repairs and a spare battery each month.' },
    { title: 'Family', price: '$49', text: 'Up to four riders sharing one account with child seats.' },
  ],
};
const FACTS = ['Tidewater Bikes', 'Plans', 'Support', 'Login', 'Ride the city your way', 'Starter', 'Commuter', 'Family', '$9', '$29', '$49', 'Free repairs within 48 hours'];

function page(l: Look = BASE, c: Content = CONTENT): string {
  const cards = c.cards.map((k, i) =>
    `<li style="width:${l.cardWidths[i]}px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:${l.pad}px;box-sizing:border-box">` +
    `<h2 style="margin:0 0 8px;font-size:${l.titleSizes[i]}px;font-weight:${l.titleWeights[i]}">${k.title}</h2>` +
    `<p style="margin:0 0 8px;font-size:32px;font-weight:700;color:${l.accent}">${k.price}</p>` +
    `<p style="margin:0;font-size:15px;line-height:22px;color:#334155">${k.text}</p></li>`).join('');
  const heroPos = l.heroAlign === 'center' ? 'margin:0 auto;text-align:center' : 'margin:0 0 0 auto;text-align:right';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tidewater</title></head>
<body style="margin:0;padding-top:${l.top}px;font-family:${l.font};background:${l.page};color:${l.ink}">
<header style="display:flex;justify-content:space-between;align-items:center;padding:16px 80px;background:#fff;border-bottom:1px solid #e2e8f0">
<strong style="font-size:20px">Tidewater Bikes</strong>
<nav style="display:flex;gap:24px;align-items:center">${c.nav.map((n, i) => i === c.nav.length - 1
    ? `<a href="#" style="background:${l.buttonBg};color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:15px">${n}</a>`
    : `<a href="#" style="color:${l.ink};text-decoration:none;font-size:15px">${n}</a>`).join('')}</nav></header>
<main style="padding:48px 80px">
<section style="width:${l.heroWidth}px;${heroPos};position:relative;left:${l.heroShift ?? 0}px"><h1 style="font-size:40px;margin:0 0 12px">Ride the city your way</h1>
<p style="font-size:17px;line-height:26px;margin:0;color:#334155">Pick a plan for electric bikes that fits how often you ride, and change it whenever you like.</p></section>
<ul style="list-style:none;padding:0;margin:40px 0 0;display:flex;gap:${l.gap}px;justify-content:center">${cards}</ul>
${c.banner ? `<div style="margin:40px auto 0;width:${l.bannerW ?? 600}px;padding:${l.bannerPad ?? 16}px 16px;text-align:center;background:#dbeafe;border-radius:8px;font-size:16px">Free repairs within 48 hours on every plan</div>` : ''}
</main>
<footer style="padding:24px 80px;color:${l.footerInk};font-size:14px">Tidewater Bikes, 12 Harbour Road, Portland</footer>
</body></html>`;
}

let renderer: Renderer;
let ref: PageSnapshot;
const snaps = new Map<string, PageSnapshot>();
const render = async (html: string) => {
  let s = snaps.get(html);
  if (!s) { s = await renderer.render(html); snaps.set(html, s); }
  return s;
};
const score = async (html: string, facts = FACTS) => scoreIntent(ref, await render(html), { keyFacts: facts });
const crit = (r: IntentResult, id: string) => r.criteria.find((c) => c.id === id)!.value as number;
const WORKS = ['keyFacts', 'completeness', 'structure', 'noExtras'];
const LOOKS = ['arrangement', 'readability', 'consistency', 'colour'];
/** Looks points lost, out of 100: the mean loss over the four looks criteria. */
const looksLoss = (r: IntentResult) => (100 * LOOKS.reduce((a, id) => a + (1 - (crit(r, id) ?? 1)), 0)) / LOOKS.length;

beforeAll(async () => {
  renderer = new Renderer();
  ref = await render(page());
}, 60_000);
afterAll(async () => {
  await renderer.close();
});

describe('intent scorer: curves', () => {
  it('closeness is gentle to the edge of close, steep after, monotone', () => {
    expect(closeness(0, 0.01, 0.06, 0.88, 3, 0.98)).toBe(1);
    expect(closeness(0.005, 0.01, 0.06, 0.88, 3, 0.98)).toBeCloseTo(0.99);
    expect(closeness(0.01, 0.01, 0.06, 0.88, 3, 0.98)).toBeCloseTo(0.98);
    expect(closeness(0.06, 0.01, 0.06, 0.88, 3, 0.98)).toBeCloseTo(0.88);
    expect(closeness(0.18, 0.01, 0.06, 0.88, 3, 0.98)).toBe(0);
    let last = 1;
    for (let d = 0.001; d <= 0.3; d += 0.002) { const c = closeness(d, 0.01, 0.06, 0.88, 3, 0.98); expect(c).toBeLessThan(last); last = Math.max(c, 0) || -1; if (c === 0) break; }
    expect(wordCredit(0, 0.1, 0.5, 0.85, 0.98)).toBe(1);
    expect(wordCredit(1, 0.1, 0.5, 0.85, 0.98)).toBe(0);
  });
});

describe('intent scorer: properties', () => {
  it('the reference against itself with its own key facts scores exactly 100', async () => {
    const r = await score(page());
    expect(r.total).toBe(100);
    expect(r.breakdown).toEqual({ content: 100, layout: 100, style: 100, visual: 100 });
    expect(r.criteriaFeedback).toEqual([]);
    expect(r.mode).toBe('intent');
  });

  it('a close restyle (other shades, similar typeface, a few px of spacing, all 20 px lower) loses a little in looks and nothing in works', async () => {
    const r = await score(page({ ...BASE, font: 'Helvetica, Verdana, sans-serif', accent: '#1d4ed8', buttonBg: '#1d4ed8', page: '#f1f5f9', gap: 28, pad: 22, top: 20 }));
    for (const id of WORKS) expect(crit(r, id), id).toBe(1);
    expect(r.breakdown.content).toBe(100);
    const loss = looksLoss(r);
    expect(loss).toBeGreaterThan(0);
    expect(loss).toBeLessThanOrEqual(12);
  });

  it('recoloured to another family loses clearly in colour and nothing in works', async () => {
    const small = await score(page({ ...BASE, accent: '#1d4ed8', buttonBg: '#1d4ed8' }));
    const r = await score(page({ ...BASE, accent: '#dc2626', buttonBg: '#dc2626' }));
    for (const id of WORKS) expect(crit(r, id), id).toBe(1);
    expect(crit(r, 'colour')).toBeLessThan(0.8);
    expect(crit(r, 'colour')).toBeLessThan(crit(small, 'colour') - 0.1);
  });

  it('a major component moved to the far side loses clearly in arrangement, more than a small shift', async () => {
    const small = await score(page({ ...BASE, heroWidth: 700 }));
    const far = await score(page({ ...BASE, heroAlign: 'right', heroWidth: 380 }));
    expect(crit(far, 'arrangement')).toBeLessThan(crit(small, 'arrangement') - 0.1);
    expect(crit(small, 'arrangement')).toBeGreaterThan(0.9);
  });

  it('bigger colour differences never score higher (monotone)', async () => {
    const hues = ['#2563eb', '#3b5bdb', '#6d28d9', '#c026d3', '#dc2626'];
    let last = 1.01;
    for (const h of hues) {
      const c = crit(await score(page({ ...BASE, accent: h, buttonBg: h })), 'colour');
      expect(c).toBeLessThanOrEqual(last);
      last = c;
    }
  });

  it('removing a key fact or a component never raises the score', async () => {
    const full = await score(page());
    const lessFacts = await score(page(BASE, { ...CONTENT, cards: CONTENT.cards.map((k, i) => (i === 1 ? { ...k, price: '$31' } : k)) }));
    const noBanner = await score(page(BASE, { ...CONTENT, banner: false }));
    const twoCards = await score(page(BASE, { ...CONTENT, cards: CONTENT.cards.slice(0, 2) }));
    expect(lessFacts.total).toBeLessThan(full.total);
    expect(crit(lessFacts, 'keyFacts')).toBeLessThan(1);
    expect(noBanner.total).toBeLessThan(full.total);
    expect(twoCards.total).toBeLessThan(full.total);
    expect(crit(twoCards, 'structure')).toBeLessThan(1);
  });

  it('each added fault of one kind lowers only its own criterion', async () => {
    const cases: [string, string][] = [
      [page({ ...BASE, footerInk: '#d4d4d8' }), 'readability'],
      [page({ ...BASE, titleWeights: [700, 400, 700] }), 'consistency'],
      [page({ ...BASE, buttonBg: '#dc2626' }), 'colour'],
    ];
    for (const [html, own] of cases) {
      const r = await score(html);
      expect(crit(r, own), own).toBeLessThan(1);
      for (const c of r.criteria) if (c.id !== own) expect(c.value, `${own} fault touched ${c.id}`).toBe(1);
    }
  });

  it('checks show the exact figures: tiny differences cost a little, gross ones a lot, and the points add up', async () => {
    const self = await score(page());
    expect(self.checks.every((c) => c.points === 0)).toBe(true);
    expect(self.checks.some((c) => /exactly as the reference/.test(c.text))).toBe(true);

    const near = await score(page({ ...BASE, bannerW: 612, heroShift: 3 }));
    const box = near.checks.find((c) => c.what === 'size' && /1\.02 times the reference's width/.test(c.measured))!;
    const head = near.checks.find((c) => c.what === 'position' && /3 px right/.test(c.measured))!;
    for (const c of [box, head]) {
      expect(c, JSON.stringify(near.checks.slice(0, 6))).toBeDefined();
      expect(c.zone).toBe('vicinity');
      expect(c.points).toBeGreaterThan(0);
      expect(c.points).toBeLessThan(0.3);
      expect(c.text).toMatch(/very close, \d\.\d\d points lost/);
    }
    expect(near.total).toBeGreaterThan(99);

    const big = await score(page({ ...BASE, bannerW: 1120, bannerPad: 300 }));
    const off = big.checks.find((c) => c.what === 'size' && c.zone === 'off')!;
    expect(off).toBeDefined();
    expect(off.points).toBeGreaterThan(Math.max(box.points, head.points) * 5);
    expect(off.text).toMatch(/times the reference's width/);

    for (const r of [near, big]) {
      const sum = r.checks.reduce((a, c) => a + c.points, 0);
      expect(Math.abs(sum - (100 - r.total))).toBeLessThan(0.5);
    }
  });

  it('same input, same output, and well under 200 ms beyond rendering', async () => {
    const html = page({ ...BASE, accent: '#dc2626', heroAlign: 'right', heroWidth: 380 });
    const cand = await render(html);
    const a = scoreIntent(ref, cand, { keyFacts: FACTS });
    const t0 = performance.now();
    const b = scoreIntent(ref, cand, { keyFacts: FACTS });
    const ms = performance.now() - t0;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(ms).toBeLessThan(200);
  });

  it('a hostile page neither throws nor hangs', async () => {
    const empty = await render('<!doctype html><html><body></body></html>');
    const giant = await render('<!doctype html><html><body style="margin:0"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" style="width:1280px;height:4000px"></body></html>');
    const tiny = await render(`<!doctype html><html><body style="margin:0;font-size:4px;line-height:4px">${Array.from({ length: 5000 }, (_, i) => `<span>w${i} </span>`).join('')}</body></html>`);
    for (const s of [empty, giant, tiny]) {
      const t0 = performance.now();
      const r = scoreIntent(ref, s, { keyFacts: FACTS });
      expect(performance.now() - t0).toBeLessThan(5000);
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeLessThan(60);
      // And the other way round: a hostile reference.
      expect(() => scoreIntent(s, ref, { keyFacts: [] })).not.toThrow();
    }
  }, 120_000);
});

describe('intent scorer through gradeSite', () => {
  let grader: Grader;
  beforeAll(() => { grader = new Grader(); });
  afterAll(async () => { await grader.close(); });

  it('pasting the key facts as plain lines is necessary but nowhere near sufficient (under 45)', async () => {
    const goal = { 'index.html': page() };
    const list = { 'index.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Facts</title></head><body>${FACTS.map((f) => `<p>${f}</p>`).join('')}</body></html>` };
    const { result } = await grader.gradeSite(goal, list, { intent: { 'index.html': { keyFacts: FACTS } } });
    const p = result.pages[0];
    expect(p.mode).toBe('intent');
    expect(p.result!.criteria!.find((c) => c.id === 'keyFacts')!.value).toBe(1);
    expect(result.total).toBeLessThan(45);
    const self = await grader.gradeSite(goal, goal, { intent: { 'index.html': { keyFacts: FACTS } } });
    expect(self.result.pages[0].result!.total).toBe(100);
    expect(self.result.total).toBeGreaterThan(result.total + 30);
  }, 120_000);
});
