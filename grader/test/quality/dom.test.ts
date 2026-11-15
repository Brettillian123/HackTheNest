import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { QUALITY_SOURCE, gatherDomFacts } from '../../src/quality/dom-source';
import { accessibilityIssues } from '../../src/quality/accessibility';
import type { DomFacts } from '../../src/quality/types';
import { CLEAN_PAGE, CLEAN_SNAPSHOT } from './fixtures';

let browser: Browser;
let context: BrowserContext;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  context = await browser.newContext({ javaScriptEnabled: false, offline: true, viewport: { width: 800, height: 600 } });
  page = await context.newPage();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const wrap = (body: string, opts: { lang?: string | null; title?: string | null } = {}) => {
  const lang = opts.lang === undefined ? ' lang="en"' : opts.lang === null ? '' : ` lang="${opts.lang}"`;
  const title = opts.title === undefined ? '<title>Test</title>' : opts.title === null ? '' : `<title>${opts.title}</title>`;
  return `<!DOCTYPE html><html${lang}><head>${title}</head><body>${body}</body></html>`;
};

async function facts(html: string): Promise<DomFacts> {
  await page.setContent(html, { waitUntil: 'load' });
  return gatherDomFacts(page);
}

async function issues(html: string) {
  return accessibilityIssues(await facts(html), CLEAN_SNAPSHOT);
}

async function rule(html: string, name: string) {
  return (await issues(html)).find((i) => i.rule === name);
}

describe('QUALITY_SOURCE', () => {
  it('has no backticks or dollar-brace inside', () => {
    expect(QUALITY_SOURCE).not.toMatch(/`|\$\{/);
  });
});

describe('a clean page', () => {
  it('has no accessibility issues', async () => {
    const f = await facts(CLEAN_PAGE);
    expect(f.lang).toBe('en');
    expect(f.title).toBe('Corner Bakery');
    expect(f.headingLevels).toEqual([1, 2, 3, 2]);
    expect(f.errors).toBe(0);
    expect(accessibilityIssues(f, CLEAN_SNAPSHOT)).toEqual([]);
  });
});

describe('image descriptions', () => {
  it('counts images with no description', async () => {
    const i = await rule(wrap('<h1>x</h1>' + '<img src="a.png" width="50" height="50">'.repeat(3)), 'image-description');
    expect(i?.count).toBe(3);
    expect(i?.message).toMatch(/^3 images have no text description/);
  });
  it('does not flag decorative, named or hidden images', async () => {
    const body =
      '<h1>x</h1><img src="a.png" alt="" width="50" height="50"><img src="b.png" role="presentation" width="50" height="50">' +
      '<img src="c.png" aria-label="A cat" width="50" height="50"><img src="d.png" style="display:none">' +
      '<img src="e.png" aria-hidden="true" width="50" height="50"><img src="f.png" alt="Dog" width="50" height="50">';
    expect(await rule(wrap(body), 'image-description')).toBeUndefined();
  });
});

describe('form labels', () => {
  it('counts a field with no label', async () => {
    const i = await rule(wrap('<h1>x</h1><form><input type="text" name="q"></form>'), 'field-label');
    expect(i?.count).toBe(1);
    expect(i?.message).toMatch(/^A form field has no label/);
  });
  it('accepts every common way of labelling, and skips hidden and button inputs', async () => {
    const body =
      '<h1>x</h1><form><label>Name <input name="n"></label>' +
      '<label for="e">Email</label><input id="e">' +
      '<input aria-label="Search"><span id="lb">Phone</span><input aria-labelledby="lb">' +
      '<input title="Age"><input placeholder="City"><select aria-label="Size"><option>S</option></select>' +
      '<input type="hidden" name="t"><input type="submit"><input type="checkbox" id="c"><label for="c">Agree</label></form>';
    expect(await rule(wrap(body), 'field-label')).toBeUndefined();
  });
  it('flags a wrapping label with no text', async () => {
    expect((await rule(wrap('<h1>x</h1><label><input name="n"></label>'), 'field-label'))?.count).toBe(1);
  });
});

describe('button and link names', () => {
  it('counts visible buttons and links with no name', async () => {
    const body =
      '<h1>x</h1><a href="/a" style="display:inline-block;width:20px;height:20px"></a>' +
      '<button style="width:30px;height:30px"></button><input type="button" style="width:30px;height:20px">';
    const i = await rule(wrap(body), 'control-name');
    expect(i?.count).toBe(3);
    expect(i?.message).toMatch(/^3 buttons or links have no name/);
  });
  it('does not flag named icons, image links, text, default submit labels or invisible links', async () => {
    const box = 'style="display:inline-block;width:20px;height:20px"';
    const body =
      `<h1>x</h1><a href="/a" ${box} aria-label="Home"></a><a href="/b"><img src="h.png" alt="Home" width="20" height="20"></a>` +
      `<button>Send</button><input type="submit"><a href="/c"></a><a href="/d" ${box} title="Help"></a>` +
      `<button ${box}><svg width="10" height="10"><title>Close</title></svg></button><a href="/e"><span>Text</span></a>`;
    expect(await rule(wrap(body), 'control-name')).toBeUndefined();
  });
});

describe('headings', () => {
  it('flags a skipped level', async () => {
    const i = await rule(wrap('<h1>a</h1><h3>b</h3>'), 'heading-skip');
    expect(i?.count).toBe(1);
    expect(i?.message).toMatch(/^Headings jump from level 1 to level 3/);
  });
  it('flags a missing main heading', async () => {
    expect((await rule(wrap('<h2>a</h2>'), 'no-main-heading'))?.message).toMatch(/^The page has no main heading/);
  });
  it('flags several main headings', async () => {
    expect((await rule(wrap('<h1>a</h1><h1>b</h1>'), 'several-main-headings'))?.count).toBe(2);
  });
  it('does not flag going back up levels or hidden headings', async () => {
    const r = await issues(wrap('<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2><h3>e</h3><h1 style="display:none">z</h1><h5 hidden>q</h5>'));
    expect(r).toEqual([]);
  });
});

describe('page language and title', () => {
  it('flags a missing language', async () => {
    const i = await rule(wrap('<h1>a</h1>', { lang: null }), 'page-language');
    expect(i?.message).toMatch(/^The page does not say what language it is in/);
  });
  it('flags a missing or blank title', async () => {
    expect((await rule(wrap('<h1>a</h1>', { title: null }), 'page-title'))?.count).toBe(1);
    expect((await rule(wrap('<h1>a</h1>', { title: '   ' }), 'page-title'))?.count).toBe(1);
  });
  it('accepts a language and title', async () => {
    expect(await issues(wrap('<h1>a</h1>', { lang: 'fr-CA', title: 'Bonjour' }))).toEqual([]);
  });
});

describe('hostile pages', () => {
  const hostile = wrap(
    '<h1>x</h1><form><input name="firstChild"><input name="nextSibling"><input name="getAttribute">' +
      '<input name="querySelectorAll"><input name="parentNode"><input name="localName"><input name="labels"></form>' +
      '<img name="body" src="x.png" width="10" height="10"><img name="title" src="y.png" width="10" height="10">' +
      '<div>' + '<span>a</span>'.repeat(10_000) + '</div>',
  );

  it('returns sane numbers quickly', async () => {
    await page.setContent(hostile, { waitUntil: 'load' });
    const t = Date.now();
    const f = await gatherDomFacts(page);
    expect(Date.now() - t).toBeLessThan(2000);
    expect(f.errors).toBe(0);
    expect(f.elementCount).toBeGreaterThan(10_000);
    expect(f.title).toBe('Test');
    expect(f.lang).toBe('en');
    expect(f.images.withoutDescription).toBe(2);
    expect(f.fields.withoutLabel).toBe(7);
    expect(f.headingLevels).toEqual([1]);
  });

  it('gives identical results on two runs', async () => {
    const a = await facts(hostile);
    const b = await facts(hostile);
    expect(b).toEqual(a);
    const c = await facts(CLEAN_PAGE);
    const d = await facts(CLEAN_PAGE);
    expect(d).toEqual(c);
  });
});
