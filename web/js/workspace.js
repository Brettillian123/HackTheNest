// promptdyno workspace page: goal, prompt, run, score, runs. Plain ES module.
import * as api from './api.js';
import * as store from './store.js';
import { mountShell, shellUser } from './shell.js';
import { dropdown, tabs, esc, levelClass, lineNumbers, demoTag, simNote, setStat, frameViewer, provisionalNote, provisionalTag } from './ui.js';
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
};

const ta = $('prompt');
const tools = createTools();
const layers = {};
let modelDd = null;
let confirmTimer = null;

// ---------------------------------------------------------------- frames

function fitFrame(frameEl) {
  const vp = S.ch ? S.ch.viewport : { width: 1280, height: 800 };
  const f = frameEl.querySelector(':scope > iframe');
  if (!f || !frameEl.clientWidth) return;
  f.style.width = vp.width + 'px';
  f.style.height = vp.height + 'px';
  f.style.transform = `scale(${frameEl.clientWidth / vp.width})`;
}

function setupFrames() {
  const vp = S.ch.viewport;
  const ro = new ResizeObserver((es) => es.forEach((e) => fitFrame(e.target)));
  ['goalFrame', 'mineFrame', 'goalSmall', 'mineSmall'].forEach((id) => {
    const fr = $(id);
    fr.style.aspectRatio = `${vp.width} / ${vp.height}`;
    ro.observe(fr);
    fitFrame(fr);
    layers[id] = tools.attach(fr, vp);
  });
  tools.link(layers.goalSmall, layers.mineSmall);
  document.querySelectorAll('.tools').forEach((g) => tools.bind(g));
  frameViewer(['goalFrame', 'mineFrame', 'goalSmall', 'mineSmall'].map($));
  $('goalFrame').querySelector('iframe').src = S.ch.goalUrl;
  $('goalSmall').querySelector('iframe').src = S.ch.goalUrl;
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
  if (!/<body[\s>]/i.test(h)) return;
  pending = h;
  const wait = 200 - (performance.now() - lastFlush);
  if (wait <= 0) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, wait);
}
function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (pending == null) return;
  setDoc('mineFrame', pending);
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
  setStat($('hBest'), c.yourBest == null ? 'None yet' : c.yourBest);
  setStat($('hTop'), c.topScore == null ? 'None yet' : c.topScore);
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
    $('lbDemo').innerHTML = api.isSimulated('boards') ? demoTag() : provisionalTag(api.isProvisional('boards'));
    let rows = lb.rows.slice(0, 4);
    const you = lb.rows.find((r) => r.isYou);
    if (you && !rows.includes(you)) rows = rows.slice(0, 3).concat(you);
    const gap = (r, i) => i > 0 && r.rank > rows[i - 1].rank + 1;
    list.innerHTML = rows.length
      ? rows.map((r, i) => `<li class="${r.isYou ? 'you' : ''}${gap(r, i) ? ' gap' : ''}"><span class="pos">#${r.rank}</span><span class="nm">${esc(r.username)}</span><span class="s">${r.score}</span></li>`).join('')
      : '<li><span class="nm">No scores yet. Yours can be first.</span></li>';
  } catch {
    list.innerHTML = '<li><span class="nm">The leaderboard could not load. Reload the page to try again.</span></li>';
  }
}

// Instructions: a column docked inside the page panel on show; the button opens and closes it.
function renderInstructions() {
  const groups = S.ch.spec.map((g) =>
    `<h4 class="ws-ins-group">${esc(g.group)}</h4><dl>` +
    g.items.map((i) => `<div><dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd></div>`).join('') + '</dl>').join('');
  $('insMenu').innerHTML = `<h3 class="h">Match these exactly</h3><div class="ws-ins-cols">${groups}</div>`;
  $('insBtn').addEventListener('click', () => { S.ins = !S.ins; render(); });
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

function signed(n) { return (n >= 0 ? '+' : MINUS) + Math.abs(n); }
function sortedCosts(r) { return (r.costs || []).slice().sort((a, b) => b.points - a.points); }
function topCosts(r) { return sortedCosts(r).slice(0, 3); }
const COST_ROWS = 3; // rows the score panel has room for at 1280 x 800
function miniCosts(r) {
  const cs = topCosts(r);
  return cs.length
    ? cs.map((c) => `<div class="ws-mini"><span class="pt">${MINUS}${c.points}</span><span>${esc(c.message)}</span></div>`).join('')
    : '<div class="ws-mini none">No points lost on this run.</div>';
}

function renderCompare(run) {
  $('cmpNote').textContent = 'Run ' + run.n;
  $('cmpTag').textContent = run.n;
  setDoc('mineSmall', run.html || '<p style="font:14px sans-serif;padding:24px">This run\'s page was not kept on this device.</p>');
  const checks = (run.result.checks || []).slice().sort((a, b) => Number(a.passed) - Number(b.passed));
  $('checkList').innerHTML = checks.map((c) =>
    `<li class="${c.passed ? 'ok' : 'no'}"><span class="m">${c.passed ? OK_SVG : NO_SVG}</span>${esc(c.label)}</li>`).join('');
}

// The prompt that produced the run on show, beside its score (workspace view only).
function renderRunPrompt(run) {
  $('runPrompt').innerHTML = String(run.prompt || '').split('\n').map((l) => `<div class="l">${esc(l) || '&nbsp;'}</div>`).join('');
  show('editKeepBtn', S.mode === 'scored' && S.view === 'workspace');
}

function renderScore(run) {
  const r = run.result;
  $('scN').textContent = r.total;
  $('scGain').textContent = r.delta == null ? 'Run 1' : `${signed(r.delta)} pts`;
  const rk = r.rank;
  let rankText = '';
  if (rk && rk.before && rk.after && rk.before !== rk.after) rankText = `Rank #${rk.before} to #${rk.after}`;
  else if (rk && rk.after) rankText = `Rank #${rk.after}`;
  const vs = r.delta == null ? '' : `vs run ${run.n - 1}`;
  $('scRk').textContent = [vs, rankText].filter(Boolean).join(', ');
  const passed = r.passedCount ?? (r.checks || []).filter((c) => c.passed).length;
  const total = r.totalChecks ?? (r.checks || []).length;
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
    ? shown.map((c) => `<div class="cost"><span class="pt">${MINUS}${c.points}</span><span class="w">${esc(c.message)}</span></div>`).join('') +
      (rest.length ? `<button type="button" class="cost more" id="moreCosts"><span class="pt">${MINUS}${restPts}</span><span class="w">${rest.length} more ${rest.length === 1 ? 'cost' : 'costs'}<small>See every cost in Runs</small></span></button>` : '')
    : '<div class="cost"><span class="w">No points lost on this run.</span></div>';
  const more = $('moreCosts');
  if (more) more.addEventListener('click', () => { S.sel = run.n; viewTabs.select(1); });
  $('scNoteText').innerHTML = r.total >= 100
    ? '<b>A perfect 100.</b> Very few prompts get every check right. This one is worth keeping.'
    : '<b>A perfect 100 is rare.</b> Small models drift on spacing and sizes, so a score in the 80s or 90s means a strong prompt.';
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
    return `<button class="hist${r.n === S.sel ? ' on' : ''}" role="option" aria-selected="${r.n === S.sel}" data-n="${r.n}"><span class="hist-n">#${r.n}</span><span class="hist-x">${esc(r.prompt)}</span><span class="hist-s">${r.result.total}${d}</span></button>`;
  }).join('');
  $('histList').querySelectorAll('.hist').forEach((b) => b.addEventListener('click', () => { S.sel = Number(b.dataset.n); render(); }));
  const run = runs.find((r) => r.n === S.sel);
  $('rdTag').textContent = run.n;
  $('rdScore').textContent = run.result.total;
  $('rdDelta').textContent = run.result.delta == null ? 'First prompt of this attempt' : `${signed(run.result.delta)} pts vs run ${run.n - 1}`;
  // Every cost of the selected run; its prompt shows on the left under the checks.
  const all = (run.result.costs || []).slice().sort((a, b) => b.points - a.points);
  $('rdCosts').innerHTML = all.length
    ? all.map((c) => `<div class="cost"><span class="pt">${MINUS}${c.points}</span><span class="w">${esc(c.message)}</span></div>`).join('')
    : '<div class="cost"><span class="w">No points lost on this run.</span></div>';
}

function setStatus(text, bad = false) { S.status = text || ''; S.statusBad = !!(text && bad); }

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
  show('promptPanel', ws && m !== 'scored');
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
  ['goalPanel', 'comparePanel'].forEach((id) => $(id).classList.toggle('ins-open', S.ins && $(id) === host));
  $('insBtn').setAttribute('aria-expanded', String(S.ins));
  // The docked column needs the height: the leaderboard strip steps aside while it is open.
  if (S.ins && host === $('goalPanel')) show('lbPanel', false);

  const used = S.attempt ? S.attempt.promptCount ?? runs.length : 0; // an unscored saved page counts too
  $('runCount').textContent = used;
  $('usedA').textContent = used;
  $('usedB').textContent = used;

  // prompt panel
  $('mineNote').textContent = 'Run ' + S.runN;
  $('runBtn').disabled = busy;
  $('runBtn').classList.toggle('busy', busy);
  $('runLabel').innerHTML = busy ? 'Running' : S.attempt && S.attempt.pending ? 'Score this page' : last ? 'Run prompt<small>adds 1 prompt</small>' : 'Run prompt';
  show('cancelBtn', busy);
  show('backBtn', m === 'refine' && !!last);
  const st = $('status');
  st.textContent = S.status;
  st.hidden = !S.status;
  st.classList.toggle('bad', S.statusBad);
  $('simRun').hidden = !S.sim || !!S.status;
  // While refining: the run being built on (the last one, or the one picked with "Use this prompt").
  const base = (S.useRun && runs.find((r) => r.n === S.useRun)) || last;
  show('lastBox', m === 'refine' && !!base);
  if (m === 'refine' && base) {
    $('lastLbl').textContent = base === last ? 'Last run' : `Run ${base.n}`;
    $('lastScore').textContent = base.result.total;
    $('lastCosts').innerHTML = miniCosts(base.result);
  }

  // stages
  // One tight row: what is happening now, then the four scoring steps.
  $('stageNote').textContent = m === 'grading' ? 'Grading run ' + S.runN : m === 'stopped' ? 'Page saved, not scored yet' : 'Writing your page';
  $('stageList').innerHTML = api.STAGES.map((s, i) =>
    `<li class="${i < S.stage ? 'done' : i === S.stage && m === 'grading' ? 'on' : ''}">${esc(s.label)}</li>`).join('');

  if (ws && compare && base) { renderCompare(base); renderRunPrompt(base); }
  show('runPromptBox', ws ? compare && !!last : runs.length > 0);
  if (ws && m === 'scored' && last) renderScore(last);
  if (!ws) {
    renderRuns();
    const run = runs.find((r) => r.n === S.sel);
    if (run) { renderCompare(run); renderRunPrompt(run); }
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
    setStatus('Write a prompt first, then run it.', true);
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
  pending = null;
  setDoc('mineFrame', unscored ? unscored.html : '');
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
    S.stage = api.STAGES.length;
    renderSim(api.isSimulated('run'));
    S.ch = { ...S.ch, ...(await api.getChallenge(slug)) };
    renderHeader();
    api.me().then((u) => { if (u) mountShell({ active: 'challenges', user: shellUser(u), crumb: [{ label: 'Challenges', href: 'challenges.html' }, { label: S.ch.title }] }); }).catch(() => {});
    renderBoard();
  } catch (e) {
    flush();
    if (e && e.attempt) S.attempt = e.attempt; // the page is saved but unscored: show it with "Score this page"
    // Otherwise back to where the run started: the goal page, or the last run's compare view.
    S.mode = S.attempt && S.attempt.pending ? 'stopped' : runs.length ? 'refine' : 'idle';
    const aborted = e && e.name === 'AbortError';
    if (e && e.userMessage) setStatus(e.userMessage, !aborted);
    else if (aborted) setStatus('Run cancelled. Your prompt count did not change.');
    else setStatus(`The run did not finish: ${(e && e.message) || 'unknown error'} Your prompt is kept, so run it again.`, true);
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
  lineNumbers($('editor'));
  let saveTimer = null;
  ta.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.setDraft(slug, ta.value), 300);
  });
  $('runBtn').addEventListener('click', doRun);
  const keepPrompting = () => {
    S.mode = 'refine';
    S.useRun = null;
    setStatus('');
    render();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  $('keepBtn').addEventListener('click', keepPrompting);
  $('editKeepBtn').addEventListener('click', keepPrompting);
  $('backBtn').addEventListener('click', () => { S.mode = 'scored'; setStatus(''); render(); });
  $('cancelBtn').addEventListener('click', cancel);
  $('overBtn').addEventListener('click', startOver);
  $('useBtn').addEventListener('click', () => {
    const run = S.attempt && S.attempt.runs.find((r) => r.n === S.sel);
    if (!run) return;
    setPrompt(run.prompt);
    S.view = 'workspace';
    viewTabs.select(0, false);
    if (S.mode === 'scored' || S.mode === 'idle') S.mode = 'refine';
    S.useRun = run.n;
    setStatus(`Prompt ${run.n} is in the editor. Edit it, then run it.`);
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
      if (document.querySelector('.dd-menu:not([hidden])') || document.querySelector('.fv')) return;
      if (S.ctrl) { cancel(); return; }
      if (tools.escape()) return;
      if (S.ins) { S.ins = false; render(); $('insBtn').focus(); }
    }
  });
}

async function main() {
  const user = await api.me().catch(() => null);
  try {
    S.ch = await api.getChallenge(slug);
  } catch (e) {
    mountShell({ active: 'challenges', user: shellUser(user), crumb: [{ label: 'Challenges', href: 'challenges.html' }] });
    $('split').innerHTML = `<section class="panel grow"><div class="empty"><p class="title">That challenge could not be found</p><p class="small">${esc((e && e.message) || '')} Pick one from the list.</p><a class="btn btn-secondary" href="challenges.html">Browse challenges</a></div></section>`;
    $('phead').hidden = true;
    $('tabs').hidden = true;
    return;
  }
  mountShell({
    active: 'challenges',
    user: shellUser(user),
    crumb: [{ label: 'Challenges', href: 'challenges.html' }, { label: S.ch.title }],
  });
  const saved = store.read('model', null);
  S.model = S.ch.models.some((m) => m.id === saved) ? saved : S.ch.models[0].id;
  renderHeader();
  renderModels();
  renderInstructions();
  setupFrames();
  wire();

  S.attempt = await api.getAttempt(slug);
  const runs = S.attempt ? S.attempt.runs : [];
  const draft = store.getDraft(slug);
  ta.value = draft || (runs.length ? runs[runs.length - 1].prompt : '');
  ta.dispatchEvent(new Event('input'));
  S.mode = runs.length ? 'scored' : 'idle';
  if (S.attempt && S.attempt.pending) { S.mode = 'stopped'; S.runN = S.attempt.pending.n; setDoc('mineFrame', S.attempt.pending.html); setStatus('This page is saved but not scored yet. Score it to see the result.'); }
  render();
  renderBoard();
  renderSim(await api.probeRun().catch(() => true));
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
