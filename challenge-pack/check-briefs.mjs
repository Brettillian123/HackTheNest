// Checks challenge files written in the brief form (brief, requirements, keyFacts, designNotes, exactSpec).
// Usage: node challenge-pack/check-briefs.mjs [path/to/challenges.json ...]
// Goals are read from goals/<slug>.html next to each challenges.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [path.join(here, 'pages', 'challenges.json'), path.join(here, 'pages-live', 'challenges.json')];

const KINDS = new Set(['content', 'structure', 'behaviour', 'style', 'engineering']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', copy: '©',
  mdash: '—', ndash: '–', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', times: '×',
  minus: '−', euro: '€', pound: '£', star: '☆', bull: '•' };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function goalText(html) {
  const attrs = [...html.matchAll(/\b(?:value|placeholder)\s*=\s*"([^"]*)"/gi)].map(m => m[1]);
  const body = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(style|script|title)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decode([body, ...attrs].join(' ')).replace(/\s+/g, ' ');
}

let failures = 0, entries = 0;
const fail = (where, msg) => { failures++; console.log(`FAIL ${where}: ${msg}`); };

for (const file of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail(file, 'does not parse: ' + e.message); continue; }
  const list = Array.isArray(data) ? data : data.challenges;
  if (!Array.isArray(list)) { fail(file, 'no challenges array'); continue; }
  const slugs = new Set();
  for (const c of list) {
    entries++;
    const at = `${path.basename(path.dirname(file))}/${c.slug}`;
    if (typeof c.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)) fail(at, 'bad slug');
    if (slugs.has(c.slug)) fail(at, 'duplicate slug');
    slugs.add(c.slug);

    const brief = c.brief || '';
    if (brief.length < 300) fail(at, `brief is ${brief.length} chars, needs 300`);
    if (/px/i.test(brief)) fail(at, 'brief contains px');
    const hexes = brief.match(/#[0-9a-f]{3,8}\b/gi) || [];
    if (hexes.length > 2) fail(at, `brief has ${hexes.length} hex codes`);

    const reqs = c.requirements;
    if (!Array.isArray(reqs) || reqs.length < 6 || reqs.length > 12) fail(at, `needs 6 to 12 requirements, has ${reqs?.length}`);
    else {
      const ids = new Set();
      for (const r of reqs) {
        if (!r.id || ids.has(r.id)) fail(at, `requirement id missing or repeated: ${r.id}`);
        ids.add(r.id);
        if (typeof r.text !== 'string' || !r.text.trim()) fail(at, `${r.id} has no text`);
        if (!KINDS.has(r.kind)) fail(at, `${r.id} has bad kind ${r.kind}`);
        if (typeof r.exact !== 'boolean') fail(at, `${r.id} exact is not boolean`);
      }
    }

    const facts = c.keyFacts;
    if (!Array.isArray(facts) || facts.length < 4) fail(at, `needs at least 4 key facts`);
    else {
      const goalPath = path.join(path.dirname(file), 'goals', `${c.slug}.html`);
      if (!fs.existsSync(goalPath)) fail(at, 'goal file missing');
      else {
        const text = goalText(fs.readFileSync(goalPath, 'utf8'));
        for (const f of facts) {
          const norm = String(f).replace(/\s+/g, ' ').trim();
          if (!text.includes(norm)) fail(at, `key fact not in goal: ${f}`);
        }
      }
    }

    const notes = c.designNotes;
    if (!Array.isArray(notes) || notes.length < 3 || notes.length > 5) fail(at, `needs 3 to 5 design notes`);
    if (c.exactSpec === undefined || c.exactSpec === null) fail(at, 'exactSpec missing');
  }
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}: ${entries} entries in ${files.length} files, ${failures} problems`);
process.exit(failures ? 1 : 0);
