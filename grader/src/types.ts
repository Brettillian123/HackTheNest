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
}

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

export interface GradeResult {
  /** Version of the grading rules that produced this score. */
  version: string;
  /** 0 to 100, one decimal place. */
  total: number;
  breakdown: Breakdown;
  details: GradeDetails;
  /** Set only when the submission could not be rendered; the total is then 0. */
  error?: string;
}

export class GraderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraderInputError';
  }
}
