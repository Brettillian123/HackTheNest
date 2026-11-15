// Checks the components challenge pack. Plain Node, no dependencies.
// Run from anywhere: node challenge-pack/pages-2/components/check.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const COUNT = 8;
const LIVE = ['login-card', 'footer-columns', 'nav-hero', 'blog-header', 'pricing-plans', 'product-grid'];
// Slugs of the first pack, read from its file so the list stays current.
const firstPack = join(here, '..', '..', 'pages', 'challenges.json');
if (existsSync(firstPack)) {
  for (const c of JSON.parse(readFileSync(firstPack, 'utf8')).challenges ?? []) LIVE.push(c.slug);
}
const KINDS = ['content', 'structure', 'behaviour', 'style', 'engineering'];
const problems = [];
const fail = (msg) => problems.push(msg);

let data;
try {
  data = JSON.parse(readFileSync(join(here, 'challenges.json'), 'utf8'));
} catch (e) {
  console.log('FAIL challenges.json does not parse: ' + e.message);
  process.exit(1);
}

const textOf = (html) => html
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<title[\s\S]*?<\/title>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ');

const list = data.challenges;
if (!Array.isArray(list) || list.length !== COUNT) fail(`expected ${COUNT} challenges, found ${list?.length}`);

const seen = new Set();
for (const c of list ?? []) {
  const s = c.slug;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s ?? '')) fail(`bad slug: ${s}`);
  if (seen.has(s)) fail(`duplicate slug: ${s}`);
  seen.add(s);
  if (LIVE.includes(s)) fail(`slug already used: ${s}`);
  if (![1, 2, 3].includes(c.level)) fail(`${s}: level must be 1, 2 or 3`);
  if (!c.title) fail(`${s}: missing title`);
  if (c.category !== 'Components') fail(`${s}: category must be Components`);
  if ('spec' in c) fail(`${s}: old spec key still present`);

  const brief = c.brief ?? '';
  if (brief.length < 300) fail(`${s}: brief is ${brief.length} characters, needs 300`);
  if (/\dpx|\bpx\b/i.test(brief)) fail(`${s}: brief mentions px`);
  if ((brief.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length > 2) fail(`${s}: brief has more than two hex codes`);

  const reqs = c.requirements ?? [];
  if (!Array.isArray(reqs) || reqs.length < 6 || reqs.length > 12) fail(`${s}: needs 6 to 12 requirements, has ${reqs.length}`);
  const ids = new Set();
  for (const r of reqs) {
    if (!r.id || ids.has(r.id)) fail(`${s}: missing or duplicate requirement id ${r.id}`);
    ids.add(r.id);
    if (!r.text) fail(`${s}: requirement ${r.id} has no text`);
    if (!KINDS.includes(r.kind)) fail(`${s}: requirement ${r.id} has bad kind ${r.kind}`);
    if (typeof r.exact !== 'boolean') fail(`${s}: requirement ${r.id} exact must be true or false`);
  }
  if (!Array.isArray(c.designNotes) || c.designNotes.length < 3 || c.designNotes.length > 5) fail(`${s}: needs 3 to 5 design notes`);
  if (!Array.isArray(c.keyFacts) || c.keyFacts.length === 0) fail(`${s}: no key facts`);

  const file = join(here, 'goals', `${s}.html`);
  if (!existsSync(file)) { fail(`${s}: goal file missing`); continue; }
  if (statSync(file).size >= 300 * 1024) fail(`${s}: goal is 300 KB or more`);
  const html = readFileSync(file, 'utf8');
  const lower = html.toLowerCase();
  if (lower.includes('<script')) fail(`${s}: goal has a <script`);
  if (lower.includes('@import')) fail(`${s}: goal has an @import`);
  if (/\son[a-z]+\s*=/i.test(html)) fail(`${s}: goal has an event attribute`);
  if (/\sstyle\s*=/i.test(html)) fail(`${s}: goal has a style attribute`);
  if (lower.includes('!important')) fail(`${s}: goal uses !important`);
  if ((lower.match(/<style/g) ?? []).length !== 1) fail(`${s}: goal needs exactly one <style>`);
  if ((lower.match(/<h1[\s>]/g) ?? []).length !== 1) fail(`${s}: goal needs exactly one <h1>`);
  if (/url\(/i.test(html)) fail(`${s}: goal uses url()`);
  if (/\ssrc\s*=/i.test(html)) fail(`${s}: goal has a src attribute`);
  if (/href\s*=\s*["']?[^"'#\s>]/i.test(html)) fail(`${s}: goal links to a file or URL`);

  const text = textOf(html);
  for (const k of c.keyFacts ?? []) if (!text.includes(k)) fail(`${s}: key fact not in goal text: ${k}`);
}

if (problems.length) {
  for (const p of problems) console.log('FAIL ' + p);
  console.log(`${problems.length} problem(s)`);
  process.exit(1);
}
const byLevel = [1, 2, 3].map((l) => list.filter((c) => c.level === l).length);
console.log(`OK ${COUNT} challenges (levels 1/2/3: ${byLevel.join('/')}), all goal files pass, all briefs and requirements well formed, all key facts found in their goals`);
