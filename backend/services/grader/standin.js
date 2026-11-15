// Stand-in scorer: compares candidate HTML with the goal HTML without a browser. Deterministic.
// Used until the real grader service is configured (see index.js); results are marked provisional.
// Seven parts with fixed weights (sum 100). Each part scores 0..1; its cost is weight x (1 - score),
// rounded so the costs add up exactly to 100 - total. An identical page scores 100.

const PARTS = [
  { key: 'text', weight: 25, label: 'Text matches the goal' },
  { key: 'structure', weight: 15, label: 'Headings and page sections match' },
  { key: 'elements', weight: 20, label: 'Buttons, fields, links and cards match' },
  { key: 'colours', weight: 15, label: 'Colours match' },
  { key: 'fonts', weight: 10, label: 'Font sizes match' },
  { key: 'widths', weight: 10, label: 'Widths match' },
  { key: 'size', weight: 5, label: 'Page size is similar' },
];

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const STRUCTURE_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'nav', 'main', 'footer', 'section', 'aside', 'article', 'form', 'ul', 'ol', 'table', 'label']);
const NAMED_COLOURS = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', yellow: '#ffff00', orange: '#ffa500', navy: '#000080', transparent: null };

// What counts is what a viewer would see: text inside hidden elements (display:none,
// visibility:hidden, opacity 0, zero font size or size, far off-screen, text coloured like its
// background), comments, <template> and <noscript> is ignored. Colours and sizes are read only from
// CSS rules that apply to a visible element with visible text (or a form field or image), and from inline
// styles of such elements. Buttons, links, list items, headings and cards count only with
// visible text. It stays a stand-in: no layout, no inheritance beyond these cheap checks.

// ------------------------------------------------------------------ parsing

function decode(text) {
  return text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)));
}

const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};

// A tolerant tree of elements { tag, attrs, classes, id, style, children } and text nodes { text }.
function parseTree(html) {
  const root = { tag: '#root', attrs: '', classes: [], id: null, style: '', children: [] };
  const stack = [root];
  const body = html.replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(/<(script|style|template|noscript|title|head)\b[\s\S]*?(<\/\1\s*>|$)/gi, '');
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g;
  for (const [, slash, rawName, attrs, text] of body.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      if (text.trim()) top.children.push({ text: decode(text) });
      continue;
    }
    const tag = rawName.toLowerCase();
    if (slash) {
      const at = stack.map(n => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const node = {
      tag, attrs,
      classes: (attr(attrs, 'class') || '').toLowerCase().split(/\s+/).filter(Boolean),
      id: (attr(attrs, 'id') || '').toLowerCase() || null,
      style: (attr(attrs, 'style') || '').toLowerCase(),
      hiddenAttr: /(?:^|\s)hidden(?:\s|=|\/|$)/i.test(attrs),
      children: [],
    };
    top.children.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push(node);
  }
  return root;
}

function cssRules(html) {
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)(<\/style\s*>|$)/gi)].map(m => m[1]).join('\n')
    .toLowerCase().replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ');
  const rules = [];
  for (const [, selectors, decls] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.trim().startsWith('@')) continue;
    rules.push({ selectors: selectors.split(',').map(s => s.trim()).filter(Boolean), decls });
  }
  return rules;
}

// Matches the last compound of a selector (tag, #id, .classes) against an element.
function matches(selector, node) {
  const last = selector.split(/[\s>+~]+/).filter(Boolean).pop() || '';
  const compound = last.replace(/\[[^\]]*\]/g, '').replace(/::?[a-z-]+(\([^)]*\))?/g, '');
  if (!compound || compound === '*' || compound === ':root') return true;
  const tag = compound.match(/^[a-z][a-z0-9-]*/)?.[0];
  if (tag && tag !== node.tag) return false;
  const id = compound.match(/#([a-z0-9_-]+)/)?.[1];
  if (id && id !== node.id) return false;
  return [...compound.matchAll(/\.([a-z0-9_-]+)/g)].every(m => node.classes.includes(m[1]));
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function colourList(css) {
  const found = new Set();
  for (const [hex] of css.matchAll(/#[0-9a-f]{3,8}\b/g)) {
    const h = hex.slice(1);
    if (h.length === 3 || h.length === 4) found.add('#' + h.slice(0, 3).split('').map(c => c + c).join(''));
    else if (h.length === 6 || h.length === 8) found.add('#' + h.slice(0, 6));
  }
  for (const m of css.matchAll(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/g)) found.add(toHex(+m[1], +m[2], +m[3]));
  for (const m of css.matchAll(/(?:color|background(?:-color)?|border(?:-[a-z]+)?)\s*:\s*[^;}]*?\b([a-z]+)\b/g)) {
    const named = NAMED_COLOURS[m[1]];
    if (named) found.add(named);
  }
  return [...found];
}

const declColour = (decls, prop) => {
  const m = decls.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`));
  return m ? colourList(m[1])[0] || (/transparent/.test(m[1]) ? 'transparent' : null) : null;
};

function hides(decls, pageBackground) {
  if (/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0?\.?0+\s*(;|$|!)|font-size\s*:\s*0(\.0+)?(px|em|rem|%)?\s*(;|$|!)/.test(decls)) return true;
  if (/(?:^|[;\s])(?:max-)?width\s*:\s*0(px)?\s*(;|$)/.test(decls) && /(?:^|[;\s])(?:max-)?height\s*:\s*0(px)?\s*(;|$)/.test(decls)) return true;
  if (/(?:left|top|text-indent|margin-left)\s*:\s*-\d{3,}/.test(decls)) return true;
  const colour = declColour(decls, 'color');
  if (colour === 'transparent') return true;
  const background = declColour(decls, 'background-color') || declColour(decls, 'background');
  return Boolean(colour && (colour === background || (!background && colour === pageBackground)));
}

function fontSizes(css) {
  const out = new Set();
  for (const m of css.matchAll(/font-size\s*:\s*([\d.]+)(px|rem|em)/g)) out.add(m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16);
  for (const m of css.matchAll(/font\s*:[^;}]*?([\d.]+)(px|rem)/g)) out.add(m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16);
  return [...out].filter(n => n > 0 && n < 400);
}

function widthList(css) {
  const out = new Set();
  for (const m of css.matchAll(/(?:^|[\s;{])(?:max-)?width\s*:\s*([\d.]+)px/g)) out.add(Number(m[1]));
  return [...out].filter(n => n > 0 && n < 10000);
}

const FIELD_TAGS = new Set(['textarea', 'select']);
const isField = (node, type) => (node.tag === 'input' && !['hidden', 'submit', 'button', 'reset'].includes(type)) || FIELD_TAGS.has(node.tag);

export function analyse(html) {
  const source = String(html || '');
  const tree = parseTree(source);
  const rules = cssRules(source);
  const pageRules = rules.filter(r => r.selectors.some(s => /^(html|body|:root)$/.test(s)));
  const pageBackground = pageRules.map(r => declColour(r.decls, 'background-color') || declColour(r.decls, 'background')).filter(Boolean).pop() || '#ffffff';

  const words = [];
  const structure = [];
  const counts = { button: 0, field: 0, link: 0, item: 0, card: 0 };
  const usedRules = new Set();
  const usedInline = [];

  // Returns the visible text inside node (also fills the lists above for visible elements).
  const visit = node => {
    if (node.text !== undefined) {
      words.push(...(node.text.toLowerCase().match(/[a-z0-9]+/g) || []));
      return node.text.trim();
    }
    const matched = node.tag === '#root' ? [] : rules.filter(r => r.selectors.some(s => matches(s, node)));
    const decls = matched.map(r => r.decls).join(';') + ';' + node.style;
    if (node.hiddenAttr || (node.tag !== '#root' && hides(decls, pageBackground))) return '';
    let text = '';
    for (const child of node.children) text += visit(child);
    const type = (attr(node.attrs, 'type') || '').toLowerCase();
    const field = isField(node, type);
    if (text || field || node.tag === 'img') {
      for (const r of matched) usedRules.add(r);
      if (node.style) usedInline.push(node.style);
    }
    if (text) {
      if (STRUCTURE_TAGS.has(node.tag)) structure.push(node.tag);
      if (node.tag === 'button' || (node.tag === 'input' && ['submit', 'button', 'reset'].includes(type))) counts.button += 1;
      if (node.tag === 'a') counts.link += 1;
      if (node.tag === 'li') counts.item += 1;
    } else if (node.tag === 'input' && ['submit', 'button'].includes(type) && attr(node.attrs, 'value')) counts.button += 1;
    if (field) counts.field += 1;
    // Cards: repeated siblings with the same inner structure and visible text.
    const groups = new Map();
    for (const child of node.children) {
      if (!child.children || child.children.filter(c => c.tag).length < 2) continue;
      const sig = child.tag + '>' + child.children.filter(c => c.tag).map(c => c.tag).join(',');
      groups.set(sig, (groups.get(sig) || 0) + 1);
    }
    for (const [sig, n] of groups) if (n >= 2 && text) counts.card += n;
    return text ? text + ' ' : '';
  };
  visit(tree);

  const css = [...[...usedRules].map(r => r.decls), ...usedInline].join(';');
  return {
    words,
    structure,
    counts,
    colours: colourList(css).map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))),
    fonts: fontSizes(css),
    widths: widthList(css),
    length: source.replace(/\s+/g, ' ').trim().length,
  };
}

// ------------------------------------------------------------------ similarity

function multisetDice(a, b) {
  if (!a.length && !b.length) return 1;
  const counts = new Map();
  for (const x of a) counts.set(x, (counts.get(x) || 0) + 1);
  let common = 0;
  for (const x of b) {
    const n = counts.get(x) || 0;
    if (n > 0) { common += 1; counts.set(x, n - 1); }
  }
  return (2 * common) / (a.length + b.length);
}

// Symmetric fuzzy match of two value lists: each value's closeness to its best match, averaged
// both ways. closeness(a, b) is 1 for equal values and falls to 0 with distance.
function fuzzy(goal, cand, closeness, notApplicable) {
  if (!goal.length) return cand.length ? notApplicable * 0.7 : notApplicable;
  if (!cand.length) return 0;
  const side = (from, to) => from.reduce((s, x) => s + Math.max(...to.map(y => closeness(x, y))), 0) / from.length;
  return (side(goal, cand) + side(cand, goal)) / 2;
}

const colourCloseness = (a, b) => Math.max(0, 1 - Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 60);
const relCloseness = tolerance => (a, b) => Math.max(0, 1 - Math.abs(a - b) / Math.max(1, a * tolerance));
const countSim = (a, b) => (a === b ? 1 : Math.min(a, b) / Math.max(a, b));

// A part the goal does not use (no widths, no headings...) follows the text score, so a blank
// page gets no free points and an identical page still gets full marks.
function scoreParts(goal, cand) {
  const text = multisetDice(goal.words, cand.words);
  const kinds = Object.keys(goal.counts).filter(k => goal.counts[k] || cand.counts[k]);
  const elements = kinds.length ? kinds.reduce((s, k) => s + countSim(goal.counts[k], cand.counts[k]), 0) / kinds.length : text;
  return {
    text,
    structure: goal.structure.length || cand.structure.length ? multisetDice(goal.structure, cand.structure) : text,
    elements,
    colours: fuzzy(goal.colours, cand.colours, colourCloseness, text),
    fonts: fuzzy(goal.fonts, cand.fonts, relCloseness(0.3), text),
    widths: fuzzy(goal.widths, cand.widths, relCloseness(0.25), text),
    size: goal.length && cand.length ? Math.min(goal.length, cand.length) / Math.max(goal.length, cand.length) : (goal.length === cand.length ? 1 : 0),
  };
}

function costMessage(key, score, goal, cand) {
  const pct = Math.round(score * 100);
  switch (key) {
    case 'text': return `Only about ${pct}% of the goal's text matches. Check the headings, labels and button words.`;
    case 'structure': return `The headings and page sections differ from the goal (about ${pct}% match).`;
    case 'elements': {
      const names = { button: 'buttons', field: 'form fields', link: 'links', item: 'list items', card: 'repeated cards' };
      const off = Object.keys(names).filter(k => goal.counts[k] !== cand.counts[k])
        .map(k => `${names[k]} (${cand.counts[k]} instead of ${goal.counts[k]})`);
      return off.length ? `Some element counts differ from the goal: ${off.join(', ')}.` : 'The page elements differ from the goal.';
    }
    case 'colours': return `The colours are not the goal's colours (about ${pct}% match).`;
    case 'fonts': return `The font sizes differ from the goal's (about ${pct}% match).`;
    case 'widths': return `The widths of boxes and columns differ from the goal's (about ${pct}% match).`;
    default: return cand.length < goal.length
      ? 'The page is much smaller than the goal, so parts are probably missing.'
      : 'The page is much larger than the goal, so it probably has extra parts.';
  }
}

// Largest-remainder rounding so the integer costs add up to the rounded total loss.
function roundCosts(raw) {
  const target = Math.round(raw.reduce((s, x) => s + x, 0));
  const floors = raw.map(Math.floor);
  let left = target - floors.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && k < order.length; k += 1, left -= 1) floors[order[k][1]] += 1;
  return floors;
}

// Returns { total, checks, passedCount, totalChecks, costs, provisional: true }.
export function standinScore(goalHtml, candidateHtml) {
  const goal = analyse(goalHtml);
  const cand = analyse(candidateHtml);
  const scores = scoreParts(goal, cand);
  const points = roundCosts(PARTS.map(p => p.weight * (1 - Math.max(0, Math.min(1, scores[p.key])))));
  const costs = PARTS.map((p, i) => ({ points: points[i], message: costMessage(p.key, scores[p.key], goal, cand) }))
    .filter(c => c.points > 0)
    .sort((a, b) => b.points - a.points);
  const total = 100 - costs.reduce((s, c) => s + c.points, 0);
  const checks = PARTS.map(p => ({ label: p.label, passed: scores[p.key] >= 0.9 }));
  return { total, checks, passedCount: checks.filter(c => c.passed).length, totalChecks: checks.length, costs, provisional: true };
}
