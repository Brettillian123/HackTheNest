---
title: "Agent workflows: one coordinator, scoped workers"
slug: agent-workflows
level: 3
minutes: 60
summary: Split a job between a coordinator and scoped workers, write briefs they can act on alone, and plan the job so no two workers collide.
bonusChallenge: three-page-site-plan
grader: workflow
---

# Agent workflows: one coordinator, scoped workers

## What you will be able to do

- Decide when a job is worth splitting between several agents, and when it is not.
- Write a brief a worker can act on without asking anything, and spot a brief that will fail.
- Give every file one owner, so parallel workers never overwrite each other.
- Decide when a review agent is worth its cost.
- Handle a worker that fails, stalls or drifts out of scope.
- Set budgets and proofs so work ends when it is done, not when someone gets tired of checking.

## Why it matters

Two agents asked to "improve the site" will both edit `styles.css`. The second save wins, the first agent's work vanishes, and each reports success. A plan that says who owns each file, and what proves each piece done, prevents this before any code is written.

The same plan also controls cost. Anthropic reports that its multi-agent research system used about 15 times as many tokens as a chat. Several agents are worth that only when the plan gives each one a clear piece, and stops each one when its piece is proven.

## The ideas

### The shape

One **coordinator** plans, writes briefs, checks results and keeps notes. It does not do the work itself. Several **workers** each take one piece. Anthropic's guide to building agents calls this the orchestrator-workers pattern: a central model breaks down the task, hands out subtasks and combines the results. The guide separates it from plain parallelization: there the subtasks are fixed in advance, while an orchestrator decides them from the input.

In Claude Code, workers are subagents: each "runs in its own context window" and "doesn't see your conversation history". So a worker knows only what its brief says. The same is true of any fresh agent in any tool.

Start simple. The same guide advises the simplest solution that works, and adding complexity only when it is needed. One agent is right for small jobs. Split when the pieces are independent and each is big enough to be worth a brief.

Anthropic's write-up on its research system gives the other side: tasks where every agent needs the same context, or where pieces depend on each other a lot, are a poor fit for several agents. It also notes that most coding tasks have fewer truly parallel pieces than research. Cognition makes a related point from building a coding agent: each action carries hidden decisions, and two workers making conflicting decisions produce work that does not fit together. Their example is a game split into "background" and "bird" pieces, where each worker drew in a different style.

So the test before splitting is: can I write each piece down so fully that the worker never needs to see the others? If not, keep it in one agent, or run the pieces in order.

### Anatomy of a brief

A brief is the whole world for a worker. Anthropic's research team found that each subagent needs an objective, an output format, guidance on tools and sources, and clear task boundaries; without them, agents duplicated work and left gaps. The list below covers the same ground, plus the parts that stop a worker from running forever.

1. **Why.** The goal in the requester's words, so the worker can make sensible small choices.
2. **What is known.** Decisions, interfaces, paths, facts. Write them down so the worker does not go looking.
3. **Files.** Exactly which files it may read and change. Nothing else.
4. **Steps.** Numbered.
5. **Proof.** The one thing that shows it is done: a test run, a build, a screenshot.
6. **Rules.** What it must not do (other files, secrets, starting more agents, pushing).
7. **Budget.** A number of tool calls or minutes. At the limit it stops and reports.
8. **Report.** The format and length of its answer.

### A bad brief and a good brief

Here is the same task briefed twice.

**Bad:**

```text
Build the menu page for the bakery site. Make it match the rest of the
site and look good. Check the plan for details. Let me know when done.
```

Every sentence points somewhere instead of saying something. "Match the rest of the site": which files, which colours? "Check the plan": the worker may not find it, or may read an old copy. "Look good" cannot be checked. "Let me know when done" invites a report of "done" with nothing to back it. There is no file list, so the worker may also "fix" `styles.css` while it is there, and collide with the styles worker.

**Good:**

```text
Why: the owner wants "a menu people can read on a phone in ten seconds".

Known:
- Sections, in order: Breads, Pastries, Cakes, Drinks. Each item has a
  name, a one-line description and a price in dollars.
- Colours and fonts come from site/styles.css (being written now by
  another worker). Use only these classes: .page, .section, .item,
  .price. Do not add a <style> block.
- Header and footer: copy them exactly from site/index.html once it exists;
  until then use <header class="site-header"></header> as a placeholder.

Files: you may create and change site/menu.html only. You may read
PLAN.md. Do not change any other file.

Steps:
1. Write site/menu.html with the four sections from PLAN.md.
2. Open it at 1280x800 and at 390x844 and take a screenshot of each.

Proof: the two screenshots show all four sections, with prices aligned.

Rules: do not start other agents. Do not commit or push. Do not open .env.

Budget: 40 tool calls. At 40, stop, keep what works and report what is left.

Report, under 80 words: what you built, the two screenshot paths, anything
you could not do.
```

It is longer, and that is the point: the coordinator spends a minute writing facts down so the worker does not spend twenty minutes guessing them. Notice that it names the one shared thing, `styles.css`, and says who owns it.

### Splitting work so no two workers touch the same files

Before work starts, list every file each step may change. Two steps that can run at the same time must not share a file. If two pieces need the same file, you have three honest choices:

1. **Run them one after the other.** The second step lists the first in `dependsOn`.
2. **Give the file one owner.** The other worker sends its changes in its report, and the owner applies them.
3. **Split the file.** If two pages both need new styles, give each page its own stylesheet, or have the plan step write the shared values first so nobody needs to change them later.

Folders help. "The core writer owns `packages/core/docs/`" is easier to check than a list of twenty files. A folder owns everything under it, so two owners of `src/` and `src/site/` overlap.

Watch for hidden shared files: a lock file that an install rewrites, a generated index, a changelog every worker wants to add a line to. Give each of these to the coordinator, and run it last.

### Proof, once

Each step names its proof before it starts. The worker runs the proof once after its last change and reports the real output. "Should work" is not a proof.

Good proofs are things a person, or a script, can check without trusting the worker: a test command and its output, a build that exits 0, a screenshot at a stated size, a file with a stated content. "Works correctly" and "looks good" are not proofs; they are opinions.

Why once, and not again and again? Each re-check costs a full read of the work. If the proof was chosen well, passing it once means the piece is done; checking again finds nothing new. If the proof was chosen badly, checking it ten times does not make it better. Spend the effort on choosing the proof, then trust it.

### Budgets

A budget is a number of tool calls or minutes, set before the step starts. It does three jobs. It stops a stuck worker that is re-reading the same files. It forces the coordinator to size each piece: a step that "needs" 300 calls is probably two steps. And it gives a fair stopping point: at the budget, the worker keeps what passes, and reports what is left, so the coordinator can decide what to do next.

Workers cannot see their token count, but they can count tool calls, so call budgets are the practical choice for agents. Minutes suit steps where waiting dominates, like a test run.

### When a review agent is worth it

A review is a second agent reading finished work with fresh eyes. It costs a whole extra run, and a fix round after it. Use one where a hidden bug would hurt the whole project: scoring logic, security, money, data that cannot be restored, code that renders untrusted content. Skip it for ordinary pieces that already have a proof.

A useful rule of thumb: ask what a bug here would cost if it reached users, and whether the proof would catch it. A page layout with a screenshot proof does not need review; a wrong screenshot is visible. A database migration does: a test database can pass while production data has a case nobody thought of.

How to run one well:

- Give the reviewer the work, not your opinion of it. "Find what is wrong with this" gets a real review; "confirm this is right" gets agreement.
- Give it a budget and a report format: each issue with file and line, or "none found".
- Make the review step depend on everything it checks, and put the fix step after it.
- Fix what it finds once. Do not review the review.

### When a worker fails or drifts

Workers fail in a few common ways. Plan for each before it happens.

- **It hits its budget.** It should stop and report what passed and what is left. Read the report, then decide: split the rest into a smaller step, or do it in a second round with a fresh brief that includes what the first round learned.
- **Its proof fails.** Fix at the cause. Never loosen the proof to pass. Allow two fix rounds; if it still fails, stop and take both results to a person.
- **It drifts out of scope.** It changed a file it did not own. Revert that change and keep only its own files. Then look at the brief: drift usually means the brief left a gap the worker filled with a guess.
- **It reports "done" with no proof.** Treat it as not done. Ask for the proof output, or run the proof yourself.
- **It returns something that does not fit.** Two workers made different assumptions. This is a planning failure, not a worker failure: the shared decision belonged in both briefs.

In every case, write down what happened and what not to retry, so the next round does not repeat it.

### The plan as a graph

Write the plan as data: steps, who owns them, what they depend on. The PromptDyno workflow grader reads plans like the example below, with exactly these field names: `goal`; and for each step `id`, `title`, `owner`, `dependsOn`, `changes` (files or globs the step may change; `[]` for a read-only step), optional `reads`, `proof`, `budget` (`{ "toolCalls": 30 }` or `{ "minutes": 10 }`) and optional `kind` (`work`, `review`, `research` or `decision`).

### Worked example

A plan to build a small two-page site with shared styles:

```json
{
  "goal": "Two-page bakery site: home and menu, one shared stylesheet, reviewed and fixed",
  "steps": [
    { "id": "plan", "title": "Write the site plan", "owner": "coordinator", "dependsOn": [], "changes": ["PLAN.md"],
      "proof": "PLAN.md lists both pages, their sections and the colour and font values", "budget": { "toolCalls": 10 } },
    { "id": "styles", "title": "Build the shared stylesheet", "owner": "worker-styles", "dependsOn": ["plan"], "changes": ["site/styles.css"],
      "proof": "styles.css defines every colour and font listed in PLAN.md", "budget": { "toolCalls": 30 } },
    { "id": "home", "title": "Build the home page", "owner": "worker-home", "dependsOn": ["plan"], "changes": ["site/index.html"],
      "proof": "Screenshot at 1280x800 shows the heading, hero and footer", "budget": { "toolCalls": 40 } },
    { "id": "menu", "title": "Build the menu page", "owner": "worker-menu", "dependsOn": ["plan"], "changes": ["site/menu.html"],
      "proof": "Screenshot at 1280x800 shows all menu sections from PLAN.md", "budget": { "toolCalls": 40 } },
    { "id": "review", "title": "Review both pages and the stylesheet", "owner": "reviewer", "kind": "review",
      "dependsOn": ["styles", "home", "menu"], "changes": [],
      "proof": "Review report lists each issue with file and line, or says none found", "budget": { "toolCalls": 20 } },
    { "id": "fix", "title": "Fix review issues and merge", "owner": "coordinator", "dependsOn": ["review"],
      "changes": ["site/styles.css", "site/index.html", "site/menu.html"],
      "proof": "Both screenshots retaken; every review issue marked fixed or explained", "budget": { "toolCalls": 30 } }
  ],
  "loops": []
}
```

`styles`, `home` and `menu` run at the same time; each changes a different file. `fix` changes all three, but it runs alone, after everything else.

## Common mistakes

1. **Briefs that point instead of tell.** "See the docs for the colours." Fix: write the colours into the brief.
2. **Overlapping files.** Two parallel steps both change `styles.css`. Fix: one owner, or run them in order.
3. **No proof.** The worker says "done" and you cannot tell. Fix: name the proof before the step starts.
4. **No budget.** A stuck worker re-reads the same files for an hour. Fix: a call budget and "stop and report what is left".
5. **Workers starting workers.** Costs multiply and nobody tracks scope. Fix: say in every brief that workers do not start agents. (Claude Code allows nesting by default, up to three levels below the main conversation; you can turn it off.)
6. **Reviewing everything.** Fix: review only the pieces where a bug would hurt the whole project.
7. **Splitting a job that shares one big decision.** Fix: make the decision first, in a plan step, and write it into every brief.

## Check your understanding

1. A job has four pieces, but each piece needs to know what the other three decided. Should you give them to four parallel workers?

<details><summary>Answer</summary>

No. Pieces that depend on each other's decisions are a poor fit for parallel workers. Either make the shared decisions first in a plan step and write them into every brief, or run the pieces in order, or keep the job in one agent.

</details>

2. Name three things a brief must contain so that the worker can stop on its own, at the right time.

<details><summary>Answer</summary>

A proof (what shows it is done), a budget (when to stop if it is not done) and a report format (what to say when it stops). Without these, a worker stops when it feels finished.

</details>

3. Find the fault in this plan fragment:

```json
{ "id": "home", "dependsOn": ["plan"], "changes": ["site/index.html", "site/styles.css"] },
{ "id": "styles", "dependsOn": ["plan"], "changes": ["site/styles.css"] }
```

<details><summary>Answer</summary>

`home` and `styles` both depend only on `plan`, so they can run at the same time, and both change `site/styles.css`. One will overwrite the other. Remove `styles.css` from `home`, or make `home` depend on `styles`.

</details>

4. Find the fault in this plan fragment:

```json
{ "id": "review", "kind": "review", "dependsOn": ["home"], "changes": [] },
{ "id": "contact", "dependsOn": ["plan"], "changes": ["site/contact.html"] },
{ "id": "merge", "dependsOn": ["review", "contact"], "changes": ["site/**"] }
```

<details><summary>Answer</summary>

The review does not depend on `contact`, so the contact page can be merged without ever being reviewed. If the contact page is the reason a review is needed (it has a form), that is the step the review most needs to wait for.

</details>

5. A worker reports "done, all looks good" after 40 tool calls. Its brief named a test command as the proof. What do you do?

<details><summary>Answer</summary>

Treat the step as not done. Ask for the test output, or run the test yourself once. "Looks good" is an opinion, not a proof.

</details>

6. Which of these earns a review step: a blog page with a screenshot proof, or a script that deletes old user records? Why?

<details><summary>Answer</summary>

The delete script. A bug there destroys data that may not come back, and a test on sample data may not cover the real cases. A layout bug on the blog page shows up in the screenshot, so the proof already covers it.

</details>

## How this changes your prompts

When you ask a model to plan or run a multi-agent job, the same ideas go straight into the prompt.

**Before:**

```text
Split this job between some agents and get it done.
```

**After:**

```text
Plan this job for one coordinator and up to four workers. For each step
give: an owner, the exact files it may change, what it depends on, a proof
I can check (a command, a test or a screenshot) and a budget in tool calls.
Steps that can run at the same time must not share a file. Workers do not
start other agents.
```

**Before:**

```text
Have another agent review the code.
```

**After:**

```text
Add one review step, of kind "review", only for the migration files,
because a bug there can lose data. It depends on both migration steps,
reports each issue with file and line or says "none found", and has a
budget of 15 tool calls. The fix step comes after it. No second review.
```

**Before:**

```text
Tell the worker to keep going until it works.
```

**After:**

```text
Budget: 30 tool calls. Run the proof once after your last change. If you
reach 30 calls, stop, keep what passes, and report what is left in under
80 words.
```

## Try it: bonus challenges

Three challenges, easiest first. For each, write a prompt that gets the model to produce the plan as JSON, in the shape of the worked example. The grader checks the plan, not your prompt.

### Level 1: docs refresh across three packages (`docs-refresh-plan`)

**Situation.** A repository has three packages, `core`, `cli` and `web`. Each has its docs in its own folder: `packages/core/docs/`, `packages/cli/docs/`, `packages/web/docs/`. Release 3.0 changed all three. A coordinator writes a style guide, three writers refresh one package each, and the coordinator updates the shared index.

**What the model must plan.** A style guide step that changes `docs/STYLE.md`; one writer step per package folder; an index step that changes `docs/index.md`.

**Graded on:**

- All five stages are present, found by the files they change.
- The style guide comes before every package step; the index comes after all three.
- The three package steps run in parallel (none depends on another) and share no file.
- Every step has a title, an owner, a `changes` list, a `dependsOn` list, a checkable proof and a budget.
- At most 6 steps and 5 owners, and the goal says when the job is done.

### Level 2: a database migration with a rehearsed rollback (`data-migration-plan`)

**Situation.** You need to split `users.full_name` into `first_name` and `last_name`. The change goes in `migrations/0007_split_name.up.sql`; its rollback, which restores `full_name`, goes in `migrations/0007_split_name.down.sql`. Data that is lost here does not come back, so the plan needs a backup, a review and a rehearsal before production.

**What the model must plan.** A backup step titled "back up" (or "backup", "snapshot", "dump") that changes only `backups/`; two parallel steps that write the up file and the rollback file, one file each; a review step of kind `review` that depends on both; a rehearsal step (titled "rehearse", "dry run", "staging" or "trial") that runs up then down on a staging copy and writes `reports/rehearsal.md`; an apply step that writes `reports/apply.md`; a verify step that writes `reports/verify.md`.

**Graded on:**

- All seven stages are present, found by their files and titles.
- The up and rollback steps can run at the same time and share no file.
- The review depends on both migration steps.
- Rehearsal follows the review; apply waits for both the rehearsal and the backup; verify follows apply.
- Every step has a title, an owner, `changes`, `dependsOn`, a checkable proof and a budget.
- At most 8 steps and 5 owners, and the goal says when the job is done.

### Level 3: a three-page site with a review (`three-page-site-plan`)

**Situation.** You are coordinating a three-page portfolio site: `site/index.html`, `site/projects.html` and `site/contact.html`, sharing `site/styles.css`. The contact page has a form, so the brief calls for a review step before the final merge.

**What the model must plan.** A plan step, a styles step, one step per page, a review step and a final fix or merge step.

**Graded on:**

- Required stages are present: a plan step, a styles step, one step per page, a review step, and a final fix or merge step.
- Every step has a title, an owner, a `changes` list, a `dependsOn` list, a proof and a budget.
- Dependencies point only to steps that exist, and there is no cycle.
- No two steps that can run at the same time list the same file in `changes`.
- The review step (`"kind": "review"`) depends on all three page steps and the styles step.
- There are no loops, or every loop has an exit test and a cap.

## Prompting tips for these challenges

- Paste the worked example's shape and say "use exactly these field names".
- List the files and say which step owns each one.
- Tell the model the rule in words: "steps that can run at the same time must not share a file".
- Give the order as a list of "X before Y" facts, and the parallel steps as a group.
- Ask for a proof that a person could check by looking (a screenshot, a test result, a file), not "works correctly".
- Give the limits on steps and owners as numbers.
- Ask for JSON only, so nothing else needs to be stripped before grading.

## Go deeper

**Official documentation on agents and sub-agents**

- [Anthropic: Building effective AI agents](https://www.anthropic.com/research/building-effective-agents). The patterns this lesson uses, from prompt chaining to orchestrator-workers. Read it for when to add agents and when not to.
- [Claude Code: Create custom subagents](https://code.claude.com/docs/en/sub-agents). How Claude Code runs workers in their own context. Read it for tool allowlists, how descriptions drive delegation, and the nesting limit.
- [OpenAI Agents SDK: Agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/). Another vendor's view of running several agents. Read it to compare letting a model choose the flow with fixing the flow in code.
- [OpenAI Agents SDK: Handoffs](https://openai.github.io/openai-agents-python/handoffs/). How one agent passes a task to another. Read it to see what context travels with a handoff.
- [Google ADK: Parallel workflow](https://adk.dev/agents/workflow-agents/parallel-agents/). Google's agent kit running sub-agents at the same time. Read it to see that parallel sub-agents keep separate histories but share session state, so each writes to its own key: the one-owner rule again, for data instead of files.
- [Microsoft: AI agent orchestration patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns). A catalogue of sequential, concurrent, group chat, handoff and "magentic" patterns. Read it for the trade-offs of each.

**Engineering write-ups from people who build agent systems**

- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/research/multi-agent-research-system). A lead agent with parallel subagents. Read it for what a subagent brief needs, what went wrong with vague briefs, and the token cost.
- [Cognition: Don't build multi-agents](https://cognition.com/blog/dont-build-multi-agents). The case against splitting, from a coding-agent team. Read it for why conflicting hidden decisions break parallel work.
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents). How to keep an agent's context small and useful. Read it for the advice to give a model the smallest set of high-signal tokens, and for why subagents return a short summary, not everything they read.

**Foundations**

- [Google engineering practices: code review](https://google.github.io/eng-practices/review/). Google's public guide for reviewers and authors. Read it for what a reviewer should look for and how to keep reviews fast.
- [Martin Fowler: Continuous Integration](https://martinfowler.com/articles/continuousIntegration.html). The classic article on merging small, tested changes often. Read it for why a self-testing build is the proof every piece should pass.
- [Google SRE book: Postmortem culture](https://sre.google/sre-book/postmortem-culture/). How Google writes up failures without blame. Read it for how to record what failed and what not to retry.

Links checked on 2026-11-15.

## Sources

- Anthropic, building effective agents (orchestrator-workers, parallelization, simplest solution): https://www.anthropic.com/research/building-effective-agents
- Claude Code, subagents (own context window, no conversation history, nesting up to three levels by default): https://code.claude.com/docs/en/sub-agents
- Anthropic, multi-agent research system (what a subagent brief needs, duplicated work from vague briefs, about 15 times the tokens of a chat, poor fit for shared-context tasks): https://www.anthropic.com/research/multi-agent-research-system
- Cognition, don't build multi-agents (conflicting decisions, the game example): https://cognition.com/blog/dont-build-multi-agents
