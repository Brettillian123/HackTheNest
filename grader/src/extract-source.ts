/**
 * The code that runs inside the rendered page and lists what a person would
 * see: text, boxes and images, each with its position, size and colours.
 *
 * It is kept as a plain string on purpose. Build tools rewrite functions
 * (adding helpers that do not exist inside the page), so passing a real
 * function to the browser breaks under some of them. A string is passed
 * through untouched. Rules for editing it: plain ES2020, no backticks, no
 * dollar-brace.
 *
 * It judges what is rendered, never which tags were used, so a page built
 * with tables and one built with flexbox score the same if they look the same.
 *
 * It trusts nothing the page can influence. A page can make an element's
 * properties lie: inside <form>, an <input name="nextSibling"> replaces the
 * form's real nextSibling, and <img name="body"> replaces document.body. So
 * every property of a page node is read through the browser's own getter
 * (the PAGE-PROOF section), never as node.property.
 */
export const EXTRACT_SOURCE = String.raw`
(function (opts) {
  var maxBlocks = opts.maxBlocks;
  var maxHeight = opts.maxHeight;
  var viewW = opts.width;
  var sx = window.scrollX || 0;
  var sy = window.scrollY || 0;

  // ---------- PAGE-PROOF access to nodes ----------
  function getter(proto, name) {
    return Object.getOwnPropertyDescriptor(proto, name).get;
  }
  var gFirstChild = getter(Node.prototype, 'firstChild');
  var gNextSibling = getter(Node.prototype, 'nextSibling');
  var gParentNode = getter(Node.prototype, 'parentNode');
  var gParentElement = getter(Node.prototype, 'parentElement');
  var gNodeType = getter(Node.prototype, 'nodeType');
  var gTagName = getter(Element.prototype, 'tagName');
  var gData = getter(CharacterData.prototype, 'data');
  var gScrollHeight = getter(Element.prototype, 'scrollHeight');
  var gInputValue = getter(HTMLInputElement.prototype, 'value');
  var gTextAreaValue = getter(HTMLTextAreaElement.prototype, 'value');
  var gSelectedOptions = getter(HTMLSelectElement.prototype, 'selectedOptions');
  var gOptionText = getter(HTMLOptionElement.prototype, 'text');
  var mGetRect = Element.prototype.getBoundingClientRect;
  var mGetAttribute = Element.prototype.getAttribute;
  var mCheckVisibility = Element.prototype.checkVisibility;
  var mCreateElement = Document.prototype.createElement;
  var mCreateRange = Document.prototype.createRange;
  var mGetContext = HTMLCanvasElement.prototype.getContext;

  function firstChild(n) { return gFirstChild.call(n); }
  function nextSibling(n) { return gNextSibling.call(n); }
  function parentNode(n) { return gParentNode.call(n); }
  function parentElement(n) { return gParentElement.call(n); }
  function nodeType(n) { return gNodeType.call(n); }
  function tagOf(el) { return String(gTagName.call(el)).toUpperCase(); }
  function attr(el, name) { return mGetAttribute.call(el, name); }

  var body = getter(Document.prototype, 'body').call(document);
  var root = getter(Document.prototype, 'documentElement').call(document);
  if (!body) {
    return { docHeight: 0, pageBackground: [255, 255, 255], samplePageBackground: false, truncated: false, blocks: [] };
  }

  // ---------- colours ----------
  var colorCache = new Map();
  var canvas = mCreateElement.call(document, 'canvas');
  canvas.width = 1;
  canvas.height = 1;
  var ctx = mGetContext.call(canvas, '2d', { willReadFrequently: true });

  function parseColor(s) {
    if (!s) return [0, 0, 0, 0];
    var hit = colorCache.get(s);
    if (hit) return hit;
    var out;
    var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s\/]+([\d.]+%?))?\s*\)$/.exec(s);
    if (m) {
      var a = 1;
      if (m[4] !== undefined) a = m[4].charAt(m[4].length - 1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      out = [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a];
    } else if (s === 'transparent') {
      out = [0, 0, 0, 0];
    } else if (ctx) {
      // Any other CSS colour (oklch, color(), lab...): let the browser paint it.
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      var d = ctx.getImageData(0, 0, 1, 1).data;
      out = [d[0], d[1], d[2], d[3] / 255];
    } else {
      out = [0, 0, 0, 1];
    }
    colorCache.set(s, out);
    return out;
  }

  // A see-through colour laid over a solid one.
  function over(top, bottom) {
    var a = top[3];
    if (a >= 1) return [top[0], top[1], top[2]];
    return [
      Math.round(top[0] * a + bottom[0] * (1 - a)),
      Math.round(top[1] * a + bottom[1] * (1 - a)),
      Math.round(top[2] * a + bottom[2] * (1 - a))
    ];
  }

  function differs(a, b, threshold) {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) >= threshold;
  }

  var styleCache = new Map();
  function cs(el) {
    var s = styleCache.get(el);
    if (!s) {
      s = getComputedStyle(el);
      styleCache.set(el, s);
    }
    return s;
  }

  // The colour showing at an element once every ancestor's background is
  // stacked up. "image" means a gradient or picture is in the stack, so the
  // colour cannot be trusted and the grader samples the screenshot instead.
  var paintCache = new Map();
  function painted(el) {
    var chain = [];
    var cur = el;
    while (cur && !paintCache.has(cur)) {
      chain.push(cur);
      cur = parentElement(cur);
    }
    var base = cur ? paintCache.get(cur) : { color: [255, 255, 255], image: false };
    for (var i = chain.length - 1; i >= 0; i--) {
      var s = cs(chain[i]);
      var bg = parseColor(s.backgroundColor);
      var hasImage = !!s.backgroundImage && s.backgroundImage !== 'none';
      base = {
        color: bg[3] > 0 ? over(bg, base.color) : base.color,
        image: hasImage ? true : (bg[3] >= 1 ? false : base.image)
      };
      paintCache.set(chain[i], base);
    }
    return base;
  }

  // How an element's own colours are changed on the way to the screen by
  // itself and its ancestors: a = the opacity they multiply to, f = a filter,
  // blend mode or opacity is in play. The screenshot then shows other colours
  // than the styles name, and blocks.ts looks for the changed ones.
  var toneCache = new Map();
  function toneOf(el) {
    var chain = [];
    var cur = el;
    while (cur && !toneCache.has(cur) && chain.length < 400) {
      chain.push(cur);
      cur = parentElement(cur);
    }
    var base = cur && toneCache.has(cur) ? toneCache.get(cur) : { a: 1, f: false };
    for (var i = chain.length - 1; i >= 0; i--) {
      var s = cs(chain[i]);
      var op = parseFloat(s.opacity);
      if (!(op >= 0 && op <= 1)) op = 1;
      var fl = String(s.filter || 'none') !== 'none' || String(s.mixBlendMode || 'normal') !== 'normal';
      base = { a: Math.round(base.a * op * 1000) / 1000, f: base.f || fl || op < 1 };
      toneCache.set(chain[i], base);
    }
    return base;
  }

  // ---------- helpers ----------
  function visible(el) {
    if (typeof mCheckVisibility === 'function') {
      return mCheckVisibility.call(el, {
        checkOpacity: true,
        checkVisibilityCSS: true,
        opacityProperty: true,
        visibilityProperty: true
      });
    }
    var s = cs(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function r1(n) {
    return Math.round(n * 10) / 10;
  }

  function onPage(r) {
    return r.w >= 1 && r.h >= 1 && r.x < viewW && r.x + r.w > 0 && r.y < maxHeight && r.y + r.h > 0;
  }

  // ---------- clipping ----------
  // What an element cuts its content down to, in page coordinates, or null.
  // Overflow other than visible clips to the element's box; the old clip
  // property and clip-path: inset(50%) (the usual "screen-reader only"
  // tricks) clip to nothing or to a part of it.
  var NO_CLIP = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
  var ownClipCache = new Map();
  function ownClip(el) {
    if (ownClipCache.has(el)) return ownClipCache.get(el);
    var s = cs(el);
    var out = null;
    var clipsX = s.overflowX !== 'visible';
    var clipsY = s.overflowY !== 'visible';
    var pos = s.position;
    var clipProp = String(s.clip || 'auto');
    var hasClip = clipProp !== 'auto' && (pos === 'absolute' || pos === 'fixed');
    var cp = String(s.clipPath || 'none');
    var insetHalf = /^inset\(\s*50%/.test(cp) || /^circle\(\s*0(px|%)?\s*(at|\))/.test(cp);
    if (clipsX || clipsY || hasClip || insetHalf) {
      var b = mGetRect.call(el);
      var c = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
      if (clipsX) { c.x0 = b.left + sx; c.x1 = b.right + sx; }
      if (clipsY) { c.y0 = b.top + sy; c.y1 = b.bottom + sy; }
      if (hasClip) {
        var m = /rect\(\s*([^,\s]+)[,\s]+([^,\s]+)[,\s]+([^,\s]+)[,\s]+([^,\s)]+)\s*\)/.exec(clipProp);
        if (m) {
          var num = function (v, dflt) { return v === 'auto' ? dflt : (parseFloat(v) || 0); };
          var top = num(m[1], 0), right = num(m[2], b.width), bottom = num(m[3], b.height), left = num(m[4], 0);
          c.x0 = Math.max(c.x0, b.left + sx + left);
          c.x1 = Math.min(c.x1, b.left + sx + right);
          c.y0 = Math.max(c.y0, b.top + sy + top);
          c.y1 = Math.min(c.y1, b.top + sy + bottom);
        }
      }
      if (insetHalf) { c.x1 = c.x0 = b.left + sx; c.y1 = c.y0 = b.top + sy; }
      out = c;
    }
    ownClipCache.set(el, out);
    return out;
  }

  function cut(a, c) {
    return { x0: Math.max(a.x0, c.x0), y0: Math.max(a.y0, c.y0), x1: Math.min(a.x1, c.x1), y1: Math.min(a.y1, c.y1) };
  }

  // The area the content of el can show in, after every ancestor that clips
  // it. An absolutely positioned element escapes the clipping of ancestors
  // that are not positioned; a fixed one escapes them all.
  var clipCache = new Map();
  function clipFor(el) {
    var hit = clipCache.get(el);
    if (hit) return hit;
    var area = NO_CLIP;
    var cur = el;
    var needPositioned = false;
    var steps = 0;
    while (cur && cur !== body && cur !== root && steps++ < 400) {
      var pos = cs(cur).position;
      if (!needPositioned || pos !== 'static') {
        var c = ownClip(cur);
        if (c) area = cut(area, c);
      }
      if (pos === 'fixed') break;
      if (pos === 'absolute') needPositioned = true;
      else if (pos !== 'static') needPositioned = false;
      cur = parentElement(cur);
    }
    clipCache.set(el, area);
    return area;
  }

  // Where an element's own box can be seen: clipped by its ancestors (and by
  // its own clip property, which cuts the element itself).
  function clipOfBox(el) {
    var pos = cs(el).position;
    var parent = parentElement(el);
    var area = NO_CLIP;
    if (pos !== 'fixed' && parent && parent !== body && parent !== root) {
      if (pos === 'absolute') {
        // Skip to the nearest positioned ancestor: only it and those above can clip.
        var cur = parent;
        var steps = 0;
        while (cur && cur !== body && cur !== root && cs(cur).position === 'static' && steps++ < 400) cur = parentElement(cur);
        if (cur && cur !== body && cur !== root) area = clipFor(cur);
      } else {
        area = clipFor(parent);
      }
    }
    var own = ownClip(el);
    var s = cs(el);
    if (own && (String(s.clip || 'auto') !== 'auto' || String(s.clipPath || 'none') !== 'none')) {
      // Only the clip/clip-path part cuts the element itself, not overflow.
      var b = mGetRect.call(el);
      var self = { x0: b.left + sx, y0: b.top + sy, x1: b.right + sx, y1: b.bottom + sy };
      var oc = own;
      if (s.overflowX !== 'visible') { oc = { x0: -Infinity, y0: oc.y0, x1: Infinity, y1: oc.y1 }; }
      if (s.overflowY !== 'visible') { oc = { x0: oc.x0, y0: -Infinity, x1: oc.x1, y1: Infinity }; }
      area = cut(area, cut(self, oc));
    }
    return area;
  }

  // A rect cut to an area, or null when nothing of it is left.
  function clipRect(r, area) {
    var x0 = Math.max(r.x, area.x0), y0 = Math.max(r.y, area.y0);
    var x1 = Math.min(r.x + r.w, area.x1), y1 = Math.min(r.y + r.h, area.y1);
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    return { x: r1(x0), y: r1(y0), w: r1(x1 - x0), h: r1(y1 - y0) };
  }

  // ---------- roles (a naming hint for feedback; never used for scoring) ----------
  function ownRole(el) {
    var tag = tagOf(el);
    var aria = String(attr(el, 'role') || '').toLowerCase();
    if (/^H[1-6]$/.test(tag) || aria === 'heading') return 'heading';
    if (tag === 'BUTTON' || aria === 'button') return 'button';
    if (tag === 'INPUT') {
      var t = String(attr(el, 'type') || 'text').toLowerCase();
      return t === 'submit' || t === 'button' || t === 'reset' || t === 'image' ? 'button' : 'field';
    }
    if (tag === 'A' && attr(el, 'href') !== null) return 'link';
    if (aria === 'link') return 'link';
    if (tag === 'SELECT' || tag === 'TEXTAREA' || aria === 'textbox' || aria === 'combobox') return 'field';
    if (tag === 'LABEL') return 'label';
    if (tag === 'TD' || tag === 'TH' || aria === 'cell' || aria === 'gridcell' || aria === 'columnheader' || aria === 'rowheader') return 'cell';
    if (tag === 'LI' || aria === 'listitem') return 'listitem';
    if (tag === 'BLOCKQUOTE') return 'quote';
    if (tag === 'PRE' || tag === 'CODE') return 'code';
    if (tag === 'FIGCAPTION' || tag === 'CAPTION') return 'caption';
    return null;
  }
  var roleCache = new Map();
  function roleOf(el) {
    if (roleCache.has(el)) return roleCache.get(el);
    var chain = [];
    var cur = el;
    var found = null;
    while (cur && cur !== body && cur !== root && chain.length < 400) {
      if (roleCache.has(cur)) { found = roleCache.get(cur); break; }
      chain.push(cur);
      var r = ownRole(cur);
      if (r) { found = r; break; }
      cur = parentElement(cur);
    }
    for (var i = 0; i < chain.length; i++) roleCache.set(chain[i], found);
    return found;
  }

  // The nearest ancestor that starts its own box: text inside it, across
  // spans, links and bold, reads as one piece.
  function container(el) {
    var cur = el;
    while (cur && cur !== body) {
      var d = cs(cur).display;
      if (d !== 'inline' && d !== 'contents') return cur;
      cur = parentElement(cur);
    }
    return body;
  }

  var SERIF = ['serif', 'ui-serif', 'times', 'times new roman', 'georgia', 'garamond', 'palatino', 'palatino linotype',
    'book antiqua', 'cambria', 'baskerville', 'didot', 'bodoni', 'constantia', 'rockwell'];
  var MONO = ['monospace', 'ui-monospace', 'courier', 'courier new', 'consolas', 'menlo', 'monaco', 'lucida console',
    'sf mono', 'sfmono-regular', 'cascadia code', 'cascadia mono', 'liberation mono', 'dejavu sans mono'];
  var SANS = ['sans-serif', 'ui-sans-serif', 'ui-rounded', 'system-ui', '-apple-system', 'blinkmacsystemfont', 'arial',
    'arial black', 'helvetica', 'helvetica neue', 'verdana', 'tahoma', 'trebuchet ms', 'segoe ui', 'calibri',
    'candara', 'gill sans', 'lucida grande', 'lucida sans unicode', 'geneva', 'impact', 'noto sans',
    'liberation sans', 'dejavu sans'];

  // Web fonts cannot load here, so walk the list to the first font this
  // machine could actually use, the way the browser does.
  function fontClass(family) {
    var list = String(family || '').split(',');
    for (var i = 0; i < list.length; i++) {
      var n = list[i].trim().replace(/^["']|["']$/g, '').toLowerCase();
      if (MONO.indexOf(n) >= 0) return 'mono';
      if (SERIF.indexOf(n) >= 0) return 'serif';
      if (SANS.indexOf(n) >= 0) return 'sans';
      if (n === 'cursive' || n === 'fantasy') return 'other';
    }
    return 'other';
  }

  function isBold(weight) {
    if (weight === 'bold' || weight === 'bolder') return true;
    var n = parseInt(weight, 10);
    return !isNaN(n) && n >= 600;
  }

  function underlined(el, stop) {
    var cur = el;
    while (cur) {
      var line = cs(cur).textDecorationLine || '';
      if (line.indexOf('underline') >= 0) return true;
      if (cur === stop) break;
      cur = parentElement(cur);
    }
    return false;
  }

  function textStyleOf(el, stop, shown) {
    var s = cs(el);
    return {
      color: shown,
      fontSize: r1(parseFloat(s.fontSize) || 0),
      bold: isBold(s.fontWeight),
      fontClass: fontClass(s.fontFamily),
      italic: s.fontStyle === 'italic' || s.fontStyle.indexOf('oblique') === 0,
      underline: underlined(el, stop)
    };
  }

  function applyTransform(text, transform) {
    if (transform === 'uppercase') return text.toUpperCase();
    if (transform === 'lowercase') return text.toLowerCase();
    if (transform === 'capitalize') {
      return text.replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
    }
    return text;
  }

  function radiusOf(s, rect) {
    var half = Math.min(rect.w, rect.h) / 2;
    if (half <= 0) return 0;
    var corners = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
    var best = 0;
    for (var i = 0; i < corners.length; i++) {
      var raw = String(corners[i] || '0');
      var v = parseFloat(raw) || 0;
      if (raw.indexOf('%') >= 0) v = (v / 100) * Math.min(rect.w, rect.h);
      if (v > best) best = v;
    }
    return Math.round(Math.min(1, best / half) * 100) / 100;
  }

  // ---------- walk the page ----------
  var blocks = [];
  var groups = new Map();
  var groupOrder = [];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, HEAD: 1, TITLE: 1, META: 1, LINK: 1, OPTION: 1, OPTGROUP: 1 };
  var IMAGE = { IMG: 1, SVG: 1, CANVAS: 1, VIDEO: 1 };
  var NO_TEXT_INPUT = { hidden: 1, checkbox: 1, radio: 1, range: 1, color: 1, file: 1, image: 1 };
  var gProgressPosition = getter(HTMLProgressElement.prototype, 'position');
  var gMeterValue = getter(HTMLMeterElement.prototype, 'value');
  var gMeterMin = getter(HTMLMeterElement.prototype, 'min');
  var gMeterMax = getter(HTMLMeterElement.prototype, 'max');

  // A plain tree walk, in document order. Not a TreeWalker with a filter: the
  // page's scripts are switched off, and the browser then refuses to call a
  // filter function from inside the DOM.
  function advance(n, skipChildren) {
    if (!skipChildren) {
      var child = firstChild(n);
      if (child) return child;
    }
    while (n && n !== body) {
      var next = nextSibling(n);
      if (next) return next;
      n = parentNode(n);
    }
    return null;
  }

  var range = mCreateRange.call(document);

  function full() {
    return blocks.length + groupOrder.length >= maxBlocks;
  }

  function newGroup(cont, split) {
    var g = { parts: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, longest: 0,
      styleEl: null, shown: null, behind: null, sample: false, cont: cont, lines: [], last: null,
      lastFs: 0, lastLs: 0, lastWs: 0, lastMono: false, split: split };
    groups.set(cont, g);
    groupOrder.push(g);
    return g;
  }

  // Pieces of text in one container are one block, except where a reader
  // sees separate items: on one line, a gap clearly wider than a word space
  // (menu links spaced by margins). A smaller visible gap is a word break; no
  // gap at all is one word (Hel<span>lo</span>). Decided from where the
  // pieces are drawn, never from the tags. SPLIT_EM must match blocks.ts.
  function addTextTo(cont, text, lines, styleEl, shown, paint, f) {
    var g = groups.get(cont);
    if (!g) g = newGroup(cont, false);
    var first = lines[0];
    var p = g.last;
    if (p) {
      var overlap = Math.min(p.y + p.h, first.y + first.h) - Math.max(p.y, first.y);
      if (overlap >= 0.5 * Math.min(p.h, first.h)) {
        // Letter and word spacing widen the gap between pieces without
        // making them separate items.
        var gapPx = first.x - (p.x + p.w) - Math.max(0, g.lastLs) - Math.max(0, g.lastWs, f.wordSpacing);
        var em = Math.max(f.size, g.lastFs);
        var limit = (f.mono || g.lastMono ? 1.1 : 0.5) * em;
        if (!f.justify && gapPx >= limit) g = newGroup(cont, true);
        else if (gapPx > 0.12 * em) g.parts.push(' ');
      } else if (g.split) {
        g = newGroup(cont, true);
      }
    }
    g.parts.push(text);
    for (var li = 0; li < lines.length; li++) {
      var rect = lines[li];
      if (g.lines.length < 200) g.lines.push(rect);
      if (rect.x < g.x0) g.x0 = rect.x;
      if (rect.y < g.y0) g.y0 = rect.y;
      if (rect.x + rect.w > g.x1) g.x1 = rect.x + rect.w;
      if (rect.y + rect.h > g.y1) g.y1 = rect.y + rect.h;
    }
    g.last = lines[lines.length - 1];
    g.lastFs = f.size;
    g.lastLs = f.letterSpacing;
    g.lastWs = f.wordSpacing;
    g.lastMono = f.mono;
    var len = text.replace(/\s+/g, '').length;
    if (len > g.longest) {
      g.longest = len;
      g.styleEl = styleEl;
      g.shown = shown;
      g.behind = paint.color;
      g.sample = paint.image;
    }
  }

  // Handles one element. Returns true when its children must not be visited.
  function handleElement(el) {
    var tag = tagOf(el);
    if (SKIP[tag]) return true;

    if (tag === 'BR') {
      var brGroup = groups.get(container(parentElement(el) || body));
      if (brGroup) brGroup.parts.push(' ');
      return true;
    }
    if (!visible(el)) return IMAGE[tag] ? true : false;

    var b = mGetRect.call(el);
    var fullRect = { x: r1(b.left + sx), y: r1(b.top + sy), w: r1(b.width), h: r1(b.height) };
    if (!onPage(fullRect)) return IMAGE[tag] ? true : false;
    // Only the part that is not clipped away by an ancestor can be seen.
    var rect = el === body ? fullRect : clipRect(fullRect, clipOfBox(el));
    if (!rect || !onPage(rect)) return IMAGE[tag] ? true : false;
    var s = cs(el);
    var behind = painted(parentElement(el));
    var tone = toneOf(el);

    if (IMAGE[tag]) {
      if (rect.w >= 4 && rect.h >= 4) {
        blocks.push({ kind: 'image', rect: rect, behind: behind.color, sample: behind.image, alpha: tone.a, altered: tone.f });
      }
      return true;
    }

    // A progress bar or meter drawn by the browser: a track, and a filled
    // part as long as its value, the same as one drawn with two boxes.
    if ((tag === 'PROGRESS' || tag === 'METER') && String(s.appearance || 'auto') !== 'none') {
      var share = 0;
      if (tag === 'PROGRESS') share = gProgressPosition.call(el);
      else {
        var mMin = gMeterMin.call(el), mMax = gMeterMax.call(el);
        share = mMax > mMin ? (gMeterValue.call(el) - mMin) / (mMax - mMin) : 0;
      }
      var bar = function (r) {
        blocks.push({ kind: 'box', rect: r, role: null, behind: behind.color, sample: behind.image, alpha: tone.a, altered: tone.f,
          box: { background: behind.color, fill: true, sampleBackground: true, hasBorder: false, borderColor: null,
            borderWidth: 0, borderShare: 0, radius: radiusOf(s, r), shadow: false } });
      };
      if (rect.w * rect.h >= 16) {
        bar(rect);
        if (share > 0 && share <= 1 && rect.w * share >= 2) bar({ x: rect.x, y: rect.y, w: r1(rect.w * share), h: rect.h });
      }
      return true;
    }

    var boxRole = ownRole(el);
    var pushedBox = false;
    // A box is anything with a background, border or shadow you can see.
    if (el !== body && rect.w * rect.h >= 16) {
      var bg = parseColor(s.backgroundColor);
      var hasImage = !!s.backgroundImage && s.backgroundImage !== 'none';
      var own = bg[3] > 0 ? over(bg, behind.color) : behind.color;
      var bgSeen = hasImage || (bg[3] > 0 && (behind.image || differs(own, behind.color, 4)));

      var sides = ['Top', 'Right', 'Bottom', 'Left'];
      var borderW = 0;
      var borderC = null;
      var borderArea = 0;
      var borderStyle = '';
      for (var i = 0; i < sides.length; i++) {
        var w = parseFloat(s['border' + sides[i] + 'Width']) || 0;
        var st = s['border' + sides[i] + 'Style'];
        if (w > 0 && st !== 'none' && st !== 'hidden') {
          var c = parseColor(s['border' + sides[i] + 'Color']);
          if (c[3] > 0) {
            var cc = over(c, own);
            if (differs(cc, own, 4)) {
              // Top and bottom run the width of the box, left and right its height.
              borderArea += w * (i % 2 === 0 ? rect.w : rect.h);
              if (w > borderW) {
                borderW = w;
                borderC = cc;
                borderStyle = st;
              }
            }
          }
        }
      }
      var shadow = !!s.boxShadow && s.boxShadow !== 'none';

      if (bgSeen || borderW > 0 || shadow) {
        pushedBox = true;
        blocks.push({
          kind: 'box',
          rect: rect,
          role: boxRole,
          behind: behind.color,
          sample: behind.image,
          alpha: tone.a,
          altered: tone.f,
          box: {
            background: own,
            fill: bgSeen,
            sampleBackground: hasImage || (bg[3] <= 0 && behind.image),
            hasBorder: borderW > 0,
            borderColor: borderC,
            borderWidth: r1(borderW),
            borderShare: Math.round(Math.min(1, borderArea / (rect.w * rect.h)) * 100) / 100,
            radius: radiusOf(s, rect),
            shadow: shadow,
            // Inset, outset, groove and ridge borders are drawn in shades
            // of their colour, not the colour itself (an <hr>).
            sampleBorder: /^(inset|outset|groove|ridge)$/.test(borderStyle)
          }
        });
      }
    }

    // A checkbox or radio button drawn by the browser has no background or
    // border in its styles, but a person sees a small box: it is one.
    if (tag === 'INPUT' && !pushedBox) {
      var ctype = String(attr(el, 'type') || '').toLowerCase();
      var appearance = String(s.appearance || s.webkitAppearance || 'auto');
      if ((ctype === 'checkbox' || ctype === 'radio') && appearance !== 'none' && rect.w >= 4 && rect.h >= 4) {
        blocks.push({
          kind: 'box',
          rect: rect,
          role: 'field',
          behind: behind.color,
          sample: behind.image,
          box: {
            background: behind.color,
            fill: true,
            sampleBackground: true,
            hasBorder: false,
            borderColor: null,
            borderWidth: 0,
            borderShare: 0,
            radius: ctype === 'radio' ? 1 : 0.2,
            shadow: false
          }
        });
        // The tick of a ticked checkbox is part of the box's drawing (its
        // colour is sampled from the screenshot), not text: a rebuild may
        // draw the same box with a character, a picture or nothing.
      }
    }

    // Form fields show text that is not a text node.
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      var shownText = '';
      var placeholder = false;
      if (tag === 'SELECT') {
        var chosen = gSelectedOptions.call(el);
        shownText = chosen && chosen.length > 0 ? gOptionText.call(chosen[0]) : '';
      } else {
        var type = String(attr(el, 'type') || 'text').toLowerCase();
        if (tag === 'TEXTAREA' || !NO_TEXT_INPUT[type]) {
          shownText = (tag === 'TEXTAREA' ? gTextAreaValue.call(el) : gInputValue.call(el)) || '';
          // A password field draws one dot for each character it holds.
          if (type === 'password' && shownText) shownText = new Array(Math.min(shownText.length, 200) + 1).join('•');
          // A submit or reset button with no value shows the browser's own label.
          if (!shownText && tag === 'INPUT' && attr(el, 'value') === null) {
            if (type === 'submit') shownText = 'Submit';
            else if (type === 'reset') shownText = 'Reset';
          }
          if (!shownText && tag === 'INPUT' && (type === 'submit' || type === 'reset' || type === 'button')) {
            shownText = '';
          } else if (!shownText) {
            shownText = attr(el, 'placeholder') || '';
            placeholder = !!shownText;
          }
        }
      }
      shownText = String(shownText).replace(/\s+/g, ' ').trim();
      // A drop-down drawn by the browser shows its arrow at the right end,
      // the same as a styled box with a '▾' after its text.
      if (tag === 'SELECT' && String(s.appearance || 'auto') !== 'none' && attr(el, 'multiple') === null &&
          !(parseInt(attr(el, 'size'), 10) > 1) && rect.w >= 24 && rect.h >= 8) {
        var afs = parseFloat(s.fontSize) || 13;
        var aw = r1(afs * 0.7), ah = r1(afs * 1.15);
        var arrowRect = clipRect({ x: r1(fullRect.x + fullRect.w - (parseFloat(s.borderRightWidth) || 0) - 4 - aw),
          y: r1(fullRect.y + (fullRect.h - ah) / 2), w: aw, h: ah }, clipOfBox(el));
        if (arrowRect) {
          var arrowPaint = painted(el);
          blocks.push({ kind: 'text', rect: arrowRect, lines: [arrowRect], role: boxRole, behind: arrowPaint.color,
            sample: arrowPaint.image, alpha: tone.a, altered: tone.f, text: '▾',
            textStyle: textStyleOf(el, el, over(parseColor(s.color), arrowPaint.color)) });
        }
      }
      if (shownText) {
        var fieldPaint = painted(el);
        // Placeholder text is drawn in its own (usually grey) colour.
        var fieldColor = over(parseColor(placeholder ? getComputedStyle(el, '::placeholder').color : s.color), fieldPaint.color);
        // Where the text itself sits: inside the padding and border, as wide
        // as the text is and as tall as one line, so a field and a look-alike
        // box with the same text give the same text block.
        var px = function (v) { return parseFloat(v) || 0; };
        var cx = fullRect.x + px(s.borderLeftWidth) + px(s.paddingLeft);
        var cy = fullRect.y + px(s.borderTopWidth) + px(s.paddingTop);
        var cw = Math.max(0, fullRect.w - px(s.borderLeftWidth) - px(s.borderRightWidth) - px(s.paddingLeft) - px(s.paddingRight));
        var ch = Math.max(0, fullRect.h - px(s.borderTopWidth) - px(s.borderBottomWidth) - px(s.paddingTop) - px(s.paddingBottom));
        var textRect = { x: r1(cx), y: r1(cy), w: r1(cw), h: r1(ch) };
        if (tag !== 'TEXTAREA' && ctx) {
          ctx.font = s.fontStyle + ' ' + s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
          var m = ctx.measureText(shownText);
          var tw = Math.min(cw, m.width);
          var th = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
          if (!(th > 0)) th = (parseFloat(s.fontSize) || 16) * 1.15;
          th = Math.min(ch, th);
          var align = s.textAlign;
          var tx = align === 'center' ? cx + (cw - tw) / 2 : align === 'right' || align === 'end' ? cx + cw - tw : cx;
          textRect = { x: r1(tx), y: r1(cy + (ch - th) / 2), w: r1(tw), h: r1(th) };
        }
        if (textRect.w < 1 || textRect.h < 1) textRect = fullRect;
        textRect = clipRect(textRect, clipOfBox(el));
        if (textRect) {
          blocks.push({
            kind: 'text',
            rect: textRect,
            lines: tag === 'TEXTAREA' ? undefined : [textRect],
            role: boxRole,
            behind: fieldPaint.color,
            sample: fieldPaint.image,
            alpha: tone.a,
            altered: tone.f,
            // The colour is checked against the screenshot (blocks.ts).
            checkColor: true,
            text: shownText,
            textStyle: textStyleOf(el, el, fieldColor)
          });
        }
      }
      return true;
    }
    return false;
  }

  function handleText(node) {
    var pe = parentElement(node);
    if (!pe) return;
    var data = gData.call(node);
    if (!/\S/.test(data)) {
      var spaceGroup = groups.get(container(pe));
      if (spaceGroup) spaceGroup.parts.push(' ');
      return;
    }
    if (!visible(pe)) return;

    var ps = cs(pe);
    var fs = parseFloat(ps.fontSize) || 0;
    if (fs < 4) return;
    var col = parseColor(ps.color);
    if (col[3] <= 0.05) return;

    // Each line the text is drawn on, cut to what its clipping ancestors let
    // show. Text clipped to nothing (a screen-reader-only label) or drawn
    // off the page is not seen by anyone.
    range.selectNodeContents(node);
    var rects = range.getClientRects();
    var area = clipFor(pe);
    var lines = [];
    for (var k = 0; k < rects.length && k < 400; k++) {
      var q = rects[k];
      if (q.width < 0.5 || q.height < 0.5) continue;
      var line = clipRect({ x: q.left + sx, y: q.top + sy, w: q.width, h: q.height }, area);
      if (line && onPage(line)) lines.push(line);
    }
    if (lines.length === 0) return;

    var paint = painted(pe);
    var cont = container(pe);
    var ls = parseFloat(ps.letterSpacing) || 0;
    var f = { size: fs, letterSpacing: ls, wordSpacing: parseFloat(ps.wordSpacing) || 0, mono: fontClass(ps.fontFamily) === 'mono',
      justify: String(cs(cont).textAlign).indexOf('justify') === 0 };

    // Text cut short with an ellipsis shows only the part that fits, then
    // the ellipsis: that is what is read.
    var cst = cs(cont);
    if (cst.textOverflow === 'ellipsis' && cst.overflowX !== 'visible' && area.x1 < Infinity) {
      var farRight = -Infinity;
      for (var fr = 0; fr < rects.length && fr < 400; fr++) farRight = Math.max(farRight, rects[fr].right);
      if (farRight + sx > area.x1 + 0.5) {
        var ew = 0;
        if (ctx) {
          ctx.font = ps.fontStyle + ' ' + ps.fontWeight + ' ' + ps.fontSize + ' ' + ps.fontFamily;
          ew = ctx.measureText('…').width;
        }
        var lo = 0, hi = data.length;
        while (lo < hi) {
          var mid = Math.ceil((lo + hi) / 2);
          range.setStart(node, 0);
          range.setEnd(node, mid);
          if (range.getBoundingClientRect().right + sx <= area.x1 - ew + 0.5) lo = mid;
          else hi = mid - 1;
        }
        data = data.slice(0, lo).replace(/\s+$/, '') + '…';
      }
    }
    // Whether this text can actually be seen is decided later, from the
    // screenshot: the page's own colours cannot say what is drawn on top.
    addTextTo(cont, applyTransform(data, ps.textTransform), lines, pe, over(col, paint.color), paint, f);
  }

  // ---------- generated content ----------
  // Text drawn by CSS (::before, ::after, list markers) is not in any text
  // node, but a person reads it like any other. For the walk, each such
  // piece is copied into a real element with the same computed style, in
  // the same place, and the original is switched off, so the layout does
  // not change; the copies are taken out again before the screenshot. A
  // copy that moves anything (a page rule such as :first-child now matching
  // something else) is taken out at once and that piece is not read.
  var gElementStyle = getter(HTMLElement.prototype, 'style');
  var gFirstElementChild = getter(Element.prototype, 'firstElementChild');
  var gLastElementChild = getter(Element.prototype, 'lastElementChild');
  var gNextElementSibling = getter(Element.prototype, 'nextElementSibling');
  var gPrevElementSibling = getter(Element.prototype, 'previousElementSibling');
  var sTextContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent').set;
  var mSetAttribute = Element.prototype.setAttribute;
  var mRemoveAttribute = Element.prototype.removeAttribute;
  var mInsertBefore = Node.prototype.insertBefore;
  var mAppendChild = Node.prototype.appendChild;
  var mRemoveChild = Node.prototype.removeChild;
  var mQueryAll = Element.prototype.querySelectorAll;
  var mSetProperty = CSSStyleDeclaration.prototype.setProperty;
  var GEN_ATTR = { before: 'data-grader-gb', after: 'data-grader-ga' };
  var NO_PSEUDO = { IMG: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, BR: 1, HR: 1, VIDEO: 1, CANVAS: 1, IFRAME: 1,
    OBJECT: 1, EMBED: 1, AUDIO: 1, PROGRESS: 1, METER: 1 };
  var BULLET = { disc: '•', circle: '◦', square: '▪', 'disclosure-closed': '▸', 'disclosure-open': '▾' };

  function repeatSel(a) { var out = ''; for (var i = 0; i < 5; i++) out += '[' + a + ']'; return out; }
  var GEN_CSS = repeatSel(GEN_ATTR.before) + '::before{content:none!important}' +
    repeatSel(GEN_ATTR.after) + '::after{content:none!important}';

  // The text a computed 'content' value draws, or null for none.
  function contentText(el, c) {
    c = String(c || '');
    if (c === '' || c === 'none' || c === 'normal') return null;
    var out = '';
    var re = /"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|attr\(\s*([^\s,)]+)[^)]*\)|(no-)?(open|close)-quote|(\/)|[a-z-]+\([^)]*\)|\S+/gi;
    var m;
    var n = 0;
    while ((m = re.exec(c)) && n++ < 50) {
      if (m[1] !== undefined) out += m[1].replace(/\\([\s\S])/g, '$1');
      else if (m[2] !== undefined) out += m[2].replace(/\\([\s\S])/g, '$1');
      else if (m[3] !== undefined) out += String(attr(el, m[3]) || '');
      else if (m[5] !== undefined) { if (!m[4]) out += m[5].toLowerCase() === 'open' ? '“' : '”'; }
      else if (m[6] !== undefined) break; // what follows is alternative text, not drawn
    }
    return out.slice(0, 500);
  }

  // A pseudo-element with no text that still draws a box (a rule, a dot).
  function drawsBox(ps) {
    if (parseColor(ps.backgroundColor)[3] >= 0.5) return true;
    var sides = ['Top', 'Right', 'Bottom', 'Left'];
    for (var i = 0; i < 4; i++) {
      var w = parseFloat(ps['border' + sides[i] + 'Width']) || 0;
      var st = ps['border' + sides[i] + 'Style'];
      if (w > 0 && st !== 'none' && st !== 'hidden' && parseColor(ps['border' + sides[i] + 'Color'])[3] > 0) return true;
    }
    return false;
  }

  function roman(n) {
    if (n <= 0 || n >= 4000) return String(n);
    var v = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    var syms = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
    var out = '';
    for (var i = 0; i < v.length; i++) while (n >= v[i]) { out += syms[i]; n -= v[i]; }
    return out;
  }
  function latin(n) {
    if (n <= 0) return String(n);
    var out = '';
    while (n > 0) { n--; out = String.fromCharCode(97 + (n % 26)) + out; n = Math.floor(n / 26); }
    return out;
  }

  // The number each list item shows, worked out once per list.
  var numCache = new Map();
  function listNumber(li) {
    var par = parentElement(li);
    if (!par) return 1;
    var map = numCache.get(par);
    if (!map) {
      map = new Map();
      var items = [];
      var c = firstChild(par);
      var guard = 0;
      while (c && guard++ < 5000) {
        if (nodeType(c) === 1 && String(cs(c).display).indexOf('list-item') >= 0) items.push(c);
        c = nextSibling(c);
      }
      var isOl = tagOf(par) === 'OL';
      var rev = isOl && attr(par, 'reversed') !== null;
      var start = isOl ? parseInt(attr(par, 'start'), 10) : NaN;
      var cur = isNaN(start) ? (rev ? items.length : 1) : start;
      for (var i = 0; i < items.length; i++) {
        var v = tagOf(items[i]) === 'LI' ? parseInt(attr(items[i], 'value'), 10) : NaN;
        if (!isNaN(v)) cur = v;
        map.set(items[i], cur);
        cur += rev ? -1 : 1;
      }
      numCache.set(par, map);
    }
    return map.has(li) ? map.get(li) : 1;
  }

  // The text of a list item's marker, followed by the space it is drawn with.
  function markerText(li, s, mk) {
    if (String(s.listStyleImage || 'none') !== 'none') return null;
    var c = String(mk.content || 'normal');
    if (c === 'none') return null;
    if (c !== 'normal') return contentText(li, c);
    var type = String(s.listStyleType || 'none');
    if (type === 'none') return null;
    var q = type.charAt(0);
    if (q === '"' || q === "'") return contentText(li, type);
    if (BULLET[type]) return BULLET[type] + ' ';
    var n = listNumber(li);
    var t;
    if (type === 'decimal') t = String(n);
    else if (type === 'decimal-leading-zero') t = (n >= 0 && n < 10 ? '0' : '') + n;
    else if (type === 'lower-alpha' || type === 'lower-latin') t = latin(n);
    else if (type === 'upper-alpha' || type === 'upper-latin') t = latin(n).toUpperCase();
    else if (type === 'lower-roman') t = roman(n);
    else if (type === 'upper-roman') t = roman(n).toUpperCase();
    else return null;
    return t + '. ';
  }

  // How a list item's own content starts: 'inline' text, a 'block', or nothing.
  function contentStart(li) {
    var c = firstChild(li);
    var guard = 0;
    while (c && guard++ < 50) {
      var t = nodeType(c);
      if (t === 3) {
        if (/\S/.test(gData.call(c))) return 'inline';
      } else if (t === 1) {
        var s = cs(c);
        var d = String(s.display);
        if (d !== 'none' && d !== 'contents' && s.position !== 'absolute' && s.position !== 'fixed' && s.cssFloat === 'none') {
          return d.indexOf('inline') === 0 ? 'inline' : 'block';
        }
      }
      c = nextSibling(c);
    }
    return 'empty';
  }

  function copyOf(ps, text) {
    var sp = mCreateElement.call(document, 'grader-gen');
    var st = gElementStyle.call(sp);
    for (var i = 0; i < ps.length && i < 1000; i++) {
      var name = ps[i];
      if (name === 'content') continue;
      mSetProperty.call(st, name, ps.getPropertyValue(name), 'important');
    }
    sTextContent.call(sp, text);
    return sp;
  }

  function markerCopy(li, s, mk, text) {
    var sp = mCreateElement.call(document, 'grader-gen');
    var st = gElementStyle.call(sp);
    var set = function (k, v) { mSetProperty.call(st, k, v, 'important'); };
    var shown = text.replace(/ /g, ' ');
    var w = 0;
    if (ctx) {
      ctx.font = mk.fontStyle + ' ' + mk.fontWeight + ' ' + mk.fontSize + ' ' + mk.fontFamily;
      w = ctx.measureText(shown).width;
    }
    // Laid in line before text that starts the item, taking no room (its
    // negative margin equals its width). Otherwise placed absolutely, which
    // never moves anything: before a block that starts the item, or over a
    // marker drawn inside the item, which stays where it is.
    var inline = s.listStylePosition !== 'inside' && contentStart(li) === 'inline';
    if (!inline) shown = shown.replace(/ +$/, '');
    set('display', 'inline');
    set('position', inline ? 'static' : 'absolute');
    set('margin', '0');
    set('margin-left', r1(-w) + 'px');
    set('padding', '0');
    set('border', 'none');
    set('background', 'none');
    set('float', 'none');
    set('transform', 'none');
    set('white-space', 'pre');
    set('text-transform', 'none');
    set('color', mk.color);
    set('font-style', mk.fontStyle);
    set('font-weight', mk.fontWeight);
    set('font-size', mk.fontSize);
    set('font-family', mk.fontFamily);
    sTextContent.call(sp, shown);
    return sp;
  }

  function rectSig(el) {
    var r = mGetRect.call(el);
    return [r.left, r.top, r.width, r.height];
  }
  function edgeChild(host, last, skip) {
    var c = last ? gLastElementChild.call(host) : gFirstElementChild.call(host);
    var guard = 0;
    while (c && skip.has(c) && guard++ < 10) c = last ? gPrevElementSibling.call(c) : gNextElementSibling.call(c);
    return c;
  }
  function layoutSig(host, skip) {
    var out = rectSig(host);
    var f = edgeChild(host, false, skip);
    var l = edgeChild(host, true, skip);
    if (f) out = out.concat(rectSig(f));
    if (l && l !== f) out = out.concat(rectSig(l));
    return out;
  }
  function sameSig(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 0.5) return false;
    return true;
  }

  var plans = [];
  var genNodes = new Set();
  var genStyle = null;

  function undoPlan(p) {
    for (var i = 0; i < p.nodes.length; i++) {
      var nd = p.nodes[i];
      var par = parentNode(nd);
      if (par) mRemoveChild.call(par, nd);
      genNodes.delete(nd);
    }
    for (var j = 0; j < p.attrs.length; j++) mRemoveAttribute.call(p.host, p.attrs[j]);
    p.nodes = [];
    p.attrs = [];
  }

  function addGenerated() {
    var hosts = [body];
    var all = mQueryAll.call(body, '*');
    for (var i = 0; i < all.length && i < 8000; i++) hosts.push(all[i]);
    for (var h = 0; h < hosts.length && plans.length < 200; h++) {
      var el = hosts[h];
      if (!(el instanceof HTMLElement)) continue;
      var tag = tagOf(el);
      if (SKIP[tag] || NO_PSEUDO[tag]) continue;
      var s = cs(el);
      if (s.display === 'none') continue;
      var plan = null;
      var sides = ['before', 'after'];
      for (var w = 0; w < 2; w++) {
        var ps = getComputedStyle(el, '::' + sides[w]);
        if (ps.display === 'none') continue;
        var text = contentText(el, ps.content);
        if (text === null) continue;
        if (!/\S/.test(text) && !drawsBox(ps)) continue;
        if (!plan) plan = { host: el, before: null, after: null, marker: null, nodes: [], attrs: [], sig: null };
        plan[sides[w]] = { ps: ps, text: text };
      }
      if (String(s.display).indexOf('list-item') >= 0) {
        var mk = getComputedStyle(el, '::marker');
        var mt = markerText(el, s, mk);
        if (mt && /\S/.test(mt)) {
          if (!plan) plan = { host: el, before: null, after: null, marker: null, nodes: [], attrs: [], sig: null };
          plan.marker = { mk: mk, text: mt, s: s };
        }
      }
      if (plan) plans.push(plan);
    }
    if (plans.length === 0) return;
    // Where everything sits before the copies go in (one layout).
    for (var a = 0; a < plans.length; a++) plans[a].sig = layoutSig(plans[a].host, genNodes);
    genStyle = mCreateElement.call(document, 'style');
    sTextContent.call(genStyle, GEN_CSS);
    mAppendChild.call(root, genStyle);
    for (var b = 0; b < plans.length; b++) {
      var p = plans[b];
      var host = p.host;
      if (p.after) {
        var an = copyOf(p.after.ps, p.after.text);
        mSetAttribute.call(host, GEN_ATTR.after, '');
        p.attrs.push(GEN_ATTR.after);
        mAppendChild.call(host, an);
        p.nodes.push(an);
      }
      if (p.before) {
        var bn = copyOf(p.before.ps, p.before.text);
        mSetAttribute.call(host, GEN_ATTR.before, '');
        p.attrs.push(GEN_ATTR.before);
        mInsertBefore.call(host, bn, firstChild(host));
        p.nodes.push(bn);
      }
      if (p.marker) {
        var mc = markerCopy(host, p.marker.s, p.marker.mk, p.marker.text);
        mInsertBefore.call(host, mc, firstChild(host));
        p.nodes.push(mc);
      }
      for (var k = 0; k < p.nodes.length; k++) genNodes.add(p.nodes[k]);
    }
    // Anything that moved: put it back as it was.
    var moved = [];
    for (var c = 0; c < plans.length; c++) {
      if (!sameSig(plans[c].sig, layoutSig(plans[c].host, genNodes))) moved.push(plans[c]);
    }
    for (var d = 0; d < moved.length; d++) undoPlan(moved[d]);
  }

  function removeGenerated() {
    for (var i = 0; i < plans.length; i++) undoPlan(plans[i]);
    if (genStyle) {
      var par = parentNode(genStyle);
      if (par) mRemoveChild.call(par, genStyle);
      genStyle = null;
    }
  }

  try {
    addGenerated();

    var node = advance(body, false);
    while (node && !full()) {
      var skipChildren = false;
      var type = nodeType(node);
      if (type === 1) skipChildren = handleElement(node);
      else if (type === 3) handleText(node);
      node = advance(node, skipChildren);
    }

    for (var gi = 0; gi < groupOrder.length; gi++) {
      var g = groupOrder[gi];
      var text = g.parts.join('').replace(/\s+/g, ' ').trim();
      if (!text || !g.styleEl) continue;
      var gTone = toneOf(g.styleEl);
      blocks.push({
        kind: 'text',
        rect: { x: r1(g.x0), y: r1(g.y0), w: r1(g.x1 - g.x0), h: r1(g.y1 - g.y0) },
        lines: g.lines,
        role: roleOf(g.styleEl),
        behind: g.behind,
        sample: g.sample,
        alpha: gTone.a,
        altered: gTone.f,
        text: text,
        textStyle: textStyleOf(g.styleEl, g.cont, g.shown)
      });
    }
  } finally {
    removeGenerated();
  }

  var page = painted(body);
  return {
    docHeight: Math.max(root ? gScrollHeight.call(root) : 0, gScrollHeight.call(body)),
    pageBackground: page.color,
    samplePageBackground: page.image,
    truncated: full(),
    blocks: blocks
  };
})
`;
