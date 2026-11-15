---
title: Self-research and verification
slug: self-research-and-verification
level: 2
minutes: 45
summary: Get a model to check its own claims, by finding sources before stating facts, proving things once with real output, naming what it did not verify, and cross-checking with a fresh second pass.
bonusChallenge: findings-report
grader: doc
---

# Self-research and verification

## What you will be able to do

- Ask a model for sources before statements, and spot a claim with no source.
- Break an answer into single claims and give each one a verdict.
- Demand real output as proof, run once, instead of "this should work".
- Get a clear list of what was not verified.
- Cross-check an answer with a second pass that has not seen the first.
- Handle sources that disagree, and say which one you followed and why.

## Why it matters

Models write wrong facts in the same confident tone as right ones. Ask "which file does Codex read for project instructions?" and a model may answer `CODEX.md`, a file that does not exist. You add it to the repository, Codex ignores it, and the agent works without your rules for weeks. One line in the prompt, "quote the official docs page for each fact, or say you could not confirm it", turns that guess into either a cited fact (`AGENTS.md`) or an honest "unconfirmed".

The cost is not only the wrong fact. A report that mixes checked and unchecked claims, with nothing to tell them apart, makes the reader re-check everything. A report that marks each claim lets the reader trust the checked ones and look only at the rest. Verification is how you make a model's work cheap to rely on.

## The ideas

### 1. Sources before statements

Ask the model to find the source first, then write the claim from it. Not the other way round: a model that writes first and searches second tends to find something that seems to agree.

Good sources, in order: the vendor's or project's own documentation, the specification, the source code. Blog posts and forum answers are leads, not proof. If sources disagree, say so and say which one you followed.

Each claim should point to its source, close enough that a reader can check it in a minute. A short quote of the exact line is better than a link alone: it shows the model read the page, and the reader can search for the words.

### 2. One claim at a time

A paragraph can hold five facts, and a paragraph can be "mostly right" while one of the five is wrong. Checking works best when the answer is split into single claims, each small enough to be simply true or false. Then each claim gets a verdict:

- **Supported:** a source says it, and you can quote the line.
- **Wrong:** a source says something different. Quote that line too.
- **Unconfirmed:** no source you have says either way. This is not the same as wrong.

Some sentences are not claims at all: "MCP is great" is an opinion. Say so, and move on. Researchers who measure factual accuracy in long answers use the same move: break the text into small "atomic" facts and check each one against a source.

### 3. Proven once, with real output

For anything that can be run (a command, a test, a function), the proof is the actual output, pasted. Not "I ran it and it passed". Decide what the proof is before the work starts, run it once after the last change, and keep the output. Do not re-run a proof that already passed just to feel sure; do run it again if the code changed.

### 4. Say what was not verified

Every answer has edges. A good report lists them: "Checked on Windows only." "The docs page was last updated a year ago." "Could not find an official source for the 32 KiB limit on older versions." This is not weakness. It tells the reader exactly where to look before relying on the work.

Inside the text, mark unconfirmed facts where they appear, not only in a list at the end.

### 5. Cross-check with a fresh pass

A model reviewing its own answer in the same conversation tends to agree with itself. Research on self-correction has found that models asked to review their own reasoning, with no new information, often do not improve and sometimes change right answers to wrong ones. A better check:

1. Start a new session, or a separate agent, that has not seen the first answer.
2. Give it the same question and the same sources, not the first answer.
3. Compare the two answers. Where they agree and both cite a source, confidence goes up. Where they differ, go to the source yourself.

You can also give the second pass the claims, one by one, and ask "is this supported by this source? Quote the line." Keep it blind to the reasoning of the first pass.

### 6. When sources disagree

Sources will conflict: a team wiki says one number, the official docs another, a changelog a third. Do not average them and do not quietly pick one. Write down:

- what each source says, with its date;
- who owns each source (the team that runs the system beats a page someone copied it to);
- whether a source describes what is true now or what is planned;
- which one you followed, and why;
- what would settle it (a test, or a question to the owner).

### 7. Ask for the right shape

Ask for a report with fixed sections. A fixed shape makes gaps visible: an empty "Not verified" section on a hard question is itself a warning.

### Worked example 1: a findings report

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

### Worked example 2: checking a short answer claim by claim

A student asks a model about MCP tools and gets this answer:

```text
MCP tools are easy to secure. Annotations such as readOnlyHint guarantee
that a tool cannot change data. Tool names can be up to 128 characters.
If the model sends a date in the wrong format, the server should return a
JSON-RPC protocol error. Most MCP clients already support the 2026-07-28
version of the spec.
```

**The weak check.** "Looks right to me; it mentions the spec version and real field names." Specific details make an answer sound checked. They are not evidence. This answer has two wrong claims in it.

**The strong check** splits it into claims and checks each against the MCP tools specification (version `2026-07-28`):

| # | Claim | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | "MCP tools are easy to secure." | Not a factual claim | An opinion; nothing to check |
| 2 | `readOnlyHint` guarantees a tool cannot change data | Wrong | The spec says clients must treat annotations as untrusted unless they come from trusted servers |
| 3 | Tool names can be up to 128 characters | Supported, with a nuance | The spec says names should be between 1 and 128 characters. It is a "should", not a hard limit |
| 4 | A wrong-format date should get a protocol error | Wrong | The spec lists input validation errors, such as a date in the wrong format, as tool execution errors, returned with `isError: true` |
| 5 | Most clients already support `2026-07-28` | Unconfirmed | The spec cannot say this. It would need each client's release notes |

Why the strong check works:

1. **It splits before it judges.** The answer reads as one smooth paragraph, but it holds four checkable facts and one opinion. Judged whole, it feels right; judged claim by claim, two are wrong.
2. **It goes to the primary source.** The tools spec is the document that defines these rules, so it settles claims 2 to 4 directly.
3. **Every verdict has evidence.** "Wrong" comes with what the source says instead, so the reader can check the check.
4. **It keeps "unconfirmed" separate from "wrong".** Claim 5 may well be true. The honest verdict is that the source in hand cannot tell, and it names what would.
5. **It records nuance.** Claim 3 is close but not exact; noting "should, not must" stops a small error spreading.

## Common mistakes

1. **Claims with no source.** Fix: every factual claim names its source, or is marked unconfirmed.
2. **Sources found after the answer.** The model hunts for support for what it already wrote. Fix: ask for the source first, then the claim.
3. **Judging a paragraph as a whole.** Fix: split it into single claims and give each a verdict.
4. **Treating "unconfirmed" as "wrong".** Fix: three verdicts, kept apart.
5. **"It works" without output.** Fix: paste the real output of the proof.
6. **Self-review in the same thread.** Fix: a fresh session or agent that has not seen the first answer.
7. **Hiding the edges.** A report with no "not verified" items is rarely true. Fix: ask for that section by name.
8. **Re-checking forever.** Running the same passing proof five times wastes time. Fix: prove once, then move on unless something changed.

## Check your understanding

1. Why should a model find the source before writing the claim, not after?

<details><summary>Answer</summary>

A model that writes first tends to search for support for what it already said, and it usually finds something that seems to agree. Source first means the claim is written from what the source actually says.

</details>

2. What is the difference between "wrong" and "unconfirmed"?

<details><summary>Answer</summary>

Wrong means a source says something different. Unconfirmed means no source you have says either way. An unconfirmed claim may be true; it just has not been shown.

</details>

3. Why is asking the same chat "are you sure?" a weak cross-check?

<details><summary>Answer</summary>

The model has its first answer and reasoning in front of it and tends to agree with itself. Research on self-correction found little gain, and sometimes harm, without new information. A fresh session with the same sources, but not the first answer, is a real second opinion.

</details>

4. A team wiki and the official docs give different numbers. What do you write down?

<details><summary>Answer</summary>

What each says and its date, who owns each source, whether either describes a plan rather than the current state, which one you followed and why, and what would settle it, such as a test or a question to the owner.

</details>

5. The proof for a fix passed. You then changed one more line. Do you run the proof again?

<details><summary>Answer</summary>

Yes. Proof is run once after the last change. The code changed after the proof, so the earlier output no longer proves the current code. If nothing had changed, you would not re-run it.

</details>

## How this changes your prompts

Before:

```text
Which file does each coding tool read for project instructions?
```

After:

```text
Which file does each coding tool read for project instructions?
Use only the official docs pages below. For each fact, quote the line it comes
from and give the link. If the pages do not say, write "unconfirmed".
End with a "Not verified" list.
```

Before:

```text
Check this answer for mistakes.
```

After:

```text
Split this answer into single factual claims, one per row. For each, give a
verdict (Supported, Wrong or Unconfirmed) and quote the line from the source
below that decides it. Mark opinions as "not a factual claim". Do not use any
source I did not give you.
```

Before:

```text
Did the fix work?
```

After:

```text
Run pytest tests/test_dates.py once after your last change and paste the full
output. If anything fails, say which test and stop. Do not say it passes
without the output.
```

The second versions work because they name the source, the shape of the answer, the verdicts allowed and the proof, which leaves no room for a confident guess.

## Try it: three bonus challenges

Work through them in order. Each asks you to write a prompt; the model's output is graded.

### Level 1: check a short answer claim by claim

**Situation.** A model was asked "What is the difference between sorted() and list.sort() in Python?" and answered with five claims: (1) `list.sort()` returns the sorted list; (2) `sorted()` works on any iterable, such as a tuple; (3) `list.sort()` changes the list in place; (4) both sorts are stable; (5) `sorted()` uses less memory than `list.sort()`. Your one source is the Python Sorting Techniques page, `https://docs.python.org/3/howto/sorting.html`, which says that `list.sort()` modifies the list in place and returns `None`, that `sorted()` builds a new sorted list and accepts any iterable, and that sorts are guaranteed to be stable. It says nothing about memory.

**Your task.** Get the model to write `CLAIM-CHECK.md`.

**Graded on:**

- Sections Answer checked, Claims, Sources and Summary.
- Claims gives each claim a verdict using the words Supported, Wrong and Unconfirmed, says that `list.sort()` returns None, and mentions memory.
- Sources gives the link exactly.
- Under 350 words; no placeholders.

### Level 2: a findings report with sources

**Situation.** Your team uses three coding tools and wants to know which project instructions file each one reads. You have these facts from the official docs (in lesson 1): Claude Code reads `CLAUDE.md`, and reads `AGENTS.md` instead when there is no `CLAUDE.md`; OpenAI Codex reads `AGENTS.md`, up to `32 KiB` combined by default; Gemini CLI reads `GEMINI.md`, and other names can be added with `context.fileName`. Nobody has checked whether the free tier of any tool behaves differently.

**Your task.** Get the model to produce `FINDINGS.md` answering the team's question from these facts.

**Graded on:**

- Sections Question, Answer, Claims, Sources, Not verified and Cross-check.
- The names `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `context.fileName` and `32 KiB` appear exactly.
- Sources lists these three links exactly: `https://code.claude.com/docs/en/memory`, `https://learn.chatgpt.com/docs/agent-configuration/agents-md` and `https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md`.
- Not verified mentions the free-tier question.
- Under 450 words; no placeholders.

### Level 3: sources that disagree

**Situation.** This one is made up for practice. Your team must set a client-side rate limit for an internal ledger API, and three sources disagree. The team wiki, `wiki/ledger-api.md`, last edited 2025-03-02, says 100 requests per minute. The API owners' docs, `docs/ledger-api/limits.md`, updated 2026-09-10, say 60 requests per minute per API key, and that the API answers HTTP 429 when the limit is passed. The ledger service's `CHANGELOG.md` has an entry under Unreleased that raises the limit to 120 requests per minute. Nobody has tested the live limit.

**Your task.** Get the model to write `SOURCE-CONFLICT.md` that reports the conflict and decides which limit to use now.

**Graded on:**

- Sections Question, Sources compared, Conflict, Decision, Not verified and How to confirm.
- Sources compared names all three files and both dates, 2025-03-02 and 2026-09-10.
- The figures 100 requests per minute and 120 requests per minute appear, and the word Unreleased.
- Decision says to use 60 requests per minute.
- Not verified says the live limit was not tested; How to confirm mentions the HTTP 429 response.
- Never says to use 100 or 120 requests per minute; under 450 words; no placeholders.

## Prompting tips for these challenges

- Give the facts and the links, and tell the model to use only those. Ask it to write "unconfirmed" for anything else.
- Name the sections in order.
- Give the verdict words you want, and ask for one claim per row.
- Ask it to tie each claim to a source, and to give each source's date and owner when sources conflict.
- Tell it what is not verified, and ask it to add anything else it is unsure of.
- For a cross-check, ask it to describe how a fresh session would check the claims, not to pretend one was run. A made-up cross-check is the exact failure this lesson is about.

## Go deeper

### Official documentation

- [Claude: citations](https://platform.claude.com/docs/en/build-with-claude/citations). How to have Claude point to the exact passages in your documents that support each part of its answer. Read it to build source-backed answers into an app.
- [Claude: reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations). Anthropic's prompt techniques, such as allowing "I don't know" and asking for quotes first. Read it for prompt lines you can reuse.
- [Claude Code: best practices](https://code.claude.com/docs/en/best-practices). Includes giving the agent a way to verify its own work with tests and real output. Read the section on verification.

### Specifications and standards

- [W3C PROV overview](https://www.w3.org/TR/prov-overview/). The W3C family of documents on recording where information came from. Read the overview for a precise vocabulary of provenance.
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework). The US standards body's framework for managing AI risks, including validity and reliability. Read the overview for how organisations frame verification.

### Engineering write-ups from the people who build these tools

- [Anthropic: how we built our multi-agent research system](https://www.anthropic.com/research/multi-agent-research-system). How a research agent splits work across subagents and adds citations at the end. Read it for verification inside a real system.
- [OpenAI: why language models hallucinate](https://openai.com/index/why-language-models-hallucinate/). Argues that training and scoring reward guessing over saying "I don't know". Read it for why "unconfirmed" must be an allowed answer.

### Books, courses and papers on the underlying ideas

- [Dhuliawala et al., "Chain-of-Verification"](https://arxiv.org/abs/2309.11495). A model drafts, plans check questions, answers them separately, then revises. Read it for the method behind claim-by-claim checks.
- [Min et al., "FActScore"](https://arxiv.org/abs/2305.14251). Scores long answers by splitting them into atomic facts and checking each against a source. Read it for the "one claim at a time" idea.
- [Manakul et al., "SelfCheckGPT"](https://arxiv.org/abs/2303.08896). Detects made-up facts by comparing several samples of the same answer. Read it for why agreement between independent answers matters.
- [Huang et al., "Large Language Models Cannot Self-Correct Reasoning Yet"](https://arxiv.org/abs/2310.01798). Evidence that self-review without new information rarely helps. Read it before relying on "are you sure?".
- [Gao et al., "Enabling Large Language Models to Generate Text with Citations"](https://arxiv.org/abs/2305.14627). A benchmark for answers whose citations actually support them. Read it for how citation quality is measured.
- [Mike Caulfield, "SIFT (The Four Moves)"](https://hapgood.us/2019/06/19/sift-the-four-moves/). A short method for checking claims online: stop, investigate the source, find better coverage, trace claims to the original. Read it; it takes five minutes.
- [Civic Online Reasoning](https://cor.inquirygroup.org/). Free lessons on judging online sources, including lateral reading. Use it for practice checking sources the way fact-checkers do.

Links checked on 2026-11-15.

## Sources

General method. The product facts in the level 2 challenge are checked in lesson 1. Other facts:

- Python docs, built-in functions, `sorted()` (worked example 1): https://docs.python.org/3/library/functions.html#sorted
- Python docs, Sorting Techniques (`list.sort()` returns `None`, `sorted()` accepts any iterable, sorts are stable; level 1 challenge): https://docs.python.org/3/howto/sorting.html
- MCP specification, tools (annotations untrusted, name length, input validation errors as execution errors; worked example 2): https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- Huang et al., self-correction (idea 5): https://arxiv.org/abs/2310.01798
- Min et al., FActScore, atomic facts (idea 2): https://arxiv.org/abs/2305.14251
