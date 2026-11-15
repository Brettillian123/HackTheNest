// Log in, sign up and not-found pages.
// initAuthPage('login' | 'signup') wires the form and side panel; initNotFound() fills 404.html.
import { mountShell, shellUser, WELCOME_KEY } from './shell.js';
import { esc, levelClass, demoTag } from './ui.js';
import * as api from './api.js';

const USERNAME_RE = api.USERNAME_RE;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ helpers

// Same-site relative path from ?next=, else challenges.html.
export function safeNext(raw) {
  const fallback = 'challenges.html';
  if (typeof raw !== 'string') return fallback;
  const s = raw.trim();
  if (!s || s.startsWith('//') || /[\\\s]/.test(s) || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.includes('://')) return fallback;
  try {
    const u = new URL(s, location.href);
    if (u.origin !== location.origin) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

function nextParam() {
  return new URLSearchParams(location.search).get('next');
}

function mount(active, u) {
  mountShell({ active, user: shellUser(u) });
}

// Waiting scores: the anonymous player's best on each challenge (the same record the leaderboard uses).
async function loadWaiting() {
  let list = [];
  try { list = await api.listChallenges(); } catch { return { list: [], waiting: [] }; }
  const waiting = list
    .filter((c) => c.yourBest != null)
    .map((c) => ({ ...c, best: Number(c.yourBest), prompts: Number(c.yourBestPrompts) || 1 }));
  return { list, waiting };
}

function stat(k, v) {
  return `<div class="stat"><div class="k">${esc(k)}</div><div class="v${/\d/.test(String(v)) ? '' : ' is-word'}">${esc(v)}</div></div>`;
}

const ICON_INFO = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="5.5"/><path d="M7 6.2v3.6M7 4.3v.1"/></svg>';

const BOARD_ROWS = 8;

// Leaderboard rows to show: the top eight, with your row as the last one when you are lower down.
function boardRows(board) {
  const rows = (board && board.rows) || [];
  const top = rows.slice(0, BOARD_ROWS);
  const you = rows.find((r) => r.isYou);
  if (you && !top.includes(you)) return [...rows.slice(0, BOARD_ROWS - 1), you];
  return top;
}

// One short leaderboard table from #1.
function table(board) {
  const rows = boardRows(board);
  if (!rows.length) return '';
  const ini = (n) => String(n).replace(/[_\-.]+/g, ' ').trim().slice(0, 2).toUpperCase();
  return '<table class="lbt"><thead><tr><th>Rank</th><th>Player</th><th class="r">Prompts</th><th class="r">Score</th></tr></thead><tbody>' +
    rows.map((r) => `<tr${r.isYou ? ' class="you"' : ''}><td class="pos">#${esc(r.rank)}</td><td><span class="who"><span class="avatar">${esc(ini(r.username))}</span>${esc(r.isYou ? 'You' : r.username)}</span></td><td class="r num">${esc(r.promptCount)}</td><td class="r sc-cell">${esc(r.score)}</td></tr>`).join('') +
    '</tbody></table>';
}

async function renderSide(kind, signedIn) {
  const side = $('authSide');
  const stats = $('headStats');
  const { list, waiting } = await loadWaiting();
  const verb = kind === 'signup' ? 'Sign up' : 'Log in';

  if (stats) {
    stats.classList.add('keep');
    stats.innerHTML = stat('Challenges', list.length || 'None yet') +
      stat('Scores waiting', waiting.length) +
      stat('Your best', waiting.length ? Math.max(...waiting.map((w) => w.best)) : 'None yet');
  }

  if (waiting.length && !signedIn) {
    const top = waiting.reduce((a, b) => (b.best > a.best ? b : a));
    const names = waiting.map((w) => `${w.title} ${w.best}`).join(', ');
    let board = null;
    try { board = await api.getLeaderboard(top.slug); } catch { board = null; }
    const you = board && board.you;
    const n = waiting.length;
    side.innerHTML =
      `<section class="panel score">
        <div class="panel-head"><h2 class="h">Scores waiting</h2><span class="note">Saved on this browser only</span></div>
        <div class="sc">
          <div class="bigscore"><span class="n">${esc(top.best)}</span><span class="of">/100</span></div>
          <div class="info"><div class="gain">${n} ${n === 1 ? 'score' : 'scores'} waiting</div>
          <div class="rk">Best on ${esc(top.title)}${you ? `, would rank #${esc(you.rank)}` : ''}</div></div>
        </div>
        <p class="callout">${ICON_INFO}<span>You have ${n} ${n === 1 ? 'score' : 'scores'} waiting: ${esc(names)}. <b>${verb} to keep them and join the leaderboard.</b></span></p>
        <div class="wait">${waiting.map((w) =>
          `<a href="workspace.html?c=${encodeURIComponent(w.slug)}"><span class="lvl ${levelClass(w.level)} sm">Lv ${esc(w.level)}</span><span class="t">${esc(w.title)}</span><span class="p">${esc(w.prompts)} ${w.prompts === 1 ? 'prompt' : 'prompts'}</span><span class="s">${esc(w.best)}</span></a>`,
        ).join('')}</div>
      </section>` +
      (board && board.rows && board.rows.length
        ? `<section class="panel grow">
            <div class="panel-head"><div class="ph-l"><h2 class="h">Leaderboard</h2>${api.isSimulated('boards') ? demoTag() : ''}</div><span class="note">Challenge: ${esc(top.title)}</span></div>
            ${table(board)}
          </section>`
        : '');
    return;
  }

  // No waiting scores (or signed in): a small real preview from the first challenge's board.
  const first = list[0];
  let board = null;
  if (first) { try { board = await api.getLeaderboard(first.slug); } catch { board = null; } }
  const rows = (board && board.rows) || [];
  const lead = rows[0];
  side.innerHTML =
    `<section class="panel score">
      <div class="panel-head"><div class="ph-l"><h2 class="h">Top score</h2>${api.isSimulated('boards') ? demoTag() : ''}</div><span class="note">${first ? `Challenge: ${esc(first.title)}` : ''}</span></div>
      <div class="sc">
        <div class="bigscore"><span class="n">${lead ? esc(lead.score) : '-'}</span><span class="of">/100</span></div>
        <div class="info"><div class="gain">${lead ? esc(lead.username) : 'No runs yet'}</div>
        <div class="rk">${lead ? `${esc(lead.promptCount)} ${lead.promptCount === 1 ? 'prompt' : 'prompts'}, rank #1` : ''}</div></div>
      </div>
      <p class="callout">${ICON_INFO}<span>${signedIn
        ? 'Your runs now count toward this board.'
        : 'Every score you earn with an account goes on this board under your name.'}</span></p>
    </section>` +
    (rows.length
      ? `<section class="panel grow">
          <div class="panel-head"><div class="ph-l"><h2 class="h">Leaderboard</h2>${api.isSimulated('boards') ? demoTag() : ''}</div>${first ? `<a class="note" href="leaderboard.html">See all</a>` : ''}</div>
          ${table(board)}
        </section>`
      : '');
}

// ------------------------------------------------------------ form

const MSG = {
  usernameEmpty: 'Enter a username.',
  usernameBad: 'Use 3 to 20 letters, numbers or underscores.',
  emailEmpty: 'Enter your email.',
  emailBad: 'Enter an email like name@example.com.',
  passwordEmpty: 'Enter your password.',
  passwordShort: 'Use 8 or more characters.',
  passwordLong: 'Use 128 characters or fewer.',
};

function validators(kind) {
  const v = {
    email: (s) => (!s.trim() ? MSG.emailEmpty : EMAIL_RE.test(s.trim()) ? '' : MSG.emailBad),
    // Same limits as the server: 8 to 128 characters.
    password: (s) => (!s ? MSG.passwordEmpty : kind === 'signup' && s.length < 8 ? MSG.passwordShort : kind === 'signup' && s.length > 128 ? MSG.passwordLong : ''),
  };
  if (kind === 'signup') {
    return { username: (s) => (!s.trim() ? MSG.usernameEmpty : USERNAME_RE.test(s.trim()) ? '' : MSG.usernameBad), ...v };
  }
  return v;
}

function setErr(name, msg) {
  const input = $(name);
  if (!input) return;
  const field = input.closest('.field');
  const err = $(name + 'Err');
  field.classList.toggle('bad', !!msg);
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (err) err.textContent = msg || '';
}

function setAlert(msg) {
  const el = $('formAlert');
  if (!el) return;
  el.hidden = !msg;
  el.innerHTML = msg ? `${ICON_INFO}<span>${esc(msg)}</span>` : '';
}

// Which field a server error belongs to, from its status and words.
function fieldFor(e, kind) {
  const m = String((e && e.message) || '').toLowerCase();
  // 409 names both username and email, 401 both email and password, 5xx none: show those above the form.
  if (e && (e.status === 409 || e.status === 401 || !(e.status >= 400 && e.status < 500))) return null;
  if (kind === 'signup' && /username/.test(m)) return 'username';
  if (/password/.test(m)) return 'password';
  if (/email/.test(m)) return 'email';
  return null;
}

function wireToggle() {
  document.querySelectorAll('.pw-tog').forEach((btn) => {
    const input = $(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
}

function wireForm(kind, onDone) {
  const form = $('authForm');
  const btn = $('submitBtn');
  const label = btn.textContent;
  const checks = validators(kind);
  const names = Object.keys(checks);
  const touched = new Set();

  names.forEach((name) => {
    const input = $(name);
    input.addEventListener('blur', () => {
      if (!input.value && !touched.has(name)) return; // do not nag on a field never typed in
      touched.add(name);
      setErr(name, checks[name](input.value));
    });
    input.addEventListener('input', () => {
      touched.add(name);
      if (input.closest('.field').classList.contains('bad')) setErr(name, checks[name](input.value));
    });
  });

  let busy = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setAlert('');
    const errs = names.map((n) => [n, checks[n]($(n).value)]);
    errs.forEach(([n, m]) => setErr(n, m));
    const bad = errs.filter(([, m]) => m);
    if (bad.length) {
      $('announce').textContent = bad.map(([, m]) => m).join(' ');
      $(bad[0][0]).focus();
      return;
    }

    busy = true;
    btn.disabled = true;
    btn.textContent = btn.dataset.busy;
    const email = $('email').value.trim();
    const password = $('password').value;
    try {
      let user;
      if (kind === 'signup') {
        user = await api.signup({ username: $('username').value.trim(), email, password });
        try { await api.claimAttempts(); } catch { /* scores stay on this browser; the account still works */ }
      } else {
        user = await api.login({ email, password });
        try { await api.claimAttempts(); } catch { /* scores stay on this browser */ }
      }
      $('announce').textContent = kind === 'signup' ? 'Account created.' : 'Logged in.';
      try { sessionStorage.setItem(WELCOME_KEY, (user && user.username) || ''); } catch { /* the note is optional */ }
      onDone(user);
    } catch (e) {
      const msg = (e && e.message) || 'Something went wrong. Try again.';
      const field = fieldFor(e, kind);
      if (field) { setErr(field, msg); $(field).focus(); } else { setAlert(msg); $(names[0]).focus(); }
      $('announce').textContent = msg;
      busy = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

function renderSignedIn(kind, user) {
  const card = $('authCard');
  const name = user.username;
  const parts = name.replace(/[_\-.]+/g, ' ').trim().split(/\s+/);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
  const h1 = document.querySelector('.phead-t h1');
  if (h1) h1.textContent = 'Your account';
  card.innerHTML =
    `<div class="panel-head"><h2 class="h" id="authTitle">Signed in</h2><span class="note">${esc(user.email || '')}</span></div>
    <div class="auth-in">
      <div class="auth-who"><span class="avatar lg">${esc(initials)}</span>
        <div><p class="title">You are signed in as ${esc(name)}</p><p class="small">Your runs now save to your account.</p></div></div>
      <div class="auth-acts">
        <a class="btn btn-primary" href="challenges.html" id="goBtn">Go to challenges</a>
        <button class="btn btn-secondary" type="button" id="logoutBtn">Log out</button>
      </div>
      <dl class="kv"><div><dt>Leaderboard name</dt><dd>${esc(name)}</dd></div><div><dt>Email</dt><dd>${esc(user.email || '-')}</dd></div></dl>
    </div>
    <p class="callout auth-bottom">${ICON_INFO}<span>To use a different account, log out first.</span></p>`;
  $('logoutBtn').addEventListener('click', async () => {
    const b = $('logoutBtn');
    b.disabled = true;
    b.textContent = 'Logging out';
    try { await api.logout(); } catch { /* reload shows the true state either way */ }
    location.reload();
  });
  $('goBtn').focus();
}

export async function initAuthPage(kind) {
  // Log in and sign up share the rail's log-in icon.
  const active = 'login';
  let user = null;
  try { user = await api.me(); } catch { user = null; }
  mount(active, user);

  // Keep ?next= when switching between log in and sign up.
  const next = nextParam();
  if (next && safeNext(next) !== 'challenges.html') {
    const sw = $('switchLink');
    sw.href = sw.getAttribute('href') + '?next=' + encodeURIComponent(next);
  }

  if (user) {
    renderSignedIn(kind, user);
    renderSide(kind, true);
    return;
  }
  wireToggle();
  wireForm(kind, () => location.assign(safeNext(nextParam())));
  renderSide(kind, false);
}

// ------------------------------------------------------------ 404

export async function initNotFound() {
  let user = null;
  try { user = await api.me(); } catch { user = null; }
  mount('home', user);
  const p = $('nfPath');
  if (p) { if (/\/404(\.html)?$/.test(location.pathname)) p.remove(); else p.textContent = location.pathname + location.search; }
}
