/** Text helpers: normalising, words, finding key facts. */
import type { RGB } from '../types';

/** Lower case, one kind of quote and dash, single spaces. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[\s  -​  　]+/g, ' ')
    .trim();
}

const STOP = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'was', 'that', 'this', 'from', 'into', 'its', 'has', 'have', 'but', 'not', 'all', 'can', 'will', 'out', 'any', 'per']);

/** The words that carry meaning: two or more letters or any figure, without a few common words. */
export function wordsOf(s: string): string[] {
  const out: string[] = [];
  for (const w of normalise(s).split(/[^a-z0-9$£€%]+/)) {
    if (!w) continue;
    if (/[0-9]/.test(w) || (w.length >= 2 && !STOP.has(w))) out.push(w);
  }
  return out;
}

const isWordChar = (c: string | undefined) => c !== undefined && /[a-z0-9]/.test(c);

/** Whether `fact` appears in `text` (both normalised), not as part of a longer word or number ("$50" is not in "$500"). */
export function containsFact(text: string, fact: string): boolean {
  if (!fact) return true;
  let from = 0;
  for (;;) {
    const i = text.indexOf(fact, from);
    if (i < 0) return false;
    const before = text[i - 1];
    const after = text[i + fact.length];
    const startOk = !isWordChar(fact[0]) || !isWordChar(before);
    const endOk = !isWordChar(fact[fact.length - 1]) || !(isWordChar(after) || (after === '.' || after === ',') && /[0-9]/.test(text[i + fact.length + 1] ?? ''));
    if (startOk && endOk) return true;
    from = i + 1;
  }
}

// ---- colour ----

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
export const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const chroma = (c: RGB) => (Math.max(...c) - Math.min(...c)) / 255;
export const lightness = (c: RGB) => (Math.max(...c) + Math.min(...c)) / 510;
export function hue(c: RGB): number {
  const [r, g, b] = c;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
export const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** A plain colour name for feedback. */
export function colourName(c: RGB, neutral: number): string {
  const l = lightness(c);
  if (chroma(c) < neutral) return l > 0.9 ? 'white' : l > 0.7 ? 'light grey' : l > 0.35 ? 'grey' : l > 0.12 ? 'dark grey' : 'black';
  const h = hue(c);
  const name = h < 15 || h >= 345 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'yellow' : h < 160 ? 'green' : h < 195 ? 'teal' : h < 255 ? 'blue' : h < 290 ? 'purple' : 'pink';
  return (l > 0.8 ? 'pale ' : l < 0.25 ? 'dark ' : '') + name;
}
