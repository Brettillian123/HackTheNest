// Rewrites every page challenge's `content` as a flat list of the exact texts on its reference page,
// in alphabetical order, so the model is given spelling and wording but nothing about structure.
// Deterministic: the list is read from goals/<slug>.html. Run from the repo root: node challenge-pack/flatten-content.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const packs = ['pages-live', 'pages', 'pages-2/components', 'pages-2/marketing', 'pages-2/apps', 'pages-2/forms'];
const INLINE = 'a|strong|em|b|i|code|mark|abbr|u|sup|sub|kbd|q|cite';
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', hellip: '…', rarr: '→', larr: '←', times: '×', copy: '©', bull: '•', star: '☆', starf: '★', check: '✓', minus: '−', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', pound: '£', euro: '€' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m));
const clean = (s) => decode(s).replace(/\s+/g, ' ').trim();

export function textsOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/\b(?:placeholder|alt|aria-label)="([^"]*)"/g)) if (clean(m[1])) out.add(clean(m[1]));
  for (const m of html.matchAll(/<input\b[^>]*\btype="(?:submit|button)"[^>]*\bvalue="([^"]*)"/g)) if (clean(m[1])) out.add(clean(m[1]));
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|title|desc|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(new RegExp(`</?(?:${INLINE})\\b[^>]*>`, 'gi'), '');
  for (const piece of body.split(/<[^>]+>/)) if (clean(piece)) out.add(clean(piece));
  return [...out].sort((a, b) => a.localeCompare(b, 'en'));
}

for (const pack of packs) {
  const file = join('challenge-pack', pack, 'challenges.json');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  for (const c of data.challenges) {
    const texts = textsOf(readFileSync(join('challenge-pack', pack, 'goals', `${c.slug}.html`), 'utf8'));
    c.content = 'Every text on the page, spelled exactly, in alphabetical order (the order says nothing about where a text goes):\n' + texts.map((t) => `- ${t}`).join('\n');
    const missing = (c.keyFacts || []).filter((k) => !c.content.includes(k));
    console.log(`${pack}/${c.slug}`.padEnd(44), `${texts.length} texts, ${c.content.length} chars`, missing.length ? `| key facts not found as written: ${missing.length}` : '');
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
