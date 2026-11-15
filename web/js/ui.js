// promptdyno UI helpers. Plain ES module, no dependencies.

// Escape text for innerHTML.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Level number to tag colour class, as in v8 (Lv 1 deep red, Lv 2 to 4 red, Lv 5 peach, 6 and up white).
export function levelClass(level) {
  const n = Number(level) || 1;
  if (n <= 1) return 'd';
  if (n <= 4) return 'r';
  if (n === 5) return 'p';
  return 'w';
}

// Dropdown: opens on click, closes on outside click and Esc, sets aria-expanded, arrow keys move focus.
export function dropdown(buttonEl, menuEl) {
  if (!buttonEl || !menuEl) return { open() {}, close() {} };
  if (!menuEl.id) menuEl.id = 'dd-' + Math.random().toString(36).slice(2, 8);
  buttonEl.setAttribute('aria-haspopup', 'true');
  buttonEl.setAttribute('aria-controls', menuEl.id);
  buttonEl.setAttribute('aria-expanded', 'false');
  menuEl.hidden = true;

  const items = () => Array.from(menuEl.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select'));
  const isOpen = () => !menuEl.hidden;

  function open(focusFirst) {
    menuEl.hidden = false;
    buttonEl.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    if (focusFirst) { const f = items()[0]; if (f) f.focus(); }
  }
  function close(returnFocus) {
    if (!isOpen()) return;
    menuEl.hidden = true;
    buttonEl.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    if (returnFocus) buttonEl.focus();
  }
  function onOutside(e) {
    if (!menuEl.contains(e.target) && !buttonEl.contains(e.target)) close(false);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const list = items();
    if (!list.length) return;
    e.preventDefault();
    let i = list.indexOf(document.activeElement);
    if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = list.length - 1;
    else if (e.key === 'ArrowDown') i = i < 0 ? 0 : (i + 1) % list.length;
    else i = i <= 0 ? list.length - 1 : i - 1;
    list[i].focus();
  }

  buttonEl.addEventListener('click', () => (isOpen() ? close(false) : open(false)));
  buttonEl.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !isOpen()) { e.preventDefault(); open(true); }
  });
  return { open: () => open(false), close: () => close(false) };
}

// Tabs or pills: children with role="tab", aria-pressed, or plain a/button. onChange(index, el).
export function tabs(containerEl, onChange) {
  if (!containerEl) return { select() {} };
  const list = () => Array.from(containerEl.querySelectorAll(':scope > a, :scope > button'));
  const usePressed = containerEl.classList.contains('pills');
  if (!usePressed) containerEl.setAttribute('role', 'tablist');

  function select(i, fire = true) {
    const els = list();
    els.forEach((el, j) => {
      const on = j === i;
      el.classList.toggle('on', on);
      if (usePressed) el.setAttribute('aria-pressed', String(on));
      else { el.setAttribute('role', 'tab'); el.setAttribute('aria-selected', String(on)); el.tabIndex = on ? 0 : -1; }
    });
    if (fire && onChange) onChange(i, els[i]);
  }
  list().forEach((el, i) => {
    el.addEventListener('click', (e) => { if (el.getAttribute('href') === '#' || !el.getAttribute('href')) e.preventDefault(); select(i); });
  });
  containerEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const els = list();
    const cur = els.indexOf(document.activeElement);
    if (cur < 0) return;
    const next = (cur + (e.key === 'ArrowRight' ? 1 : -1) + els.length) % els.length;
    els[next].focus();
    select(next);
  });
  const start = list().findIndex((el) => el.classList.contains('on') || el.getAttribute('aria-pressed') === 'true');
  select(start < 0 ? 0 : start, false);
  return { select };
}

// Quiet inline note. Writes into .toast-slot (or a given element), never over content.
export function toast(message, { slot, ms = 3200 } = {}) {
  const host = slot || document.querySelector('.toast-slot');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.replaceChildren(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, ms);
}

// Scale the 1280 x 800 goal page inside every .frame to the frame width, whole and without scrollbars.
export function fitFrames(root = document) {
  const frames = root.querySelectorAll('.frame');
  const fit = (f) => {
    const m = f.querySelector(':scope > iframe, :scope > img, :scope > .mock');
    if (m && f.clientWidth) m.style.transform = `scale(${f.clientWidth / (m.offsetWidth || 1280)})`;
  };
  // A goal preview never scrolls: no scrollbar inside the frame in any browser.
  const noScroll = (fr) => {
    try { const d = fr.contentDocument; if (d && d.documentElement) d.documentElement.style.overflow = 'hidden'; } catch { /* other origin: scrolling="no" still applies */ }
  };
  frames.forEach((f) => {
    const fr = f.querySelector(':scope > iframe');
    if (!fr) return;
    fr.setAttribute('scrolling', 'no');
    fr.addEventListener('load', () => noScroll(fr));
    noScroll(fr);
  });
  const ro = new ResizeObserver((es) => es.forEach((e) => fit(e.target)));
  frames.forEach((f) => { ro.observe(f); fit(f); });
}

// Editable editor: one number per line of the prompt, set against the first row of that line even
// when it wraps. Each line's wrapped height is measured in a hidden copy of the textarea.
export function lineNumbers(editorEl) {
  const ta = editorEl && editorEl.querySelector('textarea');
  const gutter = editorEl && editorEl.querySelector('.gutter');
  if (!ta || !gutter) return;
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;padding:0;border:0';
  document.body.appendChild(mirror);
  let width = 0;
  const sync = () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    const cs = getComputedStyle(ta);
    width = ta.clientWidth;
    const inner = width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const lines = ta.value.split('\n');
    if (inner <= 0) return;
    mirror.style.width = inner + 'px';
    mirror.style.font = cs.font;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.tabSize = cs.tabSize;
    mirror.innerHTML = lines.map((l) => `<div>${esc(l) || '&#8203;'}</div>`).join('');
    const hs = Array.from(mirror.children, (d) => d.getBoundingClientRect().height);
    gutter.innerHTML = hs.map((h, i) => `<span style="height:${h}px">${i + 1}</span>`).join('');
  };
  ta.addEventListener('input', sync);
  // Re-measure when the width changes (window resize, panel shown).
  new ResizeObserver(() => { if (ta.clientWidth !== width) sync(); }).observe(ta);
  sync();
}

// Stat or cell value: words ("None yet", "Not tried") are set in sans, numbers stay mono.
export function setStat(el, value) {
  if (!el) return;
  const t = String(value);
  el.textContent = t;
  el.classList.toggle('is-word', !/\d/.test(t));
}

// Phones: tapping a page frame opens that page at full size in a simple in-page viewer.
export function frameViewer(frameEls) {
  const phone = window.matchMedia('(max-width:760px)');
  frameEls.forEach((f) => f && f.addEventListener('click', () => {
    if (!phone.matches) return;
    const src = f.querySelector(':scope > iframe');
    if (!src) return;
    const panel = f.closest('.panel');
    const prev = f.previousElementSibling || (f.parentElement && f.parentElement.previousElementSibling);
    let lbl = 'Page';
    if (prev && prev.classList.contains('frame-lbl')) {
      const c = prev.cloneNode(true);
      c.querySelectorAll('.lvl').forEach((t) => t.remove());
      lbl = c.textContent.trim();
    } else if (panel && panel.querySelector('.panel-head .h')) lbl = panel.querySelector('.panel-head .h').textContent.trim();
    const back = document.activeElement;
    const box = document.createElement('div');
    box.className = 'fv';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', lbl + ' at full size');
    box.innerHTML = `<div class="fv-bar"><span class="h">${esc(lbl)}</span><button type="button" class="btn btn-secondary sm">Close</button></div><div class="fv-scroll"><iframe sandbox="allow-same-origin" title="${esc(lbl)} at full size"></iframe></div>`;
    const fr = box.querySelector('iframe');
    if (src.hasAttribute('srcdoc')) fr.srcdoc = src.srcdoc; else fr.src = src.getAttribute('src') || 'about:blank';
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey, true); if (back && back.focus) back.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    box.querySelector('button').addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(box);
    box.querySelector('button').focus();
  }));
}

// Simulated data labels. One wording for the whole site; show them only when api.isSimulated() says so.
export const SIM_NOTE = 'Preview build: generation and scoring are simulated';
export const DEMO_TAG = 'Demo data';
// Small tag for a panel header: "Demo data".
export function demoTag() {
  return `<span class="demo-tag" title="Made-up players and scores for the preview build">${DEMO_TAG}</span>`;
}
// Quiet one-line note: the preview-build sentence.
export function simNote() {
  return `<p class="sim-note">${SIM_NOTE}</p>`;
}
// Same quiet note while real results come from the stand-in scorer (api.isProvisional()).
export const PROVISIONAL_NOTE = 'Provisional scoring until the full grader is connected';
export function provisionalNote() {
  return `<p class="sim-note">${PROVISIONAL_NOTE}</p>`;
}
// Board panel header tag while boards use stand-in scores (api.isProvisional('boards')); '' otherwise.
// mixed: the board's rows come from more than one grader version (api.isProvisional('versions')).
export function provisionalTag(on, mixed = false) {
  return (on ? `<span class="demo-tag" title="Scored by the stand-in until the full grader is connected">Provisional scores</span>` : '') +
    (mixed ? `<span class="demo-tag" title="Some rows were scored by an older grader">Scores from more than one grader version</span>` : '');
}

// Scores go from 0 to 120 with one decimal: "92", "112.5". Shows a decimal only when there is one.
export function fmtScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// Small tag for a challenge kind other than a web page ("Doc", "Site", ...); '' for page.
const KIND_LABEL = { doc: 'Doc', site: 'Site', scene: 'Scene', workflow: 'Workflow' };
export function kindTag(kind) {
  if (!kind || kind === 'page') return '';
  return `<span class="mtag kind-tag">${esc(KIND_LABEL[kind] || kind)}</span>`;
}
