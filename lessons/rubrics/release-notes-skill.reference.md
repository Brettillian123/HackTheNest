---
name: release-notes
description: Turns the Unreleased section of CHANGELOG.md into user-facing release notes saved under docs/releases/. Use when a version is ready to ship and needs its release notes.
---

# Release notes

Writes the user-facing release notes for one version from the changelog.

## Steps

1. Open `CHANGELOG.md` and copy the `## [Unreleased]` section.
2. Rewrite each entry for users: say what changed for them, in plain words.
3. Remove every internal ticket number.
4. Save the result as `docs/releases/<version>.md`, where the version is the one being released, such as `2.4.0`.
5. Run the docs check and fix anything it reports.

```bash
npm run docs:check
```

## Rules

- Never include internal ticket numbers.
- Keep only changes a user can notice.
- Do not invent changes that are not in the changelog.
