// Generates the review's goal sites, attempts, cheats and probes.
//   node calibration/review/sites/gen.mjs
// Output: calibration/review/sites/cases/<goal>/{goal,attempts/<name>} and probes/<set>/{goal,attempts/<name>}
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, 'cases');
const PROBES = join(HERE, 'probes');

function save(root, files) {
  for (const [p, text] of Object.entries(files)) {
    const full = join(root, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

function doc({ title, css, body, lang = 'en', head = '', doctype = true, styleTag = '' }) {
  return `${doctype ? '<!doctype html>\n' : ''}<html${lang ? ` lang="${lang}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${css ? `<link rel="stylesheet" href="${css}">\n` : ''}${styleTag ? `<style>${styleTag}</style>\n` : ''}${head}</head>
<body>
${body}
</body>
</html>
`;
}

// Unused CSS, deterministic: n rules for classes no page uses.
function unusedCss(bytes, seed = 'x') {
  let out = '';
  let i = 0;
  while (out.length < bytes) {
    out += `.${seed}-promo-${i}{display:flex;margin:${i % 7}px ${i % 11}px;padding:${i % 5}px;color:#${((i * 2654435) % 0xffffff).toString(16).padStart(6, '0')};border-radius:${i % 9}px}\n`;
    i++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Restaurant: Olive & Ember. Four pages, one stylesheet.              */
/* ------------------------------------------------------------------ */
const R_PAL = { bg: '#fbf7f0', ink: '#2b2622', brand: '#2f3b2b', accent: '#b5532c', cream: '#f4ead8' };
const R_FONT = "Georgia, 'Times New Roman', serif";
const R_DISHES = {
  Starters: [
    ['Charred leeks', 'romesco, toasted hazelnuts', '9'],
    ['Smoked burrata', 'blood orange, basil oil', '12'],
    ['Flatbread', 'za\'atar, whipped feta', '8'],
    ['Grilled squid', 'chilli, lemon, parsley', '11'],
  ],
  Mains: [
    ['Ember chicken', 'half bird, salsa verde', '21'],
    ['Lamb shoulder', 'slow roast, white beans', '26'],
    ['Wood-fired hake', 'mussels, saffron broth', '24'],
    ['Squash risotto', 'sage, brown butter', '18'],
  ],
  Desserts: [
    ['Olive oil cake', 'crème fraîche, honey', '8'],
    ['Burnt cheesecake', 'poached plums', '9'],
    ['Dark chocolate pot', 'sea salt, shortbread', '8'],
    ['Affogato', 'vanilla gelato, espresso', '6'],
  ],
};

function restaurant(opt = {}) {
  const o = {
    p: 'r-', pal: R_PAL, font: R_FONT, pages: ['index.html', 'menu.html', 'reservations.html', 'find-us.html'],
    href: (page, label, h) => h, footer: true, footerHours: true, form: 'full', extraCss: '', sloppy: false, plain: false,
    sections: ['Starters', 'Mains', 'Desserts'], dishes: R_DISHES, map: true, hours: true, hoursRows: 7, heroText: null,
    navStack: false, ...opt,
  };
  const { p, pal } = o;
  const H = (page, label, h) => o.href(page, label, h);
  const a = (page, label, h, cls = '', cur = false) => {
    const t = H(page, label, h);
    if (t === null) return '';
    return `<a href="${t}"${cls ? ` class="${cls}"` : ''}${cur ? ' aria-current="page"' : ''}>${label}</a>`;
  };
  const NAV = [['Home', 'index.html'], ['Menu', 'menu.html'], ['Reservations', 'reservations.html'], ['Find us', 'find-us.html']];
  const header = (page) =>
    o.sloppy
      ? `<div class="${p}top" style="background:${pal.brand}"><div class="${p}bar"><span class="${p}brand" style="color:${pal.cream}">Olive &amp; Ember</span><div class="${p}nav">${NAV.map(([l, h]) => a(page, l, h, '', h === page)).join('')}</div></div></div>`
      : `<header class="${p}top"><div class="${p}bar">${a(page, 'Olive &amp; Ember', 'index.html', `${p}brand`)}<nav class="${p}nav" aria-label="Main">${NAV.map(([l, h]) => a(page, l, h, '', h === page)).join('\n')}</nav></div></header>`;
  const footer = (page) =>
    o.footer
      ? `<footer><div class="${p}bar"><nav aria-label="Footer">${a(page, 'Book a table', 'reservations.html')}${o.footerHours ? a(page, 'Opening hours', 'find-us.html') : ''}</nav><p>&copy; 2026 Olive &amp; Ember, 14 Quay Street</p></div></footer>`
      : '';
  const svgIcon = (d, label) =>
    o.sloppy
      ? `<svg width="48" height="48" viewBox="0 0 48 48"><path d="${d}" fill="${pal.accent}"/></svg>`
      : `<svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label="${label}"><path d="${d}" fill="${pal.accent}"/></svg>`;
  const main = (inner) => (o.sloppy ? `<div class="${p}main" id="content">${inner}</div>` : `<main>${inner}</main>`);
  const ST = o.sloppy ? (s) => ` style="${s}"` : () => '';
  const pages = {};

  pages['index.html'] = doc({
    title: 'Olive & Ember — wood-fired restaurant', css: 'style.css', lang: o.sloppy ? '' : 'en',
    body: `${header('index.html')}
${main(`<section class="${p}hero"><div><h1${ST('margin:0')}>Wood-fired food, slow evenings</h1>
<p${ST('font-size:19px')}>${o.heroText ?? 'A small dining room on the harbour, cooking over oak and olive wood. Seasonal plates, natural wines and a long table for friends.'}</p>
${a('index.html', 'See the menu', 'menu.html', `${p}btn`)}</div>
<svg viewBox="0 0 400 260" width="100%"${o.sloppy ? '' : ' role="img" aria-label="A wood-fired oven"'}><rect width="400" height="260" rx="16" fill="${pal.brand}"/><path d="M80 220 Q200 40 320 220 Z" fill="${pal.accent}"/><circle cx="200" cy="170" r="34" fill="#f2b84b"/><rect x="60" y="220" width="280" height="14" fill="${pal.cream}"/></svg></section>
<section class="${p}cards">
<div class="${p}card"${o.sloppy ? ' id="card"' : ''}>${svgIcon('M24 4 C34 16 38 24 24 44 C10 24 14 16 24 4Z', 'Flame')}<h2${ST('margin-top:8px')}>Fire</h2><p${ST('color:#555')}>Everything passes through the oven: bread, fish, vegetables, even dessert.</p></div>
<div class="${p}card"${o.sloppy ? ' id="card"' : ''}>${svgIcon('M24 44 V20 M24 20 C14 20 8 12 8 4 C18 4 24 10 24 20 C24 10 30 4 40 4 C40 12 34 20 24 20', 'Leaf')}<h2${ST('margin-top:8px')}>Garden</h2><p${ST('color:#555')}>Herbs and greens from our plot two miles up the valley.</p></div>
<div class="${p}card"${o.sloppy ? ' id="card"' : ''}>${svgIcon('M4 20 H44 V26 H4Z M8 26 V44 M40 26 V44', 'Table')}<h2${ST('margin-top:8px')}>Table</h2><p${ST('color:#555')}>Thirty-two seats and one long table you can book for twelve.</p></div>
</section>`)}
${footer('index.html')}`,
  });

  if (o.pages.includes('menu.html'))
    pages['menu.html'] = doc({
      title: 'Menu — Olive & Ember', css: 'style.css', lang: o.sloppy ? '' : 'en',
      body: `${header('menu.html')}
${main(`<h1>Menu</h1><p>Served Wednesday to Sunday from 5.30pm. Prices in pounds.</p>
${o.sections.map((s) => `<h2>${s}</h2><ul class="${p}dishes">${o.dishes[s].map(([n, d, pr]) => `<li class="${p}dish"><span>${n}<small>${d}</small></span><span>£${pr}</span></li>`).join('')}</ul>`).join('\n')}
<p${ST('margin-top:32px')}>${a('menu.html', 'Book a table', 'reservations.html', `${p}btn`)}</p>`)}
${footer('menu.html')}`,
    });

  const field = (label, control) =>
    o.sloppy ? control.replace('>', ` placeholder="${label}">`).replace('<textarea placeholder', '<textarea placeholder') : `<label>${label}${control}</label>`;
  const formHtml =
    o.form === 'none'
      ? `<p>To book a table, call us on 01632 960 123 or email tables@oliveandember.example. We answer every booking within a day.</p>`
      : `<form class="${p}form" action="reservations.html" method="get">
${field('Name', '<input name="name" autocomplete="name" required>')}
${field('Email', '<input type="email" name="email" autocomplete="email" required>')}
${field('Date', '<input type="date" name="date" required>')}
${o.form === 'full' ? field('Time', '<select name="time"><option>18:00</option><option>18:30</option><option>19:00</option><option>19:30</option><option>20:00</option><option>20:30</option><option>21:00</option></select>') : ''}
${field('Guests', '<input type="number" name="guests" min="1" max="8" value="2">')}
${o.form === 'full' ? (o.sloppy ? `<textarea name="notes" rows="4" class="${p}wide" placeholder="Notes"></textarea>` : `<label class="${p}wide">Notes (allergies, occasions)<textarea name="notes" rows="4"></textarea></label>`) : ''}
<button type="submit">Request booking</button>
</form>`;
  if (o.pages.includes('reservations.html'))
    pages['reservations.html'] = doc({
      title: 'Book a table — Olive & Ember', css: 'style.css', lang: o.sloppy ? '' : 'en',
      body: `${header('reservations.html')}
${main(`<h1>Book a table</h1><p>Tables are held for fifteen minutes. Groups of more than eight, please call 01632 960 123.</p>
${formHtml}`)}
${footer('reservations.html')}`,
    });

  const DAYS = [['Monday', 'Closed'], ['Tuesday', 'Closed'], ['Wednesday', '5.30pm – 10pm'], ['Thursday', '5.30pm – 10pm'], ['Friday', '5pm – 11pm'], ['Saturday', '12pm – 11pm'], ['Sunday', '12pm – 6pm']];
  if (o.pages.includes('find-us.html'))
    pages['find-us.html'] = doc({
      title: 'Find us — Olive & Ember', css: 'style.css', lang: o.sloppy ? '' : 'en',
      body: `${header('find-us.html')}
${main(`<h1>Find us</h1><div class="${p}two"><div><h2>Address</h2><address>14 Quay Street<br>Harbourside, Porthaven<br>PH1 4QE</address>
${o.hours ? `<h2>Opening hours</h2><table><tbody>${DAYS.slice(0, o.hoursRows).map(([d, h]) => `<tr><th scope="row">${d}</th><td>${h}</td></tr>`).join('')}</tbody></table>` : '<p>We are open Wednesday to Sunday evenings and weekend lunchtimes.</p>'}
<p${ST('margin-top:24px')}>${a('find-us.html', 'Book a table', 'reservations.html', `${p}btn`)}</p></div>
${o.map ? `<svg viewBox="0 0 400 360" width="100%"${o.sloppy ? '' : ' role="img" aria-label="Map: Quay Street runs along the harbour; we are at the corner with Mill Lane"'}><rect width="400" height="360" fill="#e8e1d3"/><rect y="250" width="400" height="110" fill="#9ec5d6"/><rect y="220" width="400" height="24" fill="#fff"/><rect x="180" width="24" height="220" fill="#fff"/><circle cx="212" cy="206" r="12" fill="${pal.accent}"/></svg>` : ''}</div>`)}
${footer('find-us.html')}`,
    });

  const css = o.plain
    ? `body{margin:0 auto;max-width:900px;padding:16px;font-family:system-ui,sans-serif}nav a{margin-right:12px}table{border-collapse:collapse}td,th{padding:4px 8px;text-align:left}\n`
    : `*{box-sizing:border-box}
body{margin:0;font-family:${o.font};background:${pal.bg};color:${pal.ink};line-height:1.5}
.${p}top{background:${pal.brand};color:${pal.cream}}
.${p}bar{max-width:1080px;margin:0 auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between${o.navStack ? ';flex-direction:column;gap:10px' : ''}}
.${p}brand{font-size:24px;font-weight:700;color:${pal.cream};text-decoration:none}
.${p}nav{display:flex;gap:24px}
.${p}nav a{color:${pal.cream};text-decoration:none;font-size:17px}
.${p}nav a[aria-current]{border-bottom:2px solid ${pal.accent}}
main,.${p}main{display:block;max-width:1080px;margin:0 auto;padding:40px 24px}
h1{font-size:44px;margin:0 0 12px;color:${pal.brand}}
h2{font-size:26px;margin:28px 0 10px;color:${pal.brand}}
.${p}hero{display:grid;grid-template-columns:1.2fr 1fr;gap:40px;align-items:center}
.${p}btn{display:inline-block;background:${pal.accent};color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700}
.${p}cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px}
.${p}card{background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.${p}card h2{margin-top:8px}
.${p}dishes{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:12px 40px}
.${p}dish{display:flex;justify-content:space-between;border-bottom:1px dotted #b9ad99;padding:6px 0}
.${p}dish small{display:block;color:#6b6257}
.${p}form{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:720px}
.${p}form label{display:flex;flex-direction:column;font-weight:700;gap:6px}
.${p}form input,.${p}form select,.${p}form textarea{font:inherit;padding:10px;border:1px solid #b9ad99;border-radius:6px;background:#fff}
.${p}wide{grid-column:1/-1}
.${p}form button{grid-column:1/-1;justify-self:start;font:inherit;font-weight:700;background:${pal.accent};color:#fff;border:0;border-radius:6px;padding:12px 22px}
.${p}two{display:grid;grid-template-columns:1fr 1fr;gap:40px}
table{border-collapse:collapse;width:100%}
td,th{text-align:left;padding:8px;border-bottom:1px solid #d8cfc0}
footer{background:${pal.brand};color:${pal.cream};margin-top:40px}
footer nav{display:flex;gap:20px}
footer a{color:${pal.cream}}
`;
  return { ...pages, 'style.css': css + o.extraCss };
}

/* ------------------------------------------------------------------ */
/* Portfolio with a blog, posts two folders deep.                      */
/* ------------------------------------------------------------------ */
const POSTS = [
  ['quiet-tools.html', 'Quiet tools', 'Software that stays out of the way earns trust. Notes from rebuilding a field app for park rangers who work with gloves on.', '12 March 2026'],
  ['grid-notes.html', 'Notes on grids', 'A grid is a promise to the reader about where things will be. Three grids I keep reusing and why the twelve-column one is rarely right.', '30 May 2026'],
  ['on-color.html', 'On colour', 'Colour carries meaning before words do. How I pick a palette with three colours and a rule for each.', '9 September 2026'],
];
const P_PAL = { accent: '#c2410c', ink: '#1f2933', soft: '#f5f1ec', line: '#e5ded5' };
const P_FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function portfolio(opt = {}) {
  const o = {
    p: 'm-', pal: P_PAL, font: P_FONT, href: (page, label, h) => h, posts: POSTS, postDir: 'blog/2026/',
    swap: false, skills: true, projects: 4, thumbs: true, contactMessage: true, built: null,
    homePosts: [0, 1, 2], blogPosts: [0, 1, 2], prevNext: (i, kind) => true, headerDark: false, extraCss: '', ...opt,
  };
  const { p, pal } = o;
  const depth = (page) => page.split('/').length - 1;
  const up = (page) => '../'.repeat(depth(page));
  // Builds the correct relative href, then lets the attempt change it.
  const rel = (page, target) => up(page) + target;
  const a = (page, label, target, cls = '', cur = false) => {
    const t = o.href(page, label, rel(page, target), target, cls);
    if (t === null) return '';
    return `<a href="${t}"${cls ? ` class="${cls}"` : ''}${cur ? ' aria-current="page"' : ''}>${label}</a>`;
  };
  const NAV = [['Home', 'index.html'], ['Projects', 'projects.html'], ['Blog', 'blog/index.html'], ['About', 'about.html'], ['Contact', 'contact.html']];
  const header = (page) =>
    `<header class="${p}head"><div class="${p}wrap ${p}bar">${a(page, 'Mara Quinn', 'index.html', `${p}name`)}<nav aria-label="Main">${NAV.map(([l, t]) => a(page, l, t, '', t === page)).join('\n')}</nav></div></header>`;
  const footer = (page) =>
    `<footer class="${p}foot"><div class="${p}wrap ${p}bar"><p>&copy; 2026 Mara Quinn, designer and developer</p>${a(page, 'Email me', 'contact.html')}</div></footer>`;
  const shell = (page, title, inner) =>
    doc({ title, css: rel(page, 'style.css'), body: `${header(page)}\n<main class="${p}wrap">${inner}</main>\n${footer(page)}` });
  const thumb = (hue, label) =>
    o.thumbs
      ? `<svg viewBox="0 0 300 160" width="100%" role="img" aria-label="${label}"><rect width="300" height="160" rx="8" fill="hsl(${hue} 60% 85%)"/><rect x="24" y="24" width="120" height="16" rx="4" fill="hsl(${hue} 50% 40%)"/><rect x="24" y="52" width="200" height="10" rx="4" fill="hsl(${hue} 30% 60%)"/><circle cx="240" cy="110" r="30" fill="hsl(${hue} 70% 55%)"/></svg>`
      : '';
  const PROJECTS = [
    [20, 'Ranger field app', 'Offline-first app for logging trail damage. React Native, SQLite.'],
    [200, 'Harbour timetable', 'A ferry timetable you can read at a glance, in four languages.'],
    [120, 'Seed library', 'Catalogue and lending system for a community seed bank.'],
    [280, 'Type specimen', 'An open-source specimen site for a variable typeface.'],
  ];
  const postPath = (i) => o.postDir + o.posts[i][0];
  const pages = {};
  const projectsInner = (page) =>
    `<h1>Projects</h1><p class="${p}lede">Selected work from the last four years, for charities, councils and small studios.</p><div class="${p}grid">${PROJECTS.slice(0, o.projects).map(([h, t, d]) => `<article class="${p}card">${thumb(h, t)}<h2>${t}</h2><p>${d}</p></article>`).join('')}</div>`;
  const aboutInner = (page) =>
    `<h1>About</h1><div class="${p}about"><svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Portrait of Mara Quinn"><circle cx="100" cy="100" r="100" fill="${pal.soft}"/><circle cx="100" cy="80" r="36" fill="${pal.accent}"/><path d="M40 180 Q100 110 160 180Z" fill="${pal.accent}"/></svg><div><p>I'm Mara, a designer who writes code. I spent six years at a public-sector studio before going independent in 2022.</p><p>I like small teams, plain language and software that works on bad connections.</p>${o.skills ? `<h2>What I do</h2><ul><li>Interface and interaction design</li><li>Front-end development</li><li>Design systems and documentation</li><li>Workshops for non-designers</li></ul>` : ''}</div></div>`;

  pages['index.html'] = shell('index.html', 'Mara Quinn — designer and developer', `<section class="${p}hero"><h1>I design and build calm, useful software.</h1><p class="${p}lede">Independent designer and front-end developer in Bristol, working with public services and small studios.</p>${a('index.html', 'View all projects', 'projects.html', `${p}btn`)}</section>
<h2>Latest writing</h2><ul class="${p}posts">${o.homePosts.map((i) => `<li>${a('index.html', o.posts[i][1], postPath(i))} <span>${o.posts[i][3]}</span></li>`).join('')}</ul>`);
  pages['projects.html'] = shell('projects.html', o.swap ? 'About — Mara Quinn' : 'Projects — Mara Quinn', o.swap ? aboutInner('projects.html') : projectsInner('projects.html'));
  pages['about.html'] = shell('about.html', o.swap ? 'Projects — Mara Quinn' : 'About — Mara Quinn', o.swap ? projectsInner('about.html') : aboutInner('about.html'));
  pages['contact.html'] = shell('contact.html', 'Contact — Mara Quinn', `<h1>Contact</h1><p class="${p}lede">I'm booking projects from January 2027. Tell me a little about yours.</p><form class="${p}form" action="contact.html" method="get"><label>Your name<input name="name" autocomplete="name" required></label><label>Email<input type="email" name="email" autocomplete="email" required></label>${o.contactMessage ? '<label>Message<textarea name="message" rows="6" required></textarea></label>' : ''}<button type="submit">Send message</button></form><p>Or write to hello@maraquinn.example.</p>`);
  pages['blog/index.html'] = shell('blog/index.html', 'Blog — Mara Quinn', `<h1>Blog</h1><p class="${p}lede">Occasional notes on design and building for the web.</p><div class="${p}list">${o.blogPosts.map((i) => `<article class="${p}entry"><h2>${a('blog/index.html', o.posts[i][1], postPath(i))}</h2><p class="${p}date">${o.posts[i][3]}</p><p>${o.posts[i][2]}</p></article>`).join('')}</div>`);
  o.posts.forEach(([file, title, summary, date], i) => {
    const page = postPath(i);
    const older = i > 0 && o.prevNext(i, 'older') ? `<span>Older: ${a(page, o.posts[i - 1][1], postPath(i - 1))}</span>` : '<span></span>';
    const newer = i < o.posts.length - 1 && o.prevNext(i, 'newer') ? `<span>Newer: ${a(page, o.posts[i + 1][1], postPath(i + 1))}</span>` : '<span></span>';
    pages[page] = shell(page, `${title} — Mara Quinn`, `<nav class="${p}crumbs" aria-label="Breadcrumb">${a(page, 'Home', 'index.html', p + 'crumb')} / ${a(page, 'Blog', 'blog/index.html', p + 'crumb')} / <span>${title}</span></nav>
<article class="${p}post"><h1>${title}</h1><p class="${p}date">${date}</p><p class="${p}lede">${summary}</p><p>Most of the work is deciding what to leave out. A tool that asks for attention all day wears people down; one that waits until it is needed gets picked up again tomorrow.</p><p>When I start, I list every screen and ask who would miss it. Usually a third go, and the rest get simpler.</p></article>
<nav class="${p}pager" aria-label="More posts">${older}${newer}</nav><p>${a(page, 'Back to the blog', 'blog/index.html')}</p>`);
  });
  if (o.built) for (const k of Object.keys(pages)) if (!o.built.includes(k)) delete pages[k];
  const css = `*{box-sizing:border-box}
body{margin:0;font-family:${o.font};color:${pal.ink};background:#fff;line-height:1.6}
.${p}wrap{max-width:860px;margin:0 auto;padding:0 24px}
.${p}head{border-bottom:1px solid ${pal.line}${o.headerDark ? `;background:${pal.ink}` : ''}}
.${p}bar{display:flex;justify-content:space-between;align-items:center;padding-top:20px;padding-bottom:20px}
.${p}name{font-weight:700;font-size:20px;color:${o.headerDark ? '#fff' : pal.ink};text-decoration:none}
.${p}head nav{display:flex;gap:20px}
.${p}head nav a{color:${o.headerDark ? '#fff' : pal.ink};text-decoration:none}
.${p}head nav a[aria-current]{color:${pal.accent};font-weight:700}
main{padding-top:40px;padding-bottom:40px}
h1{font-size:40px;line-height:1.15;margin:0 0 12px}
h2{font-size:22px;margin:28px 0 8px}
a{color:${pal.accent}}
.${p}lede{font-size:19px;color:#52606d}
.${p}hero{padding:40px 0;border-bottom:1px solid ${pal.line}}
.${p}btn{display:inline-block;background:${pal.accent};color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700}
.${p}posts{list-style:none;padding:0}
.${p}posts li{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid ${pal.line}}
.${p}posts span,.${p}date{color:#7b8794;font-size:15px}
.${p}grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.${p}card{background:${pal.soft};border-radius:12px;padding:16px}
.${p}card h2{margin-top:12px}
.${p}about{display:grid;grid-template-columns:200px 1fr;gap:32px;align-items:start}
.${p}form{display:grid;gap:16px;max-width:520px}
.${p}form label{display:grid;gap:6px;font-weight:600}
.${p}form input,.${p}form textarea{font:inherit;padding:10px;border:1px solid #cbd2d9;border-radius:8px}
.${p}form button{justify-self:start;font:inherit;font-weight:700;background:${pal.accent};color:#fff;border:0;border-radius:999px;padding:10px 20px}
.${p}entry{padding:16px 0;border-bottom:1px solid ${pal.line}}
.${p}entry h2{margin:0}
.${p}crumbs{font-size:15px;color:#7b8794;margin-bottom:24px}
.${p}post{max-width:680px}
.${p}pager{display:flex;justify-content:space-between;border-top:1px solid ${pal.line};padding-top:16px;margin-top:32px}
.${p}foot{border-top:1px solid ${pal.line};color:#7b8794}
`;
  return { ...pages, 'style.css': css + o.extraCss };
}

/* ------------------------------------------------------------------ */
/* Conference: Fieldwork 2027. Eleven pages, six from one template.    */
/* ------------------------------------------------------------------ */
const SPEAKERS = [
  ['ada-lin', 'Ada Lin', 'Ethnographer, Tidewater Lab', 'Listening before asking', '09:30', 'Ada has spent ten years studying how fishing towns share knowledge, and teaches interview methods to product teams.'],
  ['ben-okafor', 'Ben Okafor', 'Head of Research, Larchmont', 'Diary studies that people finish', '10:30', 'Ben runs a research team of twelve and writes about keeping long studies alive past week two.'],
  ['carla-diaz', 'Carla Díaz', 'Independent researcher', 'Field notes as a team sport', '11:30', 'Carla works with health charities and has run fieldwork in nine countries, usually with a notebook and a borrowed bike.'],
  ['dev-patel', 'Dev Patel', 'Service designer, City of Wexmoor', 'Research inside a council', '13:30', 'Dev brought user research to a council of four thousand staff and lived to tell the tale.'],
  ['emi-sato', 'Emi Sato', 'Anthropologist, Northbay University', 'What the photos leave out', '14:30', 'Emi studies visual methods and the ethics of photographing participants at home.'],
  ['femi-adeyemi', 'Femi Adeyemi', 'Founder, Groundtruth', 'Turning notes into decisions', '15:30', 'Femi founded a synthesis studio and has helped forty teams act on what they heard.'],
];
const C_PAL = { bg: '#ffffff', ink: '#14213d', accent: '#0f766e', soft: '#ecfdf5', line: '#d1e7e0', head: '#ffffff' };
const C_FONT = "system-ui, 'Segoe UI', Roboto, Arial, sans-serif";

function conference(opt = {}) {
  const o = {
    p: 'c-', pal: C_PAL, font: C_FONT, href: (page, label, h) => h, speakers: SPEAKERS, speakerPages: true,
    speakerBody: 'full', scheduleTable: true, scheduleRows: 8, faqCount: 6, ticketsForm: 'full', faq: true,
    cardLinks: true, inlineCss: false, stub: false, talkOverride: {}, speakerPageOverride: null, extraCss: '', tinyNav: false, hideNav: false, ...opt,
  };
  const { p, pal } = o;
  const up = (page) => '../'.repeat(page.split('/').length - 1);
  const a = (page, label, target, cls = '', cur = false) => {
    const t = o.href(page, label, up(page) + target, target);
    if (t === null) return '';
    return `<a href="${t}"${cls ? ` class="${cls}"` : ''}${cur ? ' aria-current="page"' : ''}>${label}</a>`;
  };
  const NAV = [['Home', 'index.html'], ['Schedule', 'schedule.html'], ['Speakers', 'speakers.html'], ['Tickets', 'tickets.html'], ['FAQ', 'faq.html']];
  const header = (page) =>
    `<header class="${p}head"><div class="${p}wrap ${p}bar">${o.hideNav ? `<span class="${p}logo">Fieldwork 2027</span>` : a(page, 'Fieldwork 2027', 'index.html', `${p}logo`)}${o.hideNav ? '' : `<nav aria-label="Main">${NAV.map(([l, t]) => a(page, l, t, '', t === page)).join('\n')}</nav>`}</div></header>`;
  const tiny = (page) =>
    o.tinyNav
      ? `<div class="${p}fine">${[...NAV, ['Get tickets', 'tickets.html'], ['See the schedule', 'schedule.html'], ['All speakers', 'speakers.html'], ['Read more', 'speakers.html'], ...o.speakers.map((s) => [s[1], `speakers/${s[0]}.html`])].map(([l, t]) => a(page, l, t)).join(' ')}</div>`
      : '';
  const footer = (page) => `<footer class="${p}foot"><div class="${p}wrap"><p>Fieldwork 2027 · 14 May 2027 · The Corn Exchange, Leeds</p></div>${tiny(page)}</footer>`;
  const css = `*{box-sizing:border-box}
body{margin:0;font-family:${o.font};color:${pal.ink};background:${pal.bg};line-height:1.55}
.${p}wrap{max-width:1100px;margin:0 auto;padding:0 24px}
.${p}head{background:${pal.head};border-bottom:1px solid ${pal.line}}
.${p}bar{display:flex;justify-content:space-between;align-items:center;padding-top:16px;padding-bottom:16px}
.${p}logo{font-weight:800;font-size:22px;color:${pal.accent};text-decoration:none}
.${p}head nav{display:flex;gap:22px}
.${p}head nav a{color:${pal.ink};text-decoration:none;font-weight:600}
.${p}head nav a[aria-current]{color:${pal.accent};text-decoration:underline}
main{padding-top:36px;padding-bottom:48px}
h1{font-size:42px;line-height:1.1;margin:0 0 12px}
h2{font-size:24px;margin:28px 0 10px}
a{color:${pal.accent}}
.${p}hero{background:${pal.soft};border-radius:16px;padding:48px;display:grid;grid-template-columns:1.4fr 1fr;gap:32px;align-items:center}
.${p}meta{font-size:20px;font-weight:600}
.${p}btn{display:inline-block;background:${pal.accent};color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;margin-right:12px}
.${p}btn.${p}ghost{background:transparent;color:${pal.accent};border:2px solid ${pal.accent}}
.${p}grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.${p}card{border:1px solid ${pal.line};border-radius:12px;padding:20px;text-align:center}
.${p}card h2,.${p}card h3{margin:12px 0 4px;font-size:20px}
.${p}role{color:#52606d;margin:0}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:12px;border-bottom:1px solid ${pal.line}}
thead th{background:${pal.soft}}
.${p}tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:32px}
.${p}tier{border:1px solid ${pal.line};border-radius:12px;padding:20px}
.${p}price{font-size:32px;font-weight:800;color:${pal.accent};margin:4px 0}
.${p}form{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:760px}
.${p}form label{display:grid;gap:6px;font-weight:600}
.${p}form input,.${p}form select{font:inherit;padding:10px;border:1px solid #9fb8b0;border-radius:8px}
.${p}form button{grid-column:1/-1;justify-self:start;font:inherit;font-weight:700;background:${pal.accent};color:#fff;border:0;border-radius:8px;padding:12px 22px}
.${p}faq h2{font-size:19px;margin:24px 0 4px}
.${p}crumbs{font-size:15px;margin-bottom:20px}
.${p}speaker{display:grid;grid-template-columns:220px 1fr;gap:36px;align-items:start}
.${p}talk{background:${pal.soft};border-radius:12px;padding:16px 20px}
.${p}foot{background:${pal.ink};color:#e2e8f0;padding:20px 0}
.${p}fine{font-size:1px;line-height:1px;color:${pal.ink}}
.${p}fine a{color:${pal.ink}}
` + o.extraCss;
  const shell = (page, title, inner, head = '') =>
    doc({
      title,
      css: o.inlineCss ? '' : up(page) + 'style.css',
      styleTag: o.inlineCss ? css : '',
      head,
      body: `${header(page)}\n<main class="${p}wrap">${inner}</main>\n${footer(page)}`,
    });
  const avatar = (s, size = 120) =>
    `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Portrait of ${s[1]}"><circle cx="60" cy="60" r="60" fill="${pal.soft}"/><circle cx="60" cy="60" r="56" fill="none" stroke="${pal.accent}" stroke-width="4"/><text x="60" y="72" text-anchor="middle" font-size="34" font-weight="700" fill="${pal.accent}">${s[1].split(' ').map((w) => w[0]).join('')}</text></svg>`;
  const talk = (s) => o.talkOverride[s[0]] ?? s[3];
  const pages = {};
  const sp = (s) => `speakers/${s[0]}.html`;

  pages['index.html'] = shell('index.html', 'Fieldwork 2027 — a conference on field research', `<section class="${p}hero"><div><h1>Fieldwork 2027</h1><p class="${p}meta">14 May 2027 · The Corn Exchange, Leeds</p><p>One day, one room, six talks on doing research out in the world: with people, in their places, on their time.</p><p>${a('index.html', 'Get tickets', 'tickets.html', `${p}btn`)}${a('index.html', 'See the schedule', 'schedule.html', `${p}btn ${p}ghost`)}</p></div>
<svg viewBox="0 0 320 220" width="100%" role="img" aria-label="Hills and a path"><rect width="320" height="220" rx="16" fill="#ccfbf1"/><path d="M0 170 Q80 100 160 150 T320 120 V220 H0Z" fill="${pal.accent}"/><path d="M150 220 Q170 180 160 150" stroke="#fff" stroke-width="6" fill="none"/><circle cx="250" cy="60" r="24" fill="#fbbf24"/></svg></section>
<h2>Featured speakers</h2><div class="${p}grid">${o.speakers.slice(0, 3).map((s) => `<div class="${p}card">${avatar(s, 96)}<h3>${o.cardLinks ? a('index.html', s[1], sp(s)) : s[1]}</h3><p class="${p}role">${s[2]}</p></div>`).join('')}</div>
<p>${a('index.html', 'All speakers', 'speakers.html')}</p>`);

  pages['schedule.html'] = shell('schedule.html', 'Schedule — Fieldwork 2027', o.stub ? '<h1>Schedule</h1>' : `<h1>Schedule</h1><p>All talks are in the main hall. Lunch is included.</p>${o.scheduleTable
    ? `<table><thead><tr><th scope="col">Time</th><th scope="col">Talk</th><th scope="col">Speaker</th></tr></thead><tbody>${[
      ['09:00', 'Doors and coffee', null], ...o.speakers.slice(0, 3).map((s) => [s[4], talk(s), s]), ['12:30', 'Lunch', null], ...o.speakers.slice(3).map((s) => [s[4], talk(s), s]),
    ].slice(0, o.scheduleRows).map(([t, n, s]) => `<tr><td>${t}</td><td>${n}</td><td>${s ? (o.cardLinks ? a('schedule.html', s[1], sp(s)) : s[1]) : ''}</td></tr>`).join('')}</tbody></table>`
    : `<ul>${o.speakers.map((s) => `<li>${s[4]} ${talk(s)} (${s[1]})</li>`).join('')}</ul>`}`);

  pages['speakers.html'] = shell('speakers.html', 'Speakers — Fieldwork 2027', `<h1>Speakers</h1>${o.stub ? '' : '<p>Six people who do research where it happens.</p>'}<div class="${p}grid">${o.speakers.map((s) => `<article class="${p}card">${o.stub ? '' : avatar(s)}<h2>${o.cardLinks ? a('speakers.html', s[1], sp(s)) : s[1]}</h2>${o.stub ? '' : `<p class="${p}role">${s[2]}</p>`}${o.cardLinks && !o.stub ? `<p>${a('speakers.html', 'Read more', sp(s))}</p>` : ''}</article>`).join('')}</div>`);

  if (o.speakerPages)
    for (const s of o.speakers) {
      const page = sp(s);
      if (o.speakerPageOverride) {
        const custom = o.speakerPageOverride(s, page);
        if (custom === null) continue;
        pages[page] = custom;
        continue;
      }
      const body = o.stub
        ? `<h1>${s[1]}</h1>`
        : o.speakerBody === 'thin'
          ? `<nav class="${p}crumbs" aria-label="Breadcrumb">${a(page, '← All speakers', 'speakers.html')}</nav><h1>${s[1]}</h1><p class="${p}role">${s[2]}</p>`
          : `<nav class="${p}crumbs" aria-label="Breadcrumb">${a(page, '← All speakers', 'speakers.html')}</nav><div class="${p}speaker">${avatar(s, 200)}<div><h1>${s[1]}</h1><p class="${p}role">${s[2]}</p><p>${s[5]}</p><div class="${p}talk"><h2>${talk(s)}</h2><p>${s[4]}, main hall</p></div><p>${a(page, 'See the schedule', 'schedule.html')}</p></div></div>`;
      pages[page] = shell(page, `${s[1]} — Fieldwork 2027`, body);
    }

  const tiers = `<div class="${p}tiers"><div class="${p}tier"><h2>Standard</h2><p class="${p}price">£180</p><p>Talks, lunch and the evening social.</p></div><div class="${p}tier"><h2>Charity and public sector</h2><p class="${p}price">£110</p><p>For people working at charities, councils and the NHS.</p></div><div class="${p}tier"><h2>Student</h2><p class="${p}price">£45</p><p>Limited to sixty places.</p></div></div>`;
  const form =
    o.ticketsForm === 'none'
      ? '<p>Tickets go on sale on 1 February 2027.</p>'
      : `<h2>Reserve tickets</h2><form class="${p}form" action="tickets.html" method="get"><label>Full name<input name="name" autocomplete="name" required></label><label>Email<input type="email" name="email" autocomplete="email" required></label><label>Ticket<select name="ticket"><option>Standard</option><option>Charity and public sector</option><option>Student</option></select></label>${o.ticketsForm === 'full' ? '<label>Quantity<input type="number" name="qty" min="1" max="10" value="1"></label>' : ''}<button type="submit">Reserve tickets</button></form>`;
  pages['tickets.html'] = shell('tickets.html', 'Tickets — Fieldwork 2027', o.stub ? '<h1>Tickets</h1>' : `<h1>Tickets</h1><p>Prices include VAT. You pay by invoice after reserving.</p>${tiers}${form}`);

  const FAQ = [
    ['Is the venue step-free?', 'Yes. The Corn Exchange has a lift to every floor and an accessible toilet on each.'],
    ['Will talks be recorded?', 'Yes, with captions. Ticket holders get the videos a week later.'],
    ['Is there food?', 'Lunch and snacks are included. Tell us about dietary needs when you reserve.'],
    ['Can I transfer my ticket?', 'Yes, up to the day before. Email us the new name.'],
    ['Is there a quiet room?', 'Yes, on the first floor, all day.'],
    ['Do you offer refunds?', 'Full refunds until 1 April 2027, then half until 1 May.'],
  ];
  if (o.faq) pages['faq.html'] = shell('faq.html', 'FAQ — Fieldwork 2027', o.stub ? '<h1>Frequently asked questions</h1>' : `<h1>Frequently asked questions</h1><div class="${p}faq">${FAQ.slice(0, o.faqCount).map(([q, ans]) => `<h2>${q}</h2><p>${ans}</p>`).join('')}</div>`);
  if (!o.inlineCss) pages['style.css'] = css;
  return pages;
}

/* ------------------------------------------------------------------ */
/* Probe template: a plain clinic site with N pages.                   */
/* ------------------------------------------------------------------ */
const PROBE_PAGES = ['services', 'team', 'prices', 'faq', 'contact', 'blog', 'careers', 'locations', 'news'];
function probe(n, opt = {}) {
  const o = { href: (page, label, h) => h, drop: [], brokenLayout: null, padComment: 0, cssComment: 0, ...opt };
  const names = ['index', ...PROBE_PAGES.slice(0, n - 1)];
  const label = (nm) => (nm === 'index' ? 'Home' : nm[0].toUpperCase() + nm.slice(1));
  const files = {};
  names.forEach((nm, i) => {
    const page = `${nm}.html`;
    const nav = names
      .filter((t) => !(o.drop.includes(t) && t !== nm))
      .map((t) => {
        const h = o.href(page, label(t), `${t}.html`);
        return h === null ? '' : `<a href="${h}"${t === nm ? ' aria-current="page"' : ''}>${label(t)}</a>`;
      })
      .join('\n');
    const words = ['calm', 'local', 'friendly', 'quick', 'careful', 'open', 'trusted', 'modern', 'gentle', 'steady'];
    const comment = o.padComment ? `<!-- ${'page notes '.repeat(Math.ceil(o.padComment / 11)).slice(0, o.padComment)} -->\n` : '';
    files[page] = doc({
      title: `${label(nm)} — Harbor Clinic`,
      css: 'style.css',
      body: `${comment}<header><div class="bar"><strong>Harbor Clinic</strong><nav aria-label="Main">${nav}</nav></div></header>
<main class="${o.brokenLayout === nm ? 'broken' : ''}"><h1>${label(nm)}</h1><p>Our ${label(nm).toLowerCase()} page. A ${words[i % 10]} family practice on the harbour since 1998, page ${i + 1}.</p>
<div class="cards"><section class="card"><h2>${label(nm)} one</h2><p>Details about ${nm} item one for patients.</p></section><section class="card"><h2>${label(nm)} two</h2><p>Details about ${nm} item two for patients.</p></section><section class="card"><h2>${label(nm)} three</h2><p>Details about ${nm} item three for patients.</p></section></div></main>
<footer><p>Harbor Clinic · 2 Pier Road</p></footer>`,
    });
  });
  const cssComment = o.cssComment ? `/* ${'style notes '.repeat(Math.ceil(o.cssComment / 12)).slice(0, o.cssComment)} */\n` : '';
  files['style.css'] = `${cssComment}body{margin:0;font-family:Arial,sans-serif;color:#1e293b;background:#f8fafc}
header{background:#0c4a6e;color:#fff}.bar{max-width:1040px;margin:0 auto;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}
nav{display:flex;gap:14px;flex-wrap:wrap}nav a{color:#fff;text-decoration:none}
main{display:block;max-width:1040px;margin:0 auto;padding:32px 24px}h1{font-size:40px;margin:0 0 8px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:24px}.card{background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:18px}
footer{text-align:center;color:#475569;padding:24px}
main.broken{max-width:300px;margin:0;padding:4px}main.broken h1{font-size:14px}main.broken .cards{display:block}main.broken .card{margin:-30px 0 0 120px;width:520px}
`;
  return files;
}

/* ------------------------------------------------------------------ */
/* Build everything.                                                   */
/* ------------------------------------------------------------------ */
rmSync(CASES, { recursive: true, force: true });
rmSync(PROBES, { recursive: true, force: true });
const put = (goal, name, files) => save(join(CASES, goal, name === 'goal' ? 'goal' : join('attempts', name)), files);
const putProbe = (set, name, files) => save(join(PROBES, set, name === 'goal' ? 'goal' : join('attempts', name)), files);

// Restaurant
put('restaurant', 'goal', restaurant());
put('restaurant', 'r1-excellent', restaurant({ p: 'oe-', heroText: 'A small dining room on the harbour, cooking over oak and olive wood: seasonal plates, natural wines and a long table for friends.' }));
put('restaurant', 'r2-good-slips', restaurant({
  p: 'k-', pal: { ...R_PAL, brand: '#3a4a35' }, footerHours: false, hoursRows: 6,
  dishes: { ...R_DISHES, Desserts: R_DISHES.Desserts.slice(0, 3) },
}));
put('restaurant', 'r3-mediocre', restaurant({
  p: 'x-', font: 'Arial, Helvetica, sans-serif', pal: { bg: '#ffffff', ink: '#222222', brand: '#55624f', accent: '#c46b3c', cream: '#ffffff' },
  navStack: true, sections: ['Starters', 'Mains'], map: false, hours: false, form: 'partial', footer: false,
}));
put('restaurant', 'r4-poor', restaurant({
  p: 'y-', pages: ['index.html', 'menu.html'], sections: ['Mains'], font: 'Verdana, sans-serif',
  pal: { bg: '#eef4fb', ink: '#10233a', brand: '#1d4e89', accent: '#2a7de1', cream: '#ffffff' }, footer: false,
}));
put('restaurant', 'r5-form-lost', restaurant({ p: 'f-', form: 'none' }));
put('restaurant', 'r6-css-3x', restaurant({ p: 'b-', extraCss: unusedCss(6600, 'b') }));
put('restaurant', 'r7-pretty-poor-engineering', restaurant({ p: 's-', sloppy: true }));
put('restaurant', 'r8-plain-good-engineering', restaurant({ p: 'q-', plain: true }));
// Cheat: home right, every inner link goes to one catch-all page holding all the content.
{
  const full = restaurant({ p: 'z-' });
  const catchAll = restaurant({ p: 'z-', href: (page, label, h) => (h === 'index.html' ? h : 'info.html') });
  const strip = (html) => html.split('<main>')[1].split('</main>')[0];
  const info = catchAll['index.html'].replace(/<main>[\s\S]*<\/main>/, `<main>${strip(catchAll['menu.html'])}${strip(catchAll['reservations.html'])}${strip(catchAll['find-us.html'])}</main>`).replace(/<title>.*<\/title>/, '<title>Info — Olive &amp; Ember</title>');
  put('restaurant', 'x4-cheat-catch-all', { 'index.html': catchAll['index.html'], 'info.html': info, 'style.css': full['style.css'] });
}
// Cheat-ish: navigation built from form buttons (works in a browser without JavaScript, poor practice).
{
  const site = restaurant({ p: 'w-' });
  for (const k of Object.keys(site)) {
    if (!k.endsWith('.html')) continue;
    site[k] = site[k].replace(/<a href="([^"]+)"([^>]*)>([^<]+)<\/a>/g, (m, h, attrs, label) => `<form action="${h}" method="get" class="w-go"><button type="submit"${attrs}>${label}</button></form>`);
  }
  site['style.css'] += '.w-go{display:inline;margin:0}.w-go button{font:inherit;background:none;border:0;color:inherit;padding:0;cursor:pointer;text-decoration:underline}.w-nav .w-go button,.w-brand{ text-decoration:none}\n';
  put('restaurant', 'x5-form-button-nav', site);
}

// Portfolio
put('portfolio', 'goal', portfolio());
put('portfolio', 'p1-excellent', portfolio({ p: 'mq-' }));
// Inner pages use links written as if every page were at the top level (the CSS path is right).
put('portfolio', 'p2-inner-nav-wrong', portfolio({ p: 'n-', href: (page, label, h, target) => target }));
put('portfolio', 'p3-content-swapped', portfolio({ p: 'sw-', swap: true }));
put('portfolio', 'p4-crumbs-footer-wrong', portfolio({
  p: 'cf-',
  href: (page, label, h, target, cls) => {
    if (label === 'Email me') return 'contact';
    if (cls === 'cf-crumb' && label === 'Home') return 'index.html';
    if (cls === 'cf-crumb' && label === 'Blog') return '../../index.html';
    return h;
  },
}));
put('portfolio', 'p5-good-slips', portfolio({ p: 'gs-', pal: { ...P_PAL, accent: '#b45309' }, skills: false, prevNext: (i, kind) => !(i === 2 && kind === 'older') }));
put('portfolio', 'p6-mediocre', portfolio({
  p: 'md-', postDir: 'blog/', font: "Georgia, serif", headerDark: true, projects: 2, thumbs: false, contactMessage: false,
  pal: { accent: '#2563eb', ink: '#111827', soft: '#eef2ff', line: '#d1d5db' },
}));
put('portfolio', 'p7-poor', portfolio({ p: 'pr-', built: ['index.html', 'blog/index.html'], projects: 1, font: 'Arial, sans-serif', pal: { accent: '#6b21a8', ink: '#000', soft: '#fff', line: '#ccc' } }));
put('portfolio', 'p8-orphan-post', portfolio({ p: 'op-', homePosts: [0, 1], blogPosts: [0, 1], prevNext: (i, kind) => !(i === 1 && kind === 'newer') && !(i === 2 && kind === 'older') }));
// Cheat: the home page copied under every file name.
{
  const site = portfolio({ p: 'cl-' });
  const home = site['index.html'];
  const out = { 'style.css': site['style.css'] };
  for (const k of Object.keys(site)) if (k.endsWith('.html')) {
    const d = k.split('/').length - 1;
    out[k] = d === 0 ? home : home.replace(/href="(?!https?:)([^"]+)"/g, (m, h) => `href="${'../'.repeat(d)}${h}"`);
  }
  put('portfolio', 'x2-cheat-home-cloned', out);
}
// Cheat-ish: the main menu is an image map (real links, works for a visitor, menu drawn as an image).
{
  const site = portfolio({ p: 'im-' });
  const labels = ['Home', 'Projects', 'Blog', 'About', 'Contact'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="30"><g font-family="Segoe UI, Arial" font-size="16" fill="#1f2933">${labels.map((l, i) => `<text x="${i * 84 + 4}" y="20">${l}</text>`).join('')}</g></svg>`;
  const src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  for (const k of Object.keys(site)) {
    if (!k.endsWith('.html')) continue;
    site[k] = site[k].replace(/<nav aria-label="Main">([\s\S]*?)<\/nav>/, (m, inner) => {
      const hrefs = [...inner.matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
      return `<nav aria-label="Main"><img src="${src}" width="420" height="30" usemap="#menu" alt="Site menu"><map name="menu">${labels.map((l, i) => `<area shape="rect" coords="${i * 84},0,${i * 84 + 80},30" href="${hrefs[i]}" alt="${l}">`).join('')}</map></nav>`;
    });
  }
  put('portfolio', 'x6-image-map-nav', site);
}
// Cheat: thin pages with the goal's full text hidden on each one.
{
  const goal = portfolio();
  const thin = portfolio({ p: 'hw-', built: null });
  const out = { 'style.css': thin['style.css'] + '.hw-seo{position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}\n' };
  for (const k of Object.keys(thin)) {
    if (!k.endsWith('.html')) continue;
    const goalText = goal[k].split('<main class="m-wrap">')[1].split('</main>')[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    out[k] = thin[k].replace(/<main class="hw-wrap">([\s\S]*?)<\/main>/, (m, inner) => {
      const h1 = (inner.match(/<h1>[\s\S]*?<\/h1>/) || ['<h1>Page</h1>'])[0];
      return `<main class="hw-wrap">${h1}<p>Coming soon.</p><div class="hw-seo">${goalText}</div></main>`;
    });
  }
  put('portfolio', 'x8-cheat-hidden-words', out);
}

// Conference
put('conference', 'goal', conference());
put('conference', 'c1-excellent', conference({ p: 'fw-' }));
put('conference', 'c2-good-slips', conference({ p: 'g-', talkOverride: { 'dev-patel': 'Research in local government' }, scheduleRows: 7, ticketsForm: 'partial' }));
put('conference', 'c3-mediocre', conference({ p: 'md-', speakerBody: 'thin', scheduleTable: false, faqCount: 3, pal: { ...C_PAL, accent: '#7c3aed', soft: '#f5f3ff', line: '#e4e0f5' } }));
put('conference', 'c4-poor', conference({ p: 'po-', speakerPages: false, cardLinks: false, ticketsForm: 'none', faq: false, scheduleRows: 4, font: 'Georgia, serif' }));
put('conference', 'c5-inline-css-every-page', conference({ p: 'il-', inlineCss: true }));
// speakerPageOverride returning undefined means "use the normal page": patch that up after the fact.
{
  const dir = join(CASES, 'conference', 'attempts', 'c6-one-speaker-missing');
  rmSync(dir, { recursive: true, force: true });
  const site = conference({ p: 'ms-' });
  delete site['speakers/emi-sato.html'];
  save(dir, site);
}
put('conference', 'c7-wrong-theme', conference({ p: 'dk-', pal: { bg: '#0b1020', ink: '#e5e7eb', accent: '#f472b6', soft: '#1e1b4b', line: '#334155', head: '#111827' } }));
put('conference', 'x1-cheat-tiny-links', conference({ p: 'tn-', hideNav: true, cardLinks: false, tinyNav: true }));
put('conference', 'x3-cheat-stubs', conference({ p: 'st-', stub: true }));
{
  const site = conference({ p: 'mr-' });
  for (const s of SPEAKERS)
    site[`speakers/${s[0]}.html`] = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=../speakers.html"><title>${s[1]} — Fieldwork 2027</title></head><body></body></html>\n`;
  put('conference', 'x7-cheat-meta-refresh', site);
}

// Probes: one fault in a 3-page and a 10-page site.
for (const n of [3, 10]) {
  const set = `probe-${n}`;
  putProbe(set, 'goal', probe(n));
  putProbe(set, 'dead-menu-link', probe(n, { href: (page, label, h) => (page === 'index.html' && h === 'services.html' ? 'servics.html' : h) }));
  putProbe(set, 'unreachable-page', probe(n, { drop: ['services'] }));
  putProbe(set, 'broken-layout', probe(n, { brokenLayout: 'services' }));
}
// Dead links counted: k links broken on the home page only (pages stay reachable), and k menu items broken on every page.
for (const k of [1, 2, 4, 8]) {
  const targets = PROBE_PAGES.slice(0, k).map((t) => `${t}.html`);
  putProbe('probe-10', `dead-home-${k}`, probe(10, { href: (page, label, h) => (page === 'index.html' && targets.includes(h) ? `x-${h}` : h) }));
  putProbe('probe-10', `dead-everywhere-${k}`, probe(10, { href: (page, label, h) => (targets.includes(h) ? `x-${h}` : h) }));
}
// Size: a goal padded with comments, and the same site with the padding cut to reach 90%, 70%, 50% of its size.
{
  const goal = probe(10, { padComment: 1200, cssComment: 4000 });
  const size = (f) => Object.values(f).reduce((s, t) => s + Buffer.byteLength(t), 0);
  const total = size(goal);
  putProbe('probe-size', 'goal', goal);
  const bare = size(probe(10));
  for (const pct of [90, 70, 50]) {
    // Remove comment padding evenly until the site is pct% of the goal.
    const want = total * pct / 100;
    const share = Math.max(0, (want - bare) / (total - bare));
    const site = probe(10, { padComment: Math.round(1200 * share), cssComment: Math.round(4000 * share) });
    putProbe('probe-size', `smaller-${100 - pct}pct`, site);
    console.log(`size probe ${pct}%: ${size(site)} of ${total} (${(size(site) / total * 100).toFixed(1)}%)`);
  }
  console.log(`size probe: bare site ${bare} bytes (${(bare / total * 100).toFixed(1)}%)`);
}
console.log('generated');
