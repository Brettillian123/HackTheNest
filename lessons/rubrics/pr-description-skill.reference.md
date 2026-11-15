---
name: pr-description
description: Writes a pull-request description from the commits and changed files on the current branch. Use when the user asks for a PR description, a pull-request summary or the text for a merge request.
---

# PR description

Drafts a pull-request description for the current branch.

## Steps

1. List the commits on this branch with `git log --oneline main..HEAD`.
2. List the changed files with `git diff --stat main...HEAD`.
3. Write the description under three headings: Summary, Changes, Testing.
4. Show the description to the user.

## Rules

- Never invent test results. Under Testing, list only tests that the user or the commits mention.
- Do not open the pull request yourself; the user does that.
