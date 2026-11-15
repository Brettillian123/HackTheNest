/** One problem found on a page, written so a player can act on it. */
export interface Issue {
  /** Stable id of the rule, e.g. 'image-description'. */
  rule: string;
  /** A plain sentence, e.g. "3 images have no description". */
  message: string;
  /** How many times the problem occurs on the page. */
  count: number;
  /** How much credit it cost, set only by scoreQuality. */
  cost?: number;
}

/** Plain facts read from the rendered page by QUALITY_SOURCE. */
export interface DomFacts {
  elementCount: number;
  /** The page's language attribute, or null. */
  lang: string | null;
  /** The page title as the browser reads it (trimmed). */
  title: string;
  images: { checked: number; withoutDescription: number; examples: string[] };
  fields: { checked: number; withoutLabel: number; examples: string[] };
  controls: { checked: number; withoutName: number; examples: string[] };
  /** Levels (1-6) of the visible headings, in page order, capped. */
  headingLevels: number[];
  /** True when any list or loop hit its cap. */
  truncated: boolean;
  /** Sections that threw and were skipped. */
  errors: number;
}

/** What can be told from the HTML text alone. */
export interface SourceFacts {
  /** A doctype that keeps the browser out of quirks mode. */
  hasDoctype: boolean;
  /** Parse errors counted by kind (see source-checks.ts for the kinds). */
  parseErrors: Record<string, number>;
  duplicateIds: { count: number; examples: string[] };
  obsoleteTags: { count: number; examples: string[] };
  obsoleteAttributes: { count: number; examples: string[] };
  /** Elements inside <body>. */
  bodyElements: number;
  /** Elements inside <body> that carry a non-empty style attribute. */
  inlineStyled: number;
  /** Extra copies of inline style texts that appear at least REPEATED_STYLE_MIN times. */
  repeatedInlineStyle: { extraCopies: number; example: string };
  importantCount: number;
  /** Rough count of CSS declarations in <style> blocks and style attributes. */
  declarationCount: number;
  truncated: boolean;
}
