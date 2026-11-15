---
title: Project instructions a model actually follows
slug: project-instructions
level: 1
minutes: 20
summary: Write a short, checkable instructions file (CLAUDE.md, AGENTS.md and the like) that a coding model reads at the start of every session.
bonusChallenge: agents-md-for-a-repo
grader: doc
---

# Project instructions a model actually follows

## What you will be able to do

- Name the instruction file each common coding tool reads, and where it looks for it.
- Decide what belongs in the file and what does not.
- Write instructions that are specific enough to check ("run `npm test`"), not vague ("test your changes").
- Keep the file short enough that the model follows all of it.

## Why it matters

A coding model starts every session with no memory of your project. The instructions file is the only thing it reads every time. If the file says "use the test script" but never names it, the model guesses, runs the wrong command, and reports success on tests that never ran. One line, "Run `npm test` before you commit", prevents that.

## The ideas

### Which tool reads which file

| Tool | File it reads | Notes |
| --- | --- | --- |
| Claude Code | `CLAUDE.md` or `.claude/CLAUDE.md` in the project; `~/.claude/CLAUDE.md` for you personally; `CLAUDE.local.md` for private notes | Reads `AGENTS.md` instead when there is no `CLAUDE.md` (v2.1.277 or later). Can import other files with `@path/to/file`. |
| OpenAI Codex | `AGENTS.md` (or `AGENTS.override.md`) from the repository root down to the current folder; `~/.codex/AGENTS.md` globally | Stops adding files once they total 32 KiB (`project_doc_max_bytes`). |
| Gemini CLI | `GEMINI.md`, globally in `~/.gemini/` and in the project | Other names, such as `AGENTS.md`, can be added with the `context.fileName` setting. |
| GitHub Copilot | `.github/copilot-instructions.md`; `.github/instructions/*.instructions.md` with an `applyTo` glob; `AGENTS.md` | Also accepts a single `CLAUDE.md` or `GEMINI.md` at the repository root. |

`AGENTS.md` is an open format: plain Markdown, no required fields. The agents.md site lists more than twenty tools that read it, including Cursor, Zed, Aider and Devin (we checked the list, not each tool's own docs). When several files apply, the nearest one to the file being edited usually wins or is read last. If your team uses more than one tool, `AGENTS.md` is the safest single file, and a `CLAUDE.md` can import it with `@AGENTS.md`.

### What belongs in it

Things the model cannot work out by reading the code, and needs every time:

- the exact commands to install, build, test and lint;
- where things live, when it is not obvious;
- rules that are easy to break (files never to edit, secrets never to read);
- how to know a change is done.

### What does not

- Things the code already shows (the language, the folder list).
- Long explanations, history or marketing.
- Rules for one part of the code only. Claude Code can load those from `.claude/rules/` only when matching files are open; Copilot uses `applyTo`.
- Anything that must never happen. Claude Code's docs say the file is "context, not enforced configuration". Use a hook or a permission setting to block an action.

### Keep it short and checkable

Claude Code's docs suggest under 200 lines per file: longer files cost more context and are followed less well. Each line should be something you could check by looking at the output. If two lines contradict each other, the model may pick either.

### Worked example

A complete `AGENTS.md` for a small Node.js API:

````markdown
# Notes API

A small REST API for personal notes. Node.js 20, Express, PostgreSQL.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start on http://localhost:3000
npm test             # run all tests (Vitest)
npm run lint         # ESLint; must pass before a commit
```

## Layout

- `src/routes/` one file per resource
- `src/db/` queries only; no business logic
- `tests/` mirrors `src/`

## Rules

- Never edit files in `db/migrations/`. Add a new migration instead.
- Never read or print `.env`. Variable names are in `.env.example`.
- Every new route gets a test in `tests/routes/`.

## Done means

`npm test` and `npm run lint` both pass, and the new test fails without your change.
````

It is 30 lines. Every rule can be checked.

## Common mistakes

1. **Vague commands.** "Run the tests" makes the model guess. Fix: write the exact command in a code fence.
2. **Restating the code.** "This project uses TypeScript" adds length and nothing else. Fix: delete anything the model will see in the first file it opens.
3. **One giant file.** A 600-line file buries the rules that matter. Fix: keep the core under 200 lines; move topic or folder rules to scoped files.
4. **Relying on the file for safety.** It is advice, not a lock. Fix: use the tool's permission or hook settings for hard limits.
5. **Wrong file name for the tool.** Codex does not read `CLAUDE.md`. Fix: check the table above, or use `AGENTS.md` and import it.
6. **Placeholders left in.** `<your command here>` is worse than nothing. Fix: fill it in or delete the line.

## Try it: bonus challenge

**Situation.** A teammate has a small Python project called `invoice-tool` and wants any coding agent to work on it safely. You are given its facts: install with `pip install -e .[dev]`, test with `pytest`, lint with `ruff check .`, code in `src/invoice_tool/`, tests in `tests/`, sample data in `data/samples/` that must never be changed, and `.env` that must never be read.

**Your task.** Write a prompt that gets the model to produce a complete `AGENTS.md` for this project.

**Graded on:**

- It has these sections: Overview, Commands, Layout, Rules, Done means.
- The three commands appear exactly as given, inside code fences.
- The paths `src/invoice_tool/`, `tests/` and `data/samples/` appear exactly.
- It says never to change `data/samples/` and never to read `.env`.
- It is under 80 lines.
- No placeholders (`TODO`, `<...>`, `your-project`, "lorem ipsum").

## Prompting tips for this challenge

- Give the model every fact in a list. It cannot invent the right command, and the grader checks exact text.
- Name the sections you want, in order. The model will otherwise choose its own headings.
- State the length budget as a number of lines.
- Say "put every command in a fenced code block" plainly.
- Ask it not to add sections or facts you did not give. Extra guesses cost length and can be wrong.

## Sources

- Claude Code, "How Claude remembers your project": https://code.claude.com/docs/en/memory
- AGENTS.md: https://agents.md/
- OpenAI Codex, AGENTS.md guide: https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Gemini CLI, GEMINI.md: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md
- GitHub Copilot, repository custom instructions: https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
