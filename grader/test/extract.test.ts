import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Renderer } from '../src/render';
import { normalizeFiles } from '../src/site';
import type { Block, PageSnapshot } from '../src/types';

/** How a page is read: text, boxes and what a person can see of them. */

const page = (body: string, css = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif;font-size:16px}${css}</style></head><body>${body}</body></html>`;

let renderer: Renderer;
beforeAll(() => {
  renderer = new Renderer();
});
afterAll(async () => {
  await renderer.close();
});

const texts = (s: PageSnapshot) =>
  s.blocks
    .filter((b) => b.kind === 'text')
    .map((b) => b.text!)
    .sort();
const find = (s: PageSnapshot, text: string): Block | undefined => s.blocks.find((b) => b.kind === 'text' && b.text === text);

describe('1. separate pieces of text are read as separate', () => {
  it('links spaced only by margins are separate items, not one run-together word', async () => {
    const s = await renderer.render(page('<nav><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Status</a></nav>', 'nav a{margin-left:24px}'));
    expect(texts(s)).toEqual(['Privacy', 'Status', 'Terms']);
  });

  it('a word split across spans stays one word; a paragraph split in spans stays one paragraph', async () => {
    const s = await renderer.render(
      page('<h1>Hel<span>lo</span> there</h1><p><span>One calm plan</span> <b>your whole</b> <span>team can trust.</span></p>'),
    );
    expect(texts(s)).toEqual(['Hello there', 'One calm plan your whole team can trust.']);
  });

  it('a menu built four ways gives the same blocks', async () => {
    const css = 'body{padding:20px}.m{display:flex;gap:24px;list-style:none;margin:0;padding:0}td{padding:0 12px 0 0}';
    const builds = [
      '<div><a href="#">Home</a> <a href="#" style="margin-left:20px">Docs</a> <a href="#" style="margin-left:20px">Blog</a></div>',
      '<div class="m"><a href="#">Home</a><a href="#">Docs</a><a href="#">Blog</a></div>',
      '<ul class="m"><li>Home</li><li>Docs</li><li>Blog</li></ul>',
      '<table cellspacing="0"><tr><td>Home</td><td>Docs</td><td>Blog</td></tr></table>',
    ];
    for (const b of builds) {
      const s = await renderer.render(page(b, css));
      expect(texts(s), b).toEqual(['Blog', 'Docs', 'Home']);
    }
  });

  it('side-by-side pieces closer than a word gap read as one sentence however they are built', async () => {
    const a = await renderer.render(page('<p>Fast and calm</p>'));
    const b = await renderer.render(
      page('<p><span style="display:inline-block">Fast</span> <span style="display:inline-block">and</span> <span style="display:inline-block">calm</span></p>'),
    );
    expect(texts(a)).toEqual(['Fast and calm']);
    expect(texts(b)).toEqual(['Fast and calm']);
  });
});

describe('2. text covered by something is not seen', () => {
  const photo =
    '<svg width="300" height="120" style="position:absolute;left:0;top:0;z-index:2">' +
    Array.from({ length: 30 }, (_, i) => `<rect x="${i * 10}" y="0" width="10" height="120" fill="hsl(${i * 37},70%,50%)"/>`).join('') +
    '</svg>';

  it('text under a busy picture is hidden, with or without pointer-events', async () => {
    for (const pe of ['auto', 'none']) {
      const s = await renderer.render(
        page(`<div style="position:relative;height:200px"><p style="position:absolute;left:20px;top:40px;margin:0">Hidden label</p>${photo.replace('z-index:2', `z-index:2;pointer-events:${pe}`)}</div><p>Shown</p>`),
      );
      expect(find(s, 'Hidden label'), pe).toBeUndefined();
      expect(find(s, 'Shown')).toBeDefined();
    }
  });

  it('text drawn on top of a busy picture or a gradient is seen', async () => {
    const s = await renderer.render(
      page(
        `<div style="position:relative;height:200px">${photo}<p style="position:absolute;left:20px;top:40px;margin:0;z-index:3;color:#fff;font-weight:700">On the photo</p></div>` +
          '<div style="background:linear-gradient(90deg,#0ea5e9,#f43f5e);padding:20px;color:#fff">On the gradient</div>',
      ),
    );
    expect(find(s, 'On the photo')).toBeDefined();
    expect(find(s, 'On the gradient')).toBeDefined();
  });
});

describe('3. role comes from the markup', () => {
  it('names headings, buttons, links, fields, labels, cells, list items, quotes, code and captions', async () => {
    const s = await renderer.render(
      page(
        '<h2>Title</h2><button>Go now</button><p><a href="#">A link</a></p><label>Email</label>' +
          '<input placeholder="you@example.com"><table><caption>Prices</caption><tr><td>Cell text</td><td><a href="#">Cell link</a></td></tr></table>' +
          '<ul><li>Item one</li></ul><blockquote>Quoted words</blockquote><pre>let x = 1</pre>' +
          '<figure><figcaption>A caption</figcaption></figure><div role="button" style="border:1px solid #000;width:80px">Fake</div>' +
          '<p>Plain words</p>',
      ),
    );
    const role = (t: string) => find(s, t)?.role;
    expect(role('Title')).toBe('heading');
    expect(role('Go now')).toBe('button');
    expect(role('A link')).toBe('link');
    expect(role('Email')).toBe('label');
    expect(role('you@example.com')).toBe('field');
    expect(role('Prices')).toBe('caption');
    expect(role('Cell text')).toBe('cell');
    expect(role('Cell link')).toBe('link');
    // The bullet is drawn, so it is read (section 11).
    expect(role('• Item one')).toBe('listitem');
    expect(role('Quoted words')).toBe('quote');
    expect(role('let x = 1')).toBe('code');
    expect(role('A caption')).toBe('caption');
    expect(role('Fake')).toBe('button');
    expect(role('Plain words')).toBeUndefined();
    const fakeBox = s.blocks.find((b) => b.kind === 'box' && b.role === 'button');
    expect(fakeBox).toBeDefined();
  });
});

describe('4. text nobody can see is not a block', () => {
  it('screen-reader-only labels (wrapping or not), 1 px text and off-screen text are dropped', async () => {
    const css =
      '.a{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
      '.b{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}' +
      '.c{position:absolute;clip-path:inset(50%)}.d{font-size:1px}.e{position:absolute;left:-9999px}' +
      'input{width:300px;padding:7px 10px;font-size:14px;border:1px solid #cbd5e1}';
    const s = await renderer.render(
      page(
        '<form><label class="a">Search one</label><input placeholder="Find"></form>' +
          '<form><label class="b">Search the docs please</label><input placeholder="Find"></form>' +
          '<span class="c">Clipped away</span><p class="d">Tiny words</p><p class="e">Far away</p><p>Real text</p>',
        css,
      ),
    );
    expect(texts(s)).toEqual(['Find', 'Find', 'Real text']);
  });

  it('a placeholder reads the same however the field is built', async () => {
    const css = 'input{width:300px;padding:7px 10px;font-size:14px;border:1px solid #cbd5e1;border-radius:6px}';
    const a = await renderer.render(page('<form><input type="search" placeholder="Search the docs"></form>', css));
    const b = await renderer.render(page('<form><input type="search" style="display:block" placeholder="Search the docs"></form>', css));
    const ra = find(a, 'Search the docs')!.rect;
    const rb = find(b, 'Search the docs')!.rect;
    expect(Math.abs(ra.h - rb.h)).toBeLessThanOrEqual(1);
    expect(Math.abs(ra.w - rb.w)).toBeLessThanOrEqual(1);
  });
});

describe('5. form controls', () => {
  it('reads placeholder, typed value, selected option, submit label and textarea contents', async () => {
    const s = await renderer.render(
      page(
        '<input placeholder="Your name"> <input value="Ada Lovelace"> ' +
          '<select><option>Small</option><option selected>Large</option></select> ' +
          '<input type="submit"> <input type="submit" value="Send it"> <input type="reset"> ' +
          '<textarea>Hello there</textarea>',
        'body{padding:10px}input,select,textarea{margin:10px;display:block}',
      ),
    );
    // '▾' is the select's drawn arrow (section 11).
    expect(texts(s)).toEqual(['Ada Lovelace', 'Hello there', 'Large', 'Reset', 'Send it', 'Submit', 'Your name', '▾']);
    expect(find(s, 'Submit')?.role).toBe('button');
  });

  it('a checkbox and a radio button are small visible boxes', async () => {
    const s = await renderer.render(page('<p><input type="checkbox"> Agree</p><p><input type="radio"> Yes</p>'));
    const small = s.blocks.filter((b) => b.kind === 'box' && b.rect.w < 20 && b.rect.h < 20 && b.role === 'field');
    expect(small.length).toBe(2);
  });
});

const boxes = (s: PageSnapshot) => s.blocks.filter((b) => b.kind === 'box');
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

describe('7. a tinted, faded or filtered page keeps its boxes', () => {
  const body =
    '<div style="padding:40px"><a href="#" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px">Start free trial</a>' +
    '<span style="display:inline-block;margin-left:20px;background:#dbeafe;color:#1e3a8a;padding:4px 10px">New</span>' +
    '<div style="margin-top:30px;width:300px;height:120px;border:1px solid #e5e7eb;background:#fff">Card</div></div>';
  const css = 'body{background:#f9fafb}';

  it('a veil over the page, greyscale, and opacity on an ancestor leave the same boxes, in the colours shown', async () => {
    const plain = await renderer.render(page(body, css));
    const variants = [
      css + 'body{position:relative}body::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,0.1);pointer-events:none;z-index:100}',
      css + 'html{filter:grayscale(1)}',
      css + 'body>div{opacity:0.85}',
    ];
    for (const v of variants) {
      const s = await renderer.render(page(body, v));
      expect(boxes(s).length, v).toBe(boxes(plain).length);
      expect(texts(s), v).toEqual(texts(plain));
      // The button's colour is the one on screen, not the one in the styles.
      const btn = boxes(s).find((b) => b.rect.w > 100 && b.rect.h < 60)!;
      const [x, y] = [Math.floor(btn.rect.x + 4), Math.floor(btn.rect.y + 4)];
      const i = (y * s.width + x) * 4;
      expect(near(btn.boxStyle!.background, [s.pixels[i], s.pixels[i + 1], s.pixels[i + 2]], 12), v).toBe(true);
    }
  });

  it('a box wholly covered by its child is still not read, on a plain page', async () => {
    const s = await renderer.render(page('<div style="background:#2563eb;width:200px"><div style="background:#3b82f6;height:80px"></div></div>'));
    expect(boxes(s).length).toBe(1);
  });
});

describe('8. text drawn by CSS reads like typed text', () => {
  it('password dots read as dots; ::before ticks and attr() read as text', async () => {
    const field = 'width:300px;height:40px;border:1px solid #cbd5e1;padding:0 12px;font:15px Arial;box-sizing:border-box;line-height:38px';
    const a = await renderer.render(
      page(
        `<input type="password" value="secret12" style="${field};display:block"><ul class="t"><li>Fast sync</li><li>Clear plans</li></ul><p><span class="x" data-n="42 left"></span></p>`,
        '.t{list-style:none;padding:0}.t li::before{content:"\\2713  "}.x::after{content:attr(data-n)}',
      ),
    );
    const b = await renderer.render(
      page(
        `<div style="${field}">••••••••</div><ul class="t"><li>✓ Fast sync</li><li>✓ Clear plans</li></ul><p><span>42 left</span></p>`,
        '.t{list-style:none;padding:0}',
      ),
    );
    expect(texts(a)).toEqual(texts(b));
    expect(texts(a)).toContain('••••••••');
    expect(texts(a).some((t) => t.startsWith('✓ Fast sync'))).toBe(true);
  });

  it('an empty password field shows its placeholder', async () => {
    const s = await renderer.render(page('<input type="password" placeholder="Password">'));
    expect(texts(s)).toEqual(['Password']);
  });

  it('a pseudo-element rule reads as a box, the same as a real one', async () => {
    const a = await renderer.render(page('<div class="or">or</div>', '.or{display:flex;gap:8px;width:300px;align-items:center}.or::before,.or::after{content:"";flex:1;border-top:1px solid #94a3b8}'));
    const b = await renderer.render(page('<div class="or"><i></i>or<i></i></div>', '.or{display:flex;gap:8px;width:300px;align-items:center}.or i{flex:1;border-top:1px solid #94a3b8}'));
    expect(boxes(a).length).toBe(2);
    expect(boxes(a).map((x) => x.rect)).toEqual(boxes(b).map((x) => x.rect));
    expect(texts(a)).toEqual(texts(b));
  });
});

describe('9. a placeholder is read in the colour it is drawn', () => {
  it('the browser default grey, a set ::placeholder colour, and a look-alike div agree with the screen', async () => {
    const field = 'width:300px;height:40px;border:1px solid #cbd5e1;padding:0 12px;font:15px Arial;box-sizing:border-box;line-height:38px;display:block';
    const a = await renderer.render(page(`<input placeholder="Jane Cooper" style="${field}">`));
    const b = await renderer.render(page(`<input class="p" placeholder="Jane Cooper" style="${field}">`, '.p::placeholder{color:#94a3b8}'));
    const c = await renderer.render(page(`<div style="${field};color:#94a3b8">Jane Cooper</div>`));
    const ca = find(a, 'Jane Cooper')!.textStyle!.color;
    expect(near(ca, [117, 117, 117], 12)).toBe(true);
    expect(find(b, 'Jane Cooper')!.textStyle!.color).toEqual([148, 163, 184]);
    expect(find(c, 'Jane Cooper')!.textStyle!.color).toEqual([148, 163, 184]);
  });
});

describe('10. links that are not <a href>', () => {
  it('form buttons (GET) and image-map areas count as links; POST forms, hidden ones and meta refresh do not', async () => {
    const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="30"><text x="4" y="20">Home Menu</text></svg>');
    const index =
      '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=secret.html"></head><body>' +
      '<form action="menu.html" method="get"><button type="submit">Menu</button></form>' +
      '<form action="post.html" method="post"><button>Send</button></form>' +
      '<form action="hidden.html" style="display:none"><button>Hidden</button></form>' +
      '<form action="index.html"><button type="button">Not a submit</button></form>' +
      `<img src="data:image/svg+xml,${svg}" width="200" height="30" usemap="#m" alt="Site menu">` +
      '<map name="m"><area shape="rect" coords="0,0,60,30" href="index.html" alt="Home"><area shape="rect" coords="70,0,140,30" href="about.html" alt="Menu"></map>' +
      '</body></html>';
    const files = normalizeFiles({ 'index.html': index, 'menu.html': '<p>Menu</p>', 'about.html': '<p>About</p>' });
    const { stats } = await renderer.renderSitePage(files, 'index.html');
    expect([...stats.links].sort()).toEqual(['about.html', 'index.html', 'menu.html']);
  });
});

describe('11. the same thing drawn two ways reads the same', () => {
  const same = async (a: string, b: string, css = '') => {
    const sa = await renderer.render(page(a, css));
    const sb = await renderer.render(page(b, css));
    expect(texts(sa), a).toEqual(texts(sb));
    return [sa, sb] as const;
  };

  it('list markers read like typed numbers and bullets', async () => {
    await same('<ol><li>First</li><li>Second</li></ol>', '<div style="padding-left:40px"><p style="margin:0">1. First</p><p style="margin:0">2. Second</p></div>', 'p,ol{margin:0}');
    await same('<ol start="3" type="1"><li><p>Third</p></li></ol>', '<p>3. Third</p>', 'p,ol{margin:0}');
    await same('<ul><li>Fast</li></ul>', '<p>• Fast</p>', 'p,ul{margin:0}');
    await same('<ul style="list-style:none;padding:0"><li>Plain</li></ul>', '<p>Plain</p>', 'p{margin:0}');
  });

  it('a ticked checkbox is a box in the colour it is drawn, like a drawn one', async () => {
    const s = await renderer.render(page('<p><input type="checkbox" checked> Agree</p>'));
    expect(texts(s)).toEqual(['Agree']);
    const box = boxes(s).find((b) => b.role === 'field')!;
    expect(box.boxStyle!.background[2]).toBeGreaterThan(box.boxStyle!.background[0] + 60); // the browser's blue
  });

  it('a select shows its chosen option and arrow like a styled div', async () => {
    await same(
      '<select style="width:200px"><option>Small</option><option selected>Large</option></select>',
      '<div style="position:relative;width:200px;border:1px solid #767676;padding:2px 4px;box-sizing:border-box">Large<span style="position:absolute;right:6px">▾</span></div>',
    );
  });

  it('progress and meter read as a track and a filled part, like two boxes', async () => {
    for (const el of ['<progress value="40" max="100"></progress>', '<meter value="0.4"></meter>']) {
      const s = await renderer.render(page(`<div style="padding:20px">${el}</div>`));
      const bars = boxes(s);
      expect(bars.length, el).toBe(2);
      expect(Math.abs(bars[1].rect.w - 0.4 * bars[0].rect.w), el).toBeLessThanOrEqual(1);
    }
  });

  it('details: closed hides its content, open shows it, the summary has its triangle', async () => {
    const closed = await renderer.render(page('<details><summary>More</summary><p>Inside</p></details>'));
    const open = await renderer.render(page('<details open><summary>More</summary><p>Inside</p></details>'));
    expect(texts(closed)).toEqual(['▸ More']);
    expect(texts(open)).toEqual(['Inside', '▾ More']);
  });

  it('an hr and a bordered div are both one box', async () => {
    const a = await renderer.render(page('<div style="width:300px"><hr></div>'));
    const b = await renderer.render(page('<div style="width:300px"><div style="border-top:1px solid #999;margin:8px 0"></div></div>'));
    expect(boxes(a).length).toBe(1);
    expect(boxes(b).length).toBe(1);
  });

  it('text-transform, letter-spacing and word-spacing make no false gaps; pre and br break lines the same', async () => {
    await same('<p style="text-transform:uppercase">plan your week</p>', '<p>PLAN YOUR WEEK</p>');
    await same('<p style="letter-spacing:6px"><span>Wide</span><span>Word</span></p>', '<p style="letter-spacing:6px">WideWord</p>');
    await same('<p style="word-spacing:14px"><span>Far</span> <span>apart</span> <span>words</span></p>', '<p style="word-spacing:14px">Far apart words</p>');
    await same('<p style="white-space:pre;font-family:Arial">One\nTwo</p>', '<p>One<br>Two</p>');
  });

  it('text cut with an ellipsis reads as only what shows', async () => {
    const s = await renderer.render(
      page('<p style="width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">A rather long title that is cut short</p>'),
    );
    const t = texts(s)[0];
    expect(t.endsWith('…')).toBe(true);
    expect(t.length).toBeLessThan(24);
    expect('A rather long title that is cut short'.startsWith(t.slice(0, -1))).toBe(true);
  });

  it('hidden children, zero-size and display:contents wrappers read like plain text', async () => {
    await same('<p>Shown <span style="visibility:hidden">secret</span></p>', '<p>Shown</p>');
    await same('<div style="display:contents"><p>Inside</p></div><div style="height:0"><p>Below</p></div>', '<p>Inside</p><p>Below</p>');
  });
});

describe('6. same page, same blocks', () => {
  it('reading a page twice gives exactly the same blocks', async () => {
    const html = page('<nav><a href="#">One</a><a href="#">Two</a></nav><p>Body <b>text</b></p>', 'nav a{margin:0 12px}');
    const a = await renderer.render(html);
    const b = await renderer.render(html);
    expect(JSON.stringify(a.blocks)).toBe(JSON.stringify(b.blocks));
  });
});
