// Challenge kinds: one row per kind with everything the run flow and the grader adapter need.
//   loadGoal      reads the goal from the data folders (throws an Error with a plain message)
//   instruction   the fixed system instruction for the model
//   userMessage   the player's prompt (and, for a follow-up, the previous output)
//   streamType    Content-Type of the run stream
//   cleaner       makes the streaming output cleaner ({ push(chunk) -> text, finish() -> { rest, html } })
//   outputField   where the finished output is stored on the run ('html' or 'markdown')
//   validate      optional: output -> null, or a plain reason it cannot be graded (scored 0, no grader call)
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

function docInstruction(challenge) {
  if (challenge?.docKind === 'mcp-tools') {
    return [
      'You are a technical writer. Reply with one JSON document and nothing else: no prose, no Markdown, and do not wrap the reply in a code fence.',
      'It must parse as JSON exactly as written.',
    ].join('\n');
  }
  return [
    'You are a technical writer. Reply with one Markdown document and nothing else: no preamble, no closing remarks, and do not wrap the whole reply in a code fence.',
    'Use headings, lists, tables and code fences where they help. Keep it specific and checkable.',
  ].join('\n');
}

function docMessage(prompt, previous) {
  if (!previous) return `Write this document:\n\n${prompt}`;
  return `Here is the current document:\n\n${previous}\n\nRevise it according to the instruction below and reply with the complete revised document.\n\nInstruction:\n${prompt}`;
}

// The plan shape is the one in grader/src/workflow/README.md ("The plan").
function workflowInstruction() {
  return [
    'You are a planner for a team of AI agents. Reply with the plan as one JSON object and nothing else: no prose, no Markdown, and do not wrap the reply in a code fence. It must parse as JSON exactly as written.',
    'Shape: { "goal": string, "steps": [ { "id", "title", "owner", "dependsOn": [step ids], "changes": [file paths or globs; [] when it changes nothing], "reads": [optional], "proof": string, "budget": { "toolCalls"?, "minutes"? }, "kind": "work" | "review" | "research" | "decision" } ], "loops": [ { "id", "steps": [step ids], "until": string, "maxRounds": number, "heldOut": optional string } ] }.',
    'Use exactly these field names.',
  ].join('\n');
}

function workflowMessage(prompt, previous) {
  if (!previous) return `Plan this job:\n\n${prompt}`;
  return `Here is the current plan:\n\n${previous}\n\nRevise it according to the instruction below and reply with the complete revised plan as JSON only.\n\nInstruction:\n${prompt}`;
}

// The grader's document kinds (grader/service/README.md, POST /v1/grade/doc).
export const DOC_GRADER_KINDS = ['instructions', 'readme', 'skill', 'mcp-tools'];
// Which grader document kind each bonus challenge is. lessons/challenges.json says only `kind: "doc"`;
// a `docKind` field on the challenge or a string `kind` in its rubric overrides this table.
const DOC_KIND_BY_SLUG = {
  'agents-md-for-a-repo': 'instructions',
  'readme-for-a-cli': 'readme',
  'mcp-server-trust-note': 'readme',
  'findings-report': 'readme',
  'release-notes-skill': 'skill',
  'library-tools': 'mcp-tools',
};

// A goal problem the player sees as the unavailable reason (the full message goes to /api/health).
function goalError(message, playerReason) {
  const error = new Error(message);
  if (playerReason) error.playerReason = playerReason;
  return error;
}

function loadRubric(dirs, slug) {
  const text = readFirst(dirs, join('rubrics', `${slug}.json`));
  if (text == null) throw goalError(`rubrics/${slug}.json is missing.`, 'The grader rubric for this challenge has not been written yet.');
  if (Buffer.byteLength(text) > MAX_RUBRIC_BYTES) throw new Error(`rubrics/${slug}.json is over 200 KB.`);
  let rubric;
  try { rubric = JSON.parse(text); } catch { throw new Error(`rubrics/${slug}.json is not valid JSON.`); }
  if (!rubric || typeof rubric !== 'object') throw new Error(`rubrics/${slug}.json must be a JSON object or list.`);
  return rubric;
}

// Streams Markdown (or JSON) through unchanged apart from an outer code fence, and caps its size.
// The text is stored as Markdown: the client must render it safely (no raw HTML).
export class MarkdownCleaner {
  constructor({ fences = ['markdown', 'md'] } = {}) {
    this.raw = '';
    this.sent = '';
    this.fenceRe = new RegExp(`^\\s*\`\`\`(?:${fences.join('|')})?[ \\t]*\\r?\\n`, 'i');
  }

  clean(final) {
    let text = this.raw.replace(/^﻿/, '');
    const fenced = this.fenceRe.exec(text);
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
  // POST /v1/grade/doc { kind, rubric, candidate } (grader/service/README.md); kind is the document kind.
  doc: {
    available: true,
    loadGoal(dirs, slug, entry = {}) {
      const rubric = loadRubric(dirs, slug);
      const docKind = [entry.docKind, rubric.kind, DOC_KIND_BY_SLUG[slug]].find(k => DOC_GRADER_KINDS.includes(k));
      if (!docKind) throw goalError(`no grader document kind for "${slug}" (set docKind to one of ${DOC_GRADER_KINDS.join(', ')}).`, 'This challenge is not ready yet: its grader document kind is not set.');
      // The grader rejects unknown top-level rubric fields, so a kind in the rubric is never sent on.
      if (!Array.isArray(rubric) && 'kind' in rubric) { const { kind, ...rest } = rubric; return { rubric: rest, docKind }; }
      return { rubric, docKind };
    },
    instruction: docInstruction,
    userMessage: docMessage,
    streamType: 'text/markdown; charset=utf-8',
    cleaner: challenge => new MarkdownCleaner({ fences: challenge?.docKind === 'mcp-tools' ? ['json'] : ['markdown', 'md'] }),
    outputField: 'markdown',
    graderRoute: '/v1/grade/doc',
    gradeBody: (challenge, output) => withMarks(challenge, { kind: challenge.docKind, rubric: challenge.rubric, candidate: output }),
    standin: null,
  },
  // site: add here a goal loader for a folder of files, a parser that splits the model's reply into
  // { path: text }, and graderRoute '/v1/grade/site' with { goal: files, candidate: files }.
  site: { available: false, notBuilt: 'Multi-page site challenges are not playable yet.' },
  // scene: add here a loader for the goal's buildScene(THREE) code, an output parser for JavaScript,
  // and graderRoute '/v1/grade/scene' with { goal, candidate } as code strings.
  scene: { available: false, notBuilt: '3D scene challenges are not playable yet.' },
  // POST /v1/grade/workflow { rubric, candidate } (grader/service/README.md). The plan is stored as
  // text in the `markdown` field (the client shows non-page output as text) and must parse as JSON.
  workflow: {
    available: true,
    loadGoal: (dirs, slug) => ({ rubric: loadRubric(dirs, slug) }),
    instruction: workflowInstruction,
    userMessage: workflowMessage,
    streamType: 'text/plain; charset=utf-8',
    cleaner: () => new MarkdownCleaner({ fences: ['json'] }),
    outputField: 'markdown',
    validate(output) {
      try { JSON.parse(output); return null; } catch { return 'The model did not reply with valid JSON, so the plan cannot be graded. Ask for the plan as JSON only.'; }
    },
    graderRoute: '/v1/grade/workflow',
    gradeBody: (challenge, output) => ({ rubric: challenge.rubric, candidate: output }),
    standin: null,
  },
};
