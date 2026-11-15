import { chromium, type Browser, type BrowserContext } from 'playwright';
import { PNG } from 'pngjs';
import { dominantColor, hasInk, refineBlocks, type RawBlock } from './blocks';
import { MAX_BLOCKS, MAX_HTML_BYTES, MAX_PAGE_HEIGHT, RENDER_TIMEOUT_MS, VIEWPORT } from './config';
import { EXTRACT_SOURCE } from './extract-source';
import type { PageStats } from './performance';
import { contentTypeOf, isPage, pathOfUrl, urlOf } from './site';
import { GraderInputError, type PageSnapshot, type RGB, type Rect } from './types';

export { dominantColor } from './blocks';

/**
 * Settles the page before it is measured: animations jump to their end
 * state and transitions are off, so two renders of one page always agree.
 */
const FREEZE_CSS =
  '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;' +
  'animation-iteration-count:1!important;transition:none!important;caret-color:transparent!important;' +
  'scroll-behavior:auto!important}';

/**
 * Runs inside the page: adds FREEZE_CSS, and stops every SVG's own
 * animation clock at time zero (SVG <animate> ignores CSS). It reads the
 * document only through the browser's own getters, because a page can make
 * document.head or document.body lie (<img name="head">).
 */
const FREEZE_SOURCE = String.raw`
(function (css) {
  var D = Document.prototype;
  var root = Object.getOwnPropertyDescriptor(D, 'documentElement').get.call(document);
  if (!root) return;
  var style = D.createElement.call(document, 'style');
  style.textContent = css;
  Node.prototype.appendChild.call(root, style);
  var svgs = D.querySelectorAll.call(document, 'svg');
  for (var i = 0; i < svgs.length; i++) {
    try {
      SVGSVGElement.prototype.pauseAnimations.call(svgs[i]);
      SVGSVGElement.prototype.setCurrentTime.call(svgs[i], 0);
    } catch (e) {}
  }
})
`;

/**
 * Runs inside the page, before anything is added to it: counts what the
 * page is made of (for the load-time estimate) and lists its links. Same
 * rule as the extractor: page nodes are read only through the browser's own
 * getters.
 */
const STATS_SOURCE = String.raw`
(function () {
  function getter(proto, name) {
    return Object.getOwnPropertyDescriptor(proto, name).get;
  }
  var gFirst = getter(Node.prototype, 'firstChild');
  var gNext = getter(Node.prototype, 'nextSibling');
  var gParent = getter(Node.prototype, 'parentNode');
  var gType = getter(Node.prototype, 'nodeType');
  var root = getter(Document.prototype, 'documentElement').call(document);

  var elements = 0;
  var maxDepth = 0;
  if (root) {
    var node = root;
    var depth = 1;
    walk: while (node) {
      if (gType.call(node) === 1) {
        elements++;
        if (depth > maxDepth) maxDepth = depth;
      }
      var child = gFirst.call(node);
      if (child) {
        node = child;
        depth++;
        continue;
      }
      while (true) {
        if (node === root) break walk;
        var sibling = gNext.call(node);
        if (sibling) {
          node = sibling;
          break;
        }
        node = gParent.call(node);
        depth--;
        if (!node) break walk;
      }
    }
  }

  var cssRules = 0;
  function count(list, nesting) {
    for (var i = 0; i < list.length; i++) {
      cssRules++;
      var inner = null;
      try { inner = list[i].cssRules; } catch (e) {}
      if (inner && inner.length && nesting < 8) count(inner, nesting + 1);
    }
  }
  var sheets = getter(Document.prototype, 'styleSheets').call(document);
  for (var s = 0; s < sheets.length; s++) {
    try { count(sheets[s].cssRules, 0); } catch (e) {}
  }

  // Each link with where it sits on the page. Whether it can be seen is
  // settled later, against the screenshot.
  var links = [];
  var mRect = Element.prototype.getBoundingClientRect;
  var mVisible = Element.prototype.checkVisibility;
  var range = Document.prototype.createRange.call(document);
  var sx = window.scrollX || 0;
  var sy = window.scrollY || 0;
  var anchors = Document.prototype.querySelectorAll.call(document, 'a[href]');
  for (var a = 0; a < anchors.length && links.length < 2000; a++) {
    var anchor = anchors[a];
    var href = Element.prototype.getAttribute.call(anchor, 'href');
    if (typeof href !== 'string') continue;
    if (typeof mVisible === 'function' && !mVisible.call(anchor, {
      checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true
    })) continue;
    // The link's own box, widened to whatever it contains (a link wrapped
    // round a whole card is as big as the card).
    var box = mRect.call(anchor);
    range.selectNodeContents(anchor);
    var inner = range.getBoundingClientRect();
    var x0 = box.left, y0 = box.top, x1 = box.right, y1 = box.bottom;
    if (inner.width > 0 && inner.height > 0) {
      if (box.width <= 0 || box.height <= 0) { x0 = inner.left; y0 = inner.top; x1 = inner.right; y1 = inner.bottom; }
      else {
        x0 = Math.min(x0, inner.left); y0 = Math.min(y0, inner.top);
        x1 = Math.max(x1, inner.right); y1 = Math.max(y1, inner.bottom);
      }
    }
    links.push({ href: href.slice(0, 2000), x: x0 + sx, y: y0 + sy, w: x1 - x0, h: y1 - y0 });
  }
  return { elements: elements, maxDepth: maxDepth, cssRules: cssRules, links: links };
})
`;

const LAUNCH_ARGS = [
  '--hide-scrollbars',
  '--disable-gpu',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--force-color-profile=srgb',
];

interface RawExtract {
  docHeight: number;
  pageBackground: RGB;
  samplePageBackground: boolean;
  truncated: boolean;
  blocks: RawBlock[];
}

interface RawStats {
  elements: number;
  maxDepth: number;
  cssRules: number;
  links: { href: string; x: number; y: number; w: number; h: number }[];
}

export interface RendererOptions {
  /** Longest any one step of a render may take. */
  timeoutMs?: number;
  /** For tests only: replaces the in-page extractor. */
  extractSource?: string;
}

type Input = { kind: 'html'; html: string } | { kind: 'site'; files: Map<string, string>; path: string };

/** A page that tries to send the browser somewhere else is not followed. */
function stripRedirects(html: string): string {
  return html.replace(/<meta[^>]+http-equiv\s*=\s*["']?\s*refresh\b[^>]*>/gi, '');
}

/**
 * Whether a render failed by running out of time. That is the page's own
 * doing, so it is not worth a second try; other failures (the shared
 * browser was restarted under it) are.
 */
export function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || /timed out|timeout/i.test(error.message));
}

/** Rejects if the promise has not settled in time. Code running inside a page has no timeout of its own. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  // If the limit wins, the original promise still settles later; that must not count as unhandled.
  promise.catch(() => {});
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/**
 * Renders HTML in a locked-down headless browser and returns what is on the
 * page. The page cannot run scripts or reach the network, and no step can
 * run longer than the timeout.
 */
export class Renderer {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private readonly timeoutMs: number;
  private readonly extractSource: string;

  constructor(options: RendererOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? RENDER_TIMEOUT_MS;
    this.extractSource = options.extractSource ?? EXTRACT_SOURCE;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (!this.launching) {
      // Chromium's own process sandbox stays on: submissions are untrusted.
      // Set GRADER_CHROMIUM_SANDBOX=0 only where the host cannot support it
      // (some containers), and only with the container itself locked down.
      const sandbox = process.env.GRADER_CHROMIUM_SANDBOX !== '0';
      this.launching = chromium
        .launch({ args: LAUNCH_ARGS, chromiumSandbox: sandbox })
        .then((b) => {
          this.browser = b;
          return b;
        })
        .finally(() => {
          this.launching = null;
        });
    }
    return this.launching;
  }

  /** Renders one self-contained page. */
  async render(html: string): Promise<PageSnapshot> {
    if (typeof html !== 'string') throw new GraderInputError('HTML must be a string.');
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
      throw new GraderInputError(`HTML is larger than ${MAX_HTML_BYTES} bytes.`);
    }
    return (await this.capture({ kind: 'html', html })).snapshot;
  }

  /**
   * Renders one page of a multi-file site. The page may load other files
   * of the same site (stylesheets, linked pages in frames); they are served
   * from memory. Anything else it asks for is refused. `files` must already
   * have been checked with normalizeFiles.
   */
  async renderSitePage(
    files: Map<string, string>,
    path: string,
  ): Promise<{ snapshot: PageSnapshot; stats: PageStats }> {
    if (!files.has(path) || !isPage(path)) throw new GraderInputError(`"${path}" is not a page of the site.`);
    const { snapshot, stats } = await this.capture({ kind: 'site', files, path });
    return { snapshot, stats: stats! };
  }

  private async capture(input: Input): Promise<{ snapshot: PageSnapshot; stats: PageStats | null }> {
    const ms = this.timeoutMs;
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: { ...VIEWPORT },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
      offline: true,
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(ms);

      let loaded: { files: string[]; requests: number; bytes: number; blockedRequests: number } | null = null;
      if (input.kind === 'html') {
        // Belt and braces: the context is offline, and every request is refused.
        await context.route('**/*', (route) => route.abort());
        await page.setContent(stripRedirects(input.html), { waitUntil: 'load', timeout: ms });
      } else {
        const traffic = await serveSite(context, input.files, input.path);
        await page.goto(urlOf(input.path), { waitUntil: 'load', timeout: ms });
        loaded = traffic.settle();
      }

      let rawStats: RawStats | null = null;
      if (input.kind === 'site') {
        rawStats = (await withTimeout(page.evaluate(`${STATS_SOURCE}()`), ms, 'Counting the page')) as RawStats;
      }

      // Not page.addStyleTag: it waits on a load event that never comes when
      // the page's scripts are switched off, and hangs.
      await withTimeout(page.evaluate(`${FREEZE_SOURCE}(${JSON.stringify(FREEZE_CSS)})`), ms, 'Settling the page');

      const raw = (await withTimeout(
        page.evaluate(
          `${this.extractSource}(${JSON.stringify({
            maxBlocks: MAX_BLOCKS,
            maxHeight: MAX_PAGE_HEIGHT,
            width: VIEWPORT.width,
          })})`,
        ),
        ms,
        'Reading the page',
      )) as RawExtract;

      const height = Math.min(Math.max(Math.ceil(raw.docHeight), VIEWPORT.height), MAX_PAGE_HEIGHT);
      const png = await page.screenshot({
        type: 'png',
        fullPage: true,
        clip: { x: 0, y: 0, width: VIEWPORT.width, height },
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        timeout: ms,
      });
      const decoded = PNG.sync.read(png);
      const pixels = new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length);

      const whole: Rect = { x: 0, y: 0, w: decoded.width, h: decoded.height };
      const pageBackground = raw.samplePageBackground
        ? dominantColor(pixels, decoded.width, decoded.height, whole)
        : raw.pageBackground;
      const blocks = refineBlocks(raw.blocks, pixels, decoded.width, decoded.height);

      const snapshot: PageSnapshot = {
        width: decoded.width,
        height: decoded.height,
        pageBackground,
        blocks,
        pixels,
        png,
      };
      const stats: PageStats | null =
        loaded && rawStats
          ? {
              files: loaded.files,
              requests: loaded.requests,
              bytes: loaded.bytes,
              blockedRequests: loaded.blockedRequests,
              elements: rawStats.elements,
              maxDepth: rawStats.maxDepth,
              cssRules: rawStats.cssRules,
              height: decoded.height,
              // Only links a visitor could see: an empty or invisible link is not a way to reach a page.
              links: rawStats.links
                .filter((l) => hasInk(pixels, decoded.width, decoded.height, { x: l.x, y: l.y, w: l.w, h: l.h }))
                .map((l) => l.href),
            }
          : null;
      return { snapshot, stats };
    } finally {
      // A page stuck in a loop can refuse to close. Do not wait on it forever:
      // drop the whole browser instead, and the next render starts a new one.
      try {
        await withTimeout(context.close(), 5000, 'Closing the page');
      } catch {
        if (this.browser === browser) this.browser = null;
        void browser.close().catch(() => {});
      }
    }
  }

  async close(): Promise<void> {
    const pending = this.launching;
    const browser = this.browser ?? (pending ? await pending.catch(() => null) : null);
    this.browser = null;
    if (browser) await withTimeout(browser.close(), 10_000, 'Closing the browser').catch(() => {});
  }
}

/**
 * Answers a page's requests from the submitted files, held in memory, and
 * refuses everything else. No request ever leaves the machine and no file
 * is ever read from disk.
 *
 * A page is served exactly once, as the page being graded. It is never
 * served into a frame, and never as a second navigation: that rules out
 * pages framing each other without end, and redirects away from the page
 * under test. Stylesheets and SVG images are served only as parts of a page.
 */
async function serveSite(context: BrowserContext, files: Map<string, string>, pagePath: string) {
  const served = new Set<string>();
  const refused = new Set<string>();
  let settled = false;
  let pageServed = false;
  await context.route('**/*', async (route) => {
    try {
      const request = route.request();
      const url = request.url();
      const path = pathOfUrl(url);
      const text = path === null ? undefined : files.get(path);
      const type = path === null ? null : contentTypeOf(path);
      const navigation = request.isNavigationRequest();
      // Prefetch and similar hints load whenever the browser is idle, before
      // or after the page finishes. Counting them would make the count vary.
      const counted = !settled && request.resourceType() !== 'other';

      let allowed = path !== null && text !== undefined && type !== null;
      if (allowed && isPage(path!)) {
        allowed = navigation && request.frame().parentFrame() === null && path === pagePath && !pageServed;
        if (allowed) pageServed = true;
      } else if (allowed) {
        allowed = !navigation;
      }

      if (!allowed) {
        if (counted) refused.add(url);
        await route.abort();
        return;
      }
      if (counted) served.add(path!);
      await route.fulfill({ status: 200, contentType: type!, body: isPage(path!) ? stripRedirects(text!) : text! });
    } catch {
      // Whatever went wrong, the answer to the page is "no".
      await route.abort().catch(() => {});
    }
  });
  return {
    /** What the page had loaded by the time it finished loading. Later requests are still answered but not counted. */
    settle() {
      settled = true;
      let bytes = 0;
      for (const path of served) bytes += Buffer.byteLength(files.get(path) ?? '', 'utf8');
      return { files: [...served].sort(), requests: served.size, bytes, blockedRequests: refused.size };
    },
  };
}
