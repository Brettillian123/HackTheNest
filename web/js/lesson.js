// One lesson: lesson.html?l=<slug>. The Markdown is rendered to safe DOM nodes by markdown.js.
import { mountShell, shellUser } from './shell.js';
import { esc, setStat } from './ui.js';
import { getLesson, me } from './api.js';
import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);
const slug = new URLSearchParams(location.search).get('l') || '';

async function start() {
  const crumb = (title) => [{ label: 'Lessons', href: 'lessons.html' }, { label: title }];
  mountShell({ active: 'lessons', user: null, crumb: crumb('Lesson') });
  let lesson;
  try {
    lesson = await getLesson(slug);
  } catch (e) {
    $('split').innerHTML = `<section class="panel empty ls-empty"><p class="title">${esc((e && e.message) || 'That lesson could not load.')}</p><a class="btn btn-secondary" href="lessons.html">All lessons</a></section>`;
    $('split').classList.remove('ls-split');
    return;
  }
  document.title = `${lesson.title} - promptdyno`;
  me().then((u) => mountShell({ active: 'lessons', user: shellUser(u), crumb: crumb(lesson.title) })).catch(() => {});
  const headings = renderMarkdown($('body'), lesson.markdown || `# ${lesson.title}\n\n${lesson.summary}`);
  setStat($('sLevel'), String(lesson.level));
  setStat($('sMin'), lesson.minutes ? `${lesson.minutes} min` : 'Short');
  const toc = headings.filter((h) => h.level >= 2 && h.level <= 3);
  $('toc').innerHTML = toc.length
    ? toc.map((h) => `<li class="${h.level === 3 ? 'sub' : ''}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('')
    : '<li class="small">One short section.</li>';
  if (lesson.bonusChallenge) {
    $('bonus').href = `workspace.html?c=${encodeURIComponent(lesson.bonusChallenge)}`;
    $('bonus').hidden = false;
  }
  $('side').hidden = false;
}

start();
