/** 1 when value <= full, 0 when value >= zero, a straight line in between. */
export function fallingCredit(value: number, full: number, zero: number): number {
  if (value <= full) return 1;
  if (value >= zero) return 0;
  return 1 - (value - full) / (zero - full);
}

/** 1 when value >= full, 0 when value <= zero, a straight line in between. */
export function risingCredit(value: number, full: number, zero: number): number {
  if (value >= full) return 1;
  if (value <= zero) return 0;
  return (value - zero) / (full - zero);
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Round to one decimal place. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Lower-case words, with punctuation and spacing removed. Accents and vowel
 * signs (Thai, Hindi, Arabic...) stay part of their word. Scripts written
 * without spaces (Chinese, Japanese, Thai, Lao, Khmer, Burmese) count each
 * character as a word, so one wrong character is one wrong word, not a wrong
 * sentence. Each emoji is a word too: a person reads it.
 */
const NO_SPACE = String.raw`\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}`;
const WORD = new RegExp(
  String.raw`[${NO_SPACE}]\p{M}*|\p{Extended_Pictographic}|(?![${NO_SPACE}])[\p{L}\p{N}](?:(?![${NO_SPACE}])[\p{L}\p{M}\p{N}])*`,
  'gu',
);
export function words(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

/**
 * How well two bags of words agree, 0 to 1. Missing words and extra words
 * both cost (the F1 measure). Two empty bags agree completely.
 */
export function wordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const w of a) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of b) {
    const left = counts.get(w) ?? 0;
    if (left > 0) {
      shared++;
      counts.set(w, left - 1);
    }
  }
  if (shared === 0) return 0;
  const precision = shared / b.length;
  const recall = shared / a.length;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Every pair of neighbouring words, taken within each list separately:
 * [['a','b','c'], ['d','e']] gives ['a b', 'b c', 'd e'].
 */
export function wordPairs(lists: string[][]): string[] {
  const pairs: string[] = [];
  for (const list of lists) {
    for (let i = 0; i + 1 < list.length; i++) pairs.push(`${list[i]} ${list[i + 1]}`);
  }
  return pairs;
}

/** Median of a list; 0 for an empty list. Does not change the input. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
