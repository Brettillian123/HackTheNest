// Checks the `content`, `brief` and `acceptance` fields of the pages-2 marketing, apps and forms packs.
// Run: node challenge-pack/check-content-b.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const files = ['marketing', 'apps', 'forms'].map(g => join(root, 'pages-2', g, 'challenges.json'));
const BANNED = ['sidebar', 'hero', 'card', 'cards', 'grid', 'column', 'columns', 'left', 'right', 'top', 'bottom',
  'centre', 'center', 'centred', 'centered', 'px', 'bold', 'highlighted'];
const bannedRe = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'gi');
const hexRe = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/;
// Page text where a banned word is genuinely content (it is in the goal page word for word).
const CONTENT_EXCEPTIONS = {
  'feature-grid': ['get paid by card or bank transfer', 'against the right expense'],
  'faq-page': ['Your card is charged'],
  'inbox-list': ['summary panel on the right instead of below'],
  'case-study': ['left before paying'],
};
const squash = s => s.replace(/\s+/g, ' ').trim();
const words = s => s.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/).filter(Boolean);

let failures = 0, entries = 0, missesTotal = 0, briefs = 0;
const notes = [];
const fail = (slug, msg) => { failures++; console.log(`FAIL ${slug}: ${msg}`); };

for (const file of files) {
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(file, `JSON does not parse: ${e.message}`); continue; }
  for (const c of data.challenges) {
    entries++;
    const slug = c.slug;
    // content
    if (typeof c.content !== 'string' || c.content.length < 200) { fail(slug, 'content missing or under 200 characters'); continue; }
    const content = squash(c.content);
    const misses = (c.keyFacts || []).filter(k => !content.includes(squash(k)));
    if (misses.length > 3) fail(slug, `more than three key facts missing: ${JSON.stringify(misses)}`);
    else if (misses.length) { missesTotal += misses.length; notes.push(`${slug}: key facts left out ${JSON.stringify(misses)}`); }
    let scan = content;
    const exempt = [...(c.keyFacts || []), ...(CONTENT_EXCEPTIONS[slug] || [])];
    for (const phrase of exempt) {
      const p = squash(phrase);
      if (bannedRe.test(p) && scan.includes(p)) notes.push(`${slug}: banned word allowed inside content "${p}"`);
      bannedRe.lastIndex = 0;
      scan = scan.split(p).join(' ');
    }
    const hits = scan.match(bannedRe);
    if (hits) fail(slug, `content has presentation words: ${[...new Set(hits)].join(', ')}`);
    if (hexRe.test(scan)) fail(slug, 'content has a hex colour');
    // brief
    const b = c.brief || '';
    briefs++;
    if (b.length < 300 || b.length > 900) fail(slug, `brief is ${b.length} characters (300 to 900)`);
    if (hexRe.test(b)) fail(slug, 'brief has a hex colour');
    const bHits = b.replace(/mock-?ups?/gi, ' ').match(bannedRe);
    if (bHits) fail(slug, `brief has presentation words: ${[...new Set(bHits)].join(', ')}`);
    if (!/\breference\b/i.test(b)) fail(slug, 'brief does not mention the reference');
    const bw = words(b);
    const reqText = (Array.isArray(c.requirements) ? c.requirements : [c.requirements]).map(String);
    for (const r of reqText) {
      const rw = ' ' + words(r).join(' ') + ' ';
      for (let i = 0; i + 8 <= bw.length; i++) {
        const run = bw.slice(i, i + 8).join(' ');
        if (rw.includes(' ' + run + ' ')) { fail(slug, `brief shares eight words with requirements: "${run}"`); break; }
      }
    }
    // acceptance
    const acc = c.acceptance;
    if (!Array.isArray(acc) || acc.length < 3 || acc.length > 5) fail(slug, 'acceptance needs 3 to 5 statements');
    else for (const a of acc) if (typeof a !== 'string' || a.length < 30) fail(slug, `acceptance statement too short: "${a}"`);
  }
}
for (const n of notes) console.log('NOTE ' + n);
console.log(`${failures === 0 ? 'PASS' : 'FAIL'}: ${entries} entries, ${briefs} briefs checked, ${failures} failures, ${missesTotal} key facts left out of sheets`);
process.exit(failures ? 1 : 0);
