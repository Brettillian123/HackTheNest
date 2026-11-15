/**
 * Turns the segmented tree into named, typed, weighted components: what
 * kind each part is, what a person would call it, how much it matters for
 * this page, and which of its texts must be word-perfect.
 */
import type { Block, PageSnapshot, Rect } from '../types';
import type { ComponentType, Importance, PageComponent, PageProfile } from './types';
import { area, isMark, type Node, union } from './segment';

const CURRENCY = /[$€£¥₹]\s?\d|\d\s?(?:USD|EUR|GBP|CAD|AUD)\b/;
const PERCENT = /\d\s?%/;
const FIGURE = /^[\s$€£¥₹+\-–#~]*\d[\d.,]*\s?[%kKmMbB+]?\s*$/;
const GRAND_TOTAL = /\btotal\b|\bamount due\b|\bbalance due\b/i;
const TOTAL = /\b(sub)?total\b|\bamount due\b|\bbalance due\b/i;

interface PageInfo {
  snapshot: PageSnapshot;
  blocks: Block[];
  medianFont: number;
  mainHeading: number | null;
  /** For each box, the blocks drawn directly inside it. */
  kidsOf: Map<number, number[]>;
}

interface Draft {
  node: Node;
  all: number[];
  type: ComponentType;
  name: string;
  importance: Importance;
  /** Why it was raised, higher keeps its raise first when there are too many. */
  raise: number;
  children: Draft[];
  parent: Draft | null;
  depth: number;
}

const words = (t?: string) => ((t ?? '').trim() ? (t ?? '').trim().split(/\s+/).length : 0);

function colorDist(a: number[], b: number[]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function descendants(info: PageInfo, i: number): number[] {
  const out: number[] = [];
  for (const k of info.kidsOf.get(i) ?? []) out.push(k, ...descendants(info, k));
  return out;
}

/** A box that reads as a button: one centred label on a filled or outlined shape. */
export function isButtonBox(info: PageInfo, i: number): boolean {
  const b = info.blocks[i];
  if (b.kind !== 'box' || !b.boxStyle) return false;
  const inner = descendants(info, i);
  const texts = inner.filter((k) => info.blocks[k].kind === 'text' && !isMark(info.blocks[k]));
  if (texts.length !== 1 || inner.filter((k) => !isMark(info.blocks[k])).length > 3) return false;
  if (b.role === 'button') return true;
  if (b.role === 'cell') return false;
  const t = info.blocks[texts[0]].rect;
  if (t.w > b.rect.w * 0.85) return false;
  const centred = Math.abs(t.x + t.w / 2 - (b.rect.x + b.rect.w / 2)) <= Math.max(6, b.rect.w * 0.12);
  const shaped = colorDist(b.boxStyle.background, b.behind) > 40 || b.boxStyle.hasBorder;
  return centred && shaped && b.rect.h >= 20 && b.rect.h <= 80 && b.rect.w <= 640 && words(info.blocks[texts[0]].text) <= 6;
}

function isField(info: PageInfo, i: number): boolean {
  const b = info.blocks[i];
  if (b.kind !== 'box' || !b.boxStyle) return false;
  if (b.rect.w <= 24 && b.rect.h <= 24) return b.role === 'field' || b.boxStyle.hasBorder; // a checkbox
  const inner = descendants(info, i);
  const texts = inner.filter((k) => info.blocks[k].kind === 'text' && !isMark(info.blocks[k]));
  if (texts.length > 1) return false;
  if (b.role === 'field' && b.rect.w >= b.rect.h * 2) return true;
  if (!b.boxStyle.hasBorder || b.rect.h < 32 || b.rect.h > 60 || b.rect.w < b.rect.h * 2.5) return false;
  if (texts.length === 0) return true;
  const t = info.blocks[texts[0]].rect;
  const centred = Math.abs(t.x + t.w / 2 - (b.rect.x + b.rect.w / 2)) <= Math.max(6, b.rect.w * 0.12);
  return !centred && t.x - b.rect.x <= 28;
}

/** Few colours with one dominant: a chart or diagram rather than a photo. */
function looksLikeChart(snapshot: PageSnapshot, r: Rect): boolean {
  const { width, height, pixels } = snapshot;
  if (!pixels || pixels.length < width * height * 4) return false;
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(width, Math.ceil(r.x + r.w)), y1 = Math.min(height, Math.ceil(r.y + r.h));
  if (x1 - x0 < 40 || y1 - y0 < 40) return false;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 3000)));
  const counts = new Map<number, number>();
  let n = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const o = (y * width + x) * 4;
      const key = ((pixels[o] >> 3) << 10) | ((pixels[o + 1] >> 3) << 5) | (pixels[o + 2] >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      n++;
    }
  }
  const top = Math.max(...counts.values());
  const common = [...counts.values()].filter((c) => c >= n * 0.002).length;
  return top / n >= 0.45 && common <= 40;
}

function fontOf(info: PageInfo, i: number): number {
  return info.blocks[i].textStyle?.fontSize ?? 0;
}

function subtree(n: Node): number[] {
  return [...n.own, ...n.children.flatMap(subtree)];
}

function textsOf(info: PageInfo, all: number[]): number[] {
  return all.filter((i) => info.blocks[i].kind === 'text').sort((a, b) => readingOrder(info, a, b));
}

function readingOrder(info: PageInfo, a: number, b: number): number {
  const ra = info.blocks[a].rect, rb = info.blocks[b].rect;
  return Math.round(ra.y) - Math.round(rb.y) || Math.round(ra.x) - Math.round(rb.x) || a - b;
}

/** The text a person would use to tell this part apart: its first bold or largest short text. */
function titleOf(info: PageInfo, all: number[]): string | null {
  const texts = textsOf(info, all).filter((i) => words(info.blocks[i].text) <= 6 && (info.blocks[i].text ?? '').length <= 40);
  if (texts.length === 0) return null;
  const isData = (i: number) => FIGURE.test(info.blocks[i].text ?? '') || CURRENCY.test(info.blocks[i].text ?? '') || PERCENT.test(info.blocks[i].text ?? '');
  const pool = texts.filter((i) => !isData(i)).length ? texts.filter((i) => !isData(i)) : texts;
  const heading = pool.find((i) => info.blocks[i].role === 'heading');
  const bold = pool.filter((i) => info.blocks[i].textStyle?.bold);
  const maxBold = bold.length ? Math.max(...bold.map((i) => fontOf(info, i))) : 0;
  const pick = heading ?? bold.find((i) => fontOf(info, i) >= maxBold) ?? pool[0];
  const text = (info.blocks[pick].text ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

/** Plans with prices: amounts per period, or amounts with a button to choose each. */
function isPricing(info: PageInfo, all: number[]): boolean {
  const texts = textsOf(info, all).map((i) => info.blocks[i].text ?? '');
  if (!texts.some((t) => CURRENCY.test(t))) return false;
  return texts.some((t) => /\/\s?(mo|month|yr|year|user|seat)\b|per (month|year|user|seat)|monthly|yearly|annually/i.test(t)) ||
    all.some((i) => isButtonBox(info, i));
}

function isRowLike(info: PageInfo, n: Node): boolean {
  const texts = textsOf(info, subtree(n)).filter((i) => !isMark(info.blocks[i]) || info.blocks[i].role === 'cell');
  if (texts.length < 2 || n.rect.h > 90) return false;
  const xs = new Set(texts.map((i) => Math.round(info.blocks[i].rect.x / 8)));
  // A table row reads along one line; a name with a description under it is a list item.
  const top = Math.max(...texts.map((i) => info.blocks[i].rect.y));
  const bottom = Math.min(...texts.map((i) => info.blocks[i].rect.y + info.blocks[i].rect.h));
  return xs.size >= 2 && top < bottom;
}

function classifyGroup(info: PageInfo, n: Node): ComponentType {
  const items = n.children;
  const containers = items.every((c) => c.container !== null);
  if (items.length >= 3 && items.every((c) => isRowLike(info, c)) && n.axis === 'y' && !containers) return 'table';
  if (containers) {
    const figureCards = items.every((c) => {
      const texts = textsOf(info, subtree(c));
      return texts.length <= 5 && texts.some((i) => FIGURE.test(info.blocks[i].text ?? '') && fontOf(info, i) >= info.medianFont * 1.4);
    });
    if (figureCards) return 'stats';
    const xs = items.map((c) => c.rect.x);
    const stacked = Math.max(...xs) - Math.min(...xs) <= 4;
    return stacked ? 'list' : 'card-group';
  }
  if (items.length >= 3 && items.every((c) => isRowLike(info, c))) return 'table';
  if (n.axis === 'x' && items.every((c) => subtree(c).length >= 2)) return 'card-group';
  return 'list';
}

function classifyOne(info: PageInfo, n: Node, all: number[], top: boolean, topRank: number, lastTop: boolean): ComponentType {
  const { snapshot, blocks } = info;
  const W = snapshot.width, H = snapshot.height;
  const r = n.rect;
  const texts = textsOf(info, all);
  const short = texts.filter((i) => words(blocks[i].text) <= 4);
  const fields = all.filter((i) => isField(info, i));
  const buttons = all.filter((i) => isButtonBox(info, i));
  const images = all.filter((i) => blocks[i].kind === 'image');
  const fonts = texts.map((i) => fontOf(info, i));
  const maxFont = fonts.length ? Math.max(...fonts) : 0;

  if (top && r.y < 120 && r.w >= W * 0.6 && r.h <= 140 && short.length >= 2 && fields.length <= 1) return 'navigation';
  // A taller header: a brand and a row of menu links, nothing to read or press.
  const linkRow = Math.max(0, ...short.map((i) => short.filter((k) => Math.abs((blocks[k].rect.y + blocks[k].rect.h / 2) - (blocks[i].rect.y + blocks[i].rect.h / 2)) <= 6).length));
  if (top && r.y < 20 && r.w >= W * 0.6 && r.h <= 320 && linkRow >= 3 && texts.length <= linkRow + 3 && buttons.length === 0 &&
    texts.every((i) => words(blocks[i].text) <= 8)) return 'navigation';
  if (top && r.w <= W * 0.3 && r.h >= Math.min(H, 1000) * 0.5 && (r.x <= 2 || r.x + r.w >= W - 2) && short.length >= 3) return 'sidebar';
  if (top && lastTop && r.y + r.h >= H - 40 && r.h <= H * 0.35 &&
    (texts.some((i) => /©|\(c\)|copyright|all rights/i.test(blocks[i].text ?? '')) || r.w >= W * 0.9 || (fonts.length > 0 && Math.max(...fonts) <= 15))) return 'footer';
  const wide = fields.filter((i) => blocks[i].rect.w > 24).length;
  const formish = wide >= 2 || (fields.length >= 1 && buttons.length >= 1 && !(r.y < 120 && r.h <= 140));
  // A part with labelled fields and a button is a form, whatever small pieces are drawn in it;
  // a frame holding a form among other things is not.
  if (formish && (n.kind !== 'region' || (wide >= 2 && buttons.length >= 1 && texts.length <= (wide + buttons.length) * 3 + 3))) return 'form';
  // A product's buy box (a price and a button to buy) is not a hero.
  const buyBox = buttons.length >= 1 && texts.some((i) => CURRENCY.test(blocks[i].text ?? '') && words(blocks[i].text) <= 4) && n.kind !== 'group';
  if (buyBox && !top) return 'other';
  if (buyBox && top && topRank > 0) return 'other';
  if (top && topRank <= 2 && r.y < 800 && r.h <= 960 && info.mainHeading !== null && all.includes(info.mainHeading) && texts.length >= 2 && maxFont >= Math.max(30, info.medianFont * 1.6)) return 'hero';
  if (n.kind === 'region') return n.container === null ? 'other' : r.w >= W * 0.9 ? 'banner' : 'card';
  const imageArea = images.reduce((s, i) => s + area(blocks[i].rect), 0);
  if (images.length >= 1 && (imageArea >= area(r) * 0.45 || texts.length === 0)) {
    const big = images.reduce((a, b) => (area(blocks[b].rect) > area(blocks[a].rect) ? b : a));
    // A chart comes with words (a title, a caption); a flat illustration alone is a picture.
    // ...a title or caption of its own, not just a badge laid over a picture.
    const loose = texts.some((i) => {
      const parent = [...info.kidsOf.entries()].find(([, kids]) => kids.includes(i));
      return !parent || area(blocks[parent[0]].rect) >= area(blocks[big].rect) || descendants(info, parent[0]).filter((k) => blocks[k].kind === 'text').length > 1;
    });
    return loose && looksLikeChart(snapshot, blocks[big].rect) && blocks[big].rect.w >= 200 ? 'chart' : 'image';
  }
  if (texts.length >= 6 && texts.filter((i) => blocks[i].role === 'cell').length >= texts.length * 0.6) return 'table';
  const figures = texts.filter((i) => FIGURE.test(blocks[i].text ?? '') && fontOf(info, i) >= info.medianFont * 1.3);
  if (n.container !== null && figures.length >= 2 && texts.length <= figures.length * 2 + 1) return 'stats';
  const long = texts.some((i) => words(blocks[i].text) > 8);
  if (long && buttons.length === 0 && fields.length === 0 && texts.length <= 3 && all.every((i) => blocks[i].kind !== 'image')) return 'text';
  if (n.container !== null) {
    if (texts.length === 0) return blocks[n.container].rect.w >= W * 0.9 ? 'banner' : 'other';
    if (n.kind === 'leaf' && texts.length === 1 && buttons.length === 1) return 'other';
    return r.w >= W * 0.9 ? 'banner' : 'card';
  }
  if (all.every((i) => blocks[i].kind === 'text')) {
    const b = blocks[texts[0]];
    const headed = words(b.text) <= 12 && (b.role === 'heading' || b.textStyle?.bold || fontOf(info, texts[0]) >= info.medianFont * 1.25);
    return headed && texts.length <= 2 ? 'heading' : 'text';
  }
  return 'other';
}

const NOUN: Record<ComponentType, string> = {
  navigation: 'menu bar', hero: 'hero', heading: 'heading', text: 'text', 'card-group': 'cards', card: 'card',
  table: 'table', form: 'form', list: 'list', image: 'image', chart: 'chart', stats: 'stats', footer: 'footer',
  banner: 'banner', sidebar: 'sidebar', other: 'section',
};

function clip(text: string, max = 5): string {
  const w = text.split(' ');
  return w.length <= max ? text : w.slice(0, max).join(' ') + '...';
}

function baseName(info: PageInfo, d: Draft): string {
  const all = d.all;
  const texts = textsOf(info, all);
  const joined = texts.map((i) => info.blocks[i].text ?? '').join(' ');
  const title = titleOf(info, all);
  const q = (s: string) => `'${clip(s)}'`;
  switch (d.type) {
    case 'navigation': return d.node.rect.h > 140 ? 'the header' : d.node.rect.y < 10 ? 'the menu bar' : 'the menu';
    case 'sidebar': return 'the sidebar';
    case 'footer': return 'the footer';
    case 'hero': return 'the hero';
    case 'heading':
    case 'text':
      return texts.length ? `the ${NOUN[d.type]} ${q((info.blocks[texts[0]].text ?? '').replace(/\s+/g, ' ').trim())}` : `the ${NOUN[d.type]}`;
    case 'form':
      if (/sign ?up|create (an |your )?account|register|join|get started|free trial/i.test(joined)) return 'the sign-up form';
      if (/log ?in|sign ?in/i.test(joined)) return 'the sign-in form';
      if (/card number|payment|billing|checkout|pay\b/i.test(joined)) return 'the payment form';
      if (/contact|message/i.test(joined)) return 'the contact form';
      return title ? `the ${q(title)} form` : 'the form';
    case 'stats':
      return d.node.kind === 'group' ? 'the stat cards' : 'the stats';
    case 'card-group':
      if (isPricing(info, all)) return 'the pricing cards';
      return title && d.node.own.some((i) => info.blocks[i].kind === 'text') ? `the ${q(title)} cards` : 'the cards';
    default:
      break;
  }
  if (d.parent && (d.parent.type === 'table' || d.parent.type === 'list') && d.type !== 'card') {
    const k = d.parent.children.indexOf(d) + 1;
    return `${d.parent.type === 'table' ? 'row' : 'item'} ${k} of ${d.parent.name}`;
  }
  if (d.type === 'other' && texts.length > 1 && all.some((i) => isButtonBox(info, i)) && texts.some((i) => CURRENCY.test(info.blocks[i].text ?? ''))) return title ? `the ${q(title)} details` : 'the product details';
  if (d.type === 'other' && texts.length === 1 && all.some((i) => isButtonBox(info, i))) return title ? `the ${q(title)} button` : 'the button';
  return title ? `the ${q(title)} ${NOUN[d.type]}` : `the ${NOUN[d.type]}`;
}

function keyTextSet(info: PageInfo, drafts: Draft[]): Set<number> {
  const { blocks } = info;
  const keys = new Set<number>();
  const visit = (d: Draft) => {
    const own = d.node.own;
    const dataLike = ['table', 'stats', 'list', 'card-group'].includes(d.type) || ['table', 'stats', 'list', 'card-group'].includes(d.parent?.type ?? '');
    for (const i of own) {
      const b = blocks[i];
      if (b.kind !== 'text') continue;
      const t = (b.text ?? '').trim();
      const w = words(t);
      if (!t || w > 12) continue;
      if ((CURRENCY.test(t) || PERCENT.test(t)) && w <= 8) keys.add(i);
      else if (FIGURE.test(t) && (dataLike || fontOf(info, i) >= info.medianFont * 1.2)) keys.add(i);
      else if (TOTAL.test(t) && w <= 4) keys.add(i);
    }
    for (const c of d.children) visit(c);
  };
  drafts.forEach(visit);
  // Button and link-button labels.
  blocks.forEach((b, i) => {
    if (b.kind === 'box' && isButtonBox(info, i)) {
      for (const k of descendants(info, i)) if (blocks[k].kind === 'text' && /[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(blocks[k].text ?? '')) keys.add(k);
    }
  });
  // The brand: the first bold or largest text of a menu bar or sidebar.
  for (const d of drafts) {
    if (d.type !== 'navigation' && d.type !== 'sidebar') continue;
    const texts = textsOf(info, d.all);
    if (!texts.length) continue;
    const max = Math.max(...texts.map((i) => fontOf(info, i)));
    const brand = texts.find((i) => fontOf(info, i) >= max && words(blocks[i].text) <= 4);
    if (brand !== undefined) keys.add(brand);
  }
  if (info.mainHeading !== null) keys.add(info.mainHeading);
  return keys;
}

export function buildComponents(snapshot: PageSnapshot, tops: Node[], backdrops: number[], kidsOf: Map<number, number[]>): Pick<PageProfile, 'components' | 'weightShift'> {
  const blocks = snapshot.blocks;
  const info: PageInfo = { snapshot, blocks, medianFont: 16, mainHeading: null, kidsOf };
  const fonts = blocks.filter((b) => b.kind === 'text').map((b) => b.textStyle?.fontSize ?? 16).sort((a, b) => a - b);
  if (fonts.length) info.medianFont = fonts[Math.floor(fonts.length / 2)];
  let best = -1;
  blocks.forEach((b, i) => {
    if (b.kind !== 'text' || !(b.text ?? '').trim()) return;
    const f = fontOf(info, i);
    if (f > best || (f === best && info.mainHeading !== null && readingOrder(info, i, info.mainHeading) < 0)) {
      best = f;
      info.mainHeading = i;
    }
  });
  return assemble(info, tops, backdrops);
}

function assemble(info: PageInfo, tops: Node[], backdrops: number[]): Pick<PageProfile, 'components' | 'weightShift'> {
  const { snapshot, blocks } = info;
  const sortNodes = (list: Node[]) => [...list].sort((a, b) => Math.round(a.rect.y) - Math.round(b.rect.y) || Math.round(a.rect.x) - Math.round(b.rect.x));
  const ordered = sortNodes(tops);
  const maxBottom = Math.max(...ordered.map((n) => n.rect.y + n.rect.h));

  const make = (n: Node, parent: Draft | null, depth: number, topRank: number): Draft => {
    const all = subtree(n);
    const d: Draft = { node: n, all, type: 'other', name: '', importance: 'normal', raise: 0, children: [], parent, depth };
    if (n.kind === 'group') d.type = classifyGroup(info, n);
    else if (parent && (parent.type === 'card-group' || parent.type === 'stats' || (parent.type === 'list' && n.container !== null))) d.type = 'card';
    else if (parent && parent.type === 'table') d.type = 'other';
    else d.type = classifyOne(info, n, all, depth === 0, topRank, depth === 0 && n.rect.y + n.rect.h >= maxBottom - 1);
    d.children = (n.kind === 'group' ? n.children : sortNodes(n.children)).map((c) => make(c, d, depth + 1, 99));
    return d;
  };
  let rank = 0;
  const drafts = ordered.map((n) => {
    const d = make(n, null, 0, rank);
    if (d.type !== 'navigation' && d.type !== 'sidebar') rank++;
    return d;
  });

  // Names, unique within the page.
  const used = new Set<string>();
  const nameAll = (d: Draft) => {
    let name = baseName(info, d);
    if (used.has(name)) {
      let k = 2;
      while (used.has(`${name} (${k})`)) k++;
      name = `${name} (${k})`;
    }
    used.add(name);
    d.name = name;
    d.children.forEach(nameAll);
  };
  drafts.forEach(nameAll);

  // Importance by rules.
  const flat: Draft[] = [];
  const walk = (d: Draft) => { flat.push(d); d.children.forEach(walk); };
  drafts.forEach(walk);
  const W = snapshot.width;
  // A frame around the whole page (an invoice sheet) is measured by what it holds.
  const level = drafts.length === 1 && drafts[0].children.length ? drafts[0].children : drafts;
  const content = level.filter((d) => !['navigation', 'sidebar', 'footer'].includes(d.type));
  const contentArea = content.reduce((s, d) => s + area(d.node.rect), 0) || 1;
  const share = (types: ComponentType[]) => content.filter((d) => types.includes(d.type)).reduce((s, d) => s + area(d.node.rect), 0) / contentArea;
  const dataShare = share(['table', 'stats', 'chart']);
  const formShare = share(['form']);
  const raise = (d: Draft, level: Importance, why: number) => {
    if (d.raise < why) { d.importance = level; d.raise = why; }
  };
  const tables = flat.filter((d) => d.type === 'table').sort((a, b) => area(b.node.rect) - area(a.node.rect));
  for (const d of flat) {
    const texts = textsOf(info, d.all);
    if (d.type === 'form') raise(d, formShare >= 0.35 || content.length <= 2 ? 'critical' : 'major', 6);
    if (d.type === 'table') raise(d, dataShare >= 0.5 && d === tables[0] ? 'critical' : 'major', 5);
    if (info.mainHeading !== null && level.includes(d) && d.all.includes(info.mainHeading) && d.type !== 'navigation' && d.type !== 'sidebar') raise(d, 'major', 4);
    if (d.type === 'card-group' && isPricing(info, d.all)) raise(d, 'major', 3);
    // The grand total: the smallest part holding it and an amount.
    const holdsTotal = (x: Draft) => textsOf(info, x.all).some((i) => GRAND_TOTAL.test(blocks[i].text ?? '')) && textsOf(info, x.all).some((i) => CURRENCY.test(blocks[i].text ?? ''));
    if (holdsTotal(d) && !d.children.some(holdsTotal)) raise(d.parent?.type === 'table' ? d.parent : d, 'major', 2);
    if (d.type === 'stats' && level.includes(d)) raise(d, 'major', 1);
  }
  // At most a third of the components above normal.
  const cap = Math.max(1, Math.floor(flat.length / 3));
  const raised = flat.filter((d) => d.raise > 0).sort((a, b) => b.raise - a.raise || area(b.node.rect) - area(a.node.rect));
  raised.slice(cap).forEach((d) => { d.importance = 'normal'; d.raise = 0; });
  // Decoration and boilerplate count less.
  for (const d of flat) {
    if (d.raise > 0) continue;
    const r = d.node.rect;
    const hasText = d.all.some((i) => blocks[i].kind === 'text');
    if (d.type === 'footer') d.importance = 'minor';
    else if (d.parent?.type === 'footer') d.importance = 'minor';
    else if (!hasText && (r.h <= 4 || r.w <= 4)) d.importance = 'minor';
    else if (d.type === 'image' && !hasText && area(r) < snapshot.width * snapshot.height * 0.02) d.importance = 'minor';
    else if (d.type === 'other' && !hasText && !d.all.some((i) => blocks[i].kind === 'image') && r.w < W * 0.9 && d.children.length === 0) d.importance = 'minor';
  }

  const keys = keyTextSet(info, drafts);
  let idCounter = 0;
  const toComponent = (d: Draft, id: string): PageComponent => ({
    id,
    type: d.type,
    name: d.name,
    rect: d.node.rect,
    blocks: [...d.node.own].sort((a, b) => a - b),
    children: d.children.map((c, k) => toComponent(c, `${id}.${k + 1}`)),
    importance: d.importance,
    keyTexts: d.all.filter((i) => keys.has(i)).sort((a, b) => a - b),
  });
  const components = drafts.map((d) => toComponent(d, `c${++idCounter}`));
  if (backdrops.length && components.length) {
    components[0].blocks = [...components[0].blocks, ...backdrops].sort((a, b) => a - b);
  } else if (backdrops.length) {
    components.push({
      id: 'c1', type: 'other', name: 'the page background', rect: union(backdrops.map((i) => blocks[i].rect)),
      blocks: [...backdrops].sort((a, b) => a - b), children: [], importance: 'minor', keyTexts: [],
    });
  }

  // The rules never shift the sub-score weights; only the author's marks may.
  return { components, weightShift: { content: 0, layout: 0, style: 0, visual: 0 } };
}
