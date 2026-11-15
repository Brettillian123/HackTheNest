// Challenges and lessons are files.
// Main list: web/data/challenges.json + the goal per kind (page: web/data/goals/<slug>.html;
// doc: web/data/rubrics/<slug>.json). Adding a challenge = add the goal file + one JSON entry.
// Optional lessons in web/data/lessons/ (or LESSONS_DIR): index.json, NN-slug.md and challenges.json (bonus
// challenges, tagged `lesson`, listed only with ?include=lessons). Bad entries are skipped and listed
// in /api/health "problems" instead of crashing. On Vercel the files ship with the function through
// "includeFiles" in vercel.json and are read relative to process.cwd().
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, KIND_NAMES } from './kinds.js';
import { runCost } from './billingService.js';

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const LESSON_FILE_RE = /^[A-Za-z0-9._-]+\.md$/;

let cached = null;

function firstDir(envName, rel, marker) {
  const candidates = [process.env[envName], join(process.cwd(), ...rel), fileURLToPath(new URL(`../../${rel.join('/')}`, import.meta.url))].filter(Boolean);
  return candidates.find(dir => existsSync(join(dir, marker))) || null;
}

function validViewport(v) {
  return v && Number.isInteger(v.width) && Number.isInteger(v.height) && v.width >= 200 && v.width <= 4000 && v.height >= 200 && v.height <= 4000;
}

function validSpec(spec) {
  return Array.isArray(spec) && spec.every(g => g && typeof g.group === 'string' && Array.isArray(g.items)
    && g.items.every(i => i && typeof i.label === 'string' && typeof i.value === 'string'));
}

const intIn = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

// Brief-format entries (format "brief"): a plain-words brief plus requirements, key facts and design
// notes instead of a pixel spec. Old entries keep `spec` (format "spec"). `exactSpec` (a rewritten
// old entry's pixel spec) is kept off the enumerable fields, so it never reaches an API response.
export const REQUIREMENT_KINDS = ['content', 'structure', 'behaviour', 'style', 'engineering'];
export const BRIEF_LIMITS = { brief: 4000, category: 80, requirements: 40, requirementText: 600, requirementId: 40, keyFacts: 150, keyFact: 300, designNotes: 30, designNote: 300 };
const textIn = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const textList = (v, maxItems, maxLen) => Array.isArray(v) && v.length <= maxItems && v.every(x => textIn(x, maxLen));

function briefProblem(c) {
  const L = BRIEF_LIMITS;
  if (c.category !== undefined && !textIn(c.category, L.category)) return `category must be text of at most ${L.category} characters.`;
  if (c.requirements !== undefined) {
    if (!textIn(c.brief, L.brief)) return `brief must be non-empty text of at most ${L.brief} characters.`;
    if (!Array.isArray(c.requirements) || !c.requirements.length || c.requirements.length > L.requirements) return `requirements must be a list of 1 to ${L.requirements} items.`;
    const ids = new Set();
    for (const r of c.requirements) {
      if (!r || !textIn(r.id, L.requirementId) || ids.has(r.id)) return 'every requirement needs its own id.';
      ids.add(r.id);
      if (!textIn(r.text, L.requirementText)) return `requirement "${r.id}": text must be non-empty, at most ${L.requirementText} characters.`;
      if (!REQUIREMENT_KINDS.includes(r.kind)) return `requirement "${r.id}": kind must be one of ${REQUIREMENT_KINDS.join(', ')}.`;
      if (typeof r.exact !== 'boolean') return `requirement "${r.id}": exact must be true or false.`;
    }
  }
  if (c.keyFacts !== undefined && !textList(c.keyFacts, L.keyFacts, L.keyFact)) return `keyFacts must be a list of up to ${L.keyFacts} non-empty texts.`;
  if (c.designNotes !== undefined && !textList(c.designNotes, L.designNotes, L.designNote)) return `designNotes must be a list of up to ${L.designNotes} non-empty texts.`;
  if (c.exactSpec !== undefined && !validSpec(c.exactSpec)) return 'exactSpec must be groups of { label, value } items.';
  return null;
}

// Prompt limits per challenge. The rule: characters of the brief plus every spec group name, label
// and value (plus the criteria list, for doc and workflow kinds; for brief-format entries, the
// requirement texts, key facts and design notes instead of the spec), x 1.5 + 1000, rounded up to the
// next 500, never under 2000 and never over 12000. An entry may also set `maxPromptChars` (500 to
// 12000); the effective limit is the larger of the two, so entries written under an older, tighter
// rule are not tight.
export const PROMPT_LIMITS = { min: 500, max: 12000, ruleMin: 2000, ruleMax: 12000 };
export function computedPromptLimit(brief, spec = [], criteria = []) {
  let count = brief.length;
  for (const g of spec) {
    count += g.group.length;
    for (const i of g.items) count += i.label.length + i.value.length;
  }
  for (const c of criteria) count += c.length;
  const limit = Math.ceil((count * 1.5 + 1000) / 500) * 500;
  return Math.min(PROMPT_LIMITS.ruleMax, Math.max(PROMPT_LIMITS.ruleMin, limit));
}

// Output limits per challenge ("api send limits"): `maxOutputTokens` (500 to 16000) is sent to the
// provider as its max output setting. Defaults per kind below; the stored size is capped as well
// (300 KB, models/sanitize.js and kinds.js).
export const OUTPUT_TOKEN_LIMITS = { min: 500, max: 16000 };
export const DEFAULT_OUTPUT_TOKENS = { page: 6000, doc: 3000, workflow: 2000 };

function readJson(path) {
  try { return { value: JSON.parse(readFileSync(path, 'utf8')) }; }
  catch (error) { return { error: error.code === 'ENOENT' ? 'missing' : 'invalid' }; }
}

// The larger of the rule's limit and any explicit `maxPromptChars` on the entry.
export function effectivePromptLimit(c, kind = c.kind || 'page') {
  const criteria = (kind === 'doc' || kind === 'workflow') && Array.isArray(c.criteria) ? c.criteria : [];
  if (Array.isArray(c.requirements)) {
    const texts = [...c.requirements.map(r => r.text), ...(c.keyFacts || []), ...(c.designNotes || []), ...criteria];
    return Math.max(computedPromptLimit(c.brief, [], texts), c.maxPromptChars ?? 0);
  }
  return Math.max(computedPromptLimit(c.brief, c.spec || [], criteria), c.maxPromptChars ?? 0);
}

// Validates one entry; returns the challenge or pushes a problem and returns null.
function buildChallenge(c, index, { source, dirs, levels, viewport, bySlug, problems }) {
  const name = c && typeof c.slug === 'string' ? `"${c.slug}"` : `entry ${index + 1}`;
  const fail = message => { problems.push(`${source} challenge ${name}: ${message}`); return null; };
  if (!c || typeof c.slug !== 'string' || !SLUG_RE.test(c.slug) || c.slug.length > 64) return fail('slug must be lowercase letters, digits and dashes.');
  if (bySlug.has(c.slug)) return fail('the slug is used twice.');
  if (typeof c.title !== 'string' || !c.title.trim()) return fail('title is missing.');
  if (!Number.isInteger(c.level) || c.level < 1 || c.level > 9) return fail('level must be a whole number from 1 to 9.');
  if (typeof c.brief !== 'string') return fail('brief is missing.');
  if (c.spec !== undefined && !validSpec(c.spec)) return fail('spec must be groups of { label, value } items.');
  const briefIssue = briefProblem(c);
  if (briefIssue) return fail(briefIssue);
  if (c.viewport !== undefined && !validViewport(c.viewport)) return fail('viewport must have whole-number width and height.');
  const kind = c.kind === undefined ? 'page' : c.kind;
  if (!KIND_NAMES.includes(kind)) return fail(`kind must be one of ${KIND_NAMES.join(', ')}.`);
  if (c.criteria !== undefined && !(Array.isArray(c.criteria) && c.criteria.every(x => typeof x === 'string'))) return fail('criteria must be a list of sentences.');
  if (c.maxPromptChars !== undefined && !intIn(c.maxPromptChars, PROMPT_LIMITS.min, PROMPT_LIMITS.max)) return fail(`maxPromptChars must be a whole number from ${PROMPT_LIMITS.min} to ${PROMPT_LIMITS.max}.`);
  if (c.maxOutputTokens !== undefined && !intIn(c.maxOutputTokens, OUTPUT_TOKEN_LIMITS.min, OUTPUT_TOKEN_LIMITS.max)) return fail(`maxOutputTokens must be a whole number from ${OUTPUT_TOKEN_LIMITS.min} to ${OUTPUT_TOKEN_LIMITS.max}.`);
  const format = Array.isArray(c.requirements) ? 'brief' : 'spec';
  const challenge = {
    slug: c.slug,
    title: c.title.trim(),
    level: c.level,
    levelLabel: typeof levels[String(c.level)] === 'string' ? levels[String(c.level)] : null,
    category: c.category ? c.category.trim() : null,
    format,
    brief: c.brief,
    kind,
    viewport: c.viewport ? { width: c.viewport.width, height: c.viewport.height } : viewport,
    spec: format === 'spec' ? c.spec || [] : null,
    requirements: format === 'brief' ? c.requirements.map(r => ({ id: r.id, text: r.text, kind: r.kind, exact: r.exact })) : [],
    keyFacts: Array.isArray(c.keyFacts) ? c.keyFacts.slice() : [],
    designNotes: Array.isArray(c.designNotes) ? c.designNotes.slice() : [],
    available: KINDS[kind].available,
    unavailableReason: KINDS[kind].notBuilt || null,
    maxPromptChars: effectivePromptLimit(c, kind),
    maxOutputTokens: c.maxOutputTokens ?? DEFAULT_OUTPUT_TOKENS[kind] ?? DEFAULT_OUTPUT_TOKENS.page,
  };
  if (c.criteria) challenge.criteria = c.criteria.slice();
  if (c.exactSpec !== undefined) Object.defineProperty(challenge, 'exactSpec', { value: c.exactSpec, enumerable: false });
  if (c.marks !== undefined) challenge.marks = c.marks; // reserved: sent next to the goal when present
  if (KINDS[kind].loadGoal) {
    try { Object.assign(challenge, KINDS[kind].loadGoal(dirs, c.slug, c)); }
    catch (error) {
      // A page without its goal is skipped; other kinds stay listed but cannot be played yet.
      if (kind === 'page') return fail(error.message);
      problems.push(`${source} challenge ${name}: ${error.message}`);
      challenge.available = false;
      challenge.unavailableReason = error.playerReason || 'This challenge is not ready yet.';
    }
  }
  return challenge;
}

function parseFrontMatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fields: {}, markdown: text };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
    fields[kv[1]] = value;
  }
  return { fields, markdown: text.slice(m[0].length).replace(/^(\r?\n)+/, '') };
}

// Lessons live in <data folder>/lessons; LESSONS_DIR, when set, is used instead (no fallback).
function lessonsFolder(dataDir) {
  const dir = process.env.LESSONS_DIR || (dataDir ? join(dataDir, 'lessons') : null);
  return dir && (existsSync(join(dir, 'index.json')) || existsSync(join(dir, 'challenges.json'))) ? dir : null;
}

function loadLessons(problems, dataDir) {
  const dir = lessonsFolder(dataDir);
  if (!dir) return { dir: null, lessons: [] };
  const lessons = [];
  const index = existsSync(join(dir, 'index.json')) ? readJson(join(dir, 'index.json')) : { value: [] };
  if (index.error || !Array.isArray(index.value)) {
    problems.push('lessons/index.json is not a valid JSON list.');
    return { dir, lessons };
  }
  const seen = new Set();
  index.value.forEach((l, i) => {
    const name = l && typeof l.slug === 'string' ? `"${l.slug}"` : `entry ${i + 1}`;
    if (!l || typeof l.slug !== 'string' || !SLUG_RE.test(l.slug) || seen.has(l.slug)) return problems.push(`Lesson ${name}: slug is missing, invalid or used twice.`);
    if (typeof l.title !== 'string' || !l.title.trim()) return problems.push(`Lesson ${name}: title is missing.`);
    if (typeof l.file !== 'string' || !LESSON_FILE_RE.test(l.file) || !existsSync(join(dir, l.file))) return problems.push(`Lesson ${name}: file is missing.`);
    seen.add(l.slug);
    lessons.push({
      slug: l.slug,
      title: l.title.trim(),
      level: Number.isFinite(l.level) ? l.level : null,
      minutes: Number.isFinite(l.minutes) ? l.minutes : null,
      summary: typeof l.summary === 'string' ? l.summary : '',
      file: l.file,
      bonusChallenge: typeof l.bonusChallenge === 'string' && SLUG_RE.test(l.bonusChallenge) ? l.bonusChallenge : null,
      bonusSlugs: Array.isArray(l.bonusChallenges) ? l.bonusChallenges.filter(x => typeof x === 'string' && SLUG_RE.test(x)) : [],
      grader: typeof l.grader === 'string' ? l.grader : null,
      order: Number.isFinite(l.order) ? l.order : i + 1,
    });
  });
  lessons.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  return { dir, lessons };
}

function load() {
  const problems = [];
  const dataDir = firstDir('CHALLENGES_DIR', ['web', 'data'], 'challenges.json');
  const main = dataDir ? readJson(join(dataDir, 'challenges.json')) : { error: 'missing' };
  if (main.error) problems.push('challenges.json is missing or is not valid JSON.');
  const data = main.value || {};
  const viewport = validViewport(data.viewport) ? { width: data.viewport.width, height: data.viewport.height } : DEFAULT_VIEWPORT;
  const levels = data.levels && typeof data.levels === 'object' ? data.levels : {};
  const models = Array.isArray(data.models) ? data.models.filter(m => m && typeof m.id === 'string' && typeof m.label === 'string') : [];
  const bySlug = new Map();
  const challenges = [];
  (Array.isArray(data.challenges) ? data.challenges : []).forEach((c, i) => {
    const built = buildChallenge(c, i, { source: 'Main', dirs: [dataDir], levels, viewport, bySlug, problems });
    if (built) { challenges.push(built); bySlug.set(built.slug, built); }
  });

  const { dir: lessonsDir, lessons } = loadLessons(problems, dataDir);
  const lessonChallenges = [];
  if (lessonsDir && existsSync(join(lessonsDir, 'challenges.json'))) {
    const file = readJson(join(lessonsDir, 'challenges.json'));
    const list = Array.isArray(file.value) ? file.value : Array.isArray(file.value?.challenges) ? file.value.challenges : null;
    if (!list) problems.push('lessons/challenges.json is not a valid challenge list.');
    else {
      const lessonLevels = file.value?.levels && typeof file.value.levels === 'object' ? file.value.levels : levels;
      list.forEach((c, i) => {
        const built = buildChallenge(c, i, { source: 'Lesson', dirs: [dataDir].filter(Boolean), levels: lessonLevels, viewport, bySlug, problems });
        if (!built) return;
        const owner = typeof c.lesson === 'string' ? c.lesson : lessons.find(l => l.bonusChallenge === built.slug)?.slug;
        built.lesson = owner || null;
        lessonChallenges.push(built);
        bySlug.set(built.slug, built);
      });
    }
  }
  for (const l of lessons) {
    if (l.bonusChallenge && !lessonChallenges.some(c => c.slug === l.bonusChallenge)) problems.push(`Lesson "${l.slug}": bonus challenge "${l.bonusChallenge}" is not in lessons/challenges.json.`);
    // bonusChallenges: the lesson's listed slugs (else every challenge tagged with the lesson), in level order.
    const slugs = l.bonusSlugs.length ? l.bonusSlugs : lessonChallenges.filter(c => c.lesson === l.slug).map(c => c.slug);
    delete l.bonusSlugs;
    l.bonusChallenges = [...new Set(slugs)].map((slug, i) => {
      const c = lessonChallenges.find(x => x.slug === slug);
      if (!c) {
        problems.push(`Lesson "${l.slug}": bonus challenge "${slug}" is not in lessons/challenges.json.`);
        return { slug, title: slug, level: null, kind: null, cost: null, available: false, unavailableReason: 'This challenge is not ready yet.', i };
      }
      return { slug, title: c.title, level: c.level, kind: c.kind, cost: runCost(c), available: c.available, unavailableReason: c.unavailableReason, i };
    }).sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || a.i - b.i).map(({ i, ...rest }) => rest);
  }
  return { challenges, lessonChallenges, bySlug, levels, models, viewport, lessons, lessonsDir, problems };
}

export function challengeData() {
  if (!cached) cached = load();
  return cached;
}

export function reloadChallenges() {
  cached = null;
  return challengeData();
}

export function listChallengeFiles({ includeLessons = false } = {}) {
  const data = challengeData();
  return includeLessons ? [...data.challenges, ...data.lessonChallenges] : data.challenges;
}

export function allChallengeFiles() {
  return listChallengeFiles({ includeLessons: true });
}

export function getChallengeFile(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null;
  return challengeData().bySlug.get(slug) || null;
}

export function listLessons() {
  return challengeData().lessons;
}

// The lesson entry plus its Markdown (front matter stripped and parsed into `fields`), or null.
export function getLesson(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null;
  const data = challengeData();
  const lesson = data.lessons.find(l => l.slug === slug);
  if (!lesson) return null;
  let text;
  try { text = readFileSync(join(data.lessonsDir, lesson.file), 'utf8'); } catch { return null; }
  return { ...lesson, ...parseFrontMatter(text) };
}
