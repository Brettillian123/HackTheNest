/**
 * Types for the document grader: project instructions (`CLAUDE.md`,
 * `AGENTS.md`), READMEs, skill files and MCP tool lists, scored against a
 * rubric the challenge author wrote.
 */

export type DocKind = 'instructions' | 'readme' | 'skill' | 'mcp-tools';

export const DOC_KINDS: readonly DocKind[] = ['instructions', 'readme', 'skill', 'mcp-tools'];

export type Importance = 'critical' | 'major' | 'normal' | 'minor';

export interface DocSectionRule {
  /** The name used in feedback ("The Setup section ..."). Always accepted as a heading too. */
  name: string;
  /** Other headings that count as this section (case and punctuation ignored). */
  aliases: string[];
  importance?: Importance;
  /** Words or phrases the section's text must contain (case ignored). */
  mustContain?: string[];
}

export interface DocKeyFact {
  /** Reads after "is missing", e.g. "the install command". */
  label: string;
  /** Acceptable spellings; any one counts. Matched exactly (spacing ignored). */
  anyOf: string[];
  importance?: 'critical' | 'major' | 'normal';
  /** Must appear inside a code span or code block. */
  inCode?: boolean;
  /** Must appear inside this section (a section name; for `mcp-tools`, a tool name). */
  section?: string;
}

export interface DocForbidden {
  label: string;
  /** A regular expression, matched case-insensitively line by line. */
  pattern: string;
}

export interface DocLimits {
  maxWords?: number;
  minWords?: number;
  maxLineLength?: number;
}

export interface DocFrontMatterRule {
  key: string;
  required: boolean;
  maxLength?: number;
  pattern?: string;
  mustMention?: string[];
}

export interface DocToolParam {
  name: string;
  type: string;
  required: boolean;
}

export interface DocToolRule {
  name: string;
  aliases?: string[];
  /** Words the tool's description (or its parameters' descriptions) must mention. */
  mustDescribe?: string[];
  params: DocToolParam[];
}

export interface DocRubric {
  sections: DocSectionRule[];
  keyFacts: DocKeyFact[];
  forbidden?: DocForbidden[];
  limits?: DocLimits;
  frontMatter?: DocFrontMatterRule[];
  order?: string[];
  tools?: DocToolRule[];
}

export interface DocGradeInput {
  kind: DocKind;
  rubric: DocRubric;
  /** The model's document. For `mcp-tools`, JSON text. */
  candidate: string;
}

export type DocGroup = 'works' | 'looks' | 'engineering';

export type DocCriterionId =
  | 'keyFacts'
  | 'completeness'
  | 'structure'
  | 'validity'
  | 'concision'
  | 'cleanliness'
  | 'scannable'
  | 'consistency';

export interface DocCriterion {
  id: DocCriterionId;
  name: string;
  group: DocGroup;
  /** 0 to 1. */
  value: number;
  /** What was found, naming the section, fact or tool. */
  notes: string[];
}

export interface DocFeedback {
  message: string;
  /** Roughly the points this costs out of 100. */
  points: number;
}

export interface DocGradeResult {
  version: string;
  kind: DocKind;
  /** 0 to 100, one decimal. */
  total: number;
  /** Each 0 to 100. */
  pillars: { works: number; looks: number; engineering: number };
  criteria: DocCriterion[];
  /** Most costly first, at most eight. */
  feedback: DocFeedback[];
  /** Words counted in the document. */
  words: number;
  /** Set when the document could not be graded at all (it then scores 0). */
  error?: string;
}

/** The rubric (or kind) is malformed: a problem for the challenge author, not the player. */
export class DocRubricError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    const list = problems.slice(0, 20).map((p, i) => `${i + 1}) ${p}`).join(' ');
    super(
      problems.length === 1
        ? `The rubric has a problem: ${problems[0]}`
        : `The rubric has ${problems.length} problems: ${list}${problems.length > 20 ? ' ...' : ''}`,
    );
    this.name = 'DocRubricError';
    this.problems = problems;
  }
}
