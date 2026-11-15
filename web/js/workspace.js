// promptdyno workspace page: goal, prompt, run, score, runs. Plain ES module.
import * as api from './api.js';
import * as store from './store.js';
import { mountShell, shellUser } from './shell.js';
import { dropdown, tabs, esc, levelClass, lineNumbers, demoTag, simNote, setStat, frameViewer, provisionalNote, provisionalTag, fmtScore, kindTag, costLabel } from './ui.js';
import { renderMarkdown } from './markdown.js';
import { createTools } from './tools.js';

const slug = new URLSearchParams(location.search).get('c') || 'login-card';
const $ = (id) => document.getElementById(id);
const MINUS = '−';

const S = {
  ch: null,
  attempt: null,
  mode: 'idle', // idle | generating | grading | scored | refine | stopped
  view: 'workspace', // workspace | runs
  model: null,
  ctrl: null,
  stage: -1,
  runN: 1,
  status: '',
  sel: null, // selected run number in the Runs view
  confirm: false,
  statusBad: false, // status is an error (red) rather than a note
  useRun: null, // run whose prompt was put back in the editor with "Use this prompt"
  ins: false, // instructions column open
  sim: false, // preview-build note showing
  statusLink: null, // { href, label } after the status line (Buy credits, Sign up)
  user: null, // the signed-in player, or null
};

const ta = $('prompt');
const tools = createTools();
const layers = {};
let modelDd = null;
let confirmTimer = null;

// ---------------------------------------------------------------- frames

// A frame takes all the space of its slot: the page is scaled to fit the viewport inside the slot
// (never smaller), shown from the top, and the iframe is as tall as the slot so a tall page scrolls
// inside it at that readable scale. Phones: full width, viewport height.
const phoneMq = window.matchMedia('(max-width:760px)');
function fitFrame(frameEl) {
  const vp = S.ch ? S.ch.viewport : { width: 1280, height: 800 };
  const f = frameEl.querySelector(':scope > iframe');
  const slot = frameEl.parentElement;
  if (!f || !slot || !slot.clientWidth) return;
  const B = 2; // frame border
  const w = slot.clientWidth - B;
  let scale = w / vp.width;
  let h = vp.height * scale;
  if (!phoneMq.matches) {
    const sh = slot.clientHeight - B;
    if (sh <= 0) return;
    scale = Math.min(scale, sh / vp.height);
    h = sh;
  }
  frameEl.style.aspectRatio = 'auto';
  frameEl.style.width = Math.floor(vp.width * scale + B) + 'px';
  frameEl.style.height = Math.floor(h + B) + 'px';
  f.style.width = vp.width + 'px';
  f.style.height = Math.ceil(h / scale) + 'px';
  f.style.transform = `scale(${scale})`;
  if (frameEl.id === 'goalFrame') updateHint();
}

// "Scroll to see the whole page" shows only when the goal is taller than its frame.
function updateHint() {
  const f = $('goalFrame').querySelector('iframe');
  let tall = false;
  try {
    const d = f.contentDocument;
    tall = !!(d && d.documentElement && d.documentElement.scrollHeight > parseFloat(f.style.height || '0') + 4);
  } catch { tall = false; }
  const hint = $('goalHint');
  if (hint.hidden === tall) hint.hidden = !tall;
}

function setupFrames() {
  const vp = S.ch.viewport;
  $('page').style.setProperty('--vw', vp.width);
  $('page').style.setProperty('--vh', vp.height);
  const ids = ['goalFrame', 'mineFrame', 'goalSmall', 'mineSmall'];
  const ro = new ResizeObserver((es) => es.forEach((e) => { const fr = e.target.querySelector(':scope > .frame'); if (fr) fitFrame(fr); }));
  ids.forEach((id) => {
    const fr = $(id);
    ro.observe(fr.parentElement);
    fitFrame(fr);
    layers[id] = tools.attach(fr, vp);
  });
  tools.link(layers.goalSmall, layers.mineSmall);
  document.querySelectorAll('.tools').forEach((g) => tools.bind(g));
  frameViewer(ids.map($));
  $('goalFrame').querySelector('iframe').addEventListener('load', updateHint);
  if (S.ch.goalUrl) {
    $('goalFrame').querySelector('iframe').src = S.ch.goalUrl;
    $('goalSmall').querySelector('iframe').src = S.ch.goalUrl;
  }
  document.querySelectorAll('[data-big]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openBig(b.dataset.big, b); }));
}

// Full-size view over the workspace: matte backdrop, Close, Esc and backdrop click close it, focus goes
// back to the button. After scoring a Goal / Your page switch flips the two in place.
function openBig(which, btn) {
  const vp = S.ch.viewport;
  const canMine = !$('comparePanel').hidden && !isDoc();
  const LBL = { goal: 'Goal page', mine: 'Your page' };
  const box = document.createElement('div');
  box.className = 'ws-big';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Page at full size');
  box.innerHTML = `<div class="ws-big-box"><div class="ws-big-bar"><h2 class="h ws-big-t"></h2>` +
    (canMine ? '<div class="ws-big-sw" role="group" aria-label="Page on show"><button type="button" class="btn sm" data-w="goal">Goal</button><button type="button" class="btn sm" data-w="mine">Your page</button></div>' : '') +
    '<button type="button" class="btn btn-secondary sm ws-big-close">Close</button></div><div class="ws-big-body"><div class="ws-big-frame"><iframe sandbox="allow-same-origin"></iframe></div></div></div>';
  const fr = box.querySelector('iframe');
  const body = box.querySelector('.ws-big-body');
  const holder = box.querySelector('.ws-big-frame');
  const fit = () => {
    const w = body.clientWidth;
    const h = body.clientHeight;
    if (!w || !h) return;
    const scale = phoneMq.matches ? w / vp.width : Math.min(w / vp.width, h / vp.height);
    holder.style.width = Math.floor(vp.width * scale) + 'px';
    holder.style.height = h + 'px';
    fr.style.width = vp.width + 'px';
    fr.style.height = Math.ceil(h / scale) + 'px';
    fr.style.transform = `scale(${scale})`;
  };
  const showPage = (w) => {
    which = w;
    box.querySelector('.ws-big-t').textContent = LBL[w];
    fr.title = LBL[w] + ' at full size';
    fr.removeAttribute('src');
    fr.removeAttribute('srcdoc');
    if (w === 'goal') fr.src = S.ch.goalUrl || 'about:blank';
    else fr.srcdoc = $('mineSmall').querySelector('iframe').getAttribute('srcdoc') || '';
    box.querySelectorAll('[data-w]').forEach((b) => {
      const on = b.dataset.w === w;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('btn-primary', on);
      b.classList.toggle('btn-secondary', !on);
    });
  };
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', fit);
    if (btn && btn.focus) btn.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  box.querySelector('.ws-big-close').addEventListener('click', close);
  box.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.w)));
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', fit);
  document.body.appendChild(box);
  showPage(which === 'mine' && canMine ? 'mine' : 'goal');
  fit();
  box.querySelector('.ws-big-close').focus();
}

// The brief (or instructions) must be read: until it has been opened once for this challenge the
// button is the red primary one and a hint points at it. Remembered per challenge.
const seenKey = () => 'promptdyno:briefSeen:' + slug;
function readSeen() { try { return localStorage.getItem(seenKey()) === '1'; } catch { return false; } }
function markSeen() { S.seen = true; try { localStorage.setItem(seenKey(), '1'); } catch { /* storage blocked */ } }
const briefWord = () => (isBrief() ? 'brief' : 'instructions');

// ---------------------------------------------------------------- doc challenges
// A doc challenge has no goal page: the left panel shows the brief and what the grader looks for,
// and the model's answer is Markdown rendered to safe DOM nodes (never as HTML).
// Text kinds have no goal page: a written document, or an agent plan (shown as a JSON block).
const isDoc = () => !!(S.ch && (S.ch.kind === 'doc' || S.ch.kind === 'workflow'));
const docText = (t) => (S.ch && S.ch.kind === 'workflow' && t && !/^\s*```/.test(t) ? '```json\n' + t + '\n```' : t || '');
function setupDoc() {
  ['goalFrame', 'mineFrame'].forEach((id) => { $(id).hidden = true; });
  $('goalBig').hidden = true;
  document.querySelectorAll('#goalPanel .tools, #minePanel .tools, #comparePanel .tools').forEach((t) => { t.hidden = true; });
  $('cmpPair').hidden = true;
  ['goalDoc', 'mineDoc', 'cmpDoc'].forEach((id) => { $(id).hidden = false; });
  $('goalTitle').textContent = 'The task';
  $('mineTitle').textContent = 'Your answer';
  $('prompt').placeholder = 'Describe what the model should write to meet the task';
  $('hViewportTag').hidden = true;
  const crit = S.ch.criteria || [];
  $('goalDoc').innerHTML = `<p class="ws-doc-brief">${esc(S.ch.brief)}</p>` +
    (crit.length ? `<h3 class="h">What the grader looks for</h3><ul class="ws-doc-crit">${crit.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '');
}
// The model output on show while running: a page in the frame, or Markdown for a doc.
// A 3D challenge: the model writes code, shown as text; after scoring the grader's four views replace it.
const isScene = () => !!(S.ch && S.ch.kind === 'scene');
function codePage(code) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#15171c;color:#d7dae0;font:15px/1.5 "Courier New",monospace}pre{margin:0;white-space:pre-wrap;word-break:break-word}p{color:#8b90a0;font-family:Arial,sans-serif;margin:0 0 14px}</style></head><body><p>The model's code. Score it to see the 3D model.</p><pre>${esc(code || '')}</pre></body></html>`;
}
function showMine(text) {
  if (isScene()) setDoc('mineFrame', /^<!doctype html>/i.test(text || '') ? text : codePage(text));
  else if (isDoc()) renderMarkdown($('mineDoc'), docText(text));
  else setDoc('mineFrame', text || '');
}
function outputOf(run) {
  if (isScene()) return (run.result && run.result.viewsHtml) || run.markdown || '';
  return isDoc() ? run.markdown || '' : run.html || '';
}

function setDoc(frameId, html) {
  const f = $(frameId).querySelector('iframe');
  const v = html || '';
  if (f.getAttribute('srcdoc') !== v) f.srcdoc = v;
}

// Streamed HTML: update srcdoc at most every 200 ms, always keep the last part.
let pending = null;
let flushTimer = null;
let lastFlush = 0;
function pushHtml(h) {
  // Keep the neutral placeholder until the page's styles are in, so the frame never flashes white.
  if (!isDoc() && !isScene() && !/<body[\s>]/i.test(h)) return;
  pending = h;
  const wait = 200 - (performance.now() - lastFlush);
  if (wait <= 0) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, wait);
}
function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (pending == null) return;
  showMine(pending);
  lastFlush = performance.now();
  pending = null;
}

// ---------------------------------------------------------------- header, leaderboard, menus

function renderHeader() {
  const c = S.ch;
  $('hLevel').className = 'lvl ' + levelClass(c.level);
  $('hLevel').textContent = 'Lv ' + c.level;
  $('hTitle').textContent = c.title;
  $('hSolved').textContent = `${Number(c.solvedCount || 0).toLocaleString('en-US')} players solved`;
  $('hViewport').textContent = `${c.viewport.width} x ${c.viewport.height}`;
  setStat($('hBest'), c.yourBest == null ? 'None yet' : fmtScore(c.yourBest));
  setStat($('hTop'), c.topScore == null ? 'None yet' : fmtScore(c.topScore));
  $('hKind').innerHTML = kindTag(c.kind);
  const m = c.models.find((x) => x.id === S.model) || c.models[0];
  $('modelLabel').textContent = m.label;
  document.title = c.title + ' - promptdyno';
}

async function renderBoard() {
  const list = $('lbList');
  try {
    // The same all-time board the score panel's rank comes from, so the two always agree.
    const lb = await api.getLeaderboard(slug, { period: 'all' });
    $('lbNote').textContent = 'All time';
    $('lbDemo').innerHTML = api.isSimulated('boards') ? demoTag() : provisionalTag(api.isProvisional('boards'), api.isProvisional('versions'));
    let rows = lb.rows.slice(0, 4);
    const you = lb.rows.find((r) => r.isYou);
    if (you && !rows.includes(you)) rows = rows.slice(0, 3).concat(you);
    const gap = (r, i) => i > 0 && r.rank > rows[i - 1].rank + 1;
    list.innerHTML = rows.length
      ? rows.map((r, i) => `<li class="${r.isYou ? 'you' : ''}${gap(r, i) ? ' gap' : ''}"><span class="pos">#${r.rank}</span><span class="nm">${esc(r.username)}</span><span class="s">${fmtScore(r.score)}</span></li>`).join('')
      : '<li><span class="nm">No scores yet, yours can be first</span></li>';
  } catch {
    list.innerHTML = '<li><span class="nm">Leaderboard did not load, reload the page to try again</span></li>';
  }
}

// Instructions: a dropdown under the page panel's header button, overlaying the panel without moving
// the goal frame. Closed on load; closes on outside click, Esc, a run, or the ruler or magnifier.
// A brief-format challenge shows the Brief in it: the brief, the acceptance statements and the given content.
const isBrief = () => !!(S.ch && S.ch.format === 'brief' && !isDoc());
function closeIns() { if (S.ins) { S.ins = false; render(); } }
function renderInstructions() {
  $('insBtn').addEventListener('click', () => { S.ins = !S.ins; if (S.ins) markSeen(); render(); });
  $('startHint').addEventListener('click', (e) => { e.stopPropagation(); S.ins = true; markSeen(); render(); });
  document.addEventListener('click', (e) => {
    if (!S.ins || !e.target.isConnected) return;
    if (e.target.closest('.tool') || !e.target.closest('#insMenu, #insDd')) closeIns();
  });
  if (isBrief()) { setupBrief(); return; }
  const groups = S.ch.spec.map((g) =>
    `<h4 class="ws-ins-group">${esc(g.group)}</h4><dl>` +
    g.items.map((i) => `<div><dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd></div>`).join('') + '</dl>').join('');
  $('insMenu').innerHTML = `<h3 class="h">Match these exactly</h3><div class="ws-ins-cols">${groups}</div>`;
}

function setupBrief() {
  $('insMenu').setAttribute('aria-label', 'Brief');
  $('insMenu').classList.add('ws-brief');
  $('goalTitle').insertAdjacentHTML('afterend', '<span class="note ws-goal-cap">Scored on how close you get to this</span>');
  ta.placeholder = 'Describe how to build the goal page with the given content';
}

// The Brief column: the brief, what done looks like, and the content the model is given (read-only).
// A section with nothing in it (older or lesson data) is left out.
function renderBrief() {
  const c = S.ch;
  const done = (Array.isArray(c.acceptance) ? c.acceptance : []).filter(Boolean);
  const content = typeof c.content === 'string' ? c.content.trim() : '';
  $('insMenu').innerHTML =
    (c.brief ? `<h3 class="h">The brief</h3><p class="ws-brief-p">${esc(c.brief)}</p>` : '') +
    (done.length ? `<h3 class="h ws-brief-h">Done when</h3><ul class="ws-done">${done.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '') +
    `<p class="note ws-built">${isScene() ? 'Keep the model light: no more detail than the shape needs' : 'We care how it is built, not only how it looks: it should work on a phone, be usable with a keyboard and a screen reader, and carry nothing it does not need'}</p>` +
    (content ? `<h3 class="h ws-brief-h">The model is given this content</h3><p class="note ws-content-note">You do not need to repeat it in your prompt</p><pre class="ws-content" tabindex="0" aria-label="Content the model is given">${esc(content)}</pre>` : '');
}

function renderModels() {
  const menu = $('modelMenu');
  menu.innerHTML = S.ch.models.map((m) =>
    `<button class="dd-item" role="menuitemradio" aria-checked="${m.id === S.model}" data-id="${esc(m.id)}">${esc(m.label)}</button>`).join('');
  menu.querySelectorAll('.dd-item').forEach((b) => b.addEventListener('click', () => {
    S.model = b.dataset.id;
    store.write('model', S.model);
    menu.querySelectorAll('.dd-item').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    renderHeader();
    modelDd.close();
    $('modelBtn').focus();
  }));
  if (!modelDd) modelDd = dropdown($('modelBtn'), menu);
}

// ---------------------------------------------------------------- pieces

const OK_SVG = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2"><path d="M1.5 5.2l2.3 2.3 4.7-5"/></svg>';
const NO_SVG = '<svg viewBox="0 0 10 10" stroke="currentColor" stroke-width="2"><path d="M2 2l6 6M8 2L2 8"/></svg>';

// Points a problem cost. The grader sends no figure for most page problems (and puts it in the
// sentence for 3D ones), so a problem with no figure shows a dot, never a misleading -0.
function lost(c) {
  let p = Number(c.points) || 0;
  if (!p) { const m = /([0-9]+(?:\.[0-9]+)?) points? lost/.exec(c.message || ''); if (m) p = Number(m[1]); }
  return p > 0 ? MINUS + fmtScore(p) : '•';
}
function signed(n) { return (n >= 0 ? '+' : MINUS) + fmtScore(Math.abs(n)); }
function sortedCosts(r) { return (r.costs || []).slice().sort((a, b) => b.points - a.points); }
function topCosts(r) { return sortedCosts(r).slice(0, 3); }
const COST_ROWS = 3; // rows the score panel has room for at 1280 x 800
function miniCosts(r) {
  const cs = topCosts(r);
  return cs.length
    ? cs.map((c) => `<div class="ws-mini"><span class="pt">${lost(c)}</span><span>${esc(c.message)}</span></div>`).join('')
    : '<div class="ws-mini none">No points lost on this run</div>';
}

function renderCompare(run) {
  $('cmpNote').textContent = 'Run ' + run.n;
  $('cmpTag').textContent = run.n;
  if (isDoc()) renderMarkdown($('cmpDoc'), docText(run.markdown) || 'This answer was not kept on this device');
  else setDoc('mineSmall', (isScene() ? (run.result && run.result.viewsHtml) || codePage(run.markdown) : run.html) || '<p style="font:14px sans-serif;padding:24px">This run\'s page was not kept on this device</p>');
  // The grader's report card says what to change in the prompt; older results keep the checks list.
  const crit = run.result.criteria;
  $('checksTitle').textContent = crit && crit.length ? 'Report card' : 'Checks';
  $('checkList').hidden = !!(crit && crit.length);
  $('reportCard').hidden = !(crit && crit.length);
  if (crit && crit.length) { $('reportCard').innerHTML = reportCard(crit); return; }
  const checks = (run.result.checks || []).slice().sort((a, b) => Number(a.passed) - Number(b.passed));
  $('checkList').innerHTML = checks.map((c) =>
    `<li class="${c.passed ? 'ok' : 'no'}"><span class="m">${c.passed ? OK_SVG : NO_SVG}</span>${esc(c.label)}</li>`).join('');
}

const GROUPS = [['works', 'It works'], ['looks', 'Looks like the goal'], ['engineering', 'Well engineered']];
const pct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
function reportCard(crit) {
  return GROUPS.map(([g, label]) => {
    const items = crit.filter((c) => c.group === g);
    if (!items.length) return '';
    return `<div class="rc-group"><h4 class="rc-h">${label}</h4>` + items.map((c) =>
      `<div class="rc-item"><div class="rc-top"><span class="rc-name">${esc(c.name)}</span>` +
      (c.points > 0 ? `<span class="rc-lost">${MINUS}${fmtScore(c.points)}</span>` : '') +
      (c.value == null ? '<span class="rc-na">n/a</span>' : `<span class="meter sm" aria-hidden="true"><i style="width:${pct(c.value * 100)}%"></i></span><span class="rc-v">${pct(c.value * 100)}</span>`) +
      `</div>${(c.notes || []).slice(0, 3).map((n) => `<p class="rc-note">${esc(n)}</p>`).join('')}</div>`).join('') + '</div>';
  }).join('');
}

const DECIDED = { efficiency: 'size and speed', size: 'size and speed', speed: 'size and speed', accessibility: 'accessibility', cleanCode: 'clean code', clean_code: 'clean code', 'clean code': 'clean code' };
function renderPillars(r) {
  const P = $('scPillars');
  P.hidden = !(r.pillars && r.pillars.length) || !!r.rejectedReason;
  if (P.hidden) { P.innerHTML = ''; return; }
  const by = r.engineering && r.engineering.decidedBy;
  P.innerHTML = r.pillars.map((p) =>
    `<div class="pl"><div class="pl-top"><span class="pl-k">${esc(p.label)}</span><span class="pl-v">${p.value == null ? 'n/a' : fmtScore(p.value)}</span></div>` +
    `<span class="meter" aria-hidden="true"><i style="width:${pct(p.value)}%"></i></span>` +
    (p.id === 'engineering' && by ? `<span class="pl-note">Decided by ${esc(DECIDED[by] || by)}</span>` : '') + '</div>').join('');
}

function renderScore(run) {
  const r = run.result;
  const rejected = !!r.rejectedReason;
  $('scN').textContent = rejected ? '0' : fmtScore(r.total);
  const bonus = !rejected && r.total > 100 ? (r.bonus > 0 ? r.bonus : r.total - 100) : 0;
  $('scBonus').hidden = !bonus;
  $('scBonus').textContent = bonus ? `Bonus +${fmtScore(bonus)}` : '';
  renderPillars(r);
  $('scGain').textContent = r.delta == null ? 'Run 1' : `${signed(r.delta)} pts`;
  const rk = r.rank;
  let rankText = '';
  if (rk && rk.before && rk.after && rk.before !== rk.after) rankText = `Rank #${rk.before} to #${rk.after}`;
  else if (rk && rk.after) rankText = `Rank #${rk.after}`;
  const vs = r.delta == null ? '' : `vs run ${run.n - 1}`;
  $('scRk').textContent = [vs, rankText].filter(Boolean).join(', ');
  const total = r.totalChecks ?? (r.checks || []).length;
  // At 100 or more the bar is full.
  const passed = r.total >= 100 && !rejected ? total : r.passedCount ?? (r.checks || []).filter((c) => c.passed).length;
  const seg = $('scSeg');
  seg.style.setProperty('--n', Math.max(1, total));
  seg.innerHTML = Array.from({ length: total }, (_, i) => (i < passed ? '<i></i>' : '<i class="x"></i>')).join('');
  $('scCap').innerHTML = `<b>${passed} of ${total}</b> checks passed`;
  $('scRun').textContent = 'Run ' + run.n;
  // Every cost when they fit; otherwise the biggest ones and one row with the rest, which opens Runs.
  const all = sortedCosts(r);
  const shown = all.length <= COST_ROWS ? all : all.slice(0, COST_ROWS - 1);
  const rest = all.slice(shown.length);
  const restPts = rest.reduce((s, c) => s + c.points, 0);
  $('scCosts').innerHTML = all.length
    ? shown.map((c) => `<div class="cost"><span class="pt">${lost(c)}</span><span class="w">${esc(c.message)}</span></div>`).join('') +
      (rest.length ? `<button type="button" class="cost more" id="moreCosts"><span class="pt">${restPts > 0 ? MINUS + fmtScore(restPts) : '+'}</span><span class="w">${rest.length} more ${rest.length === 1 ? 'cost' : 'costs'}<small>See every cost in Runs</small></span></button>` : '')
    : '<div class="cost"><span class="w">No points lost on this run</span></div>';
  const more = $('moreCosts');
  if (more) more.addEventListener('click', () => { S.sel = run.n; viewTabs.select(1); });
  $('scNoteText').innerHTML = rejected
    ? `<b>The grader could not mark this page:</b> ${esc(r.rejectedReason)}`
    : r.intentGraded
    ? 'Marked on meeting the brief, not on matching the picture'
    : isBrief()
    ? (S.ch.level >= 2 ? 'Higher levels are much harder, 70 or more is solid here' : '80 to 90 is a solid score')
    : bonus
    ? `<b>A perfect match, leaner than the goal: +${fmtScore(bonus)} bonus</b>`
    : r.total >= 100
    ? '<b>A perfect 100, worth keeping</b>'
    : '<b>A perfect 100 is rare</b>, the 80s and 90s mean a strong prompt';
}

function renderRuns() {
  const runs = S.attempt ? S.attempt.runs : [];
  $('runsNote').textContent = runs.length ? `${runs.length} prompt${runs.length === 1 ? '' : 's'} used` : '';
  $('runsEmpty').hidden = runs.length > 0;
  $('runDetail').hidden = !runs.length;
  $('histList').hidden = !runs.length;
  if (!runs.length) return;
  if (!runs.find((r) => r.n === S.sel)) S.sel = runs[runs.length - 1].n;
  $('histList').innerHTML = runs.slice().reverse().map((r) => {
    const d = r.result.delta == null ? '' : `<small>${signed(r.result.delta)}</small>`;
    return `<button class="hist${r.n === S.sel ? ' on' : ''}" role="option" aria-selected="${r.n === S.sel}" data-n="${r.n}"><span class="hist-n">#${r.n}</span><span class="hist-x">${esc(r.prompt)}</span><span class="hist-s">${fmtScore(r.result.total)}${d}</span></button>`;
  }).join('');
  $('histList').querySelectorAll('.hist').forEach((b) => b.addEventListener('click', () => { S.sel = Number(b.dataset.n); render(); }));
  const run = runs.find((r) => r.n === S.sel);
  $('rdTag').textContent = run.n;
  $('rdScore').textContent = fmtScore(run.result.total);
  $('rdDelta').textContent = run.result.delta == null ? 'First prompt of this attempt' : `${signed(run.result.delta)} pts vs run ${run.n - 1}`;
  // Every cost of the selected run; its prompt shows on the left under the checks.
  const all = (run.result.costs || []).slice().sort((a, b) => b.points - a.points);
  $('rdCosts').innerHTML = all.length
    ? all.map((c) => `<div class="cost"><span class="pt">${lost(c)}</span><span class="w">${esc(c.message)}</span></div>`).join('')
    : '<div class="cost"><span class="w">No points lost on this run</span></div>';
}

function setStatus(text, bad = false, link = null) { S.status = text || ''; S.statusBad = !!(text && bad); S.statusLink = text ? link : null; }

// ---------------------------------------------------------------- prompt length limit
// maxPromptChars comes with the challenge; 2000 when the server does not send it.
const LIMIT_MSG = 'Prompt limit reached';
function promptLimit() {
  const n = Number(S.ch && S.ch.maxPromptChars);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2000;
}
function renderCount() {
  const max = promptLimit();
  const n = ta.value.length;
  const el = $('charCount');
  el.textContent = `${n.toLocaleString('en-US')} / ${max.toLocaleString('en-US')}`;
  el.classList.toggle('near', n >= max * 0.95);
}
// Clips a value set from code (draft, saved run), shows the limit line on a clip, clears it below the limit.
function enforceLimit(clipped = false) {
  const max = promptLimit();
  ta.maxLength = max;
  if (ta.value.length > max) { ta.value = ta.value.slice(0, max); clipped = true; }
  renderCount();
  if (clipped && S.status !== LIMIT_MSG) { setStatus(LIMIT_MSG); render(); }
  else if (!clipped && S.status === LIMIT_MSG && ta.value.length < max) { setStatus(''); render(); }
}

// ---------------------------------------------------------------- render

function show(id, on) { $(id).hidden = !on; }

function render() {
  const runs = S.attempt ? S.attempt.runs : [];
  const last = runs[runs.length - 1];
  const m = S.mode;
  const ws = S.view === 'workspace';
  const busy = m === 'generating' || m === 'grading';
  const live = busy || m === 'stopped';
  const compare = ws ? (m === 'scored' || m === 'refine') && !!last : runs.length > 0;

  show('goalPanel', ws ? (m === 'idle' || (m === 'refine' && !last)) : !runs.length);
  show('lbPanel', ws ? m === 'idle' || (m === 'refine' && !last) : !runs.length);
  show('minePanel', ws && live);
  show('stagePanel', ws && live);
  show('comparePanel', compare);
  const promptWasHidden = $('promptPanel').hidden;
  // After scoring the editor stays on screen under the score, holding the submitted prompt.
  show('promptPanel', ws);
  $('promptPanel').classList.toggle('ws-after', ws && m === 'scored');
  // The editor sizes itself from scrollHeight, which is 0 while hidden: resize it once it shows.
  if (promptWasHidden && !$('promptPanel').hidden) ta.dispatchEvent(new Event('input'));
  show('scorePanel', ws && m === 'scored');
  show('runsPanel', !ws);

  // Instructions menu lives in whichever page panel is showing.
  const host = [ 'goalPanel', 'comparePanel' ].map($).find((p) => !p.hidden);
  const dd = $('insDd');
  const ins = $('insMenu');
  if (host) {
    const slot = host.querySelector('.dd-slot'); if (dd.parentNode !== slot) slot.appendChild(dd);
    if (ins.parentNode !== host) host.appendChild(ins);
  }
  dd.hidden = !host;
  if (!host) S.ins = false;
  ['goalPanel', 'comparePanel'].forEach((id) => {
    $(id).classList.toggle('ins-open', S.ins && $(id) === host);
    $(id).classList.toggle('ins-brief', isBrief());
  });
  if (isBrief() && S.ins) renderBrief();
  $('insBtn').setAttribute('aria-expanded', String(S.ins));
  // Not opened yet for this challenge: red button, "Read the brief", and the start hint.
  const unread = !S.seen && !isDoc();
  $('insBtn').classList.toggle('btn-primary', unread);
  $('insBtn').classList.toggle('btn-secondary', !unread);
  $('insLabel').textContent = unread ? 'Read the ' + briefWord() : isBrief() ? 'Brief' : 'Instructions';
  $('startHint').textContent = 'Start here: read the ' + briefWord();
  show('startHint', unread && !!host && ws && !busy);

  const used = S.attempt ? S.attempt.promptCount ?? runs.length : 0; // an unscored saved page counts too
  $('runCount').textContent = used;
  $('usedA').textContent = used;

  // prompt panel
  $('mineNote').textContent = 'Run ' + S.runN;
  $('runBtn').disabled = busy || (S.ch && S.ch.available === false);
  $('runBtn').classList.toggle('busy', busy);
  $('runLabel').innerHTML = busy ? 'Running' : S.attempt && S.attempt.pending ? 'Score this page' : last ? 'Run again<small>adds 1 prompt</small>' : 'Run prompt';
  show('cancelBtn', busy);
  // Start over is there whenever the attempt has used a prompt, not only right after a score.
  show('overBtn', !busy && ((m === 'scored' && !!last) || !!(S.attempt && (S.attempt.promptCount > 0 || S.attempt.pending))));
  show('adjustBtn', !busy && m === 'scored' && !!last);
  show('backBtn', m === 'refine' && !!last);
  const st = $('status');
  st.textContent = S.status;
  if (S.status && S.statusLink) {
    const a = document.createElement('a');
    a.href = S.statusLink.href;
    a.className = 'ws-status-link';
    a.textContent = S.statusLink.label;
    st.append(' ', a);
  }
  // What the next prompt costs (scoring a saved page is free).
  const costText = S.ch && !(S.attempt && S.attempt.pending) ? costLabel(S.ch.cost) : '';
  $('costNext').textContent = costText;
  show('costBox', !!costText);
  st.hidden = !S.status;
  st.classList.toggle('bad', S.statusBad);
  $('simRun').hidden = !S.sim || !!S.status;
  // While refining: the run being built on (the last one, or the one picked with "Use this prompt").
  const base = (S.useRun && runs.find((r) => r.n === S.useRun)) || last;
  show('lastBox', m === 'refine' && !!base);
  if (m === 'refine' && base) {
    $('lastLbl').textContent = base === last ? 'Last run' : `Run ${base.n}`;
    $('lastScore').textContent = fmtScore(base.result.total);
    $('lastCosts').innerHTML = miniCosts(base.result);
  }

  // stages
  // One tight row: what is happening now, then the four scoring steps.
  $('stageNote').textContent = m === 'grading' ? 'Grading run ' + S.runN : m === 'stopped' ? 'Page saved, not scored yet' : 'Writing your page';
  $('stageList').innerHTML = api.STAGES.map((s, i) =>
    `<li class="${i < S.stage ? 'done' : i === S.stage && m === 'grading' ? 'on' : ''}">${esc(s.label)}</li>`).join('');

  if (ws && compare && base) renderCompare(base);
  if (ws && m === 'scored' && last) renderScore(last);
  if (!ws) {
    renderRuns();
    const run = runs.find((r) => r.n === S.sel);
    if (run) renderCompare(run);
  }
  resetConfirm(false);
}

// ---------------------------------------------------------------- actions

async function doRun() {
  if (S.ctrl) return;
  const prompt = ta.value;
  const unscored = S.attempt && S.attempt.pending; // a saved page with no score: score it, do not generate again
  if (!unscored && !prompt.trim()) {
    if (S.mode === 'scored') S.mode = 'refine';
    setStatus('Write a prompt first', true);
    render();
    ta.focus();
    return;
  }
  const runs = S.attempt ? S.attempt.runs : [];
  S.ctrl = new AbortController();
  S.mode = 'generating';
  S.view = 'workspace';
  viewTabs.select(0, false);
  S.stage = -1;
  S.runN = unscored ? unscored.n : (S.attempt ? S.attempt.promptCount ?? runs.length : 0) + 1;
  S.useRun = null;
  S.ins = false;
  tools.setMode(null);
  setStatus('');
  // Never blocks the run; says it once.
  if (!S.seen && !isDoc() && !S.briefWarned) { S.briefWarned = true; setStatus('You have not read the ' + briefWord()); }
  pending = null;
  showMine(unscored ? outputOf(unscored) : '');
  render();
  try {
    const onStage = (s) => { flush(); S.mode = 'grading'; S.stage = s.index; render(); };
    const { attempt } = await (unscored ? api.scoreRun({ slug, signal: S.ctrl.signal, onStage }) : api.run({
      slug, prompt, model: S.model, signal: S.ctrl.signal,
      onHtml: (h) => pushHtml(h),
      onStage,
    }));
    flush();
    S.attempt = attempt;
    S.mode = 'scored';
    setStatus('');
    delete ta.dataset.ended;
    S.stage = api.STAGES.length;
    renderSim(api.isSimulated('run'));
    S.ch = { ...S.ch, ...(await api.getChallenge(slug)) };
    renderHeader();
    api.me().then((u) => { S.user = u; if (u) mountShell({ active: 'challenges', user: shellUser(u), crumb: [{ label: 'Challenges', href: 'challenges.html' }, { label: S.ch.title }] }); }).catch(() => {});
    renderBoard();
  } catch (e) {
    flush();
    if (e && e.attempt) S.attempt = e.attempt; // the page is saved but unscored: show it with "Score this page"
    // Otherwise back to where the run started: the goal page, or the last run's compare view.
    S.mode = S.attempt && S.attempt.pending ? 'stopped' : runs.length ? 'refine' : 'idle';
    const aborted = e && e.name === 'AbortError';
    if (e && e.code === 'credits_required') {
      // Not charged, nothing counted: the prompt stays in the editor.
      const msg = String(e.message || 'This prompt needs credits').replace(/.$/, '');
      setStatus(msg, true, S.user ? { href: 'credits.html', label: 'Buy credits' } : { href: `signup.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`, label: 'Sign up' });
    } else if (e && e.userMessage) setStatus(e.userMessage, !aborted);
    else if (aborted) setStatus('Run cancelled, your prompt count did not change');
    else setStatus(`The run did not finish (${String((e && e.message) || 'unknown error').replace(/\.$/, '')}), your prompt is kept so run it again`, true);
  } finally {
    S.ctrl = null;
    render();
  }
  // Phones: the score sits below the compare view, so bring it into view.
  if (S.mode === 'scored' && window.matchMedia('(max-width:760px)').matches) $('scorePanel').scrollIntoView({ block: 'start' });
}

function cancel() { if (S.ctrl) S.ctrl.abort(); }

function resetConfirm(paint = true) {
  clearTimeout(confirmTimer);
  S.confirm = false;
  if (!paint && $('overLabel').textContent === 'Start over') return;
  $('overLabel').textContent = 'Start over';
  $('overNote').textContent = 'back to 0 prompts';
}

async function startOver() {
  if (!S.confirm) {
    S.confirm = true;
    $('overLabel').textContent = 'Click again to confirm';
    $('overNote').textContent = 'clears this attempt';
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => resetConfirm(), 4000);
    return;
  }
  resetConfirm();
  await api.startOver(slug);
  S.attempt = null;
  S.mode = 'idle';
  S.sel = null;
  setStatus('');
  render();
  ta.focus();
}

function setPrompt(text) {
  ta.value = text;
  ta.dispatchEvent(new Event('input'));
}

// ---------------------------------------------------------------- wiring

let viewTabs = { select() {} };

function wire() {
  // The limit check runs before the line numbers re-measure, so a clipped value is what they count.
  ta.addEventListener('input', () => enforceLimit());
  ta.addEventListener('paste', (e) => {
    const add = (e.clipboardData && e.clipboardData.getData('text')) || '';
    const room = promptLimit() - (ta.value.length - (ta.selectionEnd - ta.selectionStart));
    if (add.length > room) setTimeout(() => enforceLimit(true), 0); // the browser pastes only what fits
  });
  lineNumbers($('editor'));
  let saveTimer = null;
  ta.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.setDraft(slug, ta.value), 300);
  });
  $('runBtn').addEventListener('click', doRun);
  // After scoring, the first click into the editor puts the cursor at the end of the submitted prompt.
  ta.addEventListener('mouseup', () => {
    if (S.mode !== 'scored' || ta.dataset.ended) return;
    ta.dataset.ended = '1';
    if (ta.selectionStart === ta.selectionEnd) ta.setSelectionRange(ta.value.length, ta.value.length);
  });
  $('backBtn').addEventListener('click', () => { S.mode = 'scored'; setStatus(''); render(); });
  $('cancelBtn').addEventListener('click', cancel);
  $('overBtn').addEventListener('click', startOver);
  // Adjust this build: empty the editor for a short change request; the next run revises the current build.
  $('adjustBtn').addEventListener('click', () => {
    const ta = $('prompt');
    ta.value = '';
    ta.placeholder = 'Describe what to change in your current build';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    setStatus('Your build is kept: describe the change, then run');
  });
  $('useBtn').addEventListener('click', () => {
    const run = S.attempt && S.attempt.runs.find((r) => r.n === S.sel);
    if (!run) return;
    setPrompt(run.prompt);
    S.view = 'workspace';
    viewTabs.select(0, false);
    if (S.mode === 'scored' || S.mode === 'idle') S.mode = 'refine';
    S.useRun = run.n;
    setStatus(`Prompt ${run.n} is in the editor`);
    render();
    ta.focus();
  });
  viewTabs = tabs($('tabs'), (i) => { S.view = i === 0 ? 'workspace' : 'runs'; render(); });
  // A click anywhere in the editor box puts the cursor in the prompt.
  $('editor').addEventListener('mousedown', (e) => { if (e.target !== ta) { e.preventDefault(); ta.focus(); } });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      doRun();
    } else if (e.key === 'Escape') {
      if (document.querySelector('.dd-menu:not([hidden])') || document.querySelector('.fv, .ws-big')) return;
      if (S.ins) { closeIns(); $('insBtn').focus(); return; }
      if (S.ctrl) { cancel(); return; }
      tools.escape();
    }
  });
}

async function main() {
  // Independent calls start together; each part paints when its own data arrives.
  let user = null;
  const shell = () => mountShell({
    active: 'challenges',
    user: shellUser(user),
    crumb: [{ label: 'Challenges', href: 'challenges.html' }].concat(S.ch ? [{ label: S.ch.title }] : []),
  });
  shell();
  api.me().then((u) => { user = u; S.user = u; shell(); }).catch(() => {});
  const attemptP = api.getAttempt(slug);
  attemptP.catch(() => {}); // awaited below once the challenge is in
  const probeP = api.probeRun().catch(() => true);
  renderBoard();
  try {
    S.ch = await api.getChallenge(slug);
  } catch (e) {
    $('split').innerHTML = `<section class="panel grow"><div class="empty"><p class="title">That challenge could not be found</p><p class="small">${esc((e && e.message) || 'Pick one from the challenge list')}</p><a class="btn btn-secondary" href="challenges.html">Browse challenges</a></div></section>`;
    $('phead').hidden = true;
    $('tabs').hidden = true;
    return;
  }
  shell();
  const saved = store.read('model', null);
  S.model = S.ch.models.some((m) => m.id === saved) ? saved : S.ch.models[0].id;
  renderHeader();
  renderModels();
  renderInstructions();
  setupFrames();
  if (isDoc()) setupDoc();
  wire();

  S.attempt = await attemptP;
  const runs = S.attempt ? S.attempt.runs : [];
  const draft = store.getDraft(slug);
  ta.value = draft || (runs.length ? runs[runs.length - 1].prompt : '');
  ta.dispatchEvent(new Event('input'));
  S.mode = runs.length ? 'scored' : 'idle';
  S.seen = readSeen();
  // The dropdown starts closed. ?brief=open opens it on load, for review screenshots only.
  if (new URLSearchParams(location.search).get('brief') === 'open') S.ins = true;
  if (S.attempt && S.attempt.pending) { S.mode = 'stopped'; S.runN = S.attempt.pending.n; showMine(outputOf(S.attempt.pending)); setStatus('Page saved, score it to see the result'); }
  if (S.ch.available === false) setStatus(S.ch.unavailableReason || 'This challenge is not playable yet');
  render();
  renderSim(await probeP);
}

// The preview-build note sits by the run button and in the scored state while runs are simulated.
function renderSim(sim) {
  const note = sim ? simNote() : api.isProvisional() ? provisionalNote() : '';
  S.sim = !!note;
  ['simRun', 'simScore'].forEach((id) => {
    $(id).innerHTML = note;
    $(id).hidden = !note || (id === 'simRun' && !!S.status);
  });
}

main();
