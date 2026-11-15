// Challenges are files: web/data/challenges.json (one entry each) and web/data/goals/<slug>.html.
// Adding a challenge = add the goal HTML + one JSON entry. Bad entries are skipped and listed in
// /api/health "problems" instead of crashing. On Vercel the files ship with the function through
// "includeFiles" in vercel.json and are read relative to process.cwd().
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_GOAL_BYTES = 300 * 1024;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

let cached = null;

function dataDir() {
  const candidates = [
    process.env.CHALLENGES_DIR,
    join(process.cwd(), 'web', 'data'),
    fileURLToPath(new URL('../../web/data', import.meta.url)),
  ].filter(Boolean);
  return candidates.find(dir => existsSync(join(dir, 'challenges.json'))) || candidates[candidates.length - 1];
}

function validViewport(v) {
  return v && Number.isInteger(v.width) && Number.isInteger(v.height) && v.width >= 200 && v.width <= 4000 && v.height >= 200 && v.height <= 4000;
}

function validSpec(spec) {
  return Array.isArray(spec) && spec.every(g => g && typeof g.group === 'string' && Array.isArray(g.items)
    && g.items.every(i => i && typeof i.label === 'string' && typeof i.value === 'string'));
}

function load() {
  const dir = dataDir();
  const problems = [];
  let data;
  try {
    data = JSON.parse(readFileSync(join(dir, 'challenges.json'), 'utf8'));
  } catch {
    return { challenges: [], bySlug: new Map(), levels: {}, models: [], viewport: DEFAULT_VIEWPORT, problems: ['challenges.json is missing or is not valid JSON.'] };
  }
  const viewport = validViewport(data.viewport) ? { width: data.viewport.width, height: data.viewport.height } : DEFAULT_VIEWPORT;
  const levels = data.levels && typeof data.levels === 'object' ? data.levels : {};
  const models = Array.isArray(data.models) ? data.models.filter(m => m && typeof m.id === 'string' && typeof m.label === 'string') : [];
  const challenges = [];
  const bySlug = new Map();
  (Array.isArray(data.challenges) ? data.challenges : []).forEach((c, index) => {
    const name = c && typeof c.slug === 'string' ? `"${c.slug}"` : `entry ${index + 1}`;
    if (!c || typeof c.slug !== 'string' || !SLUG_RE.test(c.slug) || c.slug.length > 64) return problems.push(`Challenge ${name}: slug must be lowercase letters, digits and dashes.`);
    if (bySlug.has(c.slug)) return problems.push(`Challenge ${name}: the slug is used twice.`);
    if (typeof c.title !== 'string' || !c.title.trim()) return problems.push(`Challenge ${name}: title is missing.`);
    if (!Number.isInteger(c.level) || c.level < 1 || c.level > 9) return problems.push(`Challenge ${name}: level must be a whole number from 1 to 9.`);
    if (typeof c.brief !== 'string') return problems.push(`Challenge ${name}: brief is missing.`);
    if (c.spec !== undefined && !validSpec(c.spec)) return problems.push(`Challenge ${name}: spec must be groups of { label, value } items.`);
    if (c.viewport !== undefined && !validViewport(c.viewport)) return problems.push(`Challenge ${name}: viewport must have whole-number width and height.`);
    let goalHtml;
    try { goalHtml = readFileSync(join(dir, 'goals', `${c.slug}.html`), 'utf8'); }
    catch { return problems.push(`Challenge ${name}: goals/${c.slug}.html is missing.`); }
    if (!goalHtml.trim()) return problems.push(`Challenge ${name}: goals/${c.slug}.html is empty.`);
    if (Buffer.byteLength(goalHtml) > MAX_GOAL_BYTES) return problems.push(`Challenge ${name}: goals/${c.slug}.html is over 300 KB.`);
    const challenge = {
      slug: c.slug,
      title: c.title.trim(),
      level: c.level,
      levelLabel: typeof levels[String(c.level)] === 'string' ? levels[String(c.level)] : null,
      brief: c.brief,
      viewport: c.viewport ? { width: c.viewport.width, height: c.viewport.height } : viewport,
      spec: c.spec || [],
      goalHtml,
    };
    challenges.push(challenge);
    bySlug.set(c.slug, challenge);
  });
  return { challenges, bySlug, levels, models, viewport, problems };
}

export function challengeData() {
  if (!cached) cached = load();
  return cached;
}

export function reloadChallenges() {
  cached = null;
  return challengeData();
}

export function listChallengeFiles() {
  return challengeData().challenges;
}

export function getChallengeFile(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null;
  return challengeData().bySlug.get(slug) || null;
}
