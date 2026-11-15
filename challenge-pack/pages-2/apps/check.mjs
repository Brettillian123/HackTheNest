// Checks the app-screens challenge pack. Plain Node, no dependencies.
// Run from anywhere: node challenge-pack/pages-2/apps/check.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LIVE = ['login-card', 'footer-columns', 'nav-hero', 'blog-header', 'pricing-plans', 'product-grid'];
const firstPack = join(here, '..', '..', 'pages', 'challenges.json');
const USED = new Set(LIVE);
if (existsSync(firstPack)) for (const c of JSON.parse(readFileSync(firstPack, 'utf8')).challenges) USED.add(c.slug);
const KINDS = ['content', 'structure', 'behaviour', 'style', 'engineering'];
const EXPECTED = 8;
const problems = [];
const fail = (msg) => problems.push(msg);

function pageText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

let data;
try {
  data = JSON.parse(readFileSync(join(here, 'challenges.json'), 'utf8'));
} catch (e) {
  console.log('FAIL challenges.json does not parse: ' + e.message);
  process.exit(1);
}

const list = data.challenges;
if (!Array.isArray(list) || list.length !== EXPECTED) fail(`expected ${EXPECTED} challenges, found ${list?.length}`);

const seen = new Set();
for (const c of list ?? []) {
  const s = c.slug;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s ?? '')) fail(`bad slug: ${s}`);
  if (seen.has(s)) fail(`duplicate slug: ${s}`);
  seen.add(s);
  if (USED.has(s)) fail(`slug already used: ${s}`);
  if (![1, 2, 3].includes(c.level)) fail(`${s}: level must be 1, 2 or 3`);
  if (!c.title || !c.category) fail(`${s}: missing title or category`);
  if ('spec' in c) fail(`${s}: old spec key still present`);

  const brief = c.brief ?? '';
  if (brief.length < 300) fail(`${s}: brief shorter than 300 characters (${brief.length})`);
  if (/\d\s*px\b/i.test(brief)) fail(`${s}: brief mentions px`);
  if ((brief.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length > 2) fail(`${s}: brief has more than two hex codes`);

  const reqs = c.requirements ?? [];
  if (!Array.isArray(reqs) || reqs.length < 6 || reqs.length > 12) fail(`${s}: needs 6 to 12 requirements, has ${reqs.length}`);
  const ids = new Set();
  for (const r of reqs) {
    if (!r.id || ids.has(r.id)) fail(`${s}: missing or duplicate requirement id ${r.id}`);
    ids.add(r.id);
    if (!r.text) fail(`${s}: requirement ${r.id} has no text`);
    if (!KINDS.includes(r.kind)) fail(`${s}: requirement ${r.id} has bad kind ${r.kind}`);
    if (typeof r.exact !== 'boolean') fail(`${s}: requirement ${r.id} exact is not true/false`);
  }
  if (!Array.isArray(c.designNotes) || c.designNotes.length < 3 || c.designNotes.length > 5) fail(`${s}: needs 3 to 5 designNotes`);
  if (!Array.isArray(c.keyFacts) || c.keyFacts.length === 0) fail(`${s}: no keyFacts`);

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
  if ((lower.match(/<style[\s>]/g) ?? []).length !== 1) fail(`${s}: goal needs exactly one <style>`);

  const text = pageText(html);
  for (const k of c.keyFacts ?? []) if (!text.includes(k)) fail(`${s}: keyFact not in goal text: ${k}`);
}

if (problems.length) {
  for (const p of problems) console.log('FAIL ' + p);
  console.log(`${problems.length} problem(s)`);
  process.exit(1);
}
const byLevel = [1, 2, 3].map((l) => list.filter((c) => c.level === l).length);
console.log(`OK ${list.length} challenges (levels 1/2/3: ${byLevel.join('/')}), all goal files pass, briefs and requirements well formed, all keyFacts found in their goals`);
