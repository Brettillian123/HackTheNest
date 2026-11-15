import type { Page } from 'playwright';
import { GATHER_TIMEOUT_MS } from './config';
import type { DomFacts } from './types';

/**
 * In-page code that returns plain facts (a DomFacts object) about the page.
 *
 * Rules for this string, all learned the hard way:
 * - plain ES2020, no backticks, no dollar-brace, passed as a string so no
 *   build tool rewrites it;
 * - no DOM-invoked callbacks (page scripts are off, the browser refuses them);
 * - every page node is read through the browser's own prototype methods and
 *   getters, because a page can make its own elements lie (<img name="body">,
 *   <input name="getAttribute"> inside a form);
 * - every loop is capped.
 */
export const QUALITY_SOURCE = String.raw`(function () {
  var CAP = 3000;
  var EXAMPLES = 5;
  var D = Document.prototype, E = Element.prototype, N = Node.prototype, H = HTMLElement.prototype;
  function getter(proto, name) {
    var d = Object.getOwnPropertyDescriptor(proto, name);
    return d && d.get ? d.get : null;
  }
  var gDocEl = getter(D, 'documentElement');
  var gTitle = getter(D, 'title');
  var gText = getter(N, 'textContent');
  var gInner = getter(H, 'innerText');
  var gLocal = getter(E, 'localName');
  var gLabels = {
    input: getter(HTMLInputElement.prototype, 'labels'),
    select: getter(HTMLSelectElement.prototype, 'labels'),
    textarea: getter(HTMLTextAreaElement.prototype, 'labels')
  };
  var qsa = D.querySelectorAll, byId = D.getElementById;
  var getAttr = E.getAttribute, rects = E.getClientRects, bcr = E.getBoundingClientRect;
  var closest = E.closest, elQsa = E.querySelectorAll;
  var gcs = window.getComputedStyle;
  var doc = document;
  var out = {
    elementCount: 0, lang: null, title: '',
    images: { checked: 0, withoutDescription: 0, examples: [] },
    fields: { checked: 0, withoutLabel: 0, examples: [] },
    controls: { checked: 0, withoutName: 0, examples: [] },
    headingLevels: [], placeholders: [], truncated: false, errors: 0
  };

  function attr(el, n) { var v = getAttr.call(el, n); return v === null ? null : String(v); }
  function filled(v) { return v !== null && v !== undefined && String(v).replace(/\s+/g, '').length > 0; }
  function tag(el) { return String(gLocal.call(el)); }
  function short(v) { v = v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); return v.length > 60 ? v.slice(0, 57) + '...' : v; }
  function hidden(el) {
    var cs = gcs.call(window, el);
    if (!cs) return true;
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return true;
    return closest.call(el, '[aria-hidden="true"]') !== null;
  }
  function rendered(el) { return rects.call(el).length > 0 && !hidden(el); }
  function sized(el) { var r = bcr.call(el); return r.width >= 1 && r.height >= 1 && !hidden(el); }
  function textOf(el) {
    var t = null;
    try { t = gInner.call(el); } catch (e) { t = gText.call(el); }
    return t === null || t === undefined ? '' : String(t);
  }
  function labelledBy(el) {
    var v = attr(el, 'aria-labelledby');
    if (!filled(v)) return false;
    var ids = v.split(/\s+/);
    for (var i = 0; i < ids.length && i < 10; i++) {
      if (!ids[i]) continue;
      var t = byId.call(doc, ids[i]);
      if (t && filled(gText.call(t))) return true;
    }
    return false;
  }
  function ownName(el) { return filled(attr(el, 'aria-label')) || labelledBy(el) || filled(attr(el, 'title')); }
  function describe(el) {
    var id = attr(el, 'id'), nm = attr(el, 'name'), src = attr(el, 'src'), href = attr(el, 'href');
    var s = tag(el);
    if (filled(id)) s += '#' + short(id);
    else if (filled(nm)) s += ' name=' + short(nm);
    else if (filled(src)) s += ' ' + short(src);
    else if (filled(href)) s += ' ' + short(href);
    return s;
  }

  try {
    var all = qsa.call(doc, '*');
    out.elementCount = all.length;
  } catch (e) { out.errors++; }

  try {
    var root = gDocEl.call(doc);
    if (root) {
      var lang = attr(root, 'lang');
      if (!filled(lang)) lang = attr(root, 'xml:lang');
      out.lang = filled(lang) ? short(lang) : null;
    }
    var title = gTitle.call(doc);
    out.title = short(title);
  } catch (e) { out.errors++; }

  try {
    var imgs = qsa.call(doc, 'img, input[type="image" i]');
    if (imgs.length > CAP) out.truncated = true;
    for (var i = 0; i < imgs.length && i < CAP; i++) {
      var im = imgs[i];
      out.images.checked++;
      if (!rendered(im)) continue;
      var role = (attr(im, 'role') || '').toLowerCase();
      if (role === 'presentation' || role === 'none') continue;
      if (attr(im, 'alt') !== null) continue;
      if (ownName(im)) continue;
      out.images.withoutDescription++;
      if (out.images.examples.length < EXAMPLES) out.images.examples.push(describe(im));
    }
  } catch (e) { out.errors++; }

  try {
    var fields = qsa.call(doc, 'input, select, textarea');
    if (fields.length > CAP) out.truncated = true;
    for (var j = 0; j < fields.length && j < CAP; j++) {
      var f = fields[j];
      var ft = tag(f);
      if (ft === 'input') {
        var type = (attr(f, 'type') || 'text').toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'reset' || type === 'button' || type === 'image') continue;
      }
      out.fields.checked++;
      if (!rendered(f)) continue;
      var ph = attr(f, 'placeholder');
      if (filled(ph) && out.placeholders.length < CAP) out.placeholders.push(ph.trim().replace(/\s+/g, ' ').slice(0, 200));
      if (ownName(f) || filled(attr(f, 'placeholder'))) continue;
      var labelled = false;
      var gl = gLabels[ft];
      var ls = gl ? gl.call(f) : null;
      if (ls) {
        for (var k = 0; k < ls.length && k < 5; k++) {
          if (filled(textOf(ls[k]))) { labelled = true; break; }
        }
      }
      if (labelled) continue;
      out.fields.withoutLabel++;
      if (out.fields.examples.length < EXAMPLES) out.fields.examples.push(describe(f));
    }
  } catch (e) { out.errors++; }

  try {
    var ctrls = qsa.call(doc, 'a[href], button, [role="button"], [role="link"], input[type="button" i], input[type="submit" i], input[type="reset" i]');
    if (ctrls.length > CAP) out.truncated = true;
    for (var c = 0; c < ctrls.length && c < CAP; c++) {
      var el = ctrls[c];
      out.controls.checked++;
      if (!sized(el)) continue;
      var named = false;
      if (tag(el) === 'input') {
        var it = (attr(el, 'type') || '').toLowerCase();
        var val = attr(el, 'value');
        named = filled(val) || (it !== 'button' && val === null) || ownName(el);
      } else {
        named = ownName(el) || filled(textOf(el));
        if (!named) {
          var inner = elQsa.call(el, 'img, input[type="image" i], svg title, [aria-label], [title]');
          for (var m = 0; m < inner.length && m < 20; m++) {
            var x = inner[m];
            var xt = tag(x);
            if ((xt === 'img' || xt === 'input') && filled(attr(x, 'alt'))) { named = true; break; }
            if (xt === 'title' && filled(gText.call(x))) { named = true; break; }
            if (filled(attr(x, 'aria-label')) || filled(attr(x, 'title'))) { named = true; break; }
          }
        }
      }
      if (named) continue;
      out.controls.withoutName++;
      if (out.controls.examples.length < EXAMPLES) out.controls.examples.push(describe(el));
    }
  } catch (e) { out.errors++; }

  try {
    var hs = qsa.call(doc, 'h1, h2, h3, h4, h5, h6');
    if (hs.length > CAP) out.truncated = true;
    for (var h = 0; h < hs.length && h < CAP && out.headingLevels.length < 500; h++) {
      if (!rendered(hs[h])) continue;
      out.headingLevels.push(Number(tag(hs[h]).charAt(1)));
    }
  } catch (e) { out.errors++; }

  return out;
})()`;

/** Run QUALITY_SOURCE in a loaded page, giving up after `timeoutMs`. */
export async function gatherDomFacts(page: Page, timeoutMs: number = GATHER_TIMEOUT_MS): Promise<DomFacts> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Checking the page took longer than ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return (await Promise.race([page.evaluate(QUALITY_SOURCE), timeout])) as DomFacts;
  } finally {
    clearTimeout(timer);
  }
}
