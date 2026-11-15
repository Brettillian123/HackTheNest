import type { Block, PageSnapshot, RGB } from '../types';
import {
  CONTRAST_LARGE,
  CONTRAST_NORMAL,
  LARGE_BOLD_TEXT_PX,
  LARGE_TEXT_PX,
} from './config';
import type { DomFacts, Issue } from './types';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

function examples(list: string[]): string {
  return list.length > 0 ? ` (for example ${list.slice(0, 3).join(', ')})` : '';
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2 relative luminance. */
export function luminance(rgb: RGB): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * What a text is, for contrast:
 * - hint: the placeholder shown in an empty form field. Browsers draw these pale
 *   by default (darkgray on white, about 2.3:1), so a hint is held to that, not 4.5:1;
 * - glyph: one symbol that is not a letter or digit (a tick, a cross, "!") used as
 *   an icon: a graphic, held to the 3:1 WCAG asks of graphics;
 * - large / normal: ordinary text, 3:1 or 4.5:1.
 */
export type ContrastKind = 'hint' | 'glyph' | 'large' | 'normal';

/** Contrast a hint needs: the browser's own placeholder colour (darkgray, #a9a9a9) on white. */
export const CONTRAST_HINT = 2.3;

const NEED: Record<ContrastKind, number> = {
  hint: CONTRAST_HINT,
  glyph: CONTRAST_LARGE,
  large: CONTRAST_LARGE,
  normal: CONTRAST_NORMAL,
};

const collapse = (s: string) => s.trim().replace(/\s+/g, ' ');

function contrastKind(b: Block, hints: Set<string>): ContrastKind {
  const text = collapse(b.text ?? '');
  if (b.role === 'field' && hints.has(text)) return 'hint';
  if ([...text].length === 1 && /^[^\p{L}\p{N}]$/u.test(text)) return 'glyph';
  const { fontSize, bold } = b.textStyle!;
  return fontSize >= LARGE_TEXT_PX || (bold && fontSize >= LARGE_BOLD_TEXT_PX) ? 'large' : 'normal';
}

interface MeasuredText {
  kind: ContrastKind;
  ratio: number;
}

function measureTexts(snapshot: PageSnapshot, dom?: DomFacts): MeasuredText[] {
  const hints = new Set((dom?.placeholders ?? []).map(collapse));
  const out: MeasuredText[] = [];
  for (const b of snapshot.blocks) {
    if (b.kind !== 'text' || !b.textStyle || !b.text || b.text.trim() === '') continue;
    out.push({ kind: contrastKind(b, hints), ratio: contrastRatio(b.textStyle.color, b.behind) });
  }
  return out;
}

/**
 * The contrast each kind of text needs on a page judged against `goal`: the
 * WCAG minimum, lowered to the goal's own weakest text of that kind. The goal is
 * the exact target, so a text no harder to read than the goal's is never charged.
 */
function needs(goal?: { dom?: DomFacts; snapshot: PageSnapshot }): Record<ContrastKind, number> {
  const need = { ...NEED };
  if (!goal) return need;
  for (const t of measureTexts(goal.snapshot, goal.dom)) need[t.kind] = Math.min(need[t.kind], t.ratio);
  return need;
}

/**
 * Texts below the contrast they need, each weighted by how far below: twice the
 * shortfall as a share of the need, capped at one. 2% short (4.41:1 where 4.5:1
 * is needed) counts 0.04, 10% short counts 0.2, half the needed contrast or worse
 * counts one. Without `weighted`, the plain number of texts.
 * With `goal`, each kind needs no more than the goal's weakest text of that kind.
 */
export function countLowContrast(
  snapshot: PageSnapshot,
  weighted = false,
  dom?: DomFacts,
  goal?: { dom?: DomFacts; snapshot: PageSnapshot },
): number {
  const need = needs(goal);
  let n = 0;
  for (const t of measureTexts(snapshot, dom)) {
    const k = need[t.kind];
    if (t.ratio < k) n += !weighted ? 1 : Math.min(1, 2 * (1 - t.ratio / k));
  }
  return !weighted ? n : Math.round(n * 100) / 100;
}

/**
 * Accessibility problems on one page, unsorted and not yet compared with the goal.
 * Pass the goal page as `goal` for both the submission and the goal itself, so
 * contrast is judged against what the goal does (see countLowContrast).
 */
export function accessibilityIssues(dom: DomFacts, snapshot: PageSnapshot, goal?: { dom?: DomFacts; snapshot: PageSnapshot }): Issue[] {
  const issues: Issue[] = [];
  const add = (rule: string, count: number, message: string) => {
    if (count > 0) issues.push({ rule, count, message });
  };

  const img = dom.images.withoutDescription;
  add(
    'image-description',
    img,
    `${plural(img, 'An image has', 'images have')} no text description for people who cannot see it: add an alt attribute (alt="" if it is only decoration)${examples(dom.images.examples)}.`,
  );

  const fields = dom.fields.withoutLabel;
  add(
    'field-label',
    fields,
    `${plural(fields, 'A form field has', 'form fields have')} no label saying what to type: add a <label> for it or an aria-label${examples(dom.fields.examples)}.`,
  );

  const ctrls = dom.controls.withoutName;
  add(
    'control-name',
    ctrls,
    `${plural(ctrls, 'A button or link has', 'buttons or links have')} no name a screen reader can announce: give it text, or an aria-label if it only shows an icon${examples(dom.controls.examples)}.`,
  );

  const contrast = countLowContrast(snapshot, true, dom, goal);
  const contrastTexts = countLowContrast(snapshot, false, dom, goal);
  add(
    'low-contrast',
    contrast,
    `${plural(contrastTexts, 'A piece of text is', 'pieces of text are')} hard to read against the background: make the colours differ more (at least 4.5:1, or 3:1 for large text).`,
  );

  if (dom.lang === null) {
    add('page-language', 1, 'The page does not say what language it is in: add a lang attribute to <html>, like lang="en".');
  }
  if (dom.title.trim() === '') {
    add('page-title', 1, 'The page has no title for the browser tab: add a <title> in the <head>.');
  }

  const levels = dom.headingLevels;
  const h1 = levels.filter((l) => l === 1).length;
  if (h1 === 0) {
    add('no-main-heading', 1, 'The page has no main heading: add one <h1> that says what the page is about.');
  } else if (h1 > 1) {
    add('several-main-headings', h1, `The page has ${h1} main headings: keep one <h1> and make the others <h2>.`);
  }
  let skips = 0;
  let firstSkip = '';
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      skips++;
      if (!firstSkip) firstSkip = `from level ${levels[i - 1]} to level ${levels[i]}`;
    }
  }
  if (skips === 1) add('heading-skip', 1, `Headings jump ${firstSkip}: don't skip heading levels.`);
  else add('heading-skip', skips, `Headings skip a level ${skips} times (first ${firstSkip}): don't skip heading levels.`);

  return issues;
}
