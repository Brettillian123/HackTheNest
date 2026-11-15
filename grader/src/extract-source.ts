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
  var NO_TEXT_INPUT = { hidden: 1, checkbox: 1, radio: 1, range: 1, color: 1, file: 1, image: 1, password: 1 };

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

  function addTextTo(cont, text, rect, styleEl, shown, paint) {
    var g = groups.get(cont);
    if (!g) {
      g = { parts: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, longest: 0,
        styleEl: null, shown: null, behind: null, sample: false, cont: cont };
      groups.set(cont, g);
      groupOrder.push(g);
    }
    g.parts.push(text);
    if (rect.x < g.x0) g.x0 = rect.x;
    if (rect.y < g.y0) g.y0 = rect.y;
    if (rect.x + rect.w > g.x1) g.x1 = rect.x + rect.w;
    if (rect.y + rect.h > g.y1) g.y1 = rect.y + rect.h;
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
    var rect = { x: r1(b.left + sx), y: r1(b.top + sy), w: r1(b.width), h: r1(b.height) };
    if (!onPage(rect)) return IMAGE[tag] ? true : false;
    var s = cs(el);
    var behind = painted(parentElement(el));

    if (IMAGE[tag]) {
      if (rect.w >= 4 && rect.h >= 4) {
        blocks.push({ kind: 'image', rect: rect, behind: behind.color, sample: behind.image });
      }
      return true;
    }

    // A box is anything with a background, border or shadow you can see.
    if (el !== body && rect.w * rect.h >= 16) {
      var bg = parseColor(s.backgroundColor);
      var hasImage = !!s.backgroundImage && s.backgroundImage !== 'none';
      var own = bg[3] > 0 ? over(bg, behind.color) : behind.color;
      var bgSeen = hasImage || (bg[3] > 0 && (behind.image || differs(own, behind.color, 4)));

      var sides = ['Top', 'Right', 'Bottom', 'Left'];
      var borderW = 0;
      var borderC = null;
      for (var i = 0; i < sides.length; i++) {
        var w = parseFloat(s['border' + sides[i] + 'Width']) || 0;
        var st = s['border' + sides[i] + 'Style'];
        if (w > 0 && st !== 'none' && st !== 'hidden') {
          var c = parseColor(s['border' + sides[i] + 'Color']);
          if (c[3] > 0) {
            var cc = over(c, own);
            if (differs(cc, own, 4) && w > borderW) {
              borderW = w;
              borderC = cc;
            }
          }
        }
      }
      var shadow = !!s.boxShadow && s.boxShadow !== 'none';

      if (bgSeen || borderW > 0 || shadow) {
        blocks.push({
          kind: 'box',
          rect: rect,
          behind: behind.color,
          sample: behind.image,
          box: {
            background: own,
            fill: bgSeen,
            sampleBackground: hasImage || (bg[3] <= 0 && behind.image),
            hasBorder: borderW > 0,
            borderColor: borderC,
            radius: radiusOf(s, rect),
            shadow: shadow
          }
        });
      }
    }

    // Form fields show text that is not a text node.
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      var shownText = '';
      if (tag === 'SELECT') {
        var chosen = gSelectedOptions.call(el);
        shownText = chosen && chosen.length > 0 ? gOptionText.call(chosen[0]) : '';
      } else if (tag === 'TEXTAREA') {
        shownText = gTextAreaValue.call(el) || attr(el, 'placeholder') || '';
      } else {
        var type = String(attr(el, 'type') || 'text').toLowerCase();
        if (!NO_TEXT_INPUT[type]) shownText = gInputValue.call(el) || attr(el, 'placeholder') || '';
      }
      shownText = String(shownText).replace(/\s+/g, ' ').trim();
      if (shownText) {
        var fieldPaint = painted(el);
        var fieldColor = over(parseColor(s.color), fieldPaint.color);
        blocks.push({
          kind: 'text',
          rect: rect,
          behind: fieldPaint.color,
          sample: fieldPaint.image,
          text: shownText,
          textStyle: textStyleOf(el, el, fieldColor)
        });
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

    range.selectNodeContents(node);
    var rects = range.getClientRects();
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
    for (var k = 0; k < rects.length; k++) {
      var q = rects[k];
      if (q.width < 0.5 || q.height < 0.5) continue;
      any = true;
      if (q.left < x0) x0 = q.left;
      if (q.top < y0) y0 = q.top;
      if (q.right > x1) x1 = q.right;
      if (q.bottom > y1) y1 = q.bottom;
    }
    if (!any) return;
    var tr = { x: r1(x0 + sx), y: r1(y0 + sy), w: r1(x1 - x0), h: r1(y1 - y0) };
    if (!onPage(tr)) return;

    var ps = cs(pe);
    if ((parseFloat(ps.fontSize) || 0) < 4) return;
    var col = parseColor(ps.color);
    if (col[3] <= 0.05) return;
    var paint = painted(pe);
    // Whether this text can actually be seen is decided later, from the
    // screenshot: the page's own colours cannot say what is drawn on top.
    addTextTo(container(pe), applyTransform(data, ps.textTransform), tr, pe, over(col, paint.color), paint);
  }

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
    blocks.push({
      kind: 'text',
      rect: { x: r1(g.x0), y: r1(g.y0), w: r1(g.x1 - g.x0), h: r1(g.y1 - g.y0) },
      behind: g.behind,
      sample: g.sample,
      text: text,
      textStyle: textStyleOf(g.styleEl, g.cont, g.shown)
    });
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
