// Checks the site and scene challenge files against their goals. Plain Node, no dependencies.
// Run from anywhere: node challenge-pack/check-sites-scenes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const problems = [];
const fail = (msg) => problems.push(msg);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function load(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(here, rel), 'utf8')).challenges; }
  catch (e) { fail(rel + ' does not parse: ' + e.message); return []; }
}
function listFiles(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(path.join(dir, e.name), base + e.name + '/') : [base + e.name]);
}
const values = (c) => c.spec.flatMap((g) => g.items.map((i) => i.label + ' ' + i.value));
function checkHex(c, source) {
  const low = source.toLowerCase();
  for (const v of values(c)) {
    for (const m of v.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
      const hex = m[1].toLowerCase();
      if (!low.includes('#' + hex) && !(hex.length === 6 && low.includes('0x' + hex))) fail(c.slug + ': colour #' + hex + ' is not in the goal');
    }
  }
}

const sites = load('sites/challenges.json');
const scenes = load('scenes/challenges.json');
const seen = new Set();
for (const c of [...sites, ...scenes]) {
  if (!SLUG.test(c.slug || '')) fail('bad slug: ' + c.slug);
  if (seen.has(c.slug)) fail('duplicate slug: ' + c.slug);
  seen.add(c.slug);
  for (const k of ['title', 'level', 'brief', 'spec', 'kind']) if (c[k] === undefined) fail(c.slug + ': missing ' + k);
  if (![1, 2, 3].includes(c.level)) fail(c.slug + ': level must be 1, 2 or 3');
}

for (const c of sites) {
  if (c.kind !== 'site') fail(c.slug + ': kind should be site');
  const dir = path.join(here, 'sites', 'goals', c.slug);
  if (!fs.existsSync(path.join(dir, 'index.html'))) { fail(c.slug + ': goal folder or index.html missing'); continue; }
  const files = listFiles(dir);
  let all = '';
  for (const f of files) {
    const size = fs.statSync(path.join(dir, f)).size;
    if (size > 300 * 1024) fail(c.slug + ': ' + f + ' is over 300 KB');
    all += fs.readFileSync(path.join(dir, f), 'utf8') + '\n';
  }
  const pageGroups = c.spec.map((g) => g.group).filter((g) => g.startsWith('Page ')).map((g) => g.slice(5));
  const fileItem = c.spec.find((g) => g.group === 'Site')?.items.find((i) => i.label.startsWith('Files'));
  const listed = fileItem ? fileItem.value.split(',').map((s) => s.trim()) : [];
  for (const p of [...pageGroups, ...listed]) if (!files.includes(p)) fail(c.slug + ': spec names ' + p + ', which is not in the goal folder');
  for (const f of files) {
    if (f.endsWith('.html') && !pageGroups.includes(f)) fail(c.slug + ': ' + f + ' has no page group in the spec');
    if (!listed.includes(f)) fail(c.slug + ': ' + f + ' is not in the spec file list');
  }
  checkHex(c, all);
}

for (const c of scenes) {
  if (c.kind !== 'scene') fail(c.slug + ': kind should be scene');
  const file = path.join(here, 'scenes', 'goals', c.slug + '.js');
  if (!fs.existsSync(file)) { fail(c.slug + ': goal file missing'); continue; }
  const code = fs.readFileSync(file, 'utf8');
  if (!code.includes('function buildScene')) fail(c.slug + ': goal has no function buildScene');
  const parts = c.spec.find((g) => g.group === 'Parts')?.items || [];
  for (const it of parts) {
    // A label names one or more parts: "seat", "eyeL and eyeR", "fin0 to fin3", "leg (four)".
    const label = it.label.replace(/\(.*?\)/g, ' ');
    const range = /^\s*([A-Za-z]+)\d+\s+to\s+\1\d+\s*$/.exec(label);
    const names = range ? [range[1]] : label.split(/\s+and\s+|,/).map((s) => s.trim()).filter(Boolean);
    // A range's names are built in a loop ('fin' + i) or written out (button1), so only the prefix is required.
    for (const n of names) if (!new RegExp('\\b' + n + (range ? '' : '\\b')).test(code)) fail(c.slug + ': part "' + n + '" does not appear in the goal code');
  }
  checkHex(c, code);
}

const total = sites.length + scenes.length;
if (problems.length) { console.log(problems.join('\n')); console.log('FAIL: ' + problems.length + ' problem(s) across ' + total + ' challenges'); process.exit(1); }
console.log('OK: ' + sites.length + ' site and ' + scenes.length + ' scene challenges checked');
