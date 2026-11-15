import type { PageSnapshot, RGB } from '../types';
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

/** Text blocks whose colour is too close to what is behind them. */
export function countLowContrast(snapshot: PageSnapshot): number {
  let n = 0;
  for (const b of snapshot.blocks) {
    if (b.kind !== 'text' || !b.textStyle || !b.text || b.text.trim() === '') continue;
    const { fontSize, bold, color } = b.textStyle;
    const large = fontSize >= LARGE_TEXT_PX || (bold && fontSize >= LARGE_BOLD_TEXT_PX);
    const need = large ? CONTRAST_LARGE : CONTRAST_NORMAL;
    if (contrastRatio(color, b.behind) < need) n++;
  }
  return n;
}

/** Accessibility problems on one page, unsorted and not yet compared with the goal. */
export function accessibilityIssues(dom: DomFacts, snapshot: PageSnapshot): Issue[] {
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

  const contrast = countLowContrast(snapshot);
  add(
    'low-contrast',
    contrast,
    `${plural(contrast, 'A piece of text is', 'pieces of text are')} hard to read against the background: make the colours differ more (at least 4.5:1, or 3:1 for large text).`,
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
