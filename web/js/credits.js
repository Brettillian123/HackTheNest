// Credits page: balance, today's free challenges, credit packs (Stripe Checkout, test mode) and costs.
// Card entry happens only on Stripe's own page; this page never shows a card form.
// Returning from checkout: ?session_id=... is confirmed once; ?cancelled=1 says so. Both leave the address bar.
import { mountShell, shellUser } from './shell.js';
import { esc, setStat, demoTag } from './ui.js';
import { getBilling, startCheckout, confirmCheckout, me } from './api.js';

const $ = (id) => document.getElementById(id);
const BEST = 1; // the middle pack carries the red button
let user = null;
let billing = null;

function shell() {
  mountShell({ active: 'credits', user: shellUser(user), crumb: [{ label: 'Credits' }] });
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function money(cents, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

// Cost of one standard prompt in this pack, in cents with at most one decimal.
function perPrompt(p) {
  const c = Math.round((p.price / p.credits) * 10) / 10;
  return `${c}¢ per prompt`;
}

function notice(html, bad = false) {
  const el = $('notice');
  el.innerHTML = html;
  el.classList.toggle('bad', bad);
  el.hidden = !html;
}

function resetIn(iso) {
  const ms = Date.parse(iso || '') - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'Midnight UTC';
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `in ${h} h` : `in ${Math.max(1, Math.ceil(ms / 60000))} min`;
}

function renderBalance() {
  const free = (billing && billing.free) || { challengesLeft: 0 };
  const credits = billing && billing.credits != null ? billing.credits : user && user.credits != null ? user.credits : null;
  const left = free.challengesLeft;
  const freeText = left ? `${plural(left, 'free Level 1 challenge', 'free Level 1 challenges')} left today` : 'Free challenges are used up for today';
  setStat($('sFree'), String(left));
  setStat($('sReset'), resetIn(free.resetsAt));
  if (user && credits != null) {
    $('balH').textContent = 'Your balance';
    $('bal').textContent = credits.toLocaleString('en-US');
    $('balUnit').textContent = credits === 1 ? 'credit' : 'credits';
    $('freeLine').textContent = freeText;
  } else {
    // Signed out: today's free challenges are the number that matters.
    $('balH').textContent = 'Free today';
    $('bal').textContent = String(left);
    $('balUnit').textContent = left === 1 ? 'challenge' : 'challenges';
    $('freeLine').textContent = 'Log in to buy credits and keep them';
  }
  if (billing) {
    $('cStd').textContent = plural(billing.costs.standard, 'credit', 'credits');
    $('cLes').textContent = plural(billing.costs.lesson, 'credit', 'credits');
  }
}

function packHtml(p, i) {
  const best = i === BEST;
  const cls = `btn ${best ? 'btn-primary' : 'btn-secondary'} block`;
  let action;
  if (!user) action = `<a class="${cls}" href="login.html?next=credits.html">Log in to buy</a>`;
  else if (!billing.configured) action = `<button class="${cls}" type="button" disabled>Buy</button>`;
  else action = `<button class="${cls}" type="button" data-pack="${esc(p.id)}">Buy</button>`;
  return `<div class="cr-pack${best ? ' best' : ''}">` +
    `<span class="cr-pack-k">${best ? 'Most picked' : ''}</span>` +
    `<div class="cr-pack-n"><b>${p.credits.toLocaleString('en-US')}</b><span>credits</span></div>` +
    `<div class="cr-price">${esc(money(p.price, p.currency))}</div>` +
    `<div class="cr-per">${esc(perPrompt(p))}</div>` +
    action + '</div>';
}

function renderPacks() {
  const packs = billing.packs;
  $('packs').innerHTML = packs.length ? packs.map(packHtml).join('') : '<p class="small">No packs on sale right now</p>';
  $('payOff').hidden = billing.configured;
  $('testNote').hidden = !billing.configured;
  $('demo').innerHTML = billing.demo ? demoTag() : '';
  $('packs').querySelectorAll('button[data-pack]').forEach((b) => b.addEventListener('click', () => buy(b)));
}

async function buy(btn) {
  const all = $('packs').querySelectorAll('button[data-pack]');
  all.forEach((b) => { b.disabled = true; });
  btn.textContent = 'Opening checkout';
  notice('');
  try {
    const { url } = await startCheckout(btn.dataset.pack);
    location.assign(url);
  } catch (e) {
    all.forEach((b) => { b.disabled = false; });
    btn.textContent = 'Buy';
    notice(esc(String((e && e.message) || 'Checkout did not open').replace(/\.$/, '')), true);
  }
}

// Back from checkout: confirm the session once, then clean the query from the address bar.
async function handleReturn() {
  const q = new URLSearchParams(location.search);
  const sid = q.get('session_id');
  const cancelled = q.get('cancelled');
  if (!sid && !cancelled) return;
  try {
    if (cancelled) { notice('Checkout cancelled'); return; }
    const r = await confirmCheckout(sid);
    if (r.alreadyCredited) notice('<b>Already added</b>');
    else notice(`<b>${esc(plural(r.credited, 'credit', 'credits'))} added</b>${r.credits != null ? `, balance ${esc(r.credits.toLocaleString('en-US'))}` : ''}`);
  } catch (e) {
    notice(esc(String((e && e.message) || 'That payment could not be confirmed').replace(/\.$/, '')), true);
  } finally {
    history.replaceState(null, '', location.pathname);
  }
}

async function start() {
  shell();
  const meP = me().catch(() => null);
  user = await meP;
  shell();
  $('acct').textContent = user ? `Signed in as ${user.username}` : 'Play without an account';
  await handleReturn();
  try {
    billing = await getBilling();
  } catch {
    $('packs').innerHTML = '<p class="small">Credit packs did not load, reload the page to try again</p>';
    return;
  }
  if (billing.credits != null && user) {
    user = { ...user, credits: billing.credits };
    shell();
  }
  renderBalance();
  renderPacks();
}

start();
