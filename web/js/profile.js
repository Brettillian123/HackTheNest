// Profile page: profile.html?u=<username>. Without u: the signed-in player, or a local view of this browser's runs.
import { mountShell, shellUser } from './shell.js';
import { esc, levelClass, fitFrames, demoTag, fmtScore } from './ui.js';
import { getProfile, getLeaderboard, listChallenges, getChallenge, me, logout, isSimulated } from './api.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const BUCKETS = [
  { label: '1 prompt', lo: 1, hi: 1 },
  { label: '2 prompts', lo: 2, hi: 2 },
  { label: '3 to 5', lo: 3, hi: 5 },
  { label: '6 to 10', lo: 6, hi: 10 },
  { label: '11 or more', lo: 11, hi: Infinity },
];
const ICON = {
  target: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r=".8" fill="currentColor"/></svg>',
  user: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="7" r="3.5"/><path d="M3.5 17.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5"/></svg>',
  arrow: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 2.5L9.5 7 5 11.5"/></svg>',
  play: '<svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z"/></svg>',
  cal: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="10" height="9" rx="1.5"/><path d="M2 6h10M5 1.8v2.4M9 1.8v2.4"/></svg>',
  info: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="5.5"/><path d="M7 6.2v3.6M7 4.3v.1"/></svg>',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function initials(name) {
  const parts = String(name || '').replace(/[_\-.]+/g, ' ').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '').slice(0, 2)).toUpperCase();
}

function parseDay(s) {
  const t = Date.parse(String(s || '').slice(0, 10) + 'T00:00:00');
  return Number.isNaN(t) ? null : new Date(t);
}

function fullDate(s) {
  const d = parseDay(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null;
}

function ago(s) {
  const d = parseDay(s);
  if (!d) return 'earlier';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today - d) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const prompts = (n) => `${n} ${n === 1 ? 'prompt' : 'prompts'}`;

// ---------------------------------------------------------------- data

async function localProfile(challenges) {
  const mine = challenges.filter((c) => c.yourBest != null);
  const solved = await Promise.all(mine.map(async (c) => {
    let promptCount = null;
    let when = null;
    try {
      const b = await getLeaderboard(c.slug, { bracket: 'all', period: 'all' });
      if (b.you) promptCount = b.you.promptCount;
    } catch { /* keep null */ }
    // When the best was set: stored with the best itself, so it survives "Start over".
    try {
      const b = store.getBest(c.slug);
      if (b && b.when) { const d = new Date(b.when); when = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    } catch { /* keep null */ }
    return { slug: c.slug, title: c.title, best: c.yourBest, promptCount: promptCount ?? 1, when };
  }));
  const n = solved.length;
  return {
    username: null,
    joined: null,
    totals: {
      solved: n,
      best: n ? Math.max(...solved.map((s) => s.best)) : 0,
      averagePrompts: n ? Math.round((solved.reduce((s, x) => s + x.promptCount, 0) / n) * 10) / 10 : 0,
    },
    solved,
  };
}

async function overallRank(name, local) {
  try {
    const { rows, you } = await getLeaderboard(null, { bracket: 'all', period: 'all' });
    if (local) return you ? you.rank : null;
    const r = rows.find((x) => x.username === name);
    return r ? r.rank : null;
  } catch { return null; }
}

function pickNext(challenges, solvedSlugs) {
  const byLevel = challenges.slice().sort((a, b) => a.level - b.level);
  const untried = byLevel.find((c) => c.yourBest == null && !solvedSlugs.has(c.slug)) || byLevel.find((c) => c.yourBest == null);
  if (untried) return { c: untried, fresh: true };
  const lowest = challenges.slice().sort((a, b) => a.yourBest - b.yourBest)[0];
  return lowest ? { c: lowest, fresh: false } : null;
}

// ---------------------------------------------------------------- render

function headHtml(p, { self, local, rank }) {
  const name = local ? 'Your runs on this browser' : p.username;
  const joined = fullDate(p.joined);
  const sub = local
    ? `<span class="pf-local">${ICON.info}Scores live only in this browser,&nbsp;<a class="link" href="signup.html">sign up to keep them</a></span>`
    : `${joined ? `<span class="meta">${ICON.cal}Joined ${joined}</span>` : ''}${self ? '<span class="meta">This is you</span><button type="button" class="btn btn-ghost sm" id="logoutBtn">Log out</button>' : ''}`;
  const avg = p.totals.solved ? Number(p.totals.averagePrompts).toFixed(1) : 'None yet';
  const v = (t) => `<div class="v${/\d/.test(String(t)) ? '' : ' is-word'}">${esc(t)}</div>`;
  return `<div class="pf-id">
      <span class="avatar lg">${local ? ICON.user.replace('stroke-width="1.5"', 'stroke-width="1.7" width="26" height="26"') : esc(initials(p.username))}</span>
      <div><div class="phead-t"><h1>${esc(name)}</h1></div><div class="phead-sub">${sub}</div></div>
    </div>
    <div class="phead-side">
      <div class="stat"><div class="k">Challenges solved</div>${v(p.totals.solved)}</div>
      <div class="stat"><div class="k">Best score</div>${v(p.totals.solved ? fmtScore(p.totals.best) : 'None yet')}</div>
      <div class="stat"><div class="k">Average prompts</div>${v(avg)}</div>
      <div class="stat"><div class="k">Overall rank</div>${v(rank ? '#' + rank : 'None yet')}</div>
    </div>`;
}

// Solved challenges first, then every challenge this player has not solved, as rows that open it.
function solvedHtml(p, challenges, { self, local, demo }) {
  const bySlug = new Map(challenges.map((c) => [c.slug, c]));
  const list = p.solved.slice().sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')));
  const done = new Set(list.map((s) => s.slug));
  const open = challenges.filter((c) => !done.has(c.slug)).sort((a, b) => a.level - b.level);
  const mine = local || self;
  const note = list.length ? `${list.length} of ${challenges.length || list.length} solved` : '';
  const rows = list.map((s) => {
    const c = bySlug.get(s.slug);
    const lv = c ? c.level : null;
    return `<a class="chal" href="workspace.html?c=${encodeURIComponent(s.slug)}">
      ${lv ? `<span class="lvl ${levelClass(lv)}">Lv ${lv}</span>` : '<span></span>'}
      <span class="chal-main"><span class="chal-title">${esc(s.title)}</span><span class="chal-brief">${esc(c && c.brief ? c.brief : '')}</span></span>
      <span class="chal-cell"><span class="k">Best</span><span class="v best">${fmtScore(s.best)}</span></span>
      <span class="chal-cell"><span class="k">Prompts</span><span class="v">${s.promptCount}</span></span>
      <span class="chal-cell"><span class="k">When</span><span class="v is-word">${esc(ago(s.when))}</span></span>
      ${ICON.arrow}</a>`;
  }).join('');
  const openRows = open.map((c) => `<a class="chal open" href="workspace.html?c=${encodeURIComponent(c.slug)}">
      <span class="lvl ${levelClass(c.level)}">Lv ${c.level}</span>
      <span class="chal-main"><span class="chal-title">${esc(c.title)}</span><span class="chal-brief">${esc(c.brief || '')}</span></span>
      <span class="chal-cell"><span class="k">Top</span><span class="v${c.topScore == null ? ' is-word' : ''}">${c.topScore ?? 'None yet'}</span></span>
      <span class="chal-cell"><span class="k">Solved by</span><span class="v">${Number(c.solvedCount || 0).toLocaleString('en-US')}</span></span>
      <span class="chal-cell"><span class="k">Status</span><span class="v quiet">${mine ? 'Not tried' : 'Not solved'}</span></span>
      ${ICON.arrow}</a>`).join('');
  const who = mine ? 'You have' : `${esc(p.username)} has`;
  const none = list.length ? '' : `<p class="pf-none">${who} not solved a challenge yet</p>`;
  const openHead = open.length ? `<div class="panel-head pf-sub"><h3 class="h">${mine ? 'Not tried yet' : 'Not solved yet'}</h3><span class="note">${open.length} open</span></div>` : '';
  return `<section class="panel grow"><div class="panel-head"><div class="ph-l"><h2 class="h">Solved challenges</h2>${demo ? demoTag() : ''}</div><span class="note">${note}</span></div>
    ${none}<div class="pf-list">${rows}</div>${openHead}<div class="pf-list">${openRows}</div></section>`;
}

function bucketsHtml(p) {
  const counts = BUCKETS.map((b) => p.solved.filter((s) => s.promptCount >= b.lo && s.promptCount <= b.hi).length);
  const max = Math.max(1, ...counts);
  const bars = BUCKETS.map((b, i) => `<div class="bd-bar"><span>${b.label}</span><span class="track"><span class="fill" style="width:${Math.round((counts[i] / max) * 100)}%"></span></span><span class="c">${counts[i]}</span></div>`).join('');
  return `<section class="panel"><div class="panel-head"><h2 class="h">Prompts per solve</h2><span class="note">Best attempt on each</span></div>
    <div class="bd-bars">${bars}</div>
    <p class="callout">${ICON.info}<span>A perfect 100 is rare, <b>the high 80s and 90s</b> are strong</span></p></section>`;
}

function nextHtml(next, detail, other) {
  if (!next) {
    return `<section class="panel grow pf-next"><div class="panel-head"><h2 class="h">Next challenge</h2></div>
      <div class="empty">${ICON.target}<p class="title">No challenges are open right now</p><a class="btn btn-secondary" href="challenges.html">Browse challenges</a></div></section>`;
  }
  const c = next.c;
  const frame = detail && detail.goalUrl
    ? `<div class="frame-lbl"><span class="lvl w sm">G</span>Goal page</div><div class="frame"><iframe sandbox="allow-same-origin" src="${esc(detail.goalUrl)}" title="Goal page for ${esc(c.title)}" tabindex="-1"></iframe></div>`
    : '';
  // On someone else's page this is about them: one they have not solved, with no "your" numbers.
  const head = other ? `Try one ${esc(other)} has not solved` : 'Next challenge';
  const note = other ? '' : next.fresh ? 'Not tried yet' : 'Your lowest score';
  const top = c.topScore == null ? '<div class="v is-word">None yet</div>' : `<div class="v">${c.topScore}</div>`;
  return `<section class="panel grow pf-next"><div class="panel-head"><h2 class="h">${head}</h2><span class="note">${note}</span></div>
    ${frame}
    <div class="t"><span class="lvl ${levelClass(c.level)}">Lv ${c.level}</span><h3>${esc(c.title)}</h3></div>
    <p>${esc(c.brief || '')}</p>
    <div class="kvrow">
      <div class="stat"><div class="k">Players solved</div><div class="v">${Number(c.solvedCount || 0).toLocaleString('en-US')}</div></div>
      <div class="stat"><div class="k">Top score</div>${top}</div>
      ${other ? '' : `<div class="stat"><div class="k">Your best</div>${c.yourBest == null ? '<div class="v is-word">None yet</div>' : `<div class="v">${c.yourBest}</div>`}</div>`}
    </div>
    <a class="btn btn-primary block" href="workspace.html?c=${encodeURIComponent(c.slug)}">${ICON.play}${other ? 'Try this challenge' : next.fresh ? 'Start this challenge' : 'Try it again'}</a></section>`;
}

function notFound(name) {
  $('head').outerHTML = '';
  $('body').innerHTML = `<section class="panel pf-missing" style="grid-column:1 / -1"><div class="empty">${ICON.user}
    <h1 class="title">There is no player called ${esc(name)}</h1>
    <p class="small">Check the spelling or pick a player from the board</p>
    <a class="btn btn-secondary" href="leaderboard.html">Open the leaderboard</a></div></section>`;
}

function errorView(message) {
  $('head').innerHTML = `<p class="bd-err" role="alert"><span>${esc(message || 'This profile did not load, try again')}</span><button type="button" class="btn btn-secondary sm" id="retry">Try again</button></p>`;
  $('body').innerHTML = '';
  $('retry').addEventListener('click', () => location.reload());
}

// ---------------------------------------------------------------- start

// Independent calls start together; the head, the list and the side panel each paint when their data arrives.
async function start() {
  const u = new URLSearchParams(location.search).get('u');
  const asked = u ? u.trim() : null;
  mountShell(asked
    ? { active: 'leaderboard', user: null, crumb: [{ label: 'Leaderboard', href: 'leaderboard.html' }, { label: asked }] }
    : { active: 'profile', user: null, crumb: [{ label: 'Profile' }] });
  const profileP = asked ? getProfile(asked) : null;
  if (profileP) profileP.catch(() => {}); // handled below
  const [viewer, challenges] = await Promise.all([me().catch(() => null), listChallenges().catch(() => [])]);

  const name = asked || (viewer ? viewer.username : null);
  const self = !!(viewer && name && viewer.username === name);
  const local = !name;
  mountShell({
    active: self || local ? 'profile' : 'leaderboard',
    user: shellUser(viewer),
    crumb: self || local ? [{ label: 'Profile' }] : [{ label: 'Leaderboard', href: 'leaderboard.html' }, { label: name }],
  });

  let p;
  try {
    p = local ? await localProfile(challenges) : await (profileP || getProfile(name));
  } catch (err) {
    if (err && err.status === 404) notFound(name);
    else errorView(err && err.message);
    return;
  }
  document.title = `${local ? 'Your runs' : p.username} - promptdyno`;

  const bySlug = new Map(challenges.map((c) => [c.slug, c]));
  const solvedSlugs = new Set(p.solved.map((s) => s.slug));
  const other = !(self || local);
  const notSolved = challenges.slice().sort((a, b) => a.level - b.level).find((c) => !solvedSlugs.has(c.slug));
  const next = other ? (notSolved ? { c: notSolved, fresh: true } : null) : pickNext(challenges, new Set());
  const rankP = overallRank(p.username, local);
  const detailP = next ? getChallenge(next.c.slug).catch(() => null) : Promise.resolve(null);

  $('body').innerHTML =
    `<div class="pf-main">${solvedHtml(p, challenges, { self, local, demo: !self && !local && isSimulated('profile') })}</div>` +
    `<aside class="bd-side" id="pfSide"><section class="panel grow"><div class="skel"><i></i><i></i><i class="line"></i></div></section>${bucketsHtml(p)}</aside>`;

  rankP.then((rank) => {
    $('head').innerHTML = headHtml(p, { self, local, rank });
    const out = $('logoutBtn');
    if (out) out.addEventListener('click', async () => {
      out.disabled = true;
      try { await logout(); } catch { /* the landing page shows the true state */ }
      location.assign('index.html');
    });
  });
  detailP.then((detail) => {
    $('pfSide').firstElementChild.outerHTML = nextHtml(next, detail, self || local ? null : p.username);
    fitFrames($('pfSide'));
  });
}

start();
