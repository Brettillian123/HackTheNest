import { describe, expect, it } from 'vitest';
import { checkSource, structureIssues } from '../../src/quality/index';

const GOAL = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title></head>
<body><header><nav><ul><li><a href="a.html">A</a></li></ul></nav></header>
<main><h1>Hi</h1><ol><li>one</li><li>two</li></ol>
<table><tr><th>Plan</th></tr><tr><td>Basic</td></tr></table>
<form><input type="email" required aria-label="Email"><input type="tel" aria-label="Phone"><button>Send</button></form></main>
<footer>f</footer></body></html>`;

const BARE = `<!DOCTYPE html><html lang="en"><head><title>t</title></head>
<body><div class="top"><a href="a.html">A</a></div>
<div><h1>Hi</h1><p>one</p><p>two</p>
<table><tr><td>Plan</td></tr><tr><td>Basic</td></tr></table>
<div><input type="text" aria-label="Email"><input aria-label="Phone"><div class="btn">Send</div></div></div>
<div>f</div></body></html>`;

const rules = (issues: { rule: string; count: number }[]) => Object.fromEntries(issues.map((i) => [i.rule, i.count]));

describe('structure rules, judged against the goal', () => {
  it('charge nothing on a page graded against itself', () => {
    const g = checkSource(GOAL);
    expect(structureIssues(g, g)).toEqual({ accessibility: [], validity: [] });
    const b = checkSource(BARE);
    expect(structureIssues(b, b)).toEqual({ accessibility: [], validity: [] });
  });

  it('name each thing the goal does and the page does not', () => {
    const { accessibility, validity } = structureIssues(checkSource(BARE), checkSource(GOAL));
    expect(rules(accessibility)).toEqual({
      'page-landmarks': 4,
      'list-markup': 2,
      'table-headers': 1,
      'real-buttons': 1,
      'field-types': 2,
      'field-required': 1,
      viewport: 1,
    });
    expect(rules(validity)).toEqual({ charset: 1 });
    for (const i of [...accessibility, ...validity]) expect(i.message).toMatch(/^[A-Z0-9].*[.]$/);
  });

  it('demand nothing the goal does not do', () => {
    const { accessibility, validity } = structureIssues(checkSource(GOAL), checkSource(BARE));
    expect(accessibility).toEqual([]);
    expect(validity).toEqual([]);
  });
});
