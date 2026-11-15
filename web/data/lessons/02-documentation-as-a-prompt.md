---
title: Documentation as a prompt
slug: documentation-as-a-prompt
level: 1
minutes: 20
summary: Write READMEs and specs that a model or a new teammate can act on without asking a single question.
bonusChallenge: readme-for-a-cli
grader: doc
---

# Documentation as a prompt

## What you will be able to do

- Treat a README or spec as instructions for a reader who cannot ask you anything.
- Give every fact a reader needs to act: exact commands, names, paths, values.
- Separate what is decided from what is still open, and mark the open parts.
- Check a document by asking "could someone act on this with no other help?"

## Why it matters

When you ask a model to "add a feature using the config described in the README", the README becomes part of your prompt. If it says "set your API key in the environment" but never names the variable, the model picks a name. The code then reads `API_KEY` while the deploy sets `WEATHER_API_KEY`, and the app fails in production with a missing-key error. Naming the variable once prevents the whole bug.

The same holds for people. A new teammate who has to ask three questions before running the project is a sign the README is incomplete.

## The ideas

### The reader cannot ask

Write for a reader who has only this page. That reader:

- copies commands exactly, so they must be exact and complete;
- does not know your names for things, so define them once;
- cannot tell a plan from a fact, so label which is which.

### What a README needs

1. **One sentence on what it is.** What it does and who it is for.
2. **Install.** Every command, in order, in a code fence. Name the version of the runtime.
3. **Use.** The most common command with real arguments and the output it gives.
4. **Configuration.** Every setting: its exact name, what it does, its default, whether it is required.
5. **Test.** The command that proves it works.
6. **Limits and open questions.** What it does not do yet. What is not decided.

### A spec is a README for work not done yet

A spec tells someone (or a model) what to build. It needs the same exactness plus a clear "done" test. "The page should load quickly" cannot be checked. "The page's HTML is under 50 KB and has no external scripts" can.

### Mark what you do not know

If the port might change, write "Port: 8080 (not final)". A reader who sees a confident wrong fact acts on it. A reader who sees "not final" checks first.

### Worked example

A complete README for a small command-line tool:

````markdown
# wordcount-cli

Counts words, lines and characters in text files. For people who want `wc`-style counts with JSON output.

## Install

Requires Node.js 20 or later.

```bash
npm install -g wordcount-cli
```

## Use

```bash
wordcount notes.txt
```

Output:

```text
notes.txt: 1204 words, 88 lines, 7311 characters
```

For JSON output:

```bash
wordcount --json notes.txt
```

## Configuration

| Setting | Where | Default | Required |
| --- | --- | --- | --- |
| `WORDCOUNT_ENCODING` | environment variable | `utf8` | No |
| `--json` | command-line flag | off | No |

## Test

```bash
npm test
```

All tests pass in under five seconds on a laptop.

## Limits

- Does not read from standard input yet.
- Counting rules for hyphenated words are not decided (currently counted as one word).
````

Every command can be copied. Every setting has a name, a default and a required flag. The open question is labelled.

## Common mistakes

1. **"Configure as needed."** The reader does not know what is needed. Fix: list every setting with its exact name and default.
2. **Commands in prose.** "Install the dependencies and run the dev server" leaves the reader to guess two commands. Fix: one fenced block per step, with the exact command.
3. **No expected output.** The reader cannot tell if it worked. Fix: show what success prints.
4. **Plans written as facts.** "Supports CSV" when it does not yet. Fix: put unbuilt things under Limits, labelled.
5. **Out of date.** The command was renamed and the README was not. Fix: update the README in the same change as the code, and run each command once before you commit.
6. **Too long.** A wall of history hides the install step. Fix: keep the top of the README to what a reader needs to act; link to longer notes.

## Try it: bonus challenge

**Situation.** You have built a small tool called `site-check` that checks a folder of HTML files for broken links. Its facts: install with `pip install site-check`, run with `site-check ./public`, add `--external` to also check outside links, set `SITE_CHECK_TIMEOUT` (seconds, default `10`) to change the request timeout, test with `pytest`. It does not yet check images.

**Your task.** Write a prompt that gets the model to produce a complete `README.md` for `site-check`.

**Graded on:**

- It has these sections: Install, Use, Configuration, Test, Limits.
- The commands `pip install site-check`, `site-check ./public` and `pytest` appear exactly, inside code fences.
- The names `--external` and `SITE_CHECK_TIMEOUT` and the default `10` appear exactly.
- It says images are not checked yet.
- It is under 400 words.
- No placeholders (`TODO`, `<...>`, `example.com/your-repo`, "lorem ipsum").

## Prompting tips for this challenge

- Paste the facts as a list and tell the model to use only those facts. Invented flags fail the exact-text checks and mislead readers.
- Name the sections and their order.
- Ask for an example of the output, and say what it should look like, or tell the model to leave output out. Do not let it guess numbers that look real.
- Give the word budget.
- Ask the model to read its draft as someone who has never seen the tool, and to fix anything that reader would have to ask about.

## Sources

General method; no product facts are claimed in this lesson. For the instruction-file side of documentation, see lesson 1's sources.

- AGENTS.md, on keeping agent notes separate from the human README: https://agents.md/
