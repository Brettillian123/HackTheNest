// A seeded generator of realistic pages for property tests. The same seed
// always gives the same page. A page is a structured description first, so a
// test can change one thing at a time, then `toHtml` turns it into HTML.

export type RGB = [number, number, number];

export interface Card {
  bg: RGB;
  fg: RGB;
  /** null for a plain coloured box. */
  title: string | null;
  height: number;
  radius: number;
}

export interface Button {
  text: string;
  bg: RGB;
  fg: RGB;
  radius: number;
}

export interface Section {
  bg: RGB;
  fg: RGB;
  padY: number;
  padX: number;
  align: 'left' | 'center';
  heading: string | null;
  headingSize: number;
  paragraphs: string[];
  textSize: number;
  cards: Card[];
  cardGap: number;
  button: Button | null;
}

export type PageKind = 'normal' | 'boxes' | 'single' | 'long';

export interface PageDesc {
  seed: number;
  kind: PageKind;
  bg: RGB;
  fg: RGB;
  font: string;
  sections: Section[];
}

export interface HtmlOptions {
  /** Multiplies every font size. */
  fontScale?: number;
  /** Pushes all content down by this many pixels. */
  shiftY?: number;
  /** 'semantic' uses h2/p/a; 'plain' uses divs and spans with the same computed styles. */
  markup?: 'semantic' | 'plain';
  /** How a row of cards is laid out; both give the same rendering. */
  rows?: 'flex' | 'grid';
  /** Inline style attributes, or a stylesheet with class names. */
  css?: 'inline' | 'sheet';
  /** Prefix for class names in sheet mode. */
  classPrefix?: string;
}

export const FONTS = [
  'Arial, Helvetica, sans-serif',
  "Georgia, 'Times New Roman', serif",
  "'Courier New', monospace",
];

const WORDS = (
  'garden river morning light simple quiet market bright window coffee travel ' +
  'mountain story people craft modern table stone ocean forest music paper ' +
  'season harbor golden kitchen studio village winter summer friend journey ' +
  'careful honest open fresh local small daily green warm clear steady ' +
  'build learn share plan grow visit follow discover gather notice ' +
  'workshop library bicycle lantern meadow orchard canvas compass'
).split(' ');

interface Theme {
  bg: RGB;
  fg: RGB;
  card: RGB;
  cardFg: RGB;
  dark: boolean;
}

const THEMES: Theme[] = [
  { bg: [255, 255, 255], fg: [30, 30, 30], card: [240, 241, 244], cardFg: [30, 30, 30], dark: false },
  { bg: [248, 245, 238], fg: [45, 38, 30], card: [232, 224, 208], cardFg: [45, 38, 30], dark: false },
  { bg: [232, 241, 250], fg: [18, 40, 72], card: [255, 255, 255], cardFg: [18, 40, 72], dark: false },
  { bg: [18, 24, 38], fg: [236, 239, 245], card: [44, 54, 76], cardFg: [236, 239, 245], dark: true },
  { bg: [32, 32, 32], fg: [242, 242, 242], card: [58, 58, 58], cardFg: [242, 242, 242], dark: true },
  { bg: [44, 22, 56], fg: [246, 236, 250], card: [74, 44, 92], cardFg: [246, 236, 250], dark: true },
];

const ACCENTS: { bg: RGB; fg: RGB }[] = [
  { bg: [214, 58, 48], fg: [255, 255, 255] },
  { bg: [30, 112, 214], fg: [255, 255, 255] },
  { bg: [34, 140, 84], fg: [255, 255, 255] },
  { bg: [244, 176, 36], fg: [30, 30, 30] },
  { bg: [118, 70, 198], fg: [255, 255, 255] },
  { bg: [0, 150, 160], fg: [255, 255, 255] },
];

/** mulberry32: a small seeded generator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function words(r: () => number, n: number, capital = true): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(WORDS[Math.floor(r() * WORDS.length)]);
  const s = out.join(' ');
  return capital ? s[0].toUpperCase() + s.slice(1) : s;
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)];
}

function int(r: () => number, lo: number, hi: number): number {
  return lo + Math.floor(r() * (hi - lo + 1));
}

/** Rough height of a section in px, used to keep pages under about 1900 px. */
export function estimateSectionHeight(s: Section, font = FONTS[0]): number {
  const charW = font.includes('Courier') ? 0.6 : 0.52;
  const width = 1280 - 2 * s.padX;
  let h = 2 * s.padY;
  if (s.heading) {
    const lines = Math.ceil((s.heading.length * s.headingSize * charW) / width);
    h += lines * s.headingSize * 1.25 + 12;
  }
  for (const p of s.paragraphs) {
    const lines = Math.ceil((p.length * s.textSize * charW) / width);
    h += lines * s.textSize * 1.5 + 12;
  }
  if (s.cards.length) h += Math.max(...s.cards.map((c) => c.height)) + 16;
  if (s.button) h += s.textSize * 1.4 + 24 + 4;
  return h;
}

/** A random section; `text` false gives coloured boxes only. */
export function randomSection(r: () => number, pageTheme: Theme, text: boolean): Section {
  const theme = r() < 0.5 ? pageTheme : pick(r, THEMES);
  const accent = pick(r, ACCENTS);
  const textSize = int(r, 14, 19);
  const nCards = r() < 0.55 ? int(r, 2, 4) : 0;
  const cardHeight = int(r, 70, 150);
  const cards: Card[] = [];
  const accentCards = r() < 0.35;
  const radius = pick(r, [0, 4, 8, 16]);
  for (let i = 0; i < nCards; i++) {
    cards.push({
      bg: accentCards ? accent.bg : theme.card,
      fg: accentCards ? accent.fg : theme.cardFg,
      title: text ? words(r, int(r, 2, 4)) : null,
      height: cardHeight,
      radius,
    });
  }
  const section: Section = {
    bg: theme.bg,
    fg: theme.fg,
    padY: int(r, 20, 64),
    padX: pick(r, [24, 40, 64, 96, 160]),
    align: r() < 0.35 ? 'center' : 'left',
    heading: text ? words(r, int(r, 2, 6)) : null,
    headingSize: int(r, 24, 40),
    paragraphs: [],
    textSize,
    cards,
    cardGap: pick(r, [12, 16, 24]),
    button: null,
  };
  if (text) {
    const np = int(r, 1, 3);
    for (let i = 0; i < np; i++) section.paragraphs.push(words(r, int(r, 12, 40)) + '.');
    if (r() < 0.45) section.button = { text: words(r, int(r, 1, 3)), bg: accent.bg, fg: accent.fg, radius: pick(r, [0, 4, 6, 24]) };
  } else if (!cards.length) {
    // A text-free section still needs something visible.
    section.cards = [0, 1].map(() => ({ bg: accent.bg, fg: accent.fg, title: null, height: cardHeight, radius }));
  }
  return section;
}

/**
 * The page for a seed. Every seventh seed (3, 10, ...) has no text, seeds
 * 5, 12, ... are a single heading, seeds 6, 13, ... are long; the rest vary freely.
 */
export function randomPage(seed: number): PageDesc {
  const r = rng(seed * 7919 + 17);
  const theme = pick(r, THEMES);
  const font = pick(r, FONTS);
  const kind: PageKind = seed % 7 === 3 ? 'boxes' : seed % 7 === 5 ? 'single' : seed % 7 === 6 ? 'long' : 'normal';
  const page: PageDesc = { seed, kind, bg: theme.bg, fg: theme.fg, font, sections: [] };
  if (kind === 'single') {
    page.sections.push({
      bg: theme.bg, fg: theme.fg, padY: int(r, 40, 120), padX: 64, align: r() < 0.5 ? 'center' : 'left',
      heading: words(r, int(r, 2, 5)), headingSize: int(r, 32, 56), paragraphs: [], textSize: 16,
      cards: [], cardGap: 16, button: null,
    });
    return page;
  }
  const n = kind === 'long' ? 6 : int(r, 2, 4);
  let height = 0;
  for (let i = 0; i < n; i++) {
    const s = randomSection(r, theme, kind !== 'boxes');
    if (kind === 'long') s.paragraphs = s.paragraphs.slice(0, 2);
    const h = estimateSectionHeight(s, font);
    if (height + h > 1800 && page.sections.length >= 2) break;
    height += h;
    page.sections.push(s);
  }
  return page;
}

const hex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

type Style = Record<string, string>;

/** The page as body markup and CSS, so a site can share one stylesheet. */
export function toParts(page: PageDesc, opts: HtmlOptions = {}): { css: string; body: string; bodyClass: string } {
  const scale = opts.fontScale ?? 1;
  const plain = opts.markup === 'plain';
  const sheet = opts.css === 'sheet';
  const prefix = opts.classPrefix ?? (plain ? 'q' : 's');
  const rules: string[] = [];
  let counter = 0;
  const px = (n: number) => `${Math.round(n * 100) / 100}px`;
  const styleText = (s: Style) => Object.entries(s).map(([k, v]) => `${k}:${v}`).join(';');
  const attr = (s: Style) => {
    if (!sheet) return ` style="${styleText(s).replace(/"/g, '&quot;')}"`;
    const name = `${prefix}${plain ? 'x' : '-el-'}${counter++}`;
    rules.push(`.${name}{${styleText(s)}}`);
    return ` class="${name}"`;
  };
  const tag = (semantic: string, alt: string) => (plain ? alt : semantic);

  const bodyStyle: Style = {
    margin: '0',
    'padding-top': px(opts.shiftY ?? 0),
    background: hex(page.bg),
    color: hex(page.fg),
    'font-family': page.font,
  };
  const bodyClass = `${prefix}-body`;
  rules.push(`body.${bodyClass}{${styleText(bodyStyle)}}`);

  let body = '';
  for (const s of page.sections) {
    const sec: Style = {
      display: 'block',
      margin: '0',
      background: hex(s.bg),
      color: hex(s.fg),
      padding: `${s.padY}px ${s.padX}px`,
      'text-align': s.align,
    };
    body += `<${tag('section', 'div')}${attr(sec)}>`;
    if (s.heading) {
      const h: Style = {
        display: 'block', margin: '0 0 12px 0', padding: '0', 'font-size': px(s.headingSize * scale),
        'font-weight': '700', 'line-height': '1.25', 'font-family': 'inherit',
      };
      const t = tag('h2', 'div');
      body += `<${t}${attr(h)}>${s.heading}</${t}>`;
    }
    for (const p of s.paragraphs) {
      const ps: Style = {
        display: 'block', margin: '0 0 12px 0', padding: '0', 'font-size': px(s.textSize * scale),
        'font-weight': '400', 'line-height': '1.5',
      };
      const t = tag('p', 'div');
      body += `<${t}${attr(ps)}>${p}</${t}>`;
    }
    if (s.cards.length) {
      const row: Style =
        opts.rows === 'grid'
          ? { display: 'grid', 'grid-template-columns': `repeat(${s.cards.length}, minmax(0, 1fr))`, gap: `${s.cardGap}px`, margin: '0 0 16px 0' }
          : { display: 'flex', gap: `${s.cardGap}px`, margin: '0 0 16px 0' };
      body += `<div${attr(row)}>`;
      for (const c of s.cards) {
        const cs: Style = {
          'box-sizing': 'border-box', height: `${c.height}px`, padding: '16px', background: hex(c.bg), color: hex(c.fg),
          'border-radius': `${c.radius}px`, 'font-size': px(s.textSize * scale), 'font-weight': '700', 'line-height': '1.4',
        };
        if (opts.rows !== 'grid') Object.assign(cs, { flex: '1 1 0', 'min-width': '0' });
        body += `<div${attr(cs)}>${c.title ?? ''}</div>`;
      }
      body += `</div>`;
    }
    if (s.button) {
      const b: Style = {
        display: 'inline-block', padding: '12px 24px', margin: '4px 0 0 0', background: hex(s.button.bg), color: hex(s.button.fg),
        'border-radius': `${s.button.radius}px`, 'font-size': px(s.textSize * scale), 'font-weight': '700',
        'line-height': '1.4', 'text-decoration': 'none', 'font-family': 'inherit',
      };
      body += plain ? `<span${attr(b)}>${s.button.text}</span>` : `<a href="#"${attr(b)}>${s.button.text}</a>`;
    }
    body += `</${tag('section', 'div')}>`;
  }
  return { css: rules.join('\n'), body, bodyClass };
}

/** The page as one self-contained HTML string. */
export function toHtml(page: PageDesc, opts: HtmlOptions = {}): string {
  const { css, body, bodyClass } = toParts(page, opts);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Page ${page.seed}</title><style>\n${css}\n</style></head><body class="${bodyClass}">${body}</body></html>`;
}

/** A deep copy, for editing one thing. */
export function clone(page: PageDesc): PageDesc {
  return JSON.parse(JSON.stringify(page)) as PageDesc;
}

/** Mixes a colour toward its inverse: t 0 is the colour, t 1 the inverse. */
export function drift(c: RGB, t: number): RGB {
  return c.map((v) => v + (255 - 2 * v) * t) as RGB;
}
