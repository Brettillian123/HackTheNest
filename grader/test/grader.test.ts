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
  it.each(['landing', 'profile'])('scores exactly 100 on every part (%s)', async (set) => {
    const html = setFile(set, 'goal');
    const { result } = await grader.grade(html, html);
    expect(result.total).toBe(100);
    expect(result.breakdown).toEqual({ content: 100, layout: 100, style: 100, visual: 100 });
    expect(result.details.missingText).toEqual([]);
    expect(result.details.extraText).toEqual([]);
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
    expect((await grader.grade(stripes, swapped)).result.total).toBeLessThan(60);
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
