/**
 * Writes every multi-page edge case to calibration/edge/sites/<case>/.
 *   npx tsx calibration/audit/sites-edge-gen.mts
 * Each case has goal/ and one folder per attempt. A file named __extra.json in
 * an attempt holds paths that cannot exist on disk (`..`, backslashes); the
 * runner merges them into the site.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Site = Record<string, string>;
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', 'edge', 'sites');

// ---------- Goal A: Tidewater Bikes, four pages, one stylesheet ----------
const CSS_A = `*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a}
.nav{background:#0f172a;padding:18px 64px;display:flex;align-items:center}
.brand{color:#fff;font-size:20px;font-weight:700;margin-right:auto}
.nav a{color:#cbd5e1;text-decoration:none;font-size:15px;margin-left:28px}
.nav a.on{color:#fff;font-weight:700}
.hero{background:#0e7490;color:#fff;padding:72px 64px}
.hero h1{margin:0 0 12px;font-size:44px}
.hero p{margin:0 0 28px;font-size:18px;color:#cffafe;max-width:560px}
.btn{display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;padding:14px 26px;border-radius:8px;text-decoration:none;font-size:16px}
.wrap{padding:48px 64px}
h2{font-size:28px;margin:0 0 20px}
.row{display:flex;gap:24px;margin-bottom:28px}
.card{flex:1;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px}
.card h3{margin:0 0 8px;font-size:18px}
.card p{margin:0;font-size:15px;line-height:22px;color:#475569}
.card .price{font-size:32px;line-height:38px;font-weight:700;color:#0e7490;margin:0 0 12px}
.lead{font-size:17px;line-height:26px;color:#334155;max-width:640px;margin:0 0 16px}
.foot{background:#e2e8f0;color:#475569;font-size:13px;padding:20px 64px}
.foot a{color:#0f172a;margin-left:16px}
`;

const PAGES_A = ['index', 'about', 'pricing', 'contact'] as const;
const LABEL: Record<string, string> = { index: 'Home', about: 'About', pricing: 'Pricing', contact: 'Contact' };
const TITLE: Record<string, string> = {
  index: 'Tidewater Bikes',
  about: 'About Tidewater Bikes',
  pricing: 'Pricing, Tidewater Bikes',
  contact: 'Contact Tidewater Bikes',
};
const BODY_A: Record<string, string> = {
  index: `<div class="hero">
<h1>City bikes, built to order</h1>
<p>Steel frames welded by hand in Michigan, fitted to your height and the roads you ride.</p>
<a class="btn" href="pricing.html">See pricing</a>
</div>
<div class="wrap">
<h2>Why Tidewater</h2>
<div class="row">
<div class="card"><h3>Made for you</h3><p>Every frame is measured to its rider before a single tube is cut.</p></div>
<div class="card"><h3>Built to last</h3><p>Steel can be repaired, repainted and ridden for thirty years.</p></div>
<div class="card"><h3>Serviced free</h3><p>Bring it back any time in the first year for a full tune-up.</p></div>
</div>
</div>`,
  about: `<div class="wrap">
<h2>About us</h2>
<p class="lead">We are four friends who started welding frames in a garage in 2019. We wanted bikes that fit the person riding them, not the other way round.</p>
<p class="lead">Today we build about two hundred bikes a year, and each one is made by a single builder from first cut to final polish.</p>
<div class="row">
<div class="card"><h3>The workshop</h3><p>An old boat shed by the Huron River, with room for six frames at a time.</p></div>
<div class="card"><h3>The team</h3><p>Two welders, a painter and a mechanic, all of whom ride to work.</p></div>
</div>
</div>`,
  pricing: `<div class="wrap">
<h2>Pricing</h2>
<div class="row">
<div class="card"><h3>The Commuter</h3><p class="price">$890</p><p>Single speed, mudguards and a rack. Ready in three weeks.</p></div>
<div class="card"><h3>The Tourer</h3><p class="price">$1,240</p><p>Eleven gears, dynamo lights and room for four bags.</p></div>
<div class="card"><h3>The Custom</h3><p class="price">From $1,900</p><p>Your geometry, your colour, your parts. Ready in eight weeks.</p></div>
</div>
<a class="btn" href="about.html">Meet the builders</a>
</div>`,
  contact: `<div class="wrap">
<h2>Contact</h2>
<p class="lead">Come and see the workshop, ride a test bike, or have us measure you for a frame.</p>
<div class="row">
<div class="card"><h3>Visit</h3><p>14 River Street, Ypsilanti, Michigan 48197.</p></div>
<div class="card"><h3>Hours</h3><p>Tuesday to Saturday, 10 in the morning to 6 in the evening.</p></div>
<div class="card"><h3>Call or write</h3><p>(734) 555 0142, or hello at tidewater bikes dot com.</p></div>
</div>
</div>`,
};
const FOOT_TEXT = 'Tidewater Bikes, Ypsilanti, Michigan. Open Tuesday to Saturday.';

function navA(active: string, pages: readonly string[] = PAGES_A, href = (p: string) => `${p}.html`): string {
  const links = pages.map((p) => `<a href="${href(p)}"${p === active ? ' class="on"' : ''}>${LABEL[p]}</a>`).join('');
  return `<div class="nav"><span class="brand">Tidewater Bikes</span>${links}</div>`;
}
function pageA(p: string, opts: { foot?: string; css?: string; head?: string; nav?: string } = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${TITLE[p]}</title>
${opts.css ?? '<link rel="stylesheet" href="site.css">'}${opts.head ?? ''}
</head>
<body>
${opts.nav ?? navA(p)}
${BODY_A[p]}
<div class="foot">${opts.foot ?? FOOT_TEXT}</div>
</body>
</html>
`;
}
function goalA(footLinks = false): Site {
  const s: Site = { 'site.css': CSS_A };
  for (const p of PAGES_A) {
    const foot = footLinks
      ? `${FOOT_TEXT}${PAGES_A.map((q) => `<a href="${q}.html">${LABEL[q]}</a>`).join('')}`
      : undefined;
    s[`${p}.html`] = pageA(p, { foot });
  }
  return s;
}

// ---------- Goal B: Lumen CLI docs, sub-folder, two stylesheets ----------
const BASE_B = `*{box-sizing:border-box}
body{margin:0;font-family:Verdana,Arial,sans-serif;background:#ffffff;color:#1f2937}
.top{display:flex;align-items:center;padding:16px 56px;border-bottom:1px solid #e5e7eb}
.top b{margin-right:auto;font-size:19px}
.top a{margin-left:24px;font-size:14px;text-decoration:none}
main{padding:40px 56px;max-width:900px}
h1{font-size:36px;margin:0 0 14px}
h2{font-size:22px;margin:28px 0 10px}
p,li{font-size:15px;line-height:24px}
pre{padding:14px 18px;border-radius:8px;font-family:"Courier New",monospace;font-size:14px}
footer{padding:18px 56px;font-size:12px;border-top:1px solid #e5e7eb}
`;
const THEME_B = `.top{background:#111827}
.top b{color:#fbbf24}
.top a{color:#e5e7eb}
.top a.on{color:#fbbf24;font-weight:700}
h1{color:#111827}
pre{background:#1f2937;color:#a7f3d0}
.cta{display:inline-block;background:#fbbf24;color:#111827;padding:12px 22px;border-radius:6px;font-weight:700;text-decoration:none}
footer{background:#f9fafb;color:#6b7280}
`;
const B_PAGES = ['index.html', 'docs/index.html', 'docs/guide.html', 'docs/faq.html'];
const B_LABEL: Record<string, string> = {
  'index.html': 'Home',
  'docs/index.html': 'Docs',
  'docs/guide.html': 'Guide',
  'docs/faq.html': 'FAQ',
};
const B_BODY: Record<string, string> = {
  'index.html': `<h1>Lumen, a tiny build tool</h1>
<p>Lumen turns a folder of Markdown into a fast static site in one command. No plugins, no config file.</p>
<pre>npm install -g lumen-cli
lumen build ./notes</pre>
<p><a class="cta" href="docs/guide.html">Read the guide</a></p>`,
  'docs/index.html': `<h1>Documentation</h1>
<p>Everything Lumen does fits on three pages. Start with the guide, then check the FAQ if something surprises you.</p>
<h2>Contents</h2>
<ul><li><a href="guide.html">Guide: your first site in five minutes</a></li><li><a href="faq.html">FAQ: the questions people ask most</a></li></ul>`,
  'docs/guide.html': `<h1>Guide</h1>
<h2>1. Write</h2>
<p>Put Markdown files in a folder. Each file becomes one page; the folder layout becomes the menu.</p>
<h2>2. Build</h2>
<pre>lumen build ./notes --out ./site</pre>
<h2>3. Publish</h2>
<p>Upload the site folder to any static host. There is nothing to run on the server.</p>`,
  'docs/faq.html': `<h1>FAQ</h1>
<h2>Does Lumen need Node at run time?</h2>
<p>No. Node is needed only to build; the output is plain HTML and CSS.</p>
<h2>Can I use my own theme?</h2>
<p>Yes. Drop a theme.css next to your notes and Lumen links it on every page.</p>`,
};
function rel(from: string, to: string): string {
  const inDocs = from.startsWith('docs/');
  if (!inDocs) return to;
  return to.startsWith('docs/') ? to.slice(5) : `../${to}`;
}
function pageB(p: string, opts: { href?: (from: string, to: string) => string; css?: string } = {}): string {
  const href = opts.href ?? rel;
  const nav = B_PAGES.map((q) => `<a href="${href(p, q)}"${q === p ? ' class="on"' : ''}>${B_LABEL[q]}</a>`).join('');
  const css =
    opts.css ?? `<link rel="stylesheet" href="${href(p, 'css/base.css')}">\n<link rel="stylesheet" href="${href(p, 'css/theme.css')}">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lumen: ${B_LABEL[p]}</title>
${css}
</head>
<body>
<div class="top"><b>Lumen</b>${nav}</div>
<main>
${B_BODY[p]}
</main>
<footer>Lumen is free software under the MIT licence.</footer>
</body>
</html>
`;
}
function goalB(): Site {
  const s: Site = { 'css/base.css': BASE_B, 'css/theme.css': THEME_B };
  for (const p of B_PAGES) s[p] = pageB(p);
  return s;
}

// ---------- Goal C: two pages, three links ----------
function goalC(dead = false): Site {
  const page = (title: string, nav: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="site.css">
</head>
<body>
${nav}
${body}
<div class="foot">${FOOT_TEXT}</div>
</body>
</html>
`;
  return {
    'site.css': CSS_A,
    'index.html': page(
      'Tidewater Bikes',
      `<div class="nav"><span class="brand">Tidewater Bikes</span><a href="about.html">About</a></div>`,
      BODY_A.index.replace('href="pricing.html">See pricing', 'href="about.html">Meet the builders'),
    ),
    'about.html': page(
      'About Tidewater Bikes',
      `<div class="nav"><span class="brand">Tidewater Bikes</span><a href="${dead ? 'indx.html' : 'index.html'}">Home</a></div>`,
      BODY_A.about,
    ),
  };
}

// ---------- Goal D: thirteen pages ----------
function goalD(drop?: string): Site {
  const names = ['index'].concat(Array.from({ length: 12 }, (_, i) => `page-${String(i + 1).padStart(2, '0')}`));
  const keep = names.filter((n) => n !== drop);
  const s: Site = { 'site.css': CSS_A };
  for (const n of keep) {
    const body =
      n === 'index'
        ? `<div class="wrap"><h2>Route guide</h2><div class="row" style="flex-wrap:wrap">${keep
            .filter((k) => k !== 'index')
            .map((k) => `<a class="btn" href="${k}.html">Route ${k.slice(5)}</a>`)
            .join('')}</div></div>`
        : `<div class="wrap"><h2>Route ${n.slice(5)}</h2><p class="lead">Route ${n.slice(5)} runs ${10 + Number(n.slice(5)) * 3} kilometres along the Huron River and is rated ${Number(n.slice(5)) % 3 === 0 ? 'hard' : 'easy'}.</p><a class="btn" href="index.html">All routes</a></div>`;
    s[`${n}.html`] = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tidewater routes: ${n}</title>
<link rel="stylesheet" href="site.css">
</head>
<body>
<div class="nav"><span class="brand">Tidewater Routes</span><a href="index.html">All routes</a></div>
${body}
<div class="foot">${FOOT_TEXT}</div>
</body>
</html>
`;
  }
  return s;
}

// ---------- helpers ----------
const mapHtml = (s: Site, f: (text: string, path: string) => string): Site =>
  Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k.endsWith('.html') ? f(v, k) : v]));
const replaceNavHref = (s: Site, from: string, to: string): Site =>
  mapHtml(s, (t) => t.replace(new RegExp(`(<div class="nav">.*?)href="${from.replace(/\./g, '\\.')}"`), `$1href="${to}"`));
function junkCss(bytes: number, prefix = 'u'): string {
  let out = '';
  let i = 0;
  while (out.length < bytes) {
    const c = (i * 2654435761) % 0xffffff;
    out += `.${prefix}${i}{color:#${c.toString(16).padStart(6, '0')};margin:${i % 9}px;padding:${i % 7}px}\n`;
    i++;
  }
  return out;
}
const minifyHtml = (t: string) => t.replace(/\n/g, '').replace(/>\s+</g, '><');
const minifyCss = (t: string) => t.replace(/\n/g, '');

// ---------- cases ----------
const cases: Record<string, Record<string, Site>> = {};
const A = goalA();

// Links a person says work
{
  const c: Record<string, Site> = { goal: A, self: A };
  c['dot-slash'] = mapHtml(A, (t) => t.replace(/href="(index|about|pricing|contact)\.html"/g, 'href="./$1.html"'));
  c['hash-team'] = (() => {
    const s = mapHtml(A, (t) => t.replace(/href="about\.html"/g, 'href="about.html#team"'));
    s['about.html'] = s['about.html'].replace('<div class="card"><h3>The team', '<div class="card" id="team"><h3>The team');
    return s;
  })();
  c['root-slash'] = mapHtml(A, (t) => t.replace(/href="(index|about|pricing|contact)\.html"/g, 'href="/$1.html"'));
  c['query'] = mapHtml(A, (t) => t.replace(/href="(about|pricing|contact)\.html"/g, 'href="$1.html?ref=nav"'));
  c['upper-case'] = mapHtml(A, (t) => t.replace(/href="about\.html"/g, 'href="ABOUT.html"'));
  c['image-link'] = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="152" height="50"><rect width="152" height="50" rx="8" fill="#f59e0b"/><text x="76" y="31" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a" text-anchor="middle">See pricing</text></svg>`;
    const src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const s = { ...A };
    s['index.html'] = A['index.html'].replace(
      '<a class="btn" href="pricing.html">See pricing</a>',
      `<a href="pricing.html"><img src="${src}" alt="See pricing" width="152" height="50"></a>`,
    );
    return s;
  })();
  c['btn-nav'] = { ...A, 'site.css': CSS_A + '.nav a{background:#334155;color:#fff;padding:8px 16px;border-radius:6px;margin-left:12px}\n.nav a.on{background:#0e7490}\n' };
  c['footer-nav'] = mapHtml(A, (t) => {
    const m = t.match(/<div class="nav"><span class="brand">Tidewater Bikes<\/span>(.*?)<\/div>/)!;
    return t
      .replace(m[0], '<div class="nav"><span class="brand">Tidewater Bikes</span></div>')
      .replace(`<div class="foot">${FOOT_TEXT}</div>`, `<div class="foot">${FOOT_TEXT}${m[1].replace(/ class="on"/g, '')}</div>`);
  });
  c['two-clicks'] = (() => {
    const s = mapHtml(A, (t) => t.replace(/<a href="contact\.html"( class="on")?>Contact<\/a>/, ''));
    s['about.html'] = s['about.html'].replace('</div>\n</div>\n<div class="foot">', '</div>\n<a class="btn" href="contact.html">Visit the workshop</a>\n</div>\n<div class="foot">');
    return s;
  })();
  c['extra-links'] = goalA(true);
  c['extra-page'] = (() => {
    const s = mapHtml(A, (t) => t.replace(`<div class="foot">${FOOT_TEXT}</div>`, `<div class="foot">${FOOT_TEXT}<a href="sitemap.html">Site map</a></div>`));
    s['sitemap.html'] = pageA('index', { nav: navA('') }).replace(
      BODY_A.index,
      `<div class="wrap"><h2>Site map</h2><p class="lead"><a href="index.html">Home</a>, <a href="about.html">About</a>, <a href="pricing.html">Pricing</a>, <a href="contact.html">Contact</a></p></div>`,
    ).replace('<title>Tidewater Bikes</title>', '<title>Site map, Tidewater Bikes</title>');
    s['404.html'] = pageA('index', { nav: navA('') }).replace(
      BODY_A.index,
      `<div class="wrap"><h2>Page not found</h2><p class="lead">That page does not exist. Try the <a href="index.html">home page</a>.</p></div>`,
    ).replace('<title>Tidewater Bikes</title>', '<title>Not found, Tidewater Bikes</title>');
    return s;
  })();
  cases['links-ok'] = c;
}

// Links a person says are broken
{
  const c: Record<string, Site> = { goal: A };
  c['nav-hash'] = replaceNavHref(A, 'about.html', '#');
  c['nav-empty'] = replaceNavHref(A, 'about.html', '');
  c['nav-js-void'] = replaceNavHref(A, 'about.html', 'javascript:void(0)');
  c['nav-typo'] = replaceNavHref(A, 'about.html', 'abuot.html');
  c['nav-external'] = replaceNavHref(A, 'about.html', 'https://example.com/about');
  c['all-home'] = mapHtml(A, (t) => t.replace(/href="(about|pricing|contact)\.html"/g, 'href="index.html"'));
  c['contact-self-only'] = mapHtml(A, (t, p) => (p === 'contact.html' ? t : t.replace('<a href="contact.html">Contact</a>', '')));
  c['contact-hidden-only'] = mapHtml(A, (t, p) =>
    p === 'contact.html' ? t : t.replace('<a href="contact.html">Contact</a>', '<a href="contact.html" style="display:none">Contact</a>'),
  );
  cases['links-bad'] = c;
}

// One dead link among many versus among few
{
  const G = goalA(true);
  const dead = { ...G };
  dead['pricing.html'] = G['pricing.html'].replace(/(<div class="foot">.*?)href="contact\.html"/, '$1href="contct.html"');
  cases['dead-of-many'] = { goal: G, 'one-dead': dead };
  cases['dead-of-few'] = { goal: goalC(), 'one-dead': goalC(true) };
}

// Structure
{
  const c: Record<string, Site> = { goal: A };
  c['one-page'] = (() => {
    const nav = `<div class="nav"><span class="brand">Tidewater Bikes</span><a href="#top" class="on">Home</a><a href="#about">About</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a></div>`;
    const body = PAGES_A.map((p) => `<section id="${p === 'index' ? 'top' : p}">\n${BODY_A[p].replace(/href="(about|pricing)\.html"/g, 'href="#$1"')}\n</section>`).join('\n');
    return {
      'site.css': CSS_A,
      'index.html': pageA('index', { nav }).replace(BODY_A.index, body),
    };
  })();
  const ren: Record<string, string> = { about: 'about-us', pricing: 'prices', contact: 'contact-us' };
  c['renamed'] = (() => {
    const s: Site = { 'site.css': CSS_A };
    for (const p of PAGES_A) {
      const text = pageA(p).replace(/href="(about|pricing|contact)\.html"/g, (_, q) => `href="${ren[q]}.html"`);
      s[`${ren[p] ?? p}.html`] = text;
    }
    return s;
  })();
  c['subfolder'] = (() => {
    const s: Site = { 'css/site.css': CSS_A };
    for (const p of PAGES_A) {
      const inSub = p !== 'index';
      let text = pageA(p, { css: `<link rel="stylesheet" href="${inSub ? '../' : ''}css/site.css">` });
      text = text.replace(/href="(index|about|pricing|contact)\.html"/g, (_, q) =>
        inSub ? (q === 'index' ? 'href="../index.html"' : `href="${q}.html"`) : q === 'index' ? 'href="index.html"' : `href="pages/${q}.html"`,
      );
      s[inSub ? `pages/${p}.html` : 'index.html'] = text;
    }
    return s;
  })();
  c['merged'] = (() => {
    const s = mapHtml(A, (t) => t.replace(/<a href="contact\.html"( class="on")?>Contact<\/a>/, ''));
    delete s['contact.html'];
    s['about.html'] = s['about.html'].replace(
      '</div>\n</div>\n<div class="foot">',
      `</div>\n</div>\n${BODY_A.contact.replace('<h2>Contact</h2>', '<h2>Contact</h2>')}\n<div class="foot">`,
    );
    return s;
  })();
  c['extra-copies'] = (() => {
    const s = { ...A };
    for (const p of PAGES_A) s[`${p}-copy.html`] = A[`${p}.html`];
    return s;
  })();
  c['home-is-home-html'] = (() => {
    const s = mapHtml(A, (t) => t.replace(/href="index\.html"/g, 'href="home.html"'));
    s['home.html'] = s['index.html'];
    s['index.html'] = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tidewater Bikes</title>
<link rel="stylesheet" href="site.css">
</head>
<body>
<div class="wrap"><a class="btn" href="home.html">Enter the site</a></div>
</body>
</html>
`;
    return s;
  })();
  cases['structure'] = c;
}

// Engineering
{
  const c: Record<string, Site> = { goal: A };
  c['minified'] = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, k.endsWith('.css') ? minifyCss(v) : minifyHtml(v)]));
  c['css-split-6'] = (() => {
    const lines = CSS_A.trim().split('\n');
    const per = Math.ceil(lines.length / 6);
    const s: Site = {};
    const tags: string[] = [];
    for (let i = 0; i < 6; i++) {
      s[`css/part${i + 1}.css`] = lines.slice(i * per, (i + 1) * per).join('\n') + '\n';
      tags.push(`<link rel="stylesheet" href="css/part${i + 1}.css">`);
    }
    for (const p of PAGES_A) s[`${p}.html`] = pageA(p, { css: tags.join('\n') });
    return s;
  })();
  c['css-inline'] = Object.fromEntries(PAGES_A.map((p) => [`${p}.html`, pageA(p, { css: `<style>\n${CSS_A}</style>` })]));
  c['unused-200k-linked'] = (() => {
    const s: Site = { 'site.css': CSS_A, 'vendor.css': junkCss(200 * 1024) };
    for (const p of PAGES_A) s[`${p}.html`] = pageA(p, { head: '\n<link rel="stylesheet" href="vendor.css">' });
    return s;
  })();
  c['base64-250k'] = (() => {
    const pad = 'x'.repeat(185 * 1024);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><!-- ${pad} --><circle cx="8" cy="8" r="7" fill="#0e7490"/></svg>`;
    const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const s = { ...A };
    s['index.html'] = A['index.html'].replace(`<div class="foot">${FOOT_TEXT}`, `<div class="foot"><img src="${src}" alt="" width="13" height="13"> ${FOOT_TEXT}`);
    return s;
  })();
  c['outside-20'] = (() => {
    const s: Site = { 'site.css': CSS_A };
    let n = 0;
    for (const p of PAGES_A) {
      const head = Array.from({ length: 5 }, () => `\n<link rel="stylesheet" href="https://cdn.example.com/lib/v2/module-${++n}.css">`).join('');
      s[`${p}.html`] = pageA(p, { head });
    }
    return s;
  })();
  c['bloated-2x'] = (() => {
    const fat = (t: string, css: boolean) => {
      const pad = css ? '/* ---------------------------------------------------------------- */' : '<!-- ---------------------------------------------------------------- -->';
      return t
        .split('\n')
        .map((l) => `        ${l}\n\n${pad}`)
        .join('\n');
    };
    return Object.fromEntries(Object.entries(A).map(([k, v]) => [k, fat(v, k.endsWith('.css'))]));
  })();
  c['unlinked-200k-file'] = { ...A, 'old-theme.css': junkCss(200 * 1024, 'old') };
  cases['engineering'] = c;
}

// Goal B: sub-folder and two stylesheets
{
  const B = goalB();
  const c: Record<string, Site> = { goal: B, self: B };
  c['folder-link'] = mapHtml(B, (t) => t.replace(/href="docs\/index\.html"/g, 'href="docs/"').replace(/href="index\.html">Docs/g, 'href="./">Docs'));
  c['dotdot-roundabout'] = mapHtml(B, (t, p) =>
    p.startsWith('docs/') ? t.replace(/href="(guide|faq)\.html"/g, 'href="../docs/$1.html"').replace(/href="\.\.\/index\.html"/g, 'href="./../index.html"') : t,
  );
  c['flattened'] = (() => {
    const flat = (to: string) => ({ 'index.html': 'index.html', 'docs/index.html': 'docs.html', 'docs/guide.html': 'guide.html', 'docs/faq.html': 'faq.html' } as Record<string, string>)[to] ?? to.replace('css/', 'css/');
    const s: Site = { 'css/base.css': BASE_B, 'css/theme.css': THEME_B };
    for (const p of B_PAGES) {
      let text = pageB(p, { href: (_f, to) => flat(to) });
      text = text.replace('href="guide.html">Guide: your', 'href="guide.html">Guide: your').replace('href="docs/guide.html">Read', 'href="guide.html">Read');
      s[flat(p)] = text;
    }
    return s;
  })();
  c['one-css'] = (() => {
    const s: Site = { 'css/site.css': BASE_B + THEME_B };
    for (const p of B_PAGES) s[p] = pageB(p, { css: `<link rel="stylesheet" href="${rel(p, 'css/site.css')}">` });
    return s;
  })();
  c['broken-css-path'] = mapHtml(B, (t, p) => (p.startsWith('docs/') ? t.replace(/href="\.\.\/css\//g, 'href="css/') : t));
  cases['docs-subfolder'] = c;
}

// Limits and failure
{
  const c: Record<string, Site> = { goal: A };
  c['files-41'] = (() => {
    const s = { ...A };
    for (let i = 1; s && Object.keys(s).length < 41; i++) s[`extra/note-${i}.css`] = `.n${i}{color:#000}\n`;
    return s;
  })();
  c['file-over-300k'] = { ...A, 'big.css': junkCss(310 * 1024, 'big') };
  c['not-html'] = { ...A, 'about.html': `About us\n\nWe are four friends who started welding frames in a garage in 2019. We wanted bikes that fit the person riding them, not the other way round.\n\nToday we build about two hundred bikes a year.\n` };
  c['empty-index'] = { ...A, 'index.html': '' };
  c['css-only'] = { 'site.css': CSS_A, 'more.css': '.x{color:red}\n' };
  c['space-in-path'] = (() => {
    const s = mapHtml(A, (t) => t.replace('href="site.css"', 'href="site%20styles.css"'));
    delete s['site.css'];
    s['site styles.css'] = CSS_A;
    return s;
  })();
  c['dotdot-path'] = { ...A, '__extra.json': JSON.stringify({ '../outside.css': '.x{color:red}\n' }) };
  c['backslash-path'] = (() => {
    const s = mapHtml(A, (t) => t.replace('href="site.css"', 'href="styles/site.css"'));
    delete s['site.css'];
    s['__extra.json'] = JSON.stringify({ 'styles\\site.css': CSS_A });
    return s;
  })();
  cases['limits'] = c;
}

// Thirteen pages: only twelve are graded
cases['thirteen'] = { goal: goalD(), self: goalD(), 'missing-first': goalD('page-01'), 'missing-last': goalD('page-12') };

rmSync(ROOT, { recursive: true, force: true });
let count = 0;
for (const [name, attempts] of Object.entries(cases)) {
  for (const [attempt, site] of Object.entries(attempts)) {
    for (const [path, text] of Object.entries(site)) {
      const full = join(ROOT, name, attempt, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    if (attempt !== 'goal') count++;
  }
}
console.log(`wrote ${Object.keys(cases).length} cases, ${count} attempts to ${ROOT}`);
