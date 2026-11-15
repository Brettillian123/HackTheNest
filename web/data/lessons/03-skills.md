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

## Why it matters

Instructions files load every session. Put your twelve-step release process in `CLAUDE.md` and it costs context on every task, even a typo fix. Leave it out and the model improvises the release and skips the step that tags the version. A skill keeps the process on the shelf until a release is happening.

## The ideas

### What a skill is

A skill is a folder with a `SKILL.md` file in it, plus any scripts, references or templates the task needs. The format is the open Agent Skills standard (agentskills.io), first developed by Anthropic and released as an open standard.

Agents load skills in three stages:

1. **Discovery.** At start-up the agent reads only each skill's `name` and `description` (the spec estimates about 100 tokens per skill).
2. **Activation.** When a task matches the description, the agent reads the whole `SKILL.md`.
3. **Execution.** It follows the steps, and opens supporting files or runs scripts only if the steps call for them.

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

### Keep the body short

The spec recommends a `SKILL.md` under 500 lines (under about 5,000 tokens) and supporting files linked one level deep with relative paths, such as `references/style.md`.

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

## Common mistakes

1. **A vague description.** "Helps with docs" triggers on everything or nothing. Fix: say what it does, then "Use when ..." with the user's likely words.
2. **Name and folder differ.** The spec requires them to match. Fix: rename one.
3. **Capitals or spaces in the name.** `Release Notes` is invalid. Fix: `release-notes`.
4. **Everything in one file.** A 900-line `SKILL.md` loads in full on activation. Fix: move reference material to `references/` and link it.
5. **Putting always-needed rules in a skill.** If every task needs it, it belongs in the instructions file. Fix: skills for occasional tasks only.
6. **Dangerous skills that start themselves.** A deploy skill should not run because a user said "ship it" in passing. Fix: in Claude Code, set `disable-model-invocation: true`.

## Try it: bonus challenge

**Situation.** Your team writes release notes for each version of a web app. The steps: read `CHANGELOG.md`, take the `## [Unreleased]` section, rewrite it for users (no internal ticket numbers), save it as `docs/releases/<version>.md`, and run `npm run docs:check`. The skill folder must be called `release-notes`.

**Your task.** Write a prompt that gets the model to produce `release-notes/SKILL.md`.

**Graded on:**

- Front matter has `name: release-notes` and a `description`.
- The description is 1 to 1024 characters and contains "Use when".
- The paths `CHANGELOG.md` and `docs/releases/` and the command `npm run docs:check` appear exactly; the command is in a code fence.
- It has a numbered Steps section and a Rules section.
- It is under 120 lines.
- No placeholders other than the labelled `<version>` value.

## Prompting tips for this challenge

- Give the folder name; say `name` must match it.
- Ask for a two-part description: what it does, then "Use when ..." with phrases a user might type.
- List the steps yourself, so the model formats them rather than inventing them.
- Say that `<version>` is filled in at run time.
- Give the line budget.

## Sources

- Agent Skills overview: https://agentskills.io/
- Agent Skills specification: https://agentskills.io/specification
- Claude Code, skills: https://code.claude.com/docs/en/skills
- Claude Code, rules and instructions: https://code.claude.com/docs/en/memory
- OpenAI Codex, build skills: https://learn.chatgpt.com/docs/build-skills
- GitHub Copilot, adding agent skills: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills
