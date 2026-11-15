// Challenge kinds: one row per kind with everything the run flow and the grader adapter need.
//   loadGoal      reads the goal from the data folders (throws an Error with a plain message)
//   instruction   the fixed system instruction for the model
//   userMessage   the player's prompt (and, for a follow-up, the previous output)
//   streamType    Content-Type of the run stream
//   cleaner       makes the streaming output cleaner ({ push(chunk) -> text, finish() -> { rest, html } })
//   outputField   where the finished output is stored on the run ('html' or 'markdown')
//   graderRoute   grader service route; gradeBody(challenge, output) its JSON body
//   standin       stand-in scorer when no grader service is configured (null: none)
// See grader/INTEGRATION.md (section 5) for the kinds the grader supports.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamCleaner } from './models/sanitize.js';
import { standinScore } from './grader/standin.js';

export const KIND_NAMES = ['page', 'site', 'scene', 'doc', 'workflow'];
const MAX_GOAL_BYTES = 300 * 1024;
const MAX_RUBRIC_BYTES = 200 * 1024;
export const MAX_MARKDOWN_BYTES = 300 * 1024;

// The grader renders at 1280 x 800 with page JavaScript and the network off (INTEGRATION.md section 3).
export function pageInstruction(viewport) {
  return [
    'You are a web page generator. Reply with exactly one complete HTML document, starting with <!doctype html> and ending with </html>, and nothing else: no explanations, no Markdown, no code fences.',
    `The page is rendered at a ${viewport.width} x ${viewport.height} browser viewport with JavaScript turned off and the network turned off.`,
    'It must be one self-contained HTML file: all CSS inline, in one <style> element in the head or in style attributes.',
    'Do not use JavaScript: no <script> elements and no event-handler attributes. A page that needs JavaScript to draw renders empty.',
    'Do not load anything external: no web fonts, CDNs, external stylesheets, remote images, iframes or URLs. Pictures only as inline <svg> or data: URIs; otherwise draw shapes with CSS.',
    'Use system fonts only: Arial, Georgia, Courier New, or the generic families sans-serif, serif and monospace.',
  ].join('\n');
}

function pageMessage(prompt, previous) {
  if (!previous) return `Build this page:\n\n${prompt}`;
  return `Here is the current page:\n\n${previous}\n\nRevise it according to the instruction below and reply with the complete revised document.\n\nInstruction:\n${prompt}`;
}

function docInstruction() {
  return [
    'You are a technical writer. Reply with one Markdown document and nothing else: no preamble, no closing remarks, and do not wrap the whole reply in a code fence.',
    'Use headings, lists, tables and code fences where they help. Keep it specific and checkable.',
  ].join('\n');
}

function docMessage(prompt, previous) {
  if (!previous) return `Write this document:\n\n${prompt}`;
  return `Here is the current document:\n\n${previous}\n\nRevise it according to the instruction below and reply with the complete revised document.\n\nInstruction:\n${prompt}`;
}

// Streams Markdown through unchanged apart from an outer code fence, and caps its size.
// The text is stored as Markdown: the client must render it safely (no raw HTML).
export class MarkdownCleaner {
  constructor() {
    this.raw = '';
    this.sent = '';
  }

  clean(final) {
    let text = this.raw.replace(/^﻿/, '');
    const fenced = /^\s*```(?:markdown|md)?[ \t]*\r?\n/i.exec(text);
    if (fenced) text = text.slice(fenced[0].length);
    else if (!final && /^\s*`{0,3}$/.test(text)) return '';
    if (fenced && final) text = text.replace(/\r?\n?```\s*$/, '');
    if (!final) text = text.slice(0, Math.max(0, text.length - 8)); // a closing fence may be arriving
    let bytes = 0;
    let cut = text.length;
    for (let i = 0; i < text.length; i += 1) {
      bytes += Buffer.byteLength(text[i]);
      if (bytes > MAX_MARKDOWN_BYTES) { cut = i; break; }
    }
    return text.slice(0, cut);
  }

  push(chunk) {
    this.raw += chunk;
    const text = this.clean(false);
    if (!text.startsWith(this.sent) || text.length <= this.sent.length) return '';
    const next = text.slice(this.sent.length);
    this.sent = text;
    return next;
  }

  finish() {
    const text = this.clean(true).trim();
    if (text.startsWith(this.sent)) return { rest: text.slice(this.sent.length), html: text, consistent: true };
    return { rest: '', html: this.sent.trim(), consistent: false };
  }
}

const withMarks = (challenge, body) => (challenge.marks !== undefined ? { ...body, marks: challenge.marks } : body);

function readFirst(dirs, rel) {
  for (const dir of dirs) {
    try { return readFileSync(join(dir, rel), 'utf8'); } catch { /* try the next folder */ }
  }
  return null;
}

export const KINDS = {
  page: {
    available: true,
    loadGoal(dirs, slug) {
      const goalHtml = readFirst(dirs, join('goals', `${slug}.html`));
      if (goalHtml == null) throw new Error(`goals/${slug}.html is missing.`);
      if (!goalHtml.trim()) throw new Error(`goals/${slug}.html is empty.`);
      if (Buffer.byteLength(goalHtml) > MAX_GOAL_BYTES) throw new Error(`goals/${slug}.html is over 300 KB.`);
      return { goalHtml };
    },
    instruction: challenge => pageInstruction(challenge.viewport),
    userMessage: pageMessage,
    streamType: 'text/html; charset=utf-8',
    cleaner: () => new StreamCleaner(),
    outputField: 'html',
    graderRoute: '/v1/grade/site',
    gradeBody: (challenge, output) => withMarks(challenge, { goal: { 'index.html': challenge.goalHtml }, candidate: { 'index.html': output } }),
    standin: (challenge, output) => standinScore(challenge.goalHtml, output),
  },
  // Built from INTEGRATION.md section 5; the grader's /v1/grade/doc route is not live yet.
  doc: {
    available: true,
    loadGoal(dirs, slug) {
      const text = readFirst(dirs, join('rubrics', `${slug}.json`));
      if (text == null) throw new Error(`rubrics/${slug}.json is missing.`);
      if (Buffer.byteLength(text) > MAX_RUBRIC_BYTES) throw new Error(`rubrics/${slug}.json is over 200 KB.`);
      let rubric;
      try { rubric = JSON.parse(text); } catch { throw new Error(`rubrics/${slug}.json is not valid JSON.`); }
      if (!rubric || typeof rubric !== 'object') throw new Error(`rubrics/${slug}.json must be a JSON object or list.`);
      return { rubric };
    },
    instruction: docInstruction,
    userMessage: docMessage,
    streamType: 'text/markdown; charset=utf-8',
    cleaner: () => new MarkdownCleaner(),
    outputField: 'markdown',
    graderRoute: '/v1/grade/doc',
    gradeBody: (challenge, output) => withMarks(challenge, { kind: 'doc', rubric: challenge.rubric, candidate: output }),
    standin: null,
  },
  // site: add here a goal loader for a folder of files, a parser that splits the model's reply into
  // { path: text }, and graderRoute '/v1/grade/site' with { goal: files, candidate: files }.
  site: { available: false, notBuilt: 'Multi-page site challenges are not playable yet.' },
  // scene: add here a loader for the goal's buildScene(THREE) code, an output parser for JavaScript,
  // and graderRoute '/v1/grade/scene' with { goal, candidate } as code strings.
  scene: { available: false, notBuilt: '3D scene challenges are not playable yet.' },
  // workflow: add here a rubric loader (like doc), a JSON plan parser, and graderRoute '/v1/grade/workflow'.
  workflow: { available: false, notBuilt: 'Workflow challenges are not playable yet.' },
};
