# Plan a three-page site build

Lesson: 06 agent workflows. The player prompts a model to plan, as JSON, a coordinator-and-workers build of a portfolio site.

- Pages: `site/index.html`, `site/projects.html`, `site/contact.html`. Shared: `site/styles.css`.
- Stages: a plan step, a styles step, one step per page, a review step (kind "review"; the contact page has a form), a final fix or merge step.
- Every step has an owner, `changes`, `dependsOn`, a proof and a budget. Steps that can run at the same time never change the same file.
- Limits: at most 10 steps, 6 owners, 4 steps at once.
