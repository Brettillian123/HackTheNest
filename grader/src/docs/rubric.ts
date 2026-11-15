/**
 * Checks a rubric before grading. Every problem is listed in plain words for
 * the challenge author; a broken rubric is never a zero for the player.
 */
import { compilePattern } from './common';
import { DOC_KINDS, DocRubricError, type DocKind, type DocRubric } from './types';

const IMPORTANCE = ['critical', 'major', 'normal', 'minor'];
const FACT_IMPORTANCE = ['critical', 'major', 'normal'];
export const JSON_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
const TOP_KEYS = ['sections', 'keyFacts', 'forbidden', 'limits', 'frontMatter', 'order', 'tools'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);

/** Lists what is wrong with a rubric (empty when it is fine). */
export function rubricProblems(kind: unknown, rubric: unknown): string[] {
  const p: string[] = [];
  if (!DOC_KINDS.includes(kind as DocKind)) {
    p.push(`"kind" must be one of ${DOC_KINDS.map((k) => `"${k}"`).join(', ')}; it is ${JSON.stringify(kind)?.slice(0, 40)}.`);
  }
  if (!isObj(rubric)) {
    p.push('The rubric must be a JSON object.');
    return p;
  }
  for (const key of Object.keys(rubric)) {
    if (!TOP_KEYS.includes(key)) p.push(`Unknown rubric field "${key.slice(0, 40)}" (known fields: ${TOP_KEYS.join(', ')}).`);
  }
  const tools = kind === 'mcp-tools';

  // sections
  const sectionNames = new Set<string>();
  if (!Array.isArray(rubric.sections)) p.push('"sections" must be a list (it may be empty).');
  else {
    rubric.sections.forEach((s, i) => {
      const at = `Section ${i + 1}`;
      if (!isObj(s)) return void p.push(`${at} must be an object.`);
      if (!isText(s.name)) p.push(`${at} needs a "name".`);
      else if (sectionNames.has(s.name)) p.push(`Two sections are named "${s.name}".`);
      else sectionNames.add(s.name);
      const label = isText(s.name) ? `Section "${s.name}"` : at;
      if (!Array.isArray(s.aliases) || !s.aliases.every((a) => typeof a === 'string')) p.push(`${label}: "aliases" must be a list of headings (it may be empty).`);
      if (s.importance !== undefined && !IMPORTANCE.includes(s.importance as string)) p.push(`${label}: "importance" must be one of ${IMPORTANCE.join(', ')}.`);
      if (s.mustContain !== undefined && !isTextList(s.mustContain)) p.push(`${label}: "mustContain" must be a list of non-empty strings.`);
    });
    if (tools && rubric.sections.length) p.push('"sections" is not used for kind "mcp-tools"; leave it empty and list "tools".');
  }

  // tools
  const toolNames = new Set<string>();
  if (rubric.tools !== undefined) {
    if (!Array.isArray(rubric.tools)) p.push('"tools" must be a list.');
    else {
      if (!tools && rubric.tools.length) p.push('"tools" is only used for kind "mcp-tools".');
      rubric.tools.forEach((t, i) => {
        const at = `Tool ${i + 1}`;
        if (!isObj(t)) return void p.push(`${at} must be an object.`);
        if (!isText(t.name)) p.push(`${at} needs a "name".`);
        else if (toolNames.has(t.name)) p.push(`Two tools are named "${t.name}".`);
        else toolNames.add(t.name);
        const label = isText(t.name) ? `Tool "${t.name}"` : at;
        if (t.aliases !== undefined && !isTextList(t.aliases)) p.push(`${label}: "aliases" must be a list of names.`);
        if (t.mustDescribe !== undefined && !isTextList(t.mustDescribe)) p.push(`${label}: "mustDescribe" must be a list of non-empty strings.`);
        if (!Array.isArray(t.params)) p.push(`${label}: "params" must be a list (it may be empty).`);
        else {
          const seen = new Set<string>();
          t.params.forEach((q, j) => {
            if (!isObj(q) || !isText(q.name)) return void p.push(`${label}: parameter ${j + 1} needs a "name".`);
            if (seen.has(q.name)) p.push(`${label}: parameter "${q.name}" is listed twice.`);
            seen.add(q.name);
            if (!JSON_TYPES.includes(q.type as string)) p.push(`${label}: parameter "${q.name}" has type ${JSON.stringify(q.type)}; use one of ${JSON_TYPES.join(', ')}.`);
            if (typeof q.required !== 'boolean') p.push(`${label}: parameter "${q.name}" needs "required": true or false.`);
          });
        }
      });
    }
  }
  if (tools && (!Array.isArray(rubric.tools) || rubric.tools.length === 0)) p.push('Kind "mcp-tools" needs a non-empty "tools" list.');

  // key facts
  const labels = new Set<string>();
  if (!Array.isArray(rubric.keyFacts)) p.push('"keyFacts" must be a list (it may be empty).');
  else {
    rubric.keyFacts.forEach((f, i) => {
      const at = `Key fact ${i + 1}`;
      if (!isObj(f)) return void p.push(`${at} must be an object.`);
      if (!isText(f.label)) p.push(`${at} needs a "label".`);
      else if (labels.has(f.label)) p.push(`Two key facts are labelled "${f.label}".`);
      else labels.add(f.label);
      const label = isText(f.label) ? `Key fact "${f.label}"` : at;
      if (!isTextList(f.anyOf) || f.anyOf.length === 0) p.push(`${label}: "anyOf" must list at least one spelling.`);
      if (f.importance !== undefined && !FACT_IMPORTANCE.includes(f.importance as string)) p.push(`${label}: "importance" must be one of ${FACT_IMPORTANCE.join(', ')}.`);
      if (f.inCode !== undefined && typeof f.inCode !== 'boolean') p.push(`${label}: "inCode" must be true or false.`);
      if (f.section !== undefined) {
        const known = tools ? toolNames : sectionNames;
        if (!isText(f.section) || !known.has(f.section)) {
          p.push(`${label}: "section" ${JSON.stringify(f.section)?.slice(0, 40)} is not the name of a ${tools ? 'tool' : 'section'} in the rubric.`);
        }
      }
    });
  }

  // forbidden
  if (rubric.forbidden !== undefined) {
    if (!Array.isArray(rubric.forbidden)) p.push('"forbidden" must be a list.');
    else
      rubric.forbidden.forEach((f, i) => {
        const at = `Forbidden item ${i + 1}`;
        if (!isObj(f) || !isText(f.label) || typeof f.pattern !== 'string' || !f.pattern) return void p.push(`${at} needs a "label" and a "pattern".`);
        if (!compilePattern(f.pattern)) p.push(`Forbidden item "${f.label}": "${f.pattern.slice(0, 60)}" is not a valid regular expression.`);
        else if (compilePattern(f.pattern)!.test('')) p.push(`Forbidden item "${f.label}": the pattern matches empty text, so it would match every document.`);
      });
  }

  // limits
  if (rubric.limits !== undefined) {
    if (!isObj(rubric.limits)) p.push('"limits" must be an object.');
    else {
      const l = rubric.limits;
      for (const key of Object.keys(l)) {
        if (!['maxWords', 'minWords', 'maxLineLength'].includes(key)) p.push(`Unknown limit "${key.slice(0, 40)}" (known: maxWords, minWords, maxLineLength).`);
        else if (typeof l[key] !== 'number' || !Number.isInteger(l[key]) || (l[key] as number) <= 0) p.push(`Limit "${key}" must be a whole number above 0.`);
      }
      if (typeof l.maxWords === 'number' && typeof l.minWords === 'number' && l.minWords > l.maxWords) p.push('"minWords" is larger than "maxWords".');
    }
  }

  // front matter
  if (rubric.frontMatter !== undefined) {
    if (!Array.isArray(rubric.frontMatter)) p.push('"frontMatter" must be a list.');
    else {
      if (tools && rubric.frontMatter.length) p.push('"frontMatter" is not used for kind "mcp-tools".');
      const keys = new Set<string>();
      rubric.frontMatter.forEach((f, i) => {
        const at = `Front-matter rule ${i + 1}`;
        if (!isObj(f) || !isText(f.key)) return void p.push(`${at} needs a "key".`);
        const label = `Front-matter key "${f.key}"`;
        if (keys.has(f.key)) p.push(`${label} is listed twice.`);
        keys.add(f.key);
        if (typeof f.required !== 'boolean') p.push(`${label} needs "required": true or false.`);
        if (f.maxLength !== undefined && (typeof f.maxLength !== 'number' || !Number.isInteger(f.maxLength) || f.maxLength <= 0)) p.push(`${label}: "maxLength" must be a whole number above 0.`);
        if (f.pattern !== undefined && (typeof f.pattern !== 'string' || !compilePattern(f.pattern))) p.push(`${label}: "pattern" is not a valid regular expression.`);
        if (f.mustMention !== undefined && !isTextList(f.mustMention)) p.push(`${label}: "mustMention" must be a list of non-empty strings.`);
      });
    }
  }

  // order
  if (rubric.order !== undefined) {
    if (!isTextList(rubric.order)) p.push('"order" must be a list of section names.');
    else {
      const seen = new Set<string>();
      for (const name of rubric.order) {
        if (!sectionNames.has(name)) p.push(`"order" names "${name}", which is not a section in the rubric.`);
        if (seen.has(name)) p.push(`"order" names "${name}" twice.`);
        seen.add(name);
      }
    }
  }

  // something to grade
  const r = rubric as Partial<DocRubric>;
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  if (!p.length && count(r.sections) + count(r.keyFacts) + count(r.tools) + count(r.frontMatter) === 0) {
    p.push('The rubric checks nothing: add sections, key facts, front-matter rules or tools.');
  }
  return p;
}

/** Throws DocRubricError when the rubric or kind is malformed. */
export function validateRubric(kind: unknown, rubric: unknown): asserts rubric is DocRubric {
  const problems = rubricProblems(kind, rubric);
  if (problems.length) throw new DocRubricError(problems);
}
