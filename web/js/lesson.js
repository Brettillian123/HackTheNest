// One lesson: lesson.html?l=<slug>. The Markdown is rendered to safe DOM nodes by markdown.js.
import { mountShell, shellUser } from './shell.js';
import { esc, setStat, levelClass, kindTag, costTag } from './ui.js';
import { getLesson, me } from './api.js';
import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);
const slug = new URLSearchParams(location.search).get('l') || '';

// The lesson's challenges in level order: the first playable one gets the red button.
function bonusRows(list) {
  const first = list.find((c) => c.available !== false);
  return list.map((c) => {
    const off = c.available === false;
    const href = `workspace.html?c=${encodeURIComponent(c.slug)}`;
    const action = off
      ? `<p class="ls-chal-off">${esc(c.unavailableReason || 'Not playable yet')}</p>`
      : `<a class="btn ${c === first ? 'btn-primary' : 'btn-secondary'} sm block" href="${href}">${c === first ? 'Start challenge' : 'Open challenge'}</a>`;
    return `<div class="ls-chal${off ? ' off' : ''}">` +
      `<div class="ls-chal-top"><span class="lvl sm ${levelClass(c.level)}">Lv ${esc(c.level)}</span><span class="ls-chal-t">${esc(c.title)}</span></div>` +
      `<div class="ls-chal-meta">${kindTag(c.kind)}${off ? '' : costTag(c.cost)}</div>${action}</div>`;
  }).join('');
}

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
  const chals = lesson.bonusChallenges && lesson.bonusChallenges.length
    ? lesson.bonusChallenges
    : lesson.bonusChallenge ? [{ slug: lesson.bonusChallenge, title: 'Bonus challenge', level: lesson.level, kind: 'page', cost: null, available: true }] : [];
  if (chals.length) {
    $('bonusList').innerHTML = bonusRows(chals);
    $('bonusBox').hidden = false;
  }
  $('side').hidden = false;
}

start();
