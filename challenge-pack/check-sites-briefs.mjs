// Checks challenge-pack/sites/challenges.json after the brief rewrite. Plain Node: node challenge-pack/check-sites-briefs.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sitesDir = path.join(here, 'sites');
const errors = [];
const fail = (slug, msg) => errors.push(`${slug}: ${msg}`);

// Real site text that contains a banned word; allowed exactly as written.
const ALLOWED = {
  'portfolio-site': [
    'A grid is a promise to the reader about where things will be. Three grids I keep reusing and why the twelve-column one is rarely right.',
    'grid-notes.html'
  ]
};
const BANNED = /\b(sidebar|hero|cards?|grid|columns?)\b/i;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const KINDS = new Set(['content', 'structure', 'behaviour', 'style', 'engineering']);

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', mdash: '—', ndash: '–', middot: '·', rsquo: '’', lsquo: '‘', pound: '£', deg: '°', larr: '←', rarr: '→', hellip: '…', eacute: 'é', egrave: 'è', icirc: 'î', iacute: 'í', times: '×' };
const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
const visibleText = html => decode(html
  .replace(/<head[\s\S]*?<\/head>/i, ' ')
  .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const norm = s => s.replace(/\s+/g, ' ');
const stripAllowed = (slug, text) => (ALLOWED[slug] || []).reduce((t, p) => t.split(p).join(' '), text);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

let data;
try { data = JSON.parse(fs.readFileSync(path.join(sitesDir, 'challenges.json'), 'utf8')); }
catch (e) { console.log('FAIL: challenges.json does not parse: ' + e.message); process.exit(1); }
const list = data.challenges;
if (!Array.isArray(list) || list.length !== 6) fail('all', `expected 6 challenges, found ${list && list.length}`);
if (new Set(list.map(c => c.slug)).size !== list.length) fail('all', 'slugs are not unique');

const lengths = [];
for (const c of list) {
  const s = c.slug;
  // brief
  const b = c.brief || '';
  if (b.length < 400 || b.length > 1100) fail(s, `brief is ${b.length} chars`);
  if (!/reference/i.test(b)) fail(s, 'brief does not mention the reference');
  if (/\d\s*px\b|\bpx\b/i.test(b)) fail(s, 'brief mentions px');
  if (HEX.test(b)) fail(s, 'brief has a hex colour');
  if (BANNED.test(stripAllowed(s, b))) fail(s, `brief uses banned word "${stripAllowed(s, b).match(BANNED)[0]}"`);
  // acceptance
  if (!Array.isArray(c.acceptance) || c.acceptance.length < 4 || c.acceptance.length > 6) fail(s, `acceptance has ${c.acceptance && c.acceptance.length} statements`);
  // content
  const content = c.content || '';
  lengths.push(`${s} ${content.length}`);
  if (content.length < 800) fail(s, `content is only ${content.length} chars`);
  if (HEX.test(content)) fail(s, 'content has a hex colour');
  const cm = stripAllowed(s, content).match(BANNED);
  if (cm) fail(s, `content uses banned word "${cm[0]}"`);
  // pages
  const goalDir = path.join(sitesDir, 'goals', s);
  const htmlFiles = walk(goalDir).filter(f => f.endsWith('.html')).map(f => path.relative(goalDir, f).replace(/\\/g, '/'));
  const paths = (c.pages || []).map(p => p.path);
  for (const p of paths) if (!htmlFiles.includes(p)) fail(s, `page ${p} is not in the goal folder`);
  for (const f of htmlFiles) if (!paths.includes(f)) fail(s, `goal file ${f} is missing from pages`);
  const normContent = norm(content);
  for (const p of c.pages || []) {
    if (!p.title) fail(s, `${p.path} has no title`);
    const kf = p.keyFacts || [];
    if (kf.length < 5 || kf.length > 25) fail(s, `${p.path} has ${kf.length} key facts`);
    if (!htmlFiles.includes(p.path)) continue;
    const text = visibleText(fs.readFileSync(path.join(goalDir, p.path), 'utf8'));
    for (const k of kf) {
      if (!text.includes(norm(k))) fail(s, `${p.path}: key fact not on page: "${k}"`);
      if (!normContent.includes(norm(k))) fail(s, `${p.path}: key fact not in content: "${k}"`);
    }
  }
  // requirements
  const reqs = c.requirements || [];
  if (reqs.length < 8 || reqs.length > 14) fail(s, `${reqs.length} requirements`);
  if (new Set(reqs.map(r => r.id)).size !== reqs.length) fail(s, 'requirement ids are not unique');
  for (const r of reqs) {
    if (!KINDS.has(r.kind)) fail(s, `requirement ${r.id} has kind ${r.kind}`);
    if (typeof r.exact !== 'boolean' || !r.text) fail(s, `requirement ${r.id} is incomplete`);
  }
  if (c.exactSpec === undefined) fail(s, 'exactSpec missing');
  if ('spec' in c || 'maxPromptChars' in c) fail(s, 'old spec or maxPromptChars still present');
  if (c.category !== 'Multi-page sites') fail(s, 'category missing');
}

console.log('Content lengths: ' + lengths.join(', '));
console.log('Allowed exceptions: ' + JSON.stringify(ALLOWED));
if (errors.length) { console.log(errors.join('\n')); console.log(`FAIL: ${errors.length} problems in ${list.length} sites`); process.exit(1); }
console.log(`PASS: ${list.length} sites, all checks passed`);
