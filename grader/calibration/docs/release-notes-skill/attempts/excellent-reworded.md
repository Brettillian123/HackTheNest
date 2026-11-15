---
name: release-notes
description: "Drafts release notes: reads the commits since the latest git tag, groups them, and prepends a new entry to CHANGELOG.md. Use when someone asks for release notes or a changelog update."
---

# Release notes skill

Builds the next `CHANGELOG.md` entry from the git history since the last release.

## Use this skill when

- Someone asks for release notes, a changelog update, or "what changed since the last release".

## What you need

- The version number for the new release. Ask for it if you do not have it.

## Procedure

1. Get the most recent tag with `git describe --tags --abbrev=0`.
2. Read the commits after it with `git log --oneline <tag>..HEAD`.
3. Put every commit in one category: Added, Changed or Fixed.
4. Describe each change in one short sentence.
5. Add the new entry to the top of `CHANGELOG.md`.

## Entry format

```markdown
## [x.y.z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

Drop any category with nothing in it.

## Guardrails

- Ignore merge commits.
- Do not invent changes; every line must come from a commit.
- Never push, tag or publish; leave that to the user.
