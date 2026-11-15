// One lesson: lesson.html?l=<slug>. The Markdown is rendered to safe DOM nodes by markdown.js.
import { mountShell, shellUser } from './shell.js';
import { esc, setStat } from './ui.js';
import { getLesson, me } from './api.js';
import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);
const slug = new URLSearchParams(location.search).get('l') || '';

async function start() {
  // The shell and the lesson load together; the shell repaints when the user or the title arrives.
  let user = null;
  let title = 'Lesson';
  const shell = () => mountShell({ active: 'lessons', user: shellUser(user), crumb: [{ label: 'Lessons', href: 'lessons.html' }, { label: title }] });
  shell();
  me().then((u) => { user = u; shell(); }).catch(() => {});
  let lesson;
  try {
    lesson = await getLesson(slug);
  } catch (e) {
    $('split').innerHTML = `<section class="panel empty ls-empty"><p class="title">${esc((e && e.message) || 'That lesson did not load')}</p><a class="btn btn-secondary" href="lessons.html">All lessons</a></section>`;
    $('split').classList.remove('ls-split');
    return;
  }
  document.title = `${lesson.title} - promptdyno`;
  title = lesson.title;
  shell();
  const headings = renderMarkdown($('body'), lesson.markdown || `# ${lesson.title}\n\n${lesson.summary}`);
  setStat($('sLevel'), String(lesson.level));
  setStat($('sMin'), lesson.minutes ? `${lesson.minutes} min` : 'Short');
  const toc = headings.filter((h) => h.level >= 2 && h.level <= 3);
  $('toc').innerHTML = toc.length
    ? toc.map((h) => `<li class="${h.level === 3 ? 'sub' : ''}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('')
    : '<li class="small">One short section</li>';
  if (lesson.bonusChallenge) {
    $('bonus').href = `workspace.html?c=${encodeURIComponent(lesson.bonusChallenge)}`;
    $('bonus').hidden = false;
  }
  $('side').hidden = false;
}

start();
