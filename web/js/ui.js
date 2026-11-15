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

// Scale 960x600 content inside every .frame to the frame width (as v8 does).
export function fitFrames(root = document) {
  const frames = root.querySelectorAll('.frame');
  const fit = (f) => {
    const m = f.querySelector(':scope > iframe, :scope > img, :scope > .mock');
    if (m && f.clientWidth) m.style.transform = `scale(${f.clientWidth / 960})`;
  };
  const ro = new ResizeObserver((es) => es.forEach((e) => fit(e.target)));
  frames.forEach((f) => { ro.observe(f); fit(f); });
}

// Editable editor: keeps the line-number gutter in step with the textarea and grows it.
export function lineNumbers(editorEl) {
  const ta = editorEl && editorEl.querySelector('textarea');
  const gutter = editorEl && editorEl.querySelector('.gutter');
  if (!ta || !gutter) return;
  const sync = () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    const n = Math.max(1, ta.value.split('\n').length);
    if (gutter.children.length !== n) gutter.innerHTML = Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join('');
  };
  ta.addEventListener('input', sync);
  sync();
}

// Simulated data labels. One wording for the whole site; show them only when api.isSimulated() says so.
export const SIM_NOTE = 'Preview build: page generation and scoring are simulated until the server is connected.';
export const DEMO_TAG = 'Demo data';
// Small tag for a panel header: "Demo data".
export function demoTag() {
  return `<span class="demo-tag" title="These players and scores are made up for the preview build.">${DEMO_TAG}</span>`;
}
// Quiet one-line note: the preview-build sentence.
export function simNote() {
  return `<p class="sim-note">${SIM_NOTE}</p>`;
}
