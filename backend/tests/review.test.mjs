// Tests for the review fix round: clean-up payloads, caps, provisional scores, prompt pasting,
// stand-in gaming, discarded runs, parallel first runs, stats cache, session size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANON, ANON2, anthropicStream, call, setup, signUp, sseResponse } from './helpers.mjs';
import { sanitizeHtml, StreamCleaner, MAX_HTML_BYTES } from '../services/models/sanitize.js';
import { standinScore } from '../services/grader/standin.js';
import { GraderRejected, gradePage } from '../services/grader/index.js';
import { createSession, getSession } from '../services/sessionService.js';
import { PASTED_CODE } from '../services/gameService.js';

process.env.AUTH_SECRET = 'test-secret-for-sessions-only';
const goalFile = slug => readFileSync(new URL(`../../web/data/goals/${slug}.html`, import.meta.url), 'utf8');
const GOAL = goalFile('login-card');
const anon = (id = ANON, ip = '10.0.0.1') => ({ 'X-Anon-Id': id, 'X-Forwarded-For': ip });
const run = (prompt, headers = anon(), cookie, slug = 'login-card') => call('POST', '/api/runs', { body: { slug, prompt, model: 'claude-haiku' }, headers, cookie });
const score = (id, headers = anon(), cookie) => call('POST', `/api/runs/${id}/score`, { headers, cookie });

// ------------------------------------------------------------------ clean-up

const ALLOWED_LT = /<(?:!doctype html>|\/?(?:html|head|body|meta|div|span|p|a|br|hr|wbr|h[1-6]|header|nav|main|footer|section|article|aside|address|ul|ol|li|dl|dt|dd|strong|em|b|i|u|s|small|mark|sub|sup|abbr|q|cite|del|ins|time|code|pre|kbd|samp|var|blockquote|figure|figcaption|img|table|caption|thead|tbody|tfoot|tr|th|td|colgroup|col|form|fieldset|legend|label|input|button|select|option|optgroup|textarea|details|summary|progress|meter|output|title|style)[\s>])/;
function everyLtIsAllowed(html) {
  // Inside <style>, "<" is always written as a CSS escape, so every "<" must open an allowed tag.
  for (let i = html.indexOf('<'); i >= 0; i = html.indexOf('<', i + 1)) {
    if (!ALLOWED_LT.test(html.slice(i, i + 20))) return html.slice(i, i + 40);
  }
  return true;
}

const PAYLOADS = [
  '<img src=x onerror=alert(1) ">',
  '<meta http-equiv=refresh content="0;url=https://evil.example/" ">',
  '<link rel=stylesheet href=https://evil.example/a.css ">',
  '<scr<template></template>ipt>alert(1)</scr<template></template>ipt>',
  '<ifr<noscript></noscript>ame srcdoc="<script>alert(1)</script>"></iframe>',
  '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href="java&#x09;script:alert(1)">y</a>',
  '<div style="background:url(&#104;ttps://evil.example/t.png)">z</div>',
  '<style>body{background:url(\\68ttps://evil.example/x.png)}</style>',
  '<style>@\\69mport url(https://evil.example/a.css);</style>',
  '<div style=\'background-image:image-set("https://evil.example/a.png" 1x)\'>w</div>',
  '<style>p{background:-webkit-image-set(url(https://evil.example/b.png) 1x)}</style>',
  '<svg><a xlink:href="javascript:alert(1)"><text>t</text></a></svg>',
  '<div title="x" title2=\'y\' onclick ="alert(1)">v</div>',
  '<style></style ><script>alert(1)</script>',
  '<style>p{color:red}</style><style>p{x:"</style><script>alert(1)</script>"}</style>',
  '<textarea></textarea><script>alert(1)</script></textarea>',
  '<form action="https://evil.example"><button formaction="https://evil.example">b</button></form>',
  '<base href="https://evil.example/"><a href="/x">rel</a>',
  '<object data="x.swf"><embed src="y"></object><p>after</p>',
  '<!--><script>alert(1)</script>-->',
  '<a href="mailto:a@b.co">mail</a><a href="#top">top</a>',
];
const BAD = [/onerror/i, /onclick/i, /http-equiv/i, /<link/i, /<script/i, /<iframe/i, /srcdoc/i, /<svg/i, /<object/i, /<embed/i, /<base/i, /javascript:/i, /evil\.example/, /@import/i, /mport/, /image-set/i, /formaction/i, /action=/i];

// The active parts of a page: its tags (with attributes) and its CSS. Text between tags is inert.
const active = html => [...(html.match(/<[^>]*>/g) || []), ...[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1])].join('\n');

test('clean-up: every reviewer payload is neutralised', () => {
  for (const payload of PAYLOADS) {
    const clean = sanitizeHtml(`<!doctype html><html><head></head><body>${payload}</body></html>`);
    for (const bad of BAD) assert.doesNotMatch(active(clean), bad, `${payload} -> ${clean}`);
    assert.equal(everyLtIsAllowed(clean), true, `${payload} -> ${clean}`);
  }
  assert.match(sanitizeHtml(PAYLOADS[PAYLOADS.length - 1]), /<a href="mailto:a@b\.co">mail<\/a><a href="#top">top<\/a>/);
  assert.match(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>'), /<a href="#">x<\/a>/);
});

test('clean-up keeps style blocks and inline styles working', () => {
  const clean = sanitizeHtml(GOAL);
  assert.match(clean, /<style>[\s\S]*\.card \{ width: 400px;[\s\S]*<\/style>/);
  assert.match(clean, /<main class="card">/);
  assert.equal(standinScore(GOAL, clean).total, 100);
  assert.equal(sanitizeHtml('<p style="color:#123456;font-size:14px">a</p>'), '<p style="color:#123456;font-size:14px">a</p>');
  assert.match(sanitizeHtml('<img src="data:image/png;base64,iVBORw0KGgo=" alt="dot">'), /src="data:image\/png;base64,iVBORw0KGgo="/);
});

function fuzzInputs() {
  const parts = ['<', '>', '"', "'", '=', 'script', 'style', '<!--', '-->', '</', 'a href=', 'javascript:', '&#106;', '\\68', '\\', 'url(', ')', '{', '}', ' ', 'div', ' onerror', 'x', '<style>', '</style>', '<title>', '</title>', '```', '<p>', '&lt;', '<textarea>', '<!doctype html>', '<html>', '</html>', '@import ', 'image-set(', '\n', '<b', 'img src=', 'data:image/png;base64,AAAA'];
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const out = [];
  for (let k = 0; k < 600; k += 1) {
    let s = '';
    const n = 1 + Math.floor(rand() * 30);
    for (let i = 0; i < n; i += 1) s += parts[Math.floor(rand() * parts.length)];
    out.push(s);
  }
  return out;
}

test('clean-up is idempotent: cleaning the output again changes nothing', () => {
  const inputs = [...PAYLOADS, ...fuzzInputs(), ...['login-card', 'footer-columns', 'nav-hero', 'blog-header', 'pricing-plans', 'product-grid'].map(goalFile)];
  for (const input of inputs) {
    const once = sanitizeHtml(input);
    assert.equal(sanitizeHtml(once), once, JSON.stringify(input));
    assert.equal(everyLtIsAllowed(once), true, JSON.stringify(input));
  }
});

test('clean-up truncates an oversized page at the cap on a tag boundary and closes it', () => {
  const big = '<!doctype html><html><head><style>p{color:red}</style></head><body>' + '<p>abcdefghij klmnop</p>'.repeat(17000) + '</body></html>';
  assert.ok(Buffer.byteLength(big) > 400_000);
  const clean = sanitizeHtml(big);
  const size = Buffer.byteLength(clean);
  assert.ok(size <= MAX_HTML_BYTES && size > MAX_HTML_BYTES - 1000, `size ${size}`);
  assert.match(clean, /<\/body><\/html>$/);
  assert.equal(sanitizeHtml(clean), clean);
});

test('streamed clean-up stays linear: a 62 KB page in 20-character chunks', () => {
  const page = goalFile('product-grid').replace('</body>', '<p>filler text for size</p>'.repeat(2300) + '</body>');
  assert.ok(page.length > 60_000);
  const started = process.hrtime.bigint();
  const c = new StreamCleaner();
  let sent = '';
  for (let i = 0; i < page.length; i += 20) sent += c.push(page.slice(i, i + 20));
  const { rest, html } = c.finish();
  sent += rest;
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(sent, html);
  assert.ok(c.cleans <= Math.ceil(page.length / 2048) + Math.ceil(ms / 250) + 2, `cleans ${c.cleans}`);
  assert.ok(ms < 1500, `took ${ms} ms`);
});

// ------------------------------------------------------------------ stand-in gaming

test('stand-in: hidden goal text, CSS-comment colours and empty tags all score under 50', () => {
  for (const slug of ['login-card', 'footer-columns', 'pricing-plans']) {
    const goal = goalFile(slug);
    const visible = goal.replace(/<head[\s\S]*?<\/head>/, '').replace(/<[^>]+>/g, ' ');
    const css = goal.match(/<style>([\s\S]*?)<\/style>/)[1];
    const tricks = {
      hiddenInline: `<html><body><div style="display:none">${visible}</div></body></html>`,
      hiddenClass: `<html><head><style>.h{visibility:hidden}</style></head><body><div class="h">${visible}</div><p>Hi</p></body></html>`,
      sameColour: `<html><head><style>body{background:#fff}.h{color:#fff}</style></head><body><p class="h">${visible}</p></body></html>`,
      cssComment: `<html><head><style>/* ${css.replace(/\*\//g, '')} */ .nope{${css.replace(/[{}]/g, ';')}}</style></head><body><p>hello</p></body></html>`,
      emptyTags: goal.replace(/(<body[\s\S]*)/, m => m.replace(/>([^<]+)</g, '><')),
    };
    for (const [name, html] of Object.entries(tricks)) {
      const total = standinScore(goal, html).total;
      assert.ok(total < 50, `${slug} ${name}: ${total}`);
    }
    assert.equal(standinScore(goal, goal).total, 100);
  }
});

// ------------------------------------------------------------------ grader

test('a grader answer with an error or no numeric total is a failed grade, not a 0', async () => {
  const env = { GRADER_URL: 'https://g.test', GRADER_API_KEY: 'k' };
  for (const result of [{ total: 0, error: 'Could not render.' }, { pillars: {} }, { total: 'n/a' }]) {
    await assert.rejects(gradePage({ goalHtml: 'g', html: 'c', env, fetch: async () => Response.json({ result }) }), GraderRejected);
  }
  const { store } = setup({ env: { ANTHROPIC_API_KEY: 'k', ...env }, model: GOAL, grader: () => Response.json({ result: { total: 0, error: 'Could not render.' } }) });
  const r = await run('a login card');
  const s = await score(r.headers['x-run-id']);
  assert.deepEqual([s.status, s.body], [502, { error: 'The grader could not score this page. Try scoring it again.' }]);
  assert.equal((await store.getRun(r.headers['x-run-id'])).result, null);
});

test('a provisional score from a grader outage is replaced by re-scoring; boards ignore it meanwhile', async () => {
  let graderUp = false;
  setup({
    env: { ANTHROPIC_API_KEY: 'k', GRADER_URL: 'https://g.test', GRADER_API_KEY: 'gk' },
    model: GOAL,
    grader: () => (graderUp
      ? Response.json({ result: { total: 81, pillars: { works: 100, engineering: 70, looks: 80 }, feedback: [{ message: 'Spacing differs.', points: 19 }] } })
      : new Response('{"error":"down"}', { status: 500 })),
  });
  const { cookie } = await signUp('rescorer');
  const r = await run('a login card', { 'X-Forwarded-For': '10.0.0.9' }, cookie);
  const first = await score(r.headers['x-run-id'], {}, cookie);
  assert.equal(first.body.run.result.provisional, true);
  assert.match(first.body.run.result.notice, /provisional/);
  const board = (await call('GET', '/api/leaderboards?slug=login-card', { cookie })).body;
  assert.deepEqual([board.rows, board.you, board.provisional], [[], null, false]);
  assert.deepEqual((await call('GET', '/api/players/me', { cookie })).body.bests, {});

  graderUp = true;
  const again = await score(r.headers['x-run-id'], {}, cookie);
  assert.equal(again.body.run.result.provisional, false);
  assert.equal(again.body.run.result.total, 81);
  assert.equal(again.body.attempt.best, 81);
  const after = (await call('GET', '/api/leaderboards?slug=login-card', { cookie })).body;
  assert.deepEqual(after.rows.map(x => [x.username, x.score]), [['rescorer', 81]]);
  // A final score is not graded again.
  graderUp = false;
  assert.equal((await score(r.headers['x-run-id'], {}, cookie)).body.run.result.total, 81);
});

test('stand-in mode boards include provisional scores and say so', async () => {
  setup({ model: GOAL });
  const { cookie } = await signUp('standin_u');
  const r = await run('a login card', { 'X-Forwarded-For': '10.0.0.8' }, cookie);
  await score(r.headers['x-run-id'], {}, cookie);
  const board = (await call('GET', '/api/leaderboards?slug=login-card', { cookie })).body;
  assert.equal(board.provisional, true);
  assert.equal(board.rows.length, 1);
});

// ------------------------------------------------------------------ caps

test('the IP cap applies to signed-in players too, and a global daily cap exists', async () => {
  setup({ env: { ANTHROPIC_API_KEY: 'k', RUNS_PER_DAY: '3', RUNS_PER_IP_PER_DAY: '3' }, model: GOAL });
  const accounts = [];
  for (let i = 0; i < 5; i += 1) accounts.push(await signUp(`fresh_${i}`));
  const statuses = [];
  for (const a of accounts) statuses.push((await run('card', { 'X-Forwarded-For': '203.0.113.7' }, a.cookie)).status);
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  assert.equal((await run('card', { 'X-Forwarded-For': '203.0.113.8' }, accounts[4].cookie)).status, 200);

  // Default IP cap: 10 x RUNS_PER_DAY.
  setup({ env: { ANTHROPIC_API_KEY: 'k', RUNS_PER_DAY: '1' }, model: GOAL });
  const ipStatuses = [];
  for (let i = 0; i < 11; i += 1) ipStatuses.push((await run('card', anon(`anon_ipcap_player_${String(i).padStart(4, '0')}`, '203.0.113.50'))).status);
  assert.deepEqual(ipStatuses, [...Array(10).fill(200), 429]);

  setup({ env: { ANTHROPIC_API_KEY: 'k', RUNS_PER_DAY_TOTAL: '2' }, model: GOAL });
  assert.equal((await run('card', anon(ANON, '198.51.100.1'))).status, 200);
  assert.equal((await run('card', anon(ANON2, '198.51.100.2'))).status, 200);
  const third = await run('card', anon('anon_test_player_0003', '198.51.100.3'));
  assert.equal(third.status, 429);
  assert.equal(third.body.error, 'promptdyno has reached its run limit for today. Come back tomorrow.');
  assert.ok(Number(third.headers['retry-after']) > 0);
});

// ------------------------------------------------------------------ prompts and runs

test('prompts containing page code are refused', async () => {
  setup({ model: GOAL });
  const css = GOAL.match(/<style>([\s\S]*?)<\/style>/)[1];
  const pasted = await run(`Make this: ${css.slice(0, 200)}`);
  assert.deepEqual([pasted.status, pasted.body], [400, { error: PASTED_CODE }]);
  const tags = await run('Use <div><div><span><b><i><u> nesting');
  assert.equal(tags.status, 400);
  const rules = await run('a{b} c{d} e{f} g{h} i{j} k{l}');
  assert.equal(rules.status, 400);
  assert.equal((await run('A centred white sign-in card titled Welcome back with a green button and two fields')).status, 200);
});

test('the run response carries a sandboxing CSP and nosniff', async () => {
  setup({ model: GOAL });
  const r = await run('a login card');
  assert.equal(r.headers['content-security-policy'], "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
});

test('a run that fails mid-stream is discarded and does not count as a prompt', async () => {
  const { state, store } = setup({ model: GOAL });
  state.modelText = () => sseResponse([
    { event: 'content_block_delta', data: { type: 'content_block_delta', delta: { type: 'text_delta', text: '<!doctype html><html><body><p>half' } } },
    { event: 'error', data: { type: 'error', error: { type: 'overloaded_error' } } },
  ]);
  const failed = await run('a login card');
  assert.equal(failed.status, 200);
  assert.equal(failed.headers['x-prompt-count'], '1');
  assert.equal(store.runs.size, 0);
  const current = (await call('GET', '/api/attempts/current?slug=login-card', { headers: anon() })).body.attempt;
  assert.deepEqual([current.promptCount, current.runs], [0, []]);
  state.modelText = GOAL;
  const ok = await run('a login card');
  assert.equal(ok.headers['x-prompt-count'], '1');
  assert.equal((await call('GET', '/api/attempts/current?slug=login-card', { headers: anon() })).body.attempt.promptCount, 1);
});

test('a generated but unscored run is listed with result null and can be scored later', async () => {
  setup({ model: GOAL });
  const r1 = await run('first');
  const r2 = await run('second');
  const current = (await call('GET', '/api/attempts/current?slug=login-card', { headers: anon() })).body.attempt;
  assert.equal(current.promptCount, 2);
  assert.deepEqual(current.runs.map(x => [x.n, x.status, x.result]), [[1, 'done', null], [2, 'done', null]]);
  const s1 = await score(r1.headers['x-run-id']);
  assert.equal(s1.body.run.result.total, 100);
  const s2 = await score(r2.headers['x-run-id']);
  assert.equal(s2.body.run.result.delta, 0);
});

test('six parallel first runs share one attempt with prompt counts 1 to 6', async () => {
  const { store } = setup({ model: GOAL });
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => run(`parallel ${i}`)));
  assert.deepEqual(results.map(r => r.status), [200, 200, 200, 200, 200, 200]);
  assert.equal(new Set(results.map(r => r.headers['x-attempt-id'])).size, 1);
  assert.equal(store.attempts.size, 1);
  const current = (await call('GET', '/api/attempts/current?slug=login-card', { headers: anon() })).body.attempt;
  assert.equal(current.promptCount, 6);
  assert.deepEqual(current.runs.map(x => x.n), [1, 2, 3, 4, 5, 6]);
});

test('challenge stats are cached for 30 s per instance', async () => {
  let clock = Date.parse('2026-11-15T09:00:00Z');
  setup({ model: GOAL, now: () => clock });
  const { cookie } = await signUp('cache_u');
  const solved = async () => (await call('GET', '/api/challenges')).body.challenges.find(c => c.slug === 'login-card').solvedCount;
  assert.equal(await solved(), 0);
  const r = await run('card', { 'X-Forwarded-For': '10.0.0.5' }, cookie);
  await score(r.headers['x-run-id'], {}, cookie);
  assert.equal(await solved(), 0);
  clock += 31_000;
  assert.equal(await solved(), 1);
});

test('a very long email cannot push the session token over the cookie limit', () => {
  const email = `${'a'.repeat(1500)}@example.com`;
  const token = createSession({ id: 'u1', username: 'ada', email });
  assert.ok(token.length < 2048, `token ${token.length}`);
  assert.deepEqual(getSession(token).user, { id: 'u1', username: 'ada', email: null });
  assert.equal(getSession(createSession({ id: 'u2', username: 'bo', email: 'bo@example.com' })).user.email, 'bo@example.com');
});
