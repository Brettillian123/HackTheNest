import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Grader } from '../src/index';

// Colours a person can barely tell apart cost a fraction of a point; a clearly different colour still costs heavily.
const page = (text: string, accent: string, bg = '#ffffff') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:Arial,sans-serif;background:${bg};color:${text}}
main{width:720px;margin:48px auto}
h1{margin:0 0 16px;font-size:36px}
p{margin:0 0 12px;font-size:16px;line-height:24px}
.tag{display:inline-block;padding:6px 12px;border-radius:6px;background:${accent};color:#fff;font-size:14px}
</style></head><body><main>
<h1>Quarterly planning notes</h1>
<p>Our team met on Tuesday to agree the plan for the next three months.</p>
<p>The budget is set, the hiring list is short, and the launch date holds.</p>
<p>Questions go to the planning channel before Friday.</p>
<span class="tag">Approved</span>
</main></body></html>`;

/** The looks score: style and visual as the page total weighs them. */
const looks = (b: { style: number; visual: number }) => b.style * 0.448 + b.visual * 0.552;

let grader: Grader;
let base: number;
beforeAll(async () => {
  grader = new Grader();
  const goal = page('#1e293b', '#2563eb');
  base = looks((await grader.grade(goal, goal)).result.breakdown);
});
afterAll(async () => {
  await grader.close();
});

const lost = async (goal: string, candidate: string) => base - looks((await grader.grade(goal, candidate)).result.breakdown);

describe('close colours', () => {
  it('charges dark slate text against plain dark grey under a point of looks', async () => {
    const goal = page('#1e293b', '#2563eb');
    expect(await lost(goal, page('#222222', '#2563eb'))).toBeLessThan(1);
    expect(await lost(goal, page('#333333', '#2563eb'))).toBeLessThan(1);
  });

  it('charges a white page against a very light grey one under a point of looks', async () => {
    expect(await lost(page('#1e293b', '#2563eb', '#f8fafc'), page('#1e293b', '#2563eb', '#ffffff'))).toBeLessThan(1);
  });

  it('still charges red against blue heavily', async () => {
    const goal = page('#1e3a8a', '#2563eb');
    expect(await lost(goal, page('#b91c1c', '#dc2626'))).toBeGreaterThan(8);
  });
});
