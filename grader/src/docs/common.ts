/** Helpers shared by the Markdown and tool-list scoring. */
import type { DocCriterionId, DocGroup } from './types';

export const IMPORTANCE_WEIGHT: Record<string, number> = { critical: 1.5, major: 1.25, normal: 1, minor: 0.75 };

export function weightOf(importance: string | undefined): number {
  return IMPORTANCE_WEIGHT[importance ?? 'normal'] ?? 1;
}

export function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

/** One problem found by a criterion. `weight` is relative; `loss` is set when the criterion is finished. */
export interface Issue {
  message: string;
  weight: number;
  loss?: number;
}

export interface Draft {
  id: DocCriterionId;
  name: string;
  group: DocGroup;
  value: number;
  notes: string[];
  issues: Issue[];
  /** False when the rubric gives this criterion nothing to check. */
  applicable: boolean;
}

/** Finishes a criterion: shares its lost value among its issues by their weights. */
export function draft(
  id: DocCriterionId,
  name: string,
  group: DocGroup,
  value: number,
  issues: Issue[],
  notes: string[] = [],
  applicable = true,
): Draft {
  const v = clamp01(value);
  const lost = 1 - v;
  const total = issues.reduce((s, i) => s + Math.max(0, i.weight), 0);
  for (const issue of issues) issue.loss = total > 0 ? (lost * Math.max(0, issue.weight)) / total : 0;
  return { id, name, group, value: v, notes, issues, applicable };
}

function safeLower(s: string): string {
  let t = s;
  try {
    t = s.normalize('NFKC');
  } catch {
    // keep as is
  }
  return t.toLowerCase();
}

/** Lower case, punctuation to spaces, spaces collapsed. */
export function norm(s: string): string {
  return safeLower(s)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Spacing collapsed, nothing else changed. */
export function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function wordsOf(s: string): string[] {
  const out: string[] = [];
  for (const t of s.split(/\s+/)) if (t && /[\p{L}\p{N}]/u.test(t)) out.push(t);
  return out;
}

export function wordCount(s: string): number {
  let n = 0;
  for (const t of s.split(/\s+/)) if (t && /[\p{L}\p{N}]/u.test(t)) n++;
  return n;
}

export function short(s: string, n = 60): string {
  const t = squash(s);
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/** Shows a fact as code in a message. */
export function asCode(s: string): string {
  return s.includes('`') ? `"${s}"` : `\`${s}\``;
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Finds `needle` in `hay` (both already squashed or lowered as wanted),
 * not as part of a longer word when the needle starts or ends with a
 * letter or digit.
 */
export function contains(hay: string, needle: string): boolean {
  if (!needle) return false;
  const startsWord = WORD_CHAR.test(needle[0]);
  const endsWord = WORD_CHAR.test(needle[needle.length - 1]);
  let from = 0;
  for (let guard = 0; guard < 100000; guard++) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    const before = i > 0 ? hay[i - 1] : '';
    const after = hay[i + needle.length] ?? '';
    const okBefore = !startsWord || !before || !WORD_CHAR.test(before);
    const okAfter = !endsWord || !after || !WORD_CHAR.test(after);
    if (okBefore && okAfter) return true;
    from = i + 1;
  }
  return false;
}

/**
 * A topic mention: `needle` starts a word in `hay` (case ignored), so
 * "dependenc" matches "dependencies" and "test" matches "tests".
 */
export function mentions(hay: string, needle: string): boolean {
  const n = safeLower(squash(needle));
  // "dependency" also matches "dependencies".
  if (/[^aeiou]y$/.test(n) && mentionsExactly(hay, n.slice(0, -1) + 'ies')) return true;
  return mentionsExactly(hay, n);
}

function mentionsExactly(hay: string, n: string): boolean {
  const h = safeLower(squash(hay));
  if (!n) return false;
  const startsWord = WORD_CHAR.test(n[0]);
  let from = 0;
  for (let guard = 0; guard < 100000; guard++) {
    const i = h.indexOf(n, from);
    if (i < 0) return false;
    if (!startsWord || i === 0 || !WORD_CHAR.test(h[i - 1])) return true;
    from = i + 1;
  }
  return false;
}

/** Case-insensitive `contains` on squashed text. */
export function containsLoose(hay: string, needle: string): boolean {
  return contains(safeLower(squash(hay)), safeLower(squash(needle)));
}

export function lower(s: string): string {
  return safeLower(s);
}

export const STOPWORDS = new Set(
  (
    'a an the and or but of to in on at for with by from as is are be this that these those it its ' +
    'you your we our they them their here there about into over under all any some each every how what ' +
    'when where which who why will can should must may section describes covers explains lists contains ' +
    'information details following below above use used using'
  ).split(' '),
);

/** True when every meaningful word of `text` is already in `heading`. */
export function onlyRestates(text: string, heading: string): boolean {
  const head = new Set(norm(heading).split(' ').filter(Boolean));
  const ws = norm(text).split(' ').filter(Boolean);
  if (ws.length === 0 || ws.length > 12) return false;
  const meaningful = ws.filter((w) => !STOPWORDS.has(w));
  return meaningful.every((w) => head.has(w) || head.has(w.replace(/s$/, '')) || head.has(w + 's'));
}

export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const FILLER_PHRASES = [
  'it is important to note that',
  'it should be noted that',
  'please note that',
  'as mentioned above',
  'as mentioned earlier',
  'as previously mentioned',
  'as stated above',
  'needless to say',
  'it goes without saying',
  'at the end of the day',
  'in conclusion',
  'this section describes',
  'this section covers',
  'this section explains',
  'feel free to',
];

export function fillerIn(text: string): string[] {
  const t = ' ' + norm(text) + ' ';
  return FILLER_PHRASES.filter((p) => t.includes(' ' + p + ' '));
}

const PLACEHOLDERS: { re: RegExp; what: (m: RegExpExecArray) => string }[] = [
  { re: /(^|[^\w`])(TODO|FIXME)\b(?!\s+(?:comments?|items?|markers?|lists?|notes?|tags?)\b)/, what: (m) => m[2] },
  { re: /\bTBD\b/, what: () => 'TBD' },
  { re: /\bXXX\b/, what: () => 'XXX' },
  { re: /lorem ipsum/i, what: () => 'lorem ipsum' },
  { re: /\byour[\w -]{0,40}?[-_ ]here\b/i, what: (m) => m[0] },
  { re: /<\s*(?:insert|add|replace|your)\b[^<>\n]{0,60}>/i, what: (m) => m[0] },
  { re: /\[\s*(?:insert|add|todo|placeholder|your)\b[^\]\n]{0,60}\]/i, what: (m) => m[0] },
];

/** Placeholders in prose (pass text with code spans already removed). */
export function placeholdersIn(text: string): string[] {
  if (text.length > 20000) text = text.slice(0, 20000);
  const found: string[] = [];
  for (const p of PLACEHOLDERS) {
    const m = p.re.exec(text);
    if (m) found.push(short(p.what(m), 40));
  }
  return found;
}

/** Placeholders that stay placeholders inside code ("your-api-key-here", "lorem ipsum"). */
export function codePlaceholdersIn(code: string): string[] {
  const text = code.length > 20000 ? code.slice(0, 20000) : code;
  const found: string[] = [];
  for (const re of [/\byour[\w -]{0,40}?[-_ ]here\b/i, /lorem ipsum/i]) {
    const m = re.exec(text);
    if (m) found.push(short(m[0], 40));
  }
  return found;
}

const KNOWN_KEY = /\b(sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})/;
const ASSIGNED = /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|token)\b[ \t]*([:=])[ \t]*["']?([^\s"'`,;]{4,})/i;
const LONG_TOKEN = /(?<![A-Za-z0-9_\-/.])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_\-/.])/g;

function looksPlaceholder(v: string): boolean {
  return (
    /^[$<{[(%]/.test(v) ||
    /^[A-Z][A-Z0-9_]*$/.test(v) ||
    /your|example|placeholder|changeme|redacted|xxx|\*\*\*|\.\.\.|process\.env|env\b|os\.environ/i.test(v)
  );
}

/** Things in one line that look like secrets. */
export function secretsIn(line: string): string[] {
  const text = line.length > 20000 ? line.slice(0, 20000) : line;
  const found: string[] = [];
  const known = KNOWN_KEY.exec(text);
  if (known) found.push(known[1].slice(0, 6) + '…');
  const a = ASSIGNED.exec(text);
  if (a && !looksPlaceholder(a[3])) {
    const v = a[3];
    const strong = a[2] === '=' ? v.length >= 4 : v.length >= 8 && /\d/.test(v) && /[A-Za-z]/.test(v);
    if (strong) found.push(`${a[1]}${a[2]}…`);
  }
  if (!known) {
    LONG_TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = LONG_TOKEN.exec(text)) && guard++ < 50) {
      const t = m[0];
      if (/[A-Z]/.test(t) && /[a-z]/.test(t) && /\d/.test(t) && !/^[0-9a-f-]+$/i.test(t)) {
        found.push(t.slice(0, 6) + '…');
        break;
      }
    }
  }
  return found;
}

/** Compiles a rubric pattern; null if it is not a valid regular expression. */
export function compilePattern(pattern: string, ignoreCase = true): RegExp | null {
  try {
    return new RegExp(pattern, ignoreCase ? 'i' : '');
  } catch {
    return null;
  }
}

/** Commands people type in a shell, for "this line is a command" checks. */
export const COMMAND_WORDS =
  'npm|npx|pnpm|yarn|bun|git|node|deno|python|python3|pip|pip3|uv|poetry|docker|docker-compose|kubectl|make|cargo|go|curl|wget|tsx|vitest|jest|pytest|bash|sh|cd|mkdir|rm|cp|mv|ls|brew|apt|apt-get|gh|claude';

const COMMAND_LINE = new RegExp(`^(?:\\$\\s+)?(?:${COMMAND_WORDS})(?:\\s+[^\\s\`]+){1,12}$`);
const PROSE_WORDS = new Set(
  'the a an to and is are for of with in on it this that you we then when before after if your into from be will can should'.split(' '),
);

/** A line that is nothing but a shell command (not prose that mentions one). */
export function isCommandLine(text: string): boolean {
  const t = text.trim();
  if (t.length > 300 || !COMMAND_LINE.test(t)) return false;
  if (/[.:;!?]$/.test(t)) return false;
  const tokens = t.replace(/^\$\s+/, '').split(/\s+/);
  return !tokens.slice(1).some((w) => PROSE_WORDS.has(w.toLowerCase()));
}

/** The first line of a code block looks like a shell session. */
export function looksShell(code: string): boolean {
  const first = code.split('\n').find((l) => l.trim() && !l.trim().startsWith('#')) ?? '';
  const t = first.trim();
  if (t.length > 300) return false;
  return /^\$\s+\S/.test(t) || new RegExp(`^(?:${COMMAND_WORDS})(?:\\s|$)`).test(t);
}
