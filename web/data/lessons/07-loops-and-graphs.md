---
title: Loops and graphs
slug: loops-and-graphs
level: 3
minutes: 60
summary: Run a model in a loop against a test with a fixed exit and a cap, and plan a job as a graph so you know what can run at once and what sets the finish time.
bonusChallenge: fix-loop-plan
grader: workflow
---

# Loops and graphs

## What you will be able to do

- Name the four parts of a feedback loop and set each one before the loop starts.
- Keep a held-out check so the loop does not just learn to pass its own test, and read the result when it disagrees.
- Decide when a loop has stopped paying for itself.
- Draw a job as a directed graph, find a valid order, and spot a cycle that has no exit.
- Compute the critical path step by step, and know which steps are worth speeding up.

## Why it matters

"Keep fixing until it is good" has no end: the model loops for hours or stops when it feels done. Worse, a model that sees the test can pass it without doing the job, by hard-coding the expected output. A written exit test, a cap on rounds and a final check on tests it never saw stop both failures.

Graphs matter for a different reason. A plan that is just a list runs one step at a time. A plan drawn as a graph shows which steps can run at once, which ones decide the finish time, and where a hidden cycle will make two workers wait on each other forever.

## Part A: loops

### The improve-and-test loop

An improve-and-test loop (Anthropic's guide calls it evaluator-optimizer) is:

1. Make an attempt.
2. Check it against a test.
3. If the test passes, stop. If not, use the test's feedback to improve, and go back to step 2.

The guide says this pattern fits when there are clear evaluation criteria and each round of refinement gives a measurable gain. If you cannot say how you would score an attempt, a loop will not help; write the test first.

### The four parts of a feedback loop

Control engineers have studied feedback for a long time: measure what a system does, compare it with what you want, and act on the difference. A thermostat is the usual example. A model loop has the same parts, and each one must be fixed before round one.

1. **The thing being changed.** One file, or a small set: `src/price.py`, `prompts/summarize.txt`. Everything else, including the tests, stays fixed. If the loop can change the test, it can "pass" by weakening it.
2. **The measure.** What you run to see how good the attempt is: "number of the 20 visible tests that pass", "score out of 40 on the dev set". It must give the same answer for the same attempt, every time.
3. **The exit test.** The condition that ends the loop with success: "all 20 visible tests pass", "dev score at least 36 of 40". It is a statement about the measure, so a script can check it.
4. **The cap.** The most rounds you will pay for, say 3 or 5. At the cap, stop, keep the best attempt, and report what still fails. Anthropic's guide recommends stopping conditions "such as a maximum number of iterations".

An exit test without a cap may never end. A cap without an exit test wastes rounds after the job is done. You need both.

Add a fifth rule for the middle ground: **stop on no progress.** If the measure has not improved for two rounds, more of the same will not help. Change the approach, or ask a person.

Never loosen, skip or delete a test to get out of the loop. That is passing the test without doing the job.

### Overfitting to the measure

A measure is only a stand-in for what you really want. You want a price parser that works on real input; you measure "passes these 20 tests". Push hard enough on the stand-in and the two drift apart. This is often summed up as Goodhart's law: when a measure becomes a target, it stops being a good measure. Manheim and Garrabrant's paper sorts the different ways this happens.

With models it happens in plain ways. A model that sees `assert parse_price("$1,299.00") == 1299.0` can add a special case for that exact string. Every visible test passes, and the function still fails on "1.299,00 EUR". DeepMind calls the general behaviour specification gaming: meeting the literal task without the intended outcome. It is not the model being sneaky; it is the loop rewarding exactly what you measured.

The same thing happens to people. scikit-learn's guide warns that if you keep adjusting settings until the test score is best, knowledge of the test "leaks" into the model, and the score no longer tells you how it will do on new data. Google's machine learning course says test sets "wear out" with repeated use.

### Why a held-out check exists

The fix is to keep two sets of checks:

- **Visible checks.** The loop sees these every round, and uses their failures to improve.
- **Held-out checks.** Never shown to any step that changes the work. They run once, at the end, after the loop has stopped.

If the attempt passes the visible checks and also passes the held-out checks, it probably learned the job. If it passes the visible checks and fails many held-out ones, it learned the visible checks. The held-out result is the honest one.

Two rules keep the held-out set honest. First, no step inside the loop, and no step before it, may read it. Second, run it once. If you look at held-out failures and then go back and fix them, the held-out set has become a visible set, and you need a fresh one. (Dwork and colleagues study how to reuse a holdout safely; the simple rule of "once" avoids the problem.)

### Convergence: when to stop

In most loops the gain per round shrinks. Early rounds fix the easy failures; later rounds work on harder ones and fix fewer. The loop is **converging**: getting closer to its best, by smaller steps each time. At some point a round costs more than it gains. That is when to stop, even if the exit test has not passed.

Real loops do not follow a formula, so watch the numbers instead of predicting them.

### Worked numeric example: a fix loop

A model is fixing `parse_price`. There are 20 visible tests and 8 held-out tests. The rules, set before round one:

- Exit test: all 20 visible tests pass.
- No-progress rule: stop if the visible count has not risen for two rounds.
- Cap: 6 rounds. Each round (grade, then fix) takes about 12 minutes.

What happened:

| Round | Visible passing | Gain | Failing |
|---|---|---|---|
| 0 (first attempt) | 11 / 20 | - | 9 |
| 1 | 15 / 20 | +4 | 5 |
| 2 | 17 / 20 | +2 | 3 |
| 3 | 18 / 20 | +1 | 2 |
| 4 | 18 / 20 | 0 | 2 |
| 5 | 18 / 20 | 0 | 2 |

Reading it:

- The gains shrink: 4, 2, 1, 0, 0. The loop converged at 18.
- After round 5 the visible count has not risen for two rounds, so the no-progress rule stops the loop, one round before the cap. The exit test never passed.
- Rounds 4 and 5 cost about 24 minutes and gained nothing. A tighter rule ("stop after one round with no gain") would have saved 12 of them. Choosing between the two is a trade-off: the tighter rule sometimes stops just before a late fix.
- Now the held-out check runs once: 5 of 8 pass, or 62.5%. The visible score is 18 of 20, or 90%. A gap of 27.5 percentage points says the fixes were aimed at the visible tests more than at the job. The right report is "90% visible, 62.5% held-out, two visible failures left", not "nearly done".

## Part B: graphs

### Steps as a directed graph

A job is a set of steps. Some steps need another step's output first. Draw each step as a node and each "needs" as an arrow from the step that comes first to the step that waits. That is a **directed graph**. In a plan, `dependsOn` lists the arrows coming in.

- **Fan-out:** one step feeds several. After `spec`, the tests, the build and the docs can all start.
- **Fan-in:** one step waits for several. A review waits for every piece it checks.

Fan-out is where parallel work comes from. Fan-in is where it is collected, and where a slow branch holds everyone up.

### Directed acyclic graphs and topological order

A graph with no cycle is a **directed acyclic graph**, or DAG. A **topological order** lists the steps so that every arrow points forward: each step comes after everything it needs. A directed graph has a topological order if and only if it is a DAG.

A simple way to find one: repeatedly pick a step whose needs are all done, write it down, and mark it done. If at some point steps are left but none can be picked, those steps contain a cycle. There is often more than one valid order; any of them is a correct sequence for a single worker.

What can run at the same time: two steps where neither needs the other, directly or through a chain, and that change different files.

### Cycles, and why a cycle needs an exit

A **cycle** is a chain of arrows that comes back to where it started: A needs B, B needs A. In a plan, that means neither can start. Two workers wait on each other forever.

A loop is a cycle on purpose. `grade` needs the latest `fix`, and `fix` needs the latest `grade`. It works only because it is unrolled in time: round one of `grade` runs on the first build, and every later round follows a fix. What makes that safe is the exit test and the cap. A cycle without them is either a deadlock (nobody starts) or a runaway (nobody stops). So every cycle in a plan must be declared as a loop, with an exit test and a cap, and any other cycle is a bug.

### The critical path

Give each step an estimate. The **critical path** is the longest chain of dependent steps from start to finish, counting the estimates. With enough workers, no plan can finish sooner than the length of this path, because each step on it must wait for the one before.

To compute it, do two passes over the steps in topological order:

- **Forward pass.** Each step's earliest start (ES) is the latest earliest finish among the steps it needs (0 if it needs none). Its earliest finish (EF) is ES plus its estimate. The largest EF is the shortest possible finish time.
- **Backward pass.** Go in reverse. Each step's latest finish (LF) is the smallest latest start among the steps that need it (the finish time, if none do). Its latest start (LS) is LF minus its estimate.
- **Slack** is LS minus ES: how long a step can slip without delaying the job. Steps with zero slack are on the critical path.

This is the critical path method from project scheduling. Sedgewick and Wayne's algorithms course treats it as finding a longest path in an edge-weighted DAG.

### Worked example: a release

| Step | What | Minutes | Needs |
|---|---|---|---|
| A | Write the spec | 5 | - |
| B | Write the tests | 15 | A |
| C | Build the feature | 20 | A |
| D | Write the docs | 10 | A |
| E | Integrate and run tests | 10 | B, C |
| F | Review | 8 | D, E |
| G | Publish | 2 | F |

A fans out to B, C and D. E fans in from B and C; F fans in from D and E.

**Forward pass,** in the order A, B, C, D, E, F, G:

1. A: needs nothing. ES 0, EF 0 + 5 = 5.
2. B: needs A (EF 5). ES 5, EF 5 + 15 = 20.
3. C: needs A. ES 5, EF 5 + 20 = 25.
4. D: needs A. ES 5, EF 5 + 10 = 15.
5. E: needs B (EF 20) and C (EF 25). ES is the later one, 25. EF 25 + 10 = 35.
6. F: needs D (EF 15) and E (EF 35). ES 35, EF 35 + 8 = 43.
7. G: needs F. ES 43, EF 43 + 2 = 45.

The shortest possible finish is 45 minutes.

**Backward pass,** in reverse:

1. G: nothing needs it. LF 45, LS 45 - 2 = 43.
2. F: G needs it (LS 43). LF 43, LS 35.
3. E: F needs it (LS 35). LF 35, LS 25.
4. D: F needs it (LS 35). LF 35, LS 25.
5. C: E needs it (LS 25). LF 25, LS 5.
6. B: E needs it (LS 25). LF 25, LS 10.
7. A: B (LS 10), C (LS 5) and D (LS 25) need it. LF is the smallest, 5. LS 0.

**Slack** (LS minus ES):

| Step | ES | LS | Slack |
|---|---|---|---|
| A | 0 | 0 | 0 |
| B | 5 | 10 | 5 |
| C | 5 | 5 | 0 |
| D | 5 | 25 | 20 |
| E | 25 | 25 | 0 |
| F | 35 | 35 | 0 |
| G | 43 | 43 | 0 |

The critical path is A, C, E, F, G: 5 + 20 + 10 + 8 + 2 = 45 minutes.

What this tells you:

- The steps add up to 70 minutes of work, but with three workers after the spec the job can finish in 45.
- Making the docs (D) faster saves nothing: it has 20 minutes of slack. The same goes for the tests (B), up to 5 minutes.
- Making the build (C) 10 minutes faster does not save 10 minutes. C would finish at 15, but E still waits for B, which finishes at 20. The new critical path is A, B, E, F, G at 40 minutes. You saved 5, and B became critical. After any change, compute the path again.

### Reading the worked plan

Here is a plan to build a small page to a spec, with a fix loop and a held-out check:

```json
{
  "goal": "Pricing page that passes the visible checks and the held-out checks",
  "steps": [
    { "id": "spec", "title": "Write the page spec", "owner": "coordinator", "dependsOn": [], "changes": ["SPEC.md"],
      "proof": "SPEC.md lists every section, colour and size", "budget": { "minutes": 5 } },
    { "id": "visible-tests", "title": "Write the visible tests", "owner": "worker-tests", "dependsOn": ["spec"], "changes": ["tests/visible/"],
      "proof": "Test run lists 12 visible checks, all failing on an empty page", "budget": { "minutes": 15 } },
    { "id": "held-out-tests", "title": "Write the held-out tests", "owner": "coordinator", "dependsOn": ["spec"], "changes": ["tests/held-out/"],
      "proof": "Test run lists 6 held-out checks; builder never given this folder", "budget": { "minutes": 10 } },
    { "id": "build", "title": "Build the pricing page", "owner": "worker-build", "dependsOn": ["spec"], "changes": ["site/pricing.html"],
      "proof": "Page opens and a screenshot at 1280x800 shows all sections", "budget": { "minutes": 20 } },
    { "id": "grade", "title": "Run the visible tests", "owner": "worker-build", "dependsOn": ["build", "visible-tests", "fix"], "changes": [],
      "reads": ["tests/visible/"], "proof": "Visible test output saved with the round number", "budget": { "minutes": 2 } },
    { "id": "fix", "title": "Fix the reported failures", "owner": "worker-build", "dependsOn": ["grade"], "changes": ["site/pricing.html"],
      "proof": "Fewer visible tests fail than in the previous round", "budget": { "minutes": 10 } },
    { "id": "final-check", "title": "Run the held-out tests once", "owner": "coordinator", "dependsOn": ["grade", "held-out-tests"], "changes": [],
      "reads": ["tests/held-out/"], "proof": "Held-out test output, run once, with pass count", "budget": { "minutes": 5 } },
    { "id": "readme", "title": "Write the README", "owner": "worker-docs", "dependsOn": ["spec"], "changes": ["README.md"],
      "proof": "README names the page file and the test command", "budget": { "minutes": 10 } }
  ],
  "loops": [
    { "id": "fix-loop", "steps": ["grade", "fix"],
      "until": "All 12 visible tests pass, or no improvement for two rounds",
      "maxRounds": 3,
      "heldOut": "The 6 checks in tests/held-out/, run once by final-check after the loop" }
  ]
}
```

Reading it:

- `grade` and `fix` need each other. That cycle is allowed because `fix-loop` marks it with an exit test and a cap. (Round one of `grade` follows `build`; the edge from `fix` applies on later rounds.)
- After `spec`, `visible-tests`, `held-out-tests`, `build` and `readme` can run at once: they change four different places. That is fan-out.
- `build` and `fix` share `site/pricing.html`, but `fix` always follows `build`.
- Critical path, worst case: `spec` (5), `build` (20), three rounds of `grade` plus `fix` (3 x 12 = 36), `final-check` (5): 66 minutes. `visible-tests` (15) finishes before `build` (20), so it is off the path, and so is `readme`.

Steps use the same fields as in lesson 6. A loop has an `id`, the `steps` that repeat, `until` (the exit test), `maxRounds` (the cap) and, when it tunes against tests, `heldOut` (what it is checked on at the end that it never saw).

## Common mistakes

1. **No exit test.** "Until it is good." Fix: a pass condition you could check with a script.
2. **No cap.** Fix: a maximum number of rounds, and a report at the cap.
3. **The loop sees every test.** Fix: hold some back and run them once at the end.
4. **Changing the test to pass.** Fix: the test is fixed for the whole loop; only the work changes.
5. **Running the held-out set twice.** Looking at its failures and fixing them turns it into a visible set. Fix: run it once; for another round, write a fresh held-out set.
6. **Unmarked cycles.** Two steps that wait on each other with no exit. Fix: break the cycle, or mark it as a loop with an exit and a cap.
7. **Speeding up the wrong step.** Fix: find the critical path first, then work on a step that is on it, and recompute after the change.

## Check your understanding

1. A loop has a cap of 5 rounds but no exit test. What goes wrong?

<details><summary>Answer</summary>

It always runs all 5 rounds, even if the work was right after round 1, and at the end nothing says whether it succeeded. An exit test stops it early on success and gives the result a meaning.

</details>

2. After a tuning loop, the visible score is 38 of 40 (95%) and the held-out score is 12 of 20 (60%). What do you report, and what does the gap suggest?

<details><summary>Answer</summary>

Report both numbers. A 35-point gap suggests the changes fitted the visible cases, not the task. The held-out score is the better guess at how it will do on new input. Do not now tune against the held-out failures; that would use up the held-out set.

</details>

3. Steps: P (4 min, needs nothing), Q (6, needs P), R (3, needs P), S (5, needs Q and R). What is the critical path and the shortest finish?

<details><summary>Answer</summary>

Forward pass: P finishes at 4, Q at 10, R at 7, S starts at 10 and finishes at 15. Critical path P, Q, S, 15 minutes. R has 3 minutes of slack.

</details>

4. In question 3, you can make R twice as fast. How much sooner does the job finish?

<details><summary>Answer</summary>

Not at all. R is off the critical path; S still waits for Q.

</details>

5. Find the fault in this plan fragment:

```json
"steps": [
  { "id": "fix", "dependsOn": ["grade"], "changes": ["src/price.py"], "reads": ["tests/visible/", "tests/held_out/"] }
],
"loops": [ { "id": "fix-loop", "steps": ["grade", "fix"], "until": "All 20 visible tests pass", "maxRounds": 4, "heldOut": "tests/held_out/ run once at the end" } ]
```

<details><summary>Answer</summary>

The `fix` step is inside the loop and reads `tests/held_out/`. The held-out tests are no longer held out: the step that changes the code can see them. Remove `tests/held_out/` from its `reads`; only the final check after the loop may read it.

</details>

6. Find the fault in this plan fragment:

```json
"steps": [
  { "id": "draft", "dependsOn": ["edit"], "changes": ["report.md"] },
  { "id": "edit", "dependsOn": ["draft"], "changes": ["report.md"] }
],
"loops": []
```

<details><summary>Answer</summary>

`draft` and `edit` need each other: a cycle, and no loop declares it. Neither step can start, or, if someone forces it, nothing stops it. Either make `draft` depend on nothing, or declare a loop over both steps with an `until` exit test and a `maxRounds` cap.

</details>

## How this changes your prompts

**Before:**

```text
Keep improving the function until it's good.
```

**After:**

```text
Change only src/price.py. After each change, run pytest tests/visible
and report how many of the 20 tests pass. Stop when all 20 pass, or when
the count has not risen for two rounds, or after 4 rounds, whichever comes
first. Never edit the tests. At the end, report the best count and the
tests that still fail.
```

**Before:**

```text
Here are all 28 tests. Make them pass.
```

**After:**

```text
Here are 20 visible tests. Make them pass. There are 8 more tests you
will not see; I will run them once at the end. Write the function for the
kind of input the tests describe, not for the exact strings in them.
```

**Before:**

```text
Plan the release steps.
```

**After:**

```text
Plan the release as a graph: for each step give an estimate in minutes and
the steps it depends on. Mark which steps can run at the same time. Then
compute the critical path with a forward and backward pass and list each
step's slack. Do not add any cycle except a declared loop with an exit
test and a cap.
```

## Try it: bonus challenges

Three challenges, easiest first. For each, write a prompt that gets the model to produce the plan as JSON, in the shape of the worked example. The grader checks the plan, not your prompt.

### Level 1: a release pipeline with one approval gate (`release-pipeline-plan`)

**Situation.** You are releasing version 2.4.0 of a package. After the version bump, the tests, the docs and the build can all run at the same time. A maintainer approves the release only after all three are done, and only then is it published.

**What the model must plan.** A version step that changes `package.json` and `CHANGELOG.md`; a tests step that writes `reports/tests.txt`; a docs step that changes `docs/`; a build step that changes `dist/`; an approval step titled "approve" or "sign off" that writes `reports/approval.md`; a publish step titled "publish" that writes `reports/publish.txt`. No loop.

**Graded on:**

- All six stages are present, found by their files and titles.
- Version comes first; tests, docs and build all come before the approval; the approval comes before publish.
- Tests, docs and build do not depend on each other (fan-out, then fan-in at the approval) and share no file.
- Every step has a title, an owner, `changes`, `dependsOn`, a checkable proof and a budget.
- At most 7 steps and 5 owners, and the goal says when the job is done.

### Level 2: a prompt-tuning loop with a held-out set (`benchmark-tuning-loop`)

**Situation.** You are tuning `prompts/summarize.txt` against a benchmark. There are 40 dev cases in `benchmarks/dev/`, scored with `npm run bench -- benchmarks/dev`, and 20 held-out cases in `benchmarks/held_out/`. At most 5 rounds. Before trusting the score, you check the measure itself against 5 hand-marked cases.

**What the model must plan.** A baseline step (titled "baseline") that scores the unchanged prompt; a measure check (titled "validate", "calibrate" or "check") that writes `reports/metric-check.md` and runs at the same time as the baseline; a loop over a score step (titled "score", "evaluate" or "measure") and a tune step (titled "tune", "revise", "improve", "edit" or "fix") that changes only `prompts/summarize.txt`; a held-out check after the loop (titled "held-out", "holdout", "hidden" or "final"); a report step that writes `reports/benchmark.md`.

**Graded on:**

- All six stages are present, found by their files and titles.
- The loop is declared over the score and tune steps, with a checkable `until`, `maxRounds` of 5 or less and a `heldOut` note.
- No step in the loop, or before it, reads or changes `benchmarks/held_out/`.
- The baseline and the measure check can run at the same time and share no file.
- No cycle except inside the marked loop; every step has a title, an owner, `changes`, `dependsOn`, a checkable proof and a budget.
- At most 7 steps and 4 owners, and the goal says when the job is done.

### Level 3: a capped fix loop for a function (`fix-loop-plan`)

**Situation.** You want a model to write a function `parse_price(text)` in `src/price.py` that turns strings like "$1,299.00" into numbers. There are 20 visible tests in `tests/visible/` and 8 held-out tests in `tests/held_out/` that the builder must never see. The brief allows at most 4 fix rounds.

**What the model must plan.** A tests step, a build step, a grade-and-fix loop and a final held-out check.

**Graded on:**

- Required stages: write or load tests, build, a grade-and-fix loop, a final held-out check.
- Every step has a title, an owner, a `changes` list, a `dependsOn` list, a proof and a budget.
- The loop is declared in `loops`, with its `steps`, an `until` exit test, `maxRounds` of 4 or less and a `heldOut` note.
- There is no cycle except inside the marked loop.
- No two steps that can run at the same time list the same file.
- The held-out check comes after the loop, and no step in the loop, or before it, reads or changes `tests/held_out/`.

## Prompting tips for these challenges

- Give the file paths, the round limit and the step limits as facts.
- Say what ends the loop in testable words, and ask for a no-progress rule too.
- Say plainly: "no step in the loop, or before it, reads the held-out folder".
- Give the order as "X before Y" facts and name the steps that run at the same time.
- Paste the worked example's shape and ask for JSON only, with the same field names.
- Ask the model to check its own plan for unmarked cycles and shared files before it answers.

## Go deeper

**Official documentation on agents and loops**

- [Anthropic: Building effective AI agents](https://www.anthropic.com/research/building-effective-agents). Defines the evaluator-optimizer loop and parallel workflows. Read it for when a loop is worth it and the advice on stopping conditions.
- [Google ADK: Loop workflow](https://adk.dev/agents/workflow-agents/loop-agents/). A loop agent in Google's agent kit. Read it to see a cap (`max_iterations`) and an early exit (a sub-agent that escalates) built into a framework, and that with no cap set it stops only on escalation.
- [LangGraph: Graph API overview](https://docs.langchain.com/oss/python/langgraph/graph-api). Agents as nodes and edges. Read it for fan-out (parallel nodes share a "super-step") and the recursion limit, a hard cap that raises an error when a graph runs too long.
- [Claude: Define success criteria and build evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests). Anthropic's guide to turning "good" into tests. Read it before writing the measure a loop will use.

**Engineering write-ups**

- [Anthropic: Writing effective tools for AI agents](https://www.anthropic.com/research/writing-tools-for-agents). How Anthropic improves tools with evaluation loops. Read it for its use of held-out test sets to avoid overfitting.
- [Google DeepMind: Specification gaming](https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/). Examples of systems meeting the letter of a task and missing its point. Read it to recognise the failure a held-out check catches.
- [Lilian Weng: Reward hacking in reinforcement learning](https://lilianweng.github.io/posts/2024-11-28-reward-hacking/). A long survey of models exploiting their measure. Read it for the research behind "the loop learns the test".

**Foundations**

- [Sedgewick and Wayne, Algorithms 4.2: Directed graphs](https://algs4.cs.princeton.edu/42digraph/). Princeton course notes. Read it for cycle detection, DAGs and topological sort, with code.
- [Sedgewick and Wayne, Algorithms 4.4: Shortest paths](https://algs4.cs.princeton.edu/44sp/). Read the "critical path method" part: parallel job scheduling solved as a longest path in a DAG.
- [Åström and Murray: Feedback Systems](https://fbswiki.org/wiki/index.php/Main_Page). A free control-engineering textbook. Read the early chapters for what feedback is, and why measure, compare and correct works.
- [scikit-learn: Cross-validation](https://scikit-learn.org/stable/modules/cross_validation.html). Read the opening section for overfitting, test sets and how tuning "leaks" test knowledge into a model.
- [Google ML Crash Course: Dividing the original dataset](https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets). Training, validation and test sets in plain words. Read it for why test sets wear out with reuse.
- [Manheim and Garrabrant: Categorizing variants of Goodhart's law](https://arxiv.org/abs/1803.04585). A short paper. Read it for the different ways a measure stops tracking the goal once you optimise it.
- [Dwork et al.: Generalization in adaptive data analysis and holdout reuse](https://arxiv.org/abs/1506.02629). The research paper on reusing a holdout set. Read it for why repeated looks at held-out data cause overfitting, and one way to limit it.

Links checked on 2026-11-15.

## Sources

General method (graph order, topological sort, critical path, slack) is standard; the critical path method as a longest path in a DAG is from Sedgewick and Wayne. The other facts come from:

- Anthropic, building effective agents (evaluator-optimizer, when it fits, stopping conditions): https://www.anthropic.com/research/building-effective-agents
- Anthropic, writing effective tools for agents (held-out test sets to avoid overfitting): https://www.anthropic.com/research/writing-tools-for-agents
- Sedgewick and Wayne, directed graphs (topological order exists if and only if the graph is a DAG): https://algs4.cs.princeton.edu/42digraph/
- Sedgewick and Wayne, shortest paths (critical path method): https://algs4.cs.princeton.edu/44sp/
- scikit-learn, cross-validation (test knowledge leaking into a model): https://scikit-learn.org/stable/modules/cross_validation.html
- Google ML Crash Course (test sets wear out with repeated use): https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets
- Google DeepMind, specification gaming: https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/
- Manheim and Garrabrant, Goodhart's law variants: https://arxiv.org/abs/1803.04585
