/**
 * Scores a Markdown document (project instructions, README, skill file)
 * against its rubric. Each function below is one criterion; each returns a
 * value from 0 to 1 and the issues that cost it, in words a player can act on.
 */
import {
  asCode,
  cap,

  compilePattern,
  contains,
  draft,
  fillerIn,
  isCommandLine,
  looksShell,
  lower,
  mentions,
  norm,
  onlyRestates,
  codePlaceholdersIn,
  placeholdersIn,
  secretsIn,
  sentencesOf,
  short,
  squash,
  weightOf,
  wordCount,
  type Draft,
  type Issue,
} from './common';
import { inline, parseMarkdown, slugOf, type MdBlock, type MdCode, type MdDoc, type MdLink } from './markdown';
import type { DocKind, DocRubric, DocSectionRule } from './types';

interface Unit {
  kind: 'heading' | 'paragraph' | 'item' | 'code' | 'row';
  line: number;
  raw: string;
  plain: string;
  prose: string;
  code: string[];
  links: MdLink[];
  /** Heading indices this unit sits under (its own, for a heading). */
  path: number[];
  block: MdBlock;
  sq: string;
  low: string;
  codeSq: string[];
}

interface Head {
  unit: number;
  level: number;
  plain: string;
  line: number;
  style: 'atx' | 'setext';
}

export interface Model {
  doc: MdDoc;
  units: Unit[];
  heads: Head[];
  fmText: string;
  words: number;
  /** Rubric section name -> heading index. */
  sectionOf: Map<string, number>;
}

function makeUnit(kind: Unit['kind'], line: number, raw: string, path: number[], block: MdBlock, codeText?: string): Unit {
  const inl = codeText !== undefined ? { plain: codeText, prose: '', code: [codeText], links: [] } : inline(raw);
  const sq = squash(inl.plain);
  return { kind, line, raw, plain: inl.plain, prose: inl.prose, code: inl.code, links: inl.links, path, block, sq, low: lower(sq), codeSq: inl.code.map(squash) };
}

export function buildModel(text: string, rubric: DocRubric): Model {
  const doc = parseMarkdown(text);
  const units: Unit[] = [];
  const heads: Head[] = [];
  const stack: number[] = [];
  for (const b of doc.blocks) {
    switch (b.kind) {
      case 'heading': {
        while (stack.length && heads[stack[stack.length - 1]].level >= b.level) stack.pop();
        const idx = heads.length;
        stack.push(idx);
        const u = makeUnit('heading', b.line, b.text, [...stack], b);
        heads.push({ unit: units.length, level: b.level, plain: u.plain, line: b.line, style: b.style });
        units.push(u);
        break;
      }
      case 'paragraph':
        units.push(makeUnit('paragraph', b.line, b.lines.map((l) => l.text).join(' '), [...stack], b));
        break;
      case 'list':
        for (const item of b.items) units.push(makeUnit('item', item.line, item.text, [...stack], b));
        break;
      case 'code':
        units.push(makeUnit('code', b.line, b.text, [...stack], b, b.text));
        break;
      case 'table':
        b.rows.forEach((row, r) => units.push(makeUnit('row', b.line + (r === 0 ? 0 : r + 1), row.join(' | '), [...stack], b)));
        break;
      default:
        break;
    }
  }
  const fmValues: string[] = [];
  for (const v of doc.frontMatter?.entries.values() ?? []) fmValues.push(Array.isArray(v) ? v.join(' ') : v);
  const fmText = fmValues.join('\n');
  let words = wordCount(fmText);
  for (const u of units) words += wordCount(u.plain);
  return { doc, units, heads, fmText, words, sectionOf: matchSections(rubric.sections, heads) };
}

function stripNumbering(s: string): string {
  return s.replace(/^\s*(?:\d+[.)]?|step\s+\d+[:.]?|[ivx]+\.)\s+/i, '');
}

/** Pairs each rubric section with the heading that best matches one of its names. */
function matchSections(sections: DocSectionRule[], heads: Head[]): Map<string, number> {
  const pairs: { s: number; h: number; score: number }[] = [];
  const h1Count = heads.filter((h) => h.level === 1).length;
  heads.forEach((head, h) => {
    const hn = norm(stripNumbering(head.plain));
    if (!hn) return;
    const padded = ` ${hn} `;
    sections.forEach((sec, s) => {
      let best = 0;
      for (const alias of [sec.name, ...(sec.aliases ?? [])]) {
        const an = norm(stripNumbering(alias));
        if (!an) continue;
        if (an === hn) best = Math.max(best, 3);
        else if (padded.includes(` ${an} `)) best = Math.max(best, 2 + an.length / hn.length / 2);
      }
      // A lone top-level title is the document's name, not a section, unless nothing else fits.
      if (best > 0 && head.level === 1 && h1Count === 1 && heads.length > 1) best -= 0.75;
      if (best > 0) pairs.push({ s, h, score: best });
    });
  });
  pairs.sort((a, b) => b.score - a.score || a.s - b.s || a.h - b.h);
  const out = new Map<string, number>();
  const usedH = new Set<number>();
  for (const p of pairs) {
    const name = sections[p.s].name;
    if (out.has(name) || usedH.has(p.h)) continue;
    out.set(name, p.h);
    usedH.add(p.h);
  }
  return out;
}

/** Units under heading k (its subsections included), not the heading itself. */
function sectionUnits(m: Model, k: number, direct = false): Unit[] {
  const head = m.heads[k];
  let end = m.units.length;
  for (let j = k + 1; j < m.heads.length; j++) {
    if (direct || m.heads[j].level <= head.level) {
      end = m.heads[j].unit;
      break;
    }
  }
  return m.units.slice(head.unit + 1, end);
}

function isRestatingOnly(m: Model, k: number): boolean {
  const all = sectionUnits(m, k).filter((u) => u.kind !== 'heading');
  return all.length === 1 && all[0].kind === 'paragraph' && onlyRestates(all[0].plain, m.heads[k].plain);
}

// ------------------------------------------------------------ works

export function keyFactsCriterion(m: Model, rubric: DocRubric): Draft {
  const facts = rubric.keyFacts;
  if (!facts.length) return draft('keyFacts', 'Key facts', 'works', 1, [], ['Not checked: the rubric lists no key facts.'], false);
  const fmUnit = { sq: squash(m.fmText), low: lower(squash(m.fmText)), codeSq: [] as string[], path: [] as number[] };
  const pool = [...m.units, fmUnit];
  const docLow = lower(m.units.map((u) => u.sq).join('\n') + '\n' + fmUnit.sq);
  const issues: Issue[] = [];
  const notes: string[] = [];
  let got = 0;
  let total = 0;
  for (const fact of facts) {
    const w = weightOf(fact.importance);
    total += w;
    const secHead = fact.section ? m.sectionOf.get(fact.section) : undefined;
    let best = { credit: 0, exact: false, inCode: false, inSec: false, alt: fact.anyOf[0] };
    search: for (const alt of fact.anyOf) {
      const altSq = squash(alt);
      const altLow = lower(altSq);
      if (!contains(docLow, altLow)) continue;
      for (const u of pool) {
        const exact = contains(u.sq, altSq);
        if (!exact && !contains(u.low, altLow)) continue;
        const inCode = u.codeSq.some((c) => contains(c, altSq) || contains(lower(c), altLow));
        const inSec = !fact.section || (secHead !== undefined && u.path.includes(secHead));
        const credit = (exact ? 1 : 0.75) * (fact.inCode && !inCode ? 0.6 : 1) * (fact.section && !inSec ? 0.7 : 1);
        if (credit > best.credit) best = { credit, exact, inCode, inSec, alt };
        if (credit >= 1) break search;
      }
    }
    got += w * best.credit;
    const what = `${fact.label} ${asCode(best.alt)}`;
    if (best.credit === 0) {
      issues.push({
        message: fact.section ? `The ${fact.section} section is missing ${fact.label} ${asCode(fact.anyOf[0])}.` : `The document is missing ${fact.label} ${asCode(fact.anyOf[0])}.`,
        weight: w,
      });
    } else if (best.credit < 1) {
      const parts: string[] = [];
      if (fact.section && !best.inSec) parts.push(`${cap(what)} is there but belongs in the ${fact.section} section.`);
      if (fact.inCode && !best.inCode) parts.push(`${cap(what)} should be written as code (in backticks or a code block).`);
      if (!best.exact) parts.push(`Write ${fact.label} exactly as ${asCode(best.alt)} (the capitalisation differs).`);
      issues.push({ message: parts.join(' '), weight: w * (1 - best.credit) });
    } else notes.push(`Found ${fact.label}.`);
  }
  return draft('keyFacts', 'Key facts', 'works', got / total, issues, notes);
}

export function completenessCriterion(m: Model, rubric: DocRubric): Draft {
  const sections = rubric.sections;
  if (!sections.length) return draft('completeness', 'Completeness', 'works', 1, [], ['Not checked: the rubric lists no sections.'], false);
  const issues: Issue[] = [];
  const notes: string[] = [];
  let got = 0;
  let total = 0;
  for (const s of sections) {
    const w = weightOf(s.importance);
    total += w;
    const k = m.sectionOf.get(s.name);
    if (k === undefined) {
      const example = s.aliases?.find((a) => a.trim()) ?? s.name;
      issues.push({ message: `The document has no ${s.name} section (a heading such as "${example}").`, weight: w });
      continue;
    }
    const content = sectionUnits(m, k).filter((u) => u.kind !== 'heading');
    const contentWords = content.reduce((n, u) => n + wordCount(u.plain), 0);
    if (contentWords < 2) {
      got += w * 0.25;
      issues.push({ message: `The ${s.name} section is empty; add what it should say.`, weight: w * 0.75 });
      continue;
    }
    if (content.every((u) => u.kind !== 'code' && placeholdersIn(u.prose).length > 0)) {
      got += w * 0.25;
      issues.push({ message: `The ${s.name} section holds only a placeholder; write the real content.`, weight: w * 0.75 });
      continue;
    }
    if (isRestatingOnly(m, k)) {
      got += w * 0.25;
      issues.push({ message: `The ${s.name} section only repeats its heading; add the actual content.`, weight: w * 0.75 });
      continue;
    }
    const must = s.mustContain ?? [];
    if (!must.length) {
      got += w;
      notes.push(`${s.name}: present.`);
      continue;
    }
    const text = sectionUnits(m, k).map((u) => u.sq).join('\n');
    const missing = must.filter((x) => !mentions(text, x));
    got += w * (0.4 + 0.6 * (1 - missing.length / must.length));
    for (const x of missing) issues.push({ message: `The ${s.name} section does not mention "${x}".`, weight: (w * 0.6) / must.length });
    if (!missing.length) notes.push(`${s.name}: present and complete.`);
  }
  return draft('completeness', 'Completeness', 'works', got / total, issues, notes);
}

function longestIncreasing(xs: number[]): boolean[] {
  const n = xs.length;
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++)
      if (xs[j] < xs[i] && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
  let end = 0;
  for (let i = 1; i < n; i++) if (len[i] > len[end]) end = i;
  const keep = new Array<boolean>(n).fill(false);
  for (let i = n ? end : -1; i >= 0; i = prev[i]) keep[i] = true;
  return keep;
}

export function structureCriterion(m: Model, rubric: DocRubric): Draft {
  const issues: Issue[] = [];
  const order = (rubric.order ?? []).filter((n) => m.sectionOf.has(n));
  const useOrder = (rubric.order ?? []).length >= 2;
  const wOrder = useOrder ? 0.5 : 0;
  const wTitle = useOrder ? 0.25 : 0.5;
  const wLevels = useOrder ? 0.25 : 0.5;

  // One top-level title, first.
  const h1 = m.heads.filter((h) => h.level === 1);
  let title = 1;
  if (h1.length === 0) {
    title = 0;
    issues.push({ message: 'The document has no top-level title; start it with a `# ` title line.', weight: wTitle });
  } else if (h1.length > 1) {
    title = Math.max(0, 1 - 0.25 * (h1.length - 1));
    issues.push({ message: `The document has ${h1.length} top-level (\`#\`) headings; keep one title and make the sections \`##\`.`, weight: wTitle * (1 - title) });
  } else if (m.heads[0] !== h1[0]) {
    title = 0.6;
    issues.push({ message: 'The top-level title should be the first heading.', weight: wTitle * 0.4 });
  }

  // Heading levels do not skip.
  let skips = 0;
  for (let i = 1; i < m.heads.length; i++) {
    const prev = m.heads[i - 1].level;
    const h = m.heads[i];
    if (h.level > prev + 1) {
      skips++;
      if (skips <= 3) {
        issues.push({ message: `The heading "${short(h.plain, 40)}" (line ${h.line}) jumps from level ${prev} to ${h.level}; use level ${prev + 1}.`, weight: wLevels * 0.34 });
      }
    }
  }
  const levels = Math.max(0, 1 - 0.34 * skips);

  // Required order.
  let ordered = 1;
  if (useOrder && order.length >= 2) {
    const pos = order.map((n) => m.sectionOf.get(n)!);
    const keep = longestIncreasing(pos);
    const kept = keep.filter(Boolean).length;
    ordered = kept / order.length;
    if (kept < order.length) {
      const out = order.filter((_, i) => !keep[i]);
      issues.push({
        message: `Sections are out of order: put them as ${order.join(' → ')} (${out.join(', ')} ${out.length === 1 ? 'is' : 'are'} out of place).`,
        weight: wOrder * (1 - ordered),
      });
    }
  }
  const value = wOrder * ordered + wTitle * title + wLevels * levels;
  return draft('structure', 'Structure', 'works', value, issues);
}

// ------------------------------------------------------------ engineering

export function validityCriterion(m: Model, rubric: DocRubric): Draft {
  const issues: Issue[] = [];
  const rules = rubric.frontMatter ?? [];
  const fm = m.doc.frontMatter;
  let fmScore = 1;
  let penalty = 0;
  if (rules.length) {
    const required = rules.filter((r) => r.required).map((r) => `\`${r.key}\``);
    if (!fm) {
      fmScore = 0;
      issues.push({ message: `The document has no front matter; start it with a \`---\` block holding ${required.join(', ') || 'its fields'}.`, weight: 1 });
    } else if (!fm.closed) {
      fmScore = 0;
      issues.push({ message: fm.errors[0]?.message ?? 'The front matter is never closed.', weight: 1 });
    } else {
      let checks = 0;
      let passed = 0;
      const fmIssues: Issue[] = [];
      for (const rule of rules) {
        const v = fm.entries.get(rule.key);
        const text = v === undefined ? '' : Array.isArray(v) ? v.join(', ') : v;
        if (!text.trim()) {
          if (rule.required) {
            checks++;
            fmIssues.push({ message: `The front matter is missing the required \`${rule.key}\` field.`, weight: 1 });
          }
          continue;
        }
        checks++;
        passed++;
        if (rule.maxLength) {
          checks++;
          if (text.length <= rule.maxLength) passed++;
          else fmIssues.push({ message: `The ${rule.key} front-matter field is ${text.length} characters; the limit is ${rule.maxLength}.`, weight: 1 });
        }
        if (rule.pattern) {
          checks++;
          if (compilePattern(rule.pattern, false)?.test(text)) passed++;
          else fmIssues.push({ message: `The ${rule.key} front-matter field ("${short(text, 40)}") does not have the required form (${rule.pattern}).`, weight: 1 });
        }
        const mention = rule.mustMention ?? [];
        if (mention.length) {
          checks++;
          const missing = mention.filter((x) => !mentions(text, x));
          passed += 1 - missing.length / mention.length;
          for (const x of missing) fmIssues.push({ message: `The ${rule.key} front-matter field should mention "${x}".`, weight: 1 / mention.length });
        }
      }
      fmScore = checks ? passed / checks : 1;
      for (const i of fmIssues) issues.push({ message: i.message, weight: i.weight / Math.max(1, checks) });
      for (const e of fm.errors.slice(0, 4)) {
        fmScore -= 0.25;
        issues.push({ message: `Front matter: ${e.message}`, weight: 0.25 });
      }
      fmScore = Math.max(0, fmScore);
    }
  } else if (fm && fm.errors.length) {
    for (const e of fm.errors.slice(0, 3)) {
      penalty += 0.15;
      issues.push({ message: `Front matter: ${e.message}`, weight: 0.15 });
    }
  }

  // Code fences closed.
  const unclosed = m.doc.blocks.find((b): b is MdCode => b.kind === 'code' && !b.closed);
  if (unclosed) {
    penalty += 0.5;
    issues.push({ message: `The code block that opens on line ${unclosed.line} is never closed; add a closing \`\`\` line.`, weight: 0.5 });
  }

  // Commands outside code.
  let cmd = 0;
  for (const b of m.doc.blocks) {
    const lines = b.kind === 'paragraph' && !b.quote ? b.lines : b.kind === 'list' ? b.items.map((i) => ({ text: i.text, line: i.line })) : [];
    for (const l of lines) {
      if (l.text.startsWith('`') || !isCommandLine(l.text)) continue;
      cmd++;
      if (cmd <= 3) {
        penalty += 0.1;
        issues.push({ message: `Line ${l.line} (\`${short(l.text, 40)}\`) is a command; put it in a code block or backticks.`, weight: 0.1 });
      }
    }
  }

  // Links to headings that exist.
  const slugs = new Set<string>();
  for (const h of m.heads) {
    const s = slugOf(h.plain);
    if (slugs.has(s)) for (let n = 1; n < 50 && slugs.has(s); n++) slugs.add(`${s}-${n}`);
    slugs.add(s);
  }
  let broken = 0;
  for (const u of m.units) {
    for (const link of u.links) {
      if (!link.url.startsWith('#') || link.url.length < 2) continue;
      let target = link.url.slice(1);
      try {
        target = decodeURIComponent(target);
      } catch {
        // keep as written
      }
      if (slugs.has(target.toLowerCase())) continue;
      broken++;
      if (broken <= 3) {
        penalty += 0.15;
        issues.push({ message: `The link to \`${short(link.url, 40)}\` (line ${u.line}) points at a heading that does not exist.`, weight: 0.15 });
      }
    }
  }
  return draft('validity', 'Validity', 'engineering', fmScore * Math.max(0, 1 - penalty), issues);
}

export function concisionCriterion(m: Model, rubric: DocRubric): Draft {
  const issues: Issue[] = [];
  const limits = rubric.limits ?? {};
  let budget = 1;
  if (limits.maxWords && m.words > limits.maxWords) {
    budget = Math.max(0, 1 - (0.7 * (m.words - limits.maxWords)) / limits.maxWords);
    issues.push({ message: `The document is ${m.words} words; the budget is ${limits.maxWords}. Cut repetition and filler.`, weight: 1 - budget });
  } else if (limits.minWords && m.words < limits.minWords) {
    budget = m.words / limits.minWords;
    issues.push({ message: `The document is ${m.words} words; it should be at least ${limits.minWords}. Say what each section needs.`, weight: 1 - budget });
  }
  let penalty = 0;

  // The same sentence or bullet more than once.
  const seen = new Map<string, { count: number; text: string }>();
  for (const u of m.units) {
    if (u.kind !== 'paragraph' && u.kind !== 'item') continue;
    const parts = sentencesOf(u.plain);
    for (const s of parts) {
      const key = norm(s);
      const n = key.split(' ').length;
      if (n >= 6 || (u.kind === 'item' && parts.length === 1 && n >= 3)) {
        const e = seen.get(key);
        if (e) e.count++;
        else seen.set(key, { count: 1, text: s });
      }
    }
  }
  let repeatPenalty = 0;
  for (const e of seen.values()) {
    if (e.count < 2) continue;
    const p = Math.min(0.6 - repeatPenalty, 0.08 * (e.count - 1));
    if (p <= 0) break;
    repeatPenalty += p;
    issues.push({ message: `This is said ${e.count} times: "${short(e.text, 50)}". Say it once.`, weight: p });
  }
  penalty += repeatPenalty;

  // A section that opens by restating its heading ("This section covers setup.") before saying anything.
  m.heads.forEach((h, k) => {
    const direct = sectionUnits(m, k, true);
    const all = sectionUnits(m, k).filter((u) => u.kind !== 'heading');
    const first = direct[0]?.kind === 'paragraph' ? sentencesOf(direct[0].plain) : [];
    const more = all.length > 1 || first.length > 1;
    if (first.length && more && onlyRestates(first[0], h.plain)) {
      penalty += 0.06;
      issues.push({ message: `The ${short(h.plain, 30)} section opens by repeating its heading ("${short(first[0], 40)}"); cut that sentence.`, weight: 0.06 });
    }
  });

  // Filler phrases.
  const filler = new Map<string, number>();
  for (const u of m.units) if (u.kind !== 'code') for (const f of fillerIn(u.prose)) filler.set(f, (filler.get(f) ?? 0) + 1);
  let fillerPenalty = 0;
  for (const [phrase, count] of filler) {
    const p = Math.min(0.15 - fillerPenalty, 0.03 * count);
    if (p <= 0) break;
    fillerPenalty += p;
    issues.push({ message: `Cut filler such as "${phrase}".`, weight: p });
  }
  penalty += fillerPenalty;
  return draft('concision', 'Concision', 'engineering', budget - penalty, issues, [`${m.words} words.`]);
}

export function cleanlinessCriterion(m: Model, rubric: DocRubric): Draft {
  const issues: Issue[] = [];
  let penalty = 0;
  const add = (message: string, weight: number) => {
    penalty += weight;
    issues.push({ message, weight });
  };
  let placeholders = 0;
  const proseUnits: { text: string; line: number; links: MdLink[] }[] = m.units.filter((u) => u.kind !== 'code').map((u) => ({ text: u.prose, line: u.line, links: u.links }));
  if (m.fmText) proseUnits.push({ text: m.fmText, line: 1, links: [] });
  // "your-key-here" is a fill-me-in marker even inside code.
  for (const u of m.units) if (u.code.length) for (const c of u.code) for (const what of codePlaceholdersIn(c)) if (++placeholders <= 4) add(`Remove the placeholder "${what}" (line ${u.line}).`, 0.25);
  for (const u of proseUnits) {
    for (const what of placeholdersIn(u.text)) {
      if (++placeholders <= 4) add(`Remove the placeholder "${what}" (line ${u.line}).`, 0.25);
    }
    for (const link of u.links) {
      if (!link.url.trim() || !link.text.trim()) {
        if (++placeholders <= 4) add(`The link "${short(link.text || link.url, 30)}" on line ${u.line} is empty; give it text and a target.`, 0.2);
      }
    }
  }
  for (const f of rubric.forbidden ?? []) {
    const re = compilePattern(f.pattern);
    if (!re) continue;
    const hits: number[] = [];
    m.doc.lines.forEach((line, i) => {
      if (hits.length < 4 && re.test(line.length > 10000 ? line.slice(0, 10000) : line)) hits.push(i + 1);
    });
    if (hits.length) add(`Remove ${f.label} (line ${hits.join(', ')}): the challenge forbids it.`, 0.4 + 0.1 * (hits.length - 1));
  }
  let secrets = 0;
  m.doc.lines.forEach((line, i) => {
    if (secrets >= 3) return;
    const found = secretsIn(line);
    if (found.length) {
      secrets++;
      add(`Line ${i + 1} looks like it holds a secret (${found[0]}); never put credentials in the document.`, 0.5);
    }
  });
  return draft('cleanliness', 'Cleanliness', 'engineering', 1 - penalty, issues);
}

// ------------------------------------------------------------ looks

const VAGUE_HEADINGS = new Set(['misc', 'miscellaneous', 'other', 'others', 'stuff', 'info', 'information', 'details', 'general', 'section', 'untitled', 'more', 'extra', 'things', 'heading', 'title']);
const STEP_START = /^(first|firstly|second|secondly|third|thirdly|then|next|after that|afterwards|finally|lastly|step \d+)\b/i;

export function scannableCriterion(m: Model, rubric: DocRubric): Draft {
  const issues: Issue[] = [];
  let penalty = 0;
  const add = (message: string, weight: number) => {
    penalty += weight;
    issues.push({ message, weight });
  };
  if (!m.heads.length && m.words > 150) add(`The document is ${m.words} words with no headings; add headings so it can be scanned.`, 0.5);

  const rubricHeads = new Set(m.sectionOf.values());
  let vague = 0;
  m.heads.forEach((h, k) => {
    const n = norm(h.plain);
    if (rubricHeads.has(k)) return;
    if (n.length < 2 || VAGUE_HEADINGS.has(n) || /^(section|part|chapter)( \d+)?$/.test(n)) {
      if (++vague <= 3) add(`The heading "${short(h.plain, 30)}" says little; name what the section is about.`, 0.05);
    }
  });

  const title = m.heads.find((h) => h.level === 1);
  if (title) {
    const next = m.units[title.unit + 1];
    if (!next || next.kind !== 'paragraph' || placeholdersIn(next.prose).length || wordCount(next.plain) < 3) {
      add('Add a one-sentence description under the title.', 0.15);
    }
  }

  let steps = 0;
  let walls = 0;
  for (const u of m.units) {
    if (u.kind !== 'paragraph') continue;
    const sentences = sentencesOf(u.plain);
    const stepStarts = sentences.filter((s) => STEP_START.test(s)).length;
    const numbered = (u.plain.match(/(?:^|\s)\(?\d{1,2}[.)]\s/g) ?? []).length;
    if ((stepStarts >= 3 || numbered >= 3) && ++steps <= 3) add(`The steps in the paragraph on line ${u.line} run together; make them a numbered list.`, 0.12);
    const n = wordCount(u.plain);
    if (n > 120 && ++walls <= 3) add(`The paragraph on line ${u.line} is ${n} words; split it or turn it into a list.`, 0.1);
  }

  for (const s of rubric.sections) {
    const k = m.sectionOf.get(s.name);
    if (k === undefined || (s.mustContain ?? []).length < 3) continue;
    const units = sectionUnits(m, k);
    const listed = units.some((u) => u.kind === 'item' || u.kind === 'row' || u.kind === 'code');
    if (!listed && units.some((u) => u.kind === 'paragraph')) add(`The ${s.name} section packs several items into a paragraph; use a list or a table.`, 0.1);
  }

  const max = rubric.limits?.maxLineLength;
  if (max) {
    const skip = new Set<number>();
    for (const b of m.doc.blocks) {
      if (b.kind === 'code') for (let l = b.line; l <= b.endLine; l++) skip.add(l);
      if (b.kind === 'table') for (let l = b.line; l < b.line + b.rows.length + 1; l++) skip.add(l);
    }
    const fmEnd = m.doc.frontMatter?.endLine ?? 0;
    let over = 0;
    let first = { line: 0, len: 0 };
    m.doc.lines.forEach((line, i) => {
      const ln = i + 1;
      if (ln <= fmEnd || skip.has(ln) || line.length <= max) return;
      if (/^\s*(?:[-*+]\s+)?(?:<?https?:\/\/\S+>?|\[[^\]]*\]\([^)]*\))\s*$/.test(line.slice(0, 5000))) return;
      if (!over) first = { line: ln, len: line.length };
      over++;
    });
    if (over) add(`${over} line${over === 1 ? ' is' : 's are'} longer than ${max} characters (first: line ${first.line}, ${first.len}); break ${over === 1 ? 'it' : 'them'} up.`, Math.min(0.3, 0.05 * over));
  }
  return draft('scannable', 'Scannable', 'looks', 1 - penalty, issues);
}

export function consistencyCriterion(m: Model): Draft {
  const issues: Issue[] = [];
  let penalty = 0;
  const add = (message: string, weight: number) => {
    penalty += weight;
    issues.push({ message, weight });
  };
  const styles = new Set(m.heads.map((h) => h.style));
  if (styles.size > 1) add('Headings mix `#` and underlined styles; use one.', 0.25);

  const bullets = new Map<number, Set<string>>();
  const numbered = new Set<string>();
  for (const b of m.doc.blocks) {
    if (b.kind !== 'list') continue;
    for (const item of b.items) {
      if (item.ordered) numbered.add(item.marker);
      else {
        const set = bullets.get(item.depth) ?? new Set<string>();
        set.add(item.marker);
        bullets.set(item.depth, set);
      }
    }
  }
  const mixed = [...bullets.values()].find((s) => s.size > 1);
  if (mixed) add(`Bulleted lists use both ${[...mixed].map((x) => `\`${x}\``).join(' and ')}; pick one marker.`, 0.2);
  if (numbered.size > 1) add('Numbered lists use both `1.` and `1)`; pick one.', 0.1);

  let unlabelled = 0;
  const fenceChars = new Set<string>();
  for (const b of m.doc.blocks) {
    if (b.kind !== 'code') continue;
    if (b.fence !== 'indent') fenceChars.add(b.fence);
    if (b.lang || !looksShell(b.text)) continue;
    if (++unlabelled > 3) continue;
    add(
      b.fence === 'indent'
        ? `The indented code on line ${b.line} holds shell commands; use a fenced block labelled \`bash\`.`
        : `The code block on line ${b.line} holds shell commands but has no language label; open it with \`\`\`bash.`,
      0.12,
    );
  }
  if (fenceChars.size > 1) add('Code blocks mix ``` and ~~~ fences; use one.', 0.1);
  return draft('consistency', 'Consistency', 'looks', 1 - penalty, issues);
}

/** All eight criteria for a Markdown document. */
export function scoreMarkdown(_kind: DocKind, rubric: DocRubric, text: string): { drafts: Draft[]; words: number; error?: string } {
  const m = buildModel(text, rubric);
  if (!/[\p{L}\p{N}]/u.test(text.slice(0, 200000)) && !/[\p{L}\p{N}]/u.test(text)) {
    return { drafts: [], words: 0, error: 'The document has no readable text.' };
  }
  const drafts = [
    keyFactsCriterion(m, rubric),
    completenessCriterion(m, rubric),
    structureCriterion(m, rubric),
    validityCriterion(m, rubric),
    concisionCriterion(m, rubric),
    cleanlinessCriterion(m, rubric),
    scannableCriterion(m, rubric),
    consistencyCriterion(m),
  ];
  if (m.doc.truncated) drafts[4].notes.push('Only the first 1.2 million characters were read.');
  return { drafts, words: m.words };
}

