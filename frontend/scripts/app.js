const challenges = [
  { slug: '01-simple-shape', title: 'Circle study', difficulty: 'FOUNDATIONS', description: 'Recreate one centered red circle on a plain white background.', file: '01-simple-shape/index.html' },
  { slug: '02-shape-study', title: 'Shape study', difficulty: 'STARTER', description: 'Place a red circle, blue square, and yellow triangle in one evenly spaced horizontal row on a light gray canvas.', file: '02-shape-study/index.html' },
  { slug: '03-profile-card', title: 'Profile card', difficulty: 'BUILDER', description: 'Build a profile card with initials, Mina Patel’s details, and a Follow button.', file: '03-profile-card/index.html' },
  { slug: '04-coffee-shop', title: 'The daily pour', difficulty: 'INTERMEDIATE', description: 'Recreate Daybreak Coffee’s bold orange-and-blue landing page with a geometric mug illustration.', file: '04-coffee-shop/index.html' },
  { slug: '05-login-form', title: 'Sign in screen', difficulty: 'ADVANCED', description: 'Recreate a split-screen login with a dark graphic panel and a white form containing email, password, and remember me.', file: '05-login-form/index.html' },
];

const promptInput = document.querySelector('#prompt');
const htmlInput = document.querySelector('#html-source');
const cssInput = document.querySelector('#css-source');
const buildButton = document.querySelector('#build-button');
const scoreNode = document.querySelector('#score');
const scoreDetail = document.querySelector('#score-detail');
const output = document.querySelector('#output');
const preview = document.querySelector('#candidate-preview');
const outputStatus = document.querySelector('#output-status');
const toast = document.querySelector('#toast');
const attemptsNode = document.querySelector('#attempt-count');
const charCount = document.querySelector('#char-count');
const referenceFrame = document.querySelector('#reference-frame');
const expandedFrame = document.querySelector('#enlarged-reference');
const challengeSelect = document.querySelector('#challenge-select');
const dialog = document.querySelector('#reference-dialog');
const selectedTargetKey = 'promptdyno-current-target';

let currentIndex = Math.max(0, Math.min(challenges.length - 1, Number(localStorage.getItem(selectedTargetKey) || 0)));
let attempts = 0;
let best = 0;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateProgress() {
  const challenge = challenges[currentIndex];
  document.querySelector('#path-progress-label').textContent = `Target ${currentIndex + 1} of ${challenges.length}`;
  document.querySelector('#path-progress-fill').style.width = `${((currentIndex + 1) / challenges.length) * 100}%`;
  document.querySelector('#path-progress-hint').textContent = 'Use the arrows or list to browse all targets.';
  challengeSelect.value = String(currentIndex);
  [...challengeSelect.options].forEach((option, index) => {
    option.disabled = false;
    option.textContent = `${String(index + 1).padStart(2, '0')} · ${challenges[index].title}`;
  });
  document.querySelector('#target-count').textContent = `${String(currentIndex + 1).padStart(2, '0')} / ${String(challenges.length).padStart(2, '0')}`;
  document.querySelector('#challenge-number').textContent = String(currentIndex + 1).padStart(2, '0');
  document.querySelector('#intro-challenge-label').textContent = `CHALLENGE ${String(currentIndex + 1).padStart(2, '0')}`;
  document.querySelector('#challenge-title').textContent = challenge.title;
  document.querySelector('#challenge-level').textContent = challenge.difficulty;
  document.querySelector('#challenge-description').textContent = challenge.description;
  document.querySelector('#criteria-list').innerHTML = ['Content', 'Layout', 'Style', 'Visual match'].map((label, index) => `<span><i>${String(index + 1).padStart(2, '0')}</i> ${label}</span>`).join('');
  referenceFrame.src = `/testHtml/${challenge.file}`;
  referenceFrame.title = `Target: ${challenge.title}`;
  promptInput.placeholder = `Write the prompt you would give your model for the ${challenge.title.toLowerCase()}.`;
  htmlInput.value = '';
  cssInput.value = '';
  preview.hidden = true;
  output.querySelector('.empty-state').hidden = false;
  scoreNode.textContent = '—';
  scoreDetail.textContent = 'Render generated HTML and CSS to get a score';
  document.querySelector('#score-breakdown').replaceChildren();
  outputStatus.textContent = 'WAITING FOR SUBMISSION';
  outputStatus.parentElement.classList.remove('ready', 'error');
  buildButton.querySelector('span:first-child').textContent = 'Render & grade';
}

function setChallenge(index) {
  currentIndex = (index + challenges.length) % challenges.length;
  localStorage.setItem(selectedTargetKey, String(currentIndex));
  updateProgress();
}

challengeSelect.addEventListener('change', () => setChallenge(Number(challengeSelect.value)));
document.querySelector('#previous-target').addEventListener('click', () => setChallenge(currentIndex - 1));
document.querySelector('#next-target').addEventListener('click', () => setChallenge(currentIndex + 1));
promptInput.addEventListener('input', () => { charCount.textContent = `${promptInput.value.length} / 500`; });

document.querySelector('#open-reference').addEventListener('click', () => {
  expandedFrame.src = referenceFrame.src;
  dialog.showModal();
});
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

function previewDocument(html, css) {
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'">`;
  const additions = `${policy}<style>${safeCss}</style>`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, head => `${head}${additions}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, tag => `${tag}<head>${additions}</head>`);
  return `<!doctype html><html><head><meta charset="utf-8">${additions}</head><body>${html}</body></html>`;
}

function updateLeaderboard(score) {
  if (score <= best) return;
  best = score;
  document.querySelector('#your-score').innerHTML = `${score.toFixed(1)} <small>pts</small>`;
  const rank = score > 91 ? '01' : score > 84 ? '02' : score > 78 ? '03' : '04';
  document.querySelector('#your-rank').textContent = rank;
}

function renderBreakdown(breakdown) {
  const labels = [
    ['content', 'Content'], ['layout', 'Layout'], ['style', 'Style'], ['visual', 'Visual match'],
  ];
  document.querySelector('#score-breakdown').innerHTML = labels.map(([key, label]) => {
    const value = breakdown[key];
    return `<span>${label}<b>${value === null ? 'N/A' : `${value.toFixed(1)}/100`}</b></span>`;
  }).join('');
}

buildButton.addEventListener('click', async () => {
  const html = htmlInput.value.trim();
  const css = cssInput.value;
  if (!html) {
    htmlInput.focus();
    showToast('Paste the generated HTML before grading.');
    return;
  }

  attempts += 1;
  attemptsNode.textContent = attempts;
  buildButton.disabled = true;
  buildButton.querySelector('span:first-child').textContent = 'Rendering and grading…';
  outputStatus.textContent = 'GRADING PAGE';
  outputStatus.parentElement.classList.remove('ready', 'error');
  output.querySelector('.empty-state').hidden = true;
  preview.hidden = false;
  preview.srcdoc = previewDocument(html, css);

  try {
    const response = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge: challenges[currentIndex].slug, html, css }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The grader could not process your page.');

    const { result } = data;
    scoreNode.textContent = result.total.toFixed(1);
    updateLeaderboard(result.total);
    renderBreakdown(result.breakdown);
    scoreDetail.textContent = result.error
      ? `Grader could not render this submission: ${result.error}`
      : `Rendered-page comparison · grader ${result.version} · ${result.details.matchedBlocks} of ${result.details.goalBlocks} target elements matched.`;
    outputStatus.textContent = result.error ? 'RENDER ERROR' : 'PAGE GRADED';
    outputStatus.parentElement.classList.add(result.error ? 'error' : 'ready');
    buildButton.querySelector('span:first-child').textContent = 'Grade again';
    showToast(result.error ? 'The page did not render. Review the submission and try again.' : `Rendered page scored ${result.total.toFixed(1)} out of 100.`);
  } catch (error) {
    scoreDetail.textContent = error.message;
    outputStatus.textContent = 'GRADER UNAVAILABLE';
    outputStatus.parentElement.classList.add('error');
    showToast(error.message || 'Could not reach the grader service.');
  } finally {
    buildButton.disabled = false;
  }
});

updateProgress();
