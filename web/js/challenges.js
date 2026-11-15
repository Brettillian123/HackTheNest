// Challenge list: level and category filters and sort kept in the URL query (?level=1&cat=forms&sort=solved).
import { mountShell, shellUser } from './shell.js';
import { fitFrames, levelClass, esc, demoTag, setStat, fmtScore, kindTag, costTag } from './ui.js';
import { listChallenges, me, isSimulated, filterByCategory, categoryOf, CATEGORY_FILTERS } from './api.js';

const LEVELS = ['all', '1', '2', '3'];
const SORTS = ['level', 'solved'];
const CAT_LABEL = { components: 'Components', marketing: 'Marketing', apps: 'Apps', forms: 'Forms', classic: 'Classic' };
const CHEVRON = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 2.5L9.5 7 5 11.5"/></svg>';

const listEl = document.getElementById('list');
let all = null;

function readState() {
  const q = new URLSearchParams(location.search);
  const level = LEVELS.includes(q.get('level')) ? q.get('level') : 'all';
  const sort = SORTS.includes(q.get('sort')) ? q.get('sort') : 'level';
  const cat = CATEGORY_FILTERS.includes(q.get('cat')) ? q.get('cat') : 'all';
  return { level, cat, sort };
}

function writeState(state) {
  const q = new URLSearchParams();
  if (state.level !== 'all') q.set('level', state.level);
  if (state.cat !== 'all') q.set('cat', state.cat);
  if (state.sort !== 'level') q.set('sort', state.sort);
  const s = q.toString();
  history.replaceState(null, '', s ? `?${s}` : location.pathname);
}

function syncPills(state) {
  document.querySelectorAll('#levels button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === state.level)));
  document.querySelectorAll('#cats button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === state.cat)));
  document.querySelectorAll('#sorts button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
}

function num(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function row(c) {
  const best = c.yourBest == null
    ? '<span class="v none">Not tried</span>'
    : `<span class="v best">${esc(fmtScore(c.yourBest))}</span>`;
  const top = c.topScore == null ? '<span class="v none">None yet</span>' : `<span class="v">${esc(fmtScore(c.topScore))}</span>`;
  const href = `workspace.html?c=${encodeURIComponent(c.slug)}`;
  const page = !c.kind || c.kind === 'page';
  // Not playable yet: listed, with the reason, but not a link.
  const title = c.available === false
    ? `<span class="chal-title">${esc(c.title)}</span>`
    : `<a class="chal-link chal-title" href="${href}">${esc(c.title)}</a>`;
  const brief = c.available === false && c.unavailableReason ? `${esc(c.brief)} <span class="chal-off">${esc(c.unavailableReason)}</span>` : esc(c.brief);
  return `<div class="chal wide">` +
    `<span class="lvl ${levelClass(c.level)}" title="${esc(c.levelLabel || '')}">Lv ${esc(c.level)}</span>` +
    (page
      ? `<div class="frame" aria-hidden="true"><iframe src="data/goals/${encodeURIComponent(c.slug)}.html" title="" sandbox="allow-same-origin" scrolling="no" loading="lazy" tabindex="-1"></iframe></div>`
      : `<div class="frame chal-kind" aria-hidden="true"><span>${esc((c.kind || '').toUpperCase())}</span></div>`) +
    `<span class="chal-main">${title}` +
    `<span class="chal-brief">${brief}</span>` +
    `<span class="chal-meta"><span class="mtag cat-tag">${CAT_LABEL[categoryOf(c)]}</span>${c.levelLabel ? `<span class="mtag">${esc(c.levelLabel)}</span>` : ''}${kindTag(c.kind)}${c.available === false ? '' : costTag(c.cost)}</span>` +
    `</span>` +
    `<span class="chal-cell"><span class="k">Solved</span><span class="v">${num(c.solvedCount)}</span></span>` +
    `<span class="chal-cell"><span class="k">Top score</span>${top}</span>` +
    `<span class="chal-cell"><span class="k">Your best</span>${best}</span>` +
    CHEVRON + `</div>`;
}

function render() {
  const state = readState();
  syncPills(state);
  let items = filterByCategory(all, state.cat).filter((c) => state.level === 'all' || String(c.level) === state.level);
  renderCount(items.length);
  items = items.slice().sort((a, b) =>
    state.sort === 'solved'
      ? (b.solvedCount || 0) - (a.solvedCount || 0) || a.level - b.level
      : a.level - b.level || (b.solvedCount || 0) - (a.solvedCount || 0));

  if (!items.length) {
    listEl.innerHTML =
      '<section class="panel"><div class="empty">' +
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r=".8" fill="currentColor"/></svg>' +
      `<p class="title">No challenges ${state.cat === 'all' ? '' : `in ${esc(CAT_LABEL[state.cat])} `}${state.level === 'all' ? '' : `at level ${esc(state.level)} `}yet</p>` +
      '<p class="small">Try another filter</p>' +
      '<button class="btn btn-secondary" type="button">Show all challenges</button></div></section>';
    listEl.querySelector('button').addEventListener('click', () => setState({ level: 'all', cat: 'all' }));
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

// "6 challenges", or "2 of 6 challenges" while a filter is on.
function renderCount(shown) {
  const n = all.length;
  const word = `challenge${n === 1 ? '' : 's'}`;
  document.getElementById('count').textContent = shown === n ? `${n} ${word}` : `${shown} of ${n} ${word}`;
}

function renderCounts() {
  const n = all.length;
  const tried = all.filter((c) => c.yourBest != null);
  document.getElementById('statTried').textContent = `${tried.length} of ${n}`;
  if (tried.length) setStat(document.getElementById('statBest'), fmtScore(Math.max(...tried.map((c) => c.yourBest))));
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
    listEl.innerHTML = '<section class="panel list-err"><span class="small">The challenge list did not load, check your connection and try again</span><button class="btn btn-secondary" type="button">Try again</button></section>';
    listEl.querySelector('button').addEventListener('click', load);
  }
}

document.getElementById('levels').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-level]');
  if (b) setState({ level: b.dataset.level });
});
document.getElementById('cats').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (b) setState({ cat: b.dataset.cat });
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
