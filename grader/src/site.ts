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
