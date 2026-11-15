// promptdyno shell: fills <aside id="rail"> and <header id="nav"> with the v8 rail and top nav.
// mountShell({ active: "challenges" | "leaderboard" | "profile" | "home",
//              user: { name, level, points, initials? } | null,
//              crumb: [{ label, href? }, ...] (optional) })
// Also adds a skip link to <main>, fills <footer id="foot"> when the page has one,
// and shows "Signed in as <name>" once after log in or sign up (flag set by auth-pages.js).
import { esc, levelClass } from './ui.js';

// promptdyno lockup: raptor mark plus the G lettering (design/logo/final/lockup.svg)
const BRAND = '<svg viewBox="0 -14 735 122" class="brand-svg" aria-hidden="true" focusable="false"><g class="b-mark" transform="translate(-2.46 -33.68) scale(1.23)"><path fill-rule="evenodd" d="M2 33C30 32 60 29 80 28C92 27 100 26 110 28C120 30 128 32 134 31C140 30 144 23 150 20C156 17 164 16 172 18L194 26L193 28L166 30L190 34L188 36L166 38C160 39 156 40 152 42C146 44 142 48 136 50C128 54 120 56 112 56C102 57 94 55 88 51C74 44 40 40 2 35ZM165.8 25a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0Z"/><path d="M124 50L137 56L144 62L140 62L141 68L137 64L133 60L120 56Z"/><path d="M88 38C104 34 120 44 125 59L126 63L118 80L130 92L146 94L147 98L122 98L120 94L108 84L106 80L114 66C104 64 92 58 86 50Z"/><path d="M120 94C117 87 122 82 130 84C125 86 124 90 126 94Z"/><path d="M84 46C94 50 100 58 96 66L78 80L68 92L78 95L79 99L56 99L58 92L64 78L82 62C78 58 76 54 76 48Z"/></g><g transform="translate(272.6 0)"><g class="b-prompt"><path d="M0 20L40 20L40 68L0 68ZM0 20L12 20L12 72L0 104.8ZM12 56L28 56L28 32L12 32ZM46 68L46 20L78 20L81 24L77 57.2L73 32L58 32L58 68ZM86 20L126 20L126 68L86 68ZM98 56L114 56L114 32L98 32ZM132 68L132 20L196 20L196 68L184 68L184 32L170 32L170 68L158 68L158 32L144 32L144 68ZM202 20L242 20L242 68L202 68ZM202 20L214 20L214 72L202 104.8ZM214 56L230 56L230 32L214 32ZM256 16L262 5.6L268 16L268 20L278 20L278 32L268 32L268 56L278 56L278 68L256 68L256 32L248 32L248 20L256 20Z"/></g><g class="b-dyno"><path d="M284 20L324 20L324 68L284 68ZM312 68L312 10L340.8 -11.2L324 16L324 68ZM296 56L312 56L312 32L296 32ZM330 20L342 20L342 56L358 56L358 20L370 20L370 68L330 68ZM358 56L370 56L370 82L362 88L313.2 88L358 79ZM376 68L376 20L416 20L416 68L404 68L404 32L388 32L388 68ZM422 20L462 20L462 68L422 68ZM434 56L450 56L450 32L434 32Z"/></g></g></svg>';

const ICONS = {
  challenges: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r=".8" fill="currentColor"/></svg>',
  leaderboard: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 17.5h15M4 17.5V11h3.5v6.5M8.3 17.5V6h3.5v11.5M12.6 17.5V9h3.5v8.5"/></svg>',
  profile: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="7" r="3.5"/><path d="M3.5 17.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5"/></svg>',
  login: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5h3a1.5 1.5 0 011.5 1.5v10a1.5 1.5 0 01-1.5 1.5h-3M8 6.5L11.5 10 8 13.5M11.5 10H3"/></svg>',
};

function railLink(key, href, title, active) {
  const on = active === key ? ' on' : '';
  const cur = on ? ' aria-current="page"' : '';
  return `<a class="rail-link${on}" href="${href}" title="${title}" aria-label="${title}"${cur}>${ICONS[key]}<span class="rail-lbl" aria-hidden="true">${title}</span></a>`;
}

function initialsOf(name) {
  const parts = String(name || '').replace(/[_\-.]+/g, ' ').trim().split(/\s+/);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '').slice(0, 2);
  return s.toUpperCase();
}

// The shell's user object from api.me(): { name, level, points }, or null when signed out.
export function shellUser(u) {
  return u ? { name: u.username, level: u.level, points: u.points } : null;
}

export function mountShell({ active = 'home', user = null, crumb = null } = {}) {
  const rail = document.getElementById('rail');
  const nav = document.getElementById('nav');

  if (rail) {
    rail.classList.add('rail');
    rail.setAttribute('aria-label', 'Main');
    rail.innerHTML =
      railLink('challenges', 'challenges.html', 'Challenges', active) +
      railLink('leaderboard', 'leaderboard.html', 'Leaderboard', active) +
      '<span class="rail-dot" aria-hidden="true"></span>' +
      // Signed out on the profile page (this browser's runs): the profile icon shows, marked, before Log in.
      (user ? railLink('profile', 'profile.html', 'Profile', active)
            : (active === 'profile' ? railLink('profile', 'profile.html', 'Profile', active) : '') + railLink('login', 'login.html', 'Log in', active));
  }

  if (nav) {
    nav.classList.add('top');
    let crumbHtml = '';
    if (Array.isArray(crumb) && crumb.length) {
      crumbHtml = '<div class="crumb">' + crumb.map((c, i) => {
        const last = i === crumb.length - 1;
        const label = esc(c.label);
        const item = last ? `<b>${label}</b>` : (c.href ? `<a href="${esc(c.href)}">${label}</a>` : label);
        return item + (last ? '' : '<span class="sep">/</span>');
      }).join('') + '</div>';
    }
    const link = (key, href, label) =>
      `<a href="${href}"${active === key ? ' class="on" aria-current="page"' : ''}>${label}</a>`;

    let right;
    if (user) {
      // Level tag and points show only when the caller knows them.
      const lv = Number(user.level);
      const pts = Number(user.points);
      right =
        `<a class="nav-me${active === 'profile' ? ' on' : ''}" href="profile.html" title="Your profile">` +
        (user.level != null && Number.isFinite(lv) && lv >= 1 ? `<span class="lvl ${levelClass(lv)}">Lv ${lv}</span>` : '') +
        (user.points != null && Number.isFinite(pts) ? `<span class="pts">${pts.toLocaleString('en-US')}<small>pts</small></span>` : '') +
        `<span class="avatar">${esc(user.initials || initialsOf(user.name))}</span></a>`;
    } else {
      right =
        '<span class="nav-auth">' +
        '<a class="btn btn-ghost" href="login.html">Log in</a>' +
        '<a class="btn btn-primary" href="signup.html">Sign up</a></span>';
    }

    nav.innerHTML =
      '<a class="brand" href="index.html" aria-label="promptdyno">' + BRAND + '</a>' +
      crumbHtml +
      '<nav class="nav-links" aria-label="Site">' +
      link('challenges', 'challenges.html', 'Challenges') +
      link('leaderboard', 'leaderboard.html', 'Leaderboard') +
      right + '</nav>';
  }

  mountSkip();
  mountFoot(user);
  showWelcome();
}

// One "Skip to content" link, first in the tab order.
function mountSkip() {
  const main = document.querySelector('main');
  if (!main || document.querySelector('.skip')) return;
  if (!main.id) main.id = 'main';
  main.setAttribute('tabindex', '-1');
  const a = document.createElement('a');
  a.className = 'skip';
  a.href = '#' + main.id;
  a.textContent = 'Skip to content';
  document.body.prepend(a);
}

// Shared footer. Log in and Sign up give way to Profile when signed in.
function mountFoot(user) {
  const foot = document.getElementById('foot');
  if (!foot) return;
  foot.classList.add('foot');
  const acct = user
    ? '<a href="profile.html">Profile</a>'
    : '<a href="login.html">Log in</a><a href="signup.html">Sign up</a>';
  foot.innerHTML =
    '<a class="word" href="index.html">prompt<i>dyno</i></a>' +
    '<nav aria-label="Footer"><a href="challenges.html">Challenges</a><a href="leaderboard.html">Leaderboard</a>' + acct + '</nav>' +
    '<span class="end">Built at Hack The Nest 2026</span>';
}

export const WELCOME_KEY = 'pd:welcome';

// "Signed in as <name>", once, on the page reached right after log in or sign up.
function showWelcome() {
  let name = null;
  try { name = sessionStorage.getItem(WELCOME_KEY); sessionStorage.removeItem(WELCOME_KEY); } catch { name = null; }
  const main = document.querySelector('main');
  if (!name || !main || document.getElementById('welcome')) return;
  const el = document.createElement('div');
  el.id = 'welcome';
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = `Signed in as ${name}`;
  main.prepend(el);
}
