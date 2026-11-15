// Landing page: shell, live counts, top 5 overall leaderboard.
import { mountShell, shellUser } from './shell.js';
import { fitFrames, esc, demoTag, setStat, provisionalTag } from './ui.js';
import { listChallenges, getLeaderboard, me, isSimulated, isProvisional } from './api.js';

async function start() {
  mountShell({ active: 'home', user: null });
  fitFrames();
  me().then((u) => {
    if (!u) return;
    mountShell({ active: 'home', user: shellUser(u) });
    setStat(document.getElementById('statAcct'), 'Signed in');
  }).catch(() => {});
  loadCounts();
  loadBoard();
}

async function loadCounts() {
  try {
    const list = await listChallenges();
    document.getElementById('statCount').textContent = String(list.length);
    document.getElementById('statLevels').textContent = String(new Set(list.map((c) => c.level)).size);
    const pricing = list.find((c) => c.slug === 'pricing-plans');
    if (pricing) document.getElementById('heroTitle').textContent = pricing.title;
  } catch {
    // Counts keep their static values.
  }
}

async function loadBoard() {
  const host = document.getElementById('board');
  try {
    const { rows } = await getLeaderboard(null, { bracket: 'all', period: 'all' });
    const top = (rows || []).slice(0, 5);
    document.getElementById('boardDemo').innerHTML = isSimulated('boards') ? demoTag() : provisionalTag(isProvisional('boards'));
    if (!top.length) {
      host.innerHTML = '<div class="empty"><p class="title">No scores yet</p><p class="small">Be the first on the board.</p><a class="btn btn-secondary" href="workspace.html?c=login-card">Try the first challenge</a></div>';
      return;
    }
    host.innerHTML =
      '<table class="lbt"><thead><tr><th>Rank</th><th>Player</th><th class="r">Avg prompts</th><th class="r">Points</th></tr></thead><tbody>' +
      top.map((r) =>
        `<tr${r.isYou ? ' class="you"' : ''}><td class="pos">#${esc(r.rank)}</td>` +
        `<td><span class="who">${esc(r.username)}</span></td>` +
        `<td class="r num">${esc(Number(r.avgPrompts ?? r.promptCount).toFixed(1))}</td>` +
        `<td class="r sc-cell">${esc(r.score)}</td></tr>`).join('') +
      '</tbody></table>';
  } catch {
    host.innerHTML = '<div class="list-err"><span class="small">The leaderboard did not load.</span><button class="btn btn-secondary sm" type="button">Try again</button></div>';
    host.querySelector('button').addEventListener('click', () => {
      host.innerHTML = '<div class="skel"><i></i><i></i><i></i><i></i><i></i></div>';
      loadBoard();
    });
  }
}

start();
