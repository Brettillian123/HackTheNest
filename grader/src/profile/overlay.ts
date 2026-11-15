/**
 * Draws a profile over the goal's screenshot: each component outlined in
 * the colour of its importance and labelled "id kind importance".
 */
import { PNG } from 'pngjs';
import type { PageComponent, PageProfile } from './types';

// 3x5 pixel font, rows top to bottom.
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', '.': '000000000000010', '-': '000000111000000', ':': '000010000010000', ' ': '000000000000000',
};

const COLOURS: Record<PageComponent['importance'], [number, number, number]> = {
  critical: [220, 38, 38], major: [234, 140, 0], normal: [37, 99, 235], minor: [120, 120, 120],
};

export function drawOverlay(png: Buffer, profile: PageProfile): Buffer {
  const img = PNG.sync.read(png);
  const { width, height, data } = img;
  const set = (x: number, y: number, c: [number, number, number], alpha = 1) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 4;
    data[o] = Math.round(data[o] * (1 - alpha) + c[0] * alpha);
    data[o + 1] = Math.round(data[o + 1] * (1 - alpha) + c[1] * alpha);
    data[o + 2] = Math.round(data[o + 2] * (1 - alpha) + c[2] * alpha);
    data[o + 3] = 255;
  };
  const rect = (x0: number, y0: number, w: number, h: number, c: [number, number, number], t: number) => {
    const x1 = x0 + w - 1, y1 = y0 + h - 1;
    for (let k = 0; k < t; k++) {
      for (let x = x0; x <= x1; x++) { set(x, y0 + k, c); set(x, y1 - k, c); }
      for (let y = y0; y <= y1; y++) { set(x0 + k, y, c); set(x1 - k, y, c); }
    }
  };
  const label = (text: string, x: number, y: number, c: [number, number, number]) => {
    const s = 2;
    const chars = text.toUpperCase().split('').map((ch) => GLYPHS[ch] ?? GLYPHS[' ']);
    const w = chars.length * 4 * s + s, h = 7 * s;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) set(x + xx, y + yy, c, 0.9);
    chars.forEach((g, k) => {
      for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) {
        if (g[r * 3 + q] !== '1') continue;
        for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) set(x + s + (k * 4 + q) * s + a, y + s + r * s + b, [255, 255, 255]);
      }
    });
  };
  const visit = (c: PageComponent, depth: number) => {
    const col = COLOURS[c.importance];
    const r = { x: Math.round(c.rect.x), y: Math.round(c.rect.y), w: Math.round(c.rect.w), h: Math.round(c.rect.h) };
    rect(r.x + depth * 2, r.y + depth * 2, Math.max(1, r.w - depth * 4), Math.max(1, r.h - depth * 4), col, depth === 0 ? 3 : 1);
    c.children.forEach((k) => visit(k, depth + 1));
    label(`${c.id} ${c.type} ${c.importance}`, r.x + depth * 2 + 3, r.y + depth * 2 + 3 + (depth > 0 ? 0 : 0), col);
  };
  profile.components.forEach((c) => visit(c, 0));
  return PNG.sync.write(img);
}
