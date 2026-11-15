/**
 * Measuring: the reference and the submission (each broken into components by
 * src/profile) to plain numbers (IntentMeasurements) and plain-words notes.
 * No score is made here; combine.ts turns the numbers into criteria.
 */
import { buildPageProfile, flattenComponents, IMPORTANCE_WEIGHT, type PageComponent } from '../profile/index';
import type { Block, PageSnapshot, RGB, Rect } from '../types';
import {
  closeness, colourCredit, groupDeviation, readSeverity, wordCredit,
  zoneOf, type ColourRow, type GroupRow, type IntentCriterionId, type IntentMeasurements, type ReadRow, type Zone,
} from './combine';
import { chroma, colourName, containsFact, contrast, hue, hueDistance, lightness, normalise, wordsOf } from './text';


/** Limits that keep a hostile page fast; they never bind on a real one. */
const MAX_TEXTS = 3000;
const MAX_OVERLAP_TEXTS = 1500;
const MAX_SIBLINGS = 12;
const MAX_GROUPS = 40;
const MAX_ITEMS = 50;
const MAX_COMPONENTS = 400;

interface Comp {
  c: PageComponent;
  depth: number;
  parent: Comp | null;
  /** Every block of the component and its descendants. */
  blocks: number[];
  words: Set<string>;
  family: string;
}

const FAMILY: Record<string, string> = {
  navigation: 'nav', hero: 'text', heading: 'text', text: 'text', banner: 'text',
  'card-group': 'group', list: 'group', stats: 'group', card: 'card', table: 'table', form: 'form',
  image: 'media', chart: 'media', footer: 'footer', sidebar: 'sidebar', other: 'any',
};
const COMPATIBLE = new Set(['group|table', 'card|text', 'footer|text', 'nav|sidebar', 'group|card']);
const compatible = (a: string, b: string) =>
  a === b || a === 'any' || b === 'any' || COMPATIBLE.has(`${a}|${b}`) || COMPATIBLE.has(`${b}|${a}`);

function compsOf(snap: PageSnapshot): { all: Comp[]; tops: Comp[] } {
  const profile = buildPageProfile(snap);
  const all: Comp[] = [];
  const tops: Comp[] = [];
  const walk = (c: PageComponent, depth: number, parent: Comp | null): Comp => {
    const comp: Comp = { c, depth, parent, blocks: [], words: new Set(), family: FAMILY[c.type] ?? 'any' };
    if (all.length < MAX_COMPONENTS) all.push(comp);
    comp.blocks.push(...c.blocks);
    for (const k of c.children) comp.blocks.push(...walk(k, depth + 1, comp).blocks);
    comp.blocks.sort((a, b) => a - b);
    for (const i of comp.blocks) {
      const t = snap.blocks[i].text;
      if (snap.blocks[i].kind === 'text' && t) for (const w of wordsOf(t)) comp.words.add(w);
    }
    return comp;
  };
  for (const c of profile.components) tops.push(walk(c, 0, null));
  return { all, tops };
}

const area = (r: Rect) => Math.max(0, r.w) * Math.max(0, r.h);
const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;
const vOverlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const beside = (a: Rect, b: Rect) => vOverlap(a, b) > 0.5 * Math.min(a.h, b.h);
const precedes = (a: Rect, b: Rect) => (beside(a, b) ? a.x < b.x : a.y < b.y);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const unThe = (name: string) => name.replace(/^the /, '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const quote = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return `'${t.length > 40 ? t.slice(0, 37) + '...' : t}'`;
};
const region = (fx: number, fy: number) =>
  `${fy < 0.33 ? 'top' : fy > 0.67 ? 'bottom' : 'middle'} ${fx < 0.33 ? 'left' : fx > 0.67 ? 'right' : 'centre'}`;

/** For each reference component (top two levels), its counterpart in the submission and the share of its words found there. */
function matchComponents(R: { all: Comp[]; tops: Comp[] }, C: { all: Comp[] }, ref: PageSnapshot, cand: PageSnapshot) {
  const list: Comp[] = [];
  for (const t of R.tops) {
    list.push(t);
    for (const k of t.c.children) {
      const kc = R.all.find((x) => x.c === k);
      if (kc) list.push(kc);
    }
  }
  const used = new Set<Comp>();
  const usedTop: Comp[] = [];
  const under = (c: Comp, a: Comp) => { for (let p: Comp | null = c; p; p = p.parent) if (p === a) return true; return false; };
  const out = new Map<Comp, { cand: Comp | null; cover: number; compatible: boolean }>();
  // Top-level parts first, the weightiest first; each takes its own part of the submission
  // (one block of text cannot stand in for the menu, the hero and the cards at once).
  const order = [...list].sort((a, b) =>
    a.depth - b.depth || (a.depth === 0 ? IMPORTANCE_WEIGHT[b.c.importance] * b.words.size - IMPORTANCE_WEIGHT[a.c.importance] * a.words.size : 0) || list.indexOf(a) - list.indexOf(b));
  for (const r of order) {
    let best: Comp | null = null;
    let bestCover = 0;
    let bestCompat = false;
    // A child is looked for inside its parent's counterpart.
    const parentMatch = r.parent ? out.get(r.parent)?.cand ?? null : null;
    const pool = r.depth === 0
      ? C.all.filter((c) => !usedTop.some((u) => under(c, u) || under(u, c)))
      : parentMatch ? C.all.filter((c) => under(c, parentMatch)) : C.all;
    if (r.words.size) {
      const scored: { c: Comp; cover: number; compat: boolean; score: number }[] = [];
      for (const c of pool) {
        let hit = 0;
        for (const w of r.words) if (c.words.has(w)) hit++;
        const cover = hit / r.words.size;
        if (cover === 0) continue;
        const compat = compatible(r.family, c.family);
        scored.push({ c, cover, compat, score: cover * (compat ? 1 : 0.6) });
      }
      const top = scored.reduce((a, s) => Math.max(a, s.score), 0);
      // Near ties go to the component closest in size to the reference's (the most specific one).
      const ra = Math.max(1, area(r.c.rect));
      let bestFit = Infinity;
      for (const s of scored) {
        if (s.score < top - 0.05) continue;
        const fit = Math.abs(Math.log(Math.max(1, area(s.c.c.rect)) / ra)) - s.score;
        if (fit < bestFit) { bestFit = fit; best = s.c; bestCover = s.cover; bestCompat = s.compat; }
      }
    } else {
      // A component without words (a picture): the nearest unused one of the same kind.
      let bestD = Infinity;
      for (const c of pool) {
        if (used.has(c) || c.words.size || !compatible(r.family, c.family) || c.family === 'any' && r.family !== 'any') continue;
        const d = Math.abs(cx(c.c.rect) / cand.width - cx(r.c.rect) / ref.width) + Math.abs(cy(c.c.rect) / Math.max(1, cand.height) - cy(r.c.rect) / Math.max(1, ref.height));
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) { bestCover = 1; bestCompat = true; }
    }
    if (best) used.add(best);
    if (best && r.depth === 0) usedTop.push(best);
    out.set(r,{ cand: best, cover: bestCover, compatible: bestCompat });
  }
  return { list, match: out };
}

const GROUPS = new Set(['card-group', 'list', 'stats', 'navigation']);

/** Lines of text inside a component (texts side by side are one line), each as its texts' rects. */
function textLines(c: Comp, snap: PageSnapshot): Rect[][] {
  const rs = c.blocks.filter((i) => snap.blocks[i].kind === 'text').map((i) => snap.blocks[i].rect).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Rect[][] = [];
  for (const r of rs) {
    const l = lines.find((x) => x.some((q) => beside(q, r)));
    if (l) l.push(r); else lines.push([r]);
  }
  return lines;
}

/** Columns of one line: texts closer than 24 px side by side are one cell (an avatar and a name). */
function cellsOf(line: Rect[]): number {
  const s = [...line].sort((a, b) => a.x - b.x);
  let n = 0, right = -Infinity;
  for (const r of s) { if (r.x - right >= 24) n++; right = Math.max(right, r.x + r.w); }
  return n;
}

/** Number of items a group holds: a table's rows, a group's like children, a menu's texts. Null for anything else. */
function itemCount(c: Comp, snap: PageSnapshot): number | null {
  if (c.c.type === 'table') return textLines(c, snap).length;
  if (!GROUPS.has(c.c.type)) return null;
  if (c.c.children.length >= 2) return c.c.children.length;
  if (c.c.type === 'navigation') return c.blocks.filter((i) => snap.blocks[i].kind === 'text').length;
  return null;
}

/** A table's columns: the typical number of cells per line. */
function columnCount(c: Comp, snap: PageSnapshot): number {
  return Math.round(median(textLines(c, snap).map(cellsOf)));
}

function textBlocks(snap: PageSnapshot): number[] {
  const out: number[] = [];
  for (let i = 0; i < snap.blocks.length && out.length < MAX_TEXTS; i++) {
    const b = snap.blocks[i];
    if (b.kind === 'text' && b.text && b.text.trim() && b.textStyle) out.push(i);
  }
  return out;
}

function readRows(snap: PageSnapshot, texts: number[]): { rows: ReadRow[]; idx: number[]; overlaps: [number, number][] } {
  const rows: ReadRow[] = [];
  const idx: number[] = [];
  for (const i of texts) {
    const b = snap.blocks[i];
    const st = b.textStyle!;
    const ratio = contrast(st.color, b.behind);
    const large = st.fontSize >= 24 || (st.bold && st.fontSize >= 18.66);
    const required = large ? 3 : 4.5;
    const off = b.rect.x < -2 || b.rect.x + b.rect.w > snap.width + 2 ? 1 : 0;
    if (ratio < required || st.fontSize < 14 || off) {
      rows.push([Math.round(ratio * 100) / 100, required, Math.round(st.fontSize * 10) / 10, off]);
      idx.push(i);
    }
  }
  // Overlapping text: a sweep down the page.
  const overlaps: [number, number][] = [];
  const sorted = texts.slice(0, MAX_OVERLAP_TEXTS).sort((a, b) => snap.blocks[a].rect.y - snap.blocks[b].rect.y || a - b);
  for (let i = 0; i < sorted.length && overlaps.length < 200; i++) {
    const a = snap.blocks[sorted[i]].rect;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = snap.blocks[sorted[j]].rect;
      if (b.y >= a.y + a.h) break;
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 0 && iy > 0 && ix * iy > 0.3 * Math.min(area(a), area(b))) overlaps.push([sorted[i], sorted[j]]);
    }
  }
  return { rows, idx, overlaps };
}

const firstText = (c: PageComponent, comps: Map<PageComponent, Comp>, snap: PageSnapshot): Block | null => {
  const cc = comps.get(c);
  if (!cc) return null;
  for (const i of cc.blocks) if (snap.blocks[i].kind === 'text' && snap.blocks[i].textStyle) return snap.blocks[i];
  return null;
};

/** Groups of like items (two or more children of one kind) and how unalike they are. */
function groupRows(all: Comp[], snap: PageSnapshot): { rows: GroupRow[]; names: string[] } {
  const byC = new Map(all.map((x) => [x.c, x] as [PageComponent, Comp]));
  const rows: GroupRow[] = [];
  const names: string[] = [];
  for (const g of all) {
    if (rows.length >= MAX_GROUPS) break;
    const kids = g.c.children.slice(0, MAX_ITEMS);
    if (kids.length < 2 || !kids.every((k) => k.type === kids[0].type)) continue;
    const rs = kids.map((k) => k.rect);
    const cv = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return m > 0 ? xs.reduce((a, b) => a + Math.abs(b - m), 0) / xs.length / m : 0;
    };
    const sizeCv = Math.max(cv(rs.map((r) => r.w)), cv(rs.map((r) => r.h)));
    // Rows of items, by side-by-side relation with the row's first item.
    const order = rs.map((r, i) => i).sort((a, b) => rs[a].y - rs[b].y || rs[a].x - rs[b].x);
    const lines: Rect[][] = [];
    for (const i of order) {
      const line = lines.find((l) => beside(l[0], rs[i]));
      if (line) line.push(rs[i]); else lines.push([rs[i]]);
    }
    const hGaps: number[] = [];
    let alignRel = 0;
    const medH = median(rs.map((r) => r.h)) || 1;
    const medW = median(rs.map((r) => r.w)) || 1;
    for (const l of lines) {
      l.sort((a, b) => a.x - b.x);
      for (let i = 1; i < l.length; i++) hGaps.push(l[i].x - (l[i - 1].x + l[i - 1].w));
      if (l.length > 1) alignRel = Math.max(alignRel, (Math.max(...l.map((r) => r.y)) - Math.min(...l.map((r) => r.y))) / medH);
    }
    if (lines.length > 1) {
      const firsts = lines.map((l) => l[0].x);
      alignRel = Math.max(alignRel, (Math.max(...firsts) - Math.min(...firsts)) / medW);
    }
    const vGaps: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const prevBottom = Math.max(...lines[i - 1].map((r) => r.y + r.h));
      vGaps.push(Math.min(...lines[i].map((r) => r.y)) - prevBottom);
    }
    const gapCv = (gs: number[]) => {
      if (gs.length < 2) return 0;
      const m = gs.reduce((a, b) => a + b, 0) / gs.length;
      return gs.reduce((a, b) => a + Math.abs(b - m), 0) / gs.length / Math.max(8, Math.abs(m));
    };
    const styles = kids.map((k) => firstText(k, byC, snap)).filter((b): b is Block => !!b).map((b) => `${Math.round(b.textStyle!.fontSize)}|${b.textStyle!.bold}`);
    let styleShare = 0;
    if (styles.length >= 2) {
      const counts = new Map<string, number>();
      for (const s of styles) counts.set(s, (counts.get(s) ?? 0) + 1);
      styleShare = 1 - Math.max(...counts.values()) / styles.length;
    }
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    rows.push([r3(sizeCv), r3(Math.max(gapCv(hGaps), gapCv(vGaps))), r3(alignRel), r3(styleShare)]);
    names.push(g.c.name);
  }
  return { rows, names };
}

interface TypeFacts { families: number; sizes: number; headingRatio: number | null; bodyClass: string | null; headClass: string | null }

function typeFacts(snap: PageSnapshot, texts: number[]): TypeFacts {
  let total = 0;
  const byClass = new Map<string, number>();
  const bySize = new Map<number, number>();
  const sized: { size: number; chars: number; cls: string }[] = [];
  for (const i of texts) {
    const b = snap.blocks[i];
    const n = b.text!.trim().length;
    const st = b.textStyle!;
    total += n;
    byClass.set(st.fontClass, (byClass.get(st.fontClass) ?? 0) + n);
    const s = Math.round(st.fontSize);
    bySize.set(s, (bySize.get(s) ?? 0) + n);
    sized.push({ size: st.fontSize, chars: n, cls: st.fontClass });
  }
  if (!total) return { families: 0, sizes: 0, headingRatio: null, bodyClass: null, headClass: null };
  const families = [...byClass.values()].filter((n) => n >= 0.05 * total).length;
  const sizes = [...bySize.values()].filter((n) => n >= 0.01 * total).length;
  // Body size: the size at the middle of all characters.
  sized.sort((a, b) => a.size - b.size);
  let acc = 0;
  let body = sized[0].size;
  for (const s of sized) { acc += s.chars; if (acc >= total / 2) { body = s.size; break; } }
  const top = sized[sized.length - 1];
  const bodyCls = new Map<string, number>();
  for (const s of sized) if (s.size <= body * 1.1) bodyCls.set(s.cls, (bodyCls.get(s.cls) ?? 0) + s.chars);
  const bodyClass = [...bodyCls.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
  return { families, sizes, headingRatio: body > 0 ? Math.round((top.size / body) * 1000) / 1000 : null, bodyClass, headClass: top.cls };
}

/** The band colour a component paints, if it paints one of its own (a box covering at least half of it). */
function bandOf(c: Comp, snap: PageSnapshot): RGB | null {
  const a = area(c.c.rect);
  let best: Block | null = null;
  for (const i of c.blocks) {
    const b = snap.blocks[i];
    if (b.kind !== 'box' || !b.boxStyle) continue;
    if (area(b.rect) >= 0.5 * a && (!best || area(b.rect) > area(best.rect))) best = b;
  }
  return best ? best.boxStyle!.background : null;
}

/** The small box a short text sits in, like a button. */
function buttonBox(snap: PageSnapshot, t: Block): Block | null {
  let best: Block | null = null;
  for (const b of snap.blocks) {
    if (b.kind !== 'box' || !b.boxStyle || b.rect.w > 400 || b.rect.h > 90) continue;
    const r = b.rect, q = t.rect;
    if (q.x >= r.x - 1 && q.y >= r.y - 1 && q.x + q.w <= r.x + r.w + 1 && q.y + q.h <= r.y + r.h + 1 && (!best || area(r) < area(best.rect))) best = b;
  }
  return best;
}

function colourRow(a: RGB, b: RGB): ColourRow {
  const r2 = (x: number) => Math.round(x * 1000) / 1000;
  return [Math.round(hueDistance(hue(a), hue(b))), r2(chroma(a)), r2(chroma(b)), r2(Math.abs(lightness(a) - lightness(b)))];
}

/** One thing measured, before points are given: `deficit` is its share of its criterion's loss (relative within the criterion). */
export interface CheckDraft {
  criterion: IntentCriterionId;
  component: string;
  what: 'position' | 'size' | 'colour' | 'typeface' | 'textSize' | 'contrast' | 'count' | 'order' | 'keyFact' | 'missing' | 'extra' | 'spacing' | 'alignment' | 'wording';
  measured: string;
  zone: Zone;
  /** Exactly as the reference (no loss at all). */
  exact: boolean;
  deficit: number;
  /** The sentence before the verdict: "The order summary is 1.02 times the reference's width". */
  say: string;
}

export interface Measured { m: IntentMeasurements; checks: CheckDraft[] }

const f2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function colourWords(c: RGB, nc: number): string {
  return chroma(c) < nc ? `${colourName(c, nc)} (lightness ${pct(lightness(c))})` : `${colourName(c, nc)} (hue ${Math.round(hue(c))})`;
}

export function measure(ref: PageSnapshot, cand: PageSnapshot, keyFacts: string[], v: Record<string, number>): Measured {
  const checks: CheckDraft[] = [];
  const add = (c: Omit<CheckDraft, 'exact'> & { exact?: boolean }) => checks.push({ exact: false, ...c, deficit: Math.max(0, c.deficit) });
  const R = compsOf(ref);
  const C = compsOf(cand);
  const refTexts = textBlocks(ref);
  const candTexts = textBlocks(cand);

  // ---- key facts ----
  const pageText = normalise(candTexts.map((i) => cand.blocks[i].text!).join(' '));
  const facts = keyFacts.map((f) => normalise(f)).filter(Boolean);
  let found = 0;
  facts.forEach((f, i) => {
    if (containsFact(pageText, f)) found++;
    else add({ criterion: 'keyFacts', component: 'the page', what: 'keyFact', measured: `${quote(keyFacts[i])} not found`, zone: 'off', deficit: 1, say: `The page does not show ${quote(keyFacts[i])}` });
  });

  // ---- completeness ----
  const { list, match } = matchComponents(R, C, ref, cand);
  const completeness = list.map((r) => {
    const mt = match.get(r)!;
    const weight = IMPORTANCE_WEIGHT[r.c.importance] * (r.depth === 0 && r.c.children.length ? 0.5 : 1);
    const present = !!mt.cand && mt.cover > 0;
    const miss = present ? Math.round((1 - mt.cover) * 1000) / 1000 : 1;
    const compat = present ? mt.compatible : true;
    const credit = wordCredit(miss, v.wordVicinity, v.wordClose, v.wordEdge, v.vicinityEdge) * (compat ? 1 : v.typeMismatchCredit);
    if (!present) {
      add({ criterion: 'completeness', component: r.c.name, what: 'missing', measured: 'not found', zone: 'off', deficit: weight, say: `The page has nothing like ${r.c.name}` });
    } else {
      const kind = r.c.type === 'other' ? 'its own part' : `a ${r.c.type.replace('-', ' ')}`;
      add({
        criterion: 'completeness', component: r.c.name, what: 'wording', measured: `${pct(mt.cover)} of its words${compat ? '' : `, not as ${kind}`}`,
        zone: compat ? zoneOf(miss, v.wordVicinity, v.wordClose) : 'off', exact: miss === 0 && compat, deficit: weight * (1 - credit),
        say: miss === 0 && compat ? `${cap(r.c.name)} has all the words asked for` : `${cap(r.c.name)} has ${pct(mt.cover)} of the words asked for${compat ? '' : ` but is not built as ${kind}`}`,
      });
    }
    return { weight, miss, compatible: compat };
  });

  // ---- structure ----
  const siblingSets: Comp[][] = [R.tops.slice(0, MAX_SIBLINGS)];
  for (const t of R.tops) siblingSets.push(t.c.children.slice(0, MAX_SIBLINGS).map((k) => R.all.find((x) => x.c === k)).filter((x): x is Comp => !!x));
  let orderHeld = 0, orderTotal = 0;
  const broken: [Comp, Comp][] = [];
  for (const set of siblingSets) {
    const pairsOf = set.map((r) => ({ r, c: match.get(r)?.cand ?? null })).filter((p) => p.c && (match.get(p.r)?.cover ?? 0) > 0) as { r: Comp; c: Comp }[];
    for (let i = 0; i < pairsOf.length; i++) {
      for (let j = i + 1; j < pairsOf.length; j++) {
        const a = pairsOf[i], b = pairsOf[j];
        if (a.c === b.c || a.c.blocks.some((x) => b.c.blocks.includes(x))) continue;
        orderTotal++;
        if (precedes(a.r.c.rect, b.r.c.rect) === precedes(a.c.c.rect, b.c.c.rect)) orderHeld++;
        else broken.push([a.r, b.r]);
      }
    }
  }
  const counts: { ref: number; cand: number }[] = [];
  const countChecks: { name: string; n: number; k: number; what: string }[] = [];
  for (const r of list) {
    const mt = match.get(r)!;
    const n = itemCount(r, ref);
    if (n === null || n < 2 || !mt.cand || mt.cover === 0) continue;
    const k = r.c.type === 'table' ? textLines(mt.cand, cand).length
      : r.c.type === 'navigation' && mt.cand.c.children.length < 2 ? mt.cand.blocks.filter((i) => cand.blocks[i].kind === 'text').length
      : mt.cand.c.children.length;
    counts.push({ ref: n, cand: k });
    countChecks.push({ name: r.c.name, n, k, what: r.c.type === 'table' ? 'rows' : 'items' });
    if (r.c.type === 'table') {
      const rc = columnCount(r, ref), cc = columnCount(mt.cand, cand);
      if (rc >= 2) { counts.push({ ref: rc, cand: cc }); countChecks.push({ name: r.c.name, n: rc, k: cc, what: 'columns' }); }
    }
  }
  {
    const hasOrder = orderTotal > 0, hasCounts = counts.length > 0;
    const oShare = hasOrder && hasCounts ? v.orderShare : hasOrder ? 1 : 0;
    for (const [a, b] of broken) {
      add({ criterion: 'structure', component: a.c.name, what: 'order', measured: `after ${unThe(b.c.name)}`, zone: 'off', deficit: oShare / orderTotal, say: `${cap(a.c.name)} and ${unThe(b.c.name)} are the other way round from the brief` });
    }
    for (const c of countChecks) {
      const credit = Math.max(0, 1 - (v.countCost * Math.abs(c.k - c.n)) / c.n);
      add({
        criterion: 'structure', component: c.name, what: 'count', measured: `${c.k} ${c.what} where the reference has ${c.n}`, zone: c.k === c.n ? 'vicinity' : 'off', exact: c.k === c.n,
        deficit: ((1 - oShare) * (1 - credit)) / countChecks.length, say: `${cap(c.name)} ${c.name.endsWith('s') ? 'have' : 'has'} ${c.k} ${c.what} where the reference has ${c.n}`,
      });
    }
  }

  // ---- no extras ----
  const wordCount = (s: PageSnapshot, t: number[]) => t.reduce((a, i) => a + wordsOf(s.blocks[i].text!).length, 0);
  const rw = wordCount(ref, refTexts), cw = wordCount(cand, candTexts);
  const twoLevels = (X: { all: Comp[] }) => X.all.filter((x) => x.depth <= 1).length;
  const rcN = twoLevels(R), ccN = twoLevels(C);
  const wordRatio = rw > 0 ? cw / rw : cw > 0 ? 10 : 1;
  const compRatio = rcN > 0 ? ccN / rcN : ccN > 0 ? 10 : 1;
  const room = (x: number) => (x <= v.extrasFull ? 1 : Math.max(0, 1 - (x - v.extrasFull) / (v.extrasZero - v.extrasFull)));
  for (const [x, label, say] of [
    [wordRatio, `${f2(wordRatio)} times the reference's amount of text`, `The page has ${f2(wordRatio)} times the reference's amount of text`],
    [compRatio, `${ccN} parts where the reference has ${rcN}`, `The page has ${ccN} parts where the reference has ${rcN}`],
  ] as [number, string, string][]) {
    add({ criterion: 'noExtras', component: 'the page', what: 'extra', measured: label, zone: x <= v.extrasFull ? 'vicinity' : x <= (v.extrasFull + v.extrasZero) / 2 ? 'close' : 'off', exact: room(x) === 1, deficit: (1 - room(x)) / 2, say });
  }

  // ---- arrangement: relations ----
  let relHeld = 0, relTotal = 0;
  const relBroken: { a: Comp; b: Comp; was: boolean }[] = [];
  for (const set of siblingSets) {
    for (let i = 0; i < set.length; i++) {
      for (let j = i + 1; j < set.length; j++) {
        const a = match.get(set[i]), b = match.get(set[j]);
        if (!a?.cand || !b?.cand || a.cand === b.cand || !a.cover || !b.cover) continue;
        if (a.cand.blocks.some((x) => b.cand!.blocks.includes(x))) continue;
        relTotal++;
        const was = beside(set[i].c.rect, set[j].c.rect);
        if (was === beside(a.cand.c.rect, b.cand.c.rect)) relHeld++;
        else relBroken.push({ a: set[i], b: set[j], was });
      }
    }
  }
  // ---- arrangement: placement, after removing a page-wide vertical shift ----
  const placed = list.filter((r) => match.get(r)?.cand && match.get(r)!.cover > 0);
  const H = (s: PageSnapshot) => Math.max(1, s.height);
  const fx = (r: Rect, s: PageSnapshot) => cx(r) / Math.max(1, s.width);
  const fy = (r: Rect, s: PageSnapshot) => cy(r) / H(s);
  // Only a vertical shift is page-wide (content pushed down); content pinned to one side instead of centred has moved.
  const shiftY = median(placed.filter((r) => r.depth === 0).map((r) => fy(match.get(r)!.cand!.c.rect, cand) - fy(r.c.rect, ref)));
  const weightOf = (r: Comp) => IMPORTANCE_WEIGHT[r.c.importance] * (r.depth === 0 ? 1 : 0.5);
  const place = list.map((r) => {
    if (!placed.includes(r)) return { weight: weightOf(r), d: 1, s: 3 };
    const c = match.get(r)!.cand!.c.rect;
    const dxF = fx(c, cand) - fx(r.c.rect, ref);
    const dyF = fy(c, cand) - shiftY - fy(r.c.rect, ref);
    const d = Math.max(Math.abs(dxF), Math.abs(dyF));
    const s = Math.max(Math.abs(Math.log(Math.max(1, c.w) / Math.max(1, r.c.rect.w))), Math.abs(Math.log(Math.max(1, c.h) / Math.max(1, r.c.rect.h))));
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    return { weight: weightOf(r), d: r3(d), s: r3(s), dxPx: dxF * ref.width, dyPx: dyF * H(ref), wr: c.w / Math.max(1, r.c.rect.w), hr: c.h / Math.max(1, r.c.rect.h) };
  });
  {
    const hasRel = relTotal > 0;
    const rShare = hasRel ? v.relationShare : 0;
    const sumW = place.reduce((a, p) => a + p.weight, 0) || 1;
    for (const x of relBroken) {
      add({ criterion: 'arrangement', component: x.a.c.name, what: 'alignment', measured: x.was ? 'stacked, not side by side' : 'side by side, not stacked', zone: 'off', deficit: rShare / relTotal, say: `${cap(x.a.c.name)} and ${unThe(x.b.c.name)} are ${x.was ? 'stacked where the brief has them side by side' : 'side by side where the brief has them stacked'}` });
    }
    list.forEach((r, i) => {
      const p = place[i] as typeof place[0] & { dxPx?: number; dyPx?: number; wr?: number; hr?: number };
      const base = ((1 - rShare) * p.weight) / sumW;
      if (p.dxPx === undefined) {
        add({ criterion: 'arrangement', component: r.c.name, what: 'missing', measured: 'not there to place', zone: 'off', deficit: base, say: `${cap(r.c.name)} is not there to place` });
        return;
      }
      const pc = closeness(p.d, v.placeVicinity, v.placeClose, v.placeEdge, v.farMult, v.vicinityEdge);
      const sc = closeness(p.s, v.sizeVicinity, v.sizeClose, v.sizeEdge, v.farMult, v.vicinityEdge);
      const lost = 1 - pc * sc;
      const split = (1 - pc) + (1 - sc) || 1;
      const dx = Math.round(p.dxPx!), dy = Math.round(p.dyPx!);
      const posWords = dx === 0 && dy === 0 ? 'exactly where the reference has it'
        : [dx ? `${Math.abs(dx)} px ${dx > 0 ? 'right' : 'left'}` : '', dy ? `${Math.abs(dy)} px ${dy > 0 ? 'lower' : 'higher'}` : ''].filter(Boolean).join(' and ') + ' of where the reference has it';
      add({ criterion: 'arrangement', component: r.c.name, what: 'position', measured: posWords, zone: zoneOf(p.d, v.placeVicinity, v.placeClose), exact: p.d === 0, deficit: (base * lost * (1 - pc)) / split, say: `${cap(r.c.name)} sits ${posWords}` });
      const sizeWords = `${f2(p.wr!)} times the reference's width and ${f2(p.hr!)} times its height`;
      add({ criterion: 'arrangement', component: r.c.name, what: 'size', measured: sizeWords, zone: zoneOf(p.s, v.sizeVicinity, v.sizeClose), exact: p.s === 0, deficit: (base * lost * (1 - sc)) / split, say: `${cap(r.c.name)} is ${sizeWords}` });
    });
  }

  // ---- readability ----
  const rr = readRows(ref, refTexts);
  const cr = readRows(cand, candTexts);
  // The reference's possible faults by their words; several with the same words make one, the worst of each kind.
  const refByText = new Map<string, ReadRow>();
  rr.rows.forEach((row, k) => {
    const key = normalise(ref.blocks[rr.idx[k]].text!);
    const w = refByText.get(key);
    refByText.set(key, w ? [Math.min(w[0], row[0]), Math.max(w[1], row[1]), Math.min(w[2], row[2]), Math.max(w[3], row[3])] : row);
  });
  const candWordSet = new Set(candTexts.map((i) => normalise(cand.blocks[i].text!)));
  const readCand = cr.rows.map((row, k) => ({ row, ref: refByText.get(normalise(cand.blocks[cr.idx[k]].text!)) ?? null }));
  const readRef = [...refByText.entries()].filter(([key]) => !candWordSet.has(key)).map(([, row]) => row);
  cr.rows.forEach((row, k) => {
    const pair = readCand[k].ref;
    const sev = readSeverity(row, v) - (pair ? readSeverity(pair, v) : 0);
    if (sev <= 0) return;
    const t = quote(cand.blocks[cr.idx[k]].text!);
    const zone: Zone = sev < 0.5 ? 'close' : 'off';
    if (row[3]) add({ criterion: 'readability', component: `the text ${t}`, what: 'alignment', measured: 'runs off the page', zone, deficit: sev, say: `The text ${t} runs off the page` });
    else if (row[2] < v.sizeFull && readSeverity([99, 0, row[2], 0], v) >= sev - 1e-9) add({ criterion: 'readability', component: `the text ${t}`, what: 'textSize', measured: `${row[2]} px`, zone, deficit: sev, say: `The text ${t} is ${row[2]} px, too small to read easily` });
    else add({ criterion: 'readability', component: `the text ${t}`, what: 'contrast', measured: `contrast ${row[0].toFixed(1)} to 1, needs ${row[1]} to 1`, zone, deficit: sev, say: `The text ${t} has a contrast of ${row[0].toFixed(1)} to 1 against its background, where ${row[1]} to 1 is needed` });
  });
  const extraOverlaps = cr.overlaps.length - rr.overlaps.length;
  if (extraOverlaps > 0) {
    const shown = cr.overlaps.slice(0, Math.min(3, extraOverlaps));
    for (const [a, b] of shown) {
      add({ criterion: 'readability', component: `the text ${quote(cand.blocks[a].text!)}`, what: 'alignment', measured: `overlaps ${quote(cand.blocks[b].text!)}`, zone: 'off', deficit: extraOverlaps / shown.length, say: `The text ${quote(cand.blocks[a].text!)} overlaps ${quote(cand.blocks[b].text!)}` });
    }
  }

  // ---- consistency ----
  const cg = groupRows(C.all, cand);
  const rg = groupRows(R.all, ref);
  const ct = typeFacts(cand, candTexts);
  const rt = typeFacts(ref, refTexts);
  {
    const refDev = groupDeviation(rg.rows, v);
    const hasGroups = cg.rows.length > 0 || rg.rows.length > 0;
    const gShare = hasGroups ? v.consGroupShare : 0;
    cg.rows.forEach((row, k) => {
      const dev = groupDeviation([row], v);
      const words = `sizes vary ${pct(row[0])}, gaps ${pct(row[1])}, edges ${pct(row[2])}${row[3] > 0 ? `, ${pct(row[3])} in another text style` : ''}`;
      const over = Math.max(0, dev - refDev);
      add({ criterion: 'consistency', component: cg.names[k], what: 'spacing', measured: words, zone: over === 0 ? 'vicinity' : over < 0.25 ? 'close' : 'off', exact: over === 0, deficit: (gShare * over) / cg.rows.length, say: `The items in ${cg.names[k]}: ${words}` });
    });
    const tShare = (1 - gShare) / 5;
    const famAllow = Math.max(v.familiesFree, rt.families);
    const famLost = Math.min(1, 0.5 * Math.max(0, ct.families - famAllow));
    add({ criterion: 'consistency', component: 'the page', what: 'typeface', measured: `${ct.families} type families`, zone: famLost ? 'off' : 'vicinity', exact: !famLost, deficit: tShare * famLost, say: `The page uses ${ct.families} type ${ct.families === 1 ? 'family' : 'families'}` });
    const sizeAllow = Math.max(v.sizesFree, rt.sizes);
    const sizeZero = Math.max(v.sizesZero, sizeAllow + 1);
    const sizesLost = ct.sizes <= sizeAllow ? 0 : Math.min(1, (ct.sizes - sizeAllow) / (sizeZero - sizeAllow));
    add({ criterion: 'consistency', component: 'the page', what: 'textSize', measured: `${ct.sizes} font sizes`, zone: sizesLost ? 'off' : 'vicinity', exact: !sizesLost, deficit: tShare * sizesLost, say: `The page uses ${ct.sizes} different font sizes` });
    const refHier = rt.headingRatio !== null && rt.headingRatio >= v.headingRatio;
    const hierLost = refHier && !(ct.headingRatio !== null && ct.headingRatio >= v.headingRatio) ? 1 : 0;
    add({ criterion: 'consistency', component: 'the main heading', what: 'textSize', measured: `${f2(ct.headingRatio ?? 0)} times the body text`, zone: hierLost ? 'off' : 'vicinity', exact: !hierLost, deficit: tShare * hierLost, say: `The largest heading is ${f2(ct.headingRatio ?? 0)} times the size of the body text${hierLost ? ', not clearly larger' : ''}` });
    const clsName = (c: string | null) => (c === 'sans' ? 'sans-serif' : c === 'mono' ? 'monospace' : c ?? 'none');
    for (const [label, a, b] of [['body text', ct.bodyClass, rt.bodyClass], ['main heading', ct.headClass, rt.headClass]] as [string, string | null, string | null][]) {
      if (!a || !b) continue;
      const same = a === b;
      add({ criterion: 'consistency', component: `the ${label}`, what: 'typeface', measured: `${clsName(a)} where the reference is ${clsName(b)}`, zone: same ? 'vicinity' : 'off', exact: same, deficit: same ? 0 : tShare * (1 - v.typeClassCredit), say: same ? `The ${label} is ${clsName(a)}, as in the reference` : `The ${label} is ${clsName(a)} where the reference's is ${clsName(b)}` });
    }
  }
  const bodyClassSame = rt.bodyClass && ct.bodyClass ? rt.bodyClass === ct.bodyClass : null;
  const headClassSame = rt.headClass && ct.headClass ? rt.headClass === ct.headClass : null;

  // ---- colour families ----
  const colour: { weight: number; row: ColourRow }[] = [];
  const nc = v.neutralChroma;
  const addColour = (component: string, what: string, a: RGB, b: RGB, weight: number) => {
    const row = colourRow(a, b);
    colour.push({ weight, row });
    const credit = colourCredit(row, v);
    const [hd, ca, cb, ld] = row;
    const h = ca < nc && cb < nc ? 0 : ca >= nc && cb >= nc ? hd : 180 * Math.min(1, Math.max(0, (Math.max(ca, cb) - nc) / nc));
    const zh = zoneOf(h, v.hueVicinity, v.hueClose), zl = zoneOf(ld, v.lightVicinity, v.lightClose);
    const zone: Zone = zh === 'off' || zl === 'off' ? 'off' : zh === 'close' || zl === 'close' ? 'close' : 'vicinity';
    const words = `${colourWords(b, nc)} where the reference is ${colourWords(a, nc)}`;
    add({ criterion: 'colour', component, what: 'colour', measured: words, zone, exact: credit === 1, deficit: weight * (1 - credit), say: `${what} is ${words}` });
  };
  addColour('the page', 'The page background', ref.pageBackground, cand.pageBackground, v.colourPageWeight);
  const pageArea = Math.max(1, ref.width * H(ref));
  for (const r of list) {
    const share = area(r.c.rect) / pageArea;
    if (share < 0.02) continue;
    const band = bandOf(r, ref);
    if (!band) continue;
    const mt = match.get(r)!;
    if (!mt.cand || !mt.cover) continue;
    addColour(r.c.name, `The background of ${r.c.name}`, band, bandOf(mt.cand, cand) ?? cand.pageBackground, Math.min(1, share));
  }
  // Emphasis: short texts on a coloured button, or in a coloured ink.
  const emph: { text: string; colour: RGB; button: boolean }[] = [];
  for (const i of refTexts) {
    if (emph.length >= 8) break;
    const b = ref.blocks[i];
    if (wordsOf(b.text!).length > 5 || b.text!.trim().length < 2) continue;
    const box = buttonBox(ref, b);
    if (box && chroma(box.boxStyle!.background) >= nc) emph.push({ text: normalise(b.text!), colour: box.boxStyle!.background, button: true });
    // Ink counts as emphasis only when clearly coloured (slate body text is not a highlight).
    else if (chroma(b.textStyle!.color) >= Math.max(0.2, 2 * nc)) emph.push({ text: normalise(b.text!), colour: b.textStyle!.color, button: false });
  }
  const candByText = new Map<string, Block[]>();
  for (const i of candTexts) {
    const k = normalise(cand.blocks[i].text!);
    const l = candByText.get(k);
    if (l) { if (l.length < 6) l.push(cand.blocks[i]); } else candByText.set(k, [cand.blocks[i]]);
  }
  const shown = (e: typeof emph[0], b: Block): RGB => {
    const box = buttonBox(cand, b);
    const boxC = box ? box.boxStyle!.background : null;
    const ink = b.textStyle!.color;
    return boxC && chroma(boxC) >= nc ? boxC : chroma(ink) >= nc ? ink : e.button ? boxC ?? b.behind : ink;
  };
  // The same words may appear more than once (a menu link and a label): the closest in colour is the one meant.
  const found2 = emph.flatMap((e) => {
    const options = candByText.get(e.text);
    if (!options) return [];
    let best: { e: typeof emph[0]; b: Block; got: RGB } | null = null;
    let bestCredit = -1;
    for (const b of options) {
      const got = shown(e, b);
      const credit = colourCredit(colourRow(e.colour, got), v);
      if (credit > bestCredit) { bestCredit = credit; best = { e, b, got }; }
    }
    return best ? [best] : [];
  });
  for (const { e, b, got } of found2) {
    addColour(`the ${e.button ? 'button' : 'highlight'} ${quote(b.text!)}`, `The ${e.button ? 'button' : 'highlight'} ${quote(b.text!)}`, e.colour, got, v.colourEmphasisWeight / found2.length);
  }

  return {
    m: {
      keyFacts: { total: facts.length, found },
      completeness,
      structure: { orderHeld, orderTotal, counts },
      noExtras: { wordRatio: Math.round(wordRatio * 1000) / 1000, compRatio: Math.round(compRatio * 1000) / 1000 },
      arrangement: { relHeld, relTotal, place: place.map((p) => ({ weight: p.weight, d: p.d, s: p.s })) },
      readability: { cand: readCand, ref: readRef, candOverlaps: cr.overlaps.length, refOverlaps: rr.overlaps.length },
      consistency: {
        candGroups: cg.rows, refGroups: rg.rows,
        familiesCand: ct.families, familiesRef: rt.families,
        sizesCand: ct.sizes, sizesRef: rt.sizes,
        headingRatioCand: ct.headingRatio, headingRatioRef: rt.headingRatio,
        bodyClassSame, headClassSame,
      },
      colour,
    },
    checks,
  };
}
