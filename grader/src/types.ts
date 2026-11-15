export type RGB = [number, number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FontClass = 'serif' | 'sans' | 'mono' | 'other';

export interface TextStyle {
  color: RGB;
  fontSize: number;
  bold: boolean;
  fontClass: FontClass;
  italic: boolean;
  underline: boolean;
}

export interface BoxStyle {
  /** The colour the box shows: its own background, or what is behind it. */
  background: RGB;
  hasBorder: boolean;
  borderColor: RGB | null;
  /** Width of the widest visible border side, in px (0 without a border). */
  borderWidth: number;
  /** Share of the box's area its visible borders paint, 0 to 1: about 1 for a CSS triangle. */
  borderShare: number;
  /** Corner radius as a fraction of half the shorter side, 0 to 1. */
  radius: number;
  shadow: boolean;
}

/** One thing a person would see on the page. */
export interface Block {
  kind: 'text' | 'box' | 'image';
  rect: Rect;
  /** The colour directly behind this block. */
  behind: RGB;
  text?: string;
  textStyle?: TextStyle;
  boxStyle?: BoxStyle;
  /**
   * What the markup says this block is, when it says anything. A hint for
   * naming things in feedback ("the table cell", "the menu link") and for
   * nothing else: it must never change a score, because the same look built
   * with other tags has to score the same.
   */
  role?: BlockRole;
}

export type BlockRole = 'heading' | 'button' | 'link' | 'field' | 'label' | 'cell' | 'listitem' | 'quote' | 'code' | 'caption';

/** Everything the scorer needs about one rendered page. */
export interface PageSnapshot {
  width: number;
  height: number;
  pageBackground: RGB;
  blocks: Block[];
  /** Raw RGBA pixels of the screenshot, width * height * 4 bytes. */
  pixels: Uint8Array;
  /** The same screenshot as a PNG file, for showing to people. */
  png: Buffer;
}

export interface Breakdown {
  /** Is the right text there? null when the goal page has no text. */
  content: number | null;
  /** Are the blocks in the right place, at the right size? */
  layout: number;
  /** Colours, fonts, borders, corners. */
  style: number;
  /** Does the screenshot look like the goal? */
  visual: number;
}

export interface GradeDetails {
  goalBlocks: number;
  candidateBlocks: number;
  matchedBlocks: number;
  /** Goal text a person would say is missing (up to 8). */
  missingText: string[];
  /** Text in the candidate the goal does not have (up to 8). */
  extraText: string[];
  /** How far the whole candidate page is shifted, in pixels. */
  globalOffset: { dx: number; dy: number };
  visual: { structure: number; color: number };
}

/** One thing that cost the player points, in plain words. */
export interface Feedback {
  /** A sentence a player can act on, e.g. "The heading 'Pricing' is missing". */
  message: string;
  /** Roughly how many points of the page total it cost, one decimal place. */
  points: number;
}

export interface GradeResult {
  /** Version of the grading rules that produced this score. */
  version: string;
  /** 0 to 100, one decimal place. */
  total: number;
  breakdown: Breakdown;
  details: GradeDetails;
  /**
   * What cost the most points, most costly first, at most six. Empty for a
   * perfect page. The points come from the same arithmetic as the total:
   * every deduction, shown or not, adds up to 100 minus the total. For a
   * page that could not be rendered: one line with the reason, 100 points.
   */
  feedback: Feedback[];
  /**
   * The twelve named criteria the page is judged on, each 0 to 1, with the
   * most useful notes for the player. Missing only on results made before
   * the criteria existed.
   */
  criteria?: CriterionResult[];
  /** Each component of the goal page (from its profile) and its value for each criterion that applies to it. */
  components?: ComponentResult[];
  /** The four sub-scores as plain means of their criteria, 0 to 100, for comparison with `breakdown`. */
  criteriaBreakdown?: Breakdown;
  /** Feedback built from the criteria notes: grouped by criterion, component named, at most eight lines. */
  criteriaFeedback?: Feedback[];
  /** Set only when the submission could not be rendered; the total is then 0. */
  error?: string;
}

export type CriterionId =
  | 'completeness'
  | 'keyFacts'
  | 'wording'
  | 'structure'
  | 'noExtras'
  | 'placement'
  | 'spacing'
  | 'colour'
  | 'typography'
  | 'shape'
  | 'pictures'
  | 'likeness';

export interface CriterionResult {
  id: CriterionId;
  /** Plain name for the player: "Key facts", "Placement and size". */
  name: string;
  group: 'works' | 'looks';
  /** 0 to 1; 1 means exactly as the goal. null when the goal has nothing this criterion applies to. */
  value: number | null;
  /** The most useful things to tell the player about this criterion, worst first, at most three, each naming the component: "The Team card shows $94 where the goal shows $39". */
  notes: string[];
}

export interface ComponentResult {
  id: string;
  name: string;
  type: string;
  importance: string;
  /** Was the component found at all. */
  present: boolean;
  /** This component's value for each criterion that applies to it, 0 to 1. */
  criteria: Partial<Record<CriterionResult['id'], number>>;
}

export class GraderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraderInputError';
  }
}
