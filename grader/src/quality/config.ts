/**
 * Numbers for the accessibility and clean-code checks.
 *
 * How counts become credit: each rule the submission breaks more often than
 * the goal costs   weight * (1 - exp(-extra / scale))   where `extra` is how
 * many more times it breaks the rule than the goal does. The cost of one rule
 * saturates at its weight, so a rule broken 50 times costs little more than
 * one broken 10 times. Credit is exp(-sum of costs): the first few distinct
 * problems pull it down quickly, and a page with every kind of problem ends
 * near 0 (all accessibility weights together give exp(-3.2), about 0.04).
 *
 * Example: one image with no description costs 0.5 * (1 - e^(-1/2)) = 0.2,
 * so credit is e^(-0.2) = 0.82. Yes/no rules (no doctype, no language) use
 * scale 0.5, so breaking them costs 86% of their weight at once.
 */
export interface RuleCost {
  /** The most this rule can cost, however often it is broken. */
  weight: number;
  /** How many extra occurrences it takes to reach 63% of the weight. */
  scale: number;
}

export const ACCESSIBILITY_RULES: Record<string, RuleCost> = {
  'image-description': { weight: 0.5, scale: 2 },
  'field-label': { weight: 0.5, scale: 2 },
  'control-name': { weight: 0.5, scale: 2 },
  'low-contrast': { weight: 0.5, scale: 3 },
  'page-language': { weight: 0.35, scale: 0.5 },
  'page-title': { weight: 0.35, scale: 0.5 },
  'heading-skip': { weight: 0.25, scale: 2 },
  'no-main-heading': { weight: 0.25, scale: 0.5 },
  // Several top-level headings is a weak signal; keep it cheap.
  'several-main-headings': { weight: 0.1, scale: 2 },
  // Judged against the goal (structure.ts): only what the goal does is demanded.
  'page-landmarks': { weight: 0.2, scale: 2 },
  'list-markup': { weight: 0.15, scale: 2 },
  'table-headers': { weight: 0.25, scale: 2 },
  'real-buttons': { weight: 0.3, scale: 2 },
  'field-types': { weight: 0.2, scale: 2 },
  'field-required': { weight: 0.15, scale: 2 },
  'viewport': { weight: 0.2, scale: 0.5 },
};

export const VALIDITY_RULES: Record<string, RuleCost> = {
  'no-doctype': { weight: 0.5, scale: 0.5 },
  'unclosed-tag': { weight: 0.4, scale: 2 },
  'stray-end-tag': { weight: 0.4, scale: 2 },
  'self-closing-tag': { weight: 0.2, scale: 2 },
  'attribute-syntax': { weight: 0.3, scale: 2 },
  // Bare & in text is common and harmless in practice; keep it cheap.
  'character-reference': { weight: 0.1, scale: 3 },
  'broken-comment': { weight: 0.15, scale: 2 },
  'other-syntax': { weight: 0.2, scale: 2 },
  'duplicate-id': { weight: 0.35, scale: 2 },
  'obsolete-tag': { weight: 0.4, scale: 2 },
  'obsolete-attribute': { weight: 0.3, scale: 3 },
  'inline-styles': { weight: 0.3, scale: 10 },
  'repeated-inline-style': { weight: 0.2, scale: 5 },
  'heavy-important': { weight: 0.25, scale: 8 },
  // Judged against the goal (structure.ts).
  charset: { weight: 0.2, scale: 0.5 },
};

/** WCAG 2 contrast minimums. */
export const CONTRAST_NORMAL = 4.5;
export const CONTRAST_LARGE = 3;
/** Large text: 24 px, or 18.66 px when bold (18 pt / 14 pt). */
export const LARGE_TEXT_PX = 24;
export const LARGE_BOLD_TEXT_PX = 18.66;

/** Inline styles are flagged only when at least this many elements in <body> carry one ... */
export const INLINE_STYLE_MIN = 10;
/** ... and they are at least this share of the elements in <body>. */
export const INLINE_STYLE_SHARE = 0.25;
/** The same inline style text counts as repeated from this many copies. */
export const REPEATED_STYLE_MIN = 5;
/** !important is flagged from this many uses ... */
export const IMPORTANT_MIN = 10;
/** ... when it is on at least this share of all declarations. */
export const IMPORTANT_SHARE = 0.1;

/** Milliseconds allowed for gathering facts in the page. */
export const GATHER_TIMEOUT_MS = 5000;
