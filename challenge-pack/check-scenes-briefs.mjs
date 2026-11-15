// Checks the 3D challenges written as assignments (scenes/challenges.json).
// Run: node challenge-pack/check-scenes-briefs.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const problems = [];
let data;
try {
  data = JSON.parse(readFileSync(join(here, 'scenes', 'challenges.json'), 'utf8'));
} catch (e) {
  console.error(`challenges.json does not parse: ${e.message}`);
  process.exit(1);
}
const list = data.challenges ?? [];
if (list.length !== 9) problems.push(`expected 9 challenges, found ${list.length}`);
const slugs = new Set(list.map((c) => c.slug));
if (slugs.size !== list.length) problems.push('slugs are not unique');

const HEX = /#[0-9a-f]{3,8}\b/i;
const LENGTH = /\d+(\.\d+)?\s*(mm|cm|m|km|units?|metres?|meters?|inch(es)?|in|ft|feet|foot|px|pixels?)\b/i;
const KINDS = new Set(['content', 'structure', 'style', 'engineering']);

for (const c of list) {
  const at = (m) => problems.push(`${c.slug}: ${m}`);
  const b = c.brief ?? '';
  if (b.length < 300 || b.length > 800) at(`brief is ${b.length} characters (300 to 800)`);
  if (!/reference/i.test(b)) at('brief does not mention the reference');
  if (HEX.test(b)) at('brief has a hex colour');
  if (LENGTH.test(b)) at(`brief has a length with a unit: "${b.match(LENGTH)[0]}"`);
  const a = c.acceptance ?? [];
  if (!Array.isArray(a) || a.length < 3 || a.length > 5) at(`${a.length} acceptance statements (3 to 5)`);
  const r = c.requirements ?? [];
  if (r.length < 8 || r.length > 12) at(`${r.length} requirements (8 to 12)`);
  if (new Set(r.map((x) => x.id)).size !== r.length) at('requirement ids are not unique');
  for (const x of r) {
    if (!KINDS.has(x.kind)) at(`requirement ${x.id} has kind "${x.kind}"`);
    if (!x.text || typeof x.exact !== 'string') at(`requirement ${x.id} lacks text or exact`);
  }
  if (!Array.isArray(c.exactSpec) || !c.exactSpec.length) at('exactSpec missing');
  if ('maxPromptChars' in c) at('maxPromptChars still present');
  if (c.category !== '3D models') at('category is not "3D models"');
  if (!existsSync(join(here, 'scenes', 'goals', `${c.slug}.js`))) at(`goal file goals/${c.slug}.js missing`);
}

if (problems.length) {
  console.error(problems.map((p) => `FAIL ${p}`).join('\n'));
  process.exit(1);
}
console.log(`OK: ${list.length} 3D challenges, briefs ${Math.min(...list.map((c) => c.brief.length))} to ${Math.max(...list.map((c) => c.brief.length))} characters`);
