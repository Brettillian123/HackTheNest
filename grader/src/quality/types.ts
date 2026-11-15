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
  /** Placeholder (hint) texts of the visible form fields, whitespace collapsed, capped. Missing on facts made before it existed. */
  placeholders?: string[];
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
  /** How the page is built, for the rules judged against what the goal does (structure.ts). Missing on facts made before it existed. */
  structure?: StructureFacts;
}

/** Facts about a page's structure, read from its HTML. Only compared with the goal's: a goal that does not do a thing does not demand it. */
export interface StructureFacts {
  /** Elements (or ARIA roles) marking the page's parts. */
  landmarks: { header: number; nav: number; main: number; footer: number };
  /** <ul>, <ol> and <dl> elements. */
  lists: number;
  tables: number;
  /** Tables with no <th> header cell. */
  tablesWithoutHeaders: number;
  /** <button> elements and button-type inputs. */
  buttons: number;
  /** Other elements made to look or act like a button: an onclick, a button role, or a class or id that says button (not links). */
  fakeButtons: number;
  /** Form fields a visitor types or picks in (not hidden, submit or button inputs). */
  fields: number;
  /** Text inputs with no more specific type. */
  plainFields: number;
  /** Inputs by specific type: email, number, password, tel, date. */
  fieldTypes: Record<string, number>;
  /** Fields marked required. */
  required: number;
  /** A <meta charset> (or the http-equiv form). */
  charset: boolean;
  /** A <meta name="viewport">. */
  viewport: boolean;
}
