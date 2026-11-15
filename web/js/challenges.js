// Challenge list: level filter and sort kept in the URL query (?level=1&sort=solved).
import { mountShell, shellUser } from './shell.js';
import { fitFrames, levelClass, esc, demoTag, setStat } from './ui.js';
import { listChallenges, me, isSimulated } from './api.js';

const LEVELS = ['all', '1', '2', '3'];
const SORTS = ['level', 'solved'];
const CHEVRON = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 2.5L9.5 7 5 11.5"/></svg>';

const listEl = document.getElementById('list');
let all = null;

function readState() {
  const q = new URLSearchParams(location.search);
  const level = LEVELS.includes(q.get('level')) ? q.get('level') : 'all';
  const sort = SORTS.includes(q.get('sort')) ? q.get('sort') : 'level';
  return { level, sort };
}

function writeState(state) {
  const q = new URLSearchParams();
  if (state.level !== 'all') q.set('level', state.level);
  if (state.sort !== 'level') q.set('sort', state.sort);
  const s = q.toString();
  history.replaceState(null, '', s ? `?${s}` : location.pathname);
}

function syncPills(state) {
  document.querySelectorAll('#levels button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === state.level)));
  document.querySelectorAll('#sorts button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
}

function num(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function row(c) {
  const best = c.yourBest == null
    ? '<span class="v none">Not tried</span>'
    : `<span class="v best">${esc(c.yourBest)}</span>`;
  const top = c.topScore == null ? '<span class="v none">None yet</span>' : `<span class="v">${esc(c.topScore)}</span>`;
  const href = `workspace.html?c=${encodeURIComponent(c.slug)}`;
  return `<div class="chal wide">` +
    `<span class="lvl ${levelClass(c.level)}" title="${esc(c.levelLabel || '')}">Lv ${esc(c.level)}</span>` +
    `<div class="frame" aria-hidden="true"><iframe src="data/goals/${encodeURIComponent(c.slug)}.html" title="" sandbox="allow-same-origin" scrolling="no" loading="lazy" tabindex="-1"></iframe></div>` +
    `<span class="chal-main"><a class="chal-link chal-title" href="${href}">${esc(c.title)}</a>` +
    `<span class="chal-brief">${esc(c.brief)}</span>` +
    (c.levelLabel ? `<span class="chal-meta"><span class="mtag">${esc(c.levelLabel)}</span></span>` : '') +
    `</span>` +
    `<span class="chal-cell"><span class="k">Solved</span><span class="v">${num(c.solvedCount)}</span></span>` +
    `<span class="chal-cell"><span class="k">Top score</span>${top}</span>` +
    `<span class="chal-cell"><span class="k">Your best</span>${best}</span>` +
    CHEVRON + `</div>`;
}

function render() {
  const state = readState();
  syncPills(state);
  let items = all.filter((c) => state.level === 'all' || String(c.level) === state.level);
  renderCount(items.length);
  items = items.slice().sort((a, b) =>
    state.sort === 'solved'
      ? (b.solvedCount || 0) - (a.solvedCount || 0) || a.level - b.level
      : a.level - b.level || (b.solvedCount || 0) - (a.solvedCount || 0));

  if (!items.length) {
    listEl.innerHTML =
      '<section class="panel"><div class="empty">' +
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r=".8" fill="currentColor"/></svg>' +
      `<p class="title">No challenges at level ${esc(state.level)} yet</p>` +
      '<p class="small">Try another level or show them all.</p>' +
      '<button class="btn btn-secondary" type="button" data-level="all">Show all levels</button></div></section>';
    listEl.querySelector('button').addEventListener('click', () => setState({ level: 'all' }));
    return;
  }
  listEl.innerHTML = `<div class="chal-list">${items.map(row).join('')}</div>`;
  fitFrames(listEl);
}

function setState(patch) {
  const next = { ...readState(), ...patch };
  writeState(next);
  if (all) render(); else syncPills(next);
}

// "6 challenges", or "2 of 6 challenges" while a level filter is on.
function renderCount(shown) {
  const n = all.length;
  const word = `challenge${n === 1 ? '' : 's'}`;
  document.getElementById('count').textContent = shown === n ? `${n} ${word}` : `${shown} of ${n} ${word}`;
}

function renderCounts() {
  const n = all.length;
  const tried = all.filter((c) => c.yourBest != null);
  document.getElementById('statTried').textContent = `${tried.length} of ${n}`;
  if (tried.length) setStat(document.getElementById('statBest'), Math.max(...tried.map((c) => c.yourBest)));
}

async function load() {
  listEl.innerHTML = '<div class="skel rows" aria-label="Loading"><i></i><i></i><i></i><i></i></div>';
  try {
    all = await listChallenges();
    document.getElementById('chDemo').innerHTML = isSimulated('boards') ? demoTag() : '';
    renderCounts();
    render();
  } catch {
    all = null;
    document.getElementById('count').textContent = 'Challenges did not load';
    listEl.innerHTML = '<section class="panel list-err"><span class="small">The challenge list did not load. Check your connection and try again.</span><button class="btn btn-secondary" type="button">Try again</button></section>';
    listEl.querySelector('button').addEventListener('click', load);
  }
}

document.getElementById('levels').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-level]');
  if (b) setState({ level: b.dataset.level });
});
document.getElementById('sorts').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sort]');
  if (b) setState({ sort: b.dataset.sort });
});

mountShell({ active: 'challenges', user: null });
me().then((u) => {
  if (!u) return;
  mountShell({ active: 'challenges', user: shellUser(u) });
  document.getElementById('acct').textContent = `Signed in as ${u.username}`;
}).catch(() => {});
syncPills(readState());
load();
