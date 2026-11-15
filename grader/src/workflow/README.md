# Workflow grader

Scores a plan for a job done by several agents. The model writes the plan as JSON, as a graph of steps, and the grader checks it against a rubric the challenge author wrote. No AI is involved: the same input always gives the same score.

```ts
import { gradeWorkflow } from './index';
gradeWorkflow({ rubric, candidate }); // { total, pillars, criteria, feedback, error? }
```

`candidate` is the model's text (a single ```json fence is allowed) or a parsed object. Service: `POST /v1/grade/workflow` with `{ rubric, candidate }`.

## The plan

`goal`, `steps[]`, `loops[]`. Each step has `id`, `title`, `owner`, `dependsOn`, `changes` (globs; `[]` when it changes nothing), optional `reads`, `proof`, `budget` (`{ toolCalls?, minutes? }`) and `kind` (`work` by default, or `review`, `research`, `decision`). Each loop has `id`, `steps`, `until`, `maxRounds` and optional `heldOut`. Text that is not JSON, or JSON with a wrong type or an old field name (`files`, `exitTest`), scores 0 with the first problem named. Missing content (no proof, no cap) is not a shape error: it is marked down and named in the feedback.

## Writing a rubric

All judgement about the job lives in the rubric. See `calibration/workflow/*/rubric.json`.

- `stages`: the pieces the plan must contain. `match` keys combine with AND, entries inside a key with OR: `titleAny` (word prefixes in the step's id, title or owner: `"style"` matches "stylesheet"), `changesAny` and `readsAny` (globs that must overlap the step's lists), `kind`. Make matches specific enough that a final fix step does not also count as a page step. Add `importance`: critical 1.5, major 1.25, normal 1, minor 0.75.
- `before`: `[A, B]` pairs. Every B step must wait for an A step through `dependsOn`, directly or indirectly. A B step that runs before A entirely, like a loader that happens to match, is ignored as long as some B step comes after A.
- `parallel`: stage groups that should be able to run at the same time.
- `loops`: `{ name, stages, maxRoundsAtMost, needsHeldOut?, heldOutPaths? }`. With `heldOutPaths` set, no step in the loop may read or change those paths, and no step that reads them may come before the loop.
- `reviewOf`: stages that need a step of kind `review` after them. Steps of the stage that come after the review, such as the fix, are fine.
- `limits`: `maxSteps`, `maxOwners`, `maxParallel` (the most steps at one depth).

A malformed rubric returns `error: "Rubric: ..."` in words meant for the author. `workflowRubricProblem(rubric)` checks a rubric without a plan.

## Criteria (each 0 to 1)

| Criterion | Pillar | Measures |
|---|---|---|
| stages | works | Weighted share of stages met. Each missing stage costs 2.5 times its share. |
| order | works | Share of `before` pairs that hold (each broken pair costs twice its share), `dependsOn` ids that exist, and no cycle outside a declared loop. |
| loops | works | Each required loop is declared over the right stages, with a checkable `until` (not empty, vague or circular), a cap within the limit, and a held-out check where required. Extra loops need an exit and a cap too. An undeclared cycle costs here as well. |
| safety | engineering | Steps that can run at the same time (neither waits on the other) must not have overlapping `changes`. Globs are compared properly: `src/**` overlaps `src/site/a.ts`, and a plain folder owns what is under it. |
| proof | engineering | Each step's proof names something checkable: a command, a file, a test, a screenshot. Required reviews exist and come after what they review. |
| economy | engineering | Within the limits. The longest chain is no more than 2 steps longer than the rubric's orderings need. `parallel` stages are not chained. Work steps have budgets. No step changes nothing, proves nothing and feeds nothing. |
| clarity | looks | The goal states an end condition. Titles say what is done. Ids are unique and readable. Each owner is spelled one way. |

total = 100 x (0.40 works + 0.25 looks + 0.35 engineering x works). works is stages x order x loops; engineering is the weakest of its three. The lost points are shared out as feedback, first by criterion (what fixing that criterion alone would gain), then by fault. The eight most costly lines are shown.

## Calibration

`npx tsx src/workflow/calibrate.ts` grades every attempt in `calibration/workflow/` and prints it beside the human band in `bands.json`, which was written before grading.
