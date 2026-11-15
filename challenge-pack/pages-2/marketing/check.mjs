// Checks the marketing and content challenge pack. Plain Node, no dependencies.
// Run from anywhere: node challenge-pack/pages-2/marketing/check.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const COUNT = 8;
const KINDS = ['content', 'structure', 'behaviour', 'style', 'engineering'];
const LIVE = ['login-card', 'footer-columns', 'nav-hero', 'blog-header', 'pricing-plans', 'product-grid'];
try {
  const first = JSON.parse(readFileSync(join(here, '..', '..', 'pages', 'challenges.json'), 'utf8'));
  for (const c of first.challenges ?? []) LIVE.push(c.slug);
} catch { /* first pack missing: only the live list is checked */ }
const problems = [];
const fail = (msg) => problems.push(msg);

let data;
try {
  data = JSON.parse(readFileSync(join(here, 'challenges.json'), 'utf8'));
} catch (e) {
  console.log('FAIL challenges.json does not parse: ' + e.message);
  process.exit(1);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', pound: '£', middot: '·' };
function pageText(html) {
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  return body
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ');
}

const list = data.challenges;
if (!Array.isArray(list) || list.length !== COUNT) fail(`expected ${COUNT} challenges, found ${list?.length}`);

const seen = new Set();
for (const c of list ?? []) {
  const s = c.slug;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s ?? '')) fail(`bad slug: ${s}`);
  if (seen.has(s)) fail(`duplicate slug: ${s}`);
  seen.add(s);
  if (LIVE.includes(s)) fail(`slug already used: ${s}`);
  if (![1, 2, 3].includes(c.level)) fail(`${s}: level must be 1, 2 or 3`);
  if (!c.title || !c.category) fail(`${s}: missing title or category`);
  if ('spec' in c) fail(`${s}: old spec key still present`);

  const brief = c.brief ?? '';
  if (brief.length < 300) fail(`${s}: brief is under 300 characters (${brief.length})`);
  if (/px/i.test(brief)) fail(`${s}: brief mentions px`);
  if ((brief.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length > 2) fail(`${s}: brief has more than two hex codes`);

  const reqs = c.requirements ?? [];
  if (!Array.isArray(reqs) || reqs.length < 6 || reqs.length > 12) fail(`${s}: needs 6 to 12 requirements, has ${reqs.length}`);
  const ids = new Set();
  for (const r of reqs) {
    if (!r.id || ids.has(r.id)) fail(`${s}: missing or duplicate requirement id ${r.id}`);
    ids.add(r.id);
    if (!r.text) fail(`${s}: requirement ${r.id} has no text`);
    if (!KINDS.includes(r.kind)) fail(`${s}: requirement ${r.id} has bad kind ${r.kind}`);
    if (typeof r.exact !== 'boolean') fail(`${s}: requirement ${r.id} exact is not true or false`);
  }
  if (!Array.isArray(c.designNotes) || c.designNotes.length < 3 || c.designNotes.length > 5) fail(`${s}: needs 3 to 5 design notes`);

  const file = join(here, 'goals', `${s}.html`);
  if (!existsSync(file)) { fail(`${s}: goal file missing`); continue; }
  if (statSync(file).size >= 300 * 1024) fail(`${s}: goal is 300 KB or more`);
  const html = readFileSync(file, 'utf8');
  const lower = html.toLowerCase();
  if (lower.includes('<script')) fail(`${s}: goal has a <script`);
  if (lower.includes('@import')) fail(`${s}: goal has an @import`);
  if (/\son[a-z]+\s*=/i.test(html)) fail(`${s}: goal has an event attribute`);
  if (/\sstyle\s*=/i.test(html)) fail(`${s}: goal has a style attribute`);
  if (/(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html) || /url\(/i.test(html)) fail(`${s}: goal loads an external resource`);
  if (/href\s*=\s*["'](?!#)[^"']+["']/i.test(html)) fail(`${s}: goal links to a file`);
  if ((lower.match(/<style/g) ?? []).length !== 1) fail(`${s}: goal needs exactly one <style>`);

  const text = pageText(html);
  if (!Array.isArray(c.keyFacts) || c.keyFacts.length === 0) fail(`${s}: no keyFacts`);
  for (const k of c.keyFacts ?? []) if (!text.includes(k)) fail(`${s}: key fact not in goal text: ${k}`);
}

if (problems.length) {
  for (const p of problems) console.log('FAIL ' + p);
  console.log(`${problems.length} problem(s)`);
  process.exit(1);
}
const byLevel = [1, 2, 3].map((l) => list.filter((c) => c.level === l).length);
console.log(`OK ${COUNT} challenges (levels 1/2/3: ${byLevel.join('/')}), all goal files pass, all briefs, requirements and key facts check out`);
