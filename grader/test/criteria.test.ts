import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Renderer } from '../src/render';
import { score, subScoresFromCriteria } from '../src/score';
import type { CriterionId, CriterionResult, GradeResult, PageSnapshot } from '../src/types';

/**
 * The twelve criteria: each moves with its own fault and not with others'.
 * Pages are small and built here, so each attempt has exactly one kind of fault.
 */

const svg = (shape: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120"><rect width="160" height="120" fill="#e0f2fe"/>${shape}</svg>`)}`;
const CIRCLE = svg('<circle cx="80" cy="60" r="40" fill="#0369a1"/>');
const BARS = svg('<rect x="20" y="70" width="25" height="40" fill="#0369a1"/><rect x="65" y="30" width="25" height="80" fill="#0369a1"/><rect x="110" y="50" width="25" height="60" fill="#0369a1"/>');

interface Opts {
  css?: string;
  prices?: [string, string, string];
  cards?: number;
  lead?: string;
  extra?: string;
  footer?: boolean;
  picture?: string;
  long?: boolean;
}

const BASE_CSS =
  'body{margin:0;font-family:Arial,sans-serif;color:#0f172a;background:#fff}' +
  '.nav{display:flex;justify-content:space-between;align-items:center;padding:20px 48px;background:#f1f5f9}' +
  '.nav b{font-size:22px}.nav a{margin-left:24px;color:#334155;text-decoration:none}' +
  '.hero{padding:56px 48px;display:flex;gap:48px;align-items:center}' +
  '.hero h1{font-size:44px;margin:0 0 16px}.hero p{font-size:18px;margin:0 0 24px;max-width:520px;line-height:1.5}' +
  '.btn{display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;font-weight:bold}' +
  '.cards{display:flex;gap:24px;padding:24px 48px}' +
  '.card{flex:0 0 300px;border:2px solid #cbd5e1;border-radius:14px;padding:24px;box-sizing:border-box}' +
  '.card h3{margin:0 0 8px;font-size:22px}.card .price{font-size:32px;font-weight:bold;margin:0 0 12px}.card p{margin:0}' +
  '.foot{margin-top:48px;padding:24px 48px;background:#0f172a;color:#e2e8f0;font-size:14px}';

const NAMES = ['Starter', 'Team', 'Business'];
const NOTES = ['For one person getting going.', 'For small teams who share work.', 'For companies with many teams.'];

function page(o: Opts = {}): string {
  const prices = o.prices ?? ['$9', '$39', '$99'];
  const n = o.cards ?? 3;
  const cards = NAMES.slice(0, n)
    .map((name, i) => `<div class="card"><h3>${name}</h3><div class="price">${prices[i]}/month</div><p>${NOTES[i]}</p></div>`)
    .join('');
  const lead =
    o.lead ??
    'Plan the week, share the load and see what is due next, all in one calm place built for busy teams.' +
      (o.long ? ' It keeps every task, note and file in one tidy list, so nobody has to ask where things are, and it sends a short summary every morning so the whole team starts the day knowing what matters most and who is doing it.' : '');
  return (
    `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${o.css ?? ''}</style></head><body>` +
    `<div class="nav"><b>Tidewater</b><span><a>Features</a><a>Pricing</a><a>Contact</a></span></div>` +
    `<div class="hero"><div><h1>Work that flows</h1><p>${lead}</p><span class="btn">Start free trial</span></div>` +
    `<img src="${o.picture ?? CIRCLE}" width="320" height="240" alt=""></div>` +
    `<div class="cards">${cards}</div>` +
    (o.extra ?? '') +
    (o.footer === false ? '' : `<div class="foot">© 2026 Tidewater Ltd. All rights reserved.</div>`) +
    `</body></html>`
  );
}

let renderer: Renderer;
const snaps = new Map<string, PageSnapshot>();
async function snap(html: string): Promise<PageSnapshot> {
  let s = snaps.get(html);
  if (!s) {
    s = await renderer.render(html);
    snaps.set(html, s);
  }
  return s;
}
async function grade(goalHtml: string, attemptHtml: string): Promise<GradeResult> {
  return score(await snap(goalHtml), await snap(attemptHtml));
}
const value = (r: GradeResult, id: CriterionId) => r.criteria!.find((c) => c.id === id)!.value;
const GOAL = page();

beforeAll(async () => {
  renderer = new Renderer();
}, 60_000);
afterAll(async () => {
  await renderer.close();
});

/** Every criterion but those named stays at 0.99 or more (likeness is the screenshot and moves with any visible change). */
function onlyMoves(r: GradeResult, moved: CriterionId[]) {
  for (const c of r.criteria!) {
    if (moved.includes(c.id) || c.id === 'likeness' || c.value === null) continue;
    expect([c.id, c.value]).toEqual([c.id, expect.any(Number)]);
    expect(c.value, `${c.id} should not move (${r.criteria!.map((x) => `${x.id}=${x.value}`).join(' ')})`).toBeGreaterThanOrEqual(0.99);
  }
  for (const id of moved) expect(value(r, id), `${id} should move`).toBeLessThan(0.99);
}

describe('the criteria report', () => {
  it('reports all twelve criteria, the components and the criteria sub-scores', async () => {
    const r = await grade(GOAL, page({ prices: ['$9', '$94', '$99'] }));
    expect(r.criteria!.map((c) => c.id)).toEqual(['completeness', 'keyFacts', 'wording', 'structure', 'noExtras', 'placement', 'spacing', 'colour', 'typography', 'shape', 'pictures', 'likeness']);
    for (const c of r.criteria!) {
      expect(['works', 'looks']).toContain(c.group);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.notes.length).toBeLessThanOrEqual(3);
      if (c.value !== null) expect(c.value).toBeGreaterThanOrEqual(0), expect(c.value).toBeLessThanOrEqual(1);
    }
    expect(r.components!.length).toBeGreaterThan(2);
    expect(r.criteriaBreakdown).toEqual(subScoresFromCriteria(r.criteria!));
    expect(r.criteriaFeedback!.length).toBeGreaterThan(0);
    expect(r.criteriaFeedback!.length).toBeLessThanOrEqual(8);
    expect(r.criteriaFeedback![0].message).toMatch(/^Key facts: .*\$94.*\$39/);
  });

  it('gives a page against itself every criterion exactly 1 (or null) and a total of 100', async () => {
    const r = await grade(GOAL, GOAL);
    expect(r.total).toBe(100);
    for (const c of r.criteria!) expect(c.value === null || c.value === 1, `${c.id}=${c.value}`).toBe(true);
    for (const c of r.components!) for (const v of Object.values(c.criteria)) expect(v).toBe(1);
    expect(r.criteriaFeedback).toEqual([]);
  });

  it('gives the same result every time', async () => {
    const goal = await snap(GOAL);
    const attempt = await snap(page({ css: '.card{border-radius:0}', prices: ['$9', '$94', '$99'] }));
    expect(JSON.stringify(score(goal, attempt))).toBe(JSON.stringify(score(goal, attempt)));
  });

  it('keeps every criterion at 0.99 or more for the same look built another way', async () => {
    const other = page({ css: '.cards{display:grid;grid-template-columns:repeat(3,300px)}.card{flex:none}' }).replace(/<span class="btn">Start free trial<\/span>/, '<button class="btn" style="border:0;font:inherit;font-weight:bold">Start free trial</button>');
    const r = await grade(GOAL, other);
    for (const c of r.criteria!) if (c.value !== null) expect(c.value, c.id).toBeGreaterThanOrEqual(0.99);
  });

  it('keeps every criterion at 0.99 or more on every "same look, different build" case', async () => {
    const dir = join(__dirname, '..', 'calibration', 'edge', 'pages');
    const cases = readdirSync(dir).filter((d) => d.startsWith('build-'));
    expect(cases.length).toBeGreaterThan(3);
    for (const d of cases) {
      const goal = readFileSync(join(dir, d, 'goal.html'), 'utf8');
      for (const f of readdirSync(join(dir, d)).filter((x) => x.endsWith('.html') && x !== 'goal.html')) {
        const r = await grade(goal, readFileSync(join(dir, d, f), 'utf8'));
        for (const c of r.criteria!) if (c.value !== null) expect(c.value, `${d}/${f} ${c.id}`).toBeGreaterThanOrEqual(0.99);
      }
    }
  }, 120_000);

  it('scores a page in well under 200 ms', async () => {
    const goal = await snap(GOAL);
    const attempt = await snap(page({ css: '.hero h1{color:#b91c1c}', cards: 2 }));
    score(goal, attempt);
    const t0 = performance.now();
    score(goal, attempt);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('each criterion moves with its own fault only', () => {
  it('completeness: a missing component', async () => {
    const r = await grade(GOAL, page({ footer: false }));
    onlyMoves(r, ['completeness']);
    expect(r.criteria!.find((c) => c.id === 'completeness')!.notes[0]).toMatch(/missing/);
  });

  it('keyFacts: a wrong price, and not wording or completeness', async () => {
    const r = await grade(GOAL, page({ prices: ['$9', '$94', '$99'] }));
    onlyMoves(r, ['keyFacts']);
    expect(value(r, 'wording')).toBe(1);
    expect(value(r, 'completeness')).toBe(1);
    expect(r.criteria!.find((c) => c.id === 'keyFacts')!.notes[0]).toMatch(/Team.*\$94.*\$39/);
  });

  it('wording: other words changed', async () => {
    const r = await grade(GOAL, page({ lead: 'Plan the month, split the load and see what is late, all in one quiet place built for busy groups.' }));
    onlyMoves(r, ['wording']);
    expect(value(r, 'keyFacts')).toBe(1);
  });

  it('noExtras: an extra section', async () => {
    const r = await grade(GOAL, page({ extra: '<div style="padding:32px 48px;background:#fef3c7"><h2 style="margin:0">Loved by thousands of teams</h2><p>Join them today and see the difference.</p></div>' }));
    expect(value(r, 'noExtras')).toBeLessThan(0.99);
    expect(value(r, 'completeness')).toBe(1);
    expect(value(r, 'keyFacts')).toBe(1);
    expect(value(r, 'wording')).toBe(1);
  });

  it('colour: the heading in another colour', async () => {
    onlyMoves(await grade(GOAL, page({ css: '.hero h1{color:#dc2626}' })), ['colour']);
  });

  it('typography: a serif typeface throughout', async () => {
    const r = await grade(GOAL, page({ css: 'body{font-family:Georgia,serif}' }));
    expect(value(r, 'typography')).toBeLessThan(0.9);
    for (const id of ['completeness', 'keyFacts', 'wording', 'colour', 'shape', 'pictures'] as CriterionId[]) expect(value(r, id), id).toBeGreaterThanOrEqual(0.99);
  });

  it('shape: square corners and no border on the cards', async () => {
    onlyMoves(await grade(GOAL, page({ css: '.card{border-radius:0;border-color:transparent;box-shadow:0 6px 18px rgba(0,0,0,.35)}' })), ['shape']);
  });

  it('pictures: a picture of something else', async () => {
    onlyMoves(await grade(GOAL, page({ picture: BARS })), ['pictures']);
  });

  it('placement: a component moved as a whole lowers its placement, not the spacing inside it', async () => {
    const r = await grade(GOAL, page({ css: '.foot{margin-top:160px}' }));
    onlyMoves(r, ['placement']);
    expect(value(r, 'spacing')).toBe(1);
  });

  it('spacing: a piece moved inside its component', async () => {
    const r = await grade(GOAL, page({ css: '.btn{margin-left:90px}' }));
    onlyMoves(r, ['spacing']);
  });

  it('structure: the cards stacked where the goal has them side by side', async () => {
    const r = await grade(GOAL, page({ css: '.cards{display:grid;grid-template-columns:300px}' }));
    onlyMoves(r, ['structure']);
  });
});

describe('monotone in its own fault', () => {
  it('completeness never rises as more components go missing', async () => {
    const one = value(await grade(GOAL, page({ cards: 2 })), 'completeness')!;
    const two = value(await grade(GOAL, page({ cards: 1 })), 'completeness')!;
    const three = value(await grade(GOAL, page({ cards: 1, footer: false })), 'completeness')!;
    expect(one).toBeLessThan(1);
    expect(two).toBeLessThan(one);
    expect(three).toBeLessThan(two);
  });

  it('keyFacts never rises as more key texts go wrong', async () => {
    const one = value(await grade(GOAL, page({ prices: ['$9', '$94', '$99'] })), 'keyFacts')!;
    const two = value(await grade(GOAL, page({ prices: ['$8', '$94', '$99'] })), 'keyFacts')!;
    const three = value(await grade(GOAL, page({ prices: ['$8', '$94', '$97'] })), 'keyFacts')!;
    expect(two).toBeLessThan(one);
    expect(three).toBeLessThan(two);
  });

  it('colour never rises as more of the page changes colour', async () => {
    const one = value(await grade(GOAL, page({ css: '.hero h1{color:#dc2626}' })), 'colour')!;
    const two = value(await grade(GOAL, page({ css: '.hero h1{color:#dc2626}.card h3{color:#dc2626}' })), 'colour')!;
    expect(two).toBeLessThan(one);
  });
});

describe('does not depend on the length of the page', () => {
  it('one wrong price lowers keyFacts the same on a short page and a long one', async () => {
    const shortGoal = page();
    const longGoal = page({ long: true });
    const short = value(await grade(shortGoal, page({ prices: ['$9', '$94', '$99'] })), 'keyFacts')!;
    const long = value(await grade(longGoal, page({ long: true, prices: ['$9', '$94', '$99'] })), 'keyFacts')!;
    expect(short).toBeLessThan(1);
    expect(Math.abs(short - long)).toBeLessThan(1e-3);
  });
});

describe('subScoresFromCriteria', () => {
  it('is the plain mean of each sub-score\'s criteria, leaving out nulls', () => {
    const c = (id: CriterionId, v: number | null): CriterionResult => ({ id, name: id, group: 'works', value: v, notes: [] });
    const b = subScoresFromCriteria([
      c('completeness', 1), c('keyFacts', 0.5), c('wording', null), c('noExtras', 0.9),
      c('structure', 1), c('placement', 0.7), c('spacing', 0.4),
      c('colour', 0.2), c('typography', 0.4), c('shape', 0.6),
      c('pictures', null), c('likeness', 0.8),
    ]);
    expect(b).toEqual({ content: 80, layout: 70, style: 40, visual: 80 });
    expect(subScoresFromCriteria([c('completeness', null)]).content).toBeNull();
  });
});
