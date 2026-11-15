// Server-side clean-up of model output, as an allow-list.
// The output is tokenised leniently (following the HTML spec's tag and attribute rules closely
// enough that a stray quote or a "<" inside a tag name cannot hide anything), and every tag is
// rebuilt from an allowed tag set with allowed attributes only. Any "<" that is not part of a
// rebuilt tag is escaped, so dropped fragments can never join into a new tag. Attribute values are
// entity-decoded and CSS is escape-decoded before URL and CSS checks. Only inert URLs survive:
// "#..." and "mailto:" links, url(#id) references inside inline SVG, and data:image/ (png, jpeg,
// gif, webp, svg+xml) URLs up to 200 KB in img src and CSS url(). Inline <svg> is kept with a safe
// set of shape, text and gradient elements and presentation attributes.
// <style> blocks and style attributes are kept, minus @import, url(), image-set() and friends.
//
// Cleaning is idempotent (clean(clean(x)) === clean(x)) and prefix-stable: cleaning a prefix gives
// a prefix of the cleaned whole, so StreamCleaner can stream cleaned HTML as it arrives.

export const MAX_HTML_BYTES = 300 * 1024;
const CAP_RESERVE = 64; // room for the closing tags added when a page is cut at the cap
const MAX_DATA_IMAGE = 200_000;

const GLOBAL_ATTRS = ['class', 'id', 'style', 'title', 'lang', 'dir', 'role', 'tabindex', 'hidden'];
const TAG_ATTRS = {
  html: ['lang'], head: [], body: [], meta: ['charset', 'name', 'content'],
  div: [], span: [], p: [], a: ['href'], br: [], hr: [], wbr: [],
  h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  header: [], nav: [], main: [], footer: [], section: [], article: [], aside: [], address: [],
  ul: [], ol: ['start', 'reversed', 'type'], li: ['value'], dl: [], dt: [], dd: [],
  strong: [], em: [], b: [], i: [], u: [], s: [], small: [], mark: [], sub: [], sup: [], abbr: [], q: [], cite: [], del: [], ins: [], time: ['datetime'],
  code: [], pre: [], kbd: [], samp: [], var: [], blockquote: [], figure: [], figcaption: [], img: ['src', 'alt', 'width', 'height'],
  table: [], caption: [], thead: [], tbody: [], tfoot: [], tr: [], th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'], colgroup: ['span'], col: ['span'],
  form: ['name', 'novalidate', 'autocomplete'], fieldset: ['disabled'], legend: [], label: ['for'],
  input: ['type', 'name', 'value', 'placeholder', 'checked', 'disabled', 'readonly', 'required', 'maxlength', 'minlength', 'min', 'max', 'step', 'size', 'autocomplete'],
  button: ['type', 'name', 'value', 'disabled'], select: ['name', 'multiple', 'disabled', 'size'], option: ['value', 'selected', 'disabled'], optgroup: ['label', 'disabled'],
  textarea: ['name', 'rows', 'cols', 'placeholder', 'disabled', 'readonly', 'maxlength'],
  details: ['open'], summary: [], progress: ['value', 'max'], meter: ['value', 'min', 'max', 'low', 'high', 'optimum'], output: [],
  title: [], style: [],
};
// Inline SVG: shapes, text, gradients, clipping and <use> of local ids. Tag names are written in
// lower case; the browser's HTML parser restores SVG's camelCase names and attributes.
const SVG_PRESENTATION = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit', 'opacity', 'transform', 'clip-path', 'clip-rule', 'mask', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'visibility', 'display', 'color', 'stop-color', 'stop-opacity', 'vector-effect', 'shape-rendering', 'paint-order'];
const SVG_ATTRS = {
  svg: ['xmlns', 'viewbox', 'width', 'height', 'preserveaspectratio', 'x', 'y', 'focusable', 'aria-hidden'],
  g: [], defs: [], desc: [], symbol: ['viewbox', 'preserveaspectratio'],
  path: ['d', 'pathlength'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'], polygon: ['points'],
  text: ['x', 'y', 'dx', 'dy', 'rotate', 'textlength', 'lengthadjust'], tspan: ['x', 'y', 'dx', 'dy'],
  lineargradient: ['x1', 'y1', 'x2', 'y2', 'gradientunits', 'gradienttransform', 'spreadmethod'],
  radialgradient: ['cx', 'cy', 'r', 'fx', 'fy', 'gradientunits', 'gradienttransform', 'spreadmethod'],
  stop: ['offset'], clippath: ['clippathunits'], mask: ['maskunits', 'x', 'y', 'width', 'height'],
  use: ['href', 'xlink:href', 'x', 'y', 'width', 'height'],
};
const SVG_TAGS = new Set(Object.keys(SVG_ATTRS));
for (const [tag, attrs] of Object.entries(SVG_ATTRS)) TAG_ATTRS[tag] = [...attrs, ...SVG_PRESENTATION];
const VOID = new Set(['br', 'hr', 'wbr', 'img', 'input', 'meta', 'col']);
// Raw-text elements removed with their content (the browser does not parse markup inside them).
const RAW_DROP = new Set(['script', 'iframe', 'noembed', 'noframes', 'xmp', 'noscript', 'plaintext']);
// Elements removed with everything inside them (nesting counted).
const NEST_DROP = new Set(['template', 'object', 'foreignobject', 'math', 'canvas', 'video', 'audio', 'picture', 'frameset', 'applet', 'portal']);
const RCDATA_KEEP = new Set(['title', 'textarea']);
const META_NAMES = new Set(['viewport', 'description']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', sol: '/', tab: '\t', newline: '\n', lpar: '(', rpar: ')', period: '.', comma: ',', semi: ';', equals: '=', num: '#', excl: '!', quest: '?', bsol: '\\', percnt: '%', commat: '@' };

function codePoint(n) {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '�';
  return String.fromCodePoint(n);
}

export function decodeEntities(value) {
  return value.replace(/&(?:#[xX]([0-9a-fA-F]+);?|#(\d+);?|([a-zA-Z][a-zA-Z0-9]*);)/g, (m, hex, dec, name) => {
    if (hex) return codePoint(parseInt(hex, 16));
    if (dec) return codePoint(parseInt(dec, 10));
    const key = name.toLowerCase();
    return Object.hasOwn(ENTITIES, key) ? ENTITIES[key] : m;
  });
}

function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ------------------------------------------------------------------ CSS

function decodeCssEscapes(css) {
  return css.replace(/\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|(\r\n|[\n\r\f])|([\s\S]))/g, (m, hex, newline, ch) => {
    if (hex) return codePoint(parseInt(hex, 16));
    if (newline) return '';
    return ch;
  });
}

function encodeCss(css) {
  return css.replace(/\\/g, '\\\\').replace(/</g, '\\3c ');
}

const isDataImage = value => value.length <= MAX_DATA_IMAGE
  && /^data:image\/(png|jpe?g|gif|webp|svg\+xml)(;charset=[\w-]+)?(;base64,[a-z0-9+/=\s]+|,[^"'()\\<>]*)$/i.test(value);

// Replaces risky CSS functions (and everything up to their matching ")") with "none".
function replaceFunctions(css) {
  const re = /(^|[^a-zA-Z0-9_-])((?:-[a-z]+-)?(?:url|image-set|image|cross-fade|element|expression|src|paint))\(/gi;
  let out = '';
  let last = 0;
  let match;
  while ((match = re.exec(css))) {
    const start = match.index + match[1].length;
    let depth = 1;
    let quote = null;
    let j = re.lastIndex;
    for (; j < css.length && depth > 0; j += 1) {
      const c = css[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
    }
    const inner = css.slice(re.lastIndex, depth === 0 ? j - 1 : j).trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
    const keep = match[2].toLowerCase() === 'url' && isDataImage(inner);
    out += css.slice(last, start) + (keep ? css.slice(start, j) : 'none');
    last = j;
    re.lastIndex = j;
  }
  return out + css.slice(last);
}

export function cleanCss(css) {
  let out = decodeCssEscapes(css);
  out = out.replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ');
  out = out.replace(/@import\b[^;]*(;|$)/gi, '');
  out = out.replace(/(?:-moz-binding|behavior)\s*:[^;}]*/gi, '');
  out = replaceFunctions(out);
  return encodeCss(out);
}

// ------------------------------------------------------------------ tokenizer

// Reads a tag starting at s[i] === "<" followed by a letter (or "</" + letter).
// Returns { name, attrs, end, closing } or null when the tag is not finished.
function readTag(s, i) {
  const closing = s[i + 1] === '/';
  let j = i + (closing ? 2 : 1);
  let name = '';
  while (j < s.length && !/[\s/>]/.test(s[j])) name += s[j++];
  const attrs = [];
  for (;;) {
    while (j < s.length && /[\s/]/.test(s[j])) j += 1;
    if (j >= s.length) return null;
    if (s[j] === '>') return { name: name.toLowerCase(), attrs, end: j + 1, closing, selfClosing: s[j - 1] === '/' };
    let attr = s[j++];
    while (j < s.length && !/[\s/>=]/.test(s[j])) attr += s[j++];
    while (j < s.length && /\s/.test(s[j])) j += 1;
    let value = null;
    if (s[j] === '=') {
      j += 1;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      if (j >= s.length) return null;
      if (s[j] === '"' || s[j] === "'") {
        const close = s.indexOf(s[j], j + 1);
        if (close < 0) return null;
        value = s.slice(j + 1, close);
        j = close + 1;
      } else if (s[j] !== '>') {
        const from = j;
        while (j < s.length && !/[\s>]/.test(s[j])) j += 1;
        value = s.slice(from, j);
      } else value = '';
    }
    attrs.push([attr.toLowerCase(), value]);
  }
}

// Index just past the closing tag "</name ...>", or -1 if it is not there (yet).
function findClose(s, from, name) {
  const lower = s.toLowerCase();
  let at = from;
  for (;;) {
    at = lower.indexOf(`</${name}`, at);
    if (at < 0) return { start: -1, end: -1 };
    const next = s[at + 2 + name.length];
    if (next === undefined) return { start: -1, end: -1 };
    if (/[\s/>]/.test(next)) {
      const gt = s.indexOf('>', at);
      return gt < 0 ? { start: -1, end: -1 } : { start: at, end: gt + 1 };
    }
    at += 2;
  }
}

function rebuildAttrs(tag, attrs) {
  const allowed = new Set([...GLOBAL_ATTRS, ...TAG_ATTRS[tag]]);
  const out = [];
  const seen = new Set();
  for (const [name, raw] of attrs) {
    const isAria = /^aria-[a-z]+$/.test(name);
    const isData = /^data-[a-z0-9-]+$/.test(name);
    if ((!allowed.has(name) && !isAria && !isData) || seen.has(name)) continue;
    seen.add(name);
    let value = raw == null ? null : decodeEntities(raw);
    if (name === 'href' || name === 'xlink:href') {
      const v = (value || '').replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
      if (!(v.startsWith('#') || v.startsWith('mailto:'))) value = '#';
    } else if (name === 'src') {
      if (!isDataImage((value || '').trim())) continue;
      value = value.trim();
    } else if (SVG_TAGS.has(tag) && value != null && /url\(|image|expression/i.test(decodeCssEscapes(value))) {
      // Presentation attributes may only reference local ids: url(#id).
      if (!/^\s*url\(\s*['"]?#[\w-]+['"]?\s*\)\s*$/.test(decodeCssEscapes(value))) continue;
    } else if (name === 'style') {
      value = cleanCss((value || '').replace(/&[a-zA-Z0-9]+;?/g, ''));
    }
    out.push(value == null ? name : `${name}="${escapeAttr(value)}"`);
  }
  return out;
}

function openTag(tag, attrs, selfClosing = false) {
  if (tag === 'meta') {
    const kept = rebuildAttrs(tag, attrs);
    const name = attrs.find(([n]) => n === 'name')?.[1];
    const hasCharset = attrs.some(([n]) => n === 'charset');
    if (!hasCharset && !(name && META_NAMES.has(decodeEntities(name).toLowerCase()))) return '';
    return `<meta${kept.length ? ' ' + kept.join(' ') : ''}>`;
  }
  const kept = rebuildAttrs(tag, attrs);
  const close = selfClosing && SVG_TAGS.has(tag) ? ' /' : '';
  return `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}${close}>`;
}

// Cleans markup. final=false stops before an unfinished token (for streaming).
function cleanMarkup(s, final) {
  let out = '';
  let bytes = 0;
  let truncated = false;
  let dropName = null;
  let dropDepth = 0;
  let i = 0;
  const emit = text => {
    if (!text || dropName) return true;
    const size = Buffer.byteLength(text);
    if (bytes + size > MAX_HTML_BYTES - CAP_RESERVE) { truncated = true; return false; }
    out += text;
    bytes += size;
    return true;
  };
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt !== i) {
      const text = s.slice(i, lt < 0 ? s.length : lt);
      if (!emit(text)) break;
      if (lt < 0) break;
      i = lt;
      continue;
    }
    const rest2 = s.slice(i, i + 4);
    if (rest2.startsWith('<!--')) {
      const end = s.indexOf('-->', i + 4);
      if (end < 0) { if (final) { i = s.length; continue; } break; }
      i = end + 3;
      continue;
    }
    if (rest2.startsWith('<!') || rest2.startsWith('<?') || (rest2.startsWith('</') && !/[a-zA-Z]/.test(s[i + 2] || 'a'))) {
      if (rest2.length < 3 && !final) break;
      const gt = s.indexOf('>', i);
      if (gt < 0) { if (final) { i = s.length; continue; } break; }
      if (/^<!doctype\b/i.test(s.slice(i, gt + 1)) && !out.trim()) { if (!emit('<!doctype html>')) break; }
      i = gt + 1;
      continue;
    }
    const next = s[i + 1];
    const isTag = next !== undefined && (/[a-zA-Z]/.test(next) || (next === '/' && s[i + 2] !== undefined && /[a-zA-Z]/.test(s[i + 2])));
    if (!isTag) {
      if (next === undefined && !final) break;
      if (next === '/' && s[i + 2] === undefined && !final) break;
      if (!emit('&lt;')) break;
      i += 1;
      continue;
    }
    const tag = readTag(s, i);
    if (!tag) { if (final) { i = s.length; continue; } break; }
    const name = tag.name;
    if (tag.closing) {
      if (dropName) {
        if (name === dropName && --dropDepth === 0) dropName = null;
      } else if (Object.hasOwn(TAG_ATTRS, name) && !VOID.has(name)) {
        if (!emit(`</${name}>`)) break;
      }
      i = tag.end;
      continue;
    }
    if (RAW_DROP.has(name)) {
      const close = findClose(s, tag.end, name);
      if (close.end < 0) { if (final) { i = s.length; continue; } break; }
      i = close.end;
      continue;
    }
    if (dropName) {
      if (name === dropName) dropDepth += 1;
      i = tag.end;
      continue;
    }
    if (NEST_DROP.has(name)) {
      dropName = name;
      dropDepth = 1;
      i = tag.end;
      continue;
    }
    if (name === 'style' || RCDATA_KEEP.has(name)) {
      const close = findClose(s, tag.end, name);
      if (close.end < 0 && !final) break;
      const body = s.slice(tag.end, close.start < 0 ? s.length : close.start);
      const inner = name === 'style' ? cleanCss(body) : body.replace(/</g, '&lt;');
      if (!emit(`${openTag(name, name === 'style' ? [] : tag.attrs)}${inner}</${name}>`)) break;
      i = close.end < 0 ? s.length : close.end;
      continue;
    }
    if (Object.hasOwn(TAG_ATTRS, name)) {
      if (!emit(openTag(name, tag.attrs, tag.selfClosing))) break;
    }
    i = tag.end;
  }
  return { out, truncated };
}

function stripWrapper(text) {
  let out = text.replace(/^﻿/, '');
  const start = out.search(/<!doctype|<html[\s>]/i);
  if (start > 0) out = out.slice(start);
  else while (/^\s*```[a-zA-Z]*[ \t]*(\r?\n|$)/.test(out)) out = out.replace(/^\s*```[a-zA-Z]*[ \t]*(\r?\n|$)/, '');
  const end = out.search(/<\/html\s*>/i);
  if (end >= 0) out = out.slice(0, end) + out.slice(end).match(/^<\/html\s*>/i)[0];
  return out;
}

const FENCE_START = /^\s*```[a-zA-Z]*[ \t]*(\r?\n|$)/;
const FENCE_END = /\s*```\s*$/;

// Leading whitespace and code fences left over after cleaning (also used while streaming).
function trimStartOutput(out) {
  let s = out.trimStart();
  while (FENCE_START.test(s)) s = s.replace(FENCE_START, '').trimStart();
  return s;
}

function closeDocument(html) {
  let out = html;
  if (/<body[\s>]/i.test(out) && !/<\/body>/i.test(out)) out += '</body>';
  if (/<html[\s>]/i.test(out) && !/<\/html>/i.test(out)) out += '</html>';
  return out;
}

// Cleans a complete model answer.
export function sanitizeHtml(text) {
  let raw = stripWrapper(String(text || ''));
  if (!/<\/html\s*>/i.test(raw)) while (/\s*```\s*$/.test(raw)) raw = raw.replace(/\s*```\s*$/, '');
  const { out, truncated } = cleanMarkup(raw, true);
  let trimmed = trimStartOutput(out).trimEnd();
  while (FENCE_END.test(trimmed)) trimmed = trimmed.replace(FENCE_END, '');
  return truncated ? closeDocument(trimmed) : trimmed;
}

// Streams cleaned HTML: push() raw chunks, get back new cleaned text to send; finish() gives the
// remainder and the final cleaned page. To keep the work linear, the prefix is re-cleaned at most
// every 250 ms or every 2 KB of new input, whichever comes first, plus once at the end.
export class StreamCleaner {
  constructor({ now = () => Date.now(), everyBytes = 2048, everyMs = 250 } = {}) {
    this.raw = '';
    this.sent = '';
    this.now = now;
    this.everyBytes = everyBytes;
    this.everyMs = everyMs;
    this.cleanedAt = 0;
    this.cleanedLength = 0;
    this.cleans = 0;
  }

  push(chunk) {
    this.raw += chunk;
    const t = this.now();
    if (this.raw.length - this.cleanedLength < this.everyBytes && t - this.cleanedAt < this.everyMs) return '';
    this.cleanedAt = t;
    this.cleanedLength = this.raw.length;
    // Wait for the document start, unless the model never writes one.
    if (!/<!doctype|<html[\s>]/i.test(this.raw) && this.raw.length < 4096) return '';
    this.cleans += 1;
    const cleaned = trimStartOutput(cleanMarkup(stripWrapper(this.raw), false).out);
    if (!cleaned.startsWith(this.sent) || cleaned.length <= this.sent.length) return '';
    const next = cleaned.slice(this.sent.length);
    this.sent = cleaned;
    return next;
  }

  // Returns { rest, html, consistent }: rest is the text still to send; html is what to save.
  finish() {
    this.cleans += 1;
    const html = sanitizeHtml(this.raw);
    if (html.startsWith(this.sent)) return { rest: html.slice(this.sent.length), html, consistent: true };
    // Rare: the early text no longer matches. Save what the player saw, cleaned again.
    return { rest: '', html: sanitizeHtml(this.sent), consistent: false };
  }
}
