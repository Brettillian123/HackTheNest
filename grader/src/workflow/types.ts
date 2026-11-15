/**
 * Workflow grader types. The candidate is a plan for a job done by several
 * agents, written as JSON: a graph of steps. The rubric is written by the
 * challenge author and holds all judgement about the particular job.
 */

export type StepKind = 'work' | 'review' | 'research' | 'decision';

export interface Budget {
  toolCalls?: number;
  minutes?: number;
}

export interface Step {
  /** Unique, readable: "build-home". */
  id: string;
  /** What is done: "Build the home page". */
  title: string;
  /** Which agent or person does it: "coordinator", "worker-a", "reviewer". */
  owner: string;
  /** Ids that must finish first. */
  dependsOn: string[];
  /** Files or folders this step may change (globs like "src/site/**"); [] for read-only steps. */
  changes: string[];
  /** Files or folders it reads. */
  reads?: string[];
  /** The one thing that shows it is done: a command, a test, a file that must exist. */
  proof: string;
  budget?: Budget;
  /** Defaults to 'work'. */
  kind?: StepKind;
}

export interface Loop {
  id: string;
  /** The step ids that repeat. */
  steps: string[];
  /** The exit test, stated as something checkable. */
  until: string;
  maxRounds: number;
  /** What the loop is checked on that it did not tune against. */
  heldOut?: string;
}

export interface Plan {
  /** One sentence: what done looks like. */
  goal: string;
  steps: Step[];
  loops?: Loop[];
}

export type Importance = 'critical' | 'major' | 'normal' | 'minor';

export interface StageMatch {
  /** Words matched against the step's id, title and owner (any one is enough). */
  titleAny?: string[];
  /** Globs or paths; met when one of the step's `changes` overlaps one of these. */
  changesAny?: string[];
  /** Globs or paths; met when one of the step's `reads` overlaps one of these. */
  readsAny?: string[];
  /** The step's kind (a step without a kind is 'work'). */
  kind?: StepKind;
}

export interface RubricStage {
  name: string;
  /** Every key given must match (AND); inside a key, any entry is enough (OR). */
  match: StageMatch;
  importance?: Importance;
}

export interface RubricLoop {
  name: string;
  /** Stages that must have a step inside the loop. */
  stages: string[];
  maxRoundsAtMost: number;
  needsHeldOut?: boolean;
  /** Paths the loop must never see: no step in the loop, or before it, may read or change them. */
  heldOutPaths?: string[];
}

export interface WorkflowRubric {
  stages: RubricStage[];
  /** Stage A finishes before stage B starts (through dependsOn, directly or indirectly). */
  before?: [string, string][];
  /** Stages that should be able to run at the same time. */
  parallel?: string[][];
  loops?: RubricLoop[];
  /** A review step (kind 'review') must depend on every step of these stages. */
  reviewOf?: string[];
  limits?: { maxSteps?: number; maxOwners?: number; maxParallel?: number };
}

export type WorkflowCriterionId = 'stages' | 'order' | 'loops' | 'safety' | 'proof' | 'economy' | 'clarity';
export type WorkflowGroup = 'works' | 'looks' | 'engineering';

export interface WorkflowCriterion {
  id: WorkflowCriterionId;
  name: string;
  group: WorkflowGroup;
  /** 0 to 1. */
  value: number;
  /** Worst first, at most five, each naming the step. */
  notes: string[];
}

export interface WorkflowFeedback {
  message: string;
  /** Roughly how many points of the total it cost, one decimal place. */
  points: number;
}

export interface WorkflowGradeResult {
  version: string;
  /** 0 to 100, one decimal place. */
  total: number;
  /** Each 0 to 1. */
  pillars: { works: number; looks: number; engineering: number };
  criteria: WorkflowCriterion[];
  /** Most costly first, at most eight. */
  feedback: WorkflowFeedback[];
  /** Set when the plan or rubric could not be read; the total is then 0. */
  error?: string;
}

export interface WorkflowGradeInput {
  rubric: unknown;
  /** The model's output: JSON text (a ```json fence is allowed) or an already-parsed object. */
  candidate: unknown;
}
