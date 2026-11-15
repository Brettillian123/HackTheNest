---
title: "Skills: packaging a repeatable task"
slug: skills
level: 2
minutes: 25
summary: Package a task you repeat into a skill folder with a SKILL.md file, so a model loads it only when the task comes up.
bonusChallenge: release-notes-skill
grader: doc
---

# Skills: packaging a repeatable task

## What you will be able to do

- Explain what a skill is and how it differs from a project instructions file.
- Write a valid `SKILL.md` with correct front matter.
- Write a description that makes the model pick the skill at the right time, and not at the wrong time.
- Split long material into supporting files that load only when needed.
- Decide when a skill should start only when a person asks for it.

## Why it matters

Instructions files load every session. Put your twelve-step release process in `CLAUDE.md` and it costs context on every task, even a typo fix. Leave it out and the model improvises the release and skips the step that tags the version. A skill keeps the process on the shelf until a release is happening.

A skill is also how you stop explaining the same procedure again and again. If you have typed "first check the tree is clean, then build, then deploy, then run the smoke tests" into three chats this week, that procedure wants to be a skill. Written once, carefully, it runs the same way every time, and when the procedure changes you change one file.

## The ideas

### What a skill is

A skill is a folder with a `SKILL.md` file in it, plus any scripts, references or templates the task needs. The format is the open Agent Skills standard (agentskills.io), first developed by Anthropic and released as an open standard.

Agents load skills in three stages:

1. **Discovery.** At start-up the agent reads only each skill's `name` and `description` (the spec estimates about 100 tokens per skill).
2. **Activation.** When a task matches the description, the agent reads the whole `SKILL.md`.
3. **Execution.** It follows the steps, and opens supporting files or runs scripts only if the steps call for them.

This staged loading is often called progressive disclosure. It is the reason a skill can be long and detailed without slowing down every session: until it is needed, it costs only its description.

### Skill or instructions file?

Use this rule of thumb. If nearly every task in the project needs it, it goes in the instructions file (lesson 1): the test command, the folders never to touch. If only some tasks need it, and it has more than a couple of steps, it is a skill: the release process, the database migration routine, the way your team writes pull-request descriptions. A skill that every task needs is just an instructions file that loads late; an instructions file full of occasional procedures is a skill library that never closes.

### Which products use it, and where

| Product | Project skills | Personal skills |
| --- | --- | --- |
| Claude Code | `.claude/skills/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` |
| OpenAI Codex | `.agents/skills/` (from the current folder up to the repo root) | `$HOME/.agents/skills/` |
| GitHub Copilot (cloud agent, code review, CLI, VS Code agent mode) | `.github/skills/`, `.claude/skills/` or `.agents/skills/` | `~/.copilot/skills/` or `~/.agents/skills/` |

Codex's docs say its skills "build on" the open standard; they do not claim full compliance. Copilot lists `name`, `description`, `license` and `allowed-tools` as its fields. We did not check Cursor, Gemini CLI or other tools for skills support: treat that as unconfirmed. Where a tool has no skills, the nearest equivalent is a scoped instructions file that loads only for matching paths, such as Copilot's `.github/instructions/*.instructions.md` with `applyTo`, or Claude Code's `.claude/rules/` with `paths`.

### The front matter

From the Agent Skills specification:

| Field | Required | Rule |
| --- | --- | --- |
| `name` | Yes | 1 to 64 characters; lowercase letters, digits and hyphens; no leading, trailing or double hyphen; must match the folder name |
| `description` | Yes | 1 to 1024 characters; says what the skill does and when to use it |
| `license` | No | A licence name or a bundled licence file |
| `compatibility` | No | Up to 500 characters; environment needs |
| `metadata` | No | String keys to string values |
| `allowed-tools` | No | Space-separated pre-approved tools; experimental, support varies |

Products add their own fields. Claude Code, for example, has `disable-model-invocation: true` (only you can start the skill, with `/name`) and truncates the combined description text at 1,536 characters in its listing, so put the main use first.

### The description decides when it triggers

The model sees only the description when choosing. Say what the skill does and name the words a user would say. The spec's own contrast: "Helps with PDFs." is poor; a description that lists extracting text, filling forms and merging files, and says "Use when working with PDF documents", is good.

A description has two jobs, and it can fail at either. It can be too narrow, so the skill never triggers ("Runs the Alembic autogenerate command" will not match "I added a column, can you sort out the database?"). It can be too broad, so it triggers on unrelated work ("Helps with the database" matches every query you write). The fix for both is the same two-part shape: first what the skill does, concretely; then "Use when ..." followed by the phrases a user would actually type.

### Who may start the skill

Most skills should start on their own when the task matches: that is the point. Some should not. A skill that deploys, deletes, sends messages or spends money should run only when a person asks, because a description that matches "ship it" will also match a passing remark. In Claude Code you set `disable-model-invocation: true`, and the skill then runs only when you type its name, such as `/deploy-staging`. In tools without such a field, say plainly in the description that the skill is started only on request, and keep hard limits in the tool's permission settings, as lesson 1 explains.

### Keep the body short

The spec recommends a `SKILL.md` under 500 lines (under about 5,000 tokens) and supporting files linked one level deep with relative paths, such as `references/style.md`.

Write the body as steps a careful newcomer could follow: numbered, one action each, with exact commands. Put the checks inside the steps ("If `git status --porcelain` prints anything, stop") rather than in a paragraph at the end, because a model follows steps in order and may not look back. End with what to do when something fails. A skill that only describes the happy path leaves the model to improvise exactly when improvising is most expensive.

### Worked example

Folder `changelog-entry/`, file `changelog-entry/SKILL.md`:

````markdown
---
name: changelog-entry
description: Writes a new entry at the top of CHANGELOG.md from the commits since the last tag, in Keep a Changelog style. Use when the user asks to update the changelog, write release notes for CHANGELOG.md, or prepare a version bump.
license: MIT
---

# Changelog entry

## Steps

1. Find the last tag:

   ```bash
   git describe --tags --abbrev=0
   ```

2. List commits since that tag:

   ```bash
   git log --oneline <last-tag>..HEAD
   ```

   Replace `<last-tag>` with the output of step 1.

3. Sort each commit into Added, Changed, Fixed or Removed. Skip merge commits.
4. Write the entry at the top of `CHANGELOG.md` under `## [Unreleased]`, following `references/format.md`.
5. Show the user the new entry. Do not commit.

## Rules

- One line per change, starting with a verb.
- Do not invent changes that are not in the commit list.
````

Plus `changelog-entry/references/format.md` with a short example entry. (The `<last-tag>` in step 2 is a labelled value to fill in at run time, not a forgotten placeholder.)

### Worked example 2: weak versus strong

A weak skill for adding a database migration in a Python project that uses Alembic:

````markdown
---
name: Database Helper
description: Helps with database stuff.
---

Help the user with database changes. Make the migration and
apply it. Be careful not to break anything. Test as needed.
````

The same skill, rewritten. Folder `new-migration/`, file `new-migration/SKILL.md`:

````markdown
---
name: new-migration
description: Creates and applies an Alembic migration after a change to the SQLAlchemy models in app/models/. Use when the user adds, renames or removes a model or column, or asks for a migration or a schema change.
---

# New migration

## Steps

1. Run `git status --porcelain app/models/`. If nothing has changed there, stop and ask which change needs a migration.
2. Create the migration: `alembic revision --autogenerate -m "short description"`, with a description of the change.
3. Open the new file in `migrations/versions/` and check it against `references/autogenerate-limits.md`. Fix anything autogenerate missed.
4. Apply it to the local database: `alembic upgrade head`.
5. Run `pytest tests/db/`.

## Rules

- Never edit a migration that is already on `main`. Write a new one.
- Never run `alembic downgrade` unless the user asks.

## If something fails

If `alembic upgrade head` fails, show the error and stop. Do not delete the migration file.
````

Why the strong version works:

- **The name is valid.** `Database Helper` breaks the spec twice (capitals and a space) and does not match any folder. `new-migration` matches its folder.
- **The description can trigger correctly.** "Helps with database stuff" matches every query and no specific request. The new one says what it does and lists what the user would say: adds a column, asks for a migration, schema change.
- **"Make the migration and apply it" became exact commands,** in order, each a separate step.
- **"Be careful" became checks at the point they matter:** a clean-tree check before starting, a review step that points at a supporting file, and two "never" rules a reviewer can verify.
- **"Test as needed" became one test command,** always run.
- **The long material moved out.** The list of things autogenerate misses lives in `references/autogenerate-limits.md` and loads only at step 3.
- **There is a failure path.** The model knows to stop and show the error, not to "fix" it by deleting files.

## Common mistakes

1. **A vague description.** "Helps with docs" triggers on everything or nothing. Fix: say what it does, then "Use when ..." with the user's likely words.
2. **Name and folder differ.** The spec requires them to match. Fix: rename one.
3. **Capitals or spaces in the name.** `Release Notes` is invalid. Fix: `release-notes`.
4. **Everything in one file.** A 900-line `SKILL.md` loads in full on activation. Fix: move reference material to `references/` and link it.
5. **Putting always-needed rules in a skill.** If every task needs it, it belongs in the instructions file. Fix: skills for occasional tasks only.
6. **Dangerous skills that start themselves.** A deploy skill should not run because a user said "ship it" in passing. Fix: in Claude Code, set `disable-model-invocation: true`.
7. **No failure path.** The steps cover only success. Fix: add what to do when a command fails, and say "stop and report" where improvising would be risky.

## Check your understanding

1. Your team's test command is needed on almost every task. A teammate wants to put it in a skill to save context. What do you say?

<details>
<summary>Answer</summary>

Put it in the instructions file instead. A skill saves context only for things most tasks do not need. Something nearly every task needs would trigger almost every time anyway, and if the description fails to match even once, the model runs without it.

</details>

2. You have a skill with a good body, but it never triggers. What do you change first, and why?

<details>
<summary>Answer</summary>

The description. At discovery the model sees only the name and description, never the body. Rewrite it as what the skill does, then "Use when ..." with the words a user would actually type for this task.

</details>

3. Why is `disable-model-invocation: true` right for a deploy skill and wrong for a changelog skill?

<details>
<summary>Answer</summary>

A deploy has effects that are hard to undo, so it should run only when a person deliberately asks with `/name`. A changelog entry is shown to the user before anything is committed, so starting automatically is harmless and saves typing. The question is the cost of running it at the wrong moment.

</details>

4. Your `SKILL.md` has grown to 900 lines because it includes a full style guide. What is the cost, and what is the fix?

<details>
<summary>Answer</summary>

On activation the whole file loads, so every use pays for the style guide, even when a step does not need it. Move the guide to a supporting file such as `references/style.md`, link it from the step that uses it, and keep `SKILL.md` under the spec's recommended 500 lines.

</details>

5. Your folder is `release-notes/` and the front matter says `name: release_notes`. What goes wrong?

<details>
<summary>Answer</summary>

The name is invalid twice over: underscores are not allowed, and the spec requires the name to match the folder. A tool that validates against the spec may reject or ignore the skill. Use `name: release-notes`.

</details>

## How this changes your prompts

Writing skills teaches you to write procedures, and that helps every multi-step prompt.

**Number the steps and put checks inside them.**

```text
Before: Deploy to staging, but make sure everything is committed and tested.
After:  1. Run `git status --porcelain`. If it prints anything, stop and tell me.
        2. Run `npm run build`.
        3. Run `npm run deploy:staging`.
        4. Run `npm run smoke:staging` and report the result.
```

**Say what to do on failure.**

```text
Before: Apply the migration.
After:  Run `alembic upgrade head`. If it fails, show me the error and stop.
        Do not delete or edit the migration file.
```

**Ask for a skill with a two-part description.**

```text
Before: Make a skill for PR descriptions.
After:  Write pr-description/SKILL.md. The description says what the skill does, then
        "Use when" followed by phrases like "write a PR description" or "summarise this branch".
        name must be pr-description, matching the folder.
```

**Ask for long material to be split out.**

```text
Before: Include our full style guide in the skill.
After:  Keep SKILL.md under 120 lines. Put the style guide in references/style.md and
        link it from the step that needs it.
```

## Try it: three bonus challenges

Each challenge gives you the facts. You write the prompt; the model writes the `SKILL.md`; the grader checks it. The grader never checks a fact the challenge did not give you.

### Level 1: A pull-request description skill (`pr-description-skill`)

**Situation.** You keep asking a model to describe your branch for a pull request, and you keep typing the same steps. The skill folder is `pr-description`. The steps: list commits with `git log --oneline main..HEAD`, list changed files with `git diff --stat main...HEAD`, write the description under three headings (Summary, Changes, Testing), and show it to the user. It must never invent test results and must not open the pull request itself.

**Your task.** Get the model to write `pr-description/SKILL.md`.

**Graded on:**

- Front matter has `name: pr-description` and a description of at most 1024 characters that mentions pull requests and contains "Use when".
- A numbered Steps section, then a Rules section.
- Steps has both git commands exactly, in code, and names the headings Summary, Changes and Testing.
- Rules says not to invent test results and not to open the pull request.
- 50 to 400 words, no placeholders.

### Level 2: A release-notes skill (`release-notes-skill`)

**Situation.** Your team writes release notes for each version of a web app. The steps: read `CHANGELOG.md`, take the `## [Unreleased]` section, rewrite it for users (no internal ticket numbers), save it as `docs/releases/<version>.md`, and run `npm run docs:check`. The skill folder must be called `release-notes`.

**Your task.** Write a prompt that gets the model to produce `release-notes/SKILL.md`.

**Graded on:**

- Front matter has `name: release-notes` and a `description`.
- The description is 1 to 1024 characters and contains "Use when".
- The paths `CHANGELOG.md` and `docs/releases/` and the command `npm run docs:check` appear exactly; the command is in a code fence.
- It has a numbered Steps section and a Rules section.
- It is under 120 lines.
- No placeholders other than the labelled `<version>` value.

### Level 3: A deploy skill that only a person can start (`deploy-staging-skill`)

**Situation.** Your team deploys to staging by hand and someone always forgets a step. The skill folder is `deploy-staging`. It must start only when a person types `/deploy-staging`, so its front matter sets `disable-model-invocation: true`. The steps: `git status --porcelain` must print nothing (otherwise stop), then `npm run build`, `npm run deploy:staging` and `npm run smoke:staging`, then report the result. It must never deploy to production or skip the smoke tests. If anything fails, follow `references/rollback.md`, then stop and report.

**Your task.** Get the model to write `deploy-staging/SKILL.md` that is safe to keep in the repository.

**Graded on:**

- Front matter has `name: deploy-staging`, `disable-model-invocation: true` and a description of at most 1024 characters that mentions staging and contains "Use when".
- A numbered Steps section with the four commands exactly, in code, and the word "smoke".
- A Rules section, after Steps, that says never to deploy to production.
- An "If something fails" section that names `references/rollback.md`.
- No production deploy command written as a step to run.
- 60 to 500 words, no placeholders.

## Prompting tips for these challenges

- Give the folder name; say `name` must match it.
- Ask for a two-part description: what it does, then "Use when ..." with phrases a user might type.
- List the steps yourself, so the model formats them rather than inventing them.
- Say that `<version>` is filled in at run time (level 2).
- Give the length budget.
- For level 3, name every front-matter field you need, and ask for the failure section by its exact heading.

## Go deeper

### Official documentation

- [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/skills). Where skills live, how `/name` invocation works, and Claude Code's extra front-matter fields such as `disable-model-invocation`.
- [Claude Platform: Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview). How skills are structured and loaded across Claude products.
- [Claude Platform: Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices). The most practical page on this list. Read "Writing effective descriptions", "Progressive disclosure patterns", "Workflows and feedback loops" and the closing checklist.
- [OpenAI Codex: Build skills](https://learn.chatgpt.com/docs/build-skills). How Codex finds and uses skills, and where its format follows the standard.
- [GitHub Copilot: Adding agent skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills). Copilot's skill folders and the fields it supports.

### Specifications and standards

- [Agent Skills overview](https://agentskills.io/home). The open standard's home: what a skill is and which tools adopt it.
- [Agent Skills specification](https://agentskills.io/specification). The exact rules for folders, front matter and supporting files. Read it once end to end; it is short.
- [agentskills/agentskills on GitHub](https://github.com/agentskills/agentskills). The repository that holds the specification and its documentation. Watch it for changes to the standard.
- [YAML 1.2.2 specification](https://yaml.org/spec/1.2.2/). The language front matter is written in. Skim chapter 2 for the basics of keys, strings and lists.

### Engineering write-ups from the people who build these tools

- [Anthropic: Equipping agents for the real world with Agent Skills](https://www.anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills). Why skills were designed this way: progressive disclosure, code in skills, and security considerations.
- [anthropics/skills on GitHub](https://github.com/anthropics/skills). Anthropic's public repository of example skills. Read several `SKILL.md` files to see real descriptions and step lists.
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents). The context-budget thinking behind loading material only when it is needed.

### Papers on the underlying ideas

- [Voyager: An Open-Ended Embodied Agent with Large Language Models](https://arxiv.org/abs/2305.16291) (Wang et al., 2023). A research agent that builds a growing library of reusable skills as code and retrieves them when needed. An early look at the idea that skills compound.

Links checked on 2026-11-15.

## Sources

- Agent Skills overview: https://agentskills.io/home
- Agent Skills specification: https://agentskills.io/specification
- Claude Code, skills: https://code.claude.com/docs/en/skills
- Claude Code, rules and instructions: https://code.claude.com/docs/en/memory
- OpenAI Codex, build skills: https://learn.chatgpt.com/docs/build-skills
- GitHub Copilot, adding agent skills: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills
- Alembic commands in worked example 2: `alembic upgrade head` from the tutorial (https://alembic.sqlalchemy.org/en/latest/tutorial.html); `alembic revision --autogenerate` and the fact that autogenerate does not detect every change, from https://alembic.sqlalchemy.org/en/latest/autogenerate.html
