import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CALIBRATION_DIR, checkExpected, gradeSets, loadExpected, type SetReport } from '../src/calibrate';
import { MAX_HTML_BYTES } from '../src/config';
import { Grader, Renderer } from '../src/index';

const page = (body: string, css = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}${css}</style></head><body>${body}</body></html>`;

const CARD_CSS =
  '.card{margin:40px;padding:24px;width:320px;background:#1d4ed8;color:#fff;border-radius:12px}' +
  'h1{margin:0 0 8px;font-size:32px}p{margin:0;font-size:16px}';
const CARD = page('<div class="card"><h1>Weekly report</h1><p>Sales rose four percent.</p></div>', CARD_CSS);

const setFile = (set: string, name: string) =>
  readFileSync(join(CALIBRATION_DIR, 'sets', set, `${name}.html`), 'utf8');

let grader: Grader;
let reports: SetReport[];

beforeAll(async () => {
  grader = new Grader();
  reports = await gradeSets(grader);
});

afterAll(async () => {
  await grader.close();
});

describe('a page graded against itself', () => {
  it.each(['landing', 'profile', 'dashboard', 'article', 'checkout'])('scores exactly 100 on every part (%s)', async (set) => {
    const html = setFile(set, 'goal');
    const { result } = await grader.grade(html, html);
    expect(result.total).toBe(100);
    expect(result.breakdown).toEqual({ content: 100, layout: 100, style: 100, visual: 100 });
    expect(result.details.missingText).toEqual([]);
    expect(result.details.extraText).toEqual([]);
  });

  it.each(['landing', 'profile', 'dashboard', 'article', 'checkout'])('gives every criterion exactly 1 or null (%s)', async (set) => {
    const html = setFile(set, 'goal');
    const { result } = await grader.grade(html, html);
    expect(result.criteria).toHaveLength(12);
    for (const c of result.criteria!) expect(c.value === null || c.value === 1, `${c.id}=${c.value}`).toBe(true);
    expect(result.criteriaBreakdown).toEqual({ content: 100, layout: 100, style: 100, visual: 100 });
  });
});

describe('determinism', () => {
  it('gives the identical result every time, including from a fresh browser', async () => {
    const goal = setFile('landing', 'goal');
    const attempt = setFile('landing', 'good');
    const first = (await grader.grade(goal, attempt)).result;
    const second = (await grader.grade(goal, attempt)).result;
    const other = new Grader();
    let third;
    try {
      third = (await other.grade(goal, attempt)).result;
    } finally {
      await other.close();
    }
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(third)).toBe(JSON.stringify(first));
  });

  it('renders the same pixels twice', async () => {
    const html = setFile('profile', 'goal');
    const a = await grader.render(html);
    const b = await grader.render(html);
    expect(Buffer.compare(Buffer.from(a.pixels), Buffer.from(b.pixels))).toBe(0);
    expect(JSON.stringify(b.blocks)).toBe(JSON.stringify(a.blocks));
  });
});

describe('agreement with the human ranking', () => {
  it('puts every calibration attempt in its expected band and order', () => {
    expect(checkExpected(reports, loadExpected())).toEqual([]);
    // Attempts listed as pending are reported here, not enforced.
    const pending = checkExpected(reports, loadExpected(), 'pending');
    if (pending.length > 0) console.log(`pending (reported, not enforced):\n  ${pending.join('\n  ')}`);
  });

  it('covers every attempt with an expectation', () => {
    const expected = loadExpected();
    for (const report of reports) {
      const named = Object.keys(expected[report.name]?.bands ?? {}).sort();
      expect(named).toEqual(report.attempts.map((a) => a.name).sort());
    }
  });
});

describe('fairness', () => {
  it('does not care which tags built the page, only how it looks', async () => {
    const other = page(
      '<section class="k"><div class="t">Weekly report</div><span class="s">Sales rose four percent.</span></section>',
      '.k{margin:40px;padding:24px;width:320px;background:#1d4ed8;color:#fff;border-radius:12px}' +
        '.t{margin:0 0 8px;font-size:32px;font-weight:700}.s{display:block;font-size:16px}',
    );
    const { result } = await grader.grade(CARD, other);
    expect(result.total).toBeGreaterThanOrEqual(99);
  });

  it('gives no credit for text a person cannot see', async () => {
    const hidden = page(
      '<p style="color:#fff">Weekly report Sales rose four percent.</p>' +
        '<p style="display:none">Weekly report Sales rose four percent.</p>' +
        '<p style="font-size:1px">Weekly report Sales rose four percent.</p>' +
        '<p style="opacity:0">Weekly report Sales rose four percent.</p>' +
        '<p style="position:absolute;left:-9999px">Weekly report Sales rose four percent.</p>',
    );
    const { result } = await grader.grade(CARD, hidden);
    expect(result.breakdown.content).toBe(0);
    expect(result.total).toBeLessThan(5);
  });

  it('charges for extra content the goal does not have', async () => {
    const extra = CARD.replace(
      '</body>',
      '<div style="margin:40px;padding:24px;width:600px;background:#dc2626;color:#fff">An advert nobody asked for, with a lot of words in it.</div></body>',
    );
    const { result } = await grader.grade(CARD, extra);
    expect(result.total).toBeLessThan(90);
    expect(result.details.extraText.length).toBe(1);
  });

  it('forgives a few pixels and a barely different shade', async () => {
    const close = CARD.replace('margin:40px', 'margin:43px').replace('#1d4ed8', '#1f50da');
    const { result } = await grader.grade(CARD, close);
    expect(result.total).toBeGreaterThanOrEqual(97);
  });

  it('scores a text-free goal on layout, style and look only', async () => {
    const stripes = page(
      '<div style="height:200px;background:#dc2626"></div><div style="height:200px;background:#16a34a"></div>',
    );
    const same = await grader.grade(stripes, stripes);
    expect(same.result.breakdown.content).toBeNull();
    expect(same.result.total).toBe(100);
    const swapped = page(
      '<div style="height:200px;background:#16a34a"></div><div style="height:200px;background:#dc2626"></div>',
    );
    // Was "under 60", reached partly by charging the recoloured stripes as missing
    // in layout. The stripes are where they should be: the fault is their colour,
    // charged in style and in the look (brief change C).
    const r = (await grader.grade(stripes, swapped)).result;
    expect(r.total).toBeLessThan(70);
    expect(r.breakdown.layout).toBeGreaterThanOrEqual(99);
    expect(r.breakdown.style).toBeLessThan(60);
  });

  it('charges for words in the wrong order inside a sentence', async () => {
    const goal = page('<main><p>The quick brown fox jumps over the lazy dog.</p><p>Sales rose four percent this week.</p></main>');
    const scrambled = page('<main><p>Dog lazy the over jumps fox brown quick the.</p><p>Week this percent four rose sales.</p></main>');
    const { result } = await grader.grade(goal, scrambled);
    expect(result.breakdown.content).toBeLessThan(100);
    expect(result.breakdown.content).toBeGreaterThan(0);
  });

  it('leaves the position of whole paragraphs to layout, not content', async () => {
    const goal = page('<main><p>The quick brown fox jumps over the lazy dog.</p><p>Sales rose four percent this week.</p></main>');
    const swapped = page('<main><p>Sales rose four percent this week.</p><p>The quick brown fox jumps over the lazy dog.</p></main>');
    const { result } = await grader.grade(goal, swapped);
    expect(result.breakdown.content).toBe(100);
  });

  // A section 4 RGB units off the page colour is a "box" to the extractor
  // but invisible to a person; it must not cost more than a point.
  const SECTION_CSS = 'section{padding:40px;margin:20px}h1{margin:0;font-size:32px}';
  const plain = page('<section style="background:#fff"><h1>Weekly report</h1></section>', SECTION_CSS);
  const faint = page('<section style="background:#fbfbfb"><h1>Weekly report</h1></section>', SECTION_CSS);

  it('charges at most 1 point for a section background nobody can see (candidate has it)', async () => {
    const { result } = await grader.grade(plain, faint);
    expect(result.total).toBeGreaterThanOrEqual(99);
  });

  it('charges at most 1 point for a section background nobody can see (goal has it)', async () => {
    const { result } = await grader.grade(faint, plain);
    expect(result.total).toBeGreaterThanOrEqual(99);
  });

  it('does not let a barely visible goal box hide a bold colour in its place', async () => {
    const bold = page('<section style="background:#dc2626"><h1>Weekly report</h1></section>', SECTION_CSS);
    const { result } = await grader.grade(faint, bold);
    expect(result.total).toBeLessThanOrEqual(95);
  });

  it('scores a page made only of boxes too faint to count 100 against itself', async () => {
    const ghosts = page(
      '<div style="height:200px;margin:20px;background:#fbfbfb"></div><div style="height:120px;margin:20px;background:#fdfdfd"></div>',
    );
    const { result } = await grader.grade(ghosts, ghosts);
    expect(result.total).toBe(100);
    expect(result.breakdown.layout).toBe(100);
  });
});

describe('findings from the review, each fixed at its cause', () => {
  it('scores two pixel-identical pages the same however their lines are built', async () => {
    const css = '.t{margin:40px;font-size:18px;line-height:28px;color:#111}.t span{display:block}';
    const withBreaks = page('<div class="t">First line<br>Second line<br>Third line<br>Fourth line</div>', css);
    const withBlocks = page(
      '<div class="t"><span>First line</span><span>Second line</span><span>Third line</span><span>Fourth line</span></div>',
      css,
    );
    const a = await grader.render(withBreaks);
    const b = await grader.render(withBlocks);
    expect(Buffer.compare(Buffer.from(a.pixels), Buffer.from(b.pixels))).toBe(0);
    expect((await grader.grade(a, withBlocks)).result.total).toBe(100);
    expect((await grader.grade(b, withBreaks)).result.total).toBe(100);
  });

  it('counts visible text over a positioned background', async () => {
    const css =
      '.w{position:relative;width:400px;height:120px;margin:40px}' +
      '.bg{position:absolute;inset:0;background:#111827}' +
      '.tx{position:relative;color:#fff;font-size:24px;padding:40px}';
    const sibling = page('<div class="w"><div class="bg"></div><div class="tx">White on dark</div></div>', css);
    const ancestor = page(
      '<div class="w" style="background:#111827"><div class="tx">White on dark</div></div>',
      css,
    );
    const a = await grader.render(sibling);
    expect(a.blocks.filter((b) => b.kind === 'text').map((b) => b.text)).toEqual(['White on dark']);
    expect((await grader.grade(a, ancestor)).result.total).toBe(100);
    expect((await grader.grade(ancestor, sibling)).result.total).toBe(100);
  });

  it('gives nothing for a correct page hidden under a cover', async () => {
    const covered = CARD.replace('</body>', '<div style="position:fixed;inset:0;background:#fff"></div></body>');
    const { result, candidate } = await grader.grade(CARD, covered);
    expect(candidate!.blocks).toEqual([]);
    expect(result.total).toBeLessThan(5);
  });

  it('does not count text that is clipped away or covered', async () => {
    const clipped = page(
      '<div style="height:0;overflow:hidden"><p>Weekly report Sales rose four percent.</p></div>' +
        '<div style="position:relative"><p>Weekly report Sales rose four percent.</p>' +
        '<div style="position:absolute;inset:-20px;background:#fff"></div></div>',
    );
    const { result } = await grader.grade(CARD, clipped);
    expect(result.breakdown.content).toBe(0);
  });

  it('cannot be stalled by a page that makes its elements lie about themselves', async () => {
    const names = [
      'nextSibling', 'firstChild', 'parentNode', 'parentElement', 'nodeType', 'tagName',
      'getBoundingClientRect', 'getAttribute', 'checkVisibility', 'scrollHeight',
    ];
    const lying = page(
      `<form>${names.map((n) => `<input type="hidden" name="${n}">`).join('')}<p>inside the form</p></form>` +
        '<img name="body"><img name="documentElement"><img name="head"><img name="createElement">' +
        '<form name="createRange"></form><form name="querySelectorAll"></form><p>after the form</p>',
    );
    const started = Date.now();
    const snapshot = await grader.render(lying);
    expect(Date.now() - started).toBeLessThan(5000);
    const texts = snapshot.blocks.filter((b) => b.kind === 'text').map((b) => b.text);
    expect(texts).toContain('inside the form');
    expect(texts).toContain('after the form');
  });

  it('gives up on a page that never finishes, and keeps working afterwards', async () => {
    const stuck = new Renderer({ timeoutMs: 1500, extractSource: '(function () { while (true) {} })' });
    try {
      const started = Date.now();
      await expect(stuck.render(CARD)).rejects.toThrow(/timed out/);
      expect(Date.now() - started).toBeLessThan(12_000);
    } finally {
      await stuck.close();
    }
    const { result } = await grader.grade(CARD, CARD);
    expect(result.total).toBe(100);
  });

  it('renders an animated SVG the same every time', async () => {
    const animated = page(
      '<svg width="300" height="100"><rect width="60" height="60" fill="#dc2626">' +
        '<animate attributeName="x" from="0" to="240" dur="0.4s" repeatCount="indefinite"/></rect></svg><p>Moving box</p>',
    );
    const first = await grader.render(animated);
    for (let i = 0; i < 4; i++) {
      const again = await grader.render(animated);
      expect(Buffer.compare(Buffer.from(again.pixels), Buffer.from(first.pixels))).toBe(0);
    }
  });

  it('does not let a small dot stand in for a large panel of the same colour', async () => {
    const panel = page('<div style="margin:40px;width:600px;height:300px;background:#1d4ed8"></div>');
    const dot = page('<div style="margin:300px 0 0 900px;width:4px;height:4px;background:#1d4ed8"></div>');
    const { result } = await grader.grade(panel, dot);
    expect(result.details.matchedBlocks).toBe(0);
    expect(result.total).toBeLessThan(5);
  });
});

describe('findings from the property hunt, each fixed at its cause', () => {
  it('judges Chinese one character at a time: one changed character is a small mistake', async () => {
    const goal = page('<h1>我们的花园很美丽</h1><p>今天天气很好，我们一起去公园散步吧。</p>');
    const one = page('<h1>我们的花园很漂亮</h1><p>今天天气很好，我们一起去公园散步吧。</p>');
    const { result } = await grader.grade(goal, one);
    expect(result.details.matchedBlocks).toBe(2); // was 1: the whole heading counted as one wrong word
    // was 62.8. The heading is key text: a wrong word in it is a typo in the
    // headline, which a person charges about 8 to 15 points (brief change A),
    // so this was "at least 95" and is now "at least 80".
    expect(result.total).toBeGreaterThanOrEqual(80);
  });

  it('reads emoji as words', async () => {
    const goal = page('<h1 style="margin:40px">Launch day 🚀</h1>');
    const { result } = await grader.grade(goal, page('<h1 style="margin:40px">Launch day 🐢</h1>'));
    expect(result.breakdown.content).toBeLessThan(100); // was 100: emoji were invisible to content
  });

  it('does not charge for a gradient stop moved by one unit', async () => {
    const grad = (a: string) =>
      page(`<div style="margin:40px;height:200px;width:600px;background:linear-gradient(90deg,${a},#9333ea)"></div><p style="margin:40px">Caption</p>`);
    const { result } = await grader.grade(grad('#1d4ed8'), grad('#1e4fd9'));
    expect(result.total).toBeGreaterThanOrEqual(99.5); // was 98.7: the sampled colour jumped across the gradient
  });

  const card = (b: string) =>
    page(`<div style="margin:40px;padding:24px;width:400px;background:#e5e7eb;${b}"><h2>Plan</h2><p>Simple pricing for teams.</p></div>`);

  it('does not charge for a border nobody can see against its own card', async () => {
    const { result } = await grader.grade(card(''), card('border:2px solid #e9ebef'));
    expect(result.total).toBeGreaterThanOrEqual(99.5); // was 98.1
  });

  it('charges for a border much thicker than the goal\'s', async () => {
    const { result } = await grader.grade(card('border:1px solid #374151'), card('border:16px solid #374151'));
    expect(result.breakdown.style).toBeLessThan(97); // was 100: style ignored border width
  });

  it('sees the colour of a shape drawn with borders', async () => {
    const tri = (c: string) =>
      page(`<div style="margin:40px;width:0;height:0;border-left:60px solid transparent;border-right:60px solid transparent;border-bottom:100px solid ${c}"></div>`);
    const { result } = await grader.grade(tri('#dc2626'), tri('#1d4ed8'));
    expect(result.breakdown.style).toBeLessThan(80); // was 95.6: only the border's half-weight saw it
  });

  it('still recognises a paragraph cut short, so its font and place keep their credit', async () => {
    const long =
      'The quick brown fox jumps over the lazy dog while the market opens early and the river runs past the old stone mill near the village square every single morning.';
    const goal = page(`<h1 style="margin:40px">Title</h1><p style="margin:40px">${long}</p>`);
    const cut = page(`<h1 style="margin:40px">Title</h1><p style="margin:40px">The quick brown fox jumps over the lazy dog.</p>`);
    const { result } = await grader.grade(goal, cut);
    expect(result.details.matchedBlocks).toBe(2); // was 1
    expect(result.breakdown.style).toBe(100); // was 25.9
    expect(result.breakdown.content).toBeLessThan(60);
  });

  it('scores a form field and a look-alike box with the same text the same', async () => {
    const field = page('<input placeholder="Email address" style="margin:40px;padding:10px;width:300px;font-size:16px;border:1px solid #9ca3af">');
    const fake = page(
      '<div style="margin:40px;padding:10px;width:300px;font-size:16px;border:1px solid #9ca3af;color:#757575;display:inline-block;box-sizing:content-box">Email address</div>',
    );
    expect((await grader.grade(field, fake)).result.total).toBeGreaterThanOrEqual(99); // was 81.6
  });

  it('on an empty goal, one stray word costs less than painting the whole page', async () => {
    const dark = page('', 'body{background:#0f172a}');
    const word = (await grader.grade(dark, page('<p style="color:#fff">hello</p>', 'body{background:#0f172a}'))).result;
    const white = (await grader.grade(dark, page(''))).result;
    expect(word.total).toBeGreaterThan(white.total); // was 29.7 against 40
  });
});

describe('feedback', () => {
  const FB_CSS =
    '.top{height:90px;margin:0 40px}h1{margin:0;padding-top:24px;font-size:40px;color:#111827}' +
    'p{margin:0 40px 24px;font-size:16px;color:#374151;width:600px}' +
    '.buy{display:inline-block;margin:0 40px 32px;padding:12px 24px;background:#ea580c;color:#fff;font-weight:700}' +
    '.row{display:flex;gap:24px;margin:0 40px}.card{flex:1;height:140px;padding:16px;background:#dbeafe;color:#1e3a8a}';
  const body = (o: { heading?: string; text?: string; cardsTop?: number; tail?: string } = {}) =>
    `<div class="top">${o.heading ?? '<h1>Pricing</h1>'}</div>` +
    `<p>${o.text ?? 'Pick the plan that suits your team. Every plan includes support and updates.'}</p>` +
    '<a class="buy">Buy now</a>' +
    `<div class="row" style="margin-top:${o.cardsTop ?? 0}px"><div class="card">Starter</div><div class="card">Team</div><div class="card">Business</div></div>` +
    (o.tail ?? '');
  const GOAL = page(body(), FB_CSS);
  let goalSnap: Awaited<ReturnType<Grader['render']>>;
  beforeAll(async () => {
    goalSnap = await grader.render(GOAL);
  });
  const top = async (html: string) => (await grader.grade(goalSnap, html)).result;
  const lost = (r: { total: number }) => 100 - r.total;
  const sum = (r: { feedback?: { points: number }[] }) => r.feedback!.reduce((s, f) => s + f.points, 0);

  it('is empty for a perfect page', async () => {
    const r = await top(GOAL);
    expect(r.total).toBe(100);
    expect(r.feedback).toEqual([]);
  });

  it('names a missing heading first, and its points add up', async () => {
    const r = await top(page(body({ heading: '' }), FB_CSS));
    expect(r.feedback![0].message).toBe("The heading 'Pricing' is missing");
    expect(Math.abs(sum(r) - lost(r))).toBeLessThanOrEqual(2);
  });

  it('names extra text first', async () => {
    const r = await top(page(body({ tail: '<p>Sign up now</p>' }), FB_CSS));
    expect(r.feedback![0].message).toBe("Extra text the goal does not have: 'Sign up now'");
    expect(Math.abs(sum(r) - lost(r))).toBeLessThanOrEqual(2);
  });

  it('names a button in the wrong colour first', async () => {
    const r = await top(page(body(), FB_CSS.replace('#ea580c', '#16a34a')));
    expect(r.feedback![0].message).toBe("The button 'Buy now' is green where the goal's is orange");
    expect(Math.abs(sum(r) - lost(r))).toBeLessThanOrEqual(2);
  });

  it('reports cards that sit too low together', async () => {
    const r = await top(page(body({ cardsTop: 40 }), FB_CSS));
    expect(r.feedback![0].message).toMatch(/^3 (boxes|things) sit about 40 pixels too low$/);
  });

  it('says when the body text is smaller', async () => {
    const r = await top(page(body(), FB_CSS.replace('font-size:16px', 'font-size:12px')));
    expect(r.feedback!.map((f) => f.message)).toContain(
      "The text 'Pick the plan that suits your team. E...' is noticeably smaller than the goal's (12 px text instead of 16 px)",
    );
  });

  it('says when the page background is dark instead of light', async () => {
    // Text kept light so it stays readable: dark text on the dark page would rightly count as missing.
    const r = await top(page(body(), FB_CSS + 'body{background:#1f2937}h1,p{color:#f9fafb !important}'));
    expect(r.feedback![0].message).toBe("The page background is dark where the goal's is light");
  });

  it('is identical on every run, most costly first, at most six', async () => {
    const html = page(body({ heading: '<h1>Prices</h1>', cardsTop: 20, tail: '<p>Sign up now</p>' }), FB_CSS.replace('#ea580c', '#16a34a'));
    const a = await top(html);
    const b = await top(html);
    expect(JSON.stringify(b.feedback)).toBe(JSON.stringify(a.feedback));
    expect(a.feedback!.length).toBeLessThanOrEqual(6);
    const points = a.feedback!.map((f) => f.points);
    expect([...points].sort((x, y) => y - x)).toEqual(points);
  });
});

// Marking like a person: noticed faults cost what a fair person would take off.
describe('noticed faults', () => {
  const SITE_CSS =
    '.top{display:flex;justify-content:space-between;align-items:center;padding:20px 40px}.logo{font-size:22px;font-weight:700;color:#111827}' +
    'main{max-width:900px;margin:0 auto;padding:0 40px}h1{font-size:44px;margin:40px 0 12px;color:#111827}' +
    'p{font-size:16px;line-height:1.5;color:#374151;margin:0 0 16px}.price{font-size:40px;font-weight:700;color:#111827;margin:24px 0}' +
    '.buy{display:inline-block;padding:12px 24px;background:#0f766e;color:#fff;font-weight:700;border-radius:8px}' +
    'section{margin:48px 0}h2{font-size:28px;margin:0 0 12px;color:#111827}';
  const filler = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      `<section><h2>Section ${['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][i]}</h2>` +
      `<p>Teams use this part of the product every week to plan the work ahead, share notes and keep track of what changed since the last review meeting.</p>` +
      `<p>Each plan includes support, updates and a friendly onboarding call so nobody is left guessing how the pieces fit together.</p></section>`,
    ).join('');
  const site = (o: { price?: string; label?: string; sections?: number; css?: string; logo?: string } = {}) =>
    page(
      `<div class="top"><div class="logo">${o.logo ?? 'Brightleaf'}</div><div>Features Pricing Contact</div></div>` +
        `<main><h1>Plan your week in minutes</h1><p>A calm planner for busy teams.</p>` +
        `<div class="price">${o.price ?? '$49'}</div><a class="buy">${o.label ?? 'Start free trial'}</a>${filler(o.sections ?? 0)}</main>`,
      SITE_CSS + (o.css ?? ''),
    );

  // A: the same fault costs about the same on a one-screen page as on a long one.
  it('charges a wrong price about the same on a short page and a long page, and like a boss would', async () => {
    const shortCost = 100 - (await grader.grade(site(), site({ price: '$94' }))).result.total;
    const longCost = 100 - (await grader.grade(site({ sections: 8 }), site({ sections: 8, price: '$94' }))).result.total;
    expect(shortCost).toBeGreaterThanOrEqual(8);
    expect(longCost).toBeGreaterThanOrEqual(8);
    expect(Math.abs(shortCost - longCost)).toBeLessThanOrEqual(3);
  });

  // Third pass: hard faults keep fixed costs, soft slips are small and bounded (decisions 1 to 10).
  const cost = async (g: string, a: string) => 100 - (await grader.grade(g, a)).result.total;
  const SLIPS = 'p{color:#4b5563}h2{font-weight:600}.buy{border-radius:4px;padding:14px 26px}h1{font-size:46px}main{padding-top:6px}.logo{font-size:23px}';
  it('1: a careful rebuild with several kinds of small slip still scores high', async () => {
    const { result } = await grader.grade(site({ sections: 3 }), site({ sections: 3, css: SLIPS }));
    expect(result.total).toBeGreaterThanOrEqual(85);
  });

  it('2: a grey nobody would tell apart side by side costs nothing', async () => {
    const { result } = await grader.grade(site({ sections: 3 }), site({ sections: 3, css: 'p{color:#3a4454}' }));
    expect(result.total).toBeGreaterThanOrEqual(99);
  });

  it('3: words that are on screen are never missing: a footer on one line, a date written another way', async () => {
    const foot = (one: boolean) =>
      page(
        `<main><h1>Plan your week in minutes</h1><p>Issued 3 November 2026</p></main>` +
          (one
            ? '<footer style="display:flex;padding:20px 40px"><span>© 2026 Brightleaf · Shipping · Returns · Contact</span></footer>'
            : '<footer style="display:flex;justify-content:space-between;padding:20px 40px"><span>© 2026 Brightleaf</span><span>Shipping · Returns · Contact</span></footer>'),
        SITE_CSS,
      );
    const { result } = await grader.grade(foot(false), foot(true));
    expect(result.feedback.some((f) => /missing/.test(f.message))).toBe(false);
    const dated = await grader.grade(foot(false), foot(false).replace('3 November 2026', '03/11/2026'));
    expect(dated.result.feedback.some((f) => /missing|Extra/.test(f.message))).toBe(false);
    expect(dated.result.total).toBeGreaterThanOrEqual(90);
  });

  it('4: each further wrong price costs about as much as the first', async () => {
    const menu = (prices: string[]) => page(prices.map((p, i) => `<p style="margin:16px 40px;font-size:18px">Dish number ${['one', 'two', 'three', 'four', 'five', 'six'][i]} <b>${p}</b></p>`).join(''));
    const right = ['12', '16', '19', '23', '26', '31'];
    const one = await cost(menu(right), menu(['21', ...right.slice(1)]));
    const four = await cost(menu(right), menu(['21', '61', '91', '32', ...right.slice(4)]));
    expect(one).toBeGreaterThanOrEqual(5);
    expect(four).toBeGreaterThanOrEqual(3.2 * one);
  });

  it('5: the look without the words is worth little', async () => {
    const hidden = site({ sections: 2, css: '*{color:transparent !important}' });
    const { result } = await grader.grade(site({ sections: 2 }), hidden);
    expect(result.total).toBeLessThanOrEqual(30);
  });

  it('6: ticks and bullets are decoration, not missing or extra words', async () => {
    const list = (tick: string) => page(`<ul style="list-style:none;margin:40px">${['Fast sync', 'Tax reports', 'Bank feeds'].map((t) => `<li style="margin:8px 0">${tick}${t}</li>`).join('')}</ul>`);
    const { result } = await grader.grade(list(''), list('<span style="color:#16a34a;margin-right:8px">✓</span>'));
    expect(result.feedback.some((f) => /Extra text|missing/.test(f.message))).toBe(false);
    expect(result.total).toBeGreaterThanOrEqual(90);
  });

  it('7: the whole page twice is a broken page, not a small extra', async () => {
    const goal = site({ sections: 1 });
    const twice = goal.replace(/<body>([\s\S]*)<\/body>/, '<body>$1$1</body>');
    expect(twice).not.toBe(goal);
    const { result } = await grader.grade(goal, twice);
    expect(result.total).toBeLessThanOrEqual(62);
  });

  it('8: a placeholder grey a shade paler than the goal is not unreadable', async () => {
    const { result } = await grader.grade(site({ sections: 2, css: 'p{color:#6b7280}' }), site({ sections: 2, css: 'p{color:#94a3b8}' }));
    expect(result.feedback.some((f) => /hard to read/.test(f.message))).toBe(false);
    expect(result.total).toBeGreaterThanOrEqual(80);
  });

  it('9: the page restyled throughout scores above the same words with no style at all', async () => {
    const goal = site({ sections: 2 });
    const restyled = site({ sections: 2, css: 'body{font-family:Georgia,serif}h2{color:#ea580c;font-size:34px}p{font-size:18px}.buy{background:#1d4ed8}' });
    const bare = `<!doctype html><html><body>${goal.replace(/[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*/, '')}</body></html>`;
    expect((await grader.grade(goal, restyled)).result.total).toBeGreaterThan((await grader.grade(goal, bare)).result.total);
  });

  it('10: feedback is plain English and names what it can see', async () => {
    const { result } = await grader.grade(site({ sections: 2 }), site({ sections: 2, css: 'main{padding-left:3px}body{background:#fff}' }));
    for (const f of result.feedback) expect(f.message).not.toMatch(/sits is|lighter white|darker white/);
  });

  it('names a changed value as one fault: what it says and what the goal says', async () => {
    const { result } = await grader.grade(site({ sections: 3 }), site({ sections: 3, label: 'Learn more' }));
    expect(result.feedback[0].message).toMatch(/says 'Learn more' where the goal says 'Start free trial'/);
    expect(result.feedback.some((f) => /missing|Extra text/.test(f.message))).toBe(false);
    expect(result.total).toBeLessThanOrEqual(92);
  });

  // B: small differences cost a little, never nothing; a lost centring is a fault.
  it('charges a little for a whole page a few pixels low, and never more than a point', async () => {
    const { result } = await grader.grade(site({ sections: 2 }), site({ sections: 2, css: 'body{padding-top:6px}' }));
    expect(result.total).toBeLessThan(100);
    expect(result.total).toBeGreaterThanOrEqual(99);
  });

  it('charges a column that lost its centring as the fault it is', async () => {
    const { result } = await grader.grade(site({ sections: 2 }), site({ sections: 2, css: 'main{margin:0}' }));
    expect(result.total).toBeLessThanOrEqual(90);
  });

  // C: colour is a colour fault; pale text is a legibility fault; a drawing's colour counts.
  it('calls a box in another colour a colour fault, never missing', async () => {
    const grey = CARD.replace('#1d4ed8', '#6b7280');
    const { result } = await grader.grade(CARD, grey);
    expect(result.details.matchedBlocks).toBe(3);
    expect(result.feedback.some((f) => /missing/.test(f.message))).toBe(false);
    expect(result.breakdown.layout).toBeGreaterThanOrEqual(99);
    expect(result.total).toBeLessThan(97);
  });

  it('charges heavily for pale text that is hard to read where the goal is clear', async () => {
    const pale = site({ sections: 3, css: 'h1,h2,p,.logo,.price{color:#d1d5db !important}' });
    const { result } = await grader.grade(site({ sections: 3 }), pale);
    expect(result.total).toBeLessThanOrEqual(75);
    expect(result.feedback[0].message).toMatch(/hard to read/);
  });

  it('sees a chart drawn in another colour', async () => {
    const chart = (c: string) =>
      page(`<h1 style="margin:40px">Revenue</h1><svg style="margin:0 40px" width="400" height="200"><rect x="0" y="40" width="60" height="160" fill="${c}"/><rect x="100" y="80" width="60" height="120" fill="${c}"/><rect x="200" y="20" width="60" height="180" fill="${c}"/></svg>`);
    const { result } = await grader.grade(chart('#4f46e5'), chart('#dc2626'));
    expect(result.total).toBeLessThan(97);
  });

  // D: one cause, one charge.
  it('charges a missing row of icons once, not again for everything that moved up', async () => {
    const icons = '<div style="display:flex;gap:24px;margin:24px 40px">' + '<div style="width:48px;height:48px;background:#0f766e;border-radius:8px"></div>'.repeat(6) + '</div>';
    const rest = filler(4);
    const goal = page(`<h1 style="margin:40px">Features</h1>${icons}<main>${rest}</main>`, SITE_CSS);
    const attempt = page(`<h1 style="margin:40px">Features</h1><main>${rest}</main>`, SITE_CSS);
    const { result } = await grader.grade(goal, attempt);
    expect(result.feedback[0].message).toMatch(/missing/);
    expect(result.feedback.some((f) => /too high/.test(f.message))).toBe(false);
    expect(result.total).toBeGreaterThanOrEqual(78);
  });

  // E: typeface family and corners, judged as a person sees them.
  it('charges a typeface change across the page as one plain fault', async () => {
    const { result } = await grader.grade(site({ sections: 3 }), site({ sections: 3, css: 'body{font-family:Georgia,serif}' }));
    expect(result.total).toBeLessThanOrEqual(94);
    expect(result.feedback.some((f) => /serif font where the goal uses a sans-serif one/.test(f.message))).toBe(true);
  });

  it('sees 12 px corners on a big card as rounded', async () => {
    const card = (r: number) => page(`<div style="margin:40px;width:700px;height:360px;background:#1d4ed8;border-radius:${r}px"></div>`);
    const { result } = await grader.grade(card(12), card(0));
    expect(result.breakdown.style).toBeLessThan(97);
    expect(result.total).toBeLessThan(100);
  });

  // F: the words matter: placeholder text in the right look is far from right.
  it('scores placeholder text in a perfect look well under 60', async () => {
    const lorem = site({ sections: 3 })
      .replace(/Teams use this part[^<]*/g, 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim.')
      .replace(/Each plan includes[^<]*/g, 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute.')
      .replace('A calm planner for busy teams.', 'Duis aute irure dolor in reprehenderit.');
    const { result } = await grader.grade(site({ sections: 3 }), lorem);
    expect(result.total).toBeLessThan(60);
  });

  // G: tall pages are graded all the way down, quickly.
  it('sees a change far below the old 2400 px cut, and grades a 5500 px page in well under 2 seconds', async () => {
    const tall = (tail: string) => page(`<div style="height:5200px;background:#f1f5f9"></div><p style="margin:40px">${tail}</p>`);
    const goal = await grader.render(tall('The very end of the page'));
    expect(goal.height).toBeGreaterThanOrEqual(5200);
    const started = Date.now();
    const { result } = await grader.grade(goal, tall('Something else entirely here'));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.total).toBeLessThan(100);
  });

  // H: feedback says the cause, in correct English.
  it('says "sits" for one thing and "sit" for several', async () => {
    const one = page('<h1 style="margin:40px">Weekly report</h1><div style="margin:40px 40px 0 140px;width:200px;height:80px;background:#1d4ed8"></div>');
    const goal = page('<h1 style="margin:40px">Weekly report</h1><div style="margin:40px;width:200px;height:80px;background:#1d4ed8"></div>');
    const { result } = await grader.grade(goal, one);
    const line = result.feedback.find((f) => /too far right/.test(f.message))!;
    expect(line.message).toMatch(/ sits about 100 pixels too far right$/);
    expect(line.message).not.toMatch(/^1 /);
  });

  // Second pass. 1: many kinds of fault at once level off well short of nothing.
  it('does not multiply a loose rebuild down to nothing: every sub-score keeps something', async () => {
    const { result } = await grader.grade(setFile('dashboard', 'goal'), setFile('dashboard', 'rebuild-vague'));
    const b = result.breakdown;
    for (const v of [b.content!, b.layout, b.style, b.visual]) expect(v).toBeGreaterThan(5);
    expect(result.total).toBeGreaterThanOrEqual(20);
  });

  // 2: one wider column pushes everything to its right along; that is one cause, charged once and lightly.
  it('charges a wider sidebar once, names it, and not again for everything to its right', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => `<tr><td>#10${i}4</td><td>Customer ${['Ann', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal'][i]}</td><td>$${120 + i * 7}.00</td><td>Paid</td></tr>`).join('');
    const dash = (side: number) =>
      page(
        `<div style="display:flex"><aside style="width:${side}px;min-height:900px;background:#111827;color:#fff;padding:20px;box-sizing:border-box"><b>Orbit</b></aside>` +
          `<main style="flex:1;padding:24px"><h1 style="margin:0 0 16px;font-size:28px">Overview</h1>` +
          `<table style="width:900px;border-collapse:collapse">${rows}</table></main></div>`,
        'td{padding:10px 12px;font-size:15px;border-bottom:1px solid #e5e7eb}',
      );
    const { result } = await grader.grade(dash(200), dash(234));
    expect(result.total).toBeGreaterThanOrEqual(93);
    expect(result.feedback[0].message).toMatch(/wider than the goal's, so what is to its right sits further right/);
    expect(result.feedback.some((f) => /table cells sit/.test(f.message))).toBe(false);
  });

  // 3: the same words split into two pieces next to each other are the same text.
  it('does not call words split differently changed, missing or extra', async () => {
    const goal = page('<footer style="margin:40px;font-size:15px;color:#374151">Fernway © 2026 Fernway Inc.</footer>');
    const attempt = page('<footer style="margin:40px;font-size:15px;color:#374151;display:flex;gap:40px"><span>Fernway</span><span>© 2026 Fernway Inc.</span></footer>');
    const { result } = await grader.grade(goal, attempt);
    expect(result.feedback.some((f) => /Extra text|missing| says /.test(f.message))).toBe(false);
    expect(result.breakdown.content).toBeGreaterThanOrEqual(95);
  });

  // 4: a frame drawn round each cell, against one line per row, is a few missing lines, not a section.
  it('charges a missing hairline frame lightly and never calls it a section', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => `<tr><td>Order ${i + 1}</td><td>Shipped</td><td>$${40 + i}.00</td></tr>`).join('');
    const table = (css: string) => page(`<h1 style="margin:40px">Recent orders</h1><table style="margin:0 40px;width:700px;border-collapse:separate;border-spacing:0">${rows}</table>`, `td{padding:12px;font-size:15px;${css}}`);
    const { result } = await grader.grade(table('border:1px solid #e5e7eb'), table('border-bottom:1px solid #e5e7eb'));
    expect(result.feedback.some((f) => /section/.test(f.message))).toBe(false);
    expect(result.total).toBeGreaterThanOrEqual(95);
  });

  // 5 and 6: a thing still where the goal has it has not moved, whatever its neighbours did.
  it('charges two swapped cards as the swap, not again for identical icons left in place', async () => {
    const card = (t: string) => `<div style="width:300px;padding:20px;border:1px solid #e5e7eb;border-radius:12px"><div style="width:40px;height:40px;background:#16a34a;border-radius:8px"></div><h3>${t}</h3><p>Short note about ${t.toLowerCase()}.</p></div>`;
    const row = (a: string, b: string, c: string) => page(`<div style="display:flex;gap:24px;margin:40px">${card(a)}${card(b)}${card(c)}</div>`);
    const { result } = await grader.grade(row('Calendars', 'Reminders', 'Reviews'), row('Reminders', 'Calendars', 'Reviews'));
    expect(result.feedback.some((f) => /picture|box near/.test(f.message) && /sits/.test(f.message))).toBe(false);
    expect(result.total).toBeGreaterThanOrEqual(80);
  });
});

describe('safety', () => {
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

  it('never runs a script from a submission', async () => {
    const attack = CARD.replace(
      '</body>',
      '<script>document.body.innerHTML = "<h1>Weekly report</h1>".repeat(50)</script>' +
        '<img src="x" onerror="document.title=1;document.body.style.background=\'red\'">' +
        '<svg onload="document.body.innerHTML=\'pwned\'"></svg></body>',
    );
    const { result, candidate } = await grader.grade(CARD, attack);
    const texts = candidate!.blocks.filter((b) => b.kind === 'text').map((b) => b.text);
    expect(texts).toEqual(['Weekly report', 'Sales rose four percent.']);
    expect(result.breakdown.content).toBe(100);
  });

  it('never lets a submission reach the network', async () => {
    const attack = page(
      `<link rel="stylesheet" href="${origin}/a.css"><img src="${origin}/b.png">` +
        `<iframe src="${origin}/c.html"></iframe><object data="${origin}/d"></object>` +
        `<video src="${origin}/e.mp4" autoplay></video><form action="${origin}/f"><input name="q"></form>` +
        `<meta http-equiv="refresh" content="0;url=${origin}/g"><a href="${origin}/h" ping="${origin}/i">x</a>` +
        '<p>still here</p>',
      `@import url("${origin}/j.css");body{background:url("${origin}/k.png")}@font-face{font-family:f;src:url("${origin}/l.woff2")}p{font-family:f}`,
    );
    const snapshot = await grader.render(attack);
    expect(snapshot.blocks.some((b) => b.text === 'still here')).toBe(true);
    expect(hits).toBe(0);
  });

  it('scores an oversized submission 0 with a reason, without throwing', async () => {
    const huge = page('<p>' + 'a'.repeat(MAX_HTML_BYTES) + '</p>');
    const { result, candidate } = await grader.grade(CARD, huge);
    expect(candidate).toBeNull();
    expect(result.total).toBe(0);
    expect(result.error).toMatch(/larger than/);
  });

  it('survives hostile but valid pages', async () => {
    const deep = page('<div>'.repeat(3000) + 'deep' + '</div>'.repeat(3000));
    const many = page('<span style="background:#000;display:inline-block;width:4px;height:4px"></span>'.repeat(4000));
    const tall = page('<div style="height:500000px;background:linear-gradient(#000,#fff)"></div>');
    const spin = page(
      '<p class="s">spinning</p>',
      '@keyframes r{from{transform:translateX(0)}to{transform:translateX(400px)}}.s{animation:r 1s linear infinite}',
    );
    for (const html of [deep, many, tall, spin, '', '<<<>>>', '<html><body><table><tr><td>']) {
      const { result } = await grader.grade(CARD, html);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThan(50);
    }
    const a = await grader.render(spin);
    const b = await grader.render(spin);
    expect(JSON.stringify(b.blocks)).toBe(JSON.stringify(a.blocks));
  });
});
