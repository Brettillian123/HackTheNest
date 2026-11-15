// Leaderboard page: leaderboard.html?c=<slug>&b=<bracket>&p=<period>
import { mountShell, shellUser } from './shell.js';
import { dropdown, esc, levelClass, demoTag } from './ui.js';
import { getLeaderboard, listChallenges, me, BRACKETS, isSimulated } from './api.js';

const $ = (id) => document.getElementById(id);
const BRACKET_LABEL = { all: 'All', '1': '1 prompt', '2': '2 prompts', '3-5': '3 to 5', '6-10': '6 to 10', '11+': '11 or more' };
const BRACKET_PHRASE = { '1': 'in 1 prompt', '2': 'in 2 prompts', '3-5': 'in 3 to 5 prompts', '6-10': 'in 6 to 10 prompts', '11+': 'in 11 or more prompts' };

const ICON = {
  target: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r=".8" fill="currentColor"/></svg>',
  arrow: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 2.5L9.5 7 5 11.5"/></svg>',
  down: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 2.5v9M3 7.5l4 4 4-4"/></svg>',
};

let challenges = [];
let state = readUrl();
let loadId = 0;
let youObserver = null;

function readUrl() {
  const q = new URLSearchParams(location.search);
  const b = q.get('b');
  const p = q.get('p');
  return {
    c: q.get('c') || null,
    b: BRACKETS.includes(b) ? b : 'all',
    p: p === 'week' ? 'week' : 'all',
  };
}

function writeUrl() {
  const q = new URLSearchParams();
  if (state.c) q.set('c', state.c);
  if (state.b !== 'all') q.set('b', state.b);
  if (state.p !== 'all') q.set('p', state.p);
  const s = q.toString();
  history.pushState(null, '', s ? `?${s}` : location.pathname);
}

function initials(name) {
  const parts = String(name || '').replace(/[_\-.]+/g, ' ').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '').slice(0, 2)).toUpperCase();
}

const profileHref = (name) => `profile.html?u=${encodeURIComponent(name)}`;
const prompts = (n) => `${n} prompt${n === 1 ? '' : 's'}`;
const current = () => challenges.find((c) => c.slug === state.c) || null;

// ---------------------------------------------------------------- controls

function syncControls() {
  document.querySelectorAll('#bracketPills button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.b === state.b)));
  document.querySelectorAll('#periodPills button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === state.p)));
  document.querySelectorAll('#bars .bd-bar').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.b === state.b)));
  const c = current();
  $('pickLbl').textContent = c ? c.title : 'All challenges';
  document.querySelectorAll('#pickMenu .dd-item').forEach((el) => el.setAttribute('aria-current', String((el.dataset.c || null) === state.c)));
  const overall = !state.c;
  $('thPrompts').textContent = overall ? 'Avg prompts' : 'Prompts';
  $('thScore').textContent = overall ? 'Points' : 'Score';
  $('stTopK').textContent = overall ? 'Top points' : 'Top score';
  $('barsNote').textContent = state.p === 'week' ? 'This week' : 'All time';
  document.title = `${c ? c.title + ' leaderboard' : 'Leaderboard'} - promptdyno`;
}

function setState(next) {
  state = { ...state, ...next };
  writeUrl();
  load();
}

function buildPicker() {
  const menu = $('pickMenu');
  const item = (slug, label, lv) =>
    `<button type="button" class="dd-item" role="menuitem" data-c="${slug ? esc(slug) : ''}">${esc(label)}${lv ? `<span class="lvl sm ${levelClass(lv)}">Lv ${lv}</span>` : ''}</button>`;
  menu.innerHTML =
    item(null, 'All challenges') +
    '<div class="dd-sep"></div>' +
    challenges.map((c) => item(c.slug, c.title, c.level)).join('');
  const dd = dropdown($('pickBtn'), menu);
  menu.addEventListener('click', (e) => {
    const el = e.target.closest('.dd-item');
    if (!el) return;
    dd.close();
    $('pickBtn').focus();
    const c = el.dataset.c || null;
    if (c !== state.c) setState({ c });
  });
}

function wireFilters() {
  $('bracketPills').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.b !== state.b) setState({ b: b.dataset.b });
  });
  $('periodPills').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.p !== state.p) setState({ p: b.dataset.p });
  });
  $('bars').addEventListener('click', (e) => {
    const b = e.target.closest('.bd-bar');
    if (b && b.dataset.b !== state.b) setState({ b: b.dataset.b });
  });
  window.addEventListener('popstate', () => { state = readUrl(); load(); });
}

// ---------------------------------------------------------------- render

function renderLoading() {
  $('podium').innerHTML = [1, 2, 3].map((n) => `<div class="bd-top${n === 1 ? ' first' : ''}"><div class="skel"><i></i><i class="line"></i></div></div>`).join('');
  $('rows').innerHTML = '';
  $('table').hidden = true;
  $('state').innerHTML = '<div class="skel" aria-label="Loading">' + '<i></i>'.repeat(8) + '</div>';
  $('pin').hidden = true;
}

function topCell(r, n) {
  if (!r) return `<div class="bd-top open${n === 1 ? ' first' : ''}">Open spot</div>`;
  const tag = n === 1 ? 'r' : n === 2 ? 'p' : 'w';
  return `<div class="bd-top${n === 1 ? ' first' : ''}${r.isYou ? ' you' : ''}">
    <div class="who"><span class="lvl ${tag}">#${r.rank}</span><span class="avatar">${esc(initials(r.username))}</span>${nameHtml(r)}</div>
    <div class="low"><span class="pr"><b>${r.promptCount}</b> ${r.promptCount === 1 ? 'prompt' : 'prompts'}${state.c ? '' : ' avg'}</span><span class="big">${r.score}<small class="unit">${state.c ? 'Score' : 'Points'}</small></span></div>
  </div>`;
}

function nameHtml(r) {
  if (r.isYou && r.username === 'You') return '<span class="nm">You</span>';
  return `<a href="${profileHref(r.username)}">${esc(r.username)}</a>${r.isYou ? '<span class="you-tag">you</span>' : ''}`;
}

function renderBoard(data) {
  const { rows, you } = data;
  $('bdDemo').innerHTML = isSimulated('boards') ? demoTag() : '';
  const top = rows.length ? rows[0].score : null;
  $('stPlayers').textContent = rows.length.toLocaleString('en-US');
  $('stTop').textContent = top == null ? 'none yet' : String(top);
  $('stYou').textContent = you ? `#${you.rank}` : 'none yet';

  $('podium').innerHTML = [0, 1, 2].map((i) => topCell(rows[i], i + 1)).join('');

  if (!rows.length) {
    $('table').hidden = true;
    $('rows').innerHTML = '';
    $('state').innerHTML = emptyHtml();
    $('pin').hidden = true;
    return;
  }
  $('state').innerHTML = '';
  $('table').hidden = false;
  $('rows').innerHTML = rows.map((r) => `<tr${r.isYou ? ' class="you" id="youRow"' : ''}>
    <td class="pos">#${r.rank}</td>
    <td><span class="who"><span class="avatar">${esc(initials(r.username))}</span>${nameHtml(r)}</span></td>
    <td class="r num">${r.promptCount}</td>
    <td class="r sc-cell">${r.score}</td></tr>`).join('');
  $('wrap').scrollTop = 0;
  pinYou(you);
}

function emptyHtml() {
  const c = current();
  const when = state.p === 'week' ? ' this week' : '';
  const phrase = state.b === 'all' ? '' : ' ' + BRACKET_PHRASE[state.b];
  const what = c ? 'this' : 'a challenge';
  const title = `No one has finished ${what}${phrase}${when} yet. Be the first.`;
  const btn = c
    ? `<a class="btn btn-secondary" href="workspace.html?c=${encodeURIComponent(c.slug)}">Open the challenge</a>`
    : '<a class="btn btn-secondary" href="challenges.html">Browse challenges</a>';
  return `<div class="empty">${ICON.target}<p class="title">${esc(title)}</p><p class="small">Try another prompt filter or period to see more players.</p>${btn}</div>`;
}

function pinYou(you) {
  const pin = $('pin');
  if (youObserver) { youObserver.disconnect(); youObserver = null; }
  const row = $('youRow');
  if (!you || !row) { pin.hidden = true; return; }
  pin.innerHTML = `<span class="pos">#${you.rank}</span><span>You: rank <b>${you.rank}</b>, <b>${you.score}</b> ${state.c ? 'score' : 'points'}${you.promptCount != null ? `, <b>${you.promptCount}</b> ${you.promptCount === 1 ? 'prompt' : 'prompts'}` : ''}</span>
    <button type="button" class="btn btn-ghost sm" id="pinJump">${ICON.down}Show my row</button>`;
  $('pinJump').addEventListener('click', () => row.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  youObserver = new IntersectionObserver(([e]) => { pin.hidden = e.isIntersecting; }, { root: null, threshold: 0.9, rootMargin: '0px 0px -72px 0px' });
  youObserver.observe(row);
}

function renderBars(counts) {
  const max = Math.max(1, ...BRACKETS.filter((b) => b !== 'all').map((b) => counts[b] || 0));
  $('bars').innerHTML = BRACKETS.map((b) => {
    const n = counts[b];
    const w = b === 'all' ? 100 : Math.round(((n || 0) / max) * 100);
    return `<button type="button" class="bd-bar" data-b="${b}" aria-pressed="${b === state.b}"><span>${BRACKET_LABEL[b]}</span><span class="track"><span class="fill" style="width:${n == null ? 0 : w}%"></span></span><span class="c">${n == null ? '0' : n.toLocaleString('en-US')}</span></button>`;
  }).join('');
}

function renderAct() {
  const c = current();
  $('act').innerHTML = c
    ? `<div class="panel-head"><h2 class="h">This challenge</h2><span class="lvl sm ${levelClass(c.level)}">Lv ${c.level}</span></div>
       <div class="t">${esc(c.title)}</div><p>${esc(c.brief || '')}</p>
       <a class="btn btn-secondary block" href="workspace.html?c=${encodeURIComponent(c.slug)}">${c.yourBest != null ? 'Improve your score' : 'Try this challenge'}${ICON.arrow}</a>`
    : `<div class="panel-head"><h2 class="h">All challenges</h2><span class="note">${challenges.length} open</span></div>
       <p>Points add up each player's best score on every challenge. Prompts show their average per challenge.</p>
       <a class="btn btn-secondary block" href="challenges.html">Browse challenges${ICON.arrow}</a>`;
}

function renderError(err, id) {
  if (id !== loadId) return;
  $('podium').innerHTML = [1, 2, 3].map((n) => `<div class="bd-top open${n === 1 ? ' first' : ''}"></div>`).join('');
  $('table').hidden = true;
  $('pin').hidden = true;
  $('state').innerHTML = `<p class="bd-err" role="alert"><span>${esc((err && err.message) || 'The leaderboard did not load.')}</span><button type="button" class="btn btn-secondary sm" id="retry">Try again</button></p>`;
  $('retry').addEventListener('click', load);
}

// ---------------------------------------------------------------- load

async function load() {
  const id = ++loadId;
  if (state.c && challenges.length && !current()) state.c = null;
  syncControls();
  renderAct();
  renderLoading();
  const opts = { bracket: state.b, period: state.p };
  try {
    const [board, ...perBracket] = await Promise.all([
      getLeaderboard(state.c, opts),
      ...BRACKETS.map((b) => getLeaderboard(state.c, { bracket: b, period: state.p }).then((r) => r.rows.length, () => null)),
    ]);
    if (id !== loadId) return;
    const counts = {};
    BRACKETS.forEach((b, i) => { counts[b] = perBracket[i]; });
    renderBars(counts);
    renderBoard(board);
  } catch (err) {
    renderError(err, id);
  }
}

async function start() {
  let user = null;
  try {
    user = shellUser(await me());
  } catch { /* anonymous */ }
  try {
    challenges = await listChallenges();
  } catch { challenges = []; }
  mountShell({ active: 'leaderboard', user, crumb: [{ label: 'Leaderboard' }] });
  buildPicker();
  wireFilters();
  renderBars({});
  load();
}

start();
