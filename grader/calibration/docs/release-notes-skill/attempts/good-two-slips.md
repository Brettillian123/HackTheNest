---
name: release-notes
description: Writes release notes for the next version of the project by reading every commit made since the most recent git tag, sorting the commits into categories, and adding a dated entry to the top of CHANGELOG.md. Use this skill whenever the user asks for release notes, a changelog entry, or a summary of changes.
---

# Release notes

Turns recent commits into a categorised entry at the top of `CHANGELOG.md`.

## When to use

- The user asks for release notes or a changelog entry.

## Inputs

- The new version number.

## Steps

1. List the commits since the last tag with `git log --oneline`.
2. Sort each commit into a category: Added, Changed or Fixed.
3. Write one sentence per change.
4. Insert the entry at the top of `CHANGELOG.md`.

## Output format

```markdown
## [x.y.z] - YYYY-MM-DD

### Added
- One line per feature.

### Changed
- One line per change.

### Fixed
- One line per fix.
```

## Rules

- Skip merge commits.
- Never invent a change.
- Do not push or publish anything.
