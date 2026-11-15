import { describe, expect, it } from 'vitest';
import { colorDistance, deltaE00, rgbToLab } from '../src/color';
import { dominantColor } from '../src/render';
import { fallingCredit, median, risingCredit, round1, wordOverlap, wordPairs, words } from '../src/util';

describe('colour difference (CIEDE2000)', () => {
  // Reference pairs published with the formula (Sharma, Wu, Dalal 2005).
  const pairs: [[number, number, number], [number, number, number], number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ];
  it.each(pairs)('matches the published value for %j vs %j', (a, b, expected) => {
    expect(deltaE00(a, b)).toBeCloseTo(expected, 3);
    expect(deltaE00(b, a)).toBeCloseTo(expected, 3);
  });

  it('is zero for identical colours and large for opposite ones', () => {
    expect(colorDistance([12, 34, 56], [12, 34, 56])).toBe(0);
    expect(colorDistance([255, 255, 255], [0, 0, 0])).toBeCloseTo(100, 0);
    expect(colorDistance([37, 99, 235], [42, 103, 238])).toBeLessThan(3);
    expect(colorDistance([37, 99, 235], [22, 163, 74])).toBeGreaterThan(35);
  });

  it('converts white and black to the ends of the lightness scale', () => {
    expect(rgbToLab([255, 255, 255])[0]).toBeCloseTo(100, 3);
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 3);
  });
});

describe('text helpers', () => {
  it('splits into lower-case words without punctuation', () => {
    expect(words('Ship FASTER, today! 24/7')).toEqual(['ship', 'faster', 'today', '24', '7']);
  });

  it('scores word overlap, charging for both missing and extra words', () => {
    expect(wordOverlap(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    expect(wordOverlap(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(1);
    expect(wordOverlap(['a', 'b', 'c', 'd'], ['a', 'b'])).toBeCloseTo(2 / 3, 10);
    expect(wordOverlap(['a', 'b'], ['a', 'b', 'c', 'd'])).toBeCloseTo(2 / 3, 10);
    expect(wordOverlap(['a', 'a'], ['a'])).toBeCloseTo(2 / 3, 10);
    expect(wordOverlap(['a'], ['b'])).toBe(0);
    expect(wordOverlap([], [])).toBe(1);
    expect(wordOverlap(['a'], [])).toBe(0);
  });

  it('pairs neighbouring words inside each block only, never across blocks', () => {
    expect(wordPairs([['dog', 'bites', 'man']])).toEqual(['dog bites', 'bites man']);
    expect(wordPairs([['a', 'b'], ['c', 'd']])).toEqual(['a b', 'c d']);
    expect(wordPairs([['solo'], []])).toEqual([]);
    expect(wordPairs([])).toEqual([]);
    // Same words, different order: the single words agree, the pairs do not.
    const a = wordPairs([['dog', 'bites', 'man']]);
    const b = wordPairs([['man', 'bites', 'dog']]);
    expect(wordOverlap(['dog', 'bites', 'man'], ['man', 'bites', 'dog'])).toBe(1);
    expect(wordOverlap(a, b)).toBe(0);
  });
});

describe('credit curves', () => {
  it('falls from full credit to none in a straight line', () => {
    expect(fallingCredit(5, 8, 240)).toBe(1);
    expect(fallingCredit(8, 8, 240)).toBe(1);
    expect(fallingCredit(124, 8, 240)).toBeCloseTo(0.5, 10);
    expect(fallingCredit(240, 8, 240)).toBe(0);
    expect(fallingCredit(999, 8, 240)).toBe(0);
  });

  it('rises from none to full credit in a straight line', () => {
    expect(risingCredit(0.95, 0.9, 0.4)).toBe(1);
    expect(risingCredit(0.65, 0.9, 0.4)).toBeCloseTo(0.5, 10);
    expect(risingCredit(0.4, 0.9, 0.4)).toBe(0);
  });

  it('rounds and takes medians predictably', () => {
    expect(round1(87.649)).toBe(87.6);
    expect(round1(87.65)).toBe(87.7);
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('dominant colour of a screenshot region', () => {
  // A 20x20 image: blue everywhere, with a white 10x10 square in the middle.
  const size = 20;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = x >= 5 && x < 15 && y >= 5 && y < 15;
      pixels.set(inside ? [255, 255, 255, 255] : [0, 0, 200, 255], (y * size + x) * 4);
    }
  }
  const square = { x: 5, y: 5, w: 10, h: 10 };

  it('finds the colour inside a rectangle', () => {
    expect(dominantColor(pixels, size, size, square)).toEqual([255, 255, 255]);
  });

  it('finds the colour around a rectangle, ignoring what is in it', () => {
    expect(dominantColor(pixels, size, size, square, 'around')).toEqual([0, 0, 200]);
  });
});
