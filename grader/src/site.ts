import { MAX_HTML_BYTES } from './config';
import { SITE } from './site-config';
import { GraderInputError } from './types';

/** A site as submitted: file path -> file text. Example: { 'index.html': '...', 'css/site.css': '...' }. */
export type SiteFiles = Record<string, string>;

/**
 * The made-up address a site is served from inside the grader. ".invalid"
 * can never be a real host, and nothing is ever sent to it: every request
 * is answered from the submitted files or refused.
 */
export const SITE_ORIGIN = 'http://grader.invalid';

const PAGE = /\.html?$/i;
// A Map, not a plain object: a file called "a.constructor" must not find Object's own "constructor".
const SERVED = new Map<string, string>([
  ['html', 'text/html; charset=utf-8'],
  ['htm', 'text/html; charset=utf-8'],
  ['css', 'text/css; charset=utf-8'],
  ['svg', 'image/svg+xml'],
]);

export function isPage(path: string): boolean {
  return PAGE.test(path);
}

/** The content type a file is served with, or null if the grader does not serve that kind of file. */
export function contentTypeOf(path: string): string | null {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? null : (SERVED.get(path.slice(dot + 1).toLowerCase()) ?? null);
}

/**
 * Checks a submitted site and returns it as a map with tidy paths
 * ("./css\\a.css" becomes "css/a.css"). Throws GraderInputError for
 * anything that is not a plain set of files inside the site.
 */
export function normalizeFiles(files: SiteFiles): Map<string, string> {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new GraderInputError('A site must be an object of file path to file text.');
  }
  const entries = Object.entries(files);
  if (entries.length === 0) throw new GraderInputError('The site has no files.');
  if (entries.length > SITE.maxFiles) throw new GraderInputError(`The site has more than ${SITE.maxFiles} files.`);

  const out = new Map<string, string>();
  let total = 0;
  for (const [rawPath, text] of entries) {
    if (typeof text !== 'string') throw new GraderInputError(`File "${rawPath}" is not text.`);
    const path = rawPath.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
    const parts = path.split('/');
    if (
      path === '' ||
      path.length > 200 ||
      /[\0?#%:*"<>|]/.test(path) ||
      parts.some((part) => part === '' || part === '.' || part === '..')
    ) {
      throw new GraderInputError(`"${rawPath}" is not a valid file path inside the site.`);
    }
    if (out.has(path)) throw new GraderInputError(`The site has two files called "${path}".`);
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > MAX_HTML_BYTES) throw new GraderInputError(`File "${path}" is larger than ${MAX_HTML_BYTES} bytes.`);
    total += bytes;
    out.set(path, text);
  }
  if (total > SITE.maxTotalBytes) throw new GraderInputError(`The site is larger than ${SITE.maxTotalBytes} bytes.`);
  if (![...out.keys()].some(isPage)) throw new GraderInputError('The site has no .html page.');
  return out;
}

/** The pages of a site, in a fixed order: index.html first, then by name. */
export function pagesOf(files: Map<string, string>): string[] {
  return [...files.keys()]
    .filter(isPage)
    .sort((a, b) => {
      const ai = a.toLowerCase() === 'index.html' ? 0 : 1;
      const bi = b.toLowerCase() === 'index.html' ? 0 : 1;
      return ai - bi || (a < b ? -1 : a > b ? 1 : 0);
    });
}

/** The address a page is loaded from. */
export function urlOf(path: string): string {
  return `${SITE_ORIGIN}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * The site file an address points at, or null if it points outside the
 * site. "/" and folder addresses mean that folder's index.html.
 *
 * Only the plain form of an address is accepted. "//index.html" is refused
 * rather than tidied to "index.html": if both worked, a page could frame
 * itself through an address that grows a slash at every level, and the
 * browser would never recognise the loop.
 */
export function pathOfUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== SITE_ORIGIN || parsed.username !== '' || parsed.password !== '') return null;
  if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return null;
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname).slice(1);
  } catch {
    return null;
  }
  if (path === '' || path.endsWith('/')) path += 'index.html';
  return path;
}

/**
 * Where a link on a page leads, as a site file path. Returns null for
 * links that leave the site, stay on the same page ("#top"), or are not
 * web links at all (mailto:, tel:).
 */
export function linkTarget(href: string, fromPage: string): string | null {
  const trimmed = href.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  let resolved: URL;
  try {
    resolved = new URL(trimmed, urlOf(fromPage));
  } catch {
    return null;
  }
  const path = pathOfUrl(resolved.href);
  return path === null || path === fromPage ? null : path;
}

/**
 * What following a link does, as a visitor sees it:
 *   site     - opens another file of the site (`path`)
 *   self     - stays on the same page (an in-page "#section", or the page's own address)
 *   nothing  - does nothing at all: "#" alone, an empty address, "javascript:"
 *   outside  - leaves the site
 *   other    - not a web link (mailto:, tel:)
 */
export type LinkKind = 'site' | 'self' | 'nothing' | 'outside' | 'other';

export function classifyLink(href: string, fromPage: string): { kind: LinkKind; path?: string } {
  const trimmed = href.trim();
  if (trimmed === '' || /^#!?$/.test(trimmed) || /^javascript:/i.test(trimmed)) return { kind: 'nothing' };
  if (trimmed.startsWith('#')) return { kind: 'self' };
  if (/^(mailto|tel|sms|data):/i.test(trimmed)) return { kind: 'other' };
  let resolved: URL;
  try {
    resolved = new URL(trimmed, urlOf(fromPage));
  } catch {
    return { kind: 'nothing' };
  }
  if (resolved.origin !== SITE_ORIGIN) return { kind: /^https?:$/.test(resolved.protocol) ? 'outside' : 'other' };
  const path = pathOfUrl(resolved.href);
  if (path === null) return { kind: 'nothing' };
  if (path === fromPage) return { kind: 'self' };
  return { kind: 'site', path };
}

// ---------------------------------------------------------------------------
// Reading a page's HTML text: link labels, title, heading, references
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null;
}

const textOf = (html: string) =>
  decodeEntities(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/** Removes comments, scripts and styles, whose text a visitor never sees. */
const visibleHtml = (html: string) =>
  html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, ' ');

/** A link as written in the HTML: its address and the label a visitor reads (its text, or for a picture link its alt text or aria-label). */
export interface SourceLink {
  href: string;
  label: string;
}

export function sourceLinks(html: string): SourceLink[] {
  const out: SourceLink[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  const clean = visibleHtml(html);
  for (let m = re.exec(clean); m !== null && out.length < 5000; m = re.exec(clean)) {
    const href = attr(m[1], 'href');
    if (href === null) continue;
    let label = attr(m[1], 'aria-label') ?? '';
    if (!label.trim()) label = textOf(m[2]);
    if (!label.trim()) {
      const alts: string[] = [];
      for (const img of m[2].matchAll(/<(img|svg)\b[^>]*>/gi)) {
        const alt = attr(img[0], 'alt') ?? attr(img[0], 'aria-label') ?? attr(img[0], 'title');
        if (alt) alts.push(alt);
      }
      label = alts.join(' ');
    }
    if (!label.trim()) label = attr(m[1], 'title') ?? '';
    out.push({ href, label: label.trim() });
  }
  return out;
}

/** A label reduced to what matters for comparing it: lower case, letters and digits, single spaces. */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(' ');
}

/** The page's title and first main heading, as written. */
export function titleAndHeading(html: string): { title: string; heading: string } {
  const clean = visibleHtml(html);
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(clean);
  return { title: title ? textOf(title[1]) : '', heading: h1 ? textOf(h1[1]) : '' };
}

/** True when a page's text has no HTML tags at all: plain text saved as .html. */
export function isPlainText(html: string): boolean {
  return html.trim() !== '' && !/<\s*[a-z!]/i.test(html);
}

/**
 * Files a page or stylesheet asks the browser to load: stylesheets, images
 * and fonts. `from` is the file the reference is written in. Each comes back
 * as written and as resolved: a site path, or `outside` with the address.
 */
export interface Reference {
  /** The site file the reference is written in. */
  from: string;
  /** The site path it points at, or the outside address. */
  target: string;
  outside: boolean;
}

function resolveReference(raw: string, from: string): Reference | null {
  const value = raw.trim();
  if (value === '' || value.startsWith('#') || /^(data|about|blob|javascript):/i.test(value)) return null;
  let resolved: URL;
  try {
    resolved = new URL(value, urlOf(from));
  } catch {
    return null;
  }
  if (resolved.origin !== SITE_ORIGIN) return { from, target: resolved.href, outside: true };
  const path = pathOfUrl(resolved.href);
  return path === null ? { from, target: resolved.href, outside: true } : { from, target: path, outside: false };
}

function cssReferences(css: string, from: string): Reference[] {
  const out: Reference[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of clean.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    const ref = resolveReference(decodeEntities(m[1] ?? m[2] ?? m[3] ?? ''), from);
    if (ref) out.push(ref);
  }
  for (const m of clean.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    const ref = resolveReference(m[1] ?? m[2] ?? '', from);
    if (ref) out.push(ref);
  }
  return out;
}

/** References in a page's HTML: stylesheets, images, and url()s in its own CSS. */
export function pageReferences(html: string, from: string): Reference[] {
  const out: Reference[] = [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|template)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  for (const m of clean.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(m[0], 'rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('stylesheet')) continue;
    const ref = resolveReference(attr(m[0], 'href') ?? '', from);
    if (ref) out.push(ref);
  }
  for (const m of clean.matchAll(/<img\b[^>]*>/gi)) {
    const ref = resolveReference(attr(m[0], 'src') ?? '', from);
    if (ref) out.push(ref);
  }
  for (const m of clean.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) out.push(...cssReferences(m[1], from));
  for (const m of clean.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) out.push(...cssReferences(decodeEntities(m[1] ?? m[2] ?? ''), from));
  return out;
}

/** References written in a stylesheet of the site: url()s and @imports. */
export function stylesheetReferences(css: string, from: string): Reference[] {
  return cssReferences(css, from);
}
