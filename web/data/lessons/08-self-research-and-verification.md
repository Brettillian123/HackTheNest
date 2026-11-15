---
title: Self-research and verification
slug: self-research-and-verification
level: 2
minutes: 25
summary: Get a model to check its own claims, by finding sources before stating facts, proving things once with real output, naming what it did not verify, and cross-checking with a fresh second pass.
bonusChallenge: findings-report
grader: doc
---

# Self-research and verification

## What you will be able to do

- Ask a model for sources before statements, and spot a claim with no source.
- Demand real output as proof, run once, instead of "this should work".
- Get a clear list of what was not verified.
- Cross-check an answer with a second pass that has not seen the first.

## Why it matters

Models write wrong facts in the same confident tone as right ones. Ask "which file does Codex read for project instructions?" and a model may answer `CODEX.md`, a file that does not exist. You add it to the repository, Codex ignores it, and the agent works without your rules for weeks. One line in the prompt, "quote the official docs page for each fact, or say you could not confirm it", turns that guess into either a cited fact (`AGENTS.md`) or an honest "unconfirmed".

## The ideas

### 1. Sources before statements

Ask the model to find the source first, then write the claim from it. Not the other way round: a model that writes first and searches second tends to find something that seems to agree.

Good sources, in order: the vendor's or project's own documentation, the specification, the source code. Blog posts and forum answers are leads, not proof. If sources disagree, say so and say which one you followed.

Each claim should point to its source, close enough that a reader can check it in a minute.

### 2. Proven once, with real output

For anything that can be run (a command, a test, a function), the proof is the actual output, pasted. Not "I ran it and it passed". Decide what the proof is before the work starts, run it once after the last change, and keep the output. Do not re-run a proof that already passed just to feel sure; do run it again if the code changed.

### 3. Say what was not verified

Every answer has edges. A good report lists them: "Checked on Windows only." "The docs page was last updated a year ago." "Could not find an official source for the 32 KiB limit on older versions." This is not weakness. It tells the reader exactly where to look before relying on the work.

Inside the text, mark unconfirmed facts where they appear, not only in a list at the end.

### 4. Cross-check with a fresh pass

A model reviewing its own answer in the same conversation tends to agree with itself. A better check:

1. Start a new session, or a separate agent, that has not seen the first answer.
2. Give it the same question and the same sources, not the first answer.
3. Compare the two answers. Where they agree and both cite a source, confidence goes up. Where they differ, go to the source yourself.

You can also give the second pass the claims, one by one, and ask "is this supported by this source? Quote the line." Keep it blind to the reasoning of the first pass.

### 5. Ask for the right shape

Ask for a report with fixed sections. A fixed shape makes gaps visible: an empty "Not verified" section on a hard question is itself a warning.

### Worked example

A complete `FINDINGS.md` for a small question:

````markdown
# Findings: does Python's sorted() keep equal items in order?

## Question

When two items have the same sort key, does `sorted()` keep them in their original order?

## Answer

Yes. `sorted()` is stable.

## Claims

1. `sorted()` is guaranteed to be stable. Source: Python docs, built-in functions, `sorted()` entry, which says it "is guaranteed to be stable".
2. On this machine, items with equal keys kept their original order. Proof: the run below.

## Proof

```python
>>> pairs = [("b", 1), ("a", 1), ("c", 0)]
>>> sorted(pairs, key=lambda p: p[1])
[('c', 0), ('b', 1), ('a', 1)]
```

`("b", 1)` stays before `("a", 1)`, as in the input.

## Sources

- https://docs.python.org/3/library/functions.html#sorted

## Not verified

- Run on Python 3.14.3 only; other versions rely on the docs' guarantee, not a test.
- Did not check `list.sort()` in this report.

## Cross-check

Not run yet. Method: give a fresh session the question and the docs link, without this report, and compare its answer and quoted line with claim 1.
````

The proof output above is real: it was run on Python 3.14.3 when this lesson was written. The cross-check is honestly marked as not run, which is better than a made-up one.

## Common mistakes

1. **Claims with no source.** Fix: every factual claim names its source, or is marked unconfirmed.
2. **Sources found after the answer.** The model hunts for support for what it already wrote. Fix: ask for the source first, then the claim.
3. **"It works" without output.** Fix: paste the real output of the proof.
4. **Self-review in the same thread.** Fix: a fresh session or agent that has not seen the first answer.
5. **Hiding the edges.** A report with no "not verified" items is rarely true. Fix: ask for that section by name.
6. **Re-checking forever.** Running the same passing proof five times wastes time. Fix: prove once, then move on unless something changed.

## Try it: bonus challenge

**Situation.** Your team uses three coding tools and wants to know which project instructions file each one reads. You have these facts from the official docs (in lesson 1): Claude Code reads `CLAUDE.md`, and reads `AGENTS.md` instead when there is no `CLAUDE.md`; OpenAI Codex reads `AGENTS.md`, up to `32 KiB` combined by default; Gemini CLI reads `GEMINI.md`, and other names can be added with `context.fileName`. Nobody has checked whether the free tier of any tool behaves differently.

**Your task.** Write a prompt that gets the model to produce `FINDINGS.md` answering the team's question from these facts.

**Graded on:**

- It has these sections: Question, Answer, Claims, Sources, Not verified, Cross-check.
- The names `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `context.fileName` and `32 KiB` appear exactly.
- Sources lists these three links exactly: `https://code.claude.com/docs/en/memory`, `https://learn.chatgpt.com/docs/agent-configuration/agents-md` and `https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md`.
- Not verified mentions the free-tier question.
- Under 450 words; no placeholders.

## Prompting tips for this challenge

- Give the facts and the links, and tell the model to use only those. Ask it to write "unconfirmed" for anything else.
- Name the six sections in order.
- Ask it to tie each claim to a source link.
- Tell it what is not verified, and ask it to add anything else it is unsure of.
- For the Cross-check section, ask it to describe how a fresh session would check the claims, not to pretend one was run. A made-up cross-check is the exact failure this lesson is about.

## Sources

General method; the product facts in the bonus challenge are checked in lesson 1. The worked example's fact:

- Python docs, built-in functions, `sorted()`: https://docs.python.org/3/library/functions.html#sorted
