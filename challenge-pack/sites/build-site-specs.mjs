// Builds challenge-pack/sites/challenges.json from the goal folders and site-meta.json. Uses parse5 from grader/node_modules.
// Run: node challenge-pack/sites/build-site-specs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(ROOT + '/grader/package.json');
const { parse } = await import('file:///' + require.resolve('parse5').replace(/\\/g, '/'));
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'challenge-pack/sites/site-meta.json'), 'utf8'));
const GOALS = ROOT + '/challenge-pack/sites/goals';

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const attr = (n, k) => (n.attrs || []).find((a) => a.name === k)?.value;
const kids = (n) => (n.tagName === 'template' ? n.content.childNodes : n.childNodes) || [];
function text(n) {
  if (n.nodeName === '#text') return n.value;
  if (n.tagName === 'br') return ' / ';
  if (n.tagName === 'img' || n.tagName === 'svg' || n.tagName === 'input' || n.tagName === 'select' || n.tagName === 'textarea') return ' ';
  if (['span', 'strong', 'em', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'div', 'code', 'time', 'b', 'i', 'a', 'button', 'label', 'td', 'th', 'dt', 'dd'].includes(n.tagName)) return ' ' + kids(n).map(text).join('') + ' ';
  if (n.tagName === 'small') return ' [small: ' + kids(n).map(text).join('').trim() + '] ';
  return kids(n).map(text).join('');
}
const T = (n) => norm(text(n)).replace(/\s+\)/g, ')').replace(/\(\s+/g, '(');
function walk(n, f) { f(n); for (const c of kids(n)) walk(c, f); }
function find(n, pred) { const out = []; walk(n, (x) => { if (x.tagName && pred(x)) out.push(x); }); return out; }
const tagLabel = (n) => n.tagName + (attr(n, 'class') ? '.' + attr(n, 'class').trim().split(/\s+/).join('.') : '');

function listFiles(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(path.join(dir, e.name), base + e.name + '/') : [base + e.name]);
}
const resolve = (page, href) => {
  if (!href || /^(#|mailto:|tel:|https?:)/.test(href)) return href;
  return path.posix.normalize(path.posix.join(path.posix.dirname(page), href.split('#')[0])) + (href.includes('#') ? '#' + href.split('#')[1] : '');
};
const isNavLike = (n) => n.tagName === 'nav' || /(^|\s)nav(\s|$)/.test(attr(n, 'class') || '');

function navDesc(n, page) {
  const parts = [];
  for (const c of kids(n)) {
    if (c.nodeName === '#text') { const v = norm(c.value); if (v) parts.push('text "' + v + '"'); }
    else if (c.tagName === 'a') parts.push('"' + T(c) + '" -> ' + resolve(page, attr(c, 'href')) + (attr(c, 'class') && !/^(on|active|current)$/.test(attr(c, 'class')) ? ' (class ' + attr(c, 'class').replace(/(on|active|current)/, '').trim() + ')' : ''));
    else if (c.tagName === 'form') parts.push('[' + formSummary(c, page) + ']');
    else if (c.tagName === 'img') parts.push('img alt "' + (attr(c, 'alt') || '') + '"');
    else if (!find(c, (x) => x.tagName === 'a' || x.tagName === 'form').length) { const v = T(c); if (v) parts.push(tagLabel(c) + ' "' + v + '"'); }
    else parts.push(navDesc(c, page));
  }
  return parts.filter(Boolean).join('; ');
}
function svgSummary(n) {
  const shapes = find(n, (x) => ['rect', 'circle', 'ellipse', 'path', 'line', 'polygon', 'polyline', 'text'].includes(x.tagName)).map((s) =>
    s.tagName + ' ' + (s.attrs || []).map((a) => a.name + '=' + a.value).join(' ') + (s.tagName === 'text' ? ' "' + T(s) + '"' : ''));
  const head = ['viewBox', 'width', 'height', 'role', 'aria-label'].filter((k) => attr(n, k)).map((k) => k + ' "' + attr(n, k) + '"').join(', ');
  return 'inline SVG, ' + head + '. Shapes in order: ' + shapes.join('; ');
}
function formSummary(f, page) {
  const parts = [];
  const a = ['action', 'method'].filter((k) => attr(f, k)).map((k) => k + ' "' + (k === 'action' ? resolve(page, attr(f, k)) : attr(f, k)) + '"');
  if (a.length) parts.push('form ' + a.join(', '));
  walk(f, (x) => {
    if (x.tagName === 'label') {
      const ctl = find(x, (y) => ['input', 'select', 'textarea'].includes(y.tagName))[0];
      const lt = norm(kids(x).filter((c) => !c.tagName || !['select', 'textarea'].includes(c.tagName)).map(text).join(''));
      parts.push('label "' + lt + '"' + (ctl ? ' wrapping ' + ctlDesc(ctl) : attr(x, 'for') ? ' for #' + attr(x, 'for') : ''));
    } else if (['input', 'select', 'textarea'].includes(x.tagName)) {
      if (!find(f, (l) => l.tagName === 'label' && find(l, (y) => y === x).length).length) parts.push(ctlDesc(x));
    } else if (x.tagName === 'button') parts.push('button "' + T(x) + '"' + (attr(x, 'type') ? ' type ' + attr(x, 'type') : ''));
    else if (x.tagName === 'legend') parts.push('legend "' + T(x) + '"');
  });
  return parts.join('; ');
}
function ctlDesc(c) {
  const skip = new Set(['class', 'style']);
  let d = c.tagName + ' ' + (c.attrs || []).filter((a) => !skip.has(a.name)).map((a) => (a.value === '' ? a.name : a.name + '="' + a.value + '"')).join(' ');
  if (c.tagName === 'select') d += ' options: ' + find(c, (o) => o.tagName === 'option').map(T).join(', ');
  return d.trim();
}
function tableSummary(t) {
  const rows = find(t, (x) => x.tagName === 'tr').map((r) => kids(r).filter((c) => c.tagName === 'th' || c.tagName === 'td').map((c) => (c.tagName === 'th' ? '[th] ' : '') + T(c)).join(' | '));
  const cap = find(t, (x) => x.tagName === 'caption')[0];
  return (cap ? 'caption "' + T(cap) + '"; ' : '') + 'rows: ' + rows.join(' || ');
}
const linkStr = (a, page) => '"' + T(a) + '" -> ' + resolve(page, attr(a, 'href')) + (attr(a, 'class') ? ' (class ' + attr(a, 'class') + ')' : '');

const BLOCK = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'dl', 'table', 'form', 'svg', 'img', 'address', 'blockquote', 'pre', 'figure', 'a', 'button', 'hr']);
const CONTAINER = new Set(['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'figure', 'span', 'time', 'small', 'strong', 'em']);
function emit(n, page, out, pre = '') {
  const t = n.tagName, L = pre + tagLabel(n);
  if (/^h[1-6]$/.test(t) || t === 'p' || t === 'address' || t === 'blockquote' || t === 'pre') {
    const links = find(n, (x) => x.tagName === 'a').map((a) => linkStr(a, page));
    out.push({ label: L, value: T(n) + (links.length ? ' [links: ' + links.join('; ') + ']' : '') });
  } else if (t === 'ul' || t === 'ol') {
    const items = kids(n).filter((c) => c.tagName === 'li').map((li) => {
      const links = find(li, (x) => x.tagName === 'a').map((a) => '-> ' + resolve(page, attr(a, 'href')));
      return T(li) + (links.length ? ' ' + links.join(' ') : '');
    });
    out.push({ label: L + ' (' + items.length + ' items)', value: items.join(' || ') });
  } else if (t === 'dl') out.push({ label: L, value: kids(n).filter((c) => c.tagName).map((c) => c.tagName + ': ' + T(c)).join('; ') });
  else if (t === 'table') out.push({ label: L, value: tableSummary(n) });
  else if (t === 'form') out.push({ label: L, value: formSummary(n, page) });
  else if (t === 'svg') out.push({ label: L, value: svgSummary(n) });
  else if (t === 'img') out.push({ label: L, value: 'src ' + attr(n, 'src') + ', alt "' + (attr(n, 'alt') ?? '') + '"' });
  else if (t === 'a' && find(n, (x) => x !== n && ['svg', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong'].includes(x.tagName)).length) {
    out.push({ label: L.replace(/^(.*)a(.|$)/, '$1a$2'), value: 'a link to ' + resolve(page, attr(n, 'href')) + (attr(n, 'class') ? ' (class ' + attr(n, 'class') + ')' : '') + ' containing the next items' });
    for (const c of kids(n)) if (c.tagName) emit(c, page, out, L + ' > ');
  }
  else if (t === 'a') out.push({ label: pre + 'a' + (attr(n, 'class') ? '.' + attr(n, 'class') : ''), value: linkStr(n, page) });
  else if (t === 'button') out.push({ label: L, value: T(n) });
  else if (t === 'hr') out.push({ label: pre + 'hr', value: 'horizontal rule' });
  else if (isNavLike(n)) out.push({ label: L + ' (see Navigation)', value: 'the ' + (attr(n, 'aria-label') ? '"' + attr(n, 'aria-label') + '" ' : '') + 'nav sits here; its contents are under Navigation' });
  else if (t === 'input' || t === 'select' || t === 'textarea' || t === 'label') out.push({ label: pre + t, value: ctlDesc(n) });
  else {
    const hasBlock = find(n, (x) => x !== n && (BLOCK.has(x.tagName) || ['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav'].includes(x.tagName)));
    if (!hasBlock.length) { const s = T(n); if (s) out.push({ label: L, value: s }); return; }
    const cls = attr(n, 'class');
    const compact = cls && T(n).length <= 420 && !find(n, (x) => ['table', 'form', 'svg', 'ul', 'ol', 'nav'].includes(x.tagName)).length;
    if (compact) {
      const sub = []; for (const c of kids(n)) child(c, page, sub);
      out.push({ label: L, value: sub.map((s) => s.label + ': ' + s.value).join(' | ') });
      return;
    }
    const np = (cls || ['header', 'main', 'footer', 'section', 'article', 'aside'].includes(t)) ? pre + tagLabel(n) + ' > ' : pre;
    for (const c of kids(n)) child(c, page, out, np);
  }
}
function child(c, page, out, pre = '') {
  if (c.nodeName === '#text') { const s = norm(c.value); if (s) out.push({ label: pre + 'text', value: s }); }
  else if (c.tagName) emit(c, page, out, pre);
}

const sites = [];
for (const [slug, meta] of Object.entries(META)) {
  const dir = GOALS + '/' + slug;
  const files = listFiles(dir).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : 0));
  const pages = meta.order.filter((p) => files.includes(p));
  const missing = files.filter((f) => f.endsWith('.html') && !pages.includes(f));
  if (missing.length) throw new Error(slug + ' pages missing from order: ' + missing);
  const docs = Object.fromEntries(pages.map((p) => [p, parse(fs.readFileSync(dir + '/' + p, 'utf8'))]));
  const css = files.filter((f) => f.endsWith('.css'));
  const sheetUse = css.map((c) => c + ' (linked from ' + (pages.every((p) => find(docs[p], (x) => x.tagName === 'link' && resolve(p, attr(x, 'href')) === c).length) ? 'every page' : pages.filter((p) => find(docs[p], (x) => x.tagName === 'link' && resolve(p, attr(x, 'href')) === c).length).join(', ')) + ')');
  const spec = [];
  spec.push({ group: 'Site', items: [
    { label: 'What it is', value: meta.what },
    { label: 'Files (' + files.length + ')', value: files.join(', ') },
    { label: 'Home page', value: 'index.html' },
    { label: 'Shared stylesheets', value: sheetUse.join('; ') },
    { label: 'Page order below', value: pages.join(', ') },
  ] });
  // Navigation: group nav-like elements by label + resolved links, ignoring the current-page marker.
  const navs = new Map();
  for (const p of pages) {
    for (const n of find(docs[p], isNavLike)) {
      const links = find(n, (x) => x.tagName === 'a');
      const desc = navDesc(n, p);
      const key = tagLabel(n) + (attr(n, 'aria-label') || '') + '|' + desc;
      if (!navs.has(key)) navs.set(key, { name: tagLabel(n) + (attr(n, 'aria-label') ? ' aria-label "' + attr(n, 'aria-label') + '"' : ''), desc, pages: [], current: new Set() });
      const e = navs.get(key); e.pages.push(p);
      for (const a of links) {
        if (attr(a, 'aria-current')) e.current.add('aria-current="' + attr(a, 'aria-current') + '"');
        if (/(^|\s)(on|active|current)(\s|$)/.test(attr(a, 'class') || '')) e.current.add('class "' + attr(a, 'class') + '"');
      }
    }
  }
  const navItems = [{ label: 'Link paths', value: 'Targets below are paths from the site root; each page links to them relative to its own folder (for example ../index.html from a page one folder down).' }];
  for (const e of navs.values()) {
    navItems.push({ label: e.name + ' on ' + (e.pages.length === pages.length ? 'every page' : e.pages.join(', ')),
      value: (e.desc || '(empty)') + (e.current.size ? '. The current page link is marked with ' + [...e.current].join(' or ') : '') });
  }
  spec.push({ group: 'Navigation', items: navItems });
  const perPage = {};
  for (const p of pages) {
    const d = docs[p];
    const items = [{ label: 'Title', value: T(find(d, (x) => x.tagName === 'title')[0]) }];
    const body = find(d, (x) => x.tagName === 'body')[0];
    const out = []; for (const c of kids(body)) child(c, p, out);
    items.push(...out);
    perPage[p] = items;
  }
  const key = (i) => i.label + '=' + i.value;
  const shared = pages.length > 1 ? perPage[pages[0]].filter((i) => i.label !== 'Title' && pages.every((p) => perPage[p].some((j) => key(j) === key(i)))) : [];
  const sk = new Set(shared.map(key));
  if (shared.length) spec.push({ group: 'On every page', items: [{ label: 'Note', value: 'These parts are identical on every page (header before the page content, footer after it), so they are listed once here and left out of the page groups below' }, ...shared] });
  for (const p of pages) spec.push({ group: 'Page ' + p, items: perPage[p].filter((i) => !sk.has(key(i))) });
  spec.push({ group: 'Style', items: css.flatMap((c) => {
    const src = fs.readFileSync(dir + '/' + c, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = []; const re = /([^{}]+)\{([^{}]*)\}/g; let m;
    while ((m = re.exec(src))) rules.push({ label: c + ': ' + norm(m[1]), value: norm(m[2]).replace(/;\s*$/, '').replace(/;\s*/g, '; ') });
    if (/@media/.test(src)) rules.push({ label: c + ': note', value: 'contains @media rules; see the rules above whose selectors appear inside them' });
    return rules;
  }) });
  const all = Object.values(docs);
  const count = (pred) => all.filter(pred).length;
  const has = (tag) => count((d) => find(d, (x) => x.tagName === tag).length);
  const eng = [
    { label: 'Stylesheets', value: 'All styling lives in ' + css.join(' and ') + '; pages have ' + (count((d) => find(d, (x) => x.tagName === 'style' || attr(x, 'style')).length) ? 'some inline styles' : 'no <style> blocks and no style attributes') },
    { label: 'Language', value: 'lang="' + attr(find(all[0], (x) => x.tagName === 'html')[0], 'lang') + '" on the html element of ' + count((d) => attr(find(d, (x) => x.tagName === 'html')[0], 'lang')) + ' of ' + all.length + ' pages' },
    { label: 'Titles', value: 'Every page has its own <title> (listed per page above)' },
    { label: 'Landmarks', value: ['header', 'nav', 'main', 'footer'].map((t) => '<' + t + '> on ' + has(t) + ' of ' + all.length + ' pages').join(', ') },
  ];
  const labels = all.reduce((s, d) => s + find(d, (x) => x.tagName === 'label').length, 0);
  if (labels) eng.push({ label: 'Forms', value: 'Every form field is labelled with a <label> element (' + labels + ' labels in all)' + (all.some((d) => find(d, (x) => x.tagName === 'label' && /visually-hidden/.test(attr(x, 'class') || '')).length) ? '; the search label is visually hidden with class visually-hidden' : '') });
  const imgs = all.reduce((s, d) => s + find(d, (x) => x.tagName === 'img').length, 0);
  const svgs = all.reduce((s, d) => s + find(d, (x) => x.tagName === 'svg' && attr(x, 'aria-label')).length, 0);
  if (imgs) eng.push({ label: 'Images', value: imgs + ' <img> elements, ' + all.reduce((s, d) => s + find(d, (x) => x.tagName === 'img' && attr(x, 'alt')).length, 0) + ' of them with alt text' });
  if (svgs) eng.push({ label: 'Graphics', value: svgs + ' inline SVGs with role="img" and an aria-label' });
  if (all.some((d) => find(d, (x) => attr(x, 'aria-current')).length)) eng.push({ label: 'Current page', value: 'aria-current="page" on the active menu link' });
  if (all.some((d) => find(d, (x) => x.tagName === 'meta' && attr(x, 'name') === 'viewport').length)) eng.push({ label: 'Viewport meta', value: 'width=device-width, initial-scale=1 on every page' });
  spec.push({ group: 'Engineering', items: eng });
  spec.push({ group: 'Output', items: [
    { label: 'Format', value: 'Several files: the ' + pages.length + ' HTML pages and ' + css.length + ' stylesheet' + (css.length > 1 ? 's' : '') + ' at the paths listed under Site' },
    { label: 'Links', value: 'Relative links only, every link resolves to a file in the site' },
    { label: 'Scripts and assets', value: 'No JavaScript, no external files, fonts or images; graphics are inline SVG where listed' },
  ] });
  const level = pages.length <= 3 ? 1 : pages.length <= 6 ? 2 : 3;
  sites.push({ slug, kind: 'site', title: meta.title, level, brief: meta.brief, goal: 'sites/goals/' + slug, spec });
}
fs.writeFileSync(ROOT + '/challenge-pack/sites/challenges.json', JSON.stringify({ challenges: sites }, null, 2) + '\n');
for (const s of sites) console.log(s.slug, s.level, s.spec.length, 'groups', JSON.stringify(s.spec).length, 'chars');
