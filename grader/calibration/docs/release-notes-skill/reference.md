---
name: release-notes
description: Writes release notes for the next version from the commits since the last git tag and adds them to CHANGELOG.md. Use when the user asks for release notes, a changelog entry or a summary of what changed since the last release.
---

# Release notes

Turns the commits since the last tag into a dated, categorised entry at the top of `CHANGELOG.md`.

## When to use

- The user asks for release notes or a changelog entry.
- A new version is about to be tagged and `CHANGELOG.md` needs updating.

## Inputs

- The new version number (ask if it is not given).
- A git repository with at least one tag.

## Steps

1. Find the last tag:

   ```bash
   git describe --tags --abbrev=0
   ```

2. List the commits since that tag:

   ```bash
   git log --oneline "$(git describe --tags --abbrev=0)"..HEAD
   ```

3. Sort each commit into a category: Added, Changed or Fixed.
4. Write one plain sentence per change, in the past tense.
5. Insert the entry at the top of `CHANGELOG.md`, below the file's title.

## Output format

```markdown
## [x.y.z] - YYYY-MM-DD

### Added
- One line per new feature.

### Changed
- One line per change in behaviour.

### Fixed
- One line per bug fix.
```

Leave out a category that has no entries.

## Rules

- Skip merge commits and commits that only touch tests or formatting.
- Never invent a change that is not in the commit list.
- Do not tag, push or publish anything; the user does that.
