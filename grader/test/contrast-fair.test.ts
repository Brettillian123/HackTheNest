import { describe, expect, it } from 'vitest';
import { accessibilityIssues, countLowContrast } from '../src/quality/accessibility';
import type { Block, RGB } from '../src/types';
import { cleanDom, snapshot, textBlock } from './quality/fixtures';

const WHITE: RGB = [255, 255, 255];
const field = (text: string, color: RGB): Block => ({ ...textBlock(text, color, WHITE, 14), role: 'field' });
const domWith = (placeholders: string[]) => ({ ...cleanDom(), placeholders });

describe('contrast judged fairly', () => {
  it('holds a field placeholder to the browser default, not 4.5:1', () => {
    // 160,170,170 on white is 2.38:1, about the browser's own placeholder grey.
    const snap = snapshot([field('Jane Cooper', [160, 170, 170])]);
    expect(countLowContrast(snap, false, domWith(['Jane Cooper']))).toBe(0);
    // The same text when it is not a placeholder is still charged.
    expect(countLowContrast(snap, false, domWith([]))).toBe(1);
    // A placeholder far paler than the browser default is still charged.
    const faint = snapshot([field('Jane Cooper', [220, 220, 220])]);
    expect(countLowContrast(faint, false, domWith(['Jane Cooper']))).toBe(1);
  });

  it('charges a near miss very little and a real failure fully', () => {
    const near = snapshot([textBlock('Four messages', [107, 114, 128], [243, 244, 246])]); // 4.39:1
    const w = countLowContrast(near, true);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(0.1);
    const bad = snapshot([textBlock('Unreadable', [200, 200, 200], WHITE)]); // 1.67:1
    expect(countLowContrast(bad, true)).toBe(1);
  });

  it('treats a lone symbol icon as a graphic (3:1)', () => {
    const icons = snapshot([
      textBlock('✕', [255, 255, 255], [239, 68, 68], 18, true), // 3.76:1: fine for a graphic
      textBlock('!', [255, 255, 255], [245, 158, 11], 18, true), // 2.15:1: still too pale
    ]);
    expect(countLowContrast(icons)).toBe(1);
  });

  it('does not charge text no harder to read than the goal\'s own', () => {
    const grey: RGB = [130, 130, 130]; // 3.9:1
    const goal = { dom: cleanDom(), snapshot: snapshot([textBlock('Note', grey, WHITE)]) };
    const same = snapshot([textBlock('Note here', grey, WHITE)]);
    expect(countLowContrast(same, false, cleanDom(), goal)).toBe(0);
    expect(accessibilityIssues(cleanDom(), goal.snapshot, goal).some((i) => i.rule === 'low-contrast')).toBe(false);
    // Paler than the goal's weakest text: charged, and lightly when only a little paler.
    const paler = snapshot([textBlock('Note here', [140, 140, 140], WHITE)]); // 3.4:1
    const w = countLowContrast(paler, true, cleanDom(), goal);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(0.35);
    const issues = accessibilityIssues(cleanDom(), snapshot([textBlock('Gone', [220, 220, 220], WHITE)]), goal);
    expect(issues.find((i) => i.rule === 'low-contrast')?.count).toBe(1);
  });
});
