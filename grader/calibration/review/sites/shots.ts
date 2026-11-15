// Renders every goal and attempt (no grading), saves page screenshots and contact sheets,
// and builds the pixel-image cheat (x9) from the restaurant goal's screenshots.
//   npx tsx calibration/review/sites/shots.ts
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { Renderer } from '../../../src/render';
import { prepareSite, type PreparedSite } from '../../../src/site-grade';
import { readSite } from '../../../src/calibrate-sites';

const here = dirname(fileURLToPath(import.meta.url));
const CASES = join(here, 'cases');
const OUT = join(here, '..', '..', 'out', 'review', 'sites');

const SCALE = 4;
const THUMB_H = 240;

function thumb(png: Buffer | null): PNG {
  const w = 1280 / SCALE;
  const out = new PNG({ width: w, height: THUMB_H });
  out.data.fill(255);
  if (!png) {
    for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 255; }
    return out;
  }
  const src = PNG.sync.read(png);
  for (let y = 0; y < THUMB_H; y++)
    for (let x = 0; x < w; x++) {
      const sx = x * SCALE, sy = y * SCALE;
      if (sy >= src.height || sx >= src.width) continue;
      const si = (sy * src.width + sx) * 4, di = (y * w + x) * 4;
      out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1]; out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = 255;
    }
  return out;
}

function sheet(rows: (Buffer | null)[][], file: string) {
  const w = 1280 / SCALE, gap = 6;
  const cols = Math.max(...rows.map((r) => r.length));
  const out = new PNG({ width: cols * (w + gap), height: rows.length * (THUMB_H + gap) });
  out.data.fill(40);
  rows.forEach((row, r) => row.forEach((png, c) => {
    const t = thumb(png);
    PNG.bitblt(t, out, 0, 0, w, THUMB_H, c * (w + gap), r * (THUMB_H + gap));
  }));
  writeFileSync(file, PNG.sync.write(out));
}

const COLUMNS: Record<string, string[]> = {
  restaurant: ['index.html', 'menu.html', 'reservations.html', 'find-us.html'],
  portfolio: ['index.html', 'projects.html', 'about.html', 'contact.html', 'blog/index.html', 'blog/2026/quiet-tools.html', 'blog/2026/on-color.html'],
  conference: ['index.html', 'schedule.html', 'speakers.html', 'tickets.html', 'faq.html', 'speakers/ada-lin.html', 'speakers/emi-sato.html'],
};

function pick(site: PreparedSite, path: string): Buffer | null {
  const exact = site.page(path);
  if (exact) return exact.snapshot.png;
  const base = path.split('/').pop();
  const alt = site.pages.find((p) => p.path.split('/').pop() === base && path.includes('/') === p.path.includes('/'));
  return alt ? alt.snapshot.png : null;
}

function savePages(site: PreparedSite, dir: string) {
  mkdirSync(dir, { recursive: true });
  for (const p of site.pages) writeFileSync(join(dir, p.path.replace(/\//g, '__') + '.png'), p.snapshot.png);
}

const renderer = new Renderer();
try {
  rmSync(OUT, { recursive: true, force: true });
  const goals: Record<string, PreparedSite> = {};
  for (const set of Object.keys(COLUMNS)) goals[set] = await prepareSite(renderer, readSite(join(CASES, set, 'goal')), true);

  // x9: every restaurant page is the goal's screenshot as a background, with the real header painted over it.
  {
    const g = goals.restaurant;
    const files: Record<string, string> = { 'style.css': g.files.get('style.css')! };
    for (const p of g.pages) {
      const src = PNG.sync.read(p.snapshot.png);
      const html = g.files.get(p.path)!;
      const header = html.match(/<header[\s\S]*?<\/header>/)![0];
      const title = html.match(/<title>.*<\/title>/)![0];
      const uri = `data:image/png;base64,${p.snapshot.png.toString('base64')}`;
      files[p.path] = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${title}\n<link rel="stylesheet" href="style.css">\n<style>body{background:#fbf7f0 url(${uri}) no-repeat 0 0;min-height:${src.height}px}</style>\n</head>\n<body>\n${header}\n</body>\n</html>\n`;
      console.log(`x9 ${p.path}: screenshot ${src.width}x${src.height}, page ${(Buffer.byteLength(files[p.path]) / 1024).toFixed(0)} KB`);
    }
    const dir = join(CASES, 'restaurant', 'attempts', 'x9-cheat-pixel-image');
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(files)) { mkdirSync(dirname(join(dir, k)), { recursive: true }); writeFileSync(join(dir, k), v); }
  }

  for (const set of Object.keys(COLUMNS)) {
    const goal = goals[set];
    savePages(goal, join(OUT, set, 'goal'));
    const rows: { name: string; row: (Buffer | null)[] }[] = [{ name: 'goal', row: COLUMNS[set].map((c) => pick(goal, c)) }];
    const attemptsDir = join(CASES, set, 'attempts');
    for (const name of readdirSync(attemptsDir).sort()) {
      if (!statSync(join(attemptsDir, name)).isDirectory()) continue;
      const site = await prepareSite(renderer, readSite(join(attemptsDir, name)), false);
      savePages(site, join(OUT, set, name));
      rows.push({ name, row: COLUMNS[set].map((c) => pick(site, c)) });
    }
    for (let i = 0; i < rows.length; i += 6) {
      const chunk = rows.slice(i, i + 6);
      const file = join(OUT, `${set}-sheet-${i / 6 + 1}.png`);
      sheet(chunk.map((r) => r.row), file);
      console.log(`${file}: ${chunk.map((r) => r.name).join(', ')}`);
    }
  }
} finally {
  await renderer.close();
}
