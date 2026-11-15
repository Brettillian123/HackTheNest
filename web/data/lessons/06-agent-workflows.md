---
title: "Agent workflows: one coordinator, scoped workers"
slug: agent-workflows
level: 3
minutes: 35
summary: Split a job between a coordinator and scoped workers, write briefs they can act on alone, and plan the job so no two workers collide.
bonusChallenge: three-page-site-plan
grader: workflow
---

# Agent workflows: one coordinator, scoped workers

## What you will be able to do

- Decide when a job is worth splitting between several agents, and when it is not.
- Write a brief a worker can act on without asking anything.
- Give every file one owner, so parallel workers never overwrite each other.
- Decide when a review agent is worth its cost.

## Why it matters

Two agents asked to "improve the site" will both edit `styles.css`. The second save wins, the first agent's work vanishes, and each reports success. A plan that says who owns each file, and what proves each piece done, prevents this before any code is written.

## The ideas

### The shape

One **coordinator** plans, writes briefs, checks results and keeps notes. It does not do the work itself. Several **workers** each take one piece. Anthropic's guide to building agents calls this the orchestrator-workers pattern: a central model breaks down the task, hands out subtasks and combines the results.

In Claude Code, workers are subagents: each "runs in its own context window" and "doesn't see your conversation history". So a worker knows only what its brief says. The same is true of any fresh agent in any tool.

Start simple. The same guide advises the simplest solution that works. One agent is right for small jobs. Split when the pieces are independent and each is big enough to be worth a brief.

### What goes in a brief

1. **Why.** The goal in the requester's words, so the worker can make sensible small choices.
2. **What is known.** Decisions, interfaces, paths, facts. Write them down so the worker does not go looking.
3. **Files.** Exactly which files it may read and change. Nothing else.
4. **Steps.** Numbered.
5. **Proof.** The one thing that shows it is done: a test run, a build, a screenshot.
6. **Rules.** What it must not do (other files, secrets, starting more agents, pushing).
7. **Budget.** A number of tool calls or minutes. At the limit it stops and reports.
8. **Report.** The format and length of its answer.

### One owner per file

Before work starts, list every file each step may change. Two steps that can run at the same time must not share a file. If two pieces need the same file, either run them one after the other or give the file to one owner and have the other send it changes.

### Proof, once

Each step names its proof before it starts. The worker runs the proof once after its last change and reports the real output. "Should work" is not a proof.

### When a review agent is worth it

A review is a second agent reading finished work with fresh eyes. It costs a whole extra run. Use one where a hidden bug would hurt the whole project: scoring logic, security, code that renders untrusted content. Skip it for ordinary pieces that already have a proof. Give the reviewer the work, not your opinion of it, and a budget. Fix what it finds once; do not review the review.

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
5. **Workers starting workers.** Costs multiply and nobody tracks scope. Fix: say in every brief that workers do not start agents. (Claude Code allows nesting by default; you can turn it off.)
6. **Reviewing everything.** Fix: review only the pieces where a bug would hurt the whole project.

## Try it: bonus challenge

**Situation.** You are coordinating a three-page portfolio site: `site/index.html`, `site/projects.html` and `site/contact.html`, sharing `site/styles.css`. The contact page has a form, so the brief calls for a review step before the final merge.

**Your task.** Write a prompt that gets the model to produce the plan as JSON, in the shape shown in the worked example.

**Graded on:**

- Required stages are present: a plan step, a styles step, one step per page, a review step, and a final fix or merge step.
- Every step has a title, an owner, a `changes` list, a `dependsOn` list, a proof and a budget.
- Dependencies point only to steps that exist, and there is no cycle.
- No two steps that can run at the same time list the same file in `changes`.
- The review step (`"kind": "review"`) depends on all three page steps and the styles step.
- There are no loops, or every loop has an exit test and a cap.

## Prompting tips for this challenge

- Paste the worked example's shape and say "use exactly these field names".
- List the four files and say which steps own them.
- Tell the model the rule in words: "steps that can run at the same time must not share a file".
- Ask for a proof that a person could check by looking (a screenshot, a test result), not "works correctly".
- Ask for JSON only, so nothing else needs to be stripped before grading.

## Sources

- Anthropic, building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- Claude Code, subagents: https://code.claude.com/docs/en/sub-agents
