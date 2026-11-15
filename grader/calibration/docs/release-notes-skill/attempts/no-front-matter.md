# Release notes

Turns the commits since the last tag into a dated, categorised entry at the top of `CHANGELOG.md`.

## When to use

- The user asks for release notes or a changelog entry.
- A new version is about to be tagged.

## Inputs

- The new version number (ask if it is not given).

## Steps

1. Find the last tag with `git describe --tags --abbrev=0`.
2. List the commits since that tag with `git log --oneline`.
3. Sort each commit into a category: Added, Changed or Fixed.
4. Insert the entry at the top of `CHANGELOG.md`.

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

## Rules

- Skip merge commits.
- Never invent a change that is not in the commit list.
- Do not tag, push or publish anything.
