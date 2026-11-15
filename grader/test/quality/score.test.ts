import { describe, expect, it } from 'vitest';
import { contrastRatio, countLowContrast } from '../../src/quality/accessibility';
import { scoreQuality, type QualityFacts } from '../../src/quality/index';
import { checkSource } from '../../src/quality/source-checks';
import { ACCESSIBILITY_RULES } from '../../src/quality/config';
import type { RGB } from '../../src/types';
import { CLEAN_PAGE, CLEAN_SNAPSHOT, cleanDom, snapshot, textBlock } from './fixtures';

const WHITE: RGB = [255, 255, 255];
const clean = (): QualityFacts => ({ dom: cleanDom(), source: checkSource(CLEAN_PAGE) });

describe('contrast', () => {
  it('matches the WCAG formula', () => {
    expect(contrastRatio([0, 0, 0], WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
  });
  it('flags normal text below 4.5:1 and counts each block', () => {
    const snap = snapshot([
      textBlock('a', [119, 119, 119], WHITE), // #777, 4.48:1
      textBlock('b', [170, 170, 170], WHITE), // 2.3:1
      textBlock('c', [118, 118, 118], WHITE), // #767676, 4.54:1: passes
    ]);
    expect(countLowContrast(snap)).toBe(2);
  });
  it('allows 3:1 for large text only', () => {
    const grey: RGB = [140, 140, 140];
    const ratio = contrastRatio(grey, WHITE);
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);
    const snap = snapshot([
      textBlock('big', grey, WHITE, 24),
      textBlock('bold', grey, WHITE, 18.66, true),
      textBlock('small bold', grey, WHITE, 18, true),
      textBlock('normal', grey, WHITE, 16),
    ]);
    expect(countLowContrast(snap)).toBe(2);
  });
  it('reports low contrast in plain words', () => {
    const snap = snapshot([
      textBlock('a', [200, 200, 200], WHITE),
      textBlock('b', [200, 200, 200], WHITE),
      textBlock('c', [200, 200, 200], WHITE),
      textBlock('d', [200, 200, 200], WHITE),
    ]);
    const r = scoreQuality(clean(), clean(), snap, CLEAN_SNAPSHOT);
    expect(r.accessibility.issues[0].message).toMatch(/^4 pieces of text are hard to read against the background/);
  });
});

describe('scoreQuality', () => {
  it('gives a clean page full credit with no issues', () => {
    const r = scoreQuality(clean(), clean(), CLEAN_SNAPSHOT, CLEAN_SNAPSHOT);
    expect(r.accessibility).toEqual({ credit: 1, issues: [] });
    expect(r.validity).toEqual({ credit: 1, issues: [] });
  });

  it("does not charge the goal's own problems to an identical submission", () => {
    const bad = (): QualityFacts => {
      const f = clean();
      f.dom.images.withoutDescription = 4;
      f.dom.lang = null;
      f.source = checkSource('<html><body><center><div>x</body></html>');
      return f;
    };
    const r = scoreQuality(bad(), bad(), CLEAN_SNAPSHOT, CLEAN_SNAPSHOT);
    expect(r.accessibility.credit).toBe(1);
    expect(r.validity.credit).toBe(1);
  });

  it('charges only what goes beyond the goal', () => {
    const goal = clean();
    goal.dom.images.withoutDescription = 2;
    const cand = clean();
    cand.dom.images.withoutDescription = 3;
    const r = scoreQuality(cand, goal, CLEAN_SNAPSHOT, CLEAN_SNAPSHOT);
    expect(r.accessibility.issues).toHaveLength(1);
    expect(r.accessibility.issues[0].count).toBe(3);
    const { weight, scale } = ACCESSIBILITY_RULES['image-description'];
    expect(r.accessibility.credit).toBeCloseTo(Math.exp(-weight * (1 - Math.exp(-1 / scale))), 6);
  });

  it('makes one missing image description a small loss', () => {
    const cand = clean();
    cand.dom.images.withoutDescription = 1;
    const credit = scoreQuality(cand, clean(), CLEAN_SNAPSHOT, CLEAN_SNAPSHOT).accessibility.credit;
    expect(credit).toBeGreaterThan(0.8);
    expect(credit).toBeLessThan(1);
  });

  it('lowers accessibility credit as problems are added and never raises it', () => {
    const steps: ((f: QualityFacts) => void)[] = [
      (f) => (f.dom.images.withoutDescription = 1),
      (f) => (f.dom.images.withoutDescription = 6),
      (f) => (f.dom.fields.withoutLabel = 3),
      (f) => (f.dom.controls.withoutName = 5),
      (f) => (f.dom.lang = null),
      (f) => (f.dom.title = ''),
      (f) => (f.dom.headingLevels = [2, 4, 6]),
    ];
    const cand = clean();
    let last = 1;
    for (const step of steps) {
      step(cand);
      const r = scoreQuality(cand, clean(), CLEAN_SNAPSHOT, CLEAN_SNAPSHOT);
      expect(r.accessibility.credit).toBeLessThan(last);
      last = r.accessibility.credit;
    }
    const lowContrast = snapshot(Array.from({ length: 20 }, () => textBlock('x', [230, 230, 230], WHITE)));
    const worst = scoreQuality(cand, clean(), lowContrast, CLEAN_SNAPSHOT);
    expect(worst.accessibility.credit).toBeLessThan(last);
    expect(worst.accessibility.credit).toBeLessThan(0.1);
    const costs = worst.accessibility.issues.map((i) => i.cost ?? 0);
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
  });

  it('lowers validity credit as problems are added and never raises it', () => {
    const bodies = [
      '<p>ok</p>',
      '<p>ok</p><div>open',
      '<p>ok</p><div>open</span>',
      '<p>ok</p><div>open</span><p id="a">1</p><p id="a">2</p>',
      '<p>ok</p><div>open</span><p id="a">1</p><p id="a">2</p><center><font>x</font></center>',
      '<p>ok</p><div>open</span><p id="a">1</p><p id="a">2</p><center><font>x</font></center><td bgcolor="red" align="left">' +
        '<p style="color:red">x</p>'.repeat(12),
    ];
    let last = 1;
    for (const [i, body] of bodies.entries()) {
      const cand = clean();
      // The goal (CLEAN_PAGE) declares its character set, so a candidate that does not is charged for it too.
      cand.source = checkSource(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`);
      const credit = scoreQuality(cand, clean(), CLEAN_SNAPSHOT, CLEAN_SNAPSHOT).validity.credit;
      if (i === 0) expect(credit).toBe(1);
      else expect(credit).toBeLessThan(last);
      last = credit;
    }
    const cand = clean();
    cand.source = checkSource(
      '<html><body>' + ('<div class=a class=b>&copy <!-> <div/>' + bodies[5]).repeat(3) + '<style>' + '.x{color:red!important}'.repeat(12) + '</style>',
    );
    const worst = scoreQuality(cand, clean(), CLEAN_SNAPSHOT, CLEAN_SNAPSHOT).validity;
    expect(worst.credit).toBeLessThan(last);
    expect(worst.credit).toBeLessThan(0.1);
  });

  it('is deterministic', () => {
    const cand = clean();
    cand.dom.images.withoutDescription = 2;
    cand.source = checkSource('<html><body><div>x</span>');
    const a = scoreQuality(cand, clean(), CLEAN_SNAPSHOT, CLEAN_SNAPSHOT);
    const b = scoreQuality(cand, clean(), CLEAN_SNAPSHOT, CLEAN_SNAPSHOT);
    expect(b).toEqual(a);
  });
});
