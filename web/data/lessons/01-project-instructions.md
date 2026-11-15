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
- Tell the difference between advice the model reads and a limit the tool enforces.

## Why it matters

A coding model starts every session with no memory of your project. The instructions file is the only thing it reads every time. If the file says "use the test script" but never names it, the model guesses, runs the wrong command, and reports success on tests that never ran. One line, "Run `npm test` before you commit", prevents that.

Think of the file as the part of every prompt you never have to type again. Whatever you would otherwise repeat at the start of each session (the commands, the folders that matter, the things never to touch) goes here once. Whatever is wrong or vague here is wrong or vague in every session, which is why a few careful lines are worth more than a long file.

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

A good test for each line: would a capable new teammate, on their first day, get this wrong without being told? If yes, the line earns its place. If they would work it out from the first file they open, it does not.

### What does not

- Things the code already shows (the language, the folder list).
- Long explanations, history or marketing.
- Rules for one part of the code only. Claude Code can load those from `.claude/rules/` only when matching files are open; Copilot uses `applyTo`.
- Anything that must never happen. Claude Code's docs say the file is "context, not enforced configuration". Use a hook or a permission setting to block an action.

### Advice versus enforcement

This difference is worth stating plainly, because it decides where a rule goes. The instructions file is text the model reads. It raises the chance the model does the right thing; it does not make the wrong thing impossible. A model that is deep in a long task, or that meets two rules that seem to conflict, can still break a rule it read an hour ago.

So sort your rules into two kinds. Rules where an occasional slip is annoying but recoverable ("put tests next to the code") go in the file. Rules where a single slip is costly ("never push to `main`", "never delete the production database") go in the file too, so the model knows the reason, but they are also enforced by the tool: a permission rule that denies the command, or a hook that checks before an action runs. The file explains; the setting enforces.

### Keep it short and checkable

Claude Code's docs suggest under 200 lines per file: longer files cost more context and are followed less well. Each line should be something you could check by looking at the output. If two lines contradict each other, the model may pick either.

"Checkable" is the single most useful word in this lesson. "Write good tests" cannot be checked. "Every new route gets a test in `tests/routes/`" can: you look in the folder. "Be careful with the database" cannot be checked. "Never edit files in `db/migrations/`" can: you look at the diff. When you write a line, picture yourself reviewing the model's work afterwards. If you could not say whether the model followed the line, rewrite it until you could.

Research on instruction following points the same way. Benchmarks that measure it use instructions that can be verified by a program, such as a word count or a required keyword, because vague instructions cannot be scored at all. Studies that pile on more and more instructions find that models follow a smaller share of them as the count grows. Fewer, sharper lines are followed more reliably than many soft ones. (See "Go deeper" for the papers.)

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

### Worked example 2: weak versus strong

Here is the kind of file many projects start with, for a small Flask app:

````markdown
# Project guidelines

This is a Python web app built with Flask. It uses PostgreSQL.
Please follow best practices and write clean, well-tested code.
Be careful with the database. Run the linter if necessary.
Keep the code consistent with the rest of the project.
````

Every sentence sounds sensible, and almost none of it changes what the model does. Here is the same project, rewritten:

````markdown
# recipe-box

Flask app for saving recipes. Read this before changing anything.

## Commands

```bash
pip install -r requirements-dev.txt   # install
flask --app recipe_box run            # start on http://127.0.0.1:5000
pytest                                # run all tests
ruff check . && ruff format --check . # lint and format check
```

## Rules

- Never edit files in `migrations/versions/`. Create a new migration with `flask db migrate`.
- Never connect to the database named in `PROD_DATABASE_URL`.
- New views go in `recipe_box/views/`, one file per page.

## Done means

`pytest` and both ruff commands pass.
````

Why the strong version works, line by line:

- **"Python web app built with Flask" is gone.** The model sees that in the first file it opens. The line cost attention and taught nothing.
- **"Follow best practices" became exact commands.** "Best practices" means something different to every reader, so the model fills it with its own guess. A fenced command is copied exactly.
- **"Be careful with the database" became two rules you can check.** You can look at a diff and see whether `migrations/versions/` changed. You cannot look at a diff and see whether someone was careful.
- **"Run the linter if necessary" became a required step.** "If necessary" hands the decision to the model, which will often decide it is not necessary. "Done means" removes the choice.
- **"Keep the code consistent" became a placement rule.** The one convention a newcomer would get wrong (where views go) is stated; the rest the model can see in the code.

The strong file is longer, but every added line removes a guess. That is the trade you want.

## Common mistakes

1. **Vague commands.** "Run the tests" makes the model guess. Fix: write the exact command in a code fence.
2. **Restating the code.** "This project uses TypeScript" adds length and nothing else. Fix: delete anything the model will see in the first file it opens.
3. **One giant file.** A 600-line file buries the rules that matter. Fix: keep the core under 200 lines; move topic or folder rules to scoped files.
4. **Relying on the file for safety.** It is advice, not a lock. Fix: use the tool's permission or hook settings for hard limits.
5. **Wrong file name for the tool.** Codex does not read `CLAUDE.md`. Fix: check the table above, or use `AGENTS.md` and import it.
6. **Placeholders left in.** `<your command here>` is worse than nothing. Fix: fill it in or delete the line.
7. **Judgement words.** "As needed", "when appropriate", "if necessary" hand the decision back to the model. Fix: state the condition ("after any change to `src/db/`") or make the step always required.

## Check your understanding

1. Your `CLAUDE.md` says "Never run `git push --force`." A teammate says that makes force-pushes impossible. Are they right?

<details>
<summary>Answer</summary>

No. The file is context the model reads, not configuration the tool enforces. A model can still run the command, for example late in a long session. To block it, add a permission rule that denies the command or a hook that checks it; keep the line in the file so the model knows why.

</details>

2. Your team uses Claude Code and Codex. Where should the shared instructions live, and how does each tool get them?

<details>
<summary>Answer</summary>

Put them in `AGENTS.md`, which Codex reads. Add a short `CLAUDE.md` whose content includes `@AGENTS.md`, so Claude Code imports the same text, plus any Claude-specific lines. One source of truth means the two tools cannot drift apart.

</details>

3. Which of these lines should you delete: "This is a React app", "Run `pnpm test`, not `npm test`", "Never edit `src/generated/`"?

<details>
<summary>Answer</summary>

Delete "This is a React app": the model sees that immediately from `package.json` and the code. The other two are things a capable newcomer would get wrong without being told, and both can be checked.

</details>

4. Rewrite "Make sure the code is well tested" so it can be checked.

<details>
<summary>Answer</summary>

One good version: "Every new function in `src/` gets a test in `tests/`, and the test fails if the change is reverted." Any version works if a reviewer could look at the result and say yes or no.

</details>

5. Your instructions file has grown to 500 lines and the model keeps ignoring a rule near the middle. What are two changes that make the rule more likely to be followed?

<details>
<summary>Answer</summary>

Shorten the file (cut what the code already shows, move folder-specific rules to scoped files such as `.claude/rules/` or Copilot's `applyTo` files), and make the rule itself checkable and unambiguous. If the rule must never be broken, also enforce it with a hook or permission setting. Research on long contexts suggests material buried in the middle of long input is used less reliably, so a shorter file helps directly.

</details>

## How this changes your prompts

The habits in this lesson apply to every prompt, not only to instruction files.

**Name the command instead of the intention.**

```text
Before: Make sure everything still works after your change.
After:  After your change, run `pytest` and `ruff check .`. Both must pass.
```

**Turn a judgement word into a condition.**

```text
Before: Update the docs if necessary.
After:  If you change a command-line flag, update its row in the table in README.md.
```

**Say what is off limits, and why.**

```text
Before: Don't mess with the data.
After:  Do not change anything in data/samples/. The tests compare against those files.
```

**Ask for the instructions file itself with the facts, the sections and a budget.**

```text
Before: Write an AGENTS.md for my project.
After:  Write AGENTS.md for invoice-tool using only these facts: [list].
        Sections, in order: Overview, Commands, Layout, Rules, Done means.
        Every command in a fenced code block. Under 80 lines. Do not add facts I did not give.
```

## Try it: three bonus challenges

Each challenge gives you a project's facts. You write the prompt; the model writes the file; the grader checks it. The grader never checks a fact the challenge did not give you.

### Level 1: AGENTS.md for a small repo (`agents-md-for-a-repo`)

**Situation.** A teammate has a small Python project called `invoice-tool` and wants any coding agent to work on it safely. You are given its facts: install with `pip install -e .[dev]`, test with `pytest`, lint with `ruff check .`, code in `src/invoice_tool/`, tests in `tests/`, sample data in `data/samples/` that must never be changed, and `.env` that must never be read.

**Your task.** Write a prompt that gets the model to produce a complete `AGENTS.md` for this project.

**Graded on:**

- It has these sections: Overview, Commands, Layout, Rules, Done means.
- The three commands appear exactly as given, inside code fences.
- The paths `src/invoice_tool/`, `tests/` and `data/samples/` appear exactly.
- It says never to change `data/samples/` and never to read `.env`.
- It is under 80 lines.
- No placeholders (`TODO`, `<...>`, `your-project`, "lorem ipsum").

### Level 2: CLAUDE.md for a pnpm monorepo (`claude-md-for-a-monorepo`)

**Situation.** `trailmap` is a pnpm workspace with a web app in `apps/web/` and an API in `apps/api/`. The team already keeps shared notes in `AGENTS.md`. Two things keep going wrong: agents run `npm install`, which creates a second lockfile, and agents hand-edit the generated API client in `packages/client/src/generated/`, which `pnpm codegen` then overwrites. The commands are `pnpm install`, `pnpm --filter web test`, `pnpm --filter api test`, `pnpm lint` and `pnpm codegen`. The lockfile is `pnpm-lock.yaml`.

**Your task.** Get the model to write a `CLAUDE.md` that imports `AGENTS.md` and prevents both failures.

**Graded on:**

- A one-sentence description under the title, and the sections Overview, Commands, Layout, Rules, Done means.
- The import line `@AGENTS.md`.
- All five commands exactly, in code.
- Layout names `apps/web/` and `apps/api/`.
- Rules says never to edit `packages/client/src/generated/`, never to use npm or yarn, and names `pnpm-lock.yaml`.
- No npm or yarn command written as a command to run (a rule that says "never run npm" is fine).
- 80 to 400 words, no placeholders.

### Level 3: AGENTS.md with only checkable rules (`agents-md-with-checkable-rules`)

**Situation.** `parcel-tracker` is a Go service. Its commands are `go build ./...`, `go test ./...` and `golangci-lint run`. The entry point is `cmd/parcel-tracker/` and the code is in `internal/`. Agents must never run `make deploy` or commit directly to `main`, and must ask a person before changing `api/openapi.yaml` or adding a dependency to `go.mod`. The previous file was full of phrases like "follow best practices" and "be careful", and agents ignored it.

**Your task.** Get the model to write a tight `AGENTS.md` in which every rule can be checked.

**Graded on:**

- The sections Overview, Commands, Layout, Rules, Ask first, Done means, with Commands through Done means in that order.
- The three commands exactly, in code.
- Layout names `cmd/parcel-tracker/` and `internal/`.
- Rules says never to run `make deploy` and never to commit to `main`.
- Ask first names `api/openapi.yaml` and `go.mod`.
- None of these phrases: "as needed", "when appropriate", "if necessary", "best practice(s)", "be careful", "clean code", "etc.", "and so on".
- 80 to 300 words, no placeholders.

## Prompting tips for these challenges

- Give the model every fact in a list. It cannot invent the right command, and the grader checks exact text.
- Name the sections you want, in order. The model will otherwise choose its own headings.
- State the length budget as a number of lines or words.
- Say "put every command in a fenced code block" plainly.
- Ask it not to add sections or facts you did not give. Extra guesses cost length and can be wrong.
- For level 3, list the banned phrases in your prompt and ask the model to check its draft for them before it answers.

## Go deeper

### Official documentation

- [Claude Code: How Claude remembers your project](https://code.claude.com/docs/en/memory). Where `CLAUDE.md` files live, how imports with `@path` work, and scoped rules in `.claude/rules/`. Read it for the loading order.
- [Claude Code: Best practices](https://code.claude.com/docs/en/best-practices). Read the sections "Keep CLAUDE.md short", "Give Claude a check to run" and "Enforce the rules that can't have exceptions".
- [Claude Code: Hooks reference](https://code.claude.com/docs/en/hooks). How to run a check before or after the model acts. Read it when a rule must be enforced, not just stated.
- [OpenAI Codex: Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md). How Codex finds and joins `AGENTS.md` files from the root down, and its size limit.
- [GitHub Copilot: Adding repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions). Repository-wide and path-scoped (`applyTo`) instruction files.
- [Cursor: Rules](https://cursor.com/docs/rules). Project, team and user rules, glob-scoped rules and Cursor's support for nested `AGENTS.md`. Read "What to avoid in rules".

### Specifications and standards

- [AGENTS.md](https://agents.md/). The open format's home page: what goes in the file, examples, and the list of tools that read it.
- [RFC 2119: Key words for requirement levels](https://www.rfc-editor.org/info/rfc2119/). The two-page standard behind MUST, SHOULD and MAY. Read it to learn how specifications make the strength of a rule unambiguous.

### Engineering write-ups from the people who build these tools

- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents). Why context is a limited budget and how to spend it. Read "The anatomy of effective context".
- [Claude Platform: Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices). Being clear and direct, giving reasons for rules, and structuring long prompts. Applies to instruction files directly.

### Papers on the underlying ideas

- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) (Liu et al., 2023). Models used information at the start and end of long input better than information in the middle. A reason to keep files short.
- [How Many Instructions Can LLMs Follow at Once?](https://arxiv.org/abs/2507.11538) (IFScale, 2025). Measures how instruction following falls as the number of instructions grows to 500. Read the abstract and the results figures.
- [Instruction-Following Evaluation for Large Language Models](https://arxiv.org/abs/2311.07911) (IFEval, 2023). A benchmark built only from instructions a program can verify. Read it to see what "checkable" means in practice.
- [Chroma: Context Rot](https://www.trychroma.com/research/context-rot). Experiments showing model performance changes as input grows longer, even on simple tasks.

Links checked on 2026-11-15.

## Sources

- Claude Code, "How Claude remembers your project": https://code.claude.com/docs/en/memory
- Claude Code, "Best practices": https://code.claude.com/docs/en/best-practices
- AGENTS.md: https://agents.md/
- OpenAI Codex, AGENTS.md guide: https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Gemini CLI, GEMINI.md: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md
- GitHub Copilot, repository custom instructions: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
- Research claims in "Keep it short and checkable": IFEval (https://arxiv.org/abs/2311.07911), IFScale (https://arxiv.org/abs/2507.11538), Lost in the Middle (https://arxiv.org/abs/2307.03172).
