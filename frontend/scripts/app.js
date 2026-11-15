const challenges = [
  {
    slug: '01-simple-shape', title: 'Circle study', difficulty: 'FOUNDATIONS',
    description: 'Recreate one centered red circle on a plain white background.',
    file: '01-simple-shape/index.html',
    criteria: [
      { label: 'Shape', terms: ['circle', 'round', 'round shape', 'disc'] },
      { label: 'Color', terms: ['red', 'crimson', 'scarlet'] },
      { label: 'Placement', terms: ['center', 'centered', 'middle'] },
      { label: 'Scale & canvas', terms: ['large', '120', 'white', 'background'] },
    ],
  },
  {
    slug: '02-shape-study', title: 'Shape study', difficulty: 'STARTER',
    description: 'Place a red circle, blue square, and yellow triangle in one evenly spaced horizontal row on a light gray canvas.',
    file: '02-shape-study/index.html',
    criteria: [
      { label: 'Three shapes', terms: ['circle', 'square', 'triangle'] },
      { label: 'Color palette', terms: ['red', 'blue', 'yellow', 'primary'] },
      { label: 'Arrangement', terms: ['horizontal', 'row', 'in a line', 'left to right', 'side by side', 'aligned'] },
      { label: 'Balance & canvas', terms: ['equal', 'evenly', 'consistent', 'spacing', 'gap', 'gray', 'grey', 'background'] },
    ],
  },
  {
    slug: '03-profile-card', title: 'Profile card', difficulty: 'BUILDER',
    description: 'Build a profile card with initials, Mina Patel’s details, and a Follow button.',
    file: '03-profile-card/index.html',
    criteria: [
      { label: 'Card layout', terms: ['card', 'rounded', 'shadow', 'white'] },
      { label: 'Profile details', terms: ['avatar', 'initials', 'mina', 'patel', 'designer', 'portland', 'bio'] },
      { label: 'Typography', terms: ['font', 'heading', 'name', 'small label', 'bold'] },
      { label: 'Action & accent', terms: ['follow', 'button', 'purple', 'yellow', 'shadow'] },
    ],
  },
  {
    slug: '04-coffee-shop', title: 'The daily pour', difficulty: 'INTERMEDIATE',
    description: 'Recreate Daybreak Coffee’s bold orange-and-blue landing page with a geometric mug illustration.',
    file: '04-coffee-shop/index.html',
    criteria: [
      { label: 'Page layout', terms: ['layout', 'hero', 'navigation', 'nav', 'header', 'columns', 'split', 'footer'] },
      { label: 'Palette', terms: ['orange', 'blue', 'yellow', 'cream'] },
      { label: 'Typography', terms: ['font', 'type', 'bold', 'uppercase', 'headline', 'large'] },
      { label: 'Coffee details', terms: ['coffee', 'mug', 'button', 'order', 'curious', 'daybreak', 'portland', 'roasted'] },
    ],
  },
  {
    slug: '05-login-form', title: 'Sign in screen', difficulty: 'ADVANCED',
    description: 'Recreate a split-screen login with a dark graphic panel and a white form containing email, password, and remember me.',
    file: '05-login-form/index.html',
    criteria: [
      { label: 'Form composition', terms: ['split', 'left panel', 'right panel', 'dark', 'blue', 'white'] },
      { label: 'Input fields', terms: ['email', 'password', 'input', 'field', 'placeholder'] },
      { label: 'Account details', terms: ['welcome', 'back', 'remember', 'forgot', 'account', 'sign in'] },
      { label: 'Actions & finish', terms: ['button', 'green', 'create account', 'logo', 'brand', 'spacing'] },
    ],
  },
];

const promptInput = document.querySelector('#prompt');
const buildButton = document.querySelector('#build-button');
const scoreNode = document.querySelector('#score');
const scoreDetail = document.querySelector('#score-detail');
const output = document.querySelector('#output');
const outputStatus = document.querySelector('#output-status');
const toast = document.querySelector('#toast');
const attemptsNode = document.querySelector('#attempt-count');
const charCount = document.querySelector('#char-count');
const referenceFrame = document.querySelector('#reference-frame');
const expandedFrame = document.querySelector('#enlarged-reference');
const challengeSelect = document.querySelector('#challenge-select');
const selectedTargetKey = 'promptdyno-current-target';

let currentIndex = Math.max(0, Math.min(challenges.length - 1, Number(localStorage.getItem(selectedTargetKey) || 0)));
let attempts = 0;
let best = 0;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
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
  document.querySelector('#criteria-list').innerHTML = challenge.criteria.map((item, index) => `<span><i>${String(index + 1).padStart(2, '0')}</i> ${item.label}</span>`).join('');
  referenceFrame.src = `/testHtml/${challenge.file}`;
  referenceFrame.title = `Target: ${challenge.title}`;
  promptInput.placeholder = `Describe the ${challenge.title.toLowerCase()} you want to build...\n\nBe specific about the visible shapes, colors, placement, and details.`;
  scoreNode.textContent = '—';
  scoreDetail.textContent = 'Build a page to get your first score';
  document.querySelector('#score-breakdown').replaceChildren();
  output.innerHTML = '<div class="empty-state"><span class="empty-icon">↗</span><b>Your page will show up here.</b><small>Write a prompt above, then hit build.</small></div>';
  outputStatus.textContent = 'WAITING FOR PROMPT';
  outputStatus.parentElement.classList.remove('ready');
  buildButton.querySelector('span:first-child').textContent = 'Build my page';
}

challengeSelect.addEventListener('change', () => {
  setChallenge(Number(challengeSelect.value));
});

function setChallenge(index) {
  currentIndex = (index + challenges.length) % challenges.length;
  localStorage.setItem(selectedTargetKey, String(currentIndex));
  promptInput.value = '';
  charCount.textContent = '0 / 500';
  updateProgress();
}

document.querySelector('#previous-target').addEventListener('click', () => setChallenge(currentIndex - 1));
document.querySelector('#next-target').addEventListener('click', () => setChallenge(currentIndex + 1));

promptInput.addEventListener('input', () => {
  charCount.textContent = `${promptInput.value.length} / 500`;
});

document.querySelector('#open-reference').addEventListener('click', () => {
  expandedFrame.src = referenceFrame.src;
  dialog.showModal();
});
const dialog = document.querySelector('#reference-dialog');
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

function scorePrompt(prompt, challenge) {
  const text = prompt.toLowerCase();
  const checks = challenge.criteria.map(criteria => ({ ...criteria, weight: 25 }));
  const earned = checks.map(check => {
    const hits = check.terms.filter(term => text.includes(term)).length;
    return hits ? Math.min(25, Math.round(25 * Math.min(hits / 2, 1))) : 0;
  });
  const lengthBonus = Math.min(10, Math.floor(prompt.trim().split(/\s+/).length / 8));
  const total = Math.min(100, earned.reduce((sum, value) => sum + value, 0) + lengthBonus);
  return { total, earned, checks };
}

function promptColor(text) {
  if (text.includes('blue')) return ['#edf1fb', '#2857d5', '#202c51'];
  if (text.includes('pink')) return ['#f2e7e3', '#c98783', '#684946'];
  if (text.includes('red') || text.includes('terracotta')) return ['#ffffff', '#e53935', '#222222'];
  if (text.includes('purple')) return ['#e9e7ff', '#6b5ce7', '#20202a'];
  if (text.includes('orange')) return ['#f8e9d2', '#f26b38', '#202c51'];
  if (text.includes('green')) return ['#e6eadf', '#526e57', '#354c39'];
  if (text.includes('gold') || text.includes('yellow')) return ['#f1eee1', '#d8b866', '#74643c'];
  return ['#ffffff', '#e53935', '#222222'];
}

function outputPage(prompt, challenge) {
  const [background, accent, ink] = promptColor(prompt.toLowerCase());
  const result = document.createElement('div');
  result.className = `mini-result mini-result-${currentIndex}`;
  result.style.setProperty('--mini-bg', background);
  result.style.setProperty('--mini-accent', accent);
  result.style.setProperty('--mini-ink', ink);

  const previews = [
    '<div class="mini-canvas"><i class="mini-circle"></i></div>',
    '<div class="mini-canvas mini-composition"><i class="mini-circle"></i><i class="mini-square"></i><i class="mini-triangle"></i></div>',
    '<div class="mini-profile"><i>MP</i><div><small>PRODUCT DESIGNER</small><b>Mina Patel</b><span>Portland, Oregon · Follow</span></div></div>',
    '<div class="mini-coffee"><small>DAYBREAK　 MENU　 OUR STORY　 VISIT</small><div><b>START<br>SOMEWHERE GOOD.</b><i>☕</i></div><span>COFFEE FOR THE CURIOUS</span></div>',
    '<div class="mini-login"><i>GRAPHIC</i><b>Welcome back</b><span>Email address　____________</span><span>Password　　　____________</span><span>□ Remember me</span><strong>Log in →</strong></div>',
  ];
  result.innerHTML = previews[currentIndex];
  result.setAttribute('aria-label', `Local preview for ${challenge.title}`);
  return result;
}

function updateLeaderboard(score) {
  if (score <= best) return;
  best = score;
  document.querySelector('#your-score').innerHTML = `${score} <small>pts</small>`;
  const rank = score > 91 ? '01' : score > 84 ? '02' : score > 78 ? '03' : '04';
  document.querySelector('#your-rank').textContent = rank;
}

buildButton.addEventListener('click', () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    showToast('Write a prompt first, then build your page.');
    return;
  }

  attempts += 1;
  attemptsNode.textContent = attempts;
  buildButton.disabled = true;
  buildButton.querySelector('span:first-child').textContent = 'Building your page…';
  outputStatus.textContent = 'BUILDING';
  outputStatus.parentElement.classList.remove('ready');

  window.setTimeout(() => {
    const challenge = challenges[currentIndex];
    const result = scorePrompt(prompt, challenge);
    output.replaceChildren(outputPage(prompt, challenge));
    scoreNode.textContent = result.total;
    const achieved = result.checks.filter((_, index) => result.earned[index] > 0).map(check => check.label.toLowerCase());
    scoreDetail.textContent = achieved.length ? `You covered: ${achieved.join(', ')}.` : 'Call out more visible details to improve your score.';
    document.querySelector('#score-breakdown').innerHTML = result.checks.map((check, index) => `<span>${check.label}<b>${result.earned[index]}/${check.weight}</b></span>`).join('');
    outputStatus.textContent = 'PAGE READY';
    outputStatus.parentElement.classList.add('ready');
    buildButton.disabled = false;
    buildButton.querySelector('span:first-child').textContent = 'Build again';
    updateLeaderboard(result.total);
    showToast(`Page built. You scored ${result.total} out of 100.`);
  }, 450);
});

const resultStyles = document.createElement('style');
resultStyles.textContent = `.mini-result{width:100%;height:100%;min-height:82px;background:var(--mini-bg);color:var(--mini-ink);font-family:Manrope,sans-serif;display:grid;place-items:center;padding:6px}.mini-canvas{width:100%;height:100%;display:grid;place-items:center;background:var(--mini-bg)}.mini-circle{width:48px;height:48px;border-radius:50%;background:var(--mini-accent)}.mini-composition{position:relative;width:110px;height:65px}.mini-composition .mini-circle{position:absolute;left:0;top:15px;width:38px;height:38px}.mini-square{position:absolute;left:34px;top:2px;width:34px;height:34px;background:#526e57}.mini-triangle{position:absolute;right:0;bottom:0;width:0;height:0;border-left:21px solid transparent;border-right:21px solid transparent;border-bottom:38px solid #d8b866}.mini-profile{width:min(220px,95%);padding:9px;display:flex;gap:8px;align-items:center;border-radius:7px;background:#fff;box-shadow:0 4px 14px #17211914}.mini-profile>i{width:29px;height:29px;display:grid;place-items:center;border-radius:50%;background:#dbe4d1;color:#496448;font:700 12px Georgia}.mini-profile>div{display:flex;flex-direction:column;gap:3px}.mini-profile small{font-size:5px;color:#8b987d}.mini-profile b{font:600 10px Georgia}.mini-profile span{font-size:6px;color:#557451}.mini-coffee{width:100%;height:100%;padding:6px;background:#efeee5;display:flex;flex-direction:column;justify-content:space-between}.mini-coffee small,.mini-coffee>span{font:5px 'DM Mono';color:#65745d}.mini-coffee>div{display:flex;justify-content:space-between;align-items:center}.mini-coffee>div b{font:14px/.95 Georgia;color:#283c30}.mini-coffee>div i{font-size:25px;font-style:normal}.mini-login{width:min(160px,95%);padding:8px;display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #e2e5dc;border-radius:5px;box-shadow:0 4px 12px #17211912}.mini-login i{width:12px;height:12px;display:grid;place-items:center;border-radius:3px;background:#305d43;color:#fff;font:7px Arial}.mini-login b{font:7px Georgia;margin:1px 0 3px}.mini-login span{font:5px Arial;color:#748074}.mini-login strong{padding:4px;text-align:center;background:#305d43;color:#fff;font:6px Arial;border-radius:2px}@media(max-width:760px){.mini-result{min-height:82px}}`;
document.head.append(resultStyles);

updateProgress();
