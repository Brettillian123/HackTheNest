# Advanced track: lessons

Eight lessons on the skills around prompting: instruction files, documentation, skills, MCP, agent workflows, loops and graphs, and verification. Each lesson goes deeper than a single challenge and ends in a bonus challenge.

## Order

| # | Lesson | Level | Bonus challenge | Grader |
| --- | --- | --- | --- | --- |
| 1 | Project instructions a model actually follows | 1 | `agents-md-for-a-repo` | doc |
| 2 | Documentation as a prompt | 1 | `readme-for-a-cli` | doc |
| 3 | Skills: packaging a repeatable task | 2 | `release-notes-skill` | doc |
| 4 | MCP, part one: giving a model tools | 2 | `mcp-server-trust-note` | doc |
| 5 | MCP, part two: defining tools well | 2 | `library-tools` | doc |
| 6 | Agent workflows: one coordinator, scoped workers | 3 | `three-page-site-plan` | workflow |
| 7 | Loops and graphs | 3 | `fix-loop-plan` | workflow |
| 8 | Self-research and verification | 2 | `findings-report` | doc |

`index.json` lists the lessons in this order for the app.

## How a lesson connects to its challenge

Each lesson ends with "Try it: bonus challenge": a situation, what the player's prompt must get the model to produce, and the criteria in plain words. The same challenge is in `challenges.json` with its facts (`spec`), `kind` (`doc` or `workflow`) and `criteria`. The player writes a prompt; the model writes the file or plan; a deterministic grader (no AI) checks it.

- **doc** challenges produce a Markdown file or a JSON list of MCP tool definitions.
- **workflow** challenges produce a plan as a JSON graph of steps, with any loops marked.

## Not built yet

- The doc and workflow graders, and their rubrics. The `criteria` lists are plain-language goals for the grader authors, not rubrics.
- The exact JSON field names for workflow plans. Lessons 6 and 7 show a sketch (`steps`, `owner`, `files`, `dependsOn`, `proof`, `budget`, `loops`, `exitTest`, `maxRounds`); the workflow grader sets the final names.
- Any app page that shows these lessons.

## Accuracy notes

Product and protocol facts were checked against official docs on 2026-11-15 and are listed under each lesson's Sources. The MCP lessons follow spec version `2026-07-28`. Things not confirmed are marked "unconfirmed" or "not checked" in the text, for example skills support in Cursor and Gemini CLI.
