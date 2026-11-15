import { GRADER_VERSION } from './config';
import { isTimeout, Renderer } from './render';
import { score } from './score';
import type { SiteFiles } from './site';
import { gradeSite, prepareSite, type PreparedSite, type SiteGradeOptions, type SiteGradeOutput } from './site-grade';
import { GraderInputError, type GradeResult, type PageSnapshot } from './types';

export { GRADER_VERSION, VIEWPORT, WEIGHTS } from './config';
export { PERF, SITE_WEIGHTS } from './site-config';
export { Renderer } from './render';
export { score, subScoresFromCriteria } from './score';
export { PreparedSite, scoreSite } from './site-grade';
export type { SiteGradeOptions } from './site-grade';
export { scoreIntent, intentGradeResult } from './intent/index';
export type { IntentChallenge, IntentCriterion, IntentCriterionId, IntentResult } from './intent/index';
export { GraderInputError } from './types';
export type { DeviceCheck, Efficiency, PageStats } from './performance';
export type { PageQuality } from './render';
export type { SiteFiles } from './site';
export type {
  FeedbackItem,
  RenderedPage,
  SiteEngineering,
  SiteGradeOutput,
  SiteGradeResult,
  SiteLinks,
  SitePageResult,
  SitePillars,
} from './site-grade';
export type { Block, Breakdown, ComponentResult, CriterionId, CriterionResult, Feedback, GradeDetails, GradeResult, PageSnapshot } from './types';

// Accessibility and clean-code checks: the types a caller needs to show issues.
export type { DomFacts, Issue, QualityFacts, QualityPart, QualityResult, SourceFacts } from './quality/index';

// The 3D grader. It runs its own browser, started on first use.
export { SCENE_LIMITS, SCENE_VERSION, SceneBuildError, SceneGrader } from './scene3d/index';
export type {
  Bounds,
  EngineeringMeasure,
  PreparedScene,
  SceneData,
  SceneDetails,
  SceneGradeResult,
  SceneMesh,
  SceneView,
} from './scene3d/index';

// The document grader: instructions, READMEs, skill files and MCP tool lists. Pure and synchronous.
export { DOC_GRADER_VERSION, DocRubricError, gradeDoc, rubricProblems, validateRubric } from './docs/index';
export type { DocCriterion, DocFeedback, DocGradeInput, DocGradeResult, DocKind, DocRubric } from './docs/index';
export { WORKFLOW_GRADER_VERSION, gradeWorkflow, validateWorkflowRubric, workflowRubricProblem } from './workflow/index';
export type { WorkflowGradeInput, WorkflowGradeResult, WorkflowRubric, Plan as WorkflowPlan } from './workflow/index';
// Prompt originality: how much of a player's prompt is the challenge's own text pasted back. Pure and synchronous.
export { ORIGINALITY, checkPromptOriginality, promptWords } from './prompt/originality';
export type { OriginalityOptions, OriginalityResult } from './prompt/originality';

export interface GradeOutput {
  result: GradeResult;
  /** The candidate as the grader saw it; `candidate.png` is its screenshot. Missing if it could not be rendered. */
  candidate: PageSnapshot | null;
}

/**
 * The grader. Create one, reuse it for every submission, and close it when
 * the server shuts down (it holds one headless browser).
 *
 *   const grader = new Grader();
 *   const goal = await grader.render(goalHtml);          // once per challenge
 *   const { result } = await grader.grade(goal, submittedHtml);
 *   result.total       // 0 to 100
 *   result.breakdown   // content, layout, style, visual
 */
export class Grader {
  private readonly renderer = new Renderer();

  /** Renders a page. Do this once for a goal page and keep the snapshot. */
  render(html: string): Promise<PageSnapshot> {
    return this.renderer.render(html);
  }

  /**
   * Scores a submission against a goal. A submission that cannot be
   * rendered (too large, or it stalls the browser) scores 0 with a reason;
   * it never throws. A goal that cannot be rendered does throw: that is a
   * broken challenge, not a bad answer.
   */
  async grade(goal: string | PageSnapshot, candidateHtml: string): Promise<GradeOutput> {
    const goalSnapshot = typeof goal === 'string' ? await this.renderer.render(goal) : goal;
    let candidate: PageSnapshot | null = null;
    let reason = 'The page could not be rendered.';
    // A render can fail through no fault of the page (another submission
    // stalled the shared browser and it was restarted), so try twice before
    // charging the player. A page that is itself the problem fails both times.
    for (let attempt = 0; attempt < 2 && !candidate; attempt++) {
      try {
        candidate = await this.renderer.render(candidateHtml);
      } catch (error) {
        if (error instanceof GraderInputError) {
          reason = error.message;
          break;
        }
        if (isTimeout(error)) break;
      }
    }
    if (!candidate) return { result: zeroResult(goalSnapshot, reason), candidate: null };
    return { result: score(goalSnapshot, candidate), candidate };
  }

  /**
   * Checks and renders a goal site (file path -> file text). Do this once
   * per challenge and keep the result. Throws if the goal is not a valid site.
   */
  prepareSite(files: SiteFiles): Promise<PreparedSite> {
    return prepareSite(this.renderer, files, true);
  }

  /**
   * Scores a submitted site against a goal site: every page, the links
   * between pages, and the site's size and estimated load time on several
   * simulated devices. A one-page challenge is a site with one file.
   * Like `grade`, it never throws for a bad submission.
   */
  /** `opts.intent`, keyed by page path, grades those pages by the brief's intent (src/intent) instead of by likeness. */
  gradeSite(goal: SiteFiles | PreparedSite, candidateFiles: SiteFiles, opts?: SiteGradeOptions): Promise<SiteGradeOutput> {
    return gradeSite(this.renderer, goal, candidateFiles, opts);
  }

  close(): Promise<void> {
    return this.renderer.close();
  }
}

function zeroResult(goal: PageSnapshot, reason: string): GradeResult {
  const hasText = goal.blocks.some((b) => b.kind === 'text');
  return {
    version: GRADER_VERSION,
    total: 0,
    breakdown: { content: hasText ? 0 : null, layout: 0, style: 0, visual: 0 },
    details: {
      goalBlocks: goal.blocks.length,
      candidateBlocks: 0,
      matchedBlocks: 0,
      missingText: [],
      extraText: [],
      globalOffset: { dx: 0, dy: 0 },
      visual: { structure: 0, color: 0 },
    },
    feedback: [{ message: reason, points: 100 }],
    error: reason,
  };
}
