/**
 * Workflow grader: scores a multi-agent plan (JSON graph of steps) against a
 * rubric the challenge author wrote. Deterministic, pure and synchronous.
 */
import { scorePlan, WORKFLOW_GRADER_VERSION } from './score';
import type { WorkflowGradeInput, WorkflowGradeResult, WorkflowRubric } from './types';
import { parseCandidate, readPlan, readRubric } from './validate';

export type * from './types';
export { WORKFLOW_GRADER_VERSION, WORKFLOW_WEIGHTS, checkable } from './score';
export { globsOverlap } from './graph';
export { LIMITS as WORKFLOW_LIMITS } from './validate';

function zero(error: string): WorkflowGradeResult {
  return {
    version: WORKFLOW_GRADER_VERSION,
    total: 0,
    pillars: { works: 0, looks: 0, engineering: 0 },
    criteria: [],
    feedback: [{ message: error, points: 100 }],
    error,
  };
}

/** Problems with a rubric in plain words, or null when it is usable. */
export function workflowRubricProblem(rubric: unknown): string | null {
  const r = readRubric(rubric);
  return r.ok ? null : r.error;
}

export function validateWorkflowRubric(rubric: unknown): WorkflowRubric {
  const r = readRubric(rubric);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

export function gradeWorkflow({ rubric, candidate }: WorkflowGradeInput): WorkflowGradeResult {
  try {
    const r = readRubric(rubric);
    if (!r.ok) return zero(r.error);
    const parsed = parseCandidate(candidate);
    if (!parsed.ok) return zero(parsed.error);
    const plan = readPlan(parsed.value);
    if (!plan.ok) return zero(plan.error);
    return scorePlan(plan.value.plan, r.value, plan.value.missing);
  } catch (e) {
    return zero(`The plan could not be graded: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  }
}
