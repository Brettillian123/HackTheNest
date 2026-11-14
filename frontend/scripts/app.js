const promptInput = document.querySelector('#prompt');
const buildButton = document.querySelector('#build-button');
const scoreNode = document.querySelector('#score');
const scoreDetail = document.querySelector('#score-detail');
const output = document.querySelector('#output');
const outputStatus = document.querySelector('#output-status');
const toast = document.querySelector('#toast');
const attemptsNode = document.querySelector('#attempt-count');
const charCount = document.querySelector('#char-count');
const dialog = document.querySelector('#reference-dialog');

let attempts = 0;
let best = 0;
let toastTimer;

const referenceMarkup = document.querySelector('.coffee-site').innerHTML;
document.querySelector('#enlarged-reference').innerHTML = referenceMarkup;

promptInput.addEventListener('input', () => {
  charCount.textContent = `${promptInput.value.length} / 500`;
});

document.querySelector('#open-reference').addEventListener('click', () => dialog.showModal());
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function scorePrompt(prompt) {
  const text = prompt.toLowerCase();
  const checks = [
    { label: 'Layout', terms: ['layout', 'hero', 'nav', 'navigation', 'header', 'column', 'split', 'section', 'left', 'right', 'grid'], weight: 25 },
    { label: 'Color palette', terms: ['color', 'colour', 'green', 'cream', 'beige', 'sage', 'earthy', 'palette', 'warm', 'neutral', 'olive'], weight: 25 },
    { label: 'Typography', terms: ['font', 'type', 'typography', 'serif', 'italic', 'headline', 'heading', 'large text', 'editorial'], weight: 25 },
    { label: 'Key details', terms: ['coffee', 'cup', 'button', 'order', 'morning', 'local', 'shop', 'leaf', 'steam', 'ypsilanti', 'slowday', 'slow day'], weight: 25 },
  ];
  const earned = checks.map(check => {
    const hits = check.terms.filter(term => text.includes(term)).length;
    return hits ? Math.min(check.weight, Math.round(check.weight * Math.min(hits / 2, 1))) : 0;
  });
  const lengthBonus = Math.min(10, Math.floor(prompt.trim().split(/\s+/).length / 8));
  const total = Math.min(100, earned.reduce((sum, n) => sum + n, 0) + lengthBonus);
  return { total, earned, checks };
}

function outputPage(prompt) {
  const result = document.createElement('div');
  result.className = 'mini-result';
  result.innerHTML = `<div class="mini-result-nav"><b>slow<span>day</span></b><span>OUR COFFEE　 OUR STORY　 FIND US</span></div><div class="mini-result-body"><div><small>GOOD COFFEE, NO RUSH.</small><h3>A slower<br>kind of <em>morning.</em></h3><p>Thoughtfully sourced. Slowly made.<br>Right around the corner.</p><button>COME ON IN　↗</button></div><div class="mini-result-art"><i></i><b>☕</b></div></div><div class="mini-result-foot">✳　 LOCAL BY NATURE <span>EST. 2018 · YPSILANTI, MI</span></div>`;
  const text = prompt.toLowerCase();
  const colors = text.includes('blue') ? ['#e7eeef', '#55716e', '#263f3b'] : text.includes('pink') ? ['#f2e7e3', '#9b6b5e', '#52382f'] : text.includes('dark') ? ['#d8d7cd', '#4d5548', '#263126'] : ['#efeee5', '#75815f', '#283c30'];
  result.style.setProperty('--result-bg', colors[0]);
  result.style.setProperty('--result-accent', colors[1]);
  result.style.setProperty('--result-ink', colors[2]);
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
    const result = scorePrompt(prompt);
    output.replaceChildren(outputPage(prompt));
    scoreNode.textContent = result.total;
    const achieved = result.checks.filter((_, index) => result.earned[index] > 0).map(check => check.label.toLowerCase());
    scoreDetail.textContent = achieved.length ? `Nice start — you called out ${achieved.join(', ')}.` : 'Add details about layout, color, type, or coffee shop elements.';
    document.querySelector('#score-breakdown').innerHTML = result.checks.map((check, index) => `<span>${check.label}<b>${result.earned[index]}/${check.weight}</b></span>`).join('');
    outputStatus.textContent = 'PAGE READY';
    outputStatus.parentElement.classList.add('ready');
    buildButton.disabled = false;
    buildButton.querySelector('span:first-child').textContent = 'Build again';
    updateLeaderboard(result.total);
    showToast(`Page built. You scored ${result.total} out of 100.`);
  }, 550);
});

const resultStyles = document.createElement('style');
resultStyles.textContent = `.mini-result{height:100%;min-height:82px;background:var(--result-bg);color:var(--result-ink);font-family:Manrope,sans-serif;display:flex;flex-direction:column;padding:0 9px}.mini-result-nav{height:20px;border-bottom:1px solid color-mix(in srgb,var(--result-ink) 15%,transparent);display:flex;align-items:center;justify-content:space-between;font:5px 'DM Sans';color:var(--result-ink)}.mini-result-nav b{font:800 9px Manrope;letter-spacing:-.6px}.mini-result-nav b span{font-weight:400}.mini-result-body{flex:1;display:grid;grid-template-columns:1fr .8fr;align-items:center;padding-left:9px}.mini-result-body small{font:5px 'DM Mono';letter-spacing:.5px;color:var(--result-accent)}.mini-result-body h3{font:14px/.95 Georgia,serif;margin:4px 0;color:var(--result-ink)}.mini-result-body h3 em{color:var(--result-accent)}.mini-result-body p{font:5px/1.5 'DM Sans';color:var(--result-accent);margin:3px 0}.mini-result-body button{border:1px solid var(--result-accent);background:none;color:var(--result-ink);font:5px 'DM Sans';padding:3px 5px}.mini-result-art{height:42px;border-radius:50%;background:color-mix(in srgb,var(--result-accent) 18%,var(--result-bg));display:grid;place-items:center;position:relative}.mini-result-art i{position:absolute;width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--result-accent) 20%,var(--result-bg))}.mini-result-art b{z-index:1;font-size:17px;filter:grayscale(.4)}.mini-result-foot{height:13px;border-top:1px solid color-mix(in srgb,var(--result-ink) 15%,transparent);display:flex;align-items:center;justify-content:space-between;font:4px 'DM Mono';color:var(--result-accent)}@media(max-width:760px){.mini-result{min-height:82px}}`;
document.head.append(resultStyles);
