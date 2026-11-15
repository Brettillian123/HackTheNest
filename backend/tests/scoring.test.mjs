import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { standinScore } from '../services/grader/standin.js';
import { GraderRejected, gradePage, graderMode, mapServiceResult } from '../services/grader/index.js';
import { sanitizeHtml, StreamCleaner, MAX_HTML_BYTES } from '../services/models/sanitize.js';

const goal = name => readFileSync(new URL(`../../web/data/goals/${name}.html`, import.meta.url), 'utf8');
const GOALS = ['login-card', 'footer-columns', 'nav-hero', 'blog-header', 'pricing-plans', 'product-grid'];
const sumCosts = r => r.costs.reduce((s, c) => s + c.points, 0);

test('stand-in: identical page scores 100 with no costs, for every goal', () => {
  for (const name of GOALS) {
    const r = standinScore(goal(name), goal(name));
    assert.equal(r.total, 100, name);
    assert.deepEqual(r.costs, []);
    assert.equal(r.passedCount, r.totalChecks);
    assert.equal(r.provisional, true);
  }
});

test('stand-in: empty and blank pages score near 0', () => {
  for (const name of GOALS) {
    assert.ok(standinScore(goal(name), '').total <= 5, name);
    assert.ok(standinScore(goal(name), '<!doctype html><html><body></body></html>').total <= 10, name);
  }
});

test('stand-in: costs always add up to 100 minus the total, with plain messages', () => {
  const g = goal('login-card');
  const variants = [
    g.replace('#2F5D50', '#C0392B').replace(/#2F5D50/g, '#C0392B'),
    g.replace('Welcome back', 'Hello there friend'),
    g.replace(/400px/g, '600px'),
    g.replace(/<input[^>]*>/, ''),
    goal('pricing-plans'),
    '<html><body><h1>Sign in</h1><button>Go</button></body></html>',
  ];
  for (const html of variants) {
    const r = standinScore(g, html);
    assert.equal(100 - sumCosts(r), r.total);
    assert.ok(r.total >= 0 && r.total < 100);
    for (const c of r.costs) {
      assert.ok(Number.isInteger(c.points) && c.points > 0);
      assert.match(c.message, /^[A-Z].+\.$/);
    }
    assert.equal(r.checks.length, 7);
  }
});

test('stand-in: partial credit is ordered sensibly', () => {
  const g = goal('login-card');
  const small = standinScore(g, g.replace('Welcome back', 'Welcome home')).total;
  const colours = standinScore(g, g.replace(/#2F5D50/g, '#C0392B').replace(/#F7F5F0/g, '#222222')).total;
  const other = standinScore(g, goal('product-grid')).total;
  const empty = standinScore(g, '').total;
  assert.ok(small >= 95 && small < 100, `small change ${small}`);
  assert.ok(colours < small, `colours ${colours}`);
  assert.ok(other < colours, `other page ${other}`);
  assert.ok(empty < other, `empty ${empty}`);
});

test('grader mode follows the two env variables', () => {
  assert.equal(graderMode({}), 'standin');
  assert.equal(graderMode({ GRADER_URL: 'http://g' }), 'standin');
  assert.equal(graderMode({ GRADER_URL: 'http://g', GRADER_API_KEY: 'k' }), 'service');
});

test('service result maps to the site shape', () => {
  const r = mapServiceResult({ total: 87.5, pillars: { works: 90, engineering: 80, looks: 88 }, feedback: [{ message: 'An image has no text description.', points: 6.3 }, { message: 'Too big.', points: 9 }] });
  assert.equal(r.total, 88);
  assert.deepEqual(r.checks, [{ label: 'Page works', passed: true }, { label: 'Clean code', passed: false }, { label: 'Looks like the goal', passed: false }]);
  assert.deepEqual(r.costs, [{ points: 9, message: 'Too big.' }, { points: 6, message: 'An image has no text description.' }]);
  assert.equal(r.provisional, false);
});

const env = { GRADER_URL: 'https://grader.test/', GRADER_API_KEY: 'grader-test-key' };
const okBody = { result: { total: 91, pillars: { works: 100, engineering: 90, looks: 85 }, feedback: [{ message: 'Colours differ.', points: 9 }] } };

test('grader service: success sends goal and candidate with the key', async () => {
  const seen = [];
  const fetch = async (url, init) => { seen.push({ url, init }); return Response.json(okBody); };
  const r = await gradePage({ goalHtml: '<p>goal</p>', html: '<p>mine</p>', env, fetch });
  assert.equal(r.total, 91);
  assert.equal(r.provisional, false);
  assert.equal(seen[0].url, 'https://grader.test/v1/grade/site');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer grader-test-key');
  assert.deepEqual(JSON.parse(seen[0].init.body), { goal: { 'index.html': '<p>goal</p>' }, candidate: { 'index.html': '<p>mine</p>' } });
});

test('grader service: 503 then success retries once after Retry-After', async () => {
  let n = 0;
  const fetch = async () => (++n === 1 ? new Response('{"error":"busy"}', { status: 503, headers: { 'Retry-After': '0' } }) : Response.json(okBody));
  const r = await gradePage({ goalHtml: 'g', html: 'c', env, fetch });
  assert.equal(n, 2);
  assert.equal(r.total, 91);
  assert.equal(r.provisional, false);
});

test('grader service: a timeout falls back to the stand-in with a clear notice', async () => {
  const fetch = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  const r = await gradePage({ goalHtml: goal('login-card'), html: goal('login-card'), env: { ...env, GRADER_TIMEOUT_MS: '300' }, fetch });
  assert.equal(r.provisional, true);
  assert.equal(r.total, 100);
  assert.match(r.notice, /did not answer in time.*provisional/);
});

test('grader service: two 503s fall back to the stand-in', async () => {
  const fetch = async () => new Response('{"error":"busy"}', { status: 503, headers: { 'Retry-After': '0' } });
  const r = await gradePage({ goalHtml: 'g', html: 'c', env, fetch });
  assert.equal(r.provisional, true);
  assert.match(r.notice, /busy/);
});

test('clean-up removes scripts, handlers, frames, links and remote urls', () => {
  const dirty = 'Sure! Here it is:\n```html\n<!DOCTYPE html><html><head><link rel="stylesheet" href="https://x.io/a.css"><script>alert(1)</script>'
    + '<style>@import url(https://x.io/b.css); body{background:url("https://x.io/i.png") #fff}</style></head>'
    + '<body onload="steal()"><div title=">" onclick=alert(1)>Hi</div><img src="https://x.io/p.png" onerror="x()">'
    + '<a href="javascript:alert(1)">bad</a><a href="#top">ok</a><iframe src="https://x.io"></iframe><object data="x"></object><embed src="y">'
    + '<p style="background-image:url(//x.io/t.png)">t</p><SCRIPT type="module">evil()</SCRIPT></body></html>\n```\nHope this helps!';
  const clean = sanitizeHtml(dirty);
  assert.ok(clean.startsWith('<!doctype html>'));
  assert.ok(clean.endsWith('</html>'));
  for (const bad of [/<script/i, /alert/, /onload/i, /onclick/i, /onerror/i, /<iframe/i, /<object/i, /<embed/i, /<link/i, /https?:/, /\/\/x\.io/, /@import/, /javascript:/i, /```/, /Hope this/]) {
    assert.doesNotMatch(clean, bad);
  }
  assert.match(clean, /<a href="#top">ok<\/a>/);
  assert.match(clean, /<div title="&gt;">Hi<\/div>/);
});

test('clean-up caps the size at 300 KB and handles unclosed scripts', () => {
  const big = '<html><body>' + '<p>abcdefghij</p>'.repeat(30000) + '</body></html>';
  assert.ok(Buffer.byteLength(sanitizeHtml(big)) <= MAX_HTML_BYTES);
  assert.equal(sanitizeHtml('<html><body><p>a</p><script>never closed'), '<html><body><p>a</p>');
});

test('streamed clean-up sends exactly the final cleaned page', () => {
  const raw = '```html\n<!doctype html><html><head><style>p{color:red}</style></head><body><p onclick="x()">Hello</p><script>bad()</script><p>World</p></body></html>\n```';
  for (const size of [1, 3, 7, 50]) {
    const c = new StreamCleaner({ everyBytes: 1 });
    let sent = '';
    for (let i = 0; i < raw.length; i += size) sent += c.push(raw.slice(i, i + size));
    const { rest, html, consistent } = c.finish();
    sent += rest;
    assert.equal(consistent, true);
    assert.equal(sent, html);
    assert.equal(html, sanitizeHtml(raw));
    assert.doesNotMatch(sent, /script|onclick|```/);
  }
});
