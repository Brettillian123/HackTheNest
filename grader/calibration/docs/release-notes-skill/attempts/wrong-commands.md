---
name: release-notes
description: Writes release notes from last week's commits into RELEASES.md. Use when the user asks for release notes or a changelog.
---

# Release notes

Collects last week's commits into `RELEASES.md` and publishes the release.

## When to use

- The user asks for release notes.

## Steps

1. List recent commits with `git log --since="1 week ago"`.
2. Sort each commit into a category: Features or Bugs.
3. Append the notes to the bottom of `RELEASES.md`.
4. Tag and push the release with `git push --tags`.

## Output format

```markdown
# Release v1

## Features
- ...

## Bugs
- ...
```

## Rules

- Keep it short.
