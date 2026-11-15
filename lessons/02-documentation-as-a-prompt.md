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
- Write requirements that can be tested, and a "done" test that ends the argument.
- Check a document by asking "could someone act on this with no other help?"

## Why it matters

When you ask a model to "add a feature using the config described in the README", the README becomes part of your prompt. If it says "set your API key in the environment" but never names the variable, the model picks a name. The code then reads `API_KEY` while the deploy sets `WEATHER_API_KEY`, and the app fails in production with a missing-key error. Naming the variable once prevents the whole bug.

The same holds for people. A new teammate who has to ask three questions before running the project is a sign the README is incomplete.

Coding agents make this sharper. An agent that is told "implement the spec in `docs/export.md`" will not stop to ask what "fast" means or which columns you wanted. It will choose, confidently, and move on. Every gap in the document becomes a guess in the code. Writing the document well is the cheapest way to control what gets built.

## The ideas

### The reader cannot ask

Write for a reader who has only this page. That reader:

- copies commands exactly, so they must be exact and complete;
- does not know your names for things, so define them once;
- cannot tell a plan from a fact, so label which is which.

A model is the extreme case of this reader. It has read a great many READMEs, so when yours leaves a gap it fills the gap with whatever is most typical. Typical is often wrong for your project: the usual port, the usual variable name, the usual test command. The more ordinary the guess looks, the harder the mistake is to spot in review.

### What a README needs

1. **One sentence on what it is.** What it does and who it is for.
2. **Install.** Every command, in order, in a code fence. Name the version of the runtime.
3. **Use.** The most common command with real arguments and the output it gives.
4. **Configuration.** Every setting: its exact name, what it does, its default, whether it is required.
5. **Test.** The command that proves it works.
6. **Limits and open questions.** What it does not do yet. What is not decided.

A README is mostly reference and how-to material. The Diátaxis framework, used by many documentation teams, splits documentation into four kinds: tutorials, how-to guides, reference and explanation. Keeping a README to the reference and how-to parts (what to run, what to set) and linking out for the long explanation is what keeps it short enough to act on.

### Configuration deserves a table

Configuration is where most guessing happens, because settings are invisible until something breaks. The Twelve-Factor App method recommends keeping configuration in environment variables, separate from code; that makes it even more important that the README names each one. For every setting, give four facts: the exact name, what it does, the default, and whether it is required. A table is the clearest form, because a missing cell is visible at a glance. If a setting has no default and the program will not start without it, say so in those words.

### A spec is a README for work not done yet

A spec tells someone (or a model) what to build. It needs the same exactness plus a clear "done" test. "The page should load quickly" cannot be checked. "The page's HTML is under 50 KB and has no external scripts" can.

A useful spec has five parts: the goal (one or two sentences on why), the requirements (numbered, each testable), what is out of scope, the open questions, and the done test. "Out of scope" is the part people skip and models need most. Without it, a model asked to "add CSV export" may helpfully add Excel export, scheduled emails and a settings page.

Standards documents solve the strength problem with fixed words. RFC 2119 defines MUST, SHOULD and MAY so that a reader knows which requirements are absolute and which are recommendations. You do not need capital letters in a school project, but you do need the same discipline: each requirement should say clearly whether it is required or optional.

### Mark what you do not know

If the port might change, write "Port: 8080 (not final)". A reader who sees a confident wrong fact acts on it. A reader who sees "not final" checks first.

With a model, an unmarked gap is worse than a marked one. If your spec says nothing about deleted records, the model decides for you and the decision is buried in the code. If your spec says "Whether deleted records are included is not decided", a good model will leave that part alone or ask, and a reviewer can see the question is still open.

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

### Worked example 2: weak versus strong spec

A weak spec for a small feature in a to-do app:

````markdown
# Dark mode

Add a dark mode to the app. It should look good and be easy to turn on.
It should remember the user's choice. Make sure it works everywhere
and doesn't slow anything down. Support system settings etc.
````

The same feature, written so a model can build it and a reviewer can check it:

````markdown
# Spec: dark mode for todo-web

Let users switch the interface to a dark colour scheme.

## Requirements

1. Add a toggle labelled "Dark mode" to the Settings page.
2. When on, set `data-theme="dark"` on the `<html>` element.
3. Save the choice in `localStorage` under the key `theme`.
4. On first visit, with nothing saved, follow the system setting (`prefers-color-scheme`).
5. Text on every page meets a contrast ratio of at least 4.5:1 in both themes.

## Out of scope

- A theme editor or more than two themes.

## Open questions

- Whether the login page also switches is not decided.

## Done when

`npm test -- theme` passes, and each requirement above has a test.
````

Why the strong version works:

- **"Look good" became a measurable contrast ratio.** 4.5:1 is the WCAG minimum for text that is not large; a tool can check it. "Look good" cannot be checked by anyone.
- **"Easy to turn on" became a named control on a named page.** The model no longer has to invent where the toggle goes.
- **"Remember the user's choice" became a storage key.** Two developers, or a developer and a model, now write code that agrees.
- **"Support system settings etc." became one precise rule,** and "etc." is gone. "Etc." asks the reader to imagine the rest of the list, and a model will.
- **"Works everywhere" became a scoped list,** with an Out of scope line that blocks the most likely extra work.
- **The login page question is marked open** instead of left for the model to decide silently.

## Common mistakes

1. **"Configure as needed."** The reader does not know what is needed. Fix: list every setting with its exact name and default.
2. **Commands in prose.** "Install the dependencies and run the dev server" leaves the reader to guess two commands. Fix: one fenced block per step, with the exact command.
3. **No expected output.** The reader cannot tell if it worked. Fix: show what success prints.
4. **Plans written as facts.** "Supports CSV" when it does not yet. Fix: put unbuilt things under Limits, labelled.
5. **Out of date.** The command was renamed and the README was not. Fix: update the README in the same change as the code, and run each command once before you commit.
6. **Too long.** A wall of history hides the install step. Fix: keep the top of the README to what a reader needs to act; link to longer notes.
7. **Untestable requirements.** "Fast", "intuitive", "user-friendly". Fix: replace each with a number or an observable behaviour, or delete it.

## Check your understanding

1. Your README says "Set your API key before running." Why is this more dangerous when a model reads it than when a person does?

<details>
<summary>Answer</summary>

A person who is unsure will usually look in the code or ask. A model will often pick the most typical name, such as `API_KEY`, and write code that uses it. The code looks correct and the mistake only shows up when the deploy sets a different name. Naming the variable removes the guess.

</details>

2. A spec says "Export should be fast." Give a testable replacement, and say how you would test it.

<details>
<summary>Answer</summary>

For example: "Exporting 10,000 rows returns a complete file in under 2 seconds on the test server." A test creates 10,000 rows, times the request and fails above 2 seconds. Any version is fine if a test can pass or fail on it.

</details>

3. Why does a spec need an "Out of scope" section when everything not listed is, in theory, out of scope anyway?

<details>
<summary>Answer</summary>

Because readers, and models especially, fill gaps with what usually comes next. A model asked for CSV export often adds Excel export too, because the two often appear together. Naming the most tempting extras blocks them and saves review time.

</details>

4. You do not yet know whether the service will run on port 8080 or 3000. What should the README say?

<details>
<summary>Answer</summary>

Give the current value and mark it, for example "Port: 8080 (not final)". Leaving the port out invites a guess; stating it confidently invites people to rely on it. A marked value tells the reader to check.

</details>

5. Your README's Configuration section is a paragraph of prose. What changes when you turn it into a table with Name, Default and Required columns?

<details>
<summary>Answer</summary>

Every setting must now have a value in every column, so a missing default or an unstated "required" becomes a visible empty cell. The reader can scan it, and a model can copy the exact names instead of extracting them from sentences.

</details>

## How this changes your prompts

When you ask a model to write documentation, the same rules apply to your prompt: give it the facts, not the hope that it knows them.

**Give the facts and forbid invention.**

```text
Before: Write a README for my weather service.
After:  Write README.md for weather-cache using only these facts: [list].
        If a fact is not in the list, leave it out rather than guess.
```

**Ask for configuration in a fixed shape.**

```text
Before: Explain how to configure it.
After:  Under Configuration, give a table with columns Variable, What it does, Default, Required.
        One row per setting in the list.
```

**Ask for testable requirements.**

```text
Before: Write a spec for CSV export. It should be fast and easy to use.
After:  Write a spec for CSV export. Every requirement must be something a test could check.
        Do not use the words fast, intuitive or user-friendly.
```

**Ask for open questions to be marked, not resolved.**

```text
Before: (nothing)
After:  Whether deleted expenses are included is not decided. Put it under Open questions
        and do not choose an answer.
```

**Point the model at the doc when you ask for code.**

```text
Before: Add the export feature.
After:  Implement docs/export-spec.md. Build only what Requirements lists. If something is
        under Open questions, stop and ask me.
```

## Try it: three bonus challenges

Each challenge gives you the facts. You write the prompt; the model writes the document; the grader checks it. The grader never checks a fact the challenge did not give you.

### Level 1: README for a command-line tool (`readme-for-a-cli`)

**Situation.** You have built a small tool called `site-check` that checks a folder of HTML files for broken links. Its facts: install with `pip install site-check`, run with `site-check ./public`, add `--external` to also check outside links, set `SITE_CHECK_TIMEOUT` (seconds, default `10`) to change the request timeout, test with `pytest`. It does not yet check images.

**Your task.** Write a prompt that gets the model to produce a complete `README.md` for `site-check`.

**Graded on:**

- It has these sections: Install, Use, Configuration, Test, Limits.
- The commands `pip install site-check`, `site-check ./public` and `pytest` appear exactly, inside code fences.
- The names `--external` and `SITE_CHECK_TIMEOUT` and the default `10` appear exactly.
- It says images are not checked yet.
- It is under 400 words.
- No placeholders (`TODO`, `<...>`, `example.com/your-repo`, "lorem ipsum").

### Level 2: README for a web service (`readme-for-a-web-service`)

**Situation.** `weather-cache` is a small HTTP service that caches weather lookups. It needs Node.js 20 or later. Install with `npm ci`, start with `npm start`, and check it with `curl http://localhost:8080/health`, which prints `ok`. Settings: `WEATHER_API_KEY` (required, no default; the service does not start without it), `CACHE_TTL_SECONDS` (default `600`, not required) and `PORT` (default `8080`, not required). Test with `npm test`. There is no rate limiting yet. This is the lesson's opening bug turned around: write the README that would have prevented it.

**Your task.** Get the model to write `README.md` with a configuration section nobody has to guess from.

**Graded on:**

- The sections Install, Configuration, Run, Test, Limits.
- Install names Node.js 20 and has `npm ci` in code.
- `npm start`, `curl http://localhost:8080/health` and `npm test` exactly, in code; `npm test` in the Test section.
- Configuration names `WEATHER_API_KEY`, `CACHE_TTL_SECONDS` and `PORT`, the defaults `600` and `8080`, and says which settings are required.
- Limits says there is no rate limiting yet.
- 80 to 450 words, no placeholders such as `your-api-key-here`.

### Level 3: A spec a model can build from (`spec-for-a-feature`)

**Situation.** `expense-tracker` needs CSV export. A signed-in user downloads all of their own expenses. The facts: endpoint `GET /api/expenses/export`, returning only that user's expenses; header `Content-Type: text/csv`; columns in the order `date,amount,category,note`, which is also the first row; dates as `YYYY-MM-DD`; more than 10,000 expenses returns status `413` and no file. Excel files and scheduled or emailed exports are out of scope. Whether deleted expenses are included is not decided. The test command is `npm test -- export`.

**Your task.** Get the model to write a spec that another model could implement without guessing, with the open point left open.

**Graded on:**

- The sections Goal, Requirements, Out of scope, Open questions, Done when, in that order.
- Requirements has `GET /api/expenses/export` and `date,amount,category,note` in code, plus `Content-Type: text/csv`, `YYYY-MM-DD`, 10,000 and 413.
- Out of scope names Excel.
- Open questions names deleted expenses and says the point is not decided.
- Done when has `npm test -- export` in code.
- None of these phrases: "should be fast", "user-friendly", "intuitive", "seamless", "as needed", "etc.", "and so on".
- 100 to 450 words, no placeholders.

## Prompting tips for these challenges

- Paste the facts as a list and tell the model to use only those facts. Invented flags fail the exact-text checks and mislead readers.
- Name the sections and their order.
- Ask for an example of the output, and say what it should look like, or tell the model to leave output out. Do not let it guess numbers that look real.
- Give the word budget.
- Ask the model to read its draft as someone who has never seen the tool, and to fix anything that reader would have to ask about.
- For the spec, tell the model in so many words not to answer the open question.

## Go deeper

### Official documentation

- [GitHub Docs: About the repository README file](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes). What a README is for on GitHub, where it can live and how it is shown.
- [Google developer documentation style guide](https://developers.google.com/style). The style guide Google uses for its developer docs. Read the pages "Code in text", "Procedures" and "Format placeholders".
- [Claude Platform: Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices). Read the advice on being clear and direct: it is the same advice as this lesson, applied to prompts.

### Specifications and standards

- [RFC 2119: Key words for requirement levels](https://www.rfc-editor.org/info/rfc2119/). Defines MUST, SHOULD and MAY. Read it before you write your next spec.
- [The Twelve-Factor App: Config](https://12factor.net/config). The case for keeping configuration in environment variables, which is why a README must name each one.
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A short convention for changelogs that people and tools can both read. A good model of a format with fixed sections.
- [The /llms.txt file](https://llmstxt.org/). A proposal (not a ratified standard) for a Markdown file that helps models use a website. Read it to see documentation written for a model reader.

### Engineering write-ups from the people who build these tools

- [Anthropic: Writing effective tools for AI agents](https://www.anthropic.com/research/writing-tools-for-agents). Shows that the descriptions a model reads are prompts, and how to test and improve them. The same thinking applies to READMEs.
- [GitHub Spec Kit](https://github.com/github/spec-kit). GitHub's open-source toolkit for spec-driven development with coding agents. Read the README to see a spec used as the main input to an agent.
- [Write the Docs: Docs as code](https://www.writethedocs.org/guide/docs-as-code/). Keeping documentation in the repository and reviewing it with the code, so it stays current.

### Books, courses and guides on the underlying ideas

- [Google: Technical Writing courses](https://developers.google.com/tech-writing). Free short courses for engineers. Start with Technical Writing One.
- [Diátaxis](https://diataxis.fr/). A framework that sorts documentation into tutorials, how-to guides, reference and explanation. Read it to decide what belongs in a README and what to link out.
- [Make a README](https://www.makeareadme.com/). A short guide to README sections with an editable template.
- [Command Line Interface Guidelines](https://clig.dev/). An open guide to designing command-line tools. Read the "Help", "Documentation" and "Environment variables" guidelines.

Links checked on 2026-11-15.

## Sources

Most of this lesson is general method. Product and standard facts it states:

- Diátaxis's four kinds of documentation: https://diataxis.fr/
- Configuration in environment variables (Twelve-Factor App): https://12factor.net/config
- MUST, SHOULD and MAY (RFC 2119): https://www.rfc-editor.org/info/rfc2119/
- AGENTS.md, on keeping agent notes separate from the human README: https://agents.md/
- The 4.5:1 contrast figure in worked example 2 (WCAG success criterion 1.4.3, Contrast (Minimum), for text other than large text): https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
