/**
 * The document grader. Deterministic and synchronous: no browser, network
 * or clock. The same input always gives the same result.
 *
 *   const result = gradeDoc({ kind: 'instructions', rubric, candidate: markdown });
 *   result.total      // 0 to 100
 *   result.feedback   // [{ message, points }], most costly first
 *
 * Throws DocRubricError when the rubric (or kind) is malformed: that is the
 * challenge author's problem and never a zero for the player.
 */
import { clamp01, type Draft } from './common';
import { validateRubric } from './rubric';
import { scoreMarkdown } from './score';
import { scoreTools } from './tools';
import type { DocCriterion, DocCriterionId, DocFeedback, DocGradeInput, DocGradeResult, DocKind, DocRubric } from './types';

export const DOC_GRADER_VERSION = '1.0.0';

/**
 * How strongly each criterion pulls the works pillar. Works is a product,
 * works = Π (1 − s + s·value), because a reader judges a document by what is
 * missing: a whole missing section is an obvious flaw however neat the rest
 * is, so missing pieces compound rather than average out. Structure (title,
 * heading levels, order) matters less in a Markdown document than in a tool
 * list, where parameters and types are what make the tools callable.
 */
export const DOC_WORKS_STRENGTH: Record<'markdown' | 'tools', Partial<Record<DocCriterionId, number>>> = {
  markdown: { keyFacts: 1, completeness: 1, structure: 0.3 },
  // In a tool list the key facts sit inside descriptions, which completeness already checks.
  tools: { keyFacts: 0.25, completeness: 0.5, structure: 1 },
};
/** How the looks pillar combines its criteria. */
export const DOC_LOOKS_WEIGHTS: Partial<Record<DocCriterionId, number>> = { scannable: 0.6, consistency: 0.4 };
/** The project's scoring shape: 100 x (0.40 works + 0.25 looks + 0.35 engineering x works). */
export const DOC_PILLAR_WEIGHTS = { works: 0.4, looks: 0.25, engineering: 0.35 } as const;

const MAX_FEEDBACK = 8;
const round1 = (x: number) => Math.round(x * 10) / 10;

function zero(kind: DocKind, reason: string, words = 0): DocGradeResult {
  return {
    version: DOC_GRADER_VERSION,
    kind,
    total: 0,
    pillars: { works: 0, looks: 0, engineering: 0 },
    criteria: [],
    feedback: [{ message: reason, points: 100 }],
    words,
    error: reason,
  };
}

function assemble(kind: DocKind, drafts: Draft[], words: number): DocGradeResult {
  const strength = DOC_WORKS_STRENGTH[kind === 'mcp-tools' ? 'tools' : 'markdown'];
  const by = new Map(drafts.map((d) => [d.id, d]));
  const factorOf = (d: Draft) => (d.applicable ? 1 - (strength[d.id] ?? 0) + (strength[d.id] ?? 0) * d.value : 1);
  let works = 1;
  for (const d of drafts) if (d.group === 'works') works *= factorOf(d);
  let looks = 0;
  for (const [id, w] of Object.entries(DOC_LOOKS_WEIGHTS) as [DocCriterionId, number][]) looks += w * (by.get(id)?.value ?? 1);
  const eng = drafts.filter((d) => d.group === 'engineering');
  const engineering = Math.min(...eng.map((d) => d.value));
  const P = DOC_PILLAR_WEIGHTS;
  const total = 100 * clamp01(P.works * works + P.looks * looks + P.engineering * engineering * works);

  // Points each issue costs: its share of its criterion's loss, times what that criterion is worth.
  const lines = new Map<string, number>();
  const order: string[] = [];
  for (const d of drafts) {
    let factor = 0;
    if (d.group === 'works') {
      // d total / d value: the pillar's worth, times this criterion's strength, times the other factors.
      const f = factorOf(d);
      const others = f > 0 ? works / f : drafts.filter((o) => o.group === 'works' && o !== d).reduce((p, o) => p * factorOf(o), 1);
      factor = d.applicable ? 100 * (P.works + P.engineering * engineering) * (strength[d.id] ?? 0) * others : 0;
    }
    else if (d.group === 'looks') factor = 100 * P.looks * (DOC_LOOKS_WEIGHTS[d.id] ?? 0);
    for (const issue of d.issues) {
      let pts = (issue.loss ?? 0) * factor;
      // Engineering is its weakest criterion: an issue elsewhere only costs what would drag it below that.
      if (d.group === 'engineering') pts = 100 * P.engineering * works * Math.max(0, (issue.loss ?? 0) - (d.value - engineering));
      if (!lines.has(issue.message)) order.push(issue.message);
      lines.set(issue.message, (lines.get(issue.message) ?? 0) + pts);
    }
  }
  const feedback: DocFeedback[] = order
    .map((message, i) => ({ message, points: round1(lines.get(message) ?? 0), i }))
    .filter((f) => f.points >= 0.1)
    .sort((a, b) => b.points - a.points || a.i - b.i)
    .slice(0, MAX_FEEDBACK)
    .map(({ message, points }) => ({ message, points }));

  const criteria: DocCriterion[] = drafts.map((d) => ({
    id: d.id,
    name: d.name,
    group: d.group,
    value: Math.round(d.value * 1000) / 1000,
    notes: [...d.issues.map((i) => i.message), ...d.notes].slice(0, 20),
  }));
  return {
    version: DOC_GRADER_VERSION,
    kind,
    total: round1(total),
    pillars: { works: round1(100 * works), looks: round1(100 * looks), engineering: round1(100 * engineering) },
    criteria,
    feedback,
    words,
  };
}

/** Grades a document against a challenge's rubric. */
export function gradeDoc(input: DocGradeInput): DocGradeResult {
  const kind = input?.kind;
  const rubric = input?.rubric as DocRubric;
  validateRubric(kind, rubric);
  const candidate = input.candidate;
  if (typeof candidate !== 'string') return zero(kind, 'The document is not text.');
  if (!candidate.trim()) return zero(kind, 'The document is empty.');
  const scored = kind === 'mcp-tools' ? scoreTools(rubric, candidate) : scoreMarkdown(kind, rubric, candidate);
  if (scored.error) return zero(kind, scored.error, scored.words);
  return assemble(kind, scored.drafts, scored.words);
}

export { rubricProblems, validateRubric } from './rubric';
export { parseMarkdown } from './markdown';
export { DOC_KINDS, DocRubricError } from './types';
export type {
  DocCriterion,
  DocCriterionId,
  DocFeedback,
  DocForbidden,
  DocFrontMatterRule,
  DocGradeInput,
  DocGradeResult,
  DocGroup,
  DocKeyFact,
  DocKind,
  DocLimits,
  DocRubric,
  DocSectionRule,
  DocToolParam,
  DocToolRule,
  Importance,
} from './types';
