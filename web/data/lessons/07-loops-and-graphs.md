---
title: Loops and graphs
slug: loops-and-graphs
level: 3
minutes: 35
summary: Run a model in a loop against a test with a fixed exit and a cap, and plan a job as a graph so you know what can run at once and what sets the finish time.
bonusChallenge: fix-loop-plan
grader: workflow
---

# Loops and graphs

## What you will be able to do

- Set up an improve-and-test loop with an exit test and a cap chosen before you start.
- Keep a held-out check so the loop does not just learn to pass its own test.
- Draw a job as a graph of steps and dependencies, and spot what can run at the same time.
- Find the critical path: the chain of steps that decides when the job finishes.

## Why it matters

"Keep fixing until it is good" has no end: the model loops for hours or stops when it feels done. Worse, a model that sees the test can pass it without doing the job, by hard-coding the expected output. A written exit test, a cap of three rounds and a final check on tests it never saw stop both failures.

## The ideas

### Part A: loops

An improve-and-test loop (Anthropic's guide calls it evaluator-optimizer) is:

1. Make an attempt.
2. Check it against a test.
3. If the test passes, stop. If not, use the test's feedback to improve, and go back to step 2.

Four rules make it safe:

- **Decide the exit test before the first round.** "All 12 visible tests pass", not "looks good".
- **Cap the rounds,** say at 3. At the cap, report the best attempt and what still fails. Anthropic's guide recommends stopping conditions "such as a maximum number of iterations".
- **Stop on no progress.** If the score has not risen for two rounds, change the approach or ask a person.
- **Keep a held-out check.** The loop sees the visible tests. A second set, never shown to the loop, runs once at the end. If visible tests pass and held-out tests fail, the loop has fitted the test, not solved the problem.

Never loosen, skip or delete a test to get out of the loop. That is passing the test without doing the job.

### Part B: graphs

A job is a set of steps. Some steps need another step's output first. Draw each step as a node and each "needs" as an arrow. That is a directed graph.

- **What can run at the same time:** steps where neither needs the other, directly or indirectly, and that change different files.
- **Order:** a valid (topological) order puts every step after the steps it needs. One exists only if there is no cycle.
- **Cycles:** a cycle (A needs B, B needs A) has no start. The only acceptable cycle is a loop marked on purpose, with an exit test and a cap.
- **Critical path:** give each step an estimate. The longest chain from start to finish sets the finish time. Speeding up a step off that chain changes nothing.

### Worked example

Build a small page to a spec, with a fix loop and a held-out check:

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
- After `spec`, `visible-tests`, `held-out-tests`, `build` and `readme` can run at once: they change four different places.
- `build` and `fix` share `site/pricing.html`, but `fix` always follows `build`.
- Critical path, worst case: `spec` (5), `build` (20), three rounds of `grade` plus `fix` (3 x 12 = 36), `final-check` (5): 66 minutes. `visible-tests` (15) finishes before `build` (20), so it is off the path, and so is `readme`.

Steps use the same fields as in lesson 6. A loop has an `id`, the `steps` that repeat, `until` (the exit test), `maxRounds` (the cap) and, when it tunes against tests, `heldOut` (what it is checked on at the end that it never saw).

## Common mistakes

1. **No exit test.** "Until it is good." Fix: a pass condition you could check with a script.
2. **No cap.** Fix: a maximum number of rounds, and a report at the cap.
3. **The loop sees every test.** Fix: hold some back and run them once at the end.
4. **Changing the test to pass.** Fix: the test is fixed for the whole loop; only the work changes.
5. **Unmarked cycles.** Two steps that wait on each other with no exit. Fix: break the cycle, or mark it as a loop with an exit and a cap.
6. **Speeding up the wrong step.** Fix: find the critical path first, then work on a step that is on it.

## Try it: bonus challenge

**Situation.** You want a model to write a function `parse_price(text)` in `src/price.py` that turns strings like "$1,299.00" into numbers. There are 20 visible tests in `tests/visible/` and 8 held-out tests in `tests/held_out/` that the builder must never see. The brief allows at most 4 fix rounds.

**Your task.** Write a prompt that gets the model to produce the plan as JSON, in the shape of the worked example.

**Graded on:**

- Required stages: write or load tests, build, a grade-and-fix loop, a final held-out check.
- Every step has a title, an owner, a `changes` list, a `dependsOn` list, a proof and a budget.
- The loop is declared in `loops`, with its `steps`, an `until` exit test, `maxRounds` of 4 or less and a `heldOut` note.
- There is no cycle except inside the marked loop.
- No two steps that can run at the same time list the same file.
- The held-out check comes after the loop, and no step in the loop, or before it, reads or changes `tests/held_out/`.

## Prompting tips for this challenge

- Give the file paths and the round limit as facts.
- Say what ends the loop in testable words, and ask for a no-progress rule too.
- Say plainly: "the builder never reads `tests/held_out/`".
- Paste the worked example's shape and ask for JSON only, with the same field names.
- Ask the model to check its own plan for unmarked cycles and shared files before it answers.

## Sources

General method (loops, graph order, critical path) needs no product source. The evaluator-optimizer pattern and the advice on stopping conditions come from:

- Anthropic, building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, writing effective tools for agents (held-out test sets to avoid overfitting): https://www.anthropic.com/engineering/writing-tools-for-agents
