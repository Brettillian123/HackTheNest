import { describe, expect, it } from 'vitest';
import { checkSource } from '../../src/quality/source-checks';
import { validityIssues } from '../../src/quality/validity';
import { CLEAN_PAGE } from './fixtures';

const page = (body: string, head = '<title>t</title>') =>
  `<!DOCTYPE html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

function rules(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of validityIssues(checkSource(html))) out[i.rule] = i.count;
  return out;
}

function issue(html: string, rule: string) {
  return validityIssues(checkSource(html)).find((i) => i.rule === rule);
}

describe('checkSource on a clean page', () => {
  it('finds nothing', () => {
    const facts = checkSource(CLEAN_PAGE);
    expect(facts.hasDoctype).toBe(true);
    expect(facts.parseErrors).toEqual({});
    expect(validityIssues(facts)).toEqual([]);
  });
});

describe('doctype', () => {
  it('flags a missing doctype', () => {
    const i = issue('<html><head><title>t</title></head><body><p>x</p></body></html>', 'no-doctype');
    expect(i?.count).toBe(1);
    expect(i?.message).toMatch(/does not start with <!DOCTYPE html>/);
  });
  it('accepts lowercase and XHTML strict doctypes', () => {
    expect(rules('<!doctype html><html><head><title>t</title></head><body>x</body></html>')).toEqual({});
    const xhtml =
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"><html><head><title>t</title></head><body>x</body></html>';
    expect(rules(xhtml)['no-doctype']).toBeUndefined();
  });
});

describe('unclosed and stray tags', () => {
  it('counts unclosed tags', () => {
    const i = issue(page('<div><span>x</div><section>y'), 'unclosed-tag');
    expect(i?.count).toBe(2);
    expect(i?.message).toBe('2 tags are never closed, or closed in the wrong order.');
  });
  it('counts misnested tags', () => {
    expect(rules(page('<b><i>x</b></i>'))).toEqual({ 'unclosed-tag': 1, 'stray-end-tag': 1 });
  });
  it('counts stray closing tags', () => {
    const i = issue(page('<p>x</p></span></div>'), 'stray-end-tag');
    expect(i?.count).toBe(2);
    expect(i?.message).toBe('2 closing tags have no matching opening tag.');
  });
  it('does not flag optional end tags, void elements or a closing slash on a void element', () => {
    expect(
      rules(page('<p>a<p>b<ul><li>1<li>2</ul><dl><dt>a<dd>b</dl><table><tr><td>1<td>2</table><br><br/><img src=a alt="" /><input><hr/><select><option>a<option>b</select>')),
    ).toEqual({});
  });
  it('does not flag a page without </body></html> or with whitespace after </html>', () => {
    expect(rules('<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><p>x')).toEqual({});
    expect(rules(page('<p>x</p>') + '\n\n')).toEqual({});
  });
});

describe('self-closing tags', () => {
  it('flags <div/> once, not also as unclosed', () => {
    const r = rules(page('<div/>x<span/>'));
    expect(r).toEqual({ 'self-closing-tag': 2 });
  });
  it('does not flag self-closing SVG or void elements', () => {
    expect(rules(page('<svg><path d="M0 0"/><circle r="2"/></svg><br/><meta charset="utf-8"/>'))).toEqual({});
  });
});

describe('attribute syntax and character references', () => {
  it('flags a repeated attribute', () => {
    expect(rules(page('<div class="a" class="b">x</div>'))).toEqual({ 'attribute-syntax': 1 });
  });
  it('flags an entity missing its semicolon', () => {
    const i = issue(page('<p>&copy 2026</p>'), 'character-reference');
    expect(i?.count).toBe(1);
  });
  it('does not flag a bare ampersand or one in a link', () => {
    expect(rules(page('<p>AT&T and a & b</p><a href="/x?a=1&b=2&copy=3">x</a>'))).toEqual({});
  });
});

describe('duplicate ids', () => {
  it('counts extra elements sharing an id', () => {
    const i = issue(page('<p id="a">1</p><p id="a">2</p><p id="b">3</p><p id="b">4</p><p id="b">5</p>'), 'duplicate-id');
    expect(i?.count).toBe(3);
    expect(i?.message).toMatch(/^3 ids are used on more than one element/);
  });
  it('does not count unique ids or copies inside <template>', () => {
    expect(rules(page('<p id="a">1</p><p id="b">2</p><template><p id="a">x</p></template>'))).toEqual({});
  });
});

describe('obsolete tags and attributes', () => {
  it('flags presentational tags and attributes', () => {
    const r = rules(page('<center><font color="red">x</font></center><table bgcolor="red"><tr><td align="left" valign="top">1</td></tr></table>'));
    expect(r['obsolete-tag']).toBe(2);
    expect(r['obsolete-attribute']).toBe(3);
    expect(issue(page('<center>x</center>'), 'obsolete-tag')?.message).toMatch(/An outdated tag is used for looks; use CSS instead \(<center>\)/);
  });
  it('does not flag modern tags or media sizes', () => {
    expect(rules(page('<b>a</b><i>b</i><small>c</small><s>d</s><u>e</u><img src=a alt="" width="10" height="10"><svg align="x"></svg>'))).toEqual({});
  });
});

describe('inline styles and !important', () => {
  const filler = '<p>x</p>'.repeat(10);
  it('flags styling done element by element', () => {
    const styled = Array.from({ length: 12 }, (_, i) => `<p style="margin:${i}px">x</p>`).join('');
    const i = issue(page(styled + filler), 'inline-styles');
    expect(i?.count).toBe(12);
  });
  it('does not flag a few inline styles', () => {
    const styled = Array.from({ length: 3 }, (_, i) => `<p style="margin:${i}px">x</p>`).join('');
    expect(rules(page(styled + filler))).toEqual({});
  });
  it('flags the same inline style repeated', () => {
    const r = rules(page('<p style="color: red;">x</p>'.repeat(3) + '<p style="color:red">x</p>'.repeat(3) + filler.repeat(3)));
    expect(r['repeated-inline-style']).toBe(5);
    expect(r['inline-styles']).toBeUndefined();
  });
  it('does not flag a style used four times', () => {
    expect(rules(page('<p style="color:red">x</p>'.repeat(4) + filler))).toEqual({});
  });
  it('flags heavy !important', () => {
    const css = Array.from({ length: 12 }, (_, i) => `.c${i}{color:red!important;margin:0}`).join('');
    expect(rules(page('x', `<title>t</title><style>${css}</style>`))['heavy-important']).toBe(12);
  });
  it('does not flag a few !important or one inside a comment', () => {
    const css = '.a{color:red !important}.b{margin:0}/* x !important !important !important !important !important !important !important !important !important !important */';
    expect(rules(page('x', `<title>t</title><style>${css}</style>`))).toEqual({});
  });
});

describe('hostile source', () => {
  it('handles a huge page quickly', () => {
    const big = page('<div><span>x</span></div>'.repeat(20000));
    const t = Date.now();
    const facts = checkSource(big);
    expect(Date.now() - t).toBeLessThan(2000);
    expect(facts.parseErrors).toEqual({});
  });
});
