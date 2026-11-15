// promptdyno Markdown renderer: a small, safe subset for lessons and doc answers.
// parseMarkdown(src) -> a tree of plain nodes { tag, attrs?, children? } and text strings.
// toDom(tree, doc) builds real DOM nodes with createElement and text nodes only: raw HTML in the
// source (including <script>) always comes out as visible text, never as markup.
// Supported: headings, paragraphs, lists (ordered and not), code fences, inline code, tables,
// links (http, https, mailto and relative; open in a new tab with rel="noopener"), bold, emphasis,
// blockquotes and rules. Front matter at the top is dropped.

const SAFE_URL = /^(https?:\/\/|mailto:|#|\/|\.{0,2}\/|[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)?([?#].*)?$)/;

function el(tag, children = [], attrs = null) {
  const n = { tag, children };
  if (attrs) n.attrs = attrs;
  return n;
}

export function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'section';
}

function textOf(node) {
  if (typeof node === 'string') return node;
  return (node.children || []).map(textOf).join('');
}

// Inline: `code`, [text](url), **bold**, *em* or _em_. Everything else is text.
export function parseInline(src) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && /[\\`*_[\]()#|!-]/.test(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) { flush(); out.push(el('code', [src.slice(i + 1, end)])); i = end + 1; continue; }
    }
    if (ch === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(src.slice(i));
      if (m) {
        flush();
        const url = m[2].trim();
        if (SAFE_URL.test(url) && !/^\s*(javascript|data|vbscript):/i.test(url)) {
          out.push(el('a', parseInline(m[1]), { href: url, target: '_blank', rel: 'noopener' }));
        } else {
          out.push(...parseInline(m[1]));
        }
        i += m[0].length;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && src[i + 1] === ch) {
      const end = src.indexOf(ch + ch, i + 2);
      if (end > i + 2) { flush(); out.push(el('strong', parseInline(src.slice(i + 2, end)))); i = end + 2; continue; }
    }
    if (ch === '*' || (ch === '_' && (i === 0 || /\W/.test(src[i - 1])))) {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1 && src[i + 1] !== ' ') { flush(); out.push(el('em', parseInline(src.slice(i + 1, end)))); i = end + 1; continue; }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

// Block structure. Returns { tree: [nodes], headings: [{ level, text, id }] }.
export function parseMarkdown(src) {
  let text = String(src ?? '').replace(/\r\n?/g, '\n');
  const fm = /^---\n[\s\S]*?\n---\n?/.exec(text);
  if (fm) text = text.slice(fm[0].length);
  const lines = text.split('\n');
  const tree = [];
  const headings = [];
  const ids = new Set();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      tree.push(el('pre', [el('code', [body.join('\n')], fence[2] ? { 'data-lang': fence[2] } : null)]));
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      const kids = parseInline(h[2]);
      let id = slugify(textOf(el('x', kids)));
      for (let k = 2; ids.has(id); k++) id = `${slugify(textOf(el('x', kids)))}-${k}`;
      ids.add(id);
      headings.push({ level, text: textOf(el('x', kids)), id });
      tree.push(el('h' + level, kids, { id }));
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { tree.push(el('hr')); i++; continue; }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      tree.push(el('blockquote', parseMarkdown(body.join('\n')).tree));
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      tree.push(el('table', [
        el('thead', [el('tr', head.map((c) => el('th', parseInline(c))))]),
        el('tbody', rows.map((r) => el('tr', head.map((_, k) => el('td', parseInline(r[k] || '')))))),
      ]));
      continue;
    }
    const li = LIST_RE.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered) { items.push([m[3]]); i++; continue; }
        // A continuation line (indented, or a nested item) joins the current item as text.
        if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) { items[items.length - 1].push(lines[i].trim().replace(/^([-*+]|\d+[.)])\s+/, '')); i++; continue; }
        break;
      }
      tree.push(el(ordered ? 'ol' : 'ul', items.map((parts) => el('li', parseInline(parts.join(' '))))));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*(```|~~~)|\s*>)/.test(lines[i]) && !LIST_RE.test(lines[i])) para.push(lines[i++].trim());
    if (!para.length) { para.push(lines[i++].trim()); }
    tree.push(el('p', parseInline(para.join(' '))));
  }
  return { tree, headings };
}

const ALLOWED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'pre', 'code', 'strong', 'em', 'a', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const ATTRS = new Set(['href', 'target', 'rel', 'id', 'data-lang']);

// Builds DOM nodes from the tree. Only known tags and attributes; text through text nodes.
export function toDom(nodes, doc = globalThis.document) {
  const frag = doc.createDocumentFragment();
  for (const n of nodes) {
    if (typeof n === 'string') { frag.appendChild(doc.createTextNode(n)); continue; }
    if (!ALLOWED.has(n.tag)) continue;
    const e = doc.createElement(n.tag);
    for (const [k, v] of Object.entries(n.attrs || {})) if (ATTRS.has(k)) e.setAttribute(k, String(v));
    e.appendChild(toDom(n.children || [], doc));
    frag.appendChild(e);
  }
  return frag;
}

// Renders Markdown into container (replacing what was there). Returns the headings.
export function renderMarkdown(container, src, doc = globalThis.document) {
  const { tree, headings } = parseMarkdown(src);
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(toDom(tree, doc));
  return headings;
}
