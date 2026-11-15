// Page tools for promptdyno frames: a ruler and a magnifier.
// createTools() returns a group. group.attach(frameEl, viewport) adds a layer to a frame that holds
// one iframe at the real viewport, scaled to the frame width. group.bind(container) wires the
// [data-tool="ruler"|"mag"] buttons in it. group.link(a, b) mirrors two layers. One tool at a time.

const LENS = 220;
const ZOOM = 3;

function el(cls, tag = 'div') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function makeLayer(frameEl, viewport, group) {
  const vp = { width: viewport.width || 1280, height: viewport.height || 800 };
  const ov = el('tool-ov');
  ov.hidden = true;
  const cx = el('tool-cx');
  const cy = el('tool-cy');
  const tip = el('tool-tip');
  const rect = el('tool-rect');
  const rtip = el('tool-tip');
  rect.appendChild(rtip);
  const lens = el('tool-lens');
  const lensFrame = document.createElement('iframe');
  lensFrame.setAttribute('sandbox', 'allow-same-origin');
  lensFrame.setAttribute('aria-hidden', 'true');
  lensFrame.tabIndex = -1;
  lensFrame.title = 'Magnified page';
  lensFrame.style.width = vp.width + 'px';
  lensFrame.style.height = vp.height + 'px';
  lens.appendChild(lensFrame);
  lens.hidden = true;
  ov.append(rect, cx, cy, tip);
  frameEl.appendChild(ov);
  // The lens lives in a fixed overlay on <body> so small frames never clip it.
  document.body.appendChild(lens);
  let lensKey = null;

  const iframe = () => frameEl.querySelector(':scope > iframe');
  const scale = () => (frameEl.clientWidth || 1) / vp.width;
  function scroll() {
    try {
      const w = iframe().contentWindow;
      return { x: w.scrollX || 0, y: w.scrollY || 0 };
    } catch {
      return { x: 0, y: 0 };
    }
  }
  function toReal(clientX, clientY) {
    const r = frameEl.getBoundingClientRect();
    const s = r.width / vp.width;
    const sc = scroll();
    const x = Math.min(vp.width, Math.max(0, (clientX - r.left) / s));
    const y = Math.min(vp.height, Math.max(0, (clientY - r.top) / s));
    return { x: Math.round(x + sc.x), y: Math.round(y + sc.y) };
  }
  function toLocal(p) {
    const s = scale();
    const sc = scroll();
    return { x: (p.x - sc.x) * s, y: (p.y - sc.y) * s };
  }
  function hide(...els) { els.forEach((e) => { e.hidden = true; }); }

  const layer = {
    frameEl,
    setMode(mode) {
      ov.hidden = !mode;
      ov.classList.toggle('mag', mode === 'mag');
      layer.hidePointer();
      if (mode !== 'ruler') layer.clearRect();
    },
    hidePointer() { hide(cx, cy, tip, lens); },
    showCross(p) {
      const l = toLocal(p);
      cx.hidden = cy.hidden = tip.hidden = false;
      cx.style.left = Math.round(l.x) + 'px';
      cy.style.top = Math.round(l.y) + 'px';
      tip.textContent = `x ${p.x}  y ${p.y}`;
      const w = frameEl.clientWidth;
      const h = frameEl.clientHeight;
      const tw = tip.offsetWidth || 90;
      tip.style.left = (l.x + 10 + tw > w ? l.x - 10 - tw : l.x + 10) + 'px';
      tip.style.top = (l.y + 30 > h ? l.y - 26 : l.y + 10) + 'px';
    },
    showRect(a, b) {
      const la = toLocal(a);
      const lb = toLocal(b);
      rect.hidden = false;
      rect.style.left = Math.min(la.x, lb.x) + 'px';
      rect.style.top = Math.min(la.y, lb.y) + 'px';
      rect.style.width = Math.abs(lb.x - la.x) + 'px';
      rect.style.height = Math.abs(lb.y - la.y) + 'px';
      rtip.textContent = `${Math.abs(b.x - a.x)} x ${Math.abs(b.y - a.y)}`;
      const below = Math.max(la.y, lb.y) + 24 < frameEl.clientHeight;
      rtip.style.top = below ? '100%' : 'auto';
      rtip.style.bottom = below ? 'auto' : '100%';
    },
    clearRect() { rect.hidden = true; },
    hasRect() { return !rect.hidden; },
    showLens(p) {
      const f = iframe();
      if (!f) return;
      const key = f.hasAttribute('srcdoc') ? 'doc:' + f.srcdoc : 'src:' + f.getAttribute('src');
      if (key !== lensKey) {
        lensKey = key;
        if (f.hasAttribute('srcdoc')) { lensFrame.removeAttribute('src'); lensFrame.srcdoc = f.srcdoc; }
        else { lensFrame.removeAttribute('srcdoc'); lensFrame.src = f.getAttribute('src'); }
      }
      const sc = scroll();
      try { lensFrame.contentWindow.scrollTo(sc.x, sc.y); } catch { /* not ready */ }
      const l = toLocal(p);
      const r = frameEl.getBoundingClientRect();
      const L = scale() * ZOOM;
      lens.hidden = false;
      lens.style.left = r.left + l.x - LENS / 2 + 'px';
      lens.style.top = r.top + l.y - LENS / 2 + 'px';
      lensFrame.style.transform = `translate(${LENS / 2 - (p.x - sc.x) * L}px, ${LENS / 2 - (p.y - sc.y) * L}px) scale(${L})`;
    },
  };

  let drag = null;
  ov.addEventListener('pointerdown', (e) => {
    if (group.mode !== 'ruler' || e.button !== 0) return;
    e.preventDefault();
    ov.setPointerCapture(e.pointerId);
    drag = toReal(e.clientX, e.clientY);
    group.each(layer, (x) => x.clearRect());
  });
  ov.addEventListener('pointermove', (e) => {
    const p = toReal(e.clientX, e.clientY);
    if (group.mode === 'ruler') {
      group.each(layer, (x) => x.showCross(p));
      if (drag) group.each(layer, (x) => x.showRect(drag, p));
    } else if (group.mode === 'mag') {
      group.each(layer, (x) => x.showLens(p));
    }
  });
  const end = (e) => {
    if (!drag) return;
    const p = toReal(e.clientX, e.clientY);
    if (Math.abs(p.x - drag.x) < 2 && Math.abs(p.y - drag.y) < 2) group.each(layer, (x) => x.clearRect());
    drag = null;
  };
  ov.addEventListener('pointerup', end);
  ov.addEventListener('pointercancel', end);
  ov.addEventListener('pointerleave', () => { if (!drag) group.each(layer, (x) => x.hidePointer()); });
  return layer;
}

export function createTools() {
  const layers = [];
  const buttons = new Set();
  const partner = new Map();

  const group = {
    mode: null,
    attach(frameEl, viewport) {
      const layer = makeLayer(frameEl, viewport || {}, group);
      layers.push(layer);
      layer.setMode(group.mode);
      return layer;
    },
    bind(container) {
      container.querySelectorAll('[data-tool]').forEach((b) => {
        buttons.add(b);
        b.setAttribute('aria-pressed', String(b.dataset.tool === group.mode));
        b.addEventListener('click', () => group.setMode(group.mode === b.dataset.tool ? null : b.dataset.tool));
      });
    },
    link(a, b) { partner.set(a, b); partner.set(b, a); },
    // Runs fn on the layer and on its mirrored partner.
    each(layer, fn) {
      fn(layer);
      const p = partner.get(layer);
      if (p && p.frameEl.offsetParent) fn(p);
    },
    setMode(mode) {
      group.mode = mode || null;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === group.mode)));
      layers.forEach((l) => l.setMode(group.mode));
    },
    // Esc: clear a ruler rectangle first, otherwise turn the tool off. Returns true if it did something.
    escape() {
      if (!group.mode) return false;
      const withRect = layers.filter((l) => l.hasRect());
      if (withRect.length) withRect.forEach((l) => l.clearRect());
      else group.setMode(null);
      return true;
    },
  };
  return group;
}
