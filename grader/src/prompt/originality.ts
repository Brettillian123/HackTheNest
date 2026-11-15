/**
 * Originality check for a player's prompt: how much of it is the challenge's own text pasted back.
 * Pure, synchronous, no AI and no network. Compares in words after lower-casing and stripping
 * punctuation, using hashed word n-grams so the cost grows with the input, not its square.
 */

export const ORIGINALITY = {
  /** Shortest stretch of consecutive words, shared with one challenge text, that counts as copied. */
  minRun: 8,
  /** A single copied stretch this many words long or longer fails the check. */
  maxRun: 25,
  /** Fails when more than this share of the prompt's words sit inside copied stretches. */
  maxShare: 0.4,
} as const;

export interface OriginalityOptions {
  minRun?: number;
  maxRun?: number;
  maxShare?: number;
}

export interface OriginalityResult {
  ok: boolean;
  /** Words of the prompt inside copied runs / words of the prompt (0 to 1). */
  copiedShare: number;
  /** The longest copied run, in words. */
  longestRun: number;
  /** Up to three of the longest copied runs, as normalised text. */
  copiedRuns: string[];
  /** Words in the prompt after normalising. */
  words: number;
  /** Plain words for the player, or null when ok. */
  message: string | null;
}

/** Lower-case, drop apostrophes, turn every other non-letter/non-digit into a space, split. */
export function promptWords(text: string): string[] {
  if (typeof text !== 'string' || !text) return [];
  return text
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Where a gram starts: which challenge text and at which word. */
type Spot = number; // textIndex * STRIDE + position
const STRIDE = 1 << 20;
/** Cap on remembered spots per gram, so a phrase repeated many times stays cheap. */
const MAX_SPOTS = 32;

export function checkPromptOriginality(
  prompt: string,
  challengeTexts: string[],
  options: OriginalityOptions = {},
): OriginalityResult {
  const minRun = Math.max(2, Math.floor(options.minRun ?? ORIGINALITY.minRun));
  const maxRun = options.maxRun ?? ORIGINALITY.maxRun;
  const maxShare = options.maxShare ?? ORIGINALITY.maxShare;

  const words = promptWords(prompt);
  const total = words.length;
  const clean: OriginalityResult = { ok: true, copiedShare: 0, longestRun: 0, copiedRuns: [], words: total, message: null };
  if (total < minRun) return clean;

  // Every minRun-gram of every challenge text, keyed by its words joined with spaces.
  const grams = new Map<string, Spot[]>();
  (Array.isArray(challengeTexts) ? challengeTexts : []).forEach((text, t) => {
    const w = promptWords(typeof text === 'string' ? text : '');
    for (let p = 0; p + minRun <= w.length && p < STRIDE; p++) {
      const key = w.slice(p, p + minRun).join(' ');
      const spots = grams.get(key);
      if (!spots) grams.set(key, [t * STRIDE + p]);
      else if (spots.length < MAX_SPOTS) spots.push(t * STRIDE + p);
    }
  });
  if (grams.size === 0) return clean;

  // Walk the prompt's grams. A chain is a run of matching grams that continue at the next word
  // of the same challenge text; a chain of k grams is a copied run of k + minRun - 1 words.
  const covered = new Uint8Array(total);
  const runs: Array<{ start: number; length: number }> = [];
  let prev = new Map<Spot, number>();
  for (let i = 0; i + minRun <= total; i++) {
    const spots = grams.get(words.slice(i, i + minRun).join(' '));
    const next = new Map<Spot, number>();
    let best = 0;
    if (spots) {
      for (const spot of spots) {
        const len = (prev.get(spot - 1) ?? 0) + 1;
        next.set(spot, len);
        if (len > best) best = len;
      }
      for (let k = i; k < i + minRun; k++) covered[k] = 1;
    }
    // A chain that does not continue here ended at i - 1: record it.
    let ended = 0;
    for (const [spot, len] of prev) if (!next.has(spot + 1) && len > ended) ended = len;
    if (ended) runs.push({ start: i - ended, length: ended + minRun - 1 });
    prev = next;
    if (i + minRun === total && best) {
      let last = 0;
      for (const len of next.values()) if (len > last) last = len;
      runs.push({ start: i - last + 1, length: last + minRun - 1 });
    }
  }

  let inRuns = 0;
  for (let k = 0; k < total; k++) inRuns += covered[k];
  const copiedShare = inRuns / total;
  runs.sort((a, b) => b.length - a.length || a.start - b.start);
  const longestRun = runs.length ? runs[0].length : 0;

  const chosen: Array<{ start: number; length: number }> = [];
  for (const run of runs) {
    if (chosen.length >= 3) break;
    const overlaps = chosen.some((c) => run.start < c.start + c.length && c.start < run.start + run.length);
    if (!overlaps) chosen.push(run);
  }
  const copiedRuns = chosen.map((r) => words.slice(r.start, r.start + r.length).join(' '));

  const tooMuch = copiedShare > maxShare;
  const tooLong = longestRun >= maxRun;
  const ok = !tooMuch && !tooLong;
  let message: string | null = null;
  if (tooMuch) {
    message = `About ${Math.round(copiedShare * 100)}% of this prompt is copied from the challenge text. Describe what you want in your own words.`;
  } else if (tooLong) {
    message = `A passage of ${longestRun} words in this prompt is copied from the challenge text. Describe what you want in your own words.`;
  }
  return { ok, copiedShare, longestRun, copiedRuns, words: total, message };
}
