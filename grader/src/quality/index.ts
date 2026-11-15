import type { PageSnapshot } from '../types';
import { accessibilityIssues } from './accessibility';
import { ACCESSIBILITY_RULES, VALIDITY_RULES, type RuleCost } from './config';
import { validityIssues } from './validity';
import type { DomFacts, Issue, SourceFacts } from './types';

export { QUALITY_SOURCE, gatherDomFacts } from './dom-source';
export { checkSource } from './source-checks';
export { accessibilityIssues, contrastRatio } from './accessibility';
export { validityIssues } from './validity';
export type { DomFacts, Issue, SourceFacts } from './types';

/** What was gathered for one page. */
export interface QualityFacts {
  dom: DomFacts;
  source: SourceFacts;
}

export interface QualityPart {
  /** 0 to 1; 1 when the submission has no more problems than the goal. */
  credit: number;
  /** Problems charged to the submission, most costly first. */
  issues: Issue[];
}

export interface QualityResult {
  accessibility: QualityPart;
  validity: QualityPart;
}

/**
 * Charge only what the candidate has beyond the goal, rule by rule.
 * See config.ts for the formula.
 */
export function compareIssues(candidate: Issue[], goal: Issue[], rules: Record<string, RuleCost>): QualityPart {
  const goalCount = new Map<string, number>();
  for (const g of goal) goalCount.set(g.rule, (goalCount.get(g.rule) ?? 0) + g.count);
  const charged: Issue[] = [];
  let total = 0;
  for (const c of candidate) {
    const extra = c.count - (goalCount.get(c.rule) ?? 0);
    if (extra <= 0) continue;
    const rule = rules[c.rule] ?? { weight: 0.2, scale: 3 };
    const cost = rule.weight * (1 - Math.exp(-extra / rule.scale));
    total += cost;
    charged.push({ ...c, cost: Math.round(cost * 1000) / 1000 });
  }
  charged.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || a.rule.localeCompare(b.rule));
  return { credit: Math.exp(-total), issues: charged };
}

/** Accessibility and clean-code credit for a candidate page, relative to the goal page. */
export function scoreQuality(
  candidate: QualityFacts,
  goal: QualityFacts,
  candidateSnapshot: PageSnapshot,
  goalSnapshot: PageSnapshot,
): QualityResult {
  return {
    accessibility: compareIssues(
      accessibilityIssues(candidate.dom, candidateSnapshot),
      accessibilityIssues(goal.dom, goalSnapshot),
      ACCESSIBILITY_RULES,
    ),
    validity: compareIssues(validityIssues(candidate.source), validityIssues(goal.source), VALIDITY_RULES),
  };
}
