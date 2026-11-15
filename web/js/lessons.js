// Lessons list: order, title, level, minutes, summary and a link to each lesson.
import { mountShell, shellUser } from './shell.js';
import { esc, levelClass, setStat } from './ui.js';
import { listLessons, me } from './api.js';

const EMPTY = `<section class="panel empty ls-empty"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 4.5c2.5-1 5-1 7 .8v11c-2-1.8-4.5-1.8-7-.8zM17 4.5c-2.5-1-5-1-7 .8v11c2-1.8 4.5-1.8 7-.8z"/></svg><p class="title">Lessons are being written. Check back soon.</p><p class="small">Meanwhile, the challenges are ready to play.</p><a class="btn btn-secondary" href="challenges.html">Browse challenges</a></section>`;

function row(l, i) {
  const href = `lesson.html?l=${encodeURIComponent(l.slug)}`;
  return `<a class="ls-row" href="${href}">` +
    `<span class="ls-n">${String(i + 1).padStart(2, '0')}</span>` +
    `<span class="lvl ${levelClass(l.level)}">Lv ${esc(l.level)}</span>` +
    `<span class="ls-main"><span class="ls-title">${esc(l.title)}</span><span class="ls-sum">${esc(l.summary)}</span></span>` +
    `<span class="ls-min">${l.minutes ? `${esc(l.minutes)} min` : ''}</span>` +
    `<span class="ls-go">Read lesson</span></a>`;
}

async function start() {
  mountShell({ active: 'lessons', user: null });
  me().then((u) => { if (u) mountShell({ active: 'lessons', user: shellUser(u) }); }).catch(() => {});
  const list = document.getElementById('list');
  const lessons = await listLessons().catch(() => []);
  document.getElementById('count').textContent = lessons.length ? `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'}` : 'No lessons yet';
  setStat(document.getElementById('statCount'), String(lessons.length));
  const mins = lessons.reduce((s, l) => s + (l.minutes || 0), 0);
  setStat(document.getElementById('statMin'), mins ? `${mins} min` : 'None yet');
  list.innerHTML = lessons.length ? `<div class="ls-list">${lessons.map(row).join('')}</div>` : EMPTY;
}

start();
