/**
 * A small, strict Markdown reader: headings (ATX and underlined), paragraphs,
 * block quotes, lists, fenced and indented code, tables, thematic breaks,
 * and front matter between `---` lines (plain `key: value` pairs, quoted
 * strings, block scalars and one-level lists). It reads line by line in one
 * pass, never throws, and does not try to understand anything else.
 */

export type FmValue = string | string[];

export interface FrontMatterError {
  line: number;
  message: string;
}

export interface FrontMatter {
  closed: boolean;
  /** 1-based line of the closing `---` (1 if unclosed). */
  endLine: number;
  entries: Map<string, FmValue>;
  keyLines: Map<string, number>;
  errors: FrontMatterError[];
}

interface BlockBase {
  /** 1-based line where the block starts. */
  line: number;
}

export interface MdHeading extends BlockBase {
  kind: 'heading';
  level: number;
  /** Raw inline text. */
  text: string;
  style: 'atx' | 'setext';
}

export interface MdParagraph extends BlockBase {
  kind: 'paragraph';
  text: string;
  lines: { text: string; line: number }[];
  quote: boolean;
}

export interface MdListItem {
  /** Raw inline text, continuation lines joined with spaces. */
  text: string;
  line: number;
  /** `-`, `*`, `+` for bullets; `.` or `)` for numbered items. */
  marker: string;
  ordered: boolean;
  depth: number;
}

export interface MdList extends BlockBase {
  kind: 'list';
  items: MdListItem[];
}

export interface MdCode extends BlockBase {
  kind: 'code';
  lang: string;
  text: string;
  closed: boolean;
  fence: '`' | '~' | 'indent';
  endLine: number;
}

export interface MdTable extends BlockBase {
  kind: 'table';
  rows: string[][];
}

export interface MdBreak extends BlockBase {
  kind: 'break';
}

export type MdBlock = MdHeading | MdParagraph | MdList | MdCode | MdTable | MdBreak;

export interface MdDoc {
  lines: string[];
  frontMatter: FrontMatter | null;
  blocks: MdBlock[];
  /** The text was longer than MAX_DOC_CHARS and only the start was read. */
  truncated: boolean;
}

export const MAX_DOC_CHARS = 1_200_000;

export function parseMarkdown(input: string): MdDoc {
  let text = typeof input === 'string' ? input : '';
  let truncated = false;
  if (text.length > MAX_DOC_CHARS) {
    text = text.slice(0, MAX_DOC_CHARS);
    truncated = true;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r\n|\r|\n/);
  let start = 0;
  let frontMatter: FrontMatter | null = null;
  if (lines.length && lines[0].trim() === '---') {
    frontMatter = parseFrontMatter(lines);
    start = frontMatter.closed ? frontMatter.endLine : 1;
  }
  return { lines, frontMatter, blocks: parseBlocks(lines, start), truncated };
}

// ------------------------------------------------------------ front matter

interface Unquoted {
  value: string;
  error?: string;
}

function unquote(raw: string): Unquoted {
  const v = raw.trim();
  if (v.startsWith('"')) {
    if (v.length < 2 || !v.endsWith('"') || v.endsWith('\\"')) {
      return { value: v.slice(1), error: 'has an opening quote but no closing quote' };
    }
    const inner = v.slice(1, -1);
    if (/(^|[^\\])"/.test(inner)) return { value: inner, error: 'has a quote inside it that is not escaped' };
    return { value: inner.replace(/\\n/g, '\n').replace(/\\(["\\])/g, '$1') };
  }
  if (v.startsWith("'")) {
    if (v.length < 2 || !v.endsWith("'")) return { value: v.slice(1), error: 'has an opening quote but no closing quote' };
    const inner = v.slice(1, -1);
    if (/(^|[^'])'(?!')/.test(inner.replace(/''/g, ''))) return { value: inner, error: 'has a quote inside it that is not doubled' };
    return { value: inner.replace(/''/g, "'") };
  }
  let plain = v;
  const hash = plain.indexOf(' #');
  if (hash >= 0) plain = plain.slice(0, hash).trim();
  if (/^[&*!%@`|>{]/.test(plain)) {
    return { value: plain, error: 'starts with a character YAML treats specially; wrap the value in quotes' };
  }
  if (/:\s/.test(plain) || plain.endsWith(':')) {
    return { value: plain, error: 'contains ": ", which YAML reads as a new key; wrap the value in quotes' };
  }
  return { value: plain };
}

function parseFrontMatter(lines: string[]): FrontMatter {
  let end = -1;
  for (let i = 1; i < lines.length && i < 1000; i++) {
    const t = lines[i].trim();
    if (t === '---' || t === '...') {
      end = i;
      break;
    }
  }
  const fm: FrontMatter = { closed: end > 0, endLine: end > 0 ? end + 1 : 1, entries: new Map(), keyLines: new Map(), errors: [] };
  if (end < 0) {
    fm.errors.push({ line: 1, message: 'The front matter that opens on line 1 is never closed with a `---` line.' });
    return fm;
  }
  const isIndented = (s: string) => /^[ \t]+\S/.test(s);
  let i = 1;
  while (i < end) {
    const raw = lines[i];
    const ln = i + 1;
    const t = raw.trim();
    if (!t || t.startsWith('#')) {
      i++;
      continue;
    }
    if (isIndented(raw)) {
      fm.errors.push({ line: ln, message: `Line ${ln} of the front matter is indented but belongs to no key.` });
      i++;
      continue;
    }
    const m = raw.length <= 5000 ? /^([A-Za-z_][\w.-]*)[ \t]*:(?:[ \t]+(.*)|[ \t]*)$/.exec(raw) : null;
    if (!m) {
      fm.errors.push({ line: ln, message: `Line ${ln} of the front matter is not \`key: value\`.` });
      i++;
      continue;
    }
    const key = m[1];
    const value = (m[2] ?? '').trim();
    i++;
    if (fm.entries.has(key)) {
      fm.errors.push({ line: ln, message: `The front-matter key \`${key}\` appears twice.` });
    }
    fm.keyLines.set(key, ln);
    if (value === '' || value.startsWith('#')) {
      const items: string[] = [];
      let nested = false;
      while (i < end && (isIndented(lines[i]) || !lines[i].trim())) {
        const s = lines[i].trim();
        if (s) {
          const li = /^-(?:\s+(.*))?$/.exec(s);
          if (li) items.push(unquote(li[1] ?? '').value);
          else nested = true;
        }
        i++;
      }
      if (nested) {
        fm.errors.push({ line: ln, message: `The front-matter key \`${key}\` holds a nested map; only plain values and one-level lists are read.` });
      }
      fm.entries.set(key, items.length ? items : '');
    } else if (/^[|>][+-]?$/.test(value)) {
      const parts: string[] = [];
      while (i < end && (isIndented(lines[i]) || !lines[i].trim())) {
        parts.push(lines[i].trim());
        i++;
      }
      const joined = value.startsWith('|') ? parts.join('\n') : parts.filter(Boolean).join(' ');
      fm.entries.set(key, joined.trim());
    } else if (value.startsWith('[')) {
      if (!value.endsWith(']')) {
        fm.errors.push({ line: ln, message: `The list for \`${key}\` opens with "[" but does not close with "]".` });
        fm.entries.set(key, value);
      } else {
        const inner = value.slice(1, -1).trim();
        fm.entries.set(key, inner ? inner.split(',').map((x) => unquote(x).value).filter((x) => x !== '') : []);
      }
    } else {
      let full = value;
      // A plain value may continue on indented lines.
      if (!/^["']/.test(value)) {
        while (i < end && isIndented(lines[i]) && !/^\s*-\s/.test(lines[i])) {
          full += ' ' + lines[i].trim();
          i++;
        }
      }
      const u = unquote(full);
      if (u.error) fm.errors.push({ line: ln, message: `The value of \`${key}\` ${u.error}.` });
      fm.entries.set(key, u.value);
    }
  }
  return fm;
}

// ------------------------------------------------------------ blocks

function leadingSpaces(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ' ') n++;
    else if (c === '\t') n += 4 - (n % 4);
    else break;
  }
  return n;
}

function stripIndent(s: string, n: number): string {
  let i = 0;
  let removed = 0;
  while (i < s.length && removed < n && (s[i] === ' ' || s[i] === '\t')) {
    removed += s[i] === '\t' ? 4 : 1;
    i++;
  }
  return s.slice(i);
}

interface Fence {
  char: '`' | '~';
  length: number;
  lang: string;
}

function fenceOpen(trimmed: string): Fence | null {
  const c = trimmed[0];
  if (c !== '`' && c !== '~') return null;
  let n = 0;
  while (trimmed[n] === c) n++;
  if (n < 3) return null;
  const info = trimmed.slice(n).trim();
  if (c === '`' && info.includes('`')) return null;
  const lang = (info.split(/\s+/)[0] ?? '').replace(/^\{?\.?/, '').replace(/\}$/, '').toLowerCase();
  return { char: c, length: n, lang };
}

function isFenceClose(line: string, fence: Fence): boolean {
  const t = line.trim();
  if (t[0] !== fence.char) return false;
  let n = 0;
  while (t[n] === fence.char) n++;
  return n >= fence.length && n === t.length;
}

function atxHeading(trimmed: string): { level: number; text: string } | null {
  let n = 0;
  while (n < 7 && trimmed[n] === '#') n++;
  if (n < 1 || n > 6) return null;
  const next = trimmed[n];
  if (next !== undefined && next !== ' ' && next !== '\t') return null;
  let text = trimmed.slice(n).trim();
  // Closing hashes: "## Title ##".
  let e = text.length;
  while (e > 0 && text[e - 1] === '#') e--;
  if (e < text.length && (e === 0 || text[e - 1] === ' ' || text[e - 1] === '\t')) text = text.slice(0, e).trim();
  return { level: n, text };
}

function isBreak(trimmed: string): boolean {
  const c = trimmed[0];
  if (c !== '-' && c !== '*' && c !== '_') return false;
  let count = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === c) count++;
    else if (ch !== ' ' && ch !== '\t') return false;
  }
  return count >= 3;
}

function listMarker(raw: string, indent: number): { marker: string; ordered: boolean; rest: string } | null {
  const s = stripIndent(raw, indent);
  const c = s[0];
  if (c === '-' || c === '*' || c === '+') {
    const next = s[1];
    if (next === undefined || next === ' ' || next === '\t') return { marker: c, ordered: false, rest: s.slice(1).trim() };
    return null;
  }
  let n = 0;
  while (n < 10 && s[n] >= '0' && s[n] <= '9') n++;
  if (n === 0 || n > 9) return null;
  const d = s[n];
  if (d !== '.' && d !== ')') return null;
  const next = s[n + 1];
  if (next !== undefined && next !== ' ' && next !== '\t') return null;
  return { marker: d, ordered: true, rest: s.slice(n + 1).trim() };
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes('-') || t.length > 5000) return false;
  const inner = t.replace(/^\|/, '').replace(/\|$/, '');
  const cells = inner.split('|');
  if (cells.length < 1 || (cells.length < 2 && !t.includes('|'))) return false;
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

export function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((c) => c.trim());
}

function parseBlocks(lines: string[], start: number): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: MdParagraph | null = null;
  let list: MdList | null = null;
  let lastItem: MdListItem | null = null;
  let blankInList = false;

  const closeList = () => {
    list = null;
    lastItem = null;
    blankInList = false;
  };

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const ln = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) {
      para = null;
      if (list) blankInList = true;
      continue;
    }
    const indent = leadingSpaces(raw);

    // Fenced code (also inside list items).
    const fence = fenceOpen(trimmed);
    if (fence) {
      para = null;
      if (indent === 0) closeList();
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        if (isFenceClose(lines[j], fence)) {
          closed = true;
          break;
        }
        body.push(stripIndent(lines[j], indent));
      }
      blocks.push({ kind: 'code', line: ln, lang: fence.lang, text: body.join('\n'), closed, fence: fence.char, endLine: closed ? j + 1 : lines.length });
      i = closed ? j : lines.length;
      continue;
    }

    if (indent < 4) {
      const h = trimmed[0] === '#' ? atxHeading(trimmed) : null;
      if (h) {
        para = null;
        closeList();
        blocks.push({ kind: 'heading', line: ln, level: h.level, text: h.text, style: 'atx' });
        continue;
      }
      if (para && !para.quote && (/^=+$/.test(trimmed) || /^-+$/.test(trimmed))) {
        const p: MdParagraph = para;
        const idx = blocks.lastIndexOf(p);
        const heading: MdHeading = { kind: 'heading', line: p.line, level: trimmed[0] === '=' ? 1 : 2, text: p.lines.map((l) => l.text).join(' '), style: 'setext' };
        if (idx >= 0) blocks[idx] = heading;
        para = null;
        continue;
      }
      if (isBreak(trimmed)) {
        para = null;
        closeList();
        blocks.push({ kind: 'break', line: ln });
        continue;
      }
      if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        para = null;
        closeList();
        const rows: string[][] = [splitRow(trimmed)];
        let j = i + 2;
        while (j < lines.length && lines[j].trim() && lines[j].includes('|')) {
          rows.push(splitRow(lines[j]));
          j++;
        }
        blocks.push({ kind: 'table', line: ln, rows });
        i = j - 1;
        continue;
      }
      if (trimmed[0] === '>') {
        let k = 0;
        while (k < trimmed.length && (trimmed[k] === '>' || trimmed[k] === ' ' || trimmed[k] === '\t')) k++;
        const content = trimmed.slice(k);
        closeList();
        if (!content) {
          para = null;
          continue;
        }
        if (para && para.quote) {
          para.lines.push({ text: content, line: ln });
          para.text += '\n' + content;
        } else {
          para = { kind: 'paragraph', line: ln, text: content, lines: [{ text: content, line: ln }], quote: true };
          blocks.push(para);
        }
        continue;
      }
    }

    const li = indent < (list ? 12 : 4) ? listMarker(raw, indent) : null;
    if (li) {
      para = null;
      if (!list) {
        list = { kind: 'list', line: ln, items: [] };
        blocks.push(list);
      }
      const item: MdListItem = { text: li.rest, line: ln, marker: li.marker, ordered: li.ordered, depth: Math.min(10, Math.floor(indent / 2)) };
      (list as MdList).items.push(item);
      lastItem = item;
      blankInList = false;
      continue;
    }

    if (list && lastItem) {
      if (!blankInList || indent >= 2) {
        (lastItem as MdListItem).text += ' ' + trimmed;
        continue;
      }
      closeList();
    }

    if (indent >= 4 && !para) {
      const body: string[] = [stripIndent(raw, 4)];
      let j = i + 1;
      while (j < lines.length && (leadingSpaces(lines[j]) >= 4 || !lines[j].trim())) {
        body.push(stripIndent(lines[j], 4));
        j++;
      }
      while (body.length && !body[body.length - 1].trim()) body.pop();
      blocks.push({ kind: 'code', line: ln, lang: '', text: body.join('\n'), closed: true, fence: 'indent', endLine: j });
      i = j - 1;
      continue;
    }

    if (para && !para.quote) {
      para.lines.push({ text: trimmed, line: ln });
      para.text += '\n' + trimmed;
    } else {
      para = { kind: 'paragraph', line: ln, text: trimmed, lines: [{ text: trimmed, line: ln }], quote: false };
      blocks.push(para);
    }
  }
  return blocks;
}

// ------------------------------------------------------------ inline

export interface MdLink {
  text: string;
  url: string;
}

export interface Inline {
  /** Text with markup removed (code span contents kept). */
  plain: string;
  /** Prose only: code spans removed. */
  prose: string;
  code: string[];
  links: MdLink[];
}

const LINK = /!?\[([^[\]\n]{0,500})\]\(([^()\s]{0,2000})(?:\s+"[^"\n]{0,200}")?\s*\)/g;

function proseOf(s: string, links: MdLink[]): string {
  let t = s;
  if (t.includes('](')) {
    t = t.replace(LINK, (_m, text: string, url: string) => {
      links.push({ text, url });
      return text;
    });
  }
  return t
    .replace(/\*+/g, '')
    .replace(/~~/g, '')
    .replace(/(^|[^\p{L}\p{N}])__(?=\S)/gu, '$1')
    .replace(/(?<=\S)__(?![\p{L}\p{N}])/gu, '');
}

/** Reads code spans, links and emphasis in one line or paragraph of inline text. */
export function inline(text: string): Inline {
  const code: string[] = [];
  const links: MdLink[] = [];
  if (!text.includes('`')) {
    const p = proseOf(text, links);
    return { plain: p, prose: p, code, links };
  }
  // Backtick runs, each matched with the next run of the same length.
  const runs: { s: number; n: number }[] = [];
  for (let i = 0; i < text.length; ) {
    if (text[i] === '`') {
      let j = i;
      while (text[j] === '`') j++;
      runs.push({ s: i, n: j - i });
      i = j;
    } else {
      const k = text.indexOf('`', i);
      if (k < 0) break;
      i = k;
    }
  }
  const byLen = new Map<number, number[]>();
  runs.forEach((r, idx) => {
    const arr = byLen.get(r.n);
    if (arr) arr.push(idx);
    else byLen.set(r.n, [idx]);
  });
  const ptr = new Map<number, number>();
  let plain = '';
  let prose = '';
  let pos = 0;
  let r = 0;
  while (r < runs.length) {
    const open = runs[r];
    if (open.s < pos) {
      r++;
      continue;
    }
    const same = byLen.get(open.n)!;
    let p = ptr.get(open.n) ?? 0;
    while (p < same.length && same[p] <= r) p++;
    ptr.set(open.n, p);
    if (p >= same.length) {
      r++;
      continue;
    }
    const closeIdx = same[p];
    const close = runs[closeIdx];
    const before = proseOf(text.slice(pos, open.s), links);
    const content = text.slice(open.s + open.n, close.s).trim();
    plain += before + content;
    prose += before + ' ';
    code.push(content);
    pos = close.s + close.n;
    r = closeIdx + 1;
  }
  const rest = proseOf(text.slice(pos), links);
  plain += rest;
  prose += rest;
  return { plain, prose, code, links };
}

/** GitHub-style anchor for a heading. */
export function slugOf(plainHeading: string): string {
  return plainHeading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}
